import * as THREE from 'three';
import { PointerLockControls } from './vendor/controls/PointerLockControls.js';

// ---------------------------------------------------------------
// ONI — first-person prototype
// Controls: three.js's own official PointerLockControls (MIT,
// vendor/controls/) — the standard, battle-tested FPS mouse-look,
// used the same way as its official example. Movement/gravity below
// follows that same official example's pattern (velocity + damping).
//
// Physics principles applied (from ONI_PHYSICS_RESEARCH.md):
//  - phantom/physical decoupling: sword target follows mouse impulses,
//    spring-damper (PD controller) pulls the visible blade toward it.
//  - velocity-gated damage: only a fast, committed swing cuts.
//  - Alyx gun laws: one-handed, deliberate draw, diegetic ammo (pips).
//  - SUPERHOT time-couples-to-motion: stand still, time nearly stops.
//  - the drink: vignette + warm grade + time-ease, diegetic comfort.
//  - agency asymmetry: the camera is NEVER forcibly moved.
// ---------------------------------------------------------------

// never fail silently into a black screen — show it
window.addEventListener('error', e => showFatal(e.message));
window.addEventListener('unhandledrejection', e => showFatal(String(e.reason)));
function showFatal(msg) {
  let el = document.getElementById('fatal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal';
    el.style.cssText = 'position:fixed;inset:0;z-index:999;background:#2a0806;color:#ffdede;font:14px/1.5 monospace;padding:24px;overflow:auto;white-space:pre-wrap';
    document.body.appendChild(el);
  }
  el.textContent += '\n' + msg;
}

try {
  main();
} catch (e) {
  showFatal('Init failed: ' + (e && e.stack || e));
}

function main() {

const clock = new THREE.Clock();
let W = innerWidth, H = innerHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141a2e); // dusk blue — never pure black, always legible
scene.fog = new THREE.FogExp2(0x141a2e, 0.028);

const camera = new THREE.PerspectiveCamera(72, W / H, 0.05, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

addEventListener('resize', () => {
  W = innerWidth; H = innerHeight;
  camera.aspect = W / H; camera.updateProjectionMatrix();
  renderer.setSize(W, H);
});

// ---------------- controls (official three.js pattern) ----------------
const controls = new PointerLockControls(camera, renderer.domElement);
const player = controls.getObject(); // yaw+pitch rig, standard usage
scene.add(player);
player.position.set(0, 1.65, 6);

const isTouch = matchMedia('(pointer: coarse)').matches;
const startOverlay = document.getElementById('center');
const startBtn = document.getElementById('startBtn');
let locked = false;

controls.addEventListener('lock', () => { locked = true; startOverlay.style.display = 'none'; });
controls.addEventListener('unlock', () => { locked = false; if (!isTouch) startOverlay.style.display = ''; });

startBtn.addEventListener('click', () => {
  if (isTouch) { startOverlay.style.display = 'none'; locked = true; enableTouchControls(); return; }
  controls.lock();
});

// ---------------- environment ----------------
function cobbleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#22282b'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 10;
    const b = 30 + Math.random() * 28;
    g.fillStyle = `rgb(${b},${b + 4},${b + 6})`;
    g.beginPath(); g.ellipse(x, y, r, r * (0.7 + Math.random() * 0.3), Math.random() * Math.PI, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(43,224,127,.05)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(Math.random() * 256, 0); g.lineTo(Math.random() * 256, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 40);
  return t;
}
const groundMat = new THREE.MeshStandardMaterial({ map: cobbleTexture(), roughness: 0.95, metalness: 0.05 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 140), groundMat);
ground.rotation.x = -Math.PI / 2; ground.position.z = -30;
scene.add(ground);
const sheen = new THREE.Mesh(new THREE.PlaneGeometry(40, 140),
  new THREE.MeshStandardMaterial({ color: 0x2be07f, transparent: true, opacity: 0.04, roughness: 0.1, metalness: 0.9 }));
sheen.rotation.x = -Math.PI / 2; sheen.position.set(0, 0.001, -30);
scene.add(sheen);

function buildingRow(side) {
  const group = new THREE.Group();
  let z = 10;
  while (z > -70) {
    const w = 4 + Math.random() * 3, h = 6 + Math.random() * 10, d = 6 + Math.random() * 4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x171d20, roughness: 0.9 }));
    mesh.position.set(side * (10 + w / 2), h / 2, z - d / 2);
    group.add(mesh);
    const winCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < winCount; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.35),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xffb35c : 0x52cfc6 }));
      win.position.set(side * (10 + w + 0.02) - side * 0.02, 1.5 + i * (h / winCount), z - d / 2);
      win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(win);
    }
    z -= d + 1 + Math.random() * 3;
  }
  return group;
}
scene.add(buildingRow(1)); scene.add(buildingRow(-1));

