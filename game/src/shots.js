// The screenshot scenes behind ?shot=start|play|landing|end. Each one plays the real rules
// forward from a fresh world, steered by a simple autopilot (bank toward the next ring, pitch
// for its altitude, hold cruise speed; once the rings are done, line up on the runway and ride
// the glide slope down), so the frame is what a real flight looks like and the same seed always
// gives the same frame.
import { STEP } from './config.js';
import { EVENT_CRASHED, EVENT_LANDED } from './world.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 42;
const LANDING_LIMIT_SECONDS = 420;
const END_LIMIT_SECONDS = 600;
const SAMPLE = STEP;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function normAngle(a) {
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

/** Bank, pitch and throttle toward a point in the sky; returns { roll, pitch, throttle }. */
function autopilot(state, targetX, targetAlt, targetZ, targetSpeed, useFloor = true, pitchGain = 0.045) {
  const p = state.plane;
  const dx = targetX - p.x;
  const dz = targetZ - p.z;
  // Aim at the point while it is ahead; once past it, fly straight on — pointing back at a
  // target behind the nose only makes the plane bank into a spiral it cannot recover from.
  const desiredHeading = dz > 200 ? (Math.atan2(dx, dz) * 180) / Math.PI : 0;
  const headingError = normAngle(desiredHeading - p.heading);
  const desiredRoll = clamp(headingError * 1.6, -45, 45);
  const roll = clamp((desiredRoll - p.roll) / 22, -1, 1);
  // Never plan below the ridge ahead: stay 300 ft over the ground 1,500 ft in front — except
  // on final approach, where the valley floor is flat and the flare must reach the ground.
  const safeAlt = useFloor ? Math.max(targetAlt, state.terrainHeight(p.x, p.z + 1500) + 300) : targetAlt;
  const altError = safeAlt - p.alt;
  const desiredPitch = clamp(altError * pitchGain, -14, 13);
  const pitch = clamp((desiredPitch - p.pitch) / 6, -1, 1);
  const throttle = p.speed < targetSpeed - 6 ? 1 : p.speed > targetSpeed + 6 ? -1 : 0;
  return { roll, pitch, throttle };
}

function flyToRing(state) {
  const next = state.nextRing;
  if (!next) return null;
  return autopilot(state, next.x, next.y, next.z, 190, true);
}

function flyToRunway(state) {
  const rw = state.runway;
  const threshold = rw.z0 + 1000;
  const dist = Math.max(0, threshold - state.plane.z);
  // Glide slope down to the numbers, then flare to the runway surface itself: the wheels
  // only touch when the target altitude meets the ground, so the last stretch aims at it.
  // The flare uses a stiffer pitch gain: a gentle proportional descent would still be
  // 50 ft up when the runway runs out. And the flare waits until the plane is actually on
  // the centreline — descending while still slewed across the valley ends in the grass.
  let targetAlt = dist < 1200 ? 14
    : dist < 4000 ? 30 + (dist - 1200) * 0.05
    : Math.min(850, 30 + dist * 0.04);
  const p = state.plane;
  const aligned = Math.abs(p.x) < 80 && Math.abs(normAngle(p.heading)) < 12;
  if (!aligned && dist < 4000) targetAlt = Math.max(targetAlt, 220);
  return autopilot(state, 0, targetAlt, threshold, 150, false, 0.09);
}

export { flyToRing, flyToRunway };

/**
 * Set `world` to the named scene (start, play, landing or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset(name === 'landing' ? 2 : 0);
  const state = world.state;
  if (name !== 'play' && name !== 'landing' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { roll: 0, pitch: 0, throttle: 0 }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      const controls = flyToRing(state) ?? { roll: 0, pitch: 0, throttle: 0 };
      world.step(STEP, controls, false);
      if (state.status !== 'flying') break;
    }
    return { screen: state.status === 'landed' ? SCREEN_WIN : state.status === 'crashed' ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  // landing / end: fly the rings, then the approach, until wheels-down or a limit.
  const limit = (name === 'end' ? END_LIMIT_SECONDS : LANDING_LIMIT_SECONDS) / STEP;
  for (let i = 0; i < limit; i += 1) {
    const controls = state.nextRing ? flyToRing(state) : flyToRunway(state);
    const events = world.step(STEP, controls, false);
    if (name === 'landing' && !state.nextRing && state.plane.z > state.runway.z0 - 5200) break;
    if (events & (EVENT_LANDED | EVENT_CRASHED)) break;
  }
  if (name === 'landing') return { screen: SCREEN_PLAY, best: state.score };
  return {
    screen: state.status === 'landed' ? SCREEN_WIN : state.status === 'crashed' ? SCREEN_OVER : SCREEN_PLAY,
    best: state.score,
  };
}

export { SCREEN_PAUSED };
