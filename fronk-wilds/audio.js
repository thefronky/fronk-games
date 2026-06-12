// FRONK WILDS — generative audio engine.
// Everything is synthesized in WebAudio at runtime: no samples, no
// copyright, no downloads. The score is the Outer-Wilds job: warm,
// sparse, melodic — the world feels alive and a little sacred.
//
// Layers:
//   pads      — slow detuned chord drones, progression drifts forever
//   plucks    — kalimba/music-box pentatonic melody, probabilistic
//   danger    — low tension drone, gain tied to nearest-wolf distance
//   wind      — filtered noise bed, slowly breathing
//   water     — lowpassed noise, gain tied to lake proximity
//   birds     — synthesized chirps, random, daytime
//   foley     — footsteps, bow draw/loose, documented-chime, hurt thud
//
// Usage:
//   const audio = new AudioEngine(); audio.start();   // user gesture
//   audio.update(dt, {moving, sprint, wolfDist, lakeDist});
//   audio.stinger() / audio.documented() / audio.thud() / audio.twang()

const PENT = [0, 2, 4, 7, 9];          // major pentatonic degrees
const ROOTS = [146.83, 164.81, 110.0, 130.81];   // D3 E3 A2 C3 — drift between

function noteHz(root, degree, octave = 0) {
  const d = PENT[((degree % 5) + 5) % 5] + 12 * Math.floor(degree / 5);
  return root * Math.pow(2, (d + 12 * octave) / 12);
}

export class AudioEngine {
  constructor() {
    this.started = false;
    this.muted = false;
    this._stepT = 0;
    this._melT = 1.5;
    this._chordT = 0;
    this._birdT = 4;
    this._chordIx = 0;
    this._rootIx = 0;
    this._padVoices = [];
  }

  start() {
    if (this.started) return;
    this.started = true;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(C.destination);

    // ── shared reverb (generated impulse: 2.8s exponential noise tail)
    const len = C.sampleRate * 2.8;
    const ir = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb = C.createConvolver(); this.verb.buffer = ir;
    this.verbGain = C.createGain(); this.verbGain.gain.value = 0.5;
    this.verb.connect(this.verbGain).connect(this.master);

    // ── echo for plucks (dotted-ish delay)
    this.echo = C.createDelay(1.2); this.echo.delayTime.value = 0.42;
    this.echoFb = C.createGain(); this.echoFb.gain.value = 0.34;
    this.echoOut = C.createGain(); this.echoOut.gain.value = 0.3;
    this.echo.connect(this.echoFb).connect(this.echo);
    this.echo.connect(this.echoOut).connect(this.master);
    this.echoOut.connect(this.verb);

    // ── buses (music runs through a warm lowpass — no glassy edges)
    this.musicBus = C.createGain(); this.musicBus.gain.value = 0.8;
    this.musicLp = C.createBiquadFilter();
    this.musicLp.type = 'lowpass'; this.musicLp.frequency.value = 2600;
    this.musicLp.Q.value = 0.5;
    this.musicBus.connect(this.musicLp);
    this.musicLp.connect(this.master); this.musicLp.connect(this.verb);
    this.foleyBus = C.createGain(); this.foleyBus.gain.value = 0.85;
    this.foleyBus.connect(this.master);

    // ── wind bed
    this.windGain = C.createGain(); this.windGain.gain.value = 0.0;
    const windSrc = this._noiseLoop();
    const windLp = C.createBiquadFilter(); windLp.type = 'lowpass';
    windLp.frequency.value = 480; windLp.Q.value = 0.4;
    const windHp = C.createBiquadFilter(); windHp.type = 'highpass';
    windHp.frequency.value = 90;
    windSrc.connect(windLp).connect(windHp).connect(this.windGain)
      .connect(this.master);
    this._windLp = windLp;

    // ── water bed
    this.waterGain = C.createGain(); this.waterGain.gain.value = 0;
    const ws = this._noiseLoop();
    const wf = C.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 600;
    ws.connect(wf).connect(this.waterGain).connect(this.master);

    // ── danger drone (wolves)
    this.dangerGain = C.createGain(); this.dangerGain.gain.value = 0;
    const d1 = C.createOscillator(); d1.type = 'sawtooth'; d1.frequency.value = 55;
    const d2 = C.createOscillator(); d2.type = 'sawtooth'; d2.frequency.value = 58.3; // minor-2nd beat
    const dlp = C.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 220;
    const dg = C.createGain(); dg.gain.value = 0.5;
    d1.connect(dg); d2.connect(dg); dg.connect(dlp).connect(this.dangerGain)
      .connect(this.master);
    d1.start(); d2.start();

    // ── pads: 3 chord voices, retuned at chord changes
    for (let v = 0; v < 3; v++) {
      const o1 = C.createOscillator(); o1.type = 'triangle';
      const o2 = C.createOscillator(); o2.type = 'sine'; o2.detune.value = 7;
      const g = C.createGain(); g.gain.value = 0;
      const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o1.connect(lp); o2.connect(lp); lp.connect(g);
      g.connect(this.musicBus);
      o1.start(); o2.start();
      this._padVoices.push({ o1, o2, g });
    }
    this._setChord(0, true);
  }

