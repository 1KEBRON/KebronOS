// Real-time ocean sound, synthesised with Web Audio — no recordings, nothing to license.
// Three layers of shaped noise: a low swell rumble, the wash of waves (which rises and falls with a
// randomised swell rhythm), and a high spray hiss that follows the wind. `setScene` lets the view steer it:
// higher above the water is quieter and darker; stronger waves and wind are louder and brighter.

function noiseBuffer(ctx, seconds = 6) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    // Pink-ish noise (Paul Kellet's economical filter).
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buffer;
}

export function createOceanSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  const buffer = noiseBuffer(ctx);

  const source = (offset) => {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start(0, offset);
    return s;
  };

  // Swell rumble.
  const rumbleFilter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 140, Q: 0.4 });
  const rumble = new GainNode(ctx, { gain: 0.5 });
  source(0).connect(rumbleFilter).connect(rumble).connect(master);

  // Wash: the main body; its gain and brightness are animated per wave.
  const washFilter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 600, Q: 0.7 });
  const wash = new GainNode(ctx, { gain: 0.2 });
  const washPan = new StereoPannerNode(ctx, { pan: 0 });
  source(2.1).connect(washFilter).connect(wash).connect(washPan).connect(master);

  // Spray: thin hiss on wave crests and wind.
  const sprayFilter = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 3600, Q: 0.6 });
  const spray = new GainNode(ctx, { gain: 0.02 });
  source(4.3).connect(sprayFilter).connect(spray).connect(master);

  let scene = { height: 6, wave: 0.85, wind: 0.7 };
  let timer = 0;
  let on = false;

  // Each wave: a swell (rise in gain and brightness), a crest, then a long retreating wash.
  function scheduleWave() {
    if (!on) return;
    const t = ctx.currentTime + 0.05;
    const nearness = 1 / (1 + Math.max(scene.height - 3, 0) / 9);
    const energy = (0.55 + 0.45 * scene.wave) * nearness;
    const period = 5.5 + Math.random() * 4.5 - scene.wave * 1.2;
    const rise = period * (0.35 + Math.random() * 0.1);
    const peak = (0.35 + Math.random() * 0.4) * energy;
    const bright = 500 + 1600 * energy * (0.6 + Math.random() * 0.4);

    wash.gain.cancelScheduledValues(t);
    wash.gain.setTargetAtTime(peak, t, rise / 3);
    wash.gain.setTargetAtTime(0.12 * energy, t + rise, (period - rise) / 2.5);
    washFilter.frequency.cancelScheduledValues(t);
    washFilter.frequency.setTargetAtTime(bright, t, rise / 3);
    washFilter.frequency.setTargetAtTime(380 + 200 * energy, t + rise, (period - rise) / 2.5);
    washPan.pan.setTargetAtTime((Math.random() - 0.5) * 0.7, t, period / 2);

    const sprayLevel = (0.015 + 0.05 * scene.wind) * energy * (Math.random() < 0.6 ? 1 : 0.4);
    spray.gain.cancelScheduledValues(t);
    spray.gain.setTargetAtTime(sprayLevel, t + rise * 0.8, 0.25);
    spray.gain.setTargetAtTime(sprayLevel * 0.2, t + rise * 1.2, 0.9);
    rumble.gain.setTargetAtTime(0.35 + 0.35 * energy, t, 2);
    rumbleFilter.frequency.setTargetAtTime(110 + 60 * nearness, t, 2);

    timer = setTimeout(scheduleWave, period * 1000);
  }

  // Small interface sounds: a soft rounded "bloom" up for open, down for close.
  function chime(up) {
    if (!on) return;
    const t = ctx.currentTime;
    const osc = new OscillatorNode(ctx, { type: "sine", frequency: up ? 520 : 440 });
    osc.frequency.exponentialRampToValueAtTime(up ? 780 : 330, t + 0.12);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.linearRampToValueAtTime(0.05, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  return {
    get on() {
      return on;
    },
    async enable() {
      await ctx.resume();
      on = true;
      master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.8);
      clearTimeout(timer);
      scheduleWave();
    },
    disable() {
      on = false;
      clearTimeout(timer);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    },
    setScene(next) {
      scene = { ...scene, ...next };
    },
    open: () => chime(true),
    close: () => chime(false),
  };
}
