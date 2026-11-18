// ======================= AUDIO: CAR RADIO + ENGINE + SFX =======================
// Drop your own music files (mp3 / ogg / m4a / wav) into  src/music/  and they join the radio
// automatically. File names like "Artist - Song title.mp3" are shown as artist / title.
// If the folder is empty the built-in synthwave stations (original, generated in code) play instead.

const files = import.meta.glob('./music/*.{mp3,ogg,m4a,wav,flac}', { eager: true, query: '?url', import: 'default' });

function splitName(path) {
  const base = decodeURIComponent(path.split('/').pop().replace(/\.[^.]+$/, '')).replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1], title: m[2] } : { artist: 'Your music', title: base };
}

const mid = (n) => 440 * Math.pow(2, (n - 69) / 12);

const SYNTH = [
  {
    kind: 'synth', title: 'Neon Nights', artist: 'Vice FM', bpm: 108,
    chords: [[45, [0, 3, 7]], [41, [0, 4, 7]], [48, [0, 4, 7]], [43, [0, 4, 7]]],
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], bass: [0, 2, 4, 6, 8, 10, 12, 14], octave: [6, 14], arp: 2,
  },
  {
    kind: 'synth', title: 'Ocean Drive', artist: 'Vice FM', bpm: 98,
    chords: [[41, [0, 4, 7, 11]], [40, [0, 3, 7, 10]], [38, [0, 3, 7, 10]], [48, [0, 4, 7, 11]]],
    kick: [0, 6, 10], snare: [12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 3, 6, 10, 14], octave: [10], arp: 2, soft: true,
  },
  {
    kind: 'synth', title: 'Midnight Chase', artist: 'Vice FM', bpm: 124,
    chords: [[38, [0, 3, 7]], [34, [0, 4, 7]], [41, [0, 4, 7]], [36, [0, 4, 7]]],
    kick: [0, 4, 8, 12, 14], snare: [4, 12], hat: [2, 6, 10, 14], bass: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], octave: [3, 7, 11, 15], arp: 1,
  },
];

const fileTracks = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, url]) => ({ kind: 'file', url, ...splitName(path) }));
const tracks = fileTracks.concat(SYNTH);

let ctx = null, master = null, radioGain = null, synthGain = null, delay = null, noiseBuf = null;
let el = null;
let active = false, muted = false, unlocked = false;
let index = 0, loadedUrl = '';
let timer = 0, step = 0, nextTime = 0, synthRunning = false;
const listeners = [];

export const radio = {
  tracks,
  hasFiles: fileTracks.length > 0,
  get current() { return tracks[index]; },
  get muted() { return muted; },
  onChange(fn) { listeners.push(fn); },
  next() { index = (index + 1) % tracks.length; changed(); },
  prev() { index = (index - 1 + tracks.length) % tracks.length; changed(); },
  toggleMute() { muted = !muted; changed(); },
  setActive(v) { if (v === active) return; active = v; sync(); emit(); },
};

function emit() { listeners.forEach((fn) => fn(radio)); }
function changed() { pauseSynth(); if (el) el.pause(); sync(); emit(); }

export function unlockAudio() {
  if (unlocked) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  unlocked = true;

  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain(); master.gain.value = 0.9;
  master.connect(comp); comp.connect(ctx.destination);

  radioGain = ctx.createGain(); radioGain.gain.value = 0.9; radioGain.connect(master);
  synthGain = ctx.createGain(); synthGain.gain.value = 0.5; synthGain.connect(radioGain);
  delay = ctx.createDelay(1); delay.delayTime.value = 0.28;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  delay.connect(fb); fb.connect(delay); delay.connect(synthGain);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  el = new Audio();
  el.preload = 'auto';
  ctx.createMediaElementSource(el).connect(radioGain);
  el.addEventListener('ended', () => radio.next());
  el.addEventListener('error', () => { if (tracks[index].kind === 'file') radio.next(); });

  buildEngine();
  if (ctx.state === 'suspended') ctx.resume();
  sync();
}

function sync() {
  if (!unlocked) return;
  const want = active && !muted;
  const t = tracks[index];
  if (!want) { el.pause(); pauseSynth(); return; }
  if (t.kind === 'file') {
    pauseSynth();
    if (loadedUrl !== t.url) { el.src = t.url; loadedUrl = t.url; }
    el.play().catch(() => {});
  } else {
    el.pause();
    resumeSynth(t);
  }
}

// ----------------------- synth radio -----------------------
function pauseSynth() { clearInterval(timer); synthRunning = false; }
function resumeSynth(t) {
  if (synthRunning) return;
  synthRunning = true;
  nextTime = ctx.currentTime + 0.06;
  timer = setInterval(() => {
    const spb = 60 / t.bpm / 4;
    while (nextTime < ctx.currentTime + 0.18) { playStep(t, step, nextTime); nextTime += spb; step++; }
  }, 40);
}

function osc(type, freq, t, dur, gain, cutoff, out = synthGain, attack = 0.005, send = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(out);
  if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(delay); }
  o.start(t); o.stop(t + dur + 0.05);
}
function kick(t, soft) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  g.gain.setValueAtTime(soft ? 0.7 : 1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(g); g.connect(synthGain); o.start(t); o.stop(t + 0.3);
}
function noise(t, dur, gain, type, freq, out = synthGain) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.02);
}

