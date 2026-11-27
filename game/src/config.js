// Skyline Courier — every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends on the
// screen size. Altitudes are feet, speeds are knots, distances along the flight path are feet.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Knots to feet per second. */
export const KT_TO_FPS = 1.68781;

export const PLANE = {
  /** Knots. */
  minSpeed: 80,
  maxSpeed: 320,
  cruiseSpeed: 180,
  /** Knots per second of throttle change. */
  accel: 55,
  decel: 70,
  /** Degrees per second of pitch authority at full stick. */
  pitchRate: 26,
  maxPitchUp: 24,
  maxPitchDown: -18,
  /** Degrees per second of roll authority. */
  rollRate: 95,
  maxRoll: 62,
  /** Degrees of heading change per second per degree of bank. */
  turnFactor: 0.32,
  /** Feet per second lost when slower than this (stall). */
  stallSpeed: 105,
  sinkRate: 260,
};

export const FUEL = {
  start: 100,
  /** Units per second at full throttle. */
  burn: 1.35,
  idleBurn: 0.35,
  ringBonus: 7,
};

export const DAMAGE = {
  start: 100,
  balloonHit: 34,
  scrape: 100,
};

export const RING = { radius: 130, points: 250, perfectBonus: 150 };

export const MISSIONS = [
  {
    id: 0,
    name: 'Ring Run',
    tag: 'Morning courier',
    blurb: 'Fly all 8 sky rings, then land on runway 27.',
    rings: 8,
    ringSpacing: 3200,
    balloons: 5,
    clouds: 9,
    fuel: 100,
    mountains: 0.25,
    palette: 'morning',
  },
  {
    id: 1,
    name: 'Canyon Courier',
    tag: 'Mountain pass',
    blurb: 'Thread 10 rings through the canyon. Tall rock, thin fuel.',
    rings: 10,
    ringSpacing: 3000,
    balloons: 9,
    clouds: 6,
    fuel: 90,
    mountains: 1.0,
    palette: 'noon',
  },
  {
    id: 2,
    name: 'Storm Delivery',
    tag: 'Dusk storm',
    blurb: 'Deliver at dusk: 8 rings, storm cells, runway lights on.',
    rings: 8,
    ringSpacing: 3300,
    balloons: 7,
    clouds: 16,
    fuel: 100,
    mountains: 0.55,
    palette: 'dusk',
  },
];

export const PALETTES = {
  morning: {
    skyTop: '#2f6fb4', skyMid: '#7db4e2', skyLow: '#cfe8f7', sun: '#fff3c4',
    groundFar: '#7fae62', groundNear: '#5d9448', hill: '#6f9a52', rock: '#8a7f74',
    snow: '#eef3f6', water: '#3f8fd2', runway: '#3a3f46', haze: 'rgba(207,232,247,0.55)',
    cloud: 'rgba(255,255,255,0.92)', ring: '#ffb02e', ringGlow: '#ff8c1a',
  },
  noon: {
    skyTop: '#1f5fa8', skyMid: '#5ea3dd', skyLow: '#bfe0f5', sun: '#fffbe0',
    groundFar: '#86b364', groundNear: '#649650', hill: '#759e58', rock: '#7d7468',
    snow: '#f2f6f8', water: '#2f7fc4', runway: '#34383f', haze: 'rgba(191,224,245,0.5)',
    cloud: 'rgba(255,255,255,0.95)', ring: '#ffb02e', ringGlow: '#ff8c1a',
  },
  dusk: {
    skyTop: '#2c2350', skyMid: '#b65a6e', skyLow: '#f2a35e', sun: '#ffd9a0',
    groundFar: '#4d6b45', groundNear: '#3c5a38', hill: '#465f3e', rock: '#5c5348',
    snow: '#cfd6dd', water: '#2c4f7e', runway: '#2e3138', haze: 'rgba(242,163,94,0.4)',
    cloud: 'rgba(255,214,178,0.85)', ring: '#ffd23e', ringGlow: '#ff9d00',
  },
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'skyline-courier.best';
