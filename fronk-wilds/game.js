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
// cache-bust audio.js too (a static import would let the browser/Pages serve
// a stale audio engine — why new sounds didn't always reach the phone)
const { AudioEngine } = await import('./audio.js?ts=' + Date.now());

const audio = new AudioEngine();
window._audio = audio;

// ───────────────────────── config ─────────────────────────
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const WORLD = 860;            // square world size
const WATER_Y = 2.1;          // lake level
const EYE = 3.6;   // stand TALL — 2.3 then 2.85 still read short against the world's scale; this lifts the eyeline to a clear 6-foot-plus stance over the field
const CFG = IS_TOUCH
  ? { grass: 30000, trees: 2200, bushes: 380, rocks: 150, px: 2, shadow: 1536, segs: 230,
      flowers: 2600, tufts: 1700, mushrooms: 260, bedFlowers: 1300 }
  : { grass: 74000, trees: 4500, bushes: 620, rocks: 260, px: 2.5, shadow: 3072, segs: 360,
      flowers: 4800, tufts: 3100, mushrooms: 420, bedFlowers: 1900 };

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
  Deer:  { n: 16, speed: 2.7, gallop: 8.6, hp: 3, flee: 19, r: 0.7,
           keen: 1.2, aggroBias: 0.10, rear: 0.45, scale: 0.42, hpJit: true },
           // the staple: EVERYWHERE — wary, but a patient stalk earns the shot.
           // hard, not hopeless: stalk quiet to ~16m, stand still to ~8m.
  Stag:  { n: 4, speed: 2.5, gallop: 8.3, hp: 5, flee: 17, r: 0.95,
           keen: 1.05, aggroBias: 0.30, rear: 0.70, scale: 0.52, hpJit: true },
  Fox:   { n: 8, speed: 3.2, gallop: 8.8, hp: 1, flee: 11, r: 0.5,
           keen: 1.25, aggroBias: 0.05, rear: 0.2, scale: 0.45, darty: true },  // little critters — LOTS, tiny, JUKE when fleeing but approachable enough to chase down — fun to hunt
  Cow:   { n: 1, speed: 1.8, gallop: 6.2,  hp: 8, flee: 13, r: 1.6,
           keen: 0.5, aggroBias: 0.05, rear: 0.2, gait: 'sway', scale: 0.74, hpJit: true }, // was tree-tall (made the player feel tiny) — sized to a real cow
  Horse: { n: 2, speed: 3.0, gallop: 11.5, hp: 10, flee: 20, r: 1.6,
           keen: 1.2, aggroBias: 0.25, rear: 0.65, gait: 'smooth',
           hpJit: true, tanky: true, scale: 1.3 },        // 8-10 hits, impressive bolt
  // ── predator / territorial ──
  Wolf:  { n: 3, speed: 3.2, gallop: 8.8,  hp: 2, flee: 0,  r: 1.0,
           keen: 1.6,  aggroBias: 0.45, scale: 0.8,
           hunts: true, aggroR: 38, dmg: 22, packR: 80,
           preysOn: ['Deer', 'Stag'] },   // the pack runs prey down PAST you
           // circles before committing; after dark the whole pack answers
  // Bull REMOVED — too big to hit cleanly, too aggressive. (The bear still
  // borrows the Bull rig via PREFAB_FILE below, so the model still loads.)
  Bear:  { n: 3, speed: 3.4, gallop: 12.6, hp: 11, flee: 0,  r: 1.85,
           keen: 1.0,  aggroBias: 0.85,
           hpJit: true, gait: 'bound', bearish: true,
           aggroR: 34, dmg: 52, scale: 1.6, tint: 0x140d08, nightStalk: true },  // RARE, ~10-12 hits; bigger, darker, FASTER, hits harder — actually scary
  // ── the swarm ── little Flood-ish scuttlers that FOLLOW and LEAP at you.
  // Weak (a nip), but they come in numbers. Arrows barely faze them — FIRE is
  // the answer: a fire-arrow or a tree fire wipes them. Not OP.
  Spider:{ n: 3, speed: 3.4, gallop: 6, hp: 1, flee: 0, r: 0.45,
           keen: 1.0, aggroBias: 0.7, scale: 0.5, spiderish: true,
           hunts: true, aggroR: 16, dmg: 3 },   // RARE, weak — a creepy find, not a swarm at your feet
  // ── the ambush ── submerged gators pinned to the lake. They never roam:
  // they lurk at the waterline (only eyes/snout above) and SNAP at the player
  // or any Horse that wanders within reach. A bite is rare but brutal.
  Gator: { n: 3, speed: 0, gallop: 0, hp: 6, r: 1.3,
           keen: 1.0, scale: 1.0, gatorish: true,
           snapR: 5.5, snapKill: 0.20, dmg: 34, hpJit: true },   // lurks in the shallows at (70,-90)
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
renderer.toneMappingExposure = 1.14;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd89a55);

// ── image-based lighting ── a warm sky gradient baked to an environment
// map so EVERY surface picks up soft golden ambient + gentle reflections,
// instead of flat hemisphere fill. The single biggest fidelity lever, and
// cheap (one PMREM at load). Dimmed by night in the loop.
{
  const c = document.createElement('canvas'); c.width = 8; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, '#aac4ef');   // cool zenith
  g.addColorStop(0.42, '#e4caa0');   // warm upper
  g.addColorStop(0.62, '#e89a55');   // golden horizon
  g.addColorStop(0.80, '#7a5a3c');   // warm ground bounce
  g.addColorStop(1.00, '#39281a');
  x.fillStyle = g; x.fillRect(0, 0, 8, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.85;
  pmrem.dispose(); tex.dispose();
}

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
// tighter frustum around the player = the same map covers far less ground,
// so shadows are crisp where it counts. Soft edge + normalBias kills acne.
sun.shadow.camera.left = sun.shadow.camera.bottom = -55;
sun.shadow.camera.right = sun.shadow.camera.top = 55;
sun.shadow.camera.far = 420;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 3.5;
scene.add(sun, sun.target);
// hemisphere fill is lower now that IBL carries the sky ambient
const hemi = new THREE.HemisphereLight(0xe6b277, 0x2c3220, 0.5);
scene.add(hemi);
// a warm light you carry — a lantern glow that follows you and BLOOMS at
// night so the dark is navigable, not pitch black. Cheap: one point light.
const playerLight = new THREE.PointLight(0xffcf86, 0, 24, 1.7);
scene.add(playerLight);
// a VISIBLE lantern you hold — a glowing amber lamp in the corner of view.
// It's the horror-movie light: a bright pool ~20ft, pitch dark beyond it.
const lanternHeld = new THREE.Group();
{
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: 0xffcf6e, emissive: 0xffb43a, emissiveIntensity: 3.2,
      transparent: true, opacity: 0.92 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.085, 0.05, 8),
    new THREE.MeshStandardMaterial({ color: 0x20160c, roughness: 0.7 }));
  cap.position.y = 0.11;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.04, 8),
    new THREE.MeshStandardMaterial({ color: 0x20160c, roughness: 0.7 }));
  base.position.y = -0.1;
  lanternHeld.add(glass, cap, base);
  lanternHeld.position.set(0.42, -0.34, -0.7);   // held low-right in view
  camera.add(lanternHeld);
  scene.add(camera);                              // ensure the camera's children render
}

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
      // ── night sky: hashed multi-layer stars + a direction-space FBM Milky Way
      //    (technique adapted from beyond-fable, MIT (c) xikhar). Aurora is ours.
      float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float vn(vec3 p){
        vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float fbm(vec3 p){ float a=0.55,s=0.0; for(int i=0;i<3;i++){ s+=a*vn(p); p*=2.07; a*=0.5; } return s; }
      vec3 starLayer(vec3 dir, float cells, float thresh, float bright){
        vec3 cell=floor(dir*cells);
        float hs=h31(cell);
        if(hs<thresh) return vec3(0.0);
        float m=(hs-thresh)/(1.0-thresh);
        float tw=0.6+0.4*sin(uT*(1.2+fract(hs*91.0)*3.0)+hs*40.0);
        vec3 c=mix(vec3(0.78,0.85,1.0), vec3(1.0,0.92,0.80), fract(hs*53.0));
        return c*tw*bright*pow(m,2.2);
      }
      void main(){
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, -0.05, 1.0);
        // ── richer DAY atmosphere: a 3-stop vertical gradient (warm horizon →
        // pale mid → deeper blue zenith), a warm horizon haze that builds toward
        // the sun (forward scatter), and a sun core+halo+broad glow. night base
        // just goes a touch darker so the stars/Milky Way pop. ──
        vec3 horizon = mix(vec3(0.98, 0.60, 0.33), vec3(0.22, 0.11, 0.085), night);
        vec3 midSky  = mix(vec3(0.55, 0.56, 0.62), vec3(0.05, 0.06, 0.13), night);
        vec3 zenith  = mix(vec3(0.20, 0.34, 0.58), vec3(0.028, 0.038, 0.090), night);
        float hh = clamp(h, 0.0, 1.0);
        vec3 col = hh < 0.35 ? mix(horizon, midSky, pow(hh / 0.35, 0.8))
                             : mix(midSky, zenith, pow((hh - 0.35) / 0.65, 0.9));
        float s = max(dot(dir, sunDir), 0.0);
        float dayGlow = 1.0 - night;
        float haze = pow(1.0 - hh, 3.0) * (0.4 + 0.6 * pow(s, 2.0));   // warm horizon haze toward the sun
        col += vec3(1.0, 0.66, 0.38) * haze * 0.5 * dayGlow;
        col += vec3(1.0, 0.60, 0.28) * pow(s, 230.0) * 1.8 * dayGlow;  // sun core
        col += vec3(1.0, 0.55, 0.30) * pow(s, 40.0)  * 0.30 * dayGlow; // halo ring
        col += vec3(1.0, 0.45, 0.22) * pow(s, 6.0)   * 0.40 * dayGlow; // broad scatter
        float nUp = night * smoothstep(-0.02, 0.16, dir.y);   // night, above the horizon
        if (nUp > 0.01) {
          // Milky Way — a band about a galactic pole, FBM structure, cold→warm core, a dust rift
          vec3 gpole = normalize(vec3(0.42, 0.32, 0.85));
          float lat = dot(dir, gpole);
          float f = fbm(dir * 4.0);
          float band = exp(-lat*lat*20.0), broad = exp(-lat*lat*6.0);
          float core = pow(max(0.0, dot(dir, normalize(vec3(-0.55,0.18,-0.82)))), 2.0);
          float rift = smoothstep(0.0, 0.22, abs(lat*9.0 + (f-0.5)*2.2));
          float clouds = smoothstep(0.35, 0.85, f);
          float mw = (band + broad*0.22) * clouds * rift;
          vec3 mwCol = mix(vec3(0.10,0.13,0.22), vec3(0.46,0.40,0.52), smoothstep(0.25,0.7,f));
          mwCol = mix(mwCol, vec3(0.70,0.60,0.42), core*0.6);
          col += mwCol * mw * nUp * 0.95;
          // stars — a fine dense layer + a sparse bright one
          col += starLayer(dir, 150.0, 0.9915, 1.0) * nUp;
          col += starLayer(dir, 70.0,  0.9975, 1.7) * nUp;
        }
        // ── aurora ── faint green→teal curtains low in the north sky, wavering (ours)
        if (night > 0.02) {
          float bandY = smoothstep(0.03, 0.16, dir.y) * (1.0 - smoothstep(0.16, 0.46, dir.y));
          float side = smoothstep(0.0, 0.5, dir.z);
          float curt = fbm(vec3(dir.x*5.0 + uT*0.05, dir.y*9.0, dir.z*5.0 - uT*0.03));
          float a = bandY * side * smoothstep(0.5, 0.92, curt);
          vec3 auCol = mix(vec3(0.10,0.75,0.42), vec3(0.30,0.50,0.90), curt);
          col += auCol * a * night * 0.55;
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

  // central lake — a HUGE open SEA (was a ~130 pond): widened + deepened so you
  // can sail for ages without bumping the shore. Reaches out toward the rim.
  const d = Math.hypot(x - 70, z + 90) / 300;
  a -= Math.max(0, 1 - d * d) * 35;
  // keep the spawn meadow + home a dry shore standing above the enlarged sea,
  // so you still wake on land (not in the water) — a raised peninsula by origin.
  const ds = Math.hypot(x - 0, z - 26);
  a += Math.max(0, 1 - ds / 100) * 44;

  // climbable rocky outcrops — added LAST so a perch always sits
  // proud of whatever terrain it rests on (raw x,z, not warped, so
  // the dropped rock geometry lines up exactly).
  a += outcropAt(x, z);
  return a;
}

// terrain up-vector at a point — central-difference of heightAt. Used so a
// carcass lies FLUSH on a slope instead of half-buried at one end.
function normalAt(x, z, out) {
  const e = 1.2;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return (out || new THREE.Vector3()).set(-hx, 2 * e, -hz).normalize();
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

let _groundColAttr = null, _groundSeg = 0;   // terrain color attr + vertex spacing (for scorch recolor)
let _terrainMesh = null;                     // module handle (terrain itself is block-scoped) — hidden inside the kitchen world
// burned ground registry — quantized cells the fire has turned to desert, so
// the grass field knows to stop growing blades there (burned = bare sand).
const _burned = new Set();
const _burnedPts = [];            // flat [x,z,...] of burned cell centers (for cactus spawning)
const _BURN_CELL = 5;
function _burnKey(x, z) { return Math.floor(x / _BURN_CELL) * 100003 + Math.floor(z / _BURN_CELL); }
function _isBurned(x, z) { return _burned.size > 0 && _burned.has(_burnKey(x, z)); }
let _grassResweep = 0;   // frames of full-field grass reblade after a burn (clears grass off fresh desert)

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
  scene.add(terrain); _terrainMesh = terrain;
  // expose the ground so fire can RECOLOR it to scorched sand in place — a real
  // desert that follows the terrain, not floating see-through scar discs.
  _groundColAttr = g.attributes.color; _groundSeg = WORLD / segs;
}

// water — animated lake
const waterUniforms = { uTime: { value: 0 }, uWindDir: { value: 0 }, uBoatWake: { value: 0 } };
{
  const m = new THREE.MeshStandardMaterial({
    color: 0x2e5a62, transparent: true, opacity: 0.6,
    depthWrite: false,                 // let the deep (the leviathan) show THROUGH the surface
    roughness: 0.35, metalness: 0.0,
  });
  m.envMapIntensity = 0.3;   // the warm IBL was washing the lake pale-tan — let the water colour read
  // ── water shading adapted from beyond-fable (MIT © xikhar), reimplemented:
  // depth-based shallow→deep colour + a foamy shoreline, a Fresnel sky
  // reflection (live sun/night shared from skyUniforms) and a tight sun sparkle.
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterUniforms.uTime;
    sh.uniforms.uSunDir = skyUniforms.sunDir;     // shared live uniforms — free
    sh.uniforms.uNight = skyUniforms.night;
    sh.uniforms.uWindDir = waterUniforms.uWindDir;
    sh.uniforms.uBoatWake = waterUniforms.uBoatWake;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWindDir;\nuniform float uBoatWake;\nattribute float depth;\nvarying float vDepth;\nvarying vec3 vWP;\nvarying float vWave;\nvarying vec3 vWN;\n'
      + sh.vertexShader
      .replace('#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       // ── ONE shared Gerstner wave field ── identical to waveAt() in JS, evaluated
       //    in WORLD coords and driven by the wind, so the crests you SEE are the
       //    crests the boat RIDES (they used to be two unrelated fields). The normal
       //    is the exact heightfield gradient (sun glint + sky reflection ride the
       //    real swells); a Gerstner horizontal pinch sharpens rounded swells into
       //    wind-driven peaks. (plane is rotated -PI/2: local x→world x, local y→
       //    world -z, local z→world y.)
       float WX = 70.0 + position.x, WZ = -90.0 - position.y;
       float wAmp = clamp((depth-0.6)/5.0, 0.0, 1.0) * (0.85 + uBoatWake);
       float wwx = sin(uWindDir), wwz = cos(uWindDir);
       float pp = (WX*wwx + WZ*wwz)*0.085 - uTime*1.5;
       float pa = (WX*0.7  + WZ*0.71)*0.16 + uTime*1.7;
       float pb = (WX*-0.6 + WZ*0.8 )*0.11 + uTime*1.3;
       float wHeight = (sin(pp)*0.9 + sin(pa)*0.34 + sin(pb)*0.26) * wAmp;
       float dWX = (cos(pp)*0.9*wwx*0.085 + cos(pa)*0.34*0.7*0.16 + cos(pb)*0.26*(-0.6)*0.11) * wAmp;
       float dWZ = (cos(pp)*0.9*wwz*0.085 + cos(pa)*0.34*0.71*0.16 + cos(pb)*0.26*0.8*0.11) * wAmp;
       objectNormal = normalize(vec3(-dWX, dWZ, 1.0));
       vWN = normalize(mat3(modelMatrix) * objectNormal);
       float gX = (0.6*0.9*wwx*cos(pp) + 0.3*0.34*0.7*cos(pa) + 0.3*0.26*(-0.6)*cos(pb)) * wAmp;
       float gZ = (0.6*0.9*wwz*cos(pp) + 0.3*0.34*0.71*cos(pa) + 0.3*0.26*0.8*cos(pb)) * wAmp;`)
      .replace('#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.x += gX;            // Gerstner horizontal pinch (world x)
       transformed.y += -gZ;           // world z  (local y is -world z)
       transformed.z += wHeight;       // world-up height — the SAME field the hull rides
       vWave = wHeight;                // real crest height → fragment crest/foam/SSS
       vDepth = depth;
       vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = `uniform float uTime; uniform vec3 uSunDir; uniform float uNight;
      varying float vDepth; varying vec3 vWP; varying float vWave; varying vec3 vWN;
      float wh31(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float wvn(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(wh31(i),wh31(i+vec3(1,0,0)),f.x),mix(wh31(i+vec3(0,1,0)),wh31(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(wh31(i+vec3(0,0,1)),wh31(i+vec3(1,0,1)),f.x),mix(wh31(i+vec3(0,1,1)),wh31(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float wfbm(vec3 p){ float a=0.6,s=0.0; for(int k=0;k<2;k++){ s+=a*wvn(p); p*=2.1; a*=0.5; } return s; }
      ` + sh.fragmentShader
      .replace('#include <color_fragment>',
      `#include <color_fragment>
       float dn = clamp(vDepth/7.0, 0.0, 1.0);
       diffuseColor.rgb = mix(vec3(0.20,0.40,0.42), vec3(0.04,0.14,0.20), dn);   // mid-shallow→deep (both watery)
       // shoreline surf as STEADY bands parallel to shore (by depth). The old
       // sin(depth - uTime) + drifting fbm scrolled inward and shimmered; these
       // ribbons sit still and only breathe gently, with STATIC noise breaking
       // the ring so it never reads as a perfect circle. Gated OFF in deep water.
       float shore = smoothstep(0.85, 0.06, vDepth) * step(0.05, vDepth);
       float band  = smoothstep(0.35, 0.95, sin(vDepth*10.0));   // a couple of parallel surf lines
       float breathe = 0.82 + 0.18*sin(uTime*0.8);               // uniform slow pulse, no spatial scroll
       float brk   = smoothstep(0.45, 0.85, wfbm(vWP*0.6));      // static break-up (no uTime → no drift)
       float foam = shore * band * breathe * brk;
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90,0.95,0.98), clamp(foam,0.0,1.0)*0.85);
       // (Whitecaps removed — the per-pixel foam flecks strobed/aliased into a
       //  glitchy speckle. The WAVES are the smooth vertex swell instead; a soft
       //  crest BRIGHTENING reads as a wave without any high-frequency sparkle.)
       float crest = smoothstep(0.30, 0.85, vWave) * smoothstep(2.0, 5.0, vDepth);  // vWave is now real height (taller)
       diffuseColor.rgb += vec3(0.05, 0.07, 0.08) * crest;`)
      .replace('#include <dithering_fragment>',
      `#include <dithering_fragment>
       vec3 V = normalize(cameraPosition - vWP);
       vec3 N = normalize(vWN);                                                // the true wave-sloped normal
       float fres = mix(0.06, 0.7, pow(1.0 - max(dot(V, N), 0.0), 5.0));       // Schlick sky reflection, now riding the slopes
       // ── reflect the ACTUAL sky gradient ── sample the reflected ray's height and
       //    blend the same warm-horizon → blue-zenith stops the sky dome uses, so the
       //    water mirrors the real sky instead of a flat blue-gray that clashed with it.
       vec3 R = reflect(-V, N);
       float rh = clamp(R.y, 0.0, 1.0);
       vec3 skyHorizon = mix(vec3(0.98,0.62,0.36), vec3(0.10,0.07,0.13), uNight);
       vec3 skyZenith  = mix(vec3(0.32,0.46,0.66), vec3(0.03,0.04,0.10), uNight);
       vec3 skyCol = mix(skyHorizon, skyZenith, pow(rh, 0.55));                // grazing reflections stay warm
       gl_FragColor.rgb = mix(gl_FragColor.rgb, skyCol, fres*0.45);
       // ── the sun road ── one broad glittering path toward the sun. A wide soft
       //    pool (low exponent) is the road body; crisp facet glints (high exponent)
       //    sparkle where wave normals face the sun — both ride N, so the whole road
       //    shimmers along the swells. Amber at golden hour → white when the sun is high.
       float sunUp = max(uSunDir.y, 0.0);
       vec3 Hh = normalize(V + uSunDir);
       float nh = max(dot(N, Hh), 0.0);
       float road = pow(nh, 13.0) * 0.34;            // broad soft body of the road
       float glint = pow(nh, 70.0) * 0.9;            // crisp facet sparkle on aligned crests
       vec3 sunCol = mix(vec3(1.0,0.52,0.26), vec3(1.0,0.93,0.76), sunUp);
       gl_FragColor.rgb += sunCol * (road + glint) * (1.0 - uNight) * smoothstep(0.02, 0.16, sunUp);
       // ── subsurface back-glow ── when you look toward the low sun, lit wave crests
       //    glow translucent amber (light passing THROUGH the water). Cheap wrap-light:
       //    fires only looking sunward (dot(V,-sun)) on sun-facing crests (vWave). The
       //    golden-hour money shot — ~5 ALU, no texture, stays inside the warm palette.
       float back = pow(clamp(dot(V, -uSunDir), 0.0, 1.0), 4.0) * (dot(N, uSunDir)*0.5 + 0.5);
       back *= smoothstep(0.25, 0.70, vWave);
       gl_FragColor.rgb += back * vec3(0.95, 0.55, 0.30) * (1.0 - uNight) * smoothstep(0.02, 0.16, sunUp);
       // ── depth-driven alpha ── shallow water near the bank goes more transparent
       //    so the shoreline softly reveals the lakebed instead of a hard sheet edge
       //    (this replaces the old flat shallows-tint plane). Deep water stays full.
       gl_FragColor.a *= mix(0.4, 1.0, smoothstep(0.0, 1.5, vDepth));`);
  };
  // lake-local plane (a world-sized sheet pokes out past the terrain rim and
  // reads as a band on the horizon). Per-vertex DEPTH = how far the lakebed sits
  // below the surface here — drives the shallow→deep colour and shoreline foam.
  const wgeo = new THREE.PlaneGeometry(620, 620, 56, 56);
  {
    const wp = wgeo.attributes.position, dep = new Float32Array(wp.count);
    for (let i = 0; i < wp.count; i++)             // local (lx,ly) → world (70+lx, -90-ly)
      dep[i] = WATER_Y - heightAt(70 + wp.getX(i), -90 - wp.getY(i));
    wgeo.setAttribute('depth', new THREE.BufferAttribute(dep, 1));
  }
  const w = new THREE.Mesh(wgeo, m);
  w.rotation.x = -Math.PI / 2;
  w.position.set(70, WATER_Y, -90);
  scene.add(w);
  // (the flat 440x440 shallows tint plane was removed — it laid a cool teal band
  //  under the surface that clashed with the golden-hour palette and duplicated
  //  what the water shader already does: depth-based shallow→deep colour plus a
  //  depth-driven alpha fade so the shoreline softens instead of a hard edge.)
  // (the 240 additive sparkle Points were removed — they sat at fixed world
  //  positions, ignored the sun, and read as scattered noise. The sun's
  //  reflection is now a single broad "sun road" computed in the water shader,
  //  riding the analytic wave normals so it shimmers along the swells.)
}

// ───────────────────────── wind-blown grass ─────────────────────────
const windUniforms = { uTime: { value: 0 } };
// ── trip warp ── trees are RIGID in normal play (uTrip=0). On the mushroom
// trip this ramps up and the canopy starts to BREATHE and lean, geometry and
// all — the world going soft, not just recoloured. Driven once/frame in loop.
const tripUniforms = { uTrip: { value: 0 } };
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
    // ── grass shading + wind adapted from beyond-fable (MIT, © xikhar) ──
    // root planted, tip free; a meadow-scale travelling wave + a per-blade
    // flutter on its own clock (never a single periodic shake); blades CROUCH
    // into a gust. Fragment deepens the planted-root shadow (fake AO) and lifts
    // warm, sun-caught translucent tips — the golden-hour lushness.
    sh.vertexShader = 'uniform float uTime;\nvarying float vGH;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vGH = clamp(position.y / 1.1, 0.0, 1.0);
       float bendY = position.y * position.y * 0.62;
       float ph = instanceMatrix[3][0]*0.21 + instanceMatrix[3][2]*0.17;
       float wave = 0.72 + 0.5*sin(uTime*0.9 - instanceMatrix[3][0]*0.05 - instanceMatrix[3][2]*0.043);
       float swayX = (sin(uTime*1.9 + ph) + 0.4*sin(uTime*3.7 + ph*1.7)) * 0.55;
       float swayZ = cos(uTime*1.4 + ph) * 0.38;
       swayX += sin(uTime*5.3 + ph*2.7) * 0.10;            // fine flutter, own clock
       transformed.x += swayX * bendY * wave;
       transformed.z += swayZ * bendY * wave;
       transformed.y -= abs(swayX) * bendY * 0.5 * wave;   // crouch into the gust`);
    sh.fragmentShader = 'varying float vGH;\n' + sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       gl_FragColor.rgb *= mix(0.74, 1.0, vGH);               // deepen the planted-root shadow (fake AO)
       gl_FragColor.rgb += vec3(0.13, 0.15, 0.05) * vGH * vGH;  // warm, sun-caught translucent tips`);
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
    // grass grows on ALL the green ground — the green band runs up to ~24
    // (terrain only lerps to rock 19→26), so the old y>18 cut left higher green
    // slopes bare. Cover the whole green band; rock/snow (>24) and water stay clear.
    if (y < WATER_Y + 0.5 || y > 24 || fade <= 0 || _isBurned(g.x, g.z)) { S.set(0, 0, 0); }
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
    const sweep = _grassResweep > 0;          // after a burn: reblade everything to clear grass off fresh desert
    let touched = false;
    for (let k = 0; k < slice; k++) {
      const i = (gCursor + k) % CFG.grass;
      const g = gPos[i];
      let moved = false;
      while (g.x - player.x > R)  { g.x -= 2 * R; moved = true; }
      while (player.x - g.x > R)  { g.x += 2 * R; moved = true; }
      while (g.z - player.z > R)  { g.z -= 2 * R; moved = true; }
      while (player.z - g.z > R)  { g.z += 2 * R; moved = true; }
      if (moved || sweep) { setBlade(i); touched = true; }
    }
    gCursor = (gCursor + slice) % CFG.grass;
    if (_grassResweep > 0) _grassResweep--;
    if (touched) inst.instanceMatrix.needsUpdate = true;
  };
}

// ── the 5 landing beds ── flower clearings you can drop into. The first is
// the classic spawn meadow; the rest are spread across the valley. Each is
// nudged onto solid, fairly flat ground. You pick one by WHEN you tap out of
// the drone shot — the dive goes to whichever bed the camera is nearest.
const FLOWERBEDS = (() => {
  const want = [[0, 26], [72, -38], [-84, 18], [40, 96], [-52, -80]];
  // a bed is only valid if its CENTER and a whole ring around it are solid,
  // dry land — never a lake, pond, or a tiny island you'd drop into water on.
  const dryLand = (x, z) => {
    if (heightAt(x, z) < WATER_Y + 2.0) return false;
    for (let a = 0; a < 6.28; a += 0.785)      // 8-point ring at r=7
      if (heightAt(x + Math.cos(a) * 7, z + Math.sin(a) * 7) < WATER_Y + 1.2) return false;
    return true;
  };
  const out = [];
  for (const [tx, tz] of want) {
    let bx = tx, bz = tz, best = -1e9, found = false;
    for (let r = 0; r <= 60; r += 5) for (let a = 0; a < 6.28; a += 0.5) {
      const x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r, y = heightAt(x, z);
      if (y > 18 || !dryLand(x, z)) continue;
      const slope = Math.abs(heightAt(x + 2.5, z) - y) + Math.abs(heightAt(x, z + 2.5) - y);
      const score = -slope - r * 0.012;        // flattest, closest, dry all around
      if (score > best) { best = score; bx = x; bz = z; found = true; }
    }
    out.push({ x: bx, z: bz, ok: found });
  }
  // guarantee 5 valid beds: any that failed falls back to the spawn meadow
  for (const b of out) if (!b.ok) { b.x = out[0].x; b.z = out[0].z; }
  return out;
})();
window._beds = () => FLOWERBEDS;

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
// the landing beds are BEDS OF ROSES — crimson-heavy, a few blush/white
const ROSE_PALETTE = [
  0xc1121f, 0x9d0208, 0xe01e37, 0xd00000, 0xb21e35,   // deep reds / crimson
  0xff5d73, 0xff8fa3, 0xfff0f3,                        // blush / pale rose / white
];
{
  const mkFlower = () => {
    const stem = new THREE.CylinderGeometry(0.015, 0.03, 0.62, 5, 2);
    stem.translate(0, 0.31, 0);
    // a rounder, brighter bloom-head — subdivided on desktop, cheap on phone
    const head = new THREE.IcosahedronGeometry(0.12, IS_TOUCH ? 0 : 1);
    head.scale(1, 0.85, 1); head.translate(0, 0.66, 0);
    // a fuller ring of petals — gently cupped, each curved across its width
    const petals = [];
    const NP = 6;
    for (let p = 0; p < NP; p++) {
      const pl = new THREE.PlaneGeometry(0.2, 0.12, 2, 1);
      const pp = pl.attributes.position;
      for (let i = 0; i < pp.count; i++) {                 // cup the petal — tips lift
        const x = pp.getX(i); pp.setZ(i, pp.getZ(i) - x * x * 0.5);
      }
      pl.translate(0, 0.06, 0); pl.rotateX(-0.8); pl.rotateY(p * (6.2832 / NP)); pl.translate(0, 0.6, 0);
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

  // ── 4. STATIC DENSE WAKE-BEDS — a bright flower disc at EACH of the 5 beds ──
  const bedM = new THREE.InstancedMesh(flowerGeoBase, flowerMat, CFG.bedFlowers);
  bedM.frustumCulled = false; bedM.castShadow = false;
  {
    let placed = 0, guard = 0;
    const BED_R = 11;
    while (placed < CFG.bedFlowers && guard++ < CFG.bedFlowers * 30) {
      const bed = FLOWERBEDS[placed % FLOWERBEDS.length];   // round-robin across all 5
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * BED_R;
      const x = bed.x + Math.cos(a) * rr, z = bed.z + Math.sin(a) * rr,
            y = heightAt(x, z);
      if (y < WATER_Y + 0.6 || y > 19) continue;
      const s = 0.8 + Math.random() * 0.9;
      P.set(x, y - 0.04, z);
      E.set(0, Math.random() * Math.PI * 2, 0); Q.setFromEuler(E);
      S.set(s, s, s);
      bedM.setMatrixAt(placed, M.compose(P, Q, S));
      // a bed of ROSES — deep reds and crimsons, a few blush/white among them
      bedM.setColorAt(placed, new THREE.Color(ROSE_PALETTE[(Math.random() * ROSE_PALETTE.length) | 0]));
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

// shared rock facet-shading shader hook (see the comment at the rock material).
function rockShade(sh) {
  sh.vertexShader = 'varying float vRockY;\n' +
    sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n       vRockY = position.y;');
  sh.fragmentShader = 'varying float vRockY;\n' +
    sh.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       {
         float ry = smoothstep(-1.2, 2.0, vRockY);          // base in shadow → crown in sun
         diffuseColor.rgb *= mix(0.66, 1.12, ry);
         diffuseColor.rgb += vec3(0.05, 0.045, 0.035) * smoothstep(0.5, 1.0, ry);   // warm sunlit crown
       }`);
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

  const biTrunk = new THREE.CylinderGeometry(0.13, 0.2, 5.6, 6);
  biTrunk.translate(0, 2.8, 0);
  // a layered crown of overlapping leaf blobs (was a single ball-on-a-stick
  // "popsicle" — the weakest tree). Clustered + raised reads as real foliage.
  const biBlob = (r, x, y, z) => { const gg = new THREE.IcosahedronGeometry(r, 0); gg.translate(x, y, z); return gg; };
  const biCrown = [biBlob(1.25, 0, 6.2, 0), biBlob(0.95, 0.9, 5.7, 0.25), biBlob(0.92, -0.85, 5.9, -0.3),
                   biBlob(0.82, 0.25, 6.95, 0.5), biBlob(0.78, -0.35, 6.7, -0.55)];
  const birchGeo = paintTwoTone(mergeGeoms([biTrunk, ...biCrown]), biTrunk,
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
  // tree sway REMOVED in normal play — but on the TRIP the canopy comes alive.
  // The displacement is multiplied by uTrip, which is 0 off-trip (so trees stay
  // perfectly rigid, zero idle sway) and ramps up while tripping: a slow,
  // dreamy, underwater lean + a breathing swell, weighted to the crown so
  // trunks stay planted. Per-instance phase = each tree warps on its own clock.
  const treeWind = (amp, sideAmp) => (sh) => {};   // no-op stub (call site stability)
  treeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uTrip = tripUniforms.uTrip;
    sh.vertexShader = 'uniform float uTime;\nuniform float uTrip;\nvarying float vLeafY;\nvarying vec3 vLocalPos;\n' +
      sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vLeafY = position.y;                      // local canopy height → fragment AO/tip
       vLocalPos = position;                     // local pos → fragment bark grain
       if (uTrip > 0.001) {
         float h = max(position.y, 0.0);
         float bendY = h * 0.16;                 // crown-weighted, base planted
         float ph = instanceMatrix[3][0]*0.13 + instanceMatrix[3][2]*0.11;
         transformed.x += (sin(uTime*0.9 + ph) + 0.5*sin(uTime*1.7 + ph*1.7)) * bendY * uTrip;
         transformed.z += (cos(uTime*0.8 + ph*1.2) + 0.4*sin(uTime*1.3 + ph)) * bendY * uTrip;
         transformed.y += sin(uTime*1.1 + ph) * h * 0.06 * uTrip;   // the canopy breathes
       }`);
    // ── canopy depth — beyond-fable leaves.ts technique (MIT © xikhar),
    // reimplemented in our own GLSL: AO the shaded canopy interior/underside,
    // lift + warm the sunlit crown, so the low-poly blobs read as dimensional
    // foliage instead of flat green balls. Leaf fragments only (green-dominant
    // vertex colour); trunks/branches/birch-bark are left untouched.
    sh.fragmentShader = 'varying float vLeafY;\nvarying vec3 vLocalPos;\n' +
      sh.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       {
         float leaf = step(vColor.r + 0.04, vColor.g) * step(0.12, vColor.g);
         float cy = clamp((vLeafY - 4.0) / 8.5, 0.0, 1.0);   // 0 low canopy → 1 crown
         float ao = mix(0.6, 1.04, cy);                       // underside in shadow
         float tip = smoothstep(0.62, 1.0, cy) * 0.16;        // sun-kissed top
         diffuseColor.rgb *= mix(1.0, ao, leaf);
         diffuseColor.rgb += vec3(0.13, 0.14, 0.05) * tip * leaf;
         // ── bark grain — beyond-fable tree-shading idea (MIT © xikhar),
         // our own procedural: vertical fluted ridges around the trunk + a
         // little fibre grain + root-AO at the base, so trunks read as carved
         // bark instead of flat brown poles. Trunk/branch fragments only.
         float bark = 1.0 - leaf;
         float ang = atan(vLocalPos.x, vLocalPos.z);
         float ridge = sin(ang * 13.0) * 0.5 + 0.5;           // fluted vertical ridges
         ridge = mix(ridge, fract(sin(ang * 47.0) * 43.0), 0.28);   // break the regularity
         float fibre = sin(vLeafY * 7.0 + ang * 2.3) * 0.5 + 0.5;   // long vertical fibre
         float barkShade = mix(0.72, 1.12, ridge * 0.62 + fibre * 0.38);
         float rootAO = mix(0.58, 1.0, clamp(vLeafY / 3.4, 0.0, 1.0));  // dark at the base
         diffuseColor.rgb *= mix(1.0, barkShade * rootAO, bark);
       }`);
  };
  const species = [
    { geo: pineGeo,  inst: new THREE.InstancedMesh(pineGeo, treeMat, CFG.trees), n: 0, r: 1.1, ch: 12.5 },
    { geo: broadGeo, inst: new THREE.InstancedMesh(broadGeo, treeMat, CFG.trees), n: 0, r: 1.2, ch: 9.5 },
    { geo: birchGeo, inst: new THREE.InstancedMesh(birchGeo, treeMat, CFG.trees), n: 0, r: 0.6, ch: 8.5 },
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
  // EVERY real trunk (r >= 0.45) is collidable now — blocks player + arrows.
  // The collision scan stays cheap (~3.2ms/frame with 5k trunks).
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
    let groveAccept = (1 - gveffect) + gveffect * (0.18 + 1.45 * gv * gv);
    // ── island fuel ── pack the dry lake-shore ring with trees so "shooting
    // the island" ignites a big self-contained blaze. The lake basin centers on
    // (70,-90); the band ~14..34m out from its rim is solid shore — load it up.
    {
      const dLake = Math.hypot(x - 70, z + 90);
      if (dLake > 14 && dLake < 34) groveAccept = Math.min(1, groveAccept + 0.6);
    }
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
    const ii = sp.n;                       // this tree's instance index — kept so fire can char + fell it
    sp.inst.setMatrixAt(sp.n++, M.compose(P, Q, S));
    // PERF: cap the collision/cover array. With 4500 trunks a full
    // TREES[] would bloat the per-step collision scan; the smallest
    // saplings (r below ~0.8) are visual filler, not real obstacles, so
    // we render them but skip pushing them as collidable cover. Hard cap
    // at TREE_COLLIDE_MAX keeps the array bounded regardless of count.
    const tr = sp.r * s;
    // EVERY real trunk is solid (player + arrows). `top` = canopy height —
    // landable ONLY during a mushroom trip (treetop parkour).
    if (tr >= 0.45) TREES.push({ x, z, r: tr, top: (y - 0.15) + sp.ch * s,
                                 inst: sp.inst, ii, my: y - 0.15, ch: sp.ch * s, sc: s });
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
    sh.vertexShader = 'uniform float uTime;\nvarying float vBushY;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vBushY = position.y;                      // local height → fragment AO/tip
       float bendY = position.y * 0.10;
       float ph = instanceMatrix[3][0]*0.21 + instanceMatrix[3][2]*0.17;
       float gust = 0.6 + 0.4*sin(uTime*0.3 + instanceMatrix[3][2]*0.015);
       // a traveling wind WAVE rolls across the meadow — a band of stronger bend
       float wave = 0.7 + 0.55*sin(uTime*0.9 - instanceMatrix[3][0]*0.05 - instanceMatrix[3][2]*0.043);
       gust *= wave;
       transformed.x += (sin(uTime*1.6 + ph) + 0.3*sin(uTime*3.1 + ph*1.6)) * bendY * gust;
       transformed.z += cos(uTime*1.2 + ph) * bendY * 0.6 * gust;`);
    // foliage-mass depth — same canopy AO/tip idea (beyond-fable leaves.ts, MIT
    // © xikhar, reimplemented): shaded base, sun-kissed crown, so undergrowth
    // reads as a dimensional mass instead of a flat green blob.
    sh.fragmentShader = 'varying float vBushY;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       {
         float cy = clamp(vBushY / 1.7, 0.0, 1.0);            // 0 base → 1 crown
         diffuseColor.rgb *= mix(0.62, 1.06, cy);             // shaded underside
         diffuseColor.rgb += vec3(0.10, 0.12, 0.04) * smoothstep(0.58, 1.0, cy) * 0.9;  // sunlit top
       }`);
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
    // ── island fuel ── thicken undergrowth on the dry lake-shore ring too, so
    // grass↔bush↔tree all chain when the island goes up (lake basin at 70,-90)
    {
      const dLake = Math.hypot(x - 70, z + 90);
      if (dLake > 12 && dLake < 36) bdens += 0.7;
    }
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

  // rock facet shading — beyond-fable stone idea (MIT © xikhar), reimplemented:
  // a shadowed/earthbound underside fading to a sun-kissed crown, by local
  // height, so flat low-poly boulders gain top-down FORM instead of one flat
  // grey. Works with or without vertex colours; instanced-safe (local pos).
  const rg = new THREE.DodecahedronGeometry(1.1, 0);
  const _rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8678, roughness: 1 });
  _rockMat.onBeforeCompile = rockShade;
  const rocks = new THREE.InstancedMesh(rg, _rockMat, CFG.rocks);
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
    // "no more rocks" — rocks are pure scenery now, no collision walls. The
    // crater you land in is the thing you climb; rocks never block you again.
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
      sh.vertexShader = 'uniform float uTime;\nvarying float vBushY;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         vBushY = position.y;                     // local height → fragment AO/tip
         float bendY = position.y * 0.07;
         float ph = instanceMatrix[3][0]*0.2 + instanceMatrix[3][2]*0.16;
         float gust = 0.6 + 0.4*sin(uTime*0.28 + instanceMatrix[3][2]*0.013);
         transformed.x += (sin(uTime*1.5 + ph) + 0.3*sin(uTime*3.0 + ph*1.6)) * bendY * gust;
         transformed.z += cos(uTime*1.1 + ph) * bendY * 0.6 * gust;`);
      // matching foliage-mass depth (see bushMat) so eye-level thickets read
      // dimensional instead of flat — beyond-fable leaves.ts idea, our GLSL.
      sh.fragmentShader = 'varying float vBushY;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>
         {
           float cy = clamp(vBushY / 2.6, 0.0, 1.0);
           diffuseColor.rgb *= mix(0.6, 1.06, cy);
           diffuseColor.rgb += vec3(0.10, 0.12, 0.04) * smoothstep(0.55, 1.0, cy) * 0.9;
         }`);
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
  stoneMat.onBeforeCompile = rockShade;     // boulders + standing stones gain facet form
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

  const N_CORRUPT = 0;   // the breathing/blighted trees are REMOVED (too odd). CORRUPT stays empty.
  const inst = new THREE.InstancedMesh(cgeo, _corruptMat, Math.max(1, N_CORRUPT));
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
    if (player.hp <= 0 && !dead) { dead = true; beginDeath();
      setTimeout(() => { player.hp = 100; player.x = SPAWN.x; player.z = SPAWN.z;
        player.y = heightAt(SPAWN.x, SPAWN.z); dead = false; renderHP(); respawnArrival(); }, 3500); }
  } else if (_stingThudT < 0.4) {
    document.getElementById('hurt').style.opacity = '0';
  }
}

// drifting clouds
const clouds = [];
{
  // ROUND, soft puffs — was detail-0 (faceted 20-face blocks); now subdivided so
  // each puff reads as a smooth billow. (Lower detail on phones for perf.)
  const geo = new THREE.IcosahedronGeometry(1, IS_TOUCH ? 1 : 2);
  const mat = new THREE.MeshLambertMaterial({ color: 0xf4e7d4, transparent: true, opacity: 0.9 });
  window._cloudMat = mat;
  // clouds scattered across the WHOLE map, at mixed heights — some hang high,
  // others come DOWN low and drift over the valley/hilltops. Each cloud's puffs
  // are merged into ONE mesh so the higher count stays cheap on the phone.
  const N = IS_TOUCH ? 20 : 30;
  for (let i = 0; i < N; i++) {
    const puffs = [];
    // more puffs of widely varied size → a fluffier, billowy cumulus silhouette
    const n = 9 + (Math.random() * 7 | 0);
    for (let p = 0; p < n; p++) {
      const s = 4 + Math.random() * 13;
      const g = geo.clone();
      g.scale(s, s * (0.5 + Math.random() * 0.22), s * (0.7 + Math.random() * 0.25));   // flattish, varied billows
      // pile them in a rounded mound: denser/taller toward the centre, thinning out
      const rx = (Math.random() - 0.5) * 50, rz = (Math.random() - 0.5) * 22;
      const lift = s * 0.24 * (1 - Math.min(1, Math.hypot(rx, rz) / 30));
      g.translate(rx, s * 0.26 + lift + Math.random() * 2, rz);
      puffs.push(g);
    }
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(mergeGeoms(puffs), mat));
    const low = Math.random() < 0.45;                // ~45% are LOW, hanging over the land
    grp.position.set((Math.random() - 0.5) * 1500,
                     low ? 40 + Math.random() * 34 : 110 + Math.random() * 70,
                     (Math.random() - 0.5) * 1500);
    grp.userData.v = 0.6 + Math.random() * 1.3;
    scene.add(grp);
    clouds.push(grp);
  }
}

// ───────────────────────── landmarks (the discovery loop) ─────────────────
// Terrain noise is deterministic, so these are hand-placed on known
// terrain. Each landmark = a built scene group + a journal entry that
// fires once (persisted in localStorage) with a music stinger.

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 1 });
stoneMat.onBeforeCompile = rockShade;       // landmark boulders/cairns gain facet form

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
  const matA = new THREE.MeshStandardMaterial({ color: 0xff7a1e, emissive: 0xff5a10, emissiveIntensity: 1.9 });
  const matB = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a1e, emissiveIntensity: 2.25 });
  const matC = new THREE.MeshStandardMaterial({ color: 0xffe39a, emissive: 0xffd070, emissiveIntensity: 2.7 });
  const fa = new THREE.Mesh(flameGeoA, matA); fa.position.y = 0.7;
  const fb = new THREE.Mesh(flameGeoB, matB); fb.position.y = 0.55;
  const fc = new THREE.Mesh(flameGeoC, matC); fc.position.y = 0.4;
  flame.add(fa, fb, fc); g.add(flame);
  // a few glowing embers floating low over the pit
  const embers = [];
  const emberMat = new THREE.MeshStandardMaterial({ color: 0xff8a2e, emissive: 0xff6a1e, emissiveIntensity: 2.4 });
  for (let i = 0; i < 5; i++) {
    const e = new THREE.Mesh(emberGeo, emberMat);
    const a = i * 1.7;
    e.position.set(cx + Math.cos(a) * 0.3, 0.45 + (i % 3) * 0.12, cz + Math.sin(a) * 0.3);
    e.userData.ph = a; g.add(e); embers.push(e);
  }
  const light = new THREE.PointLight(0xff9242, 11.5, 26, 1.8);
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
    id: 'camp_trapper', name: 'A Camp', x: -180, z: -160, r: 13,
    journal: 'Someone was here.',
    build(g) {
      buildTent(g, { color: 0xb3a684, x: -3.2, z: 0.4, rot: 0.5, h: 3.0, r: 2.4 });  // waxed canvas
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
    id: 'camp_ruffled', name: 'A Camp', x: 200, z: -240, r: 13,
    journal: 'Left in a hurry.',
    build(g) {
      buildTent(g, { color: 0x988b6f, x: -2.8, z: 0.2, rot: 0.9, h: 2.8, r: 2.5, collapsed: true });  // weathered canvas
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
    id: 'camp_cold', name: 'A Cold Camp', x: -300, z: 120, r: 13,
    journal: 'Long cold.',
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
    id: 'camp_leanto', name: 'A Camp', x: 120, z: -100, r: 13,
    journal: 'The fire is still warm.',
    build(g) {
      buildTent(g, { color: 0x6f5436, x: -2.6, z: 0, rot: 0.4, leanTo: true });  // oiled hide
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

// ── forageables ── berries (safe to eat, a little food) and the rare
// glowing mushroom (eat it and the world goes strange — see tripT). Walk
// over one to take it. Scattered on land, away from the wake clearing.
const FORAGE = []; window._forage = FORAGE;
function buildBerry() {
  const g = new THREE.Group();
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f5a24, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), leaf);
    b.position.set((Math.random() - 0.5) * 0.6, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6);
    b.scale.y = 0.8; g.add(b);
  }
  const berryMat = new THREE.MeshStandardMaterial({ color: 0x8c1026, roughness: 0.4,
    emissive: 0x3a0510, emissiveIntensity: 0.4 });
  for (let i = 0; i < 9; i++) {
    const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), berryMat);
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.55;
    d.position.set(Math.cos(a) * rr, 0.32 + Math.random() * 0.45, Math.sin(a) * rr); g.add(d);
  }
  return g;
}
// a low fruit-shrub — leafy dome with a few hanging fruits. Player-edible
// like a berry; also a 'forage' goal for grazing prey.
const _fruitLeafMat = new THREE.MeshStandardMaterial({ color: 0x2c4d1f, roughness: 1 });
const _fruitMat = new THREE.MeshStandardMaterial({ color: 0xd98018, roughness: 0.5,
  emissive: 0x3a1c04, emissiveIntensity: 0.35 });
function buildFruit() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), _fruitLeafMat);
    b.position.set((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.35, (Math.random() - 0.5) * 0.8);
    b.scale.y = 0.85; g.add(b);
  }
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), _fruitMat);
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.6;
    d.position.set(Math.cos(a) * rr, 0.25 + Math.random() * 0.35, Math.sin(a) * rr); g.add(d);
  }
  return g;
}
// shared across every mushroom — no per-cluster allocations, and NO point
// lights (those tanked the framerate at 20 of them). The cap's strong
// emissive reads as "special" on its own.
const _mushStalkMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 });
const _mushCapMat = new THREE.MeshStandardMaterial({ color: 0x7a3cc0, roughness: 0.5,
  emissive: 0x7a3cff, emissiveIntensity: 1.6 });          // brighter glow to make up for no light
const _mushStalkGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.6, 6);
const _mushCapGeo = new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
function buildPsyMush() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const h = 0.4 + Math.random() * 0.4;
    const st = new THREE.Mesh(_mushStalkGeo, _mushStalkMat);
    const ox = (Math.random() - 0.5) * 0.5, oz = (Math.random() - 0.5) * 0.5;
    st.position.set(ox, h / 2, oz); st.scale.y = h / 0.6; g.add(st);
    const cap = new THREE.Mesh(_mushCapGeo, _mushCapMat);
    cap.position.set(ox, h, oz); cap.scale.y = 0.7; g.add(cap);
  }
  return g;
}
{
  const place = (n, build, kind) => {
    let made = 0, tries = 0;
    while (made < n && tries++ < n * 60) {
      const x = (Math.random() - 0.5) * WORLD * 0.82, z = (Math.random() - 0.5) * WORLD * 0.82;
      const y = heightAt(x, z);
      if (y < WATER_Y + 1.0 || y > 24) continue;
      if (Math.hypot(x, z - 26) < 40) continue;          // not on the doorstep
      const mesh = build(); mesh.position.set(x, y, z); scene.add(mesh);
      FORAGE.push({ x, z, kind, taken: false, mesh });
      made++;
    }
  };
  place(IS_TOUCH ? 30 : 48, buildBerry, 'berry');    // abundance — a world that feeds its herds
  place(IS_TOUCH ? 16 : 20, buildFruit, 'fruit');    // low fruit-shrubs — grazing draws + player food
  place(IS_TOUCH ? 22 : 30, buildPsyMush, 'mush');   // plenty — the world floods with them once you trip
}

// ── ANIMAL GOALS ── purpose, not just random drift. A handful of fixed
// destinations the herds steer toward: dirt burrows (foxes sniff) and
// shoreline water spots (horses drink). Built once; never per-frame.
const BURROWS = [], WATERSPOTS = [];
{
  // small dirt-hole meshes scattered on dry land — a dark ring + sunk floor
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x2a1d10, roughness: 1 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 1 });
  let made = 0, tries = 0;
  while (made < 7 && tries++ < 7 * 60) {
    const x = (Math.random() - 0.5) * WORLD * 0.72, z = (Math.random() - 0.5) * WORLD * 0.72;
    const y = heightAt(x, z);
    if (y < WATER_Y + 1.5 || y > 22) continue;
    if (Math.hypot(x, z - 26) < 45) continue;            // not on the doorstep
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.18, 10), ringMat);
    ring.position.y = 0.05; g.add(ring);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.3, 10), holeMat);
    hole.position.y = -0.04; g.add(hole);
    g.position.set(x, y, z); scene.add(g);
    BURROWS.push({ x, z });
    made++;
  }
  // ~10 shoreline points ringing the lake centroid (70, -90). Horses rotate
  // through them to drink; gators lurk at them. The lake is BIG and irregular,
  // so we search far out (to r=200) and ONLY keep a spot where we actually found
  // dry shore — never a fallback at the lake centre (that put horses + gators in
  // the middle of the deep water). Step back ~3m into the shallows from the bank.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.4;
    let bankR = -1;
    for (let r = 16; r < 200; r += 3) {
      if (heightAt(70 + Math.cos(a) * r, -90 + Math.sin(a) * r) > WATER_Y + 0.3) { bankR = r; break; }
    }
    if (bankR < 0) continue;                         // open water on this bearing — no spot here
    const r = bankR - 3;                             // ~3m off the bank, in the shallows
    WATERSPOTS.push({ x: 70 + Math.cos(a) * r, z: -90 + Math.sin(a) * r });
  }
}
window._WATERSPOTS = WATERSPOTS;   // debug/test hook

// nearest entry of a list to point p (skips taken FORAGE); jitter spreads
// the pick a touch so a herd doesn't stack on one exact spot.
function nearestOf(list, p, jitter) {
  let best = null, bd = 1e9;
  for (const e of list) {
    if (e.taken) continue;
    const j = jitter ? (Math.random() - 0.5) * jitter : 0;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = dx * dx + dz * dz + j;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// give a non-predator a destination. Sets a.goal = {kind, x, z, ref?}.
function chooseGoal(a) {
  const p = a.obj.position;
  if (a.name === 'Horse') {
    // pick a water spot it didn't JUST visit
    let pool = WATERSPOTS;
    if (a._lastWater && WATERSPOTS.length > 1) pool = WATERSPOTS.filter(w => w !== a._lastWater);
    const w = nearestOf(pool, p, 600) || nearestOf(WATERSPOTS, p, 600);
    if (w) { a.goal = { kind: 'drink', x: w.x, z: w.z, ref: w }; return; }
  } else if (a.name === 'Fox') {
    const b = nearestOf(BURROWS, p, 400);
    if (b) { a.goal = { kind: 'sniff', x: b.x, z: b.z, ref: b }; return; }
  }
  // Deer/Stag/Cow (and any fallback): forage the nearest untaken berry/fruit
  let best = null, bd = 1e9;
  for (const f of FORAGE) {
    if (f.taken || f._claimed || (f.kind !== 'berry' && f.kind !== 'fruit')) continue;
    const dx = f.x - p.x, dz = f.z - p.z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = f; }
  }
  if (best) { best._claimed = true; a.goal = { kind: 'forage', x: best.x, z: best.z, ref: best }; }
}

// ── the lights ── pale wisps that only show in the deep dark, drifting
// slow over the valley. Walk toward one and it drifts away — you can never
// quite reach it. No explanation. (Outer-Wilds curiosity, wholly wordless.)
const WISPS = []; window._wisps = WISPS;
{
  for (let i = 0; i < (IS_TOUCH ? 4 : 6); i++) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xcdecff, transparent: true, opacity: 0 }));
    g.add(core);
    const light = new THREE.PointLight(0x9fd8ff, 0, 11, 2); g.add(light);
    const x = (Math.random() - 0.5) * WORLD * 0.7, z = (Math.random() - 0.5) * WORLD * 0.7;
    g.position.set(x, heightAt(x, z) + 1.8, z);
    scene.add(g);
    WISPS.push({ g, core, light, vx: 0, vz: 0, ph: Math.random() * 6.28 });
  }
}
function wispUpdate(t, dt, night) {
  let vis = Math.max(0, (night - 0.4) / 0.6);        // only once it's truly dark
  if (tripT > 0) vis = Math.max(vis, 0.85);          // ...or whenever you're tripping
  for (const w of WISPS) {
    const p = w.g.position;
    w.vx += (Math.sin(t * 0.3 + w.ph) * 0.6 - w.vx) * dt;     // slow aimless drift
    w.vz += (Math.cos(t * 0.23 + w.ph * 1.3) * 0.6 - w.vz) * dt;
    const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
    if (d < 16 && d > 0.1) { const f = (16 - d) / 16 * 1.8; w.vx += dx / d * f; w.vz += dz / d * f; }  // recedes
    const lim = WORLD * 0.46;
    p.x = Math.max(-lim, Math.min(lim, p.x + w.vx * dt));
    p.z = Math.max(-lim, Math.min(lim, p.z + w.vz * dt));
    p.y = heightAt(p.x, p.z) + 1.7 + Math.sin(t * 0.8 + w.ph) * 0.6;
    w.core.material.opacity = vis * (0.45 + 0.45 * Math.sin(t * 1.6 + w.ph));
    w.light.intensity = vis * 1.5;
  }
}

// ── scattered wild fires ── the only honest light once it's truly dark.
// A bush that caught, a tree the lightning split and lit. They pool warm
// light across the black map — beautiful to navigate by, and the
// predators won't follow you into the ring of one. Near-invisible by day
// (a thread of smoke-glow), full and flickering at night.
const NIGHTFIRES = [];
const _logEndMat = new THREE.MeshStandardMaterial({ color: 0xb9905a, roughness: 0.9 });
function buildWildfire(x, z, kind) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  g.position.set(x, y, z);
  // ── a felled tree's stump: someone cut this for the wood ──
  const sa = Math.random() * 6.28;
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.85, 9), logMat);
  stump.position.set(Math.cos(sa) * 3.6, 0.42, Math.sin(sa) * 3.6); g.add(stump);
  const stop = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 9), _logEndMat);
  stop.position.set(stump.position.x, 0.86, stump.position.z); g.add(stop);
  // ── the LUMBER: felled logs lying around, cut to feed the fire ──
  for (let i = 0; i < 4; i++) {
    const len = 3 + Math.random() * 1.8;
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, len, 7), logMat);
    const a = Math.random() * 6.28, rr = 2.6 + Math.random() * 2.6;
    lg.position.set(Math.cos(a) * rr, 0.3, Math.sin(a) * rr);
    lg.rotation.z = Math.PI / 2; lg.rotation.y = Math.random() * 6.28; g.add(lg);
  }
  // ── the BONFIRE: a teepee of burning logs, big and beautiful ──
  for (let i = 0; i < 7; i++) {
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 3.0, 6), i % 2 ? logMat : charMat);
    const a = i / 7 * 6.28;
    lg.position.set(Math.cos(a) * 0.55, 1.0, Math.sin(a) * 0.55);
    lg.rotation.set(Math.cos(a) * 0.5, a, 0.95); g.add(lg);
  }
  buildFire(g, 0, 0, true);
  const f = g.userData.fire;
  // big, beautiful: tall layered flames, a wide warm pool, plenty of embers
  f.flame.scale.set(2.6, 3.6, 2.6); f.flame.position.y = 1.7;
  f.light.position.y = 3.4; f.light.distance = 42; f.light.intensity = 16; f.light.color.setHex(0xff9a3c);
  const emMat = (f.embers[0] && f.embers[0].material) || charMat;
  for (let i = 0; i < 7; i++) {                      // extra embers swirling up
    const e = new THREE.Mesh(emberGeo, emMat);
    const a = i * 1.5;
    e.position.set(Math.cos(a) * 0.7, 1.0 + (i % 4) * 0.5, Math.sin(a) * 0.7);
    e.userData.ph = a + 3; g.add(e); f.embers.push(e);
  }
  f.kind = 'bonfire';
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

  // (the boulder wall ring is gone — "no more rocks". The crater you punched
  //  into the earth on landing is the wall now; see buildDivot, built at the
  //  landing point. You boulder your way UP its tiers to get out.)
  const RING = 9.5;
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
  // (the hung-hide drying rack — "the sign" — was removed by request)
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

// ── the CRATER ── the divot your fall punched into the earth. Two ascending
// tiers of raw dirt ledges ring the home; you wake at the floor and must
// BOULDER your way up them (a jump per tier) to get out into the valley. A
// gap is left toward the cove. Rebuilt wherever you land.
const _dirtGeo = new THREE.BoxGeometry(1, 1, 1);
const _dirtMat = new THREE.MeshStandardMaterial({ color: 0x4e3a26, roughness: 1, flatShading: true });
const _dirtDarkMat = new THREE.MeshStandardMaterial({ color: 0x33251a, roughness: 1, flatShading: true });
let _divotGroup = null;
function buildDivot(cx, cz) {
  if (_divotGroup) { scene.remove(_divotGroup); _divotGroup = null; }
  for (let i = STEPPROPS.length - 1; i >= 0; i--) if (STEPPROPS[i]._divot) STEPPROPS.splice(i, 1);
  const g = new THREE.Group(); const gy = heightAt(cx, cz); g.position.set(cx, gy, cz);
  // scorched crater floor
  const floor = new THREE.Mesh(new THREE.CircleGeometry(13, 26), _dirtDarkMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.03; g.add(floor);
  const coveDir = Math.PI * 0.5;               // leave the wall open toward the cove
  const tiers = [{ r: 7.5, h: 2.0, n: 20 }, { r: 11, h: 4.0, n: 26 }];
  for (const tier of tiers) {
    for (let i = 0; i < tier.n; i++) {
      const a = i / tier.n * Math.PI * 2 + cx * 0.07;
      // skip a span toward the cove so you can reach it / step out there
      let da = Math.abs(((a - coveDir + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (da < 0.55) continue;
      const wx = cx + Math.cos(a) * tier.r, wz = cz + Math.sin(a) * tier.r;
      const blk = new THREE.Mesh(_dirtGeo, (i % 2) ? _dirtMat : _dirtDarkMat);
      const sh = tier.h + 3;                    // buried base, top stands tier.h proud
      blk.position.set(Math.cos(a) * tier.r, tier.h - sh / 2, Math.sin(a) * tier.r);
      blk.scale.set(2.0 + (i % 3) * 0.3, sh, 1.8);
      blk.rotation.y = a; blk.castShadow = true; g.add(blk);
      STEPPROPS.push({ x: wx, z: wz, r: 1.35, top: gy + tier.h, _divot: true });
    }
  }
  scene.add(g); _divotGroup = g;
}
window._buildDivot = (x, z) => buildDivot(x, z);

// move the whole home (campfire, cove, cache, anchors) to the bed you landed
// in, then punch the crater there. A clean translation — everything was built
// once at the first bed; this just slides it over to wherever you dropped.
function relocateHome(x, z) {
  const b = window._base; if (!b) { buildDivot(x, z); return; }
  const dx = x - BASE_RING.x, dz = z - BASE_RING.z;
  b.group.position.x += dx; b.group.position.z += dz;
  b.group.position.y = heightAt(x, z);
  if (BASE_FIRE) { BASE_FIRE.cx += dx; BASE_FIRE.cz += dz; }
  if (COVE) { COVE.x += dx; COVE.z += dz; }
  BASE_RING.x = x; BASE_RING.z = z;
  buildDivot(x, z);
}

// nearest wild fire to the player, and whether you're inside its safe ring
let nearWildFire = false, nearWildFireD = 1e9, _fireStare = 0, _revealStep = 0;
let _wakeYaw = 0, _wakePitch = 0, _wakeT = 0;   // wake reference for the control reveal
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
          setTimeout(() => toast('Every mark found.', 4000), 7500);
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
    // valley bias — mist pools in LOW ground only, fully gone on slopes/peaks
    const low = Math.max(0, Math.min(1.3, 1.45 - (gy - WATER_Y) / 8));
    // never bloom right on the lens (no grey blob in your face); fade with closeness
    const near = Math.min(1, Math.max(0, (Math.hypot(x - player.x, z - player.z) - 7) / 7));
    sp.position.set(x, gy + 1.6 + Math.sin(t * 0.2 + u.ph) * 0.4, z);
    sp.material.opacity = Math.min(0.5, edge * low * near * (0.2 + 0.12 * Math.sin(t * 0.13 + u.ph)));
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

// ── woodland critters ── tiny skittish rabbits & squirrels that graze, hop
// about, and BOLT when you get near. Ambient life, not huntable prey — their
// own light update (like the butterflies), NOT the full animal brain.
const _critters = [];
const _critFurBrown = new THREE.MeshStandardMaterial({ color: 0x6b5436, roughness: 0.9 });
const _critFurGrey  = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9 });
const _critTailWhite = new THREE.MeshStandardMaterial({ color: 0xefe9df, roughness: 1 });
function buildCritterMesh(kind) {
  const g = new THREE.Group();
  const fur = kind === 'squirrel' ? _critFurGrey : _critFurBrown;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), fur);
  body.scale.set(1, 0.85, 1.4); body.position.y = 0.16; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), fur);
  head.position.set(0, 0.26, 0.2); g.add(head);
  if (kind === 'rabbit') {
    for (const sx of [-1, 1]) {                         // two tall ears
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 2, 4), fur);
      ear.position.set(sx * 0.045, 0.42, 0.18); ear.rotation.x = -0.18; g.add(ear);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), _critTailWhite);
    tail.position.set(0, 0.18, -0.24); g.add(tail);
  } else {                                              // squirrel — big bushy curled tail
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), fur);
    tail.scale.set(0.5, 1.25, 0.5); tail.position.set(0, 0.32, -0.2); g.add(tail);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), fur);
      ear.position.set(sx * 0.05, 0.36, 0.2); g.add(ear);
    }
  }
  g.visible = false; scene.add(g); return g;
}
{
  for (let i = 0; i < 14; i++) {
    const kind = Math.random() < 0.5 ? 'rabbit' : 'squirrel';
    _critters.push({ mesh: buildCritterMesh(kind), kind, state: 'idle',
      x: 0, z: 0, dir: 0, t: Math.random() * 3, hopY: 0, ph: Math.random() * 6.28, placed: false });
  }
}
window._critters = _critters;   // debug/test hook
function _placeCritter(c) {
  for (let tr = 0; tr < 20; tr++) {
    const a = Math.random() * 6.283, r = 16 + Math.random() * 70;
    const x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
    if (heightAt(x, z) > WATER_Y + 1) {
      c.x = x; c.z = z; c.dir = Math.random() * 6.283;
      c.placed = true; c.state = 'idle'; c.t = Math.random() * 2; c.mesh.visible = true; return;
    }
  }
}
function updateCritters(dt, t) {
  for (const c of _critters) {
    if (!c.placed) { _placeCritter(c); continue; }
    const dx = c.x - player.x, dz = c.z - player.z;   // critter→away-from-you vector
    const pd = Math.hypot(dx, dz);
    if (pd > 110) { c.placed = false; c.mesh.visible = false; continue; }  // out of sight → re-home near you
    c.t -= dt;
    // SKITTISH — you closed in → bolt away in quick low hops
    if (pd < 9 && c.state !== 'bolt') {
      c.state = 'bolt'; c.t = 1.3 + Math.random() * 1.4; c.dir = Math.atan2(dx, dz);
    }
    let speed = 0;
    if (c.state === 'bolt') {
      c.dir += (Math.random() - 0.5) * 4 * dt; speed = 4.4;
      if (c.t <= 0) { c.state = 'idle'; c.t = 1 + Math.random() * 2; }
    } else if (c.state === 'hop') {
      speed = 1.3;
      if (c.t <= 0) { c.state = 'idle'; c.t = 1.5 + Math.random() * 3; }
    } else if (c.t <= 0) {                              // graze → little wander hop
      c.state = 'hop'; c.t = 0.5 + Math.random() * 1.2; c.dir = Math.random() * 6.283;
    }
    if (speed > 0) {
      const nx = c.x + Math.sin(c.dir) * speed * dt, nz = c.z + Math.cos(c.dir) * speed * dt;
      if (heightAt(nx, nz) > WATER_Y + 0.5) { c.x = nx; c.z = nz; } else c.dir += 2.1;  // veer off water
    }
    const moving = speed > 0;
    c.hopY = moving ? Math.abs(Math.sin(t * (c.state === 'bolt' ? 16 : 9) + c.ph))
                      * (c.state === 'bolt' ? 0.17 : 0.08) : 0;
    c.mesh.position.set(c.x, heightAt(c.x, c.z) + c.hopY, c.z);
    c.mesh.rotation.y = lerpAngle(c.mesh.rotation.y, c.dir, Math.min(1, dt * 8));
    c.mesh.rotation.x = moving ? 0 : Math.sin(t * 3 + c.ph) * 0.12;   // idle nibble bob
  }
}

// ── golden-hour pollen ── soft motes drifting in the light around you. Day
// only; additive gold; the box follows you so the air always shimmers.
const _dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,246,214,1)'); g.addColorStop(0.4, 'rgba(255,232,170,0.55)'); g.addColorStop(1, 'rgba(255,232,170,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const POLLEN_N = IS_TOUCH ? 90 : 170, POLLEN_BOX = 38;
const pollen = (() => {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(POLLEN_N * 3);
  for (let i = 0; i < POLLEN_N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * POLLEN_BOX;
    pos[i * 3 + 1] = Math.random() * 15;
    pos[i * 3 + 2] = (Math.random() - 0.5) * POLLEN_BOX;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: _dotTex, size: 0.24, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, color: 0xffe7a8 });
  const p = new THREE.Points(geo, mat); p.frustumCulled = false; scene.add(p); return p;
})();
function updatePollen(t, dt, night) {
  // day only — and the gold motes need sun, so they thin out under a shower
  pollen.material.opacity = 0.5 * (1 - night) * (1 - _rainLevel * 0.9);
  if (night > 0.96) return;
  pollen.position.set(player.x, heightAt(player.x, player.z), player.z);
  const a = pollen.geometry.attributes.position.array;
  for (let i = 0; i < POLLEN_N; i++) {
    a[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.25;
    a[i * 3 + 1] += dt * 0.4;                            // rise slowly through the light
    a[i * 3 + 2] += Math.cos(t * 0.25 + i) * dt * 0.25;
    if (a[i * 3 + 1] > 15.5) { a[i * 3 + 1] = 0;
      a[i * 3] = (Math.random() - 0.5) * POLLEN_BOX; a[i * 3 + 2] = (Math.random() - 0.5) * POLLEN_BOX; }
  }
  pollen.geometry.attributes.position.needsUpdate = true;
}

// ── birds ── a skein crossing the high sky, day only, on a slow loop. Adds
// life and a sense of scale to the valley.
const birds = (() => {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1e222b, side: THREE.DoubleSide });
  // a proper GULL silhouette — two swept arcs meeting at a little body, laid
  // flat so it reads from below as a distant bird, not a flat rectangle.
  const s = new THREE.Shape();
  s.moveTo(-2.0, 0.0);
  s.quadraticCurveTo(-0.9, 0.55, -0.22, 0.07);     // left wing, swept up
  s.quadraticCurveTo(0, 0.17, 0.22, 0.07);          // body hump
  s.quadraticCurveTo(0.9, 0.55, 2.0, 0.0);          // right wing
  s.quadraticCurveTo(0.9, 0.30, 0.2, -0.05);        // back along the trailing edge
  s.quadraticCurveTo(0, -0.01, -0.2, -0.05);
  s.quadraticCurveTo(-0.9, 0.30, -2.0, 0.0);
  const geo = new THREE.ShapeGeometry(s);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(geo, mat);
    b.rotation.x = -Math.PI / 2;                     // lay flat — viewed from below
    b.scale.setScalar(0.65 + Math.random() * 0.5);
    b.position.set((i - 2.5) * 5, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 12);
    b.userData.ph = i * 0.9; g.add(b);
  }
  scene.add(g); return g;
})();
let _birdT = 0;
function updateBirds(t, dt, night) {
  birds.visible = night < 0.45;
  if (!birds.visible) return;
  _birdT += dt;
  const span = WORLD * 0.6;
  const x = ((_birdT * 7) % (span * 2)) - span;         // glide across, wrap
  birds.position.set(x, 120 + Math.sin(_birdT * 0.2) * 12, Math.sin(_birdT * 0.05) * span * 0.3);
  birds.rotation.y = -Math.PI / 2;
  for (const b of birds.children) {
    const fl = Math.sin(t * 4 + b.userData.ph);
    b.rotation.x = -Math.PI / 2 + fl * 0.13;                 // wings dip — a slow flap read
    b.rotation.z = Math.sin(t * 0.7 + b.userData.ph) * 0.16;  // gentle bank
  }
}

// ── carrion birds ── a fresh kill draws scavengers: a few dark birds wheel
// in a slow ring high over a carcass, so a downed animal reads from across the
// valley (and the woods feel like they NOTICE death). Day only; they fade in a
// few beats after the kill and disperse when the carcass is taken or rots away.
// Bounded pool of flocks for the phone; each flock follows its carcass.
const _carrionWingGeo = new THREE.PlaneGeometry(1.7, 0.42);
const CARRION = []; const CARRION_MAX = IS_TOUCH ? 3 : 5;
function spawnCarrion(a) {
  if (a.isCryptid || a.eaten) return;
  if (CARRION.length >= CARRION_MAX) {                 // recycle the oldest flock
    const old = CARRION.shift(); if (old) scene.remove(old.grp);
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0x1b1f27, side: THREE.DoubleSide,
    transparent: true, opacity: 0 });
  const grp = new THREE.Group();
  const birds = [];
  const n = 3 + (Math.random() * 2 | 0);              // 3-4 scavengers
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(_carrionWingGeo, mat);
      w.rotation.x = -Math.PI / 2; w.position.x = s * 0.95; w.rotation.y = s * 0.5; b.add(w);
    }
    b.userData = { ph: i * (Math.PI * 2 / n), rad: 6 + Math.random() * 3, vph: Math.random() * 6 };
    grp.add(b); birds.push(b);
  }
  scene.add(grp);
  CARRION.push({ grp, birds, mat, target: a, fade: 0, delay: 3.5 + Math.random() * 2, spin: Math.random() * 6 });
}
function carrionUpdate(t, dt, night) {
  for (let i = CARRION.length - 1; i >= 0; i--) {
    const f = CARRION[i], a = f.target;
    const valid = a && a.dead && !a.eaten && a.t > 1.5 && animals.indexOf(a) !== -1;
    if (f.delay > 0) f.delay -= dt;
    // fade in only once the delay passes and it's daylight; otherwise fade out
    const show = valid && f.delay <= 0 && night < 0.5;
    f.fade += (show ? dt / 2.6 : -dt / 1.8);
    f.fade = Math.max(0, Math.min(1, f.fade));
    if (!valid && f.fade <= 0) { scene.remove(f.grp); CARRION.splice(i, 1); continue; }
    f.mat.opacity = 0.82 * f.fade;
    f.grp.visible = f.fade > 0.01;
    if (!f.grp.visible) continue;
    const c = a.obj.position;
    const gy = heightAt(c.x, c.z) + 17 + (1 - f.fade) * 10;   // descends as it commits
    f.grp.position.set(c.x, gy, c.z);
    for (const b of f.birds) {
      const ang = f.spin + t * 0.5 + b.userData.ph;
      const r = b.userData.rad;
      b.position.set(Math.cos(ang) * r, Math.sin(t * 0.4 + b.userData.vph) * 1.3, Math.sin(ang) * r);
      b.rotation.y = -ang;                              // face along the circle
      const fl = Math.sin(t * 6 + b.userData.vph) * 0.6;
      b.children[0].rotation.y = 0.5 + fl; b.children[1].rotation.y = -0.5 - fl;
    }
  }
}
window._carrion = () => CARRION.filter(f => f.grp.visible).length;   // debug/test hook

// ── distant wildlife ── dark elk/stag shapes standing on the far ridgelines,
// unreachable, so the valley reads as vast and ALIVE — the world doesn't stop
// at the treeline. Cheap dark billboards on high far ground; they idle, amble a
// few steps now and then, and fade out after dark. Backlit silhouettes at the
// golden hour. A fixed small set (no pool churn).
const _silTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#000';
  // body
  x.beginPath(); x.ellipse(30, 36, 16, 7, 0, 0, 7); x.fill();
  // neck + head, raised
  x.beginPath(); x.moveTo(42, 34); x.lineTo(48, 18); x.lineTo(54, 16); x.lineTo(55, 21);
  x.lineTo(50, 23); x.lineTo(47, 36); x.closePath(); x.fill();
  // four legs
  x.fillRect(20, 41, 3, 16); x.fillRect(27, 42, 3, 15);
  x.fillRect(36, 42, 3, 15); x.fillRect(42, 41, 3, 16);
  // antlers — a couple of forked tines off the head
  x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath();
  x.moveTo(52, 16); x.lineTo(50, 8); x.moveTo(50, 11); x.lineTo(46, 9);
  x.moveTo(54, 16); x.lineTo(57, 8); x.moveTo(56, 11); x.lineTo(60, 10); x.stroke();
  const t = new THREE.CanvasTexture(c); return t;
})();
const _silGeo = new THREE.PlaneGeometry(4.2, 4.2);
const _silhouettes = [];
function _findRidgePoint() {
  // sample far-out points, keep the highest few tries — silhouettes want a rim
  let bx = 0, bz = 0, bh = -1;
  for (let i = 0; i < 14; i++) {
    const ang = Math.random() * Math.PI * 2, rad = 200 + Math.random() * 170;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    if (Math.abs(x) > WORLD * 0.46 || Math.abs(z) > WORLD * 0.46) continue;
    const h = heightAt(x, z);
    if (h > bh) { bh = h; bx = x; bz = z; }
  }
  return { x: bx, z: bz, y: bh };
}
function buildSilhouettes() {
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: _silTex, color: 0x141519,
      transparent: true, opacity: 0.9, depthWrite: false });
    const m = new THREE.Mesh(_silGeo, mat);
    const p = _findRidgePoint();
    m.position.set(p.x, p.y + 2.0, p.z);
    m.userData = { home: p, ambleT: 4 + Math.random() * 12, dir: Math.random() * 6.28 };
    scene.add(m); _silhouettes.push(m);
  }
}
function silhouettesUpdate(t, dt, night) {
  if (!_silhouettes.length) return;
  const vis = Math.max(0, 1 - night * 1.4);          // fade out as night falls
  for (const m of _silhouettes) {
    m.material.opacity = 0.9 * vis;
    m.visible = vis > 0.02;
    if (!m.visible) continue;
    // billboard yaw-only so it stays upright on the ridge
    m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
    // a slow amble along the ridge every so often, kept on high ground
    const u = m.userData; u.ambleT -= dt;
    if (u.ambleT > 0 && u.ambleT < 2.5) {           // walking window
      const nx = m.position.x + Math.sin(u.dir) * 0.7 * dt,
            nz = m.position.z + Math.cos(u.dir) * 0.7 * dt;
      const nh = heightAt(nx, nz);
      if (nh > u.home.y - 6) { m.position.set(nx, nh + 2.0, nz); }
    } else if (u.ambleT <= 0) { u.ambleT = 8 + Math.random() * 16; u.dir = Math.random() * 6.28; }
    m.position.y += Math.sin(t * 0.6 + u.dir) * 0.0015;   // barely-there idle
  }
}
window._silhouettes = () => _silhouettes.filter(m => m.visible).length;   // debug/test hook
buildSilhouettes();   // stand them on the far ridges from the very first frame

// ── things in the dark ── after nightfall, shapes you can't quite make out
// lope past you and are gone. You don't know what they are or why. Unsettling.
const _darters = [];
const _darterGeo = new THREE.IcosahedronGeometry(0.6, 0);
const _darterBaseMat = new THREE.MeshStandardMaterial({ color: 0x05070b, roughness: 0.85, transparent: true, opacity: 0 });
const _darterLines = ['What was that.', 'Did I hear something.', 'Something moved.',
  'Something out there.', 'That wasn’t the wind.'];
let _darterCd = 7;
window._darterActive = () => _darters.some(d => d.active);   // debug/test hook
window._spawnDarter = () => spawnDarter();                    // debug/test hook
function spawnDarter() {
  let d = _darters.find(x => !x.active);
  if (!d) {
    if (_darters.length >= 3) return;
    const m = new THREE.Mesh(_darterGeo, _darterBaseMat.clone());
    m.scale.set(1.9, 0.7, 0.85); scene.add(m);
    d = { mesh: m, active: false }; _darters.push(d);
  }
  const ang = Math.random() * 6.28, perp = ang + Math.PI / 2;
  const off = 11 + Math.random() * 11;                 // passes 11-22m off
  const cx = player.x + Math.cos(ang) * off, cz = player.z + Math.sin(ang) * off, span = 44;
  d.sx = cx - Math.cos(perp) * span; d.sz = cz - Math.sin(perp) * span;
  d.ex = cx + Math.cos(perp) * span; d.ez = cz + Math.sin(perp) * span;
  d.t = 0; d.dur = 2.0 + Math.random() * 1.2; d.active = true; d.mesh.visible = true;
}
function updateDarters(dt, night) {
  _darterCd -= dt;
  if (night > 0.5 && _darterCd <= 0 && !dead) {
    _darterCd = 10 + Math.random() * 16; spawnDarter();
    if (Math.random() < 0.45) toast(_darterLines[(Math.random() * _darterLines.length) | 0], 2600);
  }
  for (const d of _darters) {
    if (!d.active) continue;
    d.t += dt; const p = d.t / d.dur;
    if (p >= 1) { d.active = false; d.mesh.visible = false; continue; }
    const x = d.sx + (d.ex - d.sx) * p, z = d.sz + (d.ez - d.sz) * p;
    d.mesh.position.set(x, heightAt(x, z) + 0.5 + Math.abs(Math.sin(p * Math.PI * 7)) * 0.35, z);
    d.mesh.lookAt(d.ex, d.mesh.position.y, d.ez);
    d.mesh.material.opacity = Math.sin(p * Math.PI) * 0.85;   // fade in then out across the run
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
  // procedural creatures (spider, gator) have no .glb — don't try to load one
  const glbNames = names.filter(n => !SPECIES[n].spiderish && !SPECIES[n].gatorish);
  const files = [...new Set(glbNames.map(n => PREFAB_FILE[n] || n))];
  await Promise.all(files.map(f => new Promise((res, rej) =>
    loader.load(`assets/animals/${f}.glb`, g => { prefabs[f] = g; res(); }, undefined, rej))));
  for (const n of glbNames) prefabs[n] = prefabs[PREFAB_FILE[n] || n];
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
    } else if (n === 'Bear') {
      // findable, but FAR from every bed — never where you wake
      for (let i = 0; i < SPECIES.Bear.n; i++) {
        const b = spawn('Bear');
        for (let tr = 0; tr < 40; tr++) {
          const ang = Math.random() * Math.PI * 2, rr = 100 + Math.random() * 90;
          const bx = SPAWN.x + Math.cos(ang) * rr, bz = SPAWN.z + Math.sin(ang) * rr;
          if (heightAt(bx, bz) > WATER_Y + 1 && FLOWERBEDS.every(bd => Math.hypot(bx - bd.x, bz - bd.z) > 95)) {
            b.obj.position.set(bx, heightAt(bx, bz), bz); break;
          }
        }
      }
    } else if (n === 'Fox') {
      // the little critters cluster near EVERY bed (round-robin), so wherever
      // you land you wake to small things scuffling and spooking nearby
      for (let i = 0; i < SPECIES.Fox.n; i++) {
        const fx = spawn('Fox');
        if (i < SPECIES.Fox.n - 3) {                  // leave a few wild & far
          const bed = FLOWERBEDS[i % FLOWERBEDS.length];
          for (let tr = 0; tr < 30; tr++) {
            const ang = Math.random() * Math.PI * 2, rr = 14 + Math.random() * 40;
            const x = bed.x + Math.cos(ang) * rr, z = bed.z + Math.sin(ang) * rr;
            if (heightAt(x, z) > WATER_Y + 1) { fx.obj.position.set(x, heightAt(x, z), z); break; }
          }
        }
      }
    } else for (let i = 0; i < SPECIES[n].n; i++) spawn(n);
  }
  // ── Stage D: the feeding tableau ── sometimes you crest a rise to find a
  // bear already hunched over a deer it killed, opened and eating. ~60% of loads.
  if (Math.random() < 0.6) {
    const bear = animals.find(a => a.cfg.bearish && !a.dead && !a._tableau);
    if (bear) {
      const bp = bear.obj.position;
      const deer = spawn('Deer', bp);
      deer.obj.position.set(bp.x, heightAt(bp.x, bp.z), bp.z);   // at its feet
      deer.dead = true; deer.t = 1e9; deer.eaten = true;         // persistent, claimed
      setAnim(deer, 'Death', true);
      gutCarcass(deer);                                          // opened body + blood pool
      bear.state = 'eat'; bear._tableau = deer;
      bear.dir = Math.atan2(deer.obj.position.x - bp.x, deer.obj.position.z - bp.z);
      setAnim(bear, 'Eating');
      bloodyMuzzle(bear);
    }
  }
}

// ── the bear ── built from primitives (no CC0 animated bear asset exists),
// so it actually reads as a bear, not the old dark-bull stand-in: a heavy
// body with a shoulder hump, a low forward head + snout, round ears, small
// dark eyes, and four swinging legs. Animated procedurally (bearAnim).
const _bearEyeMat = new THREE.MeshStandardMaterial({ color: 0xff2a08, emissive: 0xff1e04,
  emissiveIntensity: 2.6, roughness: 0.3 });   // burning eyes — shared
function buildBearMesh(tint) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: tint, roughness: 1, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x080605, roughness: 0.4 });
  // a heavier, broader frame — reads as a wall of muscle
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 2.2), fur);
  body.position.set(0, 1.05, 0); body.castShadow = true; g.add(body);
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.66, 8, 6), fur);
  rump.position.set(0, 1.05, -1.05); rump.scale.set(1.05, 1.0, 0.95); g.add(rump);
  // grizzly shoulder hump — a low, elongated muscular ridge over the FRONT
  // shoulders that flows into the spine and neck. (Earlier it sat tall, round
  // and isolated right behind the skull, reading as a dinosaur frill/shield —
  // flattened + stretched along z so it blends instead of looming.)
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), fur);
  hump.position.set(0, 1.32, 0.4); hump.scale.set(1.12, 0.62, 1.55); hump.castShadow = true; g.add(hump);
  const headPiv = new THREE.Group(); headPiv.position.set(0, 1.2, 1.12); g.add(headPiv);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.66), fur);
  head.position.set(0, -0.05, 0.12); head.castShadow = true; headPiv.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.34, 0.5), fur);
  snout.position.set(0, -0.16, 0.55); headPiv.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), dark);
  nose.position.set(0, -0.09, 0.82); headPiv.add(nose);
  // bared lower jaw with a hint of teeth
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.4), dark);
  jaw.position.set(0, -0.3, 0.5); headPiv.add(jaw);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), fur);
    ear.position.set(sx * 0.27, 0.34, -0.04); headPiv.add(ear);
    // burning eyes — small, low, forward; they glow in the dark
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), _bearEyeMat);
    eye.position.set(sx * 0.19, 0.04, 0.46); headPiv.add(eye);
  }
  const legs = [];
  const legPos = [[-0.48, 1.05, 0.8], [0.48, 1.05, 0.8], [-0.48, 1.05, -0.8], [0.48, 1.05, -0.8]];
  for (const [lx, ly, lz] of legPos) {
    const piv = new THREE.Group(); piv.position.set(lx, ly, lz); g.add(piv);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.05, 6), fur);
    leg.position.y = -0.52; leg.castShadow = true; piv.add(leg);
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.44), fur);
    paw.position.set(0, -1.05, 0.1); piv.add(paw);
    // pale claws on the front paws
    for (const cx of [-1, 0, 1]) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4),
        new THREE.MeshStandardMaterial({ color: 0xcfc4ad, roughness: 0.6 }));
      claw.position.set(cx * 0.09, -1.12, 0.3); claw.rotation.x = 1.7; piv.add(claw);
    }
    legs.push(piv);
  }
  g.userData.bear = { headPiv, legs, tilt: 0, muzzle: [snout, jaw] };
  return g;
}
// a fresh kill paints the snout/jaw — the head boxes forward of the eyes.
const _bloodMuzzleMat = new THREE.MeshStandardMaterial({ color: 0x3a0805, roughness: 0.4,
  emissive: 0x1a0302, emissiveIntensity: 0.3 });
function bloodyMuzzle(a) {
  const b = a.obj.userData.bear; if (!b || !b.muzzle) return;
  for (const m of b.muzzle) m.material = _bloodMuzzleMat;
}
// procedural bear animation: leg swing while moving, head bob, and a
// rise/lean when it rears or charges. Driven each frame from its state.
function bearAnim(a, dt, moving) {
  const b = a.obj.userData.bear; if (!b) return;
  a.gaitPhase += dt * 6 * (a.gaitTs || 1);
  const s = Math.sin(a.gaitPhase);
  const swing = moving ? 0.6 : 0;
  for (let i = 0; i < b.legs.length; i++) {
    const ph = (i === 0 || i === 3) ? s : -s;       // diagonal gait
    b.legs[i].rotation.x = ph * swing;
  }
  // feeding: head buried low in the carcass, small rhythmic tugs as it pulls
  // meat; otherwise the normal walk-bob / idle-breathe.
  if (a.state === 'eat')
    b.headPiv.rotation.x = 0.7 + Math.abs(Math.sin(a.gaitPhase * 1.6)) * 0.18;  // hunched, munching
  else
    b.headPiv.rotation.x = moving ? s * 0.06 : Math.sin(a.gaitPhase * 0.3) * 0.04;  // bob / breathe
  // rear up on hind legs when rearing; lean low + forward when charging; a
  // feeding bear hunches forward over the kill.
  let tilt = 0, lift = 0;
  if (a.state === 'rear') { tilt = -0.7; lift = 0.5; }
  else if (a.state === 'charge') { tilt = 0.12; }
  else if (a.state === 'eat') { tilt = 0.22; }                  // shoulders dropped over the deer
  b.tilt += (tilt - b.tilt) * Math.min(1, dt * 6);
  a.obj.rotation.x = b.tilt;
  a.obj.position.y = heightAt(a.obj.position.x, a.obj.position.z)
    + (moving ? Math.abs(s) * 0.07 : 0) + lift * Math.max(0, -b.tilt / 0.7);
}

// ════ THE SPIDERS ════ small, dark, glowing-eyed scuttlers. Procedural.
const _spiderMat = new THREE.MeshStandardMaterial({ color: 0x160b12, roughness: 0.45, flatShading: true });
const _spiderEyeMat = new THREE.MeshStandardMaterial({ color: 0xff2a08, emissive: 0xff1e04, emissiveIntensity: 2.4, roughness: 0.3 });
const _spiderLegGeo = new THREE.CylinderGeometry(0.045, 0.03, 0.75, 4);
function buildSpiderMesh() {
  const g = new THREE.Group();
  const abd = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), _spiderMat);   // abdomen
  abd.position.set(0, 0.55, -0.34); abd.scale.set(1, 0.82, 1.2); abd.castShadow = true; g.add(abd);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), _spiderMat);
  head.position.set(0, 0.5, 0.34); head.scale.set(1, 0.8, 1); g.add(head);
  for (const [ex, ey] of [[-0.12, 0.6], [0.12, 0.6], [-0.22, 0.5], [0.22, 0.5]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), _spiderEyeMat);
    eye.position.set(ex, ey, 0.6); g.add(eye);
  }
  const legs = [];
  for (let s = 0; s < 2; s++) for (let i = 0; i < 4; i++) {
    const side = s ? 1 : -1;
    const piv = new THREE.Group(); piv.position.set(side * 0.26, 0.55, 0.28 - i * 0.22); g.add(piv);
    const seg = new THREE.Mesh(_spiderLegGeo, _spiderMat);
    seg.position.set(side * 0.3, -0.12, 0); seg.rotation.z = side * -0.95; seg.rotation.x = 0.18; piv.add(seg);
    legs.push({ piv, phase: i * 0.7 + s * 0.35 });
  }
  g.userData.spider = { legs, abd };
  return g;
}
function spiderAnim(a, dt, moving) {
  const sp = a.obj.userData.spider; if (!sp) return;
  a.gaitPhase += dt * (moving ? 18 : 4);
  for (const L of sp.legs) L.piv.rotation.x = Math.sin(a.gaitPhase + L.phase) * (moving ? 0.55 : 0.12);
  sp.abd.position.y = 0.55 + Math.abs(Math.sin(a.gaitPhase * 0.5)) * 0.04;
}
function killSpider(a) {
  if (a.dead) return;
  a.dead = true; a.eaten = true; a.t = 1.0;   // vermin — no meat, vanishes fast
  a.obj.rotation.z = 1.4;
  if (a._thread) { scene.remove(a._thread); a._thread = null; }   // cut the silk
  score[a.name] = (score[a.name] || 0) + 1;
  if (audio.impact) audio.impact('flesh', 0.35);
}
window._killSpider = killSpider;
// follow + LEAP. Weak nip on contact. Fire (a fire-arrow or a tree blaze) kills.
// a fine silk thread (scene-space so the spider's own scale doesn't distort it)
// strung from a canopy anchor down to the hanging spider. Stretched each frame.
function _spiderThread() {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 4),
    new THREE.MeshBasicMaterial({ color: 0xe8eded, transparent: true, opacity: 0.4 }));
  t.castShadow = false; scene.add(t); return t;
}
function updateSpiderThread(a) {
  const t = a._thread; if (!t) return;
  const sy = a.obj.position.y, len = Math.max(0.02, a._hangAnchorY - sy);
  t.position.set(a._hangX, sy + len / 2, a._hangZ);
  t.scale.y = len; t.visible = true;
}

function spiderUpdate(a, dt, dx, dz, dist) {
  a.attackCd -= dt;
  // ── web-DROP ambush ── it hangs from a canopy thread, swaying, until you pass
  // beneath; then it plunges straight down on the silk and lands at your feet.
  if (a._webState === 'hang') {
    a._webBob = (a._webBob || 0) + dt;
    a.obj.position.set(
      a._hangX + Math.sin(a._webBob * 0.8) * 0.05,
      a._hangAnchorY - a._hangLen + Math.sin(a._webBob * 1.6) * 0.04,
      a._hangZ + Math.cos(a._webBob * 0.7) * 0.05);
    a.dir = Math.atan2(dx, dz);
    a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 4));
    updateSpiderThread(a);
    const hd = Math.hypot(player.x - a._hangX, player.z - a._hangZ);
    if (hd < 6.5 && Math.abs(player.y - heightAt(a._hangX, a._hangZ)) < 6) {
      a._webState = 'drop'; a._dropVy = 1.5;                       // it lets go
      if (audio.themeSting) audio.themeSting('sting_escape', 0.95); // the sudden scare
    }
    spiderAnim(a, dt, false);
    return;
  }
  if (a._webState === 'drop') {
    a._dropVy += 24 * dt;                                          // accelerates down the silk
    a.obj.position.y -= a._dropVy * dt;
    a.dir = Math.atan2(dx, dz);
    a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 4));
    const gy = heightAt(a._hangX, a._hangZ);
    if (a.obj.position.y <= gy) {                                  // it hits the ground in front of you
      a.obj.position.y = gy; a._webState = 'ground';
      if (a._thread) { scene.remove(a._thread); a._thread = null; }
      camShakeT = Math.max(camShakeT, SHAKE_DUR * 0.6);
    } else { updateSpiderThread(a); }
    spiderAnim(a, dt, true);
    return;
  }
  // caught in a fire → it burns
  for (const f of TREEFIRES) {
    if (Math.hypot(a.obj.position.x - f.tr.x, a.obj.position.z - f.tr.z) < 3.6) { killSpider(a); return; }
  }
  const aggroR = a.cfg.aggroR || 32;
  a._spY = a._spY ?? 0; a._leapVy = a._leapVy ?? 0;
  let moved = false;
  if (dist < aggroR) {
    a.dir = Math.atan2(dx, dz);
    a._leapCd = (a._leapCd ?? Math.random() * 3) - dt;
    if (a._leapCd <= 0 && a._spY <= 0.02 && dist < 9 && dist > 1.5) {
      a._leapCd = 2.4 + Math.random() * 1.5; a._leapVy = 5.0; a._leaping = true;
    }
    stepAnimal(a, a._leaping ? a.cfg.gallop * 1.7 : a.cfg.speed, dt);
    moved = true;
    if (a._spY > 0 || a._leapVy > 0 || a._leaping) {
      a._leapVy -= 14 * dt; a._spY = Math.max(0, a._spY + a._leapVy * dt);
      if (a._spY <= 0) { a._leapVy = 0; a._leaping = false; }
    }
    a.obj.position.y = heightAt(a.obj.position.x, a.obj.position.z) + a._spY;
    if (dist < 1.7 && a.attackCd <= 0 && meleeReach()) { a.attackCd = 1.0; hurtPlayer(a.cfg.dmg || 6); }
  } else {
    wander(a, dt); moved = true;
  }
  a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 10));
  spiderAnim(a, dt, moved);
}

// ════ THE SHARKS ════ oversized, Jaws-style. Procedural, low-poly, LONGER
// than the canoe. They patrol the deepest lake water with only the dorsal
// fin breaking the surface; once you're out on the water long enough one
// commits and runs you down faster than you can paddle.
const _sharkMat = new THREE.MeshStandardMaterial({ color: 0x33424b, roughness: 0.7, flatShading: true });
const _sharkBelly = new THREE.MeshStandardMaterial({ color: 0xb9c2c4, roughness: 0.7, flatShading: true });
const _sharkMaw = new THREE.MeshStandardMaterial({ color: 0x140707, roughness: 0.5 });
function buildSharkMesh() {
  const g = new THREE.Group();
  // long tapered body — a stretched, pinched box reads as a streamlined hull.
  // ~9m nose-to-tail, longer than the dugout canoe.
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 7.0), _sharkMat);
  body.position.set(0, 0, 0); body.castShadow = true; g.add(body);
  // pale belly slab tucked under the body
  const belly = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 6.0), _sharkBelly);
  belly.position.set(0, -0.75, 0.2); g.add(belly);
  // blunt snout cone forward (+z)
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 6), _sharkMat);
  snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.05, 4.4); g.add(snout);
  // a dark throat void so an OPEN mouth reads as a maw, not a gap
  const throat = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.7, 1.6), _sharkMaw);
  throat.position.set(0, -0.05, 3.9); g.add(throat);
  // the hinged LOWER JAW — drops open on the strike. Pivots at its rear edge.
  const jaw = new THREE.Group(); jaw.position.set(0, -0.35, 3.3); g.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.4, 1.9), _sharkMat);
  jawMesh.position.set(0, -0.12, 0.95); jaw.add(jawMesh);
  // teeth — white cones lining the upper lip and the lower jaw
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.5 });
  for (let i = 0; i < 7; i++) {
    const tx = -0.55 + i * 0.18;
    const ut = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.32, 4), toothMat);
    ut.rotation.x = Math.PI; ut.position.set(tx, -0.18, 4.2); g.add(ut);   // upper, point down
    const lt = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3, 4), toothMat);
    lt.position.set(tx, 0.08, 1.7); jaw.add(lt);                            // lower, point up
  }
  // the iconic TALL dorsal fin — this is the only part that shows above water
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 4), _sharkMat);
  fin.rotation.x = -0.25; fin.position.set(0, 1.5, -0.3); fin.castShadow = true; g.add(fin);
  // swept tail fluke (-z), a tall vertical blade
  const tailPiv = new THREE.Group(); tailPiv.position.set(0, 0, -3.4); g.add(tailPiv);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.6, 4), _sharkMat);
  tail.scale.set(0.4, 1, 1); tail.position.set(0, 0.2, -1.0); tail.rotation.x = -1.2; tailPiv.add(tail);
  // pectoral fins out either side
  for (const sx of [-1, 1]) {
    const pec = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 4), _sharkMat);
    pec.scale.set(1, 0.3, 1); pec.rotation.z = sx * 1.5; pec.rotation.y = sx * 0.4;
    pec.position.set(sx * 1.1, -0.4, 1.6); g.add(pec);
  }
  g.userData.shark = { tailPiv, jaw };
  return g;
}
// ── the shark system ── HUGE (~2x the raft), RARE and stealthy. They wander the
// whole lake mostly fully submerged; you only glimpse a fin for a few seconds
// now and then. After you've been afloat 30-90s the nearest one commits to a
// SCARE: it surfaces and CIRCLES you ~15s (dread swelling), then DIVES under and
// the music fades — a near-miss, not (usually) a bite. Then a cooldown.
const SHARKS = [];
const SHARK_CENTER = { x: 70, z: -90 };   // the deepest part of the lake
const SHARK_SCALE = 6.6;                  // a sea-monster — dwarfs the whole raft
function spawnSharks() {
  for (let i = 0; i < 2; i++) {           // sparse — rarely more than one in view
    const obj = buildSharkMesh(); obj.scale.setScalar(SHARK_SCALE);
    const a = i * Math.PI + Math.random(), r = 22 + Math.random() * 30;
    obj.position.set(SHARK_CENTER.x + Math.cos(a) * r, WATER_Y - 10, SHARK_CENTER.z + Math.sin(a) * r);
    obj.rotation.y = a; scene.add(obj);
    SHARKS.push({
      obj, dir: a, state: 'patrol', tailPh: Math.random() * 6.283,
      wpx: obj.position.x, wpz: obj.position.z, wpT: 0,
      surfaceT: 6 + Math.random() * 8, surfUp: 0,
      circleT: 0, diveT: 0, circleSign: Math.random() < 0.5 ? 1 : -1,
      biteCd: 0, _subY: WATER_Y - 10, _spl: 0,
    });
  }
}
let _sharkInWaterT = 0, _sharkScareCd = 0, _sharkOnset = 30 + Math.random() * 60;
let _sharkLungeCd = 18 + Math.random() * 18;
function sharkUpdate(dt) {
  if (!SHARKS.length) return;
  const onWater = inCanoe || (player.y < WATER_Y + 0.5
    && Math.hypot(player.x - SHARK_CENTER.x, player.z - SHARK_CENTER.z) < 150);
  if (onWater) _sharkInWaterT += dt; else _sharkInWaterT = 0;
  _sharkScareCd -= dt;
  const scareActive = SHARKS.some(s => s.state === 'circle' || s.state === 'dive' || s.state === 'lunge');
  if (onWater && !scareActive && _sharkInWaterT > _sharkOnset && _sharkScareCd <= 0) {
    let best = null, bd = 1e9;            // the nearest shark commits to the Jaws SCARE
    for (const s of SHARKS) { const d = Math.hypot(s.obj.position.x - player.x, s.obj.position.z - player.z); if (d < bd) { bd = d; best = s; } }
    if (best) { best.state = 'circle'; best.circleT = 15;
      // you SPOT it surfacing — a distant monster groan + the camera turns to it
      if (audio.sharkRoar) audio.sharkRoar(best.obj.position.x, best.obj.position.z, 0.7);
      cineLook(best.obj.position.x, WATER_Y + 1.5, best.obj.position.z, 1.4, 0.85);
    }
  }
  // RANDOM ATTACK — besides the set-piece circle scare, a shark will just GO for
  // you out of nowhere now and then (more the longer you linger): a fast
  // surfacing charge straight at the boat that bites if it reaches you.
  _sharkLungeCd -= dt;
  if (onWater && !scareActive && _sharkInWaterT > 6 && _sharkLungeCd <= 0) {
    let best = null, bd = 1e9;
    for (const s of SHARKS) { if (s.state !== 'patrol') continue; const d = Math.hypot(s.obj.position.x - player.x, s.obj.position.z - player.z); if (d < bd) { bd = d; best = s; } }
    if (best && bd < 100) { best.state = 'lunge'; best.lungeT = 2.8; best.biteCd = 0; _sharkLungeCd = 16 + Math.random() * 22;
      // the monster BELLOWS as it commits, the camera SNAPS to it (Gears-style),
      // and a stinger hits — so you always know it's coming and where.
      if (audio.sharkRoar) audio.sharkRoar(best.obj.position.x, best.obj.position.z, 1.0);
      if (audio.themeSting) audio.themeSting('sting_escape', 0.9);
      cineLook(best.obj.position.x, WATER_Y + 3, best.obj.position.z, 1.7, 1.0);
    }
  }
  const finTip = 2.6 * SHARK_SCALE;
  const upY = WATER_Y - (finTip - 0.6);  // fin breaks the surface
  const downY = WATER_Y - finTip - 3.0;  // fully under, gone
  let dread = 0;
  for (const s of SHARKS) {
    const p = s.obj.position;
    const dist = Math.hypot(player.x - p.x, player.z - p.z);
    s.biteCd -= dt;
    let speed = 3.6, finUp;
    if (s.state === 'circle') {
      s.circleT -= dt; finUp = true;
      const ang = Math.atan2(p.z - player.z, p.x - player.x) + s.circleSign * dt * 0.5;
      const tx = player.x + Math.cos(ang) * 13, tz = player.z + Math.sin(ang) * 13;
      s.dir = Math.atan2(tx - p.x, tz - p.z); speed = 6.5;
      dread = Math.max(dread, 0.5 + 0.5 * Math.min(1, (15 - s.circleT) / 4));
      s._spl -= dt; if (s._spl <= 0) { s._spl = 0.8 + Math.random() * 0.7; if (audio.sharkSfx) audio.sharkSfx('shark_splash', p.x, p.z, { gain: 0.7 }); }
      if (dist < 5 && s.biteCd <= 0) { s.biteCd = 2.5; hurtPlayer(30); if (audio.sharkSfx) audio.sharkSfx('shark_lunge', p.x, p.z); }   // only if you crowd it
      if (s.circleT <= 0) { s.state = 'dive'; s.diveT = 10; if (audio.sharkSfx) audio.sharkSfx('shark_splash', p.x, p.z, { gain: 0.9 }); }
    } else if (s.state === 'lunge') {
      // a fast surfacing CHARGE straight at you — bites if it reaches the boat
      s.lungeT -= dt; finUp = true; speed = 13;
      s.dir = Math.atan2(player.x - p.x, player.z - p.z);
      s.obj.rotation.y = lerpAngle(s.obj.rotation.y, s.dir, Math.min(1, dt * 6));  // turn hard onto you
      dread = Math.max(dread, 0.85);
      if (dist < 7.0 && s.biteCd <= 0) {
        s.biteCd = 99; camShakeT = SHAKE_DUR * 3; kickT = KICK_DUR;
        const took = biteBoatLog();                  // it TEARS A LOG off the raft (no HP damage)
        if (audio.sharkRoar) audio.sharkRoar(p.x, p.z, 1.2);
        if (audio.sharkSfx) audio.sharkSfx('shark_lunge', p.x, p.z, { gain: 1.2 });
        if (audio.themeSting) audio.themeSting('sting_escape', 0.95);
        cineLook(p.x, WATER_Y + 3, p.z, 1.2, 1.0);
        toast(took ? 'The shark tore a log off the raft!' : 'The shark slammed the boat!', 2600);
        s.state = 'dive'; s.diveT = 8;
      } else if (s.lungeT <= 0) {                    // missed — it dives off
        s.state = 'dive'; s.diveT = 8;
        if (audio.sharkSfx) audio.sharkSfx('shark_splash', p.x, p.z, { gain: 0.8 });
      }
    } else if (s.state === 'dive') {
      s.diveT -= dt; finUp = false; speed = 5.5;
      dread = Math.max(dread, Math.max(0, (s.diveT / 10) * 0.5));   // fades over ~10s
      if (s.diveT <= 0) { s.state = 'patrol'; _sharkScareCd = 25 + Math.random() * 35; _sharkOnset = 30 + Math.random() * 60; _sharkInWaterT = 0; }
    } else {                               // patrol: WANDER the lake, mostly submerged
      s.wpT -= dt;
      if (s.wpT <= 0) { s.wpT = 6 + Math.random() * 8; const a = Math.random() * 6.283, r = Math.random() * 75; s.wpx = SHARK_CENTER.x + Math.cos(a) * r; s.wpz = SHARK_CENTER.z + Math.sin(a) * r; }
      s.dir = Math.atan2(s.wpx - p.x, s.wpz - p.z);
      s.surfaceT -= dt;                    // a rare fin glimpse: up ~3s every ~8-16s
      if (s.surfaceT <= 0) { s.surfUp = s.surfUp > 0.5 ? 0 : 1; s.surfaceT = s.surfUp > 0.5 ? (2.5 + Math.random() * 2) : (8 + Math.random() * 8); }
      finUp = s.surfUp > 0.5;
    }
    s.obj.rotation.y = lerpAngle(s.obj.rotation.y, s.dir, Math.min(1, dt * 2.0));
    const nx = p.x + Math.sin(s.obj.rotation.y) * speed * dt, nz = p.z + Math.cos(s.obj.rotation.y) * speed * dt;
    if (WATER_Y - heightAt(nx, nz) > 1.5) { p.x = nx; p.z = nz; } else { s.wpT = 0; }   // stay in deep water
    const tgtY = finUp ? upY : downY;
    s._subY += (tgtY - s._subY) * Math.min(1, dt * 1.4);
    p.y = s._subY + Math.sin(s.tailPh) * 0.05;
    const sd = s.obj.userData.shark;
    if (sd) {
      s.tailPh += dt * (s.state === 'lunge' ? 13 : s.state === 'circle' ? 9 : 4);
      sd.tailPiv.rotation.y = Math.sin(s.tailPh) * 0.45;
      // jaws GAPE WIDE on the strike (and a little while circling), snap shut otherwise
      if (sd.jaw) {
        const gape = s.state === 'lunge' ? 0.85 : s.state === 'circle' ? 0.18 : 0;
        sd.jaw.rotation.x += (gape - sd.jaw.rotation.x) * Math.min(1, dt * 8);
      }
    }
  }
  if (audio.sharkDread) audio.sharkDread(dread);
}
spawnSharks();   // the lake already exists (built at module load) — stock it once

// ════ THE DEEP ONE ════ a building-sized thing that lives far below, deeper than
// anything else, never quite resolved. It only ever drifts back and forth in the
// abyss, slow as a continent. No interaction, no threat — pure thalassophobia:
// glance down through the half-clear water and a shape the size of a building is
// just… moving down there. (Opaque, so it shows through the transparent surface.)
let _leviathan = null;
const LEVI_Y = -19;                                  // deep, but shallow enough to glimpse past the deck edge (sharks ~-7..-10)
{
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x0a161e, roughness: 1, metalness: 0, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), mat); body.scale.set(4.5, 5.5, 22); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat); head.scale.set(4.0, 4.6, 7); head.position.z = 22; g.add(head);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat); tail.scale.set(1.6, 4.6, 9); tail.position.z = -24; g.add(tail);
  const fluke = new THREE.Mesh(new THREE.BoxGeometry(20, 0.9, 5), mat); fluke.position.z = -30; g.add(fluke);
  for (const sx of [-1, 1]) {                         // vast slow pectoral fins
    const fin = new THREE.Mesh(new THREE.BoxGeometry(15, 0.7, 5), mat);
    fin.position.set(sx * 5.5, -1, 6); fin.rotation.z = sx * 0.3; fin.rotation.y = sx * 0.45; g.add(fin);
  }
  g.position.set(SHARK_CENTER.x, LEVI_Y, SHARK_CENTER.z);
  g.scale.setScalar(1.4);                            // ~60m — a true leviathan, readable from above
  scene.add(g); _leviathan = g;
}
function leviathanUpdate(t) {
  if (!_leviathan) return;
  const L = _leviathan;
  const ph = t * 0.04;                                // ~150s round trip — glacial
  const vx = Math.cos(ph) * 40, vz = -Math.sin(ph * 0.6) * 22 * 0.6;   // velocity (for heading)
  L.position.x = SHARK_CENTER.x + Math.sin(ph) * 40;
  L.position.z = SHARK_CENTER.z + Math.cos(ph * 0.6) * 22;
  L.position.y = LEVI_Y + Math.sin(t * 0.07) * 2.5;  // a slow swell up and down
  L.rotation.y = Math.atan2(vx, vz);
  L.rotation.z = Math.sin(t * 0.09) * 0.05;          // a slow roll
}
window._leviathan = () => _leviathan;   // debug/test hook

// gator lunge tuning — it bursts out and surges this far/fast over this long.
const GATOR_LUNGE_R = 9, GATOR_LUNGE_DUR = 0.7, GATOR_LUNGE_SPD = 11;
// ════ THE GATORS ════ submerged ambush predators. Procedural, dark, low-poly.
// They pin to the waterline (mostly under) and SNAP at the player or a Horse
// that strays within snapR. A bite is rare (snapKill) but takes a big chunk.
const _gatorMat = new THREE.MeshStandardMaterial({ color: 0x16241a, roughness: 0.85, flatShading: true });
const _gatorEyeMat = new THREE.MeshStandardMaterial({ color: 0x97c233, emissive: 0x6f9a1f, emissiveIntensity: 1.2, roughness: 0.4 });
function buildGatorMesh() {
  const g = new THREE.Group();
  // long, low body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 2.2), _gatorMat);
  body.position.set(0, 0, 0); body.castShadow = true; g.add(body);
  // tapering tail (two segments behind)
  const tail1 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 1.1), _gatorMat);
  tail1.position.set(0, -0.02, -1.55); g.add(tail1);
  const tail2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 1.0), _gatorMat);
  tail2.position.set(0, -0.04, -2.5); g.add(tail2);
  // snout reaching forward; the lower jaw is a pivot so it can gape
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.0), _gatorMat);
  snout.position.set(0, 0.04, 1.55); snout.castShadow = true; g.add(snout);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.08, 1.1); g.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.9), _gatorMat);
  jawMesh.position.set(0, -0.05, 0.45); jaw.add(jawMesh);
  // two glowing eyes set high on the skull — what you see above the water
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), _gatorEyeMat);
    eye.position.set(sx * 0.22, 0.2, 1.0); g.add(eye);
  }
  // back scutes — a row of ridges down the spine
  for (let i = 0; i < 5; i++) {
    const scute = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 4), _gatorMat);
    scute.position.set(0, 0.28, 0.8 - i * 0.5); g.add(scute);
  }
  g.userData.gator = { jaw };
  return g;
}
// pinned to the waterline; faces the nearest of player OR any Horse in range,
// and SNAPs (gapes the jaw + audio) when something crosses snapR. Never roams,
// so it never calls stepAnimal (which would reject it out of the water).
function gatorUpdate(a, dt, dx, dz, dist) {
  a.attackCd -= dt;
  const p = a.obj.position;
  // SAFETY NET — a gator must NEVER sit out in deep water. If one ever ends up
  // there (placement edge cases), yank it to a shore waterspot on its first
  // frame. Belt-and-suspenders so the lake-centre bug can never be seen.
  if (!a._shoreFixed) {
    a._shoreFixed = true;
    if (WATER_Y - heightAt(p.x, p.z) > 2.5 && WATERSPOTS.length) {
      const spot = WATERSPOTS[Math.floor(Math.random() * WATERSPOTS.length)];
      const tox = 70 - spot.x, toz = -90 - spot.z, tl = Math.hypot(tox, toz) || 1;
      p.x = spot.x + (tox / tl) * 2.0; p.z = spot.z + (toz / tl) * 2.0;
    }
    a._homeX = p.x; a._homeZ = p.z;                 // the lurk spot it returns to
  }
  const gt0 = a.obj.userData.gator;
  // ── MID-LUNGE ── it has EXPLODED out of the water and is surging at the target,
  // jaws wide, body arcing up out of the lake. Bites hard if it reaches.
  if (a._lungeT > 0) {
    a._lungeT -= dt;
    const prog = 1 - a._lungeT / GATOR_LUNGE_DUR;   // 0..1
    const arc = Math.sin(prog * Math.PI);           // rise then fall
    p.y = (WATER_Y - 0.34) + arc * 2.2;             // launches ~2m clear of the surface
    p.x += Math.sin(a.dir) * GATOR_LUNGE_SPD * dt;  // surges along its locked heading
    p.z += Math.cos(a.dir) * GATOR_LUNGE_SPD * dt;
    a._gape = 1.0;
    if (gt0) { gt0.jaw.rotation.x = 0.9; a.obj.rotation.y = a.dir; a.obj.rotation.x = -arc * 0.5; }
    const reach = Math.hypot(player.x - p.x, player.z - p.z);
    if (!a._lungeHit && reach < 3.0 && meleeReach()) {
      a._lungeHit = true; hurtPlayer(a.cfg.dmg); camShakeT = SHAKE_DUR * 3;
    }
    // a horse caught in the lunge path is dragged under
    if (!a._lungeHit && a._lungeTgt && !a._lungeTgt.dead
        && Math.hypot(a._lungeTgt.obj.position.x - p.x, a._lungeTgt.obj.position.z - p.z) < 3.2) {
      a._lungeHit = true; killAnimal(a._lungeTgt);
    }
    if (a._lungeT <= 0) {                            // splashes back under, returns to its lurk
      p.x = a._homeX ?? p.x; p.z = a._homeZ ?? p.z; a.obj.rotation.x = 0;
      a.attackCd = 3.5 + Math.random() * 3.5;
      if (audio.sharkSfx) audio.sharkSfx('shark_splash', p.x, p.z, { gain: 0.9 });
    }
    return;
  }
  // pin the body to the waterline — mostly submerged, only eyes/snout above
  p.y = WATER_Y - 0.34;
  if (a.obj.rotation.x) a.obj.rotation.x = 0;
  // nearest target: the player, OR any Horse within range (scan throttled)
  let tx = player.x, tz = player.z, td = dist, tgt = null;
  a._scanT = (a._scanT ?? 0) - dt;
  if (a._scanT <= 0) {
    a._scanT = 0.4; a._horse = null; let hd = a.cfg.snapR * a.cfg.snapR;
    for (const o of animals) {                      // bounded: 3 gators × 0.4s
      if (o === a || o.dead || o.name !== 'Horse') continue;
      const hx = o.obj.position.x - p.x, hz = o.obj.position.z - p.z;
      const d2 = hx * hx + hz * hz;
      if (d2 < hd) { hd = d2; a._horse = o; }
    }
  }
  const h = a._horse;
  if (h && !h.dead) {
    const hx = h.obj.position.x - p.x, hz = h.obj.position.z - p.z;
    const hdist = Math.hypot(hx, hz);
    if (hdist < td) { tx = h.obj.position.x; tz = h.obj.position.z; td = hdist; tgt = h; }
  }
  // face the target
  a.dir = Math.atan2(tx - p.x, tz - p.z);
  a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 3));
  // gape the jaw briefly after a snap, then ease it shut again
  const gt = a.obj.userData.gator;
  if (gt) {
    a._gape = Math.max(0, (a._gape || 0) - dt * 3);
    gt.jaw.rotation.x = a._gape * 0.7;
  }
  // ── LUNGE ── once you (or a horse) come within striking range and it's ready,
  // it doesn't just snap — it EXPLODES out of the water and lunges. The lunge
  // itself does the damage (see the mid-lunge block above), so it's a real,
  // committed attack you have to dodge, not a coin-flip.
  if (td < GATOR_LUNGE_R && a.attackCd <= 0) {
    a._lungeT = GATOR_LUNGE_DUR; a._lungeHit = false; a._lungeTgt = tgt;
    a.dir = Math.atan2(tx - p.x, tz - p.z);          // lock heading onto the target
    a.obj.rotation.y = a.dir; a._gape = 1.0;
    if (audio.gatorAttack) audio.gatorAttack(p.x, p.z);
    else if (audio.snapAt) audio.snapAt(p.x, p.z, player, 1.0);
  }
}

function spawn(name, near) {
  const cfg = SPECIES[name], prefab = prefabs[name];
  // ── per-individual LOOK ── a herd should read as individuals, not clones.
  const shade = 0.82 + Math.random() * 0.36;            // 0.82–1.18 brightness
  let obj;
  if (cfg.spiderish) {
    obj = buildSpiderMesh();
  } else if (cfg.gatorish) {
    obj = buildGatorMesh();
  } else if (cfg.bearish) {
    // a purpose-built procedural bear (dark, humped, scary), not a tinted bull
    const bc = new THREE.Color(cfg.tint || 0x2a1d12).multiplyScalar(shade);
    obj = buildBearMesh(bc);
  } else {
    obj = SkeletonUtils.clone(prefab.scene);
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
  if (cfg.gatorish) {
    // THE AMBUSH: each gator stakes out a hidden waterspot (a subset of the 10),
    // sitting a few metres offshore in real water — exactly where horses come to
    // drink. The land placement below rejects water, so we site it here and skip.
    // gatorUpdate pins p.y every frame, so y only needs to be sane.
    // gators WAIT AT THE BANK. The WATERSPOTS are pre-validated shore points
    // (the horse drinking spots); sit AT one, nudged a couple metres toward the
    // water so the gator lurks in the shallows right where horses come to drink.
    // gatorUpdate pins y to the waterline regardless.
    y = WATER_Y - 0.28;
    if (WATERSPOTS.length) {
      const spot = WATERSPOTS[Math.floor(Math.random() * WATERSPOTS.length)];
      const tox = 70 - spot.x, toz = -90 - spot.z, tl = Math.hypot(tox, toz) || 1;
      let bestR = 1.5;
      for (let r = 1.0; r <= 5; r += 0.5) {       // find a shallow step off the bank
        if (WATER_Y - heightAt(spot.x + (tox / tl) * r, spot.z + (toz / tl) * r) > 0.3) { bestR = r; break; }
      }
      x = spot.x + (tox / tl) * bestR; z = spot.z + (toz / tl) * bestR;
    } else { x = 64; z = -50; }                    // last-ditch: a fixed near-shore point, never the centre
  } else do {
    if (near && tries < 40) {           // herd member — settle near the anchor
      x = near.x + (Math.random() - 0.5) * 18;
      z = near.z + (Math.random() - 0.5) * 18;
    } else {
      x = (Math.random() - 0.5) * WORLD * 0.85;
      z = (Math.random() - 0.5) * WORLD * 0.85;
    }
    y = heightAt(x, z);
    // spiders are NOT a welcome party — keep them far from every landing bed
    // danger GRADIENT: predators (wolf/bear/spider) never spawn near a bed, so
    // where you wake is calm — small critters first, the teeth are farther out.
    var pred = cfg.hunts || cfg.bearish || cfg.spiderish || cfg.territorial;
    var nearBed = pred && FLOWERBEDS.some(b => Math.hypot(x - b.x, z - b.z) < 95);
  } while ((y < WATER_Y + 1 || Math.hypot(x, z) < 45 || nearBed) && tries++ < 60);
  obj.position.set(x, y, z);
  // ── per-individual SIZE ── base scale ±10%, bears 1.8× on top
  const sizeJit = 0.9 + Math.random() * 0.2;            // ±10%
  obj.scale.setScalar((cfg.scale || 1) * sizeJit);
  scene.add(obj);
  const mixer = new THREE.AnimationMixer(obj);
  const acts = {};
  if (!cfg.bearish && !cfg.spiderish && !cfg.gatorish) {     // procedural creatures are animated in code, not by clips
    for (const frag of ['Idle', 'Idle_2', 'Eating', 'Walk', 'Gallop', 'Death',
                        'HitReact_Left', 'Attack', 'Attack_Kick']) {
      const clip = clipOf(prefab, frag);
      if (clip) acts[frag] = mixer.clipAction(clip);
    }
  }
  // ── per-individual PERSONALITY (rolled ONCE, stored on the record) ──
  const aggression = Math.max(0, Math.min(1,
    cfg.aggroBias + (Math.random() - 0.5) * 0.5));      // ±0.25 around the bias
  // wide hp band for the tanky ones: horse 8-10, bear 6-8
  let hp = cfg.hp;
  // hpJit just adds a small ±15% per-individual band — it must NOT discard the
  // species base, or a horse ends up as soft as a deer (the one-shot-horse bug).
  if (cfg.hpJit) hp = Math.max(1, cfg.hp * (0.85 + Math.random() * 0.30));
  const hearJit = 0.85 + Math.random() * 0.30;          // 0.85–1.15
  // ── nerves ── how jumpy THIS individual is. Wide spread: some graze
  // calm with you near, others bolt at a shadow. Folds into spook ranges.
  const paranoia = Math.max(0, Math.min(1, 0.5 + (Math.random() - 0.5) * 1.3));
  // glance cadence — how fast/jerky THIS one cranes its head to look. Wide so a
  // herd's heads don't all swing in lockstep (the turret-snap that read as cheesy).
  const glanceTs = 1.6 + Math.random() * 2.4;           // 1.6–4.0 rad/s of crane
  // per-gait playback tempo: cow plods, horse is quick, bear is heavy — ±5%
  const gaitTs = (cfg.gait === 'sway' ? 0.85 : cfg.gait === 'smooth' ? 1.15
                 : cfg.gait === 'bound' ? 0.9 : 1) * (0.95 + Math.random() * 0.1);
  const a = {
    name, cfg, obj, mixer, acts, cur: null,
    state: 'idle', t: Math.random() * 4, dir: Math.random() * Math.PI * 2,
    hp, dead: false, attackCd: 0,
    aggression, hearJit, gaitTs, paranoia, glanceTs,
    gaitPhase: Math.random() * Math.PI * 2,             // desyncs sway/bob across a herd
    gaitRoll: 0,                                         // current rotation.z, decays to 0
    sizeJit,
  };
  // ── the web ambush ── most spiders lie in wait hanging from a canopy thread
  // over a nearby tree, ready to drop when you wander beneath (see spiderUpdate).
  if (cfg.spiderish && Math.random() < 0.6) {
    let best = null, bd = 22 * 22;
    for (const tr of TREES) {
      if (!tr.inst || tr.top === undefined) continue;     // canopy trees only
      const ddx = tr.x - x, ddz = tr.z - z, d = ddx * ddx + ddz * ddz;
      if (d < bd) { bd = d; best = tr; }
    }
    if (best) {
      a._webState = 'hang'; a._hangX = best.x; a._hangZ = best.z;
      a._hangAnchorY = best.top - 0.4;                     // tucked just under the leaves
      a._hangLen = 1.4 + Math.random() * 1.2;             // how far it dangles below
      a._thread = _spiderThread();
      a.obj.position.set(best.x, a._hangAnchorY - a._hangLen, best.z);
    }
  }
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
  // nerves: a calm one lets you in ~35% closer, a jumpy one bolts ~35% sooner
  r *= 0.65 + (a.paranoia ?? 0.5) * 0.70;
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
          takeHead(a);                            // take the head first — drops a severed-head proxy
          gutCarcass(a);                          // then open it up, blood all around
          lastHarvest = a.name; renderNotes();    // surface the species icon on the HUD
          if (a._stuck) { player.arrows = Math.min(ARROW_MAX, player.arrows + a._stuck);
            a._stuck = 0; renderNotes();          // your arrows come back with the meat —
            for (let k = a.obj.children.length - 1; k >= 0; k--) {   // and leave the body with you
              const c = a.obj.children[k];
              if (c.userData && c.userData.stuckArrow) a.obj.remove(c);
            }
          }
        }
        if (!saidBlooded) {
          saidBlooded = true;
          setTimeout(() => toast('Blood on you now.', 3000), 4800);
        }
        if (player.hp < 95) {
          player.hp = Math.min(100, player.hp + 40); renderHP();
          say('harvest');
        } else if (player.meat < 3) {
          player.meat++; renderNotes();
          if (player.meat >= 3) say('packFull'); else say('harvest');
          if (player.meat === 3 && !saidFullPack) {
            saidFullPack = true;
            setTimeout(() => toast('They can smell it.', 3000), 3400);
          }
        } else toast('Can carry no more.');
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

  // ── on fire ── a fire arrow set it alight; it burns down (~0.45 hp/s) with a
  // visible flame until it dies or the burn runs out. (Spiders just vanish to fire.)
  if (a.burnT > 0 && !a.cfg.spiderish) {
    a.burnT -= dt;
    a.hp -= dt * 0.45;
    updateAnimalFlame(a);
    if ((a._burnFx = (a._burnFx || 0) - dt) <= 0) { a._burnFx = 0.15; if (audio._fireCrackle) audio._fireCrackle(0.5); }
    if (a.hp <= 0) { clearAnimalFlame(a); killAnimal(a, true); return; }
    if (a.burnT <= 0) clearAnimalFlame(a);
  }

  // kill-feel: a charging bull thundering past inside ~3m rattles the
  // camera. dist>=2.8 = it brushed by; attackCd>0 = inside but jaws shut.
  if (a.cfg.territorial && a.aggro && a.state !== 'warn') {
    a._missCd = (a._missCd || 0) - dt;
    if (a._missCd <= 0 && dist < 3.2 && (dist >= 2.8 || a.attackCd > 0)) {
      a._missCd = 1.5; camShakeT = SHAKE_DUR;
    }
  }

  if (a.cfg.spiderish) {                        // ── the swarm: follow + leap
    spiderUpdate(a, dt, dx, dz, dist);
    return;
  }
  if (a.cfg.gatorish) {                         // ── the ambush: lurk + snap
    gatorUpdate(a, dt, dx, dz, dist);
    return;
  }
  if (a.cfg.bearish) {                         // ── the bear has its own brain
    bearUpdate(a, dt, dx, dz, dist);
    a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 6));
    bearAnim(a, dt, a._moved);                  // procedural legs/head/rear
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
    // ── predation ── a pack runs prey down. Only when YOU aren't close: the
    // chase sweeps PAST the player, never targets them. Point-blank, the
    // normal player-aggro below takes over instead.
    if (a.cfg.preysOn && !a.aggro && !a.scavTarget && !(a.scavT > 0)
        && dist > (a.cfg.aggroR || 32) * 0.8 && huntUpdate(a, dt, dist)) {
      a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 6));
      applyGait(a, a._moved, dt); a._moved = false;
      return;                              // the live hunt has it; skip player-aggro
    }
    if (a.aggro && dist > trigger * 2.2) {    // lost you
      a.aggro = false; a.warned = false; a.circleT = 0; a.packBias = 0;
      if (a.state === 'warn' || a.state === 'stare') { a.state = 'idle'; a.t = 1; }
    }
    if (scavUpdate(a, dt, dist)) {
      // the carcass has its attention — you are not interesting yet
    } else if (dist < 2.8) {
      a.state = 'attack'; a.aggro = true;
      if (a.attackCd <= 0 && meleeReach()) {       // can't bite you up a tree
        setAnim(a, 'Attack', true); a.attackCd = 1.5;
        if (a.cfg.hunts && !a.isCryptid && audio.animalCall)   // a snarl on the bite
          audio.animalCall('snarl', a.obj.position.x, a.obj.position.z, 0.95);
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
        // ── stalk from cover ── a wolf reads the ground (day or night): bold and
        // quick while a tree/bush hides it, but it SLINKS low and slow when it's
        // out in the open and you're looking straight at it. dx/dz point wolf→you.
        const stalker = a.cfg.hunts && !a.isCryptid;
        const hidden = stalker && dist < 60 && losBlocked(a);
        const seen = stalker && !hidden && dist < 34
          && (Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz) / (dist || 1) > 0.5;
        // audible menace — a low snarl on a loose cadence while it works you,
        // louder as it closes. Held silent when frozen in the open under your
        // gaze (so a covered approach stays a surprise, an exposed one growls).
        if (stalker && !(seen && dist > 7)) {
          a._snarlCd = (a._snarlCd ?? (1.2 + Math.random() * 2)) - dt;
          if (a._snarlCd <= 0) {
            a._snarlCd = 2.2 + Math.random() * 2.8;
            if (audio.animalCall) audio.animalCall('snarl',
              a.obj.position.x, a.obj.position.z, dist < 12 ? 0.7 : 0.5);
          }
        }
        if (a.circleT > 0 && dist > 8 && dist < trigger * 1.5) {
          // the circling pass — flank-walk, spiraling slowly inward
          a.circleT -= dt;
          // sometimes it DOESN'T commit — by day a lone wolf often thinks better
          // of it and keeps circling/watching a while longer before closing in.
          if (a.circleT <= 0 && night < 0.4 && Math.random() < 0.4) {
            a.circleT = 2.5 + Math.random() * 3; a.circleDir *= Math.random() < 0.4 ? -1 : 1;
          }
          a.dir = Math.atan2(dx, dz) + a.circleDir * 1.25;
          setAnim(a, 'Walk');
          let cs = a.cfg.speed * 1.3 * haste;
          if (seen) cs *= 0.35;            // caught in the open, watched → slink slow
          else if (hidden) cs *= 1.3;      // covered → press the advantage
          stepAnimal(a, cs, dt);
        } else {
          // committed. Wolves prefer the side you AREN'T looking at —
          // if you can see it coming, it angles for your back instead.
          let ax = dx, az = dz;
          if (stalker && dist > 7 && dist < 36
              && Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz > 0) {
            ax += Math.sin(player.yaw) * 6; az += Math.cos(player.yaw) * 6;
          }
          // pack members hold offset bearings — they arrive from different angles
          a.dir = Math.atan2(ax, az) + drift
            + (a.packBias && dist > 11 ? a.packBias : 0);
          const fast = dist < (a.isCryptid ? 30 : 17);
          let sp = (fast ? a.cfg.gallop : a.cfg.speed) * haste;
          if (seen && !fast) sp *= 0.5;    // creep when watched, until the final rush
          setAnim(a, fast ? 'Gallop' : 'Walk');
          stepAnimal(a, sp, dt);
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
        if (dist < 3.0 && meleeReach()) { hurtPlayer(8 + a.aggression * 8); camShakeT = SHAKE_DUR; }
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
        if (a._jukeT <= 0) { a._jukeT = 0.4 + Math.random() * 0.35;   // less frequent
          a._juke = (Math.random() - 0.5) * 1.0; }                    // gentler cut (was jittery/twitchy)
        a.dir = lerpAngle(a.dir, Math.atan2(-dx, -dz) + a._juke, Math.min(1, dt * 6));  // ease the turn, not snap
      }
      // ── the persistence hunt ── flat-out at first, but stay on its tail and
      // it TIRES: stamina drains and it slows; panic bursts come and go; let it
      // gain distance and it catches its breath. Run it down the old way.
      a.stam = a.stam ?? 1;
      const onTail = dist < a.cfg.flee * 1.7;
      a.stam = Math.max(0, Math.min(1, a.stam + (onTail ? -0.11 : 0.16) * dt));
      a._burstCd = (a._burstCd ?? 2) - dt; a._burstT = (a._burstT ?? 0) - dt;
      if (a._burstCd <= 0 && onTail && a.stam > 0.3) { a._burstT = 0.6; a._burstCd = 2.5 + Math.random() * 2.5; }
      const fatigue = 0.45 + 0.55 * a.stam;            // 1.0 fresh → 0.45 spent
      const burst = a._burstT > 0 ? 1.35 : 1;          // a flare of panic energy
      stepAnimal(a, a.cfg.gallop * fatigue * burst, dt);
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
      // it caught something — head up, weighing it. The OUTER ring of the
      // dartboard: cross it and it looks; hold still and it keeps watching;
      // back off or break its sightline and it grazes again; push closer and
      // it bolts. The stare↔freeze give-and-take is the heart of the stealth.
      a.t -= dt;
      setAnim(a, 'Idle');
      // CRANE toward you — don't turret-snap the whole body. Blend only PART of
      // the way from its grazing heading to your bearing (jumpy ones turn more),
      // at this individual's own glance tempo. Reads as a head/neck turn, and a
      // herd's heads no longer swing in robotic lockstep.
      const look = Math.atan2(dx, dz);
      const crane = 0.4 + (a.paranoia ?? 0.5) * 0.45;
      const aimDir = lerpAngle(a._grazeDir ?? a.dir, look, crane);
      a.dir = lerpAngle(a.dir, aimDir, Math.min(1, dt * (a.glanceTs || 2)));
      const hidden = dist < 60 && losBlocked(a);
      // FREEZE = safety. Move under its gaze and the bolt range WIDENS (it
      // spooks sooner); hold dead still and it SHRINKS (you can hold close).
      // Break its sightline and it loses the thread and grazes again.
      const playerMoving = noiseLevel >= 1 || _moveLvl > 0.12;
      const boltR = spookRadius(a, dist) * (playerMoving ? 1.25 : 0.8);
      if (hidden) a.t -= dt * 2.5;                       // can't see you → stands down fast
      if (!hidden && (dist < boltR
          || (noiseLevel >= 2 && dist < boltR * 1.2))) {
        a.state = 'flee'; a.t = 3 + Math.random() * 2.5;
        a.dir = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.7;
        spookHerd(a);
      } else if (a.t <= 0) {
        // stands down: un-cranes back to its grazing heading (so the next glance
        // starts fresh and the crane can never ratchet into a full body-snap).
        a.dir = a._grazeDir ?? a.dir;
        // nerves decide HOW it stands down: a calm one (paranoia<0.45) drops its
        // head and keeps feeding; a jumpy one stays up and glancy a beat.
        if ((a.paranoia ?? 0.5) < 0.45) { a.state = 'eat'; a.t = 3 + Math.random() * 4; }
        else { a.state = 'idle'; a.t = 0.8 + Math.random() * 1.2; }
      }
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
    } else if (dist < spookRadius(a, dist) + 9 + (a.paranoia ?? 0.5) * 8) {
      // the notable outer ring — a clear ~10-step band where it lifts its
      // head and stares before the inner ring makes it run. A jumpy one
      // catches you sooner (wider band); a calm one lets you drift closer.
      a.state = 'alert'; a.t = 1.8 + Math.random() * 2.0;   // it stares a good beat
      a._grazeDir = a.dir;                                   // remember its body heading to crane FROM
    } else wander(a, dt);
  }
  // turn the BODY toward the heading — slow + majestic for big animals (a horse
  // shouldn't snap left-right-left), quick only for the little darty critters or
  // when actively fleeing/fighting.
  const turnRate = a.cfg.darty ? 6 : (a.state === 'flee' || a.state === 'rear' || a.state === 'attack') ? 3.5 : 1.7;
  a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * turnRate));
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
  // ── the feeding tableau ── while you keep your distance it stays hunched
  // over the deer it killed, munching. Close in and it abandons the kill to
  // defend it — drops back into the normal (angry) bear brain below.
  // a shot or a close approach overrides the tableau — same guards the wary/
  // stalk/rear blocks use, so a provoked bear is never snapped back to munching.
  if (a._tableau && (a.aggro || a.confused
      || a.state === 'rear' || a.state === 'charge')) {
    a._tableau = null;
  }
  if (a._tableau) {
    if (dist > 16) {
      a.state = 'eat';
      const cp = a._tableau.obj.position;
      a.dir = Math.atan2(cp.x - a.obj.position.x, cp.z - a.obj.position.z);  // faces the carcass
      return;
    }
    a._tableau = null;                                  // you got close — now it's a problem
  }
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
      && (Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz) / (dist || 1) > 0.55;
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
      // brush rustle as it shifts its weight nearby — you hear it close
      if (audio.bearRustle) audio.bearRustle(a.obj.position.x, a.obj.position.z, 0.55);
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
        toast('It lumbers off.', 2600);
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
    const justStarted = a.state !== 'charge';
    a.state = 'charge';
    if (justStarted && audio.bearCharge) audio.bearCharge(a.obj.position.x, a.obj.position.z, 1);
    if (dist > loseR) {                                  // it loses interest
      a.aggro = false; a.state = 'idle'; a.t = 1; a.cur = null; return;
    }
    if (dist < 2.9) {                                    // contact — it claws
      if (a.attackCd <= 0 && meleeReach()) {            // not if you're up a tree
        setAnim(a, a.acts.Attack ? 'Attack' : 'Attack_Kick', true);
        a.attackCd = 1.6;
        hurtPlayer(a.cfg.dmg || 38); camShakeT = SHAKE_DUR * 2.5;
        // the hit: a LOUD scream right on top of you + blood on the lens
        if (audio.bearScream) audio.bearScream(a.obj.position.x, a.obj.position.z, 1.6);
        bearHitFX();
        setTimeout(() => { if (!a.dead) a.cur = null; }, 700);
      }
    } else {
      a.dir = Math.atan2(dx, dz);
      setAnim(a, 'Gallop');                              // bounding gait carries it
      stepAnimal(a, a.cfg.gallop, dt);
      // it keeps roaring as it closes — a different, rhythmic charge huff
      a._chargeCd = (a._chargeCd ?? 0) - dt;
      if (a._chargeCd <= 0) {
        a._chargeCd = 0.9 + Math.random() * 0.5;
        if (audio.bearCharge) audio.bearCharge(a.obj.position.x, a.obj.position.z, 0.85);
      }
    }
    return;
  }

  wander(a, dt);                                         // calm — just a bear in the woods
}
function enterBearRear(a, dx, dz) {
  a.state = 'rear'; a.rearT = 0.9;
  a.dir = Math.atan2(dx, dz);
  setAnim(a, a.acts.Idle_2 ? 'Idle_2' : 'HitReact_Left', true);
  camShakeT = SHAKE_DUR * 2;
  // it rears and SCREAMS — loud, haunting, spatial
  if (audio.bearScream) audio.bearScream(a.obj.position.x, a.obj.position.z, 1.25);
  else if (audio.breathAt) audio.breathAt(a.obj.position.x, a.obj.position.z, 0.7);
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

// ── the hunt ── a wolf with cfg.preysOn (and no interest in you yet) runs
// down LIVE prey. Throttled (~1.2s) it acquires the nearest prey of a preyed
// species in a wide radius, then gallops it down on a.dir+stepAnimal; the prey
// flees (and spooks its herd, so 3-4 deer scatter the same general way). A
// shared CHASE STAMINA (a.chaseStam) drains while running — spent, the wolf
// PANTS, slows, and PEELS OFF on a bearing away from both prey AND player,
// ending the hunt. Returns true while it owns the frame. Cheap: one bounded
// scan only on the throttle tick, no per-frame allocation.
function huntUpdate(a, dt, distToPlayer) {
  a.chaseStam = a.chaseStam ?? 1;
  a._huntScan = (a._huntScan ?? 0) - dt;
  // (re)acquire the nearest live prey on the throttle tick or if ours is gone
  let prey = a.huntTarget;
  if (prey && (prey.dead || animals.indexOf(prey) < 0)) prey = a.huntTarget = null;
  if (!prey && a._huntScan <= 0) {
    a._huntScan = 1.2;
    const HR = (a.cfg.aggroR || 32) * 2.2, HR2 = HR * HR;   // a wide hunting radius
    const p = a.obj.position;
    let best = null, bd = HR2;
    for (const o of animals) {
      if (o.dead || !a.cfg.preysOn.includes(o.name)) continue;
      const ddx = o.obj.position.x - p.x, ddz = o.obj.position.z - p.z;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < bd) { bd = d2; best = o; }
    }
    if (best) {
      a.huntTarget = prey = best;
      best.state = 'flee'; best.t = 4 + Math.random() * 2.5;   // it bolts
      best.dir = Math.atan2(best.obj.position.x - p.x, best.obj.position.z - p.z)
        + (Math.random() - 0.5) * 0.7;
      spookHerd(best);                          // the herd scatters with it
      if (Math.random() < 0.5) packHunt(a, best);   // sometimes rally the pack
    } else { a._huntScan = 1.2; return false; }     // nothing worth chasing
  }
  if (!prey) return false;
  const p = a.obj.position, tp = prey.obj.position;
  const pdx = tp.x - p.x, pdz = tp.z - p.z;
  const pd = Math.hypot(pdx, pdz);
  // chase costs wind; coasting (no prey near) would recover it, but a live
  // chase keeps it draining until the wolf gases out
  a.chaseStam = Math.max(0, a.chaseStam - 0.085 * dt);
  if (a.chaseStam <= 0.12) {                   // spent — pant, slow, PEEL OFF
    if (audio.animalCall) audio.animalCall('pant', p.x, p.z, 0.6);
    // a bearing away from BOTH the prey and the player — never toward you
    const awayPrey = Math.atan2(-pdx, -pdz);
    const awayYou = Math.atan2(p.x - player.x, p.z - player.z);
    a.dir = lerpAngle(awayPrey, awayYou, 0.5);
    setAnim(a, 'Walk'); stepAnimal(a, a.cfg.speed, dt);
    a.huntTarget = null; a._huntScan = 4 + Math.random() * 3;   // rest before hunting again
    a.chaseStam = 0.6;                          // catches some breath as it breaks off
    return true;
  }
  // CATCH — within both radii: the kill
  if (pd < a.cfg.r + prey.cfg.r + 0.6) {
    if (Math.random() < 0.25 && audio.animalCall) audio.animalCall('snarl', p.x, p.z, 0.6);
    killAnimal(prey, true);                     // ran it down — a suffered death
    a.huntTarget = null; a._huntScan = 3 + Math.random() * 3;
    a.chaseStam = Math.min(1, a.chaseStam + 0.3);   // a feed steadies it
    return true;
  }
  // steer + gallop after it
  a.dir = lerpAngle(a.dir, Math.atan2(pdx, pdz), Math.min(1, dt * 4));
  setAnim(a, 'Gallop');
  stepAnimal(a, a.cfg.gallop, dt);
  return true;
}

// rally 1-2 nearby wolves onto the same prey, each its own approach bearing,
// and answer with a howl. Cheap bounded scan; scalars only.
function packHunt(w, prey) {
  const pr = (w.cfg.packR || 80), pr2 = pr * pr;
  const p = w.obj.position;
  let joined = 0, side = 1;
  for (const o of animals) {
    if (joined >= 2) break;
    if (o === w || o.name !== 'Wolf' || o.dead || o.aggro
        || o.huntTarget || o.scavTarget || o.scavT > 0) continue;
    const ddx = o.obj.position.x - p.x, ddz = o.obj.position.z - p.z;
    if (ddx * ddx + ddz * ddz > pr2) continue;
    o.huntTarget = prey; o.chaseStam = o.chaseStam ?? 1;
    o._huntScan = 1.2;
    o.dir = Math.atan2(prey.obj.position.x - o.obj.position.x,
                       prey.obj.position.z - o.obj.position.z) + side * 0.6;
    side = -side; joined++;
  }
  if (audio.animalCall) audio.animalCall('howl', p.x, p.z, 0.7);
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
  const prey = !(a.cfg.hunts || a.cfg.territorial || a.cfg.bearish);
  // ── PURPOSE ── a calm non-predator walks toward a goal (drink/sniff/forage)
  // instead of drifting at random. Picks one if it has none; on arrival it
  // settles into a head-down 'eat' beat, then clears the goal.
  if (prey) {
    if (a.state !== 'eat' && !a.goal) chooseGoal(a);
    if (a.goal) {
      const p = a.obj.position;
      const gdx = a.goal.x - p.x, gdz = a.goal.z - p.z;
      const gd = Math.hypot(gdx, gdz);
      const arrive = a.goal.kind === 'drink' ? 3.0 : 2.2;
      if (gd > arrive) {                          // still travelling — steer + walk
        a.dir = lerpAngle(a.dir, Math.atan2(gdx, gdz), Math.min(1, dt * 3));
        setAnim(a, 'Walk'); stepAnimal(a, a.cfg.speed, dt);
        // give up on a goal we can't reach (deflected at water/wall) after a while
        a._goalT = (a._goalT ?? 14) - dt;
        if (a._goalT <= 0) { if (a.goal.ref) a.goal.ref._claimed = false; a.goal = null; a._goalT = 14; }
        return;
      }
      // arrived — head down. Drinking lingers; foraging may eat the berry.
      a.state = 'eat'; setAnim(a, 'Eating');
      a.t = a.goal.kind === 'drink' ? 5 + Math.random() * 4 : 3 + Math.random() * 3;
      if (a.goal.kind === 'drink') a._lastWater = a.goal.ref;
      if (a.goal.kind === 'forage' && a.goal.ref && Math.random() < 0.6) {
        a.goal.ref.taken = true; a.goal.ref.mesh.visible = false;   // consumed
      } else if (a.goal.ref) { a.goal.ref._claimed = false; }       // leave it for others
      a._goalT = 14; a.goal = null;
      return;
    }
  }
  a.t -= dt;
  if (a.t <= 0) {
    const roll = Math.random();
    // prey mostly GRAZE — a calm meadow you have to sneak up on. Predators
    // roam more. (eat is long; walking is the rarer, shorter beat.)
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
  // a galloping animal throws dirt — only at a real run, only on the ground
  // (off-trip; tripping animals float), rate-limited per beast for the phone
  if (speed > a.cfg.speed * 1.6 && tripLevel === 0) {
    a._dustT = (a._dustT || 0) - dt;
    if (a._dustT <= 0) {
      a._dustT = 0.11 + Math.random() * 0.09;
      dustPuff(nx, ny, nz, 0xa3906f, 0.5 + (a.cfg.scale || 1) * 0.45);
    }
  }
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
const _goreGeo = new THREE.CircleGeometry(1, 14);
const _goreMat = new THREE.MeshStandardMaterial({ color: 0x3a0805, roughness: 0.45,
  transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
const _gutGeo = new THREE.IcosahedronGeometry(0.18, 0);
const _gutMat = new THREE.MeshStandardMaterial({ color: 0x6e1410, roughness: 0.55,
  emissive: 0x2a0604, emissiveIntensity: 0.35 });
// ── organic gore ── coiled intestines (wet pink tubes) and dark slick
// organs, so a harvest reads as actual viscera, not a pile of red balls.
const _intestineGeo = new THREE.TorusGeometry(0.22, 0.085, 7, 12);
const _intestineMat = new THREE.MeshStandardMaterial({ color: 0x8f4038, roughness: 0.35,
  emissive: 0x3a0f0c, emissiveIntensity: 0.4 });       // wet, slightly glistening
const _organGeo = new THREE.SphereGeometry(0.2, 8, 6);
const _organMat = new THREE.MeshStandardMaterial({ color: 0x4a0e0a, roughness: 0.3,
  emissive: 0x240605, emissiveIntensity: 0.35 });
window._gutCarcass = (a) => gutCarcass(a);   // debug/test hook
function gutCarcass(a) {
  if (a._gutted) return;
  const p = a.obj.position, gy = heightAt(p.x, p.z) + 0.04;
  // gore SCALES with the animal — a fox leaves a smear, a bear a slaughter.
  const sc = (a.obj.scale.x || 1) * 2.2;
  const gore = [];
  // the blood pool — bigger and darker the larger the kill
  const pool = new THREE.Mesh(_goreGeo, _goreMat);
  pool.rotation.x = -Math.PI / 2; pool.rotation.z = Math.random() * Math.PI;
  pool.position.set(p.x, gy, p.z);
  pool.scale.set(sc * (0.9 + Math.random() * 0.5), sc * (0.9 + Math.random() * 0.5), 1);
  scene.add(pool); gore.push(pool);
  const place = (geo, mat, n, lift, smin, smax, flat) => {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      const an = Math.random() * Math.PI * 2, rr = Math.random() * sc * 0.5;
      m.position.set(p.x + Math.cos(an) * rr, gy + lift + Math.random() * 0.05 * sc, p.z + Math.sin(an) * rr);
      const s = (smin + Math.random() * (smax - smin)) * sc * 0.5;
      m.scale.set(s, flat ? s * 0.4 : s, s);
      m.rotation.set(Math.random() * 3, Math.random() * 6.28, Math.random() * 3);
      scene.add(m); gore.push(m);
    }
  };
  // coiled intestines — count scales with size: a smear vs a slaughter
  const coils = Math.round(2 + sc * 1.6);
  place(_intestineGeo, _intestineMat, coils, 0.05, 0.5, 1.1, false);
  // dark slick organs (liver/stomach) — flattened, glistening
  place(_organGeo, _organMat, Math.round(1 + sc * 0.8), 0.05, 0.6, 1.0, true);
  // a few stray chunks of gut
  place(_gutGeo, _gutMat, Math.round(2 + sc), 0.05, 0.5, 0.9, false);
  if (a._gore) a._gore.push(...gore);             // append — never clobber the severed head
  else a._gore = gore;
  a._gutted = true;
  a.obj.scale.y *= 0.78;                          // the body slumps open
  if (audio.impact) audio.impact('flesh', 0.12);
}

// the severed-head proxy: a small dark lump dropped on the ground beside the kill.
const _headGeo = new THREE.IcosahedronGeometry(0.26, 0);
const _headMat = new THREE.MeshStandardMaterial({ color: 0x140807, roughness: 0.6,
  emissive: 0x0a0302, emissiveIntensity: 0.25 });
window._takeHead = (a) => takeHead(a);            // debug/test hook
function takeHead(a) {
  if (a._headTaken) return;
  a._headTaken = true;
  // detach the actual head: GLTF rigs name a 'Head' bone; the procedural bear keeps a headPiv.
  let headObj = null;
  if (a.obj.userData.bear && a.obj.userData.bear.headPiv) headObj = a.obj.userData.bear.headPiv;
  else a.obj.traverse(o => { if (!headObj && (o.isBone || o.isMesh) && /^head$/i.test(o.name)) headObj = o; });
  if (headObj) headObj.visible = false;
  // drop a small dark severed-head proxy on the ground next to the body
  const p = a.obj.position, sc = a.obj.scale.x || 1;
  const off = 0.6 + sc * 0.4, an = Math.random() * Math.PI * 2;
  const hx = p.x + Math.cos(an) * off, hz = p.z + Math.sin(an) * off;
  const head = new THREE.Mesh(_headGeo, _headMat);
  head.scale.setScalar(0.7 + sc * 0.6);
  head.position.set(hx, heightAt(hx, hz) + 0.18 * (0.7 + sc * 0.6), hz);
  head.rotation.set(Math.random() * 3, Math.random() * 6.28, Math.random() * 3);
  head.castShadow = true;
  scene.add(head);
  (a._gore = a._gore || []).push(head);           // tracked so it's cleaned up with the body
  if (audio.impact) audio.impact('flesh', 0.4);
}

// scratch for the slope-aligned death pose (no per-kill allocation)
const _deathN = new THREE.Vector3(), _deathUp = new THREE.Vector3(0, 1, 0),
      _deathAlign = new THREE.Quaternion(), _deathYaw = new THREE.Quaternion(),
      _deathRoll = new THREE.Quaternion(), _deathE = new THREE.Euler();
window._kill = (a) => killAnimal(a);   // debug/test hook
function killAnimal(a, suffered = false) {
  a.dead = true; a.t = 75;   // carcasses linger — long enough for scavengers
  if (a.goal && a.goal.ref) a.goal.ref._claimed = false;   // free its errand for the herd
  a.goal = null;
  if (a._flame) { a.obj.remove(a._flame); a._flame = null; }   // the fire goes out with it
  a.suffered = suffered || !!a.bleeding || a.state === 'wounded';
  setAnim(a, 'Death', true);
  if (a.cfg.bearish) {
    // lie FLUSH on the slope: keep facing (yaw), fold the side-roll, then tip the
    // whole body so its up-axis matches the terrain normal — no half-buried carcass.
    const p = a.obj.position;
    normalAt(p.x, p.z, _deathN);
    _deathYaw.setFromEuler(_deathE.set(0, a.obj.rotation.y, 0));    // preserve heading
    _deathRoll.setFromEuler(_deathE.set(0, 0, 1.35));              // down on its side
    _deathAlign.setFromUnitVectors(_deathUp, _deathN);            // body up → ground normal
    a.obj.quaternion.copy(_deathAlign).multiply(_deathYaw).multiply(_deathRoll);
    a.obj.position.y = heightAt(p.x, p.z) + 0.5;
  }
  score[a.name] = (score[a.name] || 0) + 1;
  spawnCarrion(a);                               // scavengers gather over the kill
  // the violin theme punctuates every kill (procedural stinger as fallback)
  if (!(audio.themeSting && audio.themeSting('sting_kill', 0.95)) && audio.killStinger) audio.killStinger();
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
  setTimeout(() => toast('Something’s off tonight.', 3000), 2500);
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
      toast('Dawn. It withdrew.', 2600);
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
  const logM = new THREE.MeshStandardMaterial({ color: 0x6a4427, roughness: 0.85, flatShading: true });
  const lashM = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.95 });
  const mastM = new THREE.MeshStandardMaterial({ color: 0x4f3320, roughness: 0.9, flatShading: true });
  const sailM = new THREE.MeshStandardMaterial({ color: 0xcfc4ac, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const flagM = new THREE.MeshBasicMaterial({ color: 0xc2402c, side: THREE.DoubleSide });
  // a BIG lashed LOG RAFT — a wide walk-on deck (~8m x 16m): nine thick logs
  // fore-aft, cross-lash spars, a TALL mast set WAY up toward the bow carrying a
  // square sail, and a masthead WIND PENNANT. You stand amidships; the sail is
  // a good ~5.5m ahead so it reads as part of the boat, not a wall on your face.
  // Logs are 'z' (fore-aft), x = beam.
  const L = 30, R = 0.5, N = 11;   // a long vessel — much longer deck
  const logMeshes = [];
  for (let i = 0; i < N; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.93, L, 8), logM);
    log.rotation.x = Math.PI / 2;                       // lay it flat, running fore-aft
    log.position.set((i - (N - 1) / 2) * (R * 2.02), 0, 0);
    g.add(log); logMeshes.push(log);
  }
  g._logs = logMeshes;   // the shark bites these off, one per strike
  const W = N * R * 2.02;
  const sparGeo = new THREE.CylinderGeometry(0.11, 0.11, W + 0.3, 6);
  for (const sz of [-L * 0.4, -L * 0.13, L * 0.16, L * 0.42]) {
    const spar = new THREE.Mesh(sparGeo, lashM);
    spar.rotation.z = Math.PI / 2; spar.position.set(0, R + 0.07, sz);
    g.add(spar);
  }
  // mast set WAY forward (toward the bow) — the sail sits well ahead of the
  // helmsman, a small slice of the view, trimmed out to the lee as you sail.
  const MASTZ = 7.5;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 8.6, 8), mastM);
  mast.position.set(0, R + 4.2, MASTZ);
  g.add(mast);
  // the sail rides a pivot (swings to the lee). A cross-yard + a big bowed sail.
  const sailPivot = new THREE.Group();
  sailPivot.position.set(0, R + 4.2, MASTZ);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6.6, 6), mastM);
  yard.rotation.z = Math.PI / 2; yard.position.set(0, 2.8, 0); sailPivot.add(yard);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 5.4, 8, 2), sailM);
  const sp = sail.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) { const u = sp.getX(i) / 3.1; sp.setZ(i, (1 - u * u) * 0.9); }
  sp.needsUpdate = true; sail.geometry.computeVertexNormals();
  sail.position.set(0, 0.1, 0);                          // centered on the mast, up near the bow
  sailPivot.add(sail);
  g.add(sailPivot);
  // masthead pennant — re-aimed downwind each frame in the loop (g._windFlag)
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.42), flagM);
  flag.position.set(0.6, R + 7.6, MASTZ);
  g.add(flag);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g._sailPivot = sailPivot;     // game swings this to the lee side each frame
  g._sail = sail; g._windFlag = flag;
  g.visible = false;
  return g;
})();
scene.add(canoe);

// ── offshore swell ── two crossing directional waves. Amplitude is ~0 at the
// bank and grows with how DEEP the water is (WATER_Y minus the lake floor), so
// it's glassy near shore and rolls out in the deep. Returns the surface height
// plus the gradient (gx,gz) for pitch/roll, and `o` = how open-water you are
// (0 shallow → 1 deep). Cheap: two sines, no allocation.
function waveAt(x, z, t) {
  const depth = Math.max(0, WATER_Y - heightAt(x, z));   // how deep below the surface
  const o = Math.max(0, Math.min(1, (depth - 0.6) / 5));  // ~0 at the bank, 1 far out
  const amp = o * (0.85 + _boatWake * 1.0);               // bigger swell, builds as you get underway
  // PRIMARY directional swell — long rollers marching in the wind direction. This
  // is the dominant motion; the two crossing swells below just add chop/texture.
  const wx = Math.sin(windDir), wz = Math.cos(windDir);
  const kp = 0.085, pp = (x * wx + z * wz) * kp - t * 1.5;
  const k1 = 0.16, p1 = (x * 0.7 + z * 0.71) * k1 + t * 1.7;
  const k2 = 0.11, p2 = (x * -0.6 + z * 0.8) * k2 + t * 1.3;
  const h = (Math.sin(pp) * 0.9 + Math.sin(p1) * 0.34 + Math.sin(p2) * 0.26) * amp;
  // analytic slope (∂h/∂x, ∂h/∂z) → drives the raft's pitch & roll
  const gx = (Math.cos(pp) * 0.9 * wx * kp + Math.cos(p1) * 0.34 * 0.7 * k1 + Math.cos(p2) * 0.26 * -0.6 * k2) * amp;
  const gz = (Math.cos(pp) * 0.9 * wz * kp + Math.cos(p1) * 0.34 * 0.71 * k1 + Math.cos(p2) * 0.26 * 0.8 * k2) * amp;
  return { h, gx, gz, o };
}

// ───────────────────────── player ─────────────────────────
// the calm clearing you wake in — every life starts and respawns here
// wake looking UP at the sky (orange→blue), not forced down
const SPAWN = { x: FLOWERBEDS[0].x, z: FLOWERBEDS[0].z, yaw: Math.PI, pitch: 0.5 };
// LAND = the bed you actually drop into (chosen from the drone shot). Defaults
// to the first bed; set when you tap out of the orbit, and where you respawn.
let LAND = { x: SPAWN.x, z: SPAWN.z };
window._land = () => LAND;
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
let _landDip = 0;   // camera knee-bend on landing, decays back up
let _dustStepT = 0;   // sprint-dust footfall cooldown
let _cloudCover = 0;   // 0..1 passing-cloud dimming (debug-readable)
window._cloudCover = () => _cloudCover;   // debug/test hook
let _curGround = 'grass';   // footstep material under the player
let tripT = 0;      // seconds left of a mushroom trip (trippy visuals + moon-jump)
let tripLevel = 0;  // 0=sober, 1=jump+vibrant, 2=animals bounce+higher+bullet arrows, 3=cloud-climb
let _idleCalls = 0; // live ambient animal-call voices (cap so the woods never get chatty)
// the COME-UP: a fresh (sober→trip) hit eases in over ~10s. The trees start to
// move + the view sways FIRST (you're not sure it's real), THEN the colour and
// music slowly flood in. _tripOnset = seconds since that sober→trip moment;
// _tripKsway / _tripTreeEnv are the per-frame envelopes other blocks read.
let _tripOnset = 99, _tripKsway = 0, _tripTreeEnv = 0, _tripLvlVis = 0;
window._tripLevel = () => tripLevel;   // debug/test hook
window._tripOnset = () => _tripOnset;  // debug/test hook
window._uTrip = () => tripUniforms.uTrip.value;   // debug/test hook
let playerVy = 0, grounded = true, jumpQ = false;
let inCanoe = false, canoeVX = 0, canoeVZ = 0, _wasCanoe = false;
let _boatRoll = 0, _boatPitch = 0;   // boat rock, handed from the canoe to the camera
// the raft is a SAILING vessel: left/right tacks the heading, the sail catches
// the wind, and the boat carries heavy momentum — slow to build, long to slide.
let raftYaw = 0;                 // the raft's own heading (decoupled from the camera)
let windDir = Math.PI * 0.35;    // where the wind blows TO, in world radians
let windStr = 0.7;               // 0..1 wind strength — drifts slowly each frame
let _gust = 0;                   // 0..1 fast gust ripple — flutters the pennant, surges the sail
let _raftAirborne = false, _raftAirVy = 0;   // wave-jump: launched off a steep face
let _raftCreakT = 0;             // occasional timber-creak cooldown
let _raftLaunch = 0;             // >0 = the launch glide: a clean push straight off the bank
let _raftJumpCd = 0;            // cooldown so the raft only rarely leaps off a crest
let _sailFovT = 0;               // 0..1 eased "sailing view" zoom-out
let _sailTrim = 0;               // -1..1 — the actual sail position (LAGS toward the target)
let _sailTarget = 0;             // -1..1 — where the slider/keys want the sail; trim eases to it
let _boatWake = 0;               // 0..1 eased boat speed — drives wave size + bow wake
let _luffing = false;            // sail flapping / spilling wind (no drive)
let _wakeFoamT = 0;              // bow-spray spawn cooldown
let _lookHoldT = 0;             // >0 = you're actively looking around; pauses the boat-follow camera
let anchored = false;          // anchor dropped → boat holds still; you fish with the bow
let _cineT = 0, _cineX = 0, _cineY = 0, _cineZ = 0, _cineStrength = 1;   // cinematic auto-look target
function cineLook(x, y, z, dur, strength) {   // snap the camera's attention to a world point (Gears-style)
  _cineX = x; _cineY = y; _cineZ = z; _cineT = dur; _cineStrength = strength == null ? 1 : strength;
}
let _fishLine = null;          // the line from the bow to a cast fishing arrow
window._anchored = () => anchored;   // debug/test hook

// ── the wake-up: a ~3.5s cinematic intro that plays on enter and on
// every respawn. Driven entirely by introT on the dt loop (no setTimeout),
// so window._sim steps through it. Skippable by tap/click/key. ──
const INTRO_DUR = 3.5;
// the opening: a vast aerial of the whole valley; tap and the camera
// dives toward the clearing, blacks out, and you wake there.
let launching = false, launchT = 0; const LAUNCH_DUR = 2.2;
const ORBIT_PHASE = Math.random() * Math.PI * 2;   // the drone opens at a random point on the oval each run
const _diveFrom = new THREE.Vector3();   // frozen aerial origin of the dive
// arrow-cam: a brief cinematic chase that rides each loosed arrow
let arrowCam = null;        // { rec, mode:'follow'|'return', rt }
window._acState = () => arrowCam ? arrowCam.mode : 'none';
window._camPos = () => camera.position.toArray().map(n=>Math.round(n));
window._camDir = () => { const v = new THREE.Vector3(); camera.getWorldDirection(v); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; };   // debug/test hook
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
  // ONLY the cinematic music plays at the beginning — no breath, no sfx (per Fronk).
}
// ── you BLINK awake on the bed of roses ── no crater, no blast. Eyes flutter
// open over a beat, the breath of coming-to, and all your functionality (HUD,
// bow, controls) fades up around you. Replaces the old explosion genesis.
function blinkAwake() {
  if (_eyelids) _eyelids.classList.add('waking');
  setLids(0, 0.5);                                 // shut, a soft warm glow
  // ONLY the cinematic music at the beginning — no breath, no dawn chorus, no
  // sfx of any kind (per Fronk). The world's sounds come in once you're playing.
  setTimeout(() => setLids(-45, 0.3), 480);        // first flutter
  setTimeout(() => setLids(-12, 0.35), 820);       // a heavy second blink
  setTimeout(() => setLids(-100, 0), 1450);        // and you're awake
  setTimeout(() => { if (_eyelids) _eyelids.classList.remove('waking'); }, 2700);
  // functionality fades in
  const hud = document.getElementById('hud');
  if (hud) { hud.style.transition = 'opacity 1.8s ease'; hud.style.opacity = '0';
    setTimeout(() => { hud.style.opacity = '1'; }, 650); }
}

// ════ the arrival ════════════════════════════════════════════════════
// You are cast down from somewhere higher. You fall, you strike the earth,
// and the impact BLOWS THE HOME INTO BEING — fire, wall, and cache rising
// out of the blast. A one-time genesis; respawns just wake in the clearing.
let _arrival = null;     // {t, ring, sphere, beam, light, baseScaleT}
const _ringGeo = new THREE.RingGeometry(0.6, 1.0, 40); _ringGeo.rotateX(-Math.PI / 2);
const _ringMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true,
  opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const _flashGeo = new THREE.SphereGeometry(1, 16, 12);
const _flashMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true,
  opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
const _beamGeo = new THREE.CylinderGeometry(1.6, 3.2, 200, 16, 1, true);
const _beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2cf, transparent: true,
  opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function explodeArrival() {
  const gx = LAND.x, gz = LAND.z, gy = heightAt(gx, gz);   // the blast lands where you chose
  // shockwave ring on the ground
  const ring = new THREE.Mesh(_ringGeo, _ringMat.clone()); ring.position.set(gx, gy + 0.2, gz);
  scene.add(ring);
  // a bloom of white-hot light at the impact
  const sphere = new THREE.Mesh(_flashGeo, _flashMat.clone()); sphere.position.set(gx, gy + 1.2, gz);
  sphere.scale.setScalar(0.5); scene.add(sphere);
  // a pillar of light from above — the higher power that threw you down
  const beam = new THREE.Mesh(_beamGeo, _beamMat.clone()); beam.position.set(gx, gy + 100, gz);
  scene.add(beam);
  // a brilliant flare that decays
  const light = new THREE.PointLight(0xffe6b0, 0, 80, 2); light.position.set(gx, gy + 3, gz);
  scene.add(light);
  // a radial spray of embers blown out of the crater
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, rr = 1 + Math.random() * 4;
    trailPuff(gx + Math.cos(a) * rr, gy + 0.4 + Math.random() * 2.2, gz + Math.sin(a) * rr);
  }
  // reveal the home and grow it out of the blast
  if (window._base && window._base.group) { window._base.group.visible = true; window._base.group.scale.setScalar(0.04); }
  // screen flash + a hard shake + the boom
  const fl = document.getElementById('flash'); if (fl) { fl.style.transition = 'none'; fl.style.opacity = '0.92'; }
  camShakeT = SHAKE_DUR * 3;
  // NO metallic stinger here — the arrival is a cinematic beat: just the swelling
  // theme + the visual blast + a soft earthen impact. (killStinger removed.)
  if (audio.impact) audio.impact('ground', 0.7);
  _arrival = { t: 0, ring, sphere, beam, light, gx, gy, gz };
}
function arrivalUpdate(dt) {
  if (!_arrival) return;
  const A = _arrival; A.t += dt;
  const k = A.t;
  // ring: punch outward and fade over ~1s
  const rs = 1 + k * 26;
  A.ring.scale.set(rs, 1, rs); A.ring.material.opacity = Math.max(0, 1 - k / 1.1);
  // sphere: bloom then vanish fast
  A.sphere.scale.setScalar(0.5 + k * 14); A.sphere.material.opacity = Math.max(0, 0.95 - k / 0.5);
  // beam: flares bright instantly, lingers, fades over ~1.6s
  A.beam.material.opacity = Math.max(0, 0.7 * (1 - k / 1.6));
  // light: a hard flash that decays
  A.light.intensity = Math.max(0, 60 * (1 - k / 0.9));
  // the home swells into being with a little overshoot
  if (window._base && window._base.group) {
    const bp = Math.min(1, k / 0.9);
    const e = 1 - Math.pow(1 - bp, 3);                 // ease-out
    const overshoot = 1 + Math.sin(bp * Math.PI) * 0.06;
    window._base.group.scale.setScalar(Math.max(0.04, e * overshoot));
  }
  // screen flash fades out
  const fl = document.getElementById('flash');
  if (fl) { fl.style.transition = 'opacity 0.5s ease-out'; fl.style.opacity = '0'; }
  if (k > 1.7) {
    scene.remove(A.ring); scene.remove(A.sphere); scene.remove(A.beam); scene.remove(A.light);
    if (window._base && window._base.group) window._base.group.scale.setScalar(1);
    _arrival = null;
  }
}
function endIntro() {                  // hand control to the player
  intro = false;
  setLids(-100, 0);                   // eyes fully open, glow gone
  player.pitch = SPAWN.pitch;         // wake looking at the sky — and STAY there
  // (the waking breath already fired at beginIntro, synced to the eyes opening)
  // NO text, NO buttons yet. Just the sky. The reveal waits for the
  // player to look around on their own (handled in the reveal block).
}
// big centered line, no box — fades in slow, holds, fades out
function cinematic(text, ms = 4000) {
  // no centered narration cards either — death/arrival read through the visual
  // beat (the black veil) + audio. (no-op so call sites stay harmless)
  return;
}
// CSS-var driver for the eyelids (DOM lives in index.html)
const _eyelids = document.getElementById('eyelids');
const _exhaust = document.getElementById('exhaust');   // hunger/exhaustion edge-darkening
let _exhaustV = 0;                                      // eased opacity, 0..1
const _heaven = document.getElementById('heaven');     // overexposed-heavenly wash high in the climb
const _warpDisp = document.getElementById('warpDisp'); // SVG liquid-warp displacement for the deep trip
const _consumeBtn = document.getElementById('consume'); // tap-to-eat the mushroom
if (_consumeBtn) {
  const eat = (e) => { e.preventDefault(); e.stopPropagation(); window._eatMushroom(); };
  _consumeBtn.addEventListener('click', eat);
  _consumeBtn.addEventListener('touchstart', eat, { passive: false });
}
const _anchorBtn = document.getElementById('anchorBtn'); // tap to drop/raise the anchor (fishing)
if (_anchorBtn) {
  const tog = (e) => { e.preventDefault(); e.stopPropagation(); toggleAnchor(); _anchorBtn.textContent = anchored ? 'raise anchor' : 'drop anchor'; };
  _anchorBtn.addEventListener('click', tog);
  _anchorBtn.addEventListener('touchstart', tog, { passive: false });
}
const _sailSlider = document.getElementById('sailSlider'); // drag left/right to swing the sail ±90°
const _sailHandle = document.getElementById('sailHandle');
if (_sailSlider) {
  let dragging = false;
  const setFromX = (clientX) => {
    const r = _sailSlider.getBoundingClientRect();
    const f = (clientX - r.left) / r.width;            // 0..1 across the bar
    _sailTarget = Math.max(-1, Math.min(1, f * 2 - 1)); // → -1..1
  };
  const down = (e) => { e.preventDefault(); e.stopPropagation(); dragging = true; setFromX((e.touches ? e.touches[0] : e).clientX); };
  const move = (e) => { if (!dragging) return; e.preventDefault(); e.stopPropagation(); setFromX((e.touches ? e.touches[0] : e).clientX); };
  const up = () => { dragging = false; };
  _sailSlider.addEventListener('mousedown', down);
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
  _sailSlider.addEventListener('touchstart', down, { passive: false });
  _sailSlider.addEventListener('touchmove', move, { passive: false });
  addEventListener('touchend', up);
}
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
// (no base, no campfire on spawn anymore — you just land on a bed of roses.
//  COVE/BASE_FIRE/BASE_RING stay null; every reference to them is guarded.)
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
  toast('What you died holding.', 2800);
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

// ── forage ── berries you just walk over (harmless food). The glowing
// mushroom is a CHOICE: stand near it and a CONSUME button appears — you
// tap it to eat (and the world goes strange). Never eaten by accident.
let _nearMush = null;
// keep the trip going: a little after you eat one, another glowing cap rises
// nearby — so the cloud-climbing never has to stop to go hunting for more.
// keep at least `count` untaken caps within reach so you can chain to level
// 3 fast — pulls in eaten ones first, then far ones, until enough are close.
function respawnMushroomNear(count = 3, dMin = 4, dMax = 10) {
  if (!started || dead) return;
  const NEAR = Math.max(14, dMax + 2);
  const muds = FORAGE.filter(f => f.kind === 'mush');
  const distOf = f => Math.hypot(f.x - player.x, f.z - player.z);
  let nearCount = muds.filter(f => !f.taken && distOf(f) < NEAR).length;
  const cands = muds.filter(f => f.taken)
    .concat(muds.filter(f => !f.taken && distOf(f) >= NEAR));
  let ci = 0;
  while (nearCount < count && ci < cands.length) {
    const f = cands[ci++];
    for (let tries = 0; tries < 20; tries++) {
      const ang = Math.random() * Math.PI * 2, dist = dMin + Math.random() * (dMax - dMin);
      const x = player.x + Math.cos(ang) * dist, z = player.z + Math.sin(ang) * dist;
      const y = heightAt(x, z);
      if (y < WATER_Y + 1.0) continue;
      f.x = x; f.z = z; f._d = 999;
      f.mesh.position.set(x, y, z);
      f.taken = false; f.mesh.visible = true;
      nearCount++; break;
    }
  }
}
function eatMushroom(f) {
  if (!f || f.taken) return;
  f.taken = true; f.mesh.visible = false;
  // each one eaten while still tripping deepens the trip a LEVEL — now up to 10.
  // 1 = subtle drunk shimmer; 2 = clouds appear + cloud-climb; 3+ = it keeps
  // intensifying, more dilute and unhinged each time, toward pure string-visual
  // madness at 10 — where the world stops offering you any more.
  const wasSober = !(tripT > 0);
  tripLevel = wasSober ? 1 : Math.min(10, tripLevel + 1);
  tripT = 60; player.lastAte = clock.elapsedTime;     // a full minute
  if (wasSober) {
    _tripOnset = 0;                                    // begin the slow ~10s come-up
    // the music doesn't slam in — it floods in AFTER the trees start to move
    clearTimeout(eatMushroom._mus);
    eatMushroom._mus = setTimeout(() => { if (tripT > 0 && audio.tripMusic) audio.tripMusic(true); }, 2200);
  } else if (audio.tripMusic) audio.tripMusic(true);  // already up — deepen immediately
  // level 1: the world goes drunk + you hop a little higher. level 2: the
  // clouds appear and you can climb them. NO announcements — let it be found.
  if (tripLevel >= 2 && !_cloudGroup) spawnClouds();
  if (tripLevel === 1) toast('…oh.', 2000);           // one ambiguous breath, nothing more
  if (audio.cue) audio.cue(Math.min(2, tripLevel - 1));
  _nearMush = null; if (_consumeBtn) _consumeBtn.classList.remove('show');
  // tripping, the world FLOODS with caps — UNTIL level 10, where it stops
  // offering: no more spawn, and the ones near you vanish. You're on your own.
  clearTimeout(eatMushroom._re);
  if (tripLevel >= 10) {
    for (const fm of FORAGE) if (fm.kind === 'mush' && !fm.taken) { fm.taken = true; fm.mesh.visible = false; }
  } else {
    respawnMushroomNear(7);
    eatMushroom._re = setTimeout(() => respawnMushroomNear(7), 2000);
  }
}
window._eatMushroom = () => eatMushroom(_nearMush || FORAGE.find(f => f.kind === 'mush' && !f.taken));

// ── LEVEL 3: the cloud-climbing game ── a rising spiral of soft, glowing
// clouds blooms around you. They become LANDABLE (see the step scan), and
// with the level-3 launch you bound up them — a vertical, heavenly climb.
const CLOUDSTEPS = [];
let _cloudGroup = null;
const _cloudBlobGeo = new THREE.IcosahedronGeometry(2.4, 1);
const _cloudMat3 = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfe2ff,
  emissiveIntensity: 0.3, roughness: 1, transparent: true, opacity: 0.96, flatShading: true });
// higher up the column the clouds turn luminous and gauzy — lit from within,
// half-dissolved, more heaven than weather. Picked by altitude band in _makeCloud.
const _cloudMatMid = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe6ecff,
  emissiveIntensity: 0.7, roughness: 1, transparent: true, opacity: 0.82, flatShading: true });
const _cloudMatHi = new THREE.MeshStandardMaterial({ color: 0xfffefb, emissive: 0xfff2da,
  emissiveIntensity: 1.5, roughness: 1, transparent: true, opacity: 0.6, flatShading: true });
// ── the kitchen PUZZLE ── a glowing target floats over each giant object.
// Light them ALL with FIRE arrows and the way to heaven opens above.
const KITCHEN_TARGETS = [];
let _heavenOpen = false;
const _targGeo = new THREE.IcosahedronGeometry(1.5, 1);
const _targUnlitMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, emissive: 0x140a04, emissiveIntensity: 0.6, roughness: 0.5 });
function lightTarget(tg) {
  if (tg.lit) return;
  tg.lit = true;
  tg.mesh.material = new THREE.MeshStandardMaterial({ color: 0xfff1bc, emissive: 0xffcf4a, emissiveIntensity: 3.2, roughness: 0.3 });
  tg.mesh.scale.setScalar(1.3);
  if (audio.cue) audio.cue(2);
  const lit = KITCHEN_TARGETS.filter(x => x.lit).length;
  if (lit >= KITCHEN_TARGETS.length && !_heavenOpen) openHeaven();
  else toast('A light kindles. ' + lit + ' / ' + KITCHEN_TARGETS.length, 2400);
}
function openHeaven() {
  _heavenOpen = true;
  // a final radiant table-disc rises far above the kitchen — the way up
  const cx = player.x, cz = player.z;
  const y = (CLOUDSTEPS.length ? Math.max(...CLOUDSTEPS.map(c => c.y)) : player.y + 120) + 40;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 1.5, 28),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 1.6, roughness: 1 }));
  disc.position.set(cx, y, cz);
  if (_cloudGroup) _cloudGroup.add(disc);
  CLOUDSTEPS.push({ x: cx, z: cz, y: y + 0.9, r: 14 });
  toast('the way opens', 4200);
  if (audio.killStinger) audio.killStinger();
}
window._lightAllTargets = () => { for (const tg of KITCHEN_TARGETS) lightTarget(tg); return KITCHEN_TARGETS.length; };
// ── THE KITCHEN ── giant oversized 90s-kitchen objects you land on once you
// climb high enough. You're shrunk to nothing; a mug is a tower, a cookie a
// plateau. Honey-I-Shrunk-the-Kids. Each returns {topH, r} for landing.
function buildKitchenItem(kind, col) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, flatShading: true });
  if (kind === 'mug') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(8, 7, 11, 20), mat);
    body.position.y = 5.5; g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(8, 0.7, 8, 20), mat);
    rim.rotation.x = Math.PI / 2; rim.position.y = 11; g.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(4, 1.1, 8, 16, Math.PI), mat);
    handle.position.set(8.5, 6, 0); handle.rotation.z = -Math.PI / 2; g.add(handle);
    // a disc of "coffee" you stand on, inset at the rim
    const coffee = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 0.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x3a2012, roughness: 0.4 }));
    coffee.position.y = 10.6; g.add(coffee);
    g.userData = { topH: 10.9, r: 7.0 };
  } else if (kind === 'cookie') {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 2.6, 18), mat);
    disc.position.y = 1.3; g.add(disc);
    const chip = new THREE.MeshStandardMaterial({ color: 0x2c160a, roughness: 0.5 });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), chip);
      const a = Math.random() * 6.28, rr = Math.random() * 7;
      c.position.set(Math.cos(a) * rr, 2.6, Math.sin(a) * rr); g.add(c);
    }
    g.userData = { topH: 2.8, r: 8.0 };
  } else {   // cereal box
    const box = new THREE.Mesh(new THREE.BoxGeometry(11, 17, 5), mat);
    box.position.y = 8.5; g.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(11.2, 4, 5.2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    band.position.y = 10; g.add(band);
    g.userData = { topH: 17.2, r: 5.0 };
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// an ENDLESS spiral of clouds — they keep generating above you forever, so
// you can climb and climb and climb. Bounded by pruning the ones far below.
let _cloudCx = 0, _cloudCz = 0, _cloudBaseY = 0, _cloudI = 0, _cloudTopY = 0;
function _makeCloud(i) {
  const ang = i * 0.8;                                    // spirals around a column
  const rad = 9 + 5.5 * Math.sin(i * 0.37);              // bounded — stays in the column
  const x = _cloudCx + Math.cos(ang) * rad, z = _cloudCz + Math.sin(ang) * rad;
  const y = _cloudBaseY + 8 + i * 4.4;                   // forever upward
  const r = 3.4 + Math.random() * 2.2;
  // altitude rises with i: clouds grow from tight puffs into wide, gauzy,
  // self-lit sheets the higher you climb — more heaven than weather.
  const alt = Math.min(1, i / 34);
  const mat = alt > 0.66 ? _cloudMatHi : alt > 0.3 ? _cloudMatMid : _cloudMat3;
  const g = new THREE.Group(); g.position.set(x, y, z);
  const blobs = (IS_TOUCH ? 4 : 5) + Math.round(alt * 3);   // fuller, more sculptural up high
  for (let b = 0; b < blobs; b++) {
    const s = new THREE.Mesh(_cloudBlobGeo, mat);
    // up high they spread wider and FLATTEN into stretched shelves — interesting
    // silhouettes (anvils, gauzy strata) instead of identical round puffs
    const spread = 1.5 + alt * 1.4;
    s.position.set((Math.random() - 0.5) * r * spread,
                   (Math.random() - 0.5) * (0.7 + alt * 1.6),
                   (Math.random() - 0.5) * r * spread);
    const base = 0.6 + Math.random() * 0.9;
    const flat = 1 - alt * (0.3 + Math.random() * 0.35);     // squashed vertically up high
    s.scale.set(base * (1 + alt * (0.4 + Math.random())), base * flat, base * (1 + alt * (0.4 + Math.random())));
    s.rotation.y = Math.random() * Math.PI;
    g.add(s);
  }
  // a rare tall wisp spires off the high clouds — breaks the flat horizon
  if (alt > 0.5 && Math.random() < 0.4) {
    const w = new THREE.Mesh(_cloudBlobGeo, mat);
    w.position.set((Math.random() - 0.5) * r, 2.4 + Math.random() * 3, (Math.random() - 0.5) * r);
    w.scale.set(0.5, 1.6 + Math.random() * 1.4, 0.5);
    g.add(w);
  }
  g.userData.bob = Math.random() * Math.PI * 2;            // slow ethereal drift, animated in loop
  _cloudGroup.add(g);
  CLOUDSTEPS.push({ x, z, y: y + 0.8, r: r + 2.0, grp: g });   // landing core stays tight — wisps are decorative
  if (y > _cloudTopY) _cloudTopY = y;
}
function spawnClouds() {
  clearClouds();
  _cloudGroup = new THREE.Group(); scene.add(_cloudGroup);
  _cloudCx = player.x; _cloudCz = player.z; _cloudBaseY = player.y;
  _cloudI = 0; _cloudTopY = player.y;
  for (let k = 0; k < (IS_TOUCH ? 26 : 38); k++) _makeCloud(_cloudI++);
  placeDoor();                              // the summit: a glowing door waits at the top
}
// the climb is now FINITE — it leads to the door, not nowhere. Pruning + extra
// generation stop once the door is placed (the door IS the top of the climb).
function extendClouds() {
  if (!_cloudGroup || tripLevel < 3 || _doorPlaced) return;
  while (_cloudTopY < player.y + 140 && _cloudI < 100000) _makeCloud(_cloudI++);
  if (CLOUDSTEPS.length > 80) {
    for (let i = CLOUDSTEPS.length - 1; i >= 0; i--) {
      const c = CLOUDSTEPS[i];
      if (c.grp && c.y < player.y - 70) { _cloudGroup.remove(c.grp); CLOUDSTEPS.splice(i, 1); }
    }
  }
}
function clearClouds() {
  if (_inKitchen) exitKitchen();            // sobering up while inside drops you home first
  if (_cloudGroup) { scene.remove(_cloudGroup); _cloudGroup = null; }
  CLOUDSTEPS.length = 0;
  KITCHEN_TARGETS.length = 0; _heavenOpen = false;
  _doorGroup = null; _doorPlat = null; _doorPlaced = false;
}
window._spawnClouds = () => { spawnClouds(); return CLOUDSTEPS.length; };
window._cloudsteps = () => CLOUDSTEPS.map(c => [Math.round(c.x), Math.round(c.y), Math.round(c.z)]);

// ════════════════════ THE DOOR + THE KITCHEN WORLD ════════════════════
// Climb the clouds to the summit and a glowing DOOR waits on the final
// platform. Step through it and the screen floods white, then clears: you're
// shrunk to nothing on a giant modern kitchen counter — a completely
// different world. When the trip finally ebbs, you wake back in the valley.
let _doorGroup = null, _doorPlat = null, _doorPlaced = false;
let _inKitchen = false, _kitchenGroup = null, _preKitchen = null;
let _kitchenItems = [], _kitchenPrev = null, _kitchenFlashT = 0;
const KFLOOR = 640;                         // the counter sits up here, far above the valley
// neutral daylight for the kitchen — the valley's golden-hour sun/IBL washes it
// monochrome-gold; these cool fills (toggled on only inside) read as modern
// indoor daylight. Added once at intensity 0; driven in the lighting block.
const _kitchenFill = new THREE.HemisphereLight(0xfdfdff, 0xc4c8d2, 0); scene.add(_kitchenFill);
const _kitchenKey = new THREE.DirectionalLight(0xffffff, 0); _kitchenKey.position.set(40, 130, -50); scene.add(_kitchenKey);
function placeDoor() {
  if (_doorPlaced || !_cloudGroup) return;
  _doorPlaced = true;
  const cx = _cloudCx, cz = _cloudCz, py = _cloudTopY + 7;   // a final platform above the top cloud
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 1.4, 30),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0cf, emissiveIntensity: 1.4,
      roughness: 1, transparent: true, opacity: 0.96 }));
  disc.position.set(cx, py, cz); _cloudGroup.add(disc);
  CLOUDSTEPS.push({ x: cx, z: cz, y: py + 0.8, r: 10 });
  // the DOOR — a free-standing frame with a shimmering portal pane (bloom-lit)
  const g = new THREE.Group(); g.position.set(cx, py + 0.7, cz);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, emissive: 0x271a0e,
    emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.1 });
  const W = 1.6, H = 4.2, T = 0.32;
  const post = new THREE.BoxGeometry(T, H, T);
  const pl = new THREE.Mesh(post, frameMat); pl.position.set(-W, H / 2, 0); g.add(pl);
  const pr = new THREE.Mesh(post, frameMat); pr.position.set(W, H / 2, 0); g.add(pr);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + T, T, T), frameMat);
  lintel.position.set(0, H, 0); g.add(lintel);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 0.1, H - 0.2),
    new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
  pane.position.set(0, H / 2, 0); g.add(pane);
  _cloudGroup.add(g);
  _doorGroup = g;
  _doorPlat = { x: cx, y: py + 0.8, z: cz };
}
// the giant 90s/modern kitchen — built once, lazily, hidden until you enter
function buildKitchen() {
  if (_kitchenGroup) return;
  const G = new THREE.Group(); G.position.set(0, KFLOOR, 0); G.visible = false;
  const counter = new THREE.Mesh(new THREE.BoxGeometry(170, 6, 170),
    new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.5, metalness: 0.0 }));
  counter.position.y = -3; counter.receiveShadow = true; G.add(counter);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(170, 130, 4),
    new THREE.MeshStandardMaterial({ color: 0xe9e3d8, roughness: 0.92 }));
  wall.position.set(0, 62, -85); G.add(wall);
  const wall2 = new THREE.Mesh(new THREE.BoxGeometry(4, 130, 170),
    new THREE.MeshStandardMaterial({ color: 0xe2dccf, roughness: 0.92 }));
  wall2.position.set(-85, 62, 0); G.add(wall2);
  // a big sunny WINDOW — daylight pours in (you're miniature, in modern day)
  const win = new THREE.Mesh(new THREE.PlaneGeometry(78, 64),
    new THREE.MeshBasicMaterial({ color: 0xd2eaff }));
  win.position.set(34, 60, -82.8); G.add(win);
  const winFrame = new THREE.Mesh(new THREE.BoxGeometry(84, 70, 2.5),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
  winFrame.position.set(34, 60, -83.4); G.add(winFrame);
  for (const mx of [34]) { const m = new THREE.Mesh(new THREE.BoxGeometry(2, 64, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })); m.position.set(mx, 60, -82.6); G.add(m); }
  // GIANT objects on the counter — you land among them like a mouse
  const place = (item, x, z, rot, s) => { item.position.set(x, 0, z); item.rotation.y = rot || 0; item.scale.setScalar(s || 1); G.add(item); };
  place(buildKitchenItem('mug', 0xcf3b2e), -40, -18, 0.3, 1.7);
  place(buildKitchenItem('cookie', 0xc89a5b), 18, 30, 0, 1.5);
  place(buildKitchenItem('cereal', 0xe8b53a), 48, -34, -0.4, 1.6);
  place(buildKitchenItem('mug', 0x2f6fcf), 56, 22, 1.1, 1.25);
  place(buildKitchenItem('cookie', 0xb98a4b), -52, 36, 0.7, 1.2);
  G.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(G); _kitchenGroup = G;
  _kitchenItems = [];
  G.children.forEach(c => { if (c.userData && c.userData.topH)
    _kitchenItems.push({ x: c.position.x, z: c.position.z, r: (c.userData.r || 5) * (c.scale.x || 1),
                         top: KFLOOR + c.userData.topH * (c.scale.y || 1) }); });
}
function enterKitchen() {
  if (_inKitchen) return;
  _inKitchen = true; buildKitchen();
  _preKitchen = { x: player.x, z: player.z };
  _kitchenFlashT = 1;                        // the threshold floods white, then clears
  _kitchenGroup.visible = true;
  sky.visible = false; if (_terrainMesh) _terrainMesh.visible = false;
  if (_cloudGroup) _cloudGroup.visible = false;
  _kitchenPrev = { bg: scene.background, fog: scene.fog };
  scene.background = new THREE.Color(0xeae3d6);
  scene.fog = new THREE.Fog(0xe6ddcd, 110, 440);   // nearby objects crisp; far walls gently hazy
  player.x = 0; player.z = 28; player.y = KFLOOR; player.airY = KFLOOR;
  grounded = false; playerVy = 0;
  if (audio.cue) audio.cue(2);
}
function exitKitchen() {
  if (!_inKitchen) return;
  _inKitchen = false;
  if (_kitchenGroup) _kitchenGroup.visible = false;
  sky.visible = true; if (_terrainMesh) _terrainMesh.visible = true;
  if (_kitchenPrev) { scene.background = _kitchenPrev.bg; scene.fog = _kitchenPrev.fog; _kitchenPrev = null; }
  if (_preKitchen) {
    player.x = _preKitchen.x; player.z = _preKitchen.z;
    player.y = heightAt(player.x, player.z); player.airY = player.y;
    grounded = true; playerVy = 0; _preKitchen = null;
  }
}
window._enterKitchen = () => { _doorPlat = _doorPlat || { x: player.x, y: player.y, z: player.z }; enterKitchen(); return _inKitchen; };
window._inKitchen = () => _inKitchen;
function forageUpdate(t) {
  let mush = null;
  for (const f of FORAGE) {
    if (f.taken) continue;
    const d = Math.hypot(player.x - f.x, player.z - f.z);
    // you must be on the SAME plane as the plant — no eating a cap from 400ft
    // up in the clouds just because you're over it horizontally
    if (Math.abs(player.y - (f.mesh.position.y || 0)) > 3.2) continue;
    if (f.kind === 'berry' || f.kind === 'fruit') {
      if (d > 2.0) continue;
      f.taken = true; f.mesh.visible = false;
      player.lastAte = t; if (player.hp < 100) { player.hp = Math.min(100, player.hp + 12); renderHP(); }
      if (audio.impact) audio.impact('flesh', 0.5);
      toast(f.kind === 'fruit' ? 'Fruit.' : 'Berries.', 1400);
    } else {                                    // the glowing mushroom — needs a deliberate tap
      if (d < 2.6 && (!mush || d < mush._d)) { mush = f; mush._d = d; }
    }
  }
  if (mush !== _nearMush) {
    _nearMush = mush;
    if (_consumeBtn) _consumeBtn.classList.toggle('show', !!mush);
  }
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

// ── bear maul on the lens ── a hard red vignette flash + blood that runs
// down the screen. Reuses a small pool of drip elements.
let _bloodDrips = null;
function bearHitFX() {
  const maul = document.getElementById('maul');
  if (maul) { maul.style.opacity = '1'; clearTimeout(bearHitFX._m);
    bearHitFX._m = setTimeout(() => { maul.style.opacity = '0'; }, 900); }
  const blood = document.getElementById('blood');
  if (!blood) return;
  if (!_bloodDrips) {
    _bloodDrips = [];
    for (let i = 0; i < 7; i++) { const d = document.createElement('div'); d.className = 'drip'; blood.appendChild(d); _bloodDrips.push(d); }
  }
  // fling 3-5 fresh runs down from random spots near the top
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const d = _bloodDrips[(Math.random() * _bloodDrips.length) | 0];
    d.classList.remove('run'); void d.offsetWidth;            // restart the animation
    d.style.left = (5 + Math.random() * 90) + 'vw';
    d.style.setProperty('--w', (7 + Math.random() * 12) + 'px');
    d.style.setProperty('--h', (16 + Math.random() * 20) + 'vh');
    d.style.setProperty('--t', (2.0 + Math.random() * 1.8) + 's');
    d.classList.add('run');
  }
}
window._bearHitFX = () => bearHitFX();   // debug/test hook
// a ground animal can only claw you when you're actually on the ground —
// not when you've jumped/climbed up a tree or a cloud well above the terrain.
function meleeReach() { return (player.y - heightAt(player.x, player.z)) < 2.6; }
let _escapeArmed = 0;   // set when a predator wounds you; the escape stinger fires when you get clear
function hurtPlayer(dmg) {
  if (dead) return;
  player.hp -= dmg; player.lastHit = clock.elapsedTime;
  _escapeArmed = clock.elapsedTime;
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
    beginDeath();
    setTimeout(() => {
      player.hp = 100; player.x = SPAWN.x; player.z = SPAWN.z;
      player.yaw = SPAWN.yaw; player.pitch = SPAWN.pitch;
      player.y = heightAt(player.x, player.z); dead = false;
      player.lastAte = clock.elapsedTime;   // restarted, not starved
      renderHP();
      respawnArrival();                     // cast back down from the sky
    }, 3500);
  }
  renderHP();
}

// ──────────────────────── wildfire ────────────────────────
// During a mushroom trip your arrows burn. A fire-arrow that buries in a
// trunk sets the tree alight: flames climb it, then it chars and falls.
// While it burns the fire JUMPS to 1-2 nearby trees — so a careless trip
// can sweep a whole grove to ash. Bounded by MAX_TREEFIRE for the phone.
const TREEFIRES = [];
const MAX_TREEFIRE = IS_TOUCH ? 40 : 90;   // a true wildfire — one tree can take the whole forest
// additive so overlapping flames BLOOM into a warm glow (reads as a roaring
// fire / heat haze, not flat orange cutouts) — the bloom post pass feeds on the
// bright cream cores. Opacity kept moderate so a whole burning forest glows
// without blowing out to obnoxious white.
const _fmA = new THREE.MeshBasicMaterial({ color: 0xff6a18, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
const _fmB = new THREE.MeshBasicMaterial({ color: 0xffab3a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
const _fmC = new THREE.MeshBasicMaterial({ color: 0xffe7a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const _charCol = new THREE.Color(0x161009);
// a small flame riding a burning animal (child of its obj, so it follows). Sized
// to the body via cfg.r; reuses the tree flame geo/additive mats.
function updateAnimalFlame(a) {
  if (!a._flame) {
    const g = new THREE.Group();
    const r = (a.cfg.r || 0.6);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(i < 2 ? flameGeoB : flameGeoC, i ? _fmB : _fmA);
      f.position.set((Math.random() - 0.5) * r * 1.4, r * 0.6 + i * r * 0.5, (Math.random() - 0.5) * r * 1.4);
      f.userData.ph = i * 1.3; g.add(f);
    }
    a._flame = g; a.obj.add(g);
  }
  const t = clock.elapsedTime;
  for (const f of a._flame.children) {
    const ph = f.userData.ph || 0;
    f.scale.y = 1.1 + 0.6 * Math.sin(t * 17 + ph);
    f.rotation.z = Math.sin(t * 9 + ph) * 0.22;
  }
}
function clearAnimalFlame(a) { if (a._flame) { a.obj.remove(a._flame); a._flame = null; } }
function igniteTree(tr) {
  if (!tr || tr._burning || tr._gone || tr.top === undefined || !tr.inst) return false;
  if (TREEFIRES.length >= MAX_TREEFIRE) return false;
  tr._burning = true;
  const gy = heightAt(tr.x, tr.z);
  const h = (tr.top - gy);                       // trunk+canopy height to wrap in flame
  const grp = new THREE.Group(); grp.position.set(tr.x, gy, tr.z);
  // a stack of flame clusters climbing the trunk — bigger low, smaller high
  const clusters = Math.max(2, Math.min(5, Math.round(h / 2.2)));
  for (let c = 0; c < clusters; c++) {
    const fy = 0.6 + (h * 0.85) * (c / clusters);
    const k = 1 - c / (clusters + 1);            // taper up
    const fa = new THREE.Mesh(flameGeoA, _fmA); fa.position.y = fy;       fa.scale.setScalar(0.8 + k);
    const fb = new THREE.Mesh(flameGeoB, _fmB); fb.position.y = fy + 0.2; fb.scale.setScalar(0.7 + k);
    const fc = new THREE.Mesh(flameGeoC, _fmC); fc.position.y = fy + 0.35; fc.scale.setScalar(0.6 + k);
    fa.userData.ph = c * 1.3; fb.userData.ph = c * 1.3 + 0.5; fc.userData.ph = c * 1.3 + 1.0;
    grp.add(fa, fb, fc);
  }
  grp.scale.y = 0.2;                              // grows in over the first second
  scene.add(grp);
  // a warm light only on desktop / only for the first few — phones stay lit by emissive alone
  let light = null;
  if (!IS_TOUCH && TREEFIRES.length < 6) {
    light = new THREE.PointLight(0xff7a2a, 9, 22, 1.8);
    light.position.set(tr.x, gy + h * 0.5, tr.z); scene.add(light);
  }
  if (audio.fireCatch) audio.fireCatch();   // a soft whoomph as it catches (not the old bell 'bing')
  TREEFIRES.push({ tr, grp, light, t: 0, dur: 5.5 + Math.random() * 2.5,
                   spreadAt: 0.7 + Math.random() * 0.6, spreadCd: 0, gy, h });   // catches FAST, then creeps to neighbours
  return true;
}
// scorched earth: fire RECOLORS the terrain itself to sand/ash in place, so a
// burned swath becomes a real desert that hugs the ground and reads correctly
// on slopes — no floating see-through scar discs. Permanent, baked into the
// terrain's vertex colors. Enough felled trees and the forest turns to dunes.
const _scorchSand = new THREE.Color(0xc2ad82);   // pale sun-bleached sand
const _scorchAsh = new THREE.Color(0x6f6453);    // darker ash, near the heart of a burn
const _scorchTmp = new THREE.Color();
let _scorchCount = 0;
function scorch(cx, cz, r) {
  if (!_groundColAttr) return;
  const seg = _groundSeg, segsN = CFG.segs, stride = segsN + 1, half = WORLD / 2;
  const arr = _groundColAttr.array;
  const ixc = (cx + half) / seg, izc = (cz + half) / seg, rad = r / seg;
  const ix0 = Math.max(0, Math.floor(ixc - rad)), ix1 = Math.min(segsN, Math.ceil(ixc + rad));
  const iz0 = Math.max(0, Math.floor(izc - rad)), iz1 = Math.min(segsN, Math.ceil(izc + rad));
  let touched = false;
  for (let iz = iz0; iz <= iz1; iz++) {
    const vz = -half + iz * seg;
    for (let ix = ix0; ix <= ix1; ix++) {
      const vx = -half + ix * seg;
      const d = Math.hypot(vx - cx, vz - cz);
      if (d > r) continue;
      const k = 1 - d / r;                            // soft falloff to the edge
      // ash at the heart, sand toward the rim — a real burned-out patch
      _scorchTmp.copy(_scorchSand).lerp(_scorchAsh, Math.max(0, k - 0.4) / 0.6 * 0.7);
      // articulate the sand: a per-vertex grain (cheap hash) + a long dune ripple
      // so the desert reads as drifted sand, not one flat tan sheet
      const grain = (Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453) % 1;
      const ripple = Math.sin(vx * 0.18 + vz * 0.07) * 0.5 + Math.sin(vx * 0.05 - vz * 0.21) * 0.5;
      const tone = 1 + (Math.abs(grain) - 0.5) * 0.16 + ripple * 0.05;   // ±~10% lightness
      _scorchTmp.multiplyScalar(tone);
      const j = (iz * stride + ix) * 3;
      const blend = Math.min(0.92, k * 1.3);
      arr[j]     += (_scorchTmp.r - arr[j])     * blend;
      arr[j + 1] += (_scorchTmp.g - arr[j + 1]) * blend;
      arr[j + 2] += (_scorchTmp.b - arr[j + 2]) * blend;
      touched = true;
    }
  }
  if (touched) { _groundColAttr.needsUpdate = true; _scorchCount++; }
  // register burned cells so grass stops growing here, and kick a resweep so
  // the blades already standing on this spot clear off within a moment
  for (let z = cz - r; z <= cz + r; z += _BURN_CELL)
    for (let x = cx - r; x <= cx + r; x += _BURN_CELL)
      if (Math.hypot(x - cx, z - cz) <= r) {
        const key = _burnKey(x, z);
        if (!_burned.has(key)) { _burned.add(key); if (_burnedPts.length < 4000) _burnedPts.push(x, z); }
      }
  _grassResweep = 8;
}
window._scars = () => _scorchCount;   // debug/test hook (count of scorch recolors)

// ── cactus ── the day AFTER a fire, life comes back to the desert: saguaro-ish
// cacti sprout from the burned sand at dawn. Procedural (CC0), bounded, spawned
// only on burned cells that don't have one yet. A small hope after the burn.
const _cactusMat = new THREE.MeshStandardMaterial({ color: 0x4f7d3e, roughness: 0.85, flatShading: true });
const _cacti = [];
const CACTUS_MAX = IS_TOUCH ? 28 : 48;
const _cactusCells = new Set();
function buildCactus() {
  const g = new THREE.Group();
  const h = 1.7 + Math.random() * 1.8;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, h, 7), _cactusMat);
  trunk.position.y = h / 2; g.add(trunk);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), _cactusMat); cap.position.y = h; g.add(cap);
  const arms = (Math.random() * 3) | 0;          // 0-2 arms
  for (let i = 0; i < arms; i++) {
    const side = i % 2 ? 1 : -1, ay = h * (0.4 + Math.random() * 0.28);
    const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.55, 6), _cactusMat);
    elbow.rotation.z = -side * 1.15; elbow.position.set(side * 0.28, ay, 0); g.add(elbow);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.55, 6), _cactusMat);
    up.position.set(side * 0.46, ay + 0.32, 0); g.add(up);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), _cactusMat);
    tip.position.set(side * 0.46, ay + 0.58, 0); g.add(tip);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.rotation.y = Math.random() * 6.28;
  return g;
}
function growCacti() {
  if (!_burnedPts.length || _cacti.length >= CACTUS_MAX) return;
  let added = 0;
  for (let tries = 0; tries < 60 && _cacti.length < CACTUS_MAX && added < 10; tries++) {
    const i = ((Math.random() * (_burnedPts.length / 2)) | 0) * 2;
    const x = _burnedPts[i] + (Math.random() - 0.5) * 4, z = _burnedPts[i + 1] + (Math.random() - 0.5) * 4;
    const ck = _burnKey(x, z);
    if (_cactusCells.has(ck)) continue;
    const y = heightAt(x, z);
    if (y < WATER_Y + 1 || y > 22) continue;
    _cactusCells.add(ck);
    const c = buildCactus(); c.position.set(x, y, z); scene.add(c); _cacti.push(c);
    added++;
  }
}
let _lastNight = 0;
function cactusDawnCheck(night) {        // a new dawn after a burn → life returns
  if (_lastNight > 0.55 && night < 0.2) growCacti();
  _lastNight = night;
}
window._cacti = () => _cacti.length;          // debug/test hook
window._cactiPos = () => _cacti.map(c => [Math.round(c.position.x), Math.round(c.position.z)]);   // debug/test hook
window._growCacti = () => growCacti();        // debug/test hook
function fellTree(tr) {                           // burned away to nothing — the ground left is flat desert
  scorch(tr.x, tr.z, 6 + (tr.sc || 1) * 3);       // a wide scar — burned forest becomes open desert
  if (!tr.inst) { tr._gone = true; tr.r = 0; tr.top = -999; return; }
  _mat4 = _mat4 || new THREE.Matrix4();
  _q0 = _q0 || new THREE.Quaternion();
  // collapse the instance to ZERO — no charred stump remains. A burned tree just
  // GOES, leaving flat sand (Fronk: the desert should be a clean flat plane).
  const S = new THREE.Vector3(0, 0, 0);
  tr.inst.setMatrixAt(tr.ii, _mat4.compose(new THREE.Vector3(tr.x, -999, tr.z), _q0, S));
  tr.inst.instanceMatrix.needsUpdate = true;
  tr._gone = true; tr.r = 0; tr.top = -999;       // no longer blocks / no longer climbable
}
let _mat4 = null, _q0 = null;
window._ignite = (tr) => igniteTree(tr);     // debug/test hook
window._treefires = () => TREEFIRES.length;  // debug/test hook
window._trees = TREES;                        // debug/test hook
function treeFireUpdate(dt) {
  if (!TREEFIRES.length) return;
  const t = clock.elapsedTime;
  for (let i = TREEFIRES.length - 1; i >= 0; i--) {
    const f = TREEFIRES[i];
    f.t += dt;
    // grow in, then flicker — each cluster dances on its own beat
    const grow = Math.min(1, f.t / 1.0);
    f.grp.scale.y = 0.2 + 0.8 * grow;
    for (const m of f.grp.children) {
      const ph = m.userData.ph || 0;
      m.rotation.z = Math.sin(t * 9 + ph) * 0.24;
      // taller, livelier licking flames so a burn reads as a ROARING fire (esp.
      // from a distance) rather than a static orange cluster
      const fl = 1 + Math.sin(t * 17 + ph * 2.3) * 0.26 + Math.sin(t * 29 + ph) * 0.14;
      m.scale.y = m.scale.x * (2.0 * fl);
    }
    if (f.light) f.light.intensity = 9 + Math.sin(t * 18 + f.gy) * 3.5;   // warmer, livelier glow
    // a creeping FRONT, not a sudden burst: every ~1s an actively-burning
    // tree reaches to the single NEAREST unburnt neighbour in canopy-touching
    // range, so the flame flows tree-to-tree and a whole grove catches over
    // time instead of 4-5 popping at once. Closest-first = a directional edge
    // that radiates outward.
    f.spreadCd -= dt;
    if (f.t > f.spreadAt && f.t < f.dur - 0.5 && f.spreadCd <= 0) {
      let best = null, bestD = 1e9;
      for (const o of TREES) {
        if (o === f.tr || o._burning || o._gone || o.top === undefined) continue;
        const d = Math.hypot(o.x - f.tr.x, o.z - f.tr.z);
        if (d > 15) continue;                       // only neighbours whose canopy nearly touches catch
        if (d < bestD) { bestD = d; best = o; }
      }
      if (best) igniteTree(best);
      f.spreadCd = 0.8 + Math.random() * 0.7;       // ~0.8-1.5s between catches — the front advances at a walk
    }
    // burn out → fell the tree, kill the flame
    if (f.t > f.dur) {
      fellTree(f.tr);
      scene.remove(f.grp);
      if (f.light) scene.remove(f.light);
      TREEFIRES.splice(i, 1);
    } else if (f.t > 0.6 && (f._gseed = (f._gseed || 0) - dt) <= 0) {
      // a burning tree drops embers into the grass at its feet → ground fire,
      // so a forest blaze ALSO sweeps the meadow floor (tree → grass chaining).
      f._gseed = 1.2 + Math.random();
      igniteGround(f.tr.x + (Math.random() - 0.5) * 4, f.tr.z + (Math.random() - 0.5) * 4);
    }
  }
}

// ───────────────────── ground / grass wildfire ─────────────────────
// A fire arrow into the GROUND (or a burning tree's embers) lights the grass.
// Each active cell carries a life timer + a cheap flame billboard cluster and,
// on a throttled tick, REACHES to a neighbouring flammable cell — so the burn
// sweeps grass↔bush↔tree across the island. When a cell burns out it SCORCHES
// (existing _burned/scorch system: grass clears, terrain → sand). Bounded by
// GFIRE_MAX for the phone; spread is throttled, never a full-map scan.
const GROUNDFIRES = [];
const GFIRE_MAX = IS_TOUCH ? 120 : 200;
const GFIRE_CELL = 4;                              // metres between distinct ground-fire cells
const _gfireKey = (x, z) => Math.floor(x / GFIRE_CELL) * 100003 + Math.floor(z / GFIRE_CELL);
const _gfireCells = new Set();                     // keys currently ablaze (dedupe + fast lookup)
// cheap shared flame visual for a ground cell — additive cones, reusing the
// tree-fire mats so the whole blaze reads as one warm glow under the bloom pass.
function _buildGroundFlame() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(i ? flameGeoB : flameGeoA, i === 2 ? _fmC : (i ? _fmB : _fmA));
    f.position.set((Math.random() - 0.5) * 1.4, 0.5 + i * 0.35, (Math.random() - 0.5) * 1.4);
    f.scale.setScalar(0.7 + Math.random() * 0.4);
    f.userData.ph = i * 1.4 + Math.random();
    g.add(f);
  }
  return g;
}
// is a spot flammable? green land with fuel (grass grows everywhere green, plus
// bushes), above water, below the rock/snow line, not already burned/ablaze.
function _flammable(x, z) {
  const y = heightAt(x, z);
  if (y < WATER_Y + 0.5 || y > 24) return false;   // water / bare rock-snow: no fuel
  if (_isBurned(x, z)) return false;               // already scorched to sand
  return true;
}
function igniteGround(x, z) {
  if (GROUNDFIRES.length >= GFIRE_MAX) return false;
  if (!_flammable(x, z)) return false;
  const key = _gfireKey(x, z);
  if (_gfireCells.has(key)) return false;          // this cell already burning
  _gfireCells.add(key);
  const gy = heightAt(x, z);
  const grp = _buildGroundFlame();
  grp.position.set(x, gy, z);
  grp.scale.setScalar(0.2);                         // grows in
  scene.add(grp);
  if (audio.fireCatch) audio.fireCatch();
  GROUNDFIRES.push({ x, z, key, grp, t: 0,
                     dur: 3.5 + Math.random() * 2.5,   // a cell burns ~3.5-6s then chars
                     spreadAt: 0.5 + Math.random() * 0.5, spreadCd: 0 });
  return true;
}
window._igniteGround = (x, z) => igniteGround(x, z);   // debug/test hook
window._groundfires = () => GROUNDFIRES.length;        // debug/test hook
const _gfireOff = [[GFIRE_CELL, 0], [-GFIRE_CELL, 0], [0, GFIRE_CELL], [0, -GFIRE_CELL],
                   [GFIRE_CELL, GFIRE_CELL], [-GFIRE_CELL, -GFIRE_CELL]];
function groundFireUpdate(dt) {
  if (!GROUNDFIRES.length) return;
  const t = clock.elapsedTime;
  for (let i = GROUNDFIRES.length - 1; i >= 0; i--) {
    const f = GROUNDFIRES[i];
    f.t += dt;
    const grow = Math.min(1, f.t / 0.8);
    const die = Math.max(0, 1 - (f.t - (f.dur - 0.8)) / 0.8);   // shrink out the last 0.8s
    f.grp.scale.setScalar(0.2 + 0.9 * grow * die);
    for (const m of f.grp.children) {
      const ph = m.userData.ph || 0;
      m.rotation.z = Math.sin(t * 9 + ph) * 0.26;
      m.scale.y = (0.7 + 0.5 * Math.abs(Math.sin(t * 16 + ph))) * 1.6;
    }
    // ── spread ── reach to ONE random flammable neighbour cell on a throttled
    // tick. Some randomness so the front fingers out, not a perfect ring.
    f.spreadCd -= dt;
    if (f.t > f.spreadAt && f.t < f.dur - 0.4 && f.spreadCd <= 0) {
      const o = _gfireOff[(Math.random() * _gfireOff.length) | 0];
      const jx = (Math.random() - 0.5) * 2, jz = (Math.random() - 0.5) * 2;
      igniteGround(f.x + o[0] + jx, f.z + o[1] + jz);
      // a ground fire that reaches a TREE lights it too → grass→tree chaining
      if (Math.random() < 0.5) {
        for (const tr of TREES) {
          if (tr._burning || tr._gone || tr.top === undefined) continue;
          if (Math.hypot(tr.x - f.x, tr.z - f.z) < GFIRE_CELL + 1.5) { igniteTree(tr); break; }
        }
      }
      f.spreadCd = 0.5 + Math.random() * 0.7;       // ~0.5-1.2s between reaches
    }
    // burn out → scorch the cell to sand (existing system) and clear the flame
    if (f.t > f.dur) {
      scorch(f.x, f.z, GFIRE_CELL * 0.9);
      scene.remove(f.grp);
      _gfireCells.delete(f.key);
      GROUNDFIRES.splice(i, 1);
    }
  }
  // ── animals flee + burn ── prey within sensing range of a fire RUN from the
  // nearest one; an animal standing IN a burning cell catches fire (existing
  // burnT DoT). Bounded: scan animals once, nearest-fire test is cheap.
  for (const a of animals) {
    if (a.dead || a.cfg.spiderish) continue;
    let nd = 1e9, nf = null;
    for (const f of GROUNDFIRES) {
      const d = Math.hypot(a.obj.position.x - f.x, a.obj.position.z - f.z);
      if (d < nd) { nd = d; nf = f; }
    }
    if (!nf) continue;
    if (nd < 2.2) {                                  // standing in the flames → alight
      if (!a.cfg.bearish && !a.cfg.hunts && !a.cfg.territorial)
        a.burnT = Math.max(a.burnT || 0, 8);         // many will still outrun it before it kills
      else a.burnT = Math.max(a.burnT || 0, 5);
    }
    // prey within ~16m bolt directly away from the nearest fire
    if (nd < 16 && !a.cfg.bearish && !a.cfg.hunts && !a.cfg.territorial) {
      a.state = 'flee';
      a.t = Math.max(a.t || 0, 2.5 + Math.random() * 2);
      a.dir = Math.atan2(a.obj.position.x - nf.x, a.obj.position.z - nf.z)
              + (Math.random() - 0.5) * 0.5;
    }
  }
  // ── the fire HURTS the player ── stand within ~2.5m of any ground fire (or a
  // burning tree) and you catch fire: burn DoT + a fire vignette + a hiss. Get
  // away or into water and it stops. Telegraphed, escapable — not instant death.
  _playerHeat(dt);
}
// player burn state — a fire vignette (reuses #hurt's red glow at low opacity)
// + steady burn damage while near flames; cools off the moment you escape.
let _onFireT = 0;
function _playerHeat(dt) {
  if (dead || _inKitchen) { _onFireT = 0; return; }
  // in water? deep water / canoe douses you outright
  const inWater = player.y < WATER_Y + 0.5 && heightAt(player.x, player.z) < WATER_Y + 0.6;
  let near = false;
  if (!inWater) {
    const HEAT = 2.6;
    for (const f of GROUNDFIRES) {
      if (Math.hypot(player.x - f.x, player.z - f.z) < HEAT) { near = true; break; }
    }
    if (!near) for (const f of TREEFIRES) {
      if (Math.hypot(player.x - f.tr.x, player.z - f.tr.z) < HEAT + 0.6) { near = true; break; }
    }
  }
  if (near) {
    _onFireT = Math.min(2.2, _onFireT + dt);          // takes a beat to fully catch
    _playerBurnTick = (_playerBurnTick || 0) - dt;
    if (_playerBurnTick <= 0) { _playerBurnTick = 0.5; hurtPlayer(2.4); }   // ~4.8 hp/s
    if (audio.fireCatch && !_onFireWasNear) audio.fireCatch();
  } else {
    _onFireT = Math.max(0, _onFireT - dt * 1.8);      // cools off fast once clear
  }
  _onFireWasNear = near;
  // fire vignette — warm flicker layered on the #hurt overlay (skip while a
  // hit-flash owns it). Off entirely when not burning.
  const ov = document.getElementById('hurt');
  if (ov && clock.elapsedTime - (player.lastHit || -9) > 0.3) {
    const heat = _onFireT / 2.2;
    ov.style.opacity = heat > 0.02
      ? String(Math.min(0.7, heat * (0.42 + 0.18 * Math.sin(clock.elapsedTime * 14))))
      : (ov.style.opacity === '0' ? '0' : ov.style.opacity);
    if (heat <= 0.02 && ov.style.opacity !== '0' && !_onFireWasNear) ov.style.opacity = '0';
  }
}
let _playerBurnTick = 0, _onFireWasNear = false;
window._onFire = () => _onFireT > 0.1;   // debug/test hook

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

// ── rocket-fuel trail ── a pool of additive embers a fire-arrow drops as it
// flies. Billboarded to the camera, each blooms then fades. Bounded for phone.
const _trailGeo = new THREE.PlaneGeometry(0.42, 0.42);
const _trailMat = new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true,
  opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const TRAIL = []; const TRAIL_MAX = IS_TOUCH ? 26 : 46; let _trailNext = 0;
function trailPuff(x, y, z) {
  let p;
  if (TRAIL.length < TRAIL_MAX) {
    p = new THREE.Mesh(_trailGeo, _trailMat.clone()); scene.add(p); TRAIL.push(p);
  } else { p = TRAIL[_trailNext]; _trailNext = (_trailNext + 1) % TRAIL.length; }
  p.visible = true; p.position.set(x, y, z);
  p.material.color.setHex(Math.random() < 0.4 ? 0xffe27a : 0xff6a14);
  p.material.opacity = 0.95; p.scale.setScalar(0.5 + Math.random() * 0.4);
  p.userData.life = 0.5;
}
function trailUpdate(dt) {
  for (const p of TRAIL) {
    if (!p.visible) continue;
    p.userData.life -= dt;
    if (p.userData.life <= 0) { p.visible = false; continue; }
    p.material.opacity = Math.max(0, p.userData.life / 0.5) * 0.95;
    p.scale.addScalar(dt * 2.2);                 // bloom outward as it dies
    p.quaternion.copy(camera.quaternion);        // billboard
  }
}

// ── dust ── soft ground-coloured puffs kicked up by a sprint, a landing, and
// most of all by a galloping animal — so a chase reads in the dirt, not just the
// legs. A small billboarded pool, alpha-blended (not additive — it's earth, not
// fire), each rising, spreading and fading. Bounded hard for the phone.
const _dustTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.30)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const _dustGeo = new THREE.PlaneGeometry(1, 1);
const _dustMat = new THREE.MeshBasicMaterial({ map: _dustTex, color: 0xb1997a,
  transparent: true, opacity: 1, depthWrite: false });
const DUST = []; const DUST_MAX = IS_TOUCH ? 26 : 46; let _dustNext = 0;
function dustPuff(x, y, z, hex, scl) {
  hex = hex === undefined ? 0xb1997a : hex; scl = scl || 1;
  let p;
  if (DUST.length < DUST_MAX) { p = new THREE.Mesh(_dustGeo, _dustMat.clone()); scene.add(p); DUST.push(p); }
  else { p = DUST[_dustNext]; _dustNext = (_dustNext + 1) % DUST.length; }
  p.visible = true;
  p.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.14, z + (Math.random() - 0.5) * 0.4);
  p.material.color.setHex(hex);
  p.material.opacity = 0.42;
  p.scale.setScalar((0.5 + Math.random() * 0.4) * scl);
  p.userData.life = p.userData.maxLife = 0.7 + Math.random() * 0.35;
  p.userData.vy = 0.45 + Math.random() * 0.35;
  p.userData.grow = 1.5 * scl;
}
function dustUpdate(dt) {
  for (const p of DUST) {
    if (!p.visible) continue;
    p.userData.life -= dt;
    if (p.userData.life <= 0) { p.visible = false; continue; }
    p.position.y += p.userData.vy * dt;
    p.userData.vy *= Math.pow(0.5, dt * 2);      // billows up, then settles
    p.scale.addScalar(p.userData.grow * dt);
    p.material.opacity = 0.42 * (p.userData.life / p.userData.maxLife);
    p.quaternion.copy(camera.quaternion);        // billboard
  }
}
window._dust = () => DUST.filter(p => p.visible).length;   // debug/test hook
// tan of the ground you're standing on (rock kicks up almost nothing)
function dustTintFor(grd) { return grd === 'sand' ? 0xccb892 : grd === 'rock' ? 0x8c857e : 0xa3906f; }

// ── weather: a passing rain ── most of the time it's clear, but now and then a
// light shower rolls through — the light greys over, a soft hiss, thin streaks
// around you — then it passes and the gold warms back. Mood, not a downpour:
// transient, occasional, restrained. Cheap: one Points cloud that follows you.
const _rainN = IS_TOUCH ? 340 : 640;
const _rainHW = 26, _rainTop = 30, _rainBot = -6;
// each drop is a short slanted LINE (real streaks — Points only draw squares).
const _rainFall = 24, _rainSlant = 3.2, _rainLen = 1.5;
const _rainMag = Math.hypot(_rainFall, _rainSlant);
const _rainSx = (_rainSlant / _rainMag) * _rainLen, _rainSy = (_rainFall / _rainMag) * _rainLen;
let _rain = null, _rainHeads = null, _rainLevel = 0, _rainTarget = 0, _rainDur = 0, _rainCd = 90 + Math.random() * 120;
const FOG_RAIN = new THREE.Color(0x8b9095);   // cool overcast grey
function buildRain() {
  _rainHeads = new Float32Array(_rainN * 3);
  const pos = new Float32Array(_rainN * 6);          // 2 verts (head, tail) per drop
  for (let i = 0; i < _rainN; i++) {
    const hx = (Math.random() - 0.5) * 2 * _rainHW,
          hy = _rainBot + Math.random() * (_rainTop - _rainBot),
          hz = (Math.random() - 0.5) * 2 * _rainHW;
    _rainHeads[i * 3] = hx; _rainHeads[i * 3 + 1] = hy; _rainHeads[i * 3 + 2] = hz;
    const b = i * 6;
    pos[b] = hx; pos[b + 1] = hy; pos[b + 2] = hz;
    pos[b + 3] = hx - _rainSx; pos[b + 4] = hy - _rainSy; pos[b + 5] = hz;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xaebccc, transparent: true,
    opacity: 0, depthWrite: false });
  _rain = new THREE.LineSegments(geo, mat); _rain.frustumCulled = false; _rain.visible = false;
  scene.add(_rain);
}
function weatherUpdate(t, dt, night) {
  if (!_rain) return;
  // shower scheduler: long clear spells, then a shower that swells and passes.
  // suppressed entirely during the trip (it owns the sky/grade).
  if (tripT > 0) { _rainTarget = 0; }
  else if (_rainDur > 0) { _rainDur -= dt; if (_rainDur <= 0) { _rainTarget = 0; _rainCd = 150 + Math.random() * 240; } }
  else { _rainCd -= dt; if (_rainCd <= 0) { _rainDur = 28 + Math.random() * 40; _rainTarget = 0.45 + Math.random() * 0.4; } }
  _rainLevel += (_rainTarget - _rainLevel) * Math.min(1, dt * 0.35);   // slow roll-in/out
  _rain.material.opacity = 0.62 * _rainLevel;
  _rain.visible = _rainLevel > 0.01;
  if (_rain.visible) {
    const pos = _rain.geometry.attributes.position.array;
    const fall = _rainFall * dt, slant = _rainSlant * dt;
    for (let i = 0; i < _rainN; i++) {
      let hx = _rainHeads[i * 3] + slant, hy = _rainHeads[i * 3 + 1] - fall, hz = _rainHeads[i * 3 + 2];
      if (hy < _rainBot) { hy = _rainTop; hx = (Math.random() - 0.5) * 2 * _rainHW; hz = (Math.random() - 0.5) * 2 * _rainHW; }
      if (hx > _rainHW) hx -= 2 * _rainHW;
      _rainHeads[i * 3] = hx; _rainHeads[i * 3 + 1] = hy; _rainHeads[i * 3 + 2] = hz;
      const b = i * 6;
      pos[b] = hx; pos[b + 1] = hy; pos[b + 2] = hz;
      pos[b + 3] = hx - _rainSx; pos[b + 4] = hy - _rainSy; pos[b + 5] = hz;
    }
    _rain.geometry.attributes.position.needsUpdate = true;
    _rain.position.set(player.x, player.y, player.z);
    // the light goes flat and overcast as the shower deepens
    const k = _rainLevel;
    sun.intensity *= 1 - k * 0.5;
    hemi.intensity *= 1 - k * 0.18;
    if ('environmentIntensity' in scene) scene.environmentIntensity *= 1 - k * 0.28;
    scene.fog.color.lerp(FOG_RAIN, k * 0.5);
    scene.background.copy(scene.fog.color);
    scene.fog.far -= k * 90;   // closes the world in a touch
  }
  // rainbow: as a shower CLEARS in daylight, a bow arcs up opposite the sun
  if (_rainLevel > 0.4) _rainWasUp = true;
  if (_rainWasUp && _rainLevel < 0.18) { _rainWasUp = false; if (night < 0.35 && tripT <= 0) _rainbowT = 26; }
  rainbowUpdate(dt, night);
  cactusDawnCheck(night);   // cacti sprout from burned sand at the next dawn
}
// ── rainbow ── a ROYGBIV arc that rises opposite the sun for ~25s after a
// daytime shower passes. One ring mesh, vertex-coloured by radius; faces the
// player, fog-immune so it reads clean in the far sky. Pure delight.
let _rainbow = null, _rainbowLevel = 0, _rainbowT = 0, _rainWasUp = false;
function buildRainbow() {
  const geo = new THREE.RingGeometry(0.74, 1.0, 96, 1, 0, Math.PI);
  const pos = geo.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const rad = Math.hypot(pos.getX(i), pos.getY(i));
    const u = Math.max(0, Math.min(1, (rad - 0.74) / 0.26));   // 0 inner(violet) → 1 outer(red)
    c.setHSL(0.78 * u, 0.95, 0.56);                            // violet(0.78)→red(0) sweep via hue
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true,
    opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false });
  _rainbow = new THREE.Mesh(geo, mat); _rainbow.frustumCulled = false; _rainbow.visible = false;
  _rainbow.scale.setScalar(190); scene.add(_rainbow);
}
function rainbowUpdate(dt, night) {
  if (!_rainbow) return;
  if (_rainbowT > 0) _rainbowT -= dt;
  const target = (_rainbowT > 0 && night < 0.4 && tripT <= 0) ? 1 : 0;
  _rainbowLevel += (target - _rainbowLevel) * Math.min(1, dt * 0.4);
  _rainbow.visible = _rainbowLevel > 0.01;
  if (!_rainbow.visible) return;
  _rainbow.material.opacity = 0.62 * _rainbowLevel;
  // place opposite the sun, base near the horizon, arcing up over the far valley
  const hx = -_sunDir.x, hz = -_sunDir.z, hl = Math.hypot(hx, hz) || 1;
  const cx = player.x + (hx / hl) * 340, cz = player.z + (hz / hl) * 340;
  _rainbow.position.set(cx, 3, cz);
  _rainbow.rotation.y = Math.atan2(player.x - cx, player.z - cz);   // face the player
}
window._rain = () => _rainLevel;                       // debug/test hook
window._rainbow = () => _rainbowLevel;                 // debug/test hook
window._sunDir = () => [_sunDir.x, _sunDir.y, _sunDir.z];   // debug/test hook
window._forceRain = () => { _rainDur = 40; _rainTarget = 0.8; _rainCd = 0; };   // debug/test hook
window._forceRainbow = () => { _rainbowT = 26; };      // debug/test hook
buildRain(); buildRainbow();

// ── anchor ── drop it to hold the boat still and fish; raise it to sail again.
function toggleAnchor() {
  if (!inCanoe || !started || _raftLaunch > 0) return;
  anchored = !anchored;
  if (anchored) { canoeVX = 0; canoeVZ = 0; _boatWake = 0; toast('Anchor down — cast with the bow to fish.', 2600); }
  else toast('Anchor up.', 1400);
}
window._toggleAnchor = toggleAnchor;   // test/UI hook

// the shark bites a log clean off the raft — the deck shrinks from the edges in.
// Returns true if a log was taken (won't strip below 3 logs — you can't sink).
function biteBoatLog() {
  if (typeof canoe === 'undefined' || !canoe || !canoe._logs) return false;
  const live = canoe._logs.filter(l => l.visible);
  if (live.length <= 3) return false;
  live.sort((a, b) => Math.abs(b.position.x) - Math.abs(a.position.x));   // outermost first
  live[0].visible = false;
  return true;
}

function loose() {
  // a real press always looses a shot — even a quick tap (raiseT confirms the
  // bow came up). Only a true no-draw is ignored. Floor the power so a fast
  // tap still fires a (weak) arrow instead of silently doing nothing.
  let power = Math.min(1, drawT);
  if (power < 0.03 && raiseT < 0.08) { drawT = 0; return; }
  power = Math.max(power, 0.22);
  if (player.arrows <= 0) {                   // out of ammo — dry, go collect some
    drawT = 0; if (audio.drawCreak) audio.drawCreak(0);
    toast('Out of arrows.', 2400);
    return;
  }
  // FISHING cast — anchored, you fire a line-arrow you reel back: no ammo spent.
  const fishing = inCanoe && anchored;
  if (!fishing) { player.arrows--; renderNotes(); }
  const onFire = tripT > 0 && !fishing;   // no flaming fishing arrows
  // sober: speed scales with draw, arrows arc. TRIPPING: every shot is a
  // FIERY BULLET — full power regardless of pull, dead flat, no gravity,
  // straight at whatever the reticle marks. It just hits.
  const speed = onFire ? 150 : (6 + Math.pow(power, 1.5) * 66);
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
  // ── fire-arrow ── while you're tripping, the shot burns: a fat hot
  // rocket-fuel tail, a bigger blazing head, no gravity, sets trees alight.
  if (onFire) {
    streak.material.color.setHex(0xffc24e);
    streak.material.opacity = 1;
    streak.scale.set(2.4, 2.4, 2.0);              // a big blazing plume
    m.scale.setScalar(1.6);                       // the shaft reads heavier/hotter
  }
  scene.add(m);
  const rec = { m, v: dir.multiplyScalar(speed),
                t: ARROW_LIFE, power, fire: onFire, fishing,
                ox: m.position.x, oy: m.position.y, oz: m.position.z };
  arrows.push(rec);
  arrowCam = { rec, mode: 'follow', rt: 0 };   // ride this one
  audio.twang();
  kickT = KICK_DUR;        // kill-feel: the string snaps your aim up a hair
  if (IS_TOUCH && navigator.vibrate) navigator.vibrate(Math.round(18 + power * 34));
  drawT = 0;
  // ── the report spooks prey in TWO stages ── the FIRST shot they hear makes
  // them lift their heads and look (alert); a SECOND shot while still alert
  // sends them running. (Close prey already inside the flee ring bolt anyway.)
  for (const a of animals) {
    if (a.dead || a.cfg.hunts || a.cfg.bearish || a.cfg.territorial) continue;   // prey only
    if (a.state === 'flee' || a.state === 'wounded' || a.state === 'rear') continue;  // already gone
    const adx = player.x - a.obj.position.x, adz = player.z - a.obj.position.z;
    if (adx * adx + adz * adz > 65 * 65) continue;          // within earshot of the shot
    if (a.state === 'alert') {                              // second shot → run
      a.state = 'flee'; a.t = 3 + Math.random() * 2.5;
      a.dir = Math.atan2(-adx, -adz) + (Math.random() - 0.5) * 0.7;
      spookHerd(a);
      // a rare wistful stinger when a chance bolts away — sparse on purpose
      loose._fleeT = loose._fleeT || -99;
      if (clock.elapsedTime - loose._fleeT > 28 && Math.random() < 0.6) {
        loose._fleeT = clock.elapsedTime;
        if (audio.themeSting) audio.themeSting('sting_flee', 0.5);
      }
    } else {                                                // first shot → look your way
      a.state = 'alert'; a.t = 2.6 + Math.random() * 2.0;
    }
  }
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
  if (fwd > 0.32 && up > 0.18) return 'head';     // more forgiving headshots
  if (up > 0.12 && fwd > -0.1) return 'vitals';
  if (fwd > 0.12) return 'leg';
  if (fwd < -0.25) return 'hind';
  return 'gut';
}
function arrowUpdate(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (a.stuck) {
      a.t -= dt;
      if (a.t <= 0) {
        if (a.fishing === 'soak') {                       // reel the line back in
          if (a.fishHooked) {
            player.lastAte = clock.elapsedTime; if (player.hp < 100) { player.hp = Math.min(100, player.hp + 18); renderHP && renderHP(); }
            player.meat = Math.min(3, (player.meat || 0) + 1); renderNotes();
            if (audio.sharkSfx) audio.sharkSfx('shark_splash', a.m.position.x, a.m.position.z, { gain: 0.5 });
            toast('A fish! Reeled it in.', 2400);
          } else toast('Nothing biting. Cast again.', 1800);
        }
        scene.remove(a.m); arrows.splice(i, 1);
      }
      continue;
    }
    a._px = a.m.position.x; a._py = a.m.position.y; a._pz = a.m.position.z;  // last pos (swept tests)
    if (!a.fire) a.v.y -= ARROW_GRAVITY * dt;   // fire-arrows fly dead flat — no gravity, like a bullet
    a.m.position.addScaledVector(a.v, dt);
    // streak fades as the arrow ages and as it slows (drag illusion)
    const st = a.m.userData.streak;
    if (st) {
      const spd = Math.hypot(a.v.x, a.v.y, a.v.z);
      st.material.opacity = Math.max(0, Math.min(0.95, spd / 80 * (a.fire ? 0.95 : 0.55))) * Math.min(1, a.t / 1.5);
    }
    // a fire-arrow lays down a trail of rocket-fuel embers as it flies
    if (a.fire) trailPuff(a.m.position.x, a.m.position.y, a.m.position.z);
    // orient along velocity — skip when v is near-vertical (apex of a
    // straight-up shot) so lookAt never degenerates against the up axis
    if (a.v.x * a.v.x + a.v.z * a.v.z > 1e-4)
      a.m.lookAt(_arrowAim.copy(a.m.position).add(a.v));

    // animal hit — SWEPT test against this frame's flight segment so fast
    // arrows (and trip bullets) can't tunnel past, with a forgiving hit
    // sphere so a shot that LOOKS like it connects actually registers.
    let hit = false;
    for (const an of animals) {
      if (an.dead) continue;
      const ap = an.obj.position;
      const cx = ap.x, cy = ap.y + an.cfg.r * 0.8, cz = ap.z;
      const hitR = an.cfg.r * 1.7 + 0.2;            // generous — forgive near-misses
      // closest point on the segment (prev pos → current pos) to the body center
      const sx = a._px, sy = a._py, sz = a._pz;
      const ddx = a.m.position.x - sx, ddy = a.m.position.y - sy, ddz = a.m.position.z - sz;
      const seg2 = ddx * ddx + ddy * ddy + ddz * ddz || 1;
      let tt = ((cx - sx) * ddx + (cy - sy) * ddy + (cz - sz) * ddz) / seg2;
      tt = Math.max(0, Math.min(1, tt));
      const hx = sx + ddx * tt, hy = sy + ddy * tt, hz = sz + ddz * tt;
      if (Math.hypot(hx - cx, hy - cy, hz - cz) < hitR) {
        a.m.position.set(hx, hy, hz);               // snap to the actual contact point
        if (audio.impact) audio.impact('flesh',
          Math.min(1, Math.hypot(hx - player.x, hz - player.z) / 60));
        // ── spiders ── a FIRE arrow wipes one instantly; a plain arrow barely
        // fazes it (3 nips). No carcass, no meat — they just die and vanish.
        if (an.cfg.spiderish) {
          bloodPuff(hx, hy, hz);
          if (a.fire) killSpider(an);
          else { an.hp -= 1; if (an.hp <= 0) killSpider(an); }
          scene.remove(a.m); arrows.splice(i, 1); hit = true; break;
        }
        const zone = hitZone(an, hx, hy, hz);
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
          // prey: damage scales by ZONE and draw, against size-scaled HP, so a
          // horse is NOT one-shottable unless it's a true heart shot at near-full
          // draw. A finishing hit on an already-wounded animal always drops it;
          // gut/leg deal little but the wound bleeds it out over time.
          if (an.state === 'wounded') {
            an.hp = 0;
          } else {
            const dmgByZone = { vitals: 5, leg: 1, hind: 1.2, gut: 1.5 };
            let dmg = (dmgByZone[zone] || 1.5) * (0.55 + 0.9 * a.power);
            if (cleanKill && zone === 'vitals' && a.power > 0.9) dmg = 999;   // perfect heart shot
            an.hp -= dmg;
          }
        }
        // kill-feel: flesh always answers — a puff of blood at the wound
        bloodPuff(a.m.position.x, a.m.position.y, a.m.position.z);
        juiceT = Math.max(juiceT, 0.04);          // flesh hit: brief hitstop
        // a FIRE arrow sets the animal ALIGHT — it burns down over ~13s (refreshed
        // each hit). A bear takes ~3 fire hits + the burn (~20s) to drop. Sensible.
        if (a.fire && !an.cfg.spiderish) an.burnT = Math.max(an.burnT || 0, 13);
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
          // it FELT it — a flinch + a roar so the hit reads clearly
          setAnim(an, an.acts.HitReact_Left ? 'HitReact_Left' : 'Idle_2', true);
          setTimeout(() => { if (!an.dead) an.cur = null; }, 400);
          if (audio.breathAt) audio.breathAt(ap.x, ap.z, 0.95);
          camShakeT = SHAKE_DUR;
          // an arrow into a bear: a close shot enrages it (charge); a far,
          // impressive shot only baffles it — it rears, then lumbers off.
          const dxB = ap.x - player.x, dzB = ap.z - player.z;
          an._tableau = null;                          // a shot ends the feeding tableau outright
          if (flightD > 40) {
            an.confused = true; an.rearAfter = 'retreat';
            enterBearRear(an, -dxB, -dzB);
          } else {
            an.aggro = true; an.rearAfter = 'charge';
            enterBearRear(an, -dxB, -dzB);
            toast('The bear felt that.', 2600);
          }
        } else if (an.cfg.hunts || an.cfg.territorial) {
          // wounding a predator does not make it leave. It makes it sure.
          setAnim(an, 'HitReact_Left', true);
          setTimeout(() => { if (!an.dead) an.cur = null; }, 400);
          an.aggro = true;
          toast(an.isCryptid ? 'It felt that — and came closer.' : 'Hit it. It didn’t back off.');
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
          a.m.userData.stuckArrow = true;   // so harvest can pull it back out of the body
          an.obj.attach(a.m);     // carcass cleanup removes obj + arrows together
        } else scene.remove(a.m);
        arrows.splice(i, 1); hit = true; break;
      }
    }
    if (hit) continue;
    // ── kitchen puzzle ── a FIRE arrow that touches a target lights it
    if (a.fire && KITCHEN_TARGETS.length) {
      let lit = false;
      for (const tg of KITCHEN_TARGETS) {
        if (tg.lit) continue;
        const sx = a._px, sy = a._py, sz = a._pz;
        const ddx = a.m.position.x - sx, ddy = a.m.position.y - sy, ddz = a.m.position.z - sz;
        const seg2 = ddx * ddx + ddy * ddy + ddz * ddz || 1;
        let tt = ((tg.x - sx) * ddx + (tg.y - sy) * ddy + (tg.z - sz) * ddz) / seg2;
        tt = Math.max(0, Math.min(1, tt));
        const hx = sx + ddx * tt, hy = sy + ddy * tt, hz = sz + ddz * tt;
        if (Math.hypot(hx - tg.x, hy - tg.y, hz - tg.z) < 2.6) {   // generous
          lightTarget(tg); trailPuff(tg.x, tg.y, tg.z);
          scene.remove(a.m); arrows.splice(i, 1); lit = true; break;
        }
      }
      if (lit) continue;
    }
    const distVol = Math.min(1, Math.hypot(a.m.position.x - player.x, a.m.position.z - player.z) / 60);
    const px = a.m.position.x, py = a.m.position.y, pz = a.m.position.z;

    // ── clouds SWALLOW arrows during the climb ── so you can't fire one (and
    // ride its camera) up to the top and spoil the ascent. The motion bleeds
    // away in the cloud — a soft poof — and the shaft drops, ending the ride.
    if (tripLevel >= 2 && CLOUDSTEPS.length && !a.fire) {
      let swallowed = false;
      for (const cs of CLOUDSTEPS) {
        if (Math.hypot(px - cs.x, py - cs.y, pz - cs.z) < cs.r + 1.0) { swallowed = true; break; }
      }
      if (swallowed) {
        trailPuff(px, py, pz);                          // a little dissipating poof
        if (a.m.userData.streak) { a.m.remove(a.m.userData.streak); a.m.userData.streak = null; }
        a.v.set(0, -2, 0);                              // motion gone — it just sinks out
        a.stuck = true; a.t = 0.5;                      // brief linger, then removed — ends the arrow-cam
        continue;
      }
    }

    // tree hit — SWEPT against the trunk (a fast arrow steps >2m/frame, so
    // a point test would tunnel through a thin trunk). It stops IN the
    // wood and knocks like it. Closest approach of this frame's segment.
    let treeHit = false;
    const sx = a._px, sz = a._pz, dxs = px - sx, dzs = pz - sz;
    const segLen2 = dxs * dxs + dzs * dzs || 1;
    for (const tr of TREES) {
      // a FIRE arrow lights the whole tree — its leaves catch, not just the
      // trunk — so the hit radius opens up to the canopy spread and full height.
      const trunkR = a.fire ? (tr.r + 2.4) : (Math.min(tr.r, 0.6) + 0.18);
      // quick reject: trunk far from the segment's bounding box
      if (tr.x < Math.min(sx, px) - trunkR || tr.x > Math.max(sx, px) + trunkR ||
          tr.z < Math.min(sz, pz) - trunkR || tr.z > Math.max(sz, pz) + trunkR) continue;
      let t = ((tr.x - sx) * dxs + (tr.z - sz) * dzs) / segLen2;
      // the trunk must be FORWARD of the muzzle and the arrow APPROACHING it —
      // otherwise standing next to a trunk and shooting AWAY catches it on frame
      // one (the old clamp snapped t to the start point, still inside trunkR),
      // and threading a gap snagged trunks the arrow only passes alongside.
      if (t <= 0) continue;                              // trunk is beside/behind the muzzle
      t = Math.min(1, t);
      const cxp = sx + dxs * t, czp = sz + dzs * t;
      if (Math.hypot(tr.x - cxp, tr.z - czp) >= trunkR) continue;
      const cyp = a._py + (py - a._py) * t;             // arrow height at closest approach
      const gy = heightAt(tr.x, tr.z);
      const zoneTop = a.fire ? ((tr.top !== undefined ? tr.top - gy : 10) + 3) : 10;
      if (cyp > gy + 0.3 && cyp < gy + zoneTop) {       // trunk + canopy (full for fire)
        if (a.fire) {
          a.m.position.set(cxp, cyp, czp);              // burning shaft: snap to the trunk, it's consumed anyway
        } else {
          // lodge only a couple inches: tip at the trunk FACE, shaft proud
          const vl = Math.hypot(a.v.x, a.v.y, a.v.z) || 1;
          const dx = a.v.x / vl, dy = a.v.y / vl, dz = a.v.z / vl, hh = Math.hypot(dx, dz) || 1;
          const surf = Math.max(0.05, trunkR - 0.05);
          const ex = tr.x - (dx / hh) * surf, ez = tr.z - (dz / hh) * surf;
          a.m.position.set(ex - dx * 0.40, cyp - dy * 0.40, ez - dz * 0.40);
          a.m.lookAt(ex, cyp, ez);                      // tip just bites the wood, shaft sticks out
        }
        a.stuck = true; a.t = a.fire ? 2.0 : ARROW_STUCK_LIFE;   // a burning shaft is consumed by its own fire
        if (a.m.userData.streak) { a.m.remove(a.m.userData.streak); a.m.userData.streak = null; }
        if (audio.impact) audio.impact('wood', distVol);
        if (a.fire) igniteTree(tr);                     // the trip-arrow sets the tree alight
        treeHit = true; break;
      }
    }
    if (treeHit) continue;

    // ── kitchen world: the counter (and the giant objects) stop arrows, so
    // they don't fall 600m to the valley floor you can no longer see ──
    if (_inKitchen) {
      let floor = KFLOOR;
      for (const it of _kitchenItems) {
        if (Math.hypot(px - it.x, pz - it.z) < it.r && it.top > floor) floor = it.top;
      }
      if (py < floor) {
        const vl = Math.hypot(a.v.x, a.v.y, a.v.z) || 1;
        a.m.position.set(px, floor + 0.02, pz);
        a.m.lookAt(px + a.v.x / vl, floor + 0.02 + a.v.y / vl, pz + a.v.z / vl);
        a.stuck = true; a.t = ARROW_STUCK_LIFE;
        if (a.m.userData.streak) { a.m.remove(a.m.userData.streak); a.m.userData.streak = null; }
        if (audio.impact) audio.impact('wood', distVol);
      }
      continue;                                       // skip the valley water/ground tests inside
    }

    // water hit — a splash, then it sinks and is gone. A FISHING arrow instead
    // floats at the surface on its line and SOAKS: wait for a bite, then reel.
    if (py < WATER_Y && heightAt(px, pz) < WATER_Y) {
      if (audio.impact) audio.impact('water', distVol);
      if (a.fishing) {
        a.m.position.y = WATER_Y - 0.05; a.v.set(0, 0, 0);
        a.stuck = true; a.fishing = 'soak';
        a.t = 2.0 + Math.random() * 3.0;                 // the wait for a bite
        a.fishHooked = Math.random() < 0.55;             // ~55% a fish is on when you reel
        if (a.m.userData.streak) { a.m.remove(a.m.userData.streak); a.m.userData.streak = null; }
        toast('Line cast. Wait for a bite…', 1800);
      } else { scene.remove(a.m); arrows.splice(i, 1); }
      continue;
    }

    // ground hit (grass/dirt) — PLANT it tip-down so the shaft ALWAYS shows,
    // any shot angle (a steep shot used to bury flat and vanish). ~8cm in the
    // dirt, the rest of the shaft proud and findable.
    if (py < heightAt(px, pz)) {
      const gy = heightAt(px, pz);
      let hx = a.v.x, hz = a.v.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      const ax = hx * 0.42, az = hz * 0.42, ay = -0.92;          // steep down, leaning the way it flew
      const k = Math.hypot(ax, ay, az) || 1;
      const nx2 = ax / k, ny2 = ay / k, nz2 = az / k;
      const oy = gy - 0.08 - 0.40 * ny2;                         // origin so tip lodges ~8cm, tail high
      a.m.position.set(px, oy, pz);
      a.m.lookAt(px + nx2, oy + ny2, pz + nz2);                  // tip points down into the ground
      // a FIRE arrow into the ground LIGHTS THE GRASS — start a spreading
      // ground fire at this cell. The burning shaft is then consumed quickly.
      if (a.fire) { igniteGround(px, pz); a.stuck = true; a.t = 1.5; }
      else { a.stuck = true; a.t = ARROW_STUCK_LIFE; }
      if (a.m.userData.streak) { a.m.remove(a.m.userData.streak); a.m.userData.streak = null; }
      if (audio.impact) audio.impact('ground', distVol);
    }
    a.t -= dt; if (a.t <= 0) { scene.remove(a.m); arrows.splice(i, 1); }
  }
  // ── fishing line ── a taut thread from the bow to whichever arrow is on a line
  let fa = null;
  for (const a of arrows) if (a.fishing) { fa = a; break; }
  if (fa) {
    if (!_fishLine) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      _fishLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xeae3cf, transparent: true, opacity: 0.5 }));
      _fishLine.frustumCulled = false; scene.add(_fishLine);
    }
    const pos = _fishLine.geometry.attributes.position.array;
    pos[0] = camera.position.x; pos[1] = camera.position.y - 0.35; pos[2] = camera.position.z;
    pos[3] = fa.m.position.x;   pos[4] = fa.m.position.y;          pos[5] = fa.m.position.z;
    _fishLine.geometry.attributes.position.needsUpdate = true;
    _fishLine.visible = true;
  } else if (_fishLine) _fishLine.visible = false;
}

// bow viewmodel — a real recurve: curved limbs, leather grip, a
// nocked arrow that appears as you draw, a string that pulls back
const bow = new THREE.Group();
const sheetHand = new THREE.Group();   // first-person gloved hand on the sail rope (sailing)
let bowString1, bowString2, nockedArrow, drawHand;
{
  // procedural wood grain — warm streaked figure painted to a canvas,
  // so the bow reads as real carved wood, not a flat brown tube.
  const woodTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 512;
    const x = c.getContext('2d');
    // a deep oiled-walnut base with a vertical patina gradient — darker, aged
    const base = x.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, '#4a2c14'); base.addColorStop(0.5, '#5e3a1d');
    base.addColorStop(1, '#412613');
    x.fillStyle = base; x.fillRect(0, 0, 64, 512);
    // long flowing grain lines — denser and higher-contrast = real figured wood
    for (let i = 0; i < 320; i++) {
      const gx = Math.random() * 64;
      const shade = 18 + Math.random() * 40;
      const dark = Math.random() < 0.55;
      x.strokeStyle = dark ? `rgba(28,16,7,${0.06 + Math.random() * 0.16})`
                           : `rgba(${150 + shade},${108 + shade * 0.7},${60 + shade * 0.5},${0.04 + Math.random() * 0.1})`;
      x.lineWidth = 0.5 + Math.random() * 1.6;
      x.beginPath();
      let gy = 0; x.moveTo(gx, 0);
      while (gy < 512) { gy += 16 + Math.random() * 24;
        x.lineTo(gx + Math.sin(gy * 0.03) * 3 + (Math.random() - 0.5) * 2, gy); }
      x.stroke();
    }
    // a couple of dark KNOTS — concentric oval rings where a branch once was
    for (let n = 0; n < 3; n++) {
      const kx = 8 + Math.random() * 48, ky = Math.random() * 512;
      for (let r = 7; r > 0; r--) {
        x.strokeStyle = `rgba(24,13,5,${0.05 + r * 0.02})`;
        x.lineWidth = 1; x.beginPath();
        x.ellipse(kx, ky, r * 1.6, r * 2.6, 0, 0, 6.28); x.stroke();
      }
    }
    // WEAR — pale scuffs/handling rub where the wood's oil has worn thin,
    // and a few dark nicks/dings. The bow has clearly been used for years.
    for (let i = 0; i < 26; i++) {
      const wx = Math.random() * 64, wy = Math.random() * 512;
      x.strokeStyle = `rgba(190,160,120,${0.05 + Math.random() * 0.1})`;
      x.lineWidth = 0.6 + Math.random() * 1.2; x.beginPath();
      x.moveTo(wx, wy); x.lineTo(wx + (Math.random() - 0.5) * 6, wy + (Math.random() - 0.5) * 14); x.stroke();
    }
    for (let i = 0; i < 14; i++) {
      x.fillStyle = `rgba(20,11,4,${0.18 + Math.random() * 0.22})`;
      x.beginPath(); x.arc(Math.random() * 64, Math.random() * 512, 0.5 + Math.random() * 1.4, 0, 6.28); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
    t.anisotropy = 4;
    return t;
  })();
  // worn wood: matte, no metal sheen, the grain itself carries the highlight.
  // The same canvas drives roughness so oiled grain reads glossier than the
  // worn/scuffed patches — light catches the figure as it would on real wood.
  const woodM = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x9c7a52,
    roughness: 0.74, metalness: 0.0, roughnessMap: woodTex });
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

  // ── the SHEET HAND ── shown only while sailing: the same black leather glove,
  // now hauling the rope (the sheet) that runs up to the sail. Pull left/right
  // and the hand drags the rope across — that's how you swing the sail. On the camera.
  // brighter worn-leather brown (was near-black 0x161412) so the hand reads against
  // the bright water instead of silhouetting; a touch of emissive lifts it in shade.
  const gloveM2 = new THREE.MeshStandardMaterial({ color: 0x5a4630, emissive: 0x1a130b, roughness: 0.7, metalness: 0.04 });
  const sleeveM2 = new THREE.MeshStandardMaterial({ color: 0x4a3c2a, emissive: 0x140f08, roughness: 0.95 });
  const ropeM2 = new THREE.MeshStandardMaterial({ color: 0xe3cf9c, emissive: 0x3a3018, roughness: 1 });
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.06), gloveM2); sheetHand.add(fist);
  for (let i = 0; i < 4; i++) {                       // curled fingers gripping the rope
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.052, 0.022), gloveM2);
    f.position.set(-0.026 + i * 0.017, 0.024, 0.03); f.rotation.x = -0.95; fist.add(f);
  }
  const thumb2 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.042, 0.018), gloveM2);
  thumb2.position.set(0.042, 0.004, 0.018); thumb2.rotation.z = 0.6; fist.add(thumb2);
  const sleeve2 = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.052, 0.36, 8), sleeveM2);
  sleeve2.rotation.x = Math.PI / 2; sleeve2.position.set(0.012, -0.02, 0.24); sheetHand.add(sleeve2);
  // the rope/sheet — runs from the fist UP and FORWARD toward the sail
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1.3, 5), ropeM2);
  rope.position.set(-0.02, 0.62, -0.28); rope.rotation.x = -0.42; sheetHand.add(rope);
  sheetHand.position.set(0.34, -0.34, -0.54);
  sheetHand.rotation.set(0.15, -0.25, 0);
  sheetHand.scale.setScalar(1.2);        // a touch bigger so it clearly reads as a gripping hand
  sheetHand.visible = false;
  camera.add(sheetHand);
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
  if (e.code === 'KeyF' && !intro) toggleAnchor();   // anchor down/up (fishing)
  if (e.code === 'Space' && !intro && !arrowCam) jumpQ = true;
  if (e.code === 'Escape' && drawing) {      // back out of the shot
    drawing = false; drawT = 0; holdT = 0; if (audio.drawCreak) audio.drawCreak(0); }
  });
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('keydown', skipIntro);
addEventListener('mousedown', skipIntro);
addEventListener('touchstart', skipIntro, { passive: true });

// accelerated look: a finger delta is scaled by base, then boosted by how
// FAST the flick is (|d|*gain). Slow = precise (≈base), fast = multiplied —
// so small aim adjustments stay fine but big swings whip the view around.
function accelLook(d, base, gain) {
  return d * base * (1 + Math.abs(d) * gain);
}
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
    if (e.movementX || e.movementY) _lookHoldT = 1.4;   // you're looking → pause boat-follow
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
        // ACCELERATED look: slow drags stay precise for aiming, fast flicks
        // turn WAY faster — the bigger the motion, the more it multiplies.
        const dx = t.clientX - lastLook.x, dy = t.clientY - lastLook.y;
        if (dx || dy) _lookHoldT = 1.4;                      // you're looking → pause boat-follow
        player.yaw -= accelLook(dx, 0.0040, 0.075);          // horizontal: snappy on big swipes
        player.pitch = Math.max(-1.5, Math.min(1.5,
          player.pitch - accelLook(dy, 0.0030, 0.055)));     // vertical: gentler base, still accelerates
        lastLook = { x: t.clientX, y: t.clientY };
      } else if (t.identifier === shootId) {
        // drag while holding the draw button = aim. Slightly slower
        // than free-look: you're at full draw, breathing.
        const dx = t.clientX - lastShoot.x, dy = t.clientY - lastShoot.y;
        player.yaw -= accelLook(dx, 0.0032, 0.05);
        player.pitch = Math.max(-1.5, Math.min(1.5,
          player.pitch - accelLook(dy, 0.0026, 0.04)));
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
  // (canoe is steered with the normal move stick now — no oar pads) ──
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
"I'm not the only one hungry out here.",
"Dusk. Everything's hungry now."
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
"heard": [
"What was that.",
"Something moved.",
"Didn't see it.",
"Heard that."
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
  // NO on-screen narration — everything is conveyed through audio + visuals now.
  // (kept as a no-op so every existing toast()/say() call site stays harmless)
  return;
}
function pick(arr) { return arr[Math.random() * arr.length | 0]; }
// tiny inline-SVG outline icons, one per harvestable species — drawn as the
// most-recent kill next to the meat count. currentColor inherits the #notes tint.
const SPECIES_ICON = {
  Deer:  '<path d="M5 14 Q5 9 8 9 Q11 9 11 14 M8 9 V5 M6 6 L4 3 M10 6 L12 3"/>',
  Stag:  '<path d="M5 14 Q5 9 8 9 Q11 9 11 14 M8 9 V4 M6 5 L3 2 M5 5 L4 2 M10 5 L13 2 M11 5 L12 2"/>',
  Fox:   '<path d="M3 13 L8 5 L13 13 Z M5 6 L3 3 M11 6 L13 3"/>',
  Cow:   '<path d="M4 13 Q4 7 8 7 Q12 7 12 13 M4 8 L2 5 M12 8 L14 5 M8 7 V4"/>',
  Horse: '<path d="M4 14 Q4 7 9 6 L12 3 L11 6 L13 7 M9 6 L8 9"/>',
  Wolf:  '<path d="M2 13 L5 6 L8 9 L11 6 L14 13 M8 9 V12"/>',
  Bear:  '<path d="M4 13 Q3 8 8 8 Q13 8 12 13 M5 7 A1.4 1.4 0 1 1 7 7 M9 7 A1.4 1.4 0 1 1 11 7"/>',
};
function speciesIcon(name) {
  const body = SPECIES_ICON[name] || SPECIES_ICON[name === 'Bull' ? 'Cow' : 'Deer'];
  return '<svg class="spc" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
    + 'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
}
let lastHarvest = null;   // name of the most-recent species you took
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
  // the most-recent species you took — outline icon + a running tally from score
  let spc = '';
  if (lastHarvest) {
    const n = score[lastHarvest === 'Bear' && score.Bull ? 'Bull' : lastHarvest] || 1;
    spc = '  <span class="spcwrap">' + speciesIcon(lastHarvest)
        + (n > 1 ? '<span class="spcn">×' + n + '</span>' : '') + '</span>';
  }
  document.getElementById('notes').innerHTML = ammo + carried + kept + spc;
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
  // THE OPENING IS MUSIC-ONLY. Title / dive / wake and the first ~6s after you
  // wake play nothing but the cinematic theme — no animal voices, no stings, no
  // foley, no spatial sfx (a wolf hunting right by spawn was firing snarls + a
  // kill sting that read as "is the game resetting?"). _cinematic gates the voice
  // methods; the bus mutes below catch EVERYTHING else routed through foley/spatial.
  audio._cinematic = !started || intro || launching || (_wakeT > 0 && t - _wakeT < 6);
  // animal VOICES (pant/howl/snarl from a wolf hunting near spawn) read as a
  // rhythmic "bouncing" sound and kept leaking the instant the 6s cinematic
  // window lapsed — but the perceived OPENING runs longer. Hold all animal
  // voices quiet for a generous window so the opening is music-only, while the
  // player's own foley returns at 6s. (animalCall checks _noVoices.)
  audio._noVoices = !started || intro || launching || (_wakeT > 0 && t - _wakeT < 16);
  if (audio.foleyBus) audio.foleyBus.gain.value = audio._cinematic ? 0 : 1.15;
  if (audio.spatialBus) audio.spatialBus.gain.value = audio._cinematic ? 0 : 1.0;
  if (_lookHoldT > 0) _lookHoldT -= dt;
  // ── CINEMATIC auto-look ── a big moment (a shark surfacing far off, a lunge)
  // grabs the camera and turns your head to face it, hard at first then settling
  // — Gears-of-War "look at THAT". Overrides everything; releases after _cineT.
  if (_cineT > 0 && started && !drawing) {
    _cineT -= dt;
    const dx = _cineX - player.x, dz = _cineZ - player.z, hd = Math.hypot(dx, dz) || 1;
    const wantYaw = Math.atan2(dx, dz) + Math.PI;            // camera-forward toward the target
    const wantPitch = Math.atan2((_cineY - (player.y + EYE)), hd);
    const e = Math.min(1, dt * 7 * _cineStrength);
    player.yaw += Math.atan2(Math.sin(wantYaw - player.yaw), Math.cos(wantYaw - player.yaw)) * e;
    player.pitch += (Math.max(-0.6, Math.min(0.4, wantPitch)) - player.pitch) * e;
    _lookHoldT = 0.6;                                        // brief settle before boat-follow resumes
  } else if (inCanoe && started && _lookHoldT <= 0 && !drawing) {
    // ── boat-follow camera ── while sailing, the view eases back to face the bow
    // (where you're heading) once you stop looking around — your head settles forward.
    const want = raftYaw + Math.PI;
    player.yaw += Math.atan2(Math.sin(want - player.yaw), Math.cos(want - player.yaw)) * Math.min(1, dt * 1.3);
    player.pitch += (-0.02 - player.pitch) * Math.min(1, dt * 0.8);
  }
  if (audio.pumpTitle) audio.pumpTitle(dt);   // keep the title theme alive (runs pre-game too)
  // ── the trip ── a mushroom turns the world strange: hue cycles, colors
  // swell, the picture breathes. Eases out over the last couple seconds.
  if (tripT > 0) {
    // the climb to the door is long — don't let the trip ebb out from under you
    // while you're high in the clouds. Near the ground / in the kitchen it runs
    // at normal speed, so the kitchen has a finite dwell and you wake back home.
    const _climbing = !_inKitchen && (player.y - heightAt(player.x, player.z)) > 30;
    tripT -= dt * (_climbing ? 0.25 : 1);
    _tripOnset += dt;
    const tail = Math.max(0, Math.min(1, tripT / 2));     // the fade-OUT at the very end
    // come-up envelopes: trees + the swaying view arrive FIRST (~3.5s), the
    // colour grade + liquid warp flood in AFTER and finish around ~10s.
    const teRaw = Math.min(1, _tripOnset / 3.5);
    const ceRaw = Math.max(0, Math.min(1, (_tripOnset - 1.5) / 8.5));
    const treeEnv = teRaw * teRaw * (3 - 2 * teRaw);       // smoothstep
    const colEnv = ceRaw * ceRaw * (3 - 2 * ceRaw);
    const ks = Math.min(tail, treeEnv);          // SWAY/lean intensity (early)
    const kc = Math.min(tail, colEnv);           // COLOUR/warp intensity (later)
    _tripTreeEnv = treeEnv; _tripKsway = ks;     // hand to the uTrip + camera blocks
    const k = kc;                                // colour grade rides the slow come-up
    // depth eases toward tripLevel so EACH extra mushroom fades its new
    // intensity in (no pop). lv now climbs to 10 → subtle at 1, unhinged at 10.
    _tripLvlVis += (tripLevel - _tripLvlVis) * Math.min(1, dt * 0.7);
    const lv = Math.max(1, _tripLvlVis);        // depth scales the whole look
    // how high you've climbed — the cloud/kitchen ascent washes the world from
    // trippy → OVEREXPOSED → HEAVENLY as you rise.
    const alt = Math.max(0, player.y - heightAt(player.x, player.z));
    const heaven = Math.min(1, Math.max(0, (alt - 28) / 95));
    // a SLOW, dreamy hue drift — not a strobing disco. Underwater, not a rave.
    // SUBTLE & SLOW — the trip should ooze in, never flash. The come-up
    // envelopes (k=colour, ks=sway) already ease from 0; these peaks are now
    // gentle so even at full it's a soft shift, not a neon disco.
    // the kitchen is a REAL modern place — barely any hue drift so its colours
    // read true (a faint dreamy shimmer only); the valley keeps the full drift.
    // COLOUR DEPTH — the FIRST cap barely tints the world (movement/sway come in,
    // colour stays a whisper); it's the SECOND that floods it. ~0.12 at level 1,
    // ~1.12 at level 2, up from there. Movement (ks/sway, below) is NOT gated by
    // this — motion always arrives first, colour trails well behind.
    const cD = Math.max(0, _tripLvlVis - 1) + 0.12;
    const hueAmt = Math.min(1, cD);             // L1 hardly rotates the hue at all
    const hue = ((t * (7 + lv * 3) + 28 * Math.sin(t * 0.4)) * hueAmt * (_inKitchen ? 0.05 : 1)) % 360;
    const sat = 1 + (0.5 * cD) * k * (1 - heaven * 0.75);    // ~1.06 @ L1, ~1.5 @ L2
    const con = 1 + (0.08 * cD) * k * (1 - heaven * 0.6);
    const bri = 1 + (0.03 + 0.015 * lv) * k + (_inKitchen ? 0.04 : heaven * 0.38) + 0.02 * Math.sin(t * 1.0) * k;
    const blur = IS_TOUCH ? 0 : (0.12 + 0.22 * Math.sin(t * 0.5)) * k * hueAmt;
    // surreal liquid WARP (desktop): a gentle breathing displacement, not a melt
    let warp = '';
    if (_warpDisp) {
      _warpDisp.setAttribute('scale', (IS_TOUCH || _inKitchen ? 0 : (4 + lv * 4) * k * cD * (1 - heaven * 0.7)).toFixed(1));
      if (!IS_TOUCH) warp = 'url(#warp) ';
    }
    canvas.style.filter = warp + 'hue-rotate(' + hue.toFixed(0) + 'deg) saturate(' + sat.toFixed(2)
      + ') contrast(' + con.toFixed(2) + ') brightness(' + bri.toFixed(2)
      + ') blur(' + blur.toFixed(2) + 'px)';
    // a slow oceanic swell + drift + a faint SKEW — the "am I losing it?" lean,
    // riding ks (the early envelope) so it shifts in with the trees first.
    const sc = 1 + (0.012 + 0.006 * lv) * Math.sin(t * 0.8) * ks;
    const rot = (0.16 + 0.08 * lv) * Math.sin(t * 0.3) * ks;
    const skx = (0.6 + lv * 0.35) * Math.sin(t * 0.6) * ks;      // gentle lean
    const sky = (0.6 + lv * 0.35) * Math.cos(t * 0.42) * ks;
    canvas.style.transformOrigin = 'center';
    canvas.style.transform = 'scale(' + sc.toFixed(3) + ') rotate(' + rot.toFixed(2)
      + 'deg) skewX(' + skx.toFixed(2) + 'deg) skewY(' + sky.toFixed(2) + 'deg)';
    if (_kitchenFlashT > 0) _kitchenFlashT = Math.max(0, _kitchenFlashT - dt * 0.5);   // door threshold flash fades
    if (_heaven) _heaven.style.opacity = Math.max(_inKitchen ? 0 : heaven * 0.42, _kitchenFlashT).toFixed(3);
    if (tripT <= 0) { tripLevel = 0; clearClouds(); }   // sober up (drops you home if in the kitchen)
    _tripKsway = ks; _tripTreeEnv = treeEnv;
  } else if (canvas.style.filter) {
    canvas.style.filter = ''; canvas.style.transform = '';
    tripLevel = 0; clearClouds();
    _tripKsway = 0; _tripTreeEnv = 0; _tripLvlVis = 0; _kitchenFlashT = 0;
    if (_heaven) _heaven.style.opacity = '0';
    if (audio.tripMusic) audio.tripMusic(false);
  }
  // (the title now auto-reveals and waits for a tap to dive — no auto-launch)
  // kill-feel: juice timers decay on REAL time (hitstop scales the
  // world dt further down, where animals/arrows update)
  if (kickT > 0) kickT -= dt;
  if (camShakeT > 0) camShakeT -= dt;
  if (fovPunchT > 0) fovPunchT -= dt;
  // ── the escape stinger ── after a predator wounds you, once you've broken
  // contact (no charging/attacking predator within 26m for ~4s), the theme
  // breathes a relief sting. Cleared if you die.
  if (_escapeArmed && !dead && clock.elapsedTime - _escapeArmed > 4) {
    let danger = false;
    for (const a of animals) {
      if (a.dead || !(a.cfg.bearish || a.cfg.hunts || a.cfg.territorial)) continue;
      if (!(a.aggro || a.state === 'charge' || a.state === 'attack')) continue;
      if (Math.hypot(a.obj.position.x - player.x, a.obj.position.z - player.z) < 26) { danger = true; break; }
    }
    if (!danger) { if (audio.themeSting) audio.themeSting('sting_escape', 0.85); _escapeArmed = 0; }
    else _escapeArmed = clock.elapsedTime - 3.5;   // still hunted — re-check shortly
  }
  puffUpdate(dt);                  // blood puff plays through the hitstop
  windUniforms.uTime.value = t;
  waterUniforms.uTime.value = t;
  waterUniforms.uWindDir.value = windDir;       // share the ONE wave field with waveAt (boat rides what you see)
  waterUniforms.uBoatWake.value = _boatWake;
  // ── wind drift ── the breeze wanders slowly in direction and strength, so a
  // good point of sail isn't a fixed setting — you read it and re-trim. Cheap:
  // two slow sines, no allocation, bounded.
  windDir += Math.sin(t * 0.013) * 0.04 * dt;
  // wind has LAYERS: a slow base, a faster gust ripple, and occasional strong
  // puffs that surge you. The pennant + sail react so you can read it coming.
  const windBase = 0.5 + 0.28 * (0.5 + 0.5 * Math.sin(t * 0.021 + 1.7));
  _gust = 0.5 + 0.5 * Math.sin(t * 0.5 + Math.sin(t * 0.17) * 3.0);     // ripples every few seconds
  const puff = Math.max(0, Math.sin(t * 0.11) - 0.55) * 1.2;            // a rare strong gust
  windStr = Math.min(1, windBase + _gust * 0.2 + puff);
  // the trees only move on the trip — strongest on that first wide-eyed L1,
  // eased in/out so it swells on rather than popping. (uTrip=0 → rigid.)
  // trees come alive FIRST on the come-up (rides _tripTreeEnv, the early envelope)
  const _warpTarget = tripT > 0 ? (0.9 + 0.09 * Math.max(0, _tripLvlVis - 1)) * _tripTreeEnv : 0;
  tripUniforms.uTrip.value += (_warpTarget - tripUniforms.uTrip.value) * Math.min(1, dt * 1.1);
  skyUniforms.uT.value = t;
  for (const c of clouds) { c.position.x += c.userData.v * dt * 2; if (c.position.x > 1500) c.position.x = -1500; }

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
  // night: a moody floor you can just make out shapes by — the lantern does
  // the real lighting. Bright pool close, darkness (and whatever's in it) beyond.
  hemi.intensity = (0.52 - night * 0.08) * (1 - dawn * 0.18);
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.88 - night * 0.32;
  renderer.toneMappingExposure = 1.14 + night * 0.28;
  // ── passing cloud shadows ── a slow drift of unseen cloud over the sun, so
  // the golden-hour light BREATHES: the valley dims as a cloud crosses, then
  // warms back. Two slow sines, squared so it's clear most of the time with the
  // occasional swell. Day only, and off during the trip (which owns the grade).
  {
    const cc = Math.max(0, Math.sin(t * 0.06) * 0.6 + Math.sin(t * 0.025 + 1.3) * 0.4);
    const cover = cc * cc * (1 - night) * (tripT > 0 ? 0 : 1) * (1 - _rainLevel) * 0.55;
    _cloudCover = cover;
    sun.intensity *= 1 - cover * 0.72;
    hemi.intensity *= 1 - cover * 0.28;
    if ('environmentIntensity' in scene) scene.environmentIntensity *= 1 - cover * 0.3;
    renderer.toneMappingExposure += cover * 0.05;   // lift a touch so shadows don't crush to mud
  }
  // ── kitchen world: override the valley's golden-hour rig with neutral indoor
  // daylight so it reads as a real modern place, not a gold-soaked field. Done
  // here (the lighting runs every frame) so it survives the day/night writes;
  // valley lighting resumes automatically the moment you leave (_inKitchen=0).
  if (_inKitchen) {
    sun.intensity = 0.45;                            // tame the golden key
    hemi.intensity = 0.18;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.35;
    _kitchenFill.intensity = 1.3;                    // cool neutral daylight
    _kitchenKey.intensity = 1.5;                     // a crisp window key for shape
    renderer.toneMappingExposure = 1.05;
  } else if (_kitchenFill.intensity) {
    _kitchenFill.intensity = 0; _kitchenKey.intensity = 0;
  }
  // your carried lantern — a STRONG warm pool (~20-70ft) with a live flicker;
  // beyond it, the dark. Faint by day, the hero light after dark.
  const flick = 1 + Math.sin(t * 13) * 0.05 + Math.sin(t * 27) * 0.03;
  playerLight.intensity = (1.0 + night * 9.5) * flick;
  playerLight.distance = 24;
  playerLight.position.set(player.x, player.y + 1.6, player.z);
  if (lanternHeld) lanternHeld.children[0].material.emissiveIntensity = (1.6 + night * 4) * flick;
  scene.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, night);
  if (dawn > 0) scene.fog.color.lerp(FOG_DAWN, dawn * 0.65);
  scene.background.copy(scene.fog.color);
  // fog closes in after dark — dusk stays open, true night clamps the world to ~60m
  const fogClose = night * Math.sqrt(night);
  scene.fog.near = 60 - 26 * fogClose;
  scene.fog.far = 340 - 170 * fogClose;
  // ── open sea: hold the foreground clear ── the warm desert fog hazed the sea
  // to pale orange-tan from just 60m out, washing the water flat. While aboard by
  // day, push the NEAR plane out so the near sea reads crisp and deep (sun road +
  // sky reflection land); FAR stays put so the water's edge keeps hiding in haze.
  if (inCanoe && started && !intro) {
    const open = 1 - night;
    scene.fog.near = Math.max(scene.fog.near, 60 + 75 * open);
  }
  weatherUpdate(t, dt, night);   // a passing shower greys the light + closes the fog (after the day/night grade)
  // moon rides opposite the sun — only shows once it clears the horizon
  _moonDir.copy(_sunDir).multiplyScalar(-1);
  moon.position.set(player.x + _moonDir.x * 820, _moonDir.y * 820, player.z + _moonDir.z * 820);
  moon.material.opacity = night * Math.max(0, Math.min(1, (_moonDir.y - 0.06) * 6)) * 0.9;
  updateFireflies(t, night);
  updateButterflies(dt, t);
  if (started) { updatePollen(t, dt, night); updateBirds(t, dt, night); updateDarters(dt, night); carrionUpdate(t, dt, night);
    if (!_inKitchen) updateCritters(dt, t); }
  silhouettesUpdate(t, dt, night);   // distant ridge wildlife — also alive during the title orbit
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
  if (started) wispUpdate(t, dt, night);
  if (window._cloudMat) {
    window._cloudMat.color.setHex(0xf0dcc2).lerp(_CLOUD_NIGHT, night);
    window._cloudMat.opacity = 0.88 - night * 0.55;
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
    // ── hunger reads as exhaustion ── not blinking (that was awful), but a
    // soft darkness that breathes in at the edges of vision the longer it's
    // been since you ate. Tunnel-vision creep; clears the moment you eat.
    const sleepy = Math.max(0, Math.min(1, (t - player.lastAte - 55) / 80));
    if (_exhaust) {
      const breatheE = 0.5 + 0.5 * Math.sin(t * 1.1);          // slow, living pulse
      const target = tripT > 0 ? 0 : sleepy * (0.55 + 0.45 * breatheE);
      _exhaustV += (target - _exhaustV) * Math.min(1, dt * 1.5);  // ease, never snap
      _exhaust.style.opacity = _exhaustV.toFixed(3);
    }
    if (night > 0.6 && !M._saidNight) { M._saidNight = true; M._saidDawn = false; say('nightFall', 4200); }
    if (night < 0.15 && M._saidNight && !M._saidDawn) { M._saidDawn = true; M._saidNight = false; say('dawn', 4200); }
    M._idleT = (M._idleT ?? 75) - dt;
    if (M._idleT <= 0) { M._idleT = 100 + Math.random() * 80; if (Math.random() < 0.5) say('idle', 4600); }
    // being stalked — first time the danger drone would be rising
    let wd = 1e9;
    for (const an2 of animals) if (an2.cfg.hunts && !an2.dead && an2.aggro)
      wd = Math.min(wd, Math.hypot(an2.obj.position.x - player.x, an2.obj.position.z - player.z));
    if (wd < 30 && (M._wolfSaidT ?? 0) < t - 45) { M._wolfSaidT = t; say('wolfNear', 3600); }
    // heard, not seen — a bear moving close (stalk/wary) that's NOT in your
    // view cone makes you mutter. Tension from the unseen.
    for (const an2 of animals) {
      if (!an2.cfg.bearish || an2.dead) continue;
      if (an2.state !== 'stalk' && an2.state !== 'wary') continue;
      const bx = an2.obj.position.x - player.x, bz = an2.obj.position.z - player.z;
      const bd = Math.hypot(bx, bz);
      if (bd > 28 || bd < 6) continue;
      const inView = (Math.sin(player.yaw) * bx + Math.cos(player.yaw) * bz) / (bd || 1) < -0.35;
      if (!inView && (M._heardT ?? 0) < t - 18) { M._heardT = t; say('heard', 3200); break; }
    }
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
    // footstep material under your feet, by BIOME (raw elevation lies — the
    // whole valley sits high): the alpine massif is rock, the wetland/water's
    // edge is soft sand-mud, everything else is grass. Re-set only on change.
    const reg = regionAt(player.x, player.z);
    const grd = reg === REGION.ALPINE ? 'rock'
              : (reg === REGION.WETLAND || player.y < WATER_Y + 1.4) ? 'sand'
              : 'grass';
    if (grd !== _curGround) { _curGround = grd; if (audio.setGround) audio.setGround(grd); }
    // 0..1 gait level for audio footsteps + head-bob: stalk is quiet/slow.
    _moveLvl = stickMag <= 0.02 ? 0
      : (sprinting ? 1 : 0.4 + stickMag * 0.4);
    if (!grounded) _moveLvl = 0;   // no footsteps / head-bob while airborne
    // sprinting kicks up dust behind your boots (not on bare rock)
    if (grounded && sprinting && _moveLvl > 0.5 && grd !== 'rock' && !inCanoe) {
      _dustStepT -= dt;
      if (_dustStepT <= 0) {
        _dustStepT = 0.27;
        const bx = player.x - Math.sin(player.yaw) * 0.5, bz = player.z - Math.cos(player.yaw) * 0.5;
        dustPuff(bx, heightAt(bx, bz), bz, dustTintFor(grd), 0.7);
      }
    } else _dustStepT = 0;
    if (stickMag > 0.05 && !bflyUsed) releaseButterflies();   // first steps stir them up
    const sprint = sprinting ? 1.65 : 1;
    const sp = 5.4 * sprint * (drawing ? 0.5 : 1) * (IS_TOUCH ? Math.max(stickMag, 0.25) : 1);
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    let nx = player.x + (-sin * mz + cos * mx) * sp * dt;
    let nz = player.z + (-cos * mz - sin * mx) * sp * dt;
    if (inCanoe && _raftLaunch > 0) {
      // ── LAUNCH GLIDE ── a guaranteed clean push straight off the bank (~10
      // yards). The wind is OFF and you can't beach — you slide out into open
      // water first, THEN you sail. The bow eases toward your gaze as you go.
      _raftLaunch -= dt;
      const lookYaw = player.yaw + Math.PI;
      raftYaw += Math.atan2(Math.sin(lookYaw - raftYaw), Math.cos(lookYaw - raftYaw)) * Math.min(1, dt * 0.7);
      const lspd = 7.0;
      canoeVX = Math.sin(raftYaw) * lspd; canoeVZ = Math.cos(raftYaw) * lspd;
      const cx = player.x + canoeVX * dt, cz = player.z + canoeVZ * dt;
      player.x = cx; player.z = cz; player.y = WATER_Y; grounded = true; player.airY = WATER_Y;
      if (audio.setSail) audio.setSail(0.55, windStr);
      _raftCreakT -= dt;
      if (_raftCreakT <= 0) { _raftCreakT = 2.4 + Math.random() * 3.5; if (audio.raftCreak) audio.raftCreak(); }
      if (canoe._sailPivot) canoe._sailPivot.rotation.y += (0.6 - canoe._sailPivot.rotation.y) * Math.min(1, dt * 3);
      _moveLvl = 0.55;
    } else if (inCanoe && anchored) {
      // ── ANCHORED ── the boat holds still; you're fishing. No wind drive.
      canoeVX *= Math.pow(0.2, dt); canoeVZ *= Math.pow(0.2, dt);   // settle to a stop
      player.y = WATER_Y; grounded = true; player.airY = WATER_Y;
      player.x += canoeVX * dt; player.z += canoeVZ * dt;
      _boatWake += (0 - _boatWake) * Math.min(1, dt * 2);
      _moveLvl = 0;
    } else if (inCanoe) {
      // ── SAILING the raft ── YOU work the wind. LEFT/RIGHT (mx) is the SHEET:
      // pull the rope to swing the sail. The wind is the only engine — sheet the
      // sail to CATCH it and you drive; sheet it wrong and it luffs (dead). You
      // TWO SEPARATE MECHANICS: looking around is FREE (it never moves the boat);
      // you sail entirely with the SHEET (left/right = swing the sail). The sail's
      // balance steers you: trim it PERFECTLY and you hold a straight, fast line;
      // over- or under-sheet a touch and the bow carves that way. You can't point
      // dead into the wind — fall off, find the wind, trim, go.
      const RAFT_ACCEL = 9.0, RAFT_MAXV = 11;
      // THE SAIL SLIDER — you set a TARGET position (the on-screen slider, or A/D
      // nudges it); the sail then EASES toward it with a slight lag, so it feels
      // like a heavy boom swinging, not a twitchy stick. Full range = 180° swing.
      _sailTarget = Math.max(-1, Math.min(1, _sailTarget + mx * 1.1 * dt));   // A/D nudge the target
      _sailTrim += (_sailTarget - _sailTrim) * Math.min(1, dt * 2.6);          // the lag
      const boom = _sailTrim * 1.57;                      // boom swings a full ±90° (180° total)
      // apparent wind relative to the bow (windDir = where the wind blows TO)
      const windRel = Math.atan2(Math.sin(windDir - raftYaw), Math.cos(windDir - raftYaw));
      const ar = Math.abs(windRel);
      // point of sail — you CANNOT point dead into the wind (ar≈π = the no-go zone)
      const pos = ar > Math.PI * 0.80 ? Math.max(0, (Math.PI - ar) / (Math.PI * 0.20)) * 0.55
                : ar < Math.PI * 0.25 ? 0.6 + (ar / (Math.PI * 0.25)) * 0.4         // running: a touch slower
                : 1.0;                                                              // reach = fastest
      // TRIM SKILL — the sail must be sheeted to the wind or it luffs (no drive).
      // ideal boom: hauled in close-hauled, eased right out downwind, to the lee.
      const idealBoom = -Math.sign(windRel || 1) * (ar / Math.PI) * 1.15;
      const trimSigned = Math.atan2(Math.sin(boom - idealBoom), Math.cos(boom - idealBoom)); // signed trim error
      const trimErr = Math.abs(trimSigned);
      const catchW = Math.max(0, Math.cos(trimErr * 1.25));    // 1 = perfectly trimmed, 0 = luffing
      _luffing = pos > 0.05 && catchW < 0.4;                   // flapping — spilling the wind
      // STEER with the sail's balance — perfect trim holds course, a little off
      // turns you. Looking around no longer touches the helm.
      raftYaw += trimSigned * 1.0 * windStr * pos * dt;
      const drive = RAFT_ACCEL * windStr * pos * catchW;
      canoeVX += Math.sin(raftYaw) * drive * dt;
      canoeVZ += Math.cos(raftYaw) * drive * dt;
      const drag = Math.pow(0.6, dt);                    // long glide / drift
      canoeVX *= drag; canoeVZ *= drag;
      const cspd = Math.hypot(canoeVX, canoeVZ);
      if (cspd > RAFT_MAXV) { canoeVX *= RAFT_MAXV / cspd; canoeVZ *= RAFT_MAXV / cspd; }
      const speed01 = Math.min(1, cspd / RAFT_MAXV);
      _boatWake += (speed01 - _boatWake) * Math.min(1, dt * 1.5);   // wake/waves build with speed
      // BOW WAKE — foam spray peels off the bow in a V, more the faster you go,
      // so the sea reads as alive when you're underway. Reuses the dust particles.
      _wakeFoamT -= dt;
      if (speed01 > 0.22 && _wakeFoamT <= 0) {
        _wakeFoamT = 0.13 - speed01 * 0.08;                 // faster → denser spray
        const bx = player.x + Math.sin(raftYaw) * 7.5, bz = player.z + Math.cos(raftYaw) * 7.5;
        const sxv = Math.cos(raftYaw), szv = -Math.sin(raftYaw);   // beam vector
        const spread = 1.1 + speed01 * 1.6;
        for (const s of [-1, 1]) {
          dustPuff(bx + sxv * s * spread, WATER_Y + 0.12, bz + szv * s * spread, 0xeaf2f4, 0.45 + speed01 * 0.7);
        }
      }
      // the sail ANSWERS THE ROPE + TELEGRAPHS the wind: when it's LUFFING it
      // flogs — shakes side to side and goes FLAT (loses its belly); when it's
      // DRAWING it sits taut and bellies out FULL. So you can read catch at a glance.
      if (canoe._sailPivot) {
        const luffShiver = _luffing ? Math.sin(t * 26) * 0.13 : 0;
        canoe._sailPivot.rotation.y += (boom + luffShiver - canoe._sailPivot.rotation.y) * Math.min(1, dt * 7);
        canoe._sailPivot.rotation.z = _luffing ? Math.sin(t * 19) * 0.11 : canoe._sailPivot.rotation.z * 0.9;
        if (canoe._sail) {
          const fill = _luffing ? 0.18 : 0.7 + catchW * 0.55;   // flat & flapping vs full & taut
          canoe._sail.scale.z += (fill - canoe._sail.scale.z) * Math.min(1, dt * 6);
        }
      }
      // continuous sail/wind hiss + the occasional timber creak. A LUFFING sail
      // rushes/flaps audibly even at low speed, so you hear you've spilled the wind.
      if (audio.setSail) audio.setSail(_luffing ? Math.max(speed01, 0.5) : speed01, windStr);
      _raftCreakT -= dt;
      if (_raftCreakT <= 0) { _raftCreakT = 2.4 + Math.random() * 3.5; if (audio.raftCreak) audio.raftCreak(); }
      const lim2 = WORLD * 0.47;
      let cx = Math.max(-lim2, Math.min(lim2, player.x + canoeVX * dt));
      let cz = Math.max(-lim2, Math.min(lim2, player.z + canoeVZ * dt));
      const wy = heightAt(cx, cz);
      if (wy > WATER_Y - 0.12) {            // nosed into the shallows → step out onto land
        inCanoe = false; canoeVX = 0; canoeVZ = 0; _raftLaunch = 0; _boatWake = 0; anchored = false;
        _raftAirborne = false; _raftAirVy = 0;
        if (audio.setSail) audio.setSail(0, windStr);    // cut the sail hiss ashore
        player.x = cx; player.z = cz; player.y = wy; grounded = true; player.airY = wy;
      } else {
        player.x = cx; player.z = cz; player.y = WATER_Y; grounded = true; player.airY = WATER_Y;
      }
      _moveLvl = speed01;
    } else {
    // tree collision — pushes you out at trunk level. BUT if you're up at
    // canopy height (a mushroom trip), you're ON the tree, not walking into
    // it, so it doesn't shove you — you can stand and hop tree to tree.
    for (const tr of TREES) {
      if (_inKitchen) break;                                            // kitchen world: no valley collision
      if (tr.top !== undefined && player.y >= tr.top - 1.3) continue;   // on the canopy
      // canopy trees (have .inst) store the wide cover/LOS radius (~2x the
      // trunk) → collide at the actual TRUNK (tr.r*0.45 + body). Rocks, snags and
      // blighted trees store their REAL collision radius already → use it as-is,
      // or you walk straight through the stone/wood (the b86 over-shrink bug).
      const rad = tr.inst ? (tr.r * 0.45 + 0.4) : (tr.r + 0.35);
      const d = Math.hypot(nx - tr.x, nz - tr.z);
      if (d < rad) {
        // HARD wall — snap to the edge, don't soft-nudge (a soft push lets you
        // creep through by just holding forward). Clamps you out for good.
        const inv = d || 1;
        nx = tr.x + (nx - tr.x) / inv * rad; nz = tr.z + (nz - tr.z) / inv * rad;
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
      if (_inKitchen) break;                                            // kitchen world: no valley props
      const d = Math.hypot(nx - sp2.x, nz - sp2.z);
      if (d >= sp2.r + 0.5) continue;
      if (sp2.top <= feetY + STEP_REACH) {
        if (sp2.top > stepGround) stepGround = sp2.top;   // clamber on
      } else {
        // too tall — HARD block: snap to the edge so holding forward can't
        // shove you through the log/stone.
        const inv = d || 1, R = sp2.r + 0.5;
        nx = sp2.x + (nx - sp2.x) / inv * R; nz = sp2.z + (nz - sp2.z) / inv * R;
      }
    }
    // ── mushroom trip: tree CANOPIES become landable surfaces. Jump up and
    // you can perch on a treetop, then bound tree to tree (and onto the
    // mountains). Only while tripping; off-trip you can't reach them anyway.
    if (tripT > 0 && !_inKitchen) {
      const TRIP_REACH = 2.8;
      for (const tr of TREES) {
        if (tr.top === undefined) continue;
        if (Math.abs(nx - tr.x) > tr.r + 1.8 || Math.abs(nz - tr.z) > tr.r + 1.8) continue;
        if (Math.hypot(nx - tr.x, nz - tr.z) >= tr.r + 1.8) continue;   // wide canopy pad
        if (tr.top <= feetY + TRIP_REACH && tr.top > stepGround) stepGround = tr.top;
      }
      // L2+: the clouds are solid — but you must AIM your jumps and actually
      // land ON one. Tighter pad + short reach so jumping in place won't catch
      // the next layer — you have to look, pick a cloud, and leap to it.
      if (tripLevel >= 2) {
        for (const cs of CLOUDSTEPS) {
          if (Math.hypot(nx - cs.x, nz - cs.z) >= cs.r * 0.6) continue;   // land squarely on it
          if (cs.y <= feetY + 1.6 && cs.y > stepGround) stepGround = cs.y; // only as you come DOWN onto it
        }
      }
    }
    const lim = _inKitchen ? 80 : WORLD * 0.47;           // stay on the counter in the kitchen
    nx = Math.max(-lim, Math.min(lim, nx)); nz = Math.max(-lim, Math.min(lim, nz));
    const ny = _inKitchen ? KFLOOR : heightAt(nx, nz);
    // ── kitchen: the giant objects are landable surfaces (clamber a mug/cookie)
    if (_inKitchen) {
      for (const it of _kitchenItems) {
        if (Math.hypot(nx - it.x, nz - it.z) >= it.r) continue;
        if (it.top <= feetY + 1.6 && it.top > stepGround) stepGround = it.top;
      }
    }
    // ── jump / fall: light, forgiving hop (Apple-simple) ──
    let groundY = _inKitchen ? KFLOOR : ((ny > WATER_Y - 0.4) ? ny : player.y);
    if (stepGround > groundY) groundY = stepGround;       // standing on a prop / kitchen object
    // ── breathing ground ── while tripping the earth itself swells and
    // sinks, and your footing rides it: the ground you stand on physically
    // moves, so the same jump lands differently depending on the breath.
    if (tripT > 0 && stepGround === -Infinity && !_inKitchen) {
      groundY += Math.sin(t * 1.25 + player.x * 0.14 + player.z * 0.12) * (0.22 * tripLevel);
    }
    if (ny > WATER_Y - 0.4) { player.x = nx; player.z = nz; }
    // walking off a ledge (stepped down >0.35m) starts a real fall through
    // the existing jump integrator instead of snapping the camera down.
    if (grounded && groundY < player.y - 0.35) {
      grounded = false; playerVy = 0; player.airY = player.y;
    }
    // sober hop ~2.2m. L1 = a DRUNK floaty hop (no clouds yet). L2 = cloud
    // PLATFORMING — modest aimed hops, ~1-2 clouds up, you must land on them.
    // L3 = ethereal, bigger leaps. (apex L1~5.8m · L2~10m · L3~22m)
    const TRIP_VY = [9, 11, 14], TRIP_G = [7, 6, 4.5];
    const _ji = Math.min(2, tripLevel - 1);   // levels 4-10 reuse the L3 (max float) jump
    if (jumpQ && grounded) {
      playerVy = tripLevel > 0 ? TRIP_VY[_ji] : 7.7; grounded = false;
      if (audio.grunt && Math.random() < 0.5) audio.grunt(0.42);   // an effort grunt on the push-off
    }
    jumpQ = false;
    if (!grounded) {
      const g = tripLevel > 0 ? TRIP_G[_ji] : 13;
      playerVy -= g * dt; player.airY = (player.airY ?? groundY) + playerVy * dt;
      if (player.airY <= groundY) {
        const impact = -playerVy;                 // how hard you came down
        player.airY = groundY; playerVy = 0; grounded = true;
        if (impact > 2.6) {                       // a real landing, not a tiny step-down
          _landDip = Math.min(0.13, impact * 0.014);   // the camera settles into your knees
          // a soft earthen landing only — NO woody 'rock' clack (read as metallic),
          // NO landing grunt. Keep it natural and quiet.
          if (audio.impact) audio.impact('ground', 0.3);
          if (IS_TOUCH && navigator.vibrate && impact > 5.5) navigator.vibrate(14);
          // a burst of dust at your boots — bigger the harder you hit
          if (_curGround !== 'rock') {
            const n = 3 + Math.min(5, impact * 0.5 | 0), tint = dustTintFor(_curGround);
            for (let i = 0; i < n; i++) dustPuff(player.x, groundY, player.z, tint, 1.1);
          }
        }
      }
      player.y = player.airY;
    } else { player.y = groundY; player.airY = groundY; }
    // stepped off the bank into deep water → board the canoe (carry your
    // walking momentum in as the boat's starting drift). ONLY when you're
    // actually down at the water — never while jumping/flying high above it.
    if (ny <= WATER_Y - 0.4 && stickMag > 0.02 && grounded && player.y < WATER_Y + 2.5) {
      inCanoe = true;
      if (audio.themeSting) audio.themeSting('sting_boat', 0.85);   // setting off — adventure lift
      // The raft's thrust/bow use (+sin,+cos) for "forward", but the player's
      // walk-forward is (-sin,-cos). So the bow must point at player.yaw + PI to
      // head the way you walked in — otherwise the sail shoves you back ashore.
      raftYaw = player.yaw + Math.PI;
      _sailTrim = 0; _sailTarget = 0; _boatWake = 0;
      // arm a clean LAUNCH GLIDE: ~10 yards straight off the bank, wind disabled,
      // no auto-disembark — you clear the shallows, then the sail takes over.
      _raftLaunch = 1.3;
      canoeVX = Math.sin(raftYaw) * 7.0; canoeVZ = Math.cos(raftYaw) * 7.0;
      player.x = nx; player.z = nz; player.y = WATER_Y;
    }
    }  // end !inCanoe walk branch

    // ── the summit ── reach the glowing door on the top platform and step
    // through: the world floods white and you drop into the kitchen.
    if (_doorPlat && !_inKitchen && tripT > 0 &&
        Math.abs(player.y - _doorPlat.y) < 4.0 &&
        Math.hypot(player.x - _doorPlat.x, player.z - _doorPlat.z) < 2.4) {
      enterKitchen();
    }

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
    // sailing pulls the view WIDER (eased) so you can read the wind and steer —
    // it makes the raft feel like its own little sailing game, not a walk on water.
    _sailFovT += ((inCanoe ? 1 : 0) - _sailFovT) * Math.min(1, dt * 2.5);
    let targetFov = 70 - e * 4.5 + _sailFovT * 14;   // gentle sighting focus + sail zoom-out
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
      if (!tickBody._hungerWarned || t - tickBody._hungerWarned > 22) {
        tickBody._hungerWarned = t;
        // no text — hunger now reads as a tired, hollow breath (+ the exhaustion vignette)
        if (audio.breath) audio.breath(0.5);
      }
      if (player.hp <= 0 && !dead) { dead = true;
        resetDrawState();
        beginDeath();
        setTimeout(() => { player.hp = 100; player.meat = 0;
          player.lastAte = clock.elapsedTime; player.x = SPAWN.x; player.z = SPAWN.z;
          player.yaw = SPAWN.yaw; player.pitch = SPAWN.pitch;
          player.y = heightAt(player.x, player.z);
          dead = false; renderHP(); respawnArrival(); }, 3500);
      }
    }
    // packed meat saves you automatically when it gets bad
    if (player.hp < 35 && player.meat > 0 && !dead) {
      player.meat--; player.hp = Math.min(100, player.hp + 40);
      player.lastAte = t; renderNotes(); renderHP();
      toast('Ate from the pack.');
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
    forageUpdate(t);

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
    // fire roar level: grows with how many trees are ablaze, scaled by how near
    // the nearest one is. Floors at a low murmur when far (a distant roar), and
    // it caps so a whole forest fire never gets obnoxious.
    let fireLvl = 0;
    const _nFire = TREEFIRES.length + GROUNDFIRES.length;
    if (_nFire) {
      let nd = 1e9;
      for (const f of TREEFIRES) { const d = Math.hypot(player.x - f.tr.x, player.z - f.tr.z); if (d < nd) nd = d; }
      for (const f of GROUNDFIRES) { const d = Math.hypot(player.x - f.x, player.z - f.z); if (d < nd) nd = d; }
      const prox = Math.max(0.25, Math.min(1, 1 - (nd - 25) / 170));   // near=1, far floors at 0.25
      fireLvl = Math.min(1, _nFire / 10) * prox;
    }
    audio.update(dt, {
      moving: !inCanoe && !!(mx || mz), sprint: sprinting, _moveLvl,   // no footsteps in the boat
      wolfDist, lakeDist: Math.hypot(player.x - 70, player.z + 90),
      night: window._night || 0, hp: player.hp, breath: breathLoad,
      px: player.x, pz: player.z, yaw: player.yaw, rain: _rainLevel, fire: fireLvl,
    });
  }

  // raft: ride the swell under you. It sits ON the wave height and tilts to the
  // wave's SLOPE (pitch/roll from the gradient) — calm at the bank, rolling out
  // deep. The mesh rotates by raftYaw (its own heading), decoupled from the
  // camera. JET/CRASH: drive fast up a steep wave face and the raft launches
  // off the crest, hangs, then slams down — a camera punch + a big splash.
  canoe.visible = inCanoe && started;
  // ── the sheet hand ── while sailing, swap the bow for the gloved hand on the
  // rope; it hauls left/right with your trim so you SEE yourself working the sail.
  // the anchor button rides whenever you're aboard and not mid-launch
  if (_anchorBtn) {
    const showAnchor = inCanoe && started && _raftLaunch <= 0;
    _anchorBtn.classList.toggle('show', showAnchor);
    if (showAnchor) _anchorBtn.textContent = anchored ? 'raise anchor' : 'drop anchor';
  }
  // the sail slider shows only while actually sailing (aboard, launched, not anchored)
  if (_sailSlider) {
    const showSail = inCanoe && started && _raftLaunch <= 0 && !anchored;
    _sailSlider.classList.toggle('show', showSail);
    if (showSail && _sailHandle) {
      // map the live (lagging) trim onto the bar so the handle visibly trails your drag
      _sailHandle.style.left = ((_sailTrim * 0.5 + 0.5) * 100).toFixed(1) + '%';
    }
  }
  // (the first-person sheet hand was removed per Fronk — no rope in hand while
  // sailing; the bow stays in hand as normal.)
  if (sheetHand.visible) sheetHand.visible = false;
  if (started && !intro && !dead && !launching && !bow.visible) bow.visible = true;
  if (canoe.visible) {
    const cspd = Math.hypot(canoeVX, canoeVZ);
    const spd = Math.min(1, cspd / 11);
    const wv = waveAt(player.x, player.z, t);
    // the bow's local fore-aft / lateral slope, from the wave gradient
    const fwdSlope = wv.gx * Math.sin(raftYaw) + wv.gz * Math.cos(raftYaw);
    const latSlope = wv.gx * Math.cos(raftYaw) - wv.gz * Math.sin(raftYaw);
    // ── wave-jump ── only off a GENUINELY steep, fast crest (rare). It used to
    // fire on nearly every swell, so the raft kept leaping + crash-landing — that
    // repetitive launch/splash read as a jarring 'metallic' wave sound and made
    // the ride feel choppy. Now it mostly just rides the swell smoothly.
    _raftJumpCd = (_raftJumpCd || 0) - dt;
    if (!_raftAirborne && cspd > 9 && fwdSlope > 0.45 && wv.o > 0.6 && _raftJumpCd <= 0) {
      _raftAirborne = true; _raftJumpCd = 6 + Math.random() * 6;   // and a cooldown between jumps
      _raftAirVy = 2.2 + cspd * 0.32 + fwdSlope * 6;     // takeoff kick scales with speed/steepness
      if (audio.waveLaunch) audio.waveLaunch(Math.min(1, _raftAirVy / 9));
    }
    let rideY = WATER_Y - 0.1 + wv.h;
    let pitch, roll;
    if (_raftAirborne) {
      _raftAirVy -= 16 * dt;                              // gravity
      rideY = (canoe._airY ?? rideY) + _raftAirVy * dt;
      canoe._airY = rideY;
      pitch = -_raftAirVy * 0.05;                         // nose follows the arc
      roll = Math.sin(t * 2.4) * 0.04;
      if (rideY <= WATER_Y - 0.1 + wv.h) {               // splash-down
        const impact = -_raftAirVy;
        _raftAirborne = false; canoe._airY = undefined;
        rideY = WATER_Y - 0.1 + wv.h;
        if (impact > 3) {                                 // a real crash, not a soft set-down
          const imp01 = Math.min(1, impact / 12);
          camShakeT = SHAKE_DUR * (1.2 + imp01 * 1.8); kickT = KICK_DUR;
          if (audio.waveCrash) audio.waveCrash(imp01);
          // big splash ring under the bow
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, rr = Math.random() * 1.6;
            dustPuff(player.x + Math.cos(a) * rr, WATER_Y + 0.05, player.z + Math.sin(a) * rr, 0xbfd4e0, 1.3);
          }
        } else if (audio.waveSlap) audio.waveSlap(spd);
      }
    } else {
      // riding the surface: idle rock + the wave's own tilt (more offshore). The
      // raft heaves into the swell — pitch with the fore-aft slope, roll with the
      // beam slope, plus a gentle wallow that grows with the sea state (wv.o).
      const sea = 0.5 + wv.o;
      pitch = Math.sin(t * 1.15 + 0.7) * 0.05 * sea + fwdSlope * 2.4 + spd * 0.04;
      roll = Math.sin(t * 1.5) * 0.09 * sea + latSlope * 2.4 + spd * 0.05 * Math.sin(t * 3.4);
    }
    canoe.position.set(player.x, rideY, player.z);
    canoe.rotation.set(pitch, raftYaw, roll);            // heading is the raft's own, not the camera's
    _boatRoll = roll; _boatPitch = pitch;                // hand to the camera for the same rock
    // masthead pennant streams DOWNWIND (world windDir), so you can read the
    // wind at a glance — the whole point of the sailing. (flag is a raft child,
    // so subtract raftYaw to land on the world direction, + a little flutter.)
    if (canoe._windFlag) canoe._windFlag.rotation.y = (windDir - raftYaw) + Math.sin(t * 6) * (0.07 + _gust * 0.2);
  }
  if (inCanoe !== _wasCanoe) { _wasCanoe = inCanoe;
    document.body.classList.toggle('canoe', inCanoe); }

  // title/dive: open the fog so the aerial vista isn't washed to haze
  if (!started) { scene.fog.far = 900; }
  if (!started && !launching) {
    // TITLE: a slow, cinematic DOLLY along a banked oval track high above the
    // valley — a wide sweeping arc, gently rising and falling like a camera
    // crane, always looking in at the center. Not a flat spin.
    const a = t * 0.05 + ORBIT_PHASE;               // slow, starting at a random point on the track
    const rx = 185, rz = 125;                        // an oval, not a circle
    const h = 118 + Math.sin(a * 0.9) * 34;          // banking rise/fall
    camera.position.set(Math.cos(a) * rx, h, Math.sin(a) * rz);
    camera.lookAt(0, 12, 0);
    camera.rotation.order = 'YXZ';
  } else if (launching) {
    // the DIVE: ONE continuous motion from wherever the orbit left you —
    // a swooping arc down and IN to the center, accelerating (cubic ease-in)
    // so it slams. No teleport: _diveFrom is the live orbit position, so the
    // shot never cuts from the title to the fall — it's all one take.
    launchT += dt;
    const lp = Math.min(1, launchT / LAUNCH_DUR);
    const e = lp * lp * lp;               // cubic ease-IN — accelerating swoop
    const tx = LAND.x, tz = LAND.z, ty = heightAt(tx, tz) + EYE;   // dive to the chosen bed
    camera.position.set(
      _diveFrom.x + (tx - _diveFrom.x) * e,
      _diveFrom.y + (ty - _diveFrom.y) * e,
      _diveFrom.z + (tz - _diveFrom.z) * e);
    // horizontal flight direction (orbit point → center) — you'll land facing
    // this way. The look eases from the impact point to forward along it.
    const fdx = tx - _diveFrom.x, fdz = tz - _diveFrom.z, fl = Math.hypot(fdx, fdz) || 1;
    const hx = fdx / fl, hz = fdz / fl;
    const lookE = Math.max(0, (lp - 0.65) / 0.35);
    const gyL = heightAt(tx, tz);
    // final gaze: the landing point, tilting forward along the flight line at the end
    const fX = tx + hx * lookE * 16, fY = gyL + (ty - gyL) * lookE, fZ = tz + hz * lookE * 16;
    // CRUCIAL: blend that gaze OUT of the orbit's look point (0,12,0) so the
    // click never snaps the view — orientation is continuous from orbit into dive.
    const le = lp * lp * (3 - 2 * lp);          // smoothstep 0→1
    camera.lookAt(fX * le, 12 + (fY - 12) * le, fZ * le);
    camera.rotation.order = 'YXZ';
    if (lp >= 1) {                        // you settle onto the bed of roses
      launching = false;
      started = true; bow.visible = true; updateBowString(0);
      player.x = LAND.x; player.z = LAND.z;
      player.y = heightAt(LAND.x, LAND.z);
      // wake looking UP at the sky, then the world fades in around you
      player.yaw = camera.rotation.y; player.pitch = 0.62;
      grounded = true; player.airY = player.y;
      _wakeYaw = player.yaw; _wakePitch = player.pitch; _wakeT = t;   // reveal reference
      if (audio.fadeTitle) audio.fadeTitle(4);   // theme peaked at impact — let it fall away as you wake
      blinkAwake();                       // no crater, no blast — you BLINK awake,
      respawnMushroomNear(1, 6, 7);       // ONE mushroom, ~20ft off — find it, then it all begins
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
    _landDip += (0 - _landDip) * Math.min(1, dt * 9);   // ease the knee-bend back up
    camera.position.set(player.x, player.y + EYE - _landDip, player.z);
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
    // in the boat the whole view ROCKS with the hull — roll + a little pitch
    if (inCanoe) { camera.rotation.z = _boatRoll * 0.8; camera.rotation.x += _boatPitch * 0.5; }
    // kill-feel: release kick (pitch up, decays 120ms) + near-miss rattle
    if (kickT > 0) camera.rotation.x += 0.012 * (kickT / KICK_DUR);
    if (camShakeT > 0) {
      const s = camShakeT / SHAKE_DUR;
      camera.rotation.x += Math.sin(t * 97) * 0.011 * s;
      camera.rotation.y += Math.sin(t * 83) * 0.009 * s;
    }
    // ── the trip is DRUNK ── the whole view lurches and rolls, gentle and
    // woozy, deeper the higher the level. The world sways; the trees lean.
    if (tripT > 0) {
      // camera woozy-ness scales with depth but is CAPPED (~3.5x) so even a
      // level-10 trip never becomes an unplayable barrel roll — the screen warp
      // / colour carry the high-level madness instead.
      const lv = Math.max(1, Math.min(3.5, _tripLvlVis));
      const sw = _tripKsway;     // sway grows in early with the trees (the come-up)
      camera.rotation.z = (Math.sin(t * 0.8) * 0.05 * lv + Math.sin(t * 1.7) * 0.02 * lv) * sw;
      camera.rotation.x += Math.sin(t * 0.55) * 0.03 * lv * sw;
      camera.rotation.y += Math.cos(t * 0.47) * 0.03 * lv * sw;
    } else if (camera.rotation.z) camera.rotation.z = 0;
  }
  sun.target.position.set(player.x, player.y, player.z);
  sun.position.set(player.x - 180, player.y + 95, player.z - 60);

  window._tickInfo = { f: (window._tickInfo?.f || 0) + 1, n: animals.length,
                       px: Math.round(player.x), pz: Math.round(player.z),
                       boat: inCanoe, launch: +_raftLaunch.toFixed(2), raftYaw: +raftYaw.toFixed(2),
                       fov: +camera.fov.toFixed(1), trim: +_sailTrim.toFixed(2), luff: _luffing,
                       wake: +_boatWake.toFixed(2), spd: +Math.hypot(canoeVX, canoeVZ).toFixed(1) };
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
  if (started && !intro && !dead && _revealStep < 3) {
    const bc = document.body.classList;
    const dB = Math.hypot(player.x - LAND.x, player.z - LAND.z);   // distance from where you woke
    if (_revealStep === 0) {
      const looked = Math.abs(player.yaw - _wakeYaw) > 0.08
                  || Math.abs(player.pitch - _wakePitch) > 0.08
                  || (window.moveVec && (window.moveVec.x || window.moveVec.y))
                  || keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD
                  || (t - _wakeT) > 2.6;        // FAILSAFE: controls always come up shortly after you wake
      if (looked) {
        _revealStep = 1;
        if (IS_TOUCH) bc.add('show-move');
        if (audio.cue) audio.cue(0);
        // (no opening line — it clashed with the other text and read ugly)
      }
    } else if (_revealStep === 1 && dB > 7) { _revealStep = 2; if (IS_TOUCH) bc.add('show-jump'); if (audio.cue) audio.cue(1); }
    else if (_revealStep === 2 && dB > 11.5) { _revealStep = 3; if (IS_TOUCH) bc.add('show-bow'); if (audio.cue) audio.cue(2); }
  }
  // kill-feel hitstop: a connected arrow holds the world at 5% speed
  // for a few real frames (0.04s flesh / 0.09s lethal). No setTimeout —
  // juiceT burns down on real dt, world dt gets scaled while it lasts.
  let wdt = dt;
  if (juiceT > 0) { juiceT -= dt; wdt = dt * 0.05; }
  for (const a of animals) {
    animalUpdate(a, wdt);
    // ── ambient idle calls ── a living creature bleats/lows/yelps out in
    // the world now and then. Only calm prey (idle|wary), never spiders or
    // bears, never mid-trip; per-animal cooldown + a global cap keep it from
    // turning into a barnyard. Nearer animals read a touch louder.
    if (audio.animalCall && !a.dead && a.obj && a.state !== undefined
        && tripLevel < 2 && !a.cfg.spiderish && !a.cfg.bearish && !a.aggro
        && (a.state === 'idle' || a.state === 'wary') && _idleCalls < 3) {
      a._callT = (a._callT ?? (14 + Math.random() * 16)) - wdt;   // 14-30s cooldown
      if (a._callT <= 0) {
        const dx = a.obj.position.x - player.x, dz = a.obj.position.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d < 130) {
          const vol = 0.45 + 0.25 * (1 - d / 130);   // nearer = slightly louder
          if (audio.animalCall(a.name, a.obj.position.x, a.obj.position.z, vol)) {
            _idleCalls++;
            setTimeout(() => { _idleCalls = Math.max(0, _idleCalls - 1); }, 1600);
          }
        }
        a._callT = 14 + Math.random() * 16;
      }
    }
    // L2+: the world goes oceanic — the animals don't HOP, they FLOAT, low-
    // gravity, drifting and swaying like fish in water. The deeper the trip,
    // the higher they hang in the sky. Gentle, never a hyper 10ft pogo.
    if (tripLevel >= 2 && !a.dead && a.obj && !a.cfg.spiderish) {
      const ph = a._bouncePh ?? (a._bouncePh = Math.random() * 6.283);
      const gy = heightAt(a.obj.position.x, a.obj.position.z);
      // base hover rises with the trip; a slow swell rides on top
      const hover = (tripLevel >= 3 ? 7 : 1.6) + (tripLevel >= 3 ? 3.5 : 0.7) * Math.sin(t * 0.5 + ph);
      a.obj.position.y = gy + Math.max(0, hover) + Math.sin(t * 0.9 + ph) * 0.4;
      a.obj.rotation.z = Math.sin(t * 0.45 + ph) * 0.22;   // a slow, fishy sway
      // ── they PLAY ── deep in the trip the animals do things they never do:
      // slow barrel-rolls and lazy spins, drifting around each other, dreamlike.
      if (tripLevel >= 3) {
        a.obj.rotation.y += dt * (0.6 + 0.5 * Math.sin(t * 0.3 + ph));   // lazy spin
        a.obj.rotation.x = Math.sin(t * 0.6 + ph) * 0.5;                 // barrel-roll tumble
        // drift toward a dance partner — they cluster and circle in the air
        const partner = animals[(a._partnerIx ?? (a._partnerIx = (Math.random() * animals.length) | 0)) % animals.length];
        if (partner && partner !== a && !partner.dead) {
          a.obj.position.x += (partner.obj.position.x - a.obj.position.x) * dt * 0.12;
          a.obj.position.z += (partner.obj.position.z - a.obj.position.z) * dt * 0.12;
        }
      }
    }
  }
  sharkUpdate(wdt);               // the lake patrollers — fin on the surface, Jaws bed
  leviathanUpdate(t);             // the deep one drifts, forever
  arrowUpdate(wdt);
  treeFireUpdate(dt);              // burning trees climb, spread, then fall
  groundFireUpdate(dt);           // grass/bush fire sweeps the ground; animals flee/burn; player heat
  trailUpdate(dt);                 // rocket-fuel embers fade
  dustUpdate(dt);                  // kicked-up dirt rises and settles
  arrivalUpdate(dt);              // the genesis blast: ring/flash/beam + the home growing in
  extendClouds();                 // the endless climb — generate clouds above, prune below
  if (_cloudGroup) {              // slow ethereal drift — the clouds breathe and turn
    for (const cs of CLOUDSTEPS) {
      if (!cs.grp) continue;
      const ph = cs.grp.userData.bob || 0;
      cs.grp.position.y = cs.y - 0.8 + Math.sin(t * 0.35 + ph) * 0.35;
      cs.grp.rotation.y += dt * 0.04;
    }
  }
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

// ── title: auto-fade in, then one tap dives ──
// On load the black title smoothly fades on its own to reveal the orbiting drone
// shot — no tap needed. Taps do NOTHING until that fade completes; after it, a
// single tap flies you down. (Autoplay blocks sound until a gesture, so the
// orbit reveals silent and the cinematic theme hits on the tap, swelling as you
// plummet and fading as you wake.)
// ── title: music on open · click 1 reveals the drone · click 2 dives in ──
let _titleStage = 0, _themeOn = false, _revealT = 0;
function startTheme() {                    // the cinematic theme
  if (_themeOn) return;
  _themeOn = true;
  try { audio.start(); if (audio.titleTheme) audio.titleTheme(); } catch (e) {}
}
{
  // try to play the theme the instant the app opens (works where the browser
  // allows autoplay); if it's gated, the first touch below starts it.
  try { audio.start(); } catch (e) {}
  setTimeout(() => { if (!_themeOn && audio.ctx && audio.ctx.state === 'running') startTheme(); }, 300);
  const wake = () => { startTheme();
    window.removeEventListener('pointerdown', wake, true);
    window.removeEventListener('touchstart', wake, true);
    window.removeEventListener('keydown', wake, true); };
  window.addEventListener('pointerdown', wake, true);
  window.addEventListener('touchstart', wake, true);
  window.addEventListener('keydown', wake, true);
}
window._titleStage = () => _titleStage;   // debug/test hook
function onTitleTap() {
  if (launching || started) return;
  if (_titleStage === 0) {                 // CLICK 1 → part the black, reveal the drone shot
    _titleStage = 1; _revealT = performance.now();
    startTheme();
    const ttl = document.getElementById('title'); if (ttl) ttl.classList.add('revealed');
    return;
  }
  if (performance.now() - _revealT < 350) return;   // CLICK 2 → fly down (let the reveal breathe a beat)
  startTheme();
  // On touch, request fullscreen now and let the resize settle over a few orbit
  // frames BEFORE the fall — so it never reframes mid-dive (the old seam).
  if (IS_TOUCH && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
    setTimeout(beginLaunch, 400);
  } else {
    beginLaunch();
  }
}
// death → you're cast down from the sky AGAIN. Same plummet + genesis blast
// as the first arrival, but the game's already running (started stays true).
// ── the death beat ── you don't just blink and reset: the world slows and
// darkens, the CONSUMED card holds in the black, then the respawn plummet fades
// you back in (you come to falling from the sky). One centered line, no clutter.
function beginDeath() {
  const v = document.getElementById('veil');
  if (v) { v.style.transition = 'opacity 1.5s ease-in'; v.style.opacity = '0.86'; }
  cinematic(LINES.death, 3200);                 // the weighty centered card
  if (audio.killStinger) audio.killStinger();   // the woods close the ledger on you
}
function respawnArrival() {
  if (window._base && window._base.group) window._base.group.visible = false;
  // cast back down onto the bed you call home
  _diveFrom.set(LAND.x, heightAt(LAND.x, LAND.z) + 130, LAND.z);
  launching = true; launchT = 0; intro = false; dead = false;
  tripT = 0; tripLevel = 0; clearClouds();
  if (audio.tripMusic) audio.tripMusic(false);
  const mb = document.getElementById('maul'); if (mb) mb.style.opacity = '0';
  // come to as you fall — the black lifts over the dive
  const v = document.getElementById('veil');
  if (v) { v.style.transition = 'opacity 1.7s ease-out'; v.style.opacity = '0'; }
}
function beginLaunch() {
  if (launching || started) return;
  launching = true; launchT = 0;
  // WHERE you land = the flower bed the drone is nearest right now. Your tap
  // timing out of the orbit picks which of the 5 you drop into.
  let best = FLOWERBEDS[0], bd = 1e9;
  for (const bed of FLOWERBEDS) {
    const d = Math.hypot(camera.position.x - bed.x, camera.position.z - bed.z);
    if (d < bd) { bd = d; best = bed; }
  }
  LAND = { x: best.x, z: best.z };
  // hide the home — it doesn't exist yet. The impact will blow it into being.
  if (window._base && window._base.group) window._base.group.visible = false;
  // ONE continuous shot: the dive begins from exactly where the orbit camera is
  // RIGHT NOW (after the fullscreen resize has settled) — no cut, no stale origin.
  _diveFrom.copy(camera.position);
  // the theme is already swelling over the orbit; just make sure it's going
  // (covers autoplay-blocked phones where this tap is the first gesture).
  startTheme();
  document.getElementById('title').style.opacity = 0;
  setTimeout(() => document.getElementById('title').style.display = 'none', 800);
  // fullscreen (touch) was requested on the tap in onTitleTap so its resize
  // lands over the orbit, not mid-dive. Desktop just grabs the pointer here.
  if (!IS_TOUCH) canvas.requestPointerLock();
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