function playStep(tr, n, t) {
  const bar = Math.floor(n / 16) % tr.chords.length, s = n % 16;
  const [root, q] = tr.chords[bar];
  if (tr.kick.includes(s)) kick(t, tr.soft);
  if (tr.snare.includes(s)) { noise(t, 0.2, tr.soft ? 0.35 : 0.5, 'highpass', 1500); osc('triangle', 190, t, 0.12, 0.3, 2000); }
  if (tr.hat.includes(s)) noise(t, 0.04, 0.14, 'highpass', 7500);
  if (tr.bass.includes(s)) osc('sawtooth', mid(root + (tr.octave.includes(s) ? 12 : 0)), t, 0.22, 0.34, 520);
  if (s % tr.arp === 0) {
    const idx = (s / tr.arp) | 0;
    const note = root + 24 + q[idx % q.length] + (Math.floor(idx / q.length) % 2) * 12;
    osc('square', mid(note), t, 0.2, 0.09, 2600, synthGain, 0.004, 0.5);
  }
  if (s === 0) q.forEach((iv) => {
    osc('sawtooth', mid(root + 12 + iv), t, (60 / tr.bpm) * 4, 0.07, 900, synthGain, 0.5);
    osc('sawtooth', mid(root + 12 + iv) * 1.004, t, (60 / tr.bpm) * 4, 0.05, 900, synthGain, 0.5);
  });
}

// ----------------------- engine + tyres -----------------------
let eng = null;
function buildEngine() {
  const g = ctx.createGain(); g.gain.value = 0;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 3;
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
  const o2 = ctx.createOscillator(); o2.type = 'square';
  const g2 = ctx.createGain(); g2.gain.value = 0.5;
  o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(master);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 16;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0;
  lfo.connect(lfoG); lfoG.connect(g.gain);
  o1.start(); o2.start(); lfo.start();

  const sn = ctx.createBufferSource(); sn.buffer = noiseBuf; sn.loop = true;
  const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1700; sf.Q.value = 1.4;
  const sg = ctx.createGain(); sg.gain.value = 0;
  sn.connect(sf); sf.connect(sg); sg.connect(master); sn.start();
  eng = { g, f, o1, o2, lfoG, lfo, sg };
}

// kind: 'car' | 'boat' | 'heli' | null     speed01 / throttle01 / skid01 in 0..1
export const engine = {
  update(kind, speed01, throttle01, skid01 = 0) {
    if (!unlocked || !eng) return;
    const now = ctx.currentTime;
    let vol = 0, base = 40, span = 90, cut = 500, lfoDepth = 0, type1 = 'sawtooth';
    if (kind === 'car') { vol = 0.045 + throttle01 * 0.05; base = 42; span = 110; cut = 380 + speed01 * 1100 + throttle01 * 400; }
    else if (kind === 'boat') { vol = 0.05 + throttle01 * 0.05; base = 34; span = 60; cut = 300 + speed01 * 500; type1 = 'square'; }
    else if (kind === 'heli') { vol = 0.07; base = 52; span = 12; cut = 260; lfoDepth = 0.05 + speed01 * 0.02; }
    const rpm = (kind === 'car' ? (speed01 * 4 % 1) * 0.55 + speed01 * 0.5 : speed01);
    const freq = base + span * rpm;
    eng.o1.type = type1;
    eng.o1.frequency.setTargetAtTime(freq, now, 0.06);
    eng.o2.frequency.setTargetAtTime(freq * 0.5, now, 0.06);
    eng.f.frequency.setTargetAtTime(cut, now, 0.08);
    eng.g.gain.setTargetAtTime(kind ? vol : 0, now, 0.1);
    eng.lfoG.gain.setTargetAtTime(lfoDepth, now, 0.2);
    eng.sg.gain.setTargetAtTime(kind === 'car' ? skid01 * 0.07 : 0, now, 0.05);
  },
};

// ----------------------- sound effects -----------------------
function ready() { return unlocked && ctx.state === 'running'; }
export const sfx = {
  punch() {
    if (!ready()) return; const t = ctx.currentTime;
    noise(t, 0.09, 0.35, 'lowpass', 900, master);
  },
  hit() {
    if (!ready()) return; const t = ctx.currentTime;
    noise(t, 0.14, 0.6, 'lowpass', 1200, master);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
  },
  crash() {
    if (!ready()) return; const t = ctx.currentTime;
    noise(t, 0.5, 0.7, 'lowpass', 1400, master);
    noise(t, 0.25, 0.4, 'highpass', 3000, master);
  },
  splash() {
    if (!ready()) return; const t = ctx.currentTime;
    noise(t, 0.6, 0.35, 'bandpass', 1000, master);
  },
  pass() {
    if (!ready()) return; const t = ctx.currentTime;
    [60, 64, 67, 72].forEach((n, i) => osc('triangle', mid(n), t + i * 0.12, 0.5, 0.25, 5000, master));
  },
  fail() {
    if (!ready()) return; const t = ctx.currentTime;
    [55, 52, 48].forEach((n, i) => osc('sawtooth', mid(n), t + i * 0.18, 0.4, 0.2, 900, master));
  },
  level() {
    if (!ready()) return; const t = ctx.currentTime;
    [55, 59, 62, 67, 71, 74].forEach((n, i) => osc('square', mid(n), t + i * 0.1, 0.6, 0.12, 3500, master));
  },
};
