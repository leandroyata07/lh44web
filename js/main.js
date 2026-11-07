/**
 * LH44 - LOW TO HIGH SPEED
 * Ponto de entrada do jogo - Inicialização e loop principal
 */

window.addEventListener('load', () => {
  window.game = window.gameInstance = new LH44RacingGame();

  // Início imediato da música tema ao carregar a página
  const cleanupListeners = () => {
    window.removeEventListener('pointerdown', startMusicImmediate);
    window.removeEventListener('touchstart', startMusicImmediate);
    window.removeEventListener('click', startMusicImmediate);
    window.removeEventListener('keydown', startMusicImmediate);
    window.removeEventListener('focus', startMusicImmediate);
  };

  const startMusicImmediate = () => {
    const g = window.game || window.gameInstance;
    if (g && g.audio) {
      const isMenuState = (g.state === 'MENU' || g.state === 'MODE_SELECT' || g.state === 'DIFFICULTY_SELECT' || g.state === 'TRACK_SELECT' || g.state === 'CAR_SELECT' || g.state === 'COLOR_SELECT' || g.state === 'NAME_INPUT');
      if (isMenuState) {
        g.audio.unlockAudio(true);
        if (!g.audio.titlePlaying) {
          g.audio.playTitleMusic();
        }
        if (g.audio.ctx && g.audio.ctx.state === 'running' && g.audio.titlePlaying) {
          cleanupListeners();
        }
      }
    }
  };

  // 1. Toca automaticamente de imediato (WebView Android / Autoplay liberado)
  startMusicImmediate();
  setTimeout(startMusicImmediate, 60);
  setTimeout(startMusicImmediate, 200);
  setTimeout(startMusicImmediate, 500);

  // 2. Destravamento garantido no primeiríssimo evento de interação
  window.addEventListener('pointerdown', startMusicImmediate, { passive: true });
  window.addEventListener('touchstart', startMusicImmediate, { passive: true });
  window.addEventListener('click', startMusicImmediate, { passive: true });
  window.addEventListener('keydown', startMusicImmediate, { passive: true });
  window.addEventListener('focus', startMusicImmediate, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) startMusicImmediate();
  }, { passive: true });
});
