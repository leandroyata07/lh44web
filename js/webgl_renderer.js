/**
 * LH44 WebGL Renderer
 * Acelerador de renderização via GPU para circuitos, asfalto, zebras, túneis e sprites.
 * Desenvolvido para atingir 60-120 FPS cravados sem gargalo de CPU/Canvas 2D.
 */

(function () {
  'use strict';

  class LH44WebGLRenderer {
    constructor(canvas, width = 384, height = 216) {
      this.canvas = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
      this.width = width;
      this.height = height;
      this.available = false;

      if (!this.canvas) {
        console.warn('[WebGL] Canvas do WebGL não encontrado.');
        return;
      }

      const glOpts = {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      };

      this.gl = this.canvas.getContext('webgl2', glOpts) || this.canvas.getContext('webgl', glOpts);
      if (!this.gl) {
        console.warn('[WebGL] WebGL não suportado neste dispositivo. O jogo usará fallback 2D.');
        return;
      }

      const gl = this.gl;
      this.isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
      this.available = true;
      this.colorCache = new Map();

      // Configuração básica do Viewport e Blending
      gl.viewport(0, 0, this.width, this.height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);

      this.initColorShader();
      this.initSpriteShader();
      this.spriteTextures = new Map();

      console.log('[WebGL] LH44 WebGL Renderer inicializado com sucesso! (Resolução:', this.width, 'x', this.height, ')');
    }

    // --- PARSER DE CORES OTIMIZADO COM CACHE ---
    parseColor(colStr, defaultAlpha = 1.0) {
      if (!colStr) return [1, 1, 1, 1];
      let cached = this.colorCache.get(colStr);
      if (cached) return cached;

      let r = 1, g = 1, b = 1, a = defaultAlpha;
      if (colStr.charCodeAt(0) === 35) { // '#'
        if (colStr.length === 7) {
          r = parseInt(colStr.substring(1, 3), 16) / 255;
          g = parseInt(colStr.substring(3, 5), 16) / 255;
          b = parseInt(colStr.substring(5, 7), 16) / 255;
        } else if (colStr.length === 4) {
          r = parseInt(colStr[1] + colStr[1], 16) / 255;
          g = parseInt(colStr[2] + colStr[2], 16) / 255;
          b = parseInt(colStr[3] + colStr[3], 16) / 255;
        }
      } else if (colStr.startsWith('rgba')) {
        const parts = colStr.substring(5, colStr.length - 1).split(',');
        r = parseFloat(parts[0]) / 255;
        g = parseFloat(parts[1]) / 255;
        b = parseFloat(parts[2]) / 255;
        a = parseFloat(parts[3]);
      } else if (colStr.startsWith('rgb')) {
        const parts = colStr.substring(4, colStr.length - 1).split(',');
        r = parseFloat(parts[0]) / 255;
        g = parseFloat(parts[1]) / 255;
        b = parseFloat(parts[2]) / 255;
      }

      cached = [r, g, b, a];
      if (this.colorCache.size < 600) {
        this.colorCache.set(colStr, cached);
      }
      return cached;
    }

    // --- SHADER 1: BATCHER DE POLÍGONOS (PISTA, ZEBRAS, TÚNEIS, ASFALTO) ---
    initColorShader() {
      const gl = this.gl;
      const vsSource = `
        attribute vec2 a_pos;
        attribute vec4 a_col;
        uniform vec2 u_res;
        varying vec4 v_col;
        void main() {
          vec2 norm = a_pos / u_res;
          vec2 clip = norm * 2.0 - 1.0;
          gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
          v_col = a_col;
        }
      `;

      const fsSource = `
        precision mediump float;
        varying vec4 v_col;
        void main() {
          gl_FragColor = v_col;
        }
      `;

      this.colorProg = this.createProgram(vsSource, fsSource);
      this.colorAttribPos = gl.getAttribLocation(this.colorProg, 'a_pos');
      this.colorAttribCol = gl.getAttribLocation(this.colorProg, 'a_col');
      this.colorUniformRes = gl.getUniformLocation(this.colorProg, 'u_res');

      // Buffer pré-alocado para 36.000 vértices por quadro (6 floats por vértice: x, y, r, g, b, a)
      this.maxColorVertices = 36000;
      this.colorData = new Float32Array(this.maxColorVertices * 6);
      this.colorVertCount = 0;

      this.colorBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.colorData.byteLength, gl.DYNAMIC_DRAW);
    }

    // --- SHADER 2: BATCHER DE SPRITES TEXTURIZADOS (ÁRVORES, POSTES, CARROS) ---
    initSpriteShader() {
      const gl = this.gl;
      const vsSource = `
        attribute vec2 a_pos;
        attribute vec2 a_uv;
        attribute vec4 a_tint;
        uniform vec2 u_res;
        varying vec2 v_uv;
        varying vec4 v_tint;
        void main() {
          vec2 norm = a_pos / u_res;
          vec2 clip = norm * 2.0 - 1.0;
          gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
          v_uv = a_uv;
          v_tint = a_tint;
        }
      `;

      const fsSource = `
        precision mediump float;
        uniform sampler2D u_tex;
        varying vec2 v_uv;
        varying vec4 v_tint;
        void main() {
          vec4 texCol = texture2D(u_tex, v_uv);
          gl_FragColor = texCol * v_tint;
        }
      `;

      this.spriteProg = this.createProgram(vsSource, fsSource);
      this.spriteAttribPos = gl.getAttribLocation(this.spriteProg, 'a_pos');
      this.spriteAttribUV = gl.getAttribLocation(this.spriteProg, 'a_uv');
      this.spriteAttribTint = gl.getAttribLocation(this.spriteProg, 'a_tint');
      this.spriteUniformRes = gl.getUniformLocation(this.spriteProg, 'u_res');
      this.spriteUniformTex = gl.getUniformLocation(this.spriteProg, 'u_tex');

      this.maxSpriteQuads = 2000;
      this.spriteData = new Float32Array(this.maxSpriteQuads * 6 * 8); // x, y, u, v, r, g, b, a
      this.spriteVertCount = 0;
      this.activeTexture = null;

      this.spriteBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.spriteData.byteLength, gl.DYNAMIC_DRAW);
    }

    createProgram(vsSource, fsSource) {
      const gl = this.gl;
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, vsSource);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.error('[WebGL VS]', gl.getShaderInfoLog(vs));
      }

      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, fsSource);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error('[WebGL FS]', gl.getShaderInfoLog(fs));
      }

      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('[WebGL Link]', gl.getProgramInfoLog(prog));
      }
      return prog;
    }

    // --- INÍCIO DE NOVO QUADRO DE RENDERIZAÇÃO ---
    beginFrame(clearColor = [0, 0, 0, 1]) {
      if (!this.available) return;
      const gl = this.gl;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.colorVertCount = 0;
      this.spriteVertCount = 0;
    }

    // --- ADICIONA TRAPÉZIO/QUADRILÁTERO AO BUFFER DO CIRCUITO ---
    addQuad(x1, y1, x2, y2, x3, y3, x4, y4, color) {
      if (!this.available) return;
      if (this.colorVertCount + 6 >= this.maxColorVertices) {
        this.flushColor();
      }

      const c = Array.isArray(color) ? color : this.parseColor(color);
      const r = c[0], g = c[1], b = c[2], a = c[3];
      const d = this.colorData;
      let i = this.colorVertCount * 6;

      // Triângulo 1 (1 -> 2 -> 3)
      d[i++] = x1; d[i++] = y1; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
      d[i++] = x2; d[i++] = y2; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
      d[i++] = x3; d[i++] = y3; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;

      // Triângulo 2 (1 -> 3 -> 4)
      d[i++] = x1; d[i++] = y1; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
      d[i++] = x3; d[i++] = y3; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
      d[i++] = x4; d[i++] = y4; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;

      this.colorVertCount += 6;
    }

    // --- ADICIONA RETÂNGULO 2D AO BUFFER ---
    addRect(x, y, w, h, color) {
      this.addQuad(x, y, x + w, y, x + w, y + h, x, y + h, color);
    }

    // --- DESPACHA TODOS OS POLÍGONOS EM 1 DRAW CALL DIRETO PRA GPU ---
    flushColor() {
      if (!this.available || this.colorVertCount === 0) return;
      const gl = this.gl;

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(this.colorProg);
      gl.uniform2f(this.colorUniformRes, this.width, this.height);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      if (this.isWebGL2) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colorData, 0, this.colorVertCount * 6);
      } else {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colorData.subarray(0, this.colorVertCount * 6));
      }

      const stride = 6 * 4; // 6 floats de 4 bytes
      gl.enableVertexAttribArray(this.colorAttribPos);
      gl.vertexAttribPointer(this.colorAttribPos, 2, gl.FLOAT, false, stride, 0);

      gl.enableVertexAttribArray(this.colorAttribCol);
      gl.vertexAttribPointer(this.colorAttribCol, 4, gl.FLOAT, false, stride, 2 * 4);

      gl.drawArrays(gl.TRIANGLES, 0, this.colorVertCount);
      this.colorVertCount = 0;
    }

    // --- GERA OU OBTÉM UMA TEXTURA WEBGL A PARTIR DE UM CANVAS OFFSCREEN ---
    getOrCreateTexture(key, renderFn, width, height) {
      if (!this.available) return null;
      let tex = this.spriteTextures.get(key);
      if (tex) return tex;

      const offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;
      const offCtx = offCanvas.getContext('2d');
      renderFn(offCtx, width, height);

      const gl = this.gl;
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      this.spriteTextures.set(key, tex);
      return tex;
    }

    // --- DESENHA SPRITE TEXTURIZADO ---
    drawSprite(texture, x, y, w, h, tint = [1, 1, 1, 1]) {
      if (!this.available || !texture) return;
      if (this.activeTexture !== texture || this.spriteVertCount + 6 >= this.maxSpriteQuads * 6) {
        this.flushSprites();
        this.activeTexture = texture;
      }

      const x2 = x + w;
      const y2 = y + h;
      const r = tint[0], g = tint[1], b = tint[2], a = tint[3];
      const d = this.spriteData;
      let i = this.spriteVertCount * 8;

      // Triângulo 1 (Top-Left -> Top-Right -> Bottom-Right)
      d[i++] = x;  d[i++] = y;  d[i++] = 0; d[i++] = 0; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
      d[i++] = x2; d[i++] = y;  d[i++] = 1; d[i++] = 0; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
      d[i++] = x2; d[i++] = y2; d[i++] = 1; d[i++] = 1; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;

      // Triângulo 2 (Top-Left -> Bottom-Right -> Bottom-Left)
      d[i++] = x;  d[i++] = y;  d[i++] = 0; d[i++] = 0; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
      d[i++] = x2; d[i++] = y2; d[i++] = 1; d[i++] = 1; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
      d[i++] = x;  d[i++] = y2; d[i++] = 0; d[i++] = 1; d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;

      this.spriteVertCount += 6;
    }

    flushSprites() {
      if (!this.available || this.spriteVertCount === 0 || !this.activeTexture) return;
      const gl = this.gl;

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(this.spriteProg);
      gl.uniform2f(this.spriteUniformRes, this.width, this.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.activeTexture);
      gl.uniform1i(this.spriteUniformTex, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteData.subarray(0, this.spriteVertCount * 8));

      const stride = 8 * 4;
      gl.enableVertexAttribArray(this.spriteAttribPos);
      gl.vertexAttribPointer(this.spriteAttribPos, 2, gl.FLOAT, false, stride, 0);

      gl.enableVertexAttribArray(this.spriteAttribUV);
      gl.vertexAttribPointer(this.spriteAttribUV, 2, gl.FLOAT, false, stride, 2 * 4);

      gl.enableVertexAttribArray(this.spriteAttribTint);
      gl.vertexAttribPointer(this.spriteAttribTint, 4, gl.FLOAT, false, stride, 4 * 4);

      gl.drawArrays(gl.TRIANGLES, 0, this.spriteVertCount);
      this.spriteVertCount = 0;
    }

    endFrame() {
      if (!this.available) return;
      this.flushColor();
      this.flushSprites();
    }
  }

  window.LH44WebGLRenderer = LH44WebGLRenderer;
})();
