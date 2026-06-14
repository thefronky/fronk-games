// FRONK WILDS — generative audio engine.
// Everything is synthesized in WebAudio at runtime: no samples, no
// copyright, no downloads. The score's job is dread that never quite
// announces itself: the world is beautiful, and it is not on your side.
//
// Layers:
//   pads      — slow detuned minor drones, progression drifts forever
//   plucks    — sparse low plucks; the motif is a half-remembered hymn
//   presence  — sub-bass swell that rises VERY slowly after dark
//   danger    — detuned cluster drone + breath, tied to nearest predator
//   wind      — filtered noise bed, slowly breathing
//   water     — lowpassed noise, gain tied to lake proximity
//   birds     — rare; some replaced by a single distant corvid caw
//   howls     — far synthesized wolf-howls at night (also public howl())
//   foley     — footsteps, bow draw/loose, documented-chime, hurt thud
//
// Usage:
//   const audio = new AudioEngine(); audio.start();   // user gesture
//   audio.update(dt, {moving, sprint, wolfDist, lakeDist});
//   audio.stinger() / audio.documented() / audio.thud() / audio.twang(power)
//   audio.drawCreak(t01)        — call every frame while drawing the bow
//   audio.impact(kind, dist01)  — 'flesh' | 'ground' | 'wood', 0=close 1=far
//   audio.setGround(kind)       — 'grass' | 'rock' | 'sand' footstep material
//   update() also reads s.altitude01 (0..1) — scales wind-gust intensity

const PENT = [0, 3, 5, 7, 10];         // minor pentatonic degrees
const ROOTS = [110.0, 98.0, 82.41, 73.42];   // A2 G2 E2 D2 — drift low

function noteHz(root, degree, octave = 0) {
  const d = PENT[((degree % 5) + 5) % 5] + 12 * Math.floor(degree / 5);
  return root * Math.pow(2, (d + 12 * octave) / 12);
}