// hanging lanterns — guarantee a REAL light near spawn so frame 1 is never dark
const lanterns = [];
function addLantern(x, y, z, real) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff9248 }));
  m.position.set(x, y, z); scene.add(m);
  if (real) {
    const l = new THREE.PointLight(0xff9248, 4.5, 11, 2);
    l.position.copy(m.position); scene.add(l);
  }
  lanterns.push(m);
}
addLantern(-1.6, 3.0, 3, true); // guaranteed lit lantern right at spawn
addLantern(1.8, 3.2, 1, true);
for (let z = -2; z > -60; z -= 6) {
  addLantern(-2.6 + Math.random() * 5.2, 3.2 + Math.random() * 1.4, z, Math.random() < 0.45);
}

function blossomTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#f3a6c0'; g.beginPath(); g.arc(16, 16, 13, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(12, 12, 5, 0, 7); g.fill();
  return new THREE.CanvasTexture(c);
}
const N_BLOSSOM = 180;
const bPos = new Float32Array(N_BLOSSOM * 3);
const bVel = [];
for (let i = 0; i < N_BLOSSOM; i++) {
  bPos[i * 3] = (Math.random() - 0.5) * 22;
  bPos[i * 3 + 1] = Math.random() * 8;
  bPos[i * 3 + 2] = (Math.random() - 0.5) * 80 - 10;
  bVel.push({ x: (Math.random() - 0.5) * 0.25, y: -0.25 - Math.random() * 0.35, s: Math.random() * 6 });
}
const bGeo = new THREE.BufferGeometry();
bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
const blossoms = new THREE.Points(bGeo, new THREE.PointsMaterial({
  size: 0.14, map: blossomTexture(), transparent: true, depthWrite: false, alphaTest: 0.1,
}));
scene.add(blossoms);

const ambient = new THREE.AmbientLight(0x3c4a44, 1.7); scene.add(ambient);
const hemi = new THREE.HemisphereLight(0x3a5a54, 0x14181a, 1.1); scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9fc4d4, 0.7); moon.position.set(-4, 10, 6); scene.add(moon);
const handLight = new THREE.PointLight(0xbfe8d0, 0.9, 4.5, 2);
camera.add(handLight); handLight.position.set(0.2, -0.2, 0.3);
scene.add(camera); // camera must be in the graph for its child light to render

// ---------------- input ----------------
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; onKeyDown(e.code); });
addEventListener('keyup', e => { keys[e.code] = false; });

let mouseDX = 0, mouseDY = 0;
addEventListener('mousemove', e => {
  if (!locked || isTouch) return;
  mouseDX += e.movementX; mouseDY += e.movementY;
});
addEventListener('mousedown', e => { if (locked && e.button === 0 && !isTouch) fireOrNothing(); });

// ---------------- sword: phantom/physical decoupling ----------------
const swordPivot = new THREE.Group();
camera.add(swordPivot);
swordPivot.position.set(0.32, -0.28, -0.55);
swordPivot.rotation.set(-0.35, 0.5, 0.15);

const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd7e2da, metalness: 0.9, roughness: 0.15, emissive: 0x0a2015, emissiveIntensity: 0.4 });
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.75, 0.09), bladeMat);
blade.position.y = 0.55;
const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 8), new THREE.MeshStandardMaterial({ color: 0x1a1512, metalness: 0.7, roughness: 0.5 }));
const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.8 }));
tsuka.position.y = -0.11;
const swordMesh = new THREE.Group(); swordMesh.add(blade, tsuba, tsuka);
swordPivot.add(swordMesh);

