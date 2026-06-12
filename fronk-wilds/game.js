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
  ? { grass: 15000, trees: 340, bushes: 260, rocks: 60, px: 1.6, shadow: 1024, segs: 180 }
  : { grass: 34000, trees: 540, bushes: 420, rocks: 90, px: 2, shadow: 2048, segs: 260 };

const SPECIES = {
  Deer: { n: 6,  speed: 3.0, gallop: 10.5, hp: 1, flee: 30, r: 1.5 },
  Stag: { n: 3,  speed: 2.7, gallop: 10.0, hp: 2, flee: 26, r: 1.7 },
  Fox:  { n: 4,  speed: 3.4, gallop: 11.5, hp: 1, flee: 22, r: 1.0 },
  Wolf: { n: 3,  speed: 3.2, gallop: 8.8,  hp: 2, flee: 0,  r: 1.2,
          hunts: true, aggroR: 38, dmg: 22, packR: 70 },
          // circles before committing; after dark it calls a partner
  Bull: { n: 3,  speed: 2.2, gallop: 9.6,  hp: 3, flee: 0,  r: 1.7,
          territorial: 16, dmg: 30 },
          // wanders calm — gives ONE warning stomp, then it's a freight train
};

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
const SUN_WARM = new THREE.Color(0xffc46a), SUN_NIGHT = new THREE.Color(0x4d5f96);
const FOG_DAY = new THREE.Color(0xd89a55), FOG_NIGHT = new THREE.Color(0x080b12);
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
        vec3 horizon = mix(vec3(0.95, 0.48, 0.23), vec3(0.031, 0.043, 0.078), night);
        vec3 zenith  = mix(vec3(0.11, 0.20, 0.40), vec3(0.008, 0.012, 0.030), night);
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
  return a;
}

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
    const snowLine = 50 + (t - 0.5) * 12;
    if (y < WATER_Y + 0.45) c = sandC.clone();
    else if (y < WATER_Y + 1.0) c = sandC.clone()
      .lerp(c, (y - WATER_Y - 0.45) / 0.55);
    else if (y > snowLine) c = new THREE.Color(0xe7edf4)
      .lerp(rockC, Math.max(0, 1 - (y - snowLine) / 10) * 0.5);
    else if (y > 26) c = rockC.clone()
      .lerp(dirtC, vnoise(x * 0.05, z * 0.05) * 0.3);
    else if (y > 19) c = c.lerp(rockC, (y - 19) / 7);
    else if (t > 0.86) c = c.lerp(dirtC, 0.3);
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
{
  // curved, tapered blade — three of them in a tuft, color gradient
  // dark base → bright tip, tips bend hardest in the wind
  const mkBlade = (rotY) => {
    const g = new THREE.PlaneGeometry(0.17, 1.1, 1, 4);
    g.translate(0, 0.55, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vy = p.getY(i) / 1.1;
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
  const pineTrunk = new THREE.CylinderGeometry(0.32, 0.5, 3.2, 6);
  pineTrunk.translate(0, 1.6, 0);
  const p1 = new THREE.ConeGeometry(2.6, 4.4, 7);  p1.translate(0, 5.0, 0);
  const p2 = new THREE.ConeGeometry(1.9, 3.4, 7);  p2.translate(0, 7.4, 0);
  const p3 = new THREE.ConeGeometry(1.15, 2.3, 7); p3.translate(0, 9.4, 0);
  const pineGeo = paintTwoTone(mergeGeoms([pineTrunk, p1, p2, p3]), pineTrunk,
    0x6b4a2a, () => new THREE.Color().setHSL(0.27 + Math.random() * 0.03, 0.45,
                                             0.30 + Math.random() * 0.06));

  const blTrunk = new THREE.CylinderGeometry(0.4, 0.58, 4.4, 6);
  blTrunk.translate(0, 2.2, 0);
  const b1 = new THREE.IcosahedronGeometry(2.5, 0); b1.translate(0, 6.0, 0);
  const b2 = new THREE.IcosahedronGeometry(1.9, 0); b2.translate(1.5, 5.0, 0.5);
  const b3 = new THREE.IcosahedronGeometry(1.7, 0); b3.translate(-1.4, 5.2, -0.4);
  const broadGeo = paintTwoTone(mergeGeoms([blTrunk, b1, b2, b3]), blTrunk,
    0x5d452c, () => new THREE.Color().setHSL(0.23 + Math.random() * 0.05, 0.5,
                                             0.32 + Math.random() * 0.08));

  const biTrunk = new THREE.CylinderGeometry(0.16, 0.22, 5.2, 6);
  biTrunk.translate(0, 2.6, 0);
  const bi1 = new THREE.IcosahedronGeometry(1.6, 0); bi1.translate(0, 6.0, 0);
  const birchGeo = paintTwoTone(mergeGeoms([biTrunk, bi1]), biTrunk,
    0xd9d4c4, () => new THREE.Color().setHSL(0.21 + Math.random() * 0.04, 0.55,
                                             0.42 + Math.random() * 0.08));

  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true,
    roughness: 1, emissive: 0x16240e, emissiveIntensity: 0.55 });
  const species = [
    { geo: pineGeo,  inst: new THREE.InstancedMesh(pineGeo, treeMat, CFG.trees), n: 0, r: 1.1 },
    { geo: broadGeo, inst: new THREE.InstancedMesh(broadGeo, treeMat, CFG.trees), n: 0, r: 1.2 },
    { geo: birchGeo, inst: new THREE.InstancedMesh(birchGeo, treeMat, CFG.trees), n: 0, r: 0.6 },
  ];
  species.forEach(s => { s.inst.castShadow = true; scene.add(s.inst); });

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(),
        S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  let placed = 0, guard = 0;
  window.TREES = [];
  while (placed < CFG.trees && guard++ < CFG.trees * 30) {
    const x = (Math.random() - 0.5) * WORLD * 0.92,
          z = (Math.random() - 0.5) * WORLD * 0.92,
          y = heightAt(x, z);
    if (y < WATER_Y + 1.5 || y > 26) continue;      // treeline at 26
    if (Math.hypot(x, z) < 18) continue;            // spawn clearing
    const roll = Math.random();
    let sp;
    if (y < 8)       sp = roll < 0.45 ? species[1] : roll < 0.75 ? species[0] : species[2];
    else if (y < 14) sp = roll < 0.65 ? species[0] : roll < 0.9 ? species[1] : species[2];
    else             sp = species[0];
    P.set(x, y - 0.15, z);
    E.set(0, Math.random() * Math.PI * 2, 0); Q.setFromEuler(E);
    const s = 0.8 + Math.random() * 1.1; S.set(s, s, s);
    sp.inst.setMatrixAt(sp.n++, M.compose(P, Q, S));
    TREES.push({ x, z, r: sp.r * s });
    placed++;
  }
  species.forEach(s => { s.inst.count = s.n; });

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
  const bushes = new THREE.InstancedMesh(bushGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
      emissive: 0x121f0a, emissiveIntensity: 0.5 }), CFG.bushes);
  bushes.castShadow = true;
  window.BUSHES = [];
  placed = 0; guard = 0;
  while (placed < CFG.bushes && guard++ < CFG.bushes * 30) {
    const x = (Math.random() - 0.5) * WORLD * 0.92,
          z = (Math.random() - 0.5) * WORLD * 0.92,
          y = heightAt(x, z);
    if (y < WATER_Y + 1 || y > 22) continue;
    if (Math.hypot(x, z) < 14) continue;
    P.set(x, y - 0.1, z);
    E.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.15);
    Q.setFromEuler(E);
    const s = 0.7 + Math.random() * 1.3; S.set(s, s * (0.7 + Math.random() * 0.5), s);
    bushes.setMatrixAt(placed++, M.compose(P, Q, S));
    BUSHES.push({ x, z, r: 1.3 * s });
  }
  bushes.count = placed;
  scene.add(bushes);

  const rg = new THREE.DodecahedronGeometry(1.1, 0);
  const rocks = new THREE.InstancedMesh(rg,
    new THREE.MeshStandardMaterial({ color: 0x8d8678, roughness: 1 }), CFG.rocks);
  rocks.castShadow = true;
  placed = 0; guard = 0;
  while (placed < CFG.rocks && guard++ < CFG.rocks * 30) {
    const x = (Math.random() - 0.5) * WORLD * 0.94,
          z = (Math.random() - 0.5) * WORLD * 0.94,
          y = heightAt(x, z);
    if (y < WATER_Y + 0.5) continue;
    P.set(x, y, z);
    E.set(Math.random(), Math.random() * 6, Math.random()); Q.setFromEuler(E);
    const s = 0.5 + Math.random() * 1.6; S.set(s, s * (0.6 + Math.random() * 0.6), s);
    rocks.setMatrixAt(placed++, M.compose(P, Q, S));
  }
  rocks.count = placed;
  scene.add(rocks);
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
const LANDMARKS = [
  {
    id: 'circle', name: 'The Standing Stones', x: -250, z: 180, r: 16,
    journal: 'Seven stones, arranged. Something is fed here. The grass inside the circle grows wrong. You do not eat inside the circle.',
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
    journal: 'A tree older than hunger. Things have died at its roots, generously. It eats too. You have just never caught it chewing.',
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
    journal: 'Water comes out of the mountain and asks for nothing. Everything else here charges. You keep waiting for the price.',
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
    id: 'camp', name: 'The Abandoned Camp', x: -180, z: -160, r: 13,
    journal: 'A tent, a fire, no one. They left their food. Nobody leaves their food. Whatever ate them was not here for the beans.',
    build(g) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.8, 4),
        new THREE.MeshStandardMaterial({ color: 0xa3622f, roughness: 1, flatShading: true }));
      tent.position.set(-3, 1.3, 0); tent.rotation.y = 0.6; tent.castShadow = true; g.add(tent);
      const logM = new THREE.MeshStandardMaterial({ color: 0x5d452c, roughness: 1 });
      const log1 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.6, 6), logM);
      log1.rotation.z = Math.PI / 2; log1.position.set(2.2, 0.35, 1.4); g.add(log1);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 6),
        new THREE.MeshStandardMaterial({ color: 0xff8c2e, emissive: 0xff6a14,
          emissiveIntensity: 2.2 }));
      fire.position.set(1.2, 0.6, -0.6); g.add(fire);
      g.userData.flame = fire;
      const light = new THREE.PointLight(0xff9242, 14, 26, 1.8);
      light.position.set(1.2, 1.6, -0.6); g.add(light);
      g.userData.fireLight = light;
    },
  },
  {
    id: 'cairn', name: 'The Summit Cairn', x: 220, z: 220, r: 14,
    journal: 'Stones stacked by hands, up where nothing grows. Someone climbed above the food chain to die. It almost worked.',
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
    journal: 'A black door to nowhere. It hums, and your empty stomach hums back. You knocked. Something inside swallowed once. You stopped knocking.',
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
    journal: 'Mushrooms making their own light. They look like food. So did you, once, to something. You leave them alone.',
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
  for (const lm of LANDMARKS) {
    const u = lm.group.userData;
    if (u.fireLight) u.fireLight.intensity = 11 + Math.sin(t * 11) * 2.5 + Math.sin(t * 23) * 1.5;
    if (u.seam) u.seam.material.emissiveIntensity = 2 + Math.sin(t * 0.9) * 0.9;
    if (u.flame) u.flame.scale.y = 1 + Math.sin(t * 13) * 0.15;
    if (u.fall) u.fall.material.opacity = 0.55 + Math.sin(t * 6) * 0.12;
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
          setTimeout(() => toast('ALL SEVEN FOUND. You have seen the whole menu. You are on it.', 6000), 7500);
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

async function loadAnimals() {
  const names = Object.keys(SPECIES);
  await Promise.all(names.map(n => new Promise((res, rej) =>
    loader.load(`assets/animals/${n}.glb`, g => { prefabs[n] = g; res(); }, undefined, rej))));
  for (const n of names) for (let i = 0; i < SPECIES[n].n; i++) spawn(n);
}

function spawn(name) {
  const cfg = SPECIES[name], prefab = prefabs[name];
  const obj = SkeletonUtils.clone(prefab.scene);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true; } });
  let x, z, y, tries = 0;
  do {
    x = (Math.random() - 0.5) * WORLD * 0.85;
    z = (Math.random() - 0.5) * WORLD * 0.85;
    y = heightAt(x, z);
  } while ((y < WATER_Y + 1 || Math.hypot(x, z) < 45) && tries++ < 60);
  obj.position.set(x, y, z);
  scene.add(obj);
  const mixer = new THREE.AnimationMixer(obj);
  const acts = {};
  for (const frag of ['Idle', 'Eating', 'Walk', 'Gallop', 'Death', 'HitReact_Left', 'Attack']) {
    const clip = clipOf(prefab, frag);
    if (clip) acts[frag] = mixer.clipAction(clip);
  }
  const a = {
    name, cfg, obj, mixer, acts, cur: null,
    state: 'idle', t: Math.random() * 4, dir: Math.random() * Math.PI * 2,
    hp: cfg.hp, dead: false, attackCd: 0,
  };
  setAnim(a, Math.random() < 0.5 ? 'Idle' : 'Eating');
  animals.push(a);
  return a;
}