export class AudioEngine {
  constructor() {
    this.started = false;
    this.muted = false;
    this._stepT = 0;
    this._melT = 4;
    this._chordT = 0;
    this._birdT = 9;
    this._chordIx = 0;
    this._rootIx = 0;
    this._padVoices = [];
    this._ground = 'grass';            // footstep material (setGround)
    this._stepL = false;               // alternating step pan
    this._gustWait = 12 + Math.random() * 24;   // wind-gust state machine
    this._gustDur = 0;
    this._gustT = 0;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain();
    this.master.gain.value = 1.0;
    // master compressor — gentle glue + free sidechain pump when the
    // foley bus hits hot. The compressor is the ONLY node touching
    // the destination.
    this.comp = C.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.2;
    this.master.connect(this.comp).connect(C.destination);

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
    this.musicBus = C.createGain(); this.musicBus.gain.value = 0.7;
    this.musicLp = C.createBiquadFilter();
    this.musicLp.type = 'lowpass'; this.musicLp.frequency.value = 1450;
    this.musicLp.Q.value = 0.5;
    this.musicBus.connect(this.musicLp);
    this.musicLp.connect(this.master); this.musicLp.connect(this.verb);
    this.foleyBus = C.createGain(); this.foleyBus.gain.value = 1.15;   // hot into comp = pump
    this.foleyBus.connect(this.master);
    this._musicLevel = this.musicBus.gain.value;   // for sidechain restore

    // ── 3D / spatial bus ── world-positioned one-shots (a bear's twig
    // snap, its breath) feed PannerNodes so they arrive from their true
    // bearing and distance. HRTF panning = the "8D" headphone effect:
    // you hear it behind your left shoulder before you ever see it.
    this.spatialBus = C.createGain(); this.spatialBus.gain.value = 1.0;
    this.spatialBus.connect(this.master);
    this.spatialBus.connect(this.verb);            // a little air around it
    // place the listener at the player's ear, looking down their yaw
    this._listener = C.listener;

    // ── title theme bus ── the big cinematic-classical opener. Heavy on
    // the reverb send for a concert-hall swell; fades out as you dive in.
    this.titleBus = C.createGain(); this.titleBus.gain.value = 0.0001;
    this.titleBus.connect(this.master);
    this.titleBus.connect(this.verb);
    this._title = null;

    // ── shared one-shot noise buffer (1s white) — every burst-style
    // sound (snap, whoosh, impacts, footsteps) reads from this with a
    // random offset instead of allocating a fresh buffer per shot.
    {
      const nl = C.sampleRate;
      this._shotNoise = C.createBuffer(1, nl, C.sampleRate);
      const nd = this._shotNoise.getChannelData(0);
      for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    }

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

    // ── danger drone (predators) — detuned three-voice cluster, plus a
    // breath of bandpassed noise so it sounds like something breathing
    this.dangerGain = C.createGain(); this.dangerGain.gain.value = 0;
    const d1 = C.createOscillator(); d1.type = 'sawtooth'; d1.frequency.value = 55;
    const d2 = C.createOscillator(); d2.type = 'sawtooth'; d2.frequency.value = 58.3; // minor-2nd beat
    const d3 = C.createOscillator(); d3.type = 'sawtooth'; d3.frequency.value = 53.6; // cluster underside
    d3.detune.value = -9;
    const dlp = C.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 210;
    const dg = C.createGain(); dg.gain.value = 0.46;
    d1.connect(dg); d2.connect(dg); d3.connect(dg);
    dg.connect(dlp).connect(this.dangerGain).connect(this.master);
    d1.start(); d2.start(); d3.start();
    const breath = this._noiseLoop();
    const bbp = C.createBiquadFilter(); bbp.type = 'bandpass';
    bbp.frequency.value = 640; bbp.Q.value = 1.8;
    const bg = C.createGain(); bg.gain.value = 0.30;
    breath.connect(bbp).connect(bg).connect(this.dangerGain);

    // ── presence — paired sines just under hearing's floor; the swell
    // is driven from update() and rises VERY slowly at night
    this.subGain = C.createGain(); this.subGain.gain.value = 0;
    const sub1 = C.createOscillator(); sub1.type = 'sine'; sub1.frequency.value = 31;
    const sub2 = C.createOscillator(); sub2.type = 'sine'; sub2.frequency.value = 31.43; // slow beat
    sub1.connect(this.subGain); sub2.connect(this.subGain);
    this.subGain.connect(this.master);
    sub1.start(); sub2.start();

    // ── pads: 3 chord voices, retuned at chord changes
    for (let v = 0; v < 3; v++) {
      const o1 = C.createOscillator(); o1.type = 'triangle';
      const o2 = C.createOscillator(); o2.type = 'sine'; o2.detune.value = 11;
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

  // the recurring theme — a hymn nobody fully remembers. Slow, falling,
  // plagal bones; notes simply fail to arrive sometimes, like a verse
  // sung alone in a big dark room.
  _motif() {
    const root = ROOTS[this._rootIx];
    const oct = Math.random() < 0.12 ? 1 : 0;
    const notes = [[3, 0, .38], [2, 1.15, .30], [0, 2.4, .40], [1, 3.8, .26],
                   [0, 5.0, .34], [Math.random() < 0.5 ? -1 : -2, 6.6, .28]];
    for (const [deg, when, vel] of notes)
      if (Math.random() < 0.8)            // half-remembered: notes go missing
        this._pluck(noteHz(root, deg, oct), vel, when);
    // low tonic exhale, an octave under, not always there
    if (Math.random() < 0.7)
      this._pluck(noteHz(root, 0, oct - 1), 0.24, 8.3);
  }

  // kalimba pluck — the melodic voice
  _pluck(hz, vel = 0.5, when = 0) {
    const C = this.ctx, t = C.currentTime + when;
    const o = C.createOscillator(); o.type = 'sine';
    const o2 = C.createOscillator(); o2.type = 'triangle';
    o.frequency.value = hz; o2.frequency.value = hz * 2; // bright partial
    const g = C.createGain(), g2 = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.27, t + 0.028);   // soft felt attack
    g.gain.exponentialRampToValueAtTime(0.0004, t + 2.3);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vel * 0.05, t + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0004, t + 0.6);
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
    this._pluck(noteHz(root, 0, -1), 0.55, 0);   // low body under the arp
    const t = this.ctx.currentTime;
    this.verbGain.gain.setTargetAtTime(0.9, t, 0.1);
    this.verbGain.gain.setTargetAtTime(0.5, t + 1.5, 2);
  }
  documented() {                    // animal archived — two soft notes
    if (!this.started) return;
    const root = ROOTS[this._rootIx];
    this._pluck(noteHz(root, 4, 0), 0.5, 0);
    this._pluck(noteHz(root, 7, 0), 0.4, 0.16);
    this._pluck(noteHz(root, 0, -1), 0.34, 0.02);   // low body
  }
  // bow RELEASE — four simultaneous layers, like real foley:
  //   snap (string crack) + thwack (limb body) + string ring + arrow whoosh.
  // power 0..1 scales level and brightness. twang() still works (power=1).
  twang(power = 1) {
    if (!this.started) return;
    const C = this.ctx, t = C.currentTime;
    const p = Math.max(0.15, Math.min(1, power));
    const lvl = 0.45 + 0.55 * p;
    const out = this.foleyBus;
    this._creakOn = false; this._silenceCreak(t);   // draw is over

    // (a) string snap — ~3ms highpassed noise crack, the "crack" transient
    {
      const src = C.createBufferSource(); src.buffer = this._shotNoise;
      const hp = C.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.value = 1800 + 1100 * p; hp.Q.value = 0.7;
      const g = C.createGain();
      g.gain.setValueAtTime(0.55 * lvl, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.014);
      src.connect(hp).connect(g).connect(out);
      src.start(t, Math.random() * 0.6, 0.03);
    }

    // (b) limb thwack — damped low sine pair, the bow's wooden body
    for (const [hz, v, dur] of [[97, 0.5, 0.085], [152, 0.28, 0.06]]) {
      const o = C.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(hz * (0.97 + 0.06 * Math.random()), t);
      o.frequency.exponentialRampToValueAtTime(hz * 0.78, t + dur);
      const g = C.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * lvl, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.02);
    }