const swordOffset = new THREE.Vector3();
const swordVel = new THREE.Vector3();
const SPRING_LIN = 620, DAMP_LIN = 26;
const SPRING_ANG = 40, DAMP_ANG = 7;
const MAX_REACH = 0.85;
const swordAngVel = new THREE.Vector3();
const swordAngOffset = new THREE.Vector3();

let tipPrevWorld = new THREE.Vector3();
let tipSpeed = 0;
const tipLocal = new THREE.Vector3(0, 1.0, 0);

function updateSword(dt) {
  const IMPULSE = 0.016;
  swordVel.x += mouseDX * IMPULSE;
  swordVel.y -= mouseDY * IMPULSE;
  swordAngVel.z += -mouseDX * 0.10;
  swordAngVel.x += mouseDY * 0.10;

  const ax = -SPRING_LIN * swordOffset.x - DAMP_LIN * swordVel.x;
  const ay = -SPRING_LIN * swordOffset.y - DAMP_LIN * swordVel.y;
  swordVel.x += ax * dt; swordVel.y += ay * dt;
  swordOffset.x += swordVel.x * dt; swordOffset.y += swordVel.y * dt;
  if (swordOffset.length() > MAX_REACH) swordOffset.setLength(MAX_REACH);

  const aax = -SPRING_ANG * swordAngOffset.x - DAMP_ANG * swordAngVel.x;
  const aaz = -SPRING_ANG * swordAngOffset.z - DAMP_ANG * swordAngVel.z;
  swordAngVel.x += aax * dt; swordAngVel.z += aaz * dt;
  swordAngOffset.x += swordAngVel.x * dt; swordAngOffset.z += swordAngVel.z * dt;

  swordMesh.position.copy(swordOffset);
  swordMesh.rotation.x = swordAngOffset.x;
  swordMesh.rotation.z = swordAngOffset.z;

  const tipWorld = tipLocal.clone().add(swordOffset);
  swordPivot.localToWorld(tipWorld);
  tipSpeed = tipPrevWorld.lengthSq() ? tipWorld.distanceTo(tipPrevWorld) / dt : 0;
  tipPrevWorld.copy(tipWorld);

  const heat = Math.min(1, tipSpeed / 9);
  bladeMat.emissiveIntensity = 0.35 + heat * 1.4;
  bladeMat.emissive.setRGB(0.06 + heat * 0.05, 0.75 * heat + 0.08, 0.35 * heat + 0.06);

  mouseDX = 0; mouseDY = 0;
  return tipWorld;
}

const CUT_THRESHOLD = 6.0;

// ---------------- gun ----------------
const gunPivot = new THREE.Group();
camera.add(gunPivot);
gunPivot.position.set(0.22, -0.42, -0.5);
const gunMat = new THREE.MeshStandardMaterial({ color: 0x14181a, metalness: 0.85, roughness: 0.3 });
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.32), gunMat);
const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.16), gunMat);
gunBarrel.position.set(0, 0.03, -0.24);
const gunGroup = new THREE.Group(); gunGroup.add(gunBody, gunBarrel);
gunGroup.visible = false;
gunPivot.add(gunGroup);
const muzzleFlash = new THREE.PointLight(0xfff2c0, 0, 4, 2);
muzzleFlash.position.set(0, 0.03, -0.4);
gunPivot.add(muzzleFlash);

let gunState = 'holstered';
let ammo = 6, ammoMax = 6;
const gunHoldPos = new THREE.Vector3(0.22, -0.5, -0.35);
const gunReadyPos = new THREE.Vector3(0.22, -0.16, -0.42);
let gunT = 0;

