// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, game over and delivery complete.
//
// ?seed=N fixes the valley and the ring line. ?shot=start|play|landing|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, MISSIONS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASHED, EVENT_FUEL_LOW, EVENT_HIT, EVENT_LANDED, EVENT_OUT_OF_FUEL, EVENT_PERFECT, EVENT_RING } from './world.js';
import { ACTION_CONFIRM, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, 12);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let mission = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(missionIndex) {
    mission = missionIndex;
    world.reset(missionIndex);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Flying ${MISSIONS[missionIndex].name}. ${world.state.ringsTotal} rings, then land on runway 27.`);
  }

  function endFlight(win) {
    screen = win ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(win
      ? `Delivery complete. Score ${world.state.score}. Best ${best}.`
      : `Crashed. ${world.state.reason} Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_MISSION_1) startGame(0);
      else if (actions & ACTION_MISSION_2) startGame(1);
      else if (actions & ACTION_MISSION_3) startGame(2);
      else if (actions & ACTION_CONFIRM) startGame(0);
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) startGame(mission);
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { roll: 0, pitch: 0, throttle: 0 }, true);
      return;
    }
    const events = world.step(STEP, {
      roll: input.roll(),
      pitch: input.pitch(),
      throttle: input.throttle(),
    }, false);
    audio.setEngine(world.state.plane.throttle, world.state.plane.speed);
    if (events & EVENT_RING) {
      audio.ring(Boolean(events & EVENT_PERFECT));
      announce(events & EVENT_PERFECT
        ? `Perfect ring! ${world.state.ringsPassed} of ${world.state.ringsTotal}.`
        : `Ring ${world.state.ringsPassed} of ${world.state.ringsTotal}.`);
    }
    if (events & EVENT_HIT) {
      audio.hit();
      announce(`Balloon strike! Hull ${Math.round(world.state.plane.damage)}%.`);
    }
    if (events & EVENT_FUEL_LOW) {
      audio.warn();
      announce('Low fuel. Rings refuel the tanks.');
    }
    if (events & EVENT_OUT_OF_FUEL) {
      audio.warn();
      announce('Out of fuel — gliding. Find the runway.');
    }
    if (events & EVENT_LANDED) {
      audio.land();
      endFlight(true);
    } else if (events & EVENT_CRASHED) {
      audio.crash();
      endFlight(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting the courier fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Skyline Courier. Pick a sortie with 1, 2 or 3, or press Space to fly Ring Run.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
