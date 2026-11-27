// Sound, synthesised with WebAudio — no audio files, no network. The engine hum follows the
// throttle; rings chime, warnings beep, a landing plays a short arpeggio and a crash a burst of
// noise. Everything is guarded: with no AudioContext (or no gesture yet) the game stays silent.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let enabled = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || !enabled) return;
    try {
      const t = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    /** Call from a user gesture: unlocks audio and starts the engine hum. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      enabled = true;
    },
    setEngine(throttle, speed) {
      if (!ctx || !enabled || !engineOsc) return;
      try {
        engineOsc.frequency.value = 46 + throttle * 70 + speed * 0.08;
        engineGain.gain.value = 0.018 + throttle * 0.03;
      } catch {
        // Ignore.
      }
    },
    ring(perfect) {
      tone(880, 0.22, 'sine', 0.16);
      tone(1318, 0.3, 'sine', 0.14, 0.07);
      if (perfect) tone(1760, 0.35, 'sine', 0.12, 0.14);
    },
    hit() {
      tone(160, 0.25, 'square', 0.18);
      tone(90, 0.3, 'square', 0.16, 0.05);
    },
    warn() {
      tone(660, 0.12, 'square', 0.1);
      tone(660, 0.12, 'square', 0.1, 0.18);
    },
    land() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'sine', 0.14, i * 0.11));
    },
    crash() {
      if (!ctx || !enabled) return;
      try {
        const dur = 0.6;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = 0.25;
        src.connect(gain).connect(ctx.destination);
        src.start();
      } catch {
        // Ignore.
      }
    },
  };
}
