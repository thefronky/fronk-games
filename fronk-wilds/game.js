// FRONK WILDS — open-world scout-survey (hunting) game
// Three.js r160, Quaternius CC0 animated animals, all procedural world.
window._V = 16;
window._spawnCryptid = () => spawnCryptid();   // debug
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AudioEngine } from './audio.js';

const audio = new AudioEngine();
window._audio = audio;

// ───────────────────────── config ─────────────────────────
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const WORLD = 860;            // square world size
const WATER_Y = 2.1;          // lake level
const EYE = 1.7;
const CFG = IS_TOUCH
  ? { grass: 22000, trees: 2200, bushes: 380, rocks: 150, px: 2, shadow: 1536, segs: 230,
      flowers: 2200, tufts: 1400, mushrooms: 260, bedFlowers: 1300 }
  : { grass: 50000, trees: 4500, bushes: 620, rocks: 260, px: 2.5, shadow: 3072, segs: 360,
      flowers: 4000, tufts: 2600, mushrooms: 420, bedFlowers: 1900 };

// ── THE MENAGERIE ─────────────────────────────────────────────────
// Field meanings:
//   n         = how many spawn
//   speed     = wander/walk m/s ; gallop = flee/charge m/s
//   hp        = nominal hit-points (per-individual jitter on top, see spawn)
//   flee      = base flee distance feeding the dB hearing model (0 = never flees)
//   r         = body radius (hit + collision + cover)
//   keen      = hearing acuity multiplier (fox keenest, cow dullest)
//   aggroBias = added to the per-body aggression roll (0..1 after clamp)
//   rear      = chance a cornered, high-aggression PREY rears + strikes
//   gait      = 'sway' | 'smooth' | 'bound' | undefined (default trot)
//   hpJit     = wide per-individual hp band (horse 8-10, bear 6-8)
//   tanky     = soaks damage but keeps the prey flee-brain (horse)
//   bearish   = Bull-rig stand-in with its own brain (bear)
//   scale/tint = render overrides (bear: 1.8 scale, dark-brown 0x3a2616)
const MENAGERIE = {
  // ── prey ──
  Deer:  { n: 16, speed: 3.0, gallop: 12.8, hp: 2, flee: 26, r: 1.1,
           keen: 1.45, aggroBias: 0.10, rear: 0.45, scale: 1.0, hpJit: true },
           // the staple: EVERYWHERE, twitchy, fast, a small hard target
  Stag:  { n: 4, speed: 2.7, gallop: 10.6, hp: 3, flee: 22, r: 1.5,
           keen: 1.15, aggroBias: 0.30, rear: 0.70, scale: 1.18, hpJit: true },
  Fox:   { n: 8, speed: 3.8, gallop: 12.2, hp: 1, flee: 18, r: 0.5,
           keen: 1.7, aggroBias: 0.05, rear: 0.2, scale: 0.45, darty: true },  // little critters — many, tiny, skittish, JUKE when fleeing — hard to hit
  Cow:   { n: 1, speed: 1.9, gallop: 7.4,  hp: 3, flee: 13, r: 1.6,
           keen: 0.5, aggroBias: 0.05, rear: 0.2, gait: 'sway', scale: 1.22, hpJit: true }, // RARE now — rarer than bears
  Horse: { n: 2, speed: 3.2, gallop: 13.8, hp: 9, flee: 20, r: 1.6,
           keen: 1.2, aggroBias: 0.25, rear: 0.65, gait: 'smooth',
           hpJit: true, tanky: true, scale: 1.3 },        // 8-10 hits, impressive bolt
  // ── predator / territorial ──
  Wolf:  { n: 3, speed: 3.2, gallop: 8.8,  hp: 2, flee: 0,  r: 1.0,
           keen: 1.6,  aggroBias: 0.45, scale: 0.8,
           hunts: true, aggroR: 38, dmg: 22, packR: 80 },
           // circles before committing; after dark the whole pack answers
  Bull:  { n: 2, speed: 2.2, gallop: 9.6,  hp: 4, flee: 0,  r: 1.6,
           keen: 0.8,  aggroBias: 0.6, scale: 1.15, hpJit: true,
           territorial: 16, dmg: 30 },
           // wanders calm — gives ONE warning stomp, then it's a freight train
  Bear:  { n: 3, speed: 2.6, gallop: 9.4,  hp: 9, flee: 0,  r: 2.0,
           keen: 1.0,  aggroBias: 0.7,
           hpJit: true, gait: 'bound', bearish: true,
           aggroR: 24, dmg: 42, scale: 2.1, tint: 0x2c1d12, nightStalk: true },  // RARE, 8-10 hits
};
// SPECIES aliases MENAGERIE so every a.cfg.* reference keeps working.
const SPECIES = MENAGERIE;

// the rare one. Night only, hunts YOU, glows in the dark.
// stareNear/stareFar: the band where it sometimes stops dead and just looks.
const CRYPTID_CFG = { speed: 3.6, gallop: 11.8, hp: 5, flee: 0, r: 1.7,
                      hunts: true, aggroR: 64, dmg: 40,
                      stareNear: 25, stareFar: 40 };
const CRYPTID_CHANCE = 0.45;     // per night

const LINES = {

  Deer: ['Deer. The insides are yours now. That was the arrangement.',
         'It fed on grass. You feed on it. The ledger balances.'],
  Stag: ['A stag. That much life has to go somewhere. It goes in you.',
         'The stag is down. You will live for days on this.'],
  Fox:  ['A fox. Not much inside. It is yours anyway.',
         'The fox ate things alive. You understand each other now.'],
  Wolf: ['The wolf came to eat you. The order is reversed.',
         'Wolf down. It wanted your insides. It had insides too.'],
  Bull: ['The bull is down. There is so much of it.',
         'It did not want to be eaten. Few do.'],
  '???': ['The Hollow Stag is down. It has no insides. Do not eat it.'],
  wound: ['Wounded. It bleeds. The woods count every drop.',
          'You hurt it and it lived. That goes on the ledger.'],
  longshot: ['From a distance it looks like mercy. It looks like that up close, too.',
             'It never heard the string. The distance kept your secret. The arrow told it.',
             'That far away, and still yours. Distance is not a defense here. Nothing is.'],
  bite:  ['Teeth. Some of you is missing now.',
          'Bitten. Something wanted your insides first.'],
  death: 'CONSUMED. Fair, all things considered. The woods start you over…',
};

// ───────────────────────── renderer / scene ─────────────────────────
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH });
renderer.setPixelRatio(Math.min(devicePixelRatio, CFG.px));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd89a55);

// post-processing — bloom makes sun/fire/fireflies/the Door GLOW.
// DISABLED on touch devices: mobile Safari renders the composer
// chain black (Fronk's phone, 2026-06-12). ?bloom=1 forces it on.
const USE_POST = !IS_TOUCH
  || new URLSearchParams(location.search).get('bloom') === '1';
scene.fog = new THREE.Fog(0xd89a55, 60, 340);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);
// composer + bloom allocate several full-screen render targets at
// construction — skip entirely on mobile (USE_POST=false) to save
// GPU memory on iOS Safari
let composer = null, bloomPass = null;
if (USE_POST) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    0.38,   // strength — restrained; the light should feel withheld
    0.65,   // radius
    0.85);  // threshold — only genuinely bright things bloom
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

// golden hour — Fronk's signature light. A full day/night cycle runs
// on top of it: golden hour is "home base", night brings stars and
// fireflies, then dawn returns. One cycle every DAY_LEN seconds.
const DAY_LEN = 480;
const SUN_WARM = new THREE.Color(0xffc46a), SUN_NIGHT = new THREE.Color(0x8a7fb0);
const FOG_DAY = new THREE.Color(0xd89a55), FOG_NIGHT = new THREE.Color(0x2a1a1a);
const SUN_DAWN = new THREE.Color(0xe8dcc8), FOG_DAWN = new THREE.Color(0xc9bfae);
const sun = new THREE.DirectionalLight(0xffc46a, 2.6);
sun.position.set(-180, 95, -60);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(CFG.shadow);
sun.shadow.camera.left = sun.shadow.camera.bottom = -90;
sun.shadow.camera.right = sun.shadow.camera.top = 90;
sun.shadow.camera.far = 600;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
// hemisphere kept slightly low even by day — canopy shade pockets stay dark
const hemi = new THREE.HemisphereLight(0xe6b277, 0x2c3220, 0.72);
scene.add(hemi);

// sky dome — sunset gradient + sun glow
const skyUniforms = {
  sunDir: { value: new THREE.Vector3(-0.86, 0.42, -0.28).normalize() },
  night: { value: 0 },
  uT: { value: 0 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      uniform float night; uniform float uT;
      void main(){
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, -0.05, 1.0);
        vec3 horizon = mix(vec3(0.95, 0.48, 0.23), vec3(0.24, 0.12, 0.085), night);
        vec3 zenith  = mix(vec3(0.11, 0.20, 0.40), vec3(0.045, 0.055, 0.115), night);
        vec3 col = mix(horizon, zenith, pow(h, 0.62));
        float s = max(dot(dir, sunDir), 0.0);
        float dayGlow = 1.0 - night;
        col += vec3(1.0, 0.58, 0.26) * pow(s, 220.0) * 1.7 * dayGlow;
        col += vec3(1.0, 0.42, 0.20) * pow(s, 6.0) * 0.36 * dayGlow;
        // procedural stars, twinkling, night only
        if (night > 0.02 && dir.y > -0.02) {
          vec3 cell = floor(dir * 160.0);
          float hsh = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          if (hsh > 0.9962) {
            float tw = 0.55 + 0.45 * sin(uT * (1.5 + fract(hsh * 91.0) * 3.0) + hsh * 40.0);
            col += vec3(0.9, 0.93, 1.0) * tw * night * pow(fract(hsh * 137.0), 0.6);
          }
          // soft milky band for depth
          float band = pow(max(0.0, 1.0 - abs(dot(dir, normalize(vec3(0.5, 0.22, -0.8)))) * 1.6), 3.0);
          col += vec3(0.11, 0.12, 0.18) * band * night;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
scene.add(sky);

// moon — a small pale disc, the only honest light left at night.
// One sprite, one 64px canvas texture: effectively free.
const moon = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const g = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(228,234,246,1)');
  g.addColorStop(0.55, 'rgba(206,216,236,0.9)');
  g.addColorStop(0.72, 'rgba(172,186,216,0.30)');
  g.addColorStop(1, 'rgba(160,175,210,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, 64, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0,
    fog: false, depthWrite: false,
  }));
  sp.scale.set(46, 46, 1);
  scene.add(sp);
  return sp;
})();
const _moonDir = new THREE.Vector3();

// ───────────────────────── terrain ─────────────────────────
// value-noise FBM — heightAt() must match the displaced mesh exactly
const _h = (ix, iz) => {
  let n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return (_h(ix, iz) * (1 - ux) + _h(ix + 1, iz) * ux) * (1 - uz)
       + (_h(ix, iz + 1) * (1 - ux) + _h(ix + 1, iz + 1) * ux) * uz;
}
function ridged(x, z, f) {
  return 1 - Math.abs(vnoise(x * f, z * f) * 2 - 1);
}

// ───────────────────── climbable rocky outcrops ──────────────────
// Hand-placed boulder-stacks you can WALK UP for a sniping vantage.
// Each is a smoothstep dome added into heightAt: gentle toe at the
// base, naturally flat-ish summit (a perch). Kept to a tiny fixed
// list with one Math.hypot each — NO noise loops — because heightAt
// runs per grass blade. Max gradient ≈ 1.5*h/r rise-over-run
// (~0.6 here ≈ 32°): brisk to climb, never a cliff. matching rock
// geometry is dropped at each anchor later (see OUTCROP geometry).
// Each outcrop optionally elongates: ax = long-axis stretch (1 = round),
// ang = the ridge's heading. outcropAt rotates the sample into the ridge
// frame and divides the long axis by ax, so anisotropic hogbacks/walls
// read as ridges instead of cones.
const OUTCROPS = [
  { x: -46, z:  -8, r: 27, h: 11.5 },  // SW of spawn — vantage over the meadow
  { x: -10, z: -55, r: 30, h: 12.5 },  // lake NE shore — vantage over the water
  { x: 160, z:-140, r: 25, h: 11.0 },  // SE autumn ridge — overlooks the rust woods
  { x:-180, z:  80, r: 26, h: 14.0 },  // NW pine — a perch in the deep conifers (raised)
  { x:  64, z: 120, r: 22, h:  9.0 },  // S meadow edge — a lower stepping perch
  { x:  18, z: -18, r: 19, h:  8.5, ax: 2.2, ang: 1.2 },   // low hogback near spawn
  { x: 120, z:  40, r: 28, h: 15.5, ax: 1.4, ang: 2.6 },   // tallest E shoulder
  { x:-120, z:-120, r: 24, h: 12.0, ax: 1.7, ang: 0.3 },   // angled SW rock wall
  { x:-250, z: -40, r: 30, h: 13.0 },                       // far-W massif (round)
];
// added height from outcrops at (x,z). Cheap: a handful of hypots,
// smoothstep falloff, no loops over noise octaves. cos/sin of each ridge
// heading are cached on first call (_ca/_sa), 0-safe via ===undefined.
function outcropAt(x, z) {
  let add = 0;
  for (let i = 0; i < OUTCROPS.length; i++) {
    const o = OUTCROPS[i];
    let dx = x - o.x, dz = z - o.z;
    const ax = o.ax || 1;
    if (ax !== 1) {                    // rotate into the ridge frame, squeeze long axis
      if (o._ca === undefined) { o._ca = Math.cos(o.ang || 0); o._sa = Math.sin(o.ang || 0); }
      const lx = dx * o._ca + dz * o._sa;     // along the ridge
      const lz = -dx * o._sa + dz * o._ca;    // across it
      dx = lx / ax; dz = lz;
    }
    const d2 = dx * dx + dz * dz, r2 = o.r * o.r;
    if (d2 >= r2) continue;
    let q = 1 - Math.sqrt(d2) / o.r;   // 1 at center → 0 at rim
    q = q * q * (3 - 2 * q);           // smoothstep: gentle toe + flat perch
    add += o.h * q;
  }
  return add;
}
window._outcrops = OUTCROPS;

// Terrain v2 — the reference-demo recipe: COMPOSED features, not
// uniform noise. An alpine massif, a valley carved toward the lake,
// a mountain rim ringing the world, rolling hills as filler — all
// domain-warped so nothing reads as flat planes.
function heightAt(x, z) {
  // domain warp — bends every feature organically
  const wx = x + (vnoise(x * 0.004 + 91, z * 0.004 + 17) - 0.5) * 64;
  const wz = z + (vnoise(x * 0.004 - 44, z * 0.004 + 71) - 0.5) * 64;

  // rolling hills baseline
  let a = 0, f = 0.0042, amp = 21;
  for (let o = 0; o < 4; o++) { a += (vnoise(wx * f + 37, wz * f + 91) - 0.5) * 2 * amp; f *= 2.1; amp *= 0.44; }

  // NE alpine massif — serrated ridges, the vista anchor
  const dm = Math.hypot(wx - 235, wz - 235) / 250;
  if (dm < 1.3) {
    const m = Math.pow(Math.max(0, 1 - dm), 1.5);
    const r = ridged(wx + 13, wz - 7, 0.011) * 0.62 + ridged(wx, wz, 0.026) * 0.38;
    a += m * r * 125;
  }

  // mountain rim — the whole world sits in a bowl of peaks
  const rr = Math.hypot(x, z);
  if (rr > 330) {
    const rim = Math.min((rr - 330) / 100, 1.25);
    a += Math.pow(rim, 1.7) * (35 + ridged(wx - 31, wz + 57, 0.015) * 85);
  }

  // glacial valley: massif → lake, carved along the segment
  {
    const ax = 200, az = 200, bx = 70, bz = -90;
    const abx = bx - ax, abz = bz - az;
    const tt = Math.max(0, Math.min(1,
      ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
    const dv = Math.hypot(x - (ax + abx * tt), z - (az + abz * tt));
    a -= Math.max(0, 1 - dv / 90) * 26 * (0.4 + tt * 0.6);
  }

  // central lake basin
  const d = Math.hypot(x - 70, z + 90) / 130;
  a -= Math.max(0, 1 - d * d) * 17;

  // climbable rocky outcrops — added LAST so a perch always sits
  // proud of whatever terrain it rests on (raw x,z, not warped, so
  // the dropped rock geometry lines up exactly).
  a += outcropAt(x, z);
  return a;
}

// ───────────────────────── biome regions ─────────────────────────
// Distinct AREAS so exploration has variety. Cheap zoning by world
// position + distance-from-anchors (terrain is already composed, so we
// just label what's there). Returns a region id; the terrain colorer
// lerps toward each region's palette and the spawners bias species &
// density. Readable from a distance is the whole point — the owner
// wants to SEE different places.
const REGION = {
  MEADOW:   0,   // spawn — bright lush green, flowers, sparse trees
  PINE:     1,   // NW quadrant — dark blue-green floor, dense pines
  AUTUMN:   2,   // SE quadrant — rust ground + warm broadleaf canopy
  ALPINE:   3,   // NE massif — pale rocky grass, sparse hardy pines
  WETLAND:  4,   // SW lakeshore — damp dark ground, reeds + bushes
};
// per-region ground palettes (lerped INTO the base terrain color so
// altitude/water/snow logic still wins where it matters)
const REGION_GROUND = {
  0: new THREE.Color(0x6fa238),  // meadow — vivid lush green
  1: new THREE.Color(0x2f5238),  // pine — deep blue-green
  2: new THREE.Color(0x8a5a2c),  // autumn — warm rust
  3: new THREE.Color(0x9aa07e),  // alpine — pale dry grass
  4: new THREE.Color(0x46603a),  // wetland — dark damp olive
};
// how hard the region tint pulls the base color (0..1)
const REGION_TINT = { 0: 0.55, 1: 0.6, 2: 0.6, 3: 0.45, 4: 0.55 };

function regionAt(x, z) {
  // anchors match heightAt's composed features
  const dMeadow = Math.hypot(x - 0, z - 26);     // spawn clearing
  const dAlpine = Math.hypot(x - 235, z - 235);  // NE massif
  const dLake   = Math.hypot(x - 70, z + 90);    // SW lake basin
  // strong overrides first
  if (dMeadow < 95) return REGION.MEADOW;
  if (dAlpine < 230) return REGION.ALPINE;
  if (dLake < 150) return REGION.WETLAND;
  // quadrant fill for the rest of the world
  if (x < 0 && z > 0) return REGION.PINE;        // NW
  if (x > 0 && z < 0) return REGION.AUTUMN;      // SE
  // NW-ish leftovers (x<0,z<0) lean wetland-adjacent → pine; SE-ish → autumn
  return z > 0 ? REGION.PINE : REGION.AUTUMN;
}
window._region = regionAt;
window._REGION = REGION;

{
  const segs = CFG.segs;
  const g = new THREE.PlaneGeometry(WORLD, WORLD, segs, segs);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grassC = new THREE.Color(0x5c7434), dryC = new THREE.Color(0x988a48),
        dirtC = new THREE.Color(0x624628), rockC = new THREE.Color(0x646467),
        sandC = new THREE.Color(0xb5a47f);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z);
    pos.setY(i, y);
    const t = vnoise(x * 0.02, z * 0.02);
    let c = grassC.clone().lerp(dryC, t * 0.9);
    // bias the grassy base toward this vertex's region BEFORE the
    // altitude special-cases — so meadows read lush, pine reads deep,
    // autumn reads rust, etc. Water/snow/high-rock still override below.
    const reg = regionAt(x, z);
    c.lerp(REGION_GROUND[reg], REGION_TINT[reg]);
    const snowLine = 50 + (t - 0.5) * 12;
    if (y < WATER_Y + 0.45) c = sandC.clone();
    else if (y < WATER_Y + 1.0) c = sandC.clone()
      .lerp(c, (y - WATER_Y - 0.45) / 0.55);
    else if (y > snowLine) c = new THREE.Color(0xe7edf4)
      .lerp(rockC, Math.max(0, 1 - (y - snowLine) / 10) * 0.5);
    else if (y > 26) c = rockC.clone()
      .lerp(dirtC, vnoise(x * 0.05, z * 0.05) * 0.3)
      // alpine rock gets a touch of pale-grass so the massif still
      // reads as its own zone, not generic gray
      .lerp(REGION_GROUND[REGION.ALPINE], reg === REGION.ALPINE ? 0.22 : 0);
    else if (y > 19) c = c.lerp(rockC, (y - 19) / 7);
    else if (t > 0.86) c = c.lerp(dirtC, 0.3);
    // climbable outcrops — tint the dome rocky so the perch READS as
    // stone you scramble up (skip underwater so shores stay sandy).
    if (y > WATER_Y + 1.0) {
      const ob = outcropAt(x, z);
      if (ob > 0.5) c.lerp(rockC, Math.min(0.7, ob / 7));
    }
    // micro variation — kills the flat "planes" look up close
    c.offsetHSL(0, 0, (vnoise(x * 0.31 + 7, z * 0.31 + 3) - 0.5) * 0.07);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);
}

