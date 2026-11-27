// Keyboard and mouse input. Held keys give pitch/roll/throttle; one-shot presses (start,
// restart, pause, mission pick) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse steers too: hold the
// pointer off-centre and the plane banks and pitches toward it.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MISSION_1 = 4;
export const ACTION_MISSION_2 = 8;
export const ACTION_MISSION_3 = 16;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  let pitchUp = false;
  let pitchDown = false;
  let rollLeft = false;
  let rollRight = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  // -1..1, from the pointer's offset from the canvas centre; 0 when the mouse is idle.
  let mouseX = 0;
  let mouseY = 0;
  let mouseActive = false;

  window.addEventListener('keydown', (event) => {
    if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (ROLL_LEFT.has(event.code)) rollLeft = true;
    else if (ROLL_RIGHT.has(event.code)) rollRight = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'Digit1' && !event.repeat) actions |= ACTION_MISSION_1;
    else if (event.code === 'Digit2' && !event.repeat) actions |= ACTION_MISSION_2;
    else if (event.code === 'Digit3' && !event.repeat) actions |= ACTION_MISSION_3;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (ROLL_LEFT.has(event.code)) rollLeft = false;
    else if (ROLL_RIGHT.has(event.code)) rollRight = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    pitchUp = pitchDown = rollLeft = rollRight = throttleUp = throttleDown = false;
    mouseActive = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    mouseY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    mouseActive = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    // Clicking a mission card on the title screen picks it; anywhere else confirms.
    if (y > 0.52 && y < 0.78 && x > 0.16 && x < 0.84) {
      if (x < 0.39) actions |= ACTION_MISSION_1;
      else if (x < 0.62) actions |= ACTION_MISSION_2;
      else actions |= ACTION_MISSION_3;
    } else {
      actions |= ACTION_CONFIRM;
    }
  });

  function clamp(v) {
    return Math.max(-1, Math.min(1, v));
  }

  return {
    /** -1 (left) .. 1 (right) from keys, or the mouse when it is off-centre. */
    roll() {
      const keys = (rollRight ? 1 : 0) - (rollLeft ? 1 : 0);
      if (keys !== 0) return keys;
      return mouseActive ? clamp(mouseX * 1.4) : 0;
    },
    /** -1 (nose down) .. 1 (nose up) from keys, or the mouse when it is off-centre. */
    pitch() {
      const keys = (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);
      if (keys !== 0) return keys;
      return mouseActive ? clamp(-mouseY * 1.4) : 0;
    },
    /** -1 (idle) .. 1 (full) throttle trim from keys. */
    throttle() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
