// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred. A chase view: the courier jet sits low in
// frame, banked with its roll; ahead, a projected valley — rolling fields, a river, side
// mountains, the glowing rings and the runway — under a sky whose horizon rides the pitch. The
// HUD carries lit instruments: speed and altitude tapes, a compass tape, an attitude ball,
// throttle, fuel and damage. Flat canvas shapes and text only; no images, no network.
import { FIELD, FONT, KT_TO_FPS, MISSIONS, PALETTES, RING } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const DEG = Math.PI / 180;
const FOCAL = 640;
const CX = FIELD.width / 2;
const CY = FIELD.height / 2;
const PLANE_Y = FIELD.height - 168;

const ROWS = 34;
const COLS = 22;
const LAT_SPAN = 4200;

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mix(a, b, t) {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}

function hash2(x, z) {
  let h = (Math.floor(x / 420) * 374761393 + Math.floor(z / 420) * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = size + weight;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  // Project a world point into field coordinates. Returns null when behind the camera.
  function project(state, wx, wy, wz) {
    const p = state.plane;
    const heading = p.heading * DEG;
    const pitch = p.pitch * DEG;
    const rx = wx - p.x;
    const ry = wy - p.alt;
    const rz = wz - p.z;
    const fwd = rz * Math.cos(heading) + rx * Math.sin(heading);
    const lat = rx * Math.cos(heading) - rz * Math.sin(heading);
    if (fwd < 6) return null;
    const up = ry * Math.cos(pitch) - fwd * Math.sin(pitch);
    const fwd2 = ry * Math.sin(pitch) + fwd * Math.cos(pitch);
    if (fwd2 < 6) return null;
    let sx = CX + (lat * FOCAL) / fwd2;
    let sy = CY - (up * FOCAL) / fwd2;
    // Roll rotates the whole view around the screen centre.
    const roll = -p.roll * DEG;
    const dx = sx - CX;
    const dy = sy - CY;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    sx = CX + dx * cos - dy * sin;
    sy = CY + dx * sin + dy * cos;
    return { x: sx, y: sy, depth: fwd2 };
  }

  function groundColor(state, palette, x, z, h, depthT) {
    const river = state.riverX(z);
    if (Math.abs(x - river) < 70) return mix(palette.water, palette.skyLow, depthT * 0.5);
    const rw = state.runway;
    if (z > rw.z0 && z < rw.z1 && Math.abs(x) < rw.width / 2) {
      if (Math.abs(x) < 5) return Math.floor(z / 260) % 2 === 0 ? '#e8e8e8' : palette.runway;
      if (Math.abs(x) > rw.width / 2 - 7) return '#e8e8e8';
      return mix(palette.runway, palette.skyLow, depthT * 0.45);
    }
    let base;
    if (h > 1050) base = palette.snow;
    else if (h > 620) base = palette.rock;
    else if (h > 300) base = palette.hill;
    else base = palette.groundNear;
    // Field patchwork: seeded crop colours on the valley floor.
    if (h <= 300 && Math.abs(x - river) >= 70) {
      const v = hash2(x, z);
      if (v < 0.22) base = '#a8a05a';
      else if (v < 0.4) base = '#7fae62';
      else if (v < 0.52) base = '#4e7d3a';
    }
    return mix(base, palette.skyLow, depthT * 0.62);
  }

  function drawSky(state, palette, time) {
    const pitch = state.plane.pitch * DEG;
    const horizonY = CY + Math.tan(pitch) * FOCAL;
    const grad = context.createLinearGradient(0, 0, 0, Math.max(horizonY + 30, 60));
    grad.addColorStop(0, palette.skyTop);
    grad.addColorStop(0.55, palette.skyMid);
    grad.addColorStop(1, palette.skyLow);
    context.fillStyle = grad;
    // Fill the whole field: below the horizon the last stop (pale sky) reads as haze where the
    // far ground has not risen to meet it, so no black band ever shows between sky and land.
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Sun: a fixed bearing, so it swings with the heading like a real landmark.
    const sun = project(state, state.plane.x - 9000, 5200, state.plane.z + 16000);
    if (sun && sun.y > -60 && sun.y < FIELD.height) {
      context.save();
      context.globalAlpha = 0.9;
      context.fillStyle = palette.sun;
      context.shadowColor = palette.sun;
      context.shadowBlur = 60;
      context.beginPath();
      context.arc(sun.x, sun.y, 34, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    // Drifting cloud puffs, drawn in the sky band.
    for (let i = 0; i < state.clouds.length; i += 1) {
      const c = state.clouds[i];
      const pt = project(state, c.x, c.y, c.z);
      if (!pt || pt.y < -80 || pt.y > horizonY + 40) continue;
      const r = (c.s * FOCAL) / pt.depth;
      if (r < 4) continue;
      context.save();
      context.globalAlpha = Math.max(0.25, Math.min(0.9, 9000 / pt.depth));
      context.fillStyle = palette.cloud;
      for (let k = 0; k < 4; k += 1) {
        const ox = (k - 1.5) * r * 0.7;
        context.beginPath();
        context.ellipse(pt.x + ox, pt.y + (k % 2) * r * 0.12, r * 0.62, r * 0.3, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
    return horizonY;
  }

  function drawGround(state, palette) {
    const p = state.plane;
    const heading = p.heading * DEG;
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);
    // Depth rows, near to far, so far rows paint first and near rows cover them. The first row
    // is 8 ft ahead: without it the ground under the nose never paints and the bottom of the
    // screen stays black whenever the plane is low — worst on the runway after landing.
    const depths = [];
    for (let i = 0; i <= ROWS; i += 1) depths.push(8 * Math.pow(1.28, i));
    for (let ri = depths.length - 1; ri >= 0; ri -= 1) {
      const d0 = depths[ri];
      const d1 = depths[Math.min(ri + 1, depths.length - 1)];
      const depthT = Math.min(1, d0 / 11000);
      for (let ci = 0; ci < COLS; ci += 1) {
        const lat0 = -LAT_SPAN + (2 * LAT_SPAN * ci) / COLS;
        const lat1 = -LAT_SPAN + (2 * LAT_SPAN * (ci + 1)) / COLS;
        // Camera-space (lat, depth) back to world x/z.
        const wx0 = p.x + lat0 * cosH + d0 * sinH;
        const wz0 = p.z - lat0 * sinH + d0 * cosH;
        const wx1 = p.x + lat1 * cosH + d0 * sinH;
        const wz1 = p.z - lat1 * sinH + d0 * cosH;
        const wx2 = p.x + lat1 * cosH + d1 * sinH;
        const wz2 = p.z - lat1 * sinH + d1 * cosH;
        const wx3 = p.x + lat0 * cosH + d1 * sinH;
        const wz3 = p.z - lat0 * sinH + d1 * cosH;
        const a = project(state, wx0, state.terrainHeight(wx0, wz0), wz0);
        const b = project(state, wx1, state.terrainHeight(wx1, wz1), wz1);
        const c = project(state, wx2, state.terrainHeight(wx2, wz2), wz2);
        const d = project(state, wx3, state.terrainHeight(wx3, wz3), wz3);
        if (!a || !b || !c || !d) continue;
        const midX = (wx0 + wx1) / 2;
        const midZ = (wz0 + wz1) / 2;
        const midH = state.terrainHeight(midX, midZ);
        context.fillStyle = groundColor(state, palette, midX, midZ, midH, depthT);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.lineTo(c.x, c.y);
        context.lineTo(d.x, d.y);
        context.closePath();
        context.fill();
      }
    }
    // Runway edge lights at dusk: small glowing dots down both edges.
    const rw = state.runway;
    if (palette === PALETTES.dusk) {
      context.save();
      context.fillStyle = '#ffd23e';
      context.shadowColor = '#ffb02e';
      context.shadowBlur = 8;
      for (let z = rw.z0 + 150; z < rw.z1; z += 300) {
        for (const side of [-1, 1]) {
          const pt = project(state, side * (rw.width / 2 - 4), 16, z);
          if (pt && pt.depth > 60 && pt.y > 0 && pt.y < FIELD.height) {
            context.beginPath();
            context.arc(pt.x, pt.y, Math.max(1.5, 900 / pt.depth), 0, Math.PI * 2);
            context.fill();
          }
        }
      }
      context.restore();
    }
  }

  function drawRings(state, palette) {
    for (let i = 0; i < state.rings.length; i += 1) {
      const ring = state.rings[i];
      if (ring.passed) continue;
      const pt = project(state, ring.x, ring.y, ring.z);
      if (!pt || pt.depth < 60) continue;
      const r = (RING.radius * FOCAL) / pt.depth;
      if (r < 3 || pt.x < -r || pt.x > FIELD.width + r || pt.y < -r || pt.y > FIELD.height + r) continue;
      const isNext = state.nextRing === ring;
      context.save();
      context.globalAlpha = isNext ? 1 : 0.55;
      context.strokeStyle = palette.ring;
      context.shadowColor = palette.ringGlow;
      context.shadowBlur = isNext ? 22 : 8;
      context.lineWidth = Math.max(2, r * 0.09);
      context.beginPath();
      context.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.lineWidth = Math.max(1, r * 0.02);
      context.strokeStyle = 'rgba(255,255,255,0.85)';
      context.beginPath();
      context.arc(pt.x, pt.y, r * 0.82, 0, Math.PI * 2);
      context.stroke();
      context.restore();
      if (isNext && r > 8) {
        text(`${Math.max(0, Math.round(pt.depth))} ft`, pt.x, pt.y - r - 10, 18, '#ffffff', 'center', 'bold');
      }
    }
    // Off-screen pointer to the next ring.
    const next = state.nextRing;
    if (next) {
      const pt = project(state, next.x, next.y, next.z);
      if (pt && (pt.x < 40 || pt.x > FIELD.width - 40 || pt.y < 60 || pt.y > FIELD.height - 40)) {
        const mx = Math.max(50, Math.min(FIELD.width - 50, pt.x));
        const my = Math.max(80, Math.min(FIELD.height - 60, pt.y));
        context.save();
        context.fillStyle = palette.ring;
        context.beginPath();
        context.moveTo(mx, my - 12);
        context.lineTo(mx + 10, my + 8);
        context.lineTo(mx - 10, my + 8);
        context.closePath();
        context.fill();
        context.restore();
        text('NEXT RING', mx, my + 26, 14, palette.ring, 'center', 'bold');
      }
    }
  }

  function drawBalloons(state, time) {
    for (let i = 0; i < state.balloons.length; i += 1) {
      const b = state.balloons[i];
      if (b.hit) continue;
      const pt = project(state, b.x, b.y, b.z);
      if (!pt || pt.depth < 60) continue;
      const r = (b.r * FOCAL) / pt.depth;
      if (r < 2) continue;
      const hue = Math.floor(b.hue * 360);
      context.save();
      context.fillStyle = `hsl(${hue}, 75%, 55%)`;
      context.beginPath();
      context.ellipse(pt.x, pt.y, r, r * 1.15, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.75)';
      context.beginPath();
      context.ellipse(pt.x - r * 0.35, pt.y - r * 0.3, r * 0.22, r * 0.5, -0.3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#5a3a22';
      context.fillRect(pt.x - r * 0.22, pt.y + r * 1.18, r * 0.44, r * 0.34);
      context.strokeStyle = 'rgba(60,30,10,0.7)';
      context.lineWidth = Math.max(1, r * 0.04);
      context.beginPath();
      context.moveTo(pt.x - r * 0.5, pt.y + r * 0.9);
      context.lineTo(pt.x - r * 0.22, pt.y + r * 1.18);
      context.moveTo(pt.x + r * 0.5, pt.y + r * 0.9);
      context.lineTo(pt.x + r * 0.22, pt.y + r * 1.18);
      context.stroke();
      context.restore();
    }
  }

  function drawPlane(state, time) {
    const p = state.plane;
    const bob = Math.sin(time * 2.1) * 2;
    context.save();
    context.translate(CX, PLANE_Y + bob);
    context.rotate(-p.roll * DEG * 0.85);
    // Twin contrails when fast.
    if (p.speed > 150) {
      context.strokeStyle = 'rgba(255,255,255,0.35)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(-58, 26);
      context.lineTo(-78, 96);
      context.moveTo(58, 26);
      context.lineTo(78, 96);
      context.stroke();
    }
    // Wings.
    context.fillStyle = '#c7d3de';
    context.beginPath();
    context.moveTo(-14, -6);
    context.lineTo(-128, 34);
    context.lineTo(-122, 48);
    context.lineTo(-12, 22);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(14, -6);
    context.lineTo(128, 34);
    context.lineTo(122, 48);
    context.lineTo(12, 22);
    context.closePath();
    context.fill();
    // Tail fin.
    context.fillStyle = '#9fb2c2';
    context.beginPath();
    context.moveTo(-16, -58);
    context.lineTo(0, -96);
    context.lineTo(16, -58);
    context.closePath();
    context.fill();
    // Fuselage.
    const body = context.createLinearGradient(-20, 0, 20, 0);
    body.addColorStop(0, '#8fa8bb');
    body.addColorStop(0.5, '#e8f0f6');
    body.addColorStop(1, '#8fa8bb');
    context.fillStyle = body;
    context.beginPath();
    context.moveTo(0, -92);
    context.quadraticCurveTo(20, -70, 22, -30);
    context.quadraticCurveTo(24, 10, 16, 34);
    context.quadraticCurveTo(0, 44, -16, 34);
    context.quadraticCurveTo(-24, 10, -22, -30);
    context.quadraticCurveTo(-20, -70, 0, -92);
    context.fill();
    // Lit cockpit windows.
    context.fillStyle = '#ffd98a';
    context.shadowColor = '#ffbe3d';
    context.shadowBlur = 10;
    context.beginPath();
    context.ellipse(-8, -62, 7, 5, -0.3, 0, Math.PI * 2);
    context.ellipse(8, -62, 7, 5, 0.3, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    // Engine pods with glow.
    for (const side of [-1, 1]) {
      context.fillStyle = '#5d7488';
      context.beginPath();
      context.ellipse(side * 46, 30, 12, 9, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#7fd4ff';
      context.beginPath();
      context.ellipse(side * 46, 34, 6, 4, 0, 0, Math.PI * 2);
      context.fill();
    }
    // Nav lights: red port, green starboard, white strobe blinking.
    context.fillStyle = '#ff3b30';
    context.beginPath();
    context.arc(-126, 40, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#34e07a';
    context.beginPath();
    context.arc(126, 40, 4, 0, Math.PI * 2);
    context.fill();
    if (Math.floor(time * 2) % 2 === 0) {
      context.fillStyle = '#ffffff';
      context.shadowColor = '#ffffff';
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(0, 40, 4, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    }
    context.restore();
  }

  function drawCompass(state) {
    const p = state.plane;
    const heading = ((p.heading % 360) + 360) % 360;
    context.save();
    context.fillStyle = 'rgba(10,16,26,0.72)';
    context.fillRect(CX - 190, 12, 380, 44);
    context.strokeStyle = 'rgba(255,255,255,0.25)';
    context.strokeRect(CX - 190, 12, 380, 44);
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -60; d <= 60; d += 15) {
      const h = ((Math.round(heading + d) % 360) + 360) % 360;
      const x = CX + d * 2.6;
      context.strokeStyle = 'rgba(255,255,255,0.6)';
      context.beginPath();
      context.moveTo(x, 44);
      context.lineTo(x, 52);
      context.stroke();
      const label = labels[h] ?? String(h).padStart(3, '0');
      text(label, x, 34, 13, d === 0 ? '#ffd23e' : '#e8eef4', 'center', d === 0 ? 'bold' : '');
    }
    context.fillStyle = '#ffd23e';
    context.beginPath();
    context.moveTo(CX, 56);
    context.lineTo(CX - 6, 48);
    context.lineTo(CX + 6, 48);
    context.closePath();
    context.fill();
    text(`HDG ${String(Math.round(heading)).padStart(3, '0')}°`, CX, 74, 15, '#ffffff', 'center', 'bold');
    context.restore();
  }

  function drawTape(x, y, label, value, unit, color) {
    context.save();
    context.fillStyle = 'rgba(10,16,26,0.72)';
    context.fillRect(x, y, 150, 58);
    context.strokeStyle = 'rgba(255,255,255,0.25)';
    context.strokeRect(x, y, 150, 58);
    text(label, x + 10, y + 20, 12, '#9fb2c2', 'left', 'bold');
    text(`${fmt(value)}`, x + 10, y + 48, 26, color, 'left', 'bold');
    text(unit, x + 138, y + 48, 13, '#9fb2c2', 'right');
    context.restore();
  }

  function drawAttitude(state) {
    const p = state.plane;
    const cx = 96;
    const cy = FIELD.height - 108;
    const r = 62;
    context.save();
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.clip();
    context.translate(cx, cy);
    context.rotate(-p.roll * DEG);
    const pitchPx = p.pitch * 2.2;
    context.fillStyle = '#3f8fd2';
    context.fillRect(-r, -r - pitchPx, r * 2, r + pitchPx);
    context.fillStyle = '#5d7a45';
    context.fillRect(-r, -pitchPx, r * 2, r + pitchPx);
    context.strokeStyle = 'rgba(255,255,255,0.9)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-r, -pitchPx);
    context.lineTo(r, -pitchPx);
    context.stroke();
    context.lineWidth = 1;
    for (const dp of [-10, 10]) {
      context.beginPath();
      context.moveTo(-24, -pitchPx - dp * 2.2);
      context.lineTo(24, -pitchPx - dp * 2.2);
      context.stroke();
    }
    context.restore();
    context.save();
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.strokeStyle = '#e8eef4';
    context.lineWidth = 3;
    context.stroke();
    context.strokeStyle = '#ffd23e';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx - 34, cy);
    context.lineTo(cx - 8, cy);
    context.moveTo(cx + 8, cy);
    context.lineTo(cx + 34, cy);
    context.moveTo(cx, cy);
    context.lineTo(cx, cy - 8);
    context.stroke();
    context.restore();
    text('ATTITUDE', cx, cy + r + 18, 11, '#9fb2c2', 'center', 'bold');
  }

  function drawBars(state) {
    const p = state.plane;
    const x = FIELD.width - 210;
    const y = FIELD.height - 128;
    context.save();
    context.fillStyle = 'rgba(10,16,26,0.72)';
    context.fillRect(x - 12, y - 26, 198, 116);
    context.strokeStyle = 'rgba(255,255,255,0.25)';
    context.strokeRect(x - 12, y - 26, 198, 116);
    // Throttle.
    text('THR', x, y - 8, 12, '#9fb2c2', 'left', 'bold');
    context.fillStyle = '#22303f';
    context.fillRect(x + 44, y - 14, 110, 10);
    context.fillStyle = '#7fd4ff';
    context.fillRect(x + 44, y - 14, 110 * p.throttle, 10);
    text(`${Math.round(p.throttle * 100)}%`, x + 180, y - 4, 12, '#e8eef4', 'right');
    // Fuel.
    text('FUEL', x, y + 18, 12, '#9fb2c2', 'left', 'bold');
    context.fillStyle = '#22303f';
    context.fillRect(x + 44, y + 12, 110, 10);
    context.fillStyle = p.fuel < 22 ? '#ff5a4e' : '#ffd23e';
    context.fillRect(x + 44, y + 12, 110 * (p.fuel / 100), 10);
    text(`${Math.round(p.fuel)}`, x + 180, y + 22, 12, '#e8eef4', 'right');
    // Airframe.
    text('HULL', x, y + 44, 12, '#9fb2c2', 'left', 'bold');
    context.fillStyle = '#22303f';
    context.fillRect(x + 44, y + 38, 110, 10);
    context.fillStyle = p.damage < 40 ? '#ff5a4e' : '#34e07a';
    context.fillRect(x + 44, y + 38, 110 * (p.damage / 100), 10);
    text(`${Math.round(p.damage)}%`, x + 180, y + 48, 12, '#e8eef4', 'right');
    context.restore();
  }

  function drawHud(state, time) {
    const p = state.plane;
    const palette = PALETTES[MISSIONS[state.mission].palette];
    drawCompass(state);
    const vs = Math.round(p.speed * KT_TO_FPS * Math.sin(p.pitch * DEG) * 60);
    drawTape(20, 12, 'AIRSPEED', p.speed, 'kt', '#ffffff');
    drawTape(FIELD.width - 170, 12, 'ALTITUDE', p.alt, 'ft', '#ffffff');
    text(`V/S ${vs >= 0 ? '+' : ''}${fmt(vs)} ft/min`, FIELD.width - 170, 92, 14, vs < -600 ? '#ff8a7a' : '#9fb2c2', 'left', 'bold');
    drawAttitude(state);
    drawBars(state);
    // Mission line and score.
    text(`${MISSIONS[state.mission].name.toUpperCase()}  ·  RINGS ${state.ringsPassed}/${state.ringsTotal}`, CX, 108, 16, '#ffffff', 'center', 'bold');
    text(`SCORE ${fmt(state.score)}`, CX, 132, 16, '#ffd23e', 'center', 'bold');
    const next = state.nextRing;
    if (next) {
      const dist = Math.max(0, Math.round(next.z - p.z));
      text(`Next ring ${fmt(dist)} ft ahead`, CX, 154, 13, '#cfe0ee', 'center');
    } else if (state.status === 'flying') {
      text('All rings clear — line up on runway 27 and land!', CX, 154, 14, '#7dff9a', 'center', 'bold');
    }
    // Warnings, flashing.
    const warnings = [];
    if (p.fuel < 22 && state.status === 'flying') warnings.push('LOW FUEL');
    if (p.speed < 105 && state.status === 'flying') warnings.push('STALL');
    if (state.turbulence) warnings.push('TURBULENCE');
    const ground = state.terrainHeight(p.x, p.z);
    if (p.alt - ground < 220 && state.status === 'flying') warnings.push('TERRAIN');
    if (warnings.length && Math.floor(time * 2.4) % 2 === 0) {
      text(`⚠ ${warnings.join('  ·  ')}`, CX, 190, 20, '#ff6a5e', 'center', 'bold');
    }
    void palette;
  }

  function drawPanel(title, lines, prompt, accent = '#ffd23e') {
    const width = 640;
    const lineH = 32;
    const height = 150 + lines.length * lineH + 64;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.save();
    context.fillStyle = 'rgba(8,13,22,0.88)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 66, 44, '#ffffff', 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 118 + i * lineH, 20, '#cfe0ee', 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 20, accent, 'center', 'bold');
    context.restore();
  }

  function drawTitle(state, best) {
    const lines = [
      'Fly the rings, mind the fuel, land on runway 27.',
      '← → / A D bank and turn   ·   ↑ ↓ / W S pitch',
      'Shift throttle up   ·   Ctrl throttle down',
      'Mouse steers too   ·   P pauses   ·   Space starts',
      '',
      `Best score ${fmt(best)}`,
    ];
    drawPanel('SKYLINE COURIER', lines, 'Pick a sortie:  1 Ring Run  ·  2 Canyon Courier  ·  3 Storm Delivery');
    // Mission cards under the panel.
    const cardW = 190;
    const cardH = 92;
    const gap = 14;
    const totalW = cardW * 3 + gap * 2;
    let cx0 = (FIELD.width - totalW) / 2;
    for (let i = 0; i < MISSIONS.length; i += 1) {
      const m = MISSIONS[i];
      const x = cx0 + i * (cardW + gap);
      const y = FIELD.height - 118;
      context.save();
      context.fillStyle = 'rgba(10,16,26,0.85)';
      context.fillRect(x, y, cardW, cardH);
      context.strokeStyle = '#7fd4ff';
      context.strokeRect(x, y, cardW, cardH);
      text(`${i + 1} · ${m.name}`, x + 12, y + 26, 16, '#ffffff', 'left', 'bold');
      text(m.tag, x + 12, y + 48, 13, '#ffd23e', 'left', 'bold');
      text(`${m.rings} rings · ${m.balloons} balloons`, x + 12, y + 70, 13, '#cfe0ee', 'left');
      context.restore();
    }
  }

  /** Paint one frame: sky, ground, rings, balloons, plane, HUD, then the screen's panel. */
  function draw(state, screen, best, time) {
    const palette = PALETTES[MISSIONS[state.mission].palette];
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b1220';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky(state, palette, time);
    drawGround(state, palette);
    drawBalloons(state, time);
    drawRings(state, palette);
    drawPlane(state, time);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state, time);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The valley will wait for you.'], 'Press P or Space to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Crashed', [
        state.reason || 'The courier went down.',
        `Score ${fmt(state.score)}   ·   Best ${fmt(best)}`,
        `Rings ${state.ringsPassed}/${state.ringsTotal}   ·   Distance ${fmt(state.distance)} ft`,
      ], 'Press Space or click to fly again', '#ff6a5e');
    } else if (screen === SCREEN_WIN) {
      drawPanel('Delivery Complete', [
        state.reason || 'Wheels down on runway 27.',
        `Score ${fmt(state.score)}   ·   Best ${fmt(best)}`,
        `Rings ${state.ringsPassed}/${state.ringsTotal}   ·   Fuel left ${Math.round(state.plane.fuel)}   ·   Hull ${Math.round(state.plane.damage)}%`,
      ], 'Press Space or click to fly again', '#7dff9a');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
