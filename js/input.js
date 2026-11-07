  class InputManager {
    constructor(onUserGesture = null, onViewportChange = null) {
      this.game = null;
      this.onUserGesture = onUserGesture;
      this.onViewportChange = onViewportChange;

      this.keys = { up: false, down: false, left: false, right: false, nitro: false, leaderboard: false };
      this.touch = {
        dpadUp: false,
        dpadDown: false,
        dpadLeft: false,
        dpadRight: false,
        btnY: false,     // Nitro (Y - Amarelo)
        btnX: false,     // Freio (X - Vermelho)
        btnB: false,     // HUD F1 (B - Azul/Ciano)
        btnA: false,     // Acelera (A - Verde)
        btn1Nitro: false,
        btn2Brake: false,
        btn3Gas: false
      };

      this.up = false;
      this.down = false;
      this.left = false;
      this.right = false;
      this.nitro = false;
      this.leaderboard = false;
      this.enter = false;
      this.esc = false;
      this.keyM = false;

      this.justPressedUp = false;
      this.justPressedDown = false;
      this.justPressedLeft = false;
      this.justPressedRight = false;
      this.justPressedEnter = false;
      this.justPressedEsc = false;
      this.justPressedM = false;
      this.justPressedNitro = false;
      this.justPressedLeaderboard = false;
      this.justPressedColor = false;
      this.lastDigit = null;
      this.lastCanvasClick = null;
      this.mouseCanvasPos = null;

      // Suporte nativo a Gamepads / Joysticks (Xbox XInput/DInput, Gamesir, etc.)
      this.gamepadConnected = false;
      this.gamepadName = '';
      this.gamepadBannerTimer = 0;
      this.analogSteer = 0;
      this.throttlePressure = 0;
      this.brakePressure = 0;
      this.gpThrottlePressure = 0;
      this.gpBrakePressure = 0;
      this.gpActiveGas = false;
      this.gpActiveBrake = false;
      this.gpActiveLeft = false;
      this.gpActiveRight = false;
      this.gpActiveNitro = false;
      this.gpLeaderboard = false;
      this.prevGamepadButtons = {};

      this.isMobileDevice = this.detectMobile();
      this.touchControlsVisible = this.isMobileDevice;
      this.userExitedFullscreen = false;

      this.dpadOpacity = this.loadOpacity('lh44_dpad_opacity', 0.78);
      this.btnsOpacity = this.loadOpacity('lh44_btns_opacity', 0.78);
      this.controlsScale = this.loadScale('lh44_controls_scale', 1.0);

      this.syncBodyClasses();
      this.initEvents();
      this.setupTouchControls();
      this.setupOpacityAndFullscreenUI();
    }

    getGame() {
      return this.game || window.game || window.gameInstance || null;
    }

    detectMobile() {
      const ua = navigator.userAgent || '';
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const touchCapable = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      const smallScreen = Math.min(window.innerWidth, window.innerHeight) <= 768;
      return Boolean(isMobileUA || (coarse && touchCapable) || (touchCapable && smallScreen));
    }

    loadOpacity(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const v = parseFloat(raw);
          if (!isNaN(v)) return Math.max(0.15, Math.min(1.0, v));
        }
      } catch (_) {}
      return fallback;
    }

    saveOpacity(key, val) {
      try {
        localStorage.setItem(key, val.toFixed(2));
      } catch (_) {}
    }

    loadScale(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const v = parseFloat(raw);
          if (!isNaN(v)) return Math.max(0.65, Math.min(1.50, v));
        }
      } catch (_) {}
      return fallback;
    }

    saveScale(key, val) {
      try {
        localStorage.setItem(key, val.toFixed(2));
      } catch (_) {}
    }

    isFullscreenActive() {
      return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }

    syncBodyClasses() {
      this.isMobileDevice = this.detectMobile();
      document.body.classList.toggle('mobile-mode', this.isMobileDevice);
      document.body.classList.toggle('is-fullscreen', this.isFullscreenActive());
      if (this.onViewportChange) this.onViewportChange();
    }

    tryAutoEnterFullscreen() {
      // Intencionalmente desativado por padrão: a tela já abre 100% preenchida no navegador
      // O modo tela cheia do sistema é opcional via F11 ou pelo botão "⛶ TELA CHEIA" nas configurações
      return;
    }

    tryAutoEnterMobileFullscreen() {
      return;
    }

    requestFullscreenAndLandscape() {
      const root = document.documentElement;
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) {
        try {
          const p = req.call(root);
          if (p && typeof p.then === 'function') {
            p.then(() => {
              this.lockLandscape();
              this.syncBodyClasses();
            }).catch(() => {});
          } else {
            this.lockLandscape();
          }
        } catch (_) {}
      } else {
        this.lockLandscape();
      }
    }

    lockLandscape() {
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        screen.orientation.lock('landscape').catch(() => {});
      }
    }

    toggleFullscreen() {
      if (this.isFullscreenActive()) {
        this.userExitedFullscreen = true;
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
          try {
            const p = exit.call(document);
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (_) {}
        }
      } else {
        this.userExitedFullscreen = false;
        this.requestFullscreenAndLandscape();
      }
    }

    notifyGesture(allowAutoFs = true) {
      if (this.onUserGesture) this.onUserGesture();
    }

    isSettingsOpen() {
      const panel = document.getElementById('opacity-panel');
      return !!(panel && panel.classList.contains('open'));
    }

    closeSettings() {
      const panel = document.getElementById('opacity-panel');
      const backdrop = document.getElementById('opacity-backdrop');
      const gearBtn = document.getElementById('gear-btn');
      if (panel && panel.classList.contains('open')) {
        panel.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
        if (gearBtn) gearBtn.classList.remove('active');
        const game = this.getGame();
        if (game && game.state === 'PAUSED') {
          if (game.finishingRace || (game.player && game.player.finished)) {
            game.state = 'RACING';
            game.pauseDialog = null;
          } else {
            game.triggerResumeCountdown();
          }
        }
      }
    }

    toggleSettings() {
      this.notifyGesture(false);
      const panel = document.getElementById('opacity-panel');
      const backdrop = document.getElementById('opacity-backdrop');
      const gearBtn = document.getElementById('gear-btn');
      if (panel) {
        const isOpen = panel.classList.contains('open');
        if (isOpen) {
          this.closeSettings();
        } else {
          panel.classList.add('open');
          if (backdrop) backdrop.classList.add('open');
          if (gearBtn) gearBtn.classList.add('active');
          const game = this.getGame();
          if (game && game.state === 'RACING' && !game.finishingRace && !(game.player && game.player.finished)) {
            game.pauseGame();
          }
        }
      }
    }

    syncCombinedInputs() {
      const prevUp = this.up;
      const prevDown = this.down;
      const prevLeft = this.left;
      const prevRight = this.right;
      const prevNitro = this.nitro;

      // Resposta gradual analógica de acelerador (R2) e freio (L2)
      let gasPressure = this.gpThrottlePressure || 0;
      if (this.keys.up || this.touch.btnA || this.touch.btn3Gas) {
        gasPressure = Math.max(gasPressure, 1.0);
      }
      this.throttlePressure = gasPressure;
      this.up = gasPressure > 0.08;

      let brkPressure = this.gpBrakePressure || 0;
      if (this.keys.down || this.touch.btnX || this.touch.btn2Brake) {
        brkPressure = Math.max(brkPressure, 1.0);
      }
      this.brakePressure = brkPressure;
      this.down = brkPressure > 0.08;

      this.left = this.keys.left || this.touch.dpadLeft || !!this.gpActiveLeft;
      this.right = this.keys.right || this.touch.dpadRight || !!this.gpActiveRight;
      this.nitro = this.keys.nitro || this.touch.btnY || this.touch.btn1Nitro || !!this.gpActiveNitro;

      const prevLeaderboard = this.leaderboard;
      this.leaderboard = !!(this.keys.leaderboard || this.gpLeaderboard);
      if (this.leaderboard && !prevLeaderboard) this.justPressedLeaderboard = true;

      // Navegação por teclado / touch
      if ((this.keys.up || this.touch.dpadUp) && !prevUp) this.justPressedUp = true;
      if ((this.keys.down || this.touch.dpadDown) && !prevDown) this.justPressedDown = true;
      if (this.left && !prevLeft) this.justPressedLeft = true;
      if (this.right && !prevRight) this.justPressedRight = true;
      if (this.nitro && !prevNitro) this.justPressedNitro = true;
    }

    // Converte coordenadas de tela (clientX/clientY) para coordenadas locais do #viewport
    // suportando também a rotação automática de 90° em modo retrato mobile!
    toViewportLocal(clientX, clientY) {
      const vp = document.getElementById('viewport');
      if (!vp) return { x: clientX, y: clientY, w: window.innerWidth, h: window.innerHeight };
      const rect = vp.getBoundingClientRect();
      const localW = vp.clientWidth || rect.width || 1;
      const localH = vp.clientHeight || rect.height || 1;
      const isRotatedPortrait = document.body.classList.contains('mobile-mode') && (window.innerHeight > window.innerWidth);

      if (isRotatedPortrait && rect.width > 0 && rect.height > 0) {
        return {
          x: ((clientY - rect.top) / rect.height) * localW,
          y: ((rect.right - clientX) / rect.width) * localH,
          w: localW,
          h: localH
        };
      }
      return {
        x: rect.width > 0 ? ((clientX - rect.left) / rect.width) * localW : 0,
        y: rect.height > 0 ? ((clientY - rect.top) / rect.height) * localH : 0,
        w: localW,
        h: localH
      };
    }

    getElementLocalRect(el) {
      const vp = document.getElementById('viewport');
      let x = 0;
      let y = 0;
      let cur = el;
      while (cur && cur !== vp && cur !== document.body) {
        x += cur.offsetLeft || 0;
        y += cur.offsetTop || 0;
        cur = cur.offsetParent;
      }
      return { x, y, w: el.offsetWidth || 1, h: el.offsetHeight || 1 };
    }

    initEvents() {
      // Proteção de navegação para botões físicos/virtuais no Android (ex: GameSir X5 B / Back)
      try {
        history.pushState({ app: 'lh44' }, document.title, location.href);
        window.addEventListener('popstate', (e) => {
          history.pushState({ app: 'lh44' }, document.title, location.href);
          if (!this.esc) this.justPressedEsc = true;
          this.esc = true;
          this.notifyGesture(false);
        });
      } catch (_) {}

      // Detecção de conexão de Joystick / Gamepad Nativo (HTML5 Gamepad API)
      window.addEventListener('gamepadconnected', (e) => {
        this.gamepadConnected = true;
        this.gamepadName = (e.gamepad && e.gamepad.id) ? e.gamepad.id : 'GAMESIR / CONTROLE';
        this.gamepadBannerTimer = 4.0;
        this.notifyGesture(false);
      });
      window.addEventListener('gamepaddisconnected', () => {
        this.gamepadConnected = false;
      });

      window.addEventListener('keydown', (e) => {
        this.notifyGesture(false);
        const isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
        if (isInput) {
          if (e.key === 'Escape' || e.keyCode === 4 || e.key === 'Back') {
            e.preventDefault();
            e.target.blur();
            if (!this.esc) this.justPressedEsc = true;
            this.esc = true;
          }
          return;
        }

        // Se o modal de configurações estiver aberto, isola completamente a entrada
        if (this.isSettingsOpen()) {
          const isAndroidBackKey = (e.key === 'Back' || e.code === 'GoBack' || e.keyCode === 4);
          const isCloseKey = (e.key === 'Escape' || isAndroidBackKey || e.keyCode === 97 || e.key === 'b' || e.key === 'B' || e.key === 'c' || e.key === 'C');
          if (isCloseKey) {
            e.preventDefault();
            this.closeSettings();
            return;
          }
          // Bloqueia qualquer outra tecla de chegar ao jogo em segundo plano
          e.preventDefault();
          return;
        }

        // Tecla C / c abre as configurações rapidamente
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          this.toggleSettings();
          return;
        }

        const game = this.getGame();
        const isRacingMode = Boolean(game && (game.state === 'RACING' || game.state === 'COUNTDOWN' || game.state === 'PAUSED' || game.state === 'RESUME_COUNTDOWN'));

        // Regra universal: Fora das corridas (nos menus), A = Confirmar/Avançar e B = Voltar
        if (!isRacingMode) {
          if (e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            if (!this.enter) this.justPressedEnter = true;
            this.enter = true;
            return;
          }
          if (e.key === 'b' || e.key === 'B') {
            e.preventDefault();
            if (!this.esc) this.justPressedEsc = true;
            this.esc = true;
            return;
          }
        }

        // Intercepta e previne ações do sistema Android quando botões do GameSir X5 são pressionados!
        const isAndroidBack = (e.key === 'Back' || e.code === 'GoBack' || e.keyCode === 4);
        const isGamepadKey = (e.keyCode >= 96 && e.keyCode <= 110) || (e.keyCode >= 19 && e.keyCode <= 23);
        if (isAndroidBack || isGamepadKey || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
          e.preventDefault();
        }

        if (isAndroidBack) {
          if (!this.esc) this.justPressedEsc = true;
          this.esc = true;
          return;
        }

        // Mapeamento de KeyCodes sintetizados pelo Android para botões de controle físico (GameSir X5 / etc.)
        switch (e.keyCode) {
          case 96: // BUTTON_A (Confirma nos menus / Nitro na corrida)
            if (!isRacingMode) {
              if (!this.enter) this.justPressedEnter = true;
              this.enter = true;
            } else {
              if (!this.keys.nitro) this.justPressedNitro = true;
              this.keys.nitro = true;
            }
            this.syncCombinedInputs();
            return;
          case 97: // BUTTON_B (Volta nos menus / Freia na corrida)
            if (!isRacingMode) {
              if (!this.esc) this.justPressedEsc = true;
              this.esc = true;
            } else {
              this.keys.down = true;
            }
            this.syncCombinedInputs();
            return;
          case 105: // BUTTON_R2 / RT (Gatilho de aceleração do Android)
            this.keys.up = true;
            this.syncCombinedInputs();
            return;
          case 104: // BUTTON_L2 / LT (Gatilho de frenagem do Android)
            this.keys.down = true;
            this.syncCombinedInputs();
            return;
          case 23: // DPAD_CENTER
          case 108: // BUTTON_START
            if (!this.enter) this.justPressedEnter = true;
            this.enter = true;
            return;
          case 109: // BUTTON_SELECT
            if (!this.esc) this.justPressedEsc = true;
            this.esc = true;
            return;
          case 99: // BUTTON_X (Classificação F1 em tempo real)
            this.justPressedLeaderboard = true;
            return;
          case 100: // BUTTON_Y
          case 102: // BUTTON_L1
          case 103: // BUTTON_R1
            if (!this.keys.nitro) this.justPressedNitro = true;
            this.keys.nitro = true;
            this.syncCombinedInputs();
            return;
          case 19: // DPAD_UP
            this.keys.up = true;
            this.justPressedUp = true;
            this.syncCombinedInputs();
            return;
          case 20: // DPAD_DOWN
            this.keys.down = true;
            this.justPressedDown = true;
            this.syncCombinedInputs();
            return;
          case 21: // DPAD_LEFT
            this.keys.left = true;
            this.justPressedLeft = true;
            this.syncCombinedInputs();
            return;
          case 22: // DPAD_RIGHT
            this.keys.right = true;
            this.justPressedRight = true;
            this.syncCombinedInputs();
            return;
        }

        // Teclado padrão PC
        switch (e.key) {
          case 'ArrowUp':
          case 'w':
          case 'W':
            this.keys.up = true;
            this.syncCombinedInputs();
            break;
          case 'ArrowDown':
          case 's':
          case 'S':
            this.keys.down = true;
            this.syncCombinedInputs();
            break;
          case 'ArrowLeft':
          case 'a':
          case 'A':
            this.keys.left = true;
            this.syncCombinedInputs();
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            this.keys.right = true;
            this.syncCombinedInputs();
            break;
          case ' ':
          case 'n':
          case 'N':
            if (!this.keys.nitro && e.key === ' ') this.justPressedEnter = true;
            this.keys.nitro = true;
            this.syncCombinedInputs();
            break;
          case 'c':
          case 'C':
            this.justPressedColor = true;
            break;
          case 'b':
          case 'B':
          case 'x':
          case 'X':
          case 'Tab':
            e.preventDefault();
            this.keys.leaderboard = true;
            this.syncCombinedInputs();
            break;
          case '1': case '2': case '3': case '4': case '5':
          case '6': case '7': case '8': case '9': case '0':
            this.lastDigit = parseInt(e.key, 10);
            break;
          case 'Enter':
            if (!this.enter) this.justPressedEnter = true;
            this.enter = true;
            break;
          case 'Escape':
          case 'p':
          case 'P':
            if (!this.esc) this.justPressedEsc = true;
            this.esc = true;
            break;
          case 'm':
          case 'M':
            if (!this.keyM) this.justPressedM = true;
            this.keyM = true;
            break;
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
          return;
        }
        if (this.isSettingsOpen()) {
          e.preventDefault();
          return;
        }
        if (e.keyCode === 96) {
          this.keys.up = false;
          this.enter = false;
          this.syncCombinedInputs();
          return;
        }
        if (e.keyCode === 97) {
          this.keys.down = false;
          this.esc = false;
          this.syncCombinedInputs();
          return;
        }
        if (e.keyCode === 105) {
          this.keys.up = false;
          this.syncCombinedInputs();
          return;
        }
        if (e.keyCode === 104) {
          this.keys.down = false;
          this.syncCombinedInputs();
          return;
        }
        if (e.keyCode === 4 || e.key === 'Back' || e.code === 'GoBack' || e.keyCode === 109) {
          this.esc = false;
          return;
        }
        if (e.keyCode === 23 || e.keyCode === 108) {
          this.enter = false;
          return;
        }
        if (e.keyCode === 99 || e.keyCode === 100 || e.keyCode === 102 || e.keyCode === 103) {
          this.keys.nitro = false;
          this.syncCombinedInputs();
          return;
        }
        if (e.keyCode === 19) { this.keys.up = false; this.syncCombinedInputs(); return; }
        if (e.keyCode === 20) { this.keys.down = false; this.syncCombinedInputs(); return; }
        if (e.keyCode === 21) { this.keys.left = false; this.syncCombinedInputs(); return; }
        if (e.keyCode === 22) { this.keys.right = false; this.syncCombinedInputs(); return; }

        switch (e.key) {
          case 'ArrowUp':
          case 'w':
          case 'W':
            this.keys.up = false;
            this.syncCombinedInputs();
            break;
          case 'ArrowDown':
          case 's':
          case 'S':
            this.keys.down = false;
            this.syncCombinedInputs();
            break;
          case 'ArrowLeft':
          case 'a':
          case 'A':
            this.keys.left = false;
            this.syncCombinedInputs();
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            this.keys.right = false;
            this.syncCombinedInputs();
            break;
          case ' ':
          case 'n':
          case 'N':
            this.keys.nitro = false;
            this.syncCombinedInputs();
            break;
          case 'Enter':
            this.enter = false;
            break;
          case 'Escape':
          case 'p':
          case 'P':
            this.esc = false;
            break;
          case 'm':
          case 'M':
            this.keyM = false;
            break;
          case 'b':
          case 'B':
          case 'x':
          case 'X':
          case 'Tab':
            this.keys.leaderboard = false;
            this.syncCombinedInputs();
            break;
        }
      });

      const onResizeOrFs = () => this.syncBodyClasses();
      window.addEventListener('resize', onResizeOrFs);
      window.addEventListener('orientationchange', () => setTimeout(onResizeOrFs, 80));
      document.addEventListener('fullscreenchange', onResizeOrFs);
      document.addEventListener('webkitfullscreenchange', onResizeOrFs);
    }

    setupOpacityAndFullscreenUI() {
      const vp = document.getElementById('viewport');
      const panel = document.getElementById('opacity-panel');
      const pauseBtn = document.getElementById('pause-btn');
      const gearBtn = document.getElementById('gear-btn');
      const closeBtn = document.getElementById('opacity-close-btn');
      const resumeBtn = document.getElementById('panel-resume-btn');
      const panelFsBtn = document.getElementById('panel-fullscreen-btn');

      const scaleValEl = document.getElementById('ctrl-scale-val');
      const scaleFill = document.getElementById('scale-slider-fill');
      const scaleThumb = document.getElementById('scale-slider-thumb');
      const scaleSlider = document.getElementById('scale-slider');
      const scaleMinus = document.getElementById('scale-minus');
      const scalePlus = document.getElementById('scale-plus');

      const dpadValEl = document.getElementById('dpad-opacity-val');
      const dpadFill = document.getElementById('dpad-slider-fill');
      const dpadThumb = document.getElementById('dpad-slider-thumb');
      const dpadSlider = document.getElementById('dpad-slider');

      const btnsValEl = document.getElementById('btns-opacity-val');
      const btnsFill = document.getElementById('btns-slider-fill');
      const btnsThumb = document.getElementById('btns-slider-thumb');
      const btnsSlider = document.getElementById('btns-slider');

      const applyScaleUI = () => {
        if (vp) {
          vp.style.setProperty('--controls-scale', this.controlsScale.toFixed(2));
        }
        const sPct = Math.round(this.controlsScale * 100);
        if (scaleValEl) scaleValEl.textContent = `${sPct}%`;
        const sRatio = ((this.controlsScale - 0.65) / 0.85) * 100;
        if (scaleFill) scaleFill.style.width = `${Math.max(0, Math.min(100, sRatio))}%`;
        if (scaleThumb) scaleThumb.style.left = `${Math.max(0, Math.min(100, sRatio))}%`;
      };

      const setControlsScale = (val) => {
        this.controlsScale = Math.max(0.65, Math.min(1.50, val));
        this.saveScale('lh44_controls_scale', this.controlsScale);
        applyScaleUI();
      };

      const applyOpacityUI = () => {
        if (vp) {
          vp.style.setProperty('--dpad-opacity', this.dpadOpacity.toFixed(2));
          vp.style.setProperty('--btns-opacity', this.btnsOpacity.toFixed(2));
        }
        const dPct = Math.round(this.dpadOpacity * 100);
        const bPct = Math.round(this.btnsOpacity * 100);
        if (dpadValEl) dpadValEl.textContent = `${dPct}%`;
        if (btnsValEl) btnsValEl.textContent = `${bPct}%`;

        const dRatio = ((this.dpadOpacity - 0.15) / 0.85) * 100;
        const bRatio = ((this.btnsOpacity - 0.15) / 0.85) * 100;
        if (dpadFill) dpadFill.style.width = `${dRatio}%`;
        if (dpadThumb) dpadThumb.style.left = `${dRatio}%`;
        if (btnsFill) btnsFill.style.width = `${bRatio}%`;
        if (btnsThumb) btnsThumb.style.left = `${bRatio}%`;
      };

      const setDpadOpacity = (val) => {
        this.dpadOpacity = Math.max(0.15, Math.min(1.0, val));
        this.saveOpacity('lh44_dpad_opacity', this.dpadOpacity);
        applyOpacityUI();
      };

      const setBtnsOpacity = (val) => {
        this.btnsOpacity = Math.max(0.15, Math.min(1.0, val));
        this.saveOpacity('lh44_btns_opacity', this.btnsOpacity);
        applyOpacityUI();
      };

      applyScaleUI();
      applyOpacityUI();

      const bindCustomSlider = (sliderEl, setter) => {
        if (!sliderEl) return;
        let dragging = false;
        const updateFromPoint = (clientX, clientY) => {
          const pt = this.toViewportLocal(clientX, clientY);
          const rect = this.getElementLocalRect(sliderEl);
          const ratio = Math.max(0, Math.min(1, (pt.x - rect.x) / Math.max(1, rect.w)));
          setter(ratio);
        };

        sliderEl.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dragging = true;
          if (e.touches[0]) updateFromPoint(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        sliderEl.addEventListener('touchmove', (e) => {
          if (!dragging) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.touches[0]) updateFromPoint(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        sliderEl.addEventListener('touchend', () => { dragging = false; });
        sliderEl.addEventListener('touchcancel', () => { dragging = false; });

        sliderEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dragging = true;
          updateFromPoint(e.clientX, e.clientY);
          const onMove = (ev) => { if (dragging) updateFromPoint(ev.clientX, ev.clientY); };
          const onUp = () => {
            dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        });
      };

      bindCustomSlider(scaleSlider, (ratio) => setControlsScale(0.65 + ratio * 0.85));
      bindCustomSlider(dpadSlider, (ratio) => setDpadOpacity(0.15 + ratio * 0.85));
      bindCustomSlider(btnsSlider, (ratio) => setBtnsOpacity(0.15 + ratio * 0.85));

      const bindTap = (el, fn) => {
        if (!el) return;
        let touched = false;
        let resetTimer = null;
        el.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          touched = true;
          clearTimeout(resetTimer);
          resetTimer = setTimeout(() => { touched = false; }, 350);
          fn(e);
        }, { passive: false });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (touched) { touched = false; return; }
          fn(e);
        });
      };

      bindTap(scaleMinus, () => setControlsScale(this.controlsScale - 0.10));
      bindTap(scalePlus, () => setControlsScale(this.controlsScale + 0.10));
      bindTap(document.getElementById('dpad-minus'), () => setDpadOpacity(this.dpadOpacity - 0.10));
      bindTap(document.getElementById('dpad-plus'), () => setDpadOpacity(this.dpadOpacity + 0.10));
      bindTap(document.getElementById('btns-minus'), () => setBtnsOpacity(this.btnsOpacity - 0.10));
      bindTap(document.getElementById('btns-plus'), () => setBtnsOpacity(this.btnsOpacity + 0.10));

      if (panel) {
        panel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        panel.addEventListener('click', (e) => e.stopPropagation());
        const presets = panel.querySelectorAll('.preset-btn');
        presets.forEach((btn) => {
          bindTap(btn, () => {
            const v = parseFloat(btn.getAttribute('data-preset') || '0.75');
            if (!this.touchControlsVisible) {
              this.touchControlsVisible = true;
              this.updateTouchVisibility();
            }
            setDpadOpacity(v);
            setBtnsOpacity(v);
          });
        });
      }

      const backdrop = document.getElementById('opacity-backdrop');
      if (backdrop) {
        bindTap(backdrop, () => {
          this.closeSettings();
        });
      }

      bindTap(pauseBtn, () => {
        this.notifyGesture(false);
        if (this.isSettingsOpen()) {
          this.closeSettings();
          return;
        }
        const game = this.getGame();
        if (game) {
          if (game.state === 'RACING') {
            if (!game.finishingRace && !(game.player && game.player.finished)) {
              game.pauseGame();
            }
          } else if (game.state === 'PAUSED') {
            if (game.finishingRace || (game.player && game.player.finished)) {
              game.state = 'RACING';
              game.pauseDialog = null;
            } else {
              game.triggerResumeCountdown();
            }
          } else {
            this.justPressedEsc = true;
          }
        } else {
          this.justPressedEsc = true;
        }
      });

      bindTap(gearBtn, () => {
        this.toggleSettings();
      });

      bindTap(closeBtn, () => {
        this.closeSettings();
      });

      bindTap(resumeBtn, () => {
        this.notifyGesture(false);
        this.closeSettings();
      });

      const handleFsToggle = () => {
        this.notifyGesture(false);
        this.toggleFullscreen();
      };
      bindTap(panelFsBtn, handleFsToggle);

      const updateFsLabels = () => {
        const active = this.isFullscreenActive();
        const label = active ? '⛶ SAIR' : '⛶ TELA CHEIA';
        if (panelFsBtn) panelFsBtn.textContent = label;
      };
      document.addEventListener('fullscreenchange', updateFsLabels);
      document.addEventListener('webkitfullscreenchange', updateFsLabels);
      updateFsLabels();
    }

    updateTouchVisibility() {
      const controlsEl = document.getElementById('touch-controls');
      const toggleBtn = document.getElementById('touch-toggle-btn');
      if (controlsEl) controlsEl.style.display = this.touchControlsVisible ? 'block' : 'none';
      if (toggleBtn) toggleBtn.textContent = this.touchControlsVisible ? 'CONTROLES: ON' : 'CONTROLES: OFF';
      if (this.onViewportChange) this.onViewportChange();
    }

    setupTouchControls() {
      const toggleBtn = document.getElementById('touch-toggle-btn');
      const panel = document.getElementById('opacity-panel');
      const openBtn = document.getElementById('opacity-toggle-btn');

      this.updateTouchVisibility();

      if (toggleBtn) {
        let tFlag = false;
        const doToggle = (e) => {
          e.stopPropagation();
          this.notifyGesture(false);
          this.touchControlsVisible = !this.touchControlsVisible;
          this.updateTouchVisibility();
          toggleBtn.blur();
        };
        toggleBtn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          tFlag = true;
          doToggle(e);
        }, { passive: false });
        toggleBtn.addEventListener('click', (e) => {
          if (tFlag) { tFlag = false; return; }
          doToggle(e);
        });
      }

      // Toque na tela fora dos botões avança menus ou fecha o painel de opacidade
      const canvasEl = document.getElementById('gameCanvas');
      if (canvasEl) {
        const handleCanvasTap = (clientX, clientY) => {
          this.notifyGesture(true);
          if (this.isSettingsOpen()) {
            this.closeSettings();
            return;
          }
          const pt = this.toViewportLocal(clientX, clientY);
          if (pt.w > 0 && pt.h > 0) {
            this.lastCanvasClick = {
              x: (pt.x / pt.w) * INTERNAL_WIDTH,
              y: (pt.y / pt.h) * INTERNAL_HEIGHT
            };
          }
        };

        let canvasTouched = false;
        canvasEl.addEventListener('touchstart', (e) => {
          if (e.touches && e.touches[0]) {
            canvasTouched = true;
            handleCanvasTap(e.touches[0].clientX, e.touches[0].clientY);
          }
        }, { passive: true });

        canvasEl.addEventListener('click', (e) => {
          if (canvasTouched) { canvasTouched = false; return; }
          handleCanvasTap(e.clientX, e.clientY);
        });

        canvasEl.addEventListener('mousemove', (e) => {
          const pt = this.toViewportLocal(e.clientX, e.clientY);
          if (pt.w > 0 && pt.h > 0) {
            this.mouseCanvasPos = {
              x: (pt.x / pt.w) * INTERNAL_WIDTH,
              y: (pt.y / pt.h) * INTERNAL_HEIGHT
            };
          }
        });

        canvasEl.addEventListener('mouseleave', () => {
          this.mouseCanvasPos = null;
        });
      }

      // =====================================================
      // 1. SETAS DIRECIONAIS TOUCH: APENAS ESQUERDA (◀) E DIREITA (▶)
      // =====================================================
      const dpadCluster = document.getElementById('dpad-cluster');
      const armLeft = document.getElementById('dpad-left');
      const armRight = document.getElementById('dpad-right');

      const applySteerState = (l, r, vibrateOnNew = false) => {
        const changed = (l !== this.touch.dpadLeft) || (r !== this.touch.dpadRight);
        const newPress = (l && !this.touch.dpadLeft) || (r && !this.touch.dpadRight);

        this.touch.dpadUp = false;
        this.touch.dpadDown = false;
        this.touch.dpadLeft = l;
        this.touch.dpadRight = r;

        if (armLeft) armLeft.classList.toggle('active', l);
        if (armRight) armRight.classList.toggle('active', r);

        if (changed) this.syncCombinedInputs();
        if (vibrateOnNew && newPress && navigator.vibrate) navigator.vibrate(12);
      };

      const evalSteerPoint = (clientX, clientY) => {
        if (!armLeft || !armRight) return { l: false, r: false };
        const pt = this.toViewportLocal(clientX, clientY);
        const rectL = this.getElementLocalRect(armLeft);
        const rectR = this.getElementLocalRect(armRight);

        // Limites verticais confortáveis para o polegar
        const vPad = Math.max(16, rectL.h * 0.35);
        const minY = Math.min(rectL.y, rectR.y) - vPad;
        const maxY = Math.max(rectL.y + rectL.h, rectR.y + rectR.h) + vPad;
        if (pt.y < minY || pt.y > maxY) {
          return { l: false, r: false };
        }

        // Extensão lateral externa
        const hPadOuter = Math.max(16, rectL.w * 0.35);
        if (pt.x < rectL.x - hPadOuter || pt.x > rectR.x + rectR.w + hPadOuter) {
          return { l: false, r: false };
        }

        // Ponto divisor no centro do vão entre os botões Esquerda e Direita
        const gapMidX = (rectL.x + rectL.w + rectR.x) * 0.5;
        // Zona neutra segura (deadzone) no vão divisor para impedir ativação cruzada acidental
        const deadzone = 4.0;

        const centerLX = rectL.x + rectL.w * 0.5;
        const centerRX = rectR.x + rectR.w * 0.5;
        const distL = Math.abs(pt.x - centerLX);
        const distR = Math.abs(pt.x - centerRX);

        const isLeft = (pt.x < gapMidX - deadzone) && (distL < distR);
        const isRight = (pt.x > gapMidX + deadzone) && (distR < distL);

        return { l: isLeft, r: isRight };
      };

      if (dpadCluster) {
        const updateSteerFromTouches = (e, isStart = false) => {
          e.preventDefault();
          e.stopPropagation();
          if (isStart) this.notifyGesture(true);
          let l = false, r = false;
          for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            const res = evalSteerPoint(t.clientX, t.clientY);
            l = l || res.l;
            r = r || res.r;
          }
          applySteerState(l, r, true);
        };

        dpadCluster.addEventListener('touchstart', (e) => updateSteerFromTouches(e, true), { passive: false });
        dpadCluster.addEventListener('touchmove', (e) => updateSteerFromTouches(e, false), { passive: false });
        dpadCluster.addEventListener('touchend', (e) => updateSteerFromTouches(e, false), { passive: false });
        dpadCluster.addEventListener('touchcancel', (e) => updateSteerFromTouches(e, false), { passive: false });

        let mouseSteerDown = false;
        dpadCluster.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          mouseSteerDown = true;
          this.notifyGesture(false);
          const res = evalSteerPoint(e.clientX, e.clientY);
          applySteerState(res.l, res.r, false);
        });
        window.addEventListener('mousemove', (e) => {
          if (!mouseSteerDown) return;
          const res = evalSteerPoint(e.clientX, e.clientY);
          applySteerState(res.l, res.r, false);
        });
        window.addEventListener('mouseup', () => {
          if (!mouseSteerDown) return;
          mouseSteerDown = false;
          applySteerState(false, false, false);
        });
      }

      // =====================================================
      // 2. BOTÕES XBOX DIAMOND (Y: NITRO, X: FREIO, B: HUD F1, A: ACELERA) MULTITOUCH
      // =====================================================
      const btnsCluster = document.getElementById('buttons-cluster');
      const btnYEl = document.getElementById('btn-y');
      const btnXEl = document.getElementById('btn-x');
      const btnBEl = document.getElementById('btn-b');
      const btnAEl = document.getElementById('btn-a');

      const applyBtnsState = (by, bx, bb, ba, vibrateOnNew = false) => {
        const newY = by && !this.touch.btnY;
        const newX = bx && !this.touch.btnX;
        const newB = bb && !this.touch.btnB;
        const newA = ba && !this.touch.btnA;

        // Botão A (Acelera) confirma menus
        if (newA) {
          this.justPressedEnter = true;
        }

        // Botão B no controle virtual:
        // Durante as corridas: estritamente para exibir/ocultar o HUD F1 (sem pausar o jogo!).
        // Fora das corridas: voltar/cancelar nos menus ou despausar no menu de pausa.
        if (newB) {
          const game = this.getGame();
          const isRaceActive = Boolean(game && (game.state === 'RACING' || game.state === 'COUNTDOWN' || game.state === 'RESUME_COUNTDOWN'));
          if (isRaceActive) {
            game.f1LeaderboardToggled = !game.f1LeaderboardToggled;
            if (game.audio) game.audio.playBeep(520, 0.05);
          } else if (game && game.state === 'PAUSED') {
            game.handlePauseBackKey();
          } else if (!isRaceActive) {
            this.justPressedEsc = true;
          }
        }

        // Botão X (Freio) pode voltar em menus fora da corrida
        if (newX) {
          const game = this.getGame();
          if (game && game.state !== 'RACING' && game.state !== 'COUNTDOWN' && game.state !== 'RESUME_COUNTDOWN') {
            if (game.state === 'PAUSED') {
              game.handlePauseBackKey();
            } else {
              this.justPressedEsc = true;
            }
          }
        }

        this.touch.btnY = by;
        this.touch.btnX = bx;
        this.touch.btnB = bb;
        this.touch.btnA = ba;
        this.touch.btn1Nitro = by;
        this.touch.btn2Brake = bx;
        this.touch.btn3Gas = ba;

        if (btnYEl) btnYEl.classList.toggle('active', by);
        if (btnXEl) btnXEl.classList.toggle('active', bx);
        if (btnAEl) btnAEl.classList.toggle('active', ba);
        if (btnBEl) {
          const game = this.getGame();
          const isRacingState = Boolean(game && (game.state === 'RACING' || game.state === 'COUNTDOWN' || game.state === 'PAUSED' || game.state === 'RESUME_COUNTDOWN'));
          const isF1Active = isRacingState ? Boolean(game && game.f1LeaderboardToggled) : bb;
          btnBEl.classList.toggle('active', isF1Active);
        }

        this.syncCombinedInputs();
        if (vibrateOnNew && (newY || newX || newB || newA) && navigator.vibrate) {
          navigator.vibrate(newY ? 22 : 12);
        }
      };

      const hitTestSingleTouch = (clientX, clientY) => {
        const pt = this.toViewportLocal(clientX, clientY);

        const getCenter = (el) => {
          if (!el) return null;
          const r = this.getElementLocalRect(el);
          return { cx: r.x + r.w * 0.5, cy: r.y + r.h * 0.5, size: Math.max(r.w, r.h) };
        };

        const cy = getCenter(btnYEl);
        const cx = getCenter(btnXEl);
        const cb = getCenter(btnBEl);
        const ca = getCenter(btnAEl);

        let bestBtn = null;
        let bestDist = Infinity;

        // Voronoi: Atribui o toque EXCLUSIVAMENTE ao botão mais próximo, eliminando ativação dupla por um mesmo dedo!
        const checkCandidate = (c, btnId) => {
          if (!c) return;
          const d = Math.hypot(pt.x - c.cx, pt.y - c.cy);
          const maxReach = c.size * 0.75;
          if (d <= maxReach && d < bestDist) {
            bestDist = d;
            bestBtn = btnId;
          }
        };

        checkCandidate(cy, 'Y');
        checkCandidate(cx, 'X');
        checkCandidate(cb, 'B');
        checkCandidate(ca, 'A');

        return {
          by: bestBtn === 'Y',
          bx: bestBtn === 'X',
          bb: bestBtn === 'B',
          ba: bestBtn === 'A'
        };
      };

      if (btnsCluster) {
        const updateBtnsFromTouches = (e, isStart = false) => {
          e.preventDefault();
          e.stopPropagation();
          if (isStart) this.notifyGesture(true);

          let by = false, bx = false, bb = false, ba = false;
          for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            const hit = hitTestSingleTouch(t.clientX, t.clientY);
            by = by || hit.by;
            bx = bx || hit.bx;
            bb = bb || hit.bb;
            ba = ba || hit.ba;
          }
          applyBtnsState(by, bx, bb, ba, true);
        };

        btnsCluster.addEventListener('touchstart', (e) => updateBtnsFromTouches(e, true), { passive: false });
        btnsCluster.addEventListener('touchmove', (e) => updateBtnsFromTouches(e, false), { passive: false });
        btnsCluster.addEventListener('touchend', (e) => updateBtnsFromTouches(e, false), { passive: false });
        btnsCluster.addEventListener('touchcancel', (e) => updateBtnsFromTouches(e, false), { passive: false });

        let mouseBtnDown = false;
        btnsCluster.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          mouseBtnDown = true;
          this.notifyGesture(false);
          const hit = hitTestSingleTouch(e.clientX, e.clientY);
          applyBtnsState(hit.by, hit.bx, hit.bb, hit.ba, false);
        });
        window.addEventListener('mousemove', (e) => {
          if (!mouseBtnDown) return;
          const hit = hitTestSingleTouch(e.clientX, e.clientY);
          applyBtnsState(hit.by, hit.bx, hit.bb, hit.ba, false);
        });
        window.addEventListener('mouseup', () => {
          if (!mouseBtnDown) return;
          mouseBtnDown = false;
          applyBtnsState(false, false, false, false, false);
        });
      }
    }

    pollGamepad(dt) {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i].connected) {
          gp = gamepads[i];
          break;
        }
      }

      if (!gp) {
        this.gamepadConnected = false;
        this.analogSteer = 0;
        this.gpThrottlePressure = 0;
        this.gpBrakePressure = 0;
        this.gpActiveGas = false;
        this.gpActiveBrake = false;
        this.gpActiveLeft = false;
        this.gpActiveRight = false;
        this.gpActiveNitro = false;
        this.gpLeaderboard = false;
        return;
      }

      if (!this.gamepadConnected) {
        this.gamepadConnected = true;
        this.gamepadName = gp.id || 'CONTROLE XBOX / NATIVO';
        this.gamepadBannerTimer = 3.8;
        this.notifyGesture(false);
      }
      if (this.gamepadBannerTimer > 0) {
        this.gamepadBannerTimer -= dt;
      }

      const DEADZONE = 0.16;

      // 1. Analógico Esquerdo (Left Stick)
      // Eixo 0: Direção do carro (analogSteer)
      // Eixo 1: Navegação vertical em menus (NÃO acelera nem freia na corrida!)
      const leftStickX = (gp.axes && gp.axes.length > 0) ? gp.axes[0] : 0;
      const leftStickY = (gp.axes && gp.axes.length > 1) ? gp.axes[1] : 0;

      // Esterçamento Analógico do stick esquerdo
      if (Math.abs(leftStickX) > DEADZONE) {
        const sign = leftStickX > 0 ? 1 : -1;
        const mag = (Math.abs(leftStickX) - DEADZONE) / (1 - DEADZONE);
        this.analogSteer = sign * Math.min(1, Math.max(0, mag));
      } else {
        this.analogSteer = 0;
      }

      const isBtnPressed = (btnIdx, threshold = 0.35) => {
        if (!gp.buttons || !gp.buttons[btnIdx]) return false;
        const b = gp.buttons[btnIdx];
        return typeof b === 'object' ? (b.pressed || b.value >= threshold) : b >= threshold;
      };

      // Leitura de gatilhos analógicos com amplitude contínua (0.0 a 1.0)
      const getTriggerVal = (btnIdx, axisIdx) => {
        let v = 0;
        if (gp.buttons && gp.buttons[btnIdx]) {
          const b = gp.buttons[btnIdx];
          if (typeof b === 'object' && b !== null) {
            v = (typeof b.value === 'number') ? b.value : (b.pressed ? 1.0 : 0.0);
          } else if (typeof b === 'number') {
            v = b;
          }
        }
        // Fallback para eixos analógicos em drivers DirectInput / Linux
        if (v < 0.05 && gp.mapping !== 'standard' && gp.axes && typeof axisIdx === 'number' && gp.axes.length > axisIdx) {
          const ax = gp.axes[axisIdx];
          if (typeof ax === 'number' && ax > 0.05) {
            v = ax;
          }
        }
        return Math.max(0, Math.min(1, v));
      };

      // D-Pad Digital (Botões 12, 13, 14, 15 ou Hat Switches)
      const hatX = (gp.axes && gp.axes.length > 4) ? gp.axes[4] : ((gp.axes && gp.axes.length > 6) ? gp.axes[6] : 0);
      const hatY = (gp.axes && gp.axes.length > 5) ? gp.axes[5] : ((gp.axes && gp.axes.length > 7) ? gp.axes[7] : 0);

      const dpadUp = isBtnPressed(12) || (hatY < -0.42);
      const dpadDown = isBtnPressed(13) || (hatY > 0.42);
      const dpadLeft = isBtnPressed(14) || (hatX < -0.42);
      const dpadRight = isBtnPressed(15) || (hatX > 0.42);

      // Controle para os lados do carro (analógico esquerdo e digital D-Pad)
      this.gpActiveLeft = dpadLeft || (this.analogSteer < -0.25);
      this.gpActiveRight = dpadRight || (this.analogSteer > 0.25);

      // Botões A / B / X / Y / LB / RB / Select / Start
      const btnA = isBtnPressed(0);
      const btnB = isBtnPressed(1);
      const btnX = isBtnPressed(2);
      const btnY = isBtnPressed(3);
      const btnLB = isBtnPressed(4);
      const btnRB = isBtnPressed(5);
      const btnSelect = isBtnPressed(8);
      const btnStart = isBtnPressed(9);

      // Padrão Xbox Solicitado:
      // A (Verde) = ACELERA (suporta gatilho RT ou botão A)
      const r2Pressure = getTriggerVal(7, 5);
      this.gpThrottlePressure = btnA ? 1.0 : r2Pressure;
      this.gpActiveGas = (r2Pressure > 0.08) || btnA;

      // X (Vermelho) = FREIO (suporta gatilho LT ou botão X)
      const l2Pressure = getTriggerVal(6, 2);
      this.gpBrakePressure = btnX ? 1.0 : l2Pressure;
      this.gpActiveBrake = (l2Pressure > 0.08) || btnX;

      // Y (Amarelo) = NITRO (botão Y ou botões RB/LB)
      this.gpActiveNitro = btnY || btnRB || btnLB;

      // B (Azul F1) = HUD F1
      this.gpLeaderboard = false;

      // 2. Analógico Direito (Right Stick) — SOMENTE para navegar nos menus/opções
      const rightStickX = (gp.axes && gp.axes.length > 2) ? gp.axes[2] : 0;
      const rightStickY = (gp.axes && gp.axes.length > 3) ? gp.axes[3] : 0;

      const rsLeft = rightStickX < -0.42;
      const rsRight = rightStickX > 0.42;
      const rsUp = rightStickY < -0.42;
      const rsDown = rightStickY > 0.42;

      const anyGpAction = btnA || btnB || btnX || btnY || btnLB || btnRB || btnSelect || btnStart ||
                          dpadUp || dpadDown || dpadLeft || dpadRight ||
                          Math.abs(leftStickX) > 0.22 || Math.abs(leftStickY) > 0.22 ||
                          Math.abs(rightStickX) > 0.22 || Math.abs(rightStickY) > 0.22 ||
                          r2Pressure > 0.08 || l2Pressure > 0.08;
      if (anyGpAction) {
        this.notifyGesture(false);
      }

      const checkPulse = (key, isDown) => {
        const prev = !!this.prevGamepadButtons[key];
        this.prevGamepadButtons[key] = isDown;
        return isDown && !prev;
      };

      // Se as configurações estiverem abertas, gamepad fecha o menu de forma segura sem vazar comandos ao jogo
      if (this.isSettingsOpen()) {
        if (checkPulse('btnSelect', btnSelect) || checkPulse('btnB', btnB) || checkPulse('btnStart', btnStart)) {
          this.closeSettings();
        }
        this.gpThrottlePressure = 0;
        this.gpBrakePressure = 0;
        this.gpActiveGas = false;
        this.gpActiveBrake = false;
        this.gpActiveLeft = false;
        this.gpActiveRight = false;
        this.gpActiveNitro = false;
        this.analogSteer = 0;
        return;
      }

      // Select = Configurações (abre o painel e pausa)
      if (checkPulse('btnSelect', btnSelect)) {
        this.toggleSettings();
      }

      // Start = Pausa (pausa e despausa a corrida / confirma menus)
      if (checkPulse('btnStart', btnStart)) {
        const game = this.getGame();
        if (game && game.state === 'RACING') {
          if (!game.finishingRace && !(game.player && game.player.finished)) {
            game.pauseGame();
          }
        } else if (game && game.state === 'PAUSED') {
          game.handlePauseStartKey();
        } else {
          this.justPressedEsc = true;
          this.justPressedEnter = true;
        }
      }

      // Botão A = Confirmação nos Menus (se correndo, acelera diretamente)
      if (checkPulse('btnA', btnA)) {
        this.justPressedEnter = true;
      }

      // Botão B = Alterna Classificação F1 na corrida / Voltar e Cancelar nos Menus
      if (checkPulse('btnB', btnB)) {
        const game = this.getGame();
        const isRaceActive = Boolean(game && (game.state === 'RACING' || game.state === 'COUNTDOWN' || game.state === 'RESUME_COUNTDOWN'));
        if (isRaceActive) {
          game.f1LeaderboardToggled = !game.f1LeaderboardToggled;
          if (game.audio) game.audio.playBeep(520, 0.05);
        } else if (game && game.state === 'PAUSED') {
          game.handlePauseBackKey();
        } else if (!isRaceActive) {
          this.justPressedEsc = true;
        }
      }

      // Botão Y / RB = Dispara Nitro
      if (checkPulse('btnRB', btnRB) || checkPulse('btnY', btnY)) {
        this.justPressedNitro = true;
      }

      // Navegação nos Menus:
      // Analógico Esquerdo e Digital D-Pad (Cima / Baixo navegam menus)
      const menuUpLeft = dpadUp || (leftStickY < -0.42);
      const menuDownLeft = dpadDown || (leftStickY > 0.42);
      const menuLeftStick = dpadLeft || (leftStickX < -0.42);
      const menuRightStick = dpadRight || (leftStickX > 0.42);

      if (checkPulse('menuUpLeft', menuUpLeft) || checkPulse('rsUp', rsUp)) {
        this.justPressedUp = true;
      }
      if (checkPulse('menuDownLeft', menuDownLeft) || checkPulse('rsDown', rsDown)) {
        this.justPressedDown = true;
      }
      if (checkPulse('menuLeftStick', menuLeftStick) || checkPulse('rsLeft', rsLeft)) {
        this.justPressedLeft = true;
      }
      if (checkPulse('menuRightStick', menuRightStick) || checkPulse('rsRight', rsRight)) {
        this.justPressedRight = true;
      }

      this.syncCombinedInputs();
    }

    clearPulses() {
      this.justPressedUp = false;
      this.justPressedDown = false;
      this.justPressedLeft = false;
      this.justPressedRight = false;
      this.justPressedEnter = false;
      this.justPressedEsc = false;
      this.justPressedM = false;
      this.justPressedNitro = false;
      this.justPressedLeaderboard = false;
      this.justPressedColor = false;
      this.lastDigit = null;
      this.lastCanvasClick = null;
    }
  }