function onKeyDown(code) {
  if (code === 'KeyQ') toggleDraw();
  if (code === 'KeyR') reload();
  if (code === 'KeyE') drink();
}
function toggleDraw() {
  if (gunState === 'holstered' || gunState === 'empty') { gunState = 'drawing'; gunT = 0; gunGroup.visible = true; setState('drawing'); }
  else if (gunState === 'ready') { gunState = 'holstered'; setState('sword'); }
}
function reload() {
  if (gunState === 'holstered') return;
  gunState = 'drawing'; gunT = 0; ammo = ammoMax; setState('reloading');
}
function fireOrNothing() {
  if (gunState !== 'ready') return;
  if (ammo <= 0) { gunState = 'empty'; dryClick(); return; }
  ammo--; gunState = 'firing'; gunT = 0;
  muzzleFlash.intensity = 6;
  raycastShot();
  updateAmmoPips();
}
function dryClick() {
  gunGroup.rotation.x = -0.25;
  setTimeout(() => { if (gunGroup) gunGroup.rotation.x = 0; }, 140);
}
function updateGun(dt) {
  gunT += dt;
  if (gunState === 'drawing') {
    const t = Math.min(1, gunT / 0.42);
    gunGroup.position.lerpVectors(gunHoldPos, gunReadyPos, easeOut(t));
    if (t >= 1) { gunState = 'ready'; setState(ammo > 0 ? 'gun' : 'gun · empty'); }
  } else if (gunState === 'firing') {
    const t = Math.min(1, gunT / 0.16);
    gunGroup.position.y = gunReadyPos.y + Math.sin(t * Math.PI) * 0.03;
    gunGroup.rotation.x = -Math.sin(t * Math.PI) * 0.18;
    muzzleFlash.intensity = Math.max(0, muzzleFlash.intensity - dt * 40);
    if (t >= 1) { gunState = ammo > 0 ? 'ready' : 'empty'; setState(ammo > 0 ? 'gun' : 'gun · empty'); }
  } else if (gunState === 'holstered') {
    gunGroup.position.copy(gunHoldPos);
    if (gunGroup.visible) gunGroup.visible = false;
  }
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// ---------------- HUD pips (symbols, no numbers) ----------------
const ammoPipsEl = document.getElementById('ammoPips');
const drinkPipsEl = document.getElementById('drinkPips');
const wavePipsEl = document.getElementById('wavePips');
const stateTag = document.getElementById('stateTag');
function setState(s) { stateTag.textContent = s; }
function updateAmmoPips() {
  ammoPipsEl.innerHTML = '';
  for (let i = 0; i < ammoMax; i++) {
    const s = document.createElement('span'); s.className = 'pip' + (i >= ammo ? ' spent' : ''); s.textContent = '●';
    ammoPipsEl.appendChild(s);
  }
}
let drinksLeft = 3, drinkLevel = 0;
function updateDrinkPips() {
  drinkPipsEl.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('span'); s.className = 'pip' + (i >= drinksLeft ? ' spent' : ''); s.textContent = '⚱';
    drinkPipsEl.appendChild(s);
  }
}
function drink() {
  if (drinksLeft <= 0) return;
  drinksLeft--; drinkLevel = Math.min(1, drinkLevel + 0.42);
  updateDrinkPips();
}
updateAmmoPips(); updateDrinkPips();

// ---------------- enemies ----------------
const enemies = [];
function makeEnemy(z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.05, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c2226, roughness: 0.8 }));
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x262e33, roughness: 0.7 }));
  head.position.y = 1.75;
  const wep = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.07), new THREE.MeshStandardMaterial({ color: 0xcfd8d2, metalness: 0.8, roughness: 0.2, emissive: 0x000000 }));
  wep.position.set(0.32, 1.1, -0.15); wep.rotation.x = -0.6;
  g.add(body, head, wep);
  g.position.set((Math.random() - 0.5) * 3, 0, z);
  g.userData = { body, head, wep, state: 'approach', t: 0, hp: 1, engageDist: 2.4 };
  scene.add(g);
  return g;
}
const waveDefs = [1, 2, 2];
let waveIdx = 0;
function spawnWave(n) {
  for (let i = 0; i < n; i++) enemies.push(makeEnemy(-8 - i * 3 - Math.random() * 2));
  updateWavePips();
}
function updateWavePips() {
  wavePipsEl.innerHTML = '';
  const remaining = enemies.filter(e => e.userData.state !== 'dead').length + (waveDefs.length - waveIdx - 1 > 0 ? waveDefs.slice(waveIdx + 1).reduce((a, b) => a + b, 0) : 0);
  for (let i = 0; i < remaining; i++) { const s = document.createElement('span'); s.textContent = '刃'; wavePipsEl.appendChild(s); }
}
spawnWave(waveDefs[0]);

