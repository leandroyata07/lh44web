  class Car {
    constructor(id, model, isPlayer = false) {
      this.id = id;
      this.model = model;
      this.isPlayer = isPlayer;
      const dIdx = Math.max(0, (id - 1) % F1_DRIVERS.length);
      this.driverName = isPlayer ? 'LEANDRO' : (F1_DRIVERS[dIdx]?.name || 'PILOTO');
      this.driverCode = isPlayer ? 'LEA' : (F1_DRIVERS[dIdx]?.code || 'CPU');
      this.bodyColor = isPlayer ? model.primaryColor : BOT_BODY_COLORS[id % BOT_BODY_COLORS.length];

      this.z = 0;
      this.x = 0;
      this.bumpVelX = 0;
      this.speed = 0;
      this.laps = 0;
      this.totalDistance = 0;
      this.nextLapTarget = 0;
      this.finishTime = 0;
      this.finishRank = 0;
      this.finished = false;
      this.isBraking = false;
      this.steer = 0;
      this.steerAngle = 0;
      this.inSlipstream = false;
      this.collisionCooldown = 0;
      this.sceneryCollisionCooldown = 0;
      this.bumpBoostTimer = 0;
      this.powerBrakeHoldTime = 0;

      this.currentGear = 1;
      this.rpm = 1000;

      this.nitroCharges = 3;
      this.nitroTimer = 0;
      this.nitroDecayTimer = 0;
      this.isNitro = false;

      this.targetX = 0;
      this.launchDelay = 0;
      this.aiSkill = 0.86 + Math.random() * 0.22;
      this.laneChangeTimer = 1.5 + Math.random() * 2.5;
    }

    getTotalDistance() {
      return this.totalDistance;
    }

    getEffectiveMaxSpeed() {
      if (this.effectiveMaxSpeed) return this.effectiveMaxSpeed;
      return (this.model && this.model.maxSpeed) ? this.model.maxSpeed : 220;
    }

    updateTransmission() {
      const normalMax = this.getEffectiveMaxSpeed();
      const speedRatio = Math.max(0, this.speed / normalMax);
      let gInfo = GEAR_RATIOS[0];
      for (let i = GEAR_RATIOS.length - 1; i >= 0; i--) {
        if (speedRatio >= GEAR_RATIOS[i].minRatio) {
          gInfo = GEAR_RATIOS[i];
          break;
        }
      }
      this.currentGear = gInfo.gear;
      const gProgress = (speedRatio - gInfo.minRatio) / Math.max(0.01, gInfo.maxRatio - gInfo.minRatio);
      // Nas descidas e no vácuo (quando ultrapassa o limite de reta), o motor estica além do giro nominal (over-rev até 8800 RPM)!
      const overspeedBonus = Math.max(0, speedRatio - 1.0) * 4500;
      this.rpm = Math.floor(gInfo.minRpm + Math.min(1.0, Math.max(0, gProgress)) * (gInfo.maxRpm - gInfo.minRpm) + overspeedBonus);
    }
  }

  // ==========================================
  // GERENCIADOR DE SALVAMENTO (3 SLOTS INDEPENDENTES)
  // ==========================================
  const SaveManager = {
    SLOTS_KEY_PREFIX: 'lh44_save_slot_',
    MAX_SLOTS: 3,

    getSlot(slotNum) {
      try {
        const raw = localStorage.getItem(this.SLOTS_KEY_PREFIX + slotNum);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('Erro ao ler slot ' + slotNum, e);
        return null;
      }
    },

    getAllSlots() {
      const slots = [];
      for (let i = 1; i <= this.MAX_SLOTS; i++) {
        slots.push(this.getSlot(i));
      }
      return slots;
    },

    saveSlot(slotNum, data) {
      try {
        const d = new Date();
        const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const payload = {
          slotNum: slotNum,
          timestamp: Date.now(),
          dateStr: dateStr,
          playerName: data.playerName || 'JOGADOR',
          gameMode: data.gameMode || 'CHAMPIONSHIP',
          difficulty: data.difficulty || 'NORMAL',
          selectedCarIndex: data.selectedCarIndex !== undefined ? data.selectedCarIndex : 0,
          colorIndex: data.colorIndex !== undefined ? data.colorIndex : 1,
          seasonStage: data.seasonStage !== undefined ? data.seasonStage : 0,
          seasonSchedule: data.seasonSchedule ? [...data.seasonSchedule] : [],
          championshipPoints: data.championshipPoints ? [...data.championshipPoints] : [],
          lastTrackIndex: data.lastTrackIndex !== undefined ? data.lastTrackIndex : 0,
          nextTrackIndex: data.nextTrackIndex !== undefined ? data.nextTrackIndex : 0,
          playerRank: data.playerRank || 1,
          totalPoints: data.totalPoints || 0,
          seasonBots: data.seasonBots ? [...data.seasonBots] : [],
          seasonGridOrder: data.seasonGridOrder ? [...data.seasonGridOrder] : []
        };
        localStorage.setItem(this.SLOTS_KEY_PREFIX + slotNum, JSON.stringify(payload));
        return true;
      } catch (e) {
        console.warn('Erro ao gravar slot ' + slotNum, e);
        return false;
      }
    },

    deleteSlot(slotNum) {
      try {
        localStorage.removeItem(this.SLOTS_KEY_PREFIX + slotNum);
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  // ==========================================
  // MOTOR CENTRAL LH44
  // ==========================================
  class LH44RacingGame {
    constructor() {
      window.game = this;
      window.gameInstance = this;
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.webglCanvas = document.getElementById('webglCanvas');
      if (typeof LH44WebGLRenderer !== 'undefined' && this.webglCanvas) {
        this.webgl = new LH44WebGLRenderer(this.webglCanvas, INTERNAL_WIDTH, INTERNAL_HEIGHT);
      } else {
        this.webgl = null;
      }
      this.syncCanvasResolution();
      this.audio = new AudioManager();
      this.input = new InputManager(
        () => {
          if (this.audio) {
            const isMenuState = (this.state === 'MENU' || this.state === 'MODE_SELECT' || this.state === 'DIFFICULTY_SELECT' || this.state === 'TRACK_SELECT' || this.state === 'CAR_SELECT' || this.state === 'COLOR_SELECT' || this.state === 'NAME_INPUT');
            this.audio.unlockAudio(isMenuState);
          }
        },
        () => this.syncCanvasResolution()
      );
      this.input.game = this;
      this.particlePool = new ParticlePool(180);

      this.state = 'MENU';
      this.titleMenuIndex = 0;
      this.trackIndex = 0;
      this.track = null;
      this.selectedCarIndex = 0;
      this.colorIndex = 1;
      this.playerName = 'JOGADOR';
      this.envCond = 'DIA';
      this.envTime = 0;
      this.envCur = null;
      this.envFrom = null;
      this.envBlend = 1;
      this.skyScroll = 0;
      this.setupGroup = 0;
      this.setupCooldown = 0;
      this.songIndex = 0;
      this.nameInput = document.getElementById('player-name-input');
      if (this.nameInput) {
        this.nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            this.confirmName();
          }
        });
      }
      this.nameWrapper = document.getElementById('player-name-wrapper');
      if (this.nameInput) {
        try {
          const savedName = localStorage.getItem('lh44_player_name');
          if (savedName) this.nameInput.value = savedName;
        } catch (_) {}
      }
      this.menuCameraZ = 0;

      // ==========================================
      // SISTEMA DE SAVE, PAUSA & RESUME COUNTDOWN
      // ==========================================
      this.activeSaveSlot = 1;
      this.slotSelectMode = 'CONTINUE'; // 'NEW' ou 'CONTINUE'
      this.selectedSlotIndex = 0;       // 0, 1, 2 para Slots 1, 2, 3
      this.slotDeleteConfirm = null;    // slot aguardando exclusão
      this.slotOverwriteConfirm = null; // slot aguardando substituição
      this.mainMenuSelection = 0;       // 0: INICIAR, 1: CONTINUAR
      this.pauseMenuIndex = 0;          // 0: CONTINUAR, 1: REINICIAR, 2: CONFIG, 3: SAIR
      this.pauseDialog = null;          // null, 'CONFIRM_RESTART', 'CONFIRM_EXIT'
      this.pauseDialogIndex = 0;        // opção selecionada no diálogo
      this.resumeCountdown = 0;         // Timer regressivo 3.0s
      this.lastResumeInt = 4;

      // Vinculação dos botões de áudio do menu de configurações
      const musicBtn = document.getElementById('music-toggle-btn');
      const sfxBtn = document.getElementById('sfx-toggle-btn');
      const syncAudioUI = () => {
        if (musicBtn && this.audio) {
          const mOn = this.audio.musicEnabled;
          musicBtn.textContent = mOn ? '🎵 MÚSICA: LIGADA' : '🔇 MÚSICA: DESLIGADA';
          musicBtn.classList.toggle('off', !mOn);
        }
        if (sfxBtn && this.audio) {
          const sOn = this.audio.enabled;
          sfxBtn.textContent = sOn ? '🔊 EFEITOS: LIGADOS' : '🔇 EFEITOS: DESLIGADOS';
          sfxBtn.classList.toggle('off', !sOn);
        }
      };
      if (musicBtn) {
        musicBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.audio) {
            this.audio.toggleMusic();
            syncAudioUI();
          }
        });
      }
      if (sfxBtn) {
        sfxBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.audio) {
            this.audio.enabled = !this.audio.enabled;
            if (!this.audio.enabled) this.audio.silenceEffects();
            else this.audio.playBeep(440, 0.08);
            syncAudioUI();
          }
        });
      }
      syncAudioUI();

      this.pauseBtn = document.getElementById('pause-btn');
      this.player = null;
      this.cars = [];

      this.championshipPoints = new Array(TOTAL_RACERS).fill(0);
      this.lastRacePositions = [];
      this.seasonBots = [];
      this.diffMode = 'NORMAL';
      this.selectedDiffIndex = 0;
      this.lastLapAlertTimer = 0;
      this.isLastLapBanner = false;
      this.menuFadeAlpha = 0;
      this.menuFadeState = 'idle';
      this.menuFadeTargetState = null;
      this.menuFadeOnMid = null;
      this.menuFadeDuration = 0.22;
      this.endingTimer = 0;
      this.endingRank = 1;
      this.endingFireworks = [];
      this.confetti = [];
      this.showFPS = false;
      try { this.showFPS = (localStorage.getItem('lh44_show_fps') === 'true'); } catch (_) {}
      this.fps = 60;
      this.fpsFrames = 0;
      this.fpsLastTime = performance.now();
      this.lastRenderTime = performance.now();

      // Limite de FPS: 60 FPS cravados vs Aberto (taxa nativa da tela como 120Hz)
      this.fpsLimit = 60;
      try {
        const savedLimit = localStorage.getItem('lh44_fps_limit');
        if (savedLimit === 'open') {
          this.fpsLimit = 0;
        } else if (savedLimit === '60') {
          this.fpsLimit = 60;
        } else {
          this.fpsLimit = 60;
        }
      } catch (_) {}

      const fpsLimitBtn = document.getElementById('fps-limit-btn');
      if (fpsLimitBtn) {
        const updateFpsLimitBtn = () => {
          fpsLimitBtn.textContent = (this.fpsLimit === 60) ? 'TRAVA: 60 FPS' : 'TRAVA: ABERTO';
          fpsLimitBtn.style.color = (this.fpsLimit === 60) ? '#00E5FF' : '#FFD700';
          fpsLimitBtn.style.borderColor = (this.fpsLimit === 60) ? '#00B4D8' : '#FFA000';
        };
        updateFpsLimitBtn();
        const toggleFpsLimit = (e) => {
          e.stopPropagation();
          this.fpsLimit = (this.fpsLimit === 60) ? 0 : 60;
          try { localStorage.setItem('lh44_fps_limit', this.fpsLimit === 60 ? '60' : 'open'); } catch (_) {}
          updateFpsLimitBtn();
          fpsLimitBtn.blur();
        };
        fpsLimitBtn.addEventListener('click', toggleFpsLimit);
        fpsLimitBtn.addEventListener('touchstart', (e) => { e.preventDefault(); toggleFpsLimit(e); }, { passive: false });
      }

      // Sincronização Vertical (VSync)
      this.vsyncEnabled = true;
      try {
        const savedVsync = localStorage.getItem('lh44_vsync');
        if (savedVsync === 'false') this.vsyncEnabled = false;
      } catch (_) {}

      const vsyncBtn = document.getElementById('vsync-btn');
      if (vsyncBtn) {
        const updateVsyncBtn = () => {
          vsyncBtn.textContent = this.vsyncEnabled ? 'VSYNC: LIGADO' : 'VSYNC: DESLIGADO';
          vsyncBtn.style.color = this.vsyncEnabled ? '#69F0AE' : '#FF5252';
          vsyncBtn.style.borderColor = this.vsyncEnabled ? '#00E676' : '#D32F2F';
        };
        updateVsyncBtn();
        const toggleVsync = (e) => {
          e.stopPropagation();
          this.vsyncEnabled = !this.vsyncEnabled;
          try { localStorage.setItem('lh44_vsync', this.vsyncEnabled ? 'true' : 'false'); } catch (_) {}
          updateVsyncBtn();
          vsyncBtn.blur();
        };
        vsyncBtn.addEventListener('click', toggleVsync);
        vsyncBtn.addEventListener('touchstart', (e) => { e.preventDefault(); toggleVsync(e); }, { passive: false });
      }

      const fpsBtn = document.getElementById('fps-toggle-btn');
      if (fpsBtn) {
        const updateFpsBtn = () => {
          fpsBtn.textContent = this.showFPS ? 'HUD FPS: ON' : 'HUD FPS: OFF';
          fpsBtn.style.color = this.showFPS ? '#69F0AE' : '#90A4AE';
          fpsBtn.style.borderColor = this.showFPS ? '#00E676' : '#546E7A';
        };
        updateFpsBtn();
        const toggleFps = (e) => {
          e.stopPropagation();
          this.showFPS = !this.showFPS;
          try { localStorage.setItem('lh44_show_fps', this.showFPS ? 'true' : 'false'); } catch (_) {}
          updateFpsBtn();
          fpsBtn.blur();
        };
        fpsBtn.addEventListener('click', toggleFps);
        fpsBtn.addEventListener('touchstart', (e) => { e.preventDefault(); toggleFps(e); }, { passive: false });
      }
      this.fixedStep = 1 / 60;
      this.accumulator = 0;
      this.initSeasonRoster();

      this.gameMode = 'CHAMPIONSHIP'; // 'CHAMPIONSHIP' ou 'QUICK_RACE'
      this.selectedModeIndex = 0;     // 0: Campeonato F1, 1: Corrida Rápida
      this.selectedQuickTrackIndex = 0; // 0: Brasil GP, 1: Serra, 2: Noite
      this.seasonSchedule = [];
      this.seasonStage = 0;

      this.countdown = 3.6;
      this.startLightsStage = 0;
      this.greenLightsTimer = 0;

      this.raceTimer = 0;
      this.currentLapTime = 0;
      this.bestLapTime = 0;
      this.lastLapTime = 0;

      this.cameraRoll = 0;
      this.shake = 0;
      this.smoothCurveScreenX = 0;
      this.smoothRoadY = INTERNAL_HEIGHT - 12;

      this.finishingRace = false;
      this.finishTimer = 0;
      this.finishDuration = 3.0;
      this.finishCamOriginZ = 0;
      this.finishCameraX = 0;
      this.finishCameraY = 0;
      this.finishFadeAlpha = 0;

      this.lapBannerTimer = 0;
      this.lapBannerText = '';
      this.f1LeaderboardToggled = false;

      this.syncCanvasResolution();
      CarArt.warmUp(CAR_MODELS);

      this.lastTime = performance.now();
      this.boundGameLoop = this.gameLoop.bind(this);

      this.loadTrack(this.trackIndex);
      this.updateEnv(0.016);

      // Inicia a música tema automaticamente ao abrir o jogo
      const cleanupThemeListeners = () => {
        window.removeEventListener('pointerdown', startThemeMusicNow);
        window.removeEventListener('keydown', startThemeMusicNow);
        window.removeEventListener('touchstart', startThemeMusicNow);
        window.removeEventListener('click', startThemeMusicNow);
        window.removeEventListener('focus', startThemeMusicNow);
      };

      const startThemeMusicNow = () => {
        if (this.audio) {
          const isMenuState = (this.state === 'MENU' || this.state === 'MODE_SELECT' || this.state === 'DIFFICULTY_SELECT' || this.state === 'TRACK_SELECT' || this.state === 'CAR_SELECT' || this.state === 'COLOR_SELECT' || this.state === 'NAME_INPUT');
          if (isMenuState) {
            this.audio.unlockAudio(true);
            if (!this.audio.titlePlaying) {
              this.audio.playTitleMusic();
            }
            if (this.audio.ctx && this.audio.ctx.state === 'running' && this.audio.titlePlaying) {
              cleanupThemeListeners();
            }
          }
        }
      };

      // Tenta tocar de imediato (WebView Android e navegadores com autoplay)
      startThemeMusicNow();
      setTimeout(startThemeMusicNow, 60);
      setTimeout(startThemeMusicNow, 200);
      setTimeout(startThemeMusicNow, 500);

      window.addEventListener('pointerdown', startThemeMusicNow, { passive: true });
      window.addEventListener('keydown', startThemeMusicNow, { passive: true });
      window.addEventListener('touchstart', startThemeMusicNow, { passive: true });
      window.addEventListener('click', startThemeMusicNow, { passive: true });
      window.addEventListener('focus', startThemeMusicNow, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) startThemeMusicNow();
      }, { passive: true });
      this.scheduleNextFrame();
    }

    pauseGame() {
      // Se a corrida já acabou ou está na sequência de bandeirada, não pausa
      if (this.finishingRace || (this.player && this.player.finished)) {
        return;
      }
      if (this.state === 'RACING' || this.state === 'RESUME_COUNTDOWN') {
        this.state = 'PAUSED';
        this.pauseMenuIndex = 0;
        this.pauseDialog = null;
        this.pauseDialogIndex = 0;
        if (this.audio) {
          this.audio.silenceEffects();
          this.audio.playBeep(300, 0.1);
        }
      }
    }

    triggerResumeCountdown() {
      if (this.state === 'PAUSED') {
        // Se a corrida já acabou ou está no pós-bandeirada, volta direto sem contagem regressiva
        if (this.finishingRace || (this.player && this.player.finished)) {
          this.state = 'RACING';
          this.pauseDialog = null;
          return;
        }
        this.state = 'RESUME_COUNTDOWN';
        this.resumeCountdown = 3.0;
        this.lastResumeInt = 4;
        this.pauseDialog = null;
        if (this.audio) {
          this.audio.silenceEffects();
          this.audio.playCountdownBeep(false);
        }
      }
    }

    handlePauseStartKey() {
      if (this.state === 'RACING') {
        this.pauseGame();
      } else if (this.state === 'PAUSED') {
        if (this.pauseDialog) {
          this.pauseDialog = null;
        } else {
          this.triggerResumeCountdown();
        }
      } else if (this.state === 'RESUME_COUNTDOWN') {
        this.pauseGame();
      }
    }

    handlePauseBackKey() {
      if (this.state === 'PAUSED') {
        if (this.pauseDialog) {
          this.pauseDialog = null;
          this.audio.playBeep(330, 0.06);
        } else {
          this.triggerResumeCountdown();
        }
      }
    }

    executePauseMenuAction(idx) {
      if (idx === 0) {
        this.triggerResumeCountdown();
      } else if (idx === 1) {
        this.pauseDialog = 'CONFIRM_RESTART';
        this.pauseDialogIndex = 0;
        this.audio.playBeep(440, 0.08);
      } else if (idx === 2) {
        const gearBtn = document.getElementById('gear-btn');
        if (gearBtn) gearBtn.click();
      } else if (idx === 3) {
        this.pauseDialog = 'CONFIRM_EXIT';
        this.pauseDialogIndex = 0;
        this.audio.playBeep(440, 0.08);
      }
    }

    executePauseDialogAction(dialog, actionIdx) {
      if (dialog === 'CONFIRM_RESTART') {
        if (actionIdx === 0) {
          this.pauseDialog = null;
          if (this.audio) this.audio.playBeep(523, 0.12);
          this.loadTrack(this.trackIndex);
          this.startRaceCountdown();
        } else {
          this.pauseDialog = null;
          if (this.audio) this.audio.playBeep(330, 0.06);
        }
      } else if (dialog === 'CONFIRM_EXIT') {
        if (this.gameMode === 'CHAMPIONSHIP') {
          if (actionIdx === 0) {
            // SALVAR E SAIR
            this.saveCurrentChampionship();
            this.pauseDialog = null;
            if (this.audio) {
              this.audio.musicPlaying = false;
              this.audio.silenceEffects();
              this.audio.stopRaceEffects();
              this.audio.playTitleMusic();
            }
            this.loadTrack(0);
            this.menuCameraZ = 0;
            this.state = 'MENU';
            this.menuFadeAlpha = 0;
            this.menuFadeState = 'idle';
            if (this.input) this.input.clearPulses();
          } else if (actionIdx === 1) {
            // SAIR SEM SALVAR
            this.pauseDialog = null;
            if (this.audio) {
              this.audio.musicPlaying = false;
              this.audio.silenceEffects();
              this.audio.stopRaceEffects();
              this.audio.playTitleMusic();
            }
            this.loadTrack(0);
            this.menuCameraZ = 0;
            this.state = 'MENU';
            this.menuFadeAlpha = 0;
            this.menuFadeState = 'idle';
            if (this.input) this.input.clearPulses();
          } else {
            // CANCELAR
            this.pauseDialog = null;
            if (this.audio) this.audio.playBeep(330, 0.06);
          }
        } else {
          if (actionIdx === 0) {
            // SAIR (MODO RÁPIDO)
            this.pauseDialog = null;
            if (this.audio) {
              this.audio.musicPlaying = false;
              this.audio.silenceEffects();
              this.audio.stopRaceEffects();
              this.audio.playTitleMusic();
            }
            this.loadTrack(0);
            this.menuCameraZ = 0;
            this.state = 'MENU';
            this.menuFadeAlpha = 0;
            this.menuFadeState = 'idle';
            if (this.input) this.input.clearPulses();
          } else {
            this.pauseDialog = null;
            if (this.audio) this.audio.playBeep(330, 0.06);
          }
        }
      }
    }

    serializeSeasonBots() {
      if (!this.seasonBots || this.seasonBots.length === 0) return [];
      return this.seasonBots.map(b => {
        let mIdx = CAR_MODELS.findIndex(m => m.id === (b.model ? b.model.id : '') || m.name === (b.model ? b.model.name : ''));
        if (mIdx < 0) mIdx = 0;
        return {
          driverName: b.driverName,
          driverCode: b.driverCode,
          modelIndex: mIdx,
          bodyColor: b.bodyColor,
          baseAiSkill: b.baseAiSkill
        };
      });
    }

    deserializeSeasonBots(savedBots) {
      if (!savedBots || !Array.isArray(savedBots) || savedBots.length < 19) return false;
      this.seasonBots = savedBots.map(sb => {
        const model = CAR_MODELS[sb.modelIndex] || CAR_MODELS[0];
        return {
          driverName: sb.driverName,
          driverCode: sb.driverCode,
          model: model,
          bodyColor: sb.bodyColor,
          baseAiSkill: sb.baseAiSkill
        };
      });
      return true;
    }

    computeNextGridOrder() {
      if (!this.seasonBots || this.seasonBots.length < 19) return;
      // REGRA DE GRID:
      // O Jogador é SEMPRE mantido em P20 (último colocado, lado direito da pista, desafio arcade clássico).
      // A ordenação de P1 a P19 considera ESTRITAMENTE os 19 bots rivais entre si:
      // O bot líder (com mais pontos no campeonato entre os bots) larga na Pole (P1).
      // Os demais seguem em ordem decrescente até o 19º bot em P19 (ao lado do jogador).
      // Mesmo que o jogador lidere o campeonato, o jogador NUNCA larga em P1, mantendo P20 fixo.
      const botIndices = Array.from({ length: 19 }, (_, i) => i);
      botIndices.sort((a, b) => {
        const ptsA = (this.championshipPoints && this.championshipPoints[a + 1] !== undefined) ? this.championshipPoints[a + 1] : 0;
        const ptsB = (this.championshipPoints && this.championshipPoints[b + 1] !== undefined) ? this.championshipPoints[b + 1] : 0;
        if (ptsB !== ptsA) return ptsB - ptsA;
        return a - b;
      });
      this.seasonGridOrder = botIndices;
    }

    saveCurrentChampionship() {
      if (this.gameMode !== 'CHAMPIONSHIP') return false;
      const slotNum = this.activeSaveSlot || 1;
      let pRank = 1;
      let pPoints = 0;
      if (this.championshipPoints && this.cars && this.cars.length > 0) {
        const overall = this.cars.map(c => ({
          car: c,
          points: this.championshipPoints[c.id] || 0
        })).sort((a, b) => b.points - a.points);
        const idx = overall.findIndex(o => o.car.isPlayer);
        pRank = idx >= 0 ? (idx + 1) : 1;
        pPoints = this.championshipPoints[this.player ? this.player.id : 0] || 0;
      }

      const serializedBots = this.serializeSeasonBots();
      const gridOrder = (this.seasonGridOrder && this.seasonGridOrder.length === 19)
        ? [...this.seasonGridOrder]
        : Array.from({ length: 19 }, (_, i) => i);

      const data = {
        playerName: this.playerName || 'JOGADOR',
        gameMode: this.gameMode,
        difficulty: this.diffMode,
        selectedCarIndex: this.selectedCarIndex,
        colorIndex: this.colorIndex,
        seasonStage: this.seasonStage,
        seasonSchedule: this.seasonSchedule,
        championshipPoints: this.championshipPoints,
        lastTrackIndex: this.trackIndex,
        nextTrackIndex: (this.seasonSchedule && this.seasonSchedule[this.seasonStage]) !== undefined ? this.seasonSchedule[this.seasonStage] : this.trackIndex,
        playerRank: pRank,
        totalPoints: pPoints,
        seasonBots: serializedBots,
        seasonGridOrder: gridOrder
      };
      return SaveManager.saveSlot(slotNum, data);
    }

    loadFromSave(slotData) {
      if (!slotData) return;
      this.activeSaveSlot = slotData.slotNum || 1;
      this.playerName = slotData.playerName || 'JOGADOR';
      this.selectedCarIndex = slotData.selectedCarIndex || 0;
      this.colorIndex = slotData.colorIndex !== undefined ? slotData.colorIndex : 1;
      this.gameMode = slotData.gameMode || 'CHAMPIONSHIP';
      this.diffMode = slotData.difficulty || 'NORMAL';
      this.seasonStage = slotData.seasonStage !== undefined ? slotData.seasonStage : 0;
      this.seasonSchedule = (slotData.seasonSchedule && slotData.seasonSchedule.length > 0)
        ? [...slotData.seasonSchedule]
        : this.getChampionshipSchedule();
      this.championshipPoints = (slotData.championshipPoints && slotData.championshipPoints.length > 0)
        ? [...slotData.championshipPoints]
        : new Array(TOTAL_RACERS).fill(0);

      // Restaurar exatamente os 19 bots da temporada salva
      if (slotData.seasonBots && Array.isArray(slotData.seasonBots) && slotData.seasonBots.length >= 19) {
        this.deserializeSeasonBots(slotData.seasonBots);
      } else if (!this.seasonBots || this.seasonBots.length < 19) {
        this.initSeasonRoster(this.selectedCarIndex);
      }

      // Restaurar a ordem exata do grid salva
      if (slotData.seasonGridOrder && Array.isArray(slotData.seasonGridOrder) && slotData.seasonGridOrder.length === 19) {
        this.seasonGridOrder = [...slotData.seasonGridOrder];
      } else {
        this.seasonGridOrder = Array.from({ length: 19 }, (_, i) => i);
      }

      this.trackIndex = this.seasonSchedule[this.seasonStage] || 0;
      this.loadTrack(this.trackIndex);
      this.fadeTransition('RACE_SETUP');
    }

    confirmName() {
      if (this.state !== 'NAME_INPUT') return;
      if (this.nameInput) {
        const val = this.nameInput.value.trim().toUpperCase();
        this.playerName = val || 'JOGADOR';
        try { localStorage.setItem('lh44_player_name', this.playerName); } catch (_) {}
        this.nameInput.blur();
      }
      if (this.nameWrapper) this.nameWrapper.classList.remove('show');
      this.audio.playBeep(523, 0.12);
      if (this.gameMode === 'CHAMPIONSHIP' && (this.seasonStage === 0 || !this.seasonBots || this.seasonBots.length < 19)) {
        this.initSeasonRoster(this.selectedCarIndex);
      }
      this.fadeTransition('RACE_SETUP');
      this.setupCooldown = 0.55;
      this.setupGroup = 0;
      this.audio.stopTitleMusic();
      this.audio.musicPlaying = true;
      if (this.audio && typeof this.audio.setSong === 'function') {
        this.audio.setSong(this.songIndex);
      }
      if (this.input) {
        this.input.lastCanvasClick = null;
        this.input.enter = false;
        this.input.justPressedEnter = false;
        this.input.clearPulses();
      }
    }

    get songIndex() {
      return (this.audio && typeof this.audio.songIndex === 'number') ? this.audio.songIndex : 0;
    }
    set songIndex(idx) {
      if (this.audio && typeof this.audio.setSong === 'function') {
        this.audio.setSong(idx);
      }
    }

    // Ajusta dinamicamente a resolução interna em Alta Definição (RENDER_SCALE = 3x -> 1152x648+)
    // mantendo as coordenadas lógicas intactas e leves para Intel HD Graphics e Mobile!
    syncCanvasResolution() {
      if (!this.canvas) return;
      const vp = document.getElementById('viewport');
      let targetW = REF_WIDTH;
      if (vp) {
        const w = vp.clientWidth || window.innerWidth;
        const h = vp.clientHeight || window.innerHeight;
        if (w > 0 && h > 0) {
          const aspect = w / h;
          targetW = Math.max(REF_WIDTH, Math.min(540, Math.round(INTERNAL_HEIGHT * aspect)));
        }
      }
      const backingW = Math.round(targetW * RENDER_SCALE);
      const backingH = Math.round(INTERNAL_HEIGHT * RENDER_SCALE);
      if (INTERNAL_WIDTH !== targetW || this.canvas.width !== backingW || this.canvas.height !== backingH) {
        INTERNAL_WIDTH = targetW;
        this.canvas.width = backingW;
        this.canvas.height = backingH;
        if (this.webglCanvas) {
          this.webglCanvas.width = backingW;
          this.webglCanvas.height = backingH;
        }
        if (this.webgl) {
          this.webgl.width = INTERNAL_WIDTH;
          this.webgl.height = INTERNAL_HEIGHT;
          if (this.webgl.gl) {
            this.webgl.gl.viewport(0, 0, backingW, backingH);
          }
        }
      }
    }

    initSeasonRoster(playerModelIndex = -1) {
      this.seasonBots = [];
      const chosenIndex = (playerModelIndex >= 0) ? playerModelIndex : this.selectedCarIndex;
      const availableModels = CAR_MODELS.filter((_, idx) => idx !== chosenIndex);
      for (let i = availableModels.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableModels[i], availableModels[j]] = [availableModels[j], availableModels[i]];
      }
      for (let i = 0; i < F1_DRIVERS.length && i < 19; i++) {
        const drv = F1_DRIVERS[i];
        const assignedModel = availableModels[i % availableModels.length] || CAR_MODELS[0];
        const randColor = BOT_BODY_COLORS[i % BOT_BODY_COLORS.length];
        const baseSkill = 0.98 - (i * 0.007) + (Math.random() - 0.5) * 0.035;
        this.seasonBots.push({
          driverName: drv.name,
          driverCode: drv.code,
          model: assignedModel,
          bodyColor: randColor,
          baseAiSkill: baseSkill
        });
      }
      // Ordem inicial do grid da temporada (P1 ao P19 ordenados por habilidade do piloto)
      this.seasonGridOrder = Array.from({ length: 19 }, (_, i) => i);
    }

    getChampionshipSchedule() {
      // Retorna todos os índices de pistas do jogo, garantindo que São Paulo (SP) seja a grande final (última etapa)
      const spIndex = TRACK_DEFINITIONS.findIndex(t => t.id === 'sao_paulo' || t.stateCode === 'SP');
      const schedule = [];
      for (let i = 0; i < TRACK_DEFINITIONS.length; i++) {
        if (i !== spIndex) schedule.push(i);
      }
      if (spIndex !== -1) {
        schedule.push(spIndex);
      }
      return schedule;
    }

    loadTrack(index) {
      this.trackIndex = index;
      const def = TRACK_DEFINITIONS[index];
      this.track = TrackBuilder.build(def);
      if (def && def.theme) {
        this.envCond = def.theme;
      }
    }

    setupRaceGrid() {
      const selectedModel = CAR_MODELS[this.selectedCarIndex];
      this.cars = [];
      this.finishOrder = [];

      if (!this.seasonBots || this.seasonBots.length < 19) {
        this.initSeasonRoster();
      }

      let botModels = [];
      if (this.gameMode === 'CHAMPIONSHIP') {
        botModels = this.seasonBots.map(b => b.model);
      } else {
        const remainingModels = CAR_MODELS.filter((_, idx) => idx !== this.selectedCarIndex);
        for (let i = remainingModels.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remainingModels[i], remainingModels[j]] = [remainingModels[j], remainingModels[i]];
        }
        botModels = remainingModels;
      }

      // 19 Adversários da CPU com seus carros persistentes e únicos (Ordem fixa de Grid)
      for (let slot = 1; slot <= 19; slot++) {
        const botIdx = (this.gameMode === 'CHAMPIONSHIP' && this.seasonGridOrder && this.seasonGridOrder[slot - 1] !== undefined)
          ? this.seasonGridOrder[slot - 1]
          : (slot - 1);
        const profile = this.seasonBots[botIdx] || this.seasonBots[slot - 1];
        const botModel = (this.gameMode === 'CHAMPIONSHIP') ? profile.model : (botModels[slot - 1] || profile.model);
        const bot = new Car(botIdx + 1, botModel, false);
        bot.driverName = profile.driverName;
        bot.driverCode = profile.driverCode;
        bot.bodyColor = profile.bodyColor;
        bot.effectiveMaxSpeed = (this.diffMode === 'ADVANCED') ? 280 : (botModel.maxSpeed || 220);
        const rowFromBack = Math.floor((TOTAL_RACERS - slot) / 2);
        const isLeft = (slot % 2 === 1);
        bot.z = 1600 + rowFromBack * GRID_ROW_SPACING + (isLeft ? GRID_STAGGER_Z : 0);
        bot.x = isLeft ? -GRID_COL_X : GRID_COL_X;
        bot.targetX = bot.x;
        bot.gridStartX = bot.x;
        bot.speed = 0;
        bot.laps = 0;
        bot.totalDistance = bot.z;
        bot.nextLapTarget = START_LINE_Z + this.track.totalLength;
        bot.finishTime = 0;
        bot.steerAngle = 0;
        bot.nitroCharges = 3;
        bot.nitroTimer = 0;
        bot.nitroDecayTimer = 0;
        bot.isNitro = false;
        bot.nitroCooldown = 3.5 + Math.random() * 5.0;
        bot.inSlipstream = false;
        bot.slipstreamIntensity = 0;
        bot.slipstreamDecayTimer = 0;
        bot.slipstreamStoredIntensity = 0;
        bot.slipstreamPeakSpeed = 0;
        bot.launchDelay = 0.04 + ((slot - 1) * 0.01) + Math.random() * 0.14;
        bot.aiSkill = Math.max(0.78, Math.min(0.99, profile.baseAiSkill + (Math.random() - 0.5) * 0.025));
        this.cars.push(bot);
      }

      // O JOGADOR COMEÇA EM ÚLTIMO LUGAR (P20) COM O CARRO E COR ESCOLHIDOS!
      this.player = new Car(0, selectedModel, true);
      this.player.driverName = (this.playerName || 'LEANDRO').slice(0, 12);
      const cleanCode = (this.playerName || 'LEA').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
      this.player.driverCode = cleanCode.length === 3 ? cleanCode : (cleanCode + '___').slice(0, 3);
      this.player.bodyColor = CAR_COLORS[this.colorIndex].hex;
      this.player.effectiveMaxSpeed = (this.diffMode === 'ADVANCED') ? 280 : (selectedModel.maxSpeed || 220);
      this.player.z = 1600;
      this.player.x = GRID_COL_X;
      this.player.targetX = GRID_COL_X;
      this.player.gridStartX = GRID_COL_X;
      this.player.speed = 0;
      this.player.laps = 0;
      this.player.totalDistance = this.player.z;
      this.player.nextLapTarget = START_LINE_Z + this.track.totalLength;
      this.player.finishTime = 0;
      this.player.steerAngle = 0;
      this.player.inSlipstream = false;
      this.player.slipstreamIntensity = 0;
      this.player.slipstreamDecayTimer = 0;
      this.player.slipstreamStoredIntensity = 0;
      this.player.slipstreamPeakSpeed = 0;
      this.player.nitroCharges = 3;
      this.player.nitroTimer = 0;
      this.player.nitroDecayTimer = 0;
      this.cars.push(this.player);

      this.playerRenderPos = { x: INTERNAL_WIDTH / 2, y: INTERNAL_HEIGHT - 32 };
      this.smoothCurveScreenX = 0;
      this.foregroundBots = [];
      if (this.track && this.track.segments) {
        for (let i = 0; i < this.track.segments.length; i++) {
          this.track.segments[i].skidUntil = 0;
        }
      }

      this.raceTimer = 0;
      this.currentLapTime = 0;
      this.bestLapTime = 0;
      this.lastLapTime = 0;
      this.lapBannerTimer = 0;
      this.greenLightsTimer = 0;
      this.finishingRace = false;
      this.finishTimer = 0;
      this.finishFadeAlpha = 0;
      this.f1LeaderboardToggled = false;
      this.particlePool.clear();
    }
    startRaceCountdown() {
      this.setupRaceGrid();
      this.state = 'COUNTDOWN';
      this.countdown = 3.6;
      this.startLightsStage = 0;
      this.greenLightsTimer = 0;
      this.finishingRace = false;
      this.finishTimer = 0;
      this.finishFadeAlpha = 0;
      this.f1LeaderboardToggled = false;
      if (this.audio) {
        this.audio.stopTitleMusic();
        this.audio.musicPlaying = true;
        this.audio.restartMusic();
        this.audio.startRaceEffects();
      }
    }

    wrapZ(z) {
      const len = this.track.totalLength;
      return ((z % len) + len) % len;
    }

    shortestDeltaZ(zA, zB) {
      const len = this.track.totalLength;
      let dz = (zA - zB) % len;
      if (dz > len / 2) dz -= len;
      if (dz < -len / 2) dz += len;
      return dz;
    }

    findSegment(z) {
      const segIndex = Math.floor(z / SEGMENT_LENGTH) % this.track.segments.length;
      return this.track.segments[(segIndex + this.track.segments.length) % this.track.segments.length];
    }

    project(p, cameraX, cameraY, cameraZ) {
      const depth = this.currentCameraDepth || CAMERA_DEPTH;
      p.camera.x = (p.world.x || 0) - cameraX;
      p.camera.y = (p.world.y || 0) - cameraY;
      p.camera.z = (p.world.z || 0) - cameraZ;
      p.screen.scale = depth / p.camera.z;
      p.screen.x = (INTERNAL_WIDTH / 2) + (p.screen.scale * p.camera.x * REF_WIDTH / 2);
      p.screen.y = (INTERNAL_HEIGHT / 2) - (p.screen.scale * p.camera.y * INTERNAL_HEIGHT / 2);
      p.screen.w = (p.screen.scale * ROAD_WIDTH * REF_WIDTH / 2);
    }

    projectInterpolated(seg, pct) {
      const depth = this.currentCameraDepth || CAMERA_DEPTH;
      const camX = (1 - pct) * seg.p1.camera.x + pct * seg.p2.camera.x;
      const camY = (1 - pct) * seg.p1.camera.y + pct * seg.p2.camera.y;
      const camZ = Math.max(depth + 1, (1 - pct) * seg.p1.camera.z + pct * seg.p2.camera.z);
      const scale = depth / camZ;
      return {
        x: (INTERNAL_WIDTH / 2) + (scale * camX * REF_WIDTH / 2),
        y: (INTERNAL_HEIGHT / 2) - (scale * camY * INTERNAL_HEIGHT / 2),
        w: scale * ROAD_WIDTH * REF_WIDTH / 2
      };
    }

    // ==========================================
    // FÍSICA E ATUALIZAÇÃO
    // ==========================================
    update(dt) {
      // Atualização do fade suave de transição dos menus
      if (this.menuFadeState === 'fading_out') {
        this.menuFadeAlpha += dt / this.menuFadeDuration;
        if (this.menuFadeAlpha >= 1) {
          this.menuFadeAlpha = 1;
          this.menuFadeState = 'fading_in';
          if (this.menuFadeTargetState) {
            this.state = this.menuFadeTargetState;
          }
          if (this.menuFadeOnMid) {
            try { this.menuFadeOnMid(); } catch (e) { console.error(e); }
          }
        }
        return;
      } else if (this.menuFadeState === 'fading_in') {
        this.menuFadeAlpha -= dt / this.menuFadeDuration;
        if (this.menuFadeAlpha <= 0) {
          this.menuFadeAlpha = 0;
          this.menuFadeState = 'idle';
          this.menuFadeTargetState = null;
          this.menuFadeOnMid = null;
        }
      }

      if (this.input && typeof this.input.pollGamepad === 'function') {
        this.input.pollGamepad(dt);
      }

      // Se as configurações estiverem abertas, isola o jogo no fundo, silencia efeitos e impede que qualquer ação despause
      if (this.input && typeof this.input.isSettingsOpen === 'function' && this.input.isSettingsOpen()) {
        if (this.audio) this.audio.silenceEffects();
        if (this.input.clearPulses) this.input.clearPulses();
        return;
      }
      if (this.input.justPressedM) {
        this.audio.enabled = !this.audio.enabled;
        if (!this.audio.enabled) {
          this.audio.silenceEffects();
        } else {
          this.audio.playBeep(440, 0.08);
        }
      }

      if (this.input.justPressedLeaderboard) {
        this.f1LeaderboardToggled = !this.f1LeaderboardToggled;
      }
      if ((this.state === 'RACING' || this.state === 'COUNTDOWN' || this.state === 'PAUSED') && this.input.lastCanvasClick) {
        if (this.input.lastCanvasClick.x <= 80 && this.input.lastCanvasClick.y <= 50) {
          this.f1LeaderboardToggled = !this.f1LeaderboardToggled;
          this.input.lastCanvasClick = null;
        }
      }

      if (this.pauseBtn) {
        const isRacingState = (this.state === 'RACING' || this.state === 'COUNTDOWN' || this.state === 'PAUSED' || this.state === 'RESUME_COUNTDOWN');
        this.pauseBtn.style.display = isRacingState ? 'flex' : 'none';
        const isPaused = (this.state === 'PAUSED' || this.state === 'RESUME_COUNTDOWN');
        this.pauseBtn.textContent = isPaused ? '▶' : '⏸';
        this.pauseBtn.title = isPaused ? 'Continuar Corrida' : 'Pausar Jogo';
        this.pauseBtn.classList.toggle('active', isPaused);
      }

      const btnB = document.getElementById('btn-b');
      if (btnB) {
        const isRacingState = (this.state === 'RACING' || this.state === 'COUNTDOWN' || this.state === 'PAUSED' || this.state === 'RESUME_COUNTDOWN');
        if (isRacingState) {
          const isF1Active = !!(this.f1LeaderboardToggled || (this.input && this.input.leaderboard));
          btnB.classList.toggle('active', isF1Active);
        } else {
          btnB.classList.remove('active');
        }
      }

      if (this.state === 'MENU') {
        if (this.nameWrapper) this.nameWrapper.classList.remove('show');
        this.audio.silenceEffects();
        this.menuCameraZ = this.wrapZ(this.menuCameraZ + 850 * dt);
        this.cameraRoll = 0;
        this.shake = 0;
        this.updateSkyScroll(dt);
        this.updateEnv(dt);

        const cx = INTERNAL_WIDTH / 2;
        const touchSafe = this.input.touchControlsVisible;
        const btnW = touchSafe ? 144 : 156;
        const btnH = touchSafe ? 18 : 20;
        const btnX = Math.round(cx - btnW / 2);
        const slant = 5;
        const btn0_Y = touchSafe ? 104 : 110;
        const btn1_Y = touchSafe ? 127 : 135;

        let shouldAdvance = false;
        if (this.input.lastCanvasClick) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;

          // Engrenagem no canto superior direito
          if (click.x >= INTERNAL_WIDTH - 38 && click.y <= 38) {
            const gearBtn = document.getElementById('gear-btn');
            if (gearBtn) gearBtn.click();
            this.input.clearPulses();
            return;
          }

          // Botão 0 (INICIAR NOVO JOGO)
          if (click.x >= btnX && click.x <= btnX + btnW + slant && click.y >= btn0_Y && click.y <= btn0_Y + btnH) {
            this.mainMenuSelection = 0;
            shouldAdvance = true;
          }
          // Botão 1 (CONTINUAR)
          else if (click.x >= btnX && click.x <= btnX + btnW + slant && click.y >= btn1_Y && click.y <= btn1_Y + btnH) {
            this.mainMenuSelection = 1;
            shouldAdvance = true;
          }
        }

        if (this.input.justPressedUp || this.input.justPressedDown) {
          this.mainMenuSelection = (this.mainMenuSelection === 0 ? 1 : 0);
          this.audio.playBeep(440, 0.05);
        }

        if (this.input.justPressedEnter) {
          shouldAdvance = true;
        }

        if (shouldAdvance) {
          this.audio.playBeep(480, 0.08);
          if (this.mainMenuSelection === 0) {
            this.fadeTransition('MODE_SELECT');
          } else {
            this.slotSelectMode = 'CONTINUE';
            this.selectedSlotIndex = 0;
            this.slotDeleteConfirm = null;
            this.slotOverwriteConfirm = null;
            this.fadeTransition('SLOT_SELECT');
          }
          this.input.clearPulses();
          return;
        }
        this.input.clearPulses();
        return;
      }

      if (this.state === 'MODE_SELECT') {
        if (this.nameWrapper) this.nameWrapper.classList.remove('show');
        this.audio.silenceEffects();
        this.menuCameraZ = this.wrapZ(this.menuCameraZ + 850 * dt);
        this.cameraRoll = 0;
        this.shake = 0;
        this.updateSkyScroll(dt);
        this.updateEnv(dt);

        const L = this.getModeSelectLayout();
        if (this.input.lastCanvasClick) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;

          // Clique no botão VOLTAR
          if (click.x >= L.btnBack.x && click.x <= L.btnBack.x + L.btnBack.w &&
              click.y >= L.btnBack.y && click.y <= L.btnBack.y + L.btnBack.h) {
            this.audio.playBeep(330, 0.06);
            this.fadeTransition('MENU');
            this.input.clearPulses();
            return;
          }

          // Clique no card 0 (Campeonato) — seleciona sem avançar
          if (click.x >= L.card0.x && click.x <= L.card0.x + L.card0.w &&
              click.y >= L.card0.y && click.y <= L.card0.y + L.card0.h) {
            this.selectedModeIndex = 0;
            this.audio.playBeep(440, 0.06);
          }

          // Clique no card 1 (Corrida Rápida) — seleciona sem avançar
          if (click.x >= L.card1.x && click.x <= L.card1.x + L.card1.w &&
              click.y >= L.card1.y && click.y <= L.card1.y + L.card1.h) {
            this.selectedModeIndex = 1;
            this.audio.playBeep(440, 0.06);
          }

          // Clique no botão CONTINUAR
          if (click.x >= L.btnConfirm.x && click.x <= L.btnConfirm.x + L.btnConfirm.w &&
              click.y >= L.btnConfirm.y && click.y <= L.btnConfirm.y + L.btnConfirm.h) {
            this.input.justPressedEnter = true;
          }
        }

        if (this.input.justPressedLeft || this.input.justPressedRight || this.input.justPressedUp || this.input.justPressedDown) {
          this.selectedModeIndex = this.selectedModeIndex === 0 ? 1 : 0;
          this.audio.playBeep(440, 0.05);
        }

        if (this.input.justPressedEnter) {
          this.audio.playBeep(523, 0.12);
          this.gameMode = (this.selectedModeIndex === 0) ? 'CHAMPIONSHIP' : 'QUICK_RACE';
          this.selectedDiffIndex = 0;
          this.fadeTransition('DIFFICULTY_SELECT');
          this.input.clearPulses();
          return;
        }

        if (this.input.justPressedEsc) {
          this.audio.playBeep(330, 0.06);
          this.fadeTransition('MENU');
          this.input.clearPulses();
          return;
        }
        this.input.clearPulses();
        return;
      }

      if (this.state === 'DIFFICULTY_SELECT') {
        if (this.nameWrapper) this.nameWrapper.classList.remove('show');
        this.audio.silenceEffects();
        this.menuCameraZ = this.wrapZ(this.menuCameraZ + 850 * dt);
        this.cameraRoll = 0;
        this.shake = 0;
        this.updateSkyScroll(dt);
        this.updateEnv(dt);

        const L = this.getDifficultySelectLayout();
        if (this.input.lastCanvasClick) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;

          if (click.x >= L.btnBack.x && click.x <= L.btnBack.x + L.btnBack.w &&
              click.y >= L.btnBack.y && click.y <= L.btnBack.y + L.btnBack.h) {
            this.audio.playBeep(330, 0.06);
            this.fadeTransition('MODE_SELECT');
            this.input.clearPulses();
            return;
          }

          if (click.x >= L.card0.x && click.x <= L.card0.x + L.card0.w &&
              click.y >= L.card0.y && click.y <= L.card0.y + L.card0.h) {
            this.selectedDiffIndex = 0;
            this.audio.playBeep(440, 0.06);
          }

          if (click.x >= L.card1.x && click.x <= L.card1.x + L.card1.w &&
              click.y >= L.card1.y && click.y <= L.card1.y + L.card1.h) {
            this.selectedDiffIndex = 1;
            this.audio.playBeep(440, 0.06);
          }

          if (click.x >= L.btnConfirm.x && click.x <= L.btnConfirm.x + L.btnConfirm.w &&
              click.y >= L.btnConfirm.y && click.y <= L.btnConfirm.y + L.btnConfirm.h) {
            this.input.justPressedEnter = true;
          }
        }

        if (this.input.justPressedLeft || this.input.justPressedRight || this.input.justPressedUp || this.input.justPressedDown) {
          this.selectedDiffIndex = this.selectedDiffIndex === 0 ? 1 : 0;
          this.audio.playBeep(440, 0.05);
        }

        if (this.input.justPressedEnter) {
          this.audio.playBeep(523, 0.12);
          this.diffMode = (this.selectedDiffIndex === 0) ? 'NORMAL' : 'ADVANCED';
          if (this.gameMode === 'CHAMPIONSHIP') {
            this.slotSelectMode = 'NEW';
            this.selectedSlotIndex = 0;
            this.slotDeleteConfirm = null;
            this.slotOverwriteConfirm = null;
            this.fadeTransition('SLOT_SELECT');
          } else {
            this.selectedQuickTrackIndex = 0;
            this.trackIndex = 0;
            this.loadTrack(0);
            this.fadeTransition('TRACK_SELECT');
          }
          this.input.clearPulses();
          return;
        }

        if (this.input.justPressedEsc) {
          this.audio.playBeep(330, 0.06);
          this.fadeTransition('MODE_SELECT');
          this.input.clearPulses();
          return;
        }

        this.input.clearPulses();
        return;
      }

      if (this.state === 'TRACK_SELECT') {
        if (this.nameWrapper) this.nameWrapper.classList.remove('show');
        this.audio.silenceEffects();
        this.menuCameraZ = this.wrapZ(this.menuCameraZ + 850 * dt);
        this.cameraRoll = 0;
        this.shake = 0;
        this.updateSkyScroll(dt);
        this.updateEnv(dt);

        const L = this.getTrackSelectLayout();
        if (this.input.lastCanvasClick) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;

          // Clique no botão VOLTAR
          if (L.btnBack && click.x >= L.btnBack.x && click.x <= L.btnBack.x + L.btnBack.w &&
              click.y >= L.btnBack.y && click.y <= L.btnBack.y + L.btnBack.h) {
            this.audio.playBeep(330, 0.06);
            this.fadeTransition('DIFFICULTY_SELECT');
            this.input.clearPulses();
            return;
          }

          // Clique no botão CONFIRMAR
          if (L.btnConfirm && click.x >= L.btnConfirm.x && click.x <= L.btnConfirm.x + L.btnConfirm.w &&
              click.y >= L.btnConfirm.y && click.y <= L.btnConfirm.y + L.btnConfirm.h) {
            this.input.justPressedEnter = true;
          }

          // Clique na seta lateral PREV (◀)
          if (L.btnPrev && click.x >= L.btnPrev.x && click.x <= L.btnPrev.x + L.btnPrev.w &&
              click.y >= L.btnPrev.y && click.y <= L.btnPrev.y + L.btnPrev.h) {
            this.input.justPressedLeft = true;
          }

          // Clique na seta lateral NEXT (▶)
          if (L.btnNext && click.x >= L.btnNext.x && click.x <= L.btnNext.x + L.btnNext.w &&
              click.y >= L.btnNext.y && click.y <= L.btnNext.y + L.btnNext.h) {
            this.input.justPressedRight = true;
          }

          // Clique em qualquer um dos 27 chips de estado da grade
          if (L.chips) {
            for (let k = 0; k < L.chips.length; k++) {
              const c = L.chips[k];
              if (click.x >= c.x && click.x <= c.x + c.w && click.y >= c.y && click.y <= c.y + c.h) {
                this.selectedQuickTrackIndex = c.i;
                this.trackIndex = c.i;
                this.loadTrack(c.i);
                this.audio.playBeep(440, 0.06);
                break;
              }
            }
          }
        }

        if (this.input.justPressedLeft) {
          this.selectedQuickTrackIndex = (this.selectedQuickTrackIndex - 1 + TRACK_DEFINITIONS.length) % TRACK_DEFINITIONS.length;
          this.trackIndex = this.selectedQuickTrackIndex;
          this.loadTrack(this.trackIndex);
          this.audio.playBeep(440, 0.05);
        }
        if (this.input.justPressedRight) {
          this.selectedQuickTrackIndex = (this.selectedQuickTrackIndex + 1) % TRACK_DEFINITIONS.length;
          this.trackIndex = this.selectedQuickTrackIndex;
          this.loadTrack(this.trackIndex);
          this.audio.playBeep(440, 0.05);
        }
        if (this.input.justPressedUp) {
          if (this.selectedQuickTrackIndex < 4) {
            // Se está na fileira clássica, sobe para a última fileira de capitais
            this.selectedQuickTrackIndex = Math.min(TRACK_DEFINITIONS.length - 1, 22 + this.selectedQuickTrackIndex);
          } else if (this.selectedQuickTrackIndex < 13) {
            // Se está na 1ª fileira de capitais (4..12), sobe para a fileira clássica (0..3)
            this.selectedQuickTrackIndex = Math.min(3, Math.floor((this.selectedQuickTrackIndex - 4) * (4 / 9)));
          } else {
            // Sobe 1 fileira de capitais (-9 posições)
            this.selectedQuickTrackIndex -= 9;
          }
          this.trackIndex = this.selectedQuickTrackIndex;
          this.loadTrack(this.trackIndex);
          this.audio.playBeep(440, 0.05);
        }
        if (this.input.justPressedDown) {
          if (this.selectedQuickTrackIndex < 4) {
            // Se está na fileira clássica, desce para a 1ª fileira de capitais
            this.selectedQuickTrackIndex = 4 + Math.floor(this.selectedQuickTrackIndex * (9 / 4));
          } else if (this.selectedQuickTrackIndex >= 22) {
            // Se está na última fileira de capitais, desce para a fileira clássica
            this.selectedQuickTrackIndex = Math.min(3, Math.floor((this.selectedQuickTrackIndex - 22) * (4 / 9)));
          } else {
            // Desce 1 fileira de capitais (+9 posições)
            this.selectedQuickTrackIndex = Math.min(TRACK_DEFINITIONS.length - 1, this.selectedQuickTrackIndex + 9);
          }
          this.trackIndex = this.selectedQuickTrackIndex;
          this.loadTrack(this.trackIndex);
          this.audio.playBeep(440, 0.05);
        }

        if (this.input.justPressedEnter) {
          this.audio.playBeep(523, 0.12);
          this.trackIndex = this.selectedQuickTrackIndex;
          this.loadTrack(this.trackIndex);
          this.colorIndex = MODEL_DEFAULT_COLOR[CAR_MODELS[this.selectedCarIndex].id] || 0;
          this.fadeTransition('CAR_SELECT');
          this.input.clearPulses();
          return;
        }

        if (this.input.justPressedEsc) {
          this.audio.playBeep(330, 0.06);
          this.fadeTransition('DIFFICULTY_SELECT');
        }
        this.input.clearPulses();
        return;
      }

      if (this.state === 'CAR_SELECT') {
        if (this.nameWrapper) this.nameWrapper.classList.remove('show');
        this.audio.silenceEffects();
        this.menuCameraZ = this.wrapZ(this.menuCameraZ + 850 * dt);
        this.cameraRoll = 0;
        this.shake = 0;
        this.updateSkyScroll(dt);
        this.updateEnv(dt);

        const L = this.getCarSelectLayout();
        if (this.input.lastCanvasClick) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;
          const { bX, bY, bW, bH, chips, btnBack, btnConfirm } = L;

          // Clique no botão VOLTAR
          if (btnBack && click.x >= btnBack.x && click.x <= btnBack.x + btnBack.w &&
              click.y >= btnBack.y && click.y <= btnBack.y + btnBack.h) {
            this.audio.playBeep(330, 0.06);
            this.fadeTransition((this.gameMode === 'QUICK_RACE') ? 'TRACK_SELECT' : 'DIFFICULTY_SELECT');
            this.input.clearPulses();
            return;
          }

          // Clique no botão ESCOLHER COR (Avança para a Etapa de Seleção de Cor!)
          if (btnConfirm && click.x >= btnConfirm.x && click.x <= btnConfirm.x + btnConfirm.w &&
              click.y >= btnConfirm.y && click.y <= btnConfirm.y + btnConfirm.h) {
            this.audio.playBeep(523, 0.12);
            this.fadeTransition('COLOR_SELECT');
            this.input.clearPulses();
            return;
          }

          // Clique direto em qualquer um dos 20 chips de carros da grade
          if (chips) {
            for (let c = 0; c < chips.length; c++) {
              const chip = chips[c];
              if (click.x >= chip.x && click.x <= chip.x + chip.w &&
                  click.y >= chip.y && click.y <= chip.y + chip.h) {
                if (this.selectedCarIndex !== chip.i) {
                  this.selectedCarIndex = chip.i;
                  this.colorIndex = MODEL_DEFAULT_COLOR[CAR_MODELS[this.selectedCarIndex].id] || 0;
                  this.audio.playBeep(440, 0.05);
                }
                this.input.clearPulses();
                return;
              }
            }
          }

          // Setas laterais de troca de carro
          if (click.x < bX + 26 && click.y >= bY - 10 && click.y <= bY + bH + 10) {
            this.input.justPressedLeft = true;
            this.input.justPressedEnter = false;
          } else if (click.x > bX + bW - 26 && click.y >= bY - 10 && click.y <= bY + bH + 10) {
            this.input.justPressedRight = true;
            this.input.justPressedEnter = false;
          }
        }

        if (this.input.justPressedLeft) {
          this.audio.playBeep(330, 0.06);
          this.selectedCarIndex = (this.selectedCarIndex - 1 + CAR_MODELS.length) % CAR_MODELS.length;
          this.colorIndex = MODEL_DEFAULT_COLOR[CAR_MODELS[this.selectedCarIndex].id] || 0;
        }
        if (this.input.justPressedRight) {
          this.audio.playBeep(330, 0.06);
          this.selectedCarIndex = (this.selectedCarIndex + 1) % CAR_MODELS.length;
          this.colorIndex = MODEL_DEFAULT_COLOR[CAR_MODELS[this.selectedCarIndex].id] || 0;
        }
        if (this.input.justPressedUp || this.input.justPressedDown) {
          this.audio.playBeep(330, 0.06);
          // Salta 10 posições entre a 1ª e 2ª fileira de carros
          this.selectedCarIndex = (this.selectedCarIndex + 10) % CAR_MODELS.length;
          this.colorIndex = MODEL_DEFAULT_COLOR[CAR_MODELS[this.selectedCarIndex].id] || 0;
        }

        if (this.input.justPressedEnter) {
          this.audio.playBeep(523, 0.12);
          this.state = 'COLOR_SELECT';
          this.input.clearPulses();
          return;
        }
        if (this.input.justPressedEsc) {
          this.audio.playBeep(330, 0.06);
          this.fadeTransition((this.gameMode === 'QUICK_RACE') ? 'TRACK_SELECT' : 'DIFFICULTY_SELECT');
        }
        this.input.clearPulses();
        return;
      }

      // ========================================================
      // ETAPA 2 : SELEÇÃO DE COR DO CARRO (CONTROLE, TECLADO OU TOQUE)
      // ========================================================
      if (this.state === 'COLOR_SELECT') {
        if (this.nameWrapper) this.nameWrapper.classList.remove('show');
        this.audio.silenceEffects();
        this.menuCameraZ = this.wrapZ(this.menuCameraZ + 850 * dt);
        this.cameraRoll = 0;
        this.shake = 0;
        this.updateSkyScroll(dt);
        this.updateEnv(dt);

        const L = this.getColorSelectLayout();
        if (this.input.lastCanvasClick) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;
          const { bX, bY, bW, bH, sw, btnBack, btnConfirm } = L;

          // Clique no botão VOLTAR AO CARRO
          if (btnBack && click.x >= btnBack.x && click.x <= btnBack.x + btnBack.w &&
              click.y >= btnBack.y && click.y <= btnBack.y + btnBack.h) {
            this.audio.playBeep(330, 0.06);
            this.fadeTransition('CAR_SELECT');
            this.input.clearPulses();
            return;
          }

          // Clique no botão CONFIRMAR COR (Avança para Digitação do Nome do Piloto)
          if (btnConfirm && click.x >= btnConfirm.x && click.x <= btnConfirm.x + btnConfirm.w &&
              click.y >= btnConfirm.y && click.y <= btnConfirm.y + btnConfirm.h) {
            this.audio.playBeep(523, 0.12);
            this.fadeTransition('NAME_INPUT');
            if (this.nameWrapper) this.nameWrapper.classList.add('show');
            if (this.nameInput) {
              this.nameInput.value = this.playerName || 'JOGADOR';
              setTimeout(() => { try { this.nameInput.focus(); this.nameInput.select(); } catch (_) {} }, 40);
            }
            this.input.clearPulses();
            return;
          }

          // Clique direto nas 10 amostras circulares de cores
          let clickedSwatch = false;
          if (sw) {
            for (let k = 0; k < sw.length; k++) {
              const s = sw[k];
              if (Math.hypot(click.x - s.x, click.y - s.y) <= Math.max(s.r + 7, 14)) {
                if (this.colorIndex !== s.i) {
                  this.colorIndex = s.i;
                  this.audio.playBeep(480, 0.05);
                }
                clickedSwatch = true;
                break;
              }
            }

            // Toque em qualquer ponto da faixa horizontal das cores
            if (!clickedSwatch && sw.length > 0) {
              const swY = sw[0].y;
              if (click.y >= swY - 14 && click.y <= swY + 14 && click.x >= sw[0].x - 14 && click.x <= sw[sw.length - 1].x + 14) {
                let bestIdx = 0, bestDist = 999999;
                for (let k = 0; k < sw.length; k++) {
                  const d = Math.abs(click.x - sw[k].x);
                  if (d < bestDist) {
                    bestDist = d;
                    bestIdx = sw[k].i;
                  }
                }
                this.colorIndex = bestIdx;
                this.audio.playBeep(480, 0.05);
                clickedSwatch = true;
              }
            }
          }

          // Toque no lado esquerdo ou direito do painel para navegar nas cores
          if (!clickedSwatch) {
            if (click.x < bX + 32 && click.y >= bY && click.y <= bY + bH) {
              this.input.justPressedLeft = true;
            } else if (click.x > bX + bW - 32 && click.y >= bY && click.y <= bY + bH) {
              this.input.justPressedRight = true;
            }
          }
        }

        // Navegação de Cores via Controle (D-pad / Analógico) ou Teclado (Setas / A / D)
        if (this.input.justPressedLeft) {
          this.audio.playBeep(440, 0.05);
          this.colorIndex = (this.colorIndex - 1 + CAR_COLORS.length) % CAR_COLORS.length;
        }
        if (this.input.justPressedRight) {
          this.audio.playBeep(440, 0.05);
          this.colorIndex = (this.colorIndex + 1) % CAR_COLORS.length;
        }
        if (this.input.justPressedColor) {
          this.audio.playBeep(440, 0.05);
          this.colorIndex = (this.colorIndex + 1) % CAR_COLORS.length;
        }
        if (this.input.lastDigit !== null && this.input.lastDigit !== undefined) {
          const d = this.input.lastDigit;
          const targetColor = (d === 0) ? 9 : (d - 1);
          if (targetColor >= 0 && targetColor < CAR_COLORS.length) {
            this.colorIndex = targetColor;
            this.audio.playBeep(480, 0.05);
          }
        }

        if (this.input.justPressedEnter) {
          this.audio.playBeep(523, 0.12);
          this.state = 'NAME_INPUT';
          if (this.nameWrapper) this.nameWrapper.classList.add('show');
          if (this.nameInput) {
            this.nameInput.value = this.playerName || 'JOGADOR';
            setTimeout(() => { try { this.nameInput.focus(); this.nameInput.select(); } catch (_) {} }, 40);
          }
          this.input.clearPulses();
          return;
        }

        if (this.input.justPressedEsc) {
          this.audio.playBeep(330, 0.06);
          this.fadeTransition('CAR_SELECT');
          this.input.clearPulses();
          return;
        }

        this.input.clearPulses();
        return;
      }

      if (this.state === 'NAME_INPUT') {
        this.audio.silenceEffects();
        this.menuCameraZ = this.wrapZ(this.menuCameraZ + 850 * dt);
        this.cameraRoll = 0;
        this.shake = 0;
        this.updateSkyScroll(dt);
        this.updateEnv(dt);

        if (this.nameWrapper && !this.nameWrapper.classList.contains('show')) {
          this.nameWrapper.classList.add('show');
        }

        if (this.input.lastCanvasClick) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;
          const touchSafe = this.input.touchControlsVisible;
          const boxW = touchSafe ? 228 : 260;
          const boxH = touchSafe ? 132 : 144;
          const boxX = INTERNAL_WIDTH / 2 - boxW / 2;
          const boxY = touchSafe ? 34 : 38;
          const btnW = touchSafe ? 88 : 100;
          const btnH = touchSafe ? 18 : 20;
          const btnY = boxY + boxH - (touchSafe ? 24 : 26);
          const btnBack = { x: boxX + 12, y: btnY, w: btnW, h: btnH };
          const btnConfirm = { x: boxX + boxW - 12 - btnW, y: btnY, w: btnW, h: btnH };

          if (click.x >= btnBack.x && click.x <= btnBack.x + btnBack.w &&
              click.y >= btnBack.y && click.y <= btnBack.y + btnBack.h) {
            if (this.nameWrapper) this.nameWrapper.classList.remove('show');
            if (this.nameInput) this.nameInput.blur();
            this.audio.playBeep(330, 0.06);
            this.fadeTransition('COLOR_SELECT');
            this.input.clearPulses();
            return;
          }

          if (click.x >= btnConfirm.x && click.x <= btnConfirm.x + btnConfirm.w &&
              click.y >= btnConfirm.y && click.y <= btnConfirm.y + btnConfirm.h) {
            this.confirmName();
            return;
          }
        }

        if (this.input.justPressedEnter) {
          this.input.justPressedEnter = false;
          this.confirmName();
          return;
        }
        if (this.input.justPressedEsc) {
          if (this.nameWrapper) this.nameWrapper.classList.remove('show');
          if (this.nameInput) this.nameInput.blur();
          this.audio.playBeep(330, 0.06);
          this.state = 'COLOR_SELECT';
          this.input.clearPulses();
          return;
        }
        this.input.clearPulses();
        return;
      }

      if (this.state === 'RACE_SETUP') {
        if (this.nameWrapper) this.nameWrapper.classList.remove('show');
        if (this.setupCooldown > 0) {
          this.setupCooldown -= dt;
          this.input.lastCanvasClick = null;
          this.input.justPressedEnter = false;
        }
        this.audio.silenceEffects();
        this.menuCameraZ = this.wrapZ(this.menuCameraZ + 850 * dt);
        this.cameraRoll = 0;
        this.shake = 0;
        this.updateSkyScroll(dt);
        this.updateEnv(dt);

        const L = this.getSetupLayout();
        let clickedInteractive = false;
        if (this.input.lastCanvasClick && this.setupCooldown <= 0) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;

          // Seleção de Clima (apenas seleciona o clima!)
          for (let k = 0; k < L.conds.length; k++) {
            const c = L.conds[k];
            if (click.x >= c.x && click.x <= c.x + c.w && click.y >= c.y && click.y <= c.y + c.h) {
              this.envCond = ENV_CONDITIONS[c.i].id;
              this.setupGroup = 0;
              this.audio.playBeep(440, 0.06);
              clickedInteractive = true;
              break;
            }
          }

          // Seleção de Trilha Sonora (apenas seleciona a música!)
          if (!clickedInteractive) {
            for (let k = 0; k < L.songs.length; k++) {
              const c = L.songs[k];
              if (click.x >= c.x && click.x <= c.x + c.w && click.y >= c.y && click.y <= c.y + c.h) {
                this.songIndex = c.i;
                this.setupGroup = 1;
                this.audio.stopTitleMusic();
                this.audio.musicPlaying = true;
                if (this.audio && typeof this.audio.setSong === 'function') {
                  this.audio.setSong(c.i);
                }
                this.audio.playBeep(523, 0.08);
                clickedInteractive = true;
                break;
              }
            }
          }

          // Botão Voltar
          if (!clickedInteractive && L.btnBack) {
            const b = L.btnBack;
            if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
              this.audio.playBeep(330, 0.06);
              this.state = 'NAME_INPUT';
              if (this.nameWrapper) this.nameWrapper.classList.add('show');
              if (this.nameInput) {
                this.nameInput.value = this.playerName || 'JOGADOR';
                setTimeout(() => { try { this.nameInput.focus(); } catch (_) {} }, 40);
              }
              this.audio.musicPlaying = false;
              this.audio.playTitleMusic();
              this.input.clearPulses();
              return;
            }
          }

          // Botão Confirmar / Iniciar Corrida
          if (!clickedInteractive && L.startBtn) {
            const b = L.startBtn;
            if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
              this.audio.playBeep(659, 0.18);
              this.startRaceCountdown();
              this.input.clearPulses();
              return;
            }
          }
          // Qualquer toque/clique fora dos botoes nao deve disparar a largada
          this.input.justPressedEnter = false;
        }

        if (this.input.justPressedUp) {
          if (this.setupGroup === 1) {
            if (this.songIndex >= 2) {
              this.songIndex -= 2;
              this.audio.stopTitleMusic();
              this.audio.musicPlaying = true;
              if (this.audio && typeof this.audio.setSong === 'function') {
                this.audio.setSong(this.songIndex);
              }
              this.audio.playBeep(330, 0.05);
            } else {
              this.setupGroup = 0;
              const curIdx = ENV_CONDITIONS.findIndex(e => e.id === this.envCond);
              if (curIdx < 4 && curIdx >= 0) {
                this.envCond = ENV_CONDITIONS[curIdx + 4].id;
              }
              this.audio.playBeep(380, 0.04);
            }
          } else {
            const curIdx = ENV_CONDITIONS.findIndex(e => e.id === this.envCond);
            if (curIdx >= 4) {
              this.envCond = ENV_CONDITIONS[curIdx - 4].id;
              this.audio.playBeep(330, 0.05);
            } else {
              this.audio.playBeep(380, 0.04);
            }
          }
        }
        if (this.input.justPressedDown) {
          if (this.setupGroup === 0) {
            const curIdx = ENV_CONDITIONS.findIndex(e => e.id === this.envCond);
            if (curIdx < 4 && curIdx >= 0) {
              this.envCond = ENV_CONDITIONS[curIdx + 4].id;
              this.audio.playBeep(330, 0.05);
            } else {
              this.setupGroup = 1;
              this.audio.playBeep(380, 0.04);
            }
          } else if (this.setupGroup === 1) {
            if (this.songIndex + 2 < SONGS.length) {
              this.songIndex += 2;
              this.audio.stopTitleMusic();
              this.audio.musicPlaying = true;
              if (this.audio && typeof this.audio.setSong === 'function') {
                this.audio.setSong(this.songIndex);
              }
              this.audio.playBeep(330, 0.05);
            }
          }
        }
        if (this.input.justPressedLeft) {
          if (this.setupGroup === 0) {
            const curIdx = ENV_CONDITIONS.findIndex(e => e.id === this.envCond);
            const nextIdx = (curIdx - 1 + ENV_CONDITIONS.length) % ENV_CONDITIONS.length;
            this.envCond = ENV_CONDITIONS[nextIdx].id;
            this.audio.playBeep(330, 0.05);
          } else {
            this.songIndex = (this.songIndex - 1 + SONGS.length) % SONGS.length;
            this.audio.stopTitleMusic();
            this.audio.musicPlaying = true;
            if (this.audio && typeof this.audio.setSong === 'function') {
              this.audio.setSong(this.songIndex);
            }
            this.audio.playBeep(330, 0.05);
          }
        }
        if (this.input.justPressedRight) {
          if (this.setupGroup === 0) {
            const curIdx = ENV_CONDITIONS.findIndex(e => e.id === this.envCond);
            const nextIdx = (curIdx + 1) % ENV_CONDITIONS.length;
            this.envCond = ENV_CONDITIONS[nextIdx].id;
            this.audio.playBeep(330, 0.05);
          } else {
            this.songIndex = (this.songIndex + 1) % SONGS.length;
            this.audio.stopTitleMusic();
            this.audio.musicPlaying = true;
            if (this.audio && typeof this.audio.setSong === 'function') {
              this.audio.setSong(this.songIndex);
            }
            this.audio.playBeep(330, 0.05);
          }
        }

        if (this.input.justPressedEnter && this.setupCooldown <= 0) {
          this.audio.playBeep(659, 0.18);
          this.startRaceCountdown();
          this.input.clearPulses();
          return;
        }
        if (this.input.justPressedEsc) {
          this.audio.playBeep(330, 0.06);
          this.state = 'NAME_INPUT';
          if (this.nameWrapper) this.nameWrapper.classList.add('show');
          if (this.nameInput) {
            this.nameInput.value = this.playerName || 'JOGADOR';
            setTimeout(() => { try { this.nameInput.focus(); } catch (_) {} }, 40);
          }
          this.audio.musicPlaying = false;
          this.audio.playTitleMusic();
          this.input.clearPulses();
          return;
        }
        this.input.clearPulses();
        return;
      }
      if (this.input.justPressedEsc) {
        if (this.state === 'RACING') {
          this.pauseGame();
          this.input.clearPulses();
          return;
        } else if (this.state === 'PAUSED') {
          this.handlePauseBackKey();
          this.input.clearPulses();
          return;
        } else if (this.state === 'RESUME_COUNTDOWN') {
          this.pauseGame();
          this.input.clearPulses();
          return;
        }
      }

      if (this.state === 'PAUSED') {
        this.audio.silenceEffects();

        // 1. DIÁLOGO MODAL ATIVO
        if (this.pauseDialog) {
          const isExit = (this.pauseDialog === 'CONFIRM_EXIT');
          const isCamp = (this.gameMode === 'CHAMPIONSHIP');
          const numOptions = isExit ? (isCamp ? 3 : 2) : 2;

          if (this.input.lastCanvasClick) {
            const click = this.input.lastCanvasClick;
            this.input.lastCanvasClick = null;
            const cx = INTERNAL_WIDTH / 2;
            const cy = INTERNAL_HEIGHT / 2;
            const dlgW = isExit ? 232 : 220;
            const dlgH = isExit ? (isCamp ? 108 : 88) : 88;
            const dlgX = Math.round(cx - dlgW / 2);
            const dlgY = Math.round(cy - dlgH / 2);
            const btnW = dlgW - 28;
            const btnH = 17;
            const btnX = Math.round(cx - btnW / 2);
            const startY = dlgY + (isExit ? 40 : 44);
            const gapY = 20;

            for (let i = 0; i < numOptions; i++) {
              const bY = startY + i * gapY;
              if (click.x >= btnX && click.x <= btnX + btnW && click.y >= bY && click.y <= bY + btnH) {
                this.executePauseDialogAction(this.pauseDialog, i);
                this.input.clearPulses();
                return;
              }
            }
          }

          if (this.input.justPressedUp) {
            this.pauseDialogIndex = (this.pauseDialogIndex - 1 + numOptions) % numOptions;
            this.audio.playBeep(440, 0.05);
          }
          if (this.input.justPressedDown) {
            this.pauseDialogIndex = (this.pauseDialogIndex + 1) % numOptions;
            this.audio.playBeep(440, 0.05);
          }
          if (this.input.justPressedEnter) {
            this.executePauseDialogAction(this.pauseDialog, this.pauseDialogIndex);
            this.input.clearPulses();
            return;
          }
          if (this.input.justPressedEsc) {
            this.pauseDialog = null;
            this.audio.playBeep(330, 0.06);
            this.input.clearPulses();
            return;
          }

          this.input.clearPulses();
          return;
        }

        // 2. MENU PRINCIPAL DE PAUSA
        const touchSafe = this.input.touchControlsVisible;
        const pW = touchSafe ? 226 : 242;
        const pH = 126;
        const pX = Math.round(INTERNAL_WIDTH / 2 - pW / 2);
        const pY = 34;
        const btnW = pW - 28;
        const btnH = 17;
        const btnX = Math.round(INTERNAL_WIDTH / 2 - btnW / 2);
        const startY = pY + 28;
        const gapY = 21;

        if (this.input.lastCanvasClick) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;

          if (click.x >= INTERNAL_WIDTH - 38 && click.y <= 38) {
            this.executePauseMenuAction(2);
            this.input.clearPulses();
            return;
          }

          let clickedIndex = -1;
          for (let i = 0; i < 4; i++) {
            const bY = startY + i * gapY;
            if (click.x >= btnX && click.x <= btnX + btnW && click.y >= bY && click.y <= bY + btnH) {
              clickedIndex = i;
              break;
            }
          }

          if (clickedIndex !== -1) {
            this.pauseMenuIndex = clickedIndex;
            this.executePauseMenuAction(clickedIndex);
            this.input.clearPulses();
            return;
          }
        }

        if (this.input.justPressedUp) {
          this.pauseMenuIndex = (this.pauseMenuIndex - 1 + 4) % 4;
          this.audio.playBeep(440, 0.05);
        }
        if (this.input.justPressedDown) {
          this.pauseMenuIndex = (this.pauseMenuIndex + 1) % 4;
          this.audio.playBeep(440, 0.05);
        }
        if (this.input.justPressedEnter) {
          this.executePauseMenuAction(this.pauseMenuIndex);
          this.input.clearPulses();
          return;
        }
        if (this.input.justPressedEsc) {
          this.triggerResumeCountdown();
          this.input.clearPulses();
          return;
        }

        this.input.clearPulses();
        return;
      }

      if (this.state === 'RESUME_COUNTDOWN') {
        this.audio.silenceEffects();
        this.resumeCountdown -= dt;
        const currentInt = Math.ceil(this.resumeCountdown);
        if (currentInt !== this.lastResumeInt && currentInt >= 1 && currentInt <= 3) {
          this.lastResumeInt = currentInt;
          if (this.audio) this.audio.playCountdownBeep(false);
        }
        if (this.resumeCountdown <= 0) {
          if (this.audio) this.audio.playCountdownBeep(true);
          this.state = 'RACING';
        }
        if (this.input.justPressedEsc) {
          this.pauseGame();
        }
        this.input.clearPulses();
        return;
      }

      if (this.state === 'SLOT_SELECT') {
        if (this.nameWrapper) this.nameWrapper.classList.remove('show');
        this.audio.silenceEffects();
        this.menuCameraZ = this.wrapZ(this.menuCameraZ + 850 * dt);
        this.cameraRoll = 0;
        this.shake = 0;
        this.updateSkyScroll(dt);
        this.updateEnv(dt);

        const slots = SaveManager.getAllSlots();
        const cx = INTERNAL_WIDTH / 2;
        const cy = INTERNAL_HEIGHT / 2;

        // Modal de Exclusão
        if (this.slotDeleteConfirm !== null) {
          const slotNum = this.slotDeleteConfirm;
          if (this.input.lastCanvasClick) {
            const click = this.input.lastCanvasClick;
            this.input.lastCanvasClick = null;
            const mY = Math.round(cy - 75 / 2);
            if (click.x >= cx - 88 && click.x <= cx - 8 && click.y >= mY + 44 && click.y <= mY + 62) {
              SaveManager.deleteSlot(slotNum);
              this.slotDeleteConfirm = null;
              this.audio.playBeep(330, 0.1);
              this.input.clearPulses();
              return;
            }
            if (click.x >= cx + 8 && click.x <= cx + 88 && click.y >= mY + 44 && click.y <= mY + 62) {
              this.slotDeleteConfirm = null;
              this.audio.playBeep(440, 0.06);
              this.input.clearPulses();
              return;
            }
          }
          if (this.input.justPressedEsc) {
            this.slotDeleteConfirm = null;
            this.audio.playBeep(330, 0.06);
          }
          this.input.clearPulses();
          return;
        }

        // Modal de Substituição
        if (this.slotOverwriteConfirm !== null) {
          const slotNum = this.slotOverwriteConfirm;
          if (this.input.lastCanvasClick) {
            const click = this.input.lastCanvasClick;
            this.input.lastCanvasClick = null;
            const mY = Math.round(cy - 75 / 2);
            if (click.x >= cx - 92 && click.x <= cx - 6 && click.y >= mY + 44 && click.y <= mY + 62) {
              SaveManager.deleteSlot(slotNum);
              this.activeSaveSlot = slotNum;
              this.slotOverwriteConfirm = null;
              this.audio.playBeep(523, 0.12);
              this.seasonSchedule = this.getChampionshipSchedule();
              this.seasonStage = 0;
              this.trackIndex = this.seasonSchedule[0];
              this.loadTrack(this.trackIndex);
              this.colorIndex = MODEL_DEFAULT_COLOR[CAR_MODELS[this.selectedCarIndex].id] || 0;
              this.fadeTransition('CAR_SELECT');
              this.input.clearPulses();
              return;
            }
            if (click.x >= cx + 6 && click.x <= cx + 92 && click.y >= mY + 44 && click.y <= mY + 62) {
              this.slotOverwriteConfirm = null;
              this.audio.playBeep(330, 0.06);
              this.input.clearPulses();
              return;
            }
          }
          if (this.input.justPressedEsc) {
            this.slotOverwriteConfirm = null;
            this.audio.playBeep(330, 0.06);
          }
          this.input.clearPulses();
          return;
        }

        // Tela de seleção normal
        const cardW = 280;
        const cardH = 39;
        const cardX = Math.round(cx - cardW / 2);
        const startY = 38;
        const gapY = 44;

        if (this.input.lastCanvasClick) {
          const click = this.input.lastCanvasClick;
          this.input.lastCanvasClick = null;

          // Botão VOLTAR
          if (click.x >= cx - 45 && click.x <= cx + 45 && click.y >= 176 && click.y <= 198) {
            this.audio.playBeep(330, 0.06);
            if (this.slotSelectMode === 'NEW') {
              this.fadeTransition('DIFFICULTY_SELECT');
            } else {
              this.fadeTransition('MENU');
            }
            this.input.clearPulses();
            return;
          }

          // Checar toque nos cards
          for (let i = 0; i < 3; i++) {
            const slotNum = i + 1;
            const slotData = slots[i];
            const cY = startY + i * gapY;

            // Botão Excluir à direita
            if (this.slotSelectMode === 'CONTINUE' && slotData && click.x >= cardX + cardW - 32 && click.x <= cardX + cardW - 4 && click.y >= cY + 4 && click.y <= cY + cardH - 4) {
              this.slotDeleteConfirm = slotNum;
              this.audio.playBeep(300, 0.08);
              this.input.clearPulses();
              return;
            }

            // Clique no corpo do card
            if (click.x >= cardX && click.x <= cardX + cardW && click.y >= cY && click.y <= cY + cardH) {
              this.selectedSlotIndex = i;
              if (this.slotSelectMode === 'CONTINUE') {
                if (slotData) {
                  this.audio.playBeep(523, 0.12);
                  this.loadFromSave(slotData);
                } else {
                  this.audio.playBeep(220, 0.08);
                }
              } else {
                if (slotData) {
                  this.slotOverwriteConfirm = slotNum;
                  this.audio.playBeep(440, 0.08);
                } else {
                  this.activeSaveSlot = slotNum;
                  this.audio.playBeep(523, 0.12);
                  this.seasonSchedule = this.getChampionshipSchedule();
                  this.seasonStage = 0;
                  this.trackIndex = this.seasonSchedule[0];
                  this.loadTrack(this.trackIndex);
                  this.colorIndex = MODEL_DEFAULT_COLOR[CAR_MODELS[this.selectedCarIndex].id] || 0;
                  this.fadeTransition('CAR_SELECT');
                }
              }
              this.input.clearPulses();
              return;
            }
          }
        }

        if (this.input.justPressedUp) {
          this.selectedSlotIndex = (this.selectedSlotIndex - 1 + 3) % 3;
          this.audio.playBeep(440, 0.05);
        }
        if (this.input.justPressedDown) {
          this.selectedSlotIndex = (this.selectedSlotIndex + 1) % 3;
          this.audio.playBeep(440, 0.05);
        }
        if (this.input.justPressedEnter) {
          const slotNum = this.selectedSlotIndex + 1;
          const slotData = slots[this.selectedSlotIndex];
          if (this.slotSelectMode === 'CONTINUE') {
            if (slotData) {
              this.audio.playBeep(523, 0.12);
              this.loadFromSave(slotData);
            } else {
              this.audio.playBeep(220, 0.08);
            }
          } else {
            if (slotData) {
              this.slotOverwriteConfirm = slotNum;
              this.audio.playBeep(440, 0.08);
            } else {
              this.activeSaveSlot = slotNum;
              this.audio.playBeep(523, 0.12);
              this.seasonSchedule = this.getChampionshipSchedule();
              this.seasonStage = 0;
              this.trackIndex = this.seasonSchedule[0];
              this.loadTrack(this.trackIndex);
              this.colorIndex = MODEL_DEFAULT_COLOR[CAR_MODELS[this.selectedCarIndex].id] || 0;
              this.fadeTransition('CAR_SELECT');
            }
          }
          this.input.clearPulses();
          return;
        }

        if (this.input.justPressedEsc) {
          this.audio.playBeep(330, 0.06);
          if (this.slotSelectMode === 'NEW') {
            this.fadeTransition('DIFFICULTY_SELECT');
          } else {
            this.fadeTransition('MENU');
          }
          this.input.clearPulses();
          return;
        }

        this.input.clearPulses();
        return;
      }

      if (this.state === 'RACE_RESULT') {
        this.audio.silenceEffects();
        if (this.input.lastCanvasClick) {
          this.input.lastCanvasClick = null;
          this.input.justPressedEnter = true;
        }
        if (this.input.justPressedEnter) {
          this.audio.playBeep(440, 0.1);
          if (this.gameMode === 'QUICK_RACE') {
            this.fadeTransition('MENU', () => {
              this.audio.musicPlaying = false;
              this.audio.playTitleMusic();
            });
          } else {
            this.fadeTransition('CHAMPIONSHIP_STANDINGS');
          }
        }
        this.input.clearPulses();
        return;
      }

      if (this.state === 'CHAMPIONSHIP_STANDINGS') {
        this.audio.silenceEffects();
        if (this.input.lastCanvasClick) {
          this.input.lastCanvasClick = null;
          this.input.justPressedEnter = true;
        }
        if (this.input.justPressedEnter) {
          this.audio.playBeep(440, 0.1);
          const hasNext = (this.seasonSchedule && this.seasonSchedule.length > 0 && this.seasonStage < this.seasonSchedule.length - 1);
          if (hasNext) {
            this.computeNextGridOrder();
            this.saveCurrentChampionship();
            this.fadeTransition('SAVE_PROGRESS');
          } else {
            this.fadeTransition('CHAMPIONSHIP_RESULT', () => {
              this.initConfetti();
            });
          }
        }
        this.input.clearPulses();
        return;
      }

      if (this.state === 'SAVE_PROGRESS') {
        this.audio.silenceEffects();
        if (this.input.lastCanvasClick) {
          this.input.lastCanvasClick = null;
          this.input.justPressedEnter = true;
        }
        if (this.input.justPressedEnter) {
          this.audio.playBeep(523, 0.12);
          this.seasonStage++;
          this.trackIndex = this.seasonSchedule[this.seasonStage];
          this.loadTrack(this.trackIndex);
          const curSong = this.songIndex;
          let nextSong = curSong;
          if (SONGS.length > 1) {
            do {
              nextSong = Math.floor(Math.random() * SONGS.length);
            } while (nextSong === curSong);
          }
          this.songIndex = nextSong;
          this.startRaceCountdown();
          this.input.clearPulses();
          return;
        }
        this.input.clearPulses();
        return;
      }

      if (this.state === 'CHAMPIONSHIP_RESULT') {
        this.audio.silenceEffects();
        this.updateConfetti(dt);
        if (this.input.lastCanvasClick) {
          this.input.lastCanvasClick = null;
          this.input.justPressedEnter = true;
        }
        if (this.input.justPressedEnter) {
          this.audio.playBeep(440, 0.1);
          const overall = this.cars.map(c => ({
            car: c,
            points: this.championshipPoints[c.id] || 0
          })).sort((a, b) => b.points - a.points);
          const pFinalRank = overall.findIndex(o => o.car.isPlayer) + 1;
          const isTop3 = pFinalRank <= 3;
          this.fadeTransition('ENDING_SCENE', () => {
            this.endingTimer = 0;
            this.endingRank = pFinalRank;
            this.endingFireworks = [];
            this.initConfetti();
            if (this.audio) this.audio.playEndingMusic(isTop3);
          });
        }
        this.input.clearPulses();
        return;
      }

      if (this.state === 'ENDING_SCENE') {
        this.audio.silenceEffects();
        this.endingTimer += dt;
        this.updateConfetti(dt);
        this.updateEndingFireworks(dt);
        if (this.input.lastCanvasClick) {
          this.input.lastCanvasClick = null;
          this.input.justPressedEnter = true;
        }
        if (this.input.justPressedEnter) {
          this.audio.playBeep(440, 0.1);
          if (this.audio) {
            this.audio.stopEndingMusic();
            this.audio.playTitleMusic();
          }
          this.championshipPoints.fill(0);
          this.initSeasonRoster();
          this.loadTrack(0);
          this.fadeTransition('MENU');
        }
        this.input.clearPulses();
        return;
      }

      // --- LARGADA ESTILO F1 (TODOS PARADOS NO GRID) ---
      if (this.state === 'COUNTDOWN') {
        for (let i = 0; i < this.cars.length; i++) {
          this.cars[i].speed = 0;
        }

        this.countdown -= dt;
        if (this.countdown > 2.7) {
          if (this.startLightsStage !== 1) {
            this.startLightsStage = 1;
            this.audio.playBeep(440, 0.15);
          }
        } else if (this.countdown > 1.8) {
          if (this.startLightsStage !== 2) {
            this.startLightsStage = 2;
            this.audio.playBeep(440, 0.15);
          }
        } else if (this.countdown > 0.9) {
          if (this.startLightsStage !== 3) {
            this.startLightsStage = 3;
            this.audio.playBeep(440, 0.15);
          }
        } else if (this.countdown > 0) {
          if (this.startLightsStage !== 4) {
            this.startLightsStage = 4;
            this.audio.playBeep(440, 0.15);
          }
        } else {
          this.startLightsStage = 5; // LUZES VERDES: LARGADA IMEDIATA!
          this.greenLightsTimer = 0.85;
          this.audio.playBeep(880, 0.35);
          this.state = 'RACING';
        }

        this.audio.updateEngineRpm(1200, false, false);
        this.input.clearPulses();
        return;
      }

      // --- CORRIDA EM ANDAMENTO ---
      this.updateSkyScroll(dt);
      this.updateEnv(dt);
      if (this.greenLightsTimer > 0) this.greenLightsTimer -= dt;
      if (this.state === 'RACING') {
        this.raceTimer += dt;
        this.currentLapTime += dt;
      }
      if (this.lapBannerTimer > 0) this.lapBannerTimer -= dt;

      const p = this.player;
      const model = p.model;
      const playerSeg = this.findSegment(p.z);

      if (this.finishingRace) {
        this.finishTimer -= dt;
        const elapsed = this.finishDuration - this.finishTimer;

        // Desaceleração suave e alinhamento reto do carro pós-bandeirada
        p.speed = Math.max(80, p.speed * 0.993);
        p.steerAngle *= 0.88;
        p.x += (0 - p.x) * 0.02;
        p.isBraking = false;
        p.isNitro = false;

        const stepZ = p.speed * 20 * dt;
        p.z = this.wrapZ(p.z + stepZ);
        p.totalDistance += stepZ;

        this.audio.updateEngineRpm(Math.max(1200, p.speed * 20), false, false);
        this.audio.setSkid(false);

        // Efeito fade até a classificação: inicia suave em 1.0s e chega a 1.0 em 3.0s
        const fadeStart = 1.0;
        if (elapsed >= fadeStart) {
          this.finishFadeAlpha = Math.min(1.0, (elapsed - fadeStart) / (this.finishDuration - fadeStart));
        } else {
          this.finishFadeAlpha = 0;
        }

        if (this.finishTimer <= 0) {
          this.finishingRace = false;
          this.finishFadeAlpha = 0;
          this.finishRace();
          this.input.clearPulses();
          return;
        }
      } else {
        if (this.input.justPressedNitro && p.nitroCharges > 0 && p.nitroTimer <= 0 && this.state === 'RACING') {
          p.nitroCharges--;
          p.nitroTimer = 2.4;
          p.nitroDecayTimer = 0;
          this.audio.triggerNitroSound();
        }
        if (p.nitroTimer > 0) {
          p.nitroTimer -= dt;
          p.isNitro = true;
          if (p.nitroTimer <= 0) {
            p.nitroTimer = 0;
            p.isNitro = false;
            p.nitroDecayTimer = 3.0; // Inicia a desaceleração gradual suave de 3 segundos pós-nitro
          }
        } else {
          p.isNitro = false;
          if (p.nitroDecayTimer > 0) {
            p.nitroDecayTimer = Math.max(0, p.nitroDecayTimer - dt);
          }
        }

      // Detecção de Vácuo (Slipstream) progressivo e gradual:
      // Atinge o ápice de 100% a uma distância segura (<= 700 unidades, o dobro da anterior)
      // permitindo embalar e preparar o slingshot com perícia e sem colidir na traseira!
      p.inSlipstream = false;
      p.slipstreamIntensity = 0;
      p.slipstreamTarget = null;
      if (this.state === 'RACING' && p.speed > 35) {
        let bestIntensity = 0;
        let bestTarget = null;
        for (let i = 0; i < this.cars.length; i++) {
          const other = this.cars[i];
          if (other.isPlayer) continue;
          const aheadDz = this.shortestDeltaZ(other.z, p.z);
          if (aheadDz >= -30 && aheadDz <= 2600) {
            let distW = 0;
            if (aheadDz <= 700) {
              distW = 1.0;
            } else {
              const progress = (aheadDz - 700) / (2600 - 700);
              distW = Math.pow(1.0 - progress, 0.82);
            }
            const maxLat = 0.65 + 0.35 * (Math.max(0, aheadDz) / 2600);
            const latDiff = Math.abs(other.x - p.x);
            if (latDiff < maxLat) {
              const alignW = Math.max(0, 1.0 - (latDiff / maxLat));
              const intensity = Math.max(0, Math.min(1.0, distW * alignW));
              if (intensity > bestIntensity) {
                bestIntensity = intensity;
                bestTarget = other;
              }
            }
          }
        }
        if (bestIntensity > 0.015) {
          p.inSlipstream = true;
          p.slipstreamIntensity = bestIntensity;
          p.slipstreamTarget = bestTarget;
          p.slipstreamDecayTimer = 1.0; // Slingshot calibrado para 1 segundo com decaimento gradual
          p.slipstreamStoredIntensity = Math.max(p.slipstreamStoredIntensity || 0, bestIntensity);
          p.slipstreamPeakSpeed = Math.max(p.slipstreamPeakSpeed || 0, p.speed);
        }
      }

      if (!p.inSlipstream && p.slipstreamDecayTimer > 0) {
        p.slipstreamDecayTimer = Math.max(0, p.slipstreamDecayTimer - dt);
        if (p.slipstreamDecayTimer <= 0) {
          p.slipstreamStoredIntensity = 0;
          p.slipstreamPeakSpeed = 0;
        }
      }

      // Ganho progressivo de velocidade e aceleração conforme a proximidade (Fórmula 1):
      // Decaimento gradativo e proporcional ao longo de 1 segundo pós-desvio do vácuo
      const slingshotRatio = Math.max(0, Math.min(1.0, p.slipstreamDecayTimer / 1.0));
      const effectiveSlipInt = p.inSlipstream
        ? (p.slipstreamIntensity || 0)
        : (p.slipstreamDecayTimer > 0 ? ((p.slipstreamStoredIntensity || 0.4) * slingshotRatio) : 0);
      const slipInt = effectiveSlipInt;
      // Bônus de velocidade máxima do Nitro com rampa suave de decaimento de 3 segundos pós-término
      const nitroBoostRatio = p.isNitro
        ? 0.30
        : (p.nitroDecayTimer > 0 ? (0.30 * (p.nitroDecayTimer / 3.0)) : 0);
      const baseMax = this.getEffectiveMaxSpeed(p) * (1.0 + nitroBoostRatio);
      const speedGapBonus = (p.slipstreamTarget && p.slipstreamTarget.speed > p.speed)
        ? (p.slipstreamTarget.speed - p.speed) * 0.85 * effectiveSlipInt
        : 0;
      const vacuumSpeedBoost = ((baseMax * 0.22) + 24) * effectiveSlipInt;
      let effectiveMaxSpeed = baseMax + vacuumSpeedBoost + speedGapBonus;
      if (!p.inSlipstream && p.slipstreamDecayTimer > 0 && p.slipstreamPeakSpeed > effectiveMaxSpeed) {
        // Diminui gradativamente da velocidade de pico de volta à velocidade nominal ao longo de 1 segundo
        effectiveMaxSpeed = effectiveMaxSpeed + (p.slipstreamPeakSpeed - effectiveMaxSpeed) * slingshotRatio;
      }
      const accelNitroMul = p.isNitro ? 1.85 : (p.nitroDecayTimer > 0 ? (1.0 + 0.85 * (p.nitroDecayTimer / 3.0)) : 1.0);
      const effectiveAccel = model.acceleration * accelNitroMul * (1.0 + 1.25 * effectiveSlipInt);
      const speedRatio = Math.min(1.2, p.speed / Math.max(1, effectiveMaxSpeed));

      // Resposta analógica de pressão dos gatilhos L2 e R2 (ou 1.0 com teclado/touch)
      const throttleInput = p.isNitro ? 1.0 : (this.input.throttlePressure !== undefined ? this.input.throttlePressure : (this.input.up ? 1.0 : 0.0));
      const brakeInput = this.input.brakePressure !== undefined ? this.input.brakePressure : (this.input.down ? 1.0 : 0.0);

      const isAccelerating = ((throttleInput > 0.05) || p.isNitro) && (this.state === 'RACING');
      p.isBraking = (brakeInput > 0.05) && (this.state === 'RACING');

      // Curva de torque e resistência aerodinâmica para criar cadência real de aceleração através das marchas:
      const slope = (playerSeg.p2.world.y - playerSeg.p1.world.y) / SEGMENT_LENGTH;
      const airDragFactor = Math.pow(Math.min(1.0, speedRatio), 1.6) * 0.58;
      const torqueFactor = Math.max(0.32, 1.28 - airDragFactor);

      // Descida de ladeira (slope < 0): ganha aceleracao gravitacional e ultrapassa o limite de velocidade nominal!
      const downhillBonus = Math.max(0, -slope * 300);
      const dynamicMaxSpeed = effectiveMaxSpeed + downhillBonus;

      const isPowerBraking = isAccelerating && p.isBraking;

      if (isPowerBraking) {
        // Power Braking estilo Top Gear (Acelerador + Freio simultâneos):
        // Retenção ainda mais suave (+25%) de velocidade (~6 a 9 km/h por segundo), mantendo o carro no traçado quase como se não estivesse freando
        const powerBrakeRate = (6 + model.braking * 4.5) * brakeInput * dt;
        p.speed = Math.max(48, p.speed - powerBrakeRate);
      } else if (isAccelerating) {
        // Cadência de arrancada esportiva progressiva (~6 a 8s para velocidade final)
        const basePower = p.isNitro ? (65 + effectiveAccel * 55) : (24 + effectiveAccel * 26);
        const rate = basePower * torqueFactor * throttleInput * dt;
        const suctionPull = (32 + model.acceleration * 38) * slipInt * dt;
        // Velocidade alvo correspondente à pressão no gatilho R2 (permite dosar velocidade de cruzeiro)
        const targetPartialSpeed = p.isNitro ? dynamicMaxSpeed : dynamicMaxSpeed * (0.35 + 0.65 * throttleInput);
        if (p.speed < targetPartialSpeed) {
          p.speed = Math.min(p.speed + rate + suctionPull, targetPartialSpeed);
        } else {
          // Desaceleração cadenciada e gradual pós-slingshot, nitro e ladeiras:
          // Em vez de frenagem brusca, o excesso de velocidade se dissipa de forma suave e progressiva (~4 a 8 km/h por segundo),
          // permitindo que carros mais lentos (ex: Fusca) mantenham a vantagem da ultrapassagem por vários segundos.
          const excessSpeed = p.speed - targetPartialSpeed;
          const isSlingshot = (p.slipstreamDecayTimer > 0);
          const excessDecay = isSlingshot
            ? Math.min(7.5, Math.max(3.2, excessSpeed * 0.15)) * dt
            : Math.min(9.0, Math.max(3.8, excessSpeed * 0.18)) * dt;
          p.speed = Math.max(targetPartialSpeed, p.speed - excessDecay);
        }
      } else if (p.isBraking) {
        // Frenagem progressiva proporcional à intensidade no gatilho L2
        const brakeRate = (255 + model.braking * 175) * brakeInput * dt;
        p.speed = Math.max(p.speed - brakeRate, 0);
      } else {
        const drag = (42 + speedRatio * 30) * dt;
        p.speed = Math.max(p.speed - drag, 0);
      }

      // Gravidade fisica continua:
      // - Descendo (slope < 0): ganho visível e contínuo de aceleração gravitacional que embala o carro ladeira abaixo!
      if (p.speed > 10 && slope < 0) {
        const gravityForce = -slope * 460 * dt;
        // Permite embalar na descida somando perfeitamente a gravidade com a velocidade de vácuo, slingshot e nitro
        const downhillTerminalSpeed = dynamicMaxSpeed + 35;
        p.speed = Math.min(downhillTerminalSpeed, p.speed + gravityForce);
        // Trepidação de chassi proporcional ao excesso de velocidade na descida (reduzida pela metade)
        const pEffMax = this.getEffectiveMaxSpeed(p);
        if (p.speed > pEffMax) {
          const overDiff = (p.speed - pEffMax);
          this.shake = Math.max(this.shake, Math.min(1.4, overDiff * 0.04));
        }
      } else if (p.speed > 10 && slope > 0) {
        // Subindo (slope > 0): o peso da subida segura o carro
        const gravityResistance = slope * 280 * dt;
        p.speed = Math.max(25, p.speed - gravityResistance);
      }

      p.updateTransmission();
      if (isPowerBraking && p.speed > 35) {
        // Mantém o motor na faixa alta de giro e potência durante a tangência da curva
        p.rpm = Math.max(p.rpm, 5200);
      }

      // Esterçamento Analógico Suave (controla física + troca dos 3 sprites de curva/reta)
      let steerInput = 0;
      if (this.state === 'RACING') {
        if (this.input && Math.abs(this.input.analogSteer) > 0.04) {
          steerInput = this.input.analogSteer;
        } else {
          if (this.input.left) steerInput -= 1;
          if (this.input.right) steerInput += 1;
        }
      }
      p.steer = steerInput;

      if (steerInput !== 0) {
        const rampRate = (steerInput * p.steerAngle < 0) ? 13.5 : 8.8;
        p.steerAngle += (steerInput - p.steerAngle) * Math.min(1, rampRate * dt);
      } else {
        p.steerAngle += (0 - p.steerAngle) * Math.min(1, 10.8 * dt);
        if (Math.abs(p.steerAngle) < 0.01) p.steerAngle = 0;
      }

      // Acumulador progressivo e extra-suave de tempo segurando acelerador + freio na curva (sem solavancos ou puxões instantâneos)
      if (isPowerBraking && Math.abs(playerSeg.curve) > 0.1) {
        p.powerBrakeHoldTime = Math.min(3.0, (p.powerBrakeHoldTime || 0) + dt);
      } else {
        p.powerBrakeHoldTime = Math.max(0, (p.powerBrakeHoldTime || 0) - dt * 2.0);
      }
      const powerBrakeProgress = Math.min(1.0, (p.powerBrakeHoldTime || 0) / 2.4);

      if (Math.abs(p.steerAngle) > 0.01 && p.speed > 2) {
        const lowSpeedAuthority = Math.min(1, p.speed / 45);
        const highSpeedAuthority = 1.0 - Math.min(0.22, speedRatio * 0.18);
        // Resposta de esterçamento 100% natural e previsível, sem puxão abrupto no volante
        const steerPower = (2.15 * model.handling + 0.42) * lowSpeedAuthority * highSpeedAuthority;
        p.x += p.steerAngle * steerPower * dt;

        // Leve perda de velocidade por atrito lateral em curvas fortes (desativada no power braking para não frear duplo)
        if (Math.abs(playerSeg.curve) > 1.4 && speedRatio > 0.72 && !isPowerBraking) {
          const scrub = Math.abs(p.steerAngle) * (1.15 - model.grip * 0.65) * 22 * dt;
          p.speed = Math.max(40, p.speed - scrub);
        }
      }

      // Força Centrífuga progressiva e equilibrada + amortecimento elástico de toque lateral
      if (playerSeg.curve !== 0 && p.speed > 15) {
        // Ao acionar acelerador + freio, segura o carro firme na tangente sem solavanco.
        // Quanto mais tempo mantiver o freio acionado, mais suavemente a centrífuga se estabiliza.
        const centrifugalSuppress = isPowerBraking ? (0.91 - 0.12 * powerBrakeProgress) : 1.0;
        const centrifugal = ((playerSeg.curve * (speedRatio * speedRatio) * 0.40) / model.centrifugalResistance) * centrifugalSuppress;
        p.x -= centrifugal * dt;

        // Puxada suave e progressiva para o traçado interno da curva (calibrada +25% mais suave para máxima fluidez e naturalidade)
        if (isPowerBraking && powerBrakeProgress > 0.05) {
          const curveDir = Math.sign(playerSeg.curve); // +1 curva à direita, -1 curva à esquerda
          const curveIntensity = Math.min(1.0, Math.abs(playerSeg.curve) / 2.5);
          const gentleInwardPull = curveDir * (0.082 * powerBrakeProgress * curveIntensity) * dt;
          p.x += gentleInwardPull;
        }
      }
      if (Math.abs(p.bumpVelX) > 0.003) {
        p.x += p.bumpVelX * dt;
        p.bumpVelX *= Math.exp(-6.5 * dt);
      } else {
        p.bumpVelX = 0;
      }
      p.x = Math.max(Math.min(p.x, 2.25), -2.25);

      // Física diferenciada entre Zebra (Curb) e Grama (Off-road) — sem tremer a tela à toa!
      const absX = Math.abs(p.x);
      const isOffroad = absX > 1.08;

      if (isOffroad && p.speed > 45) {
        const offDepth = Math.min(1.5, (absX - 1.08) * 1.8 + 0.5);
        p.speed = Math.max(p.speed - (155 * offDepth) * dt, 42);
        this.shake = Math.max(this.shake * 0.85, 1.5);
        this.particlePool.spawn(p.x + (Math.random() - 0.5) * 0.18, 0, p.z, (Math.random() - 0.5) * 0.45, -0.26, 0.28, playerSeg.color.grass);
      } else {
        // Pista asfaltada lisa: zero vibração na câmera para eliminar qualquer sensação de náusea/enjoo
        this.shake = Math.max(0, this.shake - 25 * dt);
      }

      const targetRoll = (-playerSeg.curve * 0.0065) + (p.steerAngle * 0.010);
      this.cameraRoll += (targetRoll - this.cameraRoll) * 6.5 * dt;

      if (p.isNitro) {
        if (Math.random() < 0.65) {
          this.particlePool.spawn(p.x - 0.05, 0.01, p.z, (Math.random() - 0.5) * 0.08, -0.10, 0.12, '#00E5FF');
          this.particlePool.spawn(p.x + 0.05, 0.01, p.z, (Math.random() - 0.5) * 0.08, -0.10, 0.12, 'rgba(255, 255, 255, 0.75)');
        }
      } else if (p.inSlipstream && Math.random() < 0.45) {
        this.particlePool.spawn(p.x + (Math.random() - 0.5) * 0.28, -0.12, p.z + 40, 0, -0.05, 0.14, 'rgba(210, 245, 255, 0.45)');
      }

      // Detecção de derrapagem / Power Slide estilo Top Gear
      const isPowerSliding = isPowerBraking && p.speed > 50 && (Math.abs(p.steerAngle) > 0.16 || Math.abs(playerSeg.curve) > 0.35);
      const isSkidding = isPowerSliding || (Math.abs(p.steerAngle) > 0.58 && speedRatio > 0.66 && Math.abs(playerSeg.curve) > 0.95) || (isOffroad && p.speed > 80);

      if (isSkidding && !isOffroad && this.state === 'RACING') {
        playerSeg.skidX = p.x;
        playerSeg.skidUntil = this.raceTimer + 7.0;
        if (Math.random() < 0.75) {
          // Fumaça de borracha nos pneus traseiros (mais intensa durante o power braking)
          const smokeAlpha = isPowerBraking ? '0.72' : '0.55';
          this.particlePool.spawn(p.x - 0.11, 0.04, p.z, (Math.random() - 0.5) * 0.22, -0.20, 0.24, `rgba(226, 232, 240, ${smokeAlpha})`);
          this.particlePool.spawn(p.x + 0.11, 0.04, p.z, (Math.random() - 0.5) * 0.22, -0.20, 0.24, `rgba(226, 232, 240, ${smokeAlpha})`);
        }
      }
      this.audio.updateEngineRpm(p.rpm, isAccelerating || isPowerBraking, p.isNitro);
      this.audio.setSkid(isSkidding);

      const stepZ = p.speed * 20 * dt;
      p.z = this.wrapZ(p.z + stepZ);
      p.totalDistance += stepZ;

      // Inicia a cronometragem da Volta 1 exatamente na passagem inicial da linha de largada
      if (!p.passedStartLine && p.totalDistance >= START_LINE_Z) {
        p.passedStartLine = true;
        this.currentLapTime = 0;
        if (this.radio) this.radio.speak("Largada autorizada! Volta 1 em andamento!", false);
      }

      if (this.state === 'RACING' && p.totalDistance >= p.nextLapTarget) {
        const lapTargetDist = p.nextLapTarget;
        p.nextLapTarget += this.track.totalLength;
        p.laps++;
        const thisLap = this.currentLapTime;
        this.lastLapTime = thisLap;
        if (this.bestLapTime === 0 || thisLap < this.bestLapTime) {
          this.bestLapTime = thisLap;
          if (this.radio) this.radio.speak("Volta mais rápida da corrida!", false);
        }
        this.currentLapTime = 0;

        this.audio.playBeep(659, 0.25);
        this.lapBannerTimer = 2.0;

        if (p.laps >= TOTAL_LAPS) {
          this.registerCarFinish(p, dt, stepZ, lapTargetDist);
          this.lapBannerTimer = 0;
          this.isLastLapBanner = false;
          this.lapBannerText = '';
          if (this.radio) this.radio.speak("Bandeira quadriculada! Corrida finalizada!", true);

          // Inicia transição de finalização: aguarda 3 segundos com câmera parada e fade até a classificação
          this.finishingRace = true;
          this.finishDuration = 3.0;
          this.finishTimer = 3.0;
          this.finishFadeAlpha = 0;

          // A CÂMERA PARA exatamente no momento em que o nosso carro bandeirou:
          this.finishCamOriginZ = this.wrapZ(p.z - PLAYER_Z_OFFSET);
          this.finishCameraX = p.x * ROAD_WIDTH * 0.65;
          const refSeg = this.findSegment(p.z);
          const refPercent = (p.z % SEGMENT_LENGTH) / SEGMENT_LENGTH;
          const playerWorldY = (1 - refPercent) * refSeg.p1.world.y + refPercent * refSeg.p2.world.y;
          this.finishCameraY = CAMERA_HEIGHT + playerWorldY;

          this.audio.playBeep(523, 0.2);
          setTimeout(() => this.audio.playBeep(659, 0.2), 200);
          setTimeout(() => this.audio.playBeep(880, 0.4), 400);

          this.input.clearPulses();
        } else {
          this.lapBannerText = `VOLTA ${p.laps + 1} / ${TOTAL_LAPS}`;
          if (p.laps + 1 === TOTAL_LAPS) {
            this.isLastLapBanner = true;
            this.lapBannerTimer = 3.2;
            this.audio.playBeep(880, 0.15);
            setTimeout(() => this.audio.playBeep(1100, 0.25), 160);
            if (this.radio) this.radio.speak("Atenção: última volta! Dê tudo de si!", true);
          } else {
            this.isLastLapBanner = false;
            if (this.radio) this.radio.speak(`Volta ${p.laps + 1}! Mantenha a pressão!`, false);
          }
        }
      }
    }

      // --- IA DOS 19 BOTS (LARGADA F1 + TRAÇADO + VÁCUO + 3 NITROS E ULTRAPASSAGEM) ---
      for (let i = 0; i < this.cars.length; i++) {
        const bot = this.cars[i];
        if (bot.isPlayer) continue;

        if (this.raceTimer < bot.launchDelay) {
          bot.speed = 0;
          continue;
        }

        // Atualiza contadores de Nitro do Bot com decaimento suave de 3 segundos
        if (bot.nitroTimer > 0) {
          bot.nitroTimer -= dt;
          bot.isNitro = true;
          if (bot.nitroTimer <= 0) {
            bot.nitroTimer = 0;
            bot.isNitro = false;
            bot.nitroDecayTimer = 3.0; // Desaceleração gradual suave de 3s para os bots
          }
        } else {
          bot.isNitro = false;
          if (bot.nitroDecayTimer > 0) {
            bot.nitroDecayTimer = Math.max(0, bot.nitroDecayTimer - dt);
          }
        }
        if (bot.nitroCooldown > 0) {
          bot.nitroCooldown -= dt;
        }

        const botSeg = this.findSegment(bot.z);
        const botSlope = (botSeg.p2.world.y - botSeg.p1.world.y) / SEGMENT_LENGTH;
        let baseTargetSpeed = this.getEffectiveMaxSpeed(bot) * bot.aiSkill * 0.96;
        if (Math.abs(botSeg.curve) > 2.0) baseTargetSpeed *= 0.86;
        // Gravidade para os rivais também (embalam na descida e pesam na subida)
        baseTargetSpeed += Math.max(-45, -botSlope * 210);

        // Vácuo para os Bots: detecta carros à frente (jogador ou outros bots)
        bot.inSlipstream = false;
        bot.slipstreamIntensity = 0;
        let leadCar = null;
        let leadDist = 9999;
        if (this.state === 'RACING' && bot.speed > 35) {
          let bestIntensity = 0;
          for (let k = 0; k < this.cars.length; k++) {
            if (i === k) continue;
            const other = this.cars[k];
            const aheadDz = this.shortestDeltaZ(other.z, bot.z);
            if (aheadDz >= -30 && aheadDz <= 2600) {
              const distW = (aheadDz <= 700) ? 1.0 : Math.pow(1.0 - ((aheadDz - 700) / (2600 - 700)), 0.82);
              const maxLat = 0.65 + 0.35 * (Math.max(0, aheadDz) / 2600);
              const latDiff = Math.abs(other.x - bot.x);
              if (latDiff < maxLat) {
                const alignW = Math.max(0, 1.0 - (latDiff / maxLat));
                const intensity = Math.max(0, Math.min(1.0, distW * alignW));
                if (intensity > bestIntensity) {
                  bestIntensity = intensity;
                  leadCar = other;
                  leadDist = Math.max(0, aheadDz);
                }
              }
            }
          }
          if (bestIntensity > 0.015) {
            bot.inSlipstream = true;
            bot.slipstreamIntensity = bestIntensity;
            bot.slipstreamDecayTimer = 1.0; // Slingshot dos Bots calibrado para 1 segundo com decaimento gradual
            bot.slipstreamStoredIntensity = Math.max(bot.slipstreamStoredIntensity || 0, bestIntensity);
            bot.slipstreamPeakSpeed = Math.max(bot.slipstreamPeakSpeed || 0, bot.speed);
          }
        }

        if (!bot.inSlipstream && bot.slipstreamDecayTimer > 0) {
          bot.slipstreamDecayTimer = Math.max(0, bot.slipstreamDecayTimer - dt);
          if (bot.slipstreamDecayTimer <= 0) {
            bot.slipstreamStoredIntensity = 0;
            bot.slipstreamPeakSpeed = 0;
          }
        }

        // Aplica bônus progressivo de vácuo ao bot (velocidade máxima e aceleração)
        const botSlingshotRatio = Math.max(0, Math.min(1.0, bot.slipstreamDecayTimer / 1.0));
        const botSlipInt = bot.inSlipstream
          ? (bot.slipstreamIntensity || 0)
          : (bot.slipstreamDecayTimer > 0 ? ((bot.slipstreamStoredIntensity || 0.4) * botSlingshotRatio) : 0);
        const botNitroBoostMul = bot.isNitro
          ? 0.30
          : (bot.nitroDecayTimer > 0 ? (0.30 * (bot.nitroDecayTimer / 3.0)) : 0);
        const botDownhillBonus = Math.max(0, -botSlope * 240);
        const botBaseMax = (bot.isNitro || bot.nitroDecayTimer > 0)
          ? (this.getEffectiveMaxSpeed(bot) * (1.0 + botNitroBoostMul)) + botDownhillBonus
          : baseTargetSpeed;
        const botCatchBonus = (leadCar && leadCar.speed > bot.speed)
          ? (leadCar.speed - bot.speed) * 0.85 * botSlipInt
          : 0;
        const botVacuumTopBoost = ((botBaseMax * 0.22) + 24) * botSlipInt;
        let targetSpeed = botBaseMax + botVacuumTopBoost + botCatchBonus;
        if (!bot.inSlipstream && bot.slipstreamDecayTimer > 0 && bot.slipstreamPeakSpeed > targetSpeed) {
          // Diminui gradativamente de volta ao longo de 1 segundo
          targetSpeed = targetSpeed + (bot.slipstreamPeakSpeed - targetSpeed) * botSlingshotRatio;
        }

        // Bônus do Nitro ativo do Bot (soma com descida de ladeira)
        if (bot.isNitro) {
          targetSpeed = (this.getEffectiveMaxSpeed(bot) * 1.30) + botDownhillBonus;
        }

        // Inteligência de Uso dos 3 Nitros pelos Bots
        if (this.state === 'RACING' && this.raceTimer > 2.5 && bot.nitroCharges > 0 && bot.nitroTimer <= 0 && bot.nitroCooldown <= 0) {
          const isStraight = Math.abs(botSeg.curve) < 1.0;
          // Caso 1: Vácuo próximo querendo ultrapassar na reta (slingshot)
          const shouldDraftPass = leadCar && leadDist < 240 && isStraight && (bot.speed > 130);
          // Caso 2: Saída de curva para reta acelerando forte
          const shouldExitLaunch = isStraight && bot.speed < this.getEffectiveMaxSpeed(bot) * 0.82 && Math.random() < 0.04;
          // Caso 3: Disputa acirrada com o jogador (defendendo ou atacando na 2ª e 3ª voltas)
          const playerDist = Math.abs(this.shortestDeltaZ(this.player.z, bot.z));
          const shouldFightPlayer = playerDist < 260 && (this.player.laps >= 1 || isStraight) && Math.random() < 0.06;

          if (shouldDraftPass || shouldExitLaunch || shouldFightPlayer) {
            bot.nitroCharges--;
            bot.nitroTimer = 2.4;
            bot.nitroCooldown = 7.0 + Math.random() * 8.0;
            bot.isNitro = true;
          }
        }

        // Traçado, Tangência e Estratégia de Vácuo/Estilingue dos Bots
        if (this.raceTimer < 3.2) {
          // Nos primeiros 3.2s após a largada, os bots mantêm estritamente a sua própria coluna do grid
          // sem cruzar a pista e sem trocar de lado com os outros carros
          bot.targetX = (bot.gridStartX !== undefined) ? bot.gridStartX : bot.x;
        } else {
          if (botSeg.curve !== 0) {
            const apexX = Math.max(-0.68, Math.min(0.68, -botSeg.curve * 0.22));
            bot.targetX += (apexX - bot.targetX) * 1.5 * dt;
          } else if (bot.inSlipstream && leadCar && leadDist > 140) {
            // Em vácuo a média distância: o bot alinha atrás do carro da frente para sugar velocidade!
            bot.targetX += (leadCar.x - bot.targetX) * 2.6 * dt;
          } else {
            bot.laneChangeTimer -= dt;
            if (bot.laneChangeTimer <= 0) {
              bot.laneChangeTimer = 2.8 + Math.random() * 3.5;
              bot.targetX = (Math.random() - 0.5) * 1.20;
            }
          }
        }

        let blocked = false;
        if (bot.bumpBoostTimer > 0) {
          bot.bumpBoostTimer -= dt;
        }

        // Manobra inteligente: evitar batidas de lado e traseira + ultrapassagem via estilingue
        for (let j = 0; j < this.cars.length; j++) {
          if (i === j) continue;
          const other = this.cars[j];
          const distZ = this.shortestDeltaZ(other.z, bot.z);
          const latDiff = Math.abs(other.x - bot.x);

          // 1. CARROS EMPARELHADOS LATERALMENTE (|distZ| <= 55):
          // Afasta ativamente durante a corrida para evitar contato lateral ou esfregar porta!
          if (this.raceTimer > 3.0 && Math.abs(distZ) <= 55 && latDiff < 0.54) {
            const avoidDir = (bot.x >= other.x) ? 1 : -1;
            bot.targetX += avoidDir * (0.54 - latDiff) * 3.2 * dt;
            bot.targetX = Math.max(-0.85, Math.min(0.85, bot.targetX));
          }

          // 2. CARRO À FRENTE NO MESMO TRILHO (distZ > 0):
          if (distZ > 0 && distZ < 450 && latDiff < 0.44) {
            blocked = true;
            if (this.raceTimer > 2.8) {
              // Estilingue (Slingshot): quando próximo, puxa com firmeza para a pista livre
              // ultrapassando sem bater na traseira!
              const passDir = (other.x >= 0) ? -0.54 : 0.54;
              bot.targetX = Math.max(-0.80, Math.min(0.80, other.x + passDir));
              // Aciona o benefício do slingshot para impulsionar a ultrapassagem
              bot.slipstreamDecayTimer = 1.2;
            }
            // Se estiver muito próximo e sem espaço para passar, alivia o acelerador
            if (distZ < 90 && bot.bumpBoostTimer <= 0 && !bot.isNitro) {
              targetSpeed = Math.min(targetSpeed, other.speed * 0.92);
            }
          }
        }

        // Aplicação de aceleração e frenagem do Bot
        if (blocked && bot.speed > targetSpeed + 12 && bot.bumpBoostTimer <= 0 && !bot.isNitro) {
          bot.speed = Math.max(bot.speed - 190 * dt, targetSpeed);
          bot.isBraking = true;
        } else {
          bot.isBraking = false;
          if (bot.speed < targetSpeed) {
            const botSpeedRatio = Math.max(0, bot.speed / this.getEffectiveMaxSpeed(bot));
            const botAirDrag = Math.pow(Math.min(1.0, botSpeedRatio), 1.6) * 0.58;
            const botTorque = Math.max(0.32, 1.28 - botAirDrag);
            const nitroAccel = bot.isNitro ? 1.75 : (bot.nitroDecayTimer > 0 ? (1.0 + 0.75 * (bot.nitroDecayTimer / 3.0)) : 1.0);
            const accelMul = nitroAccel + (1.10 * (bot.slipstreamIntensity || 0));
            // Cadência de arrancada esportiva equilibrada para os bots (~6 a 8s para velocidade máxima)
            const baseBotPower = bot.isNitro ? (65 + bot.model.acceleration * 55) : (24 + bot.model.acceleration * 26);
            const launchRate = baseBotPower * botTorque * accelMul * dt;
            const botSuctionPull = (32 + bot.model.acceleration * 38) * (bot.slipstreamIntensity || 0) * dt;
            bot.speed = Math.min(bot.speed + launchRate + botSuctionPull, targetSpeed);
          } else if (bot.bumpBoostTimer <= 0 && !bot.isNitro) {
            const botExcess = bot.speed - targetSpeed;
            if (botExcess > 0) {
              const isSlingshot = (bot.slipstreamDecayTimer > 0);
              // Desaceleração cadenciada e gradual pós-slingshot para os bots também
              const excessDecay = isSlingshot
                ? Math.min(7.5, Math.max(3.2, botExcess * 0.15)) * dt
                : Math.min(9.0, Math.max(3.8, botExcess * 0.18)) * dt;
              bot.speed = Math.max(targetSpeed, bot.speed - excessDecay);
            }
          }
        }

        if (bot.bumpVelX) {
          if (Math.abs(bot.bumpVelX) > 0.003) {
            bot.x += bot.bumpVelX * dt;
            bot.bumpVelX *= Math.exp(-6.0 * dt);
          } else {
            bot.bumpVelX = 0;
          }
        }
        if (Math.abs(bot.x) > 1.0) {
          // Na grama, desacelera suavemente por atrito e busca retornar a pista
          bot.targetX = (bot.x > 0 ? 0.70 : -0.70);
          bot.speed = Math.max(40, bot.speed - 90 * dt);
        } else {
          bot.targetX = Math.max(-0.80, Math.min(0.80, bot.targetX));
        }
        const prevBotX = bot.x;
        bot.x += (bot.targetX - bot.x) * 2.4 * dt;

        // Angulo visual dos bots para acionar os 3 sprites (curva a esquerda, reto, curva a direita)
        const lateralVel = (bot.x - prevBotX) / Math.max(0.001, dt);
        const desiredBotSteer = Math.max(-1, Math.min(1, lateralVel * 1.15 + botSeg.curve * 0.16));
        bot.steerAngle += (desiredBotSteer - bot.steerAngle) * Math.min(1, 7.5 * dt);

        const botStepZ = bot.speed * 20 * dt;
        bot.z = this.wrapZ(bot.z + botStepZ);
        bot.totalDistance += botStepZ;

        if (bot.totalDistance >= bot.nextLapTarget) {
          const lapTargetDist = bot.nextLapTarget;
          bot.nextLapTarget += this.track.totalLength;
          bot.laps++;
          if (bot.laps >= TOTAL_LAPS) {
            this.registerCarFinish(bot, dt, botStepZ, lapTargetDist);
          }
        }

        if (bot.collisionCooldown > 0) bot.collisionCooldown -= dt;
      }

      // --- FISICA DE COLISAO REALISTA (ESTILO TOP GEAR + RESPEITO A LARGURA REAL DO CARRO) ---
      if (p.collisionCooldown > 0) p.collisionCooldown -= dt;

      for (let i = 0; i < this.cars.length; i++) {
        const bot = this.cars[i];
        if (bot.isPlayer) continue;
        if (this.finishingRace) continue; // Após bandeirar, o carro do jogador desacelera em segurança sem colisão

        // dz < 0: bot está à frente do jogador | dz > 0: bot está atrás do jogador
        const dz = this.shortestDeltaZ(p.z, bot.z);
        const dx = p.x - bot.x;
        const absDx = Math.abs(dx);

        // Largura física real dos carros na pista (impede que atravessem um por dentro do outro)
        const COLLISION_WIDTH = 0.44;

        // Ignora carros fora do alcance visual e físico
        if (dz <= -85 || dz >= 65 || absDx >= COLLISION_WIDTH) continue;

        let didCollide = false;

        if (dz <= -46) {
          // ========================================================
          // 1. COLISÃO TRASEIRA (ESTILO TOP GEAR):
          // Jogador bateu na traseira do rival à frente!
          // O jogador perde velocidade (bate no "muro") e o rival ganha impulso para frente!
          // ========================================================
          didCollide = true;
          const speedDiff = Math.max(0, p.speed - bot.speed);

          // Jogador perde velocidade significativa e é contido atrás do rival
          p.speed = Math.max(30, Math.min(p.speed - 36 - speedDiff * 0.45, bot.speed * 0.88));
          p.z = this.wrapZ(bot.z - 48);

          // Rival recebe um impulso direto para frente (estilo Top Gear)
          const forwardImpulse = 26 + Math.min(38, speedDiff * 0.50);
          bot.speed = Math.min(bot.speed + forwardImpulse, this.getEffectiveMaxSpeed(bot) * 1.25);
          bot.bumpBoostTimer = 1.8; // Mantém o impulso sem a IA frear de imediato
          bot.z = this.wrapZ(bot.z + 20);
          bot.totalDistance += 20;

          // Se bateu descentralizado, desvia levemente para o lado
          if (absDx > 0.08) {
            p.bumpVelX = (dx >= 0 ? 0.85 : -0.85);
          }
          this.shake = 2.4;
        } else if (dz >= 46) {
          // ========================================================
          // 2. RIVAL BATEU NA TRASEIRA DO JOGADOR
          // ========================================================
          if (bot.speed > p.speed) {
            didCollide = true;
            bot.speed = Math.max(30, p.speed * 0.84);
            const pMaxVal = this.getEffectiveMaxSpeed(p);
            const playerTopSpeed = (p.isNitro ? (pMaxVal * 1.30) : pMaxVal);
            p.speed = Math.min(p.speed + 20, playerTopSpeed * 1.10);
            bot.z = this.wrapZ(p.z - 48);
            this.shake = 1.8;
          }
        } else {
          // ========================================================
          // 3. CONTATO PORTA-A-PORTA LATERAL / DISPUTA DE ESPAÇO FIRME E MODERADA:
          // NUNCA atravessa por dentro do outro carro! Separação física sólida imediata.
          // ========================================================
          didCollide = true;
          const overlap = Math.max(0.02, COLLISION_WIDTH - absDx);
          const dirX = (dx >= 0) ? 1 : -1;

          // Separação física imediata e firme (garante que nunca passem um por dentro do outro)
          p.x += dirX * overlap * 0.55;
          bot.x -= dirX * overlap * 0.55;

          // Sem problema sair da pista (pode ir até a grama e voltar naturalmente)
          p.x = Math.max(-1.95, Math.min(1.95, p.x));
          bot.x = Math.max(-1.95, Math.min(1.95, bot.x));

          // Impulso lateral moderado e cadenciado (firme sem ser escandaloso)
          p.bumpVelX = dirX * (0.65 + overlap * 0.60);
          bot.bumpVelX = -dirX * (0.65 + overlap * 0.60);

          p.speed = Math.max(30, p.speed - 3.2);
          bot.speed = Math.max(30, bot.speed - 3.2);
          this.shake = 1.4;
        }

        if (didCollide) {
          if (p.collisionCooldown <= 0) {
            this.audio.playCrash();
            p.collisionCooldown = 0.12;
            bot.collisionCooldown = 0.12;
          }

          // Faíscas vibrantes e bem visíveis saindo do ponto exato de contato da lataria
          const contactX = (p.x + bot.x) / 2;
          for (let k = 0; k < 8; k++) {
            this.particlePool.spawn(
              contactX, -0.06, p.z,
              (Math.random() - 0.5) * 1.6 + (dx >= 0 ? 0.3 : -0.3),
              -Math.random() * 0.75,
              0.26, (k % 2 === 0) ? '#FFD700' : ((k % 3 === 0) ? '#FFFFFF' : '#FF9100')
            );
          }
        }
      }

      // Colisão mútua entre bots da CPU para evitar que passem um por dentro do outro
      for (let i = 0; i < this.cars.length; i++) {
        const carA = this.cars[i];
        if (carA.isPlayer) continue;
        for (let j = i + 1; j < this.cars.length; j++) {
          const carB = this.cars[j];
          if (carB.isPlayer) continue;

          const dz = Math.abs(this.shortestDeltaZ(carA.z, carB.z));
          const dx = carA.x - carB.x;
          const absDx = Math.abs(dx);

          if (dz <= 46 && absDx < 0.44) {
            const overlap = (0.44 - absDx);
            const dirX = (dx >= 0) ? 1 : -1;
            carA.x = Math.max(-1.95, Math.min(1.95, carA.x + dirX * overlap * 0.55));
            carB.x = Math.max(-1.95, Math.min(1.95, carB.x - dirX * overlap * 0.55));
            carA.bumpVelX = dirX * 0.50;
            carB.bumpVelX = -dirX * 0.50;
            carA.speed = Math.max(30, carA.speed * 0.985);
            carB.speed = Math.max(30, carB.speed * 0.985);
          }
        }
      }

      // --- FÍSICA DE COLISÃO COM CENÁRIO LATERAL (POSTES, ÁRVORES, PLACAS E OUTDOORS) ---
      if (p.sceneryCollisionCooldown > 0) {
        p.sceneryCollisionCooldown -= dt;
      }

      if (this.track && this.track.segments && !this.finishingRace && (this.state === 'RACING' || this.state === 'COUNTDOWN')) {
        const totalSegs = this.track.segments.length;
        const pSegIdx = Math.floor(p.z / SEGMENT_LENGTH) % totalSegs;
        const checkOffsets = [-1, 0, 1];

        for (let o = 0; o < checkOffsets.length; o++) {
          const sIdx = (pSegIdx + checkOffsets[o] + totalSegs) % totalSegs;
          const seg = this.track.segments[sIdx];
          if (!seg || !seg.scenery) continue;

          const scList = Array.isArray(seg.scenery) ? seg.scenery : [seg.scenery];
          let hitScenery = false;

          for (let sc of scList) {
            if (!sc || typeof sc.offset !== 'number') continue;

            const dz = Math.abs(this.shortestDeltaZ(p.z, seg.p1.world.z));
            if (dz > 52) continue;

            let colRadius = 0.28;
            if (sc.type === 'billboard' || sc.type === 'building') {
              colRadius = 0.46;
            } else if (sc.type === 'streetlamp' || sc.type === 'pole') {
              colRadius = 0.22;
            } else if (sc.type.includes('sign')) {
              colRadius = 0.26;
            } else if (sc.type.includes('tree') || sc.type.includes('pine') || sc.type.includes('palm') || sc.type === 'bush') {
              colRadius = 0.32;
            }

            const dx = p.x - sc.offset;
            const absDx = Math.abs(dx);

            if (absDx < colRadius) {
              // COLISÃO SUAVE COM CENÁRIO: EMPURRA O CARRO SUAVEMENTE PARA A DIREÇÃO OPOSTA
              const overlap = colRadius - absDx;
              const pushDir = (dx >= 0) ? 1 : -1;

              // Impulso lateral suave (não violento, amortecido organicamente via bumpVelX)
              p.bumpVelX = pushDir * (0.38 + overlap * 0.28);
              p.x = Math.max(-2.25, Math.min(2.25, p.x + pushDir * (0.02 + overlap * 0.30)));

              // Perda moderada de velocidade por atrito/raspagem
              p.speed = Math.max(30, p.speed - 5.0);

              if (p.sceneryCollisionCooldown <= 0) {
                this.audio.playCrash();
                p.sceneryCollisionCooldown = 0.24;
                this.shake = Math.max(this.shake, 1.4);
              }

              // Efeitos visuais: faíscas metálicas ou lascas/folhagens no ponto de contato
              const contactX = (p.x + sc.offset) * 0.5;
              const isFoliage = (sc.type.includes('tree') || sc.type.includes('pine') || sc.type.includes('palm') || sc.type === 'bush');
              const pCol = isFoliage ? '#15803D' : (this.envCur && this.envCur.night > 0.28 ? '#FFE082' : '#CBD5E1');

              for (let k = 0; k < 6; k++) {
                this.particlePool.spawn(
                  contactX, -0.06, p.z,
                  (Math.random() - 0.5) * 1.3 + pushDir * 0.40,
                  -Math.random() * 0.70,
                  0.22 + Math.random() * 0.16,
                  pCol
                );
              }

              hitScenery = true;
              break;
            }
          }

          if (hitScenery) break;
        }
      }

      this.particlePool.update(dt);
      this.input.clearPulses();
    }

    registerCarFinish(car, dt, stepZ, targetDist = null) {
      if (car.finished || car.finishRank > 0) return;
      car.finished = true;

      const finishTarget = targetDist || (car.nextLapTarget ? (car.nextLapTarget - this.track.totalLength) : (START_LINE_Z + TOTAL_LAPS * this.track.totalLength));
      const prevDist = car.totalDistance - stepZ;
      const distInFrame = Math.max(0.001, car.totalDistance - prevDist);
      const distToTarget = Math.max(0, finishTarget - prevDist);
      const fraction = Math.max(0, Math.min(1, distToTarget / distInFrame));
      car.finishTime = Math.max(0.001, (this.raceTimer - dt) + fraction * dt);

      if (!this.finishOrder) this.finishOrder = [];
      if (!this.finishOrder.includes(car)) {
        this.finishOrder.push(car);
        // Garante ordenação inequívoca por tempo de chegada exato (sub-frame)
        this.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
        for (let i = 0; i < this.finishOrder.length; i++) {
          this.finishOrder[i].finishRank = i + 1;
        }
      }
    }

    getRankedCars() {
      if (!this.cachedRankedCars || this.cachedRankedCars.length !== this.cars.length) {
        this.cachedRankedCars = new Array(this.cars.length);
      }
      for (let i = 0; i < this.cars.length; i++) {
        this.cachedRankedCars[i] = this.cars[i];
      }
      this.cachedRankedCars.sort((a, b) => {
        if (a.finishRank && b.finishRank) return a.finishRank - b.finishRank;
        if (a.finishRank) return -1;
        if (b.finishRank) return 1;
        if (a.finishTime > 0 && b.finishTime > 0) return a.finishTime - b.finishTime;
        if (a.finishTime > 0) return -1;
        if (b.finishTime > 0) return 1;
        if (a.laps !== b.laps) return b.laps - a.laps;
        return b.totalDistance - a.totalDistance;
      });
      return this.cachedRankedCars;
    }

    finishRace() {
      this.state = 'RACE_RESULT';
      this.audio.silenceEffects();
      this.audio.musicPlaying = false;
      this.audio.playBeep(523, 0.2);
      setTimeout(() => this.audio.playBeep(659, 0.2), 200);
      setTimeout(() => this.audio.playBeep(880, 0.4), 400);

      const ranked = this.getRankedCars();
      this.lastRacePositions = ranked;

      for (let pos = 0; pos < ranked.length; pos++) {
        const car = ranked[pos];
        const pts = (pos < F1_POINTS.length) ? F1_POINTS[pos] : 0;
        car.racePos = pos + 1;
        car.racePoints = pts;
        if (this.gameMode === 'CHAMPIONSHIP') {
          this.championshipPoints[car.id] += pts;
        }
      }
    }

    // ==========================================
    // RENDERIZAÇÃO GRÁFICA 2.5D ARCADE HD
    // ==========================================
    render() {
      const ctx = this.ctx;
      const def = TRACK_DEFINITIONS[this.trackIndex];

      if (this.webgl && this.webgl.available) {
        this.webgl.beginFrame([0, 0, 0, 1]);
      }
      ctx.clearRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
      ctx.imageSmoothingEnabled = true;

      ctx.save();

      if (this.cameraRoll !== 0 || this.shake > 0) {
        ctx.translate(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2);
        ctx.rotate(this.cameraRoll);
        if (this.shake > 0) {
          ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
        }
        ctx.translate(-INTERNAL_WIDTH / 2, -INTERNAL_HEIGHT / 2);
      }

      this.renderSky(ctx, def);

      // Fundo base de terreno de acordo com o clima/horário ativo (verde em dia, branco em neve, etc.)
      const grassCol = (this.segColDark && this.segColDark.grass) ? this.segColDark.grass : def.colors.grassDark;
      if (this.webgl && this.webgl.available) {
        this.webgl.addRect(-20, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH + 40, INTERNAL_HEIGHT / 2 + 20, grassCol);
      } else {
        ctx.fillStyle = grassCol;
        ctx.fillRect(-20, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH + 40, INTERNAL_HEIGHT / 2 + 20);
      }

      this.renderRoad(ctx, def);

      const isNight = this.envCur ? ((this.envCur.s.night || 0) > 0.28) : false;
      const isDusk = this.envCur ? ((this.envCur.s.dusk || 0) > 0.25) : false;

      // Neblina atmosférica sutil na linha do horizonte para profundidade
      const hazeGrad = ctx.createLinearGradient(0, INTERNAL_HEIGHT / 2 - 4, 0, INTERNAL_HEIGHT / 2 + 10);
      hazeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      hazeGrad.addColorStop(0.45, isNight ? 'rgba(0, 180, 216, 0.12)' : (isDusk ? 'rgba(255, 140, 80, 0.22)' : 'rgba(220, 242, 255, 0.22)'));
      hazeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = hazeGrad;
      ctx.fillRect(-20, INTERNAL_HEIGHT / 2 - 4, INTERNAL_WIDTH + 40, 14);

      // Carro do Jogador projetado exatamente no mesmo espaço 3D da pista e dos rivais
      if (this.state === 'RACING' || this.state === 'COUNTDOWN' || this.state === 'PAUSED' || this.state === 'RESUME_COUNTDOWN') {
        const steerLean = this.player.steerAngle || 0;
        const playerSeg = this.findSegment(this.player.z);
        const inTunnel = (playerSeg && !!playerSeg.tunnel);
        const nightIntensity = inTunnel ? 1.0 : (this.envCur ? (this.envCur.s.night || 0) : 0);
        const isNight = (nightIntensity > 0.28);
        const isDusk = this.envCur ? ((this.envCur.s.dusk || 0) > 0.22) : false;
        const isDark = isNight || isDusk || inTunnel || (def && (def.theme === 'NOITE' || def.theme === 'TARDE'));

        if (this.finishingRace) {
          // Quando bandeirou e a câmera parou, o carro se afasta pela pista em perspectiva 3D realista
          const playerZ = this.wrapZ(this.player.z);
          const camOriginZ = this.finishCamOriginZ;
          const relCamZ = (playerZ >= camOriginZ) ? (playerZ - camOriginZ) : (this.track.totalLength - camOriginZ + playerZ);

          const pSeg = this.findSegment(playerZ);
          const pPct = (playerZ % SEGMENT_LENGTH) / SEGMENT_LENGTH;
          const cRoad = this.projectInterpolated(pSeg, pPct);

          const distScale = PLAYER_Z_OFFSET / Math.max(1, relCamZ);
          const carW = PLAYER_CAR_W * distScale;
          const carH = PLAYER_CAR_H * distScale;
          const carX = cRoad.x + cRoad.w * this.player.x;
          const carY = cRoad.y - carH * (24 / 68);

          if (isNight && carW > 10) {
            this.renderHeadlightBeams(ctx, carX, carY, steerLean, nightIntensity * distScale);
          }

          this.player.model.render(
            ctx,
            carX,
            carY,
            carW,
            carH,
            false,
            steerLean,
            this.player.bodyColor,
            {
              isNitro: false,
              wheelPhase: this.player.z * 0.035,
              isNight: isDark,
              speed: this.player.speed
            }
          );
        } else {
          const pos = this.playerRenderPos || { x: INTERNAL_WIDTH / 2, y: INTERNAL_HEIGHT - 32 };
          const playerScreenX = pos.x;
          const playerScreenY = pos.y;

          if (isNight) {
            this.renderHeadlightBeams(ctx, playerScreenX, playerScreenY, steerLean, nightIntensity);
          }

          this.player.model.render(
            ctx,
            playerScreenX,
            playerScreenY,
            PLAYER_CAR_W,
            PLAYER_CAR_H,
            this.player.isBraking,
            steerLean,
            this.player.bodyColor,
            {
              isNitro: this.player.isNitro,
              wheelPhase: this.player.z * 0.035,
              isNight: isDark,
              speed: this.player.speed
            }
          );
        }

        // Rivais porta-a-porta levemente atrás do para-choque do jogador
        if (this.foregroundBots && this.foregroundBots.length > 0) {
          for (let i = 0; i < this.foregroundBots.length; i++) {
            const fb = this.foregroundBots[i];
            fb.bot.model.render(
              ctx,
              fb.x,
              fb.y,
              fb.w,
              fb.h,
              fb.bot.isBraking,
              fb.bot.steerAngle || 0,
              fb.bot.bodyColor,
              {
                isNitro: !!fb.bot.isNitro,
                wheelPhase: fb.bot.z * 0.035,
                isNight: isDark,
                speed: fb.bot.speed
              }
            );
            if (fb.w >= 14 && fb.bot.driverCode) {
              this.renderDriverBadge(ctx, fb.bot.driverCode, fb.x, fb.y - fb.h * 0.44, fb.w);
            }
          }
        }
      }

      this.renderParticles(ctx);

      if (this.player && this.state === 'RACING' && (this.player.isNitro || this.player.speed > this.getEffectiveMaxSpeed(this.player) * 0.92)) {
        this.renderSpeedLines(ctx);
      }
      ctx.restore();

      // HUD e Menus
      if (this.state === 'COUNTDOWN' || (this.state === 'RACING' && this.greenLightsTimer > 0)) {
        this.renderStartGantry(ctx);
      }

      if (this.state === 'RACING' || this.state === 'COUNTDOWN' || this.state === 'PAUSED' || this.state === 'RESUME_COUNTDOWN') {
        this.renderHUD(ctx);
      }

      if (this.state === 'RACING' || this.state === 'COUNTDOWN' || this.state === 'PAUSED' || this.state === 'RESUME_COUNTDOWN') {
        this.renderWeatherFx(ctx);
      }

      // Efeito de Bandeirada: Câmera Parada e Fade out até a Classificação
      if (this.finishingRace) {
        ctx.save();
        const bannerBlink = Math.floor(performance.now() / 250) % 2 === 0;
        ctx.fillStyle = bannerBlink ? '#FFD700' : '#00E5FF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.strokeText('🏁 BANDEIRA QUADRICULADA! 🏁', INTERNAL_WIDTH / 2, 44);
        ctx.fillText('🏁 BANDEIRA QUADRICULADA! 🏁', INTERNAL_WIDTH / 2, 44);
        ctx.restore();

        if (this.finishFadeAlpha > 0) {
          ctx.save();
          ctx.fillStyle = `rgba(0, 0, 0, ${this.finishFadeAlpha.toFixed(3)})`;
          ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
          ctx.restore();
        }
      }

      if (this.state === 'MENU') {
        this.renderMenu(ctx);
      } else if (this.state === 'MODE_SELECT') {
        this.renderModeSelect(ctx);
      } else if (this.state === 'TRACK_SELECT') {
        this.renderTrackSelect(ctx);
      } else if (this.state === 'CAR_SELECT') {
        this.renderCarSelect(ctx);
      } else if (this.state === 'COLOR_SELECT') {
        this.renderColorSelect(ctx);
      } else if (this.state === 'NAME_INPUT') {
        this.renderNameInput(ctx);
      } else if (this.state === 'RACE_SETUP') {
        this.renderRaceSetup(ctx);
      } else if (this.state === 'RESUME_COUNTDOWN') {
        this.renderResumeCountdown(ctx);
      } else if (this.state === 'PAUSED') {
        this.renderPauseMenu(ctx);
      } else if (this.state === 'SLOT_SELECT') {
        this.renderSlotSelect(ctx);
      } else if (this.state === 'SAVE_PROGRESS') {
        this.renderSaveProgress(ctx);
      } else if (this.state === 'DIFFICULTY_SELECT') {
        this.renderDifficultySelect(ctx);
      } else if (this.state === 'RACE_RESULT') {
        this.renderRaceResult(ctx);
      } else if (this.state === 'CHAMPIONSHIP_STANDINGS') {
        this.renderChampionshipStandings(ctx);
      } else if (this.state === 'CHAMPIONSHIP_RESULT') {
        this.renderChampionshipResult(ctx);
      } else if (this.state === 'ENDING_SCENE') {
        this.renderEndingScene(ctx);
      }

      // Notificação Arcade de Detecção de Gamepad / Joystick Nativo
      if (this.input && this.input.gamepadBannerTimer > 0) {
        ctx.save();
        const alpha = Math.min(1, this.input.gamepadBannerTimer * 1.6);
        ctx.globalAlpha = alpha;
        const bW = 270;
        const bH = 20;
        const bX = Math.round(INTERNAL_WIDTH / 2 - bW / 2);
        const bY = 7;
        ctx.fillStyle = 'rgba(6, 12, 24, 0.94)';
        ctx.fillRect(bX, bY, bW, bH);
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(bX, bY, bW, bH);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 7.5px monospace';
        const cleanName = (this.input.gamepadName || 'GAMESIR / CONTROLE NATIVO').slice(0, 32);
        ctx.fillText(`🎮 CONTROLE DETECTADO: ${cleanName}`, INTERNAL_WIDTH / 2, bY + 13);
        ctx.restore();
      }

      // Overlay de transição suave fade dos menus
      if (this.menuFadeAlpha > 0) {
        ctx.save();
        ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, this.menuFadeAlpha))})`;
        ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
        ctx.restore();
      }

      // Contador de FPS em tempo real (Discreto e compacto no topo, sem invadir RPM ou velocímetro)
      if (this.showFPS) {
        ctx.save();
        ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
        const fpsVal = Math.round(this.fps);
        const fpsColor = fpsVal >= 55 ? '#69F0AE' : (fpsVal >= 30 ? '#FFD700' : '#FF5252');
        ctx.fillStyle = 'rgba(5, 8, 16, 0.70)';
        ctx.fillRect(4, 1.2, 28, 7.2);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.30)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(4, 1.2, 28, 7.2);
        ctx.font = 'bold 5.2px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = fpsColor;
        ctx.fillText(`${fpsVal} FPS`, 18, 4.8);
        ctx.restore();
      }

      if (this.webgl && this.webgl.available) {
        this.webgl.endFrame();
      }
    }

    renderHeadlightBeams(ctx, px, py, steer, intensity = 1.0) {
      ctx.save();
      const tilt = steer * 14;
      const alpha = Math.min(1, Math.max(0, intensity));

      // Facho de iluminacao circular/oval no asfalto em frente ao carro do jogador
      const poolY = py - 30;
      const poolGrad = ctx.createRadialGradient(px + tilt * 0.5, poolY, 4, px + tilt * 0.5, poolY, 75);
      poolGrad.addColorStop(0, `rgba(255, 255, 235, ${(0.45 * alpha).toFixed(3)})`);
      poolGrad.addColorStop(0.35, `rgba(235, 248, 255, ${(0.26 * alpha).toFixed(3)})`);
      poolGrad.addColorStop(0.70, `rgba(195, 230, 255, ${(0.11 * alpha).toFixed(3)})`);
      poolGrad.addColorStop(1, 'rgba(180, 220, 255, 0)');
      ctx.fillStyle = poolGrad;
      ctx.beginPath();
      ctx.ellipse(px + tilt * 0.5, poolY, 68, 25, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    renderBotHeadlightBeams(ctx, x, y, w, h, steer, intensity = 1.0) {
      if (w <= 8 || h <= 4) return;
      ctx.save();
      const tilt = steer * w * 0.20;
      const alpha = Math.min(1, Math.max(0, intensity));

      // Facho de iluminacao circular/oval no asfalto em frente ao carro adversario
      const poolY = y - h * 0.35;
      const radiusX = Math.max(6, w * 0.65);
      const radiusY = Math.max(2, h * 0.28);
      const innerR = Math.min(2, radiusX * 0.2);
      const poolGrad = ctx.createRadialGradient(x + tilt, poolY, innerR, x + tilt, poolY, radiusX);
      poolGrad.addColorStop(0, `rgba(255, 252, 230, ${(0.38 * alpha).toFixed(3)})`);
      poolGrad.addColorStop(0.40, `rgba(230, 245, 255, ${(0.20 * alpha).toFixed(3)})`);
      poolGrad.addColorStop(1, 'rgba(190, 225, 255, 0)');
      ctx.fillStyle = poolGrad;
      ctx.beginPath();
      ctx.ellipse(x + tilt, poolY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ==========================================
    // AMBIENTE: transição suave de horário/clima + rolagem do cenário de fundo pela CURVA
    // ==========================================
    updateEnv(dt) {
      const track = TRACK_DEFINITIONS[this.trackIndex];
      let target, key;
      if (this.envCond === 'DINAMICO') {
        this.envTime += dt;
        const seg = DYN_HOLD + DYN_BLEND;
        const total = DYN_ORDER.length * seg;
        const tt = this.envTime % total;
        const i = Math.floor(tt / seg);
        const within = tt - i * seg;
        const A = getEnvTarget(track, DYN_ORDER[i]);
        if (within < DYN_HOLD) {
          target = A;
        } else {
          const nextCond = DYN_ORDER[(i + 1) % DYN_ORDER.length];
          const B = getEnvTarget(track, nextCond);
          const k = (within - DYN_HOLD) / DYN_BLEND;
          target = lerpEnv(A, B, k * k * (3 - 2 * k));
          if (this.dynAnnounced !== i && this.state === 'RACING') {
            this.dynAnnounced = i;
            const info = ENV_CONDITIONS.find(e => e.id === nextCond);
            this.envBanner = { text: `CLIMA MUDANDO: ${info ? info.icon + ' ' + info.label : nextCond}`, t: 3.2 };
          }
        }
        key = 'DINAMICO|' + track.id;
      } else {
        target = getEnvTarget(track, this.envCond);
        key = this.envCond + '|' + track.id;
      }

      if (key !== this.envKey) {
        this.envFrom = this.envCur || target;
        this.envBlend = this.envCur ? 0 : 1;
        this.envKey = key;
      }
      if (this.envBlend < 1) {
        this.envBlend = Math.min(1, this.envBlend + dt / 0.7);
        const k = this.envBlend * this.envBlend * (3 - 2 * this.envBlend);
        this.envCur = lerpEnv(this.envFrom, target, k);
      } else {
        this.envCur = target;
      }

      const c = this.envCur.css;
      this.segColLight = { road: c.roadLight, grass: c.grassLight, rumble: c.rumbleLight, lane: c.lane };
      this.segColDark = { road: c.roadDark, grass: c.grassDark, rumble: c.rumbleDark, lane: 'transparent' };

      if (this.envBanner) {
        this.envBanner.t -= dt;
        if (this.envBanner.t <= 0) this.envBanner = null;
      }
    }

    // As montanhas/nuvens só se deslocam quando a estrada CURVA (e não mais com o simples avanço em reta)
    updateSkyScroll(dt) {
      if (!this.track) return;
      let seg = null;
      let segPerSec = 0;
      if (this.state === 'MENU' || this.state === 'MODE_SELECT' || this.state === 'DIFFICULTY_SELECT' || this.state === 'TRACK_SELECT' || this.state === 'CAR_SELECT' || this.state === 'COLOR_SELECT' || this.state === 'RACE_SETUP' || this.state === 'SLOT_SELECT' || this.state === 'SAVE_PROGRESS') {
        seg = this.findSegment(this.menuCameraZ);
        segPerSec = (this.state === 'MENU' ? 1100 : 850) / SEGMENT_LENGTH;
      } else if (this.player && (this.state === 'RACING' || this.state === 'COUNTDOWN')) {
        seg = this.findSegment(this.player.z);
        segPerSec = this.player.speed * 20 / SEGMENT_LENGTH;
      }
      if (seg) this.skyScroll += seg.curve * segPerSec * dt * SKY_PARALLAX_K;
    }

    renderSky(ctx, def) {
      if (!this.envCur) this.updateEnv(0.016);
      const E = this.envCur;
      if (!E) return;
      const css = E.css;
      const S = E.s;
      const isAttract = (this.state === 'MENU' || this.state === 'MODE_SELECT' || this.state === 'DIFFICULTY_SELECT' || this.state === 'TRACK_SELECT' || this.state === 'CAR_SELECT' || this.state === 'COLOR_SELECT' || this.state === 'RACE_SETUP');
      const camZ = isAttract ? this.menuCameraZ : (this.player ? this.wrapZ(this.player.z - PLAYER_Z_OFFSET) : 0);
      const baseSeg = this.findSegment(camZ);
      const curveShift = baseSeg.curve * 2.0;
      const horizonY = INTERNAL_HEIGHT / 2;
      const scroll = this.skyScroll;

      // Se a câmera estiver dentro do túnel, preenche o céu com a abóbada de rocha escura
      // evitando qualquer vazamento ou corte do céu externo no teto!
      if (baseSeg && !!baseSeg.tunnel) {
        const isStone = (baseSeg.tunnel === 'stone') || (def && def.theme === 'SERRA');
        const darkGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        darkGrad.addColorStop(0, isStone ? '#0D0907' : '#04070D');
        darkGrad.addColorStop(1, isStone ? '#1A1410' : '#0B111A');
        ctx.fillStyle = darkGrad;
        ctx.fillRect(-20, -20, INTERNAL_WIDTH + 40, horizonY + 20);
        return;
      }

      if (typeof MonumentArt !== 'undefined' && MonumentArt.renderSkyLandmark) {
        this.renderSkyBase(ctx, def, horizonY, E, S, curveShift);
        MonumentArt.renderSkyLandmark(ctx, def, scroll, curveShift, horizonY, E, S);
      } else if (def && def.id === 'serra') {
        this.renderSkySerra(ctx, def, scroll, curveShift, horizonY, E, S);
      } else if (def && def.id === 'noite') {
        this.renderSkyNoite(ctx, def, scroll, curveShift, horizonY, E, S);
      } else {
        this.renderSkyBrasil(ctx, def, scroll, curveShift, horizonY, E, S);
      }
    }

    renderSkyBase(ctx, def, horizonY, E, S, curveShift) {
      const nowSec = performance.now() * 0.003;
      const isNight = S.night > 0.28;
      const isDusk = S.dusk > 0.25;

      // 1. Céu dinâmico conforme E.css e E.s
      const grad = ctx.createLinearGradient(0, -20, 0, horizonY);
      grad.addColorStop(0, E.css.skyTop);
      grad.addColorStop(0.45, E.css.skyMid);
      grad.addColorStop(1.0, E.css.skyBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(-20, -20, INTERNAL_WIDTH + 40, horizonY + 20);

      if (isNight) {
        // Microestrelas cintilantes no céu noturno
        for (let s = 8; s < INTERNAL_WIDTH; s += 22) {
          const sx = (s * 19) % INTERNAL_WIDTH;
          const sy = (s * 11) % Math.floor(horizonY * 0.38);
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(nowSec + s));
          ctx.fillStyle = `rgba(240, 248, 255, ${tw.toFixed(2)})`;
          ctx.fillRect(sx, sy, (s % 3 === 0 ? 1.5 : 1), (s % 3 === 0 ? 1.5 : 1));
        }

        // Lua prateada
        const moonX = INTERNAL_WIDTH * 0.80 - curveShift * 0.3;
        const moonY = 24;
        const mGlow = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 28);
        mGlow.addColorStop(0, 'rgba(215, 238, 255, 0.45)');
        mGlow.addColorStop(1, 'rgba(180, 220, 255, 0)');
        ctx.fillStyle = mGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 11, 0, Math.PI * 2);
        ctx.fill();
      } else if (S.sun > 0.1) {
        // Sol diurno ou crepuscular sobre o circuito
        const sunX = INTERNAL_WIDTH * 0.72 - curveShift * 0.35;
        const sunY = S.sunY || (isDusk ? horizonY - 14 : 26);
        const sSize = S.sunSize || 1.0;
        const sGlow = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, 38 * sSize);
        sGlow.addColorStop(0, E.css.sunCore || '#FFFDE7');
        sGlow.addColorStop(0.4, E.css.sunGlow || '#FFEE58');
        sGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 38 * sSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 11 * sSize, 0, Math.PI * 2);
        ctx.fill();

        // Nuvens suaves
        ctx.fillStyle = isDusk ? 'rgba(255, 170, 80, 0.30)' : 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.ellipse(sunX - 45, sunY - 4, 34, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(sunX - 35, sunY - 8, 22, 9, 0, 0, Math.PI * 2);
        ctx.ellipse(sunX + 50, sunY + 6, 42, 7, 0, 0, Math.PI * 2);
        ctx.ellipse(sunX + 60, sunY + 3, 26, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // =========================================================================
    // PISTA 1: BRASIL GP — ORLA COSTEIRA AO PÔR DO SOL (ESTILO EXATO DA IMAGEM!)
    // Céu crepúsculo 4 cores, estrelas, ponte pênsil iluminada, metrópole na baía com reflexos na água e montanhas roxas
    // =========================================================================
    renderSkyBrasil(ctx, def, scroll, curveShift, horizonY, E, S) {
      const nowSec = performance.now() * 0.003;
      const isNight = S.night > 0.28;
      const isDusk = S.dusk > 0.25;

      // 1. Céu dinâmico conforme E.css e E.s
      const grad = ctx.createLinearGradient(0, -20, 0, horizonY);
      grad.addColorStop(0, E.css.skyTop);
      grad.addColorStop(0.45, E.css.skyMid);
      grad.addColorStop(1.0, E.css.skyBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(-20, -20, INTERNAL_WIDTH + 40, horizonY + 20);

      if (isNight) {
        // Microestrelas cintilantes no céu noturno
        for (let s = 8; s < INTERNAL_WIDTH; s += 22) {
          const sx = (s * 19) % INTERNAL_WIDTH;
          const sy = (s * 11) % Math.floor(horizonY * 0.38);
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(nowSec + s));
          ctx.fillStyle = `rgba(240, 248, 255, ${tw.toFixed(2)})`;
          ctx.fillRect(sx, sy, (s % 3 === 0 ? 1.5 : 1), (s % 3 === 0 ? 1.5 : 1));
        }

        // Lua prateada
        const moonX = INTERNAL_WIDTH * 0.80 - curveShift * 0.3;
        const moonY = 24;
        const mGlow = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 28);
        mGlow.addColorStop(0, 'rgba(215, 238, 255, 0.45)');
        mGlow.addColorStop(1, 'rgba(180, 220, 255, 0)');
        ctx.fillStyle = mGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 11, 0, Math.PI * 2);
        ctx.fill();
      } else if (S.sun > 0.1) {
        // Sol diurno ou crepuscular sobre a orla
        const sunX = INTERNAL_WIDTH * 0.72 - curveShift * 0.35;
        const sunY = S.sunY || (isDusk ? horizonY - 14 : 26);
        const sSize = S.sunSize || 1.0;
        const sGlow = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, 38 * sSize);
        sGlow.addColorStop(0, E.css.sunCore || '#FFFDE7');
        sGlow.addColorStop(0.4, E.css.sunGlow || '#FFEE58');
        sGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 38 * sSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 11 * sSize, 0, Math.PI * 2);
        ctx.fill();

        // Nuvens suaves
        ctx.fillStyle = isDusk ? 'rgba(255, 170, 80, 0.30)' : 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.ellipse(sunX - 45, sunY - 4, 34, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(sunX - 35, sunY - 8, 22, 9, 0, 0, Math.PI * 2);
        ctx.ellipse(sunX + 50, sunY + 6, 42, 7, 0, 0, Math.PI * 2);
        ctx.ellipse(sunX + 60, sunY + 3, 26, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // =========================================================================
      // CAMADA 1 (PARALLAX DISTANTE - FATOR 0.16): PONTE PÊNSIL, METRÓPOLE & BAÍA
      // =========================================================================
      const PW = 640;
      const farShift = ((scroll * 0.16 + curveShift * 0.3) % PW + PW) % PW;

      ctx.save();
      for (let tile = -1; tile <= 1; tile++) {
        const bx = tile * PW - farShift;
        if (bx + PW < -40 || bx > INTERNAL_WIDTH + 40) continue;

        // --- A. PONTE PÊNSIL (à esquerda da baía, bx + 30 até bx + 225) ---
        const bBridgeStart = bx + 30;
        const bBridgeEnd = bx + 225;
        const t1X = bx + 85;
        const t2X = bx + 170;
        const towerTopY = horizonY - 54;
        const deckY = horizonY - 18;

        // Duas torres de suspensão com treliças
        const drawTower = (tx) => {
          ctx.fillStyle = isNight ? '#2A1820' : (isDusk ? '#6E1C27' : '#D32F2F');
          ctx.fillRect(tx - 3, towerTopY, 6, deckY - towerTopY + 4);
          ctx.fillStyle = isNight ? '#44222E' : (isDusk ? '#8B2635' : '#EF5350');
          ctx.fillRect(tx - 1.5, towerTopY, 3, deckY - towerTopY + 4);
          // Travessas horizontais da torre
          ctx.fillStyle = isNight ? '#1A0E14' : (isDusk ? '#4A121A' : '#B71C1C');
          ctx.fillRect(tx - 4, towerTopY + 12, 8, 2);
          ctx.fillRect(tx - 4, towerTopY + 24, 8, 2);
          ctx.fillRect(tx - 4, towerTopY + 34, 8, 2);
          // Luz de topo
          ctx.fillStyle = isNight ? '#FFE082' : (isDusk ? '#FFE082' : '#FFF9C4');
          ctx.fillRect(tx - 1, towerTopY - 2, 2, 2);
        };
        drawTower(t1X);
        drawTower(t2X);

        // Cabo mestre de sustentação (catenária)
        ctx.strokeStyle = isNight ? '#351820' : (isDusk ? '#5A1822' : '#B71C1C');
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bBridgeStart, deckY);
        ctx.lineTo(t1X, towerTopY);
        ctx.quadraticCurveTo((t1X + t2X) * 0.5, deckY - 6, t2X, towerTopY);
        ctx.lineTo(bBridgeEnd, deckY);
        ctx.stroke();

        // Tirantes verticais
        ctx.strokeStyle = isNight ? 'rgba(230, 180, 170, 0.25)' : (isDusk ? 'rgba(230, 180, 170, 0.45)' : 'rgba(255, 255, 255, 0.65)');
        ctx.lineWidth = 0.8;
        for (let hx = bBridgeStart + 6; hx < bBridgeEnd; hx += 7) {
          let topWireY = deckY;
          if (hx < t1X) {
            topWireY = deckY + (towerTopY - deckY) * ((hx - bBridgeStart) / (t1X - bBridgeStart));
          } else if (hx < t2X) {
            const f = (hx - t1X) / (t2X - t1X);
            topWireY = towerTopY + (deckY - 6 - towerTopY) * 4 * f * (1 - f);
          } else {
            topWireY = towerTopY + (deckY - towerTopY) * ((hx - t2X) / (bBridgeEnd - t2X));
          }
          ctx.beginPath();
          ctx.moveTo(hx, topWireY);
          ctx.lineTo(hx, deckY);
          ctx.stroke();
        }

        // Tabuleiro da ponte e tráfego iluminado
        ctx.fillStyle = isNight ? '#161324' : (isDusk ? '#3A141A' : '#37474F');
        ctx.fillRect(bBridgeStart - 5, deckY, (bBridgeEnd - bBridgeStart) + 10, 3);
        ctx.fillStyle = isNight ? '#FFE082' : (isDusk ? '#FFD166' : '#ECEFF1');
        for (let tx = bBridgeStart; tx < bBridgeEnd; tx += 9) {
          ctx.fillRect(tx, deckY + 0.5, 2, 1);
        }

        // --- B. METRÓPOLE DE ARRANHA-CÉUS (bx + 210 até bx + 630) ---
        const bldgs = [
          { x: 215, w: 16, h: 42, style: 'spire' },
          { x: 233, w: 14, h: 32, style: 'flat' },
          { x: 249, w: 22, h: 56, style: 'stepped' },
          { x: 273, w: 18, h: 38, style: 'flat' },
          { x: 293, w: 15, h: 48, style: 'spire' },
          { x: 310, w: 20, h: 62, style: 'sloped' },
          { x: 332, w: 17, h: 36, style: 'flat' },
          { x: 351, w: 26, h: 68, style: 'spire' }, // Edifício mais alto estilo Willis / Empire
          { x: 379, w: 19, h: 44, style: 'stepped' },
          { x: 400, w: 16, h: 52, style: 'flat' },
          { x: 418, w: 24, h: 64, style: 'spire' },
          { x: 444, w: 17, h: 40, style: 'sloped' },
          { x: 463, w: 22, h: 58, style: 'stepped' },
          { x: 487, w: 18, h: 46, style: 'flat' },
          { x: 507, w: 15, h: 38, style: 'spire' },
          { x: 524, w: 24, h: 60, style: 'sloped' },
          { x: 550, w: 18, h: 48, style: 'stepped' },
          { x: 570, w: 22, h: 54, style: 'spire' },
          { x: 594, w: 16, h: 36, style: 'flat' },
          { x: 612, w: 18, h: 42, style: 'flat' }
        ];

        for (let b = 0; b < bldgs.length; b++) {
          const bd = bldgs[b];
          const bX = bx + bd.x;
          const bY = horizonY - 12 - bd.h;
          const bW = bd.w;
          const bH = bd.h;

          // Silhueta do prédio adaptativa
          if (isNight) {
            ctx.fillStyle = (b % 2 === 0) ? '#1E1A38' : '#2A234A';
          } else if (isDusk) {
            ctx.fillStyle = (b % 2 === 0) ? '#2B1E32' : '#3E2A48';
          } else {
            ctx.fillStyle = (b % 2 === 0) ? '#2B3D52' : '#394E66';
          }
          ctx.fillRect(bX, bY, bW, bH);
          ctx.fillStyle = isNight ? '#15122B' : (isDusk ? '#1D1424' : '#1F2C3B');
          ctx.fillRect(bX + bW - 2, bY, 2, bH);

          // Topos estilizados
          if (bd.style === 'spire') {
            ctx.fillStyle = isNight ? '#15122B' : '#1F2C3B';
            ctx.fillRect(bX + bW * 0.5 - 1, bY - 10, 2, 10);
            const beaconLit = (Math.sin(nowSec * 7 + b) > 0);
            ctx.fillStyle = beaconLit ? '#FF1744' : '#5A1122';
            ctx.fillRect(bX + bW * 0.5 - 1, bY - 11, 2, 2);
          } else if (bd.style === 'stepped') {
            ctx.fillStyle = isNight ? '#2A234A' : '#394E66';
            ctx.fillRect(bX + 3, bY - 4, bW - 6, 4);
          } else if (bd.style === 'sloped') {
            ctx.fillStyle = isNight ? '#2A234A' : '#394E66';
            ctx.beginPath();
            ctx.moveTo(bX, bY);
            ctx.lineTo(bX + bW, bY - 5);
            ctx.lineTo(bX + bW, bY);
            ctx.closePath();
            ctx.fill();
          }

          // Janelas iluminadas (amarelo quente, âmbar e ciano) ou reflexos diurnos
          for (let wy = bY + 4; wy < horizonY - 16; wy += 4) {
            for (let wx = bX + 2; wx < bX + bW - 3; wx += 4) {
              const seed = (wx * 13 + wy * 17 + b * 23);
              if (seed % 3 !== 0) {
                if (isNight || isDusk) {
                  const isCyan = (seed % 7 === 0);
                  const isAmber = (seed % 5 === 0);
                  ctx.fillStyle = isCyan ? '#80DEEA' : (isAmber ? '#FFB74D' : '#FFE082');
                } else {
                  ctx.fillStyle = (seed % 4 === 0) ? '#B2EBF2' : '#E0F7FA';
                }
                ctx.fillRect(wx, wy, 2, 2);
              }
            }
          }
        }

        // --- C. ÁGUA DA BAÍA COM REFLEXOS CINTILANTES (horizonY - 12 até horizonY) ---
        ctx.fillStyle = isNight ? '#0C1322' : (isDusk ? '#241F44' : '#1976D2');
        ctx.fillRect(bx, horizonY - 12, PW, 12);

        // Ondas de reflexo
        for (let rx = bx + 20; rx < bx + PW - 10; rx += 7) {
          const wavePhase = Math.sin(nowSec * 4 + rx * 0.12);
          const rw = 5 + Math.abs(wavePhase) * 4;
          const ry = horizonY - 10 + ((rx * 7) % 9);
          if (isNight) {
            ctx.fillStyle = '#38BDF8';
          } else if (isDusk) {
            ctx.fillStyle = (rx % 2 === 0) ? '#E77A42' : '#F4A258';
          } else {
            ctx.fillStyle = (rx % 2 === 0) ? '#64B5F6' : '#90CAF9';
          }
          ctx.fillRect(rx + wavePhase * 1.5, ry, rw, 1);
        }
      }
      ctx.restore();

      // =========================================================================
      // CAMADA 2 (PARALLAX MÉDIO - FATOR 0.38): CORDILHEIRA DE MONTANHAS
      // =========================================================================
      const midShift = ((scroll * 0.38 + curveShift * 0.6) % 640 + 640) % 640;
      ctx.fillStyle = isNight ? '#0B101E' : (isDusk ? '#1C1635' : '#1B5E20');
      ctx.beginPath();
      ctx.moveTo(-20, horizonY);
      for (let x = -40; x <= INTERNAL_WIDTH + 40; x += 14) {
        const mx = x + midShift;
        const peak = Math.sin(mx * 0.016) * 18 + Math.cos(mx * 0.038) * 8 + 12;
        ctx.lineTo(x, horizonY - peak);
      }
      ctx.lineTo(INTERNAL_WIDTH + 20, horizonY);
      ctx.closePath();
      ctx.fill();

      // Encostas frontais sombreadas
      ctx.fillStyle = isNight ? '#11182B' : (isDusk ? '#2A2046' : '#2E7D32');
      ctx.beginPath();
      ctx.moveTo(-20, horizonY);
      for (let x = -40; x <= INTERNAL_WIDTH + 40; x += 14) {
        const mx = x + midShift;
        const peak = Math.sin(mx * 0.016 + 1.2) * 12 + 8;
        ctx.lineTo(x, horizonY - peak);
      }
      ctx.lineTo(INTERNAL_WIDTH + 20, horizonY);
      ctx.closePath();
      ctx.fill();

      // =========================================================================
      // CAMADA 3 (PARALLAX PRÓXIMO - FATOR 0.68): LINHA DE PALMEIRAS E VEGETAÇÃO
      // =========================================================================
      const nearShift = ((scroll * 0.68 + curveShift * 0.9) % 480 + 480) % 480;
      ctx.fillStyle = isNight ? '#060A14' : (isDusk ? '#0C1613' : '#0D3315');
      ctx.beginPath();
      ctx.moveTo(-20, horizonY);
      for (let x = -30; x <= INTERNAL_WIDTH + 30; x += 8) {
        const nx = x + nearShift;
        const bump = Math.cos(nx * 0.045) * 5 + Math.sin(nx * 0.12) * 3 + 6;
        ctx.lineTo(x, horizonY - bump);
      }
      ctx.lineTo(INTERNAL_WIDTH + 20, horizonY);
      ctx.closePath();
      ctx.fill();
    }

    // =========================================================================
    // PISTA 2: SERRA BRASILEIRA — PICOS ALPINOS E FLORESTA DE ARAUCÁRIAS
    // Adaptável ao clima: dia azul, pôr do sol dourado ou noite estrelada
    // =========================================================================
    renderSkySerra(ctx, def, scroll, curveShift, horizonY, E, S) {
      const nowSec = performance.now() * 0.003;
      const isNight = S.night > 0.28;
      const isDusk = S.dusk > 0.25;

      // 1. Céu dinâmico conforme E.css e E.s
      const grad = ctx.createLinearGradient(0, -20, 0, horizonY);
      grad.addColorStop(0, E.css.skyTop);
      grad.addColorStop(0.45, E.css.skyMid);
      grad.addColorStop(1.0, E.css.skyBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(-20, -20, INTERNAL_WIDTH + 40, horizonY + 20);

      // Sol ou Lua conforme clima/horário
      if (isNight) {
        // Microestrelas cintilantes no céu límpido de serra
        for (let s = 10; s < INTERNAL_WIDTH; s += 24) {
          const sx = (s * 17) % INTERNAL_WIDTH;
          const sy = (s * 9) % Math.floor(horizonY * 0.40);
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(nowSec + s));
          ctx.fillStyle = `rgba(240, 248, 255, ${tw.toFixed(2)})`;
          ctx.fillRect(sx, sy, 1.2, 1.2);
        }
        // Lua cheia de serra com halo prateado
        const moonX = INTERNAL_WIDTH * 0.74 - curveShift * 0.3;
        const moonY = 24;
        const mGlow = ctx.createRadialGradient(moonX, moonY, 3, moonX, moonY, 32);
        mGlow.addColorStop(0, 'rgba(215, 238, 255, 0.45)');
        mGlow.addColorStop(1, 'rgba(180, 220, 255, 0)');
        ctx.fillStyle = mGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#CBD5E1';
        ctx.beginPath();
        ctx.arc(moonX - 3.5, moonY - 3, 2.5, 0, Math.PI * 2);
        ctx.arc(moonX + 3.0, moonY + 4, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (S.sun > 0.1) {
        // Sol diurno ou poente
        const sunX = INTERNAL_WIDTH * 0.72 - curveShift * 0.35;
        const sunY = S.sunY || (isDusk ? horizonY - 14 : 26);
        const sSize = S.sunSize || 1.0;
        const sGlow = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, 44 * sSize);
        sGlow.addColorStop(0, E.css.sunCore || 'rgba(255, 246, 208, 0.95)');
        sGlow.addColorStop(0.35, E.css.sunGlow || 'rgba(255, 123, 37, 0.40)');
        sGlow.addColorStop(1, 'rgba(255, 80, 20, 0)');
        ctx.fillStyle = sGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 44 * sSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isDusk ? '#FFF8E1' : '#FFFFFF';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 13 * sSize, 0, Math.PI * 2);
        ctx.fill();

        // Nuvens horizontais de serra
        ctx.fillStyle = isDusk ? 'rgba(255, 170, 80, 0.32)' : 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.ellipse(sunX - 35, sunY + 4, 42, 4.5, 0, 0, Math.PI * 2);
        ctx.ellipse(sunX + 32, sunY - 2, 46, 4.0, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Paletas das montanhas conforme clima/horário
      const farPeakCol = isNight ? '#161324' : (isDusk ? '#38131E' : '#2A4B58');
      const ridgeCol   = isNight ? '#251E36' : (isDusk ? '#7D2E42' : '#467182');
      const slopeCol   = isNight ? '#121C18' : (isDusk ? '#251A24' : '#1D5A3A');
      const pineCol    = isNight ? '#0A120E' : (isDusk ? '#121C16' : '#133D24');

      // Camada 1: Picos escarpados e agulhas de pedra (Parallax Lento 0.16)
      const farShift = ((scroll * 0.16 + curveShift * 0.3) % 640 + 640) % 640;
      ctx.fillStyle = farPeakCol;
      ctx.beginPath();
      ctx.moveTo(-20, horizonY);
      for (let x = -40; x <= INTERNAL_WIDTH + 40; x += 16) {
        const fx = x + farShift;
        const peak = Math.abs(Math.sin(fx * 0.018)) * 34 + Math.sin(fx * 0.045) * 12 + 14;
        ctx.lineTo(x, horizonY - peak);
      }
      ctx.lineTo(INTERNAL_WIDTH + 20, horizonY);
      ctx.closePath();
      ctx.fill();

      // Cristas rochosas iluminadas
      ctx.fillStyle = ridgeCol;
      ctx.beginPath();
      ctx.moveTo(-20, horizonY);
      for (let x = -40; x <= INTERNAL_WIDTH + 40; x += 16) {
        const fx = x + farShift;
        const peak = Math.abs(Math.sin(fx * 0.018 + 0.3)) * 22 + 10;
        ctx.lineTo(x, horizonY - peak);
      }
      ctx.lineTo(INTERNAL_WIDTH + 20, horizonY);
      ctx.closePath();
      ctx.fill();

      // Camada 2: Encostas florestadas de pinhais (Parallax Médio 0.40)
      const midShift = ((scroll * 0.40 + curveShift * 0.6) % 540 + 540) % 540;
      ctx.fillStyle = slopeCol;
      ctx.beginPath();
      ctx.moveTo(-20, horizonY);
      for (let x = -30; x <= INTERNAL_WIDTH + 30; x += 12) {
        const mx = x + midShift;
        const ridge = Math.cos(mx * 0.032) * 14 + 11;
        ctx.lineTo(x, horizonY - ridge);
      }
      ctx.lineTo(INTERNAL_WIDTH + 20, horizonY);
      ctx.closePath();
      ctx.fill();

      // Camada 3: Silhuetas de Araucárias e Pinheiros no horizonte (Parallax Próximo 0.70)
      const nearShift = ((scroll * 0.70 + curveShift * 0.9) % 480 + 480) % 480;
      ctx.fillStyle = pineCol;
      ctx.beginPath();
      ctx.moveTo(-20, horizonY);
      for (let x = -20; x <= INTERNAL_WIDTH + 20; x += 6) {
        const nx = x + nearShift;
        const isAraucaria = (Math.floor(nx / 16) % 3 === 0);
        const h = isAraucaria ? (12 + (nx % 5)) : (6 + (nx % 3));
        ctx.lineTo(x, horizonY - h);
      }
      ctx.lineTo(INTERNAL_WIDTH + 20, horizonY);
      ctx.closePath();
      ctx.fill();
    }

    // =========================================================================
    // PISTA 3: CIDADE METRÓPOLE — ARRANHA-CÉUS MODERNOS E VIADUTOS EXPRESSOS
    // Totalmente adaptável ao clima: dia ensolarado, crepúsculo ou noite iluminada
    // =========================================================================
    renderSkyNoite(ctx, def, scroll, curveShift, horizonY, E, S) {
      const nowSec = performance.now() * 0.003;
      const isNight = S.night > 0.28;
      const isDusk = S.dusk > 0.25;

      // 1. Céu dinâmico conforme E.css e E.s
      const grad = ctx.createLinearGradient(0, -20, 0, horizonY);
      grad.addColorStop(0, E.css.skyTop);
      grad.addColorStop(0.45, E.css.skyMid);
      grad.addColorStop(1.0, E.css.skyBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(-20, -20, INTERNAL_WIDTH + 40, horizonY + 20);

      // Elementos celestes: Sol ou Lua
      if (isNight) {
        // Céu estrelado
        for (let s = 10; s < INTERNAL_WIDTH; s += 20) {
          const sx = (s * 17) % INTERNAL_WIDTH;
          const sy = (s * 9) % Math.floor(horizonY * 0.42);
          const tw = 0.45 + 0.55 * Math.abs(Math.sin(nowSec * 1.5 + s));
          ctx.fillStyle = `rgba(220, 240, 255, ${tw.toFixed(2)})`;
          ctx.fillRect(sx, sy, 1.2, 1.2);
        }

        // Lua prateada com halo
        const moonX = INTERNAL_WIDTH * 0.82 - curveShift * 0.3;
        const moonY = 24;
        const mGlow = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 32);
        mGlow.addColorStop(0, 'rgba(215, 238, 255, 0.45)');
        mGlow.addColorStop(1, 'rgba(180, 220, 255, 0)');
        ctx.fillStyle = mGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#CBD5E1';
        ctx.beginPath();
        ctx.arc(moonX - 3.5, moonY - 3, 2.5, 0, Math.PI * 2);
        ctx.arc(moonX + 3.0, moonY + 4, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (S.sun > 0.1) {
        // Sol de metrópole e nuvens
        const sunX = INTERNAL_WIDTH * 0.75 - curveShift * 0.32;
        const sunY = S.sunY || (isDusk ? horizonY - 14 : 26);
        const sSize = S.sunSize || 1.0;
        const sGlow = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, 42 * sSize);
        sGlow.addColorStop(0, E.css.sunCore || '#FFFDE7');
        sGlow.addColorStop(0.4, E.css.sunGlow || '#FFEE58');
        sGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 42 * sSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 12 * sSize, 0, Math.PI * 2);
        ctx.fill();

        // Nuvens urbanas suaves
        ctx.fillStyle = isDusk ? 'rgba(255, 170, 80, 0.30)' : 'rgba(255, 255, 255, 0.48)';
        ctx.beginPath();
        ctx.ellipse(sunX - 42, sunY - 4, 36, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(sunX - 32, sunY - 8, 22, 9, 0, 0, Math.PI * 2);
        ctx.ellipse(sunX + 48, sunY + 5, 40, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Megalópole com arranha-céus e viaduto expresso
      // Parallax Lento 0.16
      const PW = 640;
      const farShift = ((scroll * 0.16 + curveShift * 0.3) % PW + PW) % PW;

      ctx.save();
      for (let tile = -1; tile <= 1; tile++) {
        const bx = tile * PW - farShift;
        if (bx + PW < -40 || bx > INTERNAL_WIDTH + 40) continue;

        // Fileira de 26 arranha-céus futuristas
        for (let b = 0; b < 26; b++) {
          const bX = bx + b * 24;
          const seed = (b * 19) % 31;
          const bH = 36 + seed * 1.5;
          const bY = horizonY - bH;

          // Cores dos edifícios conforme dia/noite
          if (isNight) {
            ctx.fillStyle = (b % 2 === 0) ? '#0D1424' : '#141D34';
          } else if (isDusk) {
            ctx.fillStyle = (b % 2 === 0) ? '#2B1A28' : '#3E2436';
          } else {
            ctx.fillStyle = (b % 2 === 0) ? '#243B53' : '#334E68';
          }
          ctx.fillRect(bX, bY, 22, bH);

          // Sombra lateral/perspectiva
          ctx.fillStyle = isNight ? '#080C16' : (isDusk ? '#1A0F18' : '#102A43');
          ctx.fillRect(bX + 20, bY, 2, bH);

          // Faixas verticais decorativas / neon
          if (isNight) {
            if (b % 4 === 0) {
              ctx.fillStyle = '#FF007F';
              ctx.fillRect(bX + 2, bY + 2, 2, bH - 6);
            } else if (b % 4 === 2) {
              ctx.fillStyle = '#00F0FF';
              ctx.fillRect(bX + 18, bY + 2, 2, bH - 6);
            }
          } else if (!isNight && !isDusk) {
            // Vidros reflexivos diurnos
            if (b % 3 === 0) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
              ctx.fillRect(bX + 2, bY + 2, 3, bH - 4);
            }
          }

          // Janelas iluminadas (noturnas ou reflexivas diurnas)
          for (let wy = bY + 4; wy < horizonY - 10; wy += 4) {
            for (let wx = bX + 5; wx < bX + 18; wx += 4) {
              if ((wx * 11 + wy * 13 + b) % 3 !== 0) {
                if (isNight) {
                  ctx.fillStyle = (b % 3 === 0) ? '#00E5FF' : '#FFE082';
                } else if (isDusk) {
                  ctx.fillStyle = (b % 3 === 0) ? '#FF9E80' : '#FFE082';
                } else {
                  // Dia: reflexo suave das janelas de vidro
                  ctx.fillStyle = (b % 2 === 0) ? '#9FB3C8' : '#D9E2EC';
                }
                ctx.fillRect(wx, wy, 2, 2);
              }
            }
          }

          // Antena com sinalizador de topo
          if (b % 3 === 1) {
            ctx.fillStyle = isNight ? '#080C16' : '#627D98';
            ctx.fillRect(bX + 10, bY - 8, 2, 8);
            ctx.fillStyle = (Math.sin(nowSec * 8 + b) > 0) ? '#FF1744' : (isNight ? '#4A0D15' : '#D32F2F');
            ctx.fillRect(bX + 10, bY - 9, 2, 2);
          }
        }

        // Viaduto expresso no rodapé dos edifícios (conectado suavemente ao horizonte)
        const vY = horizonY - 8;
        ctx.fillStyle = isNight ? '#0B1120' : (isDusk ? '#201625' : '#1F2937');
        ctx.fillRect(bx, vY, PW, 8);
        ctx.fillStyle = isNight ? '#1E293B' : (isDusk ? '#3D2F44' : '#4B5563');
        ctx.fillRect(bx, vY, PW, 1.5); // Guarda-corpo superior

        // Fluxo contínuo de tráfego veicular sobre o viaduto
        for (let tx = bx; tx < bx + PW; tx += 14) {
          if (isNight || isDusk) {
            ctx.fillStyle = '#FF2D55'; // Lanternas vermelhas
            ctx.fillRect(tx, vY + 3, 3, 1.5);
            ctx.fillStyle = '#FFF9D2'; // Faróis brancos/dourados no fluxo oposto
            ctx.fillRect(tx + 7, vY + 3, 3, 1.5);
          } else {
            // Dia: pequenos carros em movimento no viaduto
            ctx.fillStyle = (tx % 3 === 0) ? '#DC2626' : ((tx % 3 === 1) ? '#2563EB' : '#F3F4F6');
            ctx.fillRect(tx, vY + 2, 4, 2);
          }
        }
      }
      ctx.restore();
    }

    // Efeitos de clima por cima de toda a cena (antes do HUD): luz, chuva, neve e brilho do sol
    renderWeatherFx(ctx) {
      const E = this.envCur;
      if (!E) return;
      const S = E.s;
      const W = INTERNAL_WIDTH;
      const H = INTERNAL_HEIGHT;
      const t = performance.now() / 1000;
      ctx.save();

      if (S.night > 0.02) {
        ctx.fillStyle = `rgba(6, 10, 40, ${(0.30 * S.night).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (S.dusk > 0.02) {
        ctx.fillStyle = `rgba(255, 110, 30, ${(0.09 * S.dusk).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (S.rain > 0.02) {
        ctx.fillStyle = `rgba(30, 42, 58, ${(0.20 * S.rain).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
        const n = Math.floor(120 * S.rain);
        ctx.strokeStyle = `rgba(205, 225, 245, ${(0.50 * S.rain).toFixed(2)})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = ((i * 53.13 + t * 95) % (W + 40)) - 20;
          const y = ((i * 97.37 + t * (430 + (i % 5) * 45)) % (H + 30)) - 15;
          ctx.moveTo(x, y);
          ctx.lineTo(x - 2.6, y + 10.5);
        }
        ctx.stroke();
      }
      if (S.snow > 0.02) {
        ctx.fillStyle = `rgba(235, 242, 255, ${(0.10 * S.snow).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
        const n = Math.floor(95 * S.snow);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        for (let i = 0; i < n; i++) {
          const x = ((i * 61.7 + t * 14 + Math.sin(t * 0.9 + i) * 9) % (W + 20) + (W + 20)) % (W + 20) - 10;
          const y = ((i * 83.3 + t * (32 + (i % 4) * 11)) % (H + 10)) - 5;
          ctx.beginPath();
          ctx.arc(x, y, 0.7 + (i % 3) * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (S.glare > 0.02 && S.sun > 0.1) {
        const gx = W * 0.74;
        const gy = S.sunY;
        const gg = ctx.createRadialGradient(gx, gy, 6, gx, gy, 170);
        gg.addColorStop(0, `rgba(255, 246, 200, ${(0.30 * S.glare * S.sun).toFixed(3)})`);
        gg.addColorStop(1, 'rgba(255, 246, 200, 0)');
        ctx.fillStyle = gg;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(255, 238, 175, ${(0.05 * S.glare).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }


    renderRoad(ctx, def) {
      const isAttract = (this.state === 'MENU' || this.state === 'MODE_SELECT' || this.state === 'DIFFICULTY_SELECT' || this.state === 'TRACK_SELECT' || this.state === 'CAR_SELECT' || this.state === 'COLOR_SELECT');
      const p = isAttract ? { z: this.menuCameraZ, x: 0 } : (this.player || { z: 1600, x: 0 });
      const playerZ = this.wrapZ(p.z);
      // Quando o nosso carro bandeirou, a câmera PARA exatamente no local da bandeirada:
      const camOriginZ = this.finishingRace
        ? this.finishCamOriginZ
        : (isAttract ? playerZ : this.wrapZ(playerZ - PLAYER_Z_OFFSET));

      const baseSegment = this.findSegment(camOriginZ);
      const basePercent = (camOriginZ % SEGMENT_LENGTH) / SEGMENT_LENGTH;

      const refSeg = this.findSegment(playerZ);
      const refPercent = (playerZ % SEGMENT_LENGTH) / SEGMENT_LENGTH;
      const playerWorldY = (1 - refPercent) * refSeg.p1.world.y + refPercent * refSeg.p2.world.y;

      let dx = -(baseSegment.curve * basePercent);
      let x = 0;
      let maxY = INTERNAL_HEIGHT;
      if (!this.foregroundBots) this.foregroundBots = [];
      else this.foregroundBots.length = 0;

      const totalSegs = this.track.segments.length;
      for (let n = 0; n < DRAW_DISTANCE; n++) {
        const seg = this.track.segments[(baseSegment.index + n) % totalSegs];
        if (!seg.cars) seg.cars = [];
        else seg.cars.length = 0;
        seg.clipY = INTERNAL_HEIGHT;
      }

      if (!isAttract) {
        for (let i = 0; i < this.cars.length; i++) {
          const car = this.cars[i];
          if (car.isPlayer) continue;

          const carZ = this.wrapZ(car.z);
          const relCamZ = (carZ >= camOriginZ) ? (carZ - camOriginZ) : (this.track.totalLength - camOriginZ + carZ);
          if (relCamZ >= 150 && relCamZ < DRAW_DISTANCE * SEGMENT_LENGTH) {
            const carSeg = this.findSegment(carZ);
            car.renderRelCamZ = relCamZ;
            car.renderPct = (carZ % SEGMENT_LENGTH) / SEGMENT_LENGTH;
            if (!carSeg.cars) carSeg.cars = [];
            carSeg.cars.push(car);
          }
        }
      }

      const spd = (!isAttract && this.player) ? this.player.speed : 0;
      const normalMax = this.getEffectiveMaxSpeed(this.player);
      const overspeedRatio = Math.max(0, (spd - normalMax) / 70);
      const spdFactor = Math.min(1.0, (spd / normalMax) * 0.70 + overspeedRatio * 0.30);
      // Sensação de velocidade: FOV dinâmico suave mantendo a altura da pista e horizonte equilibrados
      this.currentCameraDepth = CAMERA_DEPTH * (1.0 - spdFactor * 0.12);
      const camH = CAMERA_HEIGHT * (1.0 - spdFactor * 0.04);

      const cameraX = this.finishingRace ? this.finishCameraX : (p.x * ROAD_WIDTH * 0.65);
      const cameraY = this.finishingRace ? this.finishCameraY : (camH + playerWorldY);
      for (let n = 0; n < DRAW_DISTANCE; n++) {
        const segment = this.track.segments[(baseSegment.index + n) % totalSegs];
        const looped = segment.index < baseSegment.index;
        const cameraZ = camOriginZ - (looped ? this.track.totalLength : 0);

        this.project(segment.p1, cameraX - x, cameraY, cameraZ);
        x += dx;
        dx += segment.curve;
        this.project(segment.p2, cameraX - x, cameraY, cameraZ);

        segment.clipY = maxY;
        if ((segment.p1.camera.z <= CAMERA_DEPTH) || (segment.p2.screen.y >= maxY)) {
          continue;
        }

        this.renderSegment(ctx, segment, maxY);
        maxY = segment.p2.screen.y;
      }

      if (this.webgl && this.webgl.available) {
        this.webgl.flushColor();
      }

      // Interpolação 3D exata em perspectiva (elimina 100% da oscilação/lag entre segmentos!)
      if (!isAttract && refSeg.p1.camera && refSeg.p2.camera) {
        const pRoad = this.projectInterpolated(refSeg, refPercent);
        const neutralX = (INTERNAL_WIDTH / 2) - (pRoad.w * 0.65 * p.x);
        const rawCurveShift = pRoad.x - neutralX;
        this.smoothCurveScreenX += (rawCurveShift - this.smoothCurveScreenX) * 0.35;
        this.smoothRoadY += (pRoad.y - this.smoothRoadY) * 0.45;

        // Avanço suave na aceleração mantendo um espaço agradável entre o para-choque e a margem inferior da tela
        const speedAdvance = Math.min(6, (spd / normalMax) * 4.5 + overspeedRatio * 2.5);
        this.playerRenderPos = {
          x: neutralX + this.smoothCurveScreenX + pRoad.w * p.x,
          y: this.smoothRoadY - 18 - speedAdvance
        };
      }

      const inTunnel = (refSeg && !!refSeg.tunnel);
      const nightIntensity = inTunnel ? 1.0 : (this.envCur ? (this.envCur.s.night || 0) : 0);
      const isNight = nightIntensity > 0.28;
      const isDusk = this.envCur ? ((this.envCur.s.dusk || 0) > 0.22) : false;
      const isDark = isNight || isDusk || inTunnel || (def && (def.theme === 'NOITE' || def.theme === 'TARDE'));
      for (let n = DRAW_DISTANCE - 1; n >= 0; n--) {
        const segment = this.track.segments[(baseSegment.index + n) % totalSegs];
        if (segment.p1.camera.z <= CAMERA_DEPTH) continue;

        if (segment.index === START_LINE_SEG && segment.p1.screen.y <= segment.clipY + 4) {
          this.renderFinishArch(ctx, segment);
        }

        if (segment.tunnelPortal && segment.p1.screen.y <= segment.clipY + 8) {
          this.renderTunnelPortal(ctx, segment, def);
        }

        if (segment.overheadBridge && segment.p1.screen.y <= segment.clipY + 8) {
          this.renderOverheadBridge(ctx, segment, def);
        }

        if (segment.scenery && segment.p1.screen.y <= segment.clipY + 2) {
          if (Array.isArray(segment.scenery)) {
            for (let sc = 0; sc < segment.scenery.length; sc++) {
              this.renderScenery(ctx, segment, segment.scenery[sc], def);
            }
          } else {
            this.renderScenery(ctx, segment, segment.scenery, def);
          }
        }

        if (segment.cars && segment.cars.length > 0) {
          if (segment.cars.length > 1) {
            segment.cars.sort((a, b) => b.renderRelCamZ - a.renderRelCamZ);
          }

          for (let c = 0; c < segment.cars.length; c++) {
            const bot = segment.cars[c];
            const cRoad = this.projectInterpolated(segment, bot.renderPct);
            const cRoadX = cRoad.x;
            const cRoadY = cRoad.y;
            const cRoadW = cRoad.w;

            if (cRoadY > segment.clipY + 12) continue;

            const distScale = PLAYER_Z_OFFSET / Math.max(1, bot.renderRelCamZ);
            const carW = PLAYER_CAR_W * distScale;
            const carH = PLAYER_CAR_H * distScale;
            const carX = cRoadX + cRoadW * bot.x;
            const carY = cRoadY - carH * (24 / 68);

            if (carW > 3.5 && carH > 2.5) {
              if (bot.renderRelCamZ < PLAYER_Z_OFFSET) {
                this.foregroundBots.push({ bot, x: carX, y: carY, w: carW, h: carH });
              } else {
                const needClip = cRoadY > segment.clipY;
                if (needClip) {
                  ctx.save();
                  ctx.beginPath();
                  ctx.rect(0, 0, INTERNAL_WIDTH, segment.clipY);
                  ctx.clip();
                }
                if (isNight && carW > 10) {
                  this.renderBotHeadlightBeams(ctx, carX, carY, carW, carH, bot.steerAngle || 0, nightIntensity);
                }
                bot.model.render(
                  ctx,
                  carX,
                  carY,
                  carW,
                  carH,
                  bot.isBraking,
                  bot.steerAngle || 0,
                  bot.bodyColor,
                  {
                    isNitro: !!bot.isNitro,
                    wheelPhase: bot.z * 0.035,
                    isNight: isDark,
                    speed: bot.speed
                  }
                );
                if (carW >= 14 && bot.driverCode) {
                  this.renderDriverBadge(ctx, bot.driverCode, carX, carY - carH * 0.44, carW);
                }
                if (needClip) ctx.restore();
              }
            }
          }
        }
      }
    }

    renderFinishArch(ctx, segment) {
      const p1 = segment.p1.screen;
      if (p1.w < 12 || p1.y <= INTERNAL_HEIGHT / 2) return;
      const archH = p1.w * 0.52;
      const postW = Math.max(2, p1.w * 0.07);
      const bannerH = Math.max(4, p1.w * 0.14);
      const leftX = p1.x - p1.w * 1.06;
      const rightX = p1.x + p1.w * 1.06;
      const topY = p1.y - archH;

      ctx.save();
      // Colunas metálicas laterais
      ctx.fillStyle = '#2C3E50';
      ctx.fillRect(leftX - postW, topY, postW, archH);
      ctx.fillRect(rightX, topY, postW, archH);
      ctx.fillStyle = '#95A5A6';
      ctx.fillRect(leftX - postW * 0.7, topY, postW * 0.35, archH);
      ctx.fillRect(rightX + postW * 0.35, topY, postW * 0.35, archH);

      // Pórtico superior
      const spanW = (rightX + postW) - (leftX - postW);
      ctx.fillStyle = '#111622';
      ctx.fillRect(leftX - postW, topY, spanW, bannerH);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = Math.max(1, p1.w * 0.012);
      ctx.strokeRect(leftX - postW, topY, spanW, bannerH);

      // Quadriculado lateral no pórtico
      const chkW = Math.max(2, bannerH * 0.5);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          ctx.fillStyle = ((r + c) % 2 === 0) ? '#FFF' : '#111';
          ctx.fillRect(leftX - postW + 2 + c * chkW, topY + r * (bannerH / 2), chkW, bannerH / 2);
          ctx.fillRect(rightX + postW - 2 - (c + 1) * chkW, topY + r * (bannerH / 2), chkW, bannerH / 2);
        }
      }

      if (p1.w > 34) {
        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${Math.max(5, Math.floor(bannerH * 0.62))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('LH44 GRAND PRIX', p1.x, topY + bannerH * 0.73);
      }
      ctx.restore();
    }

    renderTunnelPortal(ctx, segment, def) {
      const p1 = segment.p1.screen;
      if (p1.w < 8) return;
      const isStone = (segment.tunnel === 'stone') || (def && def.theme === 'SERRA');
      const portalH = p1.w * 0.95;
      const postW = Math.max(3.5, p1.w * 0.16);
      // wallDist = 1.38 posiciona os pilares fora da pista e da zebra (zebra termina em 1.17)
      const leftInner = p1.x - p1.w * 1.38;
      const rightInner = p1.x + p1.w * 1.38;
      const leftOuter = leftInner - postW;
      const rightOuter = rightInner + postW;
      const topY = p1.y - portalH;
      const bannerH = Math.max(5.5, p1.w * 0.22);

      ctx.save();
      // Parede de rocha da montanha acima do arco (veda o céu estritamente acima do pórtico, sem invadir a pista)
      const rockCol = isStone ? '#2E221B' : '#0B111E';
      if (topY > 0) {
        ctx.fillStyle = rockCol;
        ctx.fillRect(0, 0, INTERNAL_WIDTH, topY + 2);
      }

      // Pilares laterais do portal
      ctx.fillStyle = isStone ? '#3E2F26' : '#1E293B';
      ctx.fillRect(leftOuter, topY, postW, portalH);
      ctx.fillRect(rightInner, topY, postW, portalH);
      ctx.fillStyle = isStone ? '#5A463B' : '#334155';
      ctx.fillRect(leftOuter + postW * 0.3, topY, postW * 0.35, portalH);
      ctx.fillRect(rightInner + postW * 0.35, topY, postW * 0.35, portalH);

      // Arco superior
      const spanW = rightOuter - leftOuter;
      ctx.fillStyle = isStone ? '#2E221B' : '#0F172A';
      ctx.fillRect(leftOuter, topY, spanW, bannerH);
      ctx.strokeStyle = isStone ? '#8D6E63' : '#00E5FF';
      ctx.lineWidth = Math.max(1, p1.w * 0.015);
      ctx.strokeRect(leftOuter, topY, spanW, bannerH);

      // Placa de identificação no portal
      if (p1.w > 30) {
        ctx.fillStyle = isStone ? '#FFD54F' : '#00E5FF';
        ctx.font = `bold ${Math.max(5.5, Math.floor(bannerH * 0.52))}px monospace`;
        ctx.textAlign = 'center';
        const label = isStone ? '▲ TÚNEL DA SERRA ▲' : '⚡ METRO TUNNEL ⚡';
        ctx.fillText(label, p1.x, topY + bannerH * 0.68);
      }
      ctx.restore();
    }

    renderOverheadBridge(ctx, segment, def) {
      const p1 = segment.p1.screen;
      if (p1.w < 8) return;
      const archH = p1.w * 0.66;
      const postW = Math.max(2.5, p1.w * 0.08);
      const bannerH = Math.max(5, p1.w * 0.18);
      const leftX = p1.x - p1.w * 1.10;
      const rightX = p1.x + p1.w * 1.10;
      const topY = p1.y - archH;

      ctx.save();
      // Estrutura treliçada lateral
      ctx.fillStyle = '#334155';
      ctx.fillRect(leftX - postW, topY, postW, archH);
      ctx.fillRect(rightX, topY, postW, archH);
      ctx.fillStyle = '#64748B';
      ctx.fillRect(leftX - postW * 0.6, topY, postW * 0.3, archH);
      ctx.fillRect(rightX + postW * 0.3, topY, postW * 0.3, archH);

      // Passarela aérea superior
      const spanW = (rightX + postW) - (leftX - postW);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(leftX - postW, topY, spanW, bannerH);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = Math.max(1, p1.w * 0.012);
      ctx.strokeRect(leftX - postW, topY, spanW, bannerH);

      if (p1.w > 26) {
        const isBrasil = (!def || def.id === 'brasil');
        const isNoite = (def && def.id === 'noite');
        ctx.fillStyle = isBrasil ? '#FEDD00' : (isNoite ? '#00E5FF' : '#FFFFFF');
        ctx.font = `bold ${Math.max(5, Math.floor(bannerH * 0.58))}px monospace`;
        ctx.textAlign = 'center';
        const trackTitle = def ? (def.name || 'BRASIL GP') : 'BRASIL GP';
        const txt = isBrasil ? '★ LH44 BRASIL GP - INTERLAGOS ★' : (isNoite ? '★ CYBER CITY GP ★' : `★ GP ${trackTitle} ★`);
        ctx.fillText(txt, p1.x, topY + bannerH * 0.70);
      }
      ctx.restore();
    }

    renderSegment(ctx, segment, maxY) {
      const p1 = segment.p1.screen;
      const p2 = segment.p2.screen;
      const c = segment.color;

      const bottomY = Math.min(p1.y, maxY);
      if (p2.y >= bottomY) return;

      // Sobreposição vertical de subpixel entre trapézios adjacentes: elimina 100% de linhas e frestas na pista
      const segOverlap = 1.0;
      const topY = Math.max(0, p2.y - segOverlap);
      const segBottomY = Math.min(INTERNAL_HEIGHT, bottomY + 0.6);

      const r1 = p1.w / 6;
      const r2 = p2.w / 6;

      // Laterais: Túnel 3D, Ponte Suspensa ou Grama Natural
      if (segment.tunnel) {
        const isStone = (segment.tunnel === 'stone');
        const wallDist = 1.38; // Posicionado além da zebra (rumble = 1.17) para nunca cortar a pista
        const wallH1 = p1.w * 0.90;
        const wallH2 = p2.w * 0.90;
        const roofY1 = p1.y - wallH1;
        const roofY2 = p2.y - wallH2;

        const leftEdge1 = p1.x - p1.w - r1;
        const leftEdge2 = p2.x - p2.w - r2;
        const rightEdge1 = p1.x + p1.w + r1;
        const rightEdge2 = p2.x + p2.w + r2;

        const leftWall1 = p1.x - p1.w * wallDist;
        const leftWall2 = p2.x - p2.w * wallDist;
        const rightWall1 = p1.x + p1.w * wallDist;
        const rightWall2 = p2.x + p2.w * wallDist;

        const isLight = Math.floor(segment.index / 3) % 2 === 0;
        const wallBase = isStone ? (isLight ? '#2A201A' : '#1C1512') : (isLight ? '#1A2332' : '#0F1622');
        const wallHighlight = isStone ? '#3D2F27' : '#2C3B54';
        const walkCol = isStone ? (isLight ? '#382B22' : '#271D17') : (isLight ? '#1E293B' : '#131B26');

        // Acostamento/calçada entre a zebra e a parede do túnel
        this.drawPoly(ctx, leftWall1, segBottomY, leftEdge1, segBottomY, leftEdge2, topY, leftWall2, topY, walkCol);
        this.drawPoly(ctx, rightEdge1, segBottomY, rightWall1, segBottomY, rightWall2, topY, rightEdge2, topY, walkCol);

        // Parede Esquerda e Direita (além do acostamento, estendendo até as bordas da tela)
        this.drawPoly(ctx, 0, segBottomY, leftWall1, segBottomY, leftWall2, topY, 0, topY, wallBase);
        this.drawPoly(ctx, rightWall1, segBottomY, INTERNAL_WIDTH, segBottomY, INTERNAL_WIDTH, topY, rightWall2, topY, wallBase);

        // Teto do Túnel (Abóbada escura conectando os dois lados)
        const roofColor = isStone ? (isLight ? '#140E0C' : '#0D0907') : (isLight ? '#0D131C' : '#070B11');
        this.drawPoly(ctx, leftWall1, roofY1, rightWall1, roofY1, rightWall2, roofY2, leftWall2, roofY2, roofColor);

        // Preenchimento de rocha escura acima do teto para que o céu exterior nunca vaze
        const rockCap = isStone ? '#140E0C' : '#070B11';
        if (roofY2 > 0) {
          ctx.fillStyle = rockCap;
          ctx.fillRect(0, 0, INTERNAL_WIDTH, roofY2 + 2);
        }

        // Iluminação interna no teto do túnel
        if (isStone) {
          if (segment.index % 6 === 0 && p1.w > 12) {
            const lampW = Math.max(2, p1.w * 0.08);
            ctx.fillStyle = '#FFA726';
            ctx.fillRect(p1.x - lampW * 0.5, roofY1, lampW, Math.max(1.5, wallH1 * 0.06));
            // Brilho dourado no asfalto
            const spotGrad = ctx.createRadialGradient(p1.x, p1.y - 4, 2, p1.x, p1.y - 4, p1.w * 0.5);
            spotGrad.addColorStop(0, 'rgba(255, 183, 77, 0.22)');
            spotGrad.addColorStop(1, 'rgba(255, 183, 77, 0)');
            ctx.fillStyle = spotGrad;
            ctx.beginPath();
            ctx.ellipse(p1.x, p1.y - 4, p1.w * 0.5, Math.max(2, (segBottomY - topY) * 2), 0, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Túnel Metro: Tiras contínuas de LED Neon no centro do teto
          const neonW1 = Math.max(1, p1.w * 0.04);
          const neonW2 = Math.max(0.6, p2.w * 0.04);
          const neonCol = (Math.floor(segment.index / 2) % 2 === 0) ? '#00E5FF' : '#FF007F';
          this.drawPoly(ctx, p1.x - neonW1, roofY1, p1.x + neonW1, roofY1, p2.x + neonW2, roofY2, p2.x - neonW2, roofY2, neonCol);
        }
      } else if (segment.bridge) {
        // Laterais da Ponte / Viaduto: Abismo escuro nas laterais (sem colunas invasivas no chão)
        const abyssCol = '#0A0E17';
        this.drawPoly(ctx, 0, segBottomY, p1.x - p1.w - r1, segBottomY, p2.x - p2.w - r2, topY, 0, topY, abyssCol);
        this.drawPoly(ctx, p1.x + p1.w + r1, segBottomY, INTERNAL_WIDTH, segBottomY, INTERNAL_WIDTH, topY, p2.x + p2.w + r2, topY, abyssCol);
      } else {
        // Grama lateral padrão com sobreposição contínua
        this.drawPoly(ctx, 0, segBottomY, p1.x - p1.w - r1, segBottomY, p2.x - p2.w - r2, topY, 0, topY, c.grass);
        this.drawPoly(ctx, p1.x + p1.w + r1, segBottomY, INTERNAL_WIDTH, segBottomY, INTERNAL_WIDTH, topY, p2.x + p2.w + r2, topY, c.grass);
      }

      this.drawPoly(ctx, p1.x - p1.w - r1, segBottomY, p1.x - p1.w, segBottomY, p2.x - p2.w, topY, p2.x - p2.w - r2, topY, c.rumble);
      this.drawPoly(ctx, p1.x + p1.w, segBottomY, p1.x + p1.w + r1, segBottomY, p2.x + p2.w + r2, topY, p2.x + p2.w, topY, c.rumble);

      // Guardrails 3D metálicos com faixas alternadas vermelho e branco (estilo Top Gear)
      if (segment.guardrailLeft && p1.w > 7) {
        const gw1 = p1.w * 0.05, gw2 = p2.w * 0.05;
        const gh1 = Math.max(2.5, p1.w * 0.11), gh2 = Math.max(1.2, p2.w * 0.11);
        const gx1 = p1.x - p1.w - r1, gx2 = p2.x - p2.w - r2;
        const railColor = (Math.floor(segment.index / 2) % 2 === 0) ? '#D62828' : '#F0F4F8';
        if (segment.index % 4 === 0) {
          ctx.fillStyle = '#8B0000';
          ctx.fillRect(gx1 - gw1 * 0.5, segBottomY - gh1 * 1.15, Math.max(1, gw1 * 0.4), gh1 * 1.15);
        }
        this.drawPoly(ctx, gx1 - gw1, segBottomY - gh1, gx1, segBottomY - gh1, gx2, topY - gh2, gx2 - gw2, topY - gh2, railColor);
        this.drawPoly(ctx, gx1 - gw1, segBottomY - gh1 * 0.5, gx1, segBottomY - gh1 * 0.5, gx2, topY - gh2 * 0.5, gx2 - gw2, topY - gh2 * 0.5, railColor);
      }
      if (segment.guardrailRight && p1.w > 7) {
        const gw1 = p1.w * 0.05, gw2 = p2.w * 0.05;
        const gh1 = Math.max(2.5, p1.w * 0.11), gh2 = Math.max(1.2, p2.w * 0.11);
        const gx1 = p1.x + p1.w + r1, gx2 = p2.x + p2.w + r2;
        const railColor = (Math.floor(segment.index / 2) % 2 === 0) ? '#D62828' : '#F0F4F8';
        if (segment.index % 4 === 0) {
          ctx.fillStyle = '#8B0000';
          ctx.fillRect(gx1, segBottomY - gh1 * 1.15, Math.max(1, gw1 * 0.4), gh1 * 1.15);
        }
        this.drawPoly(ctx, gx1, segBottomY - gh1, gx1 + gw1, segBottomY - gh1, gx2 + gw2, topY - gh2, gx2, topY - gh2, railColor);
        this.drawPoly(ctx, gx1, segBottomY - gh1 * 0.5, gx1 + gw1, segBottomY - gh1 * 0.5, gx2 + gw2, topY - gh2 * 0.5, gx2, topY - gh2 * 0.5, railColor);
      }

      // Mureta dos Boxes 3D contínua na Reta Principal (estilo Autódromo de Interlagos)
      if (segment.pitWall && p1.w > 6) {
        const wallDist = 1.18; // logo após a zebra amarela e verde
        const wx1 = p1.x + p1.w * wallDist;
        const wx2 = p2.x + p2.w * wallDist;
        const wh1 = Math.max(3.5, p1.w * 0.18);
        const wh2 = Math.max(1.8, p2.w * 0.18);
        const ww1 = Math.max(2.2, p1.w * 0.06);
        const ww2 = Math.max(1.2, p2.w * 0.06);

        // Mureta de concreto
        const isLightWall = Math.floor(segment.index / 3) % 2 === 0;
        const wallBase = isLightWall ? '#475569' : '#334155';
        const wallTop = '#64748B';
        // Face superior e lateral frontal
        this.drawPoly(ctx, wx1, segBottomY - wh1, wx1 + ww1, segBottomY - wh1, wx2 + ww2, topY - wh2, wx2, topY - wh2, wallTop);
        this.drawPoly(ctx, wx1, segBottomY, wx1, segBottomY - wh1, wx2, topY - wh2, wx2, topY, wallBase);

        // Faixa de advertência amarela/preta no topo da mureta
        this.drawPoly(ctx, wx1, segBottomY - wh1 * 0.88, wx1, segBottomY - wh1, wx2, topY - wh2, wx2, topY - wh2 * 0.88, isLightWall ? '#FBBF24' : '#1E293B');

        // Postes de tela de proteção (grade de segurança) e telas de telemetria
        if (segment.index % 4 === 0 && p1.w > 10) {
          const fenceH = wh1 * 1.5;
          ctx.strokeStyle = '#94A3B8';
          ctx.lineWidth = Math.max(1, p1.w * 0.015);
          ctx.beginPath();
          ctx.moveTo(wx1, segBottomY - wh1);
          ctx.lineTo(wx1, segBottomY - fenceH);
          ctx.stroke();

          // Monitor de telemetria da equipe voltado para a pista
          const scrW = Math.max(3, p1.w * 0.08);
          const scrH = Math.max(2, wh1 * 0.45);
          ctx.fillStyle = '#0284C7';
          ctx.fillRect(wx1, segBottomY - wh1 * 0.8, scrW, scrH);
        }
      }

      // Asfalto com sobreposição perfeita e trilhas sutis de rolagem 2.5D HD (zero frestas/linhas)
      this.drawPoly(ctx, p1.x - p1.w, segBottomY, p1.x + p1.w, segBottomY, p2.x + p2.w, topY, p2.x - p2.w, topY, c.road);
      const grooveCol = 'rgba(0, 0, 0, 0.08)';
      this.drawPoly(ctx, p1.x - p1.w * 0.55, segBottomY, p1.x - p1.w * 0.18, segBottomY, p2.x - p2.w * 0.18, topY, p2.x - p2.w * 0.55, topY, grooveCol);
      this.drawPoly(ctx, p1.x + p1.w * 0.18, segBottomY, p1.x + p1.w * 0.55, segBottomY, p2.x + p2.w * 0.55, topY, p2.x + p2.w * 0.18, topY, grooveCol);

      // Mancha de iluminação oval no asfalto e zebra gerada pelo poste arqueado (efeito dinâmico idêntico à imagem de referência!)
      if (segment.lampOffset !== null && segment.lampOffset !== undefined && p1.w > 10) {
        const lampSide = segment.lampOffset > 0 ? 1 : -1;
        const spotX = p1.x + p1.w * lampSide * 0.64;
        const spotY = (segBottomY + topY) * 0.5;
        const rx = p1.w * 0.44;
        const ry = Math.max(2.5, (segBottomY - topY) * 2.8);
        const glow = ctx.createRadialGradient(spotX, spotY, 2, spotX, spotY, rx);
        glow.addColorStop(0, 'rgba(255, 238, 140, 0.35)');
        glow.addColorStop(0.5, 'rgba(255, 215, 90, 0.18)');
        glow.addColorStop(1, 'rgba(255, 190, 60, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(spotX, spotY, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Marcas dinâmicas de pneu no asfalto ao contornar curvas no limite
      if (segment.skidUntil && segment.skidUntil > this.raceTimer) {
        const alpha = Math.min(0.38, (segment.skidUntil - this.raceTimer) * 0.08);
        const sx = segment.skidX || 0;
        const tireOff = 0.095;
        const tw1 = Math.max(0.6, p1.w * 0.022);
        const tw2 = Math.max(0.3, p2.w * 0.022);
        const skidCol = `rgba(12, 14, 18, ${alpha.toFixed(2)})`;
        const lx1 = p1.x + p1.w * (sx - tireOff), lx2 = p2.x + p2.w * (sx - tireOff);
        const rx1 = p1.x + p1.w * (sx + tireOff), rx2 = p2.x + p2.w * (sx + tireOff);
        this.drawPoly(ctx, lx1 - tw1, segBottomY, lx1 + tw1, segBottomY, lx2 + tw2, topY, lx2 - tw2, topY, skidCol);
        this.drawPoly(ctx, rx1 - tw1, segBottomY, rx1 + tw1, segBottomY, rx2 + tw2, topY, rx2 - tw2, topY, skidCol);
      }

      // Linhas brancas contínuas de acostamento (delimitação nítida da pista)
      const edgeW1 = Math.max(0.8, p1.w / 38);
      const edgeW2 = Math.max(0.4, p2.w / 38);
      const edgeColor = 'rgba(240, 244, 250, 0.65)';
      this.drawPoly(ctx, p1.x - p1.w + edgeW1, segBottomY, p1.x - p1.w + edgeW1 * 2.4, segBottomY, p2.x - p2.w + edgeW2 * 2.4, topY, p2.x - p2.w + edgeW2, topY, edgeColor);
      this.drawPoly(ctx, p1.x + p1.w - edgeW1 * 2.4, segBottomY, p1.x + p1.w - edgeW1, segBottomY, p2.x + p2.w - edgeW2, topY, p2.x + p2.w - edgeW2 * 2.4, topY, edgeColor);

      // Faixa Quadriculada de Largada / Chegada (à frente do grid F1)
      if (segment.index === START_LINE_SEG || segment.index === START_LINE_SEG + 1) {
        const cols = 10;
        for (let k = 0; k < cols; k++) {
          const tA = -1 + (k * 2) / cols;
          const tB = -1 + ((k + 1) * 2) / cols;
          const sqColor = ((k + segment.index) % 2 === 0) ? '#FFFFFF' : '#151515';
          this.drawPoly(
            ctx,
            p1.x + p1.w * tA, segBottomY,
            p1.x + p1.w * tB, segBottomY,
            p2.x + p2.w * tB, topY,
            p2.x + p2.w * tA, topY,
            sqColor
          );
        }
        return;
      }

      // Colchetes brancos de posição no Grid estilo Fórmula 1 ([   ])
      if (segment.gridBox) {
        const cx = segment.gridBox === 'left' ? -GRID_COL_X : GRID_COL_X;
        const halfW = 0.165;
        const lineT = 0.022;
        const segH = segBottomY - topY;
        const yFrontA = topY;
        const yFrontB = topY + segH * 0.22;
        const yBack = topY + segH * 0.78;
        const xAt = (yVal, normX) => {
          const t = (p1.y === p2.y) ? 0 : (yVal - p2.y) / (p1.y - p2.y);
          const rx = p2.x + (p1.x - p2.x) * t;
          const rw = p2.w + (p1.w - p2.w) * t;
          return rx + rw * normX;
        };
        const boxColor = 'rgba(245, 248, 255, 0.86)';
        // Barra frontal do colchete F1
        this.drawPoly(
          ctx,
          xAt(yFrontB, cx - halfW), yFrontB,
          xAt(yFrontB, cx + halfW), yFrontB,
          xAt(yFrontA, cx + halfW), yFrontA,
          xAt(yFrontA, cx - halfW), yFrontA,
          boxColor
        );
        // Hastes laterais esquerda e direita do colchete F1
        this.drawPoly(
          ctx,
          xAt(yBack, cx - halfW), yBack,
          xAt(yBack, cx - halfW + lineT), yBack,
          xAt(yFrontB, cx - halfW + lineT), yFrontB,
          xAt(yFrontB, cx - halfW), yFrontB,
          boxColor
        );
        this.drawPoly(
          ctx,
          xAt(yBack, cx + halfW - lineT), yBack,
          xAt(yBack, cx + halfW), yBack,
          xAt(yFrontB, cx + halfW), yFrontB,
          xAt(yFrontB, cx + halfW - lineT), yFrontB,
          boxColor
        );
      }

      // Faixa Central Tracejada (omitida na reta limpa do Grid de Fórmula 1)
      const inGridZone = (segment.index >= 7 && segment.index <= START_LINE_SEG + 1);
      if (!inGridZone && c.lane !== 'transparent') {
        const laneW1 = p1.w / 28;
        const laneW2 = p2.w / 28;
        this.drawPoly(ctx, p1.x - laneW1, segBottomY, p1.x + laneW1, segBottomY, p2.x + laneW2, topY, p2.x - laneW2, topY, c.lane);
      }
    }

    drawPoly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
      if (this.webgl && this.webgl.available) {
        this.webgl.addQuad(x1, y1, x2, y2, x3, y3, x4, y4, color);
        return;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fill();
    }

    renderScenery(ctx, segment, scenery, def) {
      const scale = segment.p1.screen.scale;
      const sX = segment.p1.screen.x + (scale * scenery.offset * ROAD_WIDTH * REF_WIDTH / 2);
      const sY = segment.p1.screen.y;
      const size = 95 * scale * (REF_WIDTH / 2);

      if (size < 0.22) return;
      if (sX < -size * 6.0 || sX > INTERNAL_WIDTH + size * 6.0) return;

      // Estado do clima e iluminação do circuito
      const E = this.envCur;
      const S = E ? E.s : { night: 0, dusk: 0, rain: 0, snow: 0, sun: 1 };
      const isNight = S.night > 0.28;
      const isDusk = S.dusk > 0.25;
      const isSnow = (S.snow || 0) > 0.20;

      ctx.save();
      ctx.translate(sX, sY);

      // Sombra projetada no solo (ajustada para dia/noite)
      ctx.fillStyle = isNight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.8, Math.max(1.5, size * 0.20), 0, 0, Math.PI * 2);
      ctx.fill();

      // Renderiza monumentos e pontos turísticos das capitais brasileiras
      if (typeof MonumentArt !== 'undefined' && MonumentArt.renderScenery) {
        MonumentArt.renderScenery(ctx, scenery.type, size, isNight, isDusk);
      }

      if (scenery.type === 'timing_tower') {
        // Torre alta de cronometragem de autódromo estilo Interlagos / Suzuka
        const tw = size * 0.60;
        const th = size * 2.2;
        const ty = -th;

        // Estrutura metálica treliçada
        ctx.fillStyle = isNight ? '#0F172A' : '#1E293B';
        ctx.fillRect(-tw * 0.5, ty, tw, th);
        ctx.strokeStyle = isNight ? '#334155' : '#64748B';
        ctx.lineWidth = Math.max(1, size * 0.02);
        ctx.strokeRect(-tw * 0.5, ty, tw, th);

        // Painel digital luminoso preto
        const pw = tw * 0.88;
        const ph = th * 0.88;
        ctx.fillStyle = '#050912';
        ctx.fillRect(-pw * 0.5, ty + th * 0.06, pw, ph);

        // Topo com lâmpadas vermelhas de sinalização (piscando à noite)
        const blink = isNight ? (Math.sin(performance.now() * 0.008) > 0) : true;
        ctx.fillStyle = blink ? '#EF4444' : '#450A0A';
        ctx.fillRect(-tw * 0.4, ty - size * 0.06, tw * 0.8, size * 0.05);

        // Linhas de classificação digital luminosa (LED verde/âmbar)
        if (size >= 12) {
          ctx.fillStyle = isNight ? '#FFEB3B' : '#FFD700';
          ctx.font = `bold ${Math.max(4.5, Math.floor(size * 0.16))}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('LEADER', 0, ty + th * 0.15);
          const topDrivers = ['1 HAM', '2 VER', '3 LEC', '4 NOR', '5 ALO'];
          for (let d = 0; d < topDrivers.length; d++) {
            ctx.fillStyle = d === 0 ? (isNight ? '#34D399' : '#10B981') : (isNight ? '#FDE047' : '#FBBF24');
            ctx.font = `bold ${Math.max(4, Math.floor(size * 0.13))}px monospace`;
            ctx.fillText(topDrivers[d], 0, ty + th * (0.28 + d * 0.13));
          }
        }
      } else if (scenery.type === 'pit_wall') {
        // Mureta dos boxes de autódromo com computadores e sinalização
        const pw = size * 0.90;
        const ph = size * 0.45;
        const py = -ph;

        ctx.fillStyle = isNight ? '#1E293B' : '#334155';
        ctx.fillRect(-pw * 0.5, py, pw, ph);
        ctx.fillStyle = isNight ? '#334155' : '#64748B';
        ctx.fillRect(-pw * 0.5, py, pw, ph * 0.18);

        // Monitores de telemetria dos boxes (brilham no escuro)
        if (size >= 16) {
          ctx.fillStyle = isNight ? '#38BDF8' : '#0284C7';
          ctx.fillRect(-pw * 0.38, py + ph * 0.24, pw * 0.32, ph * 0.38);
          ctx.fillStyle = isNight ? '#4ADE80' : '#10B981';
          ctx.fillRect(pw * 0.06, py + ph * 0.24, pw * 0.32, ph * 0.38);
        }
      } else if (scenery.type === 'palm') {
        // Palmeira tropical costeira alta estilo Top Gear / Arcade (proporção da imagem de referência)
        const toward = scenery.offset < 0 ? 1 : -1;
        const trunkCol = isNight ? '#1F140E' : (isDusk ? '#331B12' : '#4E342E');
        const trunkLight = isNight ? '#2E1E16' : (isDusk ? '#4A2B1D' : '#6D4C41');

        // Tronco alto e esguio curvado suavemente
        const trunkH = size * 10.5;
        const crownX = toward * size * 1.4;
        const crownY = -trunkH;

        ctx.strokeStyle = trunkCol;
        ctx.lineWidth = Math.max(2.4, size * 0.32);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(toward * size * 0.8, -trunkH * 0.52, crownX, crownY);
        ctx.stroke();

        ctx.strokeStyle = trunkLight;
        ctx.lineWidth = Math.max(1.2, size * 0.14);
        ctx.beginPath();
        ctx.moveTo(toward * size * 0.05, 0);
        ctx.quadraticCurveTo(toward * size * 0.75, -trunkH * 0.52, crownX - toward * size * 0.05, crownY);
        ctx.stroke();

        // Anéis da casca do tronco
        for (let k = 1; k < 9; k++) {
          const frac = k / 9;
          const kx = toward * size * 0.7 * Math.sin(frac * Math.PI);
          const ky = -trunkH * frac;
          ctx.strokeStyle = isNight ? '#140D09' : '#27160F';
          ctx.lineWidth = Math.max(1.0, size * 0.06);
          ctx.beginPath();
          ctx.moveTo(kx - size * 0.16, ky);
          ctx.lineTo(kx + size * 0.16, ky);
          ctx.stroke();
        }

        // Copa exuberante de palmas em leque (multi-camadas)
        const frondCols = isNight 
          ? ['#0A1C12', '#0E291B', '#133925', '#1B4A31']
          : (isDusk 
            ? ['#1C331B', '#274724', '#385C2E', '#4B7337']
            : ['#1B5E20', '#2E7D32', '#388E3C', '#4CAF50']);

        for (let f = 0; f < 10; f++) {
          const ang = (f / 9) * Math.PI * 1.15 - 0.15;
          const fx = crownX + Math.cos(ang) * size * 3.4;
          const fy = crownY - Math.sin(ang) * size * 1.8 + Math.abs(Math.cos(ang)) * size * 1.2;
          ctx.strokeStyle = frondCols[f % 4];
          ctx.lineWidth = Math.max(1.6, size * 0.18);
          ctx.beginPath();
          ctx.moveTo(crownX, crownY);
          ctx.quadraticCurveTo((crownX + fx) * 0.5, crownY - size * 1.4, fx, fy);
          ctx.stroke();
        }

        // Arbusto tropical denso na base do tronco (como no print)
        const b1 = isNight ? '#08170D' : (isDusk ? '#162C17' : '#1B5E20');
        const b2 = isNight ? '#0F2617' : (isDusk ? '#204221' : '#2E7D32');
        ctx.fillStyle = b1;
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.45, size * 1.4, size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = b2;
        ctx.beginPath();
        ctx.ellipse(toward * size * 0.35, -size * 0.65, size * 1.0, size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (scenery.type === 'pine' || (scenery.type === 'tree' && def && def.theme === 'SERRA')) {
        // Pinheiro Araucária da Serra Catarinense (adaptável a dia, tarde, noite e neve)
        const trunkCol = isNight ? '#1B110B' : (isDusk ? '#2C1B12' : '#3E2419');
        ctx.fillStyle = trunkCol;
        ctx.fillRect(-size * 0.05, -size * 0.95, size * 0.10, size * 0.95);

        const layers = isNight
          ? [
              { y: -size * 0.94, rx: size * 0.46, ry: size * 0.13, c: '#0A1D13' },
              { y: -size * 0.98, rx: size * 0.36, ry: size * 0.10, c: '#0F281B' },
              { y: -size * 0.80, rx: size * 0.29, ry: size * 0.08, c: '#143624' },
              { y: -size * 0.64, rx: size * 0.23, ry: size * 0.06, c: '#122F20' }
            ]
          : (isDusk
            ? [
                { y: -size * 0.94, rx: size * 0.46, ry: size * 0.13, c: '#1B3322' },
                { y: -size * 0.98, rx: size * 0.36, ry: size * 0.10, c: '#23442D' },
                { y: -size * 0.80, rx: size * 0.29, ry: size * 0.08, c: '#2F5C3E' },
                { y: -size * 0.64, rx: size * 0.23, ry: size * 0.06, c: '#254E33' }
              ]
            : [
                { y: -size * 0.94, rx: size * 0.46, ry: size * 0.13, c: '#143C25' },
                { y: -size * 0.98, rx: size * 0.36, ry: size * 0.10, c: '#1C5233' },
                { y: -size * 0.80, rx: size * 0.29, ry: size * 0.08, c: '#267347' },
                { y: -size * 0.64, rx: size * 0.23, ry: size * 0.06, c: '#1E5E3A' }
              ]);

        for (let l of layers) {
          ctx.fillStyle = l.c;
          ctx.beginPath();
          ctx.ellipse(0, l.y, l.rx, l.ry, 0, 0, Math.PI * 2);
          ctx.fill();

          // Acúmulo de neve branca nos patamares da Araucária
          if (isSnow) {
            ctx.fillStyle = isNight ? '#CBD5E1' : '#FFFFFF';
            ctx.beginPath();
            ctx.ellipse(0, l.y - l.ry * 0.25, l.rx * 0.76, l.ry * 0.45, 0, Math.PI, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (scenery.type === 'bush') {
        // Arbustos costeiros verdes na beira da pista
        const b1 = isNight ? '#08170D' : (isDusk ? '#162C17' : '#0F3317');
        const b2 = isNight ? '#0F2617' : (isDusk ? '#204221' : '#185025');
        const b3 = isNight ? '#163821' : (isDusk ? '#2D5E32' : '#267A3B');
        ctx.fillStyle = b1;
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.14, size * 0.34, size * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = b2;
        ctx.beginPath();
        ctx.ellipse(-size * 0.12, -size * 0.18, size * 0.22, size * 0.16, 0, 0, Math.PI * 2);
        ctx.ellipse(size * 0.12, -size * 0.16, size * 0.22, size * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = b3;
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.22, size * 0.20, size * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (scenery.type === 'tree') {
        // Árvore frondosa alta em camadas estilo Top Gear / Arcade (proporção do print)
        const trunkCol = isNight ? '#251A16' : (isDusk ? '#3B2723' : '#4E342E');
        ctx.fillStyle = trunkCol;
        ctx.fillRect(-size * 0.22, -size * 7.5, size * 0.44, size * 7.5);

        const c1 = isNight ? '#0B1F14' : (isDusk ? '#193B23' : '#145A32');
        const c2 = isNight ? '#112B1C' : (isDusk ? '#254F30' : '#1E8449');
        const c3 = isNight ? '#183825' : (isDusk ? '#32663E' : '#2ECC71');

        ctx.fillStyle = c1;
        ctx.beginPath();
        ctx.arc(0, -size * 7.2, size * 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = c2;
        ctx.beginPath();
        ctx.arc(-size * 1.4, -size * 7.8, size * 2.6, 0, Math.PI * 2);
        ctx.arc(size * 1.4, -size * 7.6, size * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = c3;
        ctx.beginPath();
        ctx.arc(-size * 0.4, -size * 9.2, size * 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Acúmulo de neve no topo da copa
        if (isSnow) {
          ctx.fillStyle = isNight ? '#CBD5E1' : '#FFFFFF';
          ctx.beginPath();
          ctx.ellipse(0, -size * 10.2, size * 2.2, size * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (scenery.type === 'sign_right' || scenery.type === 'sign_left') {
        // Placa indicativa de curva estilo Top Gear: proporção compacta e 1 único ponteiro direcional
        const sw = size * 1.5;
        const sh = size * 1.15;
        const sy = -size * 1.9;

        // Haste de sustentação única centralizada
        const postCol = isNight ? '#1E2530' : '#475569';
        ctx.fillStyle = postCol;
        ctx.fillRect(-size * 0.05, sy + sh, size * 0.10, -sy - sh);

        // Moldura externa escura
        ctx.fillStyle = isNight ? '#080C14' : '#111827';
        ctx.fillRect(-sw * 0.5, sy, sw, sh);

        // Painel interno da placa
        const border = Math.max(0.6, size * 0.08);
        const iw = sw - border * 2;
        const ih = sh - border * 2;
        const ix = -sw * 0.5 + border;
        const iy = sy + border;

        if (isNight) {
          ctx.save();
          ctx.shadowColor = '#FFEA00';
          ctx.shadowBlur = Math.max(1.5, size * 0.35);
          ctx.fillStyle = '#FFD54F';
          ctx.fillRect(ix, iy, iw, ih);

          // Borda retrorrefletiva
          ctx.strokeStyle = '#FFF9C4';
          ctx.lineWidth = Math.max(0.5, size * 0.04);
          ctx.strokeRect(ix, iy, iw, ih);
        } else if (isDusk) {
          ctx.fillStyle = '#FFA000';
          ctx.fillRect(ix, iy, iw, ih);
        } else {
          ctx.fillStyle = '#FFC107';
          ctx.fillRect(ix, iy, iw, ih);
        }

        // 1 único ponteiro indicando a direção (▶ ou ◀) em arte vetorial geométrica nítida
        const aw = iw * 0.50;
        const ah = ih * 0.60;
        const cx = ix + iw * 0.5;
        const cy = iy + ih * 0.5;

        ctx.fillStyle = '#111111';
        ctx.beginPath();
        if (scenery.type === 'sign_right') {
          // Ponteiro único apontando para a direita ▶
          ctx.moveTo(cx - aw * 0.5, cy - ah * 0.5);
          ctx.lineTo(cx + aw * 0.5, cy);
          ctx.lineTo(cx - aw * 0.5, cy + ah * 0.5);
        } else {
          // Ponteiro único apontando para a esquerda ◀
          ctx.moveTo(cx + aw * 0.5, cy - ah * 0.5);
          ctx.lineTo(cx - aw * 0.5, cy);
          ctx.lineTo(cx + aw * 0.5, cy + ah * 0.5);
        }
        ctx.closePath();
        ctx.fill();

        if (isNight) {
          ctx.restore();
        }
      } else if (scenery.type === 'grandstand') {
        // Arquibancada coberta de autódromo com torcida
        ctx.fillStyle = isNight ? '#1E293B' : '#34495E';
        ctx.fillRect(-size * 0.64, -size * 0.68, size * 1.28, size * 0.68);
        ctx.fillStyle = isNight ? '#0F172A' : '#1B2631';
        ctx.fillRect(-size * 0.60, -size * 0.58, size * 1.20, size * 0.48);

        // Fileiras de torcedores
        const rowColors = isNight
          ? ['#991B1B', '#B45309', '#1E40AF', '#166534']
          : ['#E74C3C', '#F1C40F', '#3498DB', '#2ECC71'];
        for (let r = 0; r < 4; r++) {
          ctx.fillStyle = rowColors[r];
          ctx.fillRect(-size * 0.56, -size * (0.52 - r * 0.11), size * 1.12, size * 0.065);
        }

        // Cobertura superior
        ctx.fillStyle = isNight ? '#94A3B8' : '#ECF0F1';
        ctx.fillRect(-size * 0.68, -size * 0.74, size * 1.36, size * 0.09);
        ctx.fillStyle = '#E74C3C';
        ctx.fillRect(-size * 0.68, -size * 0.66, size * 1.36, size * 0.035);
      } else if (scenery.type === 'streetlamp' || scenery.type === 'pole') {
        // Poste metálico moderno de iluminação pública alto (Padrão exato da imagem de referência)
        const towardRoad = scenery.offset < 0 ? 1 : -1;
        const poleCol = isNight ? '#475569' : (isDusk ? '#64748B' : '#94A3B8');
        const poleHighlight = isNight ? '#64748B' : (isDusk ? '#CBD5E1' : '#F1F5F9');
        const sleeveCol = isNight ? '#334155' : (isDusk ? '#475569' : '#CBD5E1');

        const poleH = size * 14.5;
        const mastH = size * 11.2;
        const sleeveW = size * 0.44;
        const sleeveH = size * 2.4;

        // 1. Manga cilíndrica de ancoragem alargada na base (conforme o print)
        ctx.fillStyle = sleeveCol;
        ctx.fillRect(-sleeveW * 0.5, -sleeveH, sleeveW, sleeveH);
        ctx.fillStyle = poleHighlight;
        ctx.fillRect(-sleeveW * 0.5, -sleeveH, sleeveW * 0.35, sleeveH);
        // Anel de transição do topo da manga
        ctx.fillStyle = isNight ? '#1E293B' : '#64748B';
        ctx.fillRect(-sleeveW * 0.58, -sleeveH - size * 0.18, sleeveW * 1.16, size * 0.18);

        // 2. Mastro tubular prateado esguio e alto
        ctx.strokeStyle = poleCol;
        ctx.lineWidth = Math.max(2.0, size * 0.22);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -sleeveH);
        ctx.lineTo(0, -mastH);
        // Curva suave de pescoço de ganso projetando sobre a pista
        const lampX = towardRoad * size * 3.4;
        const lampY = -poleH;
        ctx.quadraticCurveTo(0, lampY, lampX, lampY);
        ctx.stroke();

        // Chanfro metálico de reflexo de luz tubular
        ctx.strokeStyle = poleHighlight;
        ctx.lineWidth = Math.max(0.9, size * 0.08);
        ctx.beginPath();
        ctx.moveTo(towardRoad * 0.5, -sleeveH);
        ctx.lineTo(towardRoad * 0.5, -mastH);
        ctx.quadraticCurveTo(towardRoad * 0.5, lampY + size * 0.10, lampX, lampY + size * 0.10);
        ctx.stroke();

        // 3. Cabeçote retangular moderno da luminária
        const headW = size * 1.6;
        const headH = size * 0.42;
        ctx.fillStyle = isNight ? '#0F172A' : '#1E293B';
        ctx.fillRect(lampX - headW * 0.5, lampY - headH * 0.5, headW, headH);
        ctx.fillStyle = isNight ? '#334155' : '#64748B';
        ctx.fillRect(lampX - headW * 0.5, lampY - headH * 0.5, headW, headH * 0.28);

        if (isNight) {
          // NOITE: LÂMPADA MODERADA NO TOPO (BRILHO SUAVE E DISCRETO) + FOCO NO ASFALTO MANTIDO
          const bulbR = Math.max(1.8, size * 0.70);
          const bulbGlow = ctx.createRadialGradient(lampX, lampY + size * 0.20, 0.4, lampX, lampY + size * 0.20, bulbR);
          bulbGlow.addColorStop(0, 'rgba(255, 255, 240, 0.70)');
          bulbGlow.addColorStop(0.40, 'rgba(255, 238, 120, 0.30)');
          bulbGlow.addColorStop(1, 'rgba(255, 215, 64, 0)');
          ctx.fillStyle = bulbGlow;
          ctx.beginPath();
          ctx.arc(lampX, lampY + size * 0.20, bulbR, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#FFFDE7';
          ctx.beginPath();
          ctx.arc(lampX, lampY + size * 0.20, Math.max(1.0, size * 0.20), 0, Math.PI * 2);
          ctx.fill();

          // Feixe cônico volumétrico translúcido iluminando a pista (como no print)
          const coneGrad = ctx.createLinearGradient(lampX, lampY, lampX, 0);
          coneGrad.addColorStop(0, 'rgba(255, 245, 157, 0.46)');
          coneGrad.addColorStop(0.40, 'rgba(255, 235, 110, 0.22)');
          coneGrad.addColorStop(1, 'rgba(255, 215, 64, 0.02)');
          ctx.fillStyle = coneGrad;
          ctx.beginPath();
          ctx.moveTo(lampX - size * 0.6, lampY + size * 0.35);
          ctx.lineTo(lampX + size * 0.6, lampY + size * 0.35);
          ctx.lineTo(lampX + size * 3.8, 0);
          ctx.lineTo(lampX - size * 3.8, 0);
          ctx.closePath();
          ctx.fill();

          // Poça elíptica quente de luz brilhante no asfalto (como no print)
          ctx.fillStyle = 'rgba(255, 235, 110, 0.32)';
          ctx.beginPath();
          ctx.ellipse(lampX, 0, size * 4.2, Math.max(2.5, size * 0.95), 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 220, 0.45)';
          ctx.beginPath();
          ctx.ellipse(lampX, 0, size * 2.6, Math.max(1.8, size * 0.60), 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (isDusk) {
          // TARDE / CREPÚSCULO (EXATAMENTE O CLIMA DO PRINT DE REFERÊNCIA)
          const bulbGlow = ctx.createRadialGradient(lampX, lampY + size * 0.22, 1, lampX, lampY + size * 0.22, Math.max(6, size * 1.8));
          bulbGlow.addColorStop(0, 'rgba(255, 238, 170, 0.95)');
          bulbGlow.addColorStop(0.45, 'rgba(255, 193, 7, 0.65)');
          bulbGlow.addColorStop(1, 'rgba(255, 160, 0, 0)');
          ctx.fillStyle = bulbGlow;
          ctx.beginPath();
          ctx.arc(lampX, lampY + size * 0.22, Math.max(6, size * 1.8), 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#FFF8E1';
          ctx.beginPath();
          ctx.arc(lampX, lampY + size * 0.22, Math.max(2.2, size * 0.30), 0, Math.PI * 2);
          ctx.fill();

          // Cone crepuscular
          const coneGrad = ctx.createLinearGradient(lampX, lampY, lampX, 0);
          coneGrad.addColorStop(0, 'rgba(255, 213, 79, 0.38)');
          coneGrad.addColorStop(0.50, 'rgba(255, 183, 77, 0.18)');
          coneGrad.addColorStop(1, 'rgba(255, 152, 0, 0.02)');
          ctx.fillStyle = coneGrad;
          ctx.beginPath();
          ctx.moveTo(lampX - size * 0.5, lampY + size * 0.35);
          ctx.lineTo(lampX + size * 0.5, lampY + size * 0.35);
          ctx.lineTo(lampX + size * 3.4, 0);
          ctx.lineTo(lampX - size * 3.4, 0);
          ctx.closePath();
          ctx.fill();

          // Poça quente dourada no asfalto
          ctx.fillStyle = 'rgba(255, 202, 40, 0.28)';
          ctx.beginPath();
          ctx.ellipse(lampX, 0, size * 3.8, Math.max(2.2, size * 0.85), 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // DIA: Lâmpada desligada
          ctx.fillStyle = '#CBD5E1';
          ctx.beginPath();
          ctx.arc(lampX, lampY + size * 0.22, Math.max(1.8, size * 0.25), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (scenery.type === 'building') {
        // Prédio 3D com parede lateral e janelas adaptadas ao horário
        const bGrad = isNight ? '#16202B' : (isDusk ? '#263238' : '#37474F');
        const bSide = isNight ? '#0D131A' : (isDusk ? '#1C252B' : '#263238');
        ctx.fillStyle = bGrad;
        ctx.fillRect(-size * 0.46, -size * 1.18, size * 0.78, size * 1.18);
        ctx.fillStyle = bSide;
        ctx.fillRect(size * 0.32, -size * 1.12, size * 0.16, size * 1.12);

        // Balizamento de topo piscante
        const bBeacon = (Math.sin(performance.now() * 0.006 + segment.index) > 0);
        ctx.fillStyle = bBeacon ? '#FF1744' : (isNight ? '#4A0812' : '#D32F2F');
        ctx.fillRect(-size * 0.08, -size * 1.24, size * 0.04, size * 0.04);

        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 3; c++) {
            const lit = ((segment.index + r * 3 + c) % 4 !== 0);
            if (isNight) {
              ctx.fillStyle = lit ? ((r + c) % 2 === 0 ? '#FFE082' : '#80DEEA') : '#1E293B';
            } else if (isDusk) {
              ctx.fillStyle = lit ? ((r + c) % 2 === 0 ? '#FFD54F' : '#B2EBF2') : '#37474F';
            } else {
              // Dia: reflexo suave dos vidros
              ctx.fillStyle = (r + c) % 2 === 0 ? '#CFD8DC' : '#ECEFF1';
            }
            ctx.fillRect(-size * 0.38 + c * (size * 0.23), -size * 1.06 + r * (size * 0.20), size * 0.13, size * 0.11);
          }
        }
      } else if (scenery.type === 'billboard') {
        // Outdoors retrô com suporte metálico duplo (Padrão da imagem de referência)
        const billIdx = Math.abs(segment.index) % 6;
        const bw = size * 7.5;
        const bh = size * 3.8;
        const by = -size * 6.0;

        // Pés metálicos duplos de sustentação fincados no solo (como no print)
        const legW = Math.max(1.6, size * 0.18);
        const legX1 = -bw * 0.34;
        const legX2 = bw * 0.34;
        const legCol = isNight ? '#1E2530' : '#475569';
        const legLight = isNight ? '#334155' : '#94A3B8';

        ctx.fillStyle = legCol;
        ctx.fillRect(legX1 - legW * 0.5, by + bh, legW, -by - bh);
        ctx.fillRect(legX2 - legW * 0.5, by + bh, legW, -by - bh);
        ctx.fillStyle = legLight;
        ctx.fillRect(legX1 - legW * 0.5, by + bh, legW * 0.4, -by - bh);
        ctx.fillRect(legX2 - legW * 0.5, by + bh, legW * 0.4, -by - bh);

        // Moldura externa da placa (Borda 16-bit com relevo)
        ctx.fillStyle = isNight ? '#0A0F1A' : '#0F172A';
        ctx.fillRect(-bw * 0.5, by, bw, bh);
        ctx.strokeStyle = isNight ? '#475569' : '#E2E8F0';
        ctx.lineWidth = Math.max(1.2, size * 0.14);
        ctx.strokeRect(-bw * 0.5, by, bw, bh);

        const pad = size * 0.20;
        const pw = bw - pad * 2;
        const ph = bh - pad * 2;
        const px = -bw * 0.5 + pad;
        const py = by + pad;

        const BRAZIL_STATES = [
          'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
          'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
          'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
        ];
        const stateCode = (def && def.stateCode && BRAZIL_STATES.includes(def.stateCode)) ? def.stateCode : null;

        if (stateCode) {
          // Bandeira autêntica do estado da pista no outdoor (sem texto LH44)
          this.renderStateFlag(ctx, stateCode, px, py, pw, ph, isNight);
        } else {
          // Pistas sem estado (ex: Interlagos GP, Serra do Rio do Rastro, Cidade Metrópole, Cânions):
          // Mantém as placas exatamente como são atualmente
          const isBrasil = (!def || def.id === 'brasil');
          const isSerra = (def && def.id === 'serra');

          if (isBrasil) {
            if (billIdx === 0 || billIdx === 3) {
              // "LH44" com arco-íris retrô (Padrão Top Gear)
              ctx.fillStyle = isNight ? '#0F1A2E' : '#16233B';
              ctx.fillRect(px, py, pw, ph);
              const rCols = ['#E65100', '#F57C00', '#FFB300', '#00ACC1', '#1E88E5'];
              for (let r = 0; r < rCols.length; r++) {
                ctx.fillStyle = rCols[r];
                ctx.beginPath();
                ctx.moveTo(px, py + ph * 0.42 + r * (ph * 0.10));
                ctx.quadraticCurveTo(px + pw * 0.5, py + ph * 0.32 + r * (ph * 0.10), px + pw * 0.74, py + ph);
                ctx.lineTo(px + pw * 0.64, py + ph);
                ctx.quadraticCurveTo(px + pw * 0.45, py + ph * 0.38 + r * (ph * 0.10), px, py + ph * 0.50 + r * (ph * 0.10));
                ctx.fill();
              }
              if (size >= 4) {
                ctx.fillStyle = isNight ? '#FFFFFF' : '#F8FAFC';
                ctx.font = `900 ${Math.max(7, Math.floor(size * 1.45))}px sans-serif`;
                ctx.textAlign = 'left';
                ctx.fillText('LH44', px + pw * 0.08, py + ph * 0.52);
              }
              ctx.fillStyle = isNight ? '#FFE082' : '#FFD54F';
              ctx.beginPath();
              ctx.arc(px + pw * 0.82, py + ph * 0.55, ph * 0.28, 0, Math.PI * 2);
              ctx.fill();
            } else if (billIdx === 1 || billIdx === 4) {
              // "LH44" vermelho clássico
              ctx.fillStyle = isNight ? '#7F1D1D' : '#B71C1C';
              ctx.fillRect(px, py, pw, ph);
              ctx.fillStyle = '#FFE082';
              ctx.fillRect(px, py + ph * 0.74, pw, ph * 0.14);
              if (size >= 4) {
                ctx.fillStyle = '#FFF';
                ctx.font = `900 ${Math.max(7, Math.floor(size * 1.35))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('LH44', 0, py + ph * 0.54);
              }
            } else {
              // "LH44" verde/dourado
              ctx.fillStyle = isNight ? '#14461B' : '#1B5E20';
              ctx.fillRect(px, py, pw, ph);
              ctx.fillStyle = '#FDD835';
              ctx.fillRect(px + pw * 0.05, py + ph * 0.16, pw * 0.90, ph * 0.10);
              if (size >= 4) {
                ctx.fillStyle = '#FFF';
                ctx.font = `900 ${Math.max(7, Math.floor(size * 1.35))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('LH44', 0, py + ph * 0.65);
              }
            }
          } else if (isSerra) {
            if (billIdx % 2 === 0) {
              // "LH44" laranja montanha
              ctx.fillStyle = isNight ? '#9A3412' : '#E65100';
              ctx.fillRect(px, py, pw, ph);
              if (size >= 4) {
                ctx.fillStyle = '#FFF';
                ctx.font = `900 ${Math.max(7, Math.floor(size * 1.35))}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('LH44', 0, py + ph * 0.58);
              }
            } else {
              // "LH44" verde rali
              ctx.fillStyle = isNight ? '#0E2317' : '#1A3826';
              ctx.fillRect(px, py, pw, ph);
              ctx.fillStyle = '#F59E0B';
              ctx.fillRect(px, py + ph * 0.78, pw, ph * 0.12);
              if (size >= 4) {
                ctx.fillStyle = '#FFF';
                ctx.font = `900 ${Math.max(7, Math.floor(size * 1.35))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('LH44', 0, py + ph * 0.56);
              }
            }
          } else {
            // "LH44" neon metrópole
            ctx.fillStyle = (billIdx % 2 === 0) ? (isNight ? '#17092C' : '#1E1238') : (isNight ? '#07161F' : '#0B1D28');
            ctx.fillRect(px, py, pw, ph);
            if (size >= 4) {
              ctx.fillStyle = (billIdx % 2 === 0) ? '#FF007F' : '#00F0FF';
              ctx.font = `900 ${Math.max(7, Math.floor(size * 1.4))}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.fillText('LH44', 0, py + ph * 0.58);
            }
          }
        }

        // Hastes de refletores superiores (iluminação noturna)
        const spotX1 = -bw * 0.28;
        const spotX2 = bw * 0.28;
        const spotArmY = by - size * 0.35;
        ctx.strokeStyle = isNight ? '#475569' : '#64748B';
        ctx.lineWidth = Math.max(1.0, size * 0.10);
        ctx.beginPath();
        ctx.moveTo(spotX1, by);
        ctx.lineTo(spotX1, spotArmY);
        ctx.moveTo(spotX2, by);
        ctx.lineTo(spotX2, spotArmY);
        ctx.stroke();

        // Lâmpadas dos refletores
        if (isNight) {
          for (let sx of [spotX1, spotX2]) {
            ctx.fillStyle = '#FFFDE7';
            ctx.beginPath();
            ctx.arc(sx, spotArmY, Math.max(1.5, size * 0.16), 0, Math.PI * 2);
            ctx.fill();

            const spotGrad = ctx.createLinearGradient(sx, spotArmY, sx, by + bh);
            spotGrad.addColorStop(0, 'rgba(255, 249, 196, 0.45)');
            spotGrad.addColorStop(1, 'rgba(255, 238, 88, 0)');
            ctx.fillStyle = spotGrad;
            ctx.beginPath();
            ctx.moveTo(sx - size * 0.20, spotArmY);
            ctx.lineTo(sx + size * 0.20, spotArmY);
            ctx.lineTo(sx + size * 1.5, by + bh);
            ctx.lineTo(sx - size * 1.5, by + bh);
            ctx.closePath();
            ctx.fill();
          }
        } else if (isDusk) {
          for (let sx of [spotX1, spotX2]) {
            ctx.fillStyle = '#FFE082';
            ctx.beginPath();
            ctx.arc(sx, spotArmY, Math.max(1.2, size * 0.12), 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = '#94A3B8';
          ctx.beginPath();
          ctx.arc(spotX1, spotArmY, Math.max(1.0, size * 0.10), 0, Math.PI * 2);
          ctx.arc(spotX2, spotArmY, Math.max(1.0, size * 0.10), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    renderStateFlag(ctx, stateCode, px, py, pw, ph, isNight) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();

      const cx = px + pw * 0.5;
      const cy = py + ph * 0.5;

      switch (stateCode) {
        case 'BA': { // BAHIA: 4 listras horizontais + cantão azul com triângulo branco
          const sh = ph / 4;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px, py, pw, sh);
          ctx.fillRect(px, py + sh * 2, pw, sh);
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(px, py + sh, pw, sh);
          ctx.fillRect(px, py + sh * 3, pw, sh);
          const cw = pw * 0.38;
          const ch = sh * 2;
          ctx.fillStyle = '#1D4ED8';
          ctx.fillRect(px, py, cw, ch);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(px + cw * 0.5, py + ch * 0.18);
          ctx.lineTo(px + cw * 0.82, py + ch * 0.82);
          ctx.lineTo(px + cw * 0.18, py + ch * 0.82);
          ctx.closePath();
          ctx.fill();
          break;
        }

        case 'SP': { // SÃO PAULO: 13 listras preto/branco + cantão vermelho com círculo
          const sh = ph / 13;
          for (let i = 0; i < 13; i++) {
            ctx.fillStyle = (i % 2 === 0) ? '#111827' : '#F8FAFC';
            ctx.fillRect(px, py + i * sh, pw, sh);
          }
          const cw = pw * 0.40;
          const ch = sh * 5;
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(px, py, cw, ch);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(px + cw * 0.5, py + ch * 0.5, ch * 0.34, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1E3A8A';
          ctx.beginPath();
          ctx.arc(px + cw * 0.5, py + ch * 0.5, ch * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FBBF24';
          const starPts = [
            [px + cw * 0.14, py + ch * 0.20],
            [px + cw * 0.86, py + ch * 0.20],
            [px + cw * 0.14, py + ch * 0.80],
            [px + cw * 0.86, py + ch * 0.80]
          ];
          for (let pt of starPts) {
            ctx.beginPath();
            ctx.arc(pt[0], pt[1], Math.max(1, ch * 0.08), 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }

        case 'RJ': { // RIO DE JANEIRO: Esquartelada branco e azul celeste com brasão
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px, py, pw * 0.5, ph * 0.5);
          ctx.fillRect(px + pw * 0.5, py + ph * 0.5, pw * 0.5, ph * 0.5);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(px + pw * 0.5, py, pw * 0.5, ph * 0.5);
          ctx.fillRect(px, py + ph * 0.5, pw * 0.5, ph * 0.5);
          ctx.strokeStyle = '#15803D';
          ctx.lineWidth = Math.max(1.5, ph * 0.07);
          ctx.beginPath();
          ctx.ellipse(cx, cy, pw * 0.15, ph * 0.32, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#0284C7';
          ctx.beginPath();
          ctx.ellipse(cx, cy, pw * 0.11, ph * 0.24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#F8FAFC';
          ctx.beginPath();
          ctx.arc(cx, cy - ph * 0.05, ph * 0.08, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'MG': { // MINAS GERAIS: Campo branco com triângulo vermelho central
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(px, py, pw, ph);
          ctx.fillStyle = '#DC2626';
          ctx.beginPath();
          ctx.moveTo(cx, cy - ph * 0.36);
          ctx.lineTo(cx + pw * 0.24, cy + ph * 0.28);
          ctx.lineTo(cx - pw * 0.24, cy + ph * 0.28);
          ctx.closePath();
          ctx.fill();
          break;
        }

        case 'DF': { // DISTRITO FEDERAL: Campo branco com Cruz de Brasília verde e amarela
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(px, py, pw, ph);
          const sq = ph * 0.50;
          ctx.fillStyle = '#15803D';
          ctx.fillRect(cx - sq * 0.5, cy - sq * 0.5, sq, sq);
          ctx.fillStyle = '#FBBF24';
          const fLen = sq * 0.38;
          ctx.fillRect(cx - sq * 0.12, cy - sq * 0.5, sq * 0.24, fLen);
          ctx.fillRect(cx - sq * 0.12, cy + sq * 0.5 - fLen, sq * 0.24, fLen);
          ctx.fillRect(cx - sq * 0.5, cy - sq * 0.12, fLen, sq * 0.24);
          ctx.fillRect(cx + sq * 0.5 - fLen, cy - sq * 0.12, fLen, sq * 0.24);
          break;
        }

        case 'RS': { // RIO GRANDE DO SUL: 3 faixas diagonais (Verde, Vermelho, Amarelo)
          ctx.fillStyle = '#15803D';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + pw * 0.55, py);
          ctx.lineTo(px, py + ph * 0.65);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#DC2626';
          ctx.beginPath();
          ctx.moveTo(px + pw * 0.55, py);
          ctx.lineTo(px + pw, py);
          ctx.lineTo(px + pw, py + ph * 0.35);
          ctx.lineTo(px + pw * 0.45, py + ph);
          ctx.lineTo(px, py + ph);
          ctx.lineTo(px, py + ph * 0.65);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.moveTo(px + pw, py + ph * 0.35);
          ctx.lineTo(px + pw, py + ph);
          ctx.lineTo(px + pw * 0.45, py + ph);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.ellipse(cx, cy, pw * 0.14, ph * 0.26, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#D97706';
          ctx.lineWidth = Math.max(1, ph * 0.04);
          ctx.stroke();
          break;
        }

        case 'PR': { // PARANÁ: Campo verde, faixa diagonal branca, esfera azul com estrelas
          ctx.fillStyle = '#15803D';
          ctx.fillRect(px, py, pw, ph);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(px, py + ph * 0.22);
          ctx.lineTo(px + pw * 0.25, py);
          ctx.lineTo(px + pw, py + ph * 0.78);
          ctx.lineTo(px + pw * 0.75, py + ph);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#1E3A8A';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1, ph * 0.04), 0, Math.PI * 2);
          ctx.arc(cx - ph * 0.08, cy - ph * 0.05, Math.max(1, ph * 0.035), 0, Math.PI * 2);
          ctx.arc(cx + ph * 0.08, cy - ph * 0.04, Math.max(1, ph * 0.035), 0, Math.PI * 2);
          ctx.arc(cx, cy - ph * 0.10, Math.max(1, ph * 0.035), 0, Math.PI * 2);
          ctx.arc(cx + ph * 0.04, cy + ph * 0.08, Math.max(1, ph * 0.03), 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'PE': { // PERNAMBUCO: Azul/Branco com arco-íris, sol, estrela e cruz vermelha
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(px, py, pw, ph * 0.55);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px, py + ph * 0.55, pw, ph * 0.45);
          const rbColors = ['#DC2626', '#FBBF24', '#16A34A'];
          for (let r = 0; r < 3; r++) {
            ctx.strokeStyle = rbColors[r];
            ctx.lineWidth = Math.max(1.2, ph * 0.045);
            ctx.beginPath();
            ctx.arc(cx, py + ph * 0.54, ph * (0.34 - r * 0.045), Math.PI, 0);
            ctx.stroke();
          }
          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.arc(cx, py + ph * 0.54, ph * 0.14, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(cx, py + ph * 0.12, Math.max(1.5, ph * 0.05), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#DC2626';
          const cw = pw * 0.045;
          const ch = ph * 0.30;
          ctx.fillRect(cx - cw * 0.5, py + ph * 0.62, cw, ch);
          ctx.fillRect(cx - cw * 1.8, py + ph * 0.70, cw * 3.6, cw);
          break;
        }

        case 'CE': { // CEARÁ: Campo verde, losango amarelo e círculo branco/verde
          ctx.fillStyle = '#15803D';
          ctx.fillRect(px, py, pw, ph);
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.moveTo(cx, py + ph * 0.10);
          ctx.lineTo(px + pw * 0.90, cy);
          ctx.lineTo(cx, py + ph * 0.90);
          ctx.lineTo(px + pw * 0.10, cy);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#15803D';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.15, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'SC': { // SANTA CATARINA: Vermelho, Branco, Vermelho com losango verde
          const sh = ph / 3;
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(px, py, pw, sh);
          ctx.fillRect(px, py + sh * 2, pw, sh);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px, py + sh, pw, sh);
          ctx.fillStyle = '#15803D';
          ctx.beginPath();
          ctx.moveTo(cx, py + ph * 0.18);
          ctx.lineTo(cx + pw * 0.18, cy);
          ctx.lineTo(cx, py + ph * 0.82);
          ctx.lineTo(cx - pw * 0.18, cy);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.08, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'GO': { // GOIÁS: 8 listras verdes e amarelas com cantão azul e estrelas
          const sh = ph / 8;
          for (let i = 0; i < 8; i++) {
            ctx.fillStyle = (i % 2 === 0) ? '#15803D' : '#FBBF24';
            ctx.fillRect(px, py + i * sh, pw, sh);
          }
          const cw = pw * 0.38;
          const ch = sh * 4;
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(px, py, cw, ch);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(px + cw * 0.5, py + ch * 0.5, Math.max(1, ch * 0.08), 0, Math.PI * 2);
          ctx.arc(px + cw * 0.5, py + ch * 0.24, Math.max(1, ch * 0.07), 0, Math.PI * 2);
          ctx.arc(px + cw * 0.5, py + ch * 0.76, Math.max(1, ch * 0.07), 0, Math.PI * 2);
          ctx.arc(px + cw * 0.28, py + ch * 0.45, Math.max(1, ch * 0.07), 0, Math.PI * 2);
          ctx.arc(px + cw * 0.72, py + ch * 0.45, Math.max(1, ch * 0.07), 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'ES': { // ESPÍRITO SANTO: Azul Claro, Branco, Rosa com lema
          const sh = ph / 3;
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(px, py, pw, sh);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px, py + sh, pw, sh);
          ctx.fillStyle = '#F472B6';
          ctx.fillRect(px, py + sh * 2, pw, sh);
          ctx.fillStyle = '#0284C7';
          ctx.font = `bold ${Math.max(4, Math.floor(ph * 0.16))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('TRABALHA E CONFIA', cx, py + sh * 1.62);
          break;
        }

        case 'AM': { // AMAZONAS: Branco, Vermelho, Branco com cantão azul
          const sh = ph / 3;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px, py, pw, sh);
          ctx.fillRect(px, py + sh * 2, pw, sh);
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(px, py + sh, pw, sh);
          const cw = pw * 0.42;
          const ch = sh * 2;
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(px, py, cw, ch);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(px + cw * 0.5, py + ch * 0.5, Math.max(1.5, ch * 0.12), 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'PA': { // PARÁ: Vermelho com faixa branca diagonal e estrela azul
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(px, py, pw, ph);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(px, py + ph * 0.18);
          ctx.lineTo(px + pw * 0.22, py);
          ctx.lineTo(px + pw, py + ph * 0.82);
          ctx.lineTo(px + pw * 0.78, py + ph);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#1E3A8A';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.12, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'RN': { // RIO GRANDE DO NORTE: Verde e Branco com escudo dourado
          ctx.fillStyle = '#15803D';
          ctx.fillRect(px, py, pw, ph * 0.5);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px, py + ph * 0.5, pw, ph * 0.5);
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.ellipse(cx, cy, pw * 0.15, ph * 0.28, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#15803D';
          ctx.fillRect(cx - 1, cy - ph * 0.12, 2, ph * 0.22);
          ctx.beginPath();
          ctx.arc(cx, cy - ph * 0.12, ph * 0.08, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'AL': { // ALAGOAS: Vermelho, Branco, Azul vertical com brasão
          const sw = pw / 3;
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(px, py, sw, ph);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px + sw, py, sw, ph);
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(px + sw * 2, py, sw, ph);
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.18, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'PB': { // PARAÍBA: Preto 1/3, Vermelho 2/3 com texto NÉGO
          const bw = pw * 0.33;
          ctx.fillStyle = '#111827';
          ctx.fillRect(px, py, bw, ph);
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(px + bw, py, pw - bw, ph);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `900 ${Math.max(6, Math.floor(ph * 0.30))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('NÉGO', px + bw + (pw - bw) * 0.5, cy + ph * 0.10);
          break;
        }

        case 'MA': { // MARANHÃO: 9 listras horizontais com cantão azul e estrela
          const sh = ph / 9;
          const mCols = ['#FFFFFF', '#111827', '#DC2626'];
          for (let i = 0; i < 9; i++) {
            ctx.fillStyle = mCols[i % 3];
            ctx.fillRect(px, py + i * sh, pw, sh);
          }
          const cw = pw * 0.38;
          const ch = sh * 4;
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(px, py, cw, ch);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(px + cw * 0.5, py + ch * 0.5, Math.max(1.5, ch * 0.20), 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'PI': { // PIAUÍ: 13 listras verdes/amarelas com cantão azul
          const sh = ph / 13;
          for (let i = 0; i < 13; i++) {
            ctx.fillStyle = (i % 2 === 0) ? '#15803D' : '#FBBF24';
            ctx.fillRect(px, py + i * sh, pw, sh);
          }
          const cw = pw * 0.40;
          const ch = sh * 6;
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(px, py, cw, ch);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(px + cw * 0.5, py + ch * 0.5, Math.max(1.5, ch * 0.20), 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'SE': { // SERGIPE: 4 listras verdes e amarelas com cantão azul e 5 estrelas
          const sh = ph / 4;
          ctx.fillStyle = '#15803D';
          ctx.fillRect(px, py, pw, sh);
          ctx.fillRect(px, py + sh * 2, pw, sh);
          ctx.fillStyle = '#FBBF24';
          ctx.fillRect(px, py + sh, pw, sh);
          ctx.fillRect(px, py + sh * 3, pw, sh);
          const cw = pw * 0.38;
          const ch = sh * 2;
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(px, py, cw, ch);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(px + cw * 0.5, py + ch * 0.5, Math.max(1, ch * 0.08), 0, Math.PI * 2);
          ctx.arc(px + cw * 0.28, py + ch * 0.32, Math.max(1, ch * 0.06), 0, Math.PI * 2);
          ctx.arc(px + cw * 0.72, py + ch * 0.32, Math.max(1, ch * 0.06), 0, Math.PI * 2);
          ctx.arc(px + cw * 0.28, py + ch * 0.68, Math.max(1, ch * 0.06), 0, Math.PI * 2);
          ctx.arc(px + cw * 0.72, py + ch * 0.68, Math.max(1, ch * 0.06), 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'MT': { // MATO GROSSO: Azul com losango branco, círculo verde e estrela amarela
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(px, py, pw, ph);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(cx, py + ph * 0.12);
          ctx.lineTo(px + pw * 0.88, cy);
          ctx.lineTo(cx, py + ph * 0.88);
          ctx.lineTo(px + pw * 0.12, cy);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#15803D';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.24, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.12, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'MS': { // MATO GROSSO DO SUL: Verde, faixa branca, Azul com estrela dourada
          ctx.fillStyle = '#15803D';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + pw, py);
          ctx.lineTo(px, py + ph);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#1E3A8A';
          ctx.beginPath();
          ctx.moveTo(px + pw, py);
          ctx.lineTo(px + pw, py + ph);
          ctx.lineTo(px, py + ph);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = Math.max(2, ph * 0.14);
          ctx.beginPath();
          ctx.moveTo(px, py + ph);
          ctx.lineTo(px + pw, py);
          ctx.stroke();

          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(px + pw * 0.82, py + ph * 0.75, ph * 0.11, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'RO': { // RONDÔNIA: Azul/Verde com triângulo branco e estrela amarela
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(px, py, pw, ph * 0.5);
          ctx.fillStyle = '#15803D';
          ctx.fillRect(px, py + ph * 0.5, pw, ph * 0.5);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(px, py + ph);
          ctx.lineTo(cx, py + ph * 0.25);
          ctx.lineTo(px + pw, py + ph);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(cx, py + ph * 0.55, ph * 0.14, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'AC': { // ACRE: Diagonal Amarelo/Verde com estrela vermelha
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + pw, py);
          ctx.lineTo(px, py + ph);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#15803D';
          ctx.beginPath();
          ctx.moveTo(px + pw, py);
          ctx.lineTo(px + pw, py + ph);
          ctx.lineTo(px, py + ph);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#DC2626';
          ctx.beginPath();
          ctx.arc(px + pw * 0.22, py + ph * 0.28, ph * 0.12, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'AP': { // AMAPÁ: Azul/Verde com faixa branca/amarela e triângulo verde
          ctx.fillStyle = '#0284C7';
          ctx.fillRect(px, py, pw, ph * 0.45);
          ctx.fillStyle = '#15803D';
          ctx.fillRect(px, py + ph * 0.55, pw, ph * 0.45);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px, py + ph * 0.45, pw, ph * 0.10);
          ctx.fillStyle = '#FBBF24';
          ctx.fillRect(px, py + ph * 0.48, pw, ph * 0.04);
          ctx.fillStyle = '#15803D';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + pw * 0.28, cy);
          ctx.lineTo(px, py + ph);
          ctx.closePath();
          ctx.fill();
          break;
        }

        case 'RR': { // RORAIMA: Diagonais Azul/Branco/Verde com estrela amarela e linha vermelha
          ctx.fillStyle = '#0284C7';
          ctx.fillRect(px, py, pw, ph);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(px, py + ph);
          ctx.lineTo(px + pw * 0.35, py);
          ctx.lineTo(px + pw * 0.70, py);
          ctx.lineTo(px + pw, py + ph * 0.65);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#15803D';
          ctx.beginPath();
          ctx.moveTo(px + pw * 0.70, py);
          ctx.lineTo(px + pw, py);
          ctx.lineTo(px + pw, py + ph * 0.65);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(px, py + ph * 0.90, pw, ph * 0.10);
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.18, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'TO': { // TOCANTINS: Diagonais Azul/Branco/Amarelo com sol estilizado
          ctx.fillStyle = '#1E3A8A';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + pw * 0.55, py);
          ctx.lineTo(px, py + ph * 0.65);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(px + pw * 0.55, py);
          ctx.lineTo(px + pw, py);
          ctx.lineTo(px + pw, py + ph * 0.35);
          ctx.lineTo(px + pw * 0.45, py + ph);
          ctx.lineTo(px, py + ph);
          ctx.lineTo(px, py + ph * 0.65);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.moveTo(px + pw, py + ph * 0.35);
          ctx.lineTo(px + pw, py + ph);
          ctx.lineTo(px + pw * 0.45, py + ph);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.arc(cx, cy, ph * 0.16, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        default:
          break;
      }

      ctx.restore();
    }

    renderParticles(ctx) {
      if (!this.player || (this.state !== 'RACING' && this.state !== 'COUNTDOWN' && this.state !== 'PAUSED')) return;
      const anchorX = this.playerRenderPos ? this.playerRenderPos.x : (INTERNAL_WIDTH / 2);
      const anchorY = this.playerRenderPos ? (this.playerRenderPos.y + 18) : (INTERNAL_HEIGHT - 22);
      ctx.save();
      for (let pt of this.particlePool.pool) {
        if (!pt.active) continue;
        const dz = this.shortestDeltaZ(this.player.z, pt.z);
        const scale = Math.max(0.15, pt.life / pt.maxLife);
        const sX = anchorX + (pt.x - this.player.x) * (REF_WIDTH * 0.5);
        const sY = anchorY + pt.y * 45 + dz * 0.06;
        if (sY > INTERNAL_HEIGHT + 8 || sY < INTERNAL_HEIGHT * 0.45) continue;
        ctx.globalAlpha = Math.min(1, scale * 1.15);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(sX, sY, 2.2 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    renderSpeedLines(ctx) {
      if (!this.player || !this.player.model) return;
      const spd = this.player.speed;
      const maxSpd = this.getEffectiveMaxSpeed(this.player);
      const isNitro = this.player.isNitro;
      const isOverspeed = (spd > maxSpd + 2);
      if (!isNitro && !isOverspeed && spd < maxSpd * 0.90) return;

      const pos = this.playerRenderPos || { x: INTERNAL_WIDTH / 2, y: INTERNAL_HEIGHT - 32 };
      const cx = pos.x;
      const cy = pos.y;
      const w = PLAYER_CAR_W;
      const h = PLAYER_CAR_H;

      const overFactor = Math.min(1.0, isOverspeed ? ((spd - maxSpd) / 45) : ((spd - maxSpd * 0.90) / (maxSpd * 0.10)));
      const baseAlpha = isNitro ? 0.70 : (isOverspeed ? (0.35 + overFactor * 0.35) : 0.22);
      const strokeStyleBase = isNitro ? '0, 230, 255' : '255, 255, 255';
      const steerOffset = (this.player.steerAngle || 0) * 16;
      const t = performance.now() / 1000;
      const flowSpeed = Math.max(3.0, (spd / 100) * 4.6);

      // Efeito de vento aerodinâmico partindo diretamente do carro (estilo Need for Speed Carbon)
      // O vidro traseiro fica 100% limpo em qualquer carro: nenhum feixe passa pelo vidro.
      // Os feixes centrais iniciam abaixo do vidro traseiro (tampa do motor, placa e difusor).
      // Os feixes laterais iniciam nos ombros externos e para-lamas, bem afastados da cabine.
      const streams = [
        // Feixes laterais externos (completamente fora da cabine / vidro traseiro)
        { rx: -0.48, ry:  0.12, spread: 0.72, len: 64, phase: 0.35, lw: 1.00 },
        { rx:  0.48, ry:  0.12, spread: 0.72, len: 64, phase: 0.85, lw: 1.00 },
        { rx: -0.38, ry:  0.18, spread: 0.58, len: 58, phase: 0.05, lw: 0.90 },
        { rx:  0.38, ry:  0.18, spread: 0.58, len: 58, phase: 0.55, lw: 0.90 },

        // Feixes centrais (iniciam abaixo do vidro traseiro: tampa do motor, para-choque e difusor)
        { rx: -0.14, ry:  0.18, spread: 0.22, len: 44, phase: 0.20, lw: 0.70 },
        { rx:  0.14, ry:  0.18, spread: 0.22, len: 44, phase: 0.70, lw: 0.70 },
        { rx: -0.06, ry:  0.24, spread: 0.14, len: 40, phase: 0.40, lw: 0.65 },
        { rx:  0.06, ry:  0.24, spread: 0.14, len: 40, phase: 0.90, lw: 0.65 },
        { rx: -0.26, ry:  0.30, spread: 0.36, len: 48, phase: 0.10, lw: 0.80 },
        { rx:  0.26, ry:  0.30, spread: 0.36, len: 48, phase: 0.60, lw: 0.80 },
      ];

      ctx.save();
      ctx.lineCap = 'round';

      for (let i = 0; i < streams.length; i++) {
        const s = streams[i];
        // Ponto de desprendimento do fluxo no próprio carro
        const startX = cx + s.rx * w;
        const startY = cy + s.ry * h;

        // Projeção da esteira em perspectiva para trás e ligeiramente para fora
        const spreadX = (s.rx >= 0 ? 1 : -1) * (w * s.spread * 0.45) - steerOffset;
        const totalLen = s.len * (isNitro ? 1.35 : (1.0 + overFactor * 0.4));
        const endX = startX + spreadX;
        const endY = startY + totalLen;

        // Pulso aerodinâmico contínuo fluindo do carro em direção à esteira
        const cycle = (t * flowSpeed + s.phase) % 1.0;
        const segLen = 0.44;
        const p1 = cycle;
        const p0 = Math.max(0, cycle - segLen);

        if (p1 > 0.05) {
          const x0 = startX + (endX - startX) * p0;
          const y0 = startY + (endY - startY) * p0;
          const x1 = startX + (endX - startX) * p1;
          const y1 = startY + (endY - startY) * p1;

          // Gradiente suave para o rastro de ar
          const grad = ctx.createLinearGradient(x0, y0, x1, y1);
          const alphaFade = (baseAlpha * (1.0 - p1 * 0.30)).toFixed(2);
          grad.addColorStop(0, `rgba(${strokeStyleBase}, 0)`);
          grad.addColorStop(0.65, `rgba(${strokeStyleBase}, ${alphaFade})`);
          grad.addColorStop(1, `rgba(${strokeStyleBase}, ${(alphaFade * 1.15).toFixed(2)})`);

          ctx.strokeStyle = grad;
          ctx.lineWidth = s.lw * (isNitro ? 1.25 : 1.0);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    renderDriverBadge(ctx, code, cx, cy, carW) {
      if (!code) return;
      const bH = Math.max(5.5, Math.min(8.5, carW * 0.125));
      const bW = Math.max(14, bH * 2.3);
      const by = cy - bH - 1.5;
      const bx = cx - bW / 2;

      ctx.save();
      ctx.fillStyle = 'rgba(8, 14, 24, 0.76)';
      ctx.fillRect(bx, by, bW, bH);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(bx, by, bW, bH);

      ctx.font = `bold ${Math.floor(bH * 0.75)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(code, cx, by + bH / 2 + 0.3);
      ctx.restore();
    }

    initConfetti() {
      this.confetti = [];
      const colors = ['#FFD700', '#00E5FF', '#FF5252', '#69F0AE', '#E040FB', '#FFFFFF', '#FFAB00'];
      for (let i = 0; i < 70; i++) {
        this.confetti.push({
          x: Math.random() * INTERNAL_WIDTH,
          y: Math.random() * INTERNAL_HEIGHT - INTERNAL_HEIGHT,
          w: 2 + Math.random() * 2.5,
          h: 3 + Math.random() * 4,
          vy: 35 + Math.random() * 45,
          vx: (Math.random() - 0.5) * 20,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 6,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    }

    updateConfetti(dt) {
      if (!this.confetti || this.confetti.length === 0) return;
      for (let i = 0; i < this.confetti.length; i++) {
        const p = this.confetti[i];
        p.y += p.vy * dt;
        p.x += p.vx * dt;
        p.rot += p.vrot * dt;
        if (p.y > INTERNAL_HEIGHT + 10) {
          p.y = -10;
          p.x = Math.random() * INTERNAL_WIDTH;
        }
      }
    }

    renderConfetti(ctx) {
      if (!this.confetti || this.confetti.length === 0) return;
      ctx.save();
      for (let i = 0; i < this.confetti.length; i++) {
        const p = this.confetti[i];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      ctx.restore();
    }
    renderStartGantry(ctx) {
      const gw = 148;
      const gh = 36;
      const gx = (INTERNAL_WIDTH - gw) / 2;
      const gy = 32;

      ctx.save();
      // Suportes superiores até o topo da tela
      ctx.fillStyle = '#222831';
      ctx.fillRect(gx + 18, 0, 6, gy);
      ctx.fillRect(gx + gw - 24, 0, 6, gy);

      ctx.fillStyle = 'rgba(10, 12, 18, 0.94)';
      ctx.fillRect(gx, gy, gw, gh);
      ctx.strokeStyle = '#6C7A89';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gx, gy, gw, gh);

      for (let i = 0; i < 4; i++) {
        const lx = gx + 23 + i * 34;
        const ly = gy + gh / 2 + 1;

        let lampColor = '#262A30';
        let glowColor = null;
        if (this.startLightsStage === 5) {
          lampColor = '#00FF66';
          glowColor = 'rgba(0, 255, 102, 0.35)';
        } else if (i < this.startLightsStage) {
          lampColor = '#FF1744';
          glowColor = 'rgba(255, 23, 68, 0.38)';
        }

        // Pestana do semáforo F1
        ctx.fillStyle = '#111';
        ctx.fillRect(lx - 11, ly - 12, 22, 4);

        if (glowColor) {
          ctx.fillStyle = glowColor;
          ctx.beginPath();
          ctx.arc(lx, ly, 13, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = lampColor;
        ctx.beginPath();
        ctx.arc(lx, ly, 8.5, 0, Math.PI * 2);
        ctx.fill();

        if (glowColor) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.beginPath();
          ctx.arc(lx - 2.5, ly - 2.5, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    renderF1Leaderboard(ctx) {
      const ranked = this.getRankedCars();
      if (!ranked || ranked.length === 0) return;

      const towerX = 8;
      const towerY = 46;
      const towerW = 28;
      const rowH = 7.8;
      const count = Math.min(20, ranked.length);
      const towerH = count * rowH + 2;

      // Fundo preto transparente com borda sutil
      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      ctx.fillRect(towerX, towerY, towerW, towerH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(towerX, towerY, towerW, towerH);

      for (let i = 0; i < count; i++) {
        const pos = i + 1;
        const car = ranked[i];
        const rowY = towerY + 1 + i * rowH;
        const isPlayer = !!car.isPlayer;

        // Destaque sutil na linha do jogador
        if (isPlayer) {
          ctx.fillStyle = 'rgba(0, 229, 255, 0.22)';
          ctx.fillRect(towerX + 0.5, rowY, towerW - 1, rowH);
        }

        // Posição 1 com bloco vermelho sólido no número (estilo F1 broadcast)
        if (pos === 1) {
          ctx.fillStyle = '#E10600';
          ctx.fillRect(towerX + 1, rowY + 0.5, 7.5, rowH - 1.0);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 4.2px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('1', towerX + 4.75, rowY + rowH - 2.2);
        } else {
          // Posições 2 a 20: números menores em branco / cinza
          ctx.fillStyle = isPlayer ? '#00E5FF' : '#E2E8F0';
          ctx.font = 'bold 4.0px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(String(pos), towerX + 8, rowY + rowH - 2.2);
        }

        // Faixa de cor da equipe / carro
        const badgeColor = car.bodyColor || '#64748B';
        ctx.fillStyle = badgeColor;
        ctx.fillRect(towerX + 9.5, rowY + 1.2, 1.8, rowH - 2.4);

        // Iniciais do piloto com exatamente 3 letras maiúsculas
        const rawCode = car.driverCode || (car.isPlayer ? 'VOC' : 'CPU');
        const code = (rawCode + '___').slice(0, 3).toUpperCase();

        ctx.font = 'bold 4.2px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = isPlayer ? '#00E5FF' : '#FFFFFF';
        ctx.fillText(code, towerX + 12.8, rowY + rowH - 2.2);
      }
    }

    renderHUD(ctx) {
      ctx.save();
      const touchHud = this.input.touchControlsVisible;
      const topY = 8;

      // Helper para renderizar textos direto na tela com sombra pixel arcade preta (estilo Top Gear 2)
      const drawPixelText = (text, x, y, color, font, align = 'left') => {
        ctx.font = font;
        ctx.textAlign = align;
        ctx.fillStyle = '#000000';
        ctx.fillText(text, x + 1, y + 1);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
      };

      // ========================================================
      // 1. LADO ESQUERDO SUPERIOR (DIRETO NA TELA - ESTILO TOP GEAR 2)
      // Tacômetro em Arco, Velocidade KM/H, Nitro N2O e Marchas
      // ========================================================
      const leftX = 8;

      // --- Tacômetro Curvado de Velocidade/RPM estilo Top Gear 2 ---
      const segCount = 14;
      const maxRefSpeed = Math.max(180, this.getEffectiveMaxSpeed(this.player) * 1.15);
      const spdRatio = Math.max(0, Math.min(1, this.player.speed / maxRefSpeed));
      const activeSegs = Math.round(spdRatio * segCount);

      for (let i = 0; i < segCount; i++) {
        const t = i / (segCount - 1);
        // Curva ascendente sutil para a direita
        const sx = leftX + i * 3.3;
        const sy = topY + 12 - Math.sin(t * Math.PI * 0.5) * 6.5;
        const sw = 2.4;
        const sh = 4.8;
        const skew = 1.0;

        // Sombra preta de 1px atrás do segmento
        ctx.beginPath();
        ctx.moveTo(sx + skew + 0.8, sy + 0.8);
        ctx.lineTo(sx + sw + skew + 0.8, sy + 0.8);
        ctx.lineTo(sx + sw + 0.8, sy + sh + 0.8);
        ctx.lineTo(sx + 0.8, sy + sh + 0.8);
        ctx.closePath();
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(sx + skew, sy);
        ctx.lineTo(sx + sw + skew, sy);
        ctx.lineTo(sx + sw, sy + sh);
        ctx.lineTo(sx, sy + sh);
        ctx.closePath();

        if (i < activeSegs) {
          let fillCol = '#00E5FF';
          if (i >= 11) fillCol = '#FF1744';
          else if (i >= 7) fillCol = '#FFD700';
          else if (i >= 4) fillCol = '#00E676';
          ctx.fillStyle = fillCol;
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(26, 36, 52, 0.72)';
          ctx.fill();
        }
      }

      // --- Velocidade Digital + KM/H (sem 888 de fundo) ---
      const spdVal = String(Math.floor(this.player.speed));
      const numX = leftX + 68;

      // Dígitos de velocidade real com sombra
      const spdColor = this.player.isNitro ? '#80F8FF' : '#FFFFFF';
      drawPixelText(spdVal, numX, topY + 11, spdColor, 'bold 10px monospace', 'right');

      // Badge KM/H
      drawPixelText('KM/H', numX, topY + 17, '#FF4444', 'bold 4.8px monospace', 'right');

      // --- Cargas de Nitro N2O estilo Top Gear 2 ---
      const nitroY = topY + 22;
      drawPixelText('NITRO', leftX, nitroY + 4.5, '#00E5FF', 'bold 5px monospace', 'left');

      for (let n = 0; n < 3; n++) {
        const bx = leftX + 24 + n * 17;
        const bw = 14;
        const bh = 4.6;
        const skewN = 1.4;

        // Sombra preta atrás do cartucho
        ctx.beginPath();
        ctx.moveTo(bx + skewN + 0.8, nitroY + 0.8);
        ctx.lineTo(bx + bw + skewN + 0.8, nitroY + 0.8);
        ctx.lineTo(bx + bw + 0.8, nitroY + bh + 0.8);
        ctx.lineTo(bx + 0.8, nitroY + bh + 0.8);
        ctx.closePath();
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(bx + skewN, nitroY);
        ctx.lineTo(bx + bw + skewN, nitroY);
        ctx.lineTo(bx + bw, nitroY + bh);
        ctx.lineTo(bx, nitroY + bh);
        ctx.closePath();
        ctx.fillStyle = '#111622';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        if (n < this.player.nitroCharges) {
          ctx.beginPath();
          ctx.moveTo(bx + skewN + 0.6, nitroY + 0.6);
          ctx.lineTo(bx + bw + skewN - 0.6, nitroY + 0.6);
          ctx.lineTo(bx + bw - 0.6, nitroY + bh - 0.6);
          ctx.lineTo(bx + 0.6, nitroY + bh - 0.6);
          ctx.closePath();
          ctx.fillStyle = '#00E5FF';
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(bx + skewN + 1, nitroY + 0.8);
          ctx.lineTo(bx + bw + skewN - 1, nitroY + 0.8);
          ctx.lineTo(bx + bw - 0.5, nitroY + 1.8);
          ctx.lineTo(bx + 1, nitroY + 1.8);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.fill();
        } else if (n === this.player.nitroCharges && this.player.isNitro) {
          const burnRatio = Math.max(0, this.player.nitroTimer / 2.4);
          const curW = (bw - 1.2) * burnRatio;
          if (curW > 0.8) {
            ctx.beginPath();
            ctx.moveTo(bx + skewN + 0.6, nitroY + 0.6);
            ctx.lineTo(bx + curW + skewN, nitroY + 0.6);
            ctx.lineTo(bx + curW, nitroY + bh - 0.6);
            ctx.lineTo(bx + 0.6, nitroY + bh - 0.6);
            ctx.closePath();
            ctx.fillStyle = (Math.floor(performance.now() / 80) % 2 === 0) ? '#FFFFFF' : '#80F8FF';
            ctx.fill();
          }
        }
      }

      // --- Linha de Marchas estilo Top Gear 2 ---
      const gearY = topY + 31;
      drawPixelText('MARCHA', leftX, gearY + 6.5, '#FFD700', 'bold 5px monospace', 'left');

      const gears = ['R', '1', '2', '3', '4', '5'];
      const curGear = this.player.currentGear || 1;
      const isRev = (this.player.speed < 0);

      for (let g = 0; g < gears.length; g++) {
        const gx = leftX + 28 + g * 7.8;
        const gLabel = gears[g];
        const isActive = isRev ? (gLabel === 'R') : (gLabel === String(curGear));

        if (isActive) {
          // Sombra da pílula
          ctx.fillStyle = '#000000';
          ctx.fillRect(gx - 1.5, gearY + 0.5, 6.5, 7.5);
          // Pílula neon ativa
          ctx.fillStyle = '#00E5FF';
          ctx.fillRect(gx - 2, gearY, 6.5, 7.5);
          ctx.fillStyle = '#041019';
          ctx.font = 'bold 5.2px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(gLabel, gx + 1.2, gearY + 5.8);
        } else {
          drawPixelText(gLabel, gx + 1.2, gearY + 6.2, '#64748B', 'bold 5px monospace', 'center');
        }
      }

      // --- Classificação em Tempo Real estilo F1 (Iniciais de 1 a 20) ---
      const showF1Tower = !!(this.input.leaderboard || this.f1LeaderboardToggled);
      if (showF1Tower) {
        this.renderF1Leaderboard(ctx);
      }

      // --- Indicador Aerodinâmico de Vácuo (Slipstream / Slingshot) ---
      if (this.player.inSlipstream || this.player.slipstreamDecayTimer > 0) {
        const isSlingshot = !this.player.inSlipstream && this.player.slipstreamDecayTimer > 0;
        const slingshotRatio = Math.max(0, Math.min(1.0, this.player.slipstreamDecayTimer / 1.0));
        const intensity = isSlingshot
          ? Math.max(0.1, slingshotRatio)
          : Math.min(1.0, this.player.slipstreamIntensity || 0.5);
        const vacX = showF1Tower ? (leftX + 31) : leftX;
        const vacY = topY + 41;
        const vacW = showF1Tower ? 56 : 74;
        const vacH = 8;

        ctx.fillStyle = '#000000';
        ctx.fillRect(vacX + 0.8, vacY + 0.8, vacW, vacH);
        ctx.fillStyle = 'rgba(8, 16, 26, 0.85)';
        ctx.fillRect(vacX, vacY, vacW, vacH);
        ctx.strokeStyle = isSlingshot ? '#FFD700' : '#00E5FF';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(vacX, vacY, vacW, vacH);

        const fillW = Math.max(2, (vacW - 3) * intensity);
        const vacGrad = ctx.createLinearGradient(vacX + 1.5, 0, vacX + vacW - 1.5, 0);
        if (isSlingshot) {
          vacGrad.addColorStop(0, '#FFD700');
          vacGrad.addColorStop(1, '#FF7A00');
        } else {
          vacGrad.addColorStop(0, '#00E5FF');
          vacGrad.addColorStop(1, '#00FF66');
        }
        ctx.fillStyle = vacGrad;
        ctx.fillRect(vacX + 1.5, vacY + 1.5, fillW, vacH - 3);

        const label = isSlingshot ? '⚡ SLINGSHOT' : `▲ VÁCUO ${Math.max(5, Math.round(intensity * 100))}%`;
        drawPixelText(label, vacX + vacW / 2, vacY + 6.2, '#FFFFFF', 'bold 5px monospace', 'center');
      }

      // ========================================================
      // 2. LADO DIREITO SUPERIOR (DIRETO NA TELA - ESTILO TOP GEAR 2)
      // Tempos Atual e Melhor, Volta Atual/Total e Posição
      // ========================================================
      const rightMargin = 28;
      const rightEdge = INTERNAL_WIDTH - rightMargin;

      // Linha 1: Tempo Atual (Rótulo em Amarelo Dourado #FFD700)
      drawPixelText('ATUAL', rightEdge - 52, topY + 6, '#FFD700', 'bold 5px monospace', 'left');
      drawPixelText(this.formatTime(this.currentLapTime), rightEdge, topY + 6, '#00E5FF', 'bold 6.2px monospace', 'right');

      // Linha 2: Melhor Volta (Rótulo em Amarelo Dourado #FFD700)
      const bestStr = this.bestLapTime > 0 ? this.formatTime(this.bestLapTime) : '--:--.--';
      drawPixelText('MELHOR', rightEdge - 52, topY + 15, '#FFD700', 'bold 5px monospace', 'left');
      drawPixelText(bestStr, rightEdge, topY + 15, '#FFD700', 'bold 6.2px monospace', 'right');

      // Linha 3: Volta Atual e Total (Rótulo em Amarelo Dourado #FFD700; números de volta na mesma cor e tamanho)
      const curLap = Math.min(this.player.laps + 1, TOTAL_LAPS);
      const lapColor = (curLap === TOTAL_LAPS) ? '#FF5252' : '#FFFFFF';
      drawPixelText('VOLTA', rightEdge - 52, topY + 25, '#FFD700', 'bold 5px monospace', 'left');
      drawPixelText(`${curLap}/${TOTAL_LAPS}`, rightEdge, topY + 25, lapColor, 'bold 6.5px monospace', 'right');

      // Linha 4: Posição na Corrida (Rótulo em Amarelo Dourado #FFD700; números de posição na mesma cor e tamanho)
      const ranked = this.getRankedCars();
      const playerPos = ranked.findIndex(c => c.isPlayer) + 1;

      drawPixelText('POSIÇÃO', rightEdge - 52, topY + 35, '#FFD700', 'bold 5px monospace', 'left');

      let posColor = '#FFFFFF';
      if (playerPos === 1) posColor = '#FFD700';
      else if (playerPos === 2) posColor = '#E2E8F0';
      else if (playerPos === 3) posColor = '#F59E0B';
      else if (playerPos <= 10) posColor = '#00E5FF';

      drawPixelText(`${playerPos}º/20`, rightEdge, topY + 35, posColor, 'bold 7px monospace', 'right');

      // ========================================================
      // 3. MINIMAPA ORIGINAL PRESERVADO (POSIÇÃO E FORMA)
      // ========================================================
      const mapBoxW = 58;
      const mapBoxH = 50;
      const mapBoxX = INTERNAL_WIDTH - mapBoxW - 8;
      const mapBoxY = touchHud ? 52 : (INTERNAL_HEIGHT - mapBoxH - 6);

      ctx.fillStyle = 'rgba(8, 12, 20, 0.84)';
      ctx.fillRect(mapBoxX, mapBoxY, mapBoxW, mapBoxH);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(mapBoxX, mapBoxY, mapBoxW, mapBoxH);

      const mPoints = this.track.mapPoints;
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i < mPoints.length; i += 4) {
        const px = mapBoxX + 5 + mPoints[i].x * (mapBoxW - 10);
        const py = mapBoxY + 5 + mPoints[i].z * (mapBoxH - 10);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = '#78909C';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Marcador da linha de largada no minimapa
      if (mPoints.length > 0) {
        const startPt = mPoints[START_LINE_SEG % mPoints.length];
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(mapBoxX + 5 + startPt.x * (mapBoxW - 10) - 2, mapBoxY + 5 + startPt.z * (mapBoxH - 10) - 2, 4, 4);
      }

      for (let i = 0; i < this.cars.length; i++) {
        const car = this.cars[i];
        if (car.isPlayer) continue;
        const segIdx = ((Math.floor(car.z / SEGMENT_LENGTH) % mPoints.length) + mPoints.length) % mPoints.length;
        const pt = mPoints[segIdx];
        ctx.fillStyle = '#FF5252';
        ctx.fillRect(mapBoxX + 5 + pt.x * (mapBoxW - 10) - 1, mapBoxY + 5 + pt.z * (mapBoxH - 10) - 1, 2.2, 2.2);
      }

      const pSegIdx = ((Math.floor(this.player.z / SEGMENT_LENGTH) % mPoints.length) + mPoints.length) % mPoints.length;
      const pPt = mPoints[pSegIdx];
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(mapBoxX + 5 + pPt.x * (mapBoxW - 10) - 2, mapBoxY + 5 + pPt.z * (mapBoxH - 10) - 2, 4, 4);

      if (this.lapBannerTimer > 0 && !this.finishingRace) {
        if (this.isLastLapBanner) {
          const lbW = 204;
          const lbH = 28;
          const lbX = INTERNAL_WIDTH / 2 - lbW / 2;
          const lbY = 44;
          const pulse = (Math.sin(performance.now() / 80) + 1) * 0.5;
          ctx.fillStyle = 'rgba(10, 4, 16, 0.94)';
          ctx.fillRect(lbX, lbY, lbW, lbH);
          ctx.strokeStyle = pulse > 0.5 ? '#FFD700' : '#FF1744';
          ctx.lineWidth = 2;
          ctx.strokeRect(lbX, lbY, lbW, lbH);
          ctx.fillStyle = pulse > 0.5 ? '#FF1744' : '#FFD700';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⚠️ ÚLTIMA VOLTA! ⚠️', INTERNAL_WIDTH / 2, lbY + 13);
          ctx.fillStyle = '#00E5FF';
          ctx.font = 'bold 7.5px monospace';
          ctx.fillText('FINAL LAP — DÊ TUDO DE SI NA PISTA!', INTERNAL_WIDTH / 2, lbY + 23);
        } else {
          const lbW = 152;
          ctx.fillStyle = 'rgba(8, 12, 22, 0.90)';
          ctx.fillRect(INTERNAL_WIDTH / 2 - lbW / 2, 48, lbW, 24);
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(INTERNAL_WIDTH / 2 - lbW / 2, 48, lbW, 24);
          ctx.fillStyle = '#FFD700';
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(this.lapBannerText, INTERNAL_WIDTH / 2, 64);
        }
      }

      ctx.restore();
    }

    // Geometria da tela "Escolha de Modo de Jogo" (Campeonato vs Corrida Rápida)
    getModeSelectLayout() {
      const touchSafe = this.input.touchControlsVisible;
      const cardW = touchSafe ? 152 : 166;
      const cardH = touchSafe ? 122 : 138;
      const cardY = touchSafe ? 34 : 36;
      const gap = touchSafe ? 12 : 14;
      const totalW = cardW * 2 + gap;
      const startX = Math.round((INTERNAL_WIDTH - totalW) / 2);
      const card0 = { x: startX, y: cardY, w: cardW, h: cardH };
      const card1 = { x: startX + cardW + gap, y: cardY, w: cardW, h: cardH };
      const btnW = touchSafe ? 86 : 98;
      const btnH = touchSafe ? 18 : 20;
      const btnY = touchSafe ? 168 : 184;
      const btnBack = { x: startX, y: btnY, w: btnW, h: btnH };
      const btnConfirm = { x: startX + totalW - btnW, y: btnY, w: btnW, h: btnH };
      return { touchSafe, cardW, cardH, cardY, card0, card1, btnBack, btnConfirm };
    }

    // Geometria da tela "Escolha de Pista" (4 Clássicas + 27 Capitais do Brasil)
    getTrackSelectLayout() {
      const touchSafe = this.input.touchControlsVisible;
      const W = INTERNAL_WIDTH;
      const H = INTERNAL_HEIGHT;

      // Row 0: 4 Circuitos Clássicos destacados (Interlagos, Serra, Metrópole, Sertão)
      const classicCount = 4;
      const classicGapX = touchSafe ? 3 : 4;
      const maxGridW = touchSafe ? Math.min(W - 14, 306) : Math.min(W - 18, 314);
      const classicW = Math.floor((maxGridW - (classicCount - 1) * classicGapX) / classicCount);
      const classicH = touchSafe ? 9.5 : 10;
      const classicTotalW = classicCount * classicW + (classicCount - 1) * classicGapX;
      const classicX0 = Math.round((W - classicTotalW) / 2);
      const classicY0 = touchSafe ? 13 : 14;

      const chips = [];
      for (let i = 0; i < 4; i++) {
        chips.push({
          x: classicX0 + i * (classicW + classicGapX),
          y: classicY0,
          w: classicW,
          h: classicH,
          i: i,
          isClassic: true
        });
      }

      // Rows 1..3: 27 Circuitos das Capitais (3 linhas x 9 colunas)
      const cols = 9;
      const rows = 3;
      const gapX = touchSafe ? 2 : 2.5;
      const gapY = 2;
      const capChipW = Math.floor((maxGridW - (cols - 1) * gapX) / cols);
      const capChipH = touchSafe ? 8.5 : 9.5;
      const capGridW = cols * capChipW + (cols - 1) * gapX;
      const capGridX = Math.round((W - capGridW) / 2);
      const capGridY = classicY0 + classicH + (touchSafe ? 2.5 : 3);

      for (let i = 4; i < TRACK_DEFINITIONS.length; i++) {
        const capIdx = i - 4;
        const col = capIdx % cols;
        const row = Math.floor(capIdx / cols);
        chips.push({
          x: capGridX + col * (capChipW + gapX),
          y: capGridY + row * (capChipH + gapY),
          w: capChipW,
          h: capChipH,
          i: i,
          isClassic: false
        });
      }

      const gridBottom = capGridY + rows * capChipH + (rows - 1) * gapY;

      // Card central do showroom da pista
      const bW = touchSafe ? Math.min(W - 16, 280) : Math.min(W - 20, 304);
      const bH = touchSafe ? 116 : 124;
      const bX = Math.round((W - bW) / 2);
      const bY = gridBottom + (touchSafe ? 3.5 : 4);

      // Setas de navegação lateral
      const arrowW = 16;
      const arrowH = 26;
      const btnPrev = { x: bX - arrowW - 2, y: bY + (bH - arrowH) / 2, w: arrowW, h: arrowH };
      const btnNext = { x: bX + bW + 2, y: bY + (bH - arrowH) / 2, w: arrowW, h: arrowH };

      const btnW = touchSafe ? 92 : 108;
      const btnH = touchSafe ? 17 : 19;
      const btnY = bY + bH + (touchSafe ? 5 : 6);
      const btnBack = {
        x: Math.round(bX),
        y: btnY,
        w: btnW,
        h: btnH
      };
      const btnConfirm = {
        x: Math.round(bX + bW - btnW),
        y: btnY,
        w: btnW,
        h: btnH
      };
      return { touchSafe, bW, bH, bX, bY, chips, btnPrev, btnNext, btnBack, btnConfirm };
    }

    // Geometria compartilhada da Garagem com seletor dos 20 carros em 2 fileiras x 10 colunas
    getCarSelectLayout() {
      const touchSafe = this.input.touchControlsVisible;
      const W = INTERNAL_WIDTH;
      const H = INTERNAL_HEIGHT;

      // Grade dos 20 carros (2 linhas x 10 colunas)
      const cols = 10;
      const rows = 2;
      const gapX = touchSafe ? 2 : 3;
      const gapY = 2;
      const maxGridW = touchSafe ? Math.min(W - 14, 308) : Math.min(W - 20, 360);
      const chipW = Math.max(26, Math.floor((maxGridW - (cols - 1) * gapX) / cols));
      const chipH = touchSafe ? 11 : 12;
      const gridW = cols * chipW + (cols - 1) * gapX;
      const gridH = rows * chipH + (rows - 1) * gapY;
      const gridX = Math.round((W - gridW) / 2);
      const gridY = touchSafe ? 15 : 17;

      const chips = [];
      for (let i = 0; i < CAR_MODELS.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        chips.push({
          x: gridX + col * (chipW + gapX),
          y: gridY + row * (chipH + gapY),
          w: chipW,
          h: chipH,
          i: i
        });
      }

      const gridBottom = gridY + gridH;

      // Card central do showroom dos carros
      const bW = touchSafe ? Math.min(W - 16, 260) : Math.min(W - 24, 320);
      const bH = touchSafe ? 116 : 128;
      const bX = Math.round((W - bW) / 2);
      const bY = gridBottom + (touchSafe ? 4 : 5);

      const btnW = touchSafe ? 92 : 108;
      const btnH = touchSafe ? 17 : 19;
      const btnY = bY + bH + (touchSafe ? 5 : 6);
      const btnBack = {
        x: Math.round(bX),
        y: btnY,
        w: btnW,
        h: btnH
      };
      const btnConfirm = {
        x: Math.round(bX + bW - btnW),
        y: btnY,
        w: btnW,
        h: btnH
      };
      return { touchSafe, bW, bH, bX, bY, chips, btnBack, btnConfirm };
    }

    // Geometria da tela de Pintura e Seleção de Cor do Carro (Etapa 2)
    getColorSelectLayout() {
      const touchSafe = this.input.touchControlsVisible;
      const W = INTERNAL_WIDTH;
      const H = INTERNAL_HEIGHT;

      // Card amplo e elegante de personalização e pintura
      const bW = touchSafe ? Math.min(W - 16, 280) : Math.min(W - 24, 330);
      const bH = touchSafe ? 134 : 148;
      const bX = Math.round((W - bW) / 2);
      const bY = touchSafe ? 18 : 20;

      // 10 Amostras de cores amplas e confortáveis para toque e controle
      const numColors = CAR_COLORS.length;
      const swY = bY + (touchSafe ? 88 : 98);
      const swR = touchSafe ? 6.2 : 7.6;
      const swGap = touchSafe ? 19.5 : 23.5;
      const totalSwW = (numColors - 1) * swGap;
      const swStartX = W / 2 - totalSwW / 2;
      const sw = [];
      for (let i = 0; i < numColors; i++) {
        sw.push({ x: swStartX + i * swGap, y: swY, r: swR, i });
      }

      const btnW = touchSafe ? 96 : 112;
      const btnH = touchSafe ? 18 : 20;
      const btnY = bY + bH + (touchSafe ? 6 : 7);
      const btnBack = {
        x: Math.round(bX),
        y: btnY,
        w: btnW,
        h: btnH
      };
      const btnConfirm = {
        x: Math.round(bX + bW - btnW),
        y: btnY,
        w: btnW,
        h: btnH
      };
      return { touchSafe, bW, bH, bX, bY, sw, btnBack, btnConfirm };
    }

    // Geometria da tela "Preparar Corrida" (chips de clima/hora e de música)
    getSetupLayout() {
      const touchSafe = this.input.touchControlsVisible;
      const cw = touchSafe ? 66 : 74;
      const ch = touchSafe ? 8.2 : 8.8;
      const gx = touchSafe ? 2.5 : 3;
      const gy = touchSafe ? 2.0 : 2.2;
      const startX = Math.round(INTERNAL_WIDTH / 2 - (4 * cw + 3 * gx) / 2);
      const y1 = touchSafe ? 31 : 32;
      const conds = [];
      for (let i = 0; i < ENV_CONDITIONS.length; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        conds.push({ x: startX + col * (cw + gx), y: y1 + row * (ch + gy), w: cw, h: ch, i });
      }
      const sw = touchSafe ? 136 : 152;
      const sh = touchSafe ? 8.2 : 8.5;
      const sgx = touchSafe ? 3.5 : 4;
      const sgy = touchSafe ? 2.0 : 2.2;
      const sStartX = Math.round(INTERNAL_WIDTH / 2 - (2 * sw + sgx) / 2);
      const y2 = touchSafe ? 61 : 64;
      const songs = [];
      for (let i = 0; i < SONGS.length; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        songs.push({ x: sStartX + col * (sw + sgx), y: y2 + row * (sh + sgy), w: sw, h: sh, i });
      }
      const btnW = touchSafe ? 88 : 98;
      const startW = touchSafe ? 116 : 130;
      const btnH = touchSafe ? 15 : 16;
      const btnY = touchSafe ? 138 : 144;
      const totalBtnsW = btnW + 12 + startW;
      const btnStartX = Math.round(INTERNAL_WIDTH / 2 - totalBtnsW / 2);
      const btnBack = {
        x: btnStartX,
        y: btnY,
        w: btnW,
        h: btnH
      };
      const startBtn = {
        x: btnStartX + btnW + 12,
        y: btnY,
        w: startW,
        h: btnH
      };
      return {
        touchSafe, conds, songs, btnBack, startBtn,
        titleY: touchSafe ? 13 : 14,
        subY: touchSafe ? 21 : 22,
        label1Y: touchSafe ? 28 : 29,
        label2Y: touchSafe ? 57 : 60,
        descY: touchSafe ? 116 : 122,
        gridY: touchSafe ? 122 : 128,
        gridH: touchSafe ? 10.5 : 11,
        gridW: touchSafe ? 280 : 308,
        hintY: touchSafe ? 160 : 168
      };
    }

    renderMenu(ctx) {
      const now = performance.now();
      const touchSafe = this.input.touchControlsVisible;
      const cx = INTERNAL_WIDTH / 2;

      // 1. VINHETA ATMOSFÉRICA PÔR DO SOL / RETRÔ ARCADE SOBRE A PISTA 3D AO VIVO
      // A pista 3D ao vivo e o horizonte continuam 100% visíveis e correndo dinamicamente ao fundo
      const vignetteGrad = ctx.createLinearGradient(0, 0, 0, INTERNAL_HEIGHT);
      vignetteGrad.addColorStop(0, 'rgba(25, 10, 45, 0.40)');
      vignetteGrad.addColorStop(0.48, 'rgba(255, 110, 30, 0.12)');
      vignetteGrad.addColorStop(0.62, 'rgba(0, 0, 0, 0.05)');
      vignetteGrad.addColorStop(1, 'rgba(12, 6, 22, 0.52)');
      ctx.fillStyle = vignetteGrad;
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();

      // =========================================================================
      // 2. LOGOTIPO RETRÔ 16-BIT "LH44" (ESTILO SUPER NINTENDO / TOP GEAR / OUTRUN)
      // =========================================================================
      const logoCenterY = touchSafe ? 54 : 60;

      // Halo / Resplendor solar do pôr do sol atrás do logotipo
      const sunGlow = ctx.createRadialGradient(cx, logoCenterY, 4, cx, logoCenterY, 95);
      sunGlow.addColorStop(0, 'rgba(255, 235, 130, 0.35)');
      sunGlow.addColorStop(0.4, 'rgba(255, 95, 30, 0.20)');
      sunGlow.addColorStop(0.8, 'rgba(170, 30, 90, 0.08)');
      sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(cx, logoCenterY, 95, 0, Math.PI * 2);
      ctx.fill();

      // Medição precisa da tipografia para centralização 100% simétrica
      const fontSize = touchSafe ? 34 : 38;
      ctx.font = 'italic 900 ' + fontSize + 'px "Arial Black", Impact, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      const lhText = 'LH';
      const numText = '44';
      const gap = 2;
      const lhMetrics = ctx.measureText(lhText);
      const numMetrics = ctx.measureText(numText);
      const totalWidth = lhMetrics.width + gap + numMetrics.width;

      // 2.1 ASAS DE BANDEIRA QUADRICULADA NAS LATERAIS DO LOGO
      const drawCheckeredWing = (baseX, baseY, dir) => {
        const rows = 4;
        const cols = 6;
        const sq = 4.2;
        const slant = -0.28;
        ctx.save();
        ctx.translate(baseX, baseY);
        ctx.transform(1, 0, slant, 1, 0, 0);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const isWingEdge = (dir < 0) ? (c < rows - 1 - r) : (c > r + (cols - rows));
            if (isWingEdge) continue;
            const isDark = (r + c) % 2 === 0;
            if (isDark) {
              ctx.fillStyle = (r === 0) ? '#8A0F2E' : (r === 3 ? '#160824' : '#C4183C');
            } else {
              ctx.fillStyle = (r === 0) ? '#FFF0F5' : '#ECEFF1';
            }
            ctx.fillRect(dir * c * sq, (r - rows / 2) * sq, sq - 0.4, sq - 0.4);
          }
        }
        ctx.restore();
      };

      const wingOffset = totalWidth / 2 + 6;
      drawCheckeredWing(cx - wingOffset, logoCenterY - 2, -1);
      drawCheckeredWing(cx + wingOffset, logoCenterY - 2, 1);

      // 2.2 LETRAS 3D CROMO "LH" E FOGO "44"
      ctx.save();
      ctx.translate(cx, logoCenterY);
      ctx.transform(1, 0, -0.20, 1, 0, 0); // Slant de corrida anos 90

      ctx.font = 'italic 900 ' + fontSize + 'px "Arial Black", Impact, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      const startX = -totalWidth / 2;
      const lhX = startX;
      const numX = startX + lhMetrics.width + gap;

      // 2.2.1 PROFUNDIDADE 3D / SOMBRA RETRÔ (EXTRUSÃO EM CAMADAS)
      const depth = 4;
      for (let d = depth; d >= 1; d--) {
        const offX = d * 0.9;
        const offY = d * 1.1;
        ctx.fillStyle = (d === depth) ? '#02040A' : '#0B132B';
        ctx.fillText(lhText, lhX + offX, offY);
        ctx.fillStyle = (d === depth) ? '#1A0202' : '#4A0808';
        ctx.fillText(numText, numX + offX, offY);
      }

      // 2.2.2 BORDA EXTERNA GROSSA
      ctx.lineWidth = 5;
      ctx.lineJoin = 'miter';
      ctx.strokeStyle = '#050711';
      ctx.strokeText(lhText, lhX, 0);
      ctx.strokeStyle = '#180404';
      ctx.strokeText(numText, numX, 0);

      // 2.2.3 PREENCHIMENTO DO "LH" EM CROMO METÁLICO
      const lhGrad = ctx.createLinearGradient(0, -fontSize * 0.45, 0, fontSize * 0.45);
      lhGrad.addColorStop(0.00, '#FFFFFF');
      lhGrad.addColorStop(0.20, '#F0F9FF');
      lhGrad.addColorStop(0.42, '#B0D8F0');
      lhGrad.addColorStop(0.48, '#4A7A96');
      lhGrad.addColorStop(0.52, '#FFFFFF');
      lhGrad.addColorStop(0.68, '#27445C');
      lhGrad.addColorStop(0.90, '#102334');
      lhGrad.addColorStop(1.00, '#091522');
      ctx.fillStyle = lhGrad;
      ctx.fillText(lhText, lhX, 0);

      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.strokeText(lhText, lhX, 0);

      // 2.2.4 PREENCHIMENTO DO "44" EM DEGRADÊ DE VELOCIDADE
      const numGrad = ctx.createLinearGradient(0, -fontSize * 0.45, 0, fontSize * 0.45);
      numGrad.addColorStop(0.00, '#FFF59D');
      numGrad.addColorStop(0.22, '#FFB300');
      numGrad.addColorStop(0.48, '#FF5722');
      numGrad.addColorStop(0.78, '#D50000');
      numGrad.addColorStop(1.00, '#7F0000');
      ctx.fillStyle = numGrad;
      ctx.fillText(numText, numX, 0);

      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(255, 240, 160, 0.8)';
      ctx.strokeText(numText, numX, 0);

      ctx.restore();

      // 2.3 SLOGAN BANNER: "LOW TO HIGH SPEED" COM FAIXAS DE VELOCIDADE
      const sloganY = logoCenterY + (touchSafe ? 22 : 25);
      const sloganText = 'LOW TO HIGH SPEED';

      ctx.font = 'italic bold 7.5px "Trebuchet MS", Arial, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const sloganW = ctx.measureText(sloganText).width;

      const drawSpeedStripes = (xStart, xEnd, y) => {
        const stripeGrad = ctx.createLinearGradient(xStart, y, xEnd, y);
        stripeGrad.addColorStop(0, 'rgba(235, 30, 45, 0)');
        stripeGrad.addColorStop(0.3, 'rgba(235, 30, 45, 0.8)');
        stripeGrad.addColorStop(1, 'rgba(255, 75, 45, 1)');
        ctx.fillStyle = stripeGrad;
        ctx.fillRect(Math.min(xStart, xEnd), y - 0.8, Math.abs(xEnd - xStart), 1.6);
        ctx.fillRect(Math.min(xStart, xEnd) + (xStart < xEnd ? 5 : -5), y + 2.2, Math.abs(xEnd - xStart) - 5, 1.0);
      };

      drawSpeedStripes(cx - sloganW / 2 - 24, cx - sloganW / 2 - 4, sloganY);
      drawSpeedStripes(cx + sloganW / 2 + 24, cx + sloganW / 2 + 4, sloganY);

      ctx.fillStyle = '#160404';
      ctx.fillText(sloganText, cx + 0.8, sloganY + 0.8);
      ctx.fillStyle = '#FFD54F';
      ctx.fillText(sloganText, cx, sloganY);

      // =========================================================================
      // 3. BOTÕES 16-BIT RETRÔ: INICIAR / CONTINUAR
      // =========================================================================
      const btnW = touchSafe ? 144 : 156;
      const btnH = touchSafe ? 18 : 20;
      const btnX = Math.round(cx - btnW / 2);
      const slant = 5;

      const btn0_Y = touchSafe ? 104 : 110;
      const btn1_Y = touchSafe ? 127 : 135;

      const mPos = this.input ? (this.input.mouseCanvasPos || this.input.mousePos) : null;
      let hoveredBtn = -1;
      if (mPos) {
        if (mPos.x >= btnX && mPos.x <= btnX + btnW + slant) {
          if (mPos.y >= btn0_Y && mPos.y <= btn0_Y + btnH) hoveredBtn = 0;
          else if (mPos.y >= btn1_Y && mPos.y <= btn1_Y + btnH) hoveredBtn = 1;
        }
      }
      if (hoveredBtn !== -1) {
        this.mainMenuSelection = hoveredBtn;
      }

      const drawSlantedBox = (x, y, w, h, s) => {
        ctx.beginPath();
        ctx.moveTo(x + s + 2.5, y);
        ctx.lineTo(x + w + s - 2.5, y);
        ctx.quadraticCurveTo(x + w + s, y, x + w + s - 1, y + 2);
        ctx.lineTo(x + w + 1, y + h - 2);
        ctx.quadraticCurveTo(x + w, y + h, x + w - 2.5, y + h);
        ctx.lineTo(x + 2.5, y + h);
        ctx.quadraticCurveTo(x, y + h, x + 1, y + h - 2);
        ctx.lineTo(x + s - 1, y + 2);
        ctx.quadraticCurveTo(x + s, y, x + s + 2.5, y);
        ctx.closePath();
      };

      const pulse = 0.35 + 0.25 * Math.sin(now * 0.007);
      const arrowFlash = Math.floor(now / 220) % 2 === 0;

      // --- BOTÃO 0: INICIAR NOVO JOGO ---
      const isSel0 = (this.mainMenuSelection === 0);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      drawSlantedBox(btnX + 1.5, btn0_Y + 2.0, btnW, btnH, slant);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 230, 0, ${isSel0 ? 0.95 : pulse})`;
      ctx.lineWidth = isSel0 ? 3.0 : 1.5;
      drawSlantedBox(btnX, btn0_Y, btnW, btnH, slant);
      ctx.stroke();

      const grad0 = ctx.createLinearGradient(btnX, btn0_Y, btnX, btn0_Y + btnH);
      if (isSel0) {
        grad0.addColorStop(0.0, '#FFFF8D');
        grad0.addColorStop(0.4, '#FFE082');
        grad0.addColorStop(1.0, '#F57C00');
      } else {
        grad0.addColorStop(0.0, '#FFF176');
        grad0.addColorStop(0.5, '#FFCA28');
        grad0.addColorStop(1.0, '#E65100');
      }
      ctx.fillStyle = grad0;
      drawSlantedBox(btnX, btn0_Y, btnW, btnH, slant);
      ctx.fill();

      ctx.lineWidth = 1.0;
      ctx.strokeStyle = isSel0 ? '#FFFFFF' : '#FFF9C4';
      drawSlantedBox(btnX + 1.0, btn0_Y + 1.0, btnW - 2.0, btnH - 2.0, slant);
      ctx.stroke();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#1B0800';
      drawSlantedBox(btnX, btn0_Y, btnW, btnH, slant);
      ctx.stroke();

      // Ícone Bandeira
      const flagX = btnX + 14;
      const flagY = Math.round(btn0_Y + (btnH - 8) / 2);
      const fsq = 2.0;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          ctx.fillStyle = ((r + c) % 2 === 0) ? '#FFFFFF' : '#140800';
          ctx.fillRect(flagX + c * fsq, flagY + r * fsq, fsq, fsq);
        }
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic 900 9.5px monospace';
      ctx.fillStyle = '#100500';
      ctx.fillText('INICIAR NOVO JOGO', btnX + btnW / 2 + 6, btn0_Y + btnH / 2 + 0.5);

      if (isSel0 && arrowFlash) {
        ctx.font = 'bold 8.5px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('►', btnX - 7, btn0_Y + btnH / 2);
        ctx.fillText('◄', btnX + btnW + slant + 5, btn0_Y + btnH / 2);
      }

      // --- BOTÃO 1: CONTINUAR (CARREGAR SAVE) ---
      const isSel1 = (this.mainMenuSelection === 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      drawSlantedBox(btnX + 1.5, btn1_Y + 2.0, btnW, btnH, slant);
      ctx.fill();

      ctx.strokeStyle = `rgba(0, 229, 255, ${isSel1 ? 0.95 : pulse})`;
      ctx.lineWidth = isSel1 ? 3.0 : 1.5;
      drawSlantedBox(btnX, btn1_Y, btnW, btnH, slant);
      ctx.stroke();

      const grad1 = ctx.createLinearGradient(btnX, btn1_Y, btnX, btn1_Y + btnH);
      if (isSel1) {
        grad1.addColorStop(0.0, '#E0F2FE');
        grad1.addColorStop(0.4, '#38BDF8');
        grad1.addColorStop(1.0, '#0284C7');
      } else {
        grad1.addColorStop(0.0, '#BAE6FD');
        grad1.addColorStop(0.5, '#0284C7');
        grad1.addColorStop(1.0, '#0369A1');
      }
      ctx.fillStyle = grad1;
      drawSlantedBox(btnX, btn1_Y, btnW, btnH, slant);
      ctx.fill();

      ctx.lineWidth = 1.0;
      ctx.strokeStyle = isSel1 ? '#FFFFFF' : '#BAE6FD';
      drawSlantedBox(btnX + 1.0, btn1_Y + 1.0, btnW - 2.0, btnH - 2.0, slant);
      ctx.stroke();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#082F49';
      drawSlantedBox(btnX, btn1_Y, btnW, btnH, slant);
      ctx.stroke();

      // Ícone Disquete
      ctx.font = '9px monospace';
      ctx.fillStyle = '#0F172A';
      ctx.fillText('💾', btnX + 18, btn1_Y + btnH / 2);

      ctx.font = 'italic 900 9.5px monospace';
      ctx.fillStyle = '#082F49';
      ctx.fillText('CONTINUAR (SAVE)', btnX + btnW / 2 + 6, btn1_Y + btnH / 2 + 0.5);

      if (isSel1 && arrowFlash) {
        ctx.font = 'bold 8.5px monospace';
        ctx.fillStyle = '#00E5FF';
        ctx.fillText('►', btnX - 7, btn1_Y + btnH / 2);
        ctx.fillText('◄', btnX + btnW + slant + 5, btn1_Y + btnH / 2);
      }

      // Dica de controle abaixo dos botões
      const hintY = btn1_Y + btnH + 13;
      if (this.audio && this.audio.ctx && this.audio.ctx.state !== 'running') {
        const audioPulse = 0.5 + 0.5 * Math.sin(now * 0.008);
        ctx.fillStyle = `rgba(255, 235, 59, ${0.75 + 0.25 * audioPulse})`;
        ctx.font = touchSafe ? 'bold 5.8px monospace' : 'bold 6.6px monospace';
        ctx.fillText('🔊 CLIQUE NA TELA OU PRESSIONE UMA TECLA PARA ATIVAR O SOM', cx, hintY);
      } else if (this.input.gamepadConnected) {
        ctx.fillStyle = '#00E5FF';
        ctx.font = touchSafe ? 'bold 6.5px monospace' : 'bold 7.2px monospace';
        ctx.fillText('🎮 [D-PAD] NAVEGA | [A] CONFIRMA', cx, hintY);
      } else {
        ctx.fillStyle = '#B0BEC5';
        ctx.font = touchSafe ? '6.2px monospace' : '7px monospace';
        ctx.fillText('TOQUE NO BOTÃO OU [↑↓] + [ENTER] / [A]', cx, hintY);
      }

      // =========================================================================
      // 4. CRÉDITOS DO DESENVOLVEDOR NO RODAPÉ
      // =========================================================================
      const creditsY = touchSafe ? 194 : 204;
      const creditsText = 'Desenvolvido por Leandro Yata - 2026 - (75) 99190-2534';

      ctx.font = 'bold 6.2px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const creditW = ctx.measureText(creditsText).width;

      const cGradL = ctx.createLinearGradient(cx - creditW / 2 - 25, creditsY, cx - creditW / 2 - 4, creditsY);
      cGradL.addColorStop(0, 'rgba(255, 180, 0, 0)');
      cGradL.addColorStop(1, 'rgba(255, 180, 0, 0.8)');
      ctx.fillStyle = cGradL;
      ctx.fillRect(cx - creditW / 2 - 25, creditsY - 0.5, 21, 1.0);

      const cGradR = ctx.createLinearGradient(cx + creditW / 2 + 4, creditsY, cx + creditW / 2 + 25, creditsY);
      cGradR.addColorStop(0, 'rgba(255, 180, 0, 0.8)');
      cGradR.addColorStop(1, 'rgba(255, 180, 0, 0)');
      ctx.fillStyle = cGradR;
      ctx.fillRect(cx + creditW / 2 + 4, creditsY - 0.5, 21, 1.0);

      ctx.fillStyle = '#060410';
      ctx.fillText(creditsText, cx + 0.5, creditsY + 0.5);
      ctx.fillStyle = '#FFD54F';
      ctx.fillText(creditsText, cx, creditsY);

      ctx.restore();
    }

    renderModeSelect(ctx) {
      const L = this.getModeSelectLayout();
      const touchSafe = L.touchSafe;
      const now = performance.now();

      // Fundo escuro translúcido revelando a pista ao fundo
      ctx.fillStyle = 'rgba(6, 9, 18, 0.82)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00E5FF';
      ctx.font = touchSafe ? 'bold 11px monospace' : 'bold 13px monospace';
      ctx.fillText('MODOS DE JOGO', INTERNAL_WIDTH / 2, touchSafe ? 19 : 23);

      ctx.fillStyle = '#FFD700';
      ctx.font = touchSafe ? 'bold 6.8px monospace' : 'bold 7.8px monospace';
      ctx.fillText('SELECIONE O TIPO DE DISPUTA', INTERNAL_WIDTH / 2, touchSafe ? 29 : 33);

      const modes = [
        {
          id: 0,
          title: 'CAMPEONATO F1',
          icon: '🏆',
          badge: 'TEMPORADA COMPLETA',
          color: '#FFD700',
          lines: [
            `• ${TRACK_DEFINITIONS.length} ETAPAS (FINAL EM SP)`,
            '• PONTUAÇÃO F1 (1º AO 10º)',
            '• DISPUTA DO TÍTULO & PÓDIO'
          ],
          box: L.card0
        },
        {
          id: 1,
          title: 'CORRIDA RÁPIDA',
          icon: '⚡',
          badge: 'AÇÃO IMEDIATA',
          color: '#00E5FF',
          lines: [
            '• ESCOLHA 1 CIRCUITO',
            '• DUELO CONTRA 19 BOTS',
            '• RESULTADO DIRETO'
          ],
          box: L.card1
        }
      ];

      for (let m = 0; m < modes.length; m++) {
        const item = modes[m];
        const isSelected = (this.selectedModeIndex === item.id);
        const { x, y, w, h } = item.box;

        // Fundo do card
        const cardGrad = ctx.createLinearGradient(x, y, x, y + h);
        if (isSelected) {
          cardGrad.addColorStop(0, 'rgba(18, 30, 52, 0.96)');
          cardGrad.addColorStop(1, 'rgba(10, 16, 30, 0.98)');
        } else {
          cardGrad.addColorStop(0, 'rgba(12, 16, 26, 0.88)');
          cardGrad.addColorStop(1, 'rgba(6, 9, 16, 0.92)');
        }
        ctx.fillStyle = cardGrad;
        ctx.fillRect(x, y, w, h);

        // Borda com brilho se selecionado
        if (isSelected) {
          ctx.strokeStyle = item.color;
          ctx.lineWidth = 1.8;
          ctx.strokeRect(x, y, w, h);

          ctx.fillStyle = item.color;
          ctx.fillRect(x + 2, y + 2, w - 4, 3);
        } else {
          ctx.strokeStyle = 'rgba(70, 90, 120, 0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, h);
        }

        // Tag superior
        ctx.fillStyle = isSelected ? item.color : '#78909C';
        ctx.font = 'bold 6.2px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`[ ${item.badge} ]`, x + w / 2, y + 14);

        // Ícone grande
        ctx.font = '18px monospace';
        ctx.fillText(item.icon, x + w / 2, y + 36);

        // Título do modo
        ctx.fillStyle = isSelected ? '#FFFFFF' : '#B0BEC5';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(item.title, x + w / 2, y + 54);

        // Linha divisória
        ctx.fillStyle = isSelected ? item.color : 'rgba(100, 120, 150, 0.3)';
        ctx.fillRect(x + 14, y + 60, w - 28, 1);

        // Linhas de descrição
        ctx.textAlign = 'left';
        ctx.font = '6.8px monospace';
        ctx.fillStyle = isSelected ? '#E2E8F0' : '#8898AA';
        for (let l = 0; l < item.lines.length; l++) {
          ctx.fillText(item.lines[l], x + 12, y + 74 + l * 13);
        }

        // Status no rodapé do card
        ctx.textAlign = 'center';
        if (isSelected) {
          const blink = Math.floor(now / 320) % 2 === 0;
          ctx.fillStyle = blink ? item.color : '#FFFFFF';
          ctx.font = 'bold 7.2px monospace';
          ctx.fillText('▶ SELECIONADO ◀', x + w / 2, y + h - 10);
        } else {
          ctx.fillStyle = '#64748B';
          ctx.font = '6.5px monospace';
          ctx.fillText('TOQUE PARA ESCOLHER', x + w / 2, y + h - 10);
        }
      }

      // Botões inferiores: VOLTAR e CONFIRMAR
      const btnB = L.btnBack;
      if (btnB) {
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.fillStyle = '#EF4444';
        ctx.font = touchSafe ? 'bold 6.8px monospace' : 'bold 7.5px monospace';
        ctx.fillText('◀ VOLTAR', btnB.x + btnB.w / 2, btnB.y + btnB.h / 2 + 2.5);
      }

      const btnC = L.btnConfirm;
      if (btnC) {
        ctx.fillStyle = '#065F46';
        ctx.fillRect(btnC.x, btnC.y, btnC.w, btnC.h);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(btnC.x, btnC.y, btnC.w, btnC.h);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = touchSafe ? 'bold 7.2px monospace' : 'bold 8px monospace';
        ctx.fillText('CONTINUAR ▶', btnC.x + btnC.w / 2, btnC.y + btnC.h / 2 + 2.5);
      }

      ctx.restore();
    }

    renderTrackSelect(ctx) {
      const L = this.getTrackSelectLayout();
      const touchSafe = L.touchSafe;
      const now = performance.now();
      const track = TRACK_DEFINITIONS[this.selectedQuickTrackIndex] || TRACK_DEFINITIONS[0];

      // Fundo escuro translúcido permitindo ver o circuito e monumentos rolando em 3D atrás!
      ctx.fillStyle = 'rgba(6, 9, 18, 0.82)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00E5FF';
      ctx.font = touchSafe ? 'bold 9.5px monospace' : 'bold 10.5px monospace';
      ctx.fillText('CIRCUITOS DO BRASIL — 4 CLÁSSICAS & 27 CAPITAIS', INTERNAL_WIDTH / 2, touchSafe ? 9.5 : 10.5);

      // 1. Grade de Chips (Fileira Clássica Dourada + 27 Capitais)
      for (let c = 0; c < L.chips.length; c++) {
        const chip = L.chips[c];
        const isSel = (this.selectedQuickTrackIndex === chip.i);
        const tDef = TRACK_DEFINITIONS[chip.i];
        const stateTxt = chip.isClassic 
          ? `★ ${tDef.stateCode || tDef.name.split(' ')[0]}`
          : (tDef.stateCode || (chip.i - 3));

        if (chip.isClassic) {
          ctx.fillStyle = isSel ? '#FFD700' : 'rgba(245, 158, 11, 0.22)';
          ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
          ctx.strokeStyle = isSel ? '#FFFFFF' : '#F59E0B';
          ctx.lineWidth = isSel ? 1.3 : 0.8;
          ctx.strokeRect(chip.x, chip.y, chip.w, chip.h);
          ctx.fillStyle = isSel ? '#041019' : '#FDE68A';
          ctx.font = 'bold 5.8px monospace';
        } else {
          ctx.fillStyle = isSel ? '#00E5FF' : 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
          ctx.strokeStyle = isSel ? '#FFD700' : 'rgba(70, 90, 120, 0.4)';
          ctx.lineWidth = isSel ? 1.2 : 0.6;
          ctx.strokeRect(chip.x, chip.y, chip.w, chip.h);
          ctx.fillStyle = isSel ? '#041019' : '#CBD5E1';
          ctx.font = 'bold 5.6px monospace';
        }
        ctx.textAlign = 'center';
        ctx.fillText(stateTxt, chip.x + chip.w / 2, chip.y + chip.h * 0.75);
      }

      // 2. Card Central da Capital & Monumento
      const { bX, bY, bW, bH } = L;
      const cardGrad = ctx.createLinearGradient(bX, bY, bX, bY + bH);
      cardGrad.addColorStop(0, 'rgba(14, 22, 38, 0.95)');
      cardGrad.addColorStop(1, 'rgba(8, 12, 22, 0.97)');
      ctx.fillStyle = cardGrad;
      ctx.fillRect(bX, bY, bW, bH);

      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(bX, bY, bW, bH);

      // Faixa superior colorida do card
      ctx.fillStyle = '#00E5FF';
      ctx.fillRect(bX + 2, bY + 2, bW - 4, 2.5);

      // Título: [ 01 / 27 ]  CAPITAL • UF
      const numStr = (this.selectedQuickTrackIndex + 1 < 10 ? '0' : '') + (this.selectedQuickTrackIndex + 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`[ ${numStr} / ${TRACK_DEFINITIONS.length} ]  ${track.name}`, bX + bW / 2, bY + 13);

      // Subtítulo do Monumento
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 6.2px monospace';
      ctx.fillText(`${track.flag} MONUMENTO: ${track.monument}`, bX + bW / 2, bY + 22);

      // Linha divisória
      ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
      ctx.fillRect(bX + 8, bY + 26, bW - 16, 1);

      // Lado Esquerdo do Card: Minimapa da Pista
      const mapBoxW = 75;
      const mapBoxH = 65;
      const mapX = bX + 10;
      const mapY = bY + 31;

      ctx.fillStyle = 'rgba(4, 8, 16, 0.75)';
      ctx.fillRect(mapX, mapY, mapBoxW, mapBoxH);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(mapX, mapY, mapBoxW, mapBoxH);

      // Renderiza o traçado vetorial do minimapa
      if (this.track && this.track.mapPoints) {
        const pts = this.track.mapPoints;
        ctx.strokeStyle = '#263238';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const mx = mapX + 5 + pts[i].x * (mapBoxW - 10);
          const my = mapY + 5 + pts[i].z * (mapBoxH - 10);
          if (i === 0) ctx.moveTo(mx, my);
          else ctx.lineTo(mx, my);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Ponto de largada / chegada (Verde)
        if (pts.length > 0) {
          const startX = mapX + 5 + pts[0].x * (mapBoxW - 10);
          const startY = mapY + 5 + pts[0].z * (mapBoxH - 10);
          ctx.fillStyle = '#00E676';
          ctx.beginPath();
          ctx.arc(startX, startY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Distância do circuito abaixo do mapa
      const kmStr = (this.track ? (this.track.totalLength / 1000).toFixed(1) : '3.2') + ' KM';
      ctx.fillStyle = '#FEDD00';
      ctx.font = 'bold 5.8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`CIRCUITO: ${kmStr}`, mapX + mapBoxW / 2, mapY + mapBoxH + 9);

      // Lado Direito do Card: Detalhes, Vibe e Monumento
      const infoX = bX + mapBoxW + 18;
      ctx.textAlign = 'left';

      // Linha 1: Região / Vibe
      ctx.fillStyle = '#00E5FF';
      ctx.font = 'bold 6.2px monospace';
      ctx.fillText(`• ESTILO: ${track.themeTag}`, infoX, bY + 38);

      // Linha 2: Clima Padrão
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '6px monospace';
      ctx.fillText(`• CLIMA PADRÃO: ${track.theme}`, infoX, bY + 50);

      // Linha 3: Voltas
      ctx.fillStyle = '#E2E8F0';
      ctx.fillText(`• PROVA: ${TOTAL_LAPS} VOLTAS`, infoX, bY + 62);

      // Linha 4: Destaque Arquitetônico / Ponto Turístico
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 6px monospace';
      ctx.fillText(`• PONTO TURÍSTICO:`, infoX, bY + 74);
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '5.6px monospace';
      ctx.fillText(`${track.monument}`, infoX, bY + 84);

      // Tag de status selecionado
      const blink = Math.floor(now / 300) % 2 === 0;
      ctx.fillStyle = blink ? '#00E5FF' : '#FFFFFF';
      ctx.font = 'bold 6.2px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▶ CIRCUITO PRONTO PARA CORRER ◀', bX + bW / 2, bY + bH - 6);

      // Setas laterais de navegação ◀ e ▶
      const drawSideArrow = (btn, isLeft) => {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 1;
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
        ctx.fillStyle = '#00E5FF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isLeft ? '◀' : '▶', btn.x + btn.w / 2, btn.y + btn.h / 2 + 3.5);
      };
      if (L.btnPrev) drawSideArrow(L.btnPrev, true);
      if (L.btnNext) drawSideArrow(L.btnNext, false);

      // Botões inferiores: VOLTAR e ESCOLHER CARRO
      const btnB = L.btnBack;
      if (btnB) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.fillStyle = '#EF4444';
        ctx.font = touchSafe ? 'bold 6.8px monospace' : 'bold 7.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('◀ VOLTAR [B]', btnB.x + btnB.w / 2, btnB.y + btnB.h / 2 + 2.5);
      }

      const btnC = L.btnConfirm;
      if (btnC) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
        ctx.fillRect(btnC.x, btnC.y, btnC.w, btnC.h);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(btnC.x, btnC.y, btnC.w, btnC.h);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = touchSafe ? 'bold 7.2px monospace' : 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ESCOLHER CARRO [A] ▶', btnC.x + btnC.w / 2, btnC.y + btnC.h / 2 + 2.5);
      }

      ctx.restore();
    }

    renderNameInput(ctx) {
      const touchSafe = this.input.touchControlsVisible;
      const now = performance.now();
      const car = CAR_MODELS[this.selectedCarIndex];
      const color = CAR_COLORS[this.colorIndex];

      ctx.fillStyle = 'rgba(6, 9, 18, 0.88)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();
      ctx.textAlign = 'center';

      // Titulo
      ctx.fillStyle = '#00E5FF';
      ctx.font = touchSafe ? 'bold 11px monospace' : 'bold 13px monospace';
      ctx.fillText('IDENTIFICA\u00C7\u00C3O DO PILOTO', INTERNAL_WIDTH / 2, touchSafe ? 24 : 28);

      // Caixa Central Elegante
      const boxW = touchSafe ? 220 : 250;
      const boxH = touchSafe ? 130 : 142;
      const boxX = INTERNAL_WIDTH / 2 - boxW / 2;
      const boxY = touchSafe ? 36 : 42;

      ctx.fillStyle = 'rgba(14, 22, 38, 0.94)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Miniatura do carro escolhido
      CarArt.renderModel(
        ctx,
        car,
        INTERNAL_WIDTH / 2,
        boxY + (touchSafe ? 34 : 38),
        touchSafe ? 88 : 98,
        touchSafe ? 55 : 62,
        false,
        0,
        color.hex,
        { isNitro: false, wheelPhase: now * 0.012, isNight: false, speed: 0 }
      );

      ctx.fillStyle = '#B0BEC5';
      ctx.font = 'bold 8.5px monospace';
      ctx.fillText(`${car.name} - ${color.name}`, INTERNAL_WIDTH / 2, boxY + (touchSafe ? 58 : 64));

      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('DIGITE SEU NOME DE PILOTO ABAIXO:', INTERNAL_WIDTH / 2, boxY + (touchSafe ? 74 : 80));

      // Botões VOLTAR e CONFIRMAR
      const btnW = touchSafe ? 88 : 100;
      const btnH = touchSafe ? 18 : 20;
      const btnY = boxY + boxH - (touchSafe ? 24 : 26);
      const btnBackX = boxX + 12;
      const btnConfirmX = boxX + boxW - 12 - btnW;
      const blink = Math.floor(now / 350) % 2 === 0;

      // Botão ◀ VOLTAR
      const backGrad = ctx.createLinearGradient(btnBackX, btnY, btnBackX, btnY + btnH);
      backGrad.addColorStop(0, '#2C3E50');
      backGrad.addColorStop(1, '#1A252F');
      ctx.fillStyle = backGrad;
      ctx.fillRect(btnBackX, btnY, btnW, btnH);
      ctx.strokeStyle = '#E74C3C';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(btnBackX, btnY, btnW, btnH);
      ctx.fillStyle = '#ECF0F1';
      ctx.font = touchSafe ? 'bold 8px monospace' : 'bold 9px monospace';
      ctx.fillText('◀ VOLTAR [B]', btnBackX + btnW / 2, btnY + btnH / 2 + 3);

      // Botão CONFIRMAR ▶
      const confirmGrad = ctx.createLinearGradient(btnConfirmX, btnY, btnConfirmX, btnY + btnH);
      confirmGrad.addColorStop(0, blink ? '#00E5FF' : '#00B0FF');
      confirmGrad.addColorStop(1, blink ? '#0091EA' : '#005F9E');
      ctx.fillStyle = confirmGrad;
      ctx.fillRect(btnConfirmX, btnY, btnW, btnH);
      ctx.strokeStyle = blink ? '#FFFFFF' : '#FFD700';
      ctx.lineWidth = 1.3;
      ctx.strokeRect(btnConfirmX, btnY, btnW, btnH);
      ctx.fillStyle = '#060D1A';
      ctx.font = touchSafe ? 'bold 8px monospace' : 'bold 9px monospace';
      ctx.fillText('CONFIRMAR [A] ▶', btnConfirmX + btnW / 2, btnY + btnH / 2 + 3);

      ctx.fillStyle = '#90A4AE';
      ctx.font = touchSafe ? '6.5px monospace' : '7.5px monospace';
      ctx.fillText('[A] / [ENTER] CONFIRMAR | [B] / [ESC] VOLTAR AO CARRO', INTERNAL_WIDTH / 2, touchSafe ? 182 : 204);

      ctx.restore();
    }

    wrapText(ctx, text, maxWidth) {
      if (!text) return [];
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    }

    renderCarSelect(ctx) {
      const L = this.getCarSelectLayout();
      const touchSafe = L.touchSafe;

      // Fundo translúcido deixando a pista rolar suavemente atrás da garagem
      ctx.fillStyle = 'rgba(6, 9, 18, 0.82)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00E5FF';
      ctx.font = touchSafe ? 'bold 9px monospace' : 'bold 11px monospace';
      ctx.fillText('GARAGEM LH44 — ESCOLHA SUA MÁQUINA', INTERNAL_WIDTH / 2, touchSafe ? 11 : 12);

      const CAR_SHORT_NAMES = [
        '1 UNO',    '2 FUS',    '3 206',    '4 HB2',    '5 OPA',
        '6 GOL',    '7 CHE',    '8 BRA',    '9 COR',    '10 CEL',
        '11 ONX',   '12 KA',    '13 PAL',   '14 KWI',   '15 FOC',
        '16 SAN',   '17 MOB',   '18 SNT',   '19 RUR',   '20 KOM'
      ];

      // Grade dos 20 carros no topo (2 linhas x 10 colunas)
      if (L.chips) {
        for (let c = 0; c < L.chips.length; c++) {
          const chip = L.chips[c];
          const isSel = (chip.i === this.selectedCarIndex);

          if (isSel) {
            const selGrad = ctx.createLinearGradient(chip.x, chip.y, chip.x, chip.y + chip.h);
            selGrad.addColorStop(0, '#00E5FF');
            selGrad.addColorStop(1, '#0284C7');
            ctx.fillStyle = selGrad;
            ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(chip.x, chip.y, chip.w, chip.h);

            ctx.fillStyle = '#060D1A';
            ctx.font = `900 ${touchSafe ? 5.8 : 6.4}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(CAR_SHORT_NAMES[chip.i] || `${chip.i + 1}`, chip.x + chip.w / 2, chip.y + chip.h * 0.78);
          } else {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
            ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(chip.x, chip.y, chip.w, chip.h);

            ctx.fillStyle = '#94A3B8';
            ctx.font = `bold ${touchSafe ? 5.4 : 6.0}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(CAR_SHORT_NAMES[chip.i] || `${chip.i + 1}`, chip.x + chip.w / 2, chip.y + chip.h * 0.78);
          }
        }
      }

      const car = CAR_MODELS[this.selectedCarIndex];
      const color = CAR_COLORS[this.colorIndex];
      const now = performance.now();
      const { bW, bH, bX, bY } = L;

      // Card principal do showroom
      const panelGrad = ctx.createLinearGradient(0, bY, 0, bY + bH);
      panelGrad.addColorStop(0, 'rgba(16, 22, 36, 0.95)');
      panelGrad.addColorStop(1, 'rgba(9, 13, 22, 0.97)');
      ctx.fillStyle = panelGrad;
      ctx.fillRect(bX, bY, bW, bH);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1.1;
      ctx.strokeRect(bX, bY, bW, bH);

      // Botões laterais ◀ ▶ de navegação
      const pulseX = Math.sin(now * 0.006) * 2;
      ctx.fillStyle = '#00E5FF';
      ctx.font = touchSafe ? 'bold 15px monospace' : 'bold 18px monospace';
      ctx.fillText('◀', bX - 12 - pulseX, bY + bH / 2 + 5);
      ctx.fillText('▶', bX + bW + 12 + pulseX, bY + bH / 2 + 5);

      // Plataforma iluminada centralizada
      const platX = INTERNAL_WIDTH / 2;
      const platY = bY + (touchSafe ? 38 : 43);
      ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
      ctx.beginPath();
      ctx.ellipse(platX, platY, touchSafe ? 52 : 66, touchSafe ? 8.5 : 10.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(platX, platY, touchSafe ? 48 : 62, touchSafe ? 7.0 : 8.8, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Carro em exibição na plataforma giratória charmosa movimentando suavemente de um lado para o outro
      const showcaseSteer = Math.sin(now * 0.0020) * 0.76;
      const showcaseBrake = (Math.floor(now / 1800) % 4 === 0);
      car.render(
        ctx,
        platX,
        bY + (touchSafe ? 25 : 29),
        touchSafe ? 84 : 98,
        touchSafe ? 52 : 62,
        showcaseBrake,
        showcaseSteer,
        color.hex,
        {
          isNitro: false,
          wheelPhase: now * 0.008,
          isNight: true,
          speed: 0
        }
      );

      // Identificação e número do carro selecionado posicionado com folga e destaque ABAIXO do carro (sem invadir tetos ou escadas)
      const carIdxNum = (this.selectedCarIndex + 1).toString().padStart(2, '0');
      const badgeTitleY = bY + (touchSafe ? 53 : 60);
      const badgeTitleW = Math.min(bW - 24, 200);
      const badgeTitleH = touchSafe ? 11 : 12;
      ctx.fillStyle = 'rgba(6, 12, 22, 0.88)';
      ctx.fillRect(INTERNAL_WIDTH / 2 - badgeTitleW / 2, badgeTitleY - badgeTitleH + 2.5, badgeTitleW, badgeTitleH);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(INTERNAL_WIDTH / 2 - badgeTitleW / 2, badgeTitleY - badgeTitleH + 2.5, badgeTitleW, badgeTitleH);

      ctx.fillStyle = '#FFD700';
      ctx.font = touchSafe ? 'bold 6.8px monospace' : 'bold 7.8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`[ ${carIdxNum} / 20 ]  ${car.name}`, INTERNAL_WIDTH / 2, badgeTitleY);

      // Barras de estatísticas dinâmicas
      const statW = Math.floor((bW - 32) / 3);
      const s1 = bX + 10;
      const s2 = s1 + statW + 6;
      const s3 = s2 + statW + 6;
      const statY = bY + (touchSafe ? 69 : 78);
      const isAdv = (this.diffMode === 'ADVANCED');
      const dispSpeed = isAdv ? 280 : car.maxSpeed;
      const speedRatio = (dispSpeed - 190) / 115;
      const speedLabel = isAdv ? 'VEL. (280 FIXO)' : 'VELOCIDADE';
      this.drawStat(ctx, s1, statY, speedLabel, speedRatio, '#FF5252', statW);
      this.drawStat(ctx, s2, statY, 'ACELERAÇÃO', car.acceleration, '#FFB300', statW);
      this.drawStat(ctx, s3, statY, 'CONTROLE', car.handling, '#00E676', statW);

      // Descrição do carro com quebra automática de linha contida estritamente dentro do retângulo azul
      ctx.textAlign = 'center';
      ctx.fillStyle = '#CFD8DC';
      ctx.font = touchSafe ? '5.4px monospace' : '6.4px monospace';
      const descLines = this.wrapText(ctx, car.desc, bW - 24);
      const descLineH = touchSafe ? 7.2 : 8.4;
      const descStartY = bY + (touchSafe ? 88 : 98);
      for (let li = 0; li < descLines.length; li++) {
        ctx.fillText(descLines[li], INTERNAL_WIDTH / 2, descStartY + li * descLineH);
      }

      const blink = Math.floor(now / 380) % 2 === 0;

      // BOTÃO ◀ VOLTAR
      const btnB = L.btnBack;
      if (btnB) {
        const backGrad = ctx.createLinearGradient(btnB.x, btnB.y, btnB.x, btnB.y + btnB.h);
        backGrad.addColorStop(0, '#2C3E50');
        backGrad.addColorStop(1, '#1A252F');
        ctx.fillStyle = backGrad;
        ctx.fillRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.strokeStyle = '#E74C3C';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.fillStyle = '#ECF0F1';
        ctx.font = touchSafe ? 'bold 7.8px monospace' : 'bold 8.8px monospace';
        ctx.fillText('◀ VOLTAR [B]', btnB.x + btnB.w / 2, btnB.y + btnB.h / 2 + 3);
      }

      // BOTÃO ESCOLHER COR ▶
      const btnC = L.btnConfirm;
      if (btnC) {
        const confirmGrad = ctx.createLinearGradient(btnC.x, btnC.y, btnC.x, btnC.y + btnC.h);
        confirmGrad.addColorStop(0, blink ? '#00E5FF' : '#00B0FF');
        confirmGrad.addColorStop(1, blink ? '#0091EA' : '#005F9E');
        ctx.fillStyle = confirmGrad;
        ctx.fillRect(btnC.x, btnC.y, btnC.w, btnC.h);
        ctx.strokeStyle = blink ? '#FFFFFF' : '#FFD700';
        ctx.lineWidth = 1.3;
        ctx.strokeRect(btnC.x, btnC.y, btnC.w, btnC.h);
        ctx.fillStyle = '#060D1A';
        ctx.font = touchSafe ? 'bold 7.8px monospace' : 'bold 8.8px monospace';
        ctx.fillText('ESCOLHER COR [A] ▶', btnC.x + btnC.w / 2, btnC.y + btnC.h / 2 + 3);
      }

      ctx.fillStyle = '#90A4AE';
      ctx.font = touchSafe ? '6.0px monospace' : '7.2px monospace';
      ctx.fillText(
        touchSafe
          ? '◄ ► ▲ ▼ TROCA CARRO | TOQUE NO CARRO | [A] ESCOLHER COR | [B] VOLTAR'
          : '◄ ► ▲ ▼ NAVEGA NOS 20 CARROS | CLIQUE NO CARRO | [A] / ENTER ESCOLHER COR | [B] VOLTAR',
        INTERNAL_WIDTH / 2,
        touchSafe ? 193 : 209
      );
      ctx.restore();
    }

    // ========================================================
    // RENDERIZAÇÃO DA ETAPA 2: ESCOLHA DE COR DO CARRO
    // ========================================================
    renderColorSelect(ctx) {
      const L = this.getColorSelectLayout();
      const touchSafe = L.touchSafe;

      // Fundo translúcido deixando a pista rolar suavemente atrás da garagem
      ctx.fillStyle = 'rgba(6, 9, 18, 0.85)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00E5FF';
      ctx.font = touchSafe ? 'bold 9px monospace' : 'bold 11px monospace';
      ctx.fillText('GARAGEM LH44 — ESCOLHA A COR DA SUA MÁQUINA', INTERNAL_WIDTH / 2, touchSafe ? 11 : 12);

      const car = CAR_MODELS[this.selectedCarIndex];
      const color = CAR_COLORS[this.colorIndex];
      const now = performance.now();
      const { bW, bH, bX, bY, sw } = L;

      // Card principal de personalização
      const panelGrad = ctx.createLinearGradient(0, bY, 0, bY + bH);
      panelGrad.addColorStop(0, 'rgba(16, 22, 36, 0.96)');
      panelGrad.addColorStop(1, 'rgba(9, 13, 22, 0.98)');
      ctx.fillStyle = panelGrad;
      ctx.fillRect(bX, bY, bW, bH);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(bX, bY, bW, bH);

      // Botões laterais ◀ ▶ de navegação de cor
      const pulseX = Math.sin(now * 0.006) * 2;
      ctx.fillStyle = '#00E5FF';
      ctx.font = touchSafe ? 'bold 16px monospace' : 'bold 20px monospace';
      ctx.fillText('◀', bX - 14 - pulseX, bY + bH / 2 + 5);
      ctx.fillText('▶', bX + bW + 14 + pulseX, bY + bH / 2 + 5);

      // Plataforma iluminada centralizada
      const platX = INTERNAL_WIDTH / 2;
      const platY = bY + (touchSafe ? 50 : 58);
      ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.beginPath();
      ctx.ellipse(platX, platY, touchSafe ? 62 : 78, touchSafe ? 11 : 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(platX, platY, touchSafe ? 56 : 72, touchSafe ? 9 : 11.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Carro em exibição na cor selecionada com movimento suave de um lado para o outro
      const showcaseSteerColor = Math.sin(now * 0.0020) * 0.76;
      const showcaseBrakeColor = (Math.floor(now / 1800) % 4 === 0);
      car.render(
        ctx,
        platX,
        bY + (touchSafe ? 33 : 39),
        touchSafe ? 96 : 116,
        touchSafe ? 60 : 72,
        showcaseBrakeColor,
        showcaseSteerColor,
        color.hex,
        {
          isNitro: false,
          wheelPhase: now * 0.008,
          isNight: true,
          speed: 0
        }
      );

      // Badge com o nome do carro e cor selecionada (posicionado com segurança abaixo da plataforma)
      const colIdxNum = (this.colorIndex + 1).toString().padStart(2, '0');
      const badgeY = bY + (touchSafe ? 69 : 79);
      const badgeW = Math.min(bW - 24, 215);
      const badgeH = touchSafe ? 12 : 13.5;
      ctx.fillStyle = 'rgba(6, 12, 22, 0.88)';
      ctx.fillRect(INTERNAL_WIDTH / 2 - badgeW / 2, badgeY, badgeW, badgeH);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 0.85;
      ctx.strokeRect(INTERNAL_WIDTH / 2 - badgeW / 2, badgeY, badgeW, badgeH);
      ctx.fillStyle = '#FFD700';
      ctx.font = `bold ${touchSafe ? 6.4 : 7.4}px monospace`;
      ctx.fillText(`[ ETAPA 2/2 ]  ${car.name} · COR ${colIdxNum}/10 (${color.name.toUpperCase()})`, INTERNAL_WIDTH / 2, badgeY + (touchSafe ? 8.6 : 9.8));

      // 10 Amostras circulares de cores com destaque pulsante
      if (sw) {
        for (let k = 0; k < sw.length; k++) {
          const s = sw[k];
          const selected = (s.i === this.colorIndex);

          if (selected) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r + 3.8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 229, 255, 0.30)';
            ctx.fill();
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2.2;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r + (selected ? 1.0 : 0), 0, Math.PI * 2);
          ctx.fillStyle = CAR_COLORS[s.i].hex;
          ctx.fill();
          ctx.lineWidth = selected ? 1.8 : 1.0;
          ctx.strokeStyle = selected ? '#FFFFFF' : 'rgba(200, 215, 230, 0.55)';
          ctx.stroke();

          // Ponto de brilho interno se selecionada
          if (selected) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
          }

          // Número do atalho (1 a 10) abaixo de cada amostra
          ctx.fillStyle = selected ? '#FFD700' : '#64748B';
          ctx.font = `bold ${touchSafe ? 5.2 : 6.0}px monospace`;
          ctx.fillText(`${(s.i + 1) % 10}`, s.x, s.y + s.r + (touchSafe ? 8 : 9));
        }
      }

      const blink = Math.floor(now / 380) % 2 === 0;

      // BOTÃO ◀ VOLTAR AO CARRO
      const btnB = L.btnBack;
      if (btnB) {
        const backGrad = ctx.createLinearGradient(btnB.x, btnB.y, btnB.x, btnB.y + btnB.h);
        backGrad.addColorStop(0, '#2C3E50');
        backGrad.addColorStop(1, '#1A252F');
        ctx.fillStyle = backGrad;
        ctx.fillRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.strokeStyle = '#E74C3C';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.fillStyle = '#ECF0F1';
        ctx.font = touchSafe ? 'bold 7.8px monospace' : 'bold 8.8px monospace';
        ctx.fillText('◀ VOLTAR [B]', btnB.x + btnB.w / 2, btnB.y + btnB.h / 2 + 3);
      }

      // BOTÃO CONFIRMAR COR ▶
      const btnC = L.btnConfirm;
      if (btnC) {
        const confirmGrad = ctx.createLinearGradient(btnC.x, btnC.y, btnC.x, btnC.y + btnC.h);
        confirmGrad.addColorStop(0, blink ? '#00E5FF' : '#00B0FF');
        confirmGrad.addColorStop(1, blink ? '#0091EA' : '#005F9E');
        ctx.fillStyle = confirmGrad;
        ctx.fillRect(btnC.x, btnC.y, btnC.w, btnC.h);
        ctx.strokeStyle = blink ? '#FFFFFF' : '#FFD700';
        ctx.lineWidth = 1.3;
        ctx.strokeRect(btnC.x, btnC.y, btnC.w, btnC.h);
        ctx.fillStyle = '#060D1A';
        ctx.font = touchSafe ? 'bold 7.8px monospace' : 'bold 8.8px monospace';
        ctx.fillText('CONFIRMAR [A] ▶', btnC.x + btnC.w / 2, btnC.y + btnC.h / 2 + 3);
      }

      ctx.fillStyle = '#90A4AE';
      ctx.font = touchSafe ? '6.0px monospace' : '7.2px monospace';
      ctx.fillText(
        touchSafe
          ? '◄ ► TROCA COR | TOQUE NA COR | [A] CONFIRMAR | [B] VOLTAR'
          : '◄ ► ESCOLHE A COR | CLIQUE NA COR OU TECLAS [C]/[1-0] | [A] / ENTER CONFIRMAR | [B] VOLTAR',
        INTERNAL_WIDTH / 2,
        touchSafe ? 193 : 209
      );
      ctx.restore();
    }

    renderRaceSetup(ctx) {
      const L = this.getSetupLayout();
      const touchSafe = L.touchSafe;
      const now = performance.now();

      ctx.fillStyle = 'rgba(6, 9, 18, 0.85)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00E5FF';
      ctx.font = touchSafe ? 'bold 9px monospace' : 'bold 12px monospace';
      const def = TRACK_DEFINITIONS[this.trackIndex];
      const modeBadge = (this.gameMode === 'QUICK_RACE') ? '⚡ CORRIDA RÁPIDA' : `🏆 CAMPEONATO F1 (${this.trackIndex + 1}/${TRACK_DEFINITIONS.length})`;
      ctx.fillText(`PREPARAR — ${modeBadge}`, INTERNAL_WIDTH / 2, L.titleY);

      ctx.fillStyle = '#FFD700';
      ctx.font = touchSafe ? 'bold 6px monospace' : 'bold 7px monospace';
      ctx.fillText(`CIRCUITO: ${def.name.toUpperCase()} (3 VOLTAS)`, INTERNAL_WIDTH / 2, L.subY);

      // Grupo 1: horario / clima
      ctx.font = touchSafe ? 'bold 7px monospace' : 'bold 8px monospace';
      ctx.fillStyle = this.setupGroup === 0 ? '#FFD700' : '#90A4AE';
      ctx.fillText((this.setupGroup === 0 ? '\u25B6 ' : '') + 'HOR\u00C1RIO / CLIMA', INTERNAL_WIDTH / 2, L.label1Y);
      const chipFont = touchSafe ? 'bold 6px monospace' : 'bold 7px monospace';
      for (let k = 0; k < L.conds.length; k++) {
        const c = L.conds[k];
        const info = ENV_CONDITIONS[c.i];
        const selected = (info.id === this.envCond);
        ctx.fillStyle = selected ? 'rgba(255, 215, 0, 0.25)' : 'rgba(16, 24, 38, 0.92)';
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.strokeStyle = selected ? '#FFD700' : 'rgba(0, 229, 255, 0.35)';
        ctx.lineWidth = selected ? 1.5 : 1;
        ctx.strokeRect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = selected ? '#FFFFFF' : '#B0BEC5';
        ctx.font = chipFont;
        ctx.fillText(info.icon + ' ' + info.label, c.x + c.w / 2, c.y + c.h / 2 + 2.4);
      }

      // Grupo 2: musica
      ctx.font = touchSafe ? 'bold 7px monospace' : 'bold 8px monospace';
      ctx.fillStyle = this.setupGroup === 1 ? '#FFD700' : '#90A4AE';
      ctx.fillText((this.setupGroup === 1 ? '\u25B6 ' : '') + 'TRILHA SONORA', INTERNAL_WIDTH / 2, L.label2Y);
      const curSongIdx = (typeof this.songIndex === 'number' && this.songIndex >= 0 && this.songIndex < SONGS.length) ? this.songIndex : 0;
      const songChipFont = touchSafe ? 'bold 5.6px monospace' : 'bold 6.4px monospace';
      for (let k = 0; k < L.songs.length; k++) {
        const c = L.songs[k];
        const selected = (c.i === curSongIdx);
        ctx.fillStyle = selected ? 'rgba(255, 215, 0, 0.25)' : 'rgba(16, 24, 38, 0.92)';
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.strokeStyle = selected ? '#FFD700' : 'rgba(0, 229, 255, 0.35)';
        ctx.lineWidth = selected ? 1.5 : 1;
        ctx.strokeRect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = selected ? '#FFFFFF' : '#B0BEC5';
        ctx.font = songChipFont;
        ctx.fillText('\u266A ' + SONGS[c.i].name, c.x + c.w / 2, c.y + c.h / 2 + 2.2);
      }
      ctx.fillStyle = '#B0BEC5';
      ctx.font = touchSafe ? '5.8px monospace' : '6.8px monospace';
      const curSong = SONGS[curSongIdx] || SONGS[0];
      ctx.fillText(curSong.desc || '', INTERNAL_WIDTH / 2, L.descY);

      // Banner Informativo do Grid de Largada
      if (this.gameMode === 'CHAMPIONSHIP' && this.seasonBots && this.seasonBots.length >= 19) {
        const p19Idx = (this.seasonGridOrder && this.seasonGridOrder[18] !== undefined) ? this.seasonGridOrder[18] : 18;
        const p18Idx = (this.seasonGridOrder && this.seasonGridOrder[17] !== undefined) ? this.seasonGridOrder[17] : 17;
        const b19 = this.seasonBots[p19Idx] || this.seasonBots[18];
        const b18 = this.seasonBots[p18Idx] || this.seasonBots[17];
        const m19 = b19.model ? b19.model.name : 'RIVAL';
        const m18 = b18.model ? b18.model.name : 'RIVAL';

        const gW = L.gridW;
        const gH = L.gridH;
        const gX = Math.round(INTERNAL_WIDTH / 2 - gW / 2);
        const gY = L.gridY;
        ctx.fillStyle = 'rgba(255, 215, 0, 0.12)';
        ctx.fillRect(gX, gY, gW, gH);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(gX, gY, gW, gH);

        ctx.fillStyle = '#FFD700';
        ctx.font = touchSafe ? 'bold 5.8px monospace' : 'bold 6.6px monospace';
        ctx.fillText(`🏁 SEU GRID: P20 | AO SEU LADO (P19): ${m19} | À FRENTE (P18): ${m18}`, INTERNAL_WIDTH / 2, gY + gH / 2 + 2.0);
      }

      // Botões ◀ VOLTAR e ▶ INICIAR CORRIDA
      const blink = Math.floor(now / 350) % 2 === 0;
      const btnB = L.btnBack;
      if (btnB) {
        const backGrad = ctx.createLinearGradient(btnB.x, btnB.y, btnB.x, btnB.y + btnB.h);
        backGrad.addColorStop(0, '#2C3E50');
        backGrad.addColorStop(1, '#1A252F');
        ctx.fillStyle = backGrad;
        ctx.fillRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.strokeStyle = '#E74C3C';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(btnB.x, btnB.y, btnB.w, btnB.h);
        ctx.fillStyle = '#ECF0F1';
        ctx.font = touchSafe ? 'bold 8px monospace' : 'bold 9px monospace';
        ctx.fillText('◀ VOLTAR [B]', btnB.x + btnB.w / 2, btnB.y + btnB.h / 2 + 3);
      }

      const btnS = L.startBtn;
      if (btnS) {
        const btnGrad = ctx.createLinearGradient(btnS.x, btnS.y, btnS.x, btnS.y + btnS.h);
        btnGrad.addColorStop(0, blink ? '#00E5FF' : '#00B0FF');
        btnGrad.addColorStop(1, blink ? '#0091EA' : '#005F9E');
        ctx.fillStyle = btnGrad;
        ctx.fillRect(btnS.x, btnS.y, btnS.w, btnS.h);
        ctx.strokeStyle = blink ? '#FFFFFF' : '#FFD700';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(btnS.x, btnS.y, btnS.w, btnS.h);
        ctx.fillStyle = '#060D1A';
        ctx.font = touchSafe ? 'bold 8px monospace' : 'bold 9.5px monospace';
        ctx.fillText('CONFIRMAR [A] ▶', btnS.x + btnS.w / 2, btnS.y + btnS.h / 2 + 3);
      }

      ctx.fillStyle = '#90A4AE';
      ctx.font = touchSafe ? '6.3px monospace' : '7.5px monospace';
      ctx.fillText(touchSafe ? '[A] CONFIRMAR | [B] VOLTAR | D-PAD/TOQUE NAVEGA' : '[ENTER]/[A] CONFIRMAR | [ESC]/[B] VOLTAR | D-PAD SELECIONA', INTERNAL_WIDTH / 2, L.hintY);
      ctx.restore();
    }


    drawStat(ctx, x, y, label, ratio, color, w = 68) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 6.8px monospace';
      ctx.fillStyle = '#90A4AE';
      ctx.fillText(label, x, y);

      const h = 5.5;
      ctx.fillStyle = '#1B2432';
      ctx.fillRect(x, y + 3, w, h);
      const fillW = w * Math.max(0.1, Math.min(ratio, 1));
      ctx.fillStyle = color;
      ctx.fillRect(x, y + 3, fillW, h);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x, y + 3, fillW, 1.5);
    }

    renderPauseMenu(ctx) {
      const cx = INTERNAL_WIDTH / 2;
      const cy = INTERNAL_HEIGHT / 2;
      const touchSafe = this.input.touchControlsVisible;

      ctx.save();
      ctx.fillStyle = 'rgba(5, 8, 16, 0.85)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      // 1. DIÁLOGO MODAL SE ABERTO
      if (this.pauseDialog) {
        const isExit = (this.pauseDialog === 'CONFIRM_EXIT');
        const isCamp = (this.gameMode === 'CHAMPIONSHIP');
        const dlgW = isExit ? 232 : 220;
        const dlgH = isExit ? (isCamp ? 108 : 88) : 88;
        const dlgX = Math.round(cx - dlgW / 2);
        const dlgY = Math.round(cy - dlgH / 2);

        ctx.fillStyle = 'rgba(12, 18, 28, 0.98)';
        ctx.fillRect(dlgX, dlgY, dlgW, dlgH);
        ctx.strokeStyle = '#FF3B30';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(dlgX, dlgY, dlgW, dlgH);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (this.pauseDialog === 'CONFIRM_RESTART') {
          ctx.fillStyle = '#FFD700';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('🔄 REINICIAR CORRIDA?', cx, dlgY + 16);

          ctx.fillStyle = '#E2E8F0';
          ctx.font = '7px monospace';
          ctx.fillText('A corrida atual será reiniciada do início.', cx, dlgY + 30);

          const btnW = dlgW - 28;
          const btnH = 17;
          const btnX = Math.round(cx - btnW / 2);
          const opts = ['SIM, REINICIAR CORRIDA', 'CANCELAR'];

          for (let i = 0; i < 2; i++) {
            const bY = dlgY + 44 + i * 20;
            const isSel = (this.pauseDialogIndex === i);
            ctx.fillStyle = isSel ? (i === 0 ? '#E11D48' : '#334155') : (i === 0 ? '#881337' : '#1E293B');
            ctx.fillRect(btnX, bY, btnW, btnH);
            ctx.strokeStyle = isSel ? '#F43F5E' : '#475569';
            ctx.lineWidth = 1;
            ctx.strokeRect(btnX, bY, btnW, btnH);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 8px monospace';
            const prefix = isSel ? '► ' : '';
            const suffix = isSel ? ' ◄' : '';
            ctx.fillText(prefix + opts[i] + suffix, cx, bY + btnH / 2);
          }
        } else if (this.pauseDialog === 'CONFIRM_EXIT') {
          ctx.fillStyle = '#FF3B30';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('🚪 SAIR DA CORRIDA', cx, dlgY + 16);

          ctx.fillStyle = '#E2E8F0';
          ctx.font = '7px monospace';
          ctx.fillText(isCamp ? 'Deseja salvar o campeonato antes de sair?' : 'Deseja voltar ao menu principal?', cx, dlgY + 28);

          const btnW = dlgW - 28;
          const btnH = 17;
          const btnX = Math.round(cx - btnW / 2);
          const opts = isCamp ? ['💾 SALVAR E SAIR', '❌ SAIR SEM SALVAR', '↩ CANCELAR'] : ['SIM, SAIR', 'CANCELAR'];

          for (let i = 0; i < opts.length; i++) {
            const bY = dlgY + 40 + i * 20;
            const isSel = (this.pauseDialogIndex === i);
            let bg = '#1E293B';
            let bd = '#475569';
            if (i === 0 && isCamp) {
              bg = isSel ? '#059669' : '#065F46';
              bd = isSel ? '#34D399' : '#10B981';
            } else if ((i === 1 && isCamp) || (i === 0 && !isCamp)) {
              bg = isSel ? '#DC2626' : '#7F1D1D';
              bd = isSel ? '#F87171' : '#EF4444';
            } else {
              bg = isSel ? '#334155' : '#1E293B';
              bd = isSel ? '#94A3B8' : '#475569';
            }

            ctx.fillStyle = bg;
            ctx.fillRect(btnX, bY, btnW, btnH);
            ctx.strokeStyle = bd;
            ctx.lineWidth = 1;
            ctx.strokeRect(btnX, bY, btnW, btnH);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 8px monospace';
            const prefix = isSel ? '► ' : '';
            const suffix = isSel ? ' ◄' : '';
            ctx.fillText(prefix + opts[i] + suffix, cx, bY + btnH / 2);
          }
        }

        ctx.restore();
        return;
      }

      // 2. PAINEL PRINCIPAL DE PAUSA
      const pW = touchSafe ? 226 : 242;
      const pH = 126;
      const pX = Math.round(cx - pW / 2);
      const pY = 34;

      ctx.fillStyle = 'rgba(12, 18, 28, 0.96)';
      ctx.fillRect(pX, pY, pW, pH);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pX, pY, pW, pH);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 12.5px monospace';
      ctx.fillText('⏸ CORRIDA PAUSADA', cx, pY + 16);

      const btnW = pW - 28;
      const btnH = 17;
      const btnX = Math.round(cx - btnW / 2);
      const startY = pY + 28;
      const gapY = 21;

      const items = [
        { label: '▶ CONTINUAR', color: '#0284C7', border: '#38BDF8' },
        { label: '🔄 REINICIAR CORRIDA', color: '#B45309', border: '#F59E0B' },
        { label: '⚙ CONFIGURAÇÕES', color: '#475569', border: '#94A3B8' },
        { label: '🚪 SAIR DA CORRIDA', color: '#BE123C', border: '#FB7185' }
      ];

      for (let i = 0; i < 4; i++) {
        const bY = startY + i * gapY;
        const isSel = (this.pauseMenuIndex === i);
        const it = items[i];

        ctx.fillStyle = isSel ? it.color : '#162235';
        ctx.fillRect(btnX, bY, btnW, btnH);
        ctx.strokeStyle = isSel ? '#FFFFFF' : it.border;
        ctx.lineWidth = isSel ? 1.5 : 0.8;
        ctx.strokeRect(btnX, bY, btnW, btnH);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 8.5px monospace';
        const prefix = isSel ? '► ' : '';
        const suffix = isSel ? ' ◄' : '';
        ctx.fillText(prefix + it.label + suffix, cx, bY + btnH / 2);
      }

      ctx.fillStyle = '#94A3B8';
      ctx.font = '6.5px monospace';
      ctx.fillText(touchSafe ? 'TOQUE EM UMA OPÇÃO | [PAUSE] OU [VOLTAR] RETOMA' : '↑↓ NAVEGAR | [ENTER] / [A] SELECIONAR | [ESC] VOLTAR', cx, pY + pH + 12);

      ctx.restore();
    }

    renderResumeCountdown(ctx) {
      const cx = INTERNAL_WIDTH / 2;
      const cy = INTERNAL_HEIGHT / 2 - 12;

      ctx.save();
      ctx.fillStyle = 'rgba(5, 8, 16, 0.50)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      const curVal = Math.ceil(this.resumeCountdown);
      const frac = this.resumeCountdown - Math.floor(this.resumeCountdown);
      const scale = 1.0 + (1.0 - frac) * 0.35;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = 'rgba(14, 20, 32, 0.90)';
      ctx.fillRect(cx - 100, cy - 42, 200, 16);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 100, cy - 42, 200, 16);

      ctx.fillStyle = '#00E5FF';
      ctx.font = 'bold 7.5px monospace';
      ctx.fillText('⚡ PREPARE-SE PARA RETOMAR A CORRIDA!', cx, cy - 34);

      let label = '3';
      let color = '#FF3B30';
      if (curVal === 3) {
        label = '3';
        color = '#FF3B30';
      } else if (curVal === 2) {
        label = '2';
        color = '#FF9500';
      } else if (curVal === 1) {
        label = '1';
        color = '#34C759';
      } else {
        label = 'VAI!';
        color = '#00E5FF';
      }

      ctx.save();
      ctx.translate(cx, cy + 8);
      ctx.scale(scale, scale);
      ctx.font = 'italic 900 48px "Arial Black", Impact, sans-serif';

      ctx.fillStyle = '#050711';
      ctx.fillText(label, 2, 3);

      ctx.fillStyle = color;
      ctx.fillText(label, 0, 0);

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.strokeText(label, 0, 0);
      ctx.restore();

      ctx.fillStyle = '#94A3B8';
      ctx.font = '6.5px monospace';
      ctx.fillText('PILOTE COM VELOCIDADE E ATENÇÃO', cx, cy + 54);

      ctx.restore();
    }

    renderSlotSelect(ctx) {
      const cx = INTERNAL_WIDTH / 2;
      const cy = INTERNAL_HEIGHT / 2;
      const touchSafe = this.input.touchControlsVisible;

      const vignetteGrad = ctx.createLinearGradient(0, 0, 0, INTERNAL_HEIGHT);
      vignetteGrad.addColorStop(0, 'rgba(15, 10, 30, 0.70)');
      vignetteGrad.addColorStop(1, 'rgba(5, 5, 15, 0.85)');
      ctx.fillStyle = vignetteGrad;
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const isNew = (this.slotSelectMode === 'NEW');
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 12.5px monospace';
      ctx.fillText(isNew ? 'ESCOLHA UM SLOT DE SALVAMENTO' : 'CARREGAR CAMPEONATO SALVO', cx, 18);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '6.5px monospace';
      ctx.fillText(isNew ? 'Selecione um slot de 1 a 3 para registrar seu progresso automático' : 'Escolha o savegame para retomar sua temporada', cx, 29);

      const slots = SaveManager.getAllSlots();
      const cardW = 280;
      const cardH = 39;
      const cardX = Math.round(cx - cardW / 2);
      const startY = 38;
      const gapY = 44;

      for (let i = 0; i < 3; i++) {
        const slotNum = i + 1;
        const data = slots[i];
        const cY = startY + i * gapY;
        const isSel = (this.selectedSlotIndex === i);

        ctx.fillStyle = isSel ? 'rgba(20, 32, 54, 0.95)' : 'rgba(10, 16, 28, 0.85)';
        ctx.fillRect(cardX, cY, cardW, cardH);
        ctx.strokeStyle = isSel ? '#FFD700' : (data ? '#00E5FF44' : '#334155');
        ctx.lineWidth = isSel ? 1.5 : 1.0;
        ctx.strokeRect(cardX, cY, cardW, cardH);

        const badgeW = 44;
        ctx.fillStyle = isSel ? '#FFD700' : (data ? '#0284C7' : '#334155');
        ctx.fillRect(cardX + 2, cY + 2, badgeW, cardH - 4);
        ctx.fillStyle = isSel ? '#100500' : '#FFFFFF';
        ctx.font = 'bold 8.5px monospace';
        ctx.fillText(`SLOT ${slotNum}`, cardX + 2 + badgeW / 2, cY + cardH / 2);

        if (data) {
          ctx.textAlign = 'left';
          const infoX = cardX + badgeW + 8;
          const carModel = CAR_MODELS[data.selectedCarIndex] || { name: 'F1 CAR' };
          const modeLabel = data.difficulty === 'ADVANCED' ? 'AVANÇADO' : 'NORMAL';

          ctx.fillStyle = '#FFD700';
          ctx.font = 'bold 8px monospace';
          ctx.fillText(`🏁 ${data.playerName}  [${carModel.name}]  (${modeLabel})`, infoX, cY + 9);

          const nextTDef = TRACK_DEFINITIONS[data.nextTrackIndex] || { name: 'PRÓXIMA' };
          ctx.fillStyle = '#E2E8F0';
          ctx.font = '7px monospace';
          ctx.fillText(`🏆 P${data.playerRank} (${data.totalPoints} pts) | Etapa ${data.seasonStage + 1}: ${nextTDef.name}`, infoX, cY + 20);

          ctx.fillStyle = '#94A3B8';
          ctx.font = '6.5px monospace';
          ctx.fillText(`💾 Salvo em: ${data.dateStr || 'Recentemente'}`, infoX, cY + 30);

          if (!isNew) {
            const delX = cardX + cardW - 28;
            const delY = cY + 8;
            ctx.fillStyle = '#991B1B';
            ctx.fillRect(delX, delY, 22, 22);
            ctx.strokeStyle = '#EF4444';
            ctx.lineWidth = 1;
            ctx.strokeRect(delX, delY, 22, 22);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 9px monospace';
            ctx.fillText('✕', delX + 11, delY + 11);
          }
        } else {
          ctx.textAlign = 'left';
          const infoX = cardX + badgeW + 12;
          ctx.fillStyle = '#64748B';
          ctx.font = 'bold 8.5px monospace';
          ctx.fillText('[ SLOT DISPONÍVEL ]', infoX, cY + 14);
          ctx.font = '7px monospace';
          ctx.fillText(isNew ? 'Toque para salvar seu campeonato neste slot' : 'Nenhum jogo salvo gravado aqui', infoX, cY + 26);
        }
      }

      const bW = 80;
      const bH = 17;
      const bX = Math.round(cx - bW / 2);
      const bY = 178;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(bX, bY, bW, bH);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(bX, bY, bW, bH);
      ctx.fillStyle = '#E2E8F0';
      ctx.font = 'bold 7.5px monospace';
      ctx.fillText('↩ VOLTAR', cx, bY + bH / 2);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '6px monospace';
      ctx.fillText(touchSafe ? 'TOQUE NO SLOT DESEJADO' : '↑↓ SELECIONAR | [ENTER] / [A] CONFIRMAR | [ESC] VOLTAR', cx, 207);

      if (this.slotDeleteConfirm !== null) {
        ctx.fillStyle = 'rgba(5, 8, 16, 0.85)';
        ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
        const mW = 210;
        const mH = 75;
        const mX = Math.round(cx - mW / 2);
        const mY = Math.round(cy - mH / 2);
        ctx.fillStyle = 'rgba(15, 20, 32, 0.98)';
        ctx.fillRect(mX, mY, mW, mH);
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mX, mY, mW, mH);

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 9.5px monospace';
        ctx.fillText(`EXCLUIR SAVE DO SLOT ${this.slotDeleteConfirm}?`, cx, mY + 18);

        ctx.fillStyle = '#CBD5E1';
        ctx.font = '7px monospace';
        ctx.fillText('Esta ação é permanente e apagará os dados.', cx, mY + 32);

        ctx.fillStyle = '#DC2626';
        ctx.fillRect(cx - 88, mY + 44, 80, 18);
        ctx.strokeStyle = '#F87171';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 88, mY + 44, 80, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 7.5px monospace';
        ctx.fillText('SIM, EXCLUIR', cx - 48, mY + 53);

        ctx.fillStyle = '#334155';
        ctx.fillRect(cx + 8, mY + 44, 80, 18);
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + 8, mY + 44, 80, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('CANCELAR', cx + 48, mY + 53);
      }

      if (this.slotOverwriteConfirm !== null) {
        ctx.fillStyle = 'rgba(5, 8, 16, 0.85)';
        ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
        const mW = 210;
        const mH = 75;
        const mX = Math.round(cx - mW / 2);
        const mY = Math.round(cy - mH / 2);
        ctx.fillStyle = 'rgba(15, 20, 32, 0.98)';
        ctx.fillRect(mX, mY, mW, mH);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mX, mY, mW, mH);

        ctx.fillStyle = '#F59E0B';
        ctx.font = 'bold 9.5px monospace';
        ctx.fillText(`SOBRESCREVER SLOT ${this.slotOverwriteConfirm}?`, cx, mY + 18);

        ctx.fillStyle = '#CBD5E1';
        ctx.font = '7px monospace';
        ctx.fillText('O campeonato salvo existente será substituído.', cx, mY + 32);

        ctx.fillStyle = '#D97706';
        ctx.fillRect(cx - 92, mY + 44, 86, 18);
        ctx.strokeStyle = '#FCD34D';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 92, mY + 44, 86, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 7px monospace';
        ctx.fillText('SIM, SUBSTITUIR', cx - 49, mY + 53);

        ctx.fillStyle = '#334155';
        ctx.fillRect(cx + 6, mY + 44, 86, 18);
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + 6, mY + 44, 86, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('CANCELAR', cx + 49, mY + 53);
      }

      ctx.restore();
    }

    renderSaveProgress(ctx) {
      const cx = INTERNAL_WIDTH / 2;
      const cy = INTERNAL_HEIGHT / 2;
      const touchSafe = this.input.touchControlsVisible;

      ctx.save();
      const vignetteGrad = ctx.createLinearGradient(0, 0, 0, INTERNAL_HEIGHT);
      vignetteGrad.addColorStop(0, 'rgba(10, 16, 32, 0.88)');
      vignetteGrad.addColorStop(1, 'rgba(5, 8, 18, 0.94)');
      ctx.fillStyle = vignetteGrad;
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      const pW = 250;
      const pH = 136;
      const pX = Math.round(cx - pW / 2);
      const pY = Math.round(cy - pH / 2 - 6);

      ctx.fillStyle = 'rgba(12, 20, 36, 0.98)';
      ctx.fillRect(pX, pY, pW, pH);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pX, pY, pW, pH);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = '#69F0AE';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('💾 PROGRESSO SALVO COM SUCESSO!', cx, pY + 16);

      ctx.fillStyle = '#0284C7';
      ctx.fillRect(cx - 40, pY + 28, 80, 14);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 40, pY + 28, 80, 14);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 7.5px monospace';
      ctx.fillText(`GRAVADO NO SLOT ${this.activeSaveSlot}`, cx, pY + 35);

      ctx.textAlign = 'left';
      const infoX = pX + 16;
      const carModel = CAR_MODELS[this.selectedCarIndex] || { name: 'F1 CAR' };
      const lastTDef = TRACK_DEFINITIONS[this.trackIndex] || { name: 'INTERLAGOS' };
      const nextIdx = (this.seasonSchedule && this.seasonSchedule[this.seasonStage + 1]) !== undefined ? this.seasonSchedule[this.seasonStage + 1] : this.trackIndex;
      const nextTDef = TRACK_DEFINITIONS[nextIdx] || { name: 'PRÓXIMA ETAPA' };

      let pRank = 1;
      let pPoints = 0;
      if (this.championshipPoints && this.cars && this.cars.length > 0) {
        const overall = this.cars.map(c => ({
          car: c,
          points: this.championshipPoints[c.id] || 0
        })).sort((a, b) => b.points - a.points);
        const idx = overall.findIndex(o => o.car.isPlayer);
        pRank = idx >= 0 ? (idx + 1) : 1;
        pPoints = this.championshipPoints[this.player ? this.player.id : 0] || 0;
      }

      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 7.5px monospace';
      ctx.fillText(`PILOTO: ${this.playerName}  |  CARRO: ${carModel.name}`, infoX, pY + 54);

      ctx.fillStyle = '#E2E8F0';
      ctx.font = '7px monospace';
      ctx.fillText(`🏆 CLASSIFICAÇÃO ATUAL: P${pRank} (${pPoints} PONTOS)`, infoX, pY + 68);

      const totalStages = (this.seasonSchedule && this.seasonSchedule.length) ? this.seasonSchedule.length : 12;
      ctx.fillText(`✓ CONCLUÍDO: ETAPA ${this.seasonStage + 1}/${totalStages} - ${lastTDef.name}`, infoX, pY + 80);

      ctx.fillStyle = '#38BDF8';
      ctx.fillText(`➔ PRÓXIMA CORRIDA: ETAPA ${this.seasonStage + 2}/${totalStages} - ${nextTDef.name}`, infoX, pY + 92);

      const btnW = pW - 24;
      const btnH = 18;
      const btnX = Math.round(cx - btnW / 2);
      const btnY = pY + pH - 24;
      const blink = Math.floor(performance.now() / 300) % 2 === 0;

      ctx.fillStyle = blink ? '#059669' : '#047857';
      ctx.fillRect(btnX, btnY, btnW, btnH);
      ctx.strokeStyle = blink ? '#6EE7B7' : '#34D399';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(btnX, btnY, btnW, btnH);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('▶ TOQUE AQUI OU PRESSIONE [ENTER] / [A] PARA CONTINUAR', cx, btnY + btnH / 2);

      ctx.restore();
    }

    renderRaceResult(ctx) {
      const touchSafe = this.input.touchControlsVisible;
      ctx.fillStyle = 'rgba(5, 8, 16, 0.94)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      const def = TRACK_DEFINITIONS[this.trackIndex];

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = touchSafe ? 'bold 10.5px monospace' : 'bold 12px monospace';
      const totalStages = (this.seasonSchedule && this.seasonSchedule.length) ? this.seasonSchedule.length : TRACK_DEFINITIONS.length;
      const currentStageNum = (this.seasonStage !== undefined ? this.seasonStage : 0) + 1;
      const resultTitle = (this.gameMode === 'QUICK_RACE')
        ? `🏁 BANDEIRADA — CORRIDA RÁPIDA (${def.name})`
        : `🏁 ETAPA ${currentStageNum}/${totalStages} — ${def.name}`;
      ctx.fillText(resultTitle, INTERNAL_WIDTH / 2, 16);

      ctx.fillStyle = '#00E5FF';
      ctx.font = 'bold 7.2px monospace';
      const resultSubtitle = (this.gameMode === 'QUICK_RACE')
        ? 'CLASSIFICAÇÃO OFICIAL DA PROVA (1º AO 20º)'
        : 'CLASSIFICAÇÃO OFICIAL & PONTUAÇÃO F1 (1º AO 10º)';
      ctx.fillText(resultSubtitle, INTERNAL_WIDTH / 2, 26);

      const ranked = this.lastRacePositions || this.cars;
      const colW = Math.min(182, Math.floor((INTERNAL_WIDTH - 20) / 2));
      const leftX = Math.floor((INTERNAL_WIDTH / 2) - colW - 3);
      const rightX = Math.floor((INTERNAL_WIDTH / 2) + 3);
      const tableY = 32;
      const rowH = 12.2;
      const headH = 12;

      const drawColumn = (colX, startRank, endRank, isPointsCol) => {
        const colH = headH + (endRank - startRank + 1) * rowH + 2;
        ctx.fillStyle = 'rgba(12, 18, 30, 0.94)';
        ctx.fillRect(colX, tableY, colW, colH);
        ctx.strokeStyle = isPointsCol ? 'rgba(0, 229, 255, 0.5)' : 'rgba(100, 120, 145, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(colX, tableY, colW, colH);

        // Barra de cabeçalho
        ctx.fillStyle = isPointsCol ? 'rgba(0, 229, 255, 0.15)' : 'rgba(100, 120, 145, 0.12)';
        ctx.fillRect(colX, tableY, colW, headH);

        ctx.font = 'bold 6.8px monospace';
        ctx.fillStyle = isPointsCol ? '#00E5FF' : '#90A4AE';
        ctx.textAlign = 'left';
        ctx.fillText('POS', colX + 4, tableY + 8.5);
        ctx.fillText('PILOTO', colX + 25, tableY + 8.5);
        ctx.fillText('CARRO', colX + 112, tableY + 8.5);
        ctx.textAlign = 'right';
        ctx.fillText('PTS', colX + colW - 4, tableY + 8.5);

        for (let r = startRank; r <= endRank; r++) {
          const car = ranked[r - 1];
          if (!car) continue;
          const y = tableY + headH + (r - startRank) * rowH;
          const isPlayer = car.isPlayer;
          const pts = (r <= F1_POINTS.length) ? F1_POINTS[r - 1] : 0;

          if (isPlayer) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.24)';
            ctx.fillRect(colX + 1, y, colW - 2, rowH - 0.5);
          } else if (r % 2 === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
            ctx.fillRect(colX + 1, y, colW - 2, rowH - 0.5);
          }

          let posColor = '#90A4AE';
          let nameColor = '#ECEFF1';
          if (isPlayer) {
            posColor = '#FFD700';
            nameColor = '#FFD700';
          } else if (r === 1) {
            posColor = '#FFD700';
            nameColor = '#FFE082';
          } else if (r === 2) {
            posColor = '#ECEFF1';
            nameColor = '#E0F7FA';
          } else if (r === 3) {
            posColor = '#CD7F32';
            nameColor = '#FFE0B2';
          } else if (r > 10) {
            nameColor = '#78909C';
          }

          ctx.font = isPlayer ? 'bold 7.2px monospace' : '7px monospace';
          ctx.textAlign = 'left';
          ctx.fillStyle = posColor;
          ctx.fillText(`${String(r).padStart(2, ' ')}º`, colX + 4, y + 8.5);

          ctx.fillStyle = nameColor;
          const displayName = isPlayer ? `VOCÊ [${car.driverCode}]` : `${car.driverName} [${car.driverCode}]`;
          ctx.fillText(displayName.slice(0, 16), colX + 25, y + 8.5);

          const mName = car.model?.name || '';
          const modelShort = mName.includes('UNO') ? 'UNO' : (mName.includes('FUSCA') ? 'FUSCA' : (mName.includes('206') ? '206' : (mName.includes('HB20') ? 'HB20' : mName.slice(0, 5))));
          ctx.fillStyle = isPlayer ? '#FFD700' : '#80CBC4';
          ctx.fillText(modelShort, colX + 112, y + 8.5);

          ctx.textAlign = 'right';
          ctx.fillStyle = pts > 0 ? (isPlayer ? '#FFD700' : '#69F0AE') : '#546E7A';
          ctx.fillText(pts > 0 ? `+${pts}` : '0', colX + colW - 4, y + 8.5);
        }
      };

      // Coluna 1 (1º ao 10º) e Coluna 2 (11º ao 20º)
      drawColumn(leftX, 1, 10, true);
      drawColumn(rightX, 11, 20, false);

      // Resumo do jogador
      const pRank = ranked.findIndex(c => c.isPlayer) + 1;
      const pPts = (pRank <= F1_POINTS.length) ? F1_POINTS[pRank - 1] : 0;
      const pTotal = this.championshipPoints[0];

      ctx.textAlign = 'center';
      ctx.font = 'bold 7.8px monospace';
      if (this.gameMode === 'QUICK_RACE') {
        ctx.fillStyle = pRank <= 3 ? '#69F0AE' : '#FFD700';
        ctx.fillText(`SEU RESULTADO: ${pRank}º LUGAR  |  CORRIDA RÁPIDA FINALIZADA!`, INTERNAL_WIDTH / 2, 178);
      } else {
        ctx.fillStyle = pPts > 0 ? '#69F0AE' : '#FFB74D';
        ctx.fillText(`SEU RESULTADO: ${pRank}º LUGAR (+${pPts} PTS)  |  TOTAL NO CAMPEONATO: ${pTotal} PTS`, INTERNAL_WIDTH / 2, 178);
      }

      const blink = Math.floor(performance.now() / 400) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#FFD700';
        ctx.font = touchSafe ? 'bold 8px monospace' : 'bold 9.5px monospace';
        let nextPrompt;
        if (this.gameMode === 'QUICK_RACE') {
          nextPrompt = touchSafe ? 'TOQUE / [3] — VOLTAR AO MENU' : 'PRESSIONE [ENTER] PARA VOLTAR AO MENU';
        } else {
          nextPrompt = touchSafe
            ? 'TOQUE / [3] — VER TABELA GERAL'
            : 'PRESSIONE [ENTER] PARA VER A CLASSIFICAÇÃO GERAL';
        }
        ctx.fillText(nextPrompt, INTERNAL_WIDTH / 2, 196);
      }
      ctx.restore();
    }

    renderChampionshipResult(ctx) {
      const touchSafe = this.input.touchControlsVisible;
      ctx.fillStyle = 'rgba(5, 8, 16, 0.95)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      // Confete comemorativo animado
      this.renderConfetti(ctx);

      const overall = this.cars.map(c => ({
        car: c,
        points: this.championshipPoints[c.id]
      })).sort((a, b) => b.points - a.points);

      const first = overall[0];
      const second = overall[1];
      const third = overall[2];
      const pFinalRank = overall.findIndex(o => o.car.isPlayer) + 1;

      ctx.save();
      // Título
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = touchSafe ? 'bold 11px monospace' : 'bold 13px monospace';
      ctx.fillText('🏆 LH44 — PÓDIO FINAL DO CAMPEONATO 🏆', INTERNAL_WIDTH / 2, 18);

      const cx1 = INTERNAL_WIDTH / 2;
      const cx2 = cx1 - 92;
      const cx3 = cx1 + 92;

      // Desenha Bloco do Pódio (3D arcade box)
      const drawPodiumBlock = (cx, topY, w, h, rankNum, gradColors, strokeColor) => {
        const x = cx - w / 2;
        ctx.save();
        ctx.fillStyle = gradColors[0];
        ctx.fillRect(x, topY, w, 5);

        const g = ctx.createLinearGradient(0, topY + 5, 0, topY + h);
        g.addColorStop(0, gradColors[1]);
        g.addColorStop(1, gradColors[2]);
        ctx.fillStyle = g;
        ctx.fillRect(x, topY + 5, w, h - 5);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x, topY, w, h);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.font = `bold ${rankNum === 1 ? 22 : 17}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(rankNum), cx, topY + 5 + (h - 5) / 2);
        ctx.restore();
      };

      const getModelShort = (m) => {
        const n = m?.name || m || '';
        return n.includes('UNO') ? 'UNO' : (n.includes('FUSCA') ? 'FUSCA' : (n.includes('206') ? '206' : (n.includes('HB20') ? 'HB20' : n)));
      };

      // 2º Lugar (Esquerda)
      if (second) {
        drawPodiumBlock(cx2, 118, 76, 36, 2, ['#E2E8F0', '#94A3B8', '#475569'], '#CBD5E1');
        second.car.model.render(
          ctx, cx2, 104, 46, 28, false, 0, second.car.bodyColor,
          { isNitro: false, wheelPhase: 0, isNight: false, speed: 0 }
        );
        ctx.textAlign = 'center';
        ctx.fillStyle = '#CBD5E1';
        ctx.font = 'bold 7.5px monospace';
        ctx.fillText('🥈 2º LUGAR', cx2, 70);
        ctx.fillStyle = second.car.isPlayer ? '#FFD700' : '#FFFFFF';
        ctx.fillText(second.car.isPlayer ? `VOCÊ [${second.car.driverCode}]` : `${second.car.driverName} [${second.car.driverCode}]`, cx2, 80);
        ctx.fillStyle = '#69F0AE';
        ctx.font = 'bold 7px monospace';
        ctx.fillText(`${second.points} PTS (${getModelShort(second.car.model)})`, cx2, 89);
      }

      // 3º Lugar (Direita)
      if (third) {
        drawPodiumBlock(cx3, 128, 76, 26, 3, ['#EDDCD2', '#B08968', '#7F4F24'], '#DDB892');
        third.car.model.render(
          ctx, cx3, 114, 46, 28, false, 0, third.car.bodyColor,
          { isNitro: false, wheelPhase: 0, isNight: false, speed: 0 }
        );
        ctx.textAlign = 'center';
        ctx.fillStyle = '#DDB892';
        ctx.font = 'bold 7.5px monospace';
        ctx.fillText('🥉 3º LUGAR', cx3, 80);
        ctx.fillStyle = third.car.isPlayer ? '#FFD700' : '#FFFFFF';
        ctx.fillText(third.car.isPlayer ? `VOCÊ [${third.car.driverCode}]` : `${third.car.driverName} [${third.car.driverCode}]`, cx3, 90);
        ctx.fillStyle = '#69F0AE';
        ctx.font = 'bold 7px monospace';
        ctx.fillText(`${third.points} PTS (${getModelShort(third.car.model)})`, cx3, 99);
      }

      // 1º Lugar (Centro - O CAMPEÃO)
      if (first) {
        drawPodiumBlock(cx1, 102, 86, 52, 1, ['#FFF3BF', '#F59F00', '#B45309'], '#FFD700');
        first.car.model.render(
          ctx, cx1, 86, 54, 34, false, 0, first.car.bodyColor,
          { isNitro: false, wheelPhase: 0, isNight: false, speed: 0 }
        );
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 8.5px monospace';
        ctx.fillText('👑 O GRANDE CAMPEÃO 👑', cx1, 48);
        ctx.fillStyle = first.car.isPlayer ? '#FFD700' : '#FFFFFF';
        ctx.fillText(first.car.isPlayer ? `VOCÊ [${first.car.driverCode}]` : `${first.car.driverName} [${first.car.driverCode}]`, cx1, 58);
        ctx.fillStyle = '#69F0AE';
        ctx.font = 'bold 7.5px monospace';
        ctx.fillText(`${first.points} PTS (${getModelShort(first.car.model)})`, cx1, 67);
      }

      // Mensagem da Temporada do Jogador
      ctx.textAlign = 'center';
      ctx.font = 'bold 8px monospace';
      const pPts = this.championshipPoints[0];
      if (pFinalRank === 1) {
        ctx.fillStyle = '#00E676';
        ctx.fillText(`🎉 HISTÓRICO! VOCÊ É O CAMPEÃO DA FÓRMULA BRASIL LH44 COM ${pPts} PTS! 🎉`, INTERNAL_WIDTH / 2, 168);
      } else if (pFinalRank <= 3) {
        ctx.fillStyle = '#00E5FF';
        ctx.fillText(`🍾 PARABÉNS! VOCÊ CONQUISTOU O PÓDIO FINAL EM ${pFinalRank}º LUGAR COM ${pPts} PTS! 🍾`, INTERNAL_WIDTH / 2, 168);
      } else {
        ctx.fillStyle = '#FFB74D';
        ctx.fillText(`FIM DE TEMPORADA: VOCÊ TERMINOU EM ${pFinalRank}º LUGAR GERAL COM ${pPts} PONTOS.`, INTERNAL_WIDTH / 2, 168);
      }

      // Resumo dos demais pontuadores (4º ao 10º)
      ctx.font = '6.8px monospace';
      ctx.fillStyle = '#90A4AE';
      const topRow = overall.slice(3, 10).map((o, idx) => `${idx + 4}º ${o.car.driverCode}:${o.points}`).join('  ');
      ctx.fillText(topRow, INTERNAL_WIDTH / 2, 180);

      const blink = Math.floor(performance.now() / 450) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#FFD700';
        ctx.font = touchSafe ? 'bold 8px monospace' : 'bold 9.5px monospace';
        const restartMsg = touchSafe ? 'TOQUE / [3] — VER ENCERRAMENTO DA TEMPORADA' : 'PRESSIONE [ENTER] PARA VER O ENCERRAMENTO DA TEMPORADA';
        ctx.fillText(restartMsg, INTERNAL_WIDTH / 2, 198);
      }
      ctx.restore();
    }

    fadeTransition(targetState, onMid = null) {
      if (this.menuFadeState !== 'idle') return;
      this.menuFadeState = 'fading_out';
      this.menuFadeAlpha = 0;
      this.menuFadeTargetState = targetState;
      this.menuFadeOnMid = onMid;
      if (this.input) this.input.clearPulses();
    }

    getEffectiveMaxSpeed(car) {
      if (!car) return 220;
      if (this.diffMode === 'ADVANCED') return 280;
      if (car.effectiveMaxSpeed) return car.effectiveMaxSpeed;
      return (car.model && car.model.maxSpeed) ? car.model.maxSpeed : (car.maxSpeed || 220);
    }

    formatTime(sec) {
      if (!sec || isNaN(sec) || sec <= 0) return '00:00.00';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec % 1) * 100);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    }


    getDifficultySelectLayout() {
      const touchSafe = this.input.touchControlsVisible;
      const cardW = touchSafe ? 152 : 166;
      const cardH = touchSafe ? 122 : 138;
      const cardY = touchSafe ? 34 : 36;
      const gap = touchSafe ? 12 : 14;
      const totalW = cardW * 2 + gap;
      const startX = Math.round((INTERNAL_WIDTH - totalW) / 2);
      const card0 = { x: startX, y: cardY, w: cardW, h: cardH };
      const card1 = { x: startX + cardW + gap, y: cardY, w: cardW, h: cardH };
      const btnW = touchSafe ? 86 : 98;
      const btnH = touchSafe ? 18 : 20;
      const btnY = touchSafe ? 168 : 184;
      const btnBack = { x: startX, y: btnY, w: btnW, h: btnH };
      const btnConfirm = { x: startX + totalW - btnW, y: btnY, w: btnW, h: btnH };
      return { touchSafe, cardW, cardH, cardY, card0, card1, btnBack, btnConfirm };
    }

    renderDifficultySelect(ctx) {
      const L = this.getDifficultySelectLayout();
      const touchSafe = L.touchSafe;
      const now = performance.now();

      ctx.fillStyle = 'rgba(6, 9, 18, 0.84)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00E5FF';
      ctx.font = touchSafe ? 'bold 11px monospace' : 'bold 13px monospace';
      ctx.fillText('NÍVEL DE DESAFIO', INTERNAL_WIDTH / 2, touchSafe ? 19 : 23);

      ctx.fillStyle = '#FFD700';
      ctx.font = touchSafe ? 'bold 6.8px monospace' : 'bold 7.8px monospace';
      ctx.fillText('SELECIONE O MODO DE VELOCIDADE DOS CARROS', INTERNAL_WIDTH / 2, touchSafe ? 29 : 33);

      const diffs = [
        {
          id: 0,
          title: 'MODO NORMAL',
          icon: '🏁',
          badge: 'ORIGINAL LH44',
          color: '#00E5FF',
          lines: [
            '• VELOCIDADES DE FÁBRICA',
            '• CARROS DE 190 A 305 KM/H',
            '• PROGRESSÃO CLÁSSICA'
          ],
          box: L.card0
        },
        {
          id: 1,
          title: 'MODO AVANÇADO',
          icon: '⚡',
          badge: 'IGUALDADE 280 KM/H',
          color: '#FFD700',
          lines: [
            '• VELOCIDADE FINAL: 280 KM/H',
            '• FUSCA & UNO A 280 KM/H!',
            '• CURVAS, NITRO & CÂMBIO 100%'
          ],
          box: L.card1
        }
      ];

      for (let m = 0; m < diffs.length; m++) {
        const item = diffs[m];
        const isSelected = (this.selectedDiffIndex === item.id);
        const { x, y, w, h } = item.box;

        const cardGrad = ctx.createLinearGradient(x, y, x, y + h);
        if (isSelected) {
          cardGrad.addColorStop(0, 'rgba(18, 30, 52, 0.96)');
          cardGrad.addColorStop(1, 'rgba(10, 16, 30, 0.98)');
        } else {
          cardGrad.addColorStop(0, 'rgba(12, 16, 26, 0.88)');
          cardGrad.addColorStop(1, 'rgba(6, 9, 16, 0.92)');
        }
        ctx.fillStyle = cardGrad;
        ctx.fillRect(x, y, w, h);

        if (isSelected) {
          const pulse = (Math.sin(now / 140) + 1) * 0.5;
          ctx.strokeStyle = item.color;
          ctx.lineWidth = 2.2;
          ctx.strokeRect(x, y, w, h);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.4})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        } else {
          ctx.strokeStyle = 'rgba(70, 90, 120, 0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, h);
        }

        const badgeW = touchSafe ? 90 : 100;
        const badgeH = touchSafe ? 11 : 12;
        const badgeX = x + Math.round((w - badgeW) / 2);
        const badgeY = y + 7;
        ctx.fillStyle = isSelected ? item.color : 'rgba(70, 90, 120, 0.5)';
        ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
        ctx.fillStyle = isSelected ? '#0A0F1A' : '#CFD8DC';
        ctx.font = 'bold 6.2px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(item.badge, badgeX + badgeW / 2, badgeY + badgeH - 3);

        ctx.font = touchSafe ? '22px monospace' : '26px monospace';
        ctx.fillText(item.icon, x + w / 2, y + (touchSafe ? 40 : 46));

        ctx.font = touchSafe ? 'bold 8.2px monospace' : 'bold 9.2px monospace';
        ctx.fillStyle = isSelected ? item.color : '#ECEFF1';
        ctx.fillText(item.title, x + w / 2, y + (touchSafe ? 55 : 63));

        ctx.textAlign = 'left';
        ctx.font = touchSafe ? '6.2px monospace' : '7.0px monospace';
        ctx.fillStyle = isSelected ? '#ECEFF1' : '#90A4AE';
        const lineStartY = y + (touchSafe ? 70 : 80);
        const lineSpacing = touchSafe ? 12 : 14;
        for (let li = 0; li < item.lines.length; li++) {
          ctx.fillText(item.lines[li], x + 10, lineStartY + li * lineSpacing);
        }
      }

      // BOTÃO ◀ VOLTAR
      const bB = L.btnBack;
      ctx.fillStyle = 'rgba(20, 28, 44, 0.92)';
      ctx.fillRect(bB.x, bB.y, bB.w, bB.h);
      ctx.strokeStyle = '#546E7A';
      ctx.lineWidth = 1;
      ctx.strokeRect(bB.x, bB.y, bB.w, bB.h);
      ctx.fillStyle = '#CFD8DC';
      ctx.font = 'bold 7.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('◀ VOLTAR', bB.x + bB.w / 2, bB.y + bB.h / 2 + 2.5);

      // BOTÃO CONTINUAR ▶
      const bC = L.btnConfirm;
      const confirmGrad = ctx.createLinearGradient(bC.x, bC.y, bC.x, bC.y + bC.h);
      confirmGrad.addColorStop(0, '#FFD700');
      confirmGrad.addColorStop(1, '#FF8F00');
      ctx.fillStyle = confirmGrad;
      ctx.fillRect(bC.x, bC.y, bC.w, bC.h);
      ctx.strokeStyle = '#FFE082';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(bC.x, bC.y, bC.w, bC.h);
      ctx.fillStyle = '#0A0F1A';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CONTINUAR ▶', bC.x + bC.w / 2, bC.y + bC.h / 2 + 2.5);

      ctx.restore();
    }

    renderChampionshipStandings(ctx) {
      const touchSafe = this.input.touchControlsVisible;
      ctx.fillStyle = 'rgba(5, 8, 16, 0.95)';
      ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = touchSafe ? 'bold 10.5px monospace' : 'bold 12px monospace';
      const totalStages = (this.seasonSchedule && this.seasonSchedule.length) ? this.seasonSchedule.length : TRACK_DEFINITIONS.length;
      const currentStageNum = (this.seasonStage !== undefined ? this.seasonStage : 0) + 1;
      ctx.fillText('🏆 CLASSIFICAÇÃO GERAL DO CAMPEONATO 🏆', INTERNAL_WIDTH / 2, 16);

      ctx.fillStyle = '#00E5FF';
      ctx.font = 'bold 7.2px monospace';
      ctx.fillText(`PONTOS ACUMULADOS APÓS ETAPA ${currentStageNum} DE ${totalStages}`, INTERNAL_WIDTH / 2, 26);

      const rankedOverall = this.cars.map(c => ({
        car: c,
        points: this.championshipPoints[c.id] || 0,
        stagePoints: c.racePoints || 0
      })).sort((a, b) => b.points - a.points);

      const colW = Math.min(182, Math.floor((INTERNAL_WIDTH - 20) / 2));
      const leftX = Math.floor((INTERNAL_WIDTH / 2) - colW - 3);
      const rightX = Math.floor((INTERNAL_WIDTH / 2) + 3);
      const tableY = 32;
      const rowH = 12.2;
      const headH = 12;

      const drawStandingsCol = (colX, startRank, endRank) => {
        const colH = headH + (endRank - startRank + 1) * rowH + 2;
        ctx.fillStyle = 'rgba(12, 18, 30, 0.94)';
        ctx.fillRect(colX, tableY, colW, colH);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(colX, tableY, colW, colH);

        ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
        ctx.fillRect(colX, tableY, colW, headH);

        ctx.font = 'bold 6.8px monospace';
        ctx.fillStyle = '#00E5FF';
        ctx.textAlign = 'left';
        ctx.fillText('POS', colX + 4, tableY + 8.5);
        ctx.fillText('PILOTO', colX + 25, tableY + 8.5);
        ctx.fillText('CARRO', colX + 104, tableY + 8.5);
        ctx.textAlign = 'right';
        ctx.fillText('ETAPA', colX + colW - 32, tableY + 8.5);
        ctx.fillText('TOTAL', colX + colW - 4, tableY + 8.5);

        for (let r = startRank; r <= endRank; r++) {
          const item = rankedOverall[r - 1];
          if (!item) continue;
          const car = item.car;
          const y = tableY + headH + (r - startRank) * rowH;
          const isPlayer = car.isPlayer;

          if (isPlayer) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
            ctx.fillRect(colX + 1, y, colW - 2, rowH - 0.5);
          } else if (r % 2 === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
            ctx.fillRect(colX + 1, y, colW - 2, rowH - 0.5);
          }

          let posColor = '#90A4AE';
          let nameColor = '#ECEFF1';
          if (isPlayer) {
            posColor = '#FFD700';
            nameColor = '#FFD700';
          } else if (r === 1) {
            posColor = '#FFD700';
            nameColor = '#FFE082';
          } else if (r === 2) {
            posColor = '#ECEFF1';
            nameColor = '#E0F7FA';
          } else if (r === 3) {
            posColor = '#CD7F32';
            nameColor = '#FFE0B2';
          }

          ctx.font = isPlayer ? 'bold 7.2px monospace' : '7px monospace';
          ctx.textAlign = 'left';
          ctx.fillStyle = posColor;
          ctx.fillText(`${String(r).padStart(2, ' ')}º`, colX + 4, y + 8.5);

          ctx.fillStyle = nameColor;
          const displayName = isPlayer ? `VOCÊ [${car.driverCode}]` : `${car.driverName} [${car.driverCode}]`;
          ctx.fillText(displayName.slice(0, 15), colX + 25, y + 8.5);

          const mName = car.model?.name || '';
          const modelShort = mName.includes('UNO') ? 'UNO' : (mName.includes('FUSCA') ? 'FUSCA' : (mName.includes('206') ? '206' : (mName.includes('HB20') ? 'HB20' : mName.slice(0, 5))));
          ctx.fillStyle = isPlayer ? '#FFD700' : '#80CBC4';
          ctx.fillText(modelShort, colX + 104, y + 8.5);

          ctx.textAlign = 'right';
          ctx.fillStyle = item.stagePoints > 0 ? '#69F0AE' : '#546E7A';
          ctx.fillText(item.stagePoints > 0 ? `+${item.stagePoints}` : '-', colX + colW - 32, y + 8.5);

          ctx.fillStyle = isPlayer ? '#FFD700' : '#00E5FF';
          ctx.font = 'bold 7px monospace';
          ctx.fillText(`${item.points}`, colX + colW - 4, y + 8.5);
        }
      };

      drawStandingsCol(leftX, 1, 10);
      drawStandingsCol(rightX, 11, 20);

      const pOverallRank = rankedOverall.findIndex(item => item.car.isPlayer) + 1;
      const pTotalPoints = this.championshipPoints[0] || 0;
      const leaderPoints = rankedOverall[0]?.points || 0;
      const diffToLeader = leaderPoints - pTotalPoints;

      ctx.textAlign = 'center';
      ctx.font = 'bold 7.8px monospace';
      if (pOverallRank === 1) {
        ctx.fillStyle = '#00E676';
        ctx.fillText(`VOCÊ É O LÍDER DO CAMPEONATO! TOTAL: ${pTotalPoints} PONTOS!`, INTERNAL_WIDTH / 2, 178);
      } else {
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`SUA POSIÇÃO GERAL: ${pOverallRank}º LUGAR (${pTotalPoints} PTS)  |  DIFERENÇA P/ O LÍDER: -${diffToLeader} PTS`, INTERNAL_WIDTH / 2, 178);
      }

      const blink = Math.floor(performance.now() / 400) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#FFD700';
        ctx.font = touchSafe ? 'bold 8px monospace' : 'bold 9.5px monospace';
        const hasNext = (this.seasonSchedule && this.seasonSchedule.length > 0 && this.seasonStage < this.seasonSchedule.length - 1);
        let promptText = '';
        if (hasNext) {
          const nextTrack = TRACK_DEFINITIONS[this.seasonSchedule[this.seasonStage + 1]];
          promptText = touchSafe ? `TOQUE / [3] — PRÓXIMA ETAPA (${nextTrack.name})` : `PRESSIONE [ENTER] PARA A PRÓXIMA ETAPA (${nextTrack.name})`;
        } else {
          promptText = touchSafe ? 'TOQUE / [3] — VER O GRANDE PÓDIO FINAL' : 'PRESSIONE [ENTER] PARA A CERIMÔNIA DO PÓDIO FINAL';
        }
        ctx.fillText(promptText, INTERNAL_WIDTH / 2, 196);
      }
      ctx.restore();
    }

    updateEndingFireworks(dt) {
      if (this.endingRank !== 1) return;
      if (!this.endingFireworks) this.endingFireworks = [];
      if (Math.random() < 0.08) {
        const colors = ['#FFD700', '#FF5252', '#00E5FF', '#76FF03', '#E040FB', '#FFAB00'];
        const fx = 40 + Math.random() * (INTERNAL_WIDTH - 80);
        const fy = 20 + Math.random() * 70;
        const col = colors[Math.floor(Math.random() * colors.length)];
        for (let i = 0; i < 24; i++) {
          const angle = (i / 24) * Math.PI * 2;
          const spd = 20 + Math.random() * 45;
          this.endingFireworks.push({
            x: fx, y: fy,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            color: col,
            life: 1.0,
            decay: 0.8 + Math.random() * 0.6
          });
        }
      }
      for (let i = this.endingFireworks.length - 1; i >= 0; i--) {
        const p = this.endingFireworks[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 25 * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0) {
          this.endingFireworks.splice(i, 1);
        }
      }
    }

    renderEndingScene(ctx) {
      const touchSafe = this.input.touchControlsVisible;
      const rank = this.endingRank || 1;
      const t = this.endingTimer || 0;

      if (rank === 1) {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, INTERNAL_HEIGHT);
        bgGrad.addColorStop(0, '#040510');
        bgGrad.addColorStop(0.5, '#120A2A');
        bgGrad.addColorStop(1, '#1A0C38');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

        for (let s = 0; s < 35; s++) {
          const sx = (s * 47 + Math.sin(s * 3.1) * 30) % INTERNAL_WIDTH;
          const sy = (s * 29 + Math.cos(s * 2.7) * 20) % 110;
          const alpha = 0.3 + 0.7 * Math.sin(t * 3 + s);
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, alpha)})`;
          ctx.fillRect(sx, sy, 1.5, 1.5);
        }

        if (this.endingFireworks) {
          for (let i = 0; i < this.endingFireworks.length; i++) {
            const p = this.endingFireworks[i];
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillRect(p.x, p.y, 2, 2);
          }
          ctx.globalAlpha = 1.0;
        }

        // Pista comemorativa em PERSPECTIVA 3D FRONTAL (Opção A)
        const roadHorizonY = 136;
        const roadCenter = INTERNAL_WIDTH / 2;

        // Asfalto da pista em trapézio frontal
        ctx.fillStyle = '#151822';
        ctx.beginPath();
        ctx.moveTo(roadCenter - 18, roadHorizonY);
        ctx.lineTo(roadCenter + 18, roadHorizonY);
        ctx.lineTo(roadCenter + 185, INTERNAL_HEIGHT);
        ctx.lineTo(roadCenter - 185, INTERNAL_HEIGHT);
        ctx.closePath();
        ctx.fill();

        // Zebras laterais em perspectiva
        const curbAnim = (t * 70) % 18;
        for (let dy = roadHorizonY + curbAnim; dy < INTERNAL_HEIGHT; dy += 14) {
          const pr = (dy - roadHorizonY) / (INTERNAL_HEIGHT - roadHorizonY);
          const halfW = 18 + pr * 167;
          const curbW = 4 + pr * 14;
          const isRed = Math.floor((dy - curbAnim) / 14) % 2 === 0;
          ctx.fillStyle = isRed ? '#FF1744' : '#FFFFFF';
          ctx.fillRect(roadCenter - halfW - curbW, dy, curbW, 10 * pr + 2);
          ctx.fillRect(roadCenter + halfW, dy, curbW, 10 * pr + 2);
        }

        // Faixas centrais tracejadas correndo suavemente em direção à tela
        const dashAnim = (t * 60) % 20;
        ctx.strokeStyle = '#FFD700';
        for (let dy = roadHorizonY + dashAnim; dy < INTERNAL_HEIGHT; dy += 18) {
          const pr = (dy - roadHorizonY) / (INTERNAL_HEIGHT - roadHorizonY);
          ctx.lineWidth = 1.5 + pr * 2.5;
          ctx.beginPath();
          ctx.moveTo(roadCenter, dy);
          ctx.lineTo(roadCenter, dy + 6 + pr * 8);
          ctx.stroke();
        }

        this.renderConfetti(ctx);

        const trophyX = INTERNAL_WIDTH / 2;
        const trophyY = 58;
        const glow = (Math.sin(t * 4) + 1) * 0.5;
        const radG = ctx.createRadialGradient(trophyX, trophyY, 5, trophyX, trophyY, 48);
        radG.addColorStop(0, `rgba(255, 215, 0, ${0.45 + glow * 0.3})`);
        radG.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = radG;
        ctx.beginPath();
        ctx.arc(trophyX, trophyY, 48, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '34px monospace';
        ctx.fillText('🏆', trophyX, trophyY + 12);

        // Carro do Campeão centralizado e alinhado perfeitamente com a pista frontal
        const carY = 170 + Math.sin(t * 12) * 0.8;
        if (this.player && this.player.model) {
          this.player.model.render(
            ctx, trophyX, carY, 68, 42, false, 0, this.player.bodyColor,
            { isNitro: true, wheelPhase: t * 15, isNight: true, speed: 120 }
          );
        }

        ctx.fillStyle = '#FFD700';
        ctx.font = touchSafe ? 'bold 11px monospace' : 'bold 13px monospace';
        ctx.fillText('👑 O GRANDE CAMPEÃO DO LH44! 👑', INTERNAL_WIDTH / 2, 20);

        ctx.fillStyle = '#00E5FF';
        ctx.font = 'bold 7.5px monospace';
        const pPts = this.championshipPoints[0] || 0;
        ctx.fillText(`PILOTO: VOCÊ [${this.player?.driverCode || 'LEA'}]  |  TOTAL: ${pPts} PONTOS  |  CAMPEÃO DA TEMPORADA`, INTERNAL_WIDTH / 2, 32);

        ctx.fillStyle = '#FFE082';
        ctx.font = 'bold 7.2px monospace';
        ctx.fillText('HISTÓRICO! VOCÊ CONQUISTOU A TEMPORADA COMPLETA DA FÓRMULA BRASIL!', INTERNAL_WIDTH / 2, 122);
        ctx.fillStyle = '#69F0AE';
        ctx.font = '6.8px monospace';
        ctx.fillText('SEU NOME ESTÁ ETERNIZADO COMO UMA LENDA DO AUTOMOBILISMO ARCADE!', INTERNAL_WIDTH / 2, 134);
        ctx.restore();

      } else if (rank <= 3) {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, INTERNAL_HEIGHT);
        bgGrad.addColorStop(0, '#050D1A');
        bgGrad.addColorStop(0.6, '#0F1E36');
        bgGrad.addColorStop(1, '#1A2942');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

        // Pista em perspectiva 3D frontal (Opção A)
        const roadHorizonY = 136;
        const roadCenter = INTERNAL_WIDTH / 2;
        ctx.fillStyle = '#151822';
        ctx.beginPath();
        ctx.moveTo(roadCenter - 18, roadHorizonY);
        ctx.lineTo(roadCenter + 18, roadHorizonY);
        ctx.lineTo(roadCenter + 185, INTERNAL_HEIGHT);
        ctx.lineTo(roadCenter - 185, INTERNAL_HEIGHT);
        ctx.closePath();
        ctx.fill();

        // Faixas centrais em perspectiva
        const dashAnim = (t * 50) % 20;
        ctx.strokeStyle = '#00E5FF';
        for (let dy = roadHorizonY + dashAnim; dy < INTERNAL_HEIGHT; dy += 18) {
          const pr = (dy - roadHorizonY) / (INTERNAL_HEIGHT - roadHorizonY);
          ctx.lineWidth = 1.5 + pr * 2.2;
          ctx.beginPath();
          ctx.moveTo(roadCenter, dy);
          ctx.lineTo(roadCenter, dy + 6 + pr * 7);
          ctx.stroke();
        }

        this.renderConfetti(ctx);

        const trophyX = INTERNAL_WIDTH / 2;
        const trophyY = 62;
        const medalEmoji = (rank === 2) ? '🥈' : '🥉';
        const medalTitle = (rank === 2) ? '🥈 VICE-CAMPEÃO CONSAGRADO! 🥈' : '🥉 PÓDIO DE HONRA CONQUISTADO! 🥉';
        const medalColor = (rank === 2) ? '#E2E8F0' : '#DDB892';

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '34px monospace';
        ctx.fillText(medalEmoji, trophyX, trophyY + 12);

        const carY = 162 + Math.sin(t * 10) * 1.0;
        if (this.player && this.player.model) {
          this.player.model.render(
            ctx, trophyX, carY, 64, 40, false, 0, this.player.bodyColor,
            { isNitro: false, wheelPhase: t * 10, isNight: false, speed: 80 }
          );
        }

        ctx.fillStyle = medalColor;
        ctx.font = touchSafe ? 'bold 11px monospace' : 'bold 13px monospace';
        ctx.fillText(medalTitle, INTERNAL_WIDTH / 2, 20);

        ctx.fillStyle = '#00E5FF';
        ctx.font = 'bold 7.5px monospace';
        const pPts = this.championshipPoints[0] || 0;
        ctx.fillText(`PILOTO: VOCÊ [${this.player?.driverCode || 'LEA'}]  |  TOTAL: ${pPts} PONTOS  |  ${rank}º LUGAR GERAL`, INTERNAL_WIDTH / 2, 32);

        ctx.fillStyle = '#ECEFF1';
        ctx.font = 'bold 7.5px monospace';
        ctx.fillText('UMA TEMPORADA BRILHANTE E INESQUECÍVEL!', INTERNAL_WIDTH / 2, 122);
        ctx.fillStyle = '#69F0AE';
        ctx.font = '6.8px monospace';
        ctx.fillText('VOCÊ SUPEROU ADVERSÁRIOS FEROZES E SUBIU NO PÓDIO FINAL DO BRASIL!', INTERNAL_WIDTH / 2, 134);
        ctx.restore();

      } else {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, 130);
        skyGrad.addColorStop(0, '#1A0E2E');
        skyGrad.addColorStop(0.35, '#5C1D4E');
        skyGrad.addColorStop(0.7, '#D4483B');
        skyGrad.addColorStop(0.95, '#F5A623');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, INTERNAL_WIDTH, 130);

        const sunX = INTERNAL_WIDTH / 2;
        const sunY = 118;
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 38);
        sunGrad.addColorStop(0, '#FFF9C4');
        sunGrad.addColorStop(0.4, '#FFE082');
        sunGrad.addColorStop(0.8, '#FF8A65');
        sunGrad.addColorStop(1, 'rgba(255, 138, 101, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 38, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#261226';
        ctx.beginPath();
        ctx.moveTo(0, 130);
        ctx.lineTo(40, 105);
        ctx.lineTo(90, 120);
        ctx.lineTo(150, 98);
        ctx.lineTo(210, 122);
        ctx.lineTo(280, 102);
        ctx.lineTo(340, 118);
        ctx.lineTo(INTERNAL_WIDTH, 108);
        ctx.lineTo(INTERNAL_WIDTH, 130);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#151821';
        ctx.beginPath();
        ctx.moveTo(sunX - 12, 130);
        ctx.lineTo(sunX + 12, 130);
        ctx.lineTo(INTERNAL_WIDTH + 60, INTERNAL_HEIGHT);
        ctx.lineTo(-60, INTERNAL_HEIGHT);
        ctx.closePath();
        ctx.fill();

        const roadAnim = (t * 50) % 25;
        ctx.strokeStyle = '#FFD54F';
        ctx.lineWidth = 2;
        for (let dy = 132 + roadAnim; dy < INTERNAL_HEIGHT; dy += 22) {
          ctx.beginPath();
          ctx.moveTo(sunX, dy);
          ctx.lineTo(sunX, dy + 8);
          ctx.stroke();
        }

        const carY = 176 + Math.sin(t * 8) * 0.8;
        if (this.player && this.player.model) {
          this.player.model.render(
            ctx, sunX, carY, 56, 36, false, 0, this.player.bodyColor,
            { isNitro: false, wheelPhase: t * 8, isNight: false, speed: 60 }
          );
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFE082';
        ctx.font = touchSafe ? 'bold 10.5px monospace' : 'bold 12px monospace';
        ctx.fillText('🌅 NUNCA DESISTA DOS SEUS SONHOS! 🌅', INTERNAL_WIDTH / 2, 19);

        ctx.fillStyle = '#00E5FF';
        ctx.font = 'bold 7.2px monospace';
        const pPts = this.championshipPoints[0] || 0;
        ctx.fillText(`TEMPORADA CONCLUÍDA EM ${rank}º LUGAR COM ${pPts} PONTOS`, INTERNAL_WIDTH / 2, 31);

        ctx.fillStyle = '#FFF3E0';
        ctx.font = 'bold 7.2px monospace';
        ctx.fillText('"AS GRANDES LENDAS SÃO FORJADAS NA PERSISTÊNCIA."', INTERNAL_WIDTH / 2, 48);
        ctx.fillStyle = '#FFE082';
        ctx.font = '6.8px monospace';
        ctx.fillText('Você completou todas as 31 etapas com garra e bravura!', INTERNAL_WIDTH / 2, 59);
        ctx.fillStyle = '#69F0AE';
        ctx.font = '6.8px monospace';
        ctx.fillText('Ajuste seu carro, treine as curvas e volte para conquistar o campeonato!', INTERNAL_WIDTH / 2, 70);
        ctx.restore();
      }

      const blink = Math.floor(performance.now() / 420) % 2 === 0;
      if (blink) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.font = touchSafe ? 'bold 8px monospace' : 'bold 9.5px monospace';
        const exitMsg = touchSafe ? 'TOQUE / [3] — VOLTAR AO MENU' : 'PRESSIONE [ENTER] PARA VOLTAR AO MENU';
        ctx.fillText(exitMsg, INTERNAL_WIDTH / 2, 206);
        ctx.restore();
      }
    }

    scheduleNextFrame() {
      if (this._rafHandle) {
        cancelAnimationFrame(this._rafHandle);
        this._rafHandle = null;
      }
      if (this._timeoutHandle) {
        clearTimeout(this._timeoutHandle);
        this._timeoutHandle = null;
      }
      if (this.vsyncEnabled) {
        this._rafHandle = requestAnimationFrame(this.boundGameLoop);
      } else if (this.fpsLimit === 60) {
        const elapsed = performance.now() - this.lastRenderTime;
        const remain = Math.max(0, Math.floor((1000 / 60) - elapsed));
        this._timeoutHandle = setTimeout(this.boundGameLoop, remain);
      } else {
        this._timeoutHandle = setTimeout(this.boundGameLoop, 0);
      }
    }

    gameLoop(now) {
      try {
        if (!now) now = performance.now();

        // Limite de taxa de quadros (Ex: 60 FPS cravados em telas de 90Hz, 120Hz ou monitores rápidos)
        if (this.fpsLimit === 60) {
          const targetInterval = 1000 / 60; // 16.666ms
          const elapsed = now - this.lastRenderTime;
          // Margem de tolerância de 2.5ms para sincronia estável com ciclos de 120Hz/60Hz
          if (elapsed < targetInterval - 2.5) {
            return; // O bloco finally executará e agendará o próximo quadro de forma única e segura
          }
        }

        let frameTime = (now - this.lastTime) / 1000;
        if (frameTime > 0.067) frameTime = 0.067;
        if (frameTime < 0) frameTime = 0;
        this.lastTime = now;
        this.lastRenderTime = now;

        // Amostragem contínua de FPS com média móvel
        this.fpsFrames++;
        if (now - this.fpsLastTime >= 350) {
          this.fps = (this.fpsFrames * 1000) / (now - this.fpsLastTime);
          this.fpsFrames = 0;
          this.fpsLastTime = now;
        }

        this.accumulator = Math.min(this.accumulator + frameTime, this.fixedStep * 1.8);
        let steps = 0;
        while (this.accumulator >= this.fixedStep && steps < 2) {
          this.update(this.fixedStep);
          this.accumulator -= this.fixedStep;
          steps++;
        }
        if (steps >= 2) {
          this.accumulator = 0;
        }

        this.render();
      } catch (err) {
        console.error('LH44 GameLoop error:', err);
      } finally {
        this.scheduleNextFrame();
      }
    }
  }