    // (c) string vibration — fast-decaying triangle, pitch sags as the
    // string sheds tension
    {
      const o = C.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(232 + 52 * p, t);
      o.frequency.exponentialRampToValueAtTime(164, t + 0.12);
      const lp = C.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 1800 + 2200 * p; lp.Q.value = 0.6;
      const g = C.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2 * lvl, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.15);
      o.connect(lp).connect(g).connect(out);
      o.start(t); o.stop(t + 0.17);
    }

    // (d) arrow whoosh — bandpassed noise, center sweeps 900→350Hz as
    // the shaft leaves; swells in then fades (it's GOING somewhere)
    {
      const src = C.createBufferSource(); src.buffer = this._shotNoise;
      const bp = C.createBiquadFilter(); bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(820 + 380 * p, t);
      bp.frequency.exponentialRampToValueAtTime(350, t + 0.3);
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.26 * lvl, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random() * 0.6, 0.36);
    }

    // sidechain: duck the music ~250ms so the release CUTS through
    const mg = this.musicBus.gain;
    mg.cancelScheduledValues(t);
    mg.setValueAtTime(mg.value, t);
    mg.linearRampToValueAtTime(this._musicLevel * 0.35, t + 0.018);
    mg.setTargetAtTime(this._musicLevel, t + 0.12, 0.11);
  }

  // continuous bow-draw creak — safe to call EVERY frame while drawing.
  // Managed nodes are built once, then only AudioParams are modulated.
  // t01: 0 = string at rest (silent), 1 = full draw.
  drawCreak(t01) {
    if (!this.started) return;
    const C = this.ctx, t = C.currentTime;
    const k = Math.max(0, Math.min(1, t01 || 0));
    if (!this._creak) {
      const src = this._noiseLoop();
      const lp = C.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 900; lp.Q.value = 0.5;
      const bp = C.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 140; bp.Q.value = 2.4;
      const g = C.createGain(); g.gain.value = 0;
      src.connect(lp).connect(bp).connect(g).connect(this.foleyBus);
      // stutter LFO on the gain — wood grinding, not hissing
      const lfo = C.createOscillator(); lfo.type = 'sine';
      lfo.frequency.value = 6.3;
      const lfoG = C.createGain(); lfoG.gain.value = 0;
      lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
      // 2nd, slower stutter LFO at a non-integer ratio → irregular grind
      const lfo2 = C.createOscillator(); lfo2.type = 'sawtooth';
      lfo2.frequency.value = 3.7;
      const lfo2G = C.createGain(); lfo2G.gain.value = 0;
      lfo2.connect(lfo2G); lfo2G.connect(g.gain); lfo2.start();
      // faint string-tension tone, rises with the draw
      const o = C.createOscillator(); o.type = 'triangle';
      o.frequency.value = 64;
      const og = C.createGain(); og.gain.value = 0;
      o.connect(og).connect(this.foleyBus); o.start();
      this._creak = { g, bp, lfo, lfoG, lfo2, lfo2G, o, og };
    }
    const cr = this._creak;
    // LOUD, escalating creak — the bow STRETCHING. Gain ramps hard with
    // the draw and the stutter LFO speeds up so near full draw it
    // sputters like wood and sinew fighting you.
    cr.g.gain.setTargetAtTime((0.06 + k * 0.20), t, 0.05);          // much louder
    cr.lfoG.gain.setTargetAtTime(0.04 + k * 0.10, t, 0.05);         // deep stutter
    cr.lfo.frequency.setTargetAtTime(5 + k * 13, t, 0.08);          // sputters faster as you pull
    cr.lfo2.frequency.setTargetAtTime(3.3 + k * 7, t, 0.08);        // 2nd LFO = irregular grind
    cr.lfo2G.gain.setTargetAtTime(k * 0.07, t, 0.06);
    cr.bp.frequency.setTargetAtTime(150 + k * 620, t, 0.07);        // brighter, straining
    cr.bp.Q.setTargetAtTime(2.0 + k * 4, t, 0.08);
    cr.o.frequency.setTargetAtTime(70 + k * k * 260, t, 0.06);      // rising tension tone
    cr.og.gain.setTargetAtTime(k * k * 0.06, t, 0.05);
    // random fiber-creak ticks near full draw — the satisfying sputter.
    // discrete pops scheduled when the draw is deep, rate rises with k.
    this._creakTickT = (this._creakTickT ?? 0) - 0.016;
    if (k > 0.45 && this._creakTickT <= 0) {
      this._creakTickT = 0.16 - k * 0.11 + Math.random() * 0.06;    // faster, denser near full
      const o = C.createOscillator(); o.type = 'triangle';
      o.frequency.value = 320 + Math.random() * 480 + k * 300;
      const g = C.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 + k * 0.06, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.05 + Math.random() * 0.04);
      const bp = C.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 1800 + Math.random() * 1400; bp.Q.value = 3;
      o.connect(bp).connect(g).connect(this.foleyBus);
      o.start(t); o.stop(t + 0.12);
    }
    this._creakOn = true; this._creakT = 0.15;   // watchdog (see update)
  }

  _silenceCreak(t) {
    const cr = this._creak;
    if (!cr) return;
    cr.g.gain.setTargetAtTime(0, t, 0.03);
    cr.lfoG.gain.setTargetAtTime(0, t, 0.03);
    if (cr.lfo2G) cr.lfo2G.gain.setTargetAtTime(0, t, 0.03);
    cr.og.gain.setTargetAtTime(0, t, 0.03);
  }

  // arrow IMPACT. kind: 'flesh' | 'ground' | 'wood'.
  // dist01: 0 = point blank, 1 = far away (quieter + duller).
  impact(kind = 'ground', dist01 = 0) {
    if (!this.started) return;
    const C = this.ctx, t = C.currentTime;
    const d = Math.max(0, Math.min(1, dist01 || 0));
    const lp = C.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 340 + 5000 * (1 - d * 0.85);    // distance dulls
    const out = C.createGain(); out.gain.value = 1 - d * 0.72;
    lp.connect(out).connect(this.foleyBus);

    const hit = (hz0, hz1, v, dur, type = 'sine') => {
      const o = C.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(hz0, t);
      o.frequency.exponentialRampToValueAtTime(hz1, t + dur);
      const g = C.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(lp);
      o.start(t); o.stop(t + dur + 0.02);
    };
    const burst = (v, dur, fHz, type = 'lowpass', q = 0.7, when = 0) => {
      const src = C.createBufferSource(); src.buffer = this._shotNoise;
      const f = C.createBiquadFilter(); f.type = type;
      f.frequency.value = fHz; f.Q.value = q;
      const g = C.createGain();
      g.gain.setValueAtTime(v, t + when);
      g.gain.exponentialRampToValueAtTime(0.001, t + when + dur);
      src.connect(f).connect(g).connect(lp);
      src.start(t + when, Math.random() * 0.6, dur + 0.02);
    };

    if (kind === 'flesh') {          // dull wet thump
      hit(74, 42, 0.55, 0.13);
      burst(0.3, 0.07, 480);
    } else if (kind === 'wood') {    // bright knock + short ring
      hit(195, 150, 0.4, 0.06, 'triangle');
      hit(720, 695, 0.15, 0.14);
      burst(0.22, 0.025, 2400, 'bandpass', 1.5);
    } else if (kind === 'water') {   // a plip + a rising-then-falling splash
      hit(900, 240, 0.16, 0.09, 'sine');         // the bloop
      burst(0.34, 0.16, 2600, 'bandpass', 0.6);  // the splash spray
      burst(0.18, 0.30, 700, 'lowpass', 0.8, 0.04);  // the swallow under it
    } else {                          // ground: soft thud + grass tick
      hit(88, 50, 0.4, 0.1);
      burst(0.2, 0.06, 380);
      burst(0.07, 0.03, 3200, 'bandpass', 2, 0.012);
    }
  }

  // ── place the listener (the player's ears) in the world each frame.
  // forward derives from yaw: the game's forward is (sin yaw, 0, cos yaw).
  setListener(x, z, yaw) {
    const L = this._listener; if (!L) return;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (L.positionX) {                 // modern AudioParam interface
      const t = this.ctx.currentTime;
      L.positionX.setTargetAtTime(x, t, 0.02);
      L.positionY.setTargetAtTime(1.6, t, 0.02);
      L.positionZ.setTargetAtTime(z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02);
      L.forwardY.setTargetAtTime(0, t, 0.02);
      L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) {         // legacy Safari
      L.setPosition(x, 1.6, z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // build a PannerNode at a world point. HRTF for the headphone-3D feel.
  _panner(x, z) {
    const C = this.ctx;
    const p = C.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 5; p.maxDistance = 70; p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = 0.3; p.positionZ.value = z; }
    else if (p.setPosition) p.setPosition(x, 0.3, z);
    return p;
  }

  // a twig/branch snap at a world point — the signature stalk sound.
  // vol fades it for distant or covered movement; spatialized so its
  // bearing is unmistakable on headphones.
  snapAt(x, z, player, vol = 0.8) {
    if (!this.started || this.muted) return;
    const C = this.ctx, t = C.currentTime;
    const pan = this._panner(x, z);
    pan.connect(this.spatialBus);
    // dry crack: a short filtered noise burst + a tiny woody pitch drop
    const src = C.createBufferSource(); src.buffer = this._shotNoise;
    const bp = C.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1700 + Math.random() * 1400; bp.Q.value = 5;
    const g = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(bp).connect(g).connect(pan);
    src.start(t, Math.random() * 0.6, 0.1);
    // the woody knock under it
    const o = C.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(240 + Math.random() * 80, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.05);
    const og = C.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(vol * 0.5, t + 0.005);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(og).connect(pan);
    o.start(t); o.stop(t + 0.09);
  }

  // the breath-in of waking — a soft rising inhale of filtered noise
  breath() {
    if (!this.started || this.muted) return;
    const C = this.ctx, t = C.currentTime;
    const src = C.createBufferSource(); src.buffer = this._shotNoise; src.loop = true;
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(380, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.7);   // rising = drawing in
    const g = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.2);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 1.3);
  }

  // ── jaw harp ── the base's voice. A low drone plucked on a steady
  // beat, each twang a bright formant that sweeps down as the "mouth"
  // closes — the distinctive boing. Synthesized, copyright-clean.
  setBaseMusic(on) {
    if (this._baseMusic === on) return;
    this._baseMusic = on;
    if (on) this._jawT = 0;            // start plucking promptly
  }
  _jawTwang(when = 0, hz = 73.42) {    // D2 drone fundamental
    const C = this.ctx, t = C.currentTime + when;
    const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
    // the formant sweep — bright open mouth snapping shut
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7;
    bp.frequency.setValueAtTime(1900 + Math.random() * 600, t);
    bp.frequency.exponentialRampToValueAtTime(380, t + 0.34);
    const g = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.01);     // sharp pluck
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.5);
    // a touch of the dry drone under the formant for body
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const g2 = C.createGain();
    g2.gain.setValueAtTime(0.05, t);
    g2.gain.exponentialRampToValueAtTime(0.0004, t + 0.42);
    o.connect(bp).connect(g).connect(this.musicBus);
    o.connect(lp).connect(g2).connect(this.musicBus);
    o.start(t); o.stop(t + 0.55);
  }

  // ════ the cinematic title theme ════════════════════════════════════
  // an epic minor progression (i–VI–III–VII = Am–F–C–G), swelling strings,
  // a low cello root, a soaring lead, and timpani on the downbeats. Wholly
  // synthesized, original, copyright-clean. Scheduled bar-by-bar from
  // update() so it keeps building until the dive fades it out.
  titleTheme() {
    if (!this.started || this._title) return;
    const t = this.ctx.currentTime;
    this.titleBus.gain.cancelScheduledValues(t);
    this.titleBus.gain.setValueAtTime(0.0001, t);
    this.titleBus.gain.exponentialRampToValueAtTime(0.85, t + 3.0);   // swell up
    this._title = { ix: 0, nextT: t + 0.1, fading: false, stopAt: 1e9 };
  }
  // runs every frame (even before the game starts) to keep the theme going
  pumpTitle(dt) {
    if (!this.started || this.muted || !this._title) return;
    const t = this.ctx.currentTime;
    if (this.ctx.state !== 'running') { this.ctx.resume && this.ctx.resume(); return; }
    while (this._title.nextT < t + 0.5) {
      this._scheduleTitleBar(this._title.ix, this._title.nextT);
      this._title.ix++; this._title.nextT += 3.6;
    }
    if (this._title.fading && t > this._title.stopAt) this._title = null;
  }
  fadeTitle(sec = 4) {
    if (!this._title) return;
    const t = this.ctx.currentTime;
    this.titleBus.gain.cancelScheduledValues(t);
    this.titleBus.gain.setValueAtTime(Math.max(0.0001, this.titleBus.gain.value), t);
    this.titleBus.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    this._title.fading = true; this._title.stopAt = t + sec + 0.2;
  }
  _scheduleTitleBar(ix, when) {
    // Am, F, C, G — each held a bar (3.6s). roots chosen low for weight.
    const PROG = [
      { root: 220.00, triad: [0, 3, 7], mel: [12, 15, 19, 15] },  // Am
      { root: 174.61, triad: [0, 4, 7], mel: [16, 12, 16, 19] },  // F
      { root: 261.63, triad: [0, 4, 7], mel: [12, 16, 19, 24] },  // C
      { root: 196.00, triad: [0, 4, 7], mel: [14, 11, 14, 19] },  // G
    ];
    const BAR = 3.6;
    const ch = PROG[ix % 4];
    const grow = Math.min(1, 0.55 + ix * 0.12);          // builds over the first bars
    this._titleStrings(ch.root, ch.triad, when, BAR, grow);
    this._titleBass(ch.root / 2, when, BAR, grow);
    this._titleHit(when, 0.5 + 0.4 * grow);              // timpani downbeat
    if (ix >= 2) this._titleHit(when + BAR * 0.5, 0.4 * grow);
    // the soaring lead — enters after the first bar
    if (ix >= 1) ch.mel.forEach((s, k) =>
      this._titleLead(ch.root * Math.pow(2, s / 12), when + k * (BAR / 4), BAR / 4 * 0.92, grow));
  }
  _titleStrings(root, triad, when, dur, vol) {
    const C = this.ctx;
    const notes = triad.concat([12, 19]);                // triad + octave + fifth-above
    for (const s of notes) {
      const hz = root * Math.pow(2, s / 12);
      for (let d = -1; d <= 1; d += 2) {                 // two detuned saws per note = ensemble
        const o = C.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = hz * (1 + d * 0.0022);
        const lfo = C.createOscillator(); lfo.frequency.value = 5.2 + Math.random();
        const lg = C.createGain(); lg.gain.value = hz * 0.004;   // vibrato depth
        lfo.connect(lg).connect(o.frequency); lfo.start(when); lfo.stop(when + dur + 0.6);
        const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.6;
        const g = C.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(0.05 * vol, when + 1.0);   // bowed swell
        g.gain.setValueAtTime(0.05 * vol, when + dur - 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.4);
        o.connect(lp).connect(g).connect(this.titleBus);
        o.start(when); o.stop(when + dur + 0.5);
      }
    }
  }
  _titleBass(hz, when, dur, vol) {
    const C = this.ctx;
    const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
    const o2 = C.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.16 * vol, when + 0.4);
    g.gain.setValueAtTime(0.16 * vol, when + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.3);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.titleBus);
    o.start(when); o2.start(when); o.stop(when + dur + 0.4); o2.stop(when + dur + 0.4);
  }
  _titleLead(hz, when, dur, vol) {
    const C = this.ctx;
    const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
    const o2 = C.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = hz;
    const lfo = C.createOscillator(); lfo.frequency.value = 5.6;
    const lg = C.createGain(); lg.gain.value = hz * 0.006;
    lfo.connect(lg).connect(o.frequency); lfo.start(when); lfo.stop(when + dur + 0.3);
    const g = C.createGain(), g2 = C.createGain(); g2.gain.value = 0.4;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.11 * vol, when + 0.12);   // a singing attack
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(this.titleBus);
    o2.connect(g2).connect(g);
    o.start(when); o2.start(when); o.stop(when + dur + 0.2); o2.stop(when + dur + 0.2);
  }
  _titleHit(when, vol) {                         // timpani — a felt boom
    const C = this.ctx;
    const o = C.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(80, when);
    o.frequency.exponentialRampToValueAtTime(44, when + 0.18);
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.5 * vol, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    const src = C.createBufferSource(); src.buffer = this._shotNoise;
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 120; bp.Q.value = 1.2;
    const ng = C.createGain();
    ng.gain.setValueAtTime(0.18 * vol, when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.connect(g).connect(this.titleBus);
    src.connect(bp).connect(ng).connect(this.titleBus);
    o.start(when); o.stop(when + 0.55); src.start(when, 0, 0.25);
  }

  // ── kill stinger ── a short cinematic punctuation that echoes the title
  // theme: a timpani boom under a quick swelling Am string chord and a
  // resolving lead note. Ties each kill back to the opening's tonality.
  killStinger() {
    if (!this.started || this.muted) return;
    const C = this.ctx, t = C.currentTime;
    const bus = C.createGain(); bus.gain.value = 0.9;
    bus.connect(this.master); bus.connect(this.verb);
    // timpani
    if (this._titleHit) { /* reuse if present */ }
    const o = C.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(78, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.18);
    const og = C.createGain(); og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.5, t + 0.008); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(og).connect(bus); o.start(t); o.stop(t + 0.55);
    // Am string chord (A C E) — swell + fall, the theme's tonic
    [220, 261.63, 329.63].forEach((hz, k) => {
      for (let d = -1; d <= 1; d += 2) {
        const s = C.createOscillator(); s.type = 'sawtooth'; s.frequency.value = hz * (1 + d * 0.002);
        const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000;
        const g = C.createGain(); g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.18);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        s.connect(lp).connect(g).connect(bus); s.start(t); s.stop(t + 1.7);
      }
    });
    // a resolving lead note up high
    const ld = C.createOscillator(); ld.type = 'triangle'; ld.frequency.setValueAtTime(440, t);
    ld.frequency.linearRampToValueAtTime(659.25, t + 0.5);    // A→E, lifting
    const lg = C.createGain(); lg.gain.setValueAtTime(0.0001, t + 0.12);
    lg.gain.linearRampToValueAtTime(0.1, t + 0.3); lg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    ld.connect(lg).connect(bus); ld.start(t + 0.12); ld.stop(t + 1.6);
  }

  // ── breath ── one inhale→exhale, scaled by exertion L (0..1). Heavier
  // and faster the higher L. Driven by the scheduler in update().
  _breathCycle(L) {
    const C = this.ctx, t = C.currentTime;
    const vol = 0.05 + 0.22 * L;
    const dur = 0.5 - 0.18 * L;                 // quicker breaths when winded
    const puff = (when, fromHz, toHz, v, d) => {
      const src = C.createBufferSource(); src.buffer = this._shotNoise; src.loop = true;
      const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.0 + L;
      bp.frequency.setValueAtTime(fromHz, when);
      bp.frequency.exponentialRampToValueAtTime(toHz, when + d);
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(v, when + d * 0.4);
      g.gain.setTargetAtTime(0.0001, when + d * 0.6, d * 0.4);
      src.connect(bp).connect(g).connect(this.master);
      src.start(when, Math.random() * 0.4); src.stop(when + d + 0.3);
    };
    puff(t, 360, 820, vol, dur);                // inhale — rising
    puff(t + dur + 0.06, 620, 280, vol * 0.85, dur * 1.1);   // exhale — falling
  }

  // a low spatial breath/huff from a big animal — rarer, scarier.
  breathAt(x, z, vol = 0.5) {
    if (!this.started || this.muted) return;
    const C = this.ctx, t = C.currentTime;
    const pan = this._panner(x, z); pan.connect(this.spatialBus);
    const src = C.createBufferSource(); src.buffer = this._shotNoise; src.loop = true;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
    const g = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.18);     // breathe in
    g.gain.setTargetAtTime(0.0001, t + 0.5, 0.22);     // breathe out
    src.connect(lp).connect(g).connect(pan);
    src.start(t, Math.random() * 0.5); src.stop(t + 1.1);
  }
  thud() {                          // player hurt — gut punch
    if (!this.started) return;
    const C = this.ctx, t = C.currentTime;

    // (a) body knock — the hit itself
    {
      const o = C.createOscillator(); o.frequency.value = 78;
      o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      const g = C.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g).connect(this.foleyBus);
      o.start(t); o.stop(t + 0.18);
    }

    // (b) sub drop — the floor falls out from under it
    {
      const o = C.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(96, t);
      o.frequency.exponentialRampToValueAtTime(26, t + 0.35);
      const g = C.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(this.foleyBus);
      o.start(t); o.stop(t + 0.37);
    }

    // (c) dark grit — lowpassed noise burst, the texture of the blow
    {
      const src = C.createBufferSource(); src.buffer = this._shotNoise;
      const f = C.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.value = 600;
      const g = C.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(f).connect(g).connect(this.foleyBus);
      src.start(t, Math.random() * 0.6, 0.14);
    }

    // (d) everything-duck — music AND reverb drop out for a beat,
    // matching twang()'s duck pattern
    const mg = this.musicBus.gain;
    mg.cancelScheduledValues(t);
    mg.setValueAtTime(mg.value, t);
    mg.linearRampToValueAtTime(this._musicLevel * 0.18, t + 0.02);
    mg.setTargetAtTime(this._musicLevel, t + 0.25, 0.3);
    const vg = this.verbGain.gain;
    vg.cancelScheduledValues(t);
    vg.setValueAtTime(vg.value, t);
    vg.linearRampToValueAtTime(0.15, t + 0.02);
    vg.setTargetAtTime(0.5, t + 0.25, 0.3);
  }
  setGround(kind) {                 // footstep material from the game
    this._ground = (kind === 'rock' || kind === 'sand') ? kind : 'grass';
  }
  _step(speed) {                   // footstep (shared noise, no alloc)
    // speed: 0..1 gait level. The hunter's noise is a real dB curve — a
    // half-stick stalk is a whisper, a full sprint is the loud floor. The
    // dartboard the animals read off scales with this too (see game.js).
    const C = this.ctx, t = C.currentTime;
    const sp = Math.max(0, Math.min(1, speed == null ? 1 : speed));
    // single persistent panner — steps alternate gently L/R
    if (!this._stepPan && C.createStereoPanner) {
      this._stepPan = C.createStereoPanner();
      this._stepPan.connect(this.foleyBus);
    }
    const out = this._stepPan || this.foleyBus;
    if (this._stepPan) {
      this._stepL = !this._stepL;
      this._stepPan.pan.setValueAtTime(this._stepL ? -0.12 : 0.12, t);
    }
    // dB-below-max: speed=1 → 0 dB (full), speed=0.4 stalk → ~ -16 dB.
    const lvl = Math.pow(10, (-(1 - sp) * 26) / 20);
    const sprintMix = Math.max(0, (sp - 0.6) / 0.4);   // 0 below jog, 1 at full sprint
    const burst = (v, dur, fHz, type = 'lowpass', q = 0.7) => {
      const src = C.createBufferSource(); src.buffer = this._shotNoise;
      const f = C.createBiquadFilter(); f.type = type;
      f.frequency.value = fHz; f.Q.value = q;
      const g = C.createGain();
      g.gain.setValueAtTime(v * lvl, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 0.6, dur + 0.02);
    };
    if (this._ground === 'rock') {        // sharper knock + tiny high click
      burst(0.3, 0.05, 850 + Math.random() * 120, 'bandpass', 1.5);
      burst(0.08, 0.02, 3400, 'bandpass', 2);
    } else if (this._ground === 'sand') { // soft shuffle — longer, quieter
      burst(0.22, 0.11, 460 + Math.random() * 90);
    } else {                              // grass: the soft body thud
      burst(0.34, 0.07, 250 + Math.random() * 130);
      // a run is richer: a hard heel down low + a scuff of grit up top,
      // mixed in only as the gait crosses into a sprint.
      if (sprintMix > 0.01) {
        burst(0.30 * sprintMix, 0.05, 120 + Math.random() * 40);          // hard heel
        burst(0.10 * sprintMix, 0.06, 1600 + Math.random() * 700, 'highpass', 0.8); // grit/scuff
      }
    }
  }
  _cricket() {
    const C = this.ctx, t = C.currentTime;
    const n = 3 + (Math.random() * 3 | 0);    // sparser — fewer voices left
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
  _corvid() {                       // one far crow — dry, wrong, alone
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(620 + Math.random() * 140, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.17);
    const rasp = C.createOscillator(); rasp.type = 'square';
    rasp.frequency.value = 64 + Math.random() * 28;   // AM rasp in the throat
    const rg = C.createGain(); rg.gain.value = 0.5;
    const am = C.createGain(); am.gain.value = 1;
    rasp.connect(rg).connect(am.gain);
    const bp = C.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1050 + Math.random() * 250; bp.Q.value = 1.5;
    const g = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.23);
    o.connect(am); am.connect(bp).connect(g);
    let tail = g;
    if (C.createStereoPanner) {
      const p = C.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
      g.connect(p); tail = p;
    }
    tail.connect(this.verb);          // distance is mostly reverb
    const dry = C.createGain(); dry.gain.value = 0.35;
    tail.connect(dry).connect(this.master);
    o.start(t); o.stop(t + 0.25); rasp.start(t); rasp.stop(t + 0.25);
  }

  howl(pan = 0, vol = 0.07) {         // far wolf — sine glide, vibrato, reverb
    if (!this.started) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.type = 'sine';
    const f0 = 215 + Math.random() * 65;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.9, t + 0.9);    // the rise
    o.frequency.setValueAtTime(f0 * 1.9, t + 2.1);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.12, t + 3.4); // sag away
    const vib = C.createOscillator(); vib.frequency.value = 4.8 + Math.random();
    const vg = C.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(9, t + 1.5);               // vibrato blooms late
    vib.connect(vg).connect(o.frequency);
    const lp = C.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 880; lp.Q.value = 0.7;
    const g = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.1);
    g.gain.setValueAtTime(vol, t + 2.3);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 3.6);
    o.connect(lp).connect(g);
    let tail = g;
    if (C.createStereoPanner) {
      const p = C.createStereoPanner(); p.pan.value = pan;
      g.connect(p); tail = p;
    }
    tail.connect(this.verb);          // mostly wet — it is far away
    const dry = C.createGain(); dry.gain.value = 0.28;
    tail.connect(dry).connect(this.master);
    o.start(t); o.stop(t + 3.7); vib.start(t); vib.stop(t + 3.7);
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
    if (this.master) this.master.gain.value = m ? 0 : 1.0;
  }

  // called every frame from the game loop
  update(dt, s) {
    if (!this.started || this.muted) return;
    const C = this.ctx;
    // iOS Safari suspends/interrupts the context when the page is
    // backgrounded and does NOT auto-resume — nudge it back to life
    if (C.state !== 'running') {
      if (!this._resuming) {
        this._resuming = true;
        const p = C.resume();
        if (p && p.then) p.then(() => { this._resuming = false; },
                                () => { this._resuming = false; });
        else this._resuming = false;
      }
      return;
    }
    const t = C.currentTime;
    const night = s.night || 0;

    // keep the listener glued to the player so spatial one-shots track
    if (s.px !== undefined) this.setListener(s.px, s.pz, s.yaw || 0);

    // breath — rate + weight ride exertion (running, holding a heavy draw).
    // Near-silent at rest; you hear yourself heave after a sprint, then
    // catch your breath as it falls back.
    const ex = Math.max(0, Math.min(1, s.breath || 0));
    this._breathT = (this._breathT ?? 2) - dt;
    if (this._breathT <= 0) {
      if (ex > 0.12) { this._breathCycle(ex); this._breathT = 3.6 - ex * 2.1; }
      else this._breathT = 1.0;                 // idle: re-check soon, stay quiet
    }

    // creak watchdog: if the game stops calling drawCreak (draw was
    // cancelled), fade the managed creak nodes out instead of droning.
    if (this._creakOn) {
      this._creakT -= dt;
      if (this._creakT <= 0) { this._creakOn = false; this._silenceCreak(t); }
    }

    // wind breathes; occasional gusts sweep through, bigger up high.
    // Pure math on the existing wind nodes — no new graph.
    const alt = s.altitude01 || 0;
    let gust = 0;
    if (this._gustDur > 0) {                    // mid-gust
      this._gustT += dt;
      if (this._gustT >= this._gustDur) {
        this._gustDur = 0;
        this._gustWait = 12 + Math.random() * 24;
      } else {
        const ph = this._gustT / this._gustDur;          // 0..1
        gust = Math.pow(Math.sin(Math.PI * ph), 1.5);    // sin^1.5 envelope
      }
    } else {
      this._gustWait -= dt;
      if (this._gustWait <= 0) {
        this._gustDur = 3 + Math.random() * 3;
        this._gustT = 0;
      }
    }
    gust *= 1 + 1.4 * alt;                      // altitude: up to +140%
    const breathe = 0.10 + 0.03 * alt
      + 0.05 * Math.sin(t * 0.23) + 0.02 * Math.sin(t * 0.71);
    this.windGain.gain.setTargetAtTime(breathe + gust * 0.12, t, 0.6);
    this._windLp.frequency.setTargetAtTime(
      380 + 180 * Math.sin(t * 0.17) + gust * 520, t, 0.8);

    // water by lake proximity (full inside 60m, silent past 220m)
    const lk = Math.max(0, Math.min(1, 1 - (s.lakeDist - 60) / 160));
    this.waterGain.gain.setTargetAtTime(lk * 0.14, t, 0.5);

    // danger by wolf proximity (starts at 34m, max at 6m)
    const dz = Math.max(0, Math.min(1, 1 - (s.wolfDist - 6) / 28));
    this.dangerGain.gain.setTargetAtTime(dz * dz * 0.3, t, 0.4);
    // melody backs off when danger is high
    const melodyDamp = 1 - dz * 0.85;

    // presence — sub-bass that rises VERY slowly once it's truly dark,
    // and drains away much faster at dawn
    const presence = night > 0.55 ? 0.10 + 0.025 * Math.sin(t * 0.045) : 0;
    this.subGain.gain.setTargetAtTime(presence, t, presence > 0 ? 24 : 4);

    // chord drift
    this._chordT -= dt;
    if (this._chordT <= 0) {
      this._chordT = 26 + Math.random() * 22;
      this._chordIx++;
      if (Math.random() < 0.22) this._rootIx = (this._rootIx + 1) % ROOTS.length;
      this._setChord(this._chordIx);
    }

    // jaw harp at the base — a steady, peaceful pluck on a slow beat,
    // a low fifth answering now and then. Only while home.
    if (this._baseMusic) {
      this._jawT = (this._jawT ?? 0) - dt;
      if (this._jawT <= 0) {
        this._jawT = 0.62 + Math.random() * 0.12;        // ~100bpm, loose
        this._jawStep = ((this._jawStep ?? 0) + 1) % 8;
        const hz = (this._jawStep % 4 === 2) ? 110.0 : 73.42;  // A2 lift vs D2 drone
        this._jawTwang(0, hz);
        if (this._jawStep % 4 === 0 && Math.random() < 0.5)     // grace twang
          this._jawTwang(0.31, 146.83);
      }
    }

    // the hymn returns every 60-110s — long enough to half-forget it
    this._motifT = (this._motifT ?? 20) - dt;
    if (this._motifT <= 0 && dz < 0.3) {
      this._motifT = 60 + Math.random() * 50;
      this._motif();
    }

    // sparse melody — random walk on the current chord's scale
    this._melT -= dt;
    if (this._melT <= 0) {
      this._melT = 3 + Math.random() * 6;
      if (Math.random() < 0.55 * melodyDamp) {
        this._melDeg = (this._melDeg ?? 2) + ((Math.random() * 5 | 0) - 2);
        this._melDeg = Math.max(-4, Math.min(8, this._melDeg));
        const root = ROOTS[this._rootIx];
        this._pluck(noteHz(root, this._melDeg, 0), 0.26 + Math.random() * 0.26);
        if (Math.random() < 0.22)  // grace echo a third up
          this._pluck(noteHz(root, this._melDeg + 2, 0), 0.15, 0.26);
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

    // fear — your own heart when it gets bad
    if (s.hp !== undefined && s.hp < 35 && s.hp > 0) {
      this._heartT = (this._heartT ?? 0) - dt;
      if (this._heartT <= 0) {
        const urgency = 1 - s.hp / 35;
        this._heartT = 1.05 - urgency * 0.45;
        const thump = (when, v) => {
          const o = C.createOscillator(); o.frequency.value = 52;
          o.frequency.exponentialRampToValueAtTime(34, t + when + 0.1);
          const g = C.createGain();
          g.gain.setValueAtTime(0, t + when);
          g.gain.linearRampToValueAtTime(v, t + when + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, t + when + 0.16);
          o.connect(g).connect(this.master);
          o.start(t + when); o.stop(t + when + 0.2);
        };
        thump(0, 0.30 + urgency * 0.24); thump(0.17, 0.17 + urgency * 0.14);
        // per-beat music duck — paired setTargetAtTime only, no
        // cancelScheduledValues, so it can't stomp a twang duck
        const mg = this.musicBus.gain;
        mg.setTargetAtTime(this._musicLevel * 0.7, t, 0.05);
        mg.setTargetAtTime(this._musicLevel, t + 0.4, 0.25);
      }
    }

    // footsteps — cadence and loudness both ride the gait level (_moveLvl,
    // 0..1). A stalk is slow + quiet; a sprint is fast + loud. Falls back to
    // the old sprint flag if the game didn't pass a level.
    if (s.moving) {
      const speed = s._moveLvl != null ? Math.max(0, Math.min(1, s._moveLvl))
                  : (s.sprint ? 1 : 0.55);
      this._stepT -= dt;
      if (this._stepT <= 0) {
        this._stepT = 0.52 - speed * 0.24;   // ~0.52s stalk → ~0.28s sprint
        this._step(speed);
      }
    } else this._stepT = 0.12;
  }
}