let hitStopT = 0;
function hitStop(dur) { hitStopT = dur; }

function updateEnemies(dt, dtScaled, playerPos) {
  let allDeadThisWave = true;
  for (const e of enemies) {
    const u = e.userData;
    if (u.state === 'dead') continue;
    allDeadThisWave = false;
    const toPlayer = new THREE.Vector3().subVectors(playerPos, e.position); toPlayer.y = 0;
    const dist = toPlayer.length();

    if (u.state === 'approach') {
      if (dist > u.engageDist) {
        toPlayer.normalize();
        e.position.addScaledVector(toPlayer, 1.1 * dtScaled);
        e.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      } else { u.state = 'telegraph'; u.t = 0; }
    } else if (u.state === 'telegraph') {
      u.t += dtScaled;
      const g = Math.min(1, u.t / 0.8);
      u.wep.material.emissive.setRGB(0.9 * g, 0.15 * g, 0.05 * g);
      u.wep.material.emissiveIntensity = g * 1.5;
      u.wep.rotation.x = -0.6 - g * 1.1;
      if (g >= 1) { u.state = 'strike'; u.t = 0; }
    } else if (u.state === 'strike') {
      u.t += dtScaled;
      const g = Math.min(1, u.t / 0.22);
      u.wep.rotation.x = -1.7 + g * 2.0;
      if (g >= 1) {
        if (dist < u.engageDist + 0.4) {
          const blocking = swordOffset.length() > 0.35;
          if (!blocking) playerHit(); else parryFlash();
        }
        u.state = 'recover'; u.t = 0;
      }
    } else if (u.state === 'recover') {
      u.t += dtScaled;
      u.wep.material.emissiveIntensity = Math.max(0, u.wep.material.emissiveIntensity - dtScaled * 2);
      if (u.t > 0.7) { u.state = 'approach'; u.wep.rotation.x = -0.6; }
    } else if (u.state === 'staggered') {
      u.t += dtScaled;
      e.rotation.z = Math.sin(u.t * 20) * 0.05;
      if (u.t > 0.35) u.state = 'approach';
    } else if (u.state === 'dying') {
      u.t += dt;
      e.rotation.x = Math.min(Math.PI / 2, u.t * 4);
      e.position.y = -u.t * 0.4;
      e.traverse(c => { if (c.material) { c.material.transparent = true; c.material.opacity = Math.max(0, 1 - u.t * 0.8); } });
      if (u.t > 1.3) { u.state = 'dead'; scene.remove(e); updateWavePips(); }
    }

    if (u.state !== 'dead' && u.state !== 'dying') {
      const target = e.position.clone(); target.y = 1.0;
      const tipWorld = swordPivot.localToWorld(tipLocal.clone().add(swordOffset));
      const hitDist = tipWorld.distanceTo(target);
      if (hitDist < 0.55 && tipSpeed > CUT_THRESHOLD) {
        u.state = 'dying'; u.t = 0;
        hitStop(0.06);
      }
    }
  }
  if (allDeadThisWave && waveIdx < waveDefs.length - 1) {
    waveIdx++;
    setTimeout(() => spawnWave(waveDefs[waveIdx]), 1400);
  } else if (allDeadThisWave && waveIdx === waveDefs.length - 1 && !window.__oniWon) {
    window.__oniWon = true;
    document.getElementById('endcard').style.opacity = 1;
  }
}

function playerHit() {
  const el = document.getElementById('hitFlash');
  el.style.background = 'rgba(191,47,29,.42)';
  setTimeout(() => el.style.background = 'rgba(191,47,29,0)', 130);
  hitStop(0.05);
}
function parryFlash() {
  const el = document.getElementById('hitFlash');
  el.style.background = 'rgba(43,224,127,.28)';
  setTimeout(() => el.style.background = 'rgba(191,47,29,0)', 100);
}

