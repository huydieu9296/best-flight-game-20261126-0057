// The game's rules and state, with no drawing and no browser in it: the flight model, the
// seeded terrain, the rings, balloons and storm clouds, the runway, fuel and damage, score and
// missions. step() advances one fixed step and returns what happened as bit flags, so the caller
// can react without the world knowing about screens or sound. Nothing here allocates after
// createWorld returns, except the small per-step event value.
import { DAMAGE, FUEL, KT_TO_FPS, MISSIONS, PLANE, RING, STEP } from './config.js';

export const EVENT_RING = 1;
export const EVENT_PERFECT = 2;
export const EVENT_HIT = 4;
export const EVENT_LANDED = 8;
export const EVENT_CRASHED = 16;
export const EVENT_FUEL_LOW = 32;
export const EVENT_OUT_OF_FUEL = 64;

const DEG = Math.PI / 180;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createWorld(random) {
  const plane = {
    x: 0, z: 0, alt: 900, heading: 0, pitch: 0, roll: 0,
    speed: PLANE.cruiseSpeed, throttle: 0.62, fuel: FUEL.start, damage: DAMAGE.start,
  };
  const rings = [];
  const balloons = [];
  const clouds = [];
  const runway = { z0: 0, z1: 0, width: 150 };
  const state = {
    plane, rings, balloons, clouds, runway,
    mission: 0, score: 0, ringsPassed: 0, ringsTotal: 0,
    elapsed: 0, distance: 0, status: 'flying', reason: '',
    fuelLowWarned: false, outOfFuel: false, turbulence: 0,
    /** The next ring the pilot should aim for; null once all are passed. */
    nextRing: null,
    /** Terrain and river queries, so the renderer and the autopilot share the world's ground. */
    terrainHeight, riverX,
  };
  // Seeded phases for the terrain, fixed per world so the same seed gives the same valley.
  let ph = [0, 0, 0, 0, 0];
  let mountainScale = 0.25;

  /** Feet of ground under (x, z): rolling hills, side mountains, a flat runway shelf. */
  function terrainHeight(x, z) {
    const ax = Math.abs(x);
    const corridor = 0.55 + 0.45 * smoothstep(200, 1100, ax);
    let h = corridor * (220 * Math.sin(x * 0.0011 + ph[0]) * Math.cos(z * 0.0009 + ph[1])
      + 120 * Math.sin(x * 0.0023 + z * 0.0017 + ph[2]));
    const side = smoothstep(700, 1800, ax);
    h += mountainScale * side * Math.pow(Math.max(0, Math.sin(x * 0.0006 + ph[3])), 3) * 1500
      * (0.6 + 0.4 * Math.sin(z * 0.0004 + ph[4]));
    // A flat valley floor under the runway and its whole approach corridor, so the glide
    // slope never meets a hill: full flat inside |x| < 260, feathered out to |x| = 520.
    if (z > runway.z0 - 7000 && z < runway.z1 + 800) {
      const edge = smoothstep(260, 520, ax);
      const zEdge = z < runway.z0 - 6000 ? smoothstep(runway.z0 - 7000, runway.z0 - 6000, z) : 1;
      const f = (1 - edge) * zEdge;
      return h * (1 - f) + 12 * f;
    }
    return h;
  }

  /** The river's centreline x at distance z: a slow meander across the valley. */
  function riverX(z) {
    return 1500 * Math.sin(z * 0.00012 + ph[1]) + 500 * Math.sin(z * 0.00031 + ph[2]);
  }

  function reset(missionIndex) {
    const mission = MISSIONS[missionIndex];
    state.mission = missionIndex;
    mountainScale = mission.mountains;
    ph = [random() * 6.28, random() * 6.28, random() * 6.28, random() * 6.28, random() * 6.28];
    plane.x = 0; plane.z = 0; plane.alt = 900; plane.heading = 0;
    plane.pitch = 0; plane.roll = 0; plane.speed = PLANE.cruiseSpeed;
    plane.throttle = 0.62; plane.fuel = mission.fuel; plane.damage = DAMAGE.start;
    state.score = 0; state.ringsPassed = 0; state.ringsTotal = mission.rings;
    state.elapsed = 0; state.distance = 0; state.status = 'flying'; state.reason = '';
    state.fuelLowWarned = false; state.outOfFuel = false; state.turbulence = 0;

    rings.length = 0;
    // The runway is set before the rings: ring heights must clear the ground beneath them.
    runway.z0 = 5000 + mission.rings * mission.ringSpacing + 4500;
    runway.z1 = runway.z0 + 3600;
    runway.width = 150;
    for (let i = 0; i < mission.rings; i += 1) {
      const z = 5000 + i * mission.ringSpacing;
      const x = 900 * Math.sin(i * 1.7 + ph[0]) + 200 * Math.sin(i * 3.1 + ph[1]);
      const y = Math.max(520, Math.min(1750, 950 + 620 * Math.sin(i * 1.25 + ph[2])),
        terrainHeight(x, z) + 280);
      rings.push({ x, y, z, passed: false });
    }

    balloons.length = 0;
    for (let i = 0; i < mission.balloons; i += 1) {
      const z = 6000 + random() * (runway.z0 - 8000);
      balloons.push({
        x: (random() * 2 - 1) * 1500, y: 700 + random() * 900, z,
        r: 55 + random() * 30, hit: false, hue: random(),
      });
    }
    clouds.length = 0;
    for (let i = 0; i < mission.clouds; i += 1) {
      clouds.push({
        x: (random() * 2 - 1) * 3200, y: 1500 + random() * 900,
        z: 4000 + random() * (runway.z0 - 4000), s: 260 + random() * 320,
      });
    }
    state.nextRing = rings[0] ?? null;
  }

  function crash(reason) {
    if (state.status !== 'flying') return EVENT_CRASHED;
    state.status = 'crashed';
    state.reason = reason;
    return EVENT_CRASHED;
  }

  function land() {
    if (state.status !== 'flying') return 0;
    state.status = 'landed';
    state.reason = state.ringsPassed >= state.ringsTotal
      ? 'Runway landing complete.'
      : 'Landed short — rings were left behind.';
    const bonus = 1000 + Math.round(plane.fuel) * 10 + Math.round(plane.damage) * 5;
    state.score += bonus;
    return EVENT_LANDED;
  }

  /**
   * One fixed step. `controls` is { roll, pitch, throttle } each -1..1; with `harmless` set (the
   * title screen's backdrop) the plane flies itself and nothing scores or breaks.
   */
  function step(dt, controls, harmless) {
    let events = 0;
    if (state.status !== 'flying') return events;
    state.elapsed += dt;

    if (harmless) {
      // Title backdrop: gentle level cruise with a slow wander, no fuel burn.
      plane.heading = 12 * Math.sin(state.elapsed * 0.08);
      plane.roll = -8 * Math.sin(state.elapsed * 0.08);
      plane.pitch = 1.5 * Math.sin(state.elapsed * 0.23);
      plane.speed = PLANE.cruiseSpeed;
    } else {
      // Throttle: keys trim it; it also eases toward the mouse-free cruise when untouched.
      plane.throttle = Math.max(0, Math.min(1,
        plane.throttle + controls.throttle * 0.55 * dt));
      const targetSpeed = PLANE.minSpeed
        + plane.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
      const rate = targetSpeed > plane.speed ? PLANE.accel : PLANE.decel;
      plane.speed += Math.max(-rate * dt, Math.min(rate * dt, targetSpeed - plane.speed));

      plane.roll += controls.roll * PLANE.rollRate * dt;
      plane.roll = Math.max(-PLANE.maxRoll, Math.min(PLANE.maxRoll, plane.roll));
      // The stick recentres the bank when released.
      if (controls.roll === 0) plane.roll *= Math.max(0, 1 - 1.6 * dt);
      plane.heading += plane.roll * PLANE.turnFactor * dt;
      plane.pitch += controls.pitch * PLANE.pitchRate * dt;
      plane.pitch = Math.max(PLANE.maxPitchDown, Math.min(PLANE.maxPitchUp, plane.pitch));
      if (controls.pitch === 0) plane.pitch *= Math.max(0, 1 - 1.2 * dt);

      // Fuel burn, and the glide that follows an empty tank.
      const burn = (FUEL.idleBurn + plane.throttle * FUEL.burn) * dt;
      plane.fuel = Math.max(0, plane.fuel - burn);
      if (plane.fuel === 0 && !state.outOfFuel) {
        state.outOfFuel = true;
        events |= EVENT_OUT_OF_FUEL;
      }
      if (state.outOfFuel) plane.throttle = 0;
      if (plane.fuel < 22 && !state.fuelLowWarned) {
        state.fuelLowWarned = true;
        events |= EVENT_FUEL_LOW;
      }
    }

    // Stall: too slow and the nose drops, the plane sinks.
    if (plane.speed < PLANE.stallSpeed && !harmless) {
      plane.pitch = Math.max(PLANE.maxPitchDown, plane.pitch - 14 * dt);
    }

    // Advance along the heading.
    const fps = plane.speed * KT_TO_FPS;
    const headingRad = plane.heading * DEG;
    const verticalFps = fps * Math.sin(plane.pitch * DEG)
      - (plane.speed < PLANE.stallSpeed && !harmless ? PLANE.sinkRate : 0);
    plane.z += fps * Math.cos(headingRad) * dt;
    plane.x += fps * Math.sin(headingRad) * dt;
    plane.alt = Math.max(0, plane.alt + verticalFps * dt);
    state.distance += fps * dt;
    if (!harmless) state.score += fps * dt * 0.02;

    // Storm turbulence: inside a cloud the airframe shudders.
    state.turbulence = 0;
    for (let i = 0; i < clouds.length; i += 1) {
      const c = clouds[i];
      const dx = plane.x - c.x;
      const dy = plane.alt - c.y;
      const dz = plane.z - c.z;
      if (Math.abs(dx) < c.s && Math.abs(dy) < c.s * 0.45 && Math.abs(dz) < c.s) {
        state.turbulence = 1;
        plane.roll += (Math.sin(state.elapsed * 13.7) * 9) * dt;
        plane.pitch += (Math.cos(state.elapsed * 11.3) * 5) * dt;
        break;
      }
    }

    if (harmless) return events;

    // Rings: crossing the ring's plane close to its centre collects it.
    const next = state.nextRing;
    if (next && plane.z >= next.z) {
      const dx = plane.x - next.x;
      const dy = plane.alt - next.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < RING.radius) {
        next.passed = true;
        state.ringsPassed += 1;
        state.score += RING.points;
        plane.fuel = Math.min(100, plane.fuel + FUEL.ringBonus);
        events |= EVENT_RING;
        if (dist < RING.radius * 0.45) {
          state.score += RING.perfectBonus;
          events |= EVENT_PERFECT;
        }
        const idx = rings.indexOf(next);
        state.nextRing = rings[idx + 1] ?? null;
      }
    }

    // Balloons: a hit pops the balloon and dents the airframe.
    for (let i = 0; i < balloons.length; i += 1) {
      const b = balloons[i];
      if (b.hit) continue;
      const dx = plane.x - b.x;
      const dy = plane.alt - b.y;
      const dz = plane.z - b.z;
      if (dx * dx + dy * dy + dz * dz < (b.r + 26) * (b.r + 26)) {
        b.hit = true;
        plane.damage -= DAMAGE.balloonHit;
        events |= EVENT_HIT;
        if (plane.damage <= 0) {
          plane.damage = 0;
          return events | crash('Airframe failed after the balloon strike.');
        }
      }
    }

    // Ground: the runway is the only safe place to touch down.
    const ground = terrainHeight(plane.x, plane.z);
    const onRunwayStrip = plane.z > runway.z0 && plane.z < runway.z1
      && Math.abs(plane.x) < runway.width / 2;
    if (plane.alt <= ground + 4) {
      plane.alt = ground + 4;
      if (onRunwayStrip) {
        const gentle = verticalFps > -20 && plane.speed < 225
          && Math.abs(plane.roll) < 22 && Math.abs(plane.heading) < 16;
        if (gentle) return events | land();
        return events | crash('Hard landing — the gear folded on the runway.');
      }
      return events | crash(plane.alt < 60 ? 'Terrain impact.' : 'Clipped the hillside.');
    }
    return events;
  }

  reset(0);
  return { state, reset, step, terrainHeight, riverX };
}