// water — animated lake
const waterUniforms = { uTime: { value: 0 } };
{
  const m = new THREE.MeshStandardMaterial({
    color: 0x2e5a62, transparent: true, opacity: 0.8,
    roughness: 0.28, metalness: 0.12,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.z += sin(position.x*0.22 + uTime*1.7)*0.14
                      + cos(position.y*0.31 + uTime*1.3)*0.11;`);
  };
  // lake-local plane (a world-sized sheet pokes out past the terrain
  // rim and reads as a black band on the horizon)
  const w = new THREE.Mesh(new THREE.PlaneGeometry(620, 620, 56, 56), m);
  w.rotation.x = -Math.PI / 2;
  w.position.set(70, WATER_Y, -90);
  scene.add(w);
  // shallows tint — a paler sheet just under the surface reads as
  // shore depth-gradient without a real depth shader
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(440, 440),
    new THREE.MeshStandardMaterial({ color: 0x5e8a80, transparent: true,
      opacity: 0.30, roughness: 0.6, metalness: 0 }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.set(70, WATER_Y - 0.4, -90);
  scene.add(sh);
  // sun glitter — additive sparkle points on the surface (bloom feeds
  // on these at sunset)
  const GN = 240, gp = new Float32Array(GN * 3);
  for (let i = 0; i < GN; i++) {
    gp[i * 3] = 70 + (Math.random() - 0.5) * 300;
    gp[i * 3 + 1] = WATER_Y + 0.06;
    gp[i * 3 + 2] = -90 + (Math.random() - 0.5) * 300;
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  const glitter = new THREE.Points(gg, new THREE.PointsMaterial({
    color: 0xffd9a4, size: 0.14, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  glitter.frustumCulled = false;
  scene.add(glitter);
  window._glitter = glitter;
}

// ───────────────────────── wind-blown grass ─────────────────────────
const windUniforms = { uTime: { value: 0 } };
// ── cloth in wind ── a traveling ripple along the surface normal so tents
// and hung hides BILLOW like real fabric (this is the ONLY thing that should
// move in the wind besides grass/reeds — bare wood stays rigid). Reuses
// windUniforms.uTime; one gust LFO so all cloth surges together.
function clothWind(amp = 0.06) {
  return (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float gust = 0.5 + 0.5*sin(uTime*0.5 + position.x*0.2);
       float ripple = sin(position.x*2.4 + position.y*1.7 + uTime*3.0)
                    + 0.5*sin(position.y*1.3 - uTime*2.1);
       transformed += normal * ripple * ${amp.toFixed(3)} * gust;`);
  };
}
// interactive flower trample — xy = live player XZ (instant bend), zw = a
// lagging "wake" that trails the player and eases back ~5s after you pass,
// so a flattened corridor pops back upright behind you. Updated in tickBody.
const trampleUniform = { value: new THREE.Vector4(0, 0, 0, 26) };
{
  // curved, tapered blade — three of them in a tuft, color gradient
  // dark base → bright tip, tips bend hardest in the wind
  const mkBlade = (rotY) => {
    const g = new THREE.PlaneGeometry(0.17, 1.1, 1, 4);
    g.translate(0, 0.55, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vy = Math.max(0, p.getY(i) / 1.1);   // clamp: -1e-8 float residue made pow() NaN
      p.setX(i, p.getX(i) * (1 - Math.pow(vy, 1.3) * 0.85));   // taper
      p.setZ(i, p.getZ(i) + vy * vy * 0.4);                     // curve
    }
    g.computeVertexNormals();
    g.rotateY(rotY);
    return g;
  };
  const geo = mergeGeoms([mkBlade(0), mkBlade(2.1), mkBlade(4.2)]);
  {
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    const base = new THREE.Color(0x37551e), tip = new THREE.Color(0xa9c95f);
    for (let i = 0; i < p.count; i++) {
      const vy = Math.max(0, Math.min(1, p.getY(i) / 1.1));
      const c = base.clone().lerp(tip, vy * vy);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide,
    emissive: 0x2a4214, emissiveIntensity: 0.5 });  // lifts shadow-side
                                                    // blades off pure black
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float bendY = position.y * position.y * 0.62;
       float ph = instanceMatrix[3][0]*0.21 + instanceMatrix[3][2]*0.17;
       transformed.x += (sin(uTime*1.9 + ph) + 0.4*sin(uTime*3.7 + ph*1.7)) * bendY * 0.55;
       transformed.z += cos(uTime*1.4 + ph) * bendY * 0.38;`);
  };
  // REAL grass = density where you're standing. The field is a dense
  // ±R box that follows the player: blades that fall behind wrap
  // toroidally to the front and re-sample the terrain. ~5 blades/m²
  // instead of a bald 0.05 spread over the whole map.
  const inst = new THREE.InstancedMesh(geo, mat, CFG.grass);
  inst.frustumCulled = false;
  const R = 42;
  const gPos = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(),
        S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  const setBlade = (i) => {
    const g = gPos[i];
    const y = heightAt(g.x, g.z);
    // fade out toward the field edge so the follow-ring never shows a line
    // (window._player — the player const doesn't exist yet at grass init)
    const pc = window._player || { x: 0, z: 26 };
    const dEdge = Math.max(Math.abs(g.x - pc.x), Math.abs(g.z - pc.z));
    const fade = Math.max(0, Math.min(1, (R - dEdge) / 9));
    if (y < WATER_Y + 0.5 || y > 18 || fade <= 0) { S.set(0, 0, 0); }
    else S.set(g.s * fade, g.s * g.sy * fade, g.s * fade);
    P.set(g.x, y - 0.05, g.z);
    E.set(g.tx, g.rot, g.tz); Q.setFromEuler(E);
    inst.setMatrixAt(i, M.compose(P, Q, S));
  };
  for (let i = 0; i < CFG.grass; i++) {
    gPos.push({
      x: (Math.random() - 0.5) * 2 * R, z: 26 + (Math.random() - 0.5) * 2 * R,
      rot: Math.random() * Math.PI, tx: (Math.random() - 0.5) * 0.3,
      tz: (Math.random() - 0.5) * 0.3,
      s: 0.5 + Math.random() * 0.5, sy: 0.7 + Math.random() * 0.4,
    });
    setBlade(i);
    inst.setColorAt(i, new THREE.Color().setHSL(
      0.24 + Math.random() * 0.05, 0.42 + Math.random() * 0.2, 0.32 + Math.random() * 0.12));
  }
  inst.count = CFG.grass;
  inst.instanceColor.needsUpdate = true;
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(inst);
  let gCursor = 0;
  window._updateGrassField = () => {        // amortized: 1/6 per frame
    const slice = Math.ceil(CFG.grass / 6);
    let touched = false;
    for (let k = 0; k < slice; k++) {
      const i = (gCursor + k) % CFG.grass;
      const g = gPos[i];
      let moved = false;
      while (g.x - player.x > R)  { g.x -= 2 * R; moved = true; }
      while (player.x - g.x > R)  { g.x += 2 * R; moved = true; }
      while (g.z - player.z > R)  { g.z -= 2 * R; moved = true; }
      while (player.z - g.z > R)  { g.z += 2 * R; moved = true; }
      if (moved) { setBlade(i); touched = true; }
    }
    gCursor = (gCursor + slice) % CFG.grass;
    if (touched) inst.instanceMatrix.needsUpdate = true;
  };
}

// ───────────────────── flowers + ground detail ──────────────────────
// Three instanced layers, all pre-built once, zero per-frame allocation:
//   • wildflowers  — player-following toroidal field (reuses grass pattern)
//   • ground tufts — fern/clover follow-field, low + dark green
//   • mushrooms    — static, scattered near tree bases (placed once)
// Plus a dense STATIC bed of bright flowers at the wake/spawn clearing.
// Wind sway shares windUniforms.uTime (one uniform, no extra cost).
const FLOWER_PALETTE = [
  0xff4d5a, 0xff7a3c, 0xffd23f, 0xfff4e0,   // reds / orange / gold / cream
  0xff5fa2, 0xb05cff, 0x6f7bff, 0xff9bd0,   // pink / violet / periwinkle / blush
];
{
  const mkFlower = () => {
    const stem = new THREE.CylinderGeometry(0.018, 0.03, 0.62, 4, 1);
    stem.translate(0, 0.31, 0);
    const head = new THREE.IcosahedronGeometry(0.13, 0);
    head.translate(0, 0.66, 0);
    const petals = [];
    for (let p = 0; p < 3; p++) {
      const pl = new THREE.PlaneGeometry(0.22, 0.1, 1, 1);
      pl.translate(0, 0.06, 0); pl.rotateX(-0.9); pl.rotateY(p * 2.094); pl.translate(0, 0.6, 0);
      petals.push(pl);
    }
    return mergeGeoms([stem, head, ...petals]);
  };
  const tintFlower = (geo) => {
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    const stemC = new THREE.Color(0x35591f);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); const c = y < 0.55 ? stemC : { r: 1, g: 1, b: 1 };
      col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  };
  const mkTuft = () => {
    const blades = [];
    for (let b = 0; b < 3; b++) {
      const g = new THREE.PlaneGeometry(0.4, 0.34, 1, 1); g.translate(0, 0.16, 0);
      const pp = g.attributes.position;
      for (let i = 0; i < pp.count; i++) pp.setX(i, pp.getX(i) * (0.4 + pp.getY(i)));
      g.rotateY(b * 1.05); blades.push(g);
    }
    return mergeGeoms(blades);
  };
  const mkMushroom = () => {
    const stem = new THREE.CylinderGeometry(0.03, 0.05, 0.22, 5, 1); stem.translate(0, 0.11, 0);
    const cap = new THREE.SphereGeometry(0.11, 6, 4, 0, Math.PI*2, 0, Math.PI*0.5);
    cap.scale(1, 0.7, 1); cap.translate(0, 0.22, 0);
    return mergeGeoms([stem, cap]);
  };
  // wind sway, and (for the flower field) interactive trample. When
  // trample=true the shader reads the instance's world XZ off
  // instanceMatrix[3] (modelMatrix is identity for these field meshes),
  // measures distance to BOTH the live player (uTrample.xy) and the lagging
  // wake (uTrample.zw), and folds the flower flat away from whichever is
  // stronger. Pure vertex math — no per-instance JS, scales to thousands.
  const windHead = (intensity, trample = false) => (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    let header = 'uniform float uTime;\n';
    let bend = `#include <begin_vertex>
       float bendY = position.y * position.y * ${intensity.toFixed(2)};
       float ph = instanceMatrix[3][0]*0.23 + instanceMatrix[3][2]*0.19;
       transformed.x += (sin(uTime*1.7+ph)+0.35*sin(uTime*3.3+ph*1.6))*bendY;
       transformed.z += cos(uTime*1.3+ph)*bendY*0.6;`;
    if (trample) {
      sh.uniforms.uTrample = trampleUniform;
      header += 'uniform vec4 uTrample;\n';
      bend += `
       vec2 iw = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
       float dP = distance(iw, uTrample.xy);
       float dW = distance(iw, uTrample.zw);
       float amtP = 1.0 - smoothstep(0.0, 1.5, dP);
       float amtW = 1.0 - smoothstep(0.0, 1.5, dW);
       float amt; vec2 src;
       if (amtP >= amtW) { amt = amtP; src = uTrample.xy; }
       else              { amt = amtW; src = uTrample.zw; }
       if (amt > 0.001) {
         vec2 dir = normalize(iw - src + vec2(0.0001, 0.0));
         float lay = clamp(position.y / 0.66, 0.0, 1.0) * amt;
         transformed.x += dir.x * lay * 0.6;
         transformed.z += dir.y * lay * 0.6;
         transformed.y -= lay * position.y * 0.85;
       }`;
    }
    sh.vertexShader = header + sh.vertexShader.replace('#include <begin_vertex>', bend);
  };
  const M=new THREE.Matrix4(), Q=new THREE.Quaternion(), S=new THREE.Vector3(), P=new THREE.Vector3(), E=new THREE.Euler();
  const SPAWN = { x: 0, z: 26 };

  // shared vertex-colored, wind-swayed materials (one uniform each, prebuilt)
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    emissive: 0x101006, emissiveIntensity: 0.3, side: THREE.DoubleSide });
  flowerMat.onBeforeCompile = windHead(0.20, true);   // flowers trample underfoot
  const tuftMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    emissive: 0x0a1206, emissiveIntensity: 0.25, side: THREE.DoubleSide });
  tuftMat.onBeforeCompile = windHead(0.16);
  const mushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    emissive: 0x140a06, emissiveIntensity: 0.2 });

  // --- per-instance color helper: vary the white head toward palette ---
  const flowerGeoBase = mkFlower(); tintFlower(flowerGeoBase);
  const tuftGeo = mkTuft();
  // tint tufts dark green per-vertex (all of it foliage)
  {
    const p = tuftGeo.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { col[i*3]=0.16; col[i*3+1]=0.28; col[i*3+2]=0.10; }
    tuftGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const mushGeo = mkMushroom();
  {
    const p = mushGeo.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      // stem cream, cap dusty red-brown
      if (y < 0.2) { col[i*3]=0.86; col[i*3+1]=0.82; col[i*3+2]=0.70; }
      else { col[i*3]=0.55; col[i*3+1]=0.18; col[i*3+2]=0.14; }
    }
    mushGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }

  // ── 1. WILDFLOWER follow-field (mirrors the grass ±R box) ──
  const FR = 46;
  const flowersM = new THREE.InstancedMesh(flowerGeoBase, flowerMat, CFG.flowers);
  flowersM.frustumCulled = false; flowersM.castShadow = false;
  const fPos = [];
  const setFlower = (i) => {
    const g = fPos[i];
    const y = heightAt(g.x, g.z);
    const pc = window._player || SPAWN;
    const dEdge = Math.max(Math.abs(g.x - pc.x), Math.abs(g.z - pc.z));
    const fade = Math.max(0, Math.min(1, (FR - dEdge) / 10));
    if (y < WATER_Y + 0.6 || y > 17 || fade <= 0) S.set(0, 0, 0);
    else S.set(g.s * fade, g.s * fade, g.s * fade);
    P.set(g.x, y - 0.04, g.z);
    E.set(0, g.rot, 0); Q.setFromEuler(E);
    flowersM.setMatrixAt(i, M.compose(P, Q, S));
  };
  for (let i = 0; i < CFG.flowers; i++) {
    fPos.push({ x: (Math.random() - 0.5) * 2 * FR, z: SPAWN.z + (Math.random() - 0.5) * 2 * FR,
                rot: Math.random() * Math.PI * 2, s: 0.7 + Math.random() * 0.8 });
    setFlower(i);
    const c = new THREE.Color(FLOWER_PALETTE[(Math.random() * FLOWER_PALETTE.length) | 0]);
    flowersM.setColorAt(i, c);
  }
  flowersM.count = CFG.flowers;
  flowersM.instanceColor.needsUpdate = true;
  flowersM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(flowersM);

  // ── 2. GROUND TUFT follow-field (fern/clover, low + dark) ──
  const TR = 40;
  const tuftsM = new THREE.InstancedMesh(tuftGeo, tuftMat, CFG.tufts);
  tuftsM.frustumCulled = false; tuftsM.castShadow = false;
  const tPos = [];
  const setTuft = (i) => {
    const g = tPos[i];
    const y = heightAt(g.x, g.z);
    const pc = window._player || SPAWN;
    const dEdge = Math.max(Math.abs(g.x - pc.x), Math.abs(g.z - pc.z));
    const fade = Math.max(0, Math.min(1, (TR - dEdge) / 9));
    if (y < WATER_Y + 0.4 || y > 22 || fade <= 0) S.set(0, 0, 0);
    else S.set(g.s * fade, g.s * g.sy * fade, g.s * fade);
    P.set(g.x, y - 0.03, g.z);
    E.set(0, g.rot, 0); Q.setFromEuler(E);
    tuftsM.setMatrixAt(i, M.compose(P, Q, S));
  };
  for (let i = 0; i < CFG.tufts; i++) {
    tPos.push({ x: (Math.random() - 0.5) * 2 * TR, z: SPAWN.z + (Math.random() - 0.5) * 2 * TR,
                rot: Math.random() * Math.PI * 2, s: 0.7 + Math.random() * 0.7,
                sy: 0.7 + Math.random() * 0.5 });
    setTuft(i);
  }
  tuftsM.count = CFG.tufts;
  tuftsM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(tuftsM);

  // ── 3. MUSHROOMS — STATIC scatter, placed once across the world ──
  const mushM = new THREE.InstancedMesh(mushGeo, mushMat, CFG.mushrooms);
  mushM.frustumCulled = false; mushM.castShadow = false;
  {
    let placed = 0, guard = 0;
    while (placed < CFG.mushrooms && guard++ < CFG.mushrooms * 40) {
      const x = (Math.random() - 0.5) * WORLD * 0.9,
            z = (Math.random() - 0.5) * WORLD * 0.9,
            y = heightAt(x, z);
      if (y < WATER_Y + 0.8 || y > 22) continue;
      const s = 0.7 + Math.random() * 1.1;
      P.set(x, y - 0.02, z);
      E.set(0, Math.random() * Math.PI * 2, 0); Q.setFromEuler(E);
      S.set(s, s, s);
      mushM.setMatrixAt(placed++, M.compose(P, Q, S));
    }
    mushM.count = placed;
  }
  scene.add(mushM);

  // ── 4. STATIC DENSE WAKE-BED — a bright flower disc at SPAWN ──
  const bedM = new THREE.InstancedMesh(flowerGeoBase, flowerMat, CFG.bedFlowers);
  bedM.frustumCulled = false; bedM.castShadow = false;
  {
    let placed = 0, guard = 0;
    const BED_R = 11;
    while (placed < CFG.bedFlowers && guard++ < CFG.bedFlowers * 30) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * BED_R;
      const x = SPAWN.x + Math.cos(a) * rr, z = SPAWN.z + Math.sin(a) * rr,
            y = heightAt(x, z);
      if (y < WATER_Y + 0.6 || y > 17) continue;
      const s = 0.8 + Math.random() * 0.9;
      P.set(x, y - 0.04, z);
      E.set(0, Math.random() * Math.PI * 2, 0); Q.setFromEuler(E);
      S.set(s, s, s);
      bedM.setMatrixAt(placed, M.compose(P, Q, S));
      bedM.setColorAt(placed, new THREE.Color(
        FLOWER_PALETTE[(Math.random() * FLOWER_PALETTE.length) | 0]));
      placed++;
    }
    bedM.count = placed;
    if (bedM.instanceColor) bedM.instanceColor.needsUpdate = true;
  }
  scene.add(bedM);

  // ── follow-field stepper — amortized like the grass field, no allocs ──
  let fCursor = 0, tCursor = 0;
  window._updateFlowerField = () => {
    const fSlice = Math.ceil(CFG.flowers / 6);
    let fTouched = false;
    for (let k = 0; k < fSlice; k++) {
      const i = (fCursor + k) % CFG.flowers; const g = fPos[i]; let moved = false;
      while (g.x - player.x > FR) { g.x -= 2 * FR; moved = true; }
      while (player.x - g.x > FR) { g.x += 2 * FR; moved = true; }
      while (g.z - player.z > FR) { g.z -= 2 * FR; moved = true; }
      while (player.z - g.z > FR) { g.z += 2 * FR; moved = true; }
      if (moved) { setFlower(i); fTouched = true; }
    }
    fCursor = (fCursor + fSlice) % CFG.flowers;
    if (fTouched) flowersM.instanceMatrix.needsUpdate = true;

    const tSlice = Math.ceil(CFG.tufts / 6);
    let tTouched = false;
    for (let k = 0; k < tSlice; k++) {
      const i = (tCursor + k) % CFG.tufts; const g = tPos[i]; let moved = false;
      while (g.x - player.x > TR) { g.x -= 2 * TR; moved = true; }
      while (player.x - g.x > TR) { g.x += 2 * TR; moved = true; }
      while (g.z - player.z > TR) { g.z -= 2 * TR; moved = true; }
      while (player.z - g.z > TR) { g.z += 2 * TR; moved = true; }
      if (moved) { setTuft(i); tTouched = true; }
    }
    tCursor = (tCursor + tSlice) % CFG.tufts;
    if (tTouched) tuftsM.instanceMatrix.needsUpdate = true;
  };
}

function mergeGeoms(list) {
  // minimal non-indexed merge (avoids importing BufferGeometryUtils)
  const out = new THREE.BufferGeometry();
  const attrs = ['position', 'normal', 'uv'];
  const data = {};
  for (const a of attrs) data[a] = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const a of attrs) {
      const src = ng.attributes[a]; if (!src) continue;
      data[a].push(...src.array);
    }
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
  return out;
}

// ───────────────────────── trees + rocks (instanced) ─────────────────────────
{
  // three species, altitude-distributed: broadleaf low, pines mid,
  // hardy pines high, birches scattered through the lowlands
  const paintTwoTone = (geo, trunkGeo, trunkColor, leafFn) => {
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    const trunkN = trunkGeo.toNonIndexed().attributes.position.count;
    const brown = new THREE.Color(trunkColor);
    for (let i = 0; i < n; i++) {
      const c = i < trunkN ? brown : leafFn();
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  // a branch limb: thin cylinder, tilted out + up, seated on the trunk
  const mkBranch = (len, rad, ax, ay, az, yaw, tilt) => {
    const g = new THREE.CylinderGeometry(rad * 0.5, rad, len, 5);
    g.translate(0, len / 2, 0);            // base at origin, grows +y
    g.rotateZ(tilt); g.rotateY(yaw);       // splay outward
    g.translate(ax, ay, az);
    return g;
  };
  // PINE — taller, layered cones + a ring of bare lower limbs (branches)
  // trunk + branches + cones all raised so the lowest occluding geometry
  // clears the ~2.8m jump-apex eye even at 0.8 min scale (no headbump).
  const pineTrunk = new THREE.CylinderGeometry(0.26, 0.46, 6.2, 7);
  pineTrunk.translate(0, 3.1, 0);
  const pineParts = [pineTrunk];
  for (let i = 0; i < 5; i++) {            // bare branches up the trunk
    const a = i / 5 * Math.PI * 2 + 0.6;
    pineParts.push(mkBranch(1.5 - i * 0.12, 0.05, 0, 3.9 + i * 0.55, 0, a, 1.15));
  }
  const pc1 = new THREE.ConeGeometry(2.7, 4.6, 9); pc1.translate(0, 7.0, 0);
  const pc2 = new THREE.ConeGeometry(2.0, 3.6, 9); pc2.translate(0, 9.4, 0);
  const pc3 = new THREE.ConeGeometry(1.2, 2.6, 9); pc3.translate(0, 11.6, 0);
  pineParts.push(pc1, pc2, pc3);
  const pineTrunkN = mergeGeoms([pineTrunk, ...pineParts.slice(1, 6)]);  // trunk+branches = bark
  const pineGeo = paintTwoTone(mergeGeoms(pineParts), pineTrunkN,
    0x6b4a2a, () => new THREE.Color().setHSL(0.27 + Math.random() * 0.03, 0.45,
                                             0.28 + Math.random() * 0.07));

  // BROADLEAF — real boughs (branches) fanning into clustered canopy blobs
  const blTrunk = new THREE.CylinderGeometry(0.34, 0.6, 6.6, 7);
  blTrunk.translate(0, 3.3, 0);
  const blParts = [blTrunk];
  const boughs = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.3;
    boughs.push(mkBranch(2.6, 0.11, 0, 5.2, 0, a, 0.8));
  }
  blParts.push(...boughs);
  // canopy blobs perched at the bough tips — raised so the lowest blob
  // bottom sits ~5.4m up, clear above the jump-apex eye.
  const blob = (r, x, y, z) => { const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z); return g; };
  blParts.push(blob(2.4, 0, 8.0, 0), blob(1.8, 1.9, 7.3, 0.4),
               blob(1.7, -1.7, 7.5, -0.5), blob(1.6, 0.4, 7.0, 1.8),
               blob(1.5, -0.6, 7.2, -1.7));
  const blTrunkN = mergeGeoms([blTrunk, ...boughs]);
  const broadGeo = paintTwoTone(mergeGeoms(blParts), blTrunkN,
    0x5d452c, () => new THREE.Color().setHSL(0.23 + Math.random() * 0.05, 0.5,
                                             0.30 + Math.random() * 0.09));

  const biTrunk = new THREE.CylinderGeometry(0.16, 0.22, 5.2, 6);
  biTrunk.translate(0, 2.6, 0);
  const bi1 = new THREE.IcosahedronGeometry(1.6, 0); bi1.translate(0, 6.0, 0);
  const birchGeo = paintTwoTone(mergeGeoms([biTrunk, bi1]), biTrunk,
    0xd9d4c4, () => new THREE.Color().setHSL(0.21 + Math.random() * 0.04, 0.55,
                                             0.42 + Math.random() * 0.08));

  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true,
    roughness: 1, emissive: 0x16240e, emissiveIntensity: 0.55 });
  // ── WIND ── pivot-from-base canopy sway. Reuses windUniforms.uTime
  // (already ticked once/frame — zero extra JS). Pure vertex displacement
  // in onBeforeCompile: no new geometry, no per-frame allocation.
  //   bendY = (localY/H)^1.6 * amp  → 0 at trunk base, max at the crown,
  //           so trunks stay planted and tops lean/flow.
  //   ph    = per-instance phase from the instance world translation
  //           (instanceMatrix[3][0/2]) → each tree ripples on its own clock.
  //   gust  = slow global swell over uTime layered on the local sway, so the
  //           whole forest surges together between lulls.
  // H≈12 (tallest canopy ~y=12). amp in *local* units; instance scale (0.8–1.9)
  // multiplies it for free, so big trees sway proportionally more.
  // tree sway REMOVED — treeMat now compiles with the stock vertex shader
  // (zero displacement, zero per-frame cost). treeWind kept as a no-op stub
  // so the call site stays stable; grass/flowers/reeds keep their wind.
  const treeWind = (amp, sideAmp) => (sh) => {};
  // (intentionally NOT assigning treeMat.onBeforeCompile — trees are still)
  const species = [
    { geo: pineGeo,  inst: new THREE.InstancedMesh(pineGeo, treeMat, CFG.trees), n: 0, r: 1.1 },
    { geo: broadGeo, inst: new THREE.InstancedMesh(broadGeo, treeMat, CFG.trees), n: 0, r: 1.2 },
    { geo: birchGeo, inst: new THREE.InstancedMesh(birchGeo, treeMat, CFG.trees), n: 0, r: 0.6 },
  ];
  // PERF: trees do NOT cast shadows. At 4500/2200 instances a per-tree
  // shadow pass would blow the mobile budget; the dense canopy reads as
  // a mass without it, and the sun shadow still lands on player + animals
  // (which keep castShadow). This is the single biggest perf lever for
  // pushing tree count ~4x.
  species.forEach(s => { s.inst.castShadow = false; s.inst.receiveShadow = false; scene.add(s.inst); });

  // ── grove clumping field ──────────────────────────────────────────
  // A cheap hash-based value-noise sampled at two scales. Trees/rocks
  // reject-sample against it so the world breaks into dense thickets AND
  // open clearings instead of uniform static. No per-frame cost — only
  // sampled once during placement. Pure function, no allocations.
  const _h2 = (ix, iz) => {
    let h = (ix * 374761393 + iz * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  };
  const _vnoise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = _h2(xi, zi), b = _h2(xi + 1, zi),
          c = _h2(xi, zi + 1), d = _h2(xi + 1, zi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  // 0..1 grove mask: high = thicket, low = clearing. Two octaves so
  // big groves contain smaller gaps. 1/55 ≈ ~55-unit grove cells.
  const groveAt = (x, z) =>
    _vnoise(x / 55, z / 55) * 0.68 + _vnoise(x / 17, z / 17) * 0.32;
  // neutral white = pass geometry vertex-colors through untouched
  // (instanceColor multiplies vColors on a vertexColors material)
  const AUTUMN_NEUTRAL = new THREE.Color(1, 1, 1);

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(),
        S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  let placed = 0, guard = 0;
  window.TREES = [];
  // solid AND walkable-on-top props (logs, stumps, squat boulders). Each
  // carries a world-space `top` you can clamber onto. See the movement loop.
  window.STEPPROPS = [];
  // Cap collidable trunks so the hunt's collision scan stays cheap even
  // as rendered tree count climbs. ~1600 real obstacles is plenty of
  // cover; the rest render as canopy mass only.
  const TREE_COLLIDE_MAX = IS_TOUCH ? 1100 : 1600;
  while (placed < CFG.trees && guard++ < CFG.trees * 30) {
    const x = (Math.random() - 0.5) * WORLD * 0.92,
          z = (Math.random() - 0.5) * WORLD * 0.92,
          y = heightAt(x, z);
    if (y < WATER_Y + 1.5 || y > 26) continue;      // treeline at 26
    if (Math.hypot(x, z) < 18) continue;            // spawn clearing
    const reg = regionAt(x, z);
    // density gating per region — bias WHERE trees clump without
    // touching the spawner mechanics. reject-sample to thin/thicken.
    // (pine 1, broadleaf 0, birch 2 in species[])
    const dens = reg === REGION.MEADOW ? 0.22
               : reg === REGION.ALPINE ? 0.5
               : reg === REGION.WETLAND ? 0.4
               : reg === REGION.PINE ? 1.0
               : 0.95;                               // autumn
    if (Math.random() > dens) continue;
    // grove clumping — fold the noise mask into acceptance so trees
    // pile into thickets and thin out into huntable clearings. Meadow
    // stays mostly open (low gveffect) so the spawn region reads sparse;
    // deep pine clumps hardest. groveAt ~0.5 avg → boost ~1.0x so the
    // raised CFG.trees count still fills.
    const gv = groveAt(x, z);
    const gveffect = reg === REGION.MEADOW ? 0.35
                   : reg === REGION.PINE ? 1.0
                   : 0.8;
    // bias toward thickets: square the mask, then mix with flat by gveffect
    const groveAccept = (1 - gveffect) + gveffect * (0.18 + 1.45 * gv * gv);
    if (Math.random() > groveAccept) continue;
    const roll = Math.random();
    let sp;
    if (reg === REGION.PINE)           sp = roll < 0.82 ? species[0] : roll < 0.92 ? species[1] : species[2];
    else if (reg === REGION.AUTUMN)    sp = roll < 0.78 ? species[1] : roll < 0.9 ? species[2] : species[0];
    else if (reg === REGION.ALPINE)    sp = species[0];           // hardy pines only
    else if (reg === REGION.WETLAND)   sp = roll < 0.5 ? species[1] : species[2]; // damp broadleaf + birch
    else if (reg === REGION.MEADOW)    sp = roll < 0.55 ? species[1] : species[2]; // lone broadleaf/birch
    // fallback to the original altitude bands for anything unlabeled
    else if (y < 8)  sp = roll < 0.45 ? species[1] : roll < 0.75 ? species[0] : species[2];
    else if (y < 14) sp = roll < 0.65 ? species[0] : roll < 0.9 ? species[1] : species[2];
    else             sp = species[0];
    // recolor autumn broadleaf via instance color — a warm multiply
    // tint (instanceColor multiplies the geometry vColors) so the
    // grove's canopy shifts orange/rust and reads as fall from afar.
    // Trunk goes a warmer brown too, which is fine. Everyone else gets
    // neutral white so their baked vertex colors pass through unchanged.
    if (reg === REGION.AUTUMN && sp === species[1]) {
      sp.inst.setColorAt(sp.n, new THREE.Color().setHSL(
        0.055 + Math.random() * 0.04, 0.85, 0.66 + Math.random() * 0.12));
    } else {
      sp.inst.setColorAt(sp.n, AUTUMN_NEUTRAL);
    }
    P.set(x, y - 0.15, z);
    E.set(0, Math.random() * Math.PI * 2, 0); Q.setFromEuler(E);
    const s = 0.8 + Math.random() * 1.1; S.set(s, s, s);
    sp.inst.setMatrixAt(sp.n++, M.compose(P, Q, S));
    // PERF: cap the collision/cover array. With 4500 trunks a full
    // TREES[] would bloat the per-step collision scan; the smallest
    // saplings (r below ~0.8) are visual filler, not real obstacles, so
    // we render them but skip pushing them as collidable cover. Hard cap
    // at TREE_COLLIDE_MAX keeps the array bounded regardless of count.
    const tr = sp.r * s;
    if (tr >= 0.8 && TREES.length < TREE_COLLIDE_MAX) TREES.push({ x, z, r: tr });
    placed++;
  }
  species.forEach(s => {
    s.inst.count = s.n;
    if (s.inst.instanceColor) s.inst.instanceColor.needsUpdate = true;
  });

  // bushes — undergrowth that breaks sightlines. COVER, not collision.
  const bu1 = new THREE.IcosahedronGeometry(1.0, 0); bu1.translate(0, 0.7, 0);
  const bu2 = new THREE.IcosahedronGeometry(0.75, 0); bu2.translate(0.8, 0.5, 0.3);
  const bu3 = new THREE.IcosahedronGeometry(0.6, 0); bu3.translate(-0.7, 0.45, -0.2);
  const bushGeo = mergeGeoms([bu1, bu2, bu3]);
  {
    const n = bushGeo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Color().setHSL(0.22 + Math.random() * 0.07,
        0.42 + Math.random() * 0.18, 0.24 + Math.random() * 0.1);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    bushGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const bushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    emissive: 0x121f0a, emissiveIntensity: 0.5 });
  // ── WIND ── undergrowth flutter. Bush geo tops out ~y=1.7 (local), so a
  // small amp reads as a quick rustle vs the trees' slow lean. Reeds (wetland
  // bushes) are y-stretched 2-4x, so their tall blades naturally swing more
  // (bendY scales with local y). Same windUniforms.uTime, per-instance phase.
  bushMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float bendY = position.y * 0.10;
       float ph = instanceMatrix[3][0]*0.21 + instanceMatrix[3][2]*0.17;
       float gust = 0.6 + 0.4*sin(uTime*0.3 + instanceMatrix[3][2]*0.015);
       transformed.x += (sin(uTime*1.6 + ph) + 0.3*sin(uTime*3.1 + ph*1.6)) * bendY * gust;
       transformed.z += cos(uTime*1.2 + ph) * bendY * 0.6 * gust;`);
  };
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, CFG.bushes);
  bushes.castShadow = true;
  const BUSH_NEUTRAL = new THREE.Color(1, 1, 1);
  const REED_TINT = new THREE.Color(0xb6c47a);   // pale damp reed multiply
  window.BUSHES = [];
  placed = 0; guard = 0;
  while (placed < CFG.bushes && guard++ < CFG.bushes * 30) {
    const x = (Math.random() - 0.5) * WORLD * 0.92,
          z = (Math.random() - 0.5) * WORLD * 0.92,
          y = heightAt(x, z);
    if (y < WATER_Y + 1 || y > 22) continue;
    if (Math.hypot(x, z) < 14) continue;
    const reg = regionAt(x, z);
    // undergrowth density by region — pine floor stays open ("little
    // undergrowth light"), wetland & autumn thicken, meadow sparse.
    const bdens = reg === REGION.PINE ? 0.35
                : reg === REGION.MEADOW ? 0.5
                : reg === REGION.ALPINE ? 0.4
                : reg === REGION.WETLAND ? 1.2     // >1 = no rejection, reeds cluster
                : 0.9;                              // autumn
    if (Math.random() > bdens) continue;
    P.set(x, y - 0.1, z);
    E.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.15);
    Q.setFromEuler(E);
    let s, rr;
    if (reg === REGION.WETLAND) {
      // reeds — tall + thin: squeeze x/z, stretch y
      s = 0.5 + Math.random() * 0.5;
      S.set(s * 0.4, s * (2.2 + Math.random() * 1.4), s * 0.4);
      bushes.setColorAt(placed, REED_TINT);
      rr = 0.5 * s;                                // thin footprint for cover
    } else {
      s = 0.7 + Math.random() * 1.3;
      S.set(s, s * (0.7 + Math.random() * 0.5), s);
      bushes.setColorAt(placed, BUSH_NEUTRAL);
      rr = 1.3 * s;
    }
    bushes.setMatrixAt(placed++, M.compose(P, Q, S));
    BUSHES.push({ x, z, r: rr });
  }
  bushes.count = placed;
  if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
  scene.add(bushes);

  const rg = new THREE.DodecahedronGeometry(1.1, 0);
  const rocks = new THREE.InstancedMesh(rg,
    new THREE.MeshStandardMaterial({ color: 0x8d8678, roughness: 1 }), CFG.rocks);
  rocks.castShadow = true;
  placed = 0; guard = 0;
  while (placed < CFG.rocks && guard++ < CFG.rocks * 40) {
    const x = (Math.random() - 0.5) * WORLD * 0.94,
          z = (Math.random() - 0.5) * WORLD * 0.94,
          y = heightAt(x, z);
    if (y < WATER_Y + 0.5) continue;
    // cluster rocks into rocky fields. Offset-sample the grove noise so
    // rock clumps DON'T line up with tree thickets, and bias hard toward
    // high/alpine ground so the climbable rocky terrain gets boulder-
    // dense while lowland stays mostly clear. Keeps clearings readable.
    const reg = regionAt(x, z);
    const rmask = groveAt(x + 311, z - 197);          // decorrelated field
    const highBias = Math.min(1, Math.max(0, (y - 8) / 18)); // 0 low → 1 alpine
    const rockAccept = (reg === REGION.ALPINE ? 0.45 : 0.12)
                     + 0.7 * rmask * rmask + 0.5 * highBias;
    if (Math.random() > rockAccept) continue;
    P.set(x, y, z);
    E.set(Math.random(), Math.random() * 6, Math.random()); Q.setFromEuler(E);
    const s = 0.5 + Math.random() * 1.6; S.set(s, s * (0.6 + Math.random() * 0.6), s);
    rocks.setMatrixAt(placed++, M.compose(P, Q, S));
  }
  rocks.count = placed;
  scene.add(rocks);

  // ─────────── vision-blockers — undergrowth that breaks sightlines ──────────
  // Three new instanced foliage masses that OCCLUDE at eye level. They do
  // NOT hard-block movement (you push through brush) — they push into
  // BUSHES[] so losBlocked() hides you AND the animals from each other.
  // Grove-biased placement; one shared wind-swayed material; no shadows.
  {
    const blockerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
      emissive: 0x101a08, emissiveIntensity: 0.45 });
    blockerMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windUniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float bendY = position.y * 0.07;
         float ph = instanceMatrix[3][0]*0.2 + instanceMatrix[3][2]*0.16;
         float gust = 0.6 + 0.4*sin(uTime*0.28 + instanceMatrix[3][2]*0.013);
         transformed.x += (sin(uTime*1.5 + ph) + 0.3*sin(uTime*3.0 + ph*1.6)) * bendY * gust;
         transformed.z += cos(uTime*1.1 + ph) * bendY * 0.6 * gust;`);
    };
    const tintFoliage = (geo, lo, hi) => {
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const c = new THREE.Color().setHSL(0.24 + Math.random() * 0.06,
          0.4 + Math.random() * 0.2, lo + Math.random() * (hi - lo));
        col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    };
    // THICKET — squat opaque dome of 7 overlapping icosa, ~1.9m
    const thicketParts = [];
    for (let i = 0; i < 7; i++) {
      const r = 0.7 + Math.random() * 0.5;
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.translate((Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 1.1, (Math.random() - 0.5) * 1.2);
      thicketParts.push(g);
    }
    const thicketGeo = tintFoliage(mergeGeoms(thicketParts), 0.18, 0.30);
    // LEAN BRUSH — a fat foliage mass tipped off a short stalk, ~2.2m wall
    const lbStalk = new THREE.CylinderGeometry(0.06, 0.1, 0.9, 5); lbStalk.translate(0, 0.45, 0);
    const lbMass = new THREE.IcosahedronGeometry(1.15, 0); lbMass.scale(1.2, 0.9, 1.0);
    lbMass.translate(0.3, 1.55, 0);
    const lbMass2 = new THREE.IcosahedronGeometry(0.8, 0); lbMass2.translate(-0.4, 1.2, 0.3);
    const leanGeo = tintFoliage(mergeGeoms([lbStalk, lbMass, lbMass2]), 0.16, 0.28);
    // FERN STAND — 9 arcing cone-fronds, ~2.4m
    const fernParts = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2, len = 1.6 + Math.random() * 0.7;
      const fr = new THREE.ConeGeometry(0.12, len, 4);
      fr.translate(0, len / 2, 0);
      fr.rotateZ((0.3 + Math.random() * 0.4) * (Math.cos(a) > 0 ? 1 : -1));
      fr.rotateY(a);
      fr.translate(Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2);
      fernParts.push(fr);
    }
    const fernGeo = tintFoliage(mergeGeoms(fernParts), 0.20, 0.34);

    const N_THICKET = IS_TOUCH ? 220 : 380;
    const N_LEAN = IS_TOUCH ? 150 : 260;
    const N_FERN = IS_TOUCH ? 200 : 340;
    const blockers = [
      { geo: thicketGeo, n: N_THICKET, br: 1.6, off: 137 },
      { geo: leanGeo,    n: N_LEAN,    br: 1.3, off: 311 },
      { geo: fernGeo,    n: N_FERN,    br: 1.1, off: 53  },
    ];
    for (const bk of blockers) {
      const inst = new THREE.InstancedMesh(bk.geo, blockerMat, bk.n);
      inst.castShadow = false; inst.receiveShadow = false; inst.frustumCulled = false;
      let bp = 0, bg = 0;
      while (bp < bk.n && bg++ < bk.n * 40) {
        const x = (Math.random() - 0.5) * WORLD * 0.92,
              z = (Math.random() - 0.5) * WORLD * 0.92,
              y = heightAt(x, z);
        if (y < WATER_Y + 1 || y > 24) continue;
        if (Math.hypot(x, z) < 16) continue;            // keep the spawn clearing open
        // grove-biased: decorrelated sample so each kind clumps differently
        const gv = groveAt(x + bk.off, z - bk.off);
        if (Math.random() > 0.22 + 1.5 * gv * gv) continue;
        P.set(x, y - 0.1, z);
        E.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.12); Q.setFromEuler(E);
        const s = 0.8 + Math.random() * 0.7; S.set(s, s * (0.9 + Math.random() * 0.4), s);
        inst.setMatrixAt(bp++, M.compose(P, Q, S));
        BUSHES.push({ x, z, r: bk.br * s });             // occludes player AND animals
      }
      inst.count = bp;
      scene.add(inst);
    }
  }

  // ─────────── climbable outcrop cladding — visual rock on the perches ──────────
  // The walkable surface IS the heightAt dome; these boulders just make
  // it READ as rock you climb. They hug the dome (clamped to heightAt)
  // and are deliberately NOT pushed into TREES — so nothing blocks the
  // ascent. One InstancedMesh = one draw call. No shadows (cheap).
  {
    // a chunkier, more angular rock than the scatter dodec
    const og = mergeGeoms([
      new THREE.DodecahedronGeometry(1.0, 0),
      (() => { const g = new THREE.IcosahedronGeometry(0.7, 0); g.translate(0.9, 0.3, 0.4); return g; })(),
    ]);
    // count up front so we can size the instanced mesh once
    const RING = 9;                       // boulders per flank ring
    const RINGS = 2;                      // two stacked flank rings
    const CROWN = 5;                      // boulders crowning the rim/perch
    const perOut = RING * RINGS + CROWN;
    const outRocks = new THREE.InstancedMesh(
      og, new THREE.MeshStandardMaterial({ color: 0x8a8275, roughness: 1,
        emissive: 0x0c0d0a, emissiveIntensity: 0.25 }),
      OUTCROPS.length * perOut);
    outRocks.castShadow = false; outRocks.receiveShadow = true;
    let op = 0;
    for (const o of OUTCROPS) {
      // flank rings — boulders stepping up the slope (a "scale" to walk)
      for (let ring = 0; ring < RINGS; ring++) {
        const frac = 0.62 + ring * 0.18;        // out along the radius
        const rr = o.r * frac;
        for (let k = 0; k < RING; k++) {
          const a2 = (k / RING) * Math.PI * 2 + ring * 0.7 + o.x * 0.01;
          const x = o.x + Math.cos(a2) * rr, z = o.z + Math.sin(a2) * rr;
          const y = heightAt(x, z);
          P.set(x, y - 0.35, z);                // seated slightly into the slope
          E.set((k * 1.3) % 1, a2, (ring + k) * 0.4); Q.setFromEuler(E);
          const s = 1.5 + ((k * 7) % 5) * 0.4;
          S.set(s, s * (0.7 + ((k * 3) % 4) * 0.12), s);
          outRocks.setMatrixAt(op++, M.compose(P, Q, S));
        }
      }
      // crown — a few big slabs around the flat perch lip for drama
      for (let k = 0; k < CROWN; k++) {
        const a2 = (k / CROWN) * Math.PI * 2 + o.z * 0.02;
        const rr = o.r * 0.34;
        const x = o.x + Math.cos(a2) * rr, z = o.z + Math.sin(a2) * rr;
        const y = heightAt(x, z);
        P.set(x, y - 0.2, z);
        E.set((k * 0.9) % 1, a2 + 0.5, k * 0.3); Q.setFromEuler(E);
        const s = 1.7 + ((k * 5) % 4) * 0.35;
        S.set(s, s * 0.85, s);
        outRocks.setMatrixAt(op++, M.compose(P, Q, S));
      }
    }
    outRocks.count = op;
    scene.add(outRocks);
  }

  // ───────────── prop scatter — fill the world with THINGS ─────────────
  // All instanced, placed once, vertex-colored. Big solid props (logs,
  // boulders) push into TREES[] so they read as cover for the hunt.
  // Reuses M/Q/S/P/E + heightAt + mergeGeoms from above.
  const paintGeo = (geo, fn) => {
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = fn(i); col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    emissive: 0x14160e, emissiveIntensity: 0.35 });
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    emissive: 0x0a0b0d, emissiveIntensity: 0.25 });
  // ── WIND ── only the foliage props get sway; logs/stumps/boulders/stones
  // stay dead-rigid (they're wood-on-ground / rock) and keep propMat/stoneMat.
  // Dedicated clones so the rigid props sharing propMat are untouched.
  //   cattails — reeds, lakeside: sway A LOT (tall thin blades, local y to 2.2).
  //   snags    — dead bare trunks: sway A LITTLE (creak, not bend).
  // Both reuse windUniforms.uTime + per-instance phase + a slow gust swell.
  const propWind = (amp, sideAmp) => (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float bendY = position.y * position.y * ${amp.toFixed(3)};
       float ph = instanceMatrix[3][0]*0.18 + instanceMatrix[3][2]*0.15;
       float gust = 0.6 + 0.4*sin(uTime*0.31 + instanceMatrix[3][0]*0.014);
       transformed.x += (sin(uTime*1.5 + ph) + 0.35*sin(uTime*3.0 + ph*1.6)) * bendY * gust;
       transformed.z += cos(uTime*1.1 + ph) * bendY * ${sideAmp.toFixed(2)} * gust;`);
  };
  const cattailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    emissive: 0x14160e, emissiveIntensity: 0.35 });
  cattailMat.onBeforeCompile = propWind(0.16, 0.7);   // reeds whip
  const snagMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    emissive: 0x14160e, emissiveIntensity: 0.35 });
  // dead bare trunks are RIGID wood — they do not sway (a swaying trunk
  // reads as wrong). Stock shader, zero displacement.

  // --- geometry builders (each merged ONCE, then instanced) ---
  // FALLEN LOG — long cylinder on its side, mossy top.
  const logBark = new THREE.CylinderGeometry(0.55, 0.7, 7.0, 8);
  logBark.rotateZ(Math.PI / 2); logBark.translate(0, 0.62, 0);
  const moss1 = new THREE.IcosahedronGeometry(0.62, 0); moss1.translate(-1.6, 1.1, 0.1);
  const moss2 = new THREE.IcosahedronGeometry(0.55, 0); moss2.translate(1.3, 1.05, -0.15);
  const moss3 = new THREE.IcosahedronGeometry(0.5, 0); moss3.translate(0.0, 1.12, 0.2);
  const logBarkN = logBark.toNonIndexed().attributes.position.count;
  const logGeo = paintGeo(mergeGeoms([logBark, moss1, moss2, moss3]), (i) =>
    i < logBarkN
      ? new THREE.Color().setHSL(0.08, 0.32, 0.18 + Math.random() * 0.05)
      : new THREE.Color().setHSL(0.26, 0.45, 0.26 + Math.random() * 0.07));

  // TREE STUMP — short fat tapered cylinder + brighter sawn-face disc.
  const stumpBody = new THREE.CylinderGeometry(0.55, 0.78, 1.15, 9);
  stumpBody.translate(0, 0.55, 0);
  const stumpTop = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 9);
  stumpTop.translate(0, 1.12, 0);
  const stumpBodyN = stumpBody.toNonIndexed().attributes.position.count;
  const stumpGeo = paintGeo(mergeGeoms([stumpBody, stumpTop]), (i) =>
    i < stumpBodyN
      ? new THREE.Color().setHSL(0.07, 0.3, 0.16 + Math.random() * 0.04)
      : new THREE.Color().setHSL(0.09, 0.34, 0.34 + Math.random() * 0.05));

  // BOULDER CLUSTER — big dodec + two seated smaller. cool grey.
  const bld1 = new THREE.DodecahedronGeometry(2.0, 0); bld1.translate(0, 1.5, 0);
  const bld2 = new THREE.DodecahedronGeometry(1.15, 0); bld2.scale(1, 0.8, 1); bld2.translate(2.1, 0.7, 0.6);
  const bld3 = new THREE.DodecahedronGeometry(0.85, 0); bld3.translate(-1.6, 0.55, -0.7);
  const boulderGeo = paintGeo(mergeGeoms([bld1, bld2, bld3]), () =>
    new THREE.Color().setHSL(0.6, 0.04, 0.40 + Math.random() * 0.12));

  // DEAD SNAG — bare angular trunk + 2 broken stubs.
  const snagTrunk = new THREE.CylinderGeometry(0.18, 0.42, 6.0, 6);
  snagTrunk.translate(0, 3.0, 0);
  const snagStub1 = new THREE.CylinderGeometry(0.06, 0.16, 1.2, 5);
  snagStub1.rotateZ(0.9); snagStub1.translate(0.7, 3.6, 0.1);
  const snagStub2 = new THREE.CylinderGeometry(0.05, 0.13, 0.9, 5);
  snagStub2.rotateZ(-1.1); snagStub2.rotateY(1.2); snagStub2.translate(-0.6, 4.4, -0.2);
  const snagGeo = paintGeo(mergeGeoms([snagTrunk, snagStub1, snagStub2]), () =>
    new THREE.Color().setHSL(0.09, 0.12, 0.30 + Math.random() * 0.1));

  // CATTAIL CLUMP — thin blades + brown seed-head tips, lakeside reeds.
  const reedParts = [];
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2, rr2 = 0.12 + Math.random() * 0.18;
    const blade = new THREE.CylinderGeometry(0.02, 0.04, 1.6 + Math.random() * 0.6, 4);
    blade.translate(0, 0.8, 0);
    blade.rotateZ((Math.random() - 0.5) * 0.25);
    blade.translate(Math.cos(a) * rr2, 0, Math.sin(a) * rr2);
    reedParts.push(blade);
  }
  const reedBladeCount = reedParts.reduce((s, g) =>
    s + g.toNonIndexed().attributes.position.count, 0);
  const head1 = new THREE.CylinderGeometry(0.07, 0.07, 0.45, 5); head1.translate(0.13, 1.55, 0.05);
  const head2 = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 5); head2.translate(-0.1, 1.4, -0.08);
  const cattailGeo = paintGeo(mergeGeoms([...reedParts, head1, head2]), (i) =>
    i < reedBladeCount
      ? new THREE.Color().setHSL(0.22, 0.5, 0.34 + Math.random() * 0.08)
      : new THREE.Color().setHSL(0.07, 0.55, 0.22));

  // STANDING STONE — tall monolith leaning slightly + cap box.
  const monolith = new THREE.BoxGeometry(1.6, 7.0, 1.1);
  monolith.translate(0, 3.5, 0);
  const monoCap = new THREE.BoxGeometry(1.3, 0.5, 0.85); monoCap.translate(0.1, 7.0, 0);
  const standingStoneGeo = paintGeo(mergeGeoms([monolith, monoCap]), () =>
    new THREE.Color().setHSL(0.62, 0.05, 0.26 + Math.random() * 0.08));

  // --- instanced meshes ---
  const N_LOGS = IS_TOUCH ? 90 : 150;
  const N_STUMPS = IS_TOUCH ? 70 : 120;
  const N_BOULDERS = IS_TOUCH ? 80 : 130;
  const N_SNAGS = IS_TOUCH ? 60 : 100;
  const N_CATTAILS = IS_TOUCH ? 120 : 200;
  const N_STONES = 22;

  const logsM = new THREE.InstancedMesh(logGeo, propMat, N_LOGS);
  const stumpsM = new THREE.InstancedMesh(stumpGeo, propMat, N_STUMPS);
  const bouldersM = new THREE.InstancedMesh(boulderGeo, stoneMat, N_BOULDERS);
  const snagsM = new THREE.InstancedMesh(snagGeo, snagMat, N_SNAGS);
  const cattailsM = new THREE.InstancedMesh(cattailGeo, cattailMat, N_CATTAILS);
  const stonesM = new THREE.InstancedMesh(standingStoneGeo, stoneMat, N_STONES);
  [logsM, stumpsM, bouldersM, snagsM, cattailsM, stonesM].forEach(m => {
    m.castShadow = true; scene.add(m);
  });

  const scatter = (mesh, count, fn) => {
    let p = 0, g2 = 0;
    while (p < count && g2++ < count * 40) {
      const x = (Math.random() - 0.5) * WORLD * 0.92,
            z = (Math.random() - 0.5) * WORLD * 0.92,
            y = heightAt(x, z);
      const r = fn(x, z, y, p);
      if (!r) continue;
      P.set(r.x !== undefined ? r.x : x, r.y, r.z !== undefined ? r.z : z);
      E.set(r.tilt || 0, r.yaw !== undefined ? r.yaw : Math.random() * Math.PI * 2, r.roll || 0);
      Q.setFromEuler(E);
      S.set(r.sx, r.sy, r.sz);
      mesh.setMatrixAt(p++, M.compose(P, Q, S));
      if (r.collide) TREES.push({ x, z, r: r.cr });
      // step-on prop: solid AND climbable. `top` = world-space walkable surface.
      if (r.step) STEPPROPS.push({ x, z, r: r.cr, top: r.top });
    }
    mesh.count = p;
  };

  scatter(logsM, N_LOGS, (x, z, y) => {
    if (y < WATER_Y + 1.2 || y > 24) return null;
    if (Math.hypot(x, z) < 16) return null;
    const s = 0.8 + Math.random() * 0.9;
    const baseY = y + 0.15;
    // log geo: cylinder centered at local y≈0.62, radius≈0.62 → top ≈ 1.24 local
    return { y: baseY, sx: s, sy: s, sz: s,
             collide: true, cr: 1.3 * s, step: true, top: baseY + 1.24 * s };
  });

  scatter(stumpsM, N_STUMPS, (x, z, y) => {
    if (y < WATER_Y + 1.0 || y > 24) return null;
    if (Math.hypot(x, z) < 12) return null;
    const s = 0.8 + Math.random() * 0.8;
    const sy = s * (0.8 + Math.random() * 0.5);
    const baseY = y - 0.05;
    // stump sawn face at local y≈1.18 → walkable top
    return { y: baseY, sx: s, sy, sz: s,
             collide: true, cr: 0.82 * s, step: true, top: baseY + 1.18 * sy };
  });

  scatter(bouldersM, N_BOULDERS, (x, z, y) => {
    if (y < WATER_Y + 0.4) return null;
    if (Math.hypot(x, z) < 14) return null;
    const s = 0.7 + Math.random() * 1.2;
    const sy = s * (0.8 + Math.random() * 0.4);
    const baseY = y + 0.2;
    // boulder geo tops out ~local 3.5 (big dodec center 1.5 + r 2.0) → world top
    const top = baseY + 3.5 * sy;
    const squat = (top - y) <= 2.7;          // low enough to clamber onto
    return { y: baseY, tilt: (Math.random() - 0.5) * 0.3, roll: (Math.random() - 0.5) * 0.3,
             sx: s, sy, sz: s,
             collide: !squat, cr: 2.2 * s, step: squat, top };
  });

  scatter(snagsM, N_SNAGS, (x, z, y) => {
    if (y < WATER_Y + 0.5 || y > 30) return null;
    if (Math.hypot(x, z) < 18) return null;
    const s = 0.7 + Math.random() * 0.9;
    // snags now BLOCK (were non-colliding) — a padded trunk-base radius
    return { tilt: (Math.random() - 0.5) * 0.18, roll: (Math.random() - 0.5) * 0.18,
             y: y - 0.1, sx: s, sy: s * (0.9 + Math.random() * 0.5), sz: s,
             collide: true, cr: 0.6 * s };
  });

  scatter(cattailsM, N_CATTAILS, (x, z, y) => {
    if (y < WATER_Y - 0.1 || y > WATER_Y + 1.3) return null;
    const s = 0.8 + Math.random() * 0.8;
    return { y: y - 0.05, tilt: (Math.random() - 0.5) * 0.12, roll: (Math.random() - 0.5) * 0.12,
             sx: s, sy: s * (0.8 + Math.random() * 0.6), sz: s };
  });

  scatter(stonesM, N_STONES, (x, z, y) => {
    if (y < 22 || y > 48) return null;
    const s = 0.8 + Math.random() * 0.7;
    return { tilt: (Math.random() - 0.5) * 0.22, roll: (Math.random() - 0.5) * 0.22,
             y: y - 0.3, sx: s, sy: s * (0.9 + Math.random() * 0.5), sz: s,
             collide: true, cr: 1.0 * s };
  });
}

