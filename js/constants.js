/**
 * LH44 - LOW TO HIGH SPEED (2.5D ARCADE HD EDITION)
 * Constantes globais do motor de corrida pseudo-3D
 */

const IS_MOBILE_CLIENT = typeof navigator !== 'undefined' && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '') ||
  (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
);

// Escala de Renderização Dinâmica e Adaptativa (V2 Ultra Performance)
// Mobile: 1.8x (garante 60 FPS cravados sem drop frame) | Desktop: 2.5x (alta fidelidade gráfica)
let   RENDER_SCALE    = IS_MOBILE_CLIENT ? 1.8 : 2.5;
const REF_WIDTH       = 384;
let   INTERNAL_WIDTH  = 384;
const INTERNAL_HEIGHT = 216;
const ROAD_WIDTH      = 1450;
const SKY_PARALLAX_K  = 3.8;
const SEGMENT_LENGTH  = 200;
const CAMERA_HEIGHT   = 950;
const CAMERA_DEPTH    = 0.84;
const PLAYER_Z_OFFSET = 900;
const PLAYER_CAR_W    = 120;
const PLAYER_CAR_H    = 75;
const START_LINE_SEG  = 34;
const START_LINE_Z    = START_LINE_SEG * SEGMENT_LENGTH;
const GRID_ROW_SPACING = 520;
const GRID_STAGGER_Z   = 240;
const GRID_COL_X       = 0.32;
let   DRAW_DISTANCE    = IS_MOBILE_CLIENT ? 140 : 180;
const TOTAL_LAPS      = 3;
const TOTAL_RACERS    = 20;

// Sistema Oficial de Pontuação da Fórmula 1 (1º ao 10º lugar)
const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// 19 Adversários Clássicos e Contemporâneos da F1 com suas siglas oficiais
const F1_DRIVERS = [
  { name: 'HAMILTON',   code: 'HAM' },
  { name: 'SENNA',      code: 'SEN' },
  { name: 'BARRICHELO', code: 'BAR' },
  { name: 'RUSSEL',     code: 'RUS' },
  { name: 'VERSTAPPEN', code: 'VER' },
  { name: 'BOTTAS',     code: 'BOT' },
  { name: 'RAIKKONEN',  code: 'RAI' },
  { name: 'SCHUMACHER', code: 'SCH' },
  { name: 'BUTTON',     code: 'BUT' },
  { name: 'ANTONELLI',  code: 'ANT' },
  { name: 'FITTIPALDI', code: 'FIT' },
  { name: 'KUBICA',     code: 'KUB' },
  { name: 'MONTOYA',    code: 'MON' },
  { name: 'SATO',       code: 'SAT' },
  { name: 'ALONSO',     code: 'ALO' },
  { name: 'VETTEL',     code: 'VET' },
  { name: 'SAINZ',      code: 'SAI' },
  { name: 'NORRIS',     code: 'NOR' },
  { name: 'BORTOLETO',  code: 'BOR' }
];

const GEAR_RATIOS = [
  { gear: 1, minRatio: 0.00, maxRatio: 0.22, minRpm: 1200, maxRpm: 6800 },
  { gear: 2, minRatio: 0.18, maxRatio: 0.42, minRpm: 3200, maxRpm: 7000 },
  { gear: 3, minRatio: 0.38, maxRatio: 0.65, minRpm: 3500, maxRpm: 7200 },
  { gear: 4, minRatio: 0.60, maxRatio: 0.86, minRpm: 4000, maxRpm: 7400 },
  { gear: 5, minRatio: 0.82, maxRatio: 1.00, minRpm: 4400, maxRpm: 7600 }
];

