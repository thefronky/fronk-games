// FRONK WILDS — open-world scout-survey (hunting) game
// Three.js r160, Quaternius CC0 animated animals, all procedural world.
window._V = 8;
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { AudioEngine } from './audio.js';

const audio = new AudioEngine();
window._audio = audio;

// ───────────────────────── config ─────────────────────────
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const WORLD = 860;            // square world size
const WATER_Y = 2.1;          // lake level
const EYE = 1.7;
const CFG = IS_TOUCH
  ? { grass: 5200, trees: 200, rocks: 60, px: 1.6, shadow: 1024 }
  : { grass: 11000, trees: 300, rocks: 90, px: 2, shadow: 2048 };

const SPECIES = {
  Deer: { n: 6,  speed: 3.0, gallop: 10.5, hp: 1, flee: 30, r: 1.5 },
  Stag: { n: 3,  speed: 2.7, gallop: 10.0, hp: 2, flee: 26, r: 1.7 },
  Fox:  { n: 4,  speed: 3.4, gallop: 11.5, hp: 1, flee: 22, r: 1.0 },
  Wolf: { n: 3,  speed: 3.2, gallop: 8.8,  hp: 2, flee: 0,  r: 1.2, hunts: true },
};

const LINES = {
  Deer: ['Deer documented. It is at peace now. You did this.',
         'One (1) deer, archived. The forest takes note.'],
  Stag: ['A STAG. The other animals will discuss this for years.',
         'Stag acquired. Somewhere, a lodge wall is calling.'],
  Fox:  ['Fox archived. Nothing personal, it was simply orange.',
         'The fox has been fully surveyed. Forever.'],
  Wolf: ['The wolf’s project has been cancelled.',
         'Wolf neutralized. It started it. This is documented.'],
  wound: ['Wounded. It remembers your face now.',
          'A graze. The paperwork calls this “partial data.”'],
  bite:  ['The wolf disagrees with the survey.',
          'You have been bitten. Note it in the log.'],
  death: 'YOU WERE SURVEYED BY WOLVES. The badge is awarded posthumously. Respawning…',
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
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8b07a);
scene.fog = new THREE.Fog(0xe8b07a, 90, 460);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);

// golden hour — Fronk's signature light
const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
sun.position.set(-180, 95, -60);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(CFG.shadow);
sun.shadow.camera.left = sun.shadow.camera.bottom = -90;
sun.shadow.camera.right = sun.shadow.camera.top = 90;
sun.shadow.camera.far = 600;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xffc890, 0x3a4a2a, 0.85));

// sky dome — sunset gradient + sun glow
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(-0.86, 0.42, -0.28).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.05, 1.0);
        vec3 horizon = vec3(0.99, 0.62, 0.34);
        vec3 zenith  = vec3(0.18, 0.26, 0.45);
        vec3 col = mix(horizon, zenith, pow(h, 0.62));
        float s = max(dot(vDir, sunDir), 0.0);
        col += vec3(1.0, 0.78, 0.45) * pow(s, 220.0) * 1.6;  // disc
        col += vec3(1.0, 0.6, 0.3) * pow(s, 6.0) * 0.32;     // haze
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
scene.add(sky);

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
function heightAt(x, z) {
  let a = 0, f = 0.0042, amp = 26;
  for (let o = 0; o < 4; o++) { a += (vnoise(x * f + 37, z * f + 91) - 0.5) * 2 * amp; f *= 2.1; amp *= 0.44; }
  // central lake basin
  const d = Math.hypot(x - 70, z + 90) / 130;
  a -= Math.max(0, 1 - d * d) * 17;
  // gentle bowl toward edges so you see hills around you
  a += Math.hypot(x, z) / WORLD * 13;
  return a;
}

