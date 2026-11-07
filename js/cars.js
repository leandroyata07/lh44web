  const CarArt = {
    SPRITE_W: 108,
    SPRITE_H: 68,
    SPRITE_SCALE: 3,
    ORIGIN_X: 54,
    ORIGIN_Y: 40,
    OUTLINE: '#0E131B',
    _cache: new Map(),
    _spriteCache: new Map(),


    // Silhueta traseira curva (bézier) simétrica: teto arqueado -> ombros -> cintura larga -> para-choque.
    // Apenas desenha o caminho (path); quem chama preenche (fill) e contorna (stroke).
    curvedBody(c, tx, rx, sx, o) {
      const rw = o.roofW * sx, sw = o.shW * sx, mw = o.midW * sx, bw = o.botW * sx;
      const ry = o.roofY, sy = o.shY, my = o.midY, by = o.botY;
      const rr = o.round || 5;
      const arch = o.arch || 0;
      c.beginPath();
      c.moveTo(tx - rw + rr, ry);
      c.quadraticCurveTo(tx, ry - arch, tx + rw - rr, ry);
      c.quadraticCurveTo(tx + rw, ry, tx + rw + (sw - rw) * 0.12, ry + rr * 1.5);
      c.bezierCurveTo(tx + rw + (sw - rw) * 0.45, ry + (sy - ry) * 0.45, rx + sw, sy - (sy - ry) * 0.30, rx + sw, sy);
      c.bezierCurveTo(rx + sw + (mw - sw) * 0.9, sy + (my - sy) * 0.30, rx + mw, my - (my - sy) * 0.4, rx + mw, my);
      c.bezierCurveTo(rx + mw, my + (by - my) * 0.4, rx + bw + 0.6, by - (by - my) * 0.25, rx + bw, by);
      c.lineTo(rx - bw, by);
      c.bezierCurveTo(rx - bw - 0.6, by - (by - my) * 0.25, rx - mw, my + (by - my) * 0.4, rx - mw, my);
      c.bezierCurveTo(rx - mw, my - (my - sy) * 0.4, rx - sw - (mw - sw) * 0.9, sy + (my - sy) * 0.30, rx - sw, sy);
      c.bezierCurveTo(rx - sw, sy - (sy - ry) * 0.30, tx - rw - (sw - rw) * 0.45, ry + (sy - ry) * 0.45, tx - rw - (sw - rw) * 0.12, ry + rr * 1.5);
      c.quadraticCurveTo(tx - rw, ry, tx - rw + rr, ry);
      c.closePath();
    },

    // Vidro traseiro com cantos arredondados e laterais levemente abauladas
    glassCurve(c, tx, rx, sx, y1, y2, w1, w2, bulge, arch) {
      const x1a = tx - w1 * sx, x1b = tx + w1 * sx, x2a = rx - w2 * sx, x2b = rx + w2 * sx;
      const my = (y1 + y2) / 2;
      const mxr = (x1b + x2b) / 2 + bulge;
      const mxl = (x1a + x2a) / 2 - bulge;
      c.beginPath();
      c.moveTo(x1a + 2.2, y1);
      c.quadraticCurveTo(tx, y1 - arch, x1b - 2.2, y1);
      c.quadraticCurveTo(x1b, y1, x1b + 0.5, y1 + 1.8);
      c.quadraticCurveTo(mxr, my, x2b - 0.3, y2 - 2.2);
      c.quadraticCurveTo(x2b, y2, x2b - 2.4, y2);
      c.lineTo(x2a + 2.4, y2);
      c.quadraticCurveTo(x2a, y2, x2a + 0.3, y2 - 2.2);
      c.quadraticCurveTo(mxl, my, x1a - 0.5, y1 + 1.8);
      c.quadraticCurveTo(x1a, y1, x1a + 2.2, y1);
      c.closePath();
      const gg = c.createLinearGradient(0, y1, 0, y2);
      gg.addColorStop(0, '#0F1824');
      gg.addColorStop(0.55, '#1D2D40');
      gg.addColorStop(1, '#263B52');
      c.fillStyle = gg;
      c.fill();
      c.strokeStyle = this.OUTLINE;
      c.lineWidth = 1.35;
      c.lineJoin = 'round';
      c.stroke();
      this.poly(c, [
        [x1a + (x1b - x1a) * 0.14, y1 + 1.0], [x1a + (x1b - x1a) * 0.36, y1 + 1.0],
        [x2a + (x2b - x2a) * 0.26, y2 - 1.0], [x2a + (x2b - x2a) * 0.07, y2 - 1.0]
      ], 'rgba(165, 210, 248, 0.24)', null, 0);
    },

    shade(hex, amt) {
      const key = `${hex}_${amt}`;
      const cached = this._cache.get(key);
      if (cached) return cached;
      let col = (hex || '#CCCCCC').replace('#', '');
      if (col.length === 3) col = col[0] + col[0] + col[1] + col[1] + col[2] + col[2];
      const num = parseInt(col, 16);
      const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amt));
      const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amt));
      const b = Math.max(0, Math.min(255, (num & 255) + amt));
      const res = `rgb(${r},${g},${b})`;
      this._cache.set(key, res);
      return res;
    },

    bodyGrad(c, body, yTop, yBot) {
      const g = c.createLinearGradient(0, yTop, 0, yBot);
      g.addColorStop(0, this.shade(body, 28));
      g.addColorStop(0.28, body);
      g.addColorStop(0.72, this.shade(body, -14));
      g.addColorStop(1, this.shade(body, -34));
      return g;
    },

    poly(c, pts, fill, stroke = '#0E131B', lw = 1.25) {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        c.lineTo(pts[i][0], pts[i][1]);
      }
      c.closePath();
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
      if (stroke && lw > 0) {
        c.strokeStyle = stroke;
        c.lineWidth = lw;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.stroke();
      }
    },

    roundRect(c, x, y, w, h, r, fill, stroke = '#0E131B', lw = 1.1) {
      const rad = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
      c.beginPath();
      c.moveTo(x + rad, y);
      c.arcTo(x + w, y, x + w, y + h, rad);
      c.arcTo(x + w, y + h, x, y + h, rad);
      c.arcTo(x, y + h, x, y, rad);
      c.arcTo(x, y, x + w, y, rad);
      c.closePath();
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
      if (stroke && lw > 0) {
        c.strokeStyle = stroke;
        c.lineWidth = lw;
        c.stroke();
      }
    },

    line(c, x1, y1, x2, y2, stroke = '#0E131B', lw = 1.1) {
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.strokeStyle = stroke;
      c.lineWidth = lw;
      c.lineCap = 'round';
      c.stroke();
    },

    box(c, x, y, w, h, fill, stroke = '#0E131B', lw = 1.2) {
      if (fill) {
        c.fillStyle = fill;
        c.fillRect(x, y, w, h);
      }
      if (stroke && lw > 0) {
        c.strokeStyle = stroke;
        c.lineWidth = lw;
        c.strokeRect(x, y, w, h);
      }
    },

    // Desenha retrovisor com base/haste conectada à lataria e lente com reflexo especular
    drawMirror(c, x, y, w, h, r, fill, stemX, stemY, isLeft) {
      const out = this.OUTLINE;
      this.line(c, stemX, stemY, isLeft ? x + w - 0.5 : x + 0.5, y + h * 0.5, '#12161F', 1.6);
      this.roundRect(c, x, y, w, h, r, fill, out, 1.15);
      c.fillStyle = 'rgba(255, 255, 255, 0.28)';
      c.fillRect(x + 0.8, y + 0.8, w - 1.6, 1.0);
    },

    // Par de retrovisores simétricos visíveis em linha reta e na perspectiva de curva para todos os carros
    drawDualMirrors(c, tx, sx, turn, opts = {}) {
      const dist = opts.dist || 29.0;
      const w = opts.w || 5.2;
      const h = opts.h || 3.6;
      const y = opts.y || -9.5;
      const r = opts.r !== undefined ? opts.r : 1.2;
      const color = opts.color || '#1A202C';
      const stemDist = opts.stemDist || (dist - 4.5);
      const stemY = opts.stemY || (y + 2.5);

      if (turn >= -0.15) {
        this.drawMirror(c, tx - (dist + w) * sx, y, w * sx, h, r, color, tx - stemDist * sx, stemY, true);
      }
      if (turn <= 0.15) {
        this.drawMirror(c, tx + dist * sx, y, w * sx, h, r, color, tx + stemDist * sx, stemY, false);
      }
    },

    // Renderiza letreiros e emblemas 3D com sombra projetada e micro-chanfro escuro
    // Garante 100% de contraste e legibilidade impecável mesmo em latarias brancas e claras
    drawEmblemText(c, text, x, y, opts = {}) {
      const font = opts.font || 'bold 3.2px sans-serif';
      const align = opts.align || 'center';
      const fill = opts.fill || '#F8FAFC';
      const stroke = opts.stroke !== undefined ? opts.stroke : '#0D1117';
      const strokeW = opts.strokeW !== undefined ? opts.strokeW : 0.6;
      const shadowColor = opts.shadowColor !== undefined ? opts.shadowColor : 'rgba(11, 15, 23, 0.75)';
      const shadowOffset = opts.shadowOffset !== undefined ? opts.shadowOffset : 0.55;

      c.save();
      c.font = font;
      c.textAlign = align;
      if (opts.baseline) c.textBaseline = opts.baseline;

      // 1. Sombra projetada na lataria para destacar contra latarias brancas
      if (shadowColor && shadowOffset > 0) {
        c.fillStyle = shadowColor;
        c.fillText(text, x + shadowOffset * 0.7, y + shadowOffset);
      }

      // 2. Micro-chanfro / contorno escuro das bordas metálicas
      if (stroke && strokeW > 0) {
        c.strokeStyle = stroke;
        c.lineWidth = strokeW;
        c.lineJoin = 'round';
        c.strokeText(text, x, y);
      }

      // 3. Preenchimento cromado brilhante
      c.fillStyle = fill;
      c.fillText(text, x, y);
      c.restore();
    },

    drawRearTire(c, x, y, w, h) {
      const tg = c.createLinearGradient(x, y, x + w, y);
      tg.addColorStop(0, '#0B0E14');
      tg.addColorStop(0.5, '#252C3A');
      tg.addColorStop(1, '#0B0E14');
      this.roundRect(c, x, y, w, h, 2.2, tg, this.OUTLINE, 1.2);
      c.strokeStyle = 'rgba(10, 12, 18, 0.75)';
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(x + w * 0.33, y + 1.5);
      c.lineTo(x + w * 0.33, y + h - 1.5);
      c.moveTo(x + w * 0.67, y + 1.5);
      c.lineTo(x + w * 0.67, y + h - 1.5);
      c.stroke();
    },

    drawSideWheel(c, wx, wy, rx, ry, style = 'alloy', side = -1) {
      c.save();
      c.translate(wx, wy);
      c.fillStyle = '#0B0E14';
      c.beginPath();
      c.ellipse(-side * 1.6, 0, rx, ry, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = this.OUTLINE;
      c.lineWidth = 1.1;
      c.stroke();

      c.fillStyle = '#1D2430';
      c.beginPath();
      c.ellipse(0, 0, rx * 0.92, ry * 0.96, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      if (style === 'hubcap') {
        c.fillStyle = '#9AA9B8';
        c.beginPath();
        c.ellipse(side * 0.2, 0, rx * 0.62, ry * 0.64, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#EDF3F8';
        c.beginPath();
        c.ellipse(side * 0.3, -0.3, rx * 0.38, ry * 0.40, 0, 0, Math.PI * 2);
        c.fill();
      } else if (style === 'steel') {
        c.fillStyle = '#B5C0CC';
        c.beginPath();
        c.ellipse(side * 0.2, 0, rx * 0.62, ry * 0.64, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#242C38';
        c.beginPath();
        c.ellipse(side * 0.2, 0, rx * 0.22, ry * 0.22, 0, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillStyle = '#D5DEE8';
        c.beginPath();
        c.ellipse(side * 0.2, 0, rx * 0.65, ry * 0.67, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#28313E';
        for (let s = 0; s < 5; s++) {
          const ang = (s * Math.PI * 2) / 5;
          c.beginPath();
          c.ellipse(Math.cos(ang) * rx * 0.34, Math.sin(ang) * ry * 0.34, rx * 0.16, ry * 0.16, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.restore();
    },

    // Desenha a lateral sólida em perspectiva 2.5D no estilo clássico Top Gear 1:
    // A capota e o teto permanecem 100% lisos e conectados, sem nenhum recorte solto ou porta aberta!
    drawDiscreetSideFlank(c, body, turn, opts) {
      const at = Math.abs(turn);
      if (at < 0.05) return;
      const side = turn < 0 ? -1 : 1; // -1 = curva à esquerda, 1 = curva à direita
      const rx = opts.rx;
      const tx = opts.tx;
      const rearW = opts.rearW;
      const roofW = opts.roofW;
      const roofY = opts.roofY;
      const beltY = opts.beltY;
      const botY = opts.botY;
      const wheelStyle = opts.wheelStyle || 'alloy';
      const isCurvedRoof = !!opts.curvedRoof;

      // Proporção de profundidade sutil e harmônica Top Gear 1
      const flankW = at * 3.2;

      const rearShoulderX = rx + side * rearW;
      const rearBotX = rx + side * (opts.botW !== undefined ? opts.botW : rearW);

      // A linha de cintura se estende suavemente para a dianteira em direção ao ponto de fuga
      const frontNoseX = rearShoulderX + side * flankW;
      const frontNoseY = beltY - at * 0.5;
      const frontBotX = frontNoseX - side * 0.4;
      const frontBotY = botY - at * 0.8;

      if (isCurvedRoof) {
        // Para carros de silhueta curva (Peugeot 206 e HB20):
        // Estilo Top Gear 1 puro — o teto/capota em bézier permanece 100% íntegro, limpo e conectado!
        // A lateral estende a lataria da porta e para-lama abaixo da cintura (beltline) até a dianteira.
        const sideGrad = c.createLinearGradient(0, beltY, 0, botY);
        sideGrad.addColorStop(0, this.shade(body, -16));
        sideGrad.addColorStop(0.5, this.shade(body, -26));
        sideGrad.addColorStop(1, this.shade(body, -36));

        c.beginPath();
        c.moveTo(rearShoulderX, beltY);
        c.lineTo(frontNoseX, frontNoseY);
        c.lineTo(frontBotX, frontBotY);
        c.lineTo(rearBotX, botY);
        c.closePath();
        c.fillStyle = sideGrad;
        c.fill();

        // Contorno externo contínuo da carroceria
        c.beginPath();
        c.moveTo(rearShoulderX, beltY);
        c.lineTo(frontNoseX, frontNoseY);
        c.lineTo(frontBotX, frontBotY);
        c.lineTo(rearBotX, botY);
        c.strokeStyle = this.OUTLINE;
        c.lineWidth = 1.35;
        c.lineJoin = 'round';
        c.stroke();

        // Friso da soleira
        this.line(c, frontBotX, frontBotY, rearBotX, botY, '#0E121A', 1.2);

        // Retrovisor integrado na cintura (lado da curva)
        const mirrorW = 5.2, mirrorH = 3.6;
        const mirrorX = frontNoseX - (side > 0 ? 0.6 : mirrorW - 0.6);
        const mirrorY = beltY - 2.8;
        const mirrorColor = opts.mirrorColor || body;
        this.drawMirror(c, mirrorX, mirrorY, mirrorW, mirrorH, 1.8, mirrorColor, frontNoseX - side * 2.0, beltY - 0.5, side < 0);
      } else {
        // Carros com teto plano / caixa clássica (Uno Mille e Fusca 1300):
        const roofCornerX = tx + side * roofW;
        const sideGrad = c.createLinearGradient(0, roofY, 0, botY);
        sideGrad.addColorStop(0, this.shade(body, -16));
        sideGrad.addColorStop(0.5, this.shade(body, -26));
        sideGrad.addColorStop(1, this.shade(body, -36));

        c.beginPath();
        c.moveTo(roofCornerX, roofY);
        c.lineTo(frontNoseX, frontNoseY);
        c.lineTo(frontBotX, frontBotY);
        c.lineTo(rearBotX, botY);
        c.lineTo(rearShoulderX, beltY);
        c.closePath();
        c.fillStyle = sideGrad;
        c.fill();

        if (beltY > roofY + 3) {
          c.beginPath();
          c.moveTo(roofCornerX - side * 0.6, roofY + 1.2);
          c.lineTo(frontNoseX - side * 0.8, beltY - 0.4);
          c.lineTo(rearShoulderX - side * 0.6, beltY - 0.4);
          c.closePath();
          c.fillStyle = '#0F1622';
          c.fill();
        }

        this.line(c, frontBotX, frontBotY, rearBotX, botY, '#0E121A', 1.2);

        c.beginPath();
        c.moveTo(roofCornerX, roofY);
        c.lineTo(frontNoseX, frontNoseY);
        c.lineTo(frontBotX, frontBotY);
        c.lineTo(rearBotX, botY);
        c.strokeStyle = this.OUTLINE;
        c.lineWidth = 1.35;
        c.lineJoin = 'round';
        c.stroke();

        if (wheelStyle === 'hubcap') {
          // Fusca: espelho redondo clássico cromado com haste
          const mx = frontNoseX - (side > 0 ? 0.5 : 4.5);
          const my = beltY - 5.5;
          this.drawMirror(c, mx, my, 4.4, 3.4, 1.8, '#DCE5EE', frontNoseX - side * 2.5, beltY - 1.5, side < 0);
        } else {
          // Uno Mille
          const mirrorW = 5.2, mirrorH = 3.8;
          const mirrorX = frontNoseX - (side > 0 ? 0.6 : mirrorW - 0.6);
          const mirrorY = beltY - 2.8;
          const mirrorColor = opts.mirrorColor || '#1D222B';
          this.drawMirror(c, mirrorX, mirrorY, mirrorW, mirrorH, 1.0, mirrorColor, frontNoseX - side * 2.0, beltY - 0.5, side < 0);
        }
      }
    },

    drawPlateStraight(c, x, y, w, h) {
      this.roundRect(c, x, y, w, h, 1.0, '#F0F4F8', this.OUTLINE, 1.0);
      c.fillStyle = '#1552B8';
      c.fillRect(x + 0.6, y + 0.5, w - 1.2, Math.max(1.5, h * 0.30));
      c.fillStyle = '#1F2A38';
      c.fillRect(x + 2.4, y + h * 0.54, w - 4.8, 1.2);
    },

    drawGlassQuad(c, pts) {
      const minY = Math.min(pts[0][1], pts[1][1]);
      const maxY = Math.max(pts[2][1], pts[3][1]);
      const gg = c.createLinearGradient(0, minY, 0, maxY);
      gg.addColorStop(0, '#0F1824');
      gg.addColorStop(0.55, '#1D2D40');
      gg.addColorStop(1, '#263B52');
      this.poly(c, pts, gg, this.OUTLINE, 1.35);

      // Reflexo diagonal suave no vidro HD
      const lx0 = pts[0][0] + (pts[1][0] - pts[0][0]) * 0.14;
      const ly0 = pts[0][1] + (pts[1][1] - pts[0][1]) * 0.14 + 0.8;
      const lx1 = pts[0][0] + (pts[1][0] - pts[0][0]) * 0.38;
      const ly1 = pts[0][1] + (pts[1][1] - pts[0][1]) * 0.38 + 0.8;
      const bx1 = pts[3][0] + (pts[2][0] - pts[3][0]) * 0.24;
      const by1 = pts[3][1] + (pts[2][1] - pts[3][1]) * 0.24 - 0.8;
      const bx0 = pts[3][0] + (pts[2][0] - pts[3][0]) * 0.07;
      const by0 = pts[3][1] + (pts[2][1] - pts[3][1]) * 0.07 - 0.8;
      this.poly(c, [[lx0, ly0], [lx1, ly1], [bx1, by1], [bx0, by0]], 'rgba(165, 210, 248, 0.26)', null, 0);
    },

    drawTailGlow(c, x, y, rx, ry, isBraking, isNight) {
      if (!isBraking && !isNight) return;
      if (isBraking) {
        // Freio acionado: luz de freio original restaurada
        const r = Math.max(rx, ry) * 2.8;
        const grad = c.createRadialGradient(x, y, 0.5, x, y, r);
        grad.addColorStop(0, 'rgba(255, 250, 240, 0.95)');
        grad.addColorStop(0.25, 'rgba(255, 25, 0, 0.88)');
        grad.addColorStop(0.65, 'rgba(235, 15, 0, 0.42)');
        grad.addColorStop(1, 'rgba(220, 10, 0, 0)');
        c.fillStyle = grad;
        c.beginPath();
        c.ellipse(x, y, rx * 2.6, ry * 2.6, 0, 0, Math.PI * 2);
        c.fill();
      } else {
        // Lanterna de posição em horário escuro (noite / crepúsculo / final da tarde / túneis):
        // Vermelho automotivo aceso, nítido e luminoso (mantido ativo)
        const r = Math.max(rx, ry) * 1.9;
        const grad = c.createRadialGradient(x, y, 0.2, x, y, r);
        grad.addColorStop(0, 'rgba(255, 120, 120, 0.92)');
        grad.addColorStop(0.35, 'rgba(255, 30, 30, 0.75)');
        grad.addColorStop(0.70, 'rgba(220, 15, 15, 0.28)');
        grad.addColorStop(1, 'rgba(160, 0, 0, 0)');
        c.fillStyle = grad;
        c.beginPath();
        c.ellipse(x, y, rx * 1.85, ry * 1.85, 0, 0, Math.PI * 2);
        c.fill();
      }
    },

    drawExhaustPipe(c, x, y, r = 2.0) {
      this.roundRect(c, x - r, y - r * 0.85, r * 2, r * 1.7, r * 0.8, '#DCE4EC', this.OUTLINE, 0.95);
      c.fillStyle = '#181E26';
      c.beginPath();
      c.arc(x, y, r * 0.52, 0, Math.PI * 2);
      c.fill();
    },

    getSprite(model, bodyColor, angleIdx, isBraking, isNight) {
      const key = `${model.id}|${bodyColor}|${angleIdx}|${isBraking ? 1 : 0}|${isNight ? 1 : 0}`;
      let canvas = this._spriteCache.get(key);
      if (canvas) return canvas;

      const S = this.SPRITE_SCALE;
      canvas = document.createElement('canvas');
      canvas.width = this.SPRITE_W * S;
      canvas.height = this.SPRITE_H * S;
      const c = canvas.getContext('2d');

      c.save();
      c.scale(S, S);
      c.translate(this.ORIGIN_X, this.ORIGIN_Y);
      const turn = angleIdx * 0.5; // -1.0, -0.5, 0, +0.5, +1.0 (discreto e progressivo!)
      model.drawHD(c, bodyColor, turn, isBraking, isNight);
      c.restore();

      // Zero getImageData/putImageData: preserva anti-aliasing HD e evita travamentos na GPU!
      this._spriteCache.set(key, canvas);
      return canvas;
    },

    // Pré-aquece os sprites dos carros principais no carregamento para zero engasgos na pista
    warmUp(models) {
      const angles = [-2, -1, 0, 1, 2];
      for (let m = 0; m < models.length; m++) {
        const mod = models[m];
        for (let a = 0; a < angles.length; a++) {
          this.getSprite(mod, mod.primaryColor, angles[a], false, false);
          this.getSprite(mod, mod.primaryColor, angles[a], true, false);
          this.getSprite(mod, mod.primaryColor, angles[a], false, true);
          this.getSprite(mod, mod.primaryColor, angles[a], true, true);
        }
      }
    },

    drawGroundShadow(ctx, w, h, turn, isBraking, isNight) {
      ctx.save();
      const shiftX = -turn * w * 0.025;
      ctx.translate(shiftX, h * 0.34);
      ctx.rotate(-turn * 0.045);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.39, h * 0.115, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.015, w * 0.32, h * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      if (isBraking || isNight) {
        ctx.fillStyle = isBraking ? 'rgba(255, 34, 12, 0.28)' : 'rgba(255, 22, 8, 0.13)';
        ctx.beginPath();
        ctx.ellipse(0, h * 0.02, w * 0.33, h * 0.085, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    drawNitroFlame(ctx, ex, ey, r, isNitro) {
      if (!isNitro) return;
      const flick = 0.85 + Math.random() * 0.30;
      // Labareda ciano discreta e estilosa saindo do bocal do escapamento
      ctx.fillStyle = 'rgba(0, 180, 255, 0.45)';
      ctx.beginPath();
      ctx.ellipse(ex, ey + r * 1.25 * flick, r * 0.72, r * 1.35 * flick, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.ellipse(ex, ey + r * 0.80 * flick, r * 0.46, r * 0.88 * flick, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(ex, ey + r * 0.35, r * 0.24, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    },

    // Coordenadas EXATAS da borracha visível dos pneus traseiros (abaixo do para-choque)
    // Garantia total: NUNCA invade o para-choque nem altera o tamanho dos pneus
    TIRE_SPECS: {
      uno:      { lx: 30.5, rx: 21.0, y: 20.8, w: 9.5,  h: 3.4 },
      fusca:    { lx: 29.5, rx: 20.7, y: 20.2, w: 8.8,  h: 3.8 },
      peugeot:  { lx: 31.6, rx: 21.4, y: 20.2, w: 10.2, h: 3.8 },
      hb20:     { lx: 31.8, rx: 21.4, y: 20.4, w: 10.4, h: 3.6 },
      opala:    { lx: 34.0, rx: 22.5, y: 19.8, w: 11.5, h: 4.4 },
      gol:      { lx: 31.8, rx: 22.0, y: 20.2, w: 9.8,  h: 3.6 },
      chevette: { lx: 31.0, rx: 21.8, y: 20.0, w: 9.2,  h: 4.0 },
      brasilia: { lx: 31.5, rx: 22.0, y: 20.2, w: 9.4,  h: 3.8 },
      corsa:    { lx: 31.0, rx: 21.5, y: 20.2, w: 9.6,  h: 3.8 },
      celta:    { lx: 31.2, rx: 21.6, y: 20.2, w: 9.6,  h: 3.8 },
      onix:     { lx: 32.5, rx: 22.0, y: 20.2, w: 10.5, h: 3.8 },
      ka:       { lx: 30.0, rx: 20.8, y: 20.0, w: 9.2,  h: 4.0 },
      palio:    { lx: 31.4, rx: 21.6, y: 20.2, w: 9.8,  h: 3.8 },
      kwid:     { lx: 30.5, rx: 21.2, y: 19.8, w: 9.2,  h: 4.2 },
      focus:    { lx: 33.2, rx: 22.4, y: 20.0, w: 10.8, h: 4.0 },
      sandero:  { lx: 33.0, rx: 22.4, y: 20.2, w: 10.8, h: 3.8 },
      mobi:     { lx: 30.8, rx: 21.4, y: 20.2, w: 9.4,  h: 3.8 },
      santana:  { lx: 33.5, rx: 22.5, y: 20.2, w: 10.4, h: 3.8 },
      rural:    { lx: 33.0, rx: 22.2, y: 19.4, w: 11.2, h: 4.8 },
      kombi:    { lx: 31.8, rx: 21.8, y: 20.0, w: 10.0, h: 4.2 }
    },

    // Efeito discreto de movimento/rolamento APENAS na borracha dos pneus traseiros
    drawWheelMotionEffect(ctx, model, w, h, turn, phase, spd) {
      if (spd < 3) return; // Parado: sem efeito

      const spec = this.TIRE_SPECS[model.id] || { lx: 31.0, rx: 21.5, y: 20.8, w: 9.8, h: 3.2 };
      const sx = w / this.SPRITE_W;
      const sy = h / this.SPRITE_H;
      const at = Math.abs(turn);
      const rx = -turn * 4.6;
      const sxTurn = 1 - at * 0.05;
      const safeY = Math.max(spec.y, 20.8);
      const safeH = Math.min(spec.h, 3.0);

      const tires = [
        { x: (rx - spec.lx * sxTurn) * sx + 1.2, y: safeY * sy, w: (spec.w - 2.4) * sx, h: safeH * sy },
        { x: (rx + spec.rx * sxTurn) * sx + 1.2, y: safeY * sy, w: (spec.w - 2.4) * sx, h: safeH * sy }
      ];

      // Frequência de rolamento proporcional à velocidade
      const stepH = Math.max(1.4, safeH * sy * 0.45);
      const rollOffset = ((phase * 8) % stepH + stepH) % stepH;
      const blurIntensity = Math.min(1.0, spd / 180);
      const lineH = Math.max(0.5, safeH * sy * 0.22);

      for (let t = 0; t < tires.length; t++) {
        const tire = tires[t];
        if (tire.w <= 0 || tire.h <= 0) continue;
        ctx.save();
        // Não aumenta o tamanho da roda e NUNCA invade o para-choque: clip exato na borracha inferior
        ctx.beginPath();
        ctx.rect(tire.x, tire.y, tire.w, tire.h);
        ctx.clip();

        // 1. Ranhuras horizontais em rolamento sutil
        ctx.fillStyle = 'rgba(6, 8, 12, 0.55)';
        for (let gy = tire.y - stepH + rollOffset; gy < tire.y + tire.h + stepH; gy += stepH) {
          ctx.fillRect(tire.x, gy, tire.w, lineH);
        }

        // 2. Reflexo dinâmico de rotação da borracha (shimmer sutil sem alocação de gradiente)
        const shineY = tire.y + ((phase * 12) % tire.h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(tire.x, shineY, tire.w, Math.max(0.6, lineH));

        ctx.restore();
      }
    },

    renderModel(ctx, model, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
      const isNitro = opts ? !!opts.isNitro : false;
      const isNight = opts ? !!opts.isNight : false;
      const phase = opts ? (opts.wheelPhase || 0) : 0;
      const spd = opts ? (opts.speed || 0) : 0;
      const vib = spd > 8 ? Math.sin(phase * 3.2) * (h * 0.0035) : 0;

      // 5 estágios sutis de perspectiva (-2, -1, 0, +1, +2) — ângulos discretos e naturais!
      let angleIdx = 0;
      if (steer <= -0.56) angleIdx = -2;
      else if (steer <= -0.18) angleIdx = -1;
      else if (steer >= 0.56) angleIdx = 2;
      else if (steer >= 0.18) angleIdx = 1;

      const turn = angleIdx * 0.5;
      const body = customBody || model.primaryColor;
      const sprite = this.getSprite(model, body, angleIdx, !!isBraking, isNight);

      ctx.save();
      ctx.translate(x, y + vib);

      this.drawGroundShadow(ctx, w, h, turn, isBraking, isNight);

      // Leve rolagem realista da suspensão na curva (~1.8° máx.)
      if (Math.abs(steer) > 0.01) {
        ctx.rotate(steer * 0.032);
      }

      const drawX = -w * (this.ORIGIN_X / this.SPRITE_W);
      const drawY = -h * (this.ORIGIN_Y / this.SPRITE_H);
      ctx.drawImage(sprite, drawX, drawY, w, h);

      // Efeito discreto de rodas em movimento proporcional à velocidade (sem alterar dimensões)
      this.drawWheelMotionEffect(ctx, model, w, h, turn, phase, spd);

      if (isNitro) {
        const sx = w / this.SPRITE_W;
        const sy = h / this.SPRITE_H;
        const rxShift = -turn * 4.5;
        const pipes = model.exhaustPipes;
        for (let i = 0; i < pipes.length; i++) {
          this.drawNitroFlame(ctx, (pipes[i][0] + rxShift) * sx, pipes[i][1] * sy, Math.max(1.1, w * 0.020), true);
        }
      }

      ctx.restore();
    }
  };

  const CAR_MODELS = [
    {
      id: 'uno',
      name: 'UNO MILLE',
      badge: 'COM ESCADINHA DE FIRMA - O MAIS RÁPIDO',
      desc: 'O lendário bólido da firma! Com a escada no teto rompe as leis da física e atinge a maior velocidade final do campeonato!',
      maxSpeed: 298,
      acceleration: 0.82,
      braking: 0.90,
      handling: 0.60,
      grip: 0.65,
      centrifugalResistance: 0.62,
      primaryColor: '#EEF2F6',
      roofColor: '#2B2B33',
      exhaustPipes: [[-18.5, 21.5]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, silenciador transversal e suspensão traseira
        // Lameiras / para-barros pretos atrás dos pneus traseiros
        c.fillStyle = '#0B0E14';
        c.fillRect(rx - 31.0 * sx, 17.6, 8.8 * sx, 4.2);
        c.fillRect(rx + 22.2 * sx, 17.6, 8.8 * sx, 4.2);

        // Bojo do silenciador do escapamento transversal visível sob o chassi
        CarArt.roundRect(c, rx - 24.0 * sx, 18.2, 21.0 * sx, 3.6, 1.6, '#333D4B', out, 0.9);
        CarArt.line(c, rx - 22.0 * sx, 19.8, rx - 5.0 * sx, 19.8, '#475569', 0.75);

        // Gancho / argola de reboque de aço na base traseira à direita
        c.strokeStyle = '#64748B';
        c.lineWidth = 1.3;
        c.strokeRect(rx + 14.0 * sx, 20.0, 3.8 * sx, 2.8);

        // Pneus traseiros
        CarArt.drawRearTire(c, rx - 30.5 * sx, 13, 9.5, 11.2);
        CarArt.drawRearTire(c, rx + 21.0 * sx, 13, 9.5, 11.2);

        // 2. Carroceria trapezoidal Giugiaro HD com pintura metálica/verniz
        const rearBody = [
          [tx - 24.8 * sx, -24], [tx + 24.8 * sx, -24],
          [rx + 31.2 * sx, -6],  [rx + 32.0 * sx, 13.5],
          [rx - 32.0 * sx, 13.5],[rx - 31.2 * sx, -6]
        ];
        CarArt.poly(c, rearBody, CarArt.bodyGrad(c, body, -24, 14), out, 1.45);

        // Lateral contínua e integrada Top Gear 1 (sem recortes, sem porta aberta solta!)
        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 31.2 * sx, roofW: 24.8 * sx,
          roofY: -24, beltY: -6, botY: 13.5, wheelStyle: 'steel', mirrorColor: '#1D222B'
        });

        // Retrovisores clássicos pretos: visíveis em linha reta de ambos os lados e no lado oposto na curva
        if (turn >= -0.1) {
          CarArt.drawMirror(c, tx - 35.2 * sx, -9.6, 5.2, 3.8, 1.0, '#1D222B', tx - 29.8 * sx, -7.0, true);
        }
        if (turn <= 0.1) {
          CarArt.drawMirror(c, tx + 30.0 * sx, -9.6, 5.2, 3.8, 1.0, '#1D222B', tx + 24.6 * sx, -7.0, false);
        }

        // Calhas de teto do Uno (vincos longitudinais escuros nos ombros superiores)
        CarArt.line(c, tx - 24.4 * sx, -24.0, tx - 22.2 * sx, -21.8, '#1A202C', 1.1);
        CarArt.line(c, tx + 24.4 * sx, -24.0, tx + 22.2 * sx, -21.8, '#1A202C', 1.1);

        // Brilho superior no teto e vinco marcante sob o vidro traseiro
        CarArt.line(c, tx - 23.0 * sx, -22.6, tx + 23.0 * sx, -22.6, CarArt.shade(body, 32), 1.4);
        CarArt.line(c, rx - 29.5 * sx, -5.2, rx + 29.5 * sx, -5.2, CarArt.shade(body, 28), 1.3);

        // Frestas e recorte da tampa do porta-malas do Uno
        c.strokeStyle = CarArt.shade(body, -42);
        c.lineWidth = 0.95;
        c.strokeRect(rx - 24.5 * sx, -5.2, 49.0 * sx, 16.2);

        // 3. Vigia traseira com guarnição de borracha preta
        // Moldura externa da borracha
        CarArt.poly(c, [
          [tx - 22.4 * sx, -21.4], [tx + 22.4 * sx, -21.4],
          [rx + 27.0 * sx, -6.0],  [rx - 27.0 * sx, -6.0]
        ], '#12161F', out, 1.2);

        // Vidro traseiro com gradiente e reflexo HD
        CarArt.drawGlassQuad(c, [
          [tx - 21.2 * sx, -20.6], [tx + 21.2 * sx, -20.6],
          [rx + 26.0 * sx, -6.8],  [rx - 26.0 * sx, -6.8]
        ]);

        // Filamentos horizontais do desembaçador térmico traseiro (cobre/laranja sutil)
        for (let l = 1; l <= 4; l++) {
          const dy = -19.5 + l * 2.5;
          const leftX = tx - 19.5 * sx + (rx - tx - 4.5 * sx) * (l / 4);
          const rightX = tx + 19.5 * sx + (rx - tx + 4.5 * sx) * (l / 4);
          CarArt.line(c, leftX, dy, rightX, dy, 'rgba(234, 88, 12, 0.48)', 0.65);
        }

        // Brake-light central superior (terceira luz de freio no topo do vidro)
        const blW = 7.0 * sx;
        const blCol = isBraking ? '#FF1E10' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - blW * 0.5, -20.2, blW, 1.8, 0.6, blCol, '#141820', 0.6);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -19.3, 3.5, 2.0, true, isNight);
        }

        // Limpador traseiro articulado com base giratória e palheta preta
        CarArt.line(c, rx - 1.8, -7.0, rx + 12.8 * sx, -12.4, '#0D1117', 1.8);
        CarArt.line(c, rx + 4.0 * sx, -9.2, rx + 13.2 * sx, -12.6, '#1E293B', 1.0); // Palheta
        c.fillStyle = '#0D1117';
        c.beginPath();
        c.arc(rx - 1.8, -7.0, 1.8, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#64748B';
        c.beginPath();
        c.arc(rx - 1.8, -7.0, 0.7, 0, Math.PI * 2); // Parafuso central
        c.fill();

        // 4. Detalhes da Tampa do Porta-Malas: Letreiros, Maçaneta e Emblemas
        // Emblema redondo clássico bordô/vermelho FIAT no centro da tampa
        c.fillStyle = '#DCE4EC';
        c.beginPath();
        c.arc(rx, 1.8, 3.1, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.8;
        c.stroke();
        c.fillStyle = '#8E1B24';
        c.beginPath();
        c.arc(rx, 1.8, 2.2, 0, Math.PI * 2);
        c.fill();
        CarArt.line(c, rx - 1.0, 2.5, rx + 1.0, 1.1, '#F5F7FA', 0.7);

        // Letreiro clássico "UNO" no canto esquerdo da tampa
        CarArt.drawEmblemText(c, 'UNO', rx - 19.5 * sx, 3.2, {
          font: 'bold 3.6px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.65
        });

        // Letreiro clássico itálico "Mille" e "FIRE" no canto direito da tampa
        CarArt.drawEmblemText(c, 'Mille', rx + 19.5 * sx, 2.8, {
          font: 'italic bold 3.2px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.6
        });
        CarArt.drawEmblemText(c, 'FIRE', rx + 19.5 * sx, 4.8, {
          font: 'bold 2.0px sans-serif',
          align: 'right',
          fill: '#EF4444',
          stroke: '#450A0A',
          strokeW: 0.5,
          shadowOffset: 0.4
        });

        // Maçaneta de abertura da tampa traseira em plástico preto com miolo de chave
        const hdlW = 8.8 * sx;
        CarArt.roundRect(c, rx - hdlW * 0.5, 6.2, hdlW, 2.6, 0.8, '#141822', out, 0.75);
        CarArt.line(c, rx - 3.2 * sx, 7.5, rx + 1.4 * sx, 7.5, '#090D14', 1.0);
        // Fechadura / miolo de chave cromado
        c.fillStyle = '#CBD5E1';
        c.beginPath();
        c.arc(rx + 2.5 * sx, 7.5, 0.85, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#0F172A';
        c.fillRect(rx + 2.3 * sx, 7.1, 0.4, 0.8);

        // 5. Lanternas Traseiras Verticais Segmentadas e Frisadas (Laranja / Vermelho / Ré / Refletor)
        const drawUnoLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -31.4 * sx;
          const lw = 9.0 * sx;
          const ly = -0.4;
          const lh = 11.2;

          // Moldura emborrachada preta perimetral com chanfro
          CarArt.roundRect(c, lx - 0.5, ly - 0.4, lw + 1.0, lh + 0.8, 1.4, '#10141D', out, 1.25);

          // Base da lanterna
          CarArt.roundRect(c, lx, ly, lw, lh, 1.0, tailRed, '#1A212B', 0.8);

          // Câmara 1 (Topo): Pisca / Seta Âmbar com frisos horizontais
          c.fillStyle = '#D97706';
          c.fillRect(lx + 0.6, ly + 0.6, lw - 1.2, 3.1);
          c.fillStyle = '#F59E0B';
          c.fillRect(lx + 0.8, ly + 0.7, lw - 1.6, 1.2); // Brilho superior
          // Frisos horizontais na lente âmbar
          CarArt.line(c, lx + 0.6, ly + 1.6, lx + lw - 0.6, ly + 1.6, '#92400E', 0.6);
          CarArt.line(c, lx + 0.6, ly + 2.5, lx + lw - 0.6, ly + 2.5, '#92400E', 0.6);

          // Divisória preta entre câmaras
          CarArt.line(c, lx, ly + 3.8, lx + lw, ly + 3.8, '#0B0F16', 0.9);

          // Câmara 2 (Meio): Luz de Posição e Freio Vermelha
          const mY = ly + 4.0;
          const mH = 3.6;
          c.fillStyle = tailRed;
          c.fillRect(lx + 0.6, mY, lw - 1.2, mH);
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.28)';
          c.fillRect(lx + 0.8, mY + 0.5, lw - 1.6, 0.9);
          // Ranhuras horizontais
          CarArt.line(c, lx + 0.6, mY + 1.7, lx + lw - 0.6, mY + 1.7, '#4B0A0E', 0.6);
          CarArt.line(c, lx + 0.6, mY + 2.7, lx + lw - 0.6, mY + 2.7, '#4B0A0E', 0.6);

          // Divisória preta entre câmaras
          CarArt.line(c, lx, ly + 7.7, lx + lw, ly + 7.7, '#0B0F16', 0.9);

          // Câmara 3 (Base): Luz de Ré Cristal (lado interno) + Catadióptrico Vermelho (lado externo)
          const bY = ly + 7.9;
          const bH = 2.8;

          // Catadióptrico vermelho rubi (lado externo)
          c.fillStyle = '#881216';
          c.fillRect(lx + 0.6, bY, 3.8 * sx, bH);
          CarArt.line(c, lx + 0.6, bY + 1.4, lx + 4.2 * sx, bY + 1.4, '#B91C1C', 0.55);

          // Divisória vertical sutil entre ré e refletor
          CarArt.line(c, lx + 4.4 * sx, bY, lx + 4.4 * sx, bY + bH, '#0B0F16', 0.7);

          // Luz de ré branca cristal (lado interno, voltado para a placa)
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 4.6 * sx, bY, lw - 5.2 * sx, bH);
          c.fillStyle = '#FFFFFF';
          c.fillRect(lx + 4.8 * sx, bY + 0.4, lw - 5.6 * sx, 0.8);
          CarArt.line(c, lx + 4.6 * sx, bY + 1.5, lx + lw - 0.6, bY + 1.5, '#94A3B8', 0.5);

          // Brilho / Glow dinâmico
          CarArt.drawTailGlow(c, lx + lw * 0.5, ly + 5.6, 5.2, 5.0, isBraking, isNight);

          c.restore();
        };
        drawUnoLamp(true);
        drawUnoLamp(false);

        // 6. Para-choque preto fosco envolvente com textura, nicho da placa e refletores
        const bmpGrad = c.createLinearGradient(0, 11, 0, 20.8);
        bmpGrad.addColorStop(0, '#2E3643');
        bmpGrad.addColorStop(0.35, '#222833');
        bmpGrad.addColorStop(0.7, '#181C24');
        bmpGrad.addColorStop(1, '#0E1117');
        CarArt.roundRect(c, rx - 32.8 * sx, 11.0, 65.6 * sx, 9.6, 2.0, bmpGrad, out, 1.35);

        // Friso duplo estriado moldado no plástico do para-choque
        CarArt.line(c, rx - 31.5 * sx, 13.0, rx + 31.5 * sx, 13.0, '#0B0E14', 1.0);
        CarArt.line(c, rx - 31.5 * sx, 13.8, rx + 31.5 * sx, 13.8, '#3A4454', 0.5);

        // Refletores horizontais (olho de gato) nas extremidades inferiores do para-choque
        CarArt.roundRect(c, rx - 31.0 * sx, 15.6, 4.2 * sx, 1.6, 0.5, '#B91C1C', '#0B0E14', 0.5);
        CarArt.roundRect(c, rx + 26.8 * sx, 15.6, 4.2 * sx, 1.6, 0.5, '#B91C1C', '#0B0E14', 0.5);

        // Nicho / rebaixo central para a placa Mercosul
        CarArt.box(c, rx - 11.0, 13.8, 22.0, 6.4, '#12161E', '#0B0E14', 0.7);
        // Luzinhas de placa pretas no topo do nicho
        c.fillStyle = '#090C12';
        c.fillRect(rx - 6.2, 13.5, 2.8, 1.0);
        c.fillRect(rx + 3.4, 13.5, 2.8, 1.0);
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.8, 14.1, 2.0, 0.4);
        c.fillRect(rx + 3.8, 14.1, 2.0, 0.4);

        // Placa Mercosul com acabamento realista
        CarArt.drawPlateStraight(c, rx - 10.0, 14.4, 20.0, 5.4);

        // 7. Ponteira cromada do escapamento à esquerda
        CarArt.drawExhaustPipe(c, rx - 18.5 * sx, 21.4, 2.0);

        // === RACK E ESCADA METÁLICA DE FIRMA NO TETO (fina, posicionada à esquerda e acompanhando a curva) ===
        // 1. Barras transversais pretas do rack de teto (atravessam o teto)
        const rackShiftFront = turn * 2.0;
        // Pés de fixação e barra traseira do rack
        CarArt.line(c, tx - 21.0 * sx, -23.8, tx - 20.2 * sx, -27.5, '#141820', 2.2);
        CarArt.line(c, tx + 21.0 * sx, -23.8, tx + 20.2 * sx, -27.5, '#141820', 2.2);
        CarArt.line(c, tx - 21.5 * sx, -27.5, tx + 21.5 * sx, -27.5, out, 2.4);
        CarArt.line(c, tx - 21.0 * sx, -27.5, tx + 21.0 * sx, -27.5, '#2B3340', 1.4);

        // Barra dianteira do rack em perspectiva
        const frontBarL = tx - 19.5 * sx + rackShiftFront;
        const frontBarR = tx + 19.5 * sx + rackShiftFront;
        CarArt.line(c, frontBarL, -32.0, frontBarR, -32.0, out, 2.0);
        CarArt.line(c, frontBarL + 0.5, -32.0, frontBarR - 0.5, -32.0, '#222933', 1.2);

        // 2. Escada de alumínio estreita (12px) posicionada à esquerda do teto
        const ladderCenterBack = tx - 12.0 * sx;
        const ladderCenterFront = tx - 12.0 * sx + turn * 4.4; // Acompanha fielmente o lado da curva
        const halfW_back = 6.0 * sx;  // Largura exata de 12px (6.0 * 2)
        const halfW_front = 5.2 * sx; // Perspectiva em profundidade

        const lBackL = ladderCenterBack - halfW_back;
        const lBackR = ladderCenterBack + halfW_back;
        const lFrontL = ladderCenterFront - halfW_front;
        const lFrontR = ladderCenterFront + halfW_front;

        // Degraus horizontais de alumínio entre as longarinas
        for (let k = 0; k < 6; k++) {
          const f = k / 5;
          const x1 = lBackL + (lFrontL - lBackL) * f;
          const x2 = lBackR + (lFrontR - lBackR) * f;
          const ry = -27.4 - f * 6.2;
          CarArt.line(c, x1, ry, x2, ry, out, 2.0);
          CarArt.line(c, x1 + 0.4, ry, x2 - 0.4, ry, '#E2E8F0', 1.1);
        }

        // Longarinas laterais de alumínio da escada (com relevo metálico)
        CarArt.poly(c, [
          [lBackL - 1.4, -26.8], [lFrontL - 1.2, -33.8],
          [lFrontL + 0.9, -33.8], [lBackL + 0.9, -26.8]
        ], '#94A3B8', out, 0.95);
        CarArt.poly(c, [
          [lBackR - 0.9, -26.8], [lFrontR - 0.9, -33.8],
          [lFrontR + 1.4, -33.8], [lBackR + 1.4, -26.8]
        ], '#94A3B8', out, 0.95);

        // Cintas de amarração vermelhas prendendo a escada no rack de teto com catraca
        CarArt.line(c, lBackL - 1.5, -27.4, lBackR + 1.5, -27.4, '#DC2626', 1.4);
        CarArt.box(c, lBackR - 0.8, -28.2, 1.6, 1.6, '#F59E0B', out, 0.5); // Catraca amarela
        const frontStrapF = 0.74;
        const sX1 = lBackL + (lFrontL - lBackL) * frontStrapF;
        const sX2 = lBackR + (lFrontR - lBackR) * frontStrapF;
        const sY = -27.4 - frontStrapF * 6.2;
        CarArt.line(c, sX1 - 1.4, sY, sX2 + 1.4, sY, '#DC2626', 1.4);
        CarArt.box(c, sX2 - 0.6, sY - 0.8, 1.5, 1.5, '#F59E0B', out, 0.5);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },
    {
      id: 'fusca',
      name: 'FUSCA 1300',
      badge: 'HANDLING PERFEITO',
      desc: 'Mais lento em reta, mas faz curvas de pé cravado com aderência lendária!',
      maxSpeed: 208,
      acceleration: 0.58,
      braking: 0.75,
      handling: 1.0,
      grip: 1.0,
      centrifugalResistance: 1.0,
      primaryColor: '#4678A2',
      exhaustPipes: [[-6.5, 21.5], [6.5, 21.5]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.5;
        const tx = -turn * 2.1;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi do motor Boxer e pneus
        // Lameiras / para-barros pretos clássicos do Fusca atrás das rodas
        c.fillStyle = '#0F131A';
        c.fillRect(rx - 29.5 * sx, 18.0, 8.5 * sx, 4.0);
        c.fillRect(rx + 21.0 * sx, 18.0, 8.5 * sx, 4.0);
        // Friso branco clássico na borda da lameira
        CarArt.line(c, rx - 29.5 * sx, 21.8, rx - 21.0 * sx, 21.8, '#CBD5E1', 0.8);
        CarArt.line(c, rx + 21.0 * sx, 21.8, rx + 29.5 * sx, 21.8, '#CBD5E1', 0.8);

        // Bloco/cárter inferior do motor Boxer refrigerado a ar
        CarArt.roundRect(c, rx - 9.5 * sx, 18.2, 19.0 * sx, 3.4, 1.2, '#2C333E', out, 0.8);
        CarArt.line(c, rx - 7.0 * sx, 19.8, rx + 7.0 * sx, 19.8, '#475569', 0.6);

        // Pneus estreitos clássicos com calota de época
        CarArt.drawRearTire(c, rx - 29.5 * sx, 13, 8.8, 11.2);
        CarArt.drawRearTire(c, rx + 20.7 * sx, 13, 8.8, 11.2);

        // 2. Para-lamas traseiros abaulados esquerdo e direito
        const fenderGrad = CarArt.bodyGrad(c, CarArt.shade(body, -6), -2, 20);
        c.fillStyle = fenderGrad;
        c.beginPath();
        c.ellipse(rx - 23.8 * sx, 9.8, 8.8 * sx, 11.2, -0.08, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.4;
        c.stroke();

        c.fillStyle = fenderGrad;
        c.beginPath();
        c.ellipse(rx + 23.8 * sx, 9.8, 8.8 * sx, 11.2, 0.08, 0, Math.PI * 2);
        c.fill();
        c.stroke();

        // Friso cromado de união dos para-lamas à carroceria (pestana/debrum)
        c.strokeStyle = '#DCE5EE';
        c.lineWidth = 0.85;
        c.beginPath();
        c.ellipse(rx - 23.8 * sx, 9.8, 8.2 * sx, 10.6, -0.08, Math.PI * 0.7, Math.PI * 1.8);
        c.stroke();
        c.beginPath();
        c.ellipse(rx + 23.8 * sx, 9.8, 8.2 * sx, 10.6, 0.08, Math.PI * 1.2, Math.PI * 0.3);
        c.stroke();

        // 3. Cabine arredondada clássica do Fusca
        c.fillStyle = CarArt.bodyGrad(c, body, -26, 19);
        c.beginPath();
        c.moveTo(rx - 20.2 * sx, 18);
        c.quadraticCurveTo(rx - 26.2 * sx, -4, tx - 18.2 * sx, -21.2);
        c.quadraticCurveTo(tx, -27.2, tx + 18.2 * sx, -21.2);
        c.quadraticCurveTo(rx + 26.2 * sx, -4, rx + 20.2 * sx, 18);
        c.closePath();
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.45;
        c.stroke();

        // Lateral contínua Top Gear 1 integrada à cabine do Fusca
        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 26.2 * sx, roofW: 18.2 * sx,
          roofY: -21.2, beltY: -4, botY: 18, wheelStyle: 'hubcap', mirrorColor: '#DCE5EE'
        });

        // Retrovisores redondos cromados clássicos
        if (turn >= -0.1) {
          CarArt.drawMirror(c, tx - 29.5 * sx, -12.0, 4.4, 3.4, 1.8, '#DCE5EE', tx - 22.0 * sx, -8.5, true);
        }
        if (turn <= 0.1) {
          CarArt.drawMirror(c, tx + 25.1 * sx, -12.0, 4.4, 3.4, 1.8, '#DCE5EE', tx + 17.6 * sx, -8.5, false);
        }

        // Reflexo especular suave no teto abaulado
        c.fillStyle = 'rgba(255, 255, 255, 0.22)';
        c.beginPath();
        c.ellipse(tx, -21.2, 11.5 * sx, 2.3, 0, 0, Math.PI * 2);
        c.fill();

        // 4. Vigia traseira oval com moldura de borracha e friso cromado
        const vX = tx * 0.65 + rx * 0.35;
        const vY = -12.5;
        // Guarnição de borracha preta externa
        c.fillStyle = '#101620';
        c.beginPath();
        c.ellipse(vX, vY, 15.2 * sx, 6.5, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.2;
        c.stroke();

        // Friso cromado inserido na borracha do vidro
        c.strokeStyle = '#E2E8F0';
        c.lineWidth = 0.75;
        c.beginPath();
        c.ellipse(vX, vY, 14.7 * sx, 6.1, 0, 0, Math.PI * 2);
        c.stroke();

        // Vidro com gradiente e reflexo
        const vGrad = c.createLinearGradient(0, vY - 5.5, 0, vY + 5.5);
        vGrad.addColorStop(0, '#0F1824');
        vGrad.addColorStop(0.55, '#1D2D40');
        vGrad.addColorStop(1, '#263B52');
        c.fillStyle = vGrad;
        c.beginPath();
        c.ellipse(vX, vY, 14.0 * sx, 5.5, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.0;
        c.stroke();

        // Reflexo curvo no vidro
        c.fillStyle = 'rgba(165, 212, 250, 0.28)';
        c.beginPath();
        c.ellipse(vX - 4.5, -13.6, 5.6 * sx, 2.2, -0.22, 0, Math.PI * 2);
        c.fill();

        // 5. Grelha de aletas de refrigeração do motor Boxer
        for (let gx = -11; gx <= 11; gx += 2.2) {
          const archY = -4.8 + (gx * gx) * 0.011;
          CarArt.line(c, rx + gx * sx, archY, rx + gx * sx, archY + 2.3, '#0A0F16', 1.1);
          CarArt.line(c, rx + gx * sx, archY, rx + gx * sx, archY + 0.6, '#475569', 0.5);
        }

        // 6. Tampa curva do motor Boxer e detalhes
        // Fresta / contorno da tampa do motor
        c.strokeStyle = CarArt.shade(body, -42);
        c.lineWidth = 1.15;
        c.beginPath();
        c.moveTo(rx - 15.2 * sx, -1.5);
        c.quadraticCurveTo(rx, -4.5, rx + 15.2 * sx, -1.5);
        c.quadraticCurveTo(rx + 16.5 * sx, 14.5, rx, 17.5);
        c.quadraticCurveTo(rx - 16.5 * sx, 14.5, rx - 15.2 * sx, -1.5);
        c.stroke();

        // Friso cromado vertical clássico do Fusca descendo da vigia até o emblema
        CarArt.line(c, rx, -1.5, rx, 11.5, '#E2E8F0', 1.0);
        CarArt.line(c, rx - 0.4, -1.5, rx - 0.4, 11.5, '#94A3B8', 0.5);

        // Emblema redondo clássico cromado/azul marinho VW no topo do capô
        c.fillStyle = '#E2E8F0';
        c.beginPath();
        c.arc(rx, 0.8, 3.2, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.8;
        c.stroke();
        c.fillStyle = '#1E3A8A';
        c.beginPath();
        c.arc(rx, 0.8, 2.4, 0, Math.PI * 2);
        c.fill();
        // Logo W estilizado cromado
        CarArt.line(c, rx - 1.2, 0.0, rx, 1.8, '#F8FAFC', 0.8);
        CarArt.line(c, rx + 1.2, 0.0, rx, 1.8, '#F8FAFC', 0.8);
        CarArt.line(c, rx - 1.2, 0.0, rx - 0.5, 2.0, '#F8FAFC', 0.7);
        CarArt.line(c, rx + 1.2, 0.0, rx + 0.5, 2.0, '#F8FAFC', 0.7);

        // Emblema cursivo "1300" cromado em relevo no lado direito da tampa
        CarArt.drawEmblemText(c, '1300', rx + 9.5 * sx, 4.8, {
          font: 'italic bold 3.2px sans-serif',
          align: 'center',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // 7. Luz de Placa Cromada ("Nariz de Bruxa") + Placa Mercosul
        // Cúpula cromada ("nariz de bruxa" do Fusca 1300)
        const hoodGrad = c.createLinearGradient(0, 4.2, 0, 7.8);
        hoodGrad.addColorStop(0, '#FFFFFF');
        hoodGrad.addColorStop(0.4, '#E2E8F0');
        hoodGrad.addColorStop(0.7, '#94A3B8');
        hoodGrad.addColorStop(1, '#475569');
        CarArt.roundRect(c, rx - 4.5 * sx, 4.6, 9.0 * sx, 2.8, 1.2, hoodGrad, out, 0.8);
        CarArt.line(c, rx - 3.8 * sx, 5.0, rx + 3.8 * sx, 5.0, '#FFFFFF', 0.7);
        // Luz de placa voltada para baixo
        c.fillStyle = '#FEF08A';
        c.fillRect(rx - 2.5 * sx, 7.0, 5.0 * sx, 0.6);

        // Placa Mercosul centralizada na tampa do motor
        CarArt.drawPlateStraight(c, rx - 8.5, 7.5, 17.0, 5.2);

        // Puxador em "T" cromado clássico com fechadura (fecho giratório do capô)
        CarArt.roundRect(c, rx - 2.2 * sx, 13.5, 4.4 * sx, 1.4, 0.5, '#F1F5F9', out, 0.7);
        CarArt.line(c, rx, 13.5, rx, 14.8, '#475569', 0.8);
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 0.4, 14.0, 0.8, 0.6);

        // 8. Lanternas ovais bicolores ("Fafá") nos para-lamas traseiros
        const drawFuscaLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -24.2 * sx;
          const ly = 9.2;

          // Aro cromado externo duplo em relevo
          c.fillStyle = '#F1F5F9';
          c.beginPath();
          c.ellipse(lx, ly, 4.5 * sx, 5.8, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 1.1;
          c.stroke();
          // Borda interna escura
          c.fillStyle = '#0F172A';
          c.beginPath();
          c.ellipse(lx, ly, 3.8 * sx, 5.0, 0, 0, Math.PI * 2);
          c.fill();

          // Lente inferior: luz de freio/posição vermelha rubi estriada
          c.fillStyle = tailRed;
          c.beginPath();
          c.ellipse(lx, ly + 0.3, 3.2 * sx, 4.4, 0, 0, Math.PI * 2);
          c.fill();
          // Frisos estriados na lente vermelha
          CarArt.line(c, lx - 2.2 * sx, ly + 1.2, lx + 2.2 * sx, ly + 1.2, '#58080C', 0.55);
          CarArt.line(c, lx - 2.0 * sx, ly + 2.4, lx + 2.0 * sx, ly + 2.4, '#58080C', 0.55);

          // Lente superior: pisca/seta âmbar em meia-lua com friso
          c.fillStyle = '#D97706';
          c.beginPath();
          c.ellipse(lx, ly - 1.8, 2.8 * sx, 2.3, 0, Math.PI, Math.PI * 2);
          c.fill();
          c.fillStyle = '#F59E0B';
          c.beginPath();
          c.ellipse(lx, ly - 2.2, 2.3 * sx, 1.4, 0, Math.PI, Math.PI * 2);
          c.fill();

          // Friso cromado de divisão entre âmbar e vermelho
          CarArt.line(c, lx - 2.8 * sx, ly - 0.7, lx + 2.8 * sx, ly - 0.7, '#E2E8F0', 0.75);

          // Ponto de luz / catadióptrico central
          c.fillStyle = isBraking ? '#FFE4E6' : 'rgba(255, 255, 255, 0.4)';
          c.beginPath();
          c.arc(lx, ly + 1.6, 0.9, 0, Math.PI * 2);
          c.fill();

          CarArt.drawTailGlow(c, lx, ly, 4.4, 4.8, isBraking, isNight);
          c.restore();
        };
        drawFuscaLamp(true);
        drawFuscaLamp(false);

        // 9. Ponteira dupla Boxer cromada + Para-choque cromado clássico com poleiros
        CarArt.drawExhaustPipe(c, rx - 6.5 * sx, 21.3, 1.7);
        CarArt.drawExhaustPipe(c, rx + 6.5 * sx, 21.3, 1.7);

        // Lâmina cromada do para-choque
        const chrGrad = c.createLinearGradient(0, 15.5, 0, 20.2);
        chrGrad.addColorStop(0, '#FFFFFF');
        chrGrad.addColorStop(0.35, '#E2E8F0');
        chrGrad.addColorStop(0.65, '#94A3B8');
        chrGrad.addColorStop(1, '#475569');
        CarArt.roundRect(c, rx - 31.2 * sx, 15.6, 62.4 * sx, 4.4, 2.0, chrGrad, out, 1.3);
        // Friso central de borracha preta na lâmina
        CarArt.line(c, rx - 29.5 * sx, 17.8, rx + 29.5 * sx, 17.8, '#141822', 1.0);

        // Os dois clássicos poleiros / batentes verticais cromados com borrachas pretas
        const drawBumperGuard = (gx) => {
          CarArt.roundRect(c, gx, 12.6, 3.8, 8.4, 1.4, '#F8FAFC', out, 1.1);
          // Batente de borracha preta no centro do poleiro
          CarArt.box(c, gx + 0.6, 14.5, 2.6, 4.6, '#111620', null, 0);
        };
        drawBumperGuard(rx - 16.5 * sx);
        drawBumperGuard(rx + 12.7 * sx);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },
    {
      id: 'peugeot',
      name: 'PEUGEOT 206',
      badge: 'ÁGIL & EQUILIBRADO',
      desc: 'Hatch esportivo clássico, aceleração rápida e ágil nas curvas. Exige precisão e controle nas retomadas.',
      maxSpeed: 236,
      acceleration: 1.0,
      braking: 0.85,
      handling: 0.84,
      grip: 0.88,
      centrifugalResistance: 0.88,
      primaryColor: '#C5CDD6',
      exhaustPipes: [[-19.0, 21.2]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi e pneus
        c.fillStyle = '#0D1117';
        c.fillRect(rx - 31.0 * sx, 18.0, 9.5 * sx, 4.0);
        c.fillRect(rx + 21.5 * sx, 18.0, 9.5 * sx, 4.0);

        // Silenciador transversal do escapamento sob o para-choque
        CarArt.roundRect(c, rx - 25.0 * sx, 18.4, 16.0 * sx, 3.6, 1.6, '#333D4B', out, 0.85);

        // Pneus traseiros
        CarArt.drawRearTire(c, rx - 31.6 * sx, 13, 10.2, 11.2);
        CarArt.drawRearTire(c, rx + 21.4 * sx, 13, 10.2, 11.2);

        // 2. Carroceria hatch curva (teto abaulado, quadris largos) — silhueta em bézier
        const shape = { roofY: -22, roofW: 18.6, shY: -7.5, shW: 29.2, midY: 4.5, midW: 33.0, botY: 19.6, botW: 31.2, round: 7, arch: 1.9 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -23, 20);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.45;
        c.lineJoin = 'round';
        c.stroke();

        // Lateral contínua Top Gear 1 integrada à carroceria do 206
        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 31.2 * sx, roofW: 18.6 * sx,
          roofY: -22, beltY: -7.5, botY: 19.6, wheelStyle: 'alloy', mirrorColor: body,
          curvedRoof: true
        });

        // Retrovisores aerodinâmicos na cor da carroceria
        if (turn >= -0.1) {
          CarArt.drawMirror(c, tx - 33.6 * sx, -9.6, 5.2, 3.6, 1.8, body, tx - 28.2 * sx, -7.2, true);
        }
        if (turn <= 0.1) {
          CarArt.drawMirror(c, tx + 28.4 * sx, -9.6, 5.2, 3.6, 1.8, body, tx + 23.0 * sx, -7.2, false);
        }

        // Brilho do teto e vinco curvo do porta-malas
        c.beginPath();
        c.moveTo(tx - 13.5 * sx, -20.7);
        c.quadraticCurveTo(tx, -22.6, tx + 13.5 * sx, -20.7);
        c.strokeStyle = CarArt.shade(body, 32);
        c.lineWidth = 1.2;
        c.stroke();

        // Fresta / contorno da tampa do porta-malas curva do 206
        c.beginPath();
        c.moveTo(rx - 22.0 * sx, -5.2);
        c.quadraticCurveTo(rx - 23.5 * sx, 5.0, rx - 20.0 * sx, 13.5);
        c.lineTo(rx + 20.0 * sx, 13.5);
        c.quadraticCurveTo(rx + 23.5 * sx, 5.0, rx + 22.0 * sx, -5.2);
        c.strokeStyle = CarArt.shade(body, -40);
        c.lineWidth = 0.95;
        c.stroke();

        // 3. Terceira luz de freio integrada no aerofólio superior no teto
        const blCol206 = isBraking ? '#FF2A00' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 6.5 * sx, -21.6, 13.0 * sx, 1.8, 0.8, blCol206, '#141820', 0.6);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -20.7, 3.8, 2.0, true, isNight);
        }

        // 4. Vigia traseira curva (formato de gota) + desembaçador térmico
        CarArt.glassCurve(c, tx, rx, sx, -18.3, -5.0, 16.6, 24.2, 1.9, 1.7);

        // Filamentos curvos do desembaçador térmico do 206
        for (let l = 1; l <= 4; l++) {
          const dy = -17.0 + l * 2.6;
          const w = (17.5 + l * 1.6) * sx;
          c.beginPath();
          c.moveTo(rx - w, dy);
          c.quadraticCurveTo(rx, dy - 0.7, rx + w, dy);
          c.strokeStyle = 'rgba(234, 88, 12, 0.45)';
          c.lineWidth = 0.65;
          c.stroke();
        }

        // Limpador traseiro curvo preto com pivô e palheta
        CarArt.line(c, rx + 0.5, -5.4, rx + 12.5 * sx, -10.0, '#0E131B', 1.6);
        CarArt.line(c, rx + 4.0 * sx, -7.0, rx + 13.0 * sx, -10.2, '#1E293B', 1.0);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx + 0.5, -5.4, 1.6, 0, Math.PI * 2);
        c.fill();

        // 5. Régua do porta-malas, Leão Peugeot e Badges
        // Régua plástica do porta-malas acima da placa (com acabamento cinza chumbo)
        CarArt.roundRect(c, rx - 18.0 * sx, 3.8, 36.0 * sx, 4.0, 1.2, '#18202A', out, 0.85);

        // O icônico Leão da Peugeot em relevo cromado no centro da régua
        c.fillStyle = '#E2E8F0';
        c.beginPath();
        c.arc(rx, 5.8, 2.4, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.65;
        c.stroke();
        // Silhueta estilizada do leão
        CarArt.line(c, rx - 0.8, 7.2, rx + 0.8, 4.4, '#1E293B', 0.9);
        CarArt.line(c, rx + 0.6, 4.4, rx + 1.2, 5.6, '#1E293B', 0.7);

        // Inscrição cromada "PEUGEOT" à esquerda
        CarArt.drawEmblemText(c, 'PEUGEOT', rx - 16.5 * sx, 6.6, {
          font: 'bold 2.4px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.5
        });

        // Inscrição esportiva cromada "206" à direita
        CarArt.drawEmblemText(c, '206', rx + 16.5 * sx, 6.8, {
          font: 'bold 3.8px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.65
        });

        // Fechadura / botão elétrico sob a régua
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 1.2, 7.8, 2.4, 0.7);

        // 6. Lanternas traseiras em "Gota" / "Olho de Gato" 3D
        const draw206Lamp = (sg) => {
          c.save();
          // Caminho externo da gota
          c.beginPath();
          c.moveTo(rx + sg * 31.6 * sx, -6.2);
          c.bezierCurveTo(rx + sg * 29.2 * sx, -9.0, rx + sg * 24.6 * sx, -8.4, rx + sg * 22.4 * sx, -4.8);
          c.bezierCurveTo(rx + sg * 20.6 * sx, -1.4, rx + sg * 21.2 * sx, 3.8, rx + sg * 24.8 * sx, 5.8);
          c.bezierCurveTo(rx + sg * 28.2 * sx, 7.2, rx + sg * 32.0 * sx, 6.4, rx + sg * 33.0 * sx, 3.4);
          c.bezierCurveTo(rx + sg * 33.6 * sx, 0.2, rx + sg * 33.0 * sx, -3.4, rx + sg * 31.6 * sx, -6.2);
          c.closePath();
          c.fillStyle = tailRed;
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 1.25;
          c.stroke();

          // Lente de seta âmbar em arco no trecho superior/interno
          c.fillStyle = '#D97706';
          c.beginPath();
          c.ellipse(rx + sg * 25.6 * sx, -2.2, 2.8 * sx, 1.8, sg * 0.35, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#F59E0B';
          c.beginPath();
          c.ellipse(rx + sg * 25.6 * sx, -2.5, 2.0 * sx, 1.0, sg * 0.35, 0, Math.PI * 2);
          c.fill();

          // Lente de ré cristal redonda no centro da gota
          c.fillStyle = '#E2E8F0';
          c.beginPath();
          c.ellipse(rx + sg * 26.2 * sx, 2.4, 2.4 * sx, 1.8, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#FFFFFF';
          c.beginPath();
          c.ellipse(rx + sg * 26.2 * sx, 2.1, 1.6 * sx, 1.0, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = '#94A3B8';
          c.lineWidth = 0.5;
          c.stroke();

          // Frisos estriados na lente rubi
          CarArt.line(c, rx + sg * 28.0 * sx, 4.0, rx + sg * 31.5 * sx, 4.0, '#58080C', 0.6);
          CarArt.line(c, rx + sg * 28.5 * sx, 5.2, rx + sg * 31.0 * sx, 5.2, '#58080C', 0.6);

          CarArt.drawTailGlow(c, rx + sg * 27.0 * sx, 0.4, 5.5, 5.0, isBraking, isNight);
          c.restore();
        };
        draw206Lamp(-1);
        draw206Lamp(1);

        // 7. Para-choque esportivo com o clássico borrachão preto envolvente
        c.beginPath();
        c.moveTo(rx - 32.0 * sx, 9.4);
        c.quadraticCurveTo(rx, 7.8, rx + 32.0 * sx, 9.4);
        c.lineTo(rx + 31.4 * sx, 13.0);
        c.quadraticCurveTo(rx, 11.4, rx - 31.4 * sx, 13.0);
        c.closePath();
        c.fillStyle = '#171B23';
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.05;
        c.stroke();

        // Refletores olho-de-gato vermelhos integrados nas extremidades do borrachão
        CarArt.roundRect(c, rx - 29.5 * sx, 10.4, 4.0 * sx, 1.5, 0.5, '#B91C1C', '#0B0F16', 0.45);
        CarArt.roundRect(c, rx + 25.5 * sx, 10.4, 4.0 * sx, 1.5, 0.5, '#B91C1C', '#0B0F16', 0.45);

        // Nicho da placa Mercosul
        CarArt.drawPlateStraight(c, rx - 9.8, 12.8, 19.6, 5.2);

        // A LENDÁRIA LUZ DE NEBLINA TRASEIRA CENTRAL DO 206 (marca registrada do Peugeot 206!)
        const fogW = 6.2 * sx;
        const fogH = 3.2;
        const fogY = 16.6;
        // Moldura preta da luz de neblina
        CarArt.roundRect(c, rx - fogW * 0.5 - 0.5, fogY - 0.4, fogW + 1.0, fogH + 0.8, 0.8, '#10141D', out, 0.8);
        // Lente vermelha rubi estriada com brilho
        const fogCol = isNight ? '#E11D48' : '#9F1239';
        CarArt.roundRect(c, rx - fogW * 0.5, fogY, fogW, fogH, 0.6, fogCol, '#4C0519', 0.5);
        CarArt.line(c, rx - fogW * 0.4, fogY + 1.0, rx + fogW * 0.4, fogY + 1.0, '#FDA4AF', 0.6);
        CarArt.line(c, rx - fogW * 0.4, fogY + 2.0, rx + fogW * 0.4, fogY + 2.0, '#4C0519', 0.5);

        // Ponteira esportiva oval cromada do escapamento à esquerda
        CarArt.drawExhaustPipe(c, rx - 19.0 * sx, 20.6, 2.0);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },
    {
      id: 'hb20',
      name: 'HB20',
      badge: 'EQUILIBRADO & CONFIÁVEL',
      desc: 'Hatch compacto com equilíbrio entre arrancada, velocidade final e curvas.',
      maxSpeed: 260,
      acceleration: 0.76,
      braking: 0.82,
      handling: 0.82,
      grip: 0.84,
      centrifugalResistance: 0.84,
      primaryColor: '#C81D25',
      exhaustPipes: [[-17.5, 21.5]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi e pneus
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 31.0 * sx, 18.0, 9.5 * sx, 4.0);
        c.fillRect(rx + 21.5 * sx, 18.0, 9.5 * sx, 4.0);

        // Pneus traseiros com rodas esportivas
        CarArt.drawRearTire(c, rx - 31.8 * sx, 13, 10.4, 11.2);
        CarArt.drawRearTire(c, rx + 21.4 * sx, 13, 10.4, 11.2);

        // Antena esportiva tipo barbatana de tubarão / haste inclinada no teto
        CarArt.line(c, tx + 1.5 * sx, -22.6, tx + 3.8 * sx, -27.5, '#141922', 1.2);
        CarArt.roundRect(c, tx + 0.5 * sx, -23.0, 2.4 * sx, 1.4, 0.6, '#0E131B', null, 0);

        // 2. Carroceria curva esculpida do HB20 (teto fluido, ombros marcados) — silhueta em bézier
        const shape = { roofY: -22.5, roofW: 19.4, shY: -7.0, shW: 30.4, midY: 4.5, midW: 33.4, botY: 20.0, botW: 31.4, round: 5.5, arch: 1.5 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -23, 20);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.45;
        c.lineJoin = 'round';
        c.stroke();

        // Lateral contínua Top Gear 1 integrada à carroceria do HB20
        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 31.4 * sx, roofW: 19.4 * sx,
          roofY: -22.5, beltY: -7.0, botY: 20.0, wheelStyle: 'alloy', mirrorColor: body,
          curvedRoof: true
        });

        // Retrovisores fluidos na cor da carroceria com repetidor de seta
        if (turn >= -0.1) {
          CarArt.drawMirror(c, tx - 34.6 * sx, -9.4, 5.2, 3.6, 1.8, body, tx - 29.2 * sx, -7.0, true);
          CarArt.line(c, tx - 34.0 * sx, -8.2, tx - 30.5 * sx, -8.2, '#FEF08A', 0.6);
        }
        if (turn <= 0.1) {
          CarArt.drawMirror(c, tx + 29.4 * sx, -9.4, 5.2, 3.6, 1.8, body, tx + 24.0 * sx, -7.0, false);
          CarArt.line(c, tx + 30.5 * sx, -8.2, tx + 34.0 * sx, -8.2, '#FEF08A', 0.6);
        }

        // Brilho do teto
        c.beginPath();
        c.moveTo(tx - 14.5 * sx, -20.9);
        c.quadraticCurveTo(tx, -22.8, tx + 14.5 * sx, -20.9);
        c.strokeStyle = CarArt.shade(body, 34);
        c.lineWidth = 1.2;
        c.stroke();

        // 3. Aerofólio integrado no teto com brake-light horizontal em LED
        CarArt.roundRect(c, tx - 17.5 * sx, -22.6, 35.0 * sx, 2.2, 1.0, CarArt.shade(body, -16), out, 0.75);
        const blColHB = isBraking ? '#FF2200' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 8.0 * sx, -22.0, 16.0 * sx, 1.1, 0.4, blColHB, null, 0);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -21.4, 4.0, 1.8, true, isNight);
        }

        // 4. Vigia traseira afunilada com desembaçador térmico
        CarArt.glassCurve(c, tx, rx, sx, -19.2, -5.4, 17.8, 25.0, 1.5, 1.3);

        // Filamentos horizontais do desembaçador térmico do HB20
        for (let l = 1; l <= 4; l++) {
          const dy = -17.5 + l * 2.5;
          const w = (18.2 + l * 1.5) * sx;
          CarArt.line(c, rx - w, dy, rx + w, dy, 'rgba(234, 88, 12, 0.45)', 0.65);
        }

        // Limpador aerodinâmico "flat blade" moderno com capa preta
        CarArt.line(c, rx - 0.5, -5.8, rx + 12.8 * sx, -9.8, '#0E131B', 1.6);
        CarArt.line(c, rx + 3.0 * sx, -7.2, rx + 13.2 * sx, -10.0, '#1E293B', 1.0);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx - 0.5, -5.8, 1.5, 0, Math.PI * 2);
        c.fill();

        // 5. Vincos hexagonais "Fluidic Sculpture", Emblema Hyundai e Badges
        // Vinco pronunciado que contorna a tampa e a placa
        c.beginPath();
        c.moveTo(rx - 25.0 * sx, -5.0);
        c.lineTo(rx - 20.0 * sx, 8.5);
        c.lineTo(rx + 20.0 * sx, 8.5);
        c.lineTo(rx + 25.0 * sx, -5.0);
        c.strokeStyle = CarArt.shade(body, -38);
        c.lineWidth = 0.9;
        c.stroke();

        // Emblema oval cromado "H" da Hyundai em relevo 3D
        c.fillStyle = '#CBD5E1';
        c.beginPath();
        c.ellipse(rx, 1.5, 3.8, 2.2, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.8;
        c.stroke();
        c.fillStyle = '#1E293B';
        c.beginPath();
        c.ellipse(rx, 1.5, 2.9, 1.5, 0, 0, Math.PI * 2);
        c.fill();
        // H inclinado característico da Hyundai
        CarArt.line(c, rx - 1.2, 0.3, rx - 1.0, 2.7, '#F8FAFC', 0.95);
        CarArt.line(c, rx + 1.2, 0.3, rx + 1.0, 2.7, '#F8FAFC', 0.95);
        CarArt.line(c, rx - 1.1, 1.5, rx + 1.1, 1.5, '#F8FAFC', 0.9);

        // Badge cromado "HB20" no canto esquerdo
        CarArt.drawEmblemText(c, 'HB20', rx - 18.0 * sx, 7.8, {
          font: 'bold 3.6px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.65
        });

        // Badge de motorização "1.6" no canto direito
        CarArt.drawEmblemText(c, '1.6', rx + 18.0 * sx, 7.8, {
          font: 'bold 2.8px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.55
        });

        // Câmera de ré / botão de abertura embutido acima da placa
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 1.5, 9.2, 3.0, 0.9);

        // 6. Lanternas Traseiras "Bumerangue" / Fluidic Sculpture 3D
        const drawHB20Lamp = (sg) => {
          c.save();
          // Contorno externo bumerangue
          c.beginPath();
          c.moveTo(rx + sg * 33.0 * sx, -4.6);
          c.bezierCurveTo(rx + sg * 27.0 * sx, -5.4, rx + sg * 19.5 * sx, -3.8, rx + sg * 13.8 * sx, -0.6);
          c.bezierCurveTo(rx + sg * 12.8 * sx, 1.4, rx + sg * 14.4 * sx, 3.8, rx + sg * 16.8 * sx, 4.2);
          c.bezierCurveTo(rx + sg * 22.0 * sx, 4.4, rx + sg * 28.0 * sx, 5.0, rx + sg * 32.6 * sx, 6.6);
          c.closePath();
          c.fillStyle = tailRed;
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 1.25;
          c.stroke();

          // Guia de luz em LED neon (tubo brilhante contornando o bumerangue)
          c.beginPath();
          c.moveTo(rx + sg * 31.8 * sx, -3.8);
          c.bezierCurveTo(rx + sg * 26.5 * sx, -4.6, rx + sg * 19.8 * sx, -3.0, rx + sg * 15.0 * sx, 0.0);
          c.bezierCurveTo(rx + sg * 14.2 * sx, 1.2, rx + sg * 15.2 * sx, 2.6, rx + sg * 17.0 * sx, 2.9);
          c.bezierCurveTo(rx + sg * 21.6 * sx, 3.2, rx + sg * 27.2 * sx, 3.8, rx + sg * 31.4 * sx, 5.2);
          c.strokeStyle = isBraking ? '#FFAAA5' : 'rgba(255, 120, 110, 0.85)';
          c.lineWidth = 1.0;
          c.stroke();

          // Lente de ré cristal e pisca âmbar no trecho interno
          c.fillStyle = '#E2E8F0';
          c.beginPath();
          c.moveTo(rx + sg * 16.0 * sx, 0.0);
          c.quadraticCurveTo(rx + sg * 21.0 * sx, -1.8, rx + sg * 25.0 * sx, -2.2);
          c.lineTo(rx + sg * 24.6 * sx, -0.6);
          c.quadraticCurveTo(rx + sg * 20.8 * sx, -0.2, rx + sg * 16.8 * sx, 1.4);
          c.closePath();
          c.fill();

          // Pisca âmbar
          c.fillStyle = '#F59E0B';
          c.fillRect(rx + sg * 21.0 * sx, -1.8, 3.2 * sx, 1.0);

          CarArt.drawTailGlow(c, rx + sg * 23.0 * sx, 0.6, 6.5, 4.0, isBraking, isNight);
          c.restore();
        };
        drawHB20Lamp(-1);
        drawHB20Lamp(1);

        // 7. Para-choque com difusor aerodinâmico esportivo e refletores em "C"
        // Refletores verticais em "C" nas extremidades inferiores do para-choque
        CarArt.roundRect(c, rx - 30.6 * sx, 13.4, 4.6 * sx, 2.4, 0.8, '#991B1B', '#0E131B', 0.6);
        CarArt.line(c, rx - 30.0 * sx, 14.6, rx - 26.6 * sx, 14.6, '#EF4444', 0.6);
        CarArt.roundRect(c, rx + 26.0 * sx, 13.4, 4.6 * sx, 2.4, 0.8, '#991B1B', '#0E131B', 0.6);
        CarArt.line(c, rx + 26.6 * sx, 14.6, rx + 30.0 * sx, 14.6, '#EF4444', 0.6);

        // Difusor inferior preto fosco aerodinâmico
        c.beginPath();
        c.moveTo(rx - 28.0 * sx, 16.8);
        c.quadraticCurveTo(rx, 18.6, rx + 28.0 * sx, 16.8);
        c.lineTo(rx + 25.8 * sx, 20.2);
        c.lineTo(rx - 25.8 * sx, 20.2);
        c.closePath();
        c.fillStyle = '#141822';
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.05;
        c.stroke();
        // Aletas / divisórias do difusor aerodinâmico
        CarArt.line(c, rx - 6.0 * sx, 17.5, rx - 6.0 * sx, 19.8, '#232B3A', 1.0);
        CarArt.line(c, rx + 6.0 * sx, 17.5, rx + 6.0 * sx, 19.8, '#232B3A', 1.0);

        // Nicho da placa Mercosul com luzes de placa LED
        CarArt.box(c, rx - 10.5, 10.2, 21.0, 5.8, '#10141D', '#0B0F16', 0.65);
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.5, 10.0, 2.2, 0.5);
        c.fillRect(rx + 3.3, 10.0, 2.2, 0.5);
        CarArt.drawPlateStraight(c, rx - 9.8, 10.6, 19.6, 5.2);

        // Ponteira esportiva oval cromada à esquerda
        CarArt.drawExhaustPipe(c, rx - 17.5 * sx, 21.0, 2.0);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },
    {
      id: 'opala',
      name: 'OPALA SS 4.100',
      badge: 'MONSTRO 6 CILINDROS',
      desc: 'O lendário 250-S de 6 canecos! Torque bruto, arrancada devastadora e as clássicas 4 lanternas redondas.',
      maxSpeed: 284,
      acceleration: 1.05,
      braking: 0.72,
      handling: 0.70,
      grip: 0.74,
      centrifugalResistance: 0.70,
      primaryColor: '#D87A00',
      roofColor: '#12151B',
      exhaustPipes: [[-19.0, 21.0], [-14.0, 21.0]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // Pneus largos de muscle car com tala esportiva
        CarArt.drawRearTire(c, rx - 34.0 * sx, 12.0, 11.5, 12.5);
        CarArt.drawRearTire(c, rx + 22.5 * sx, 12.0, 11.5, 12.5);

        // Carroceria larga, musculosa e quadris em curva suave (estilo garrafa de coca-cola)
        const opalaBody = [
          [tx - 26.5 * sx, -23.5], [tx + 26.5 * sx, -23.5],
          [rx + 34.8 * sx, -5.5],  [rx + 35.2 * sx, 13.5],
          [rx - 35.2 * sx, 13.5],  [rx - 34.8 * sx, -5.5]
        ];
        CarArt.poly(c, opalaBody, CarArt.bodyGrad(c, body, -24, 14), out, 1.45);

        // Faixas pretas clássicas de corrida do Opala SS descendo pelo teto
        const ssw = 4.2 * sx;
        c.fillStyle = '#11141A';
        c.fillRect(tx - 6.5 * sx, -23.5, ssw, 4.0);
        c.fillRect(tx + 2.5 * sx, -23.5, ssw, 4.0);

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 34.8 * sx, roofW: 26.5 * sx,
          roofY: -23.5, beltY: -5.5, botY: 13.5, wheelStyle: 'alloy', mirrorColor: '#DCE5EE'
        });

        // Retrovisores clássicos cromados nas portas
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 31.0, w: 5.2, h: 3.6, y: -9.5, r: 1.5, color: '#DCE5EE', stemDist: 26.5, stemY: -6.8 });

        // Vidro traseiro com caimento cupê suave e moldura cromada
        CarArt.drawGlassQuad(c, [
          [tx - 23.2 * sx, -20.5], [tx + 23.2 * sx, -20.5],
          [rx + 29.0 * sx, -6.0],  [rx - 29.0 * sx, -6.0]
        ]);
        CarArt.line(c, rx - 28.5 * sx, -6.2, rx + 28.5 * sx, -6.2, '#CBD5E1', 1.0); // Friso cromado sob o vidro

        // Painel traseiro preto fosco característico dos Opalas SS
        CarArt.roundRect(c, rx - 34.2 * sx, -3.2, 68.4 * sx, 12.2, 1.2, '#101318', out, 1.1);
        CarArt.line(c, rx - 33.5 * sx, -2.8, rx + 33.5 * sx, -2.8, '#CBD5E1', 0.8);
        CarArt.line(c, rx - 33.5 * sx, 8.6, rx + 33.5 * sx, 8.6, '#CBD5E1', 0.8);

        // As 4 Lendárias Lanternas Redondas do Opala SS (2 de cada lado com aro cromado duplo e profundidade)
        const lampPositions = [-26.2, -18.2, 18.2, 26.2];
        for (let i = 0; i < lampPositions.length; i++) {
          const lx = rx + lampPositions[i] * sx;
          const ly = 2.8;
          // Aro cromado externo
          c.fillStyle = '#E2E8F0';
          c.beginPath();
          c.arc(lx, ly, 4.2, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 0.8;
          c.stroke();
          // Borda interna preta
          c.fillStyle = '#0F172A';
          c.beginPath();
          c.arc(lx, ly, 3.4, 0, Math.PI * 2);
          c.fill();
          // Lente vermelha rubi estriada com brilho
          c.fillStyle = tailRed;
          c.beginPath();
          c.arc(lx, ly, 2.9, 0, Math.PI * 2);
          c.fill();
          // Ponto de luz interno / reflexo
          c.fillStyle = isBraking ? '#FFE4E6' : 'rgba(255, 255, 255, 0.45)';
          c.beginPath();
          c.arc(lx - 0.7, ly - 0.7, 0.9, 0, Math.PI * 2);
          c.fill();
          CarArt.drawTailGlow(c, lx, ly, 4.5, 4.5, isBraking, isNight);
        }

        // Emblema "SS" clássico central em prata brilhante
        CarArt.drawEmblemText(c, 'SS', rx, 4.6, {
          font: 'bold 5px sans-serif',
          align: 'center',
          fill: '#FFFFFF',
          strokeW: 0.8,
          shadowOffset: 0.6
        });
        CarArt.drawEmblemText(c, '4.100', rx, 7.5, {
          font: 'bold 2.5px sans-serif',
          align: 'center',
          fill: '#F8FAFC',
          strokeW: 0.5,
          shadowOffset: 0.45
        });

        // Para-choque cromado maciço com batentes (garras)
        const chrGrad = c.createLinearGradient(0, 11, 0, 17.5);
        chrGrad.addColorStop(0, '#FFFFFF');
        chrGrad.addColorStop(0.3, '#E2E8F0');
        chrGrad.addColorStop(0.6, '#94A3B8');
        chrGrad.addColorStop(1, '#475569');
        CarArt.roundRect(c, rx - 35.5 * sx, 11.2, 71.0 * sx, 5.8, 2.0, chrGrad, out, 1.35);
        // Garras cromadas verticais
        CarArt.box(c, rx - 16.0 * sx, 10.0, 3.2, 7.4, '#E2E8F0', out, 0.8);
        CarArt.box(c, rx + 12.8 * sx, 10.0, 3.2, 7.4, '#E2E8F0', out, 0.8);

        CarArt.drawPlateStraight(c, rx - 9.0, 12.2, 18.0, 4.6);

        // Duplo escapamento 6 cilindros esportivo cromado na lateral esquerda
        CarArt.drawExhaustPipe(c, rx - 19.0 * sx, 20.8, 2.3);
        CarArt.drawExhaustPipe(c, rx - 14.0 * sx, 20.8, 2.3);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },
    {
      id: 'gol',
      name: 'GOL GTS 1.8S',
      badge: 'O QUADRADO MAIS DESEJADO',
      desc: 'Linhas retas e agressivas, aerofólio envolvente, lanternas fumê frisadas e friso vermelho GTS. O turbo dos anos 90!',
      maxSpeed: 270,
      acceleration: 0.94,
      braking: 0.86,
      handling: 0.86,
      grip: 0.86,
      centrifugalResistance: 0.85,
      primaryColor: '#96121B',
      roofColor: '#171B22',
      exhaustPipes: [[-18.0, 21.0]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        CarArt.drawRearTire(c, rx - 31.8 * sx, 12.5, 9.8, 11.5);
        CarArt.drawRearTire(c, rx + 22.0 * sx, 12.5, 9.8, 11.5);

        // Carroceria clássica "Gol Quadrado" com ângulos retos e vincos marcantes
        const golBody = [
          [tx - 24.0 * sx, -23.5], [tx + 24.0 * sx, -23.5],
          [rx + 32.0 * sx, -6.0],  [rx + 32.6 * sx, 13.8],
          [rx - 32.6 * sx, 13.8],  [rx - 32.0 * sx, -6.0]
        ];
        CarArt.poly(c, golBody, CarArt.bodyGrad(c, body, -24, 14), out, 1.45);

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 32.0 * sx, roofW: 24.0 * sx,
          roofY: -23.5, beltY: -6.0, botY: 13.8, wheelStyle: 'alloy', mirrorColor: '#1A202C'
        });

        // Retrovisores esportivos quadrados pretos do Gol GTS
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 28.5, w: 5.2, h: 3.6, y: -9.4, r: 1.0, color: '#141820', stemDist: 24.0, stemY: -6.8 });

        // Aerofólio de borracha preto envolvente icônico do Gol GTS (cobre topo e laterais da vigia)
        CarArt.roundRect(c, rx - 29.5 * sx, -8.6, 59.0 * sx, 3.8, 1.4, '#141820', out, 1.2);
        // Descidas laterais do aerofólio na coluna
        CarArt.poly(c, [
          [rx - 29.5 * sx, -8.6], [rx - 27.0 * sx, -8.6],
          [rx - 27.5 * sx, -4.5], [rx - 30.0 * sx, -4.5]
        ], '#141820', out, 0.9);
        CarArt.poly(c, [
          [rx + 27.0 * sx, -8.6], [rx + 29.5 * sx, -8.6],
          [rx + 30.0 * sx, -4.5], [rx + 27.5 * sx, -4.5]
        ], '#141820', out, 0.9);

        // Vidro traseiro com limpador e desembaçador térmico vermelho/laranja
        CarArt.drawGlassQuad(c, [
          [tx - 21.2 * sx, -21.0], [tx + 21.2 * sx, -21.0],
          [rx + 26.8 * sx, -7.5],  [rx - 26.8 * sx, -7.5]
        ]);
        // Linhas horizontais do desembaçador traseiro
        for (let l = 1; l <= 3; l++) {
          CarArt.line(c, rx - 24.0 * sx, -18.0 + l * 2.8, rx + 24.0 * sx, -18.0 + l * 2.8, 'rgba(239, 68, 68, 0.55)', 0.6);
        }
        // Limpador traseiro preto inclinado
        CarArt.line(c, rx - 2.0, -8.0, rx + 12.0 * sx, -12.5, '#0F172A', 1.5);

        // Plástico preto texturizado entre as lanternas (marca registrada da linha quadrada GTS/GTi)
        CarArt.roundRect(c, rx - 23.5 * sx, 0.2, 47.0 * sx, 8.5, 0.8, '#131822', out, 1.0);

        // Logo VW cromado e letreiro GTS 1.8S
        c.fillStyle = '#CBD5E1';
        c.beginPath();
        c.arc(rx, 4.2, 2.6, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.6;
        c.stroke();
        c.fillStyle = '#131822';
        c.beginPath();
        c.arc(rx, 4.2, 1.8, 0, Math.PI * 2);
        c.fill();
        CarArt.line(c, rx - 0.9, 4.8, rx + 0.9, 3.6, '#CBD5E1', 0.8);

        // Letreiro GTS em vermelho esportivo
        CarArt.drawEmblemText(c, 'GTS', rx + 6.0 * sx, 6.0, {
          font: 'bold 4.5px sans-serif',
          align: 'left',
          fill: '#EF4444',
          stroke: '#450A0A',
          strokeW: 0.7,
          shadowOffset: 0.55
        });
        CarArt.drawEmblemText(c, '1.8S', rx + 15.5 * sx, 6.0, {
          font: 'bold 2.5px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.5,
          shadowOffset: 0.45
        });

        // Lanternas horizontais largas frisadas fumê (estilo clássico VW dos anos 90)
        const drawGolLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -32.2 * sx;
          CarArt.roundRect(c, lx, 0.2, 10.2 * sx, 8.5, 1.0, tailRed, out, 1.0);
          // Pisca âmbar
          c.fillStyle = '#D97706';
          c.fillRect(lx + 0.8 * sx, 1.0, 3.4 * sx, 2.8);
          // Luz de ré branca
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 4.6 * sx, 5.0, 4.4 * sx, 2.6);
          // Frisos horizontais pretos característicos do GTS
          for (let f = 1; f <= 3; f++) {
            CarArt.line(c, lx, 0.2 + f * 2.1, lx + 10.2 * sx, 0.2 + f * 2.1, '#0F131A', 0.9);
          }
          CarArt.drawTailGlow(c, lx + 5.1 * sx, 4.4, 5.2, 4.2, isBraking, isNight);
          c.restore();
        };
        drawGolLamp(true);
        drawGolLamp(false);

        // Para-choque largo envolvente cinza chumbo com o lendário FRISO VERMELHO contínuo do GTS
        const bmp = c.createLinearGradient(0, 11, 0, 19.5);
        bmp.addColorStop(0, '#2C3440');
        bmp.addColorStop(0.5, '#1E242C');
        bmp.addColorStop(1, '#11151B');
        CarArt.roundRect(c, rx - 33.5 * sx, 11.2, 67.0 * sx, 8.8, 1.8, bmp, out, 1.35);
        // Friso vermelho do GTS
        CarArt.line(c, rx - 32.0 * sx, 13.0, rx + 32.0 * sx, 13.0, '#EF4444', 1.2);

        CarArt.drawPlateStraight(c, rx - 9.5, 13.6, 19.0, 5.0);
        // Ponteira esportiva oval de inox chanfrada
        CarArt.drawExhaustPipe(c, rx - 18.0 * sx, 21.0, 2.2);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },
    {
      id: 'chevette',
      name: 'CHEVETTE TUBARÃO',
      badge: 'REI DO DRIFT TRAÇÃO TRASEIRA',
      desc: 'Frente em cunha e tração traseira ágil! Especialista em entrar nas curvas escorregando e acelerar com precisão.',
      maxSpeed: 250,
      acceleration: 0.82,
      braking: 0.82,
      handling: 0.96,
      grip: 0.92,
      centrifugalResistance: 0.90,
      primaryColor: '#1F5B9E',
      roofColor: '#131A26',
      exhaustPipes: [[-16.5, 21.2]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, diferencial de tração traseira do Chevette e pneus
        c.fillStyle = '#0B0E14';
        c.fillRect(rx - 30.5 * sx, 17.6, 9.0 * sx, 4.2);
        c.fillRect(rx + 21.5 * sx, 17.6, 9.0 * sx, 4.2);

        // Eixo traseiro rígido e "bola" do diferencial central (marca registrada da tração traseira do Tubarão!)
        CarArt.line(c, rx - 16.0 * sx, 19.8, rx + 16.0 * sx, 19.8, '#333D4B', 1.8);
        CarArt.roundRect(c, rx - 4.2 * sx, 18.0, 8.4 * sx, 4.4, 2.0, '#1E2530', out, 0.8);
        CarArt.line(c, rx - 2.5 * sx, 20.0, rx + 2.5 * sx, 20.0, '#475569', 0.6);

        CarArt.drawRearTire(c, rx - 31.0 * sx, 12.8, 9.2, 11.5);
        CarArt.drawRearTire(c, rx + 21.8 * sx, 12.8, 9.2, 11.5);

        // 2. Carroceria sedã compacta com caimento fastback curvo e ombros arredondados do Tubarão
        const chevetteBody = [
          [tx - 22.8 * sx, -23.2], [tx + 22.8 * sx, -23.2],
          [rx + 30.8 * sx, -5.5],  [rx + 31.4 * sx, 13.8],
          [rx - 31.4 * sx, 13.8],  [rx - 30.8 * sx, -5.5]
        ];
        CarArt.poly(c, chevetteBody, CarArt.bodyGrad(c, body, -24, 14), out, 1.45);

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 30.8 * sx, roofW: 22.8 * sx,
          roofY: -23.2, beltY: -5.5, botY: 13.8, wheelStyle: 'steel', mirrorColor: '#DCE5EE'
        });

        // Retrovisores clássicos redondos/retangulares cromados do Chevette
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 28.0, w: 5.0, h: 3.4, y: -9.5, r: 1.0, color: '#DCE5EE', stemDist: 23.5, stemY: -6.8 });

        // 3. Vidro traseiro com moldura de borracha e friso cromado contínuo
        CarArt.poly(c, [
          [tx - 21.2 * sx, -21.4], [tx + 21.2 * sx, -21.4],
          [rx + 26.8 * sx, -6.0],  [rx - 26.8 * sx, -6.0]
        ], '#12161F', out, 1.15);

        CarArt.drawGlassQuad(c, [
          [tx - 20.0 * sx, -20.6], [tx + 20.0 * sx, -20.6],
          [rx + 25.8 * sx, -6.8],  [rx - 25.8 * sx, -6.8]
        ]);
        // Friso cromado de acabamento no vidro
        CarArt.line(c, rx - 25.4 * sx, -6.6, rx + 25.4 * sx, -6.6, '#E2E8F0', 0.85);

        // Filamentos sutis do desembaçador térmico
        for (let l = 1; l <= 3; l++) {
          const dy = -18.0 + l * 3.2;
          const leftX = tx - 18.0 * sx + (rx - tx - 5.0 * sx) * (l / 3);
          const rightX = tx + 18.0 * sx + (rx - tx + 5.0 * sx) * (l / 3);
          CarArt.line(c, leftX, dy, rightX, dy, 'rgba(234, 88, 12, 0.42)', 0.6);
        }

        // 4. Tampa do Porta-Malas: Vinco dorsal em cunha (crista do Tubarão), frisos e emblemas
        // Vinco dorsal central clássico do Chevette Tubarão
        CarArt.line(c, rx, -5.5, rx, 4.0, CarArt.shade(body, 36), 1.3);
        CarArt.line(c, rx - 0.4, -5.5, rx - 0.4, 4.0, CarArt.shade(body, -26), 0.7);

        // Friso cromado de cintura contornando as laterais e traseira
        CarArt.line(c, rx - 29.0 * sx, -4.6, rx + 29.0 * sx, -4.6, '#E2E8F0', 1.0);
        CarArt.line(c, rx - 29.0 * sx, -4.0, rx + 29.0 * sx, -4.0, '#475569', 0.5);

        // Fresta / contorno da tampa do porta-malas
        c.strokeStyle = CarArt.shade(body, -40);
        c.lineWidth = 0.9;
        c.strokeRect(rx - 23.5 * sx, -4.8, 47.0 * sx, 15.6);

        // Emblema clássico quadrado azul da GM no centro da tampa
        c.fillStyle = '#1D4ED8';
        c.fillRect(rx - 2.2, 1.2, 4.4, 3.4);
        c.strokeStyle = '#FFFFFF';
        c.lineWidth = 0.7;
        c.strokeRect(rx - 2.2, 1.2, 4.4, 3.4);
        CarArt.line(c, rx, 1.5, rx, 4.3, '#CBD5E1', 0.5);

        // Letreiro cromado "CHEVETTE" em relevo na direita
        CarArt.drawEmblemText(c, 'CHEVETTE', rx + 21.5 * sx, 4.8, {
          font: 'bold 3.2px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Fechadura redonda cromada da tampa com miolo de chave
        c.fillStyle = '#CBD5E1';
        c.beginPath();
        c.arc(rx, 6.8, 1.1, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 0.3, 6.4, 0.6, 0.8);

        // 5. Lanternas quadradas salientes do Tubarão (1973-1977) com aro cromado duplo
        const drawChevetteLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -29.5 * sx;

          // Aro cromado externo duplo em relevo
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx - 0.9 * sx, -0.8, 8.4 * sx, 9.6);
          c.strokeStyle = out;
          c.lineWidth = 0.85;
          c.strokeRect(lx - 0.9 * sx, -0.8, 8.4 * sx, 9.6);

          // Borda interna escura
          c.fillStyle = '#111827';
          c.fillRect(lx - 0.3 * sx, -0.2, 7.2 * sx, 8.4);

          // Luz de freio / posição vermelha rubi (topo) com estrias horizontais
          c.fillStyle = tailRed;
          c.fillRect(lx, 0.2, 6.6 * sx, 3.8);
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.35)';
          c.fillRect(lx + 0.4 * sx, 0.5, 5.8 * sx, 0.9);
          CarArt.line(c, lx, 1.6, lx + 6.6 * sx, 1.6, '#58080C', 0.55);
          CarArt.line(c, lx, 2.7, lx + 6.6 * sx, 2.7, '#58080C', 0.55);

          // Divisória cromada entre as lentes
          CarArt.line(c, lx - 0.5 * sx, 4.1, lx + 6.9 * sx, 4.1, '#CBD5E1', 0.7);

          // Pisca âmbar (base) com frisos
          c.fillStyle = '#D97706';
          c.fillRect(lx, 4.4, 6.6 * sx, 3.4);
          c.fillStyle = '#F59E0B';
          c.fillRect(lx + 0.4 * sx, 4.7, 5.8 * sx, 0.9);
          CarArt.line(c, lx, 5.8, lx + 6.6 * sx, 5.8, '#92400E', 0.55);

          CarArt.drawTailGlow(c, lx + 3.3 * sx, 2.4, 4.8, 4.2, isBraking, isNight);
          c.restore();
        };
        drawChevetteLamp(true);
        drawChevetteLamp(false);

        // 6. Para-choque clássico de lâmina cromada com batentes pretos e luz de placa
        const chrGrad = c.createLinearGradient(0, 11.0, 0, 16.8);
        chrGrad.addColorStop(0, '#FFFFFF');
        chrGrad.addColorStop(0.35, '#E2E8F0');
        chrGrad.addColorStop(0.7, '#94A3B8');
        chrGrad.addColorStop(1, '#475569');
        CarArt.roundRect(c, rx - 32.5 * sx, 11.4, 65.0 * sx, 5.4, 1.6, chrGrad, out, 1.3);
        // Friso central de borracha preta
        CarArt.line(c, rx - 31.0 * sx, 14.1, rx + 31.0 * sx, 14.1, '#151A22', 0.9);

        // Os dois batentes pretos verticais clássicos da GM dos anos 70
        CarArt.box(c, rx - 18.2 * sx, 10.4, 3.6 * sx, 7.4, '#151A22', out, 0.9);
        CarArt.line(c, rx - 16.4 * sx, 11.0, rx - 16.4 * sx, 17.0, '#334155', 0.6);
        CarArt.box(c, rx + 14.6 * sx, 10.4, 3.6 * sx, 7.4, '#151A22', out, 0.9);
        CarArt.line(c, rx + 16.4 * sx, 11.0, rx + 16.4 * sx, 17.0, '#334155', 0.6);

        // Concha cromada da luz de placa central
        CarArt.roundRect(c, rx - 3.8 * sx, 9.8, 7.6 * sx, 2.0, 0.8, '#F1F5F9', out, 0.65);
        c.fillStyle = '#FEF08A';
        c.fillRect(rx - 2.0 * sx, 11.5, 4.0 * sx, 0.5);

        CarArt.drawPlateStraight(c, rx - 9.0, 12.0, 18.0, 4.8);
        CarArt.drawExhaustPipe(c, rx - 16.5 * sx, 20.8, 1.9);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },
    {
      id: 'brasilia',
      name: 'BRASÍLIA AMARELA',
      badge: 'O ÍCONE IRREVERENTE',
      desc: 'Espaçosa, motor boxer com dupla carburação e muita história! Estabilidade impressionante em retas e curvas abertas.',
      maxSpeed: 232,
      acceleration: 0.70,
      braking: 0.80,
      handling: 0.89,
      grip: 0.92,
      centrifugalResistance: 0.92,
      primaryColor: '#F5BE00',
      roofColor: '#2B2610',
      exhaustPipes: [[-7.5, 21.5], [7.5, 21.5]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, cárter do Boxer e pneus com calotas
        c.fillStyle = '#0B0E14';
        c.fillRect(rx - 31.0 * sx, 17.6, 9.0 * sx, 4.2);
        c.fillRect(rx + 22.0 * sx, 17.6, 9.0 * sx, 4.2);

        // Bloco/cárter inferior do motor Boxer refrigerado a ar sob o para-choque
        CarArt.roundRect(c, rx - 10.0 * sx, 18.2, 20.0 * sx, 3.4, 1.2, '#2C333E', out, 0.8);
        CarArt.line(c, rx - 7.5 * sx, 19.8, rx + 7.5 * sx, 19.8, '#475569', 0.6);

        CarArt.drawRearTire(c, rx - 31.5 * sx, 12.8, 9.4, 11.5);
        CarArt.drawRearTire(c, rx + 22.0 * sx, 12.8, 9.4, 11.5);

        // 2. Carroceria ampla, teto amplo quase plano e colunas C marcantes da Brasília
        const brBody = [
          [tx - 25.2 * sx, -23.5], [tx + 25.2 * sx, -23.5],
          [rx + 32.5 * sx, -6.0],  [rx + 33.0 * sx, 14.0],
          [rx - 33.0 * sx, 14.0],  [rx - 32.5 * sx, -6.0]
        ];
        CarArt.poly(c, brBody, CarArt.bodyGrad(c, body, -24, 14), out, 1.45);

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 32.5 * sx, roofW: 25.2 * sx,
          roofY: -23.5, beltY: -6.0, botY: 14.0, wheelStyle: 'hubcap', mirrorColor: '#DCE5EE'
        });

        // Retrovisores clássicos redondos/retangulares cromados da Brasília
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 28.5, w: 5.2, h: 3.6, y: -9.5, r: 1.0, color: '#DCE5EE', stemDist: 24.5, stemY: -6.8 });

        // 3. AS FAMOSAS GUELRAS / ALETAS DE ARREFECIMENTO NAS COLUNAS TRASEIRAS (Ícone da Brasília!)
        const drawGills = (gx, isLeft) => {
          for (let g = 0; g < 4; g++) {
            const gy = -18.8 + g * 3.2;
            // Fenda profunda da aleta
            CarArt.line(c, gx, gy, gx + (isLeft ? 5.2 : -5.2) * sx, gy, '#0F141C', 1.6);
            // Friso metálico cromado superior da aleta
            CarArt.line(c, gx, gy - 0.5, gx + (isLeft ? 4.8 : -4.8) * sx, gy - 0.5, '#CBD5E1', 0.65);
          }
        };
        drawGills(tx - 24.2 * sx, true);
        drawGills(tx + 24.2 * sx, false);

        // 4. Vidro traseiro panorâmico gigante "Aquário" com borracha preta e friso cromado
        CarArt.poly(c, [
          [tx - 23.6 * sx, -21.4], [tx + 23.6 * sx, -21.4],
          [rx + 29.0 * sx, -6.0],  [rx - 29.0 * sx, -6.0]
        ], '#12161F', out, 1.2);

        CarArt.drawGlassQuad(c, [
          [tx - 22.5 * sx, -20.8], [tx + 22.5 * sx, -20.8],
          [rx + 28.0 * sx, -6.8],  [rx - 28.0 * sx, -6.8]
        ]);
        // Friso cromado inserido na borracha do vidro
        CarArt.line(c, rx - 27.6 * sx, -7.0, rx + 27.6 * sx, -7.0, '#E2E8F0', 0.95);

        // Desembaçador térmico com filamentos horizontais
        for (let l = 1; l <= 3; l++) {
          const dy = -18.2 + l * 3.2;
          const leftX = tx - 20.0 * sx + (rx - tx - 6.0 * sx) * (l / 3);
          const rightX = tx + 20.0 * sx + (rx - tx + 6.0 * sx) * (l / 3);
          CarArt.line(c, leftX, dy, rightX, dy, 'rgba(234, 88, 12, 0.42)', 0.6);
        }

        // 5. Venezianas horizontais de resfriamento do motor Boxer abaixo do vidro
        c.fillStyle = '#111620';
        c.fillRect(rx - 19.0 * sx, -5.2, 38.0 * sx, 4.0);
        c.strokeStyle = out;
        c.lineWidth = 0.75;
        c.strokeRect(rx - 19.0 * sx, -5.2, 38.0 * sx, 4.0);
        for (let a = -16; a <= 16; a += 3.2) {
          CarArt.line(c, rx + a * sx, -4.6, rx + a * sx, -1.8, '#0B0F15', 1.3);
          CarArt.line(c, rx + a * sx + 0.4, -4.6, rx + a * sx + 0.4, -1.8, '#475569', 0.5);
        }

        // Fresta / contorno da tampa do motor
        c.strokeStyle = CarArt.shade(body, -42);
        c.lineWidth = 0.9;
        c.strokeRect(rx - 24.0 * sx, -5.4, 48.0 * sx, 15.6);

        // Emblema clássico redondo cromado VW no centro
        c.fillStyle = '#E2E8F0';
        c.beginPath();
        c.arc(rx, 2.0, 3.0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.75;
        c.stroke();
        c.fillStyle = '#1E3A8A';
        c.beginPath();
        c.arc(rx, 2.0, 2.2, 0, Math.PI * 2);
        c.fill();
        CarArt.line(c, rx - 1.0, 1.2, rx, 3.0, '#F8FAFC', 0.7);
        CarArt.line(c, rx + 1.0, 1.2, rx, 3.0, '#F8FAFC', 0.7);

        // Letreiro cromado em itálico "Brasilia" na tampa direita
        CarArt.drawEmblemText(c, 'Brasilia', rx + 18.2 * sx, 4.8, {
          font: 'italic bold 3.4px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Maçaneta giratória cromada da tampa com fechadura
        CarArt.roundRect(c, rx - 2.0 * sx, 6.2, 4.0 * sx, 1.6, 0.6, '#E2E8F0', out, 0.65);
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 0.3, 6.6, 0.6, 0.8);

        // 6. Lanternas horizontais frisadas bicolores (estrias marcantes clássicas da Brasília)
        const drawBrasiliaLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -32.5 * sx;
          const lw = 10.4 * sx;
          const ly = 0.4;
          const lh = 8.8;

          // Moldura externa preta com borda cromada
          CarArt.roundRect(c, lx - 0.6, ly - 0.4, lw + 1.2, lh + 0.8, 1.2, '#11151D', out, 1.0);

          // Base da lanterna
          CarArt.roundRect(c, lx, ly, lw, lh, 1.0, tailRed, '#1A212B', 0.8);

          // Pisca âmbar no topo com estrias
          c.fillStyle = '#D97706';
          c.fillRect(lx + 0.6 * sx, ly + 0.6, lw - 1.2 * sx, 3.4);
          c.fillStyle = '#F59E0B';
          c.fillRect(lx + 0.8 * sx, ly + 0.8, lw - 1.6 * sx, 1.2);

          // Friso preto divisor entre câmaras
          CarArt.line(c, lx, ly + 4.1, lx + lw, ly + 4.1, '#0B0F15', 0.9);

          // Estrias horizontais em relevo por toda a lanterna (marca registrada da Brasília!)
          for (let f = 1; f <= 3; f++) {
            CarArt.line(c, lx + 0.6 * sx, ly + f * 2.1, lx + lw - 0.6 * sx, ly + f * 2.1, '#11151D', 0.75);
          }

          CarArt.drawTailGlow(c, lx + 5.2 * sx, ly + 4.4, 5.2, 4.4, isBraking, isNight);
          c.restore();
        };
        drawBrasiliaLamp(true);
        drawBrasiliaLamp(false);

        // 7. Para-choque clássico cromado com borrachão preto grosso contínuo
        const chrGrad = c.createLinearGradient(0, 11, 0, 16.8);
        chrGrad.addColorStop(0, '#FFFFFF');
        chrGrad.addColorStop(0.4, '#CBD5E1');
        chrGrad.addColorStop(0.7, '#94A3B8');
        chrGrad.addColorStop(1, '#64748B');
        CarArt.roundRect(c, rx - 33.2 * sx, 11.2, 66.4 * sx, 5.8, 1.6, chrGrad, out, 1.35);

        // Borrachão preto central contínuo grosso
        CarArt.line(c, rx - 31.8 * sx, 14.1, rx + 31.8 * sx, 14.1, '#1A202C', 1.8);
        CarArt.line(c, rx - 31.8 * sx, 14.1, rx + 31.8 * sx, 14.1, '#0B0F15', 0.9);

        // Luzes de placa duplas e placa Mercosul
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.5, 10.6, 2.2, 0.6);
        c.fillRect(rx + 3.3, 10.6, 2.2, 0.6);
        CarArt.drawPlateStraight(c, rx - 9.0, 12.0, 18.0, 4.8);

        // Duplo escapamento clássico simétrico do motor Boxer VW
        CarArt.drawExhaustPipe(c, rx - 7.5 * sx, 21.0, 1.85);
        CarArt.drawExhaustPipe(c, rx + 7.5 * sx, 21.0, 1.85);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 9. CORSA WIND (O clássico Corsa Bolinha)
    {
      id: 'corsa',
      name: 'CORSA WIND',
      badge: 'O CLÁSSICO BOLINHA DOS ANOS 90',
      desc: 'O inconfundível Corsa Wind! Design orgânico arredondado, super ágil, econômico e surpreendente nas retomadas.',
      maxSpeed: 254,
      acceleration: 0.77,
      braking: 0.86,
      handling: 0.88,
      grip: 0.87,
      centrifugalResistance: 0.86,
      primaryColor: '#1E63C9',
      roofColor: '#1A233A',
      exhaustPipes: [[-18.0, 21.0]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi e pneus
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 30.5 * sx, 17.6, 9.0 * sx, 4.2);
        c.fillRect(rx + 21.5 * sx, 17.6, 9.0 * sx, 4.2);

        // Bojo do escapamento transversal sob o assoalho
        CarArt.roundRect(c, rx - 24.0 * sx, 18.2, 18.0 * sx, 3.4, 1.4, '#333D4B', out, 0.85);

        CarArt.drawRearTire(c, rx - 31.0 * sx, 13, 9.6, 11.2);
        CarArt.drawRearTire(c, rx + 21.5 * sx, 13, 9.6, 11.2);

        // 2. Carroceria orgânica arredondada "Bolinha" com curvas suaves características
        const shape = { roofY: -22.5, roofW: 19.8, shY: -6.5, shW: 30.8, midY: 5.0, midW: 32.8, botY: 20.0, botW: 31.0, round: 6.0, arch: 1.4 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -23, 20);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.4;
        c.stroke();

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 31.0 * sx, roofW: 19.8 * sx,
          roofY: -22.5, beltY: -6.5, botY: 20.0, wheelStyle: 'steel', mirrorColor: '#1C212A', curvedRoof: true
        });

        // Retrovisores aerodinâmicos orgânicos do Corsa Bolinha
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 28.5, w: 5.0, h: 3.5, y: -9.5, r: 1.8, color: '#1C212A', stemDist: 24.5, stemY: -6.8 });

        // 3. Vidro traseiro curvo com guarnição de borracha e desembaçador térmico
        CarArt.glassCurve(c, tx, rx, sx, -19.2, -5.2, 17.0, 24.8, 2.0, 2.0);

        // Filamentos curvos do desembaçador térmico
        for (let l = 1; l <= 4; l++) {
          const dy = -17.5 + l * 2.6;
          const w = (17.5 + l * 1.5) * sx;
          CarArt.line(c, rx - w, dy, rx + w, dy, 'rgba(234, 88, 12, 0.45)', 0.65);
        }

        // Brake-light central no topo da vigia traseira
        const blColCorsa = isBraking ? '#FF1E10' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 5.5 * sx, -20.6, 11.0 * sx, 1.6, 0.6, blColCorsa, '#141820', 0.55);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -19.8, 3.6, 1.8, true, isNight);
        }

        // Limpador traseiro curvo preto com pivô
        CarArt.line(c, rx - 1.0, -5.8, rx + 12.0 * sx, -11.0, '#0E131B', 1.5);
        CarArt.line(c, rx + 3.0 * sx, -7.4, rx + 12.4 * sx, -11.2, '#1E293B', 0.95);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx - 1.0, -5.8, 1.5, 0, Math.PI * 2);
        c.fill();

        // 4. Tampa do Porta-Malas: Letreiros, Maçaneta e Emblema Dourado GM
        // Vinco sutil contornando a tampa
        c.beginPath();
        c.moveTo(rx - 23.5 * sx, -4.5);
        c.quadraticCurveTo(rx, -3.2, rx + 23.5 * sx, -4.5);
        c.strokeStyle = CarArt.shade(body, -38);
        c.lineWidth = 0.9;
        c.stroke();

        // Emblema clássico Chevrolet com gravata dourada e anel cromado
        c.fillStyle = '#E2E8F0';
        c.beginPath();
        c.arc(rx, 2.8, 2.8, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.7;
        c.stroke();
        c.fillStyle = '#EAB308';
        c.fillRect(rx - 1.8, 2.0, 3.6, 1.6);
        c.strokeStyle = '#CA8A04';
        c.lineWidth = 0.4;
        c.strokeRect(rx - 1.8, 2.0, 3.6, 1.6);

        // Letreiro clássico "CORSA" à esquerda
        CarArt.drawEmblemText(c, 'CORSA', rx - 20.0 * sx, 4.2, {
          font: 'bold 3.2px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Letreiro clássico itálico "Wind" à direita
        CarArt.drawEmblemText(c, 'Wind', rx + 20.0 * sx, 4.2, {
          font: 'italic bold 3.0px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Maçaneta oval preta com miolo de chave
        CarArt.roundRect(c, rx - 3.0 * sx, 6.8, 6.0 * sx, 2.2, 0.8, '#141822', out, 0.65);
        c.fillStyle = '#CBD5E1';
        c.beginPath();
        c.arc(rx + 1.2 * sx, 7.9, 0.65, 0, Math.PI * 2);
        c.fill();

        // 5. Lanternas Traseiras Arredondadas do Corsa Bolinha
        const drawCorsaLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -30.6 * sx;

          // Moldura preta arredondada
          c.beginPath();
          c.moveTo(lx, -4.6);
          c.quadraticCurveTo(lx - 2.8 * sx, 2.5, lx, 8.8);
          c.lineTo(lx + 7.8 * sx, 8.8);
          c.quadraticCurveTo(lx + 6.4 * sx, 2.5, lx + 6.4 * sx, -4.6);
          c.closePath();
          c.fillStyle = '#11151D';
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 1.1;
          c.stroke();

          // Lente vermelha superior de posição e freio
          c.fillStyle = tailRed;
          c.beginPath();
          c.moveTo(lx + 0.6 * sx, -4.0);
          c.quadraticCurveTo(lx - 1.8 * sx, 1.0, lx + 0.6 * sx, 1.8);
          c.lineTo(lx + 5.8 * sx, 1.8);
          c.lineTo(lx + 5.8 * sx, -4.0);
          c.closePath();
          c.fill();
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.3)';
          c.fillRect(lx + 0.8 * sx, -3.2, 4.8 * sx, 0.9);

          // Pisca âmbar intermediário
          c.fillStyle = '#D97706';
          c.fillRect(lx + 0.6 * sx, 2.2, 5.2 * sx, 2.8);
          c.fillStyle = '#F59E0B';
          c.fillRect(lx + 0.8 * sx, 2.4, 4.8 * sx, 0.8);
          CarArt.line(c, lx + 0.6 * sx, 3.6, lx + 5.8 * sx, 3.6, '#92400E', 0.5);

          // Divisória preta
          CarArt.line(c, lx + 0.6 * sx, 5.2, lx + 5.8 * sx, 5.2, '#0B0F15', 0.8);

          // Ré cristal inferior com catadióptrico rubi
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 0.6 * sx, 5.4, 5.2 * sx, 2.8);
          c.fillStyle = '#FFFFFF';
          c.fillRect(lx + 0.8 * sx, 5.6, 4.8 * sx, 0.8);

          CarArt.drawTailGlow(c, lx + 3.5 * sx, 1.0, 4.8, 4.8, isBraking, isNight);
          c.restore();
        };
        drawCorsaLamp(true);
        drawCorsaLamp(false);

        // 6. Para-choque texturizado cinza escuro clássico do Corsa Wind
        const bmp = c.createLinearGradient(0, 10.5, 0, 20.0);
        bmp.addColorStop(0, '#2C323D');
        bmp.addColorStop(0.4, '#1E232B');
        bmp.addColorStop(1, '#11151B');
        CarArt.roundRect(c, rx - 32.5 * sx, 11.0, 65.0 * sx, 9.0, 2.0, bmp, out, 1.3);

        // Luzes de placa duplas no nicho
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.2, 12.4, 2.2, 0.6);
        c.fillRect(rx + 3.0, 12.4, 2.2, 0.6);

        CarArt.drawPlateStraight(c, rx - 9.2, 13.2, 18.4, 5.0);
        CarArt.drawExhaustPipe(c, rx - 18.0 * sx, 20.8, 1.9);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 10. CELTA (Popular ágil e direto da Chevrolet)
    {
      id: 'celta',
      name: 'CELTA',
      badge: 'LEVE & DIRETO - PURA AGILIDADE',
      desc: 'O popular da GM! Peso pluma, respostas rápidas de direção e estabilidade firme para devorar curvas.',
      maxSpeed: 258,
      acceleration: 0.80,
      braking: 0.85,
      handling: 0.89,
      grip: 0.88,
      centrifugalResistance: 0.88,
      primaryColor: '#D1232B',
      roofColor: '#20181A',
      exhaustPipes: [[-18.2, 21.0]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi e pneus
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 31.0 * sx, 17.6, 9.0 * sx, 4.2);
        c.fillRect(rx + 21.8 * sx, 17.6, 9.0 * sx, 4.2);

        CarArt.drawRearTire(c, rx - 31.2 * sx, 13, 9.6, 11.2);
        CarArt.drawRearTire(c, rx + 21.6 * sx, 13, 9.6, 11.2);

        // 2. Carroceria hatch compacta leve
        const rearBody = [
          [tx - 24.0 * sx, -23.0], [tx + 24.0 * sx, -23.0],
          [rx + 31.5 * sx, -6.0],  [rx + 32.2 * sx, 13.5],
          [rx - 32.2 * sx, 13.5],  [rx - 31.5 * sx, -6.0]
        ];
        CarArt.poly(c, rearBody, CarArt.bodyGrad(c, body, -23, 14), out, 1.4);

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 31.5 * sx, roofW: 24.0 * sx,
          roofY: -23.0, beltY: -6.0, botY: 13.5, wheelStyle: 'steel', mirrorColor: '#1A1E26'
        });

        // Retrovisores compactos pretos do Celta
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 28.5, w: 5.0, h: 3.5, y: -9.5, r: 1.2, color: '#1A1E26', stemDist: 24.5, stemY: -6.8 });

        // 3. Vidro traseiro com borracha preta, desembaçador térmico e limpador
        CarArt.poly(c, [
          [tx - 22.4 * sx, -21.0], [tx + 22.4 * sx, -21.0],
          [rx + 27.2 * sx, -5.5],  [rx - 27.2 * sx, -5.5]
        ], '#12161F', out, 1.2);

        CarArt.drawGlassQuad(c, [
          [tx - 21.2 * sx, -20.2], [tx + 21.2 * sx, -20.2],
          [rx + 26.2 * sx, -6.2],  [rx - 26.2 * sx, -6.2]
        ]);

        // Filamentos horizontais do desembaçador térmico
        for (let l = 1; l <= 4; l++) {
          const dy = -18.5 + l * 2.8;
          const leftX = tx - 19.0 * sx + (rx - tx - 5.0 * sx) * (l / 4);
          const rightX = tx + 19.0 * sx + (rx - tx + 5.0 * sx) * (l / 4);
          CarArt.line(c, leftX, dy, rightX, dy, 'rgba(234, 88, 12, 0.45)', 0.65);
        }

        // Brake-light central no topo do vidro
        const blColCelta = isBraking ? '#FF1E10' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 6.0 * sx, -20.0, 12.0 * sx, 1.6, 0.6, blColCelta, '#141820', 0.55);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -19.2, 3.5, 1.8, true, isNight);
        }

        // Limpador traseiro articulado com base giratória
        CarArt.line(c, rx - 1.2, -6.8, rx + 11.5 * sx, -12.0, '#0E131B', 1.5);
        CarArt.line(c, rx + 3.5 * sx, -8.6, rx + 12.0 * sx, -12.2, '#1E293B', 0.95);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx - 1.2, -6.8, 1.5, 0, Math.PI * 2);
        c.fill();

        // 4. Tampa do Porta-Malas: Vinco horizontal, emblemas e fechadura
        CarArt.line(c, rx - 21.0 * sx, 3.5, rx + 21.0 * sx, 3.5, CarArt.shade(body, -35), 1.0);
        CarArt.line(c, rx - 21.0 * sx, 3.8, rx + 21.0 * sx, 3.8, CarArt.shade(body, 28), 0.7);

        // Gravata dourada Chevrolet com contorno cromado
        c.fillStyle = '#FFD700';
        c.fillRect(rx - 2.8, 0.5, 5.6, 2.2);
        c.strokeStyle = '#CBD5E1';
        c.lineWidth = 0.6;
        c.strokeRect(rx - 2.8, 0.5, 5.6, 2.2);
        CarArt.line(c, rx, 0.8, rx, 2.4, '#B45309', 0.5);

        // Letreiro cromado "CELTA" à esquerda
        CarArt.drawEmblemText(c, 'CELTA', rx - 19.5 * sx, 4.5, {
          font: 'bold 3.2px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Inscrição de motorização "1.0 VHC" à direita
        CarArt.drawEmblemText(c, '1.0 VHC', rx + 19.5 * sx, 4.5, {
          font: 'bold 2.4px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.5
        });

        // Fechadura da tampa
        c.fillStyle = '#CBD5E1';
        c.beginPath();
        c.arc(rx, 6.8, 0.8, 0, Math.PI * 2);
        c.fill();

        // 5. Lanternas Traseiras Verticais Segmentadas do Celta
        const drawCeltaLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -31.2 * sx;
          const lw = 8.2 * sx;

          // Moldura escura perimetral
          CarArt.roundRect(c, lx - 0.4, -4.8, lw + 0.8, 15.2, 1.4, '#10141D', out, 1.0);

          // Câmara superior: freio e posição vermelha
          CarArt.roundRect(c, lx, -4.5, lw, 5.8, 1.0, tailRed, '#1A212B', 0.75);
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.3)';
          c.fillRect(lx + 0.6 * sx, -3.8, lw - 1.2 * sx, 0.9);

          // Câmara intermediária: pisca âmbar
          c.fillStyle = '#D97706';
          c.fillRect(lx + 0.6 * sx, 1.8, lw - 1.2 * sx, 3.4);
          c.fillStyle = '#F59E0B';
          c.fillRect(lx + 0.8 * sx, 2.0, lw - 1.6 * sx, 0.9);
          CarArt.line(c, lx + 0.6 * sx, 3.2, lx + lw - 0.6 * sx, 3.2, '#92400E', 0.5);

          // Divisória preta
          CarArt.line(c, lx, 5.4, lx + lw, 5.4, '#0B0F15', 0.8);

          // Câmara inferior: luz de ré cristal e catadióptrico rubi
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 0.6 * sx, 5.6, lw - 1.2 * sx, 3.4);
          c.fillStyle = '#FFFFFF';
          c.fillRect(lx + 0.8 * sx, 5.8, lw - 1.6 * sx, 0.8);

          // Catadióptrico rubi na base da lanterna
          c.fillStyle = '#991B1B';
          c.fillRect(lx + 0.6 * sx, 9.2, lw - 1.2 * sx, 1.0);

          CarArt.drawTailGlow(c, lx + 4.1 * sx, -1.5, 4.8, 4.8, isBraking, isNight);
          c.restore();
        };
        drawCeltaLamp(true);
        drawCeltaLamp(false);

        // 6. Para-choque esportivo na cor da carroceria com vinco inferior escuro
        const bmp = c.createLinearGradient(0, 11.0, 0, 20.0);
        bmp.addColorStop(0, CarArt.shade(body, -15));
        bmp.addColorStop(0.7, CarArt.shade(body, -28));
        bmp.addColorStop(1, CarArt.shade(body, -42));
        CarArt.roundRect(c, rx - 32.6 * sx, 11.0, 65.2 * sx, 9.0, 1.8, bmp, out, 1.3);

        // Luzes de placa duplas e nicho
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.0, 12.2, 2.2, 0.6);
        c.fillRect(rx + 2.8, 12.2, 2.2, 0.6);

        CarArt.drawPlateStraight(c, rx - 9.0, 13.0, 18.0, 5.0);
        CarArt.drawExhaustPipe(c, rx - 18.2 * sx, 20.8, 1.9);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 11. ONIX (Líder moderno com lanternas bumerangue)
    {
      id: 'onix',
      name: 'ONIX',
      badge: 'MODERNO & POTENTE',
      desc: 'O hatchback mais vendido do Brasil! Traseira musculosa, aerodinâmica refinada e excelente velocidade de curva.',
      maxSpeed: 268,
      acceleration: 0.83,
      braking: 0.88,
      handling: 0.85,
      grip: 0.86,
      centrifugalResistance: 0.85,
      primaryColor: '#EEF2F6',
      roofColor: '#252B36',
      exhaustPipes: [[-19.0, 21.0]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi moderno e pneus esportivos
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 32.0 * sx, 17.6, 9.5 * sx, 4.2);
        c.fillRect(rx + 22.0 * sx, 17.6, 9.5 * sx, 4.2);

        // Bojo do escapamento sob o chassi
        CarArt.roundRect(c, rx - 24.5 * sx, 18.2, 17.0 * sx, 3.4, 1.2, '#333D4B', out, 0.8);

        CarArt.drawRearTire(c, rx - 32.5 * sx, 13, 10.5, 11.2);
        CarArt.drawRearTire(c, rx + 22.0 * sx, 13, 10.5, 11.2);

        // Antena inclinada no teto
        CarArt.line(c, tx + 1.2 * sx, -23.5, tx + 3.8 * sx, -29.5, '#141822', 1.2);

        // 2. Carroceria moderna com ombros musculosos e silhueta dinâmica
        const shape = { roofY: -23.0, roofW: 20.5, shY: -6.0, shW: 32.5, midY: 5.5, midW: 34.0, botY: 20.0, botW: 32.5, round: 5.0, arch: 1.2 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -23, 20);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.45;
        c.stroke();

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 32.5 * sx, roofW: 20.5 * sx,
          roofY: -23.0, beltY: -6.0, botY: 20.0, wheelStyle: 'alloy', mirrorColor: body, curvedRoof: true
        });

        // Retrovisores aerodinâmicos do Onix na cor da lataria com repetidor de seta
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 29.5, w: 5.2, h: 3.6, y: -9.4, r: 1.8, color: body, stemDist: 25.5, stemY: -6.8 });

        // 3. Aerofólio integrado no teto com brake-light horizontal em LED
        CarArt.roundRect(c, tx - 15.0 * sx, -23.6, 30.0 * sx, 2.6, 0.8, CarArt.shade(body, -20), out, 0.75);
        const blColOnix = isBraking ? '#FF1E00' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 6.5 * sx, -23.2, 13.0 * sx, 1.4, 0.5, blColOnix, null, 0);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -22.5, 3.8, 1.8, true, isNight);
        }

        // 4. Vigia traseira arredondada com desembaçador e limpador
        CarArt.glassCurve(c, tx, rx, sx, -19.5, -4.8, 18.0, 26.5, 1.6, 1.6);

        // Filamentos do desembaçador térmico
        for (let l = 1; l <= 4; l++) {
          const dy = -17.8 + l * 2.6;
          const w = (18.2 + l * 1.6) * sx;
          CarArt.line(c, rx - w, dy, rx + w, dy, 'rgba(234, 88, 12, 0.45)', 0.65);
        }

        // Limpador traseiro curvo com palheta flat-blade
        CarArt.line(c, rx, -5.2, rx + 12.0 * sx, -10.5, '#0E131B', 1.5);
        CarArt.line(c, rx + 3.0 * sx, -6.8, rx + 12.4 * sx, -10.8, '#1E293B', 0.95);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx, -5.2, 1.5, 0, Math.PI * 2);
        c.fill();

        // 5. Lanternas Bipartidas Modernas em Bumerangue (invadem a tampa traseira)
        const drawOnixLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -32.2 * sx;

          // Contorno da lanterna em bumerangue bipartida
          c.beginPath();
          c.moveTo(lx, -3.8);
          c.lineTo(lx + 12.8 * sx, 1.8);
          c.lineTo(lx + 12.8 * sx, 6.8);
          c.lineTo(lx + 2.0 * sx, 6.8);
          c.lineTo(lx - 2.0 * sx, 1.6);
          c.closePath();
          c.fillStyle = tailRed;
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 1.15;
          c.stroke();

          // Guia de luz em LED neon contornando o bumerangue
          c.strokeStyle = isBraking ? '#FFAAA5' : 'rgba(255, 130, 120, 0.9)';
          c.lineWidth = 1.0;
          c.beginPath();
          c.moveTo(lx + 0.8 * sx, -2.5);
          c.lineTo(lx + 11.5 * sx, 2.5);
          c.lineTo(lx + 11.5 * sx, 5.8);
          c.lineTo(lx + 2.4 * sx, 5.8);
          c.stroke();

          // Lente de ré cristal e pisca âmbar na porção interna
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 4.5 * sx, 1.8, 4.8 * sx, 2.0);
          c.fillStyle = '#D97706';
          c.fillRect(lx + 4.5 * sx, 4.0, 4.8 * sx, 1.8);

          CarArt.drawTailGlow(c, lx + 5.0 * sx, 2.5, 6.0, 4.5, isBraking, isNight);
          c.restore();
        };
        drawOnixLamp(true);
        drawOnixLamp(false);

        // 6. Tampa do Porta-Malas: Gravata Dourada GM, Badges e Câmera de Ré
        // Vinco pronunciado contornando perfeitamente as lanternas e a tampa traseira
        c.beginPath();
        c.moveTo(rx - 26.5 * sx, -4.8);
        c.lineTo(rx - 18.6 * sx, 1.0);
        c.lineTo(rx - 18.6 * sx, 7.8);
        c.lineTo(rx + 18.6 * sx, 7.8);
        c.lineTo(rx + 18.6 * sx, 1.0);
        c.lineTo(rx + 26.5 * sx, -4.8);
        c.strokeStyle = CarArt.shade(body, -38);
        c.lineWidth = 0.9;
        c.stroke();

        // Gravata Chevrolet dourada centralizada com borda cromada em relevo
        c.fillStyle = '#F59E0B';
        c.fillRect(rx - 3.4, 1.4, 6.8, 2.8);
        c.strokeStyle = '#E2E8F0';
        c.lineWidth = 0.7;
        c.strokeRect(rx - 3.4, 1.4, 6.8, 2.8);
        CarArt.line(c, rx, 1.8, rx, 3.8, '#B45309', 0.6);

        // Letreiro cromado "ONIX" à esquerda
        CarArt.drawEmblemText(c, 'ONIX', rx - 17.2 * sx, 6.0, {
          font: 'bold 3.2px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Badge de versão "TURBO" à direita
        CarArt.drawEmblemText(c, 'TURBO', rx + 17.2 * sx, 6.0, {
          font: 'bold 2.4px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.5
        });

        // Câmera de ré / botão elétrico acima da placa
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 1.2, 9.2, 2.4, 0.8);

        // 7. Para-choque esportivo com difusor inferior e refletores
        const bmp = c.createLinearGradient(0, 11.5, 0, 20.0);
        bmp.addColorStop(0, CarArt.shade(body, -10));
        bmp.addColorStop(0.5, CarArt.shade(body, -24));
        bmp.addColorStop(1, '#1A202C');
        CarArt.roundRect(c, rx - 33.5 * sx, 11.5, 67.0 * sx, 8.5, 1.8, bmp, out, 1.3);

        // Difusor inferior preto com aleta
        CarArt.roundRect(c, rx - 21.0 * sx, 16.5, 42.0 * sx, 3.4, 1.0, '#10141D', out, 0.8);
        CarArt.line(c, rx, 16.5, rx, 19.8, '#283244', 1.0);

        // Refletores horizontais nos cantos
        CarArt.roundRect(c, rx - 30.5 * sx, 14.5, 6.2 * sx, 1.8, 0.5, '#DC2626', '#0E131B', 0.5);
        CarArt.line(c, rx - 30.0 * sx, 15.4, rx - 25.0 * sx, 15.4, '#F87171', 0.5);
        CarArt.roundRect(c, rx + 24.3 * sx, 14.5, 6.2 * sx, 1.8, 0.5, '#DC2626', '#0E131B', 0.5);
        CarArt.line(c, rx + 25.0 * sx, 15.4, rx + 30.0 * sx, 15.4, '#F87171', 0.5);

        // Luzes de placa duplas e placa Mercosul
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.5, 12.0, 2.2, 0.6);
        c.fillRect(rx + 3.3, 12.0, 2.2, 0.6);

        CarArt.drawPlateStraight(c, rx - 9.5, 12.8, 19.0, 5.0);
        CarArt.drawExhaustPipe(c, rx - 19.0 * sx, 20.8, 2.0);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 12. FORD KA (O clássico Baratinha / New Edge)
    {
      id: 'ka',
      name: 'FORD KA',
      badge: 'O PIONEIRO NEW EDGE - KART DE RUA',
      desc: 'O lendário Ka "Baratinha"! Centro de gravidade baixo e entre-eixos curto que cravam curvas como um kart de pista.',
      maxSpeed: 250,
      acceleration: 0.79,
      braking: 0.88,
      handling: 0.98,
      grip: 0.96,
      centrifugalResistance: 0.95,
      primaryColor: '#1E63C9',
      roofColor: '#1A202C',
      exhaustPipes: [[-16.5, 21.2]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi e pneus
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 29.5 * sx, 17.6, 9.0 * sx, 4.2);
        c.fillRect(rx + 20.5 * sx, 17.6, 9.0 * sx, 4.2);

        CarArt.drawRearTire(c, rx - 30.0 * sx, 13, 9.2, 11.2);
        CarArt.drawRearTire(c, rx + 20.8 * sx, 13, 9.2, 11.2);

        // 2. Silhueta semicircular única do Ford Ka G1 ("New Edge" / Baratinha)
        const shape = { roofY: -23.5, roofW: 18.0, shY: -5.0, shW: 30.0, midY: 6.0, midW: 32.0, botY: 20.0, botW: 29.5, round: 7.0, arch: 2.2 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -24, 20);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.4;
        c.stroke();

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 29.5 * sx, roofW: 18.0 * sx,
          roofY: -23.5, beltY: -5.0, botY: 20.0, wheelStyle: 'steel', mirrorColor: '#1C212B', curvedRoof: true
        });

        // Retrovisores aerodinâmicos ovais do Ford Ka
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 27.5, w: 4.8, h: 3.4, y: -9.5, r: 1.8, color: '#1C212B', stemDist: 23.5, stemY: -6.8 });

        // 3. Vidro traseiro oval arredondado com desembaçador térmico curvo
        CarArt.glassCurve(c, tx, rx, sx, -19.5, -4.0, 15.5, 23.5, 2.5, 2.5);

        // Filamentos curvos do desembaçador térmico do Ka
        for (let l = 1; l <= 4; l++) {
          const dy = -17.0 + l * 2.5;
          const w = (15.5 + l * 1.6) * sx;
          c.beginPath();
          c.moveTo(rx - w, dy);
          c.quadraticCurveTo(rx, dy - 1.2, rx + w, dy);
          c.strokeStyle = 'rgba(234, 88, 12, 0.45)';
          c.lineWidth = 0.65;
          c.stroke();
        }

        // Brake-light curvo no topo do teto
        const blColKa = isBraking ? '#FF1E10' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 5.0 * sx, -21.8, 10.0 * sx, 1.6, 0.6, blColKa, '#141820', 0.55);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -21.0, 3.5, 1.8, true, isNight);
        }

        // Limpador traseiro curvo preto
        CarArt.line(c, rx, -4.5, rx + 10.5 * sx, -9.8, '#0E131B', 1.5);
        CarArt.line(c, rx + 3.0 * sx, -6.2, rx + 11.0 * sx, -10.0, '#1E293B', 0.95);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx, -4.5, 1.4, 0, Math.PI * 2);
        c.fill();

        // 4. Lanternas triangulares/ovais de topo montadas nas colunas C (ícone absoluto do Ka!)
        const drawKaLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -25.5 * sx;

          // Moldura preta da lanterna em gota
          c.beginPath();
          c.ellipse(lx, -5.5, 5.2 * sx, 6.6, -0.25, 0, Math.PI * 2);
          c.fillStyle = '#10141D';
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 1.1;
          c.stroke();

          // Lente vermelha rubi de posição e freio
          c.fillStyle = tailRed;
          c.beginPath();
          c.ellipse(lx, -5.5, 4.6 * sx, 5.8, -0.25, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.35)';
          c.beginPath();
          c.ellipse(lx, -7.5, 2.8 * sx, 1.4, -0.25, 0, Math.PI * 2);
          c.fill();

          // Pisca âmbar central com aro
          c.fillStyle = '#D97706';
          c.beginPath();
          c.ellipse(lx, -5.2, 2.6 * sx, 2.6, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#F59E0B';
          c.beginPath();
          c.ellipse(lx, -5.5, 1.8 * sx, 1.4, 0, 0, Math.PI * 2);
          c.fill();

          CarArt.drawTailGlow(c, lx, -5.5, 5.0, 5.0, isBraking, isNight);
          c.restore();
        };
        drawKaLamp(true);
        drawKaLamp(false);

        // 5. Para-choque preto envolvente característico que sobe contornando as caixas de roda
        const bmp = c.createLinearGradient(0, 7.5, 0, 20.0);
        bmp.addColorStop(0, '#2A303A');
        bmp.addColorStop(0.4, '#1C222B');
        bmp.addColorStop(1, '#11151D');
        CarArt.roundRect(c, rx - 31.5 * sx, 8.0, 63.0 * sx, 12.0, 3.5, bmp, out, 1.35);

        // 6. Tampa do Porta-Malas: Oval Azul Ford, Grafia estilizada "Ka" e Maçaneta
        // Oval Ford centralizado
        c.fillStyle = '#1D4ED8';
        c.beginPath();
        c.ellipse(rx, 1.6, 4.2, 2.3, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#E2E8F0';
        c.lineWidth = 0.7;
        c.stroke();
        c.fillStyle = '#FFFFFF';
        c.font = 'italic bold 2.0px sans-serif';
        c.textAlign = 'center';
        c.fillText('Ford', rx, 2.2);

        // Grafia estilizada manuscrita "Ka" no canto direito
        CarArt.drawEmblemText(c, 'Ka', rx + 19.5 * sx, 4.8, {
          font: 'italic bold 3.8px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.65
        });

        // Fechadura / botão elétrico oval
        CarArt.roundRect(c, rx - 2.5 * sx, 5.0, 5.0 * sx, 2.0, 0.8, '#141822', out, 0.6);
        c.fillStyle = '#CBD5E1';
        c.beginPath();
        c.arc(rx, 6.0, 0.6, 0, Math.PI * 2);
        c.fill();

        // Luzes de placa duplas e nicho
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.0, 11.8, 2.2, 0.6);
        c.fillRect(rx + 2.8, 11.8, 2.2, 0.6);

        CarArt.drawPlateStraight(c, rx - 8.8, 12.8, 17.6, 4.8);
        CarArt.drawExhaustPipe(c, rx - 16.5 * sx, 20.8, 1.8);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 13. FIAT PALIO (O clássico Palio G1 de Giugiaro)
    {
      id: 'palio',
      name: 'FIAT PALIO',
      badge: 'DESIGN ITALIANO - EQUILÍBRIO TOTAL',
      desc: 'O hatchback global da Fiat! Linhas limpas de Giugiaro, dirigibilidade dócil e excelente equilíbrio de freios.',
      maxSpeed: 260,
      acceleration: 0.78,
      braking: 0.87,
      handling: 0.85,
      grip: 0.86,
      centrifugalResistance: 0.85,
      primaryColor: '#181B21',
      roofColor: '#15171B',
      exhaustPipes: [[-17.5, 21.2]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi e pneus
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 31.0 * sx, 17.6, 9.0 * sx, 4.2);
        c.fillRect(rx + 22.0 * sx, 17.6, 9.0 * sx, 4.2);

        CarArt.drawRearTire(c, rx - 31.4 * sx, 13, 9.8, 11.2);
        CarArt.drawRearTire(c, rx + 21.6 * sx, 13, 9.8, 11.2);

        // 2. Carroceria fluida desenhada por Giugiaro (linhas italianas limpas e elegantes)
        const shape = { roofY: -22.8, roofW: 20.2, shY: -6.0, shW: 31.2, midY: 5.0, midW: 33.2, botY: 20.0, botW: 31.4, round: 5.2, arch: 1.3 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -23, 20);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.4;
        c.stroke();

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 31.4 * sx, roofW: 20.2 * sx,
          roofY: -22.8, beltY: -6.0, botY: 20.0, wheelStyle: 'steel', mirrorColor: '#1C2028', curvedRoof: true
        });

        // Retrovisores aerodinâmicos do Palio G1
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 28.5, w: 5.0, h: 3.5, y: -9.5, r: 1.2, color: '#1C2028', stemDist: 24.5, stemY: -6.8 });

        // 3. Vidro traseiro curvo com guarnição de borracha e desembaçador térmico
        CarArt.glassCurve(c, tx, rx, sx, -19.0, -5.0, 17.5, 25.0, 1.8, 1.8);

        // Filamentos curvos do desembaçador térmico
        for (let l = 1; l <= 4; l++) {
          const dy = -17.2 + l * 2.5;
          const w = (17.5 + l * 1.5) * sx;
          CarArt.line(c, rx - w, dy, rx + w, dy, 'rgba(234, 88, 12, 0.45)', 0.65);
        }

        // Brake-light central no topo da vigia
        const blColPalio = isBraking ? '#FF1E10' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 5.5 * sx, -20.2, 11.0 * sx, 1.6, 0.6, blColPalio, '#141820', 0.55);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -19.4, 3.5, 1.8, true, isNight);
        }

        // Limpador traseiro articulado com base giratória
        CarArt.line(c, rx - 1.0, -5.5, rx + 11.0 * sx, -10.5, '#0E131B', 1.5);
        CarArt.line(c, rx + 3.2 * sx, -7.2, rx + 11.4 * sx, -10.8, '#1E293B', 0.95);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx - 1.0, -5.5, 1.5, 0, Math.PI * 2);
        c.fill();

        // 4. Tampa do Porta-Malas: As 5 Barras Clássicas FIAT, Badges e Maçaneta
        // Vinco sutil contornando a tampa
        c.beginPath();
        c.moveTo(rx - 23.0 * sx, -4.5);
        c.quadraticCurveTo(rx, -3.2, rx + 23.0 * sx, -4.5);
        c.strokeStyle = CarArt.shade(body, -38);
        c.lineWidth = 0.9;
        c.stroke();

        // Emblema clássico FIAT de 5 barras cromadas inclinadas (símbolo dos anos 90!)
        c.fillStyle = 'rgba(15, 23, 42, 0.4)';
        c.fillRect(rx - 5.5, 0.6, 11.0, 3.2);
        for (let b = 0; b < 5; b++) {
          CarArt.line(c, rx - 4.2 + b * 2.1, 3.2, rx - 2.8 + b * 2.1, 1.0, '#F1F5F9', 1.15);
        }

        // Letreiro cromado "PALIO" à esquerda
        CarArt.drawEmblemText(c, 'PALIO', rx - 21.0 * sx, 4.5, {
          font: 'bold 3.2px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Inscrição esportiva "16V" à direita
        CarArt.drawEmblemText(c, '16V', rx + 21.0 * sx, 4.5, {
          font: 'bold 2.6px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.5
        });

        // Maçaneta oval preta com miolo de chave
        CarArt.roundRect(c, rx - 3.2 * sx, 6.8, 6.4 * sx, 2.2, 0.8, '#141822', out, 0.65);
        c.fillStyle = '#CBD5E1';
        c.beginPath();
        c.arc(rx + 1.2 * sx, 7.9, 0.65, 0, Math.PI * 2);
        c.fill();

        // 5. Lanternas Traseiras Verticais Estreitas Icônicas do Palio G1
        const drawPalioLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -31.2 * sx;
          const lw = 6.8 * sx;

          // Moldura escura perimetral
          CarArt.roundRect(c, lx - 0.4, -4.8, lw + 0.8, 15.6, 1.2, '#10141D', out, 1.0);

          // Câmara 1 (Topo): Pisca âmbar
          c.fillStyle = '#D97706';
          c.fillRect(lx + 0.6 * sx, -4.2, lw - 1.2 * sx, 3.6);
          c.fillStyle = '#F59E0B';
          c.fillRect(lx + 0.8 * sx, -4.0, lw - 1.6 * sx, 1.0);
          CarArt.line(c, lx + 0.6 * sx, -2.6, lx + lw - 0.6 * sx, -2.6, '#92400E', 0.5);

          // Divisória preta
          CarArt.line(c, lx, -0.4, lx + lw, -0.4, '#0B0F15', 0.8);

          // Câmara 2 (Meio): Posição e freio vermelho rubi com reflexo
          c.fillStyle = tailRed;
          c.fillRect(lx + 0.6 * sx, -0.2, lw - 1.2 * sx, 6.0);
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.3)';
          c.fillRect(lx + 0.8 * sx, 0.4, lw - 1.6 * sx, 1.0);

          // Divisória preta
          CarArt.line(c, lx, 6.0, lx + lw, 6.0, '#0B0F15', 0.8);

          // Câmara 3 (Base): Luz de ré cristal e refletor
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 0.6 * sx, 6.2, lw - 1.2 * sx, 3.8);
          c.fillStyle = '#FFFFFF';
          c.fillRect(lx + 0.8 * sx, 6.4, lw - 1.6 * sx, 0.9);

          CarArt.drawTailGlow(c, lx + 3.4 * sx, 2.5, 4.6, 4.6, isBraking, isNight);
          c.restore();
        };
        drawPalioLamp(true);
        drawPalioLamp(false);

        // 6. Para-choque com borrachão preto envolvente e nicho da placa
        const bmp = c.createLinearGradient(0, 11.0, 0, 20.0);
        bmp.addColorStop(0, '#2B323D');
        bmp.addColorStop(0.4, '#1A202A');
        bmp.addColorStop(1, '#11151D');
        CarArt.roundRect(c, rx - 32.8 * sx, 11.0, 65.6 * sx, 9.0, 1.8, bmp, out, 1.3);

        // Luzes de placa duplas
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.2, 12.2, 2.2, 0.6);
        c.fillRect(rx + 3.0, 12.2, 2.2, 0.6);

        CarArt.drawPlateStraight(c, rx - 9.0, 13.0, 18.0, 5.0);
        CarArt.drawExhaustPipe(c, rx - 17.5 * sx, 20.8, 1.9);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 14. RENAULT KWID (O SUV dos compactos)
    {
      id: 'kwid',
      name: 'RENAULT KWID',
      badge: 'O COMPACTO ROBUSTO - VÃO LIVRE ALTO',
      desc: 'O "SUV dos compactos"! Postura alta, peso pluma e suspensão elevada para absorver ondulações da pista com facilidade.',
      maxSpeed: 244,
      acceleration: 0.84,
      braking: 0.83,
      handling: 0.81,
      grip: 0.83,
      centrifugalResistance: 0.81,
      primaryColor: '#F5C400',
      roofColor: '#2B2610',
      exhaustPipes: [[-16.0, 21.5]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi elevado e pneus
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 30.0 * sx, 17.6, 9.0 * sx, 4.2);
        c.fillRect(rx + 21.0 * sx, 17.6, 9.0 * sx, 4.2);

        CarArt.drawRearTire(c, rx - 30.5 * sx, 13, 9.2, 11.2);
        CarArt.drawRearTire(c, rx + 21.2 * sx, 13, 9.2, 11.2);

        // 2. Carroceria alta e esguia estilo SUV urbano com postura elevada
        const shape = { roofY: -24.5, roofW: 19.0, shY: -6.0, shW: 29.5, midY: 5.0, midW: 31.5, botY: 19.5, botW: 29.8, round: 4.5, arch: 1.0 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -25, 19);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.45;
        c.stroke();

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 29.8 * sx, roofW: 19.0 * sx,
          roofY: -24.5, beltY: -6.0, botY: 19.5, wheelStyle: 'steel', mirrorColor: '#1B202A', curvedRoof: true
        });

        // Retrovisores altos robustos do Kwid
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 27.5, w: 5.0, h: 3.8, y: -9.8, r: 1.4, color: '#1B202A', stemDist: 23.5, stemY: -7.0 });

        // Antena longa característica no teto
        CarArt.line(c, tx + 1.0 * sx, -24.5, tx + 5.5 * sx, -32.5, '#11151D', 1.3);

        // Aerofólio integrado no topo da tampa com brake-light
        CarArt.roundRect(c, tx - 12.0 * sx, -24.4, 24.0 * sx, 2.0, 0.8, CarArt.shade(body, -18), null, 0);
        const blColKwid = isBraking ? '#FF1E10' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 4.5 * sx, -24.0, 9.0 * sx, 1.2, 0.4, blColKwid, null, 0);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -23.4, 3.2, 1.6, true, isNight);
        }

        // 3. Vigia traseira com desembaçador e limpador
        CarArt.glassCurve(c, tx, rx, sx, -21.0, -5.0, 16.5, 23.5, 1.4, 1.4);

        // Filamentos do desembaçador térmico
        for (let l = 1; l <= 4; l++) {
          const dy = -19.2 + l * 2.6;
          const w = (16.8 + l * 1.4) * sx;
          CarArt.line(c, rx - w, dy, rx + w, dy, 'rgba(234, 88, 12, 0.45)', 0.65);
        }

        // Limpador traseiro preto
        CarArt.line(c, rx - 0.5, -5.5, rx + 10.5 * sx, -10.2, '#0E131B', 1.5);
        CarArt.line(c, rx + 2.5 * sx, -7.0, rx + 11.0 * sx, -10.5, '#1E293B', 0.95);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx - 0.5, -5.5, 1.4, 0, Math.PI * 2);
        c.fill();

        // 4. Tampa do Porta-Malas: Losango Renault, Emblemas e Câmera
        // Vinco pronunciado contornando a tampa
        c.beginPath();
        c.moveTo(rx - 22.0 * sx, -4.5);
        c.lineTo(rx - 18.0 * sx, 6.0);
        c.lineTo(rx + 18.0 * sx, 6.0);
        c.lineTo(rx + 22.0 * sx, -4.5);
        c.strokeStyle = CarArt.shade(body, -35);
        c.lineWidth = 0.9;
        c.stroke();

        // O grande losango Renault cromado em relevo no centro
        c.fillStyle = '#E2E8F0';
        c.beginPath();
        c.moveTo(rx, 0.0);
        c.lineTo(rx + 2.8, 3.4);
        c.lineTo(rx, 6.8);
        c.lineTo(rx - 2.8, 3.4);
        c.closePath();
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.7;
        c.stroke();
        c.fillStyle = '#1E293B';
        c.beginPath();
        c.moveTo(rx, 1.4);
        c.lineTo(rx + 1.6, 3.4);
        c.lineTo(rx, 5.4);
        c.lineTo(rx - 1.6, 3.4);
        c.closePath();
        c.fill();
        // Miolo da fechadura/câmera dentro do losango
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 0.5, 3.0, 1.0, 1.0);

        // Letreiro cromado "KWID" à esquerda
        CarArt.drawEmblemText(c, 'KWID', rx - 18.0 * sx, 4.5, {
          font: 'bold 3.2px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Badge de versão à direita
        CarArt.drawEmblemText(c, 'OUTSIDER', rx + 18.0 * sx, 4.5, {
          font: 'bold 2.4px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.5
        });

        // 5. Lanternas Traseiras 3D Quadradas com Assinatura em "C"
        const drawKwidLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -29.8 * sx;
          const lw = 8.0 * sx;

          // Moldura preta da lanterna
          CarArt.roundRect(c, lx - 0.4, -3.8, lw + 0.8, 10.2, 1.4, '#10141D', out, 1.0);

          // Base da lanterna
          CarArt.roundRect(c, lx, -3.5, lw, 9.6, 1.2, tailRed, '#1A212B', 0.8);

          // Guia de luz em "C" de LED neon brilhante
          c.strokeStyle = isBraking ? '#FFAAA5' : 'rgba(255, 140, 130, 0.9)';
          c.lineWidth = 1.0;
          c.strokeRect(lx + 0.8 * sx, -2.8, lw - 1.6 * sx, 8.2);

          // Câmara interna para pisca âmbar e ré cristal
          c.fillStyle = '#D97706';
          c.fillRect(lx + 1.2 * sx, 0.4, lw - 2.4 * sx, 2.2);
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 1.2 * sx, 3.0, lw - 2.4 * sx, 2.0);

          CarArt.drawTailGlow(c, lx + 4.0 * sx, 1.2, 4.6, 4.6, isBraking, isNight);
          c.restore();
        };
        drawKwidLamp(true);
        drawKwidLamp(false);

        // 6. Para-choque alto e musculoso com protetor/skid plate preto
        const bmp = c.createLinearGradient(0, 10.0, 0, 19.5);
        bmp.addColorStop(0, '#2D3540');
        bmp.addColorStop(0.5, '#1A202A');
        bmp.addColorStop(1, '#0F1318');
        CarArt.roundRect(c, rx - 31.0 * sx, 10.0, 62.0 * sx, 9.5, 2.0, bmp, out, 1.35);

        // Skid plate / acabamento central na base do para-choque
        CarArt.roundRect(c, rx - 14.0 * sx, 16.5, 28.0 * sx, 3.0, 1.0, '#384252', out, 0.8);

        // Refletores vermelhos integrados nos cantos inferiores
        CarArt.roundRect(c, rx - 27.0 * sx, 13.0, 4.2 * sx, 1.8, 0.5, '#B91C1C', '#0B0F15', 0.5);
        CarArt.roundRect(c, rx + 22.8 * sx, 13.0, 4.2 * sx, 1.8, 0.5, '#B91C1C', '#0B0F15', 0.5);

        // Luzes de placa duplas e placa Mercosul
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.0, 11.6, 2.2, 0.6);
        c.fillRect(rx + 2.8, 11.6, 2.2, 0.6);

        CarArt.drawPlateStraight(c, rx - 8.5, 12.5, 17.0, 4.8);
        CarArt.drawExhaustPipe(c, rx - 16.0 * sx, 20.5, 1.8);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 15. FORD FOCUS (O lendário MK1 com lanternas na coluna)
    {
      id: 'focus',
      name: 'FORD FOCUS',
      badge: 'LENDA DO RALLY - LANTERNAS DE TOPO',
      desc: 'O hatchback mais dinâmico do automobilismo! Lanternas montadas na coluna do teto e suspensão traseira multilink cirúrgica.',
      maxSpeed: 275,
      acceleration: 0.86,
      braking: 0.92,
      handling: 0.94,
      grip: 0.94,
      centrifugalResistance: 0.93,
      primaryColor: '#1E63C9',
      roofColor: '#121A2A',
      exhaustPipes: [[-19.5, 21.0]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi esportivo e pneus
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 32.5 * sx, 17.6, 9.5 * sx, 4.2);
        c.fillRect(rx + 22.0 * sx, 17.6, 9.5 * sx, 4.2);

        CarArt.drawRearTire(c, rx - 33.2 * sx, 13, 10.8, 11.2);
        CarArt.drawRearTire(c, rx + 22.4 * sx, 13, 10.8, 11.2);

        // 2. Carroceria New Edge esportiva com ombros pronunciados
        const shape = { roofY: -23.5, roofW: 20.0, shY: -6.0, shW: 33.0, midY: 5.0, midW: 34.5, botY: 20.0, botW: 33.0, round: 4.8, arch: 1.4 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -24, 20);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.45;
        c.stroke();

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 33.0 * sx, roofW: 20.0 * sx,
          roofY: -23.5, beltY: -6.0, botY: 20.0, wheelStyle: 'alloy', mirrorColor: body, curvedRoof: true
        });

        // Retrovisores aerodinâmicos do Ford Focus na cor da carroceria
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 29.5, w: 5.2, h: 3.6, y: -9.6, r: 1.6, color: body, stemDist: 25.0, stemY: -7.0 });

        // 3. Aerofólio de teto esportivo com brake-light horizontal
        CarArt.roundRect(c, tx - 15.0 * sx, -24.2, 30.0 * sx, 2.6, 1.0, CarArt.shade(body, -22), out, 0.8);
        const blColFocus = isBraking ? '#FF1E00' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 6.0 * sx, -23.8, 12.0 * sx, 1.4, 0.5, blColFocus, null, 0);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -23.0, 3.8, 1.8, true, isNight);
        }

        // 4. Vigia traseira esportiva com desembaçador e limpador
        CarArt.glassCurve(c, tx, rx, sx, -20.0, -4.5, 17.5, 25.5, 1.6, 1.6);

        // Filamentos curvos do desembaçador térmico
        for (let l = 1; l <= 4; l++) {
          const dy = -18.2 + l * 2.6;
          const w = (17.5 + l * 1.5) * sx;
          CarArt.line(c, rx - w, dy, rx + w, dy, 'rgba(234, 88, 12, 0.45)', 0.65);
        }

        // Limpador traseiro curvo preto
        CarArt.line(c, rx, -5.0, rx + 12.0 * sx, -10.5, '#0E131B', 1.5);
        CarArt.line(c, rx + 3.0 * sx, -6.6, rx + 12.4 * sx, -10.8, '#1E293B', 0.95);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx, -5.0, 1.5, 0, Math.PI * 2);
        c.fill();

        // 5. AS FAMOSAS LANTERNAS DE TOPO NAS COLUNAS C DO FOCUS (emoldurando o vidro!)
        const drawFocusPillarLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -28.8 * sx;

          // Contorno da lanterna em coluna
          c.beginPath();
          c.moveTo(lx, -19.8);
          c.lineTo(lx + 5.6 * sx, -19.8);
          c.lineTo(lx + 7.0 * sx, -4.2);
          c.lineTo(lx - 0.2 * sx, -4.2);
          c.closePath();
          c.fillStyle = tailRed;
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 1.15;
          c.stroke();

          // Lente de posição/freio superior vermelha com estrias
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.35)';
          c.fillRect(lx + 0.6 * sx, -18.5, 4.5 * sx, 1.0);
          CarArt.line(c, lx + 0.6 * sx, -16.5, lx + 5.2 * sx, -16.5, '#58080C', 0.6);

          // Pisca âmbar central
          c.fillStyle = '#D97706';
          c.fillRect(lx + 0.8 * sx, -13.2, 4.4 * sx, 3.4);
          c.fillStyle = '#F59E0B';
          c.fillRect(lx + 1.0 * sx, -13.0, 4.0 * sx, 1.0);
          CarArt.line(c, lx + 0.8 * sx, -11.5, lx + 5.2 * sx, -11.5, '#92400E', 0.5);

          // Divisória preta
          CarArt.line(c, lx, -9.6, lx + 6.0 * sx, -9.6, '#0B0F15', 0.8);

          // Ré cristal inferior
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 0.8 * sx, -9.4, 4.6 * sx, 3.2);
          c.fillStyle = '#FFFFFF';
          c.fillRect(lx + 1.0 * sx, -9.2, 4.2 * sx, 0.9);

          CarArt.drawTailGlow(c, lx + 3.2 * sx, -16.0, 5.0, 5.0, isBraking, isNight);
          c.restore();
        };
        drawFocusPillarLamp(true);
        drawFocusPillarLamp(false);

        // 6. Tampa do Porta-Malas: Régua do Porta-Malas, Oval Ford e Badges
        // Régua na cor da carroceria / grafite acima da placa
        CarArt.roundRect(c, rx - 18.0 * sx, 0.8, 36.0 * sx, 3.6, 1.0, CarArt.shade(body, -14), out, 0.75);

        // Oval Ford central
        c.fillStyle = '#1D4ED8';
        c.beginPath();
        c.ellipse(rx, 2.6, 4.4, 2.4, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#E2E8F0';
        c.lineWidth = 0.7;
        c.stroke();
        c.fillStyle = '#FFFFFF';
        c.font = 'italic bold 2.0px sans-serif';
        c.textAlign = 'center';
        c.fillText('Ford', rx, 3.2);

        // Letreiro cromado "FOCUS" à esquerda
        CarArt.drawEmblemText(c, 'FOCUS', rx - 16.5 * sx, 3.3, {
          font: 'bold 3.2px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Badge de motorização "2.0 16V" à direita
        CarArt.drawEmblemText(c, '2.0 16V', rx + 16.5 * sx, 3.3, {
          font: 'bold 2.4px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.5
        });

        // Botão elétrico de abertura
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 1.2, 4.8, 2.4, 0.8);

        // 7. Para-choque esportivo envolvente com refletores trapezoidais
        const bmp = c.createLinearGradient(0, 11.0, 0, 20.0);
        bmp.addColorStop(0, CarArt.shade(body, -12));
        bmp.addColorStop(0.5, CarArt.shade(body, -26));
        bmp.addColorStop(1, '#1A202A');
        CarArt.roundRect(c, rx - 34.0 * sx, 11.0, 68.0 * sx, 9.0, 2.0, bmp, out, 1.35);

        // Refletores de neblina trapezoidais nas extremidades do para-choque
        CarArt.roundRect(c, rx - 31.0 * sx, 14.5, 6.2 * sx, 2.2, 0.6, '#DC2626', '#0E131B', 0.5);
        CarArt.line(c, rx - 30.5 * sx, 15.6, rx - 25.5 * sx, 15.6, '#F87171', 0.5);
        CarArt.roundRect(c, rx + 24.8 * sx, 14.5, 6.2 * sx, 2.2, 0.6, '#DC2626', '#0E131B', 0.5);
        CarArt.line(c, rx + 25.5 * sx, 15.6, rx + 30.5 * sx, 15.6, '#F87171', 0.5);

        // Luzes de placa duplas e placa Mercosul
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.5, 12.2, 2.2, 0.6);
        c.fillRect(rx + 3.3, 12.2, 2.2, 0.6);

        CarArt.drawPlateStraight(c, rx - 9.5, 13.0, 19.0, 5.0);
        CarArt.drawExhaustPipe(c, rx - 19.5 * sx, 20.8, 2.2);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 16. RENAULT SANDERO (Musculoso com pegada esportiva R.S.)
    {
      id: 'sandero',
      name: 'SANDERO R.S.',
      badge: 'ESPÍRITO DE PISTA - EXTRATOR & ESCAPE DUPLO',
      desc: 'O hatch preparado pela divisão esportiva! Bitola larga, aerofólio traseiro, difusor funcional e ronco encorpado.',
      maxSpeed: 272,
      acceleration: 0.85,
      braking: 0.93,
      handling: 0.90,
      grip: 0.91,
      centrifugalResistance: 0.90,
      primaryColor: '#D1232B',
      roofColor: '#171B24',
      exhaustPipes: [[-20.0, 20.8], [-15.5, 20.8]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi largo e pneus esportivos
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 32.5 * sx, 17.6, 9.5 * sx, 4.2);
        c.fillRect(rx + 22.0 * sx, 17.6, 9.5 * sx, 4.2);

        CarArt.drawRearTire(c, rx - 33.0 * sx, 13, 10.8, 11.2);
        CarArt.drawRearTire(c, rx + 22.4 * sx, 13, 10.8, 11.2);

        // 2. Carroceria encorpada e musculosa do Sandero R.S.
        const shape = { roofY: -23.2, roofW: 20.5, shY: -5.5, shW: 33.0, midY: 5.5, midW: 34.5, botY: 20.2, botW: 33.0, round: 5.0, arch: 1.3 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -24, 20);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.45;
        c.stroke();

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 33.0 * sx, roofW: 20.5 * sx,
          roofY: -23.2, beltY: -5.5, botY: 20.2, wheelStyle: 'alloy', mirrorColor: '#11151D', curvedRoof: true
        });

        // Retrovisores esportivos pretos do Sandero R.S.
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 29.5, w: 5.2, h: 3.6, y: -9.5, r: 1.6, color: '#11151D', stemDist: 25.0, stemY: -7.0 });

        // 3. Aerofólio duplo de competição no teto em preto brilhante com brake-light
        CarArt.roundRect(c, tx - 16.0 * sx, -24.4, 32.0 * sx, 3.0, 1.0, '#111620', out, 0.75);
        const blColSandero = isBraking ? '#FF1E00' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 6.5 * sx, -23.8, 13.0 * sx, 1.4, 0.5, blColSandero, null, 0);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -23.0, 3.8, 1.8, true, isNight);
        }

        // 4. Vigia traseira escurecida com desembaçador e limpador
        CarArt.glassCurve(c, tx, rx, sx, -19.5, -4.5, 18.0, 26.5, 1.8, 1.8);

        // Filamentos do desembaçador térmico
        for (let l = 1; l <= 4; l++) {
          const dy = -17.8 + l * 2.6;
          const w = (18.2 + l * 1.6) * sx;
          CarArt.line(c, rx - w, dy, rx + w, dy, 'rgba(234, 88, 12, 0.45)', 0.65);
        }

        // Limpador aerodinâmico flat-blade preto
        CarArt.line(c, rx, -5.0, rx + 12.0 * sx, -10.5, '#0E131B', 1.5);
        CarArt.line(c, rx + 3.0 * sx, -6.6, rx + 12.4 * sx, -10.8, '#1E293B', 0.95);
        c.fillStyle = '#0E131B';
        c.beginPath();
        c.arc(rx, -5.0, 1.5, 0, Math.PI * 2);
        c.fill();

        // 5. Lanternas C-Shape esportivas que invadem a tampa do porta-malas
        const drawSanderoLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -32.8 * sx;

          // Contorno da lanterna C-Shape
          c.beginPath();
          c.moveTo(lx, -3.5);
          c.lineTo(lx + 11.2 * sx, -1.0);
          c.lineTo(lx + 11.2 * sx, 8.2);
          c.lineTo(lx, 8.2);
          c.closePath();
          c.fillStyle = tailRed;
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 1.15;
          c.stroke();

          // Guia de luz LED neon em formato de C
          c.strokeStyle = isBraking ? '#FFAAA5' : 'rgba(255, 130, 120, 0.9)';
          c.lineWidth = 1.0;
          c.beginPath();
          c.moveTo(lx + 1.2 * sx, -2.5);
          c.lineTo(lx + 10.0 * sx, -0.4);
          c.lineTo(lx + 10.0 * sx, 7.2);
          c.lineTo(lx + 1.2 * sx, 7.2);
          c.stroke();

          // Seta âmbar e ré cristal na parte interna
          c.fillStyle = '#D97706';
          c.fillRect(lx + 3.5 * sx, 1.2, 5.5 * sx, 2.0);
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 3.5 * sx, 3.8, 5.5 * sx, 2.0);

          CarArt.drawTailGlow(c, lx + 5.0 * sx, 2.5, 5.5, 5.0, isBraking, isNight);
          c.restore();
        };
        drawSanderoLamp(true);
        drawSanderoLamp(false);

        // 6. Tampa do Porta-Malas: Losango Renault, Inscrição "SANDERO" e Badge "R.S."
        // Vinco pronunciado contornando perfeitamente as lanternas e a tampa traseira
        c.beginPath();
        c.moveTo(rx - 26.5 * sx, -4.5);
        c.lineTo(rx - 20.8 * sx, -1.2);
        c.lineTo(rx - 20.8 * sx, 8.5);
        c.lineTo(rx + 20.8 * sx, 8.5);
        c.lineTo(rx + 20.8 * sx, -1.2);
        c.lineTo(rx + 26.5 * sx, -4.5);
        c.strokeStyle = CarArt.shade(body, -38);
        c.lineWidth = 0.9;
        c.stroke();

        // O grande losango Renault cromado
        c.fillStyle = '#E2E8F0';
        c.beginPath();
        c.moveTo(rx, 0.8);
        c.lineTo(rx + 2.8, 4.2);
        c.lineTo(rx, 7.6);
        c.lineTo(rx - 2.8, 4.2);
        c.closePath();
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.7;
        c.stroke();
        c.fillStyle = '#1E293B';
        c.beginPath();
        c.moveTo(rx, 2.2);
        c.lineTo(rx + 1.6, 4.2);
        c.lineTo(rx, 6.2);
        c.lineTo(rx - 1.6, 4.2);
        c.closePath();
        c.fill();

        // Letreiro cromado "SANDERO" central sob o losango
        CarArt.drawEmblemText(c, 'SANDERO', rx, 9.8, {
          font: 'bold 2.8px sans-serif',
          align: 'center',
          fill: '#F8FAFC',
          strokeW: 0.55
        });

        // O icônico badge de competição "R.S." em vermelho vibrante
        CarArt.drawEmblemText(c, 'R.S.', rx + 19.5 * sx, 6.2, {
          font: 'bold 3.8px sans-serif',
          align: 'right',
          fill: '#EF4444',
          stroke: '#450A0A',
          strokeW: 0.7,
          shadowOffset: 0.55
        });

        // 7. Para-choque esportivo com difusor aerodinâmico e dupla saída de escape
        const bmp = c.createLinearGradient(0, 11.0, 0, 20.2);
        bmp.addColorStop(0, CarArt.shade(body, -14));
        bmp.addColorStop(0.5, '#1E242C');
        bmp.addColorStop(1, '#0C0F14');
        CarArt.roundRect(c, rx - 34.0 * sx, 11.2, 68.0 * sx, 9.0, 1.8, bmp, out, 1.4);

        // Difusor aerodinâmico inferior funcional com aletas verticais
        CarArt.roundRect(c, rx - 24.0 * sx, 16.5, 48.0 * sx, 3.8, 1.0, '#090C10', out, 0.85);
        for (let a = -2; a <= 2; a++) {
          CarArt.line(c, rx + a * 5.2 * sx, 16.5, rx + a * 5.2 * sx, 20.3, '#1E293B', 1.2);
        }

        // Refletores vermelhos horizontais integrados
        CarArt.roundRect(c, rx - 31.0 * sx, 13.5, 4.5 * sx, 1.8, 0.5, '#DC2626', '#0E131B', 0.5);
        CarArt.roundRect(c, rx + 26.5 * sx, 13.5, 4.5 * sx, 1.8, 0.5, '#DC2626', '#0E131B', 0.5);

        // Luzes de placa duplas e placa Mercosul
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.5, 12.0, 2.2, 0.6);
        c.fillRect(rx + 3.3, 12.0, 2.2, 0.6);

        CarArt.drawPlateStraight(c, rx - 9.5, 12.8, 19.0, 5.0);
        // Dupla ponteira de escape cromada na esquerda
        CarArt.drawExhaustPipe(c, rx - 20.0 * sx, 20.6, 2.0);
        CarArt.drawExhaustPipe(c, rx - 15.5 * sx, 20.6, 2.0);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 17. FIAT MOBI (Tampa traseira 100% vidro preto)
    {
      id: 'mobi',
      name: 'FIAT MOBI',
      badge: 'TAMPA DE VIDRO TOTAL - SUBCOMPACTO ÁGIL',
      desc: 'O subcompacto com a inconfundível tampa traseira toda em vidro escurecido temperado! Super ágil e direto no tráfego.',
      maxSpeed: 246,
      acceleration: 0.81,
      braking: 0.86,
      handling: 0.92,
      grip: 0.88,
      centrifugalResistance: 0.89,
      primaryColor: '#F5C400',
      roofColor: '#1A1810',
      exhaustPipes: [[-16.0, 21.4]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi compacto e pneus
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 30.0 * sx, 17.6, 9.0 * sx, 4.2);
        c.fillRect(rx + 21.0 * sx, 17.6, 9.0 * sx, 4.2);

        CarArt.drawRearTire(c, rx - 30.8 * sx, 13, 9.4, 11.2);
        CarArt.drawRearTire(c, rx + 21.4 * sx, 13, 9.4, 11.2);

        // Antena no teto
        CarArt.line(c, tx + 1.2 * sx, -23.5, tx + 4.2 * sx, -30.0, '#11151D', 1.2);

        // 2. Carroceria cúbica e curtinha com linha de cintura alta
        const shape = { roofY: -23.5, roofW: 19.5, shY: -6.0, shW: 30.5, midY: 5.0, midW: 32.5, botY: 20.0, botW: 30.8, round: 5.2, arch: 1.2 };
        CarArt.curvedBody(c, tx, rx, sx, shape);
        c.fillStyle = CarArt.bodyGrad(c, body, -24, 20);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.4;
        c.stroke();

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 30.8 * sx, roofW: 19.5 * sx,
          roofY: -23.5, beltY: -6.0, botY: 20.0, wheelStyle: 'steel', mirrorColor: '#1A202A', curvedRoof: true
        });

        // Retrovisores altos pretos do Fiat Mobi
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 28.0, w: 5.0, h: 3.6, y: -9.5, r: 1.4, color: '#1A202A', stemDist: 24.0, stemY: -6.8 });

        // Brake-light no topo do vidro
        const blColMobi = isBraking ? '#FF1E00' : (isNight ? '#881216' : '#2A1014');
        CarArt.roundRect(c, tx - 5.5 * sx, -23.0, 11.0 * sx, 1.4, 0.5, blColMobi, null, 0);
        if (isBraking) {
          CarArt.drawTailGlow(c, tx, -22.3, 3.4, 1.6, true, isNight);
        }

        // 3. A MARCA REGISTRADA DO MOBI: TAMPA DO PORTA-MALAS 100% EM VIDRO PRETO BRILHANTE!
        // Guarnição emborrachada perimetral
        CarArt.roundRect(c, rx - 25.0 * sx, -21.4, 50.0 * sx, 32.8, 2.8, '#0A0E17', out, 1.4);

        // Vidro temperado escurecido com gradiente de profundidade
        const glassGrad = c.createLinearGradient(0, -21, 0, 11);
        glassGrad.addColorStop(0, '#0F172A');
        glassGrad.addColorStop(0.35, '#1E293B');
        glassGrad.addColorStop(0.85, '#0F172A');
        glassGrad.addColorStop(1, '#090D16');
        CarArt.roundRect(c, rx - 24.2 * sx, -20.6, 48.4 * sx, 31.2, 2.2, glassGrad, null, 0);

        // Reflexo especular elegante no vidro da tampa
        c.fillStyle = 'rgba(255, 255, 255, 0.18)';
        c.beginPath();
        c.moveTo(rx - 20.0 * sx, -19.0);
        c.lineTo(rx - 10.0 * sx, -19.0);
        c.lineTo(rx - 17.5 * sx, 7.5);
        c.lineTo(rx - 22.5 * sx, 7.5);
        c.closePath();
        c.fill();

        // Filamentos horizontais do desembaçador térmico embutidos no vidro
        for (let l = 1; l <= 4; l++) {
          const dy = -18.2 + l * 2.8;
          const w = (18.5 + l * 1.2) * sx;
          CarArt.line(c, rx - w, dy, rx + w, dy, 'rgba(234, 88, 12, 0.42)', 0.65);
        }

        // Limpador traseiro articulado com base no vidro
        CarArt.line(c, rx - 1.0, -4.5, rx + 11.5 * sx, -9.5, '#0B0F18', 1.6);
        CarArt.line(c, rx + 2.8 * sx, -6.0, rx + 12.0 * sx, -9.8, '#1E293B', 0.95);
        c.fillStyle = '#0B0F18';
        c.beginPath();
        c.arc(rx - 1.0, -4.5, 1.5, 0, Math.PI * 2);
        c.fill();

        // 4. Lanternas Cúbicas em Relevo 3D nos Cantos Superiores (volumosas nas colunas)
        const drawMobiLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -31.2 * sx;
          const lw = 8.2 * sx;

          // Moldura preta volumosa com relevo
          CarArt.roundRect(c, lx - 0.4, -4.5, lw + 0.8, 12.2, 2.2, '#10141D', out, 1.15);

          // Câmara superior: freio e posição vermelha rubi
          CarArt.roundRect(c, lx, -4.0, lw, 5.2, 1.6, tailRed, '#1A212B', 0.8);
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.35)';
          c.fillRect(lx + 0.6 * sx, -3.2, lw - 1.2 * sx, 1.0);

          // Câmara intermediária: pisca âmbar
          c.fillStyle = '#D97706';
          c.fillRect(lx + 0.6 * sx, 1.6, lw - 1.2 * sx, 2.8);
          c.fillStyle = '#F59E0B';
          c.fillRect(lx + 0.8 * sx, 1.8, lw - 1.6 * sx, 0.8);
          CarArt.line(c, lx + 0.6 * sx, 3.0, lx + lw - 0.6 * sx, 3.0, '#92400E', 0.5);

          // Divisória preta
          CarArt.line(c, lx, 4.6, lx + lw, 4.6, '#0B0F15', 0.8);

          // Câmara inferior: ré cristal e catadióptrico
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 0.6 * sx, 4.8, lw - 1.2 * sx, 2.6);
          c.fillStyle = '#FFFFFF';
          c.fillRect(lx + 0.8 * sx, 5.0, lw - 1.6 * sx, 0.8);

          CarArt.drawTailGlow(c, lx + 4.1 * sx, 0.5, 4.8, 4.8, isBraking, isNight);
          c.restore();
        };
        drawMobiLamp(true);
        drawMobiLamp(false);

        // 5. Inscrições e Emblemas sobre o Vidro Traseiro
        // Logo FIAT prateado cromado central sobre o vidro preto
        CarArt.drawEmblemText(c, 'FIAT', rx, 4.8, {
          font: 'bold 4.8px sans-serif',
          align: 'center',
          fill: '#F8FAFC',
          strokeW: 0.8,
          shadowOffset: 0.6
        });

        // Fiat Flag (as 4 barras coloridas da nova identidade italiana)
        const flagColors = ['#15803D', '#FFFFFF', '#B91C1C', '#B91C1C'];
        for (let f = 0; f < 4; f++) {
          CarArt.line(c, rx + 6.8 + f * 1.3, 4.6, rx + 7.6 + f * 1.3, 2.2, flagColors[f], 0.8);
        }

        // Letreiro cromado "MOBI" no canto inferior esquerdo do vidro
        CarArt.drawEmblemText(c, 'MOBI', rx - 20.0 * sx, 7.8, {
          font: 'bold 3.2px sans-serif',
          align: 'left',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Badge de versão no canto inferior direito do vidro
        CarArt.drawEmblemText(c, 'LIKE', rx + 20.0 * sx, 7.8, {
          font: 'bold 2.4px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.5
        });

        // Botão elétrico de abertura da tampa no vidro
        c.fillStyle = '#1E293B';
        c.beginPath();
        c.arc(rx, 8.4, 1.2, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#475569';
        c.lineWidth = 0.5;
        c.stroke();

        // 6. Para-choque inferior robusto com acabamento preto texturizado
        const bmp = c.createLinearGradient(0, 11.0, 0, 20.0);
        bmp.addColorStop(0, '#2D3540');
        bmp.addColorStop(0.5, '#1A202A');
        bmp.addColorStop(1, '#11151D');
        CarArt.roundRect(c, rx - 32.2 * sx, 11.0, 64.4 * sx, 9.0, 2.0, bmp, out, 1.3);

        // Luzes de placa duplas e placa Mercosul
        c.fillStyle = '#E2E8F0';
        c.fillRect(rx - 5.0, 12.2, 2.2, 0.6);
        c.fillRect(rx + 2.8, 12.2, 2.2, 0.6);

        CarArt.drawPlateStraight(c, rx - 8.8, 13.0, 17.6, 4.8);
        CarArt.drawExhaustPipe(c, rx - 16.0 * sx, 20.8, 1.8);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 18. VW SANTANA (O clássico sedã executivo de luxo)
    {
      id: 'santana',
      name: 'VW SANTANA GLSi',
      badge: 'O SEDÃ EXECUTIVO DE LUXO - TANQUE NA RETA',
      desc: 'O clássico sedã executivo brasileiro! Três volumes elegantes, aerofólio na tampa e grande velocidade final de 2.0 litros.',
      maxSpeed: 286,
      acceleration: 0.84,
      braking: 0.87,
      handling: 0.72,
      grip: 0.82,
      centrifugalResistance: 0.84,
      primaryColor: '#181B21',
      roofColor: '#12151B',
      exhaustPipes: [[-18.5, 21.5]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        CarArt.drawRearTire(c, rx - 33.5 * sx, 13, 10.4, 11.2);
        CarArt.drawRearTire(c, rx + 22.5 * sx, 13, 10.4, 11.2);

        // Carroceria clássica sedã 3 volumes com porta-malas saliente
        const rearBody = [
          [tx - 25.5 * sx, -23.0], [tx + 25.5 * sx, -23.0],
          [rx + 33.5 * sx, -6.0],  [rx + 34.2 * sx, 13.5],
          [rx - 34.2 * sx, 13.5],  [rx - 33.5 * sx, -6.0]
        ];
        CarArt.poly(c, rearBody, CarArt.bodyGrad(c, body, -23, 14), out, 1.45);

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 33.5 * sx, roofW: 25.5 * sx,
          roofY: -23.0, beltY: -6.0, botY: 13.5, wheelStyle: 'alloy', mirrorColor: '#151922'
        });

        // Retrovisores retangulares executivos do Santana
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 30.5, w: 5.2, h: 3.5, y: -9.5, r: 1.0, color: body, stemDist: 26.0, stemY: -6.8 });

        // Vidro traseiro amplo com moldura cromada
        CarArt.drawGlassQuad(c, [
          [tx - 22.5 * sx, -20.5], [tx + 22.5 * sx, -20.5],
          [rx + 28.5 * sx, -6.5],  [rx - 28.5 * sx, -6.5]
        ]);
        CarArt.line(c, rx - 28.0 * sx, -6.5, rx + 28.0 * sx, -6.5, '#CBD5E1', 0.9);

        // Aerofólio de borracha sutil na tampa do porta-malas clássico dos modelos GLSi/Executivos
        CarArt.roundRect(c, rx - 30.5 * sx, -6.2, 61.0 * sx, 2.5, 0.8, '#141822', out, 1.0);

        // AS GRANDES LANTERNAS HORIZONTAIS FRISADAS DO SANTANA (MARCA REGISTRADA)
        const drawSantanaLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -33.2 * sx;
          CarArt.roundRect(c, lx, 0.5, 12.5 * sx, 8.5, 0.8, tailRed, out, 1.0);
          c.fillStyle = '#D97706';
          c.fillRect(lx + 0.6 * sx, 1.2, 4.4 * sx, 3.2);
          c.fillStyle = '#E2E8F0';
          c.fillRect(lx + 5.5 * sx, 5.0, 5.5 * sx, 2.8);
          // Frisos horizontais pretos característicos
          for (let f = 1; f <= 3; f++) {
            CarArt.line(c, lx, 0.5 + f * 2.1, lx + 12.5 * sx, 0.5 + f * 2.1, '#0F131A', 0.8);
          }
          CarArt.drawTailGlow(c, lx + 6.2 * sx, 4.5, 5.5, 4.5, isBraking, isNight);
          c.restore();
        };
        drawSantanaLamp(true);
        drawSantanaLamp(false);

        // Centro com letreiro Santana 2000 e logo VW
        c.fillStyle = '#111622';
        c.fillRect(rx - 20.0 * sx, 0.5, 40.0 * sx, 8.5);
        c.fillStyle = '#CBD5E1';
        c.beginPath();
        c.arc(rx, 4.8, 2.5, 0, Math.PI * 2);
        c.fill();
        CarArt.drawEmblemText(c, 'Santana', rx - 4.5 * sx, 6.0, {
          font: 'bold 3.2px sans-serif',
          align: 'right',
          fill: '#F8FAFC',
          strokeW: 0.6
        });
        CarArt.drawEmblemText(c, '2000', rx + 4.5 * sx, 6.0, {
          font: 'bold 3.2px sans-serif',
          align: 'left',
          fill: '#EF4444',
          stroke: '#450A0A',
          strokeW: 0.6,
          shadowOffset: 0.5
        });

        // Para-choque clássico com friso cromado
        const bmp = c.createLinearGradient(0, 11.2, 0, 20.2);
        bmp.addColorStop(0, '#262D38');
        bmp.addColorStop(0.5, '#1A2028');
        bmp.addColorStop(1, '#0E131A');
        CarArt.roundRect(c, rx - 34.5 * sx, 11.2, 69.0 * sx, 9.0, 1.8, bmp, out, 1.35);
        // Friso cromado no para-choque
        CarArt.line(c, rx - 33.5 * sx, 13.0, rx + 33.5 * sx, 13.0, '#E2E8F0', 1.0);

        CarArt.drawPlateStraight(c, rx - 9.5, 13.5, 19.0, 5.0);
        CarArt.drawExhaustPipe(c, rx - 18.5 * sx, 21.0, 2.1);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 19. RURAL WILLYS (A lenda 4x4 saia-e-blusa dois tons)
    {
      id: 'rural',
      name: 'RURAL WILLYS',
      badge: 'A LENDA 4X4 - FORÇA BRUTA & SAIA-E-BLUSA',
      desc: 'A clássica Rural Willys brasileira! Pintura saia-e-blusa em dois tons, chassi de aço maciço e tração brutal na chuva e na terra.',
      maxSpeed: 236,
      acceleration: 0.88,
      braking: 0.78,
      handling: 0.68,
      grip: 0.95,
      centrifugalResistance: 0.86,
      primaryColor: '#1E63C9',
      roofColor: '#F8FAFC',
      exhaustPipes: [[-19.5, 21.8]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, chassi maciço 4x4 e pneus lameiros
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 32.5 * sx, 17.6, 9.5 * sx, 4.2);
        c.fillRect(rx + 22.0 * sx, 17.6, 9.5 * sx, 4.2);

        // Diferencial traseiro Dana / eixo rígido do 4x4 sob o chassi
        CarArt.line(c, rx - 18.0 * sx, 20.0, rx + 18.0 * sx, 20.0, '#333D4B', 2.0);
        CarArt.roundRect(c, rx - 4.5 * sx, 18.2, 9.0 * sx, 4.6, 2.2, '#1E2530', out, 0.85);

        // Gancho de reboque de aço na base traseira
        c.strokeStyle = '#64748B';
        c.lineWidth = 1.4;
        c.strokeRect(rx + 16.0 * sx, 20.2, 4.2 * sx, 3.0);

        // Pneus largos altos de 4x4
        CarArt.drawRearTire(c, rx - 33.0 * sx, 12, 11.2, 12.2);
        CarArt.drawRearTire(c, rx + 22.2 * sx, 12, 11.2, 12.2);

        // 2. Carroceria alta imponente de aço
        const ruralBody = [
          [tx - 25.0 * sx, -25.0], [tx + 25.0 * sx, -25.0],
          [rx + 33.0 * sx, -6.0],  [rx + 33.8 * sx, 13.5],
          [rx - 33.8 * sx, 13.5],  [rx - 33.0 * sx, -6.0]
        ];
        CarArt.poly(c, ruralBody, CarArt.bodyGrad(c, body, -25, 14), out, 1.5);

        // PINTURA CLÁSSICA SAIA-E-BLUSA (TETO E COLUNAS SUPERIORES EM BRANCO VINTAGE)
        const twoToneRoof = [
          [tx - 25.0 * sx, -25.0], [tx + 25.0 * sx, -25.0],
          [rx + 30.5 * sx, -6.5],  [rx - 30.5 * sx, -6.5]
        ];
        CarArt.poly(c, twoToneRoof, '#F8FAFC', out, 1.2);

        // Friso cromado divisório largo em relevo entre as duas cores
        CarArt.line(c, rx - 32.5 * sx, -6.5, rx + 32.5 * sx, -6.5, '#F1F5F9', 1.6);
        CarArt.line(c, rx - 32.5 * sx, -5.8, rx + 32.5 * sx, -5.8, '#64748B', 0.6);

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 33.0 * sx, roofW: 25.0 * sx,
          roofY: -25.0, beltY: -6.0, botY: 13.5, wheelStyle: 'steel', mirrorColor: '#E2E8F0'
        });

        // Retrovisores redondos cromados da Rural Willys em haste de aço
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 28.5, w: 4.8, h: 4.8, y: -10.5, r: 2.4, color: '#E2E8F0', stemDist: 24.5, stemY: -7.5 });

        // 3. Vidro traseiro bipartido clássico de época com borracha preta e montante central de aço
        CarArt.poly(c, [
          [tx - 22.5 * sx, -23.0], [tx + 22.5 * sx, -23.0],
          [rx + 27.5 * sx, -7.5],  [rx - 27.5 * sx, -7.5]
        ], '#12161F', out, 1.25);

        CarArt.drawGlassQuad(c, [
          [tx - 21.5 * sx, -22.5], [tx + 21.5 * sx, -22.5],
          [rx + 26.5 * sx, -8.0],  [rx - 26.5 * sx, -8.0]
        ]);
        // Montante central de aço dividindo o vidro traseiro em dois
        CarArt.line(c, rx, -22.5, rx, -7.5, '#475569', 1.8);
        CarArt.line(c, rx - 0.4, -22.5, rx - 0.4, -7.5, '#E2E8F0', 0.7);

        // 4. Tampa Traseira Bipartida de Aço: Vincos estampados, dobradiças e maçaneta
        // Vincos horizontais estampados na chapa de aço da Rural
        CarArt.line(c, rx - 24.0 * sx, 1.5, rx + 24.0 * sx, 1.5, CarArt.shade(body, -35), 1.3);
        CarArt.line(c, rx - 24.0 * sx, 2.0, rx + 24.0 * sx, 2.0, CarArt.shade(body, 28), 0.7);
        CarArt.line(c, rx - 24.0 * sx, 6.8, rx + 24.0 * sx, 6.8, CarArt.shade(body, -35), 1.3);
        CarArt.line(c, rx - 24.0 * sx, 7.3, rx + 24.0 * sx, 7.3, CarArt.shade(body, 28), 0.7);

        // Fresta / contorno da tampa inferior
        c.strokeStyle = CarArt.shade(body, -42);
        c.lineWidth = 1.0;
        c.strokeRect(rx - 25.5 * sx, -5.2, 51.0 * sx, 16.2);

        // Dobradiças cromadas externas de época nas laterais inferiores da tampa
        CarArt.roundRect(c, rx - 24.5 * sx, 9.8, 3.0 * sx, 1.8, 0.5, '#E2E8F0', out, 0.6);
        CarArt.roundRect(c, rx + 21.5 * sx, 9.8, 3.0 * sx, 1.8, 0.5, '#E2E8F0', out, 0.6);

        // Letreiro cromado clássico "WILLYS" estampado em relevo no centro
        CarArt.drawEmblemText(c, 'WILLYS', rx, 4.2, {
          font: 'bold 3.2px sans-serif',
          align: 'center',
          fill: '#F8FAFC',
          strokeW: 0.6
        });

        // Maçaneta giratória cromada central com miolo de chave
        CarArt.roundRect(c, rx - 3.2 * sx, 8.4, 6.4 * sx, 1.8, 0.6, '#F1F5F9', out, 0.7);
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 0.3, 8.8, 0.6, 0.8);

        // 5. Lanternas ovais verticais clássicas com aro cromado largo e lente rubi "gema"
        const drawRuralLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -28.8 * sx;

          // Aro cromado externo duplo em relevo
          c.fillStyle = '#F1F5F9';
          c.beginPath();
          c.ellipse(lx, 2.0, 4.2 * sx, 6.4, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 1.0;
          c.stroke();

          // Lente vermelha rubi "gema" abaulada
          c.fillStyle = tailRed;
          c.beginPath();
          c.ellipse(lx, 2.0, 3.2 * sx, 5.2, 0, 0, Math.PI * 2);
          c.fill();

          // Estrias da lente
          CarArt.line(c, lx - 2.0 * sx, 1.0, lx + 2.0 * sx, 1.0, '#58080C', 0.55);
          CarArt.line(c, lx - 2.0 * sx, 3.0, lx + 2.0 * sx, 3.0, '#58080C', 0.55);

          // Ponto de luz / brilho central
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.4)';
          c.beginPath();
          c.arc(lx, 1.2, 0.85, 0, Math.PI * 2);
          c.fill();

          CarArt.drawTailGlow(c, lx, 2.0, 4.8, 4.8, isBraking, isNight);
          c.restore();
        };
        drawRuralLamp(true);
        drawRuralLamp(false);

        // 6. PARA-CHOQUE MACIÇO CROMADO DE AÇO COM BATENTES (POLEIROS) VERTICAIS
        const chrGrad = c.createLinearGradient(0, 11.0, 0, 18.0);
        chrGrad.addColorStop(0, '#FFFFFF');
        chrGrad.addColorStop(0.35, '#CBD5E1');
        chrGrad.addColorStop(0.7, '#94A3B8');
        chrGrad.addColorStop(1, '#64748B');
        CarArt.roundRect(c, rx - 34.5 * sx, 11.0, 69.0 * sx, 6.0, 1.5, chrGrad, out, 1.4);

        // Os dois grandes batentes (poleiros) verticais cromados com garras de ferro
        const drawPoleiro = (gx) => {
          CarArt.roundRect(c, gx, 9.6, 3.8 * sx, 8.4, 1.2, '#F8FAFC', out, 1.0);
          CarArt.line(c, gx + 1.9 * sx, 10.2, gx + 1.9 * sx, 17.2, '#94A3B8', 0.7);
        };
        drawPoleiro(rx - 16.2 * sx);
        drawPoleiro(rx + 12.4 * sx);

        // Luz de placa cromada e placa Mercosul
        CarArt.roundRect(c, rx - 3.5 * sx, 9.8, 7.0 * sx, 1.8, 0.6, '#F1F5F9', out, 0.6);
        CarArt.drawPlateStraight(c, rx - 9.0, 12.0, 18.0, 4.8);
        CarArt.drawExhaustPipe(c, rx - 19.5 * sx, 21.0, 2.2);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    },

    // 20. VW KOMBI (A clássica Corujinha / Standard)
    {
      id: 'kombi',
      name: 'KOMBI CORUJINHA',
      badge: 'A INESQUECÍVEL PERUA - LENDA NACIONAL',
      desc: 'O veículo mais carismático do planeta! Silhueta vertical alta, motor boxer traseiro a ar e capacidade de levar a torcida inteira.',
      maxSpeed: 230,
      acceleration: 0.69,
      braking: 0.79,
      handling: 0.66,
      grip: 0.88,
      centrifugalResistance: 0.78,
      primaryColor: '#EEF2F6',
      roofColor: '#1E63C9',
      exhaustPipes: [[-17.0, 21.6]],
      drawHD(c, body, turn, isBraking, isNight) {
        const out = CarArt.OUTLINE;
        const at = Math.abs(turn);
        const rx = -turn * 4.6;
        const tx = -turn * 2.2;
        const sx = 1 - at * 0.05;
        const tailRed = isBraking ? '#FF0500' : (isNight ? '#FF2A2A' : '#4A080C');

        // 1. Assoalho inferior, cárter Boxer e pneus com calotas
        c.fillStyle = '#0B0F16';
        c.fillRect(rx - 31.0 * sx, 17.6, 9.0 * sx, 4.2);
        c.fillRect(rx + 22.0 * sx, 17.6, 9.0 * sx, 4.2);

        // Bloco/cárter inferior do motor Boxer refrigerado a ar
        CarArt.roundRect(c, rx - 9.0 * sx, 18.2, 18.0 * sx, 3.4, 1.2, '#2C333E', out, 0.8);

        CarArt.drawRearTire(c, rx - 31.8 * sx, 13, 10.0, 11.2);
        CarArt.drawRearTire(c, rx + 21.8 * sx, 13, 10.0, 11.2);

        // 2. Silhueta de perua/furgão alto com cantos curvos e teto em cúpula da Kombi Corujinha
        const kombiBody = [
          [tx - 26.5 * sx, -26.0], [tx + 26.5 * sx, -26.0],
          [rx + 32.5 * sx, -8.0],  [rx + 33.0 * sx, 14.0],
          [rx - 33.0 * sx, 14.0],  [rx - 32.5 * sx, -8.0]
        ];
        CarArt.poly(c, kombiBody, CarArt.bodyGrad(c, body, -26, 14), out, 1.5);

        // Teto em cúpula arredondada com friso da calha de chuva envolvente
        c.fillStyle = CarArt.shade(body, 14);
        c.beginPath();
        c.ellipse(tx, -25.5, 26.5 * sx, 3.2, 0, Math.PI, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 1.2;
        c.stroke();
        // Calha de chuva envolvente (marca registrada da Kombi!)
        CarArt.line(c, tx - 26.2 * sx, -25.0, tx + 26.2 * sx, -25.0, '#334155', 1.0);

        CarArt.drawDiscreetSideFlank(c, body, turn, {
          rx, tx, rearW: 33.0 * sx, roofW: 26.5 * sx,
          roofY: -26.0, beltY: -8.0, botY: 14.0, wheelStyle: 'hubcap', mirrorColor: '#DCE5EE'
        });

        // Retrovisores redondos cromados clássicos da Kombi Corujinha
        CarArt.drawDualMirrors(c, tx, sx, turn, { dist: 28.5, w: 4.8, h: 4.8, y: -11.0, r: 2.4, color: '#DCE5EE', stemDist: 24.5, stemY: -7.8 });

        // 3. Vigia traseira clássica pequena com cantos arredondados da Corujinha
        CarArt.poly(c, [
          [tx - 22.0 * sx, -23.2], [tx + 22.0 * sx, -23.2],
          [rx + 25.5 * sx, -9.5],  [rx - 25.5 * sx, -9.5]
        ], '#12161F', out, 1.25);

        CarArt.drawGlassQuad(c, [
          [tx - 21.0 * sx, -22.5], [tx + 21.0 * sx, -22.5],
          [rx + 24.5 * sx, -10.0], [rx - 24.5 * sx, -10.0]
        ]);
        // Friso cinza/cromado inserido na borracha do vidro
        CarArt.line(c, rx - 24.0 * sx, -10.0, rx + 24.0 * sx, -10.0, '#CBD5E1', 0.8);

        // 4. Tampa do Motor Boxer Curva: Grelha de aletas, dobradiças e maçaneta em "T"
        // Fresta / contorno curvo da tampa do motor
        c.strokeStyle = CarArt.shade(body, -42);
        c.lineWidth = 1.0;
        c.strokeRect(rx - 22.0 * sx, -4.0, 44.0 * sx, 15.0);

        // Dobradiças cromadas externas clássicas da tampa do motor
        CarArt.roundRect(c, rx - 20.0 * sx, -4.5, 2.6 * sx, 1.8, 0.4, '#E2E8F0', out, 0.6);
        CarArt.roundRect(c, rx + 17.4 * sx, -4.5, 2.6 * sx, 1.8, 0.4, '#E2E8F0', out, 0.6);

        // Aletas de ventilação horizontais estampadas da tampa do motor Boxer
        for (let l = 1; l <= 4; l++) {
          const ly = -2.5 + l * 2.2;
          CarArt.line(c, rx - 16.0 * sx, ly, rx + 16.0 * sx, ly, '#0F141C', 1.2);
          CarArt.line(c, rx - 16.0 * sx, ly + 0.5, rx + 16.0 * sx, ly + 0.5, '#475569', 0.5);
        }

        // O GRANDE EMBLEMA CLÁSSICO REDONDO VW CROMADO NO CENTRO DA TAMPA
        c.fillStyle = '#F1F5F9';
        c.beginPath();
        c.arc(rx, 7.5, 3.8, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = out;
        c.lineWidth = 0.85;
        c.stroke();
        c.fillStyle = '#1E3A8A';
        c.beginPath();
        c.arc(rx, 7.5, 3.0, 0, Math.PI * 2);
        c.fill();
        // Logo estilizado VW
        CarArt.line(c, rx - 1.5, 6.2, rx, 9.0, '#FFFFFF', 0.8);
        CarArt.line(c, rx + 1.5, 6.2, rx, 9.0, '#FFFFFF', 0.8);
        CarArt.line(c, rx - 1.4, 6.2, rx - 0.6, 9.2, '#FFFFFF', 0.7);
        CarArt.line(c, rx + 1.4, 6.2, rx + 0.6, 9.2, '#FFFFFF', 0.7);

        // Puxador / maçaneta giratória em "T" cromada clássica da Kombi
        CarArt.roundRect(c, rx - 2.8 * sx, 12.2, 5.6 * sx, 1.6, 0.6, '#F8FAFC', out, 0.65);
        c.fillStyle = '#0F172A';
        c.fillRect(rx - 0.4, 12.6, 0.8, 0.8);

        // 5. Lanternas redondinhas clássicas "olho de gato" da Corujinha
        const drawKombiLamp = (isLeft) => {
          c.save();
          c.translate(rx, 0);
          if (!isLeft) c.scale(-1, 1);
          const lx = -26.8 * sx;

          // Aro cromado externo saliente
          c.fillStyle = '#F8FAFC';
          c.beginPath();
          c.arc(lx, 4.5, 4.2 * sx, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = out;
          c.lineWidth = 0.95;
          c.stroke();

          // Lente vermelha rubi de posição e freio
          c.fillStyle = tailRed;
          c.beginPath();
          c.arc(lx, 4.5, 3.2 * sx, 0, Math.PI * 2);
          c.fill();

          // Meia-lua superior de pisca âmbar
          c.fillStyle = '#D97706';
          c.beginPath();
          c.arc(lx, 3.2, 2.2 * sx, 0, Math.PI);
          c.fill();
          c.fillStyle = '#F59E0B';
          c.beginPath();
          c.arc(lx, 3.2, 1.6 * sx, 0, Math.PI);
          c.fill();

          // Friso cromado de divisão
          CarArt.line(c, lx - 2.8 * sx, 3.2, lx + 2.8 * sx, 3.2, '#E2E8F0', 0.65);

          // Ponto de luz / brilho central
          c.fillStyle = isBraking ? '#FFAAA5' : 'rgba(255, 255, 255, 0.4)';
          c.beginPath();
          c.arc(lx, 5.2, 0.85, 0, Math.PI * 2);
          c.fill();

          CarArt.drawTailGlow(c, lx, 4.5, 4.6, 4.6, isBraking, isNight);
          c.restore();
        };
        drawKombiLamp(true);
        drawKombiLamp(false);

        // 6. Para-choque clássico de chapa curva branca vintage com pontas arredondadas
        const chrGrad = c.createLinearGradient(0, 11.5, 0, 18.5);
        chrGrad.addColorStop(0, '#FFFFFF');
        chrGrad.addColorStop(0.4, '#F1F5F9');
        chrGrad.addColorStop(0.7, '#CBD5E1');
        chrGrad.addColorStop(1, '#94A3B8');
        CarArt.roundRect(c, rx - 33.5 * sx, 11.5, 67.0 * sx, 6.2, 2.2, chrGrad, out, 1.4);

        // Vinco horizontal estampado na lâmina do para-choque
        CarArt.line(c, rx - 31.5 * sx, 14.5, rx + 31.5 * sx, 14.5, '#64748B', 0.8);

        // Suporte cromado da placa e placa Mercosul
        CarArt.roundRect(c, rx - 3.5 * sx, 10.6, 7.0 * sx, 1.8, 0.6, '#E2E8F0', out, 0.6);
        CarArt.drawPlateStraight(c, rx - 9.0, 12.5, 18.0, 4.8);
        CarArt.drawExhaustPipe(c, rx - 17.0 * sx, 21.0, 1.9);
      },
      render: function(ctx, x, y, w, h, isBraking, steer = 0, customBody = null, opts = null) {
        CarArt.renderModel(ctx, this, x, y, w, h, isBraking, steer, customBody, opts);
      }
    }
  ];

  // ==========================================
  // CORES DOS CARROS, PILOTOS CLÁSSICOS DA F1 E AMBIENTES (HORÁRIO + CLIMA)
  // ==========================================
  const CAR_COLORS = [
    { id: 'vermelho', name: 'VERMELHO', hex: '#D1232B' },
    { id: 'branco',   name: 'BRANCO',   hex: '#EEF2F6' },
    { id: 'amarelo',  name: 'AMARELO',  hex: '#F5C400' },
    { id: 'azul',     name: 'AZUL',     hex: '#1E63C9' },
    { id: 'preto',    name: 'PRETO',    hex: '#181B21' },
    { id: 'verde',    name: 'VERDE',    hex: '#1F9444' },
    { id: 'prata',    name: 'PRATA',    hex: '#94A3B8' },
    { id: 'laranja',  name: 'LARANJA',  hex: '#EA580C' },
    { id: 'roxo',     name: 'ROXO',     hex: '#7E22CE' },
    { id: 'vinho',    name: 'VINHO',    hex: '#881337' }
  ];
  const MODEL_DEFAULT_COLOR = {
    uno: 1, fusca: 3, peugeot: 1, hb20: 0, opala: 2, gol: 0, chevette: 3, brasilia: 2,
    corsa: 3, celta: 0, onix: 1, ka: 3, palio: 4, kwid: 2, focus: 3, sandero: 0, mobi: 2, santana: 4, rural: 3, kombi: 1
  };

  const ColorUtil = {
    _cache: new Map(),
    clamp(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); },
    parse(col) {
      let v = this._cache.get(col);
      if (v) return v;
      let r = 128, g = 128, b = 128;
      if (col.charAt(0) === '#') {
        let h = col.slice(1);
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16);
        r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
      } else {
        const m = col.match(/\d+(\.\d+)?/g);
        if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2]; }
      }
      v = [r, g, b];
      this._cache.set(col, v);
      return v;
    },
    css(rgb) {
      return `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
    },
    mix(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    },
    xform(col, mul, add, sat) {
      const p = this.parse(col);
      let R = p[0] * mul[0] + add[0];
      let G = p[1] * mul[1] + add[1];
      let B = p[2] * mul[2] + add[2];
      const l = 0.3 * R + 0.59 * G + 0.11 * B;
      R = l + (R - l) * sat;
      G = l + (G - l) * sat;
      B = l + (B - l) * sat;
      return [this.clamp(R), this.clamp(G), this.clamp(B)];
    }
  };