function setAnim(a, frag, once = false) {
  const next = a.acts[frag] || a.acts.Idle;
  if (!next || a.cur === next) return;
  next.reset();
  if (once) { next.setLoop(THREE.LoopOnce); next.clampWhenFinished = true; }
  else next.setLoop(THREE.LoopRepeat);
  if (a.cur) { next.crossFadeFrom(a.cur, 0.22, false); }
  next.play();
  a.cur = next;
}

// ── stealth: what the animal can actually perceive ────────────────
// noiseLevel: 0 = still, 1 = moving, 2 = sprinting (set in the tick)
let noiseLevel = 0;

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

function spookRadius(a, dist) {
  // hearing scales with your noise; sight needs a clear line.
  // Sneak low behind cover and you can get close enough to whisper.
  let r = a.cfg.flee;
  r *= noiseLevel === 2 ? 1.35 : noiseLevel === 1 ? 0.85 : 0.5;
  if (dist < 60 && losBlocked(a)) r *= 0.45;
  return Math.max(r, noiseLevel === 2 ? 18 : 6);   // sprint is LOUD
}

function animalUpdate(a, dt) {
  window._auCalls = (window._auCalls || 0) + 1;
  a.mixer.update(dt);
  if (a.dead) {
    a.t -= dt;
    // a kill is MEAT — walk to the carcass and you eat (or pack it)
    if (!a.eaten && !a.isCryptid) {
      const dd = Math.hypot(player.x - a.obj.position.x, player.z - a.obj.position.z);
      if (dd < 2.4) {
        a.eaten = true;
        player.lastAte = clock.elapsedTime;
        if (player.hp < 95) {
          player.hp = Math.min(100, player.hp + 40); renderHP();
          toast('You open it. You eat the insides so yours keep working.');
        } else if (player.meat < 3) {
          player.meat++; renderNotes();
          toast('The insides come with you. The woods waste nothing. Neither do you.');
        } else toast('You can carry no more. Whatever follows you gets the rest.');
      }
    }
    if (a.t <= 0) { scene.remove(a.obj); animals.splice(animals.indexOf(a), 1); spawn(a.name); }
    return;
  }
  const p = a.obj.position;
  const dx = player.x - p.x, dz = player.z - p.z;
  const dist = Math.hypot(dx, dz);

  if (a.cfg.hunts || a.cfg.territorial) {     // ── predator / territorial brain
    a.attackCd -= dt;
    // wolves grow bolder after dark — wider trigger, and they don't come alone
    const night = window._night || 0;
    const trigger = (a.cfg.aggroR || a.cfg.territorial)
      * (a.cfg.hunts && !a.isCryptid && night > 0.4 ? 1.25 : 1);
    if (a.aggro && dist > trigger * 2.2) {    // lost you
      a.aggro = false; a.warned = false; a.circleT = 0;
      if (a.state === 'warn' || a.state === 'stare') { a.state = 'idle'; a.t = 1; }
    }
    if (dist < 2.8) {
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
        if (a.circleT > 0 && dist > 8 && dist < trigger * 1.5) {
          // the circling pass — flank-walk, spiraling slowly inward
          a.circleT -= dt;
          a.dir = Math.atan2(dx, dz) + a.circleDir * 1.25;
          setAnim(a, 'Walk');
          stepAnimal(a, a.cfg.speed * 1.3, dt);
        } else {
          // committed. Wolves prefer the side you AREN'T looking at —
          // if you can see it coming, it angles for your back instead.
          let ax = dx, az = dz;
          if (a.cfg.hunts && !a.isCryptid && dist > 7 && dist < 36
              && Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz > 0) {
            ax += Math.sin(player.yaw) * 6; az += Math.cos(player.yaw) * 6;
          }
          a.dir = Math.atan2(ax, az) + drift;
          const fast = dist < (a.isCryptid ? 30 : 17);
          setAnim(a, fast ? 'Gallop' : 'Walk');
          stepAnimal(a, fast ? a.cfg.gallop : a.cfg.speed, dt);
        }
      }
    } else wander(a, dt);
  } else {                                    // ── prey brain
    if (a.state === 'waddle') {
      // gut-shot: it limps away from you, bleeding. It will lie down.
      a.bleedT -= dt;
      a.dir = lerpAngle(a.dir, Math.atan2(-dx, -dz), dt * 1.5);
      setAnim(a, 'Walk');
      stepAnimal(a, 1.15, dt);
      dropBlood(a);
      if (a.bleedT <= 0) killAnimal(a, true);   // bleed-out
    } else if (a.state === 'flee') {
      a.t -= dt;
      setAnim(a, 'Gallop');
      stepAnimal(a, a.cfg.gallop, dt);
      if (a.bleeding) {
        dropBlood(a);
        a.bleeding -= dt;
        if (a.bleeding <= 0) {
          if (a.bleedFatal) { a.state = 'waddle'; a.bleedT = 6 + Math.random() * 8; }
          else a.bleeding = 0;   // shallow wound — it clots, it remembers
        }
      }
      if (a.t <= 0 && dist > a.cfg.flee * 1.5) a.state = 'idle', a.t = 1 + Math.random() * 3;
    } else if (dist < spookRadius(a, dist)) {
      a.state = 'flee'; a.t = 5 + Math.random() * 4;
      a.dir = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.7;
    } else wander(a, dt);
  }
  a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 6));
}