// ───────────────────────── the corruption ─────────────────────────
// Some trees are WRONG. A blighted trunk crowned with a knot of sharp
// stingers — sickly, twitching, faintly glowing at the barbs. Get close
// and it stings you. (Lies-Beneath energy: stylized but genuinely off.)
const CORRUPT = []; window.CORRUPT = CORRUPT;
const STING_R = 3.4;
let _corruptMat = null;
{
  const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(),
        _P = new THREE.Vector3(), _S = new THREE.Vector3(), _E = new THREE.Euler();
  // blighted trunk
  const trunk = new THREE.CylinderGeometry(0.18, 0.4, 4.2, 6);
  trunk.translate(0, 2.1, 0);
  // a knot of radiating stingers — sharp cones, irregular, NOT bubbly
  const parts = [trunk];
  const core = new THREE.IcosahedronGeometry(0.95, 0); core.translate(0, 5.0, 0);
  parts.push(core);
  const tipIdx = [];                       // track which verts are barb tips (for color)
  for (let i = 0; i < 17; i++) {
    const len = 1.1 + Math.random() * 1.6;
    const sp = new THREE.ConeGeometry(0.12 + Math.random() * 0.06, len, 4);
    sp.translate(0, len / 2, 0);           // base at origin
    // aim outward in a rough sphere (bias upward/outward, not down)
    const az = Math.random() * Math.PI * 2;
    const el = (Math.random() * 0.9 - 0.15);
    _E.set(Math.PI / 2 - el, az, 0); _Q.setFromEuler(_E);
    _P.set(0, 5.0, 0); _S.set(1, 1, 1);
    sp.applyMatrix4(_M.compose(_P, _Q, _S));
    parts.push(sp);
  }
  const cgeo = mergeGeoms(parts);
  // vertex colors: near-black blighted base, sickly crimson at the barb
  // TIPS (highest-from-core points read as the glowing stinger points)
  const pos = cgeo.attributes.position, col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0x140a12), barb = new THREE.Color(0x6e0c1e);
  for (let i = 0; i < pos.count; i++) {
    const dy = pos.getY(i) - 5.0;
    const rad = Math.hypot(pos.getX(i), dy, pos.getZ(i));
    const tip = Math.max(0, Math.min(1, (rad - 1.0) / 1.6));   // far from core = barb tip
    const c = base.clone().lerp(barb, tip * tip);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  cgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  _corruptMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
    emissive: 0x5a0a18, emissiveIntensity: 0.5, flatShading: true });
  // WRITHE: a wrong, twitchy quiver — higher freq, small amp, per-instance
  // phase, scaled hard toward the barbs so the stingers shiver.
  _corruptMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float cw = clamp((position.y - 3.5) / 2.5, 0.0, 1.0);
       float cph = instanceMatrix[3][0]*0.5 + instanceMatrix[3][2]*0.37;
       float tw = sin(uTime*3.1 + cph) + 0.5*sin(uTime*7.3 + cph*2.1);
       transformed.x += tw * cw * 0.13;
       transformed.z += cos(uTime*2.6 + cph*1.4) * cw * 0.11;
       transformed.y += sin(uTime*1.7 + cph) * cw * 0.05;`);
  };

  const N_CORRUPT = IS_TOUCH ? 12 : 18;
  const inst = new THREE.InstancedMesh(cgeo, _corruptMat, N_CORRUPT);
  inst.castShadow = true;
  let placed = 0, guard = 0;
  while (placed < N_CORRUPT && guard++ < N_CORRUPT * 60) {
    const x = (Math.random() - 0.5) * WORLD * 0.9,
          z = (Math.random() - 0.5) * WORLD * 0.9,
          y = heightAt(x, z);
    if (y < WATER_Y + 1.5 || y > 22) continue;
    if (Math.hypot(x, z) < 55) continue;          // never near the wake clearing
    _P.set(x, y - 0.1, z);
    _E.set(0, Math.random() * Math.PI * 2, 0); _Q.setFromEuler(_E);
    const sc = 1.0 + Math.random() * 0.8; _S.set(sc, sc, sc);
    inst.setMatrixAt(placed++, _M.compose(_P, _Q, _S));
    CORRUPT.push({ x, z });
    TREES.push({ x, z, r: 1.0 * sc });            // the trunk is solid
  }
  inst.count = placed;
  scene.add(inst);
}
let _stingThudT = 0, _stingSayT = 0;
function corruptionUpdate(dt, t) {
  if (_corruptMat) _corruptMat.emissiveIntensity = 0.42 + 0.28 * Math.sin(t * 2.2);  // sick pulse
  if (!started || dead) return;
  let near = 1e9;
  for (const c of CORRUPT) {
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < near) near = d;
  }
  _stingThudT -= dt; _stingSayT -= dt;
  if (near < STING_R) {
    player.hp -= dt * 13; renderHP();             // it drinks from you
    document.getElementById('hurt').style.opacity = String(0.3 + 0.3 * Math.sin(t * 9));
    if (_stingThudT <= 0) { _stingThudT = 0.5; if (audio.thud) audio.thud(); }
    if (_stingSayT <= 0) { _stingSayT = 6; say('corrupt'); }
    if (player.hp <= 0 && !dead) { dead = true; say('death', 4200);
      setTimeout(() => { player.hp = 100; player.x = SPAWN.x; player.z = SPAWN.z;
        player.y = heightAt(SPAWN.x, SPAWN.z); dead = false; renderHP(); beginIntro(); }, 3500); }
  } else if (_stingThudT < 0.4) {
    document.getElementById('hurt').style.opacity = '0';
  }
}

// drifting clouds
const clouds = [];
{
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0xf0dcc2, transparent: true, opacity: 0.88 });
  window._cloudMat = mat;
  for (let i = 0; i < 10; i++) {
    const grp = new THREE.Group();
    const puffs = 6 + (Math.random() * 4 | 0);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(geo, mat);
      // flat-bottomed cumulus: puffs sit ON a base line, squashed
      const s = 6 + Math.random() * 11;
      m.position.set((Math.random() - 0.5) * 40, s * 0.28 + Math.random() * 3,
                     (Math.random() - 0.5) * 16);
      m.scale.set(s, s * 0.55, s * 0.8);
      grp.add(m);
    }
    grp.position.set((Math.random() - 0.5) * 1400, 110 + Math.random() * 70, (Math.random() - 0.5) * 1400);
    grp.userData.v = 0.8 + Math.random() * 1.2;
    scene.add(grp);
    clouds.push(grp);
  }
}

// ───────────────────────── landmarks (the discovery loop) ─────────────────
// Terrain noise is deterministic, so these are hand-placed on known
// terrain. Each landmark = a built scene group + a journal entry that
// fires once (persisted in localStorage) with a music stinger.

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 1 });

// ── reverence kit: shared camp materials, fire + tent builders ────────────
// Frontier camps repeat across the map. Geometry/materials are built ONCE
// here and reused by every camp's build() — no per-camp allocation beyond
// the handful of meshes each scene needs. Fire flicker is driven entirely
// by the existing per-frame landmarkUpdate() (no extra rAF cost).
const ashMat   = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 1 });
const charMat  = new THREE.MeshStandardMaterial({ color: 0x16120e, roughness: 1 });
const logMat   = new THREE.MeshStandardMaterial({ color: 0x5d452c, roughness: 1 });
const boneMat  = new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.9 });
const ringStoneGeo = new THREE.DodecahedronGeometry(0.42, 0);
const flameGeoA = new THREE.ConeGeometry(0.55, 1.4, 7);
const flameGeoB = new THREE.ConeGeometry(0.34, 1.0, 6);
const flameGeoC = new THREE.ConeGeometry(0.18, 0.6, 5);
const emberGeo  = new THREE.IcosahedronGeometry(0.07, 0);
const logGeo    = new THREE.CylinderGeometry(0.28, 0.28, 2.4, 6);

// A ring of fire-stones (always), then — if lit — a layered flickering
// flame, a bed of glowing embers, and a warm flickering PointLight. Cold
// camps get charred logs + grey ash instead. Returns nothing; stashes the
// animatable bits on g.userData.fire for landmarkUpdate to drive.
function buildFire(g, cx, cz, lit) {
  // ring of hand-set stones
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + (cx * 0.3 + cz * 0.7);
    const s = new THREE.Mesh(ringStoneGeo, stoneMat);
    const rr = 1.05 + ((i * 13) % 3) * 0.06;
    s.position.set(cx + Math.cos(a) * rr, 0.18, cz + Math.sin(a) * rr);
    s.rotation.set(i * 0.7, a, i * 0.4);
    s.scale.setScalar(0.7 + ((i * 7) % 4) * 0.12);
    g.add(s);
  }
  // two charred logs crossing the pit
  for (let i = 0; i < 2; i++) {
    const lg = new THREE.Mesh(logGeo, lit ? logMat : charMat);
    lg.rotation.set(0, i * 1.1 - 0.5, Math.PI / 2);
    lg.position.set(cx, 0.22, cz);
    lg.scale.set(0.8, 0.7, 0.8);
    g.add(lg);
  }
  if (!lit) {
    // cold camp: a low mound of grey ash, long dead
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), ashMat);
    ash.rotation.x = -Math.PI / 2; ash.position.set(cx, 0.13, cz); g.add(ash);
    return;
  }
  // three nested flame cones at descending scale — layered flicker
  const flame = new THREE.Group(); flame.position.set(cx, 0.5, cz);
  const matA = new THREE.MeshStandardMaterial({ color: 0xff7a1e, emissive: 0xff5a10, emissiveIntensity: 2.4 });
  const matB = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a1e, emissiveIntensity: 2.8 });
  const matC = new THREE.MeshStandardMaterial({ color: 0xffe39a, emissive: 0xffd070, emissiveIntensity: 3.4 });
  const fa = new THREE.Mesh(flameGeoA, matA); fa.position.y = 0.7;
  const fb = new THREE.Mesh(flameGeoB, matB); fb.position.y = 0.55;
  const fc = new THREE.Mesh(flameGeoC, matC); fc.position.y = 0.4;
  flame.add(fa, fb, fc); g.add(flame);
  // a few glowing embers floating low over the pit
  const embers = [];
  const emberMat = new THREE.MeshStandardMaterial({ color: 0xff8a2e, emissive: 0xff6a1e, emissiveIntensity: 3 });
  for (let i = 0; i < 5; i++) {
    const e = new THREE.Mesh(emberGeo, emberMat);
    const a = i * 1.7;
    e.position.set(cx + Math.cos(a) * 0.3, 0.45 + (i % 3) * 0.12, cz + Math.sin(a) * 0.3);
    e.userData.ph = a; g.add(e); embers.push(e);
  }
  const light = new THREE.PointLight(0xff9242, 14, 26, 1.8);
  light.position.set(cx, 1.5, cz); g.add(light);
  g.userData.fire = { flame, fa, fb, fc, embers, light, cx, cz };
}

// A spit-and-rack over the fire: two forked stakes + a crossbar.
function buildSpit(g, cx, cz) {
  const stakeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.5, 5);
  for (const dx of [-1, 1]) {
    const st = new THREE.Mesh(stakeGeo, logMat);
    st.position.set(cx + dx * 0.9, 0.7, cz); st.rotation.z = dx * 0.12; g.add(st);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 5), logMat);
  bar.rotation.z = Math.PI / 2; bar.position.set(cx, 1.35, cz); g.add(bar);
}

// One tent. opts: { color, h, lean, collapsed, leanTo, x, z, rot }
// A-frame cone by default; collapsed → flattened & tilted; leanTo → a
// single sloped panel propped on a pole.
function buildTent(g, opts) {
  const { color, x = 0, z = 0, rot = 0 } = opts;
  // cloth fabric — billows in the wind (segmented so the ripple shows)
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  if (!opts.collapsed) mat.onBeforeCompile = clothWind(0.05);
  if (opts.leanTo) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6, 8, 6), mat);
    panel.position.set(x, 1.1, z); panel.rotation.set(-0.9, rot, 0);
    panel.castShadow = true; g.add(panel);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 5), logMat);
    pole.position.set(x - Math.sin(rot) * 1.4, 1.0, z - Math.cos(rot) * 1.4);
    pole.rotation.z = 0.15; g.add(pole);
    return;
  }
  const tent = new THREE.Mesh(new THREE.ConeGeometry(opts.r || 2.4, opts.h || 2.8, 5, 6), mat);
  tent.position.set(x, (opts.h || 2.8) / 2 - 0.4, z);
  tent.rotation.y = rot; tent.castShadow = true;
  if (opts.collapsed) {       // a tent the land pushed over
    tent.scale.set(1.1, 0.45, 1.1);
    tent.rotation.z = 0.7; tent.rotation.x = 0.25;
    tent.position.y = 0.7;
  }
  g.add(tent);
}

const LANDMARKS = [
  {
    id: 'circle', name: 'The Standing Stones', x: -250, z: 180, r: 16,
    journal: 'Seven stones, set on purpose. Nothing good stacks stones out here.',
    build(g, y) {
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const h = 3.2 + ((i * 37) % 5) * 0.4;
        const s = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 0.8), stoneMat);
        s.position.set(Math.cos(a) * 7, h / 2 - 0.3, Math.sin(a) * 7);
        s.rotation.y = a + 0.3; s.rotation.z = (((i * 13) % 7) - 3) * 0.02;
        s.castShadow = true; g.add(s);
      }
    },
  },
  {
    id: 'tree', name: 'The Considerable Tree', x: 280, z: 250, r: 18,
    journal: 'Older than it has any right to be. Nothing should be that old.',
    build(g) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 16, 8),
        new THREE.MeshStandardMaterial({ color: 0x4f3a22, roughness: 1 }));
      trunk.position.y = 8; trunk.castShadow = true; g.add(trunk);
      const leaf = new THREE.MeshStandardMaterial({ color: 0x4d7028, roughness: 1,
        emissive: 0x1d3008, emissiveIntensity: 0.7 });
      [[0, 18, 0, 7.5], [4.5, 15.5, 2, 4.5], [-4.5, 16, -1.5, 4.8], [1, 14.5, -4.5, 4]]
        .forEach(([x, y, z, r]) => {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaf);
          b.position.set(x, y, z); b.castShadow = true; g.add(b);
        });
    },
  },
  {
    id: 'spring', name: 'The Generous Spring', x: 60, z: -228, r: 14,
    journal: 'Clean water, free. Everything else here has a price.',
    build(g) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(4.2, 0), stoneMat);
      rock.position.y = 2.4; rock.scale.y = 1.5; rock.castShadow = true; g.add(rock);
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5.2, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0xbfe8f2, transparent: true,
          opacity: 0.65, emissive: 0x9adceb, emissiveIntensity: 0.35,
          side: THREE.DoubleSide, depthWrite: false }));
      fall.position.set(0, 3.4, 4.05); g.add(fall);
      g.userData.fall = fall;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.6, 18),
        new THREE.MeshStandardMaterial({ color: 0x59aebe, transparent: true,
          opacity: 0.8, roughness: 0.2 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.32, 5.6); g.add(pool);
    },
  },
  {
    // CAMP 1 — neat, lived-in, fire still burning. A trapper keeping order.
    id: 'camp_trapper', name: 'The Trapper’s Rest', x: -180, z: -160, r: 13,
    journal: 'Kept this place like it mattered. They never came back.',
    build(g) {
      buildTent(g, { color: 0x9c5e2c, x: -3.2, z: 0.4, rot: 0.5, h: 3.0, r: 2.4 });
      // a tidy stack of split firewood
      for (let i = 0; i < 4; i++) {
        const lg = new THREE.Mesh(logGeo, logMat);
        lg.rotation.z = Math.PI / 2; lg.position.set(-3.4 + i * 0.16, 0.3 + (i % 2) * 0.34, 2.6);
        lg.scale.set(0.5, 0.6, 0.5); g.add(lg);
      }
      // a sitting log by the fire
      const seat = new THREE.Mesh(logGeo, logMat);
      seat.rotation.z = Math.PI / 2; seat.position.set(2.4, 0.32, 1.5); g.add(seat);
      buildFire(g, 1.2, -0.4, true);
      buildSpit(g, 1.2, -0.4);
    },
  },
  {
    // CAMP 2 — ruffled, half-collapsed tent, fire guttering low.
    id: 'camp_ruffled', name: 'Where the Snow Caught Them', x: 200, z: -240, r: 13,
    journal: 'Tent half down. They left fast, or not by choice.',
    build(g) {
      buildTent(g, { color: 0x7d6a52, x: -2.8, z: 0.2, rot: 0.9, h: 2.8, r: 2.5, collapsed: true });
      // scattered gear: a tipped log and a dropped bone
      const lg = new THREE.Mesh(logGeo, logMat);
      lg.rotation.set(0.4, 0.6, Math.PI / 2 + 0.3); lg.position.set(2.6, 0.3, 2.2);
      lg.scale.set(0.7, 0.6, 0.7); g.add(lg);
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 5, 9, Math.PI), boneMat);
      rib.position.set(-1.5, 0.1, 2.8); rib.rotation.x = -1.3; g.add(rib);
      buildFire(g, 0.8, -0.6, true);
    },
  },
  {
    // CAMP 3 — long abandoned. Tent gone. Cold stone ring + bones.
    id: 'camp_cold', name: 'The Long-Cold Ring', x: -300, z: 120, r: 13,
    journal: 'Old fire ring. Clean bones. Long time gone.',
    build(g) {
      buildFire(g, 0, 0, false);
      // a small scatter of weathered bones around the cold ring
      const place = [[1.8, 0.6, -0.4], [-1.4, 0.8, 0.2], [0.4, -1.7, 1.1]];
      for (let i = 0; i < place.length; i++) {
        const [bx, bz, rr] = place[i];
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 5), boneMat);
        b.position.set(bx, 0.1, bz); b.rotation.set(Math.PI / 2, 0, rr); g.add(b);
      }
      // a skull-ish dome half in the dirt
      const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), boneMat);
      skull.position.set(2.2, 0.16, 1.4); skull.scale.set(1, 0.7, 1.2); g.add(skull);
    },
  },
  {
    // CAMP 4 — a lean-to, fire lit, a spit. A hunter still working a kill.
    id: 'camp_leanto', name: 'The Skinner’s Lean-To', x: 120, z: -100, r: 13,
    journal: 'Working camp. The fire is warm. Step light.',
    build(g) {
      buildTent(g, { color: 0x6f4a2a, x: -2.6, z: 0, rot: 0.4, leanTo: true });
      buildFire(g, 1.0, 0.2, true);
      buildSpit(g, 1.0, 0.2);
      // a drying rack: two stakes + crossbar with a hanging strip
      const stakeGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5);
      for (const dx of [-1, 1]) {
        const st = new THREE.Mesh(stakeGeo, logMat);
        st.position.set(-3.4 + dx * 0.9, 0.75, 2.4); g.add(st);
      }
      const rackBar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 5), logMat);
      rackBar.rotation.z = Math.PI / 2; rackBar.position.set(-3.4, 1.5, 2.4); g.add(rackBar);
      const hide = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 1, side: THREE.DoubleSide }));
      hide.position.set(-3.4, 1.0, 2.4); g.add(hide);
    },
  },
  {
    // LORE PROP — antlers mounted on a stake, a marker / a boast / a grave.
    id: 'antlers', name: 'The Antler Stake', x: 90, z: 300, r: 11,
    journal: 'Antlers on a stake, facing out. A boast or a grave.',
    build(g) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.4, 6), logMat);
      stake.position.y = 1.2; stake.castShadow = true; g.add(stake);
      // a forked antler crown
      for (const dx of [-1, 1]) {
        for (let j = 0; j < 3; j++) {
          const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6 + j * 0.18, 5), boneMat);
          tine.position.set(dx * (0.15 + j * 0.12), 2.3 + j * 0.18, 0);
          tine.rotation.z = dx * (0.5 + j * 0.18); g.add(tine);
        }
      }
    },
  },
  {
    // LORE PROP — a cairn with a carved name-stone. A child's grave or claim.
    id: 'namestone', name: 'A Name in the Rock', x: -120, z: 280, r: 11,
    journal: 'Stones and half a name. Somebody got carried up here.',
    build(g) {
      let y = 0;
      for (let i = 0; i < 4; i++) {
        const rr = 1.1 - i * 0.2;
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), stoneMat);
        s.position.set(((i * 17) % 5 - 2) * 0.06, y + rr * 0.55, ((i * 31) % 5 - 2) * 0.06);
        s.scale.y = 0.6; s.castShadow = true; g.add(s); y += rr * 0.7;
      }
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.16), stoneMat);
      slab.position.set(0, 0.55, 1.0); slab.rotation.x = -0.18; slab.castShadow = true; g.add(slab);
    },
  },
  {
    // LORE PROP — a child's carved wooden toy left on a rock. The smallest grief.
    id: 'toy', name: 'The Carved Toy', x: 260, z: -60, r: 10,
    journal: 'A carved animal, worn smooth by a small hand.',
    build(g) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), stoneMat);
      rock.position.y = 0.4; rock.scale.y = 0.7; g.add(rock);
      // a tiny carved quadruped: body + 4 stub legs + a head
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.14), woodMat);
      body.position.set(0, 0.78, 0); body.rotation.y = 0.4; g.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), woodMat);
      head.position.set(0.16, 0.86, 0.05); head.rotation.y = 0.4; g.add(head);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), woodMat);
        leg.position.set(sx * 0.1, 0.68, sz * 0.04); g.add(leg);
      }
    },
  },
  {
    id: 'cairn', name: 'The Summit Cairn', x: 220, z: 220, r: 14,
    journal: 'Stones stacked where nothing grows. He climbed up here to die.',
    build(g) {
      let y = 0;
      for (let i = 0; i < 6; i++) {
        const r = 1.5 - i * 0.2;
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stoneMat);
        s.position.set(((i * 17) % 5 - 2) * 0.08, y + r * 0.6, ((i * 31) % 5 - 2) * 0.08);
        s.scale.y = 0.62; s.castShadow = true; g.add(s);
        y += r * 0.78;
      }
    },
  },
  {
    id: 'monolith', name: 'The Door That Isn’t', x: -290, z: -290, r: 12,
    journal: 'A black door to nowhere. It hums. I stopped knocking.',
    build(g) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 9.5, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.35,
          metalness: 0.4 }));
      slab.position.y = 4.75; slab.castShadow = true; g.add(slab);
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 8.6),
        new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x6fd8ff,
          emissiveIntensity: 2.4 }));
      seam.position.set(0, 4.6, 0.41); g.add(seam);
      const hum = new THREE.PointLight(0x7fd8ef, 3.5, 14, 2);
      hum.position.set(0, 4.5, 1.2); g.add(hum);
      g.userData.seam = seam;
    },
  },
  {
    id: 'grotto', name: 'The Glowing Grotto', x: 150, z: 90, r: 13,
    journal: 'Mushrooms that make their own light. I leave them be.',
    build(g) {
      const stemM = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 1 });
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2, r = 1.5 + ((i * 23) % 4);
        const h = 0.5 + ((i * 7) % 3) * 0.35;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 5), stemM);
        const capM = new THREE.MeshStandardMaterial({ color: 0x7fe7d2,
          emissive: 0x36e0b8, emissiveIntensity: 1.6 });
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.4, 7), capM);
        stem.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
        cap.position.set(Math.cos(a) * r, h + 0.18, Math.sin(a) * r);
        g.add(stem, cap);
      }
      const glow = new THREE.PointLight(0x46e6c0, 6, 16, 2);
      glow.position.y = 1.2; g.add(glow);
    },
  },
];

// localStorage can throw in private browsing (iOS Safari) — never let
// persistence failures kill the game
let foundSet;
try { foundSet = new Set(JSON.parse(localStorage.getItem('fw_found') || '[]')); }
catch (e) { foundSet = new Set(); }

// The noise field has plenty of below-water terrain, so preferred
// coordinates spiral-walk (deterministically — same result every
// load) to the nearest patch of solid, reasonably flat ground.
function findSpot(px, pz, minY = 3.4) {
  for (let r = 0; r <= 160; r += 14) {
    const steps = r === 0 ? 1 : Math.max(6, Math.round(r / 7));
    for (let s = 0; s < steps; s++) {
      const a = s / steps * Math.PI * 2 + r * 0.7;
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (Math.hypot(x, z) > 380) continue;
      let ok = heightAt(x, z) > minY;
      for (let q = 0; ok && q < 8; q++) {
        const qa = q / 8 * Math.PI * 2;
        if (heightAt(x + Math.cos(qa) * 8, z + Math.sin(qa) * 8) < minY - 0.8) ok = false;
      }
      if (ok) return [x, z];
    }
  }
  return [px, pz];
}

for (const lm of LANDMARKS) {
  const minY = lm.id === 'spring' ? 2.7 : 3.4;
  [lm.x, lm.z] = findSpot(lm.x, lm.z, minY);
  const g = new THREE.Group();
  const y = heightAt(lm.x, lm.z);
  g.position.set(lm.x, y, lm.z);
  lm.build(g, y);
  scene.add(g);
  lm.group = g;
}
window._landmarks = LANDMARKS;
let lmCheckT = 0;

// ── quivers at the camps ── ammo is scarce; the dead left arrows behind.
// Walk up to a camp's quiver and take what's in it (one-time). 3/5/7.
const QUIVERS = []; window._quivers = QUIVERS;
function buildQuiver(n) {
  const g = new THREE.Group();
  const pouch = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.8, 7),
    new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 1 }));
  pouch.position.y = 0.4; pouch.rotation.z = 0.32; g.add(pouch);
  const FLET = [0xff5a7a, 0x6ad0ff, 0xfff0a8];
  for (let i = 0; i < Math.min(5, Math.max(3, n)); i++) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4),
      new THREE.MeshStandardMaterial({ color: 0x9a886a, roughness: 0.8 }));
    shaft.position.set((i - 2) * 0.04 + 0.18, 0.78, (i % 2) * 0.05);
    shaft.rotation.z = 0.32 + (i - 2) * 0.04; g.add(shaft);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4),
      new THREE.MeshStandardMaterial({ color: FLET[i % 3], roughness: 0.6,
        emissive: FLET[i % 3], emissiveIntensity: 0.25 }));
    fl.position.set((i - 2) * 0.04 + 0.32, 1.16, (i % 2) * 0.05); fl.rotation.z = 0.32; g.add(fl);
  }
  return g;
}
{
  const CAMP_QUIVERS = { camp_trapper: 7, camp_ruffled: 5, camp_cold: 3, camp_leanto: 5 };
  for (const lm of LANDMARKS) {
    const n = CAMP_QUIVERS[lm.id]; if (!n) continue;
    const qx = lm.x + 1.8, qz = lm.z + 1.4;
    const gy = heightAt(qx, qz);
    const mesh = buildQuiver(n); mesh.position.set(qx, gy, qz);
    scene.add(mesh);
    QUIVERS.push({ x: qx, z: qz, n, taken: false, mesh });
  }
}

// ── scattered wild fires ── the only honest light once it's truly dark.
// A bush that caught, a tree the lightning split and lit. They pool warm
// light across the black map — beautiful to navigate by, and the
// predators won't follow you into the ring of one. Near-invisible by day
// (a thread of smoke-glow), full and flickering at night.
const NIGHTFIRES = [];
function buildWildfire(x, z, kind) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  g.position.set(x, y, z);
  if (kind === 'tree') {
    // a charred, split trunk — the lightning's leftover
    const h = 7 + Math.random() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, h, 6), charMat);
    trunk.position.y = h / 2; trunk.rotation.z = (Math.random() - 0.5) * 0.5;
    g.add(trunk);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 2.4, 5), charMat);
    stub.position.set(0.5, h * 0.62, 0); stub.rotation.z = 1.1; g.add(stub);
  } else {
    // a low shrub gone to flame — a charred clump of cones
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.4, 0), charMat);
      c.position.set((Math.random() - 0.5) * 1.4, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 1.4);
      c.scale.y = 1.3; g.add(c);
    }
  }
  buildFire(g, 0, 0, true);
  const f = g.userData.fire;
  if (kind === 'tree') {            // flames climb the trunk
    f.flame.scale.set(1.5, 3.2, 1.5);
    f.flame.position.y = 1.4;
    f.light.position.y = 3.0; f.light.distance = 34;
  } else { f.flame.scale.set(1.3, 1.5, 1.3); f.light.distance = 24; }
  f.kind = kind;
  scene.add(g);
  NIGHTFIRES.push({ x, z, group: g, fire: f });
}
// (placement runs once near boot, AFTER SPAWN/CAMP constants exist —
//  see placeWildfires() below)
function placeWildfires(spawnX, spawnZ, campX, campZ) {
  const N = IS_TOUCH ? 4 : 7;       // keep the phone's light count sane
  let placed = 0, tries = 0;
  while (placed < N && tries++ < 200) {
    const x = (Math.random() - 0.5) * WORLD * 0.78;
    const z = (Math.random() - 0.5) * WORLD * 0.78;
    if (heightAt(x, z) < WATER_Y + 1.2) continue;            // not in the lake
    if (Math.hypot(x - spawnX, z - spawnZ) < 70) continue;   // not on your face
    if (Math.hypot(x - campX, z - campZ) < 40) continue;     // base has its own
    let clear = true;
    for (const nf of NIGHTFIRES)
      if (Math.hypot(x - nf.x, z - nf.z) < 120) { clear = false; break; }
    if (!clear) continue;
    buildWildfire(x, z, Math.random() < 0.5 ? 'tree' : 'bush');
    placed++;
  }
  window._nightfires = NIGHTFIRES;
}

// ── his BASE ── the clearing he wakes in, made into a home: a campfire
// at the center, a ring of set stones around the flower bed, and a cove
// in a low stone wall where he caches meat — deer skeletons, hung hides,
// a small fire. Safe from animals, peaceful music. Returned to often.
let BASE_FIRE = null;        // {cx,cz} the central campfire (warmth pulse)
let COVE = null;             // {x,z} the storage cove — walk in to stash meat
let BASE_RING = null;        // {x,z,r} the wall ring — animals stay out
const BASE_FIRES = [];       // fire handles to flicker each frame
const bigStoneGeo = new THREE.DodecahedronGeometry(1, 0);
function buildBase(bx, bz) {
  const g = new THREE.Group();
  const baseY = heightAt(bx, bz);
  g.position.set(bx, baseY, bz);

  const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cf, roughness: 0.9 });
  const cdir = Math.PI * 0.5;                 // the cove's bearing (its gap in the wall)

  // ── the wall ── a real ring of boulders you must JUMP to clear, set
  // shoulder-high. Solid (no walking through) and tall enough that
  // animals can't get in — but a hop puts you up and over. A gap is
  // left where the cove sits.
  const RING = 9.5, WALL_H = 1.6;             // 1.6m ABOVE LOCAL GROUND → blocks a walk, clears a jump
  for (let i = 0; i < 38; i++) {
    const a = i / 38 * Math.PI * 2;            // a COMPLETE ring — you must jump out anywhere
    const rr = RING + Math.sin(i * 2.3) * 0.5;
    const wx = bx + Math.cos(a) * rr, wz = bz + Math.sin(a) * rr;
    const gY = heightAt(wx, wz);               // sit each boulder on its OWN ground
    const sc = 1.3 + (i % 4) * 0.18;
    const s = new THREE.Mesh(bigStoneGeo, stoneMat);
    s.position.set(Math.cos(a) * rr, (gY - baseY) + WALL_H * 0.55, Math.sin(a) * rr);
    s.rotation.set(i * 0.3, a, i * 0.25);
    s.scale.set(sc, WALL_H * 0.9, sc);
    g.add(s);
    // solid + clamber-on-jump: top is 1.6m over its own footing, so a
    // grounded walk is blocked but a jump puts your feet over it
    STEPPROPS.push({ x: wx, z: wz, r: sc * 0.92, top: gY + WALL_H });
  }
  BASE_RING = { x: bx, z: bz, r: RING - 1.2 };   // animals deflected at this radius

  // ── the campfire — OFF to one side so you wake NEXT to it, not in it ──
  const FX = -3.6, FZ = 1.4;
  buildFire(g, FX, FZ, true);
  BASE_FIRE = { cx: bx + FX, cz: bz + FZ, fire: g.userData.fire };
  BASE_FIRES.push(g.userData.fire);
  // make it a real campfire: bigger flames + a teepee of burning wood
  const cf = g.userData.fire;
  cf.flame.scale.set(1.7, 2.0, 1.7); cf.flame.position.y = 0.7;
  cf.light.distance = 30; cf.light.position.y = 2.2;
  for (let i = 0; i < 5; i++) {               // logs stacked into the fire
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 6),
      i % 2 ? logMat : charMat);
    const a = i / 5 * Math.PI * 2;
    lg.position.set(FX + Math.cos(a) * 0.5, 0.7, FZ + Math.sin(a) * 0.5);
    lg.rotation.set(Math.cos(a) * 0.5, a, 0.95);   // leaning teepee
    g.add(lg);
  }
  // a sitting log beside the fire
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.4, 7), logMat);
  log.rotation.z = Math.PI / 2; log.position.set(FX + 2.6, 0.34, FZ + 1.2); log.rotation.y = 0.5; g.add(log);

  // ── the cove: a low arc of big stones with a meat cache ──
  const cx = Math.cos(cdir) * 8.5, cz = Math.sin(cdir) * 8.5;
  COVE = { x: bx + cx, z: bz + cz };
  for (let i = 0; i < 6; i++) {                // the curved back wall
    const a = cdir + (i - 2.5) * 0.36;
    const w = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), stoneMat);
    w.position.set(Math.cos(a) * 10.5, 0.7, Math.sin(a) * 10.5);
    w.scale.set(1, 1.5 + (i % 2) * 0.4, 1); w.rotation.y = a; g.add(w);
  }
  // two stakes + a crossbar with hides hung to cure
  const stakeGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.0, 5);
  for (const dx of [-1.3, 1.3]) {
    const st = new THREE.Mesh(stakeGeo, logMat);
    st.position.set(cx + dx, 1.0, cz - 0.4); g.add(st);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 5), logMat);
  bar.rotation.z = Math.PI / 2; bar.position.set(cx, 1.85, cz - 0.4); g.add(bar);
  const hideMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1, side: THREE.DoubleSide });
  hideMat.onBeforeCompile = clothWind(0.045);          // hung hides flutter in the wind
  for (const [hx, hw] of [[-0.9, 1.0], [0.5, 1.2]]) {
    const hide = new THREE.Mesh(new THREE.PlaneGeometry(hw, 1.3, 6, 6), hideMat);
    hide.position.set(cx + hx, 1.15, cz - 0.4); hide.rotation.y = 0.1; g.add(hide);
  }
  // a small cache fire inside the cove
  buildFire(g, cx, cz + 0.6, true);
  g.userData.fire.light.distance = 16;
  BASE_FIRES.push(g.userData.fire);
  // deer skeletons — a skull with antler lines + a few ribs on the ground
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), boneMat);
  skull.scale.set(1, 0.8, 1.3); skull.position.set(cx - 1.6, 0.28, cz + 1.2); g.add(skull);
  for (const sgn of [-1, 1]) {                 // antlers as thin bone forks
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 4), boneMat);
    ant.position.set(cx - 1.6 + sgn * 0.12, 0.6, cz + 1.2);
    ant.rotation.z = sgn * 0.5; g.add(ant);
  }
  for (let i = 0; i < 5; i++) {                 // ribs
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 4, 8, Math.PI), boneMat);
    rib.position.set(cx - 0.8 + i * 0.22, 0.12, cz + 1.4);
    rib.rotation.set(Math.PI / 2, 0, 0.2); g.add(rib);
  }

  scene.add(g);
  window._base = { group: g, COVE, BASE_FIRE };
}

// nearest wild fire to the player, and whether you're inside its safe ring
let nearWildFire = false, nearWildFireD = 1e9, _fireStare = 0, _revealStep = 0;
function updateWildfires(t, night) {
  const fl1 = Math.sin(t * 11), fl2 = Math.sin(t * 23), fl3 = Math.sin(t * 31);
  // they bank to embers in daylight, roar back up after dark
  const lvl = Math.max(0.05, night);
  nearWildFireD = 1e9;
  for (const nf of NIGHTFIRES) {
    const f = nf.fire;
    f.light.intensity = (3 + fl1 * 3 + fl2 * 2 + fl3 * 1.2) * lvl;
    f.flame.visible = night > 0.08;
    if (f.flame.visible) {
      f.flame.rotation.z = fl2 * 0.07 + fl3 * 0.04;
      f.fa.scale.y = (1 + fl1 * 0.18); f.fb.scale.y = (1 + fl2 * 0.22);
      f.fc.scale.y = (1 + fl3 * 0.3);
      for (let i = 0; i < f.embers.length; i++) {
        const e = f.embers[i];
        e.material.emissiveIntensity = (2.5 + Math.sin(t * 7 + e.userData.ph) * 1.2) * lvl;
      }
    }
    const d = Math.hypot(player.x - nf.x, player.z - nf.z);
    if (d < nearWildFireD) nearWildFireD = d;
  }
  nearWildFire = nearWildFireD < 11 && night > 0.2;   // inside the ring, after dark

  // the base fires burn full, always — home doesn't go to embers
  for (const f of BASE_FIRES) {
    f.light.intensity = 12 + fl1 * 3 + fl2 * 2 + fl3 * 1.2;
    f.flame.rotation.z = fl2 * 0.07 + fl3 * 0.04;
    f.fa.scale.y = 1 + fl1 * 0.18; f.fb.scale.y = 1 + fl2 * 0.22; f.fc.scale.y = 1 + fl3 * 0.3;
    for (let i = 0; i < f.embers.length; i++) {
      const e = f.embers[i];
      e.position.y = 0.63 + Math.sin(t * 2.3 + e.userData.ph) * 0.18 + (i % 3) * 0.06;
      e.material.emissiveIntensity = 2.5 + Math.sin(t * 7 + e.userData.ph) * 1.2;
    }
  }

  // ── stare into the campfire and it answers ── hold your gaze on it and
  // the flames warm up: brighter, more yellow, the light swells. Look
  // away and it settles back. A small, alive thing to find.
  if (BASE_FIRE) {
    const dx = BASE_FIRE.cx - player.x, dz = BASE_FIRE.cz - player.z;
    const d = Math.hypot(dx, dz) || 1;
    const look = (Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz) / d;
    const staring = d < 13 && look > 0.86 && player.pitch < 0.2;
    _fireStare += ((staring ? 1 : 0) - _fireStare) * Math.min(1, (simDt ?? 0.016) * 1.6);
    const s = _fireStare;
    const cf = BASE_FIRE.fire;
    cf.fa.material.emissiveIntensity = 2.4 + s * 3.2;
    cf.fb.material.emissiveIntensity = 2.8 + s * 3.6;
    cf.fc.material.emissiveIntensity = 3.4 + s * 4.2;
    cf.fc.material.color.setRGB(1, 0.89 + s * 0.11, 0.6 + s * 0.3);   // toward white-hot yellow
    cf.fb.material.color.setRGB(1, 0.70 + s * 0.18, 0.28 + s * 0.22);
    cf.light.intensity += s * 10;
    cf.light.color.setRGB(1, 0.57 + s * 0.18, 0.26 + s * 0.12);
  }
}

function showJournal(lm, ix) {
  const el = document.getElementById('journal');
  document.getElementById('jr-kicker').textContent = 'THE WOODS KEEP SCORE';
  document.getElementById('jr-name').textContent = lm.name;
  document.getElementById('jr-body').textContent = lm.journal;
  el.style.opacity = 1; el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(showJournal._t);
  showJournal._t = setTimeout(() => {
    el.style.opacity = 0; el.style.transform = 'translateX(-50%) translateY(30px)';
  }, 7000);
}

function landmarkUpdate(dt, t) {
  // ambient animation: campfire flicker, waterfall shimmer
  // cheap shared flicker terms, computed once per frame for all camps
  const fl1 = Math.sin(t * 11), fl2 = Math.sin(t * 23), fl3 = Math.sin(t * 31);
  for (const lm of LANDMARKS) {
    const u = lm.group.userData;
    if (u.fireLight) u.fireLight.intensity = 11 + fl1 * 2.5 + fl2 * 1.5;
    if (u.seam) u.seam.material.emissiveIntensity = 2 + Math.sin(t * 0.9) * 0.9;
    if (u.flame) u.flame.scale.y = 1 + Math.sin(t * 13) * 0.15;
    if (u.fall) u.fall.material.opacity = 0.55 + Math.sin(t * 6) * 0.12;
    if (u.fire) {
      const f = u.fire;
      // light flickers warm; each flame layer breathes on a different beat;
      // the whole flame sways like wind catches it; embers bob + glow.
      f.light.intensity = 12 + fl1 * 3 + fl2 * 2 + fl3 * 1.2;
      f.flame.rotation.z = fl2 * 0.07 + fl3 * 0.04;
      f.fa.scale.y = 1 + fl1 * 0.18;
      f.fb.scale.y = 1 + fl2 * 0.22;
      f.fc.scale.y = 1 + fl3 * 0.3;
      f.fc.scale.x = 1 + fl1 * 0.1;
      for (let i = 0; i < f.embers.length; i++) {
        const e = f.embers[i];
        e.position.y = 0.45 + 0.18 + Math.sin(t * 2.3 + e.userData.ph) * 0.18 + (i % 3) * 0.06;
        e.material.emissiveIntensity = 2.5 + Math.sin(t * 7 + e.userData.ph) * 1.2;
      }
    }
  }
  lmCheckT -= dt;
  if (lmCheckT > 0) return;
  lmCheckT = 0.25;
  let nearest = null, nearestD = 1e9;
  for (const lm of LANDMARKS) {
    const d = Math.hypot(player.x - lm.x, player.z - lm.z);
    if (!foundSet.has(lm.id)) {
      if (d < nearestD) { nearestD = d; nearest = lm; }
      if (d < lm.r) {
        foundSet.add(lm.id);
        try { localStorage.setItem('fw_found', JSON.stringify([...foundSet])); }
        catch (e) { /* private browsing — discovery just won't persist */ }
        audio.stinger();
        showJournal(lm);
        renderNotes();
        if (foundSet.size === LANDMARKS.length)
          setTimeout(() => toast('EVERY MARK FOUND. You have seen the whole menu. You are on it.', 6000), 7500);
      }
    }
  }
  // audio breadcrumb: a faint chime from the direction of the nearest
  // unfound landmark — follow the music and the horizon pays off
  if (nearest && audio.started && !audio.muted) {
    landmarkUpdate._beaconT = (landmarkUpdate._beaconT || 0) - 0.25;
    if (landmarkUpdate._beaconT <= 0) {
      landmarkUpdate._beaconT = 14 + Math.random() * 10;
      const dx = nearest.x - player.x, dz = nearest.z - player.z;
      const ang = Math.atan2(dx, dz) - player.yaw;        // relative bearing
      const pan = Math.max(-1, Math.min(1, Math.sin(ang)));
      const vol = Math.max(0.05, Math.min(0.3, 60 / nearestD * 0.1));
      audio.beacon(pan, vol);
    }
  }
}

// ───────────────────────── horizon + mist (beauty & mystery) ──────────────
// A vast fog-colored ground sheet beyond the playfield: every below-
// horizon sightline ends in fogged geometry — no more void band.
const farDisc = new THREE.Mesh(new THREE.CircleGeometry(2400, 40),
  new THREE.MeshBasicMaterial({ color: 0xd89a55 }));
farDisc.rotation.x = -Math.PI / 2;
farDisc.position.y = WATER_Y - 0.55;
scene.add(farDisc);

// drifting ground mist — soft radial sprites, strongest at dusk/dawn/night
const mists = [];
{
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const cx = cv.getContext('2d');
  const grad = cx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(224,221,212,0.6)');
  grad.addColorStop(1, 'rgba(224,221,212,0)');
  cx.fillStyle = grad; cx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  for (let i = 0; i < 11; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false }));
    sp.scale.set(34 + Math.random() * 26, 7 + Math.random() * 5, 1);
    sp.userData = { a: Math.random() * Math.PI * 2, r: 14 + Math.random() * 60,
                    v: 0.01 + Math.random() * 0.02, ph: Math.random() * 9 };
    scene.add(sp); mists.push(sp);
  }
}
function updateMist(t, night) {
  // mist belongs to the edges of the day — thickest at dusk/dawn, lingers all night
  const edge = Math.min(1, Math.abs(night - 0.5) < 0.45 ? 1 - Math.abs(night - 0.5) / 0.45 : 0)
    * 0.8 + night * 0.34;
  for (const sp of mists) {
    const u = sp.userData;
    u.a += u.v * 0.016;
    const x = player.x + Math.cos(u.a) * u.r, z = player.z + Math.sin(u.a) * u.r;
    const gy = heightAt(x, z);
    // valley bias — mist pools in low ground, thins out on the slopes
    const low = Math.max(0.2, Math.min(1.3, 1.35 - (gy - WATER_Y) / 12));
    sp.position.set(x, gy + 1.6 + Math.sin(t * 0.2 + u.ph) * 0.4, z);
    sp.material.opacity = Math.min(0.5, edge * low * (0.2 + 0.12 * Math.sin(t * 0.13 + u.ph)));
  }
}

// ───────────────────────── fireflies (night) ─────────────────────────
// fewer, brighter — precious points of light in a dark that means it
const FF_N = IS_TOUCH ? 28 : 48;
const ffBase = [];
const fireflies = (() => {
  const pos = new Float32Array(FF_N * 3);
  for (let i = 0; i < FF_N; i++) {
    const ang = Math.random() * Math.PI * 2, r = 6 + Math.random() * 34;
    ffBase.push({ ox: Math.cos(ang) * r, oz: Math.sin(ang) * r,
                  ph: Math.random() * 10, sp: 0.4 + Math.random() * 0.8 });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xdfffa6, size: 0.3, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  scene.add(p);
  return p;
})();

// butterflies — a delight released the FIRST time you walk after waking.
// a small pool of two-winged sprites that flutter up and scatter.
const butterflies = [];
{
  const wingGeo = new THREE.PlaneGeometry(0.34, 0.46);
  for (let i = 0; i < 16; i++) {
    const col = new THREE.Color().setHSL(Math.random(), 0.7, 0.62);
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col,
      emissiveIntensity: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 1 });
    const g = new THREE.Group();
    const wl = new THREE.Mesh(wingGeo, mat); wl.position.x = -0.17;
    const wr = new THREE.Mesh(wingGeo, mat); wr.position.x = 0.17;
    g.add(wl, wr); g.visible = false; g.userData = { wl, wr, mat };
    scene.add(g); butterflies.push(g);
  }
}
let bflyUsed = false, bflyT = 0;
const BFLY_LIFE = 9;                    // total time the ring lives
// A delight you can never quite reach: the butterflies appear as a DISTANT
// ring (8–20m), drift outward, and sink into the ground while fading out —
// gone before you can close on them even at a sprint.
function releaseButterflies() {
  if (bflyUsed) return; bflyUsed = true; bflyT = BFLY_LIFE;
  for (const b of butterflies) {
    const a = Math.random() * 6.283, r = 8 + Math.random() * 12;   // 8–20m ring
    const bx = player.x + Math.cos(a) * r, bz = player.z + Math.sin(a) * r;
    const u = b.userData;
    u.gy = heightAt(bx, bz);             // its ground reference — sinks each frame
    b.position.set(bx, u.gy + 0.6 + Math.random() * 1.8, bz);
    // drift mostly OUTWARD (away from the player), with a little jitter
    u.vx = Math.cos(a) * (0.25 + Math.random() * 0.35) + (Math.random() - 0.5) * 0.2;
    u.vz = Math.sin(a) * (0.25 + Math.random() * 0.35) + (Math.random() - 0.5) * 0.2;
    u.sink = 0.18 + Math.random() * 0.16;   // 0.18–0.34 m/s into the terrain
    u.ph = Math.random() * 6.283;
    u.life = 0;                          // fade IN from 0
    u.mat.opacity = 0; b.visible = true;
  }
}
window._butterflies = releaseButterflies;   // test hook
function updateButterflies(dt, t) {
  if (bflyT <= 0) return;
  bflyT -= dt;
  for (const b of butterflies) {
    if (!b.visible) continue;
    const u = b.userData;
    u.life += dt;
    b.position.x += u.vx * dt; b.position.z += u.vz * dt;
    u.gy -= u.sink * dt;                  // baseline sinks INTO the ground
    b.position.y += (u.gy - b.position.y) * Math.min(1, dt * 2)
      + Math.sin(t * 2.2 + u.ph) * 0.02; // ride the sinking ref + a soft bob
    const fl = Math.sin(t * 17 + u.ph) * 0.95;   // wing flap
    u.wl.rotation.y = fl; u.wr.rotation.y = -fl;
    b.lookAt(player.x, b.position.y, player.z);
    // appear, then fade as the ring's life runs out (unreachable either way)
    const fadeIn = Math.min(1, u.life / 1.2);
    const fadeOut = Math.min(1, bflyT / 2.5);
    u.mat.opacity = fadeIn * fadeOut;
    if (bflyT <= 0) b.visible = false;
  }
}

function updateFireflies(t, night) {
  fireflies.material.opacity = night * 0.95;
  if (night < 0.02) return;
  const pos = fireflies.geometry.attributes.position.array;
  for (let i = 0; i < FF_N; i++) {
    const b = ffBase[i];
    const x = player.x + b.ox + Math.sin(t * b.sp + b.ph) * 2.4;
    const z = player.z + b.oz + Math.cos(t * b.sp * 0.8 + b.ph * 2) * 2.4;
    pos[i * 3] = x;
    pos[i * 3 + 1] = heightAt(x, z) + 0.7 + Math.sin(t * b.sp * 1.7 + b.ph) * 0.5;
    pos[i * 3 + 2] = z;
  }
  fireflies.geometry.attributes.position.needsUpdate = true;
}

// ───────────────────────── animals ─────────────────────────
const animals = [];
window._animals = animals;           // debug hook
window._h = heightAt;
window._player = null;
const loader = new GLTFLoader();
{
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
  loader.setDRACOLoader(draco);
}
const prefabs = {};

function clipOf(prefab, frag) {
  return prefab.animations.find(c => c.name.toLowerCase().includes(frag.toLowerCase()));
}

// some species reuse another's rig (Bear is a scaled, dark-tinted Bull).
const PREFAB_FILE = { Bear: 'Bull' };

async function loadAnimals() {
  const names = Object.keys(SPECIES);
  // load each distinct .glb once, keyed by its filename, then alias
  const files = [...new Set(names.map(n => PREFAB_FILE[n] || n))];
  await Promise.all(files.map(f => new Promise((res, rej) =>
    loader.load(`assets/animals/${f}.glb`, g => { prefabs[f] = g; res(); }, undefined, rej))));
  for (const n of names) prefabs[n] = prefabs[PREFAB_FILE[n] || n];
  for (const n of names) {
    if (n === 'Deer') {                 // deer come in herds, 2–4 to a group
      let left = SPECIES.Deer.n, herd = 0;
      while (left > 0) {
        const size = Math.min(left, 2 + Math.floor(Math.random() * 3));
        const lead = spawn('Deer');
        lead.herdId = ++herd;
        for (let i = 1; i < size; i++) {
          const f = spawn('Deer', lead.obj.position);
          f.herdId = herd; f.herdLeader = lead;
        }
        left -= size;
      }
    } else for (let i = 0; i < SPECIES[n].n; i++) spawn(n);
  }
}

function spawn(name, near) {
  const cfg = SPECIES[name], prefab = prefabs[name];
  const obj = SkeletonUtils.clone(prefab.scene);
  // ── per-individual LOOK ── a herd should read as individuals, not clones.
  // Non-bears get a cloned material with a small HSL hue/brightness drift;
  // bears get a hard dark-brown standard material on the Bull rig.
  const shade = 0.82 + Math.random() * 0.36;            // 0.82–1.18 brightness
  if (cfg.bearish) {
    const bc = new THREE.Color(cfg.tint || 0x3a2616).multiplyScalar(shade);
    const bearMat = new THREE.MeshStandardMaterial({ color: bc, roughness: 0.95, metalness: 0 });
    obj.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = true; o.material = bearMat; }
    });
  } else {
    const hueDrift = (Math.random() - 0.5) * 0.06;       // ±0.03 hue
    obj.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true; o.frustumCulled = true;
        if (o.material && o.material.color) {
          const m = o.material.clone();
          m.color = o.material.color.clone().offsetHSL(hueDrift, 0, 0).multiplyScalar(shade);
          o.material = m;
        }
      }
    });
  }
  let x, z, y, tries = 0;
  do {
    if (near && tries < 40) {           // herd member — settle near the anchor
      x = near.x + (Math.random() - 0.5) * 18;
      z = near.z + (Math.random() - 0.5) * 18;
    } else {
      x = (Math.random() - 0.5) * WORLD * 0.85;
      z = (Math.random() - 0.5) * WORLD * 0.85;
    }
    y = heightAt(x, z);
  } while ((y < WATER_Y + 1 || Math.hypot(x, z) < 45) && tries++ < 60);
  obj.position.set(x, y, z);
  // ── per-individual SIZE ── base scale ±10%, bears 1.8× on top
  const sizeJit = 0.9 + Math.random() * 0.2;            // ±10%
  obj.scale.setScalar((cfg.scale || 1) * sizeJit);
  scene.add(obj);
  const mixer = new THREE.AnimationMixer(obj);
  const acts = {};
  for (const frag of ['Idle', 'Idle_2', 'Eating', 'Walk', 'Gallop', 'Death',
                      'HitReact_Left', 'Attack', 'Attack_Kick']) {
    const clip = clipOf(prefab, frag);
    if (clip) acts[frag] = mixer.clipAction(clip);
  }
  // ── per-individual PERSONALITY (rolled ONCE, stored on the record) ──
  const aggression = Math.max(0, Math.min(1,
    cfg.aggroBias + (Math.random() - 0.5) * 0.5));      // ±0.25 around the bias
  // wide hp band for the tanky ones: horse 8-10, bear 6-8
  let hp = cfg.hp;
  if (cfg.hpJit) hp = (cfg.bearish ? 6 : 8) + Math.round(Math.random() * 2 - 1) + 1;
  const hearJit = 0.85 + Math.random() * 0.30;          // 0.85–1.15
  // per-gait playback tempo: cow plods, horse is quick, bear is heavy — ±5%
  const gaitTs = (cfg.gait === 'sway' ? 0.85 : cfg.gait === 'smooth' ? 1.15
                 : cfg.gait === 'bound' ? 0.9 : 1) * (0.95 + Math.random() * 0.1);
  const a = {
    name, cfg, obj, mixer, acts, cur: null,
    state: 'idle', t: Math.random() * 4, dir: Math.random() * Math.PI * 2,
    hp, dead: false, attackCd: 0,
    aggression, hearJit, gaitTs,
    gaitPhase: Math.random() * Math.PI * 2,             // desyncs sway/bob across a herd
    gaitRoll: 0,                                         // current rotation.z, decays to 0
    sizeJit,
  };
  setAnim(a, Math.random() < 0.5 ? 'Idle' : 'Eating');
  animals.push(a);
  return a;
}

// ── gaits ── pure trig on existing fields, called per animal per frame.
// Sways/rolls the body via rotation.z and a small y-bob, only while moving.
// No allocations. rotation.z eases back toward 0 when idle.
function applyGait(a, moving, dt) {
  const g = a.cfg.gait;
  a.gaitPhase += dt * 7 * (a.gaitTs || 1);
  let targetRoll = 0, bob = 0;
  if (moving) {
    const s = Math.sin(a.gaitPhase);
    if (g === 'sway')        targetRoll = s * 0.13;                 // cow lumbers
    else if (g === 'smooth') targetRoll = s * 0.03;                 // horse is level
    else if (g === 'bound') { targetRoll = s * 0.05; bob = Math.abs(s) * 0.12; } // bear lopes
    else                     targetRoll = s * 0.05;                 // default trot
  }
  // ease roll toward target (snappy while moving, decays out when idle)
  a.gaitRoll += (targetRoll - a.gaitRoll) * Math.min(1, dt * 8);
  a.obj.rotation.z = a.gaitRoll;
  if (g === 'bound') {
    a._baseY = a._baseY ?? a.obj.position.y;
    // bob rides on top of the live ground height (which stepAnimal sets);
    // a stalking bear rides low to the ground — a hunched, hidden crawl
    const crouch = a._stalking ? 0.5 * a.obj.scale.y : 0;
    a.obj.position.y = heightAt(a.obj.position.x, a.obj.position.z) + bob - crouch;
  }
}

function setAnim(a, frag, once = false) {
  const next = a.acts[frag] || a.acts.Idle;
  if (!next || a.cur === next) return;
  next.reset();
  if (once) { next.setLoop(THREE.LoopOnce); next.clampWhenFinished = true; }
  else next.setLoop(THREE.LoopRepeat);
  if (a.cur) { next.crossFadeFrom(a.cur, 0.22, false); }
  next.timeScale = a.limpTs || 1;
  next.play();
  a.cur = next;
}

// ── stealth: what the animal can actually perceive ────────────────
// dB-style hearing. noise01 is a CONTINUOUS 0..1 loudness:
//   still 0 · stalk ≈0.35 (half-stick, or moving while drawn) · walk ≈0.6 · sprint 1.0
// Legacy noiseLevel (0/1/2) is kept in sync for any old reads.
let noiseLevel = 0;
let noise01 = 0;
function setNoise(level, stalking) {
  // level: 0 still / 1 moving / 2 sprinting ; stalking = quiet half-stick or
  // moving-while-drawn. Maps the discrete state to the continuous loudness.
  noiseLevel = level;
  noise01 = level === 0 ? 0 : level === 2 ? 1.0 : (stalking ? 0.35 : 0.6);
}

function losBlocked(a) {
  // cached, throttled — is there a tree/bush between player and animal?
  a._losT = (a._losT ?? 0) - 0.016;
  if (a._losT > 0) return a._losB;
  a._losT = 0.4;
  const ax = a.obj.position.x, az = a.obj.position.z;
  const dx = ax - player.x, dz = az - player.z;
  const len2 = dx * dx + dz * dz;
  a._losB = false;
  if (len2 > 1) {
    for (const list of [TREES, BUSHES]) {
      for (const c of list) {
        const t = ((c.x - player.x) * dx + (c.z - player.z) * dz) / len2;
        if (t < 0.08 || t > 0.92) continue;
        const px = player.x + dx * t, pz = player.z + dz * t;
        if (Math.hypot(c.x - px, c.z - pz) < c.r + 0.55) { a._losB = true; break; }
      }
      if (a._losB) break;
    }
  }
  return a._losB;
}

// the detection dartboard: how far away its ears catch you. Louder you
// are + keener its ears = wider radius. A dull cow lets you in close; a
// fox bolts from across the meadow.
//   spookRadius = flee * (0.4 + noise01 * keen)
// where keen folds the species acuity and this individual's hearJit.
function spookRadius(a, dist) {
  const keen = (a.cfg.keen || 1) * (a.hearJit || 1);
  let r = a.cfg.flee * (0.4 + noise01 * keen);
  if (dist < 60 && losBlocked(a)) r *= 0.42;       // cover buys you closer
  return Math.max(r, noiseLevel === 2 ? 20 : 7);
}
// crowding panic: the TIGHT inner ring — get this close and prey bolts no
// matter how quiet. Kept well inside spookRadius (flee*0.4 when still) so
// the alert "it looks at you" band above it always survives. A touch of
// keen so a fox bolts a hair sooner than a dull cow.
function panicRadius(a) {
  const keen = (a.cfg.keen || 1) * (a.hearJit || 1);
  return a.cfg.flee * 0.30 * (0.9 + (keen - 1) * 0.18);
}

function animalUpdate(a, dt) {
  window._auCalls = (window._auCalls || 0) + 1;
  a.mixer.update(dt);
  if (a.dead) {
    a.t -= dt;
    // a kill is MEAT — walk to the carcass and you eat (or pack it)
    if (!a.eaten && !a.isCryptid) {
      // left to rot 60s+, the smell travels — the nearest calm wolf claims it
      a.rotAge = (a.rotAge || 0) + dt;
      a._scavRetry = (a._scavRetry || 0) - dt;
      if (a.rotAge > 60 && !a.claimed && a._scavRetry <= 0) {
        a._scavRetry = 4;
        let best = null, bd = 1e9;
        for (const o of animals) {
          if (o.name !== 'Wolf' || o.dead || o.aggro || o.scavTarget || o.scavT > 0) continue;
          const ddx = o.obj.position.x - a.obj.position.x,
                ddz = o.obj.position.z - a.obj.position.z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < bd) { bd = d2; best = o; }
        }
        if (best) { best.scavTarget = a; a.claimed = true; a.t = Math.max(a.t, 40); }
      }
      const dd = Math.hypot(player.x - a.obj.position.x, player.z - a.obj.position.z);
      if (dd < 2.4) {
        const firstTake = !a.eaten;
        a.eaten = true; a.t = Math.min(a.t, 9);
        player.lastAte = clock.elapsedTime;
        bloodedUntil = clock.elapsedTime + 90;   // the opening gets on you
        if (firstTake) {
          gutCarcass(a);                          // opened up, blood all around
          if (a._stuck) { player.arrows = Math.min(ARROW_MAX, player.arrows + a._stuck);
            a._stuck = 0; renderNotes(); }        // your arrows come back with the meat
        }
        if (!saidBlooded) {
          saidBlooded = true;
          setTimeout(() => toast('You smell like the inside of something now.', 4600), 4800);
        }
        if (player.hp < 95) {
          player.hp = Math.min(100, player.hp + 40); renderHP();
          say('harvest');
        } else if (player.meat < 3) {
          player.meat++; renderNotes();
          if (player.meat >= 3) say('packFull'); else say('harvest');
          if (player.meat === 3 && !saidFullPack) {
            saidFullPack = true;
            setTimeout(() => toast('Everything downwind knows what you are carrying.', 5200), 3400);
          }
        } else toast('You can carry no more. Whatever follows you gets the rest.');
      }
    }
    if (a.t <= 0) {
      if (a._gore) { for (const g of a._gore) scene.remove(g); a._gore = null; }
      scene.remove(a.obj); animals.splice(animals.indexOf(a), 1); spawn(a.name);
    }
    return;
  }
  const p = a.obj.position;
  const dx = player.x - p.x, dz = player.z - p.z;
  const dist = Math.hypot(dx, dz);

  // kill-feel: a charging bull thundering past inside ~3m rattles the
  // camera. dist>=2.8 = it brushed by; attackCd>0 = inside but jaws shut.
  if (a.cfg.territorial && a.aggro && a.state !== 'warn') {
    a._missCd = (a._missCd || 0) - dt;
    if (a._missCd <= 0 && dist < 3.2 && (dist >= 2.8 || a.attackCd > 0)) {
      a._missCd = 1.5; camShakeT = SHAKE_DUR;
    }
  }

  if (a.cfg.bearish) {                         // ── the bear has its own brain
    bearUpdate(a, dt, dx, dz, dist);
    a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 6));
    applyGait(a, a._moved, dt);
    a._moved = false;
    return;
  } else if (a.cfg.hunts || a.cfg.territorial) {     // ── predator / territorial brain
    a.attackCd -= dt;
    // wolves grow bolder after dark — wider trigger, and they don't come alone
    const night = window._night || 0;
    let trigger = (a.cfg.aggroR || a.cfg.territorial)
      * (a.cfg.hunts && !a.isCryptid && night > 0.4 ? 1.3 : 1);
    if (a.cfg.hunts) trigger += scentM;   // what you carry, carries
    if (fireNear) trigger *= 0.5;         // the fire disagrees
    if (a.aggro && dist > trigger * 2.2) {    // lost you
      a.aggro = false; a.warned = false; a.circleT = 0; a.packBias = 0;
      if (a.state === 'warn' || a.state === 'stare') { a.state = 'idle'; a.t = 1; }
    }
    if (scavUpdate(a, dt, dist)) {
      // the carcass has its attention — you are not interesting yet
    } else if (dist < 2.8) {
      a.state = 'attack'; a.aggro = true;
      if (a.attackCd <= 0) {
        setAnim(a, 'Attack', true); a.attackCd = 1.5;
        hurtPlayer(a.cfg.dmg || 22);
        setTimeout(() => { if (!a.dead) a.cur = null; }, 700);
      }
    } else if (a.aggro || dist < trigger) {
      if (!a.aggro) {                         // first contact — how it opens
        a.aggro = true;
        if (a.cfg.hunts && !a.isCryptid) {
          // it doesn't beeline. It circles first, deciding things about you.
          a.circleT = 2.2 + Math.random() * 2.6;
          a.circleDir = Math.random() < 0.5 ? -1 : 1;
          if (night > 0.4) packCall(a);       // a second wolf answers the hunt
        }
        if (a.cfg.territorial && !a.warned) {
          // ONE warning. The bull squares up and stomps. That's all you get.
          a.warned = true; a.state = 'warn'; a.warnT = 1.15;
          setAnim(a, 'HitReact_Left', true);
          // THUD CUE: warning stomp — front hoof hits dirt (foley hook)
        }
      }
      if (a.state === 'warn') {
        a.warnT -= dt;
        a.dir = Math.atan2(dx, dz);           // it tracks you while it stomps
        if (a.warnT <= 0) {
          if (dist < trigger * 1.6) a.state = 'stalk';  // you stayed. Bad call.
          else { a.aggro = false; a.state = 'idle'; a.t = 0.5; }
        }
      } else if (a.isCryptid && cryptidStare(a, dx, dz, dist, dt)) {
        // frozen mid-field, eyes locked on you. It resumes when IT decides.
      } else {
        a.state = 'stalk';
        // the cryptid circles as it closes — unsettling, hard to hit
        const drift = a.isCryptid ? Math.sin(clock.elapsedTime * 0.9) * 0.55 : 0;
        // wolves run a touch hotter every night you survive (cap +15%)
        const haste = a.name === 'Wolf'
          ? 1 + Math.min(0.15, 0.05 * (window._nights || 0)) : 1;
        if (a.circleT > 0 && dist > 8 && dist < trigger * 1.5) {
          // the circling pass — flank-walk, spiraling slowly inward
          a.circleT -= dt;
          a.dir = Math.atan2(dx, dz) + a.circleDir * 1.25;
          setAnim(a, 'Walk');
          stepAnimal(a, a.cfg.speed * 1.3 * haste, dt);
        } else {
          // committed. Wolves prefer the side you AREN'T looking at —
          // if you can see it coming, it angles for your back instead.
          let ax = dx, az = dz;
          if (a.cfg.hunts && !a.isCryptid && dist > 7 && dist < 36
              && Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz > 0) {
            ax += Math.sin(player.yaw) * 6; az += Math.cos(player.yaw) * 6;
          }
          // pack members hold offset bearings — they arrive from different angles
          a.dir = Math.atan2(ax, az) + drift
            + (a.packBias && dist > 11 ? a.packBias : 0);
          const fast = dist < (a.isCryptid ? 30 : 17);
          setAnim(a, fast ? 'Gallop' : 'Walk');
          stepAnimal(a, (fast ? a.cfg.gallop : a.cfg.speed) * haste, dt);
        }
      }
    } else wander(a, dt);
  } else {                                    // ── prey brain
    if (a.state === 'rear') {
      // cornered + bold: it stands and strikes instead of fleeing. Faces
      // you, kicks once (small damage if you're right on it), then bolts.
      a.rearT -= dt;
      a.dir = Math.atan2(dx, dz);
      if (!a.rearStruck && a.rearT < a.rearDur - 0.35) {
        a.rearStruck = true;
        if (dist < 3.0) { hurtPlayer(8 + a.aggression * 8); camShakeT = SHAKE_DUR; }
      }
      if (a.rearT <= 0) {                      // done posturing — flee for real
        a.state = 'flee'; a.t = 3 + Math.random() * 2.5;
        a.dir = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.7;
        a.cur = null;
      }
    } else if (a.state === 'wounded') {
      // it bolts hurt, then flags — speed bleeds DOWN over ~7s to below
      // your walking pace, so you run it down. The persistence hunt.
      a.bleedT -= dt; a.woundAge = (a.woundAge || 0) + dt;
      a.dir = lerpAngle(a.dir, Math.atan2(-dx, -dz) + Math.sin(clock.elapsedTime * 0.7) * 0.3, dt * 2);
      const fade = Math.max(0, 1 - a.woundAge / 7);
      const wsp = Math.max(4.2, a.cfg.gallop * a.wound.speed * (0.4 + 0.6 * fade));
      setAnim(a, wsp < 5.2 ? 'Walk' : 'Gallop');
      stepAnimal(a, wsp, dt);
      dropBlood(a);
      if (a.bleedT <= 0) {
        if (a.bleedFatal) killAnimal(a, true);          // it lies down
        else { a.state = 'flee'; a.t = 4; a.limpTs = 0.8; } // it clots; it survives, marked
      }
    } else if (a.state === 'flee') {
      a.t -= dt;
      setAnim(a, 'Gallop');
      // darty critters (foxes) JUKE — sharp lateral cuts a few times a
      // second over the away-vector, so they're a real pain to hit on the run
      if (a.cfg.darty) {
        a._jukeT = (a._jukeT ?? 0) - dt;
        if (a._jukeT <= 0) { a._jukeT = 0.18 + Math.random() * 0.22;
          a._juke = (Math.random() - 0.5) * 1.7; }
        a.dir = Math.atan2(-dx, -dz) + a._juke;
      }
      stepAnimal(a, a.cfg.gallop, dt);
      if (a.bleeding) {
        dropBlood(a);
        a.bleeding -= dt;
        if (a.bleeding <= 0) {
          if (a.bleedFatal) { a.state = 'wounded'; a.wound = WOUNDS.vitals; a.limpTs = 0.55; a.bleedT = 6 + Math.random() * 8; a.bleedFatal = true; }
          else a.bleeding = 0;   // shallow wound — it clots, it remembers
        }
      }
      if (a.t <= 0 && dist > a.cfg.flee * 1.2) a.state = 'idle', a.t = 1 + Math.random() * 3;
    } else if (a.state === 'alert') {
      // it caught something — head up, turned your way, weighing it. This
      // is the OUTER ring of the dartboard: cross it and it looks; hold or
      // back off and it goes back to grazing; push closer and it bolts.
      a.t -= dt;
      setAnim(a, 'Idle');
      a.dir = lerpAngle(a.dir, Math.atan2(dx, dz), dt * 4);   // turn to look right at you
      if (dist < spookRadius(a, dist)
          || (noiseLevel >= 2 && dist < spookRadius(a, dist) * 1.3)) {
        a.state = 'flee'; a.t = 3 + Math.random() * 2.5;
        a.dir = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.7;
        spookHerd(a);
      } else if (a.t <= 0) { a.state = 'idle'; a.t = 1.5 + Math.random() * 2; }  // back to grazing
    } else if (dist < panicRadius(a) || dist < spookRadius(a, dist)) {
      // crowded hard AND bold AND able to kick → it may turn and fight
      // instead of running. A stag/horse that's had enough rears up.
      if (dist < 3.2 && a.aggression > 0.5 && a.acts.Attack_Kick
          && Math.random() < (a.cfg.rear || 0)) {
        a.state = 'rear'; a.rearDur = a.rearT = 0.9 + Math.random() * 0.4;
        a.rearStruck = false;
        setAnim(a, 'Attack_Kick', true);
        a.dir = Math.atan2(dx, dz);
        camShakeT = SHAKE_DUR;
      } else {
        a.state = 'flee'; a.t = 3 + Math.random() * 2.5;
        a.dir = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.7;
        spookHerd(a);                     // one spooks, the herd spooks
      }
    } else if (dist < spookRadius(a, dist) + 9) {
      // the notable outer ring — a clear ~10-step band where it lifts its
      // head and stares before the inner ring makes it run
      a.state = 'alert'; a.t = 1.8 + Math.random() * 2.0;   // it stares a good beat
    } else wander(a, dt);
  }
  a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 6));
  applyGait(a, a._moved, dt);
  a._moved = false;
}

// ── the bear ── a tank with its own brain. It doesn't hunt you; it
// objects to you. States: idle/wander → rear (stands up, sizes you up)
// → charge (bounding lope) → attack (claw) → retreat. Provoked by a
// close approach (scales with this bear's aggression) or by a shot. A
// shot from real range only baffles it (a.confused → rear, then leave);
// a close shot enrages it (a.aggro → charge). Loses you well out.
function bearUpdate(a, dt, dx, dz, dist) {
  a.attackCd -= dt;
  const provokeR = 6 + (1 - a.aggression) * 6;          // bold bear: ~6m, shy: ~12m
  const loseR = (a.cfg.aggroR || 22) + 26;
  const night = window._night || 0;

  // ── the night stalk ── after dark a nightStalk bear is not objecting
  // to you, it is HUNTING you. It creeps in — fast while a tree or bush
  // hides it, a low crawl in the open — and FREEZES the instant you might
  // have it in frame. Look away and it's closer. It keeps this up until
  // it's inside provoke range, where it rears and charges like always.
  a._stalking = false;
  if (a.cfg.nightStalk && night > 0.4 && !a.aggro && !a.confused && !fireNear
      && a.state !== 'rear' && a.state !== 'retreat' && a.state !== 'charge'
      && dist < loseR && dist > provokeR) {
    a.state = 'stalk';
    a.dir = Math.atan2(dx, dz);                          // always oriented at you
    const hidden = losBlocked(a);
    // is it in your view cone? dx/dz point bear→player, so bear→YOU from
    // your eye is (-dx,-dz); player faces it when forward·(-dx,-dz) > 0.55
    const inView = !hidden && dist < 34
      && -(Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz) / (dist || 1) > 0.55;
    if (inView) {
      setAnim(a, 'Idle');                                // caught looking — hold dead still
      a._snapCd = 0.6 + Math.random() * 0.6;            // no twig-snaps while frozen
    } else {
      a._stalking = true;                                // applyGait drops it into a crouch
      const sp = hidden ? a.cfg.speed * 1.45 : a.cfg.speed * 0.62;
      setAnim(a, 'Walk');
      stepAnimal(a, sp, dt);
      // 3D twig-snaps as it moves — you hear it before you see it
      a._snapCd = (a._snapCd ?? 0) - dt;
      if (a._snapCd <= 0) {
        a._snapCd = 0.9 + Math.random() * 1.3;
        if (audio.snapAt) audio.snapAt(a.obj.position.x, a.obj.position.z, player, hidden ? 0.55 : 0.85);
      }
    }
    return;
  }

  // ── the warning ring ── a band OUTSIDE the provoke circle where the
  // bear notices you, squares up, and huffs (3D) — but won't charge. This
  // is the readable danger you can skirt: hear it, give it room, move on.
  // Cross into the inner provoke circle and it rears + charges.
  const awareR = provokeR + 13;
  if (!a.aggro && !a.confused && a.state !== 'rear' && a.state !== 'retreat'
      && a.state !== 'charge' && a.state !== 'stalk'
      && dist >= provokeR && dist < awareR) {
    a.state = 'wary';
    a.dir = Math.atan2(dx, dz);                          // turns to keep you in front
    a._huffCd = (a._huffCd ?? 0) - dt;
    if (a._huffCd <= 0) {
      a._huffCd = 1.3 + Math.random() * 1.1;
      if (audio.breathAt) audio.breathAt(a.obj.position.x, a.obj.position.z, 0.6);
    }
    setAnim(a, a.acts.Idle_2 ? 'Idle_2' : 'Idle');
    if (!a._warned) { a._warned = true; toast('A bear. Give it room.', 3800); }
    applyGait(a, false, dt); a._moved = false;
    return;
  }
  if (a.state === 'wary' && dist >= awareR) { a.state = 'idle'; a._warned = false; }

  // first provoke by proximity (a shot sets a.aggro/a.confused directly)
  if (!a.aggro && !a.confused && a.state !== 'rear' && a.state !== 'retreat'
      && dist < provokeR) {
    a.confused = false; a.rearAfter = 'charge';
    enterBearRear(a, dx, dz);
  }

  if (a.state === 'rear') {
    a.rearT -= dt;
    a.dir = Math.atan2(dx, dz);                          // faces you, all of it
    if (a.rearT <= 0) {
      a.cur = null;
      if (a.rearAfter === 'retreat') {
        a.state = 'retreat'; a.t = 4 + Math.random() * 3;
        a.confused = false;
        toast('It swats the air, baffled, and lumbers off.', 4200);
      } else {
        a.state = 'charge'; a.aggro = true;
      }
    }
    return;
  }

  if (a.state === 'retreat') {
    a.t -= dt;
    a.dir = Math.atan2(-dx, -dz);
    setAnim(a, 'Gallop');
    stepAnimal(a, a.cfg.gallop * 0.7, dt);
    if (a.t <= 0 || dist > loseR) { a.state = 'idle'; a.t = 1 + Math.random() * 2; a.aggro = false; }
    return;
  }

  if (a.state === 'charge' || a.aggro) {
    a.state = 'charge';
    if (dist > loseR) {                                  // it loses interest
      a.aggro = false; a.state = 'idle'; a.t = 1; a.cur = null; return;
    }
    if (dist < 2.9) {                                    // contact — it claws
      if (a.attackCd <= 0) {
        setAnim(a, a.acts.Attack ? 'Attack' : 'Attack_Kick', true);
        a.attackCd = 1.6;
        hurtPlayer(a.cfg.dmg || 38); camShakeT = SHAKE_DUR;
        setTimeout(() => { if (!a.dead) a.cur = null; }, 700);
      }
    } else {
      a.dir = Math.atan2(dx, dz);
      setAnim(a, 'Gallop');                              // bounding gait carries it
      stepAnimal(a, a.cfg.gallop, dt);
    }
    return;
  }

  wander(a, dt);                                         // calm — just a bear in the woods
}
function enterBearRear(a, dx, dz) {
  a.state = 'rear'; a.rearT = 0.9;
  a.dir = Math.atan2(dx, dz);
  setAnim(a, a.acts.Idle_2 ? 'Idle_2' : 'HitReact_Left', true);
  camShakeT = SHAKE_DUR;
  if (audio.breathAt) audio.breathAt(a.obj.position.x, a.obj.position.z, 0.7);
  toast('It stands up. All of it.', 3600);
}

// a wolf that commits to a hunt calls EVERY calm wolf in earshot —
// the whole pack answers after dark, each fanning to its own bearing.
// Runs once per aggro transition, scalars only.
function packCall(w) {
  const pr = (w.cfg.packR || 80); const pr2 = pr * pr;
  w.packBias = 0;                           // the caller takes the straight line
  let side = 1;
  for (const o of animals) {
    if (o === w || o.name !== 'Wolf' || o.dead || o.aggro) continue;
    const ddx = o.obj.position.x - w.obj.position.x,
          ddz = o.obj.position.z - w.obj.position.z;
    if (ddx * ddx + ddz * ddz > pr2) continue;
    o.aggro = true;
    o.state = 'stalk';
    o.scavTarget = null; o.scavT = 0;       // the live hunt outranks carrion
    o.circleT = 3 + Math.random() * 2;
    o.circleDir = side * -(w.circleDir || 1);
    o.packBias = side * 0.7;                // approach from a DIFFERENT angle
    side = -side;
  }
}

// scavenger detour — a wolf claimed by a rotting carcass walks to it,
// parks 20s to feed, and ignores you unless you walk into its meal.
function scavUpdate(a, dt, dist) {
  if (a.scavT > 0) {                        // parked, feeding
    if (dist < 8) { a.scavT = 0; a.scavTarget = null; return false; }
    a.scavT -= dt;
    const c = a.scavTarget;
    if (c) a.dir = Math.atan2(c.obj.position.x - a.obj.position.x,
                              c.obj.position.z - a.obj.position.z);
    setAnim(a, 'Eating');
    if (a.scavT <= 0) {                     // done — the woods waste nothing
      if (c && !c.eaten) { c.eaten = true; c.t = Math.min(c.t, 7); }
      a.scavTarget = null;
    }
    return true;
  }
  const c = a.scavTarget;
  if (!c) return false;
  if (c.eaten || c.t <= 0 || a.aggro || dist < 8) { a.scavTarget = null; return false; }
  const cdx = c.obj.position.x - a.obj.position.x,
        cdz = c.obj.position.z - a.obj.position.z;
  if (Math.hypot(cdx, cdz) < 2.3) { a.scavT = 20; setAnim(a, 'Eating'); }
  else {
    a.dir = Math.atan2(cdx, cdz);
    setAnim(a, 'Walk');
    stepAnimal(a, a.cfg.speed * 1.15, dt);
  }
  return true;
}

// one deer catches you — every herd-mate inside 25m bolts with it
function spookHerd(a) {
  if (!a.herdId) return;
  const p = a.obj.position;
  for (const o of animals) {
    if (o === a || o.herdId !== a.herdId || o.dead
        || o.state === 'flee' || o.state === 'wounded') continue;
    const dx = o.obj.position.x - p.x, dz = o.obj.position.z - p.z;
    if (dx * dx + dz * dz > 625) continue;  // 25m
    o.state = 'flee'; o.t = 3 + Math.random() * 2.5;
    o.dir = Math.atan2(o.obj.position.x - player.x,
                       o.obj.position.z - player.z) + (Math.random() - 0.5) * 0.7;
  }
}

function wander(a, dt) {
  a.t -= dt;
  if (a.t <= 0) {
    const roll = Math.random();
    // prey mostly GRAZE — a calm meadow you have to sneak up on. Predators
    // roam more. (eat is long; walking is the rarer, shorter beat.)
    const prey = !(a.cfg.hunts || a.cfg.territorial || a.cfg.bearish);
    if (prey) {
      a.state = roll < 0.28 ? 'idle' : roll < 0.78 ? 'eat' : 'walk';
      a.t = a.state === 'eat' ? 5 + Math.random() * 6 : 2.5 + Math.random() * 4;
    } else {
      a.state = roll < 0.38 ? 'idle' : roll < 0.6 ? 'eat' : 'walk';
      a.t = 2.5 + Math.random() * 5;
    }
    if (a.state === 'walk') {
      a.dir += (Math.random() - 0.5) * 2.4;
      // after dark — or when you reek of meat and harvest-blood —
      // wandering wolves drift loosely toward the smell of you
      if (a.cfg.hunts && !a.isCryptid && !fireNear
          && ((window._night || 0) > 0.5 || scentM > 0)
          && Math.random() < (scentM > 0 ? 0.72 : 0.5)) {
        const p = a.obj.position;
        a.dir = Math.atan2(player.x - p.x, player.z - p.z)
          + (Math.random() - 0.5) * 1.2;
      }
      // herd followers drift back toward the leader when they stray >12m
      if (a.herdLeader) {
        if (a.herdLeader.dead) a.herdLeader = null;   // herd broken
        else {
          const lp = a.herdLeader.obj.position, p = a.obj.position;
          const ldx = lp.x - p.x, ldz = lp.z - p.z;
          if (ldx * ldx + ldz * ldz > 144)
            a.dir = Math.atan2(ldx, ldz) + (Math.random() - 0.5) * 0.8;
        }
      }
    }
  }
  if (a.state === 'walk') { setAnim(a, 'Walk'); stepAnimal(a, a.cfg.speed, dt); }
  else setAnim(a, a.state === 'eat' ? 'Eating' : 'Idle');
}

function stepAnimal(a, speed, dt) {
  const p = a.obj.position;
  const nx = p.x + Math.sin(a.dir) * speed * dt,
        nz = p.z + Math.cos(a.dir) * speed * dt;
  const ny = heightAt(nx, nz);
  const lim = WORLD * 0.47;
  if (ny < WATER_Y + 0.6 || Math.abs(nx) > lim || Math.abs(nz) > lim) {
    a.dir += Math.PI * (0.5 + Math.random() * 0.5); return;
  }
  // the base wall keeps animals out — they can't climb it. Turn away.
  if (BASE_RING && Math.hypot(nx - BASE_RING.x, nz - BASE_RING.z) < BASE_RING.r) {
    a.dir += Math.PI * (0.5 + Math.random() * 0.5); return;
  }
  p.set(nx, ny, nz);
  a._moved = true;            // gait sway/bob only plays while actually moving
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ── blood trail — track a wounded animal through the woods ────────
const BLOOD_N = 140;
const blood = new THREE.InstancedMesh(
  new THREE.CircleGeometry(0.26, 7),
  new THREE.MeshBasicMaterial({ color: 0x5e0c0c, transparent: true,
    opacity: 0.85, depthWrite: false }), BLOOD_N);
blood.frustumCulled = false;
{
  const Z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < BLOOD_N; i++) blood.setMatrixAt(i, Z);
}
scene.add(blood);
let bloodCursor = 0;
const _bM = new THREE.Matrix4(), _bQ = new THREE.Quaternion()
  .setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

function dropBlood(a) {
  const p = a.obj.position;
  if (a._lastBlood && Math.hypot(p.x - a._lastBlood.x, p.z - a._lastBlood.z) < 2.6) return;
  a._lastBlood = { x: p.x, z: p.z };
  const s = 0.7 + Math.random() * 0.9;
  _bM.compose(
    new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.6,
                      heightAt(p.x, p.z) + 0.04,
                      p.z + (Math.random() - 0.5) * 0.6),
    _bQ, new THREE.Vector3(s, s, s));
  blood.setMatrixAt(bloodCursor % BLOOD_N, _bM);
  blood.instanceMatrix.needsUpdate = true;
  bloodCursor++;
}

// ── kill-feel juice: hitstop, camera kick, blood puff ──────────────
// every timer ticks down on the dt loop in tickBody — zero setTimeout
let juiceT = 0;        // hitstop: world runs at 5% speed while > 0
let kickT = 0;         // bow-release pitch kick
let fovPunchT = 0;     // lethal-hit FOV punch-in
let camShakeT = 0;     // bull near-miss / bite rattle
const KICK_DUR = 0.12, PUNCH_DUR = 0.18, SHAKE_DUR = 0.15;

// ONE pooled Points burst, rewound for every flesh hit — no per-hit allocs
const PUFF_N = 10, PUFF_LIFE = 0.5;
const _puffVel = new Float32Array(PUFF_N * 3);
let puffT = 0;
const puff = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PUFF_N * 3), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x5e0c0c, size: 0.17, transparent: true, opacity: 0,
    depthWrite: false, sizeAttenuation: true }));     // blood-trail red
  p.frustumCulled = false; p.visible = false;
  scene.add(p);
  return p;
})();
function bloodPuff(x, y, z) {
  const pos = puff.geometry.attributes.position.array;
  for (let i = 0; i < PUFF_N; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - u * u)), s = 1.1 + Math.random() * 2.2;
    _puffVel[i * 3]     = Math.cos(a) * r * s;
    _puffVel[i * 3 + 1] = (u * 0.6 + 0.5) * s;        // biased upward
    _puffVel[i * 3 + 2] = Math.sin(a) * r * s;
  }
  puff.geometry.attributes.position.needsUpdate = true;
  puffT = PUFF_LIFE; puff.visible = true;
}
function puffUpdate(dt) {
  if (puffT <= 0) return;
  puffT -= dt;
  if (puffT <= 0) { puff.visible = false; puff.material.opacity = 0; return; }
  const pos = puff.geometry.attributes.position.array;
  for (let i = 0; i < PUFF_N; i++) {
    _puffVel[i * 3 + 1] -= 5 * dt;                    // droplets fall
    pos[i * 3]     += _puffVel[i * 3] * dt;
    pos[i * 3 + 1] += _puffVel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += _puffVel[i * 3 + 2] * dt;
  }
  puff.geometry.attributes.position.needsUpdate = true;
  puff.material.opacity = 0.9 * (puffT / PUFF_LIFE);
}

const VOICE = {
  peaceful: ['“Glad it went peaceful,” you say, to no one. No one answers.',
             'Quick. Alive, then food. The kindest order of operations.',
             'Clean. You say a small grace. Hunger wrote it.'],
  suffered: ['It took a while. You watched. You were that hungry.',
             'That one suffered. The woods saw. They mark these things.',
             'You made it slow. Somewhere, that is being written down.'],
};

// ── gut pile ── walk over a kill and take the meat: the body opens up and
// blood pools around it, so a harvested carcass READS as worked, not just
// a sleeping animal. Shared geo/mats; the gore is removed with the carcass.
const _goreGeo = new THREE.CircleGeometry(1, 12);
const _goreMat = new THREE.MeshStandardMaterial({ color: 0x430b07, roughness: 0.75,
  transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -1 });
const _gutGeo = new THREE.IcosahedronGeometry(0.18, 0);
const _gutMat = new THREE.MeshStandardMaterial({ color: 0x6e1410, roughness: 0.6,
  emissive: 0x2a0604, emissiveIntensity: 0.3 });
function gutCarcass(a) {
  if (a._gore) return;
  const p = a.obj.position, gy = heightAt(p.x, p.z) + 0.04;
  const sc = (a.cfg.r || 1) * 1.7;
  const gore = [];
  const pool = new THREE.Mesh(_goreGeo, _goreMat);
  pool.rotation.x = -Math.PI / 2; pool.rotation.z = Math.random() * Math.PI;
  pool.position.set(p.x, gy, p.z);
  pool.scale.set(sc * (0.8 + Math.random() * 0.4), sc * (0.8 + Math.random() * 0.4), 1);
  scene.add(pool); gore.push(pool);
  for (let i = 0; i < 4; i++) {                  // a few wet gut blobs scattered
    const b = new THREE.Mesh(_gutGeo, _gutMat);
    const an = Math.random() * Math.PI * 2, rr = Math.random() * sc * 0.55;
    b.position.set(p.x + Math.cos(an) * rr, gy + 0.06, p.z + Math.sin(an) * rr);
    b.scale.set(0.5 + Math.random() * 0.7, 0.4 + Math.random() * 0.4, 0.5 + Math.random() * 0.7);
    scene.add(b); gore.push(b);
  }
  a._gore = gore;
  a.obj.scale.y *= 0.8;                          // the body slumps open
  if (audio.impact) audio.impact('flesh', 0.1);
}

function killAnimal(a, suffered = false) {
  a.dead = true; a.t = 75;   // carcasses linger — long enough for scavengers
  a.suffered = suffered || !!a.bleeding || a.state === 'wounded';
  setAnim(a, 'Death', true);
  score[a.name] = (score[a.name] || 0) + 1;
  if (audio.killStinger) audio.killStinger();   // the theme punctuates every kill
  if (a.isCryptid) {
    say('killCryptid', 7000);
    audio.stinger(); cryptid = null; a.t = 20;
  } else if (a.name === 'Wolf') { say('killWolf'); audio.documented(); }
  else if (a.name === 'Bull') { say('killBull'); audio.documented(); }
  else {
    say(a.suffered ? 'killSuffer' : (a.lastZone === 'head' ? 'killHead' : 'killClean'), 3800);
    audio.documented();
  }
  renderNotes();
}

// ── the Hollow Stag — rare, night-only, and it hunts you ──────────
let cryptid = null, nightRolled = false;

function spawnCryptid() {
  const prefab = prefabs.Stag;
  if (!prefab) return;
  const obj = SkeletonUtils.clone(prefab.scene);
  obj.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.material = new THREE.MeshStandardMaterial({
        color: 0x05060a, roughness: 0.95,
        emissive: 0x0e3a3e, emissiveIntensity: 0.65,   // ghost-rim for bloom
      });
    }
  });
  // glowing eyes on the head bone, if the rig names one
  obj.traverse(o => {
    if (o.isBone && /head/i.test(o.name) && !o.userData.eyed) {
      o.userData.eyed = true;
      const eyeM = new THREE.MeshStandardMaterial({ color: 0xbffcf2,
        emissive: 0x7df5e2, emissiveIntensity: 4 });
      for (const s of [-0.09, 0.09]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeM);
        e.position.set(s, 0.12, 0.16);
        o.add(e);
      }
    }
  });
  const glow = new THREE.PointLight(0x52e8d8, 5, 13, 2);
  glow.position.y = 1.9;
  obj.add(glow);
  obj.scale.setScalar(1.18);
  // appears in the dark, far enough that you see the eyes first
  const ang = Math.random() * Math.PI * 2, d = 70 + Math.random() * 30;
  let x = player.x + Math.cos(ang) * d, z = player.z + Math.sin(ang) * d;
  const lim = WORLD * 0.45;
  x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z));
  obj.position.set(x, heightAt(x, z), z);
  scene.add(obj);
  const mixer = new THREE.AnimationMixer(obj);
  const acts = {};
  for (const frag of ['Idle', 'Eating', 'Walk', 'Gallop', 'Death', 'HitReact_Left', 'Attack']) {
    const clip = clipOf(prefab, frag);
    if (clip) acts[frag] = mixer.clipAction(clip);
  }
  const a = { name: '???', cfg: CRYPTID_CFG, obj, mixer, acts, cur: null,
              state: 'stalk', t: 0, dir: 0, hp: CRYPTID_CFG.hp, dead: false,
              attackCd: 2, aggro: true, isCryptid: true,
              stareT: 0, stareCd: 3 };   // it stops to look at you, early
  setAnim(a, 'Walk');
  animals.push(a);
  cryptid = a;
  setTimeout(() => toast('Something out there is starving too. It has chosen.', 5000), 2500);
}

// the staring contest — sometimes it stops DEAD at 25–40m, body frozen,
// eyes on you, and just… waits. Returns true while it holds the freeze.
function cryptidStare(a, dx, dz, dist, dt) {
  a.stareCd -= dt;
  if (a.state !== 'stare') {
    if (a.stareCd <= 0 && dist > a.cfg.stareNear && dist < a.cfg.stareFar
        && Math.random() < dt * 0.45) {
      a.state = 'stare'; a.stareT = 2.6 + Math.random() * 3.4;
    } else return false;
  }
  a.stareT -= dt;
  a.dir = Math.atan2(dx, dz);               // frozen body, eyes locked
  setAnim(a, 'Idle');
  if (a.stareT <= 0 || dist < a.cfg.stareNear * 0.6) {
    a.state = 'stalk';                      // it has decided about you
    a.stareCd = 13 + Math.random() * 11;
  }
  return true;
}

// the world notices you: each dawn survived raises the stakes
window._nights = window._nights || 0;
let dreadAmt = 0, musicDucked = false;

// stare-freeze silences the music — the woods hold their breath
function duckMusic(on) {
  if (on === musicDucked) return;
  const A = audio;
  if (!A || !A.musicBus || A._musicLevel == null) return;   // guard: pre-init
  musicDucked = on;
  A._musicBase = A._musicBase ?? A._musicLevel;
  A._musicLevel = on ? A._musicBase * 0.05 : A._musicBase;  // sidechain-safe
  A.musicBus.gain.setTargetAtTime(
    A._musicLevel, A.musicBus.context.currentTime, on ? 0.35 : 0.9);
}

function cryptidUpdate(night) {
  if (night > 0.65 && !nightRolled) {
    nightRolled = true;
    const n = window._nights;
    // nights 2+: it comes more often, and the woods send another wolf
    if (!cryptid && Math.random() < (n >= 1 ? 0.65 : CRYPTID_CHANCE)) spawnCryptid();
    if (n >= 1 && prefabs.Wolf) {
      let wolves = 0;
      for (const o of animals) if (o.name === 'Wolf' && !o.dead) wolves++;
      if (wolves < 6) spawn('Wolf');
    }
  }
  if (night < 0.3) {
    if (nightRolled) window._nights++;    // you lasted the dark. It counts.
    nightRolled = false;
    if (cryptid && !cryptid.dead) {       // dawn — it leaves. For now.
      scene.remove(cryptid.obj);
      animals.splice(animals.indexOf(cryptid), 1);
      cryptid = null;
      toast('Dawn. It withdrew, unfed. It will not stay unfed.', 4200);
    }
  }
  // dread veil — while it stands within 80m, light drains and the fog
  // leans in. Smooth both ways; bases are recomputed upstream each frame,
  // so multiplying here self-restores the moment it dies or withdraws.
  let want = 0;
  if (cryptid && !cryptid.dead) {
    const d = Math.hypot(cryptid.obj.position.x - player.x,
                         cryptid.obj.position.z - player.z);
    if (d < 80) want = 1;
  }
  dreadAmt += (want - dreadAmt) * 0.045;
  if (dreadAmt > 0.002) {
    hemi.intensity *= 1 - 0.25 * dreadAmt;
    scene.fog.near *= 1 - 0.15 * dreadAmt;
    scene.fog.far  *= 1 - 0.15 * dreadAmt;
  }
  duckMusic(!!(cryptid && !cryptid.dead && cryptid.state === 'stare'));
}

// ── canoe: a low-poly dugout that appears when you're on water ──
const canoe = (() => {
  const g = new THREE.Group();
  const woodM = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
  const inM = new THREE.MeshStandardMaterial({ color: 0x3c2616, roughness: 1 });
  // hull: a long box tapered to points fore & aft (scale the ends in)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 3.0), woodM);
  const vp = hull.geometry.attributes.position;
  for (let i = 0; i < vp.count; i++) {
    const z = vp.getZ(i), taper = 1 - Math.min(1, Math.abs(z) / 1.5) * 0.86;
    vp.setX(i, vp.getX(i) * taper);
  }
  vp.needsUpdate = true; hull.geometry.computeVertexNormals();
  const well = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 2.0), inM);
  well.position.y = 0.12;
  g.add(hull, well);
  g.visible = false;
  return g;
})();
scene.add(canoe);

// ───────────────────────── player ─────────────────────────
// the calm clearing you wake in — every life starts and respawns here
// wake looking UP at the sky (orange→blue), not forced down
const SPAWN = { x: 0, z: 26, yaw: Math.PI, pitch: 0.5 };
const player = { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, pitch: SPAWN.pitch,
                 hp: 100, lastHit: -99, meat: 0, stored: 0, lastAte: 0, arrows: 10 };
const ARROW_MAX = 30;   // a full quiver
window._player = player;
player.y = heightAt(player.x, player.z);
const score = {};
const keys = {};
window._keys = keys;   // test hook: drive movement from window._sim
window._jump = () => { jumpQ = true; };   // test hook: queue a jump in window._sim
let started = false, drawT = 0, holdT = 0, raiseT = 0, drawing = false, dead = false, bobPhase = 0, hapticT = 0;
let _moveLvl = 0;   // 0..1 gait level — drives footstep audio + camera head-bob
let breathLoad = 0; // 0..1 exertion — rises running / holding a draw, recovers at rest
let playerVy = 0, grounded = true, jumpQ = false;
let inCanoe = false, canoeSpd = 0, _wasCanoe = false;
// rowing is a CIRCULAR motion: each oar accumulates the radians of arc your
// finger sweeps this frame (touch) — keep circling smoothly to keep moving.
let oarLDrive = 0, oarRDrive = 0;

// ── the wake-up: a ~3.5s cinematic intro that plays on enter and on
// every respawn. Driven entirely by introT on the dt loop (no setTimeout),
// so window._sim steps through it. Skippable by tap/click/key. ──
const INTRO_DUR = 3.5;
// the opening: a vast aerial of the whole valley; tap and the camera
// dives toward the clearing, blacks out, and you wake there.
let launching = false, launchT = 0; const LAUNCH_DUR = 3.2;
const _diveFrom = new THREE.Vector3();   // frozen aerial origin of the dive
// arrow-cam: a brief cinematic chase that rides each loosed arrow
let arrowCam = null;        // { rec, mode:'follow'|'return', rt }
window._acState = () => arrowCam ? arrowCam.mode : 'none';
window._camPos = () => camera.position.toArray().map(n=>Math.round(n));
const _acTmp = new THREE.Vector3(), _acLook = new THREE.Vector3();
const _aerial = new THREE.Vector3();   // scratch
let intro = false, introT = 0, introSkip = false;
window._intro = () => intro;          // test/inspection hook
function beginIntro() {               // arm the wake-up for a fresh life
  intro = true; introT = 0; introSkip = false;
  // lids slam shut, bow drops out of frame — they rise together below
  setLids(0, 0);
  bow.position.set(0.34, -1.35, -0.62);   // off the bottom of the screen
  if (camera.fov !== 70) { camera.fov = 70; camera.updateProjectionMatrix(); }
}
function endIntro() {                  // hand control to the player
  intro = false;
  setLids(-100, 0);                   // eyes fully open, glow gone
  player.pitch = SPAWN.pitch;         // wake looking at the sky — and STAY there
  if (audio.breath) audio.breath();   // the breath-in of waking
  // NO text, NO buttons yet. Just the sky. The reveal waits for the
  // player to look around on their own (handled in the reveal block).
}
// big centered line, no box — fades in slow, holds, fades out
function cinematic(text, ms = 4000) {
  const el = document.getElementById('cinematic');
  if (!el) return;
  el.textContent = text;
  el.style.opacity = 1;
  clearTimeout(cinematic._t);
  cinematic._t = setTimeout(() => { el.style.opacity = 0; }, ms);
}
// CSS-var driver for the eyelids (DOM lives in index.html)
const _eyelids = document.getElementById('eyelids');
function setLids(openPct, glow) {     // openPct: 0 = shut, -100 = wide open
  if (!_eyelids) return;
  _eyelids.style.setProperty('--lid', openPct + '%');
  _eyelids.style.setProperty('--lidGlow', glow);
}

// ── what you carry, carries — meat and blood ride the wind ─────────
// Packed meat (+6m per ◆) and fresh harvest-blood (+6m for 90s) widen
// every hunter's trigger radius. Near the camp fire it all halves:
// sanctuary, never explained. Computed once per frame into scalars.
// his BASE is the clearing he wakes in — the sanctuary, returned to often
const CAMP_X = SPAWN.x, CAMP_Z = SPAWN.z, CAMP_SAFE = 15;
placeWildfires(SPAWN.x, SPAWN.z, CAMP_X, CAMP_Z);   // scatter the wild fires now that the anchors exist
buildBase(SPAWN.x, SPAWN.z);                         // campfire, stone ring, the meat cove
let bloodedUntil = -99, scentM = 0, fireNear = false;
let saidBlooded = false, saidFullPack = false, sawNight = false;

// the meat you died holding waits where you fell — one mound, reused
const cacheMesh = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.42, 0),
  new THREE.MeshStandardMaterial({ color: 0x4a1410, roughness: 0.95 }));
cacheMesh.scale.set(1.3, 0.55, 1.3);
cacheMesh.visible = false;
scene.add(cacheMesh);
let meatCache = null;            // { x, z, n }

function dropMeatCache() {
  if (player.meat <= 0) return;
  meatCache = { x: player.x, z: player.z, n: player.meat };
  player.meat = 0; renderNotes();
  cacheMesh.position.set(meatCache.x,
    heightAt(meatCache.x, meatCache.z) + 0.16, meatCache.z);
  cacheMesh.visible = true;
}

function cacheUpdate(t) {
  // same shape as a carcass: stoop, take back what kept
  if (Math.hypot(player.x - meatCache.x, player.z - meatCache.z) > 2.4) return;
  let n = meatCache.n;
  if (player.hp < 95 && n > 0) {
    player.hp = Math.min(100, player.hp + 40); renderHP(); n--;
  }
  while (n > 0 && player.meat < 3) { player.meat++; n--; }
  player.lastAte = t; bloodedUntil = t + 90;
  renderNotes();
  toast('The meat you died with. Something ate around it. Take the rest.', 4600);
  meatCache = null; cacheMesh.visible = false;
}

// ── the cove: walk into it carrying meat and you lay it by — the loop
// that gives the hunt a point. Stored meat is what survives you.
let _coveCd = 0, _saidStore = false;
function baseUpdate(t, dt) {
  _coveCd -= dt;
  if (!COVE || player.meat <= 0 || _coveCd > 0) return;
  if (Math.hypot(player.x - COVE.x, player.z - COVE.z) > 2.8) return;
  player.stored += player.meat;
  const laid = player.meat;
  player.meat = 0; _coveCd = 1.5;
  renderNotes();
  if (audio.impact) audio.impact('flesh', 0.2);
  if (!_saidStore) { _saidStore = true;
    toast('Laid by. This is what lasts.', 4200); }
  else toast(player.stored + ' put away.', 2600);
}

// ── pick your ammo back up ── walk over a stuck arrow to recover it. One
// in the ground is easy; one buried in a trunk up high needs a JUMP (your
// hands rise with you). Arrows in a carcass come back when you harvest it.
function arrowPickup() {
  if (player.arrows >= ARROW_MAX) return;
  const handY = player.y + 1.3;
  let got = 0;
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (!a.stuck) continue;
    const p = a.m.position;
    if (Math.hypot(p.x - player.x, p.z - player.z) > 2.2) continue;
    if (Math.abs(p.y - handY) > 1.7) continue;        // too high — jump to reach it
    scene.remove(a.m); arrows.splice(i, 1);
    player.arrows = Math.min(ARROW_MAX, player.arrows + 1);
    got++;
    if (player.arrows >= ARROW_MAX) break;
  }
  if (got) { renderNotes(); if (audio.impact) audio.impact('wood', 0.15);
    toast('Arrow recovered. (' + player.arrows + ')', 1400); }
}

// ── camp quivers ── a one-time cache of arrows at each camp
function quiverPickup() {
  for (const q of QUIVERS) {
    if (q.taken) continue;
    if (Math.hypot(player.x - q.x, player.z - q.z) > 2.4) continue;
    q.taken = true; q.mesh.visible = false;
    player.arrows = Math.min(ARROW_MAX, player.arrows + q.n);
    renderNotes();
    if (audio.stinger) audio.stinger();
    toast('A quiver — ' + q.n + ' arrows.', 3200);
  }
}

function hurtPlayer(dmg) {
  if (dead) return;
  player.hp -= dmg; player.lastHit = clock.elapsedTime;
  camShakeT = SHAKE_DUR;           // kill-feel: teeth rattle the camera too
  audio.thud();
  document.getElementById('hurt').style.opacity = 1;
  setTimeout(() => document.getElementById('hurt').style.opacity = 0, 280);
  toast(pick(LINES.bite));
  if (player.hp <= 0) {
    dead = true;
    resetDrawState();
    dropMeatCache();               // your body fed something. Some keeps.
    sawNight = false;              // no dawn credit for the dead
    toast(LINES.death, 4000);
    setTimeout(() => {
      player.hp = 100; player.x = SPAWN.x; player.z = SPAWN.z;
      player.yaw = SPAWN.yaw; player.pitch = SPAWN.pitch;
      player.y = heightAt(player.x, player.z); dead = false;
      player.lastAte = clock.elapsedTime;   // restarted, not starved
      renderHP();
      beginIntro();                         // wake again in the clearing
    }, 3500);
  }
  renderHP();
}

// ───────────────────────── arrows ─────────────────────────
// Ballistics: real longbow numbers. ~60 m/s at full draw, true 9.81
// gravity, no drag, long lifetime so far shots actually land.
const ARROW_SPEED_BASE = 42, ARROW_SPEED_DRAW = 44;   // ≈86 m/s full draw — rifle-flat at range
const ARROW_GRAVITY = 8.4;   // flatter, readable drop
const ARROW_LIFE = 14, ARROW_STUCK_LIFE = 150;   // stuck arrows linger — they're ammo to recover

const arrows = [];
window._arrows = arrows;   // test hook
// Real arrow template — built ONCE, cloned per shot (clones share
// geometry + material, so this is cheap). Tip points +z so the
// existing lookAt-along-velocity orientation just works.
const arrowTemplate = new THREE.Group();
{
  // colorful, faintly enchanted arrow — the shaft is a cool teal-violet
  // that catches light, the head is mirror-bright so it GLINTS against
  // the low sun, and a thin emissive band shimmers down the shaft.
  const woodM  = new THREE.MeshStandardMaterial({ color: 0x3aa6c4, roughness: 0.3, metalness: 0.5,
                                                  emissive: 0x16414f, emissiveIntensity: 0.5 });
  const steelM = new THREE.MeshStandardMaterial({ color: 0xdfe9f2, roughness: 0.06, metalness: 1.0,
                                                  emissive: 0x223040, emissiveIntensity: 0.35 });
  const hornM  = new THREE.MeshStandardMaterial({ color: 0x6a4fb0, roughness: 0.5, metalness: 0.4 });
  const fM     = new THREE.MeshStandardMaterial({ color: 0xff5a7a, roughness: 0.6, metalness: 0.2,
                                                  emissive: 0x5a1024, emissiveIntensity: 0.4,
                                                  side: THREE.DoubleSide });
  const fM2    = new THREE.MeshStandardMaterial({ color: 0x6ad0ff, roughness: 0.6, metalness: 0.2,
                                                  emissive: 0x12455f, emissiveIntensity: 0.4,
                                                  side: THREE.DoubleSide });
  const bandM  = new THREE.MeshStandardMaterial({ color: 0xfff0a8, roughness: 0.2, metalness: 0.3,
                                                  emissive: 0xffcf5a, emissiveIntensity: 1.4 });
  // 0.78 m shaft, slightly tapered toward the head — centered on z
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0075, 0.78, 6), woodM);
  shaft.rotation.x = Math.PI / 2;
  // forged head: elongated cone + tiny collar where it seats
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.095, 6), steelM);
  head.rotation.x = Math.PI / 2; head.position.z = 0.437;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.018, 6), steelM);
  collar.rotation.x = Math.PI / 2; collar.position.z = 0.382;
  // thin glowing band near the head — the subtle glint that catches the eye
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.012, 6), bandM);
  band.rotation.x = Math.PI / 2; band.position.z = 0.31;
  // nock notch hint at the tail
  const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.0055, 0.02, 5), hornM);
  nock.rotation.x = Math.PI / 2; nock.position.z = -0.396;
  arrowTemplate.add(shaft, head, collar, nock, band);
  // 3 fletches — thin doubled planes (two slightly splayed planes per
  // fletch fake real vane thickness for free)
  const fGeo = new THREE.PlaneGeometry(0.016, 0.085);
  for (let i = 0; i < 3; i++) {
    const ang = i * Math.PI * 2 / 3;
    for (let s = -1; s <= 1; s += 2) {
      const f = new THREE.Mesh(fGeo, i === 1 ? fM2 : fM);
      f.position.z = -0.33;
      f.position.x = -Math.sin(ang) * 0.008;
      f.position.y =  Math.cos(ang) * 0.008;
      f.rotation.z = ang;
      f.rotation.x = Math.PI / 2;
      f.rotation.y = 0.10 * s;       // splay → thickness + slight helical
      arrowTemplate.add(f);
    }
  }
}


// wind-streak template for arrows in flight (cloned-material per shot)
const _streakGeo = new THREE.CylinderGeometry(0.001, 0.05, 3.8, 5, 1, true);
_streakGeo.rotateX(Math.PI / 2);     // length along local z, taper toward head
const _streakMat = new THREE.MeshBasicMaterial({
  color: 0xbfeaff, transparent: true, opacity: 0.5,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function loose() {
  const power = Math.min(1, drawT);
  if (power < 0.04) { drawT = 0; return; }   // a true non-draw, ignore
  if (player.arrows <= 0) {                   // out of ammo — dry, go collect some
    drawT = 0; if (audio.drawCreak) audio.drawCreak(0);
    toast('Out of arrows. Pull them from where they landed.', 3600);
    return;
  }
  player.arrows--; renderNotes();
  // speed scales STEEPLY with how far you pulled: a flick (~0.1) limps out
  // at ~9 m/s and drops in front of you; a full draw rips at ~96 m/s.
  const speed = 6 + Math.pow(power, 1.5) * 66;   // strong at full draw, not map-crossing
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const m = arrowTemplate.clone();
  m.position.copy(camera.position).addScaledVector(dir, 0.8);
  m.lookAt(m.position.clone().add(dir));
  // wind-streak: a tapered translucent tail behind the head so you SEE
  // it leave and arc. Child of the arrow → follows orientation for free.
  const streak = new THREE.Mesh(_streakGeo, _streakMat.clone());
  streak.position.z = -1.9;          // trails behind (arrow forward = +z)
  m.add(streak); m.userData.streak = streak;
  scene.add(m);
  const rec = { m, v: dir.multiplyScalar(speed),
                t: ARROW_LIFE, power,
                ox: m.position.x, oy: m.position.y, oz: m.position.z };
  arrows.push(rec);
  arrowCam = { rec, mode: 'follow', rt: 0 };   // ride this one
  audio.twang();
  kickT = KICK_DUR;        // kill-feel: the string snaps your aim up a hair
  if (IS_TOUCH && navigator.vibrate) navigator.vibrate(Math.round(18 + power * 34));
  drawT = 0;
}

window._loose = p => { drawT = p; loose(); };   // debug hooks
window._draw = v => { drawing = v; };
window._dbg = () => ({ started, dead, arrows: arrows.length,
  sample: animals[0] && { name: animals[0].name, state: animals[0].state,
    dist: Math.round(Math.hypot(player.x - animals[0].obj.position.x,
                                player.z - animals[0].obj.position.z)) } });
window._score = score;

const _arrowAim = new THREE.Vector3();   // scratch — no per-frame allocs

// ── wound zones — where the arrow lands decides how it dies ───────
// speed = fraction of gallop while wounded; ts = anim timeScale (the
// limp); bleedT = seconds to collapse when fatal; fatal = chance the
// wound kills if untreated; instant = power needed for a clean kill.
const WOUNDS = {
  head:   { speed: 0.94, ts: 0.95, bleed: 8,            fatal: 0.15, instant: 0.5,  cat: 'woundHead' },
  vitals: { speed: 0.55, ts: 0.55, bleedT: [9, 16],     fatal: 1,    instant: 0.78, cat: 'woundVitals' },
  leg:    { speed: 0.42, ts: 0.50, bleed: 18,           fatal: 0.5,  instant: 99,   cat: 'woundLeg' },
  gut:    { speed: 0.22, ts: 0.45, bleedT: [22, 40],    fatal: 1,    instant: 99,   cat: 'woundGut' },
  hind:   { speed: 0.58, ts: 0.60, bleed: 16,           fatal: 0.6,  instant: 99,   cat: 'woundHind' },
};

function hitZone(an, hx, hy, hz) {
  const ap = an.obj.position, r = an.cfg.r;
  const fx = Math.sin(an.obj.rotation.y), fz = Math.cos(an.obj.rotation.y);
  const fwd = ((hx - ap.x) * fx + (hz - ap.z) * fz) / r;          // -1 rear … +1 front
  const up = (hy - (ap.y + r * 0.75)) / (r * 1.4);                // -1 low … +1 high
  if (fwd > 0.45 && up > 0.3) return 'head';
  if (up > 0.12 && fwd > -0.1) return 'vitals';
  if (fwd > 0.12) return 'leg';
  if (fwd < -0.25) return 'hind';
  return 'gut';
}
function arrowUpdate(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (a.stuck) { a.t -= dt; if (a.t <= 0) { scene.remove(a.m); arrows.splice(i, 1); } continue; }
    a._px = a.m.position.x; a._py = a.m.position.y; a._pz = a.m.position.z;  // last pos (swept tests)
    a.v.y -= ARROW_GRAVITY * dt;
    a.m.position.addScaledVector(a.v, dt);
    // streak fades as the arrow ages and as it slows (drag illusion)
    const st = a.m.userData.streak;
    if (st) {
      const spd = Math.hypot(a.v.x, a.v.y, a.v.z);
      st.material.opacity = Math.max(0, Math.min(0.55, spd / 80 * 0.55)) * Math.min(1, a.t / 1.5);
    }
    // orient along velocity — skip when v is near-vertical (apex of a
    // straight-up shot) so lookAt never degenerates against the up axis
    if (a.v.x * a.v.x + a.v.z * a.v.z > 1e-4)
      a.m.lookAt(_arrowAim.copy(a.m.position).add(a.v));

    // animal hit
    let hit = false;
    for (const an of animals) {
      if (an.dead) continue;
      const ap = an.obj.position;
      const dy = a.m.position.y - (ap.y + an.cfg.r * 0.75);
      if (Math.hypot(a.m.position.x - ap.x, a.m.position.z - ap.z) < an.cfg.r &&
          Math.abs(dy) < an.cfg.r * 1.4) {
        if (audio.impact) audio.impact('flesh',
          Math.min(1, Math.hypot(a.m.position.x - player.x, a.m.position.z - player.z) / 60));
        const zone = hitZone(an, a.m.position.x, a.m.position.y, a.m.position.z);
        an.lastZone = zone;
        const W = WOUNDS[zone];
        const cleanKill = a.power >= W.instant;
        // distance the arrow actually flew — used by bear's "far shot" baffle
        const flightD = Math.hypot(a.m.position.x - a.ox,
                                   a.m.position.y - a.oy,
                                   a.m.position.z - a.oz);
        if (an.cfg.bearish) {
          // a wall of muscle — never drops in one. ~8-10 arrows.
          an.hp -= cleanKill ? 1.2 : (a.power > 0.55 ? 0.9 : 0.5);
        } else if (an.cfg.hunts || an.cfg.territorial) {
          an.hp -= cleanKill ? 999 : (a.power > 0.55 ? 2 : 1);
        } else {
          // prey: a head/clean shot drops it; a finishing shot on an
          // already-wounded one drops it; otherwise it chips real HP so
          // a couple of solid hits put it down — no 8-shot foxes.
          an.hp -= (cleanKill || an.state === 'wounded') ? 999
                   : (a.power > 0.55 ? 1 : 0.5);
        }
        // kill-feel: flesh always answers — a puff of blood at the wound
        bloodPuff(a.m.position.x, a.m.position.y, a.m.position.z);
        juiceT = Math.max(juiceT, 0.04);          // flesh hit: brief hitstop
        if (an.hp <= 0) {
          juiceT = 0.09; fovPunchT = PUNCH_DUR;   // lethal: the world holds its breath
          killAnimal(an);
          // a kill from real range gets noticed by the ledger
          const fd = Math.hypot(a.m.position.x - a.ox,
                                a.m.position.y - a.oy,
                                a.m.position.z - a.oz);
          if (fd > 35) setTimeout(() => say('longShot', 5200), 1600);
        }
        else if (an.cfg.bearish) {
          // an arrow into a bear: a close shot enrages it (charge); a far,
          // impressive shot only baffles it — it rears, then lumbers off.
          const dxB = ap.x - player.x, dzB = ap.z - player.z;
          if (flightD > 40) {
            an.confused = true; an.rearAfter = 'retreat';
            enterBearRear(an, -dxB, -dzB);
          } else {
            an.aggro = true; an.rearAfter = 'charge';
            enterBearRear(an, -dxB, -dzB);
            toast('You put an arrow in a bear. It noticed.', 4200);
          }
        } else if (an.cfg.hunts || an.cfg.territorial) {
          // wounding a predator does not make it leave. It makes it sure.
          setAnim(an, 'HitReact_Left', true);
          setTimeout(() => { if (!an.dead) an.cur = null; }, 400);
          an.aggro = true;
          toast(an.isCryptid ? 'It felt that. It is coming to feed.' : 'Wounded. Now it knows what you are.');
        } else {
          // prey, wounded: the zone writes the script from here
          setAnim(an, 'HitReact_Left', true);
          setTimeout(() => { if (!an.dead) an.cur = null; }, 450);
          an._lastBlood = null;
          an.state = 'wounded';
          an.wound = W;
          an.limpTs = W.ts;
          an.dir = Math.atan2(ap.x - player.x, ap.z - player.z);
          if (W.bleedT) {                       // fatal countdown wound
            an.bleedT = W.bleedT[0] + Math.random() * (W.bleedT[1] - W.bleedT[0]);
            an.bleedFatal = true;
          } else {
            an.bleedT = W.bleed;
            an.bleedFatal = Math.random() < W.fatal;
          }
          say(W.cat);
        }
        // kill-feel: the arrow stays in the body — it runs with your
        // work in it. attach() = worldToLocal reparent; leaves physics.
        if ((an._stuck || 0) < 3) {
          an._stuck = (an._stuck || 0) + 1;
          const vl = Math.hypot(a.v.x, a.v.y, a.v.z) || 1;
          a.m.position.addScaledVector(a.v, -0.30 / vl);  // fletching proud of the hide
          if (a.m.userData.streak) { a.m.remove(a.m.userData.streak); a.m.userData.streak = null; }
          an.obj.attach(a.m);     // carcass cleanup removes obj + arrows together
        } else scene.remove(a.m);
        arrows.splice(i, 1); hit = true; break;
      }
    }
    if (hit) continue;
    const distVol = Math.min(1, Math.hypot(a.m.position.x - player.x, a.m.position.z - player.z) / 60);
    const px = a.m.position.x, py = a.m.position.y, pz = a.m.position.z;

    // tree hit — SWEPT against the trunk (a fast arrow steps >2m/frame, so
    // a point test would tunnel through a thin trunk). It stops IN the
    // wood and knocks like it. Closest approach of this frame's segment.
    let treeHit = false;
    const sx = a._px, sz = a._pz, dxs = px - sx, dzs = pz - sz;
    const segLen2 = dxs * dxs + dzs * dzs || 1;
    for (const tr of TREES) {
      const trunkR = Math.min(tr.r, 0.6) + 0.18;
      // quick reject: trunk far from the segment's bounding box
      if (tr.x < Math.min(sx, px) - trunkR || tr.x > Math.max(sx, px) + trunkR ||
          tr.z < Math.min(sz, pz) - trunkR || tr.z > Math.max(sz, pz) + trunkR) continue;
      let t = ((tr.x - sx) * dxs + (tr.z - sz) * dzs) / segLen2;
      t = Math.max(0, Math.min(1, t));
      const cxp = sx + dxs * t, czp = sz + dzs * t;
      if (Math.hypot(tr.x - cxp, tr.z - czp) >= trunkR) continue;
      const cyp = a._py + (py - a._py) * t;             // arrow height at closest approach
      const gy = heightAt(tr.x, tr.z);
      if (cyp > gy + 0.3 && cyp < gy + 10) {            // trunk + lower canopy zone
        a.m.position.set(cxp, cyp, czp);                // snap to the trunk face
        a.stuck = true; a.t = ARROW_STUCK_LIFE;
        if (a.m.userData.streak) { a.m.remove(a.m.userData.streak); a.m.userData.streak = null; }
        if (audio.impact) audio.impact('wood', distVol);
        treeHit = true; break;
      }
    }
    if (treeHit) continue;

    // water hit — a splash, then it sinks and is gone
    if (py < WATER_Y && heightAt(px, pz) < WATER_Y) {
      if (audio.impact) audio.impact('water', distVol);
      scene.remove(a.m); arrows.splice(i, 1); continue;
    }

    // ground hit (grass/dirt) — embed it, head buried, fletching proud
    if (py < heightAt(px, pz)) {
      const vl = Math.hypot(a.v.x, a.v.y, a.v.z) || 1;
      a.m.position.addScaledVector(a.v, -0.30 / vl);   // back out ~30 cm along the shot line
      a.stuck = true; a.t = ARROW_STUCK_LIFE;
      if (a.m.userData.streak) { a.m.remove(a.m.userData.streak); a.m.userData.streak = null; }
      if (audio.impact) audio.impact('ground', distVol);
    }
    a.t -= dt; if (a.t <= 0) { scene.remove(a.m); arrows.splice(i, 1); }
  }
}

// bow viewmodel — a real recurve: curved limbs, leather grip, a
// nocked arrow that appears as you draw, a string that pulls back
const bow = new THREE.Group();
let bowString1, bowString2, nockedArrow, drawHand;
{
  // procedural wood grain — warm streaked figure painted to a canvas,
  // so the bow reads as real carved wood, not a flat brown tube.
  const woodTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#6b4524'; x.fillRect(0, 0, 64, 512);
    for (let i = 0; i < 240; i++) {
      const gx = Math.random() * 64;
      const shade = 18 + Math.random() * 40;
      const dark = Math.random() < 0.5;
      x.strokeStyle = dark ? `rgba(40,24,10,${0.05 + Math.random() * 0.12})`
                           : `rgba(${150 + shade},${108 + shade * 0.7},${60 + shade * 0.5},${0.05 + Math.random() * 0.1})`;
      x.lineWidth = 0.5 + Math.random() * 1.6;
      x.beginPath();
      let gy = 0; x.moveTo(gx, 0);
      while (gy < 512) { gy += 16 + Math.random() * 24;
        x.lineTo(gx + Math.sin(gy * 0.03) * 3 + (Math.random() - 0.5) * 2, gy); }
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
    t.anisotropy = 4;
    return t;
  })();
  const woodM = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xb89066,
    roughness: 0.5, metalness: 0.08 });
  const limbPts = [];
  // LONGBOW profile (y, z): a man-tall D-bow — the limbs run out of
  // frame when held. You should feel 6'2" behind it.
  const prof = [[0, 0], [0.14, -0.018], [0.30, -0.048], [0.44, -0.085],
                [0.55, -0.125]];
  for (const [y, z] of prof) limbPts.push(new THREE.Vector3(0, y, z));
  const upCurve = new THREE.CatmullRomCurve3(limbPts);
  const upper = new THREE.Mesh(new THREE.TubeGeometry(upCurve, 20, 0.012, 6), woodM);
  const lower = upper.clone(); lower.scale.y = -1;
  bow.add(upper, lower);
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.017, 0.13, 8),
    new THREE.MeshStandardMaterial({ color: 0x2e1d10, roughness: 1 }));
  bow.add(grip);
  const strM = new THREE.MeshBasicMaterial({ color: 0xd8cdbb });
  bowString1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 1, 3), strM);
  bowString2 = bowString1.clone();
  bow.add(bowString1, bowString2);
  // nocked arrow — fades in while drawing
  nockedArrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.8, 5),
    new THREE.MeshStandardMaterial({ color: 0xa8865a, roughness: 0.8 }));
  shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.4;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.055, 5),
    new THREE.MeshStandardMaterial({ color: 0x707880, roughness: 0.4, metalness: 0.6 }));
  head.rotation.x = -Math.PI / 2; head.position.z = -0.83;
  const fM = new THREE.MeshStandardMaterial({ color: 0xc94f3a, roughness: 1,
    side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.03), fM);
    f.position.z = -0.03; f.rotation.z = i * Math.PI * 2 / 3;
    f.rotation.x = 0.12; f.position.y = Math.cos(i * Math.PI * 2 / 3) * 0.012;
    f.position.x = -Math.sin(i * Math.PI * 2 / 3) * 0.012;
    nockedArrow.add(f);
  }
  nockedArrow.add(shaft, head);
  nockedArrow.visible = false;
  bow.add(nockedArrow);

  // ── gloved string hand + sleeved forearm ──
  // black leather glove gripping the string; a dark single-color
  // rugged sleeve runs up the forearm out of frame. No skin, no face.
  // Built once, parented to the bow so it inherits the whip-up; in the
  // draw block it slides back along local +z as the power builds.
  drawHand = new THREE.Group();
  const gloveM = new THREE.MeshStandardMaterial({ color: 0x161412, roughness: 0.62, metalness: 0.04 });
  const sleeveM = new THREE.MeshStandardMaterial({ color: 0x23201b, roughness: 0.95, metalness: 0.0 });
  // palm — a chunky low-poly box, knuckles facing downrange
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.062, 0.034), gloveM);
  palm.position.set(0, 0, 0.02);
  drawHand.add(palm);
  // three curled fingers hooking the string (boxes, splayed across the palm)
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.04, 0.018), gloveM);
    fin.position.set(-0.016 + i * 0.016, 0.034, -0.002);
    fin.rotation.x = -0.7;            // curled forward, gripping
    drawHand.add(fin);
  }
  // thumb — a stubbier box on the near side, pinching the nock
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.03, 0.016), gloveM);
  thumb.position.set(0.024, 0.012, -0.006); thumb.rotation.z = 0.5; thumb.rotation.x = -0.4;
  drawHand.add(thumb);
  // forearm sleeve — a tapered cylinder running back out of frame
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.046, 0.32, 8), sleeveM);
  sleeve.rotation.x = Math.PI / 2;     // lie along z, trailing toward the eye
  sleeve.position.set(0.006, -0.006, 0.2);
  drawHand.add(sleeve);
  // wrist cuff — a slightly fatter band where glove meets sleeve
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 8), gloveM);
  cuff.rotation.x = Math.PI / 2; cuff.position.set(0.003, -0.003, 0.05);
  drawHand.add(cuff);
  drawHand.visible = false;
  bow.add(drawHand);

  bow.position.set(0.34, -0.4, -0.62);
  bow.rotation.set(0.05, -0.55, 0.21);   // canted at rest, archer-style
  bow.visible = false;            // hidden on the title screen
  camera.add(bow);
  scene.add(camera);
}

// preallocated — updateBowString runs every frame (no per-frame Vector3s)
const _bsNock = new THREE.Vector3(),
      _bsTip1 = new THREE.Vector3(0, 0.55, -0.125),
      _bsTip2 = new THREE.Vector3(0, -0.55, -0.125),
      _bsUP   = new THREE.Vector3(0, 1, 0),
      _bsDir  = new THREE.Vector3();
function _setBowStr(str, tip) {
  str.position.copy(tip).add(_bsNock).multiplyScalar(0.5);
  str.scale.y = tip.distanceTo(_bsNock);
  str.quaternion.setFromUnitVectors(_bsUP, _bsDir.copy(_bsNock).sub(tip).normalize());
}
function updateBowString(draw) {
  // string runs tip→nock→tip; nock pulls back toward your eye
  _bsNock.set(0, 0, -0.125 + 0.02 + draw * 0.6);   // a LONG, visible pull
  _setBowStr(bowString1, _bsTip1);
  _setBowStr(bowString2, _bsTip2);
  nockedArrow.visible = draw > 0.03;
  // the arrow rests on the SHELF beside the riser, not through it —
  // offset to the side + up onto the rest like real archery
  nockedArrow.position.set(0.024, 0.012, _bsNock.z);
  // the gloved hand grips the string AT the nock and rides it back to
  // the cheek; it appears with the arrow and tracks the same pull.
  drawHand.visible = draw > 0.03;
  drawHand.position.set(0.024, 0.006, _bsNock.z + 0.012);
}

// dying mid-draw must not leave the camera zoomed / the bow drawn
function resetDrawState() {
  drawing = false; drawT = 0; raiseT = 0;
  if (camera.fov !== 70) { camera.fov = 70; camera.updateProjectionMatrix(); }
  updateBowString(0);
  document.getElementById('crosshair').classList.remove('drawn');
}

// ───────────────────────── input ─────────────────────────
// the wake-up is skippable — any input fast-forwards it to the end
function skipIntro() { if (intro) introSkip = true; }
addEventListener('keydown', e => { keys[e.code] = true;
  if (e.code === 'Space' && !intro && !arrowCam) jumpQ = true;
  if (e.code === 'Escape' && drawing) {      // back out of the shot
    drawing = false; drawT = 0; holdT = 0; if (audio.drawCreak) audio.drawCreak(0); }
  });
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('keydown', skipIntro);
addEventListener('mousedown', skipIntro);
addEventListener('touchstart', skipIntro, { passive: true });

if (!IS_TOUCH) {
  canvas.addEventListener('mousedown', e => {
    if (!(started && !intro && !arrowCam && document.pointerLockElement)) return;
    if (e.button === 2 && drawing) {          // right-click — back out of the shot
      drawing = false; drawT = 0; holdT = 0; if (audio.drawCreak) audio.drawCreak(0);
    } else if (e.button === 0) drawing = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0 && drawing) { drawing = false; loose(); } });
  addEventListener('contextmenu', e => { if (document.pointerLockElement) e.preventDefault(); });
  addEventListener('mousemove', e => {
    if (!document.pointerLockElement) return;
    player.yaw -= e.movementX * 0.0023;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * 0.0023));
  });
} else {
  document.body.classList.add('touch');
  // left stick
  const stick = document.getElementById('stickL'), knob = document.getElementById('knobL');
  let moveVec = { x: 0, y: 0 }, stickId = null, lookId = null, lastLook = null;
  let shootId = null, lastShoot = null;
  window.moveVec = moveVec;
  addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.40 && t.clientY > innerHeight * 0.58 && stickId === null) {
        stickId = t.identifier;
        // float to the thumb, but CLAMP it to the lower-left — never drifts
        // toward the middle of the screen
        const lx = Math.max(14, Math.min(innerWidth * 0.20, t.clientX - 59));
        const lb = Math.max(20, Math.min(innerHeight * 0.26, innerHeight - t.clientY - 59));
        stick.style.left = lx + 'px';
        stick.style.bottom = lb + 'px';
      } else if (lookId === null && t.target.id !== 'shootBtn') {
        lookId = t.identifier; lastLook = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });
  addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        const r = stick.getBoundingClientRect();
        const cx = r.left + 59, cy = r.top + 59;
        let vx = (t.clientX - cx) / 59, vy = (t.clientY - cy) / 59;
        const l = Math.hypot(vx, vy); if (l > 1) { vx /= l; vy /= l; }
        moveVec.x = vx; moveVec.y = vy;
        knob.style.left = (50 + vx * 38) + '%'; knob.style.top = (50 + vy * 38) + '%';
      } else if (t.identifier === lookId) {
        player.yaw -= (t.clientX - lastLook.x) * 0.0042;
        player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - (t.clientY - lastLook.y) * 0.0042));
        lastLook = { x: t.clientX, y: t.clientY };
      } else if (t.identifier === shootId) {
        // drag while holding the draw button = aim. Slightly slower
        // than free-look: you're at full draw, breathing.
        player.yaw -= (t.clientX - lastShoot.x) * 0.0034;
        player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - (t.clientY - lastShoot.y) * 0.0034));
        lastShoot = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });
  addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; moveVec.x = moveVec.y = 0;
        knob.style.left = '50%'; knob.style.top = '50%'; }
      if (t.identifier === lookId) lookId = null;
      if (t.identifier === shootId) {
        shootId = null; drawing = false;
        const sb = document.getElementById('shootBtn');
        // drag your thumb off the trigger and let go = back out of the
        // shot. Lift it on the button = loose. (cancel ≈ "tap fire again")
        const r = sb.getBoundingClientRect(), m = 46;
        const off = t.clientX < r.left - m || t.clientX > r.right + m
                 || t.clientY < r.top - m || t.clientY > r.bottom + m;
        if (off) { drawT = 0; holdT = 0; if (audio.drawCreak) audio.drawCreak(0); }
        else loose();
        sb.classList.remove('drawing');
      }
    }
  });
  // iOS fires touchcancel (not touchend) on system gestures, alerts,
  // notification-center pulls — without this the stick/draw gets STUCK
  addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; moveVec.x = moveVec.y = 0;
        knob.style.left = '50%'; knob.style.top = '50%'; }
      if (t.identifier === lookId) lookId = null;
      if (t.identifier === shootId) { shootId = null; drawing = false; drawT = 0; document.getElementById('shootBtn').classList.remove('drawing'); }
    }
  });
  const btn = document.getElementById('shootBtn');
  btn.addEventListener('touchstart', e => {
    e.preventDefault();
    if (shootId !== null || intro || arrowCam) return;  // 2nd finger / wake-up / mid-chase
    const t = e.changedTouches[0];
    shootId = t.identifier; lastShoot = { x: t.clientX, y: t.clientY };
    drawing = true; btn.classList.add('drawing');
  }, { passive: false });
  // ── oars: circular-drag rowing pads. Track the angle your finger sweeps
  // around the pad center; the arc per frame becomes that oar's drive. ──
  const oL = document.getElementById('oarL'), oR = document.getElementById('oarR');
  function setupOar(el, side) {                 // side: 'L' | 'R'
    let id = null, lastAng = 0;
    const center = () => { const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    el.addEventListener('touchstart', e => { e.preventDefault();
      if (!inCanoe || id !== null) return;
      const t = e.changedTouches[0]; id = t.identifier;
      const c = center(); lastAng = Math.atan2(t.clientY - c.y, t.clientX - c.x);
      el.classList.add('rowing');
    }, { passive: false });
    document.addEventListener('touchmove', e => {
      if (id === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        const c = center();
        const a = Math.atan2(t.clientY - c.y, t.clientX - c.x);
        let d = a - lastAng;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        if (side === 'L') oarLDrive += Math.abs(d); else oarRDrive += Math.abs(d);
        lastAng = a;
      }
    }, { passive: false });
    const end = e => { for (const t of e.changedTouches)
      if (t.identifier === id) { id = null; el.classList.remove('rowing'); } };
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
  }
  setupOar(oL, 'L'); setupOar(oR, 'R');
  const jb = document.getElementById('jumpBtn');
  jb.addEventListener('touchstart', e => { e.preventDefault();
    if (!intro && !arrowCam) jumpQ = true; }, { passive: false });
}

// ───────────────────────── HUD ─────────────────────────
// the hunter's voice — quiet, weathered, real. Few words. He states
// facts and lets them sit. Same keys, same hooks; terser lines.
const LINES2 = {
"corrupt": ["Something's wrong here.",
            "Don't touch the weeping ones.",
            "That tree breathed.",
            "It took a sip of me."],
"wake": [
"Still here.",
"Eyes open. Good.",
"Up before the sun. Like always.",
"Another morning.",
"The woods didn't take me."
],
"killClean": [
"Down. Clean.",
"Folded right there.",
"Didn't suffer. Good.",
"One breath, then none.",
"Quick. The way it should be.",
"No last steps. Just quiet.",
"Dead before the fear got there."
],
"killHead": [
"Through the skull. Quick.",
"Lights out, all at once.",
"Right behind the eye. Done.",
"Dropped mid-stride.",
"Clean as it gets."
],
"killSuffer": [
"Took too long. My fault.",
"That one's on me.",
"Bad shot. It paid for it.",
"I owed it better.",
"Made it hard. Shouldn't have."
],
"killWolf": [
"Came for me. Wrong call.",
"It hunted. So do I.",
"One less in the dark.",
"Teeth met the arrow first."
],
"killBull": [
"Big one down.",
"It charged. I held.",
"Ground's quiet again.",
"Settled."
],
"killCryptid": [
"The black stag's dead.",
"Real blood after all.",
"Answered it the only way I know."
],
"woundHead": [
"Grazed the skull. Now it knows.",
"Off the bone. Bad luck.",
"An inch high. My miss."
],
"woundVitals": [
"Caught the lungs.",
"It won't go far.",
"Blood's bright. Won't be long."
],
"woundLeg": [
"Took the shoulder.",
"It's limping. I'm not.",
"On three legs now."
],
"woundGut": [
"Gut shot. The slow kind.",
"Low and bad. I hate it.",
"It'll lie down. I'll be there."
],
"woundHind": [
"Tagged the haunch. Ugly.",
"Caught it going away.",
"Long evening for both of us."
],
"bloodTrail": [
"Blood on the leaves.",
"Steady drops. It's paying out.",
"Trail reads clear.",
"Bright and frothing. Lungs."
],
"pursuit": [
"It runs. I follow.",
"I don't chase fast. I chase sure.",
"After the blood now.",
"It's spending what it can't spare."
],
"miss": [
"Missed.",
"Pulled it. My fault.",
"Wide. Gone.",
"That was me, not the bow."
],
"longShot": [
"Long way off. Took it anyway.",
"Farther than it should've worked.",
"Good shot. I'll take it.",
"Long one. Clean."
],
"harvest": [
"Knife in. Steam out.",
"Heart first.",
"Eat what I kill.",
"Meat, hide, heat. That's it."
],
"packFull": [
"Pack's full.",
"Can't carry more.",
"That'll do."
],
"hungry": [
"Hands are shaking. Need to eat.",
"Empty going on hollow.",
"Been too long since a kill."
],
"nightFall": [
"Light's going.",
"Dark coming on. Stay sharp.",
"Sun quits early here.",
"Dusk. Things wake up now."
],
"dawn": [
"Morning. Made it.",
"First light. Still here.",
"Night's done.",
"Sun's up. Good."
],
"wolfNear": [
"Something's out there.",
"Birds went quiet.",
"Being followed.",
"Eyes in the trees."
],
"bullWarn": [
"Head's down. It's decided.",
"Hear that snort. Move.",
"It's pawing the dirt."
],
"staredAt": [
"It's watching. Doesn't blink.",
"Those eyes again.",
"Standing where no light goes. Watching."
],
"death": [
"Cold now.",
"My turn this time.",
"The books balance.",
"I was the warm thing."
],
"idle": [
"Just me and the woods.",
"Eat what I kill. That's the deal.",
"Quiet again.",
"Lost count of the days.",
"Every tree looks the same.",
"Talk to myself. Beats listening."
]
};   // the hunter's voice
const _saidRecent = [];
function say(cat, ms = 3400) {
  const pool = LINES2 && LINES2[cat];
  if (!pool || !pool.length) return;
  let tries = 6, line;
  do { line = pool[(Math.random() * pool.length) | 0]; }
  while (_saidRecent.includes(line) && --tries > 0);
  _saidRecent.push(line);
  if (_saidRecent.length > 12) _saidRecent.shift();
  toast(line, ms);
}
window._say = say;

let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.opacity = 0, ms);
}
function pick(arr) { return arr[Math.random() * arr.length | 0]; }
function renderNotes() {
  // arrows you have on hand (you feel it when it's low), the meat you carry
  // as solid marks, and the meat laid by at the base as hollow ones.
  const lowCls = player.arrows <= 3 ? ' class="low"' : '';
  const ammo = '<span class="ammo"' + lowCls + '>➤ ' + player.arrows + '</span>';
  const carried = player.meat ? '  ' + '◆'.repeat(player.meat) : '';
  const kept = player.stored > 0
    ? '  <span class="kept">'
      + (player.stored > 8 ? '◇×' + player.stored : '◇'.repeat(player.stored))
      + '</span>'
    : '';
  document.getElementById('notes').innerHTML = ammo + carried + kept;
}
function renderHP() {
  document.getElementById('hpfill').style.width = Math.max(0, player.hp) + '%';
  // health is invisible until it matters
  document.getElementById('hp').style.opacity = player.hp < 99 ? 1 : 0;
}

// ───────────────────────── main loop ─────────────────────────
// preallocated scratch for the day/night math (no per-frame Vector3/Color)
const _sunAz = new THREE.Vector3(-0.86, 0, -0.28).normalize();
const _sunDir = new THREE.Vector3();
const _CLOUD_NIGHT = new THREE.Color(0x171c2a);
const clock = new THREE.Clock();
window._clock = clock;
function tick() {
  requestAnimationFrame(tick);
  try { tickBody(); } catch (e) { window._tickErr = String(e.stack || e); }
}
let simDt = null;
window._sim = (seconds) => {   // test hook: advance the world while the
  const steps = Math.round(seconds * 30);   // page is rAF-throttled
  for (let i = 0; i < steps; i++) { simDt = 1 / 30; tickBody(); }
  simDt = null;
};
function tickBody() {
  const dt = simDt ?? Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (audio.pumpTitle) audio.pumpTitle(dt);   // keep the title theme alive (runs pre-game too)
  // auto-launch: after the theme's opening swell, the cinematic dive begins
  if (titleArmed && !launching && !started && (t - titleArmT) > 6.5) beginLaunch();
  // kill-feel: juice timers decay on REAL time (hitstop scales the
  // world dt further down, where animals/arrows update)
  if (kickT > 0) kickT -= dt;
  if (camShakeT > 0) camShakeT -= dt;
  if (fovPunchT > 0) fovPunchT -= dt;
  puffUpdate(dt);                  // blood puff plays through the hitstop
  windUniforms.uTime.value = t;
  waterUniforms.uTime.value = t;
  skyUniforms.uT.value = t;
  for (const c of clouds) { c.position.x += c.userData.v * dt * 2; if (c.position.x > 800) c.position.x = -800; }

  // ── day/night cycle — night owns ~40% of the loop ──
  // time-warp: days drift long and slow, the dark falls (and passes) faster
  const rawPhase = (t / DAY_LEN) % 1;              // 0 = golden hour
  const phase = rawPhase - 0.04 * Math.sin(rawPhase * Math.PI * 2);
  const elev = 0.35 * Math.cos(phase * Math.PI * 2) - 0.02;
  const night = Math.max(0, Math.min(1, (0.05 - elev) / 0.18));
  const azS = Math.sqrt(Math.max(0.05, 1 - elev * elev));
  _sunDir.set(_sunAz.x * azS, Math.max(-0.5, elev), _sunAz.z * azS).normalize();
  skyUniforms.sunDir.value.copy(_sunDir);
  skyUniforms.night.value = night;
  sun.intensity = 0.12 + 2.5 * Math.max(0, Math.min(1, (elev + 0.1) * 3.2)) * (1 - night * 0.86);
  // dawn is pale and anemic — color drains, then golden hour curdles back in
  const dawn = (phase > 0.7 ? Math.max(0, 1 - Math.abs(phase - 0.88) / 0.12) : 0) * (1 - night);
  sun.color.copy(SUN_WARM).lerp(SUN_NIGHT, night);
  if (dawn > 0) sun.color.lerp(SUN_DAWN, dawn * 0.7);
  hemi.intensity = (0.72 - night * 0.44) * (1 - dawn * 0.18);
  scene.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, night);
  if (dawn > 0) scene.fog.color.lerp(FOG_DAWN, dawn * 0.65);
  scene.background.copy(scene.fog.color);
  // fog closes in after dark — dusk stays open, true night clamps the world to ~60m
  const fogClose = night * Math.sqrt(night);
  scene.fog.near = 60 - 26 * fogClose;
  scene.fog.far = 340 - 170 * fogClose;
  // moon rides opposite the sun — only shows once it clears the horizon
  _moonDir.copy(_sunDir).multiplyScalar(-1);
  moon.position.set(player.x + _moonDir.x * 820, _moonDir.y * 820, player.z + _moonDir.z * 820);
  moon.material.opacity = night * Math.max(0, Math.min(1, (_moonDir.y - 0.06) * 6)) * 0.9;
  updateFireflies(t, night);
  updateButterflies(dt, t);
  corruptionUpdate(dt, t);
  updateMist(t, night);
  // flower trample: live player bends instantly; the wake (zw) trails and
  // eases to the player over ~5s (frame-rate-independent), so a flattened
  // corridor pops back upright ~5s after you pass.
  {
    const tv = trampleUniform.value;
    tv.x = player.x; tv.y = player.z;
    const k = 1 - Math.exp(-dt / 5);
    tv.z += (player.x - tv.z) * k; tv.w += (player.z - tv.w) * k;
  }
  if (window._updateGrassField) window._updateGrassField();
  if (window._updateFlowerField) window._updateFlowerField();
  if (started) cryptidUpdate(night);
  farDisc.material.color.copy(scene.fog.color);
  farDisc.position.x = player.x; farDisc.position.z = player.z;
  landmarkUpdate(dt, t);
  updateWildfires(t, night);
  if (window._cloudMat) {
    window._cloudMat.color.setHex(0xf0dcc2).lerp(_CLOUD_NIGHT, night);
    window._cloudMat.opacity = 0.88 - night * 0.55;
  }
  if (window._glitter) {
    const g = window._glitter;
    g.material.opacity = (1 - night) * (0.3 + 0.25 * Math.sin(t * 2.3));
    g.position.x = Math.sin(t * 0.4) * 0.8;   // shimmer drift
  }
  window._night = night;

  // ── the wake-up state machine — runs while intro is armed ──
  if (started && intro) {
    introT += dt;
    if (introSkip) introT = INTRO_DUR;        // a tap fast-forwards to the end
    let open;            // 0..1, 1 = fully open
    if (introT < 0.55)      open = 0.62 * (introT / 0.55);
    else if (introT < 0.95) open = 0.62 - 0.42 * ((introT - 0.55) / 0.40);
    else if (introT < 1.55) open = 0.20 + 0.80 * ((introT - 0.95) / 0.60);
    else if (introT < 1.85) open = 1.0 - 0.30 * ((introT - 1.55) / 0.30);
    else                    open = 0.70 + 0.30 * Math.min(1, (introT - 1.85) / 0.55);
    setLids(-100 * open, (1 - open) * 0.55);
    const bp = Math.max(0, Math.min(1, (introT - 0.9) / 1.7));
    const be = bp * bp * (3 - 2 * bp);        // smoothstep — a deliberate reach
    bow.position.set(0.34, -1.35 + (-0.4 - -1.35) * be, -0.62);
    bow.rotation.set(0.05 + (1 - be) * 0.25, -0.55, 0.21 + (1 - be) * 0.18);
    if (introT >= INTRO_DUR) endIntro();
  }

  // ── the hunter talks to himself, sparingly ──
  if (started && !dead && !intro) {
    const M = tickBody;
    if (night > 0.6 && !M._saidNight) { M._saidNight = true; M._saidDawn = false; say('nightFall', 4200); }
    if (night < 0.15 && M._saidNight && !M._saidDawn) { M._saidDawn = true; M._saidNight = false; say('dawn', 4200); }
    M._idleT = (M._idleT ?? 75) - dt;
    if (M._idleT <= 0) { M._idleT = 100 + Math.random() * 80; if (Math.random() < 0.5) say('idle', 4600); }
    // being stalked — first time the danger drone would be rising
    let wd = 1e9;
    for (const an2 of animals) if (an2.cfg.hunts && !an2.dead && an2.aggro)
      wd = Math.min(wd, Math.hypot(an2.obj.position.x - player.x, an2.obj.position.z - player.z));
    if (wd < 30 && (M._wolfSaidT ?? 0) < t - 45) { M._wolfSaidT = t; say('wolfNear', 3600); }
    // following blood: near fresh blood while something out there is wounded
    const hasWounded = animals.some(an2 => an2.state === 'wounded');
    if (hasWounded) {
      M._trailT = (M._trailT ?? 0) - dt;
      if (M._trailT <= 0) { M._trailT = 18 + Math.random() * 14; say(Math.random() < 0.5 ? 'bloodTrail' : 'pursuit', 3400); }
    } else M._trailT = 2;
  }

  if (started && !dead && !intro) {
    // movement
    let mx = 0, mz = 0;
    if (!IS_TOUCH) {
      mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    } else { mx = window.moveVec.x; mz = -window.moveVec.y; }
    // full stick / shift = sprint (LOUD). Half-stick = quiet stalk.
    const stickMag = Math.min(1, Math.hypot(mx, mz));
    const sprinting = (!IS_TOUCH && keys.ShiftLeft && stickMag > 0)
      || (IS_TOUCH && stickMag > 0.92);
    // a quiet stalk = a half-stick creep, OR moving while drawn (you step soft
    // when you're trying to thread an arrow). Feeds the continuous dB model.
    const stalking = (!sprinting && stickMag > 0.02 && (stickMag < 0.55 || drawing));
    setNoise(stickMag > 0.02 ? (sprinting ? 2 : 1) : 0, stalking);
    // 0..1 gait level for audio footsteps + head-bob: stalk is quiet/slow.
    _moveLvl = stickMag <= 0.02 ? 0
      : (sprinting ? 1 : 0.4 + stickMag * 0.4);
    if (stickMag > 0.05 && !bflyUsed) releaseButterflies();   // first steps stir them up
    const sprint = sprinting ? 1.65 : 1;
    const sp = 5.4 * sprint * (drawing ? 0.5 : 1) * (IS_TOUCH ? Math.max(stickMag, 0.25) : 1);
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    let nx = player.x + (-sin * mz + cos * mx) * sp * dt;
    let nz = player.z + (-cos * mz - sin * mx) * sp * dt;
    if (inCanoe) {
      // ── canoe rowing: a CIRCULAR motion, one oar each side ──
      // each oar feeds the arc your finger swept this frame; the motion
      // pushes forward AND yaws away from that side, so circling only the
      // left oar curls you right. Keep both going, smooth, to track straight.
      if (!IS_TOUCH) { if (keys.KeyA) oarLDrive += 5.0 * dt; if (keys.KeyD) oarRDrive += 5.0 * dt; }
      const THRUST = 0.95, YAWK = 0.085;
      if (oarLDrive > 0) { canoeSpd += oarLDrive * THRUST; player.yaw += oarLDrive * YAWK; }
      if (oarRDrive > 0) { canoeSpd += oarRDrive * THRUST; player.yaw -= oarRDrive * YAWK; }
      // a soft, throttled paddle-dip while actually rowing
      tickBody._rowSnd = (tickBody._rowSnd || 0) - dt;
      if (oarLDrive + oarRDrive > 0.5 && tickBody._rowSnd <= 0) {
        tickBody._rowSnd = 0.45; if (audio.impact) audio.impact('water', 0.55);
      }
      oarLDrive = 0; oarRDrive = 0;
      canoeSpd = Math.min(7, canoeSpd) * Math.pow(0.42, dt);   // glide + drag
      const cs = Math.sin(player.yaw), cc = Math.cos(player.yaw);
      const lim2 = WORLD * 0.47;
      let cx = Math.max(-lim2, Math.min(lim2, player.x - cs * canoeSpd * dt));
      let cz = Math.max(-lim2, Math.min(lim2, player.z - cc * canoeSpd * dt));
      const wy = heightAt(cx, cz);
      if (wy > WATER_Y - 0.12) {            // nosed into the shallows → step out onto land
        inCanoe = false; canoeSpd = 0;
        player.x = cx; player.z = cz; player.y = wy; grounded = true; player.airY = wy;
      } else {
        player.x = cx; player.z = cz; player.y = WATER_Y; grounded = true; player.airY = WATER_Y;
      }
      _moveLvl = Math.min(1, canoeSpd / 6);
    } else {
    // tree collision
    for (const tr of TREES) {
      const d = Math.hypot(nx - tr.x, nz - tr.z);
      if (d < tr.r + 0.5) {
        const push = (tr.r + 0.5 - d);
        nx += (nx - tr.x) / (d || 1) * push; nz += (nz - tr.z) / (d || 1) * push;
      }
    }
    // ── step-on props: clamber onto low surfaces, block tall ones ──
    // If a prop's `top` is within STEP_REACH of the feet, stand on it
    // (effective ground rises to `top`); otherwise it blocks like a tree.
    // feetY uses player.y so you can jump-onto props slightly above you.
    const STEP_REACH = 1.1;
    let stepGround = -Infinity;
    const feetY = player.y;
    for (const sp2 of STEPPROPS) {
      const d = Math.hypot(nx - sp2.x, nz - sp2.z);
      if (d >= sp2.r + 0.5) continue;
      if (sp2.top <= feetY + STEP_REACH) {
        if (sp2.top > stepGround) stepGround = sp2.top;   // clamber on
      } else {
        const push = (sp2.r + 0.5 - d);                   // too tall — block
        nx += (nx - sp2.x) / (d || 1) * push; nz += (nz - sp2.z) / (d || 1) * push;
      }
    }
    const lim = WORLD * 0.47;
    nx = Math.max(-lim, Math.min(lim, nx)); nz = Math.max(-lim, Math.min(lim, nz));
    const ny = heightAt(nx, nz);
    // ── jump / fall: light, forgiving hop (Apple-simple) ──
    let groundY = (ny > WATER_Y - 0.4) ? ny : player.y;
    if (stepGround > groundY) groundY = stepGround;       // standing on a prop
    if (ny > WATER_Y - 0.4) { player.x = nx; player.z = nz; }
    // walking off a ledge (stepped down >0.35m) starts a real fall through
    // the existing jump integrator instead of snapping the camera down.
    if (grounded && groundY < player.y - 0.35) {
      grounded = false; playerVy = 0; player.airY = player.y;
    }
    // a big, floaty Halo-style hop — higher apex (~2.2m), more hang time
    if (jumpQ && grounded) { playerVy = 7.7; grounded = false; }
    jumpQ = false;
    if (!grounded) {
      playerVy -= 13 * dt; player.airY = (player.airY ?? groundY) + playerVy * dt;
      if (player.airY <= groundY) { player.airY = groundY; playerVy = 0; grounded = true; }
      player.y = player.airY;
    } else { player.y = groundY; player.airY = groundY; }
    // stepped off the bank into deep water → board the canoe
    if (ny <= WATER_Y - 0.4 && stickMag > 0.02) {
      inCanoe = true; canoeSpd = 2.0; player.x = nx; player.z = nz; player.y = WATER_Y;
    }
    }  // end !inCanoe walk branch

    // bow — at full draw it RAISES to your eye: grip near center,
    // nock at the cheek, slight zoom like focusing down the arrow
    // two-phase draw: a FAST whip-up of the bow into aim pose (~0.12s),
    // THEN a slow power build. Pressing snaps the bow up immediately;
    // the power (drawT) then climbs at a longbow's deliberate pace.
    if (drawing) {
      raiseT = Math.min(1, raiseT + dt / 0.12);  // whip up — ~0.12s to aim
      drawT = Math.min(1, drawT + dt / 1.5);     // slow power build — ~1.5s to full
      if (drawT >= 1) holdT += dt; else holdT = 0;
    } else {
      raiseT = Math.max(0, raiseT - dt * 6);     // bow drops back fast on release
      drawT = Math.max(0, drawT - dt * 4); holdT = 0;
    }
    if (drawing && drawT > 0 && audio.drawCreak) audio.drawCreak(Math.min(1, drawT + holdT * 0.12));
    if (drawing && IS_TOUCH && navigator.vibrate) {
      hapticT -= dt;
      if (hapticT <= 0) {                 // tighter, stronger buzz as it loads
        hapticT = 0.13 - drawT * 0.08;
        navigator.vibrate(Math.round(6 + drawT * drawT * 26));
      }
    }
    const _ch = document.getElementById('crosshair');
    _ch.classList.toggle('drawn', drawT > 0.5);
    // the reticle stays DEAD CENTER — it always marks exactly where the
    // arrow goes. The aim still wanders, but as the camera sway below
    // drifts the whole VIEW under the fixed reticle (truthful, not a lie).
    _ch.style.transform = 'translate(-50%,-50%)' + (drawT > 0.5 ? ' scale(2.0)' : '');
    const e = drawT * drawT * (3 - 2 * drawT);  // smoothstep — power/string pull
    const r = raiseT * raiseT * (3 - 2 * raiseT); // smoothstep — the whip-up raise
    // the bow POSE is driven by the whip (raiseT): it snaps up into the
    // aim anchor in ~0.12s. The string PULL (e, from drawT) then builds
    // slowly behind it. So you're aiming instantly, powering up after.
    // full draw = a real longbow anchor: the riser stands nearly
    // VERTICAL just left of the sight line, the arrow runs dead ahead
    // under the eye, the string is at the cheek. You look down the shaft.
    // the riser sits a touch LEFT of the sight line — visible in frame,
    // off to the side so you look past it, but never off-screen or dead
    // center where the wood blocks your shot.
    bow.position.set(0.34 + (-0.12 - 0.34) * r,    // left of center, still in view
                     -0.4 + (-0.12 + 0.4) * r,     // a touch below the eye
                     -0.62 + (-0.5 + 0.62) * r);   // drawn in close to the face
    bow.rotation.set(0.05 - 0.02 * r,              // limbs vertical
                     -0.55 + 0.5 * r,              // face mostly downrange
                     0.21 - 0.13 * r);             // a little cant — held just aside
    // walk bob + breath — you're holding it, not gliding with it
    bobPhase += dt * (mx || mz ? 7.5 : 1.6);
    bow.position.y += Math.sin(bobPhase) * (mx || mz ? 0.012 : 0.004);
    bow.position.x += Math.cos(bobPhase * 0.5) * (mx || mz ? 0.006 : 0.002);
    let targetFov = 70 - e * 4.5;   // gentle sighting focus — not a lockout
    // kill-feel: lethal hit = brief 0.96 punch-in, easing back out
    if (fovPunchT > 0) targetFov *= 0.96 + 0.04 * (1 - fovPunchT / PUNCH_DUR);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = targetFov; camera.updateProjectionMatrix();
    }
    updateBowString(e);

    // survival: hunger gnaws after ~2 min without eating — hunt or fade
    const starving = t - player.lastAte > 120;
    if (starving) {
      player.hp -= dt * 0.7; renderHP();
      if (!tickBody._hungerWarned || t - tickBody._hungerWarned > 30) {
        tickBody._hungerWarned = t;
        say('hungry', 4200);
      }
      if (player.hp <= 0 && !dead) { dead = true;
        resetDrawState();
        say('death', 4200);
        setTimeout(() => { player.hp = 100; player.meat = 0;
          player.lastAte = clock.elapsedTime; player.x = SPAWN.x; player.z = SPAWN.z;
          player.yaw = SPAWN.yaw; player.pitch = SPAWN.pitch;
          player.y = heightAt(player.x, player.z);
          dead = false; renderHP(); beginIntro(); }, 3500);
      }
    }
    // packed meat saves you automatically when it gets bad
    if (player.hp < 35 && player.meat > 0 && !dead) {
      player.meat--; player.hp = Math.min(100, player.hp + 40);
      player.lastAte = t; renderNotes(); renderHP();
      toast('You eat from the pack, walking. Chewing is for the safe.');
    }
    // slow regen, only when fed
    if (!starving && t - player.lastHit > 8 && player.hp < 100) {
      player.hp = Math.min(100, player.hp + dt * 6); renderHP();
    }

    // what fell with you, if you fell carrying
    if (meatCache) cacheUpdate(t);
    // lay meat by at the cove
    baseUpdate(t, dt);
    // pick up spent arrows you walk over (jump to reach the high ones)
    arrowPickup();
    quiverPickup();

    // dawn relief — the night ends and you are still in it
    if (night > 0.65) sawNight = true;
    else if (sawNight && night < 0.05) {
      sawNight = false;
      toast('Morning. You are still the eater.', 5200);
      if (typeof audio._motif === 'function') {
        try { audio._motif(); } catch (e) { /* the hymn is optional */ }
      }
    }

    // feed the score — the danger drone tracks the nearest THREAT: a live
    // wolf/predator, or a bear once it's wary/charging (so the music tenses
    // as you near a bear's circle and eases as you skirt it).
    let wolfDist = 999;
    for (const a of animals) {
      if (a.dead) continue;
      const threat = a.cfg.hunts
        || (a.cfg.bearish && (a.state === 'wary' || a.state === 'charge' || a.aggro));
      if (!threat) continue;
      const dd = Math.hypot(a.obj.position.x - player.x, a.obj.position.z - player.z);
      if (dd < wolfDist) wolfDist = dd;
    }
    // exertion: a sprint loads it fast, a jog gently; holding a full draw
    // adds strain. It eases UP quicker than it recovers, so you have to
    // actually stop and catch your breath.
    let exTarget = sprinting ? 1 : (_moveLvl > 0.45 ? 0.5 : 0);
    if (drawing && drawT > 0.95) exTarget = Math.max(exTarget, 0.35 + Math.min(0.5, holdT * 0.12));
    breathLoad += (exTarget - breathLoad) * Math.min(1, dt * (exTarget > breathLoad ? 0.7 : 0.3));
    audio.update(dt, {
      moving: !!(mx || mz), sprint: sprinting, _moveLvl,
      wolfDist, lakeDist: Math.hypot(player.x - 70, player.z + 90),
      night: window._night || 0, hp: player.hp, breath: breathLoad,
      px: player.x, pz: player.z, yaw: player.yaw,
    });
  }

  // canoe: float the hull under you, swap the controls
  canoe.visible = inCanoe && started;
  if (canoe.visible) { canoe.position.set(player.x, WATER_Y - 0.16, player.z);
    canoe.rotation.y = player.yaw; }
  if (inCanoe !== _wasCanoe) { _wasCanoe = inCanoe;
    document.body.classList.toggle('canoe', inCanoe); }

  // title/dive: open the fog so the aerial vista isn't washed to haze
  if (!started) { scene.fog.far = 900; }
  if (!started && !launching) {
    // TITLE: a vast, high, slowly-orbiting aerial of the whole valley —
    // the world should feel enormous before you're dropped into it.
    const a = t * 0.012;
    camera.position.set(Math.cos(a) * 150, 165, Math.sin(a) * 150);
    camera.lookAt(0, 6, 0);
    camera.rotation.order = 'YXZ';
  } else if (launching) {
    // the dive: a single smooth dolly from the frozen aerial down to the
    // spawn eye. Position AND look-target both ease from exactly where the
    // title left them — no snap, no jitter — while a black veil rises.
    launchT += dt;
    const lp = Math.min(1, launchT / LAUNCH_DUR);
    const e = lp * lp * (3 - 2 * lp);     // smoothstep — eases in AND out
    const tx = SPAWN.x, tz = SPAWN.z, ty = heightAt(tx, tz) + EYE;
    camera.position.set(
      _diveFrom.x + (tx - _diveFrom.x) * e,
      _diveFrom.y + (ty - _diveFrom.y) * e,
      _diveFrom.z + (tz - _diveFrom.z) * e);
    // look-target eases from the title's (0,6,0) to the spawn ground —
    // starting identical to the title means the first frame doesn't jump
    const lgy = heightAt(tx, tz) + 1.5;
    camera.lookAt(0 + (tx - 0) * e, 6 + (lgy - 6) * e, 0 + (tz - 0) * e);
    camera.rotation.order = 'YXZ';
    const veil = document.getElementById('veil');
    if (veil) veil.style.opacity = Math.max(0, (lp - 0.62) / 0.38);  // black in over the last ~38%
    if (lp >= 1) {                        // arrive → wake up
      launching = false;
      started = true; bow.visible = true; updateBowString(0);
      document.getElementById('hud').style.opacity = 1;
      beginIntro();                       // lids shut → eyes open in the grass
      if (veil) veil.style.opacity = 0;   // the eyelids take over the black
    }
  } else if (intro) {
    // waking: camera starts LOW in the grass, pitched up at the sky,
    // then rises and levels to standing eye height with a slight sway.
    const rp = Math.max(0, Math.min(1, (introT - 0.6) / 2.0));
    const re = rp * rp * (3 - 2 * rp);            // smoothstep stand-up
    const ground = player.y;
    const lowEye = 0.35, eyeH = EYE;
    camera.position.set(player.x, ground + lowEye + (eyeH - lowEye) * re, player.z);
    camera.rotation.order = 'YXZ';
    const pitchUp = 0.9;
    const sway = (1 - re) * 0.05 + 0.012;
    camera.rotation.x = (pitchUp + (player.pitch - pitchUp) * re)
      + Math.sin(t * 1.3) * sway * 0.6;
    camera.rotation.y = player.yaw + Math.sin(t * 0.9) * sway;
  } else if (arrowCam && arrowCam.mode === 'follow'
             && arrowCam.rec && !arrowCam.rec.stuck && arrows.indexOf(arrowCam.rec) !== -1
             && (arrowCam.rt += dt) < 1.8) {
    // ARROW-CAM: chase the shaft in flight from just behind & above,
    // looking down its line — you ride the shot to where it lands.
    const rec = arrowCam.rec, ap = rec.m.position;
    _acTmp.copy(rec.v); const spd = _acTmp.length() || 1; _acTmp.multiplyScalar(1 / spd);
    const ideal = _acLook.copy(ap).addScaledVector(_acTmp, -2.4); ideal.y += 0.9;
    // ease the camera in from wherever it was (the shot moment)
    camera.position.lerp(ideal, Math.min(1, dt * 7));
    camera.lookAt(ap.x + _acTmp.x * 6, ap.y + _acTmp.y * 6, ap.z + _acTmp.z * 6);
    camera.rotation.order = 'YXZ';
  } else if (arrowCam) {
    // the arrow landed/stuck — glide the view back to the hunter, then release
    if (arrowCam.mode !== 'return') { arrowCam.mode = 'return'; arrowCam.rt = 0.5; }
    arrowCam.rt -= dt;
    _acTmp.set(player.x, player.y + EYE, player.z);
    camera.position.lerp(_acTmp, Math.min(1, dt * 6));
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
    if (arrowCam.rt <= 0) arrowCam = null;
  } else {
    camera.position.set(player.x, player.y + EYE, player.z);
    camera.rotation.order = 'YXZ';
    // subtle head-bob — stronger at a sprint, damped while drawing, zero
    // when standing (bobPhase only advances while moving). Lateral sway is
    // rotated into world by yaw so it reads as a side-to-side gait.
    {
      const amp = _moveLvl * (1 - drawT * 0.7);
      if (amp > 0.001) {
        const bobY = Math.sin(bobPhase) * 0.035 * amp;
        const bobX = Math.cos(bobPhase * 0.5) * 0.022 * amp;
        camera.position.y += bobY;
        camera.position.x += Math.cos(player.yaw) * bobX;
        camera.position.z += -Math.sin(player.yaw) * bobX;
      }
    }
    // full draw is heavy: the aim breathes, and the longer you hold,
    // the worse it gets. The sway is real — the arrow inherits it.
    const swayA = drawT * drawT * 0.0044 + Math.min(holdT, 4) * 0.0019;
    camera.rotation.y = player.yaw
      + (Math.sin(t * 1.7) + 0.5 * Math.sin(t * 4.3)) * swayA;
    camera.rotation.x = player.pitch
      + (Math.cos(t * 2.3) * 0.8 + Math.sin(t * 5.1) * 0.4) * swayA;
    // kill-feel: release kick (pitch up, decays 120ms) + near-miss rattle
    if (kickT > 0) camera.rotation.x += 0.012 * (kickT / KICK_DUR);
    if (camShakeT > 0) {
      const s = camShakeT / SHAKE_DUR;
      camera.rotation.x += Math.sin(t * 97) * 0.011 * s;
      camera.rotation.y += Math.sin(t * 83) * 0.009 * s;
    }
  }
  sun.target.position.set(player.x, player.y, player.z);
  sun.position.set(player.x - 180, player.y + 95, player.z - 60);

  window._tickInfo = { f: (window._tickInfo?.f || 0) + 1, n: animals.length,
                       px: Math.round(player.x), pz: Math.round(player.z) };
  // scent + sanctuary — once per frame, every brain reads the same air
  scentM = started ? player.meat * 6 + (t < bloodedUntil ? 6 : 0) : 0;
  const atBase = started
    && Math.hypot(player.x - CAMP_X, player.z - CAMP_Z) < CAMP_SAFE;
  fireNear = atBase || (started && nearWildFire);   // a wild fire's ring keeps the predators back too
  // home has a voice: the jaw harp plays only while you're at the base
  if (audio.setBaseMusic) audio.setBaseMusic(atBase && !dead);

  // ── learn by needing it ── you wake staring at the sky with NOTHING on
  // screen. Only when YOU choose to look around / move does the left stick
  // fade in, with the single quote. After that, jump + bow reveal silently
  // as you work out of the base. (Buttons are touch-only; the quote is for all.)
  if (started && !intro && !dead && _revealStep < 3 && BASE_RING) {
    const bc = document.body.classList;
    const dB = Math.hypot(player.x - BASE_RING.x, player.z - BASE_RING.z);
    if (_revealStep === 0) {
      const looked = Math.abs(player.yaw - SPAWN.yaw) > 0.08
                  || Math.abs(player.pitch - SPAWN.pitch) > 0.08
                  || (window.moveVec && (window.moveVec.x || window.moveVec.y))
                  || keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
      if (looked) {
        _revealStep = 1;
        if (IS_TOUCH) bc.add('show-move');
        cinematic("I'm getting hungry.", 4600);   // the one and only opening line
      }
    } else if (_revealStep === 1 && dB > 7) { _revealStep = 2; if (IS_TOUCH) bc.add('show-jump'); }
    else if (_revealStep === 2 && dB > 11.5) { _revealStep = 3; if (IS_TOUCH) bc.add('show-bow'); }
  }
  // kill-feel hitstop: a connected arrow holds the world at 5% speed
  // for a few real frames (0.04s flesh / 0.09s lethal). No setTimeout —
  // juiceT burns down on real dt, world dt gets scaled while it lasts.
  let wdt = dt;
  if (juiceT > 0) { juiceT -= dt; wdt = dt * 0.05; }
  for (const a of animals) animalUpdate(a, wdt);
  arrowUpdate(wdt);
  if (USE_POST) {
    // night needs a softer bloom threshold so fireflies/stars breathe
    bloomPass.threshold = 0.85 - (window._night || 0) * 0.38;
    bloomPass.strength = 0.38 + (window._night || 0) * 0.34;
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});

// GPU context loss (backgrounded tab, memory pressure on iOS) — without
// this the canvas goes permanently black. Reload is the honest recovery.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  location.reload();
});

// ───────────────────────── boot ─────────────────────────
renderNotes(); renderHP();
loadAnimals().then(() => {
  document.getElementById('loadmsg').textContent = '';
}).catch(e => {
  document.getElementById('loadmsg').textContent = 'asset load failed: ' + e;
});

// dev/screenshot params: ?autostart=1&t=195&pos=-30,-30&yaw=2.2&pitch=0.05
{
  const q = new URLSearchParams(location.search);
  if (q.get('autostart')) {
    const boot = () => {
      if (!Object.keys(prefabs).length) { setTimeout(boot, 400); return; }
      started = true;
      bow.visible = true;
      updateBowString(0);
      // dev/screenshot path skips the wake-up unless ?intro=1 asks for it
      if (q.get('intro')) beginIntro(); else { intro = false; setLids(-100, 0); }
      document.getElementById('hud').style.opacity = 1;
      document.getElementById('title').style.display = 'none';
      if (q.get('t')) clock.elapsedTime = parseFloat(q.get('t'));
      if (q.get('pos')) { const [x, z] = q.get('pos').split(',').map(Number);
        player.x = x; player.z = z; }
      if (q.get('yaw')) player.yaw = parseFloat(q.get('yaw'));
      if (q.get('pitch')) player.pitch = parseFloat(q.get('pitch'));
    };
    boot();
  }
}

// ── title is two-beat ── first tap wakes the audio + starts the cinematic
// theme over the slow aerial of CONSUME (autoplay needs that first gesture);
// a second tap, or ~6.5s of letting it swell, dives in and fades the music.
let titleArmed = false, titleArmT = 0;
function onTitleTap() {
  if (launching || started) return;
  if (!titleArmed) {
    titleArmed = true; titleArmT = clock.elapsedTime;
    try { audio.start(); if (audio.titleTheme) audio.titleTheme(); } catch (e) {}
    return;                            // just the music + the cinematic title — not yet the dive
  }
  beginLaunch();                       // second tap → go
}
function beginLaunch() {
  if (launching || started) return;
  launching = true; launchT = 0;
  _diveFrom.copy(camera.position);    // freeze the dive origin — a clean dolly, no more orbit
  try { audio.start(); } catch (e) {}
  if (audio.fadeTitle) audio.fadeTitle(LAUNCH_DUR + 0.6);   // the theme fades as the world rushes up
  document.getElementById('title').style.opacity = 0;
  setTimeout(() => document.getElementById('title').style.display = 'none', 800);
  if (!IS_TOUCH) canvas.requestPointerLock();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}
// tap ANYWHERE to begin — no button, no instructions
document.getElementById('play').addEventListener('click', onTitleTap);
document.getElementById('title').addEventListener('click', onTitleTap);
document.getElementById('title').addEventListener('touchstart', (e) => { e.preventDefault(); onTitleTap(); }, { passive: false });
canvas.addEventListener('click', () => {
  if (started && !IS_TOUCH && !document.pointerLockElement) canvas.requestPointerLock();
});
{
  const muteEl = document.getElementById('mute');
  const toggle = (e) => { e.preventDefault(); e.stopPropagation();
    audio.setMuted(!audio.muted);
    muteEl.textContent = audio.muted ? '🔇' : '🔊'; };
  muteEl.addEventListener('click', toggle);
  muteEl.addEventListener('touchstart', toggle, { passive: false });
}

tick();