function raycastShot() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(origin, dir, 0, 30);
  for (const e of enemies) {
    if (e.userData.state === 'dead' || e.userData.state === 'dying') continue;
    const hits = ray.intersectObject(e, true);
    if (hits.length) { e.userData.state = 'dying'; e.userData.t = 0; hitStop(0.06); break; }
  }
}

// ---------------- movement (official-example pattern) + time dilation ----------------
const moveVel = new THREE.Vector3();
const moveDir = new THREE.Vector3();
let globalTimeScale = 0.15;
let motionSmoothed = 0;
let touchMove = { x: 0, y: 0 }; // virtual joystick, -1..1

function updateMovement(dt) {
  const SPEED = 26, DAMP = 9;
  moveVel.x -= moveVel.x * DAMP * dt;
  moveVel.z -= moveVel.z * DAMP * dt;

  moveDir.z = Number(keys['KeyW'] || 0) - Number(keys['KeyS'] || 0) - touchMove.y;
  moveDir.x = Number(keys['KeyD'] || 0) - Number(keys['KeyA'] || 0) + touchMove.x;
  moveDir.normalize();

  if (keys['KeyW'] || keys['KeyS'] || touchMove.y) moveVel.z -= moveDir.z * SPEED * dt;
  if (keys['KeyA'] || keys['KeyD'] || touchMove.x) moveVel.x -= moveDir.x * SPEED * dt;

  controls.moveRight(-moveVel.x * dt);
  controls.moveForward(-moveVel.z * dt);
  player.position.x = THREE.MathUtils.clamp(player.position.x, -9, 9);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -66, 8);
  player.position.y = 1.65;

  const speedNow = Math.hypot(moveVel.x, moveVel.z);
  const bodyMotion = Math.min(1, speedNow / SPEED * 3);
  const handMotion = Math.min(1, tipSpeed / 5);
  const rawMotion = Math.max(bodyMotion, handMotion * 0.7);
  motionSmoothed += (rawMotion - motionSmoothed) * 0.12;
  const drinkEase = drinkLevel * 0.5;
  globalTimeScale = THREE.MathUtils.clamp(0.06 + motionSmoothed * 0.94 - drinkEase, 0.04, 1.05);
}

// ---------------- touch controls (phone) ----------------
function enableTouchControls() {
  const wrap = document.createElement('div');
  wrap.id = 'touchUI';
  wrap.innerHTML = `
    <div id="tJoyBase"><div id="tJoyNub"></div></div>
    <div id="tLookZone"></div>
    <button id="tFire" class="tbtn tbtn-big">⚔</button>
    <button id="tDraw" class="tbtn">Q</button>
    <button id="tDrink" class="tbtn">⚱</button>`;
  document.body.appendChild(wrap);
  const style = document.createElement('style');
  style.textContent = `
    #touchUI{position:fixed;inset:0;z-index:20;touch-action:none}
    #tLookZone{position:absolute;right:0;top:0;width:60%;height:100%}
    #tJoyBase{position:absolute;left:30px;bottom:30px;width:110px;height:110px;border-radius:50%;background:rgba(234,243,237,.08);border:1px solid rgba(234,243,237,.25)}
    #tJoyNub{position:absolute;left:35px;top:35px;width:40px;height:40px;border-radius:50%;background:rgba(43,224,127,.5)}
    .tbtn{position:absolute;pointer-events:auto;border-radius:50%;border:1px solid rgba(234,243,237,.3);background:rgba(10,15,12,.55);color:#eaf3ed;font-size:20px}
    .tbtn-big{right:26px;bottom:110px;width:78px;height:78px;font-size:30px;color:#2be07f}
    #tDraw{right:30px;bottom:26px;width:52px;height:52px}
    #tDrink{right:118px;bottom:26px;width:52px;height:52px}
  `;
  document.head.appendChild(style);

  const base = document.getElementById('tJoyBase'), nub = document.getElementById('tJoyNub');
  let joyId = null, joyOrigin = { x: 0, y: 0 };
  base.addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; joyId = t.identifier;
    const r = base.getBoundingClientRect(); joyOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { passive: true });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = t.clientX - joyOrigin.x, dy = t.clientY - joyOrigin.y;
        const max = 45, len = Math.hypot(dx, dy);
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        nub.style.left = 35 + dx + 'px'; nub.style.top = 35 + dy + 'px';
        touchMove.x = dx / max; touchMove.y = dy / max;
      }
    }
  }, { passive: true });
  addEventListener('touchend', e => {
    for (const t of e.changedTouches) if (t.identifier === joyId) {
      joyId = null; touchMove.x = 0; touchMove.y = 0;
      nub.style.left = '35px'; nub.style.top = '35px';
    }
  });

  const lookZone = document.getElementById('tLookZone');
  let lookId = null, lastX = 0, lastY = 0;
  lookZone.addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; lookId = t.identifier; lastX = t.clientX; lastY = t.clientY;
  }, { passive: true });
  lookZone.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (t.identifier === lookId) {
      mouseDX += (t.clientX - lastX) * 1.4; mouseDY += (t.clientY - lastY) * 1.4;
      lastX = t.clientX; lastY = t.clientY;
    }
  }, { passive: true });
  lookZone.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; });

  document.getElementById('tFire').addEventListener('touchstart', e => { e.preventDefault(); fireOrNothing(); }, { passive: false });
  document.getElementById('tDraw').addEventListener('touchstart', e => { e.preventDefault(); toggleDraw(); }, { passive: false });
  document.getElementById('tDrink').addEventListener('touchstart', e => { e.preventDefault(); drink(); }, { passive: false });
}