// a wolf that commits to a hunt calls the nearest calm wolf to join —
// loose pairs after dark. Runs once per aggro transition, scalars only.
function packCall(w) {
  const pr = (w.cfg.packR || 70); const pr2 = pr * pr;
  let best = null, bd = pr2;
  for (const o of animals) {
    if (o === w || o.name !== 'Wolf' || o.dead || o.aggro) continue;
    const ddx = o.obj.position.x - w.obj.position.x,
          ddz = o.obj.position.z - w.obj.position.z;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 < bd) { bd = d2; best = o; }
  }
  if (best) {
    best.aggro = true;
    best.state = 'stalk';
    best.circleT = 3 + Math.random() * 2;
    best.circleDir = -(w.circleDir || 1);   // it takes the OTHER side
  }
}

function wander(a, dt) {
  a.t -= dt;
  if (a.t <= 0) {
    const roll = Math.random();
    a.state = roll < 0.38 ? 'idle' : roll < 0.66 ? 'eat' : 'walk';
    a.t = 2.5 + Math.random() * 5;
    if (a.state === 'walk') {
      a.dir += (Math.random() - 0.5) * 2.4;
      // after dark, wandering wolves drift loosely toward the smell of you
      if (a.cfg.hunts && !a.isCryptid && (window._night || 0) > 0.5
          && Math.random() < 0.5) {
        const p = a.obj.position;
        a.dir = Math.atan2(player.x - p.x, player.z - p.z)
          + (Math.random() - 0.5) * 1.2;
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
  p.set(nx, ny, nz);
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

const VOICE = {
  peaceful: ['“Glad it went peaceful,” you say, to no one. No one answers.',
             'Quick. Alive, then food. The kindest order of operations.',
             'Clean. You say a small grace. Hunger wrote it.'],
  suffered: ['It took a while. You watched. You were that hungry.',
             'That one suffered. The woods saw. They mark these things.',
             'You made it slow. Somewhere, that is being written down.'],
};

function killAnimal(a, suffered = false) {
  a.dead = true; a.t = 12;
  a.suffered = suffered || !!a.bleeding || a.state === 'waddle';
  setAnim(a, 'Death', true);
  score[a.name] = (score[a.name] || 0) + 1;
  if (a.isCryptid) {
    toast(pick(LINES[a.name]), 7000);
    audio.stinger(); cryptid = null; a.t = 20;
  } else if (a.cfg.hunts || a.cfg.territorial) {
    toast(pick(LINES[a.name]));
    audio.documented();
  } else {
    toast(pick(a.suffered ? VOICE.suffered : VOICE.peaceful), 3600);
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

function cryptidUpdate(night) {
  if (night > 0.65 && !nightRolled) {
    nightRolled = true;
    if (!cryptid && Math.random() < CRYPTID_CHANCE) spawnCryptid();
  }
  if (night < 0.3) {
    nightRolled = false;
    if (cryptid && !cryptid.dead) {       // dawn — it leaves. For now.
      scene.remove(cryptid.obj);
      animals.splice(animals.indexOf(cryptid), 1);
      cryptid = null;
      toast('Dawn. It withdrew, unfed. It will not stay unfed.', 4200);
    }
  }
}

// ───────────────────────── player ─────────────────────────
const player = { x: 0, z: 26, yaw: Math.PI, pitch: -0.04, hp: 100, lastHit: -99,
                 meat: 0, lastAte: 0 };
window._player = player;
player.y = heightAt(player.x, player.z);
const score = {};
const keys = {};
let started = false, drawT = 0, drawing = false, dead = false, bobPhase = 0;

function hurtPlayer(dmg) {
  if (dead) return;
  player.hp -= dmg; player.lastHit = clock.elapsedTime;
  audio.thud();
  document.getElementById('hurt').style.opacity = 1;
  setTimeout(() => document.getElementById('hurt').style.opacity = 0, 280);
  toast(pick(LINES.bite));
  if (player.hp <= 0) {
    dead = true;
    resetDrawState();
    toast(LINES.death, 4000);
    setTimeout(() => {
      player.hp = 100; player.x = 0; player.z = 26; dead = false; renderHP();
    }, 3500);
  }
  renderHP();
}

// ───────────────────────── arrows ─────────────────────────
// Ballistics: real longbow numbers. ~60 m/s at full draw, true 9.81
// gravity, no drag, long lifetime so far shots actually land.
const ARROW_SPEED_BASE = 34, ARROW_SPEED_DRAW = 26;   // v = 34 + power*26
const ARROW_GRAVITY = 9.81;
const ARROW_LIFE = 9, ARROW_STUCK_LIFE = 12;

const arrows = [];
// Real arrow template — built ONCE, cloned per shot (clones share
// geometry + material, so this is cheap). Tip points +z so the
// existing lookAt-along-velocity orientation just works.
const arrowTemplate = new THREE.Group();
{
  const woodM  = new THREE.MeshStandardMaterial({ color: 0xa8865a, roughness: 0.75 });
  const steelM = new THREE.MeshStandardMaterial({ color: 0x3e444c, roughness: 0.35, metalness: 0.75 });
  const hornM  = new THREE.MeshStandardMaterial({ color: 0x2e2418, roughness: 0.9 });
  const fM     = new THREE.MeshStandardMaterial({ color: 0xc94f3a, roughness: 1, side: THREE.DoubleSide });
  // 0.78 m shaft, slightly tapered toward the head — centered on z
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0075, 0.78, 6), woodM);
  shaft.rotation.x = Math.PI / 2;
  // forged head: elongated cone + tiny collar where it seats
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.095, 6), steelM);
  head.rotation.x = Math.PI / 2; head.position.z = 0.437;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.018, 6), steelM);
  collar.rotation.x = Math.PI / 2; collar.position.z = 0.382;
  // nock notch hint at the tail
  const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.0055, 0.02, 5), hornM);
  nock.rotation.x = Math.PI / 2; nock.position.z = -0.396;
  arrowTemplate.add(shaft, head, collar, nock);
  // 3 fletches — thin doubled planes (two slightly splayed planes per
  // fletch fake real vane thickness for free)
  const fGeo = new THREE.PlaneGeometry(0.016, 0.085);
  for (let i = 0; i < 3; i++) {
    const ang = i * Math.PI * 2 / 3;
    for (let s = -1; s <= 1; s += 2) {
      const f = new THREE.Mesh(fGeo, fM);
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


function loose() {
  const power = Math.min(1, drawT);
  if (power < 0.12) { drawT = 0; return; }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const m = arrowTemplate.clone();
  m.position.copy(camera.position).addScaledVector(dir, 0.8);
  m.lookAt(m.position.clone().add(dir));
  scene.add(m);
  arrows.push({ m, v: dir.multiplyScalar(ARROW_SPEED_BASE + power * ARROW_SPEED_DRAW),
                t: ARROW_LIFE, power });
  audio.twang();
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
function arrowUpdate(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (a.stuck) { a.t -= dt; if (a.t <= 0) { scene.remove(a.m); arrows.splice(i, 1); } continue; }
    a.v.y -= ARROW_GRAVITY * dt;
    a.m.position.addScaledVector(a.v, dt);
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
        // upper 30% of the collision window + a real draw = clean kill.
        // Sharpshooting matters.
        const headshot = dy > an.cfg.r * 0.56 && a.power > 0.4;
        an.hp -= headshot ? 999 : (a.power > 0.55 ? 2 : 1);
        if (an.hp <= 0) killAnimal(an);
        else if (an.cfg.hunts || an.cfg.territorial) {
          // wounding a predator does not make it leave. It makes it sure.
          setAnim(an, 'HitReact_Left', true);
          setTimeout(() => { if (!an.dead) an.cur = null; }, 400);
          an.aggro = true;
          toast(an.isCryptid ? 'It felt that. It is coming to feed.' : 'Wounded. Now it knows what you are.');
        } else {
          setAnim(an, 'HitReact_Left', true);
          setTimeout(() => { if (!an.dead) an.cur = null; }, 500);
          // WHERE did it take the arrow? Rear hit = gut shot: it
          // waddles off slowly and bleeds. You track it or you lose it.
          const fx = Math.sin(an.obj.rotation.y), fz = Math.cos(an.obj.rotation.y);
          const rx = a.m.position.x - ap.x, rz = a.m.position.z - ap.z;
          const rear = (rx * fx + rz * fz) < -0.25;
          an._lastBlood = null;
          if (rear) {
            an.state = 'waddle';
            an.bleedT = 22 + Math.random() * 18;     // it will bleed out
            toast('Low. Bad shot.', 2400);
          } else {
            an.state = 'flee'; an.t = 9;
            an.bleeding = 14 + Math.random() * 8;     // bleeds while running
            an.bleedFatal = a.power > 0.7 && Math.random() < 0.5;
            an.dir = Math.atan2(ap.x - player.x, ap.z - player.z);
            toast('Blood.', 2000);
          }
        }
        scene.remove(a.m); arrows.splice(i, 1); hit = true; break;
      }
    }
    if (hit) continue;
    // ground hit — embed it at the impact angle, head buried,
    // fletching proud of the dirt
    if (a.m.position.y < heightAt(a.m.position.x, a.m.position.z)) {
      const vl = Math.hypot(a.v.x, a.v.y, a.v.z) || 1;
      a.m.position.addScaledVector(a.v, -0.30 / vl);   // back out ~30 cm along the shot line
      a.stuck = true; a.t = ARROW_STUCK_LIFE;
      if (audio.impact) audio.impact('ground',
        Math.min(1, Math.hypot(a.m.position.x - player.x, a.m.position.z - player.z) / 60));
    }
    a.t -= dt; if (a.t <= 0) { scene.remove(a.m); arrows.splice(i, 1); }
  }
}

