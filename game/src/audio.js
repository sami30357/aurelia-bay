// Aurelia Bay — WebAudio synth only: three radio stations, engine hum,
// a two-tone siren and one-shot sound effects. No audio files anywhere.
// Everything is guarded: if the browser has no audio, the game is silent.

export function createAudio() {
  let ctx = null;
  let master = null;
  let radioGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let station = 0;
  let step = 0;
  let nextStepTime = 0;
  let started = false;

  const STATIONS = [
    { name: 'WAVE 98 — Synthwave', bpm: 112, root: 55, wave: 'sawtooth', minor: true },
    { name: 'CALOR FM — Latin', bpm: 128, root: 65.41, wave: 'square', minor: false },
    { name: 'BAY CHILL — Chill', bpm: 84, root: 49, wave: 'triangle', minor: true },
  ];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      radioGain = ctx.createGain();
      radioGain.gain.value = 0.16;
      radioGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      started = true;
      nextStepTime = ctx.currentTime + 0.1;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function note(freq, time, dur, type, gainValue, dest) {
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(gainValue, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(g);
      g.connect(dest || master);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    } catch { /* silent */ }
  }

  // One sequencer step: bass on the beat, a little arp on top.
  function scheduleStep() {
    const st = STATIONS[station];
    const stepDur = 60 / st.bpm / 2; // eighth notes
    const scale = st.minor ? [1, 1.189, 1.335, 1.498, 1.782, 2] : [1, 1.122, 1.26, 1.498, 1.682, 2];
    const t = nextStepTime;
    if (step % 2 === 0) note(st.root, t, stepDur * 1.8, st.wave, 0.5, radioGain);
    if (step % 4 === 2) note(st.root * 1.5, t, stepDur, 'sine', 0.3, radioGain);
    const arpNote = scale[step % scale.length] * st.root * 4;
    if (step % 2 === 1) note(arpNote, t, stepDur * 0.9, 'sine', 0.22, radioGain);
    if (step % 8 === 4) note(st.root * 2, t, stepDur * 2, 'sine', 0.25, radioGain);
    step += 1;
    nextStepTime += stepDur;
  }

  function update(dt, speedNorm, wanted) {
    if (!ctx || !started) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      while (nextStepTime < ctx.currentTime + 0.25) scheduleStep();
      engineGain.gain.value = 0.02 + speedNorm * 0.06;
      engineOsc.frequency.value = 45 + speedNorm * 130;
      if (wanted > 0) {
        sirenGain.gain.value = 0.035;
        const t = ctx.currentTime;
        sirenOsc.frequency.setValueAtTime(sirenOsc.frequency.value, t);
        sirenOsc.frequency.linearRampToValueAtTime(t % 1 < 0.5 ? 950 : 700, t + 0.4);
      } else {
        sirenGain.gain.value = 0;
      }
    } catch { /* silent */ }
  }

  function sfx(name) {
    if (!ensure() || !ctx) return;
    try {
      const t = ctx.currentTime;
      if (name === 'cash') { note(880, t, 0.12, 'sine', 0.4); note(1318, t + 0.09, 0.2, 'sine', 0.4); }
      else if (name === 'pickup') { note(660, t, 0.1, 'sine', 0.35); note(990, t + 0.07, 0.14, 'sine', 0.35); }
      else if (name === 'shoot') { note(180, t, 0.08, 'square', 0.3); note(90, t, 0.12, 'sawtooth', 0.25); }
      else if (name === 'punch') { note(120, t, 0.1, 'square', 0.35); }
      else if (name === 'crash') { note(70, t, 0.25, 'sawtooth', 0.5); note(50, t + 0.05, 0.3, 'square', 0.4); }
      else if (name === 'busted') { note(440, t, 0.3, 'sawtooth', 0.3); note(330, t + 0.3, 0.5, 'sawtooth', 0.3); }
      else if (name === 'mission') { note(523, t, 0.15, 'sine', 0.4); note(659, t + 0.12, 0.15, 'sine', 0.4); note(784, t + 0.24, 0.3, 'sine', 0.45); }
      else if (name === 'fail') { note(330, t, 0.25, 'sawtooth', 0.3); note(220, t + 0.2, 0.4, 'sawtooth', 0.3); }
      else if (name === 'enter') { note(300, t, 0.08, 'sine', 0.3); }
    } catch { /* silent */ }
  }

  function unlock() {
    ensure();
  }

  function nextStation() {
    station = (station + 1) % STATIONS.length;
    step = 0;
    return STATIONS[station].name;
  }

  function toggleMute() {
    if (!ensure() || !master) return false;
    master.gain.value = master.gain.value > 0 ? 0 : 0.5;
    return master.gain.value === 0;
  }

  function stationName() {
    return STATIONS[station].name;
  }

  return { unlock, update, sfx, nextStation, stationName, toggleMute };
}