// touch look also feeds the sword (swipe = swing), same physics as mouse
let touchLookDX = 0, touchLookDY = 0;
addEventListener('touchmove', e => {
  if (!isTouch || !locked) return;
});

// ---------------- main loop ----------------
function applyTouchLookToCamera(yawDelta, pitchDelta) {
  player.rotation.y -= yawDelta * 0.0022;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  euler.setFromQuaternion(camera.quaternion);
  euler.x = THREE.MathUtils.clamp(euler.x - pitchDelta * 0.0022, -1.2, 1.2);
  camera.quaternion.setFromEuler(euler);
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (isTouch && locked) {
    applyTouchLookToCamera(mouseDX, mouseDY);
  }

  updateMovement(dt);

  hitStopT = Math.max(0, hitStopT - dt);
  const dtScaled = hitStopT > 0 ? dt * 0.03 : dt * globalTimeScale;

  updateSword(dt);
  updateGun(dt);
  updateEnemies(dt, dtScaled, player.position);

  const arr = blossoms.geometry.attributes.position.array;
  for (let i = 0; i < N_BLOSSOM; i++) {
    arr[i * 3] += bVel[i].x * dtScaled;
    arr[i * 3 + 1] += bVel[i].y * dtScaled;
    arr[i * 3] += Math.sin(performance.now() * 0.0004 + bVel[i].s) * 0.002;
    if (arr[i * 3 + 1] < -0.2) { arr[i * 3 + 1] = 8; arr[i * 3] = (Math.random() - 0.5) * 22; }
  }
  blossoms.geometry.attributes.position.needsUpdate = true;

  drinkLevel = Math.max(0, drinkLevel - dt * 0.02);
  document.getElementById('drinkTint').style.opacity = drinkLevel.toFixed(2);
  document.getElementById('vignette').style.opacity = (0.55 + drinkLevel * 0.3).toFixed(2);

  renderer.render(scene, camera);
}

tick();

window.__oni = {
  drink, toggleDraw, reload,
  state: () => ({ gunState, ammo, drinksLeft, drinkLevel, waveIdx, enemies: enemies.length, tipSpeed, globalTimeScale, locked,
    enemyStates: enemies.map(e => ({ state: e.userData.state, dist: e.position.distanceTo(player.position).toFixed(2) })) }),
  simulateSwing: (dx, dy) => { mouseDX += dx; mouseDY += dy; },
  teleportEnemyClose: (i) => { if (enemies[i]) { enemies[i].position.set(0, 0, player.position.z - 1.6); enemies[i].userData.state = 'approach'; } },
  playerPos: () => player.position.toArray(),
  forceLock: () => { locked = true; startOverlay.style.display = 'none'; },
};

} // main()