// bow viewmodel — a real recurve: curved limbs, leather grip, a
// nocked arrow that appears as you draw, a string that pulls back
const bow = new THREE.Group();
let bowString1, bowString2, nockedArrow;
{
  const woodM = new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.7 });
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
  _bsNock.set(0, 0, -0.125 + 0.02 + draw * 0.34);
  _setBowStr(bowString1, _bsTip1);
  _setBowStr(bowString2, _bsTip2);
  nockedArrow.visible = draw > 0.03;
  nockedArrow.position.set(0, 0, _bsNock.z);
}

// dying mid-draw must not leave the camera zoomed / the bow drawn
function resetDrawState() {
  drawing = false; drawT = 0;
  if (camera.fov !== 70) { camera.fov = 70; camera.updateProjectionMatrix(); }
  updateBowString(0);
  document.getElementById('crosshair').classList.remove('drawn');
}

// ───────────────────────── input ─────────────────────────
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);

if (!IS_TOUCH) {
  canvas.addEventListener('mousedown', () => { if (started && document.pointerLockElement) drawing = true; });
  addEventListener('mouseup', () => { if (drawing) { drawing = false; loose(); } });
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
      if (t.clientX < innerWidth * 0.45 && t.clientY > innerHeight * 0.5 && stickId === null) {
        stickId = t.identifier;
        stick.style.left = (t.clientX - 59) + 'px';
        stick.style.bottom = (innerHeight - t.clientY - 59) + 'px';
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
      if (t.identifier === shootId) { shootId = null; drawing = false; loose(); }
    }
  });
  // iOS fires touchcancel (not touchend) on system gestures, alerts,
  // notification-center pulls — without this the stick/draw gets STUCK
  addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; moveVec.x = moveVec.y = 0;
        knob.style.left = '50%'; knob.style.top = '50%'; }
      if (t.identifier === lookId) lookId = null;
      if (t.identifier === shootId) { shootId = null; drawing = false; drawT = 0; }
    }
  });
  const btn = document.getElementById('shootBtn');
  btn.addEventListener('touchstart', e => {
    e.preventDefault();
    if (shootId !== null) return;     // second finger on the button — ignore
    const t = e.changedTouches[0];
    shootId = t.identifier; lastShoot = { x: t.clientX, y: t.clientY };
    drawing = true;
  }, { passive: false });
}