{
  const segs = IS_TOUCH ? 150 : 200;
  const g = new THREE.PlaneGeometry(WORLD, WORLD, segs, segs);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grassC = new THREE.Color(0x6d8f3e), dryC = new THREE.Color(0x9aa04c),
        dirtC = new THREE.Color(0x7c5b35), rockC = new THREE.Color(0x8d8678),
        sandC = new THREE.Color(0xc2a368);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z);
    pos.setY(i, y);
    const t = vnoise(x * 0.02, z * 0.02);
    let c = grassC.clone().lerp(dryC, t * 0.9);
    if (y < WATER_Y + 1.2) c = sandC.clone();
    else if (y > 21) c = rockC.clone();
    else if (y > 15) c = c.lerp(rockC, (y - 15) / 6);
    else if (t > 0.86) c = c.lerp(dirtC, 0.3);
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
    color: 0x3f86a0, transparent: true, opacity: 0.8,
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
  const w = new THREE.Mesh(new THREE.PlaneGeometry(420, 420, 48, 48), m);
  w.rotation.x = -Math.PI / 2;
  w.position.set(70, WATER_Y, -90);
  scene.add(w);
}

// ───────────────────────── wind-blown grass ─────────────────────────
const windUniforms = { uTime: { value: 0 } };
{
  const blade = new THREE.PlaneGeometry(0.3, 0.95, 1, 2);
  blade.translate(0, 0.47, 0);
  const cross = new THREE.PlaneGeometry(0.3, 0.95, 1, 2);
  cross.translate(0, 0.47, 0); cross.rotateY(Math.PI / 2);
  const geo = mergeGeoms([blade, cross]);
  const mat = new THREE.MeshLambertMaterial({
    color: 0x7da14a, side: THREE.DoubleSide, alphaTest: 0.05 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float wsway = sin(uTime*1.9 + instanceMatrix[3][0]*0.21 + instanceMatrix[3][2]*0.17);
       transformed.x += wsway * position.y * 0.34;
       transformed.z += cos(uTime*1.4 + instanceMatrix[3][0]*0.13) * position.y * 0.22;`);
  };
  const inst = new THREE.InstancedMesh(geo, mat, CFG.grass);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(),
        S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  let placed = 0, guard = 0;
  while (placed < CFG.grass && guard++ < CFG.grass * 12) {
    const x = (Math.random() - 0.5) * WORLD * 0.94,
          z = (Math.random() - 0.5) * WORLD * 0.94,
          y = heightAt(x, z);
    if (y < WATER_Y + 0.7 || y > 16) continue;
    P.set(x, y - 0.05, z);
    E.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI,
          (Math.random() - 0.5) * 0.3); Q.setFromEuler(E);
    const s = 0.6 + Math.random() * 0.75; S.set(s, s * (0.75 + Math.random() * 0.6), s);
    inst.setMatrixAt(placed, M.compose(P, Q, S));
    inst.setColorAt(placed, new THREE.Color().setHSL(
      0.24 + Math.random() * 0.05, 0.42 + Math.random() * 0.2, 0.32 + Math.random() * 0.12));
    placed++;
  }
  inst.count = placed;
  inst.instanceColor.needsUpdate = true;
  scene.add(inst);
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
  const trunk = new THREE.CylinderGeometry(0.32, 0.5, 3.2, 6);
  trunk.translate(0, 1.6, 0);
  const c1 = new THREE.ConeGeometry(2.6, 4.4, 7);  c1.translate(0, 5.0, 0);
  const c2 = new THREE.ConeGeometry(1.9, 3.4, 7);  c2.translate(0, 7.4, 0);
  const c3 = new THREE.ConeGeometry(1.15, 2.3, 7); c3.translate(0, 9.4, 0);
  const geo = mergeGeoms([trunk, c1, c2, c3]);
  // two-tone via vertex colors: trunk brown, canopy greens
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  const trunkN = trunk.toNonIndexed().attributes.position.count;
  const brown = new THREE.Color(0x6b4a2a);
  for (let i = 0; i < n; i++) {
    const green = new THREE.Color().setHSL(0.27 + Math.random() * 0.03, 0.45, 0.30 + Math.random() * 0.06);
    const c = i < trunkN ? brown : green;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const inst = new THREE.InstancedMesh(geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1,
      emissive: 0x16240e, emissiveIntensity: 0.55 }), CFG.trees);
  inst.castShadow = true;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(),
        S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  let placed = 0, guard = 0;
  window.TREES = [];
  while (placed < CFG.trees && guard++ < CFG.trees * 30) {
    const x = (Math.random() - 0.5) * WORLD * 0.92,
          z = (Math.random() - 0.5) * WORLD * 0.92,
          y = heightAt(x, z);
    if (y < WATER_Y + 1.5 || y > 17) continue;
    if (Math.hypot(x, z) < 18) continue;            // spawn clearing
    P.set(x, y - 0.15, z);
    E.set(0, Math.random() * Math.PI * 2, 0); Q.setFromEuler(E);
    const s = 0.8 + Math.random() * 1.1; S.set(s, s, s);
    inst.setMatrixAt(placed++, M.compose(P, Q, S));
    TREES.push({ x, z, r: 1.1 * s });
  }
  inst.count = placed;
  scene.add(inst);

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
  const mat = new THREE.MeshLambertMaterial({ color: 0xfff1de, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) {
    const grp = new THREE.Group();
    for (let p = 0; p < 4 + (Math.random() * 3 | 0); p++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 12);
      m.scale.setScalar(5 + Math.random() * 9);
      grp.add(m);
    }
    grp.position.set((Math.random() - 0.5) * 1400, 120 + Math.random() * 60, (Math.random() - 0.5) * 1400);
    grp.userData.v = 0.8 + Math.random() * 1.2;
    scene.add(grp);
    clouds.push(grp);
  }
}

// ───────────────────────── animals ─────────────────────────
const animals = [];
window._animals = animals;           // debug hook
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

function animalUpdate(a, dt) {
  window._auCalls = (window._auCalls || 0) + 1;
  a.mixer.update(dt);
  if (a.dead) {
    a.t -= dt;
    if (a.t <= 0) { scene.remove(a.obj); animals.splice(animals.indexOf(a), 1); spawn(a.name); }
    return;
  }
  const p = a.obj.position;
  const dx = player.x - p.x, dz = player.z - p.z;
  const dist = Math.hypot(dx, dz);

  if (a.cfg.hunts) {                          // ── wolf brain
    a.attackCd -= dt;
    if (dist < 2.6) {
      a.state = 'attack';
      if (a.attackCd <= 0) { setAnim(a, 'Attack', true); a.attackCd = 1.4; hurtPlayer(22); setTimeout(() => { if (!a.dead) a.cur = null; }, 700); }
    } else if (dist < 38) {
      a.state = 'stalk'; a.dir = Math.atan2(dx, dz);
      const sp = dist < 17 ? a.cfg.gallop : a.cfg.speed;
      setAnim(a, dist < 17 ? 'Gallop' : 'Walk');
      stepAnimal(a, sp, dt);
    } else wander(a, dt);
  } else {                                    // ── prey brain
    if (a.state === 'flee') {
      a.t -= dt;
      setAnim(a, 'Gallop');
      stepAnimal(a, a.cfg.gallop, dt);
      if (a.t <= 0 && dist > a.cfg.flee * 1.5) a.state = 'idle', a.t = 1 + Math.random() * 3;
    } else if (dist < a.cfg.flee) {
      a.state = 'flee'; a.t = 5 + Math.random() * 4;
      a.dir = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.7;
    } else wander(a, dt);
  }
  a.obj.rotation.y = lerpAngle(a.obj.rotation.y, a.dir, Math.min(1, dt * 6));
}

function wander(a, dt) {
  a.t -= dt;
  if (a.t <= 0) {
    const roll = Math.random();
    a.state = roll < 0.38 ? 'idle' : roll < 0.66 ? 'eat' : 'walk';
    a.t = 2.5 + Math.random() * 5;
    if (a.state === 'walk') a.dir += (Math.random() - 0.5) * 2.4;
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

function killAnimal(a) {
  a.dead = true; a.t = 9;
  setAnim(a, 'Death', true);
  score[a.name] = (score[a.name] || 0) + 1;
  toast(pick(LINES[a.name]));
  audio.documented();
  renderNotes();
}

// ───────────────────────── player ─────────────────────────
const player = { x: 0, z: 26, yaw: Math.PI, pitch: -0.04, hp: 100, lastHit: -99 };
window._player = player;
player.y = heightAt(player.x, player.z);
const score = {};
const keys = {};
let started = false, drawT = 0, drawing = false, dead = false;

function hurtPlayer(dmg) {
  if (dead) return;
  player.hp -= dmg; player.lastHit = clock.elapsedTime;
  audio.thud();
  document.getElementById('hurt').style.opacity = 1;
  setTimeout(() => document.getElementById('hurt').style.opacity = 0, 280);
  toast(pick(LINES.bite));
  if (player.hp <= 0) {
    dead = true;
    toast(LINES.death, 4000);
    setTimeout(() => {
      player.hp = 100; player.x = 0; player.z = 26; dead = false; renderHP();
    }, 3500);
  }
  renderHP();
}

// ───────────────────────── arrows ─────────────────────────
const arrows = [];
const arrowGeo = new THREE.ConeGeometry(0.05, 0.95, 5);
arrowGeo.rotateX(Math.PI / 2);
const arrowMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.8 });

function loose() {
  const power = Math.min(1, drawT);
  if (power < 0.12) { drawT = 0; return; }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  m.position.copy(camera.position).addScaledVector(dir, 0.8);
  scene.add(m);
  arrows.push({ m, v: dir.multiplyScalar(26 + power * 38), t: 6, power });
  audio.twang();
  drawT = 0;
}

window._loose = p => { drawT = p; loose(); };   // debug hooks
window._dbg = () => ({ started, dead, arrows: arrows.length,
  sample: animals[0] && { name: animals[0].name, state: animals[0].state,
    dist: Math.round(Math.hypot(player.x - animals[0].obj.position.x,
                                player.z - animals[0].obj.position.z)) } });
window._score = score;

function arrowUpdate(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (a.stuck) { a.t -= dt; if (a.t <= 0) { scene.remove(a.m); arrows.splice(i, 1); } continue; }
    a.v.y -= 21 * dt;
    a.m.position.addScaledVector(a.v, dt);
    a.m.lookAt(a.m.position.clone().add(a.v));
    // animal hit
    let hit = false;
    for (const an of animals) {
      if (an.dead) continue;
      const ap = an.obj.position;
      const dy = a.m.position.y - (ap.y + an.cfg.r * 0.75);
      if (Math.hypot(a.m.position.x - ap.x, a.m.position.z - ap.z) < an.cfg.r &&
          Math.abs(dy) < an.cfg.r * 1.4) {
        an.hp -= (a.power > 0.55 ? 2 : 1);
        if (an.hp <= 0) killAnimal(an);
        else {
          setAnim(an, 'HitReact_Left', true);
          setTimeout(() => { if (!an.dead) an.cur = null; }, 500);
          an.state = 'flee'; an.t = 8;
          an.dir = Math.atan2(ap.x - player.x, ap.z - player.z);
          toast(pick(LINES.wound));
        }
        scene.remove(a.m); arrows.splice(i, 1); hit = true; break;
      }
    }
    if (hit) continue;
    // ground hit
    if (a.m.position.y < heightAt(a.m.position.x, a.m.position.z)) {
      a.stuck = true; a.t = 5;
    }
    a.t -= dt; if (a.t <= 0) { scene.remove(a.m); arrows.splice(i, 1); }
  }
}

// bow viewmodel
const bow = new THREE.Group();
{
  // vertical arc, opening toward screen center — reads as a bow held
  // at the right hand, mostly out of frame
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(0.115, 0.0075, 6, 28, Math.PI * 1.05),
    new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 }));
  arc.rotation.z = Math.PI / 2 - Math.PI * 0.025;   // arc spans top→bottom on the left side
  bow.add(arc);
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0012, 0.0012, 0.225, 4),
    new THREE.MeshBasicMaterial({ color: 0xcfc4b2 }));
  string.position.x = 0.018;
  bow.add(string);
  bow.position.set(0.34, -0.27, -0.6);
  bow.rotation.set(0, -0.42, 0.1);
  camera.add(bow);
  scene.add(camera);
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
      }
    }
  }, { passive: false });
  addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; moveVec.x = moveVec.y = 0;
        knob.style.left = '50%'; knob.style.top = '50%'; }
      if (t.identifier === lookId) lookId = null;
    }
  });
  const btn = document.getElementById('shootBtn');
  btn.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; }, { passive: false });
  btn.addEventListener('touchend', e => { e.preventDefault(); drawing = false; loose(); }, { passive: false });
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
  const parts = Object.entries(score).map(([k, v]) => `${k} <b>${v}</b>`);
  document.getElementById('notes').innerHTML =
    'FIELD NOTES' + (parts.length ? ' — ' + parts.join(' · ') : ' — nothing documented yet');
}
function renderHP() {
  document.getElementById('hpfill').style.width = Math.max(0, player.hp) + '%';
}

// ───────────────────────── main loop ─────────────────────────
const clock = new THREE.Clock();
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
  for (const c of clouds) { c.position.x += c.userData.v * dt * 2; if (c.position.x > 800) c.position.x = -800; }

  if (started && !dead) {
    // movement
    let mx = 0, mz = 0;
    if (!IS_TOUCH) {
      mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    } else { mx = window.moveVec.x; mz = -window.moveVec.y; }
    const sprint = keys.ShiftLeft ? 1.65 : 1;
    const sp = 5.4 * sprint * (drawing ? 0.55 : 1);
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

    // bow
    if (drawing) drawT = Math.min(1, drawT + dt / 0.85);
    document.getElementById('crosshair').classList.toggle('drawn', drawT > 0.5);
    bow.position.z = -0.9 + drawT * 0.18;

    // slow regen
    if (t - player.lastHit > 8 && player.hp < 100) { player.hp = Math.min(100, player.hp + dt * 6); renderHP(); }

    // feed the score
    let wolfDist = 999;
    for (const a of animals)
      if (a.cfg.hunts && !a.dead) {
        const dd = Math.hypot(a.obj.position.x - player.x, a.obj.position.z - player.z);
        if (dd < wolfDist) wolfDist = dd;
      }
    audio.update(dt, {
      moving: !!(mx || mz), sprint: !!keys.ShiftLeft,
      wolfDist, lakeDist: Math.hypot(player.x - 70, player.z + 90),
    });
  }

  camera.position.set(player.x, player.y + EYE, player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  sun.target.position.set(player.x, player.y, player.z);
  sun.position.set(player.x - 180, player.y + 95, player.z - 60);

  window._tickInfo = { f: (window._tickInfo?.f || 0) + 1, n: animals.length,
                       px: Math.round(player.x), pz: Math.round(player.z) };
  for (const a of animals) animalUpdate(a, dt);
  arrowUpdate(dt);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ───────────────────────── boot ─────────────────────────
renderNotes(); renderHP();
loadAnimals().then(() => {
  document.getElementById('loadmsg').textContent = 'the wilderness is ready. it was always ready.';
}).catch(e => {
  document.getElementById('loadmsg').textContent = 'asset load failed: ' + e;
});

document.getElementById('play').addEventListener('click', () => {
  started = true;
  try { audio.start(); } catch (e) { console.warn('audio unavailable:', e); }
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
