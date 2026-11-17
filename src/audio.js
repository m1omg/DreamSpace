// Small procedural sound engine (Web Audio): surf, underwater rumble, wind
// at speed, splashes, pearl chime, crocodile hiss/growl, heartbeat when hunted.

export function createAudio() {
  let ctx = null, master, dry, lowpass, surf, under, wind, pad, muted = false, beatT = 0;
  const A = {
    get ready() { return !!ctx; },
    start() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
      lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 18000; lowpass.connect(master);
      dry = ctx.createGain(); dry.connect(lowpass);

      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
      A.noiseBuf = noiseBuf;
      const loop = (freq, q, type) => {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0;
        s.connect(f); f.connect(g); g.connect(dry); s.start();
        return { g, f };
      };
      surf = loop(700, 0.4, 'bandpass');
      under = loop(140, 0.8, 'lowpass');
      wind = loop(900, 0.7, 'bandpass');
      // slow swell on the surf
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
      const lg = ctx.createGain(); lg.gain.value = 0.05;
      lfo.connect(lg); lg.connect(surf.g.gain); lfo.start();
      // dreamy pad
      pad = ctx.createGain(); pad.gain.value = 0.0; pad.connect(dry);
      const pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 700; pf.connect(pad);
      for (const f of [110, 164.8, 220.5, 277.2, 329.6]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0.05;
        const l = ctx.createOscillator(); l.frequency.value = 0.05 + Math.random() * 0.12;
        const lg2 = ctx.createGain(); lg2.gain.value = 0.045;
        l.connect(lg2); lg2.connect(g.gain); l.start();
        o.connect(g); g.connect(pf); o.start();
      }
      pad.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 6);
    },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; },
    burst(freq, q, dur, gain, type = 'bandpass', sweep = 1) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = A.noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dry);
      s.start(t, Math.random() * 3); s.stop(t + dur + 0.05);
    },
    tone(freq, dur, gain, type = 'sine', when = 0, slide = 1) {
      if (!ctx) return;
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dry); o.start(t); o.stop(t + dur + 0.05);
    },
    splash(power) { A.burst(1300 + Math.random() * 500, 0.6, 0.28 + power * 0.03, Math.min(0.5, 0.12 + power * 0.035), 'bandpass', 0.35); },
    step() { A.burst(500, 1, 0.09, 0.05, 'bandpass', 0.6); },
    plunge() { A.burst(500, 0.5, 0.7, 0.5, 'lowpass', 0.25); },
    hopPerfect(combo) { A.tone(520 + Math.min(combo, 14) * 38, 0.12, 0.07, 'triangle'); },
    pearl() { [660, 880, 1108, 1320, 1760].forEach((f, i) => A.tone(f, 0.5, 0.11, 'sine', i * 0.07)); },
    alert() { A.burst(2600, 2, 0.6, 0.16, 'bandpass', 0.7); A.tone(70, 0.7, 0.2, 'sawtooth', 0, 0.75); },
    lunge() { A.tone(95, 0.4, 0.28, 'sawtooth', 0, 0.5); A.burst(900, 0.5, 0.35, 0.3, 'bandpass', 0.4); },
    snap() { A.burst(2400, 1.5, 0.07, 0.4, 'highpass', 1); A.tone(160, 0.1, 0.25, 'square', 0, 0.5); },
    bite() { A.burst(300, 0.7, 0.4, 0.6, 'lowpass', 0.4); A.tone(60, 0.45, 0.45, 'sawtooth', 0, 0.5); },
    wake() { A.tone(440, 1.4, 0.12, 'sine', 0, 0.25); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => A.tone(f, 0.9, 0.1, 'triangle', i * 0.13)); },
    // continuous mix, called every frame
    update(dt, s) {
      if (!ctx) return;
      const t = ctx.currentTime, k = 0.08;
      lowpass.frequency.setTargetAtTime(s.under ? 520 : 18000, t, k);
      surf.g.gain.setTargetAtTime(s.under ? 0.02 : 0.1 + s.seaside * 0.1, t, 0.3);
      under.g.gain.setTargetAtTime(s.under ? 0.5 : 0, t, k);
      wind.g.gain.setTargetAtTime(Math.min(0.4, Math.max(0, s.speed - 5) * 0.03) * (s.air ? 1 : 0.4), t, 0.1);
      wind.f.frequency.setTargetAtTime(600 + s.speed * 70, t, 0.1);
      if (s.danger > 0.05) {
        beatT -= dt;
        if (beatT <= 0) {
          beatT = 0.85 - 0.5 * s.danger;
          A.tone(58, 0.14, 0.3 * s.danger + 0.1, 'sine', 0, 0.7);
          A.tone(52, 0.16, 0.22 * s.danger + 0.07, 'sine', 0.15, 0.7);
        }
      }
    },
  };
  return A;
}