// ───────────────────────── HUD ─────────────────────────
let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.opacity = 0, ms);
}
function pick(arr) { return arr[Math.random() * arr.length | 0]; }
function renderNotes() {
  // no scores, no counters — just the meat you carry, as quiet marks
  document.getElementById('notes').innerHTML =
    '◆'.repeat(player.meat) || '';
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
  sun.intensity = 0.12 + 2.5 * Math.max(0, Math.min(1, (elev + 0.1) * 3.2)) * (1 - night * 0.96);
  // dawn is pale and anemic — color drains, then golden hour curdles back in
  const dawn = (phase > 0.7 ? Math.max(0, 1 - Math.abs(phase - 0.88) / 0.12) : 0) * (1 - night);
  sun.color.copy(SUN_WARM).lerp(SUN_NIGHT, night);
  if (dawn > 0) sun.color.lerp(SUN_DAWN, dawn * 0.7);
  hemi.intensity = (0.72 - night * 0.62) * (1 - dawn * 0.18);
  scene.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, night);
  if (dawn > 0) scene.fog.color.lerp(FOG_DAWN, dawn * 0.65);
  scene.background.copy(scene.fog.color);
  // fog closes in after dark — dusk stays open, true night clamps the world to ~60m
  const fogClose = night * Math.sqrt(night);
  scene.fog.near = 60 - 44 * fogClose;
  scene.fog.far = 340 - 270 * fogClose;
  // moon rides opposite the sun — only shows once it clears the horizon
  _moonDir.copy(_sunDir).multiplyScalar(-1);
  moon.position.set(player.x + _moonDir.x * 820, _moonDir.y * 820, player.z + _moonDir.z * 820);
  moon.material.opacity = night * Math.max(0, Math.min(1, (_moonDir.y - 0.06) * 6)) * 0.9;
  updateFireflies(t, night);
  updateMist(t, night);
  if (window._updateGrassField) window._updateGrassField();
  if (started) cryptidUpdate(night);
  farDisc.material.color.copy(scene.fog.color);
  farDisc.position.x = player.x; farDisc.position.z = player.z;
  landmarkUpdate(dt, t);
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

  if (started && !dead) {
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
    noiseLevel = stickMag > 0.02 ? (sprinting ? 2 : 1) : 0;
    const sprint = sprinting ? 1.65 : 1;
    const sp = 5.4 * sprint * (drawing ? 0.55 : 1) * (IS_TOUCH ? Math.max(stickMag, 0.25) : 1);
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    let nx = player.x + (-sin * mz + cos * mx) * sp * dt;
    let nz = player.z + (-cos * mz - sin * mx) * sp * dt;
    // tree collision
    for (const tr of TREES) {
      const d = Math.hypot(nx - tr.x, nz - tr.z);
      if (d < tr.r + 0.5) {
        const push = (tr.r + 0.5 - d);
        nx += (nx - tr.x) / (d || 1) * push; nz += (nz - tr.z) / (d || 1) * push;
      }
    }
    const lim = WORLD * 0.47;
    nx = Math.max(-lim, Math.min(lim, nx)); nz = Math.max(-lim, Math.min(lim, nz));
    const ny = heightAt(nx, nz);
    if (ny > WATER_Y - 0.4) { player.x = nx; player.z = nz; player.y = ny; }

    // bow — at full draw it RAISES to your eye: grip near center,
    // nock at the cheek, slight zoom like focusing down the arrow
    if (drawing) drawT = Math.min(1, drawT + dt / 0.85);
    else drawT = Math.max(0, drawT - dt * 4);   // relax down if cancelled
    if (drawing && drawT > 0 && audio.drawCreak) audio.drawCreak(drawT);
    document.getElementById('crosshair').classList.toggle('drawn', drawT > 0.5);
    const e = drawT * drawT * (3 - 2 * drawT);  // smoothstep — weighty
    bow.position.set(0.34 + (-0.055 - 0.34) * e,   // riser lands LEFT of the eye-line
                     -0.4 + (-0.09 + 0.4) * e,
                     -0.62 + (-0.52 + 0.62) * e);
    bow.rotation.set(0.05, -0.55 + 0.41 * e, 0.21 - 0.17 * e);
    // walk bob + breath — you're holding it, not gliding with it
    bobPhase += dt * (mx || mz ? 7.5 : 1.6);
    bow.position.y += Math.sin(bobPhase) * (mx || mz ? 0.012 : 0.004);
    bow.position.x += Math.cos(bobPhase * 0.5) * (mx || mz ? 0.006 : 0.002);
    const targetFov = 70 - e * 8;
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
        toast('Hunger. Your body has begun eating itself. It will finish.');
      }
      if (player.hp <= 0 && !dead) { dead = true;
        resetDrawState();
        toast('Empty. The woods take back the meat that was you…', 4000);
        setTimeout(() => { player.hp = 100; player.meat = 0;
          player.lastAte = clock.elapsedTime; player.x = 0; player.z = 26;
          dead = false; renderHP(); }, 3500);
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

    // feed the score
    let wolfDist = 999;
    for (const a of animals)
      if (a.cfg.hunts && !a.dead) {
        const dd = Math.hypot(a.obj.position.x - player.x, a.obj.position.z - player.z);
        if (dd < wolfDist) wolfDist = dd;
      }
    audio.update(dt, {
      moving: !!(mx || mz), sprint: sprinting,
      wolfDist, lakeDist: Math.hypot(player.x - 70, player.z + 90),
      night: window._night || 0, hp: player.hp,
    });
  }

  if (!started) {
    // title screen: slow drift over the meadow toward the lake, the
    // world breathing behind the wordmark
    const a = t * 0.021;
    const cx = -20 + Math.cos(a) * 26, cz = 0 + Math.sin(a) * 26;
    camera.position.set(cx, Math.max(heightAt(cx, cz), WATER_Y) + 7.5, cz);
    camera.lookAt(70, heightAt(70, -90) + 14, -90);
    camera.rotation.order = 'YXZ';
  } else {
    camera.position.set(player.x, player.y + EYE, player.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }
  sun.target.position.set(player.x, player.y, player.z);
  sun.position.set(player.x - 180, player.y + 95, player.z - 60);

  window._tickInfo = { f: (window._tickInfo?.f || 0) + 1, n: animals.length,
                       px: Math.round(player.x), pz: Math.round(player.z) };
  for (const a of animals) animalUpdate(a, dt);
  arrowUpdate(dt);
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
  document.getElementById('loadmsg').textContent = 'it is ready. it was always hungry.';
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

document.getElementById('play').addEventListener('click', () => {
  started = true;
  bow.visible = true;
  updateBowString(0);
  document.getElementById('hud').style.opacity = 1;
  try { audio.start(); } catch (e) { console.warn('audio unavailable:', e); }
  // no tutorial, no informing HUD — they learn the hard way.
  setTimeout(() => toast('You are hungry. So is everything else here.', 6200), 1200);
  document.getElementById('title').style.opacity = 0;
  setTimeout(() => document.getElementById('title').style.display = 'none', 650);
  if (!IS_TOUCH) canvas.requestPointerLock();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
});
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