  _noiseLoop() {
    const C = this.ctx, len = C.sampleRate * 3;
    const buf = C.createBuffer(1, len, C.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {           // pinkish noise
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04;
      d[i] = last * 4.2;
    }
    const src = C.createBufferSource();
    src.buffer = buf; src.loop = true; src.start();
    return src;
  }

  _setChord(ix, instant = false) {
    const C = this.ctx, t = C.currentTime;
    const root = ROOTS[this._rootIx];
    // chords as pentatonic stacks: degrees (0,2,4),(1,3,5),(2,4,7)...
    const stacks = [[0, 2, 4], [1, 3, 6], [2, 4, 7], [-2, 0, 2]];
    const stack = stacks[ix % stacks.length];
    this._padVoices.forEach((v, i) => {
      const hz = noteHz(root, stack[i], -1);
      const ramp = instant ? 0.01 : 6;
      v.o1.frequency.setTargetAtTime(hz, t, ramp);
      v.o2.frequency.setTargetAtTime(hz * 2.003, t, ramp);
      const base = 0.05 + 0.012 * i;
      if (!instant) {        // swell into the new chord, settle back
        v.g.gain.setTargetAtTime(base * 1.7, t, 2.5);
        v.g.gain.setTargetAtTime(base, t + 7, 5);
      } else v.g.gain.setTargetAtTime(base, t, 0.5);
    });
    this._chordDegrees = stack;
    if (!instant) this._bass(noteHz(root, stack[0], -2));
  }

  _bass(hz) {                 // soft felt-piano root under chord changes
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
    const o2 = C.createOscillator(); o2.type = 'triangle';
    o2.frequency.value = hz * 1.001;
    const g = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 1.4);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 9);
    o.connect(g); o2.connect(g);
    g.connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + 9.2); o2.stop(t + 9.2);
  }

  // the recurring theme — a real motif, so the score has an identity.
  // Same bones every time, small variations, like someone remembering
  // a song rather than playing one.
  _motif() {
    const root = ROOTS[this._rootIx];
    const oct = Math.random() < 0.3 ? 1 : 0;
    const notes = [[4, 0, .5], [7, .42, .42], [9, .84, .5], [7, 1.5, .38],
                   [4, 1.92, .42], [Math.random() < 0.5 ? 2 : 5, 2.62, .5]];
    for (const [deg, when, vel] of notes)
      this._pluck(noteHz(root, deg, oct), vel, when);
    // answering low note, like an exhale
    this._pluck(noteHz(root, 0, oct - 1), 0.3, 3.4);
  }

  // kalimba pluck — the melodic voice
  _pluck(hz, vel = 0.5, when = 0) {
    const C = this.ctx, t = C.currentTime + when;
    const o = C.createOscillator(); o.type = 'sine';
    const o2 = C.createOscillator(); o2.type = 'triangle';
    o.frequency.value = hz; o2.frequency.value = hz * 2; // bright partial
    const g = C.createGain(), g2 = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.34, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 1.9);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vel * 0.10, t + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.0004, t + 0.5);
    o.connect(g); o2.connect(g2);
    g.connect(this.musicBus); g.connect(this.echo);
    g2.connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + 2.1); o2.stop(t + 0.7);
  }

  // public one-shots ────────────────────────────────────────────
  stinger() {                       // landmark discovery — rising arp
    if (!this.started) return;
    const root = ROOTS[this._rootIx];
    [0, 2, 4, 7, 9].forEach((d, i) =>
      this._pluck(noteHz(root, d, 1), 0.62 - i * 0.06, i * 0.13));
    const t = this.ctx.currentTime;
    this.verbGain.gain.setTargetAtTime(0.9, t, 0.1);
    this.verbGain.gain.setTargetAtTime(0.5, t + 1.5, 2);
  }
  documented() {                    // animal archived — two soft notes
    if (!this.started) return;
    const root = ROOTS[this._rootIx];
    this._pluck(noteHz(root, 4, 0), 0.5, 0);
    this._pluck(noteHz(root, 7, 0), 0.4, 0.16);
  }
  twang() {                         // arrow loose
    if (!this.started) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.type = 'square'; o.frequency.value = 130;
    o.frequency.exponentialRampToValueAtTime(60, t + 0.09);
    const g = C.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(this.foleyBus);
    o.start(t); o.stop(t + 0.16);
  }
  thud() {                          // player hurt
    if (!this.started) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.frequency.value = 70;
    o.frequency.exponentialRampToValueAtTime(36, t + 0.18);
    const g = C.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.foleyBus);
    o.start(t); o.stop(t + 0.32);
  }
  _step(sprint) {                   // footstep tap
    const C = this.ctx, t = C.currentTime;
    const src = C.createBufferSource();
    const len = C.sampleRate * 0.07;
    const buf = C.createBuffer(1, len, C.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    src.buffer = buf;
    const f = C.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.value = 300 + Math.random() * 160;
    const g = C.createGain(); g.gain.value = sprint ? 0.34 : 0.2;
    src.connect(f).connect(g).connect(this.foleyBus);
    src.start(t);
  }
  _cricket() {
    const C = this.ctx, t = C.currentTime;
    const n = 5 + (Math.random() * 5 | 0);
    const base = 4200 + Math.random() * 800;
    for (let i = 0; i < n; i++) {
      const o = C.createOscillator(); o.type = 'sine';
      const t0 = t + i * 0.055;
      o.frequency.value = base;
      const g = C.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.016, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.04);
      o.connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 0.05);
    }
  }
  _bird() {
    const C = this.ctx, t = C.currentTime;
    const n = 2 + (Math.random() * 3 | 0);
    const base = 2400 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const o = C.createOscillator(); o.type = 'sine';
      const t0 = t + i * (0.09 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.25), t0);
      o.frequency.exponentialRampToValueAtTime(base * 1.4, t0 + 0.05);
      const g = C.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.045, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.09);
      const p = C.createStereoPanner ? C.createStereoPanner() : null;
      if (p) { p.pan.value = Math.random() * 2 - 1; o.connect(g).connect(p).connect(this.master); }
      else o.connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 0.12);
    }
  }

  beacon(pan = 0, vol = 0.15) {       // distant chime toward a landmark
    if (!this.started) return;
    const C = this.ctx, root = ROOTS[this._rootIx];
    const make = (deg, when, v) => {
      const o = C.createOscillator(); o.type = 'sine';
      o.frequency.value = noteHz(root, deg, 1);
      const g = C.createGain();
      const t0 = C.currentTime + when;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(v, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + 2.4);
      let tail = g;
      if (C.createStereoPanner) {
        const p = C.createStereoPanner(); p.pan.value = pan;
        g.connect(p); tail = p;
      }
      tail.connect(this.verb); tail.connect(this.echo);
      o.start(t0); o.stop(t0 + 2.5);
    };
    make(7, 0, vol); make(9, 0.28, vol * 0.7);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  // called every frame from the game loop
  update(dt, s) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;

    // wind breathes
    const breathe = 0.10 + 0.05 * Math.sin(t * 0.23) + 0.02 * Math.sin(t * 0.71);
    this.windGain.gain.setTargetAtTime(breathe, t, 0.6);
    this._windLp.frequency.setTargetAtTime(380 + 180 * Math.sin(t * 0.17), t, 0.8);

    // water by lake proximity (full inside 60m, silent past 220m)
    const lk = Math.max(0, Math.min(1, 1 - (s.lakeDist - 60) / 160));
    this.waterGain.gain.setTargetAtTime(lk * 0.14, t, 0.5);

    // danger by wolf proximity (starts at 34m, max at 6m)
    const dz = Math.max(0, Math.min(1, 1 - (s.wolfDist - 6) / 28));
    this.dangerGain.gain.setTargetAtTime(dz * dz * 0.26, t, 0.4);
    // melody backs off when danger is high
    const melodyDamp = 1 - dz * 0.85;

    // chord drift
    this._chordT -= dt;
    if (this._chordT <= 0) {
      this._chordT = 26 + Math.random() * 22;
      this._chordIx++;
      if (Math.random() < 0.22) this._rootIx = (this._rootIx + 1) % ROOTS.length;
      this._setChord(this._chordIx);
    }

    // the motif returns every 40-75s — the score's identity
    this._motifT = (this._motifT ?? 14) - dt;
    if (this._motifT <= 0 && dz < 0.3) {
      this._motifT = 40 + Math.random() * 35;
      this._motif();
    }

    // sparse melody — random walk on the current chord's scale
    this._melT -= dt;
    if (this._melT <= 0) {
      this._melT = 1.6 + Math.random() * 3.4;
      if (Math.random() < 0.78 * melodyDamp) {
        this._melDeg = (this._melDeg ?? 4) + ((Math.random() * 5 | 0) - 2);
        this._melDeg = Math.max(-2, Math.min(11, this._melDeg));
        const root = ROOTS[this._rootIx];
        this._pluck(noteHz(root, this._melDeg, 0), 0.3 + Math.random() * 0.3);
        if (Math.random() < 0.3)   // grace echo a third up
          this._pluck(noteHz(root, this._melDeg + 2, 0), 0.18, 0.21);
      }
    }

    // birds — daytime creatures; crickets take over at night
    this._birdT -= dt;
    if (this._birdT <= 0) {
      this._birdT = 3 + Math.random() * 9;
      const night = s.night || 0;
      if (night < 0.5 && Math.random() < 0.65 * (1 - night)) this._bird();
      else if (night > 0.5 && Math.random() < 0.8) this._cricket();
    }

    // footsteps
    if (s.moving) {
      this._stepT -= dt;
      if (this._stepT <= 0) {
        this._stepT = s.sprint ? 0.3 : 0.46;
        this._step(s.sprint);
      }
    } else this._stepT = 0.12;
  }
}
