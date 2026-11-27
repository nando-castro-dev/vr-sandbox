// SCENA Sandbox — v1. three.js + WebXR, desktop + phone fallback.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const STORE_KEY = 'scena-sandbox-build-v1';
const AUTO_KEY = 'scena-sandbox-autosave-v1';
const PALETTE = ['#a24bff', '#ffc83d', '#ff3db8', '#3de2ff', '#41ff8a', '#ff6b3d', '#ffffff', '#2b1a4a'];
const GRID = 0.5, ROT_STEP = Math.PI / 12, MAX_LIGHTS = 8, WORLD_R = 30;
const params = new URLSearchParams(location.search);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('capture') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.xr.enabled = true;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x12071f, 0.018);

const rig = new THREE.Group();              // player rig (moved by teleport / WASD)
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0);
rig.add(camera);
rig.position.set(0, 0, 7);

// ---------- environment ----------
scene.add(new THREE.HemisphereLight(0x8a5cff, 0x1a0b2e, 0.65));
const moonLight = new THREE.DirectionalLight(0xffe2a8, 1.1);
moonLight.position.set(-20, 30, -15);
scene.add(moonLight);
const keyLight = new THREE.DirectionalLight(0xc9a8ff, 0.9);
keyLight.position.set(15, 12, 20);
scene.add(keyLight);

// gradient sky
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x05020c) }, mid: { value: new THREE.Color(0x1c0838) }, bot: { value: new THREE.Color(0x4a1a6b) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top,mid,bot; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.0 ? mix(mid,top,smoothstep(0.0,0.6,h)) : mix(mid,bot,smoothstep(0.0,-0.2,h)); c += vec3(0.35,0.12,0.5)*pow(1.0-abs(h),10.0); gl_FragColor=vec4(c,1.); }',
}));
scene.add(sky);

// stars (seeded so captures are repeatable)
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
{
  const N = 1800, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const tints = [new THREE.Color(0xffffff), new THREE.Color(0xd2a8ff), new THREE.Color(0xffd98a)];
  for (let i = 0; i < N; i++) {
    const u = rnd(), v = rnd() * 0.95 + 0.05;
    const th = u * Math.PI * 2, ph = Math.acos(1 - v);
    pos.set([400 * Math.sin(ph) * Math.cos(th), 400 * Math.cos(ph), 400 * Math.sin(ph) * Math.sin(th)], i * 3);
    const t = tints[Math.floor(rnd() * 3)]; col.set([t.r, t.g, t.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.9 })));
}
// moon
{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,236,180,1)'); gr.addColorStop(0.35, 'rgba(255,210,110,.9)'); gr.addColorStop(0.5, 'rgba(255,200,61,.25)'); gr.addColorStop(1, 'rgba(255,200,61,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false }));
  s.position.set(-160, 150, -260); s.scale.setScalar(70); scene.add(s);
}

// ground + grids
const ground = new THREE.Mesh(new THREE.CircleGeometry(WORLD_R + 60, 96), new THREE.ShaderMaterial({
  uniforms: { R: { value: WORLD_R } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader: `uniform float R; varying vec3 vW;
    float gridLine(vec2 p, float scale, float width){ vec2 g = abs(fract(p/scale - 0.5) - 0.5) / (fwidth(p/scale)); return 1.0 - min(min(g.x, g.y) / width, 1.0); }
    void main(){
      vec2 p = vW.xz; float r = length(p);
      vec3 base = vec3(0.045, 0.02, 0.085);
      float fine = gridLine(p, 0.5, 1.0) * 0.25;
      float major = gridLine(p, 1.0, 1.2);
      float big = gridLine(p, 5.0, 1.6);
      vec2 ax = abs(p) / fwidth(p); float axis = 1.0 - min(min(ax.x, ax.y) / 1.6, 1.0);
      float inside = 1.0 - smoothstep(R - 0.5, R + 0.5, r);
      vec3 purple = vec3(0.42, 0.17, 0.85), gold = vec3(1.0, 0.78, 0.24);
      vec3 c = base + purple * (fine * 0.6 + major * 0.55) * inside + mix(purple, gold, 0.55) * big * 0.5 * inside + gold * axis * 0.8 * inside;
      c += purple * 0.12 * exp(-r * 0.12);
      float fog = 1.0 - exp(-pow(distance(cameraPosition, vW) * 0.03, 2.0));
      gl_FragColor = vec4(mix(c, vec3(0.07, 0.027, 0.12), fog), 1.0);
    }`,
}));
ground.rotation.x = -Math.PI / 2; ground.name = 'ground'; scene.add(ground);
// neon ring border + pillars
const ring = new THREE.Mesh(new THREE.TorusGeometry(WORLD_R, 0.06, 8, 160), new THREE.MeshBasicMaterial({ color: 0xa24bff }));
ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; scene.add(ring);
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2, gold = i % 3 === 0;
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, gold ? 5 : 3, 8), new THREE.MeshBasicMaterial({ color: gold ? 0xffc83d : 0xa24bff }));
  p.position.set(Math.cos(a) * WORLD_R, gold ? 2.5 : 1.5, Math.sin(a) * WORLD_R); scene.add(p);
}
// origin pad
const pad = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.32, 48), new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.7 }));
pad.rotation.x = -Math.PI / 2; pad.position.y = 0.004; scene.add(pad);

// ---------- objects ----------
const world = new THREE.Group(); world.name = 'world'; scene.add(world);
const GEOS = {
  cube: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 32, 20),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  cone: new THREE.ConeGeometry(0.5, 1, 32),
  ramp: (() => {
    const s = new THREE.Shape(); s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(-0.5, 0.5); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g;
  })(),
  light: new THREE.SphereGeometry(0.22, 24, 16),
};
const LABEL = { cube: 'Cube', sphere: 'Sphere', cylinder: 'Cylinder', cone: 'Cone', ramp: 'Ramp', light: 'Light' };
let currentColor = PALETTE[0];
let snapOn = true;

function makeObject(type, color = currentColor) {
  let mesh;
  if (type === 'light') {
    mesh = new THREE.Mesh(GEOS.light, new THREE.MeshBasicMaterial({ color }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
    halo.userData.halo = true; mesh.add(halo);
    const pl = new THREE.PointLight(color, 6, 9, 1.6); pl.userData.pl = true; mesh.add(pl);
  } else {
    mesh = new THREE.Mesh(GEOS[type], new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15, emissive: color, emissiveIntensity: 0.12 }));
  }
  mesh.userData = { ...mesh.userData, type, color, sandbox: true };
  return mesh;
}
function setColor(obj, color) {
  obj.userData.color = color;
  obj.material.color.set(color);
  if (obj.material.emissive) obj.material.emissive.set(color);
  obj.children.forEach(c => { if (c.isLight) c.color.set(color); else if (c.material) c.material.color.set(color); });
}
function halfHeight(obj) { return 0.5 * obj.scale.y * (obj.userData.type === 'light' ? 0.44 : 1); }
function lightCount() { return world.children.filter(o => o.userData.type === 'light').length; }

function serialize() {
  return world.children.map(o => ({ type: o.userData.type, color: o.userData.color,
    p: o.position.toArray().map(n => +n.toFixed(3)), q: o.quaternion.toArray().map(n => +n.toFixed(4)), s: o.scale.toArray().map(n => +n.toFixed(3)) }));
}
function deserialize(list) {
  select(null);
  world.clear();
  (list || []).forEach(d => {
    if (!GEOS[d.type]) return;
    const o = makeObject(d.type, d.color || PALETTE[0]);
    o.position.fromArray(d.p || [0, 0.5, 0]); o.quaternion.fromArray(d.q || [0, 0, 0, 1]); o.scale.fromArray(d.s || [1, 1, 1]);
    world.add(o);
  });
  updateCount();
}

// ---------- undo ----------
const undoStack = [];
function pushUndo() { undoStack.push(JSON.stringify(serialize())); if (undoStack.length > 60) undoStack.shift(); }
function undo() {
  if (!undoStack.length) return toast('Nothing to undo');
  deserialize(JSON.parse(undoStack.pop())); toast('↶ Undone'); autosave();
}

// ---------- selection ----------
let selected = null;
const selBox = new THREE.BoxHelper(undefined, 0xffc83d); selBox.visible = false; selBox.material.depthTest = false; selBox.renderOrder = 10; scene.add(selBox);
function select(obj) {
  selected = obj;
  selBox.visible = !!obj;
  if (obj) selBox.setFromObject(obj);
  const el = document.getElementById('selInfo');
  el.textContent = obj ? `✦ ${LABEL[obj.userData.type]} selected` : 'Nothing selected';
  el.classList.toggle('has', !!obj);
  if (obj) markSwatch(obj.userData.color);
  wrist.dirty = true;
}
function updateCount() { document.getElementById('countInfo').textContent = `${world.children.length} object${world.children.length === 1 ? '' : 's'}`; }

// ---------- actions ----------
function snapObj(o) {
  if (!snapOn) return;
  o.position.x = Math.round(o.position.x / GRID) * GRID;
  o.position.z = Math.round(o.position.z / GRID) * GRID;
  const hh = halfHeight(o);
  o.position.y = Math.max(hh, Math.round((o.position.y - hh) / GRID) * GRID + hh);
  const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ');
  e.x = Math.round(e.x / ROT_STEP) * ROT_STEP; e.y = Math.round(e.y / ROT_STEP) * ROT_STEP; e.z = Math.round(e.z / ROT_STEP) * ROT_STEP;
  o.quaternion.setFromEuler(e);
}
function keepAboveGround(o) { o.position.y = Math.max(halfHeight(o), o.position.y); }
function spawnPoint(dist = 4) {
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  camera.getWorldPosition(p); camera.getWorldDirection(d); d.y = 0;
  if (d.lengthSq() < 1e-4) d.set(0, 0, -1);
  d.normalize();
  return p.addScaledVector(d, dist);
}
function spawn(type, at) {
  if (type === 'light' && lightCount() >= MAX_LIGHTS) return toast(`Max ${MAX_LIGHTS} lights for smooth VR`);
  pushUndo();
  const o = makeObject(type);
  const p = at || spawnPoint();
  o.position.set(p.x, type === 'light' ? 1.6 : 0.5, p.z);
  // face the player
  const cp = new THREE.Vector3(); camera.getWorldPosition(cp);
  o.rotation.y = Math.atan2(cp.x - p.x, cp.z - p.z);
  snapObj(o); world.add(o); select(o); updateCount(); autosave();
  pop(o); toast(`✦ ${LABEL[type]} spawned`);
  return o;
}
const pops = [];
function pop(o) { pops.push({ o, t: 0, s: o.scale.clone() }); o.scale.multiplyScalar(0.01); }

function act(name) {
  const o = selected;
  const needSel = ['rotL', 'rotR', 'up', 'down', 'grow', 'shrink', 'dup', 'del'];
  if (needSel.includes(name) && !o) return toast('Select an object first');
  switch (name) {
    case 'rotL': case 'rotR': pushUndo(); o.rotateY(name === 'rotL' ? ROT_STEP : -ROT_STEP); break;
    case 'up': pushUndo(); o.position.y += GRID; break;
    case 'down': pushUndo(); o.position.y -= GRID; keepAboveGround(o); break;
    case 'grow': case 'shrink': {
      pushUndo(); const f = name === 'grow' ? 1.25 : 0.8;
      const bottom = o.position.y - halfHeight(o);
      o.scale.multiplyScalar(f); o.scale.clampScalar(0.1, 20);
      o.position.y = bottom + halfHeight(o); keepAboveGround(o); break;
    }
    case 'dup': {
      pushUndo(); const c = makeObject(o.userData.type, o.userData.color);
      c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale);
      const off = new THREE.Vector3(Math.max(1, o.scale.x), 0, 0).applyQuaternion(o.quaternion); off.y = 0;
      c.position.add(off.lengthSq() > 0.01 ? off : new THREE.Vector3(1, 0, 0));
      if (c.userData.type === 'light' && lightCount() >= MAX_LIGHTS) { undoStack.pop(); return toast(`Max ${MAX_LIGHTS} lights`); }
      world.add(c); select(c); updateCount(); pop(c); toast('⧉ Duplicated'); break;
    }
    case 'del': pushUndo(); world.remove(o); select(null); updateCount(); toast('🗑 Deleted'); break;
    case 'undo': return undo();
    case 'snap': snapOn = !snapOn; document.getElementById('btnSnap').classList.toggle('on', snapOn); wrist.dirty = true;
      if (snapOn && o) snapObj(o); toast(snapOn ? '▦ Snap ON' : 'Snap OFF'); break;
    case 'save': localStorage.setItem(STORE_KEY, JSON.stringify(serialize())); toast('💾 Saved to this browser'); return;
    case 'load': { const s = localStorage.getItem(STORE_KEY); if (!s) return toast('No saved build yet'); pushUndo(); deserialize(JSON.parse(s)); toast('📂 Loaded'); break; }
    case 'export': {
      const blob = new Blob([JSON.stringify({ app: 'scena-sandbox', v: 1, objects: serialize() }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `scena-build-${Date.now()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('⤓ Exported'); return;
    }
    case 'import': document.getElementById('fileInput').click(); return;
    case 'clear': if (!world.children.length) return; pushUndo(); deserialize([]); toast('✖ Cleared (Ctrl+Z to undo)'); break;
  }
  if (selected) { if (snapOn && ['up', 'down', 'grow', 'shrink', 'dup'].includes(name)) snapObj(selected); selBox.setFromObject(selected); }
  autosave();
}
function recolor(color) {
  currentColor = color; markSwatch(color);
  if (selected && selected.userData.color !== color) { pushUndo(); setColor(selected, color); autosave(); }
  wrist.dirty = true;
}
let saveT = 0;
function autosave() { clearTimeout(saveT); saveT = setTimeout(() => localStorage.setItem(AUTO_KEY, JSON.stringify(serialize())), 300); }

// ---------- HTML UI ----------
const toastEl = document.getElementById('toast'); let toastT = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 1600); }
const pal = document.getElementById('paletteGroup');
PALETTE.forEach(c => { const b = document.createElement('button'); b.className = 'swatch'; b.style.background = c; b.style.color = c; b.dataset.color = c; b.title = c; pal.appendChild(b); });
function markSwatch(c) { pal.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b.dataset.color === c)); }
markSwatch(currentColor);
document.getElementById('toolbar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.spawn) spawn(b.dataset.spawn);
  else if (b.dataset.color) recolor(b.dataset.color);
  else if (b.dataset.act) act(b.dataset.act);
  b.blur();
});
document.getElementById('fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const j = JSON.parse(await f.text()); pushUndo(); deserialize(Array.isArray(j) ? j : j.objects); autosave(); toast('⤒ Imported'); }
  catch { toast('That file is not a sandbox build'); }
  e.target.value = '';
});
const help = document.getElementById('help');
const toggleHelp = (v) => help.classList.toggle('open', v);
document.getElementById('btnHelp').onclick = () => toggleHelp();
document.getElementById('helpClose').onclick = () => toggleHelp(false);
if (params.has('nohelp') || localStorage.getItem('scena-sandbox-seen-help')) toggleHelp(false);
localStorage.setItem('scena-sandbox-seen-help', '1');

// ---------- desktop / touch controls ----------
const canvas = renderer.domElement;
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let yaw = 0, pitch = -0.18;
const keys = new Set();
let drag = null;     // { obj, plane, offset }
let looking = null;  // { x, y }
let lockGrab = null; // { obj, dist }

function setNDC(x, y) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); }
function pickAt(x, y) {
  if (document.pointerLockElement === canvas) ndc.set(0, 0); else setNDC(x, y);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(world.children, false)[0];
  return hit ? hit : null;
}
function groundPoint(planeY) {
  ray.setFromCamera(ndc, camera);
  const pt = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), pt) ? pt : null;
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (renderer.xr.isPresenting) return;
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === 'touch') return onTouchDown(e);
  if (e.button === 2) { looking = { x: e.clientX, y: e.clientY }; return; }
  if (e.button !== 0) return;
  const hit = pickAt(e.clientX, e.clientY);
  if (document.pointerLockElement === canvas) {
    if (hit) { select(hit.object); pushUndo(); lockGrab = { obj: hit.object, dist: hit.distance }; }
    else select(null);
    return;
  }
  if (hit) {
    select(hit.object); pushUndo();
    const gp = groundPoint(hit.object.position.y);
    drag = { obj: hit.object, y: hit.object.position.y, offset: gp ? hit.object.position.clone().sub(gp) : new THREE.Vector3(), moved: false };
  } else select(null);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return onTouchMove(e);
  if (document.pointerLockElement === canvas) { look(e.movementX, e.movementY); return; }
  if (looking) { look(e.clientX - looking.x, e.clientY - looking.y); looking = { x: e.clientX, y: e.clientY }; return; }
  if (drag) {
    setNDC(e.clientX, e.clientY);
    const gp = groundPoint(drag.y);
    if (gp) { drag.obj.position.set(gp.x + drag.offset.x, drag.y, gp.z + drag.offset.z); clampWorld(drag.obj); drag.moved = true; if (snapOn) snapObj(drag.obj); selBox.setFromObject(drag.obj); }
  }
});
const endPointer = e => {
  if (e.pointerType === 'touch') return onTouchUp(e);
  looking = null;
  if (drag) { if (!drag.moved) undoStack.pop(); else autosave(); drag = null; }
  if (lockGrab) { snapObj(lockGrab.obj); keepAboveGround(lockGrab.obj); selBox.setFromObject(lockGrab.obj); lockGrab = null; autosave(); }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('dblclick', e => { if (!pickAt(e.clientX, e.clientY)) canvas.requestPointerLock?.(); });
document.addEventListener('pointerlockchange', () => document.body.classList.toggle('locked', document.pointerLockElement === canvas));
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (lockGrab) { lockGrab.dist = THREE.MathUtils.clamp(lockGrab.dist - e.deltaY * 0.01, 1, 25); return; }
  if (selected) { act(e.deltaY < 0 ? 'up' : 'down'); return; }
  const d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; d.normalize();
  rig.position.addScaledVector(d, -e.deltaY * 0.01); clampRig();
}, { passive: false });

function look(dx, dy) {
  yaw -= dx * 0.0035; pitch = THREE.MathUtils.clamp(pitch - dy * 0.0035, -1.45, 1.45);
}
function clampWorld(o) { const r = Math.hypot(o.position.x, o.position.z); if (r > WORLD_R - 0.5) { o.position.x *= (WORLD_R - 0.5) / r; o.position.z *= (WORLD_R - 0.5) / r; } }
function clampRig() { const r = Math.hypot(rig.position.x, rig.position.z); if (r > WORLD_R + 5) { rig.position.x *= (WORLD_R + 5) / r; rig.position.z *= (WORLD_R + 5) / r; } }

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return undo(); }
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); return act('dup'); }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); return act('save'); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const spawnKeys = { 1: 'cube', 2: 'sphere', 3: 'cylinder', 4: 'cone', 5: 'ramp', 6: 'light' };
  if (spawnKeys[k]) return spawn(spawnKeys[k]);
  switch (k) {
    case 'q': return act('rotL'); case 'e': return act('rotR');
    case 'r': return act('grow'); case 'f': return act('shrink');
    case 'g': return act('snap'); case 'h': return toggleHelp();
    case 'l': return canvas.requestPointerLock?.();
    case 't': { const i = (PALETTE.indexOf(currentColor) + 1) % PALETTE.length; return recolor(PALETTE[i]); }
    case 'delete': case 'backspace': return act('del');
    case 'pageup': return act('up'); case 'pagedown': return act('down');
    case 'escape': select(null); toggleHelp(false); return;
  }
  if (['w', 'a', 's', 'd', ' ', 'c', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys.add(k); if (k === ' ') e.preventDefault(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

// touch: 1 finger on object = drag it, on sky = look; 2 fingers = walk/strafe
const touches = new Map();
let touchMode = null, touchStart = null;
function onTouchDown(e) {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 1) {
    const hit = pickAt(e.clientX, e.clientY);
    touchStart = { x: e.clientX, y: e.clientY, t: performance.now(), hit };
    if (hit) { select(hit.object); pushUndo(); const gp = groundPoint(hit.object.position.y); drag = { obj: hit.object, y: hit.object.position.y, offset: gp ? hit.object.position.clone().sub(gp) : new THREE.Vector3(), moved: false }; touchMode = 'drag'; }
    else touchMode = 'look';
  } else { touchMode = 'walk'; if (drag && !drag.moved) undoStack.pop(); drag = null; }
}
function onTouchMove(e) {
  const prev = touches.get(e.pointerId); if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touchMode === 'look') look(-dx * 1.2, -dy * 1.2);
  else if (touchMode === 'drag' && drag) {
    setNDC(e.clientX, e.clientY); const gp = groundPoint(drag.y);
    if (gp) { drag.obj.position.set(gp.x + drag.offset.x, drag.y, gp.z + drag.offset.z); clampWorld(drag.obj); drag.moved = true; if (snapOn) snapObj(drag.obj); selBox.setFromObject(drag.obj); }
  } else if (touchMode === 'walk') {
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    rig.position.addScaledVector(f, dy * 0.01 / touches.size).addScaledVector(r, -dx * 0.01 / touches.size); clampRig();
  }
}
function onTouchUp(e) {
  touches.delete(e.pointerId);
  if (touches.size === 0) {
    if (touchMode === 'look' && touchStart && performance.now() - touchStart.t < 250 && Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) < 10) select(null);
    if (drag) { if (!drag.moved) undoStack.pop(); else autosave(); drag = null; }
    touchMode = null;
  }
}

// ---------- VR: controllers, wrist menu, teleport ----------
const controllers = [];
const tmpM = new THREE.Matrix4();
const teleMarker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 32), new THREE.MeshBasicMaterial({ color: 0xffc83d }));
teleMarker.rotation.x = -Math.PI / 2; teleMarker.visible = false; scene.add(teleMarker);

function buildController(i) {
  const c = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  // simple neon controller body (no network model fetch → works offline)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x2b1a4a, emissive: i ? 0xffc83d : 0xa24bff, emissiveIntensity: 0.6 }));
  body.rotation.x = Math.PI / 2; body.position.z = 0.04; grip.add(body);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.8 }));
  line.scale.z = 5; c.add(line);
  const st = { c, grip, line, held: null, gamepad: null, handedness: 'none', trig: false, squeeze: false, tele: null, turnLatch: false, axes: [0, 0] };
  c.addEventListener('connected', e => { st.gamepad = e.data.gamepad; st.handedness = e.data.handedness; layoutWrist(); });
  c.addEventListener('disconnected', () => { st.gamepad = null; release(st); });
  c.addEventListener('selectstart', () => onTrigger(st, true));
  c.addEventListener('selectend', () => onTrigger(st, false));
  c.addEventListener('squeezestart', () => { st.squeeze = true; tryGrab(st); });
  c.addEventListener('squeezeend', () => { st.squeeze = false; release(st); });
  rig.add(c); rig.add(grip);
  controllers.push(st);
}
function aim(st) {
  tmpM.identity().extractRotation(st.c.matrixWorld);
  ray.ray.origin.setFromMatrixPosition(st.c.matrixWorld);
  ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  ray.far = 50;
}
function tryGrab(st) {
  if (st.held) return true;
  aim(st);
  const hit = ray.intersectObjects(world.children, false)[0];
  ray.far = Infinity;
  if (!hit || hit.distance > 12) return false;
  const other = controllers.find(o => o !== st && o.held === hit.object); if (other) release(other);
  pushUndo(); select(hit.object);
  st.c.attach(hit.object); st.held = hit.object;
  return true;
}
function release(st) {
  if (!st.held) return;
  const o = st.held; world.attach(o); st.held = null;
  snapObj(o); keepAboveGround(o); clampWorld(o); selBox.setFromObject(o); autosave();
}
function onTrigger(st, down) {
  st.trig = down;
  if (down) {
    if (wrist.visible && hitWrist(st, true)) return;
    if (tryGrab(st)) return;
    st.tele = true; // aiming teleport while held
  } else {
    if (st.held && !st.squeeze) release(st);
    if (st.tele) { if (teleMarker.visible) teleportTo(teleMarker.position); st.tele = null; teleMarker.visible = false; }
  }
}
function teleportTo(p) {
  const cam = new THREE.Vector3(); camera.getWorldPosition(cam);
  rig.position.x += p.x - cam.x; rig.position.z += p.z - cam.z; clampRig();
}
buildController(0); buildController(1);

// wrist menu: canvas-texture panel on the left controller
const W = { w: 512, h: 384 };
const wrist = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide }));
wrist.visible = false; wrist.dirty = true;
const wCanvas = document.createElement('canvas'); wCanvas.width = W.w; wCanvas.height = W.h;
const wTex = new THREE.CanvasTexture(wCanvas); wTex.colorSpace = THREE.SRGBColorSpace; wrist.material.map = wTex;
const wButtons = [];
{
  const sp = ['cube', 'sphere', 'cylinder', 'cone', 'ramp', 'light'], icons = ['▣', '●', '▮', '▲', '◣', '✦'];
  sp.forEach((t, i) => wButtons.push({ x: 16 + (i % 3) * 164, y: 56 + Math.floor(i / 3) * 70, w: 152, h: 60, label: `${icons[i]} ${LABEL[t]}`, run: () => spawn(t) }));
  PALETTE.forEach((c, i) => wButtons.push({ x: 16 + i * 61, y: 206, w: 52, h: 46, color: c, run: () => recolor(c) }));
  const tools = [['⧉ Dup', () => act('dup')], ['🗑 Del', () => act('del')], ['↶ Undo', () => act('undo')], ['▦ Snap', () => act('snap'), 'snap'], ['💾 Save', () => act('save')]];
  tools.forEach(([l, f, id], i) => wButtons.push({ x: 16 + i * 98, y: 270, w: 90, h: 56, label: l, run: f, id }));
}
function drawWrist() {
  const x = wCanvas.getContext('2d');
  x.clearRect(0, 0, W.w, W.h);
  x.fillStyle = 'rgba(18,8,36,0.92)'; rr(x, 2, 2, W.w - 4, W.h - 4, 22); x.fill();
  x.strokeStyle = '#a24bff'; x.lineWidth = 4; x.stroke();
  x.fillStyle = '#ffc83d'; x.font = 'bold 26px system-ui'; x.fillText('◆ SCENA SANDBOX', 18, 38);
  x.fillStyle = '#cdb8ff'; x.font = '18px system-ui'; x.textAlign = 'right';
  x.fillText(selected ? `${LABEL[selected.userData.type]} selected` : 'nothing selected', W.w - 18, 38); x.textAlign = 'left';
  wButtons.forEach(b => {
    const hot = b === wrist.hover;
    if (b.color) {
      x.fillStyle = b.color; rr(x, b.x, b.y, b.w, b.h, 23); x.fill();
      if (b.color === currentColor || hot) { x.strokeStyle = hot ? '#fff' : '#ffc83d'; x.lineWidth = 5; x.stroke(); }
      return;
    }
    const on = b.id === 'snap' && snapOn;
    x.fillStyle = hot ? '#6b2bd9' : 'rgba(60,26,110,0.9)'; rr(x, b.x, b.y, b.w, b.h, 12); x.fill();
    x.strokeStyle = on || hot ? '#ffc83d' : 'rgba(162,75,255,0.7)'; x.lineWidth = 3; x.stroke();
    x.fillStyle = on ? '#ffc83d' : '#fff'; x.font = 'bold 22px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  });
  x.fillStyle = '#9f86d6'; x.font = '16px system-ui'; x.fillText('Grip = grab · Trigger floor = teleport · Stick = turn / rotate+size', 18, 360);
  wTex.needsUpdate = true; wrist.dirty = false;
}
function rr(x, a, b, w, h, r) { x.beginPath(); x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h); }
function layoutWrist() {
  const left = controllers.find(s => s.handedness === 'left') || controllers[0];
  left.grip.add(wrist);
  wrist.position.set(0.02, 0.07, 0.02); wrist.rotation.set(-Math.PI / 3, 0, 0);
}
layoutWrist();
function hitWrist(st, click) {
  if (st.grip === wrist.parent) return false;
  aim(st);
  const h = ray.intersectObject(wrist, false)[0]; ray.far = Infinity;
  if (!h) return false;
  const px = h.uv.x * W.w, py = (1 - h.uv.y) * W.h;
  const b = wButtons.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
  if (wrist.hover !== b) { wrist.hover = b; wrist.dirty = true; }
  if (click && b) { b.run(); wrist.dirty = true; pulse(st); }
  return true;
}
function pulse(st) { try { st.gamepad?.hapticActuators?.[0]?.pulse(0.4, 40); } catch {} }

function updateXR(dt) {
  wrist.visible = true;
  if (wrist.dirty) drawWrist();
  let hoveringPanel = false;
  for (const st of controllers) {
    // pointer length
    aim(st);
    const hits = ray.intersectObjects([wrist, ...world.children], false);
    ray.far = Infinity;
    st.line.scale.z = hits[0] ? hits[0].distance : 5;
    if (hitWrist(st, false)) hoveringPanel = true;
    // teleport aim
    if (st.tele && !st.held) {
      aim(st); const p = new THREE.Vector3();
      if (ray.ray.direction.y < -0.05 && ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) && Math.hypot(p.x, p.z) < WORLD_R + 5) {
        teleMarker.position.set(p.x, 0.01, p.z); teleMarker.visible = true;
      } else teleMarker.visible = false;
      ray.far = Infinity;
    }
    // thumbstick
    const gp = st.gamepad; if (!gp) continue;
    const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0, ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
    if (st.held) {
      if (Math.abs(ax) > 0.2) st.held.rotateY(-ax * dt * 2.5);
      if (Math.abs(ay) > 0.2) { const f = 1 - ay * dt * 1.5; st.held.scale.multiplyScalar(f); st.held.scale.clampScalar(0.1, 20); }
      selBox.setFromObject(st.held);
    } else if (st.handedness !== 'left') {
      if (Math.abs(ax) > 0.7 && !st.turnLatch) { st.turnLatch = true; snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); }
      if (Math.abs(ax) < 0.3) st.turnLatch = false;
    } else if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) { // left stick: smooth glide
      const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      rig.position.addScaledVector(f, -ay * dt * 2.2).addScaledVector(r, ax * dt * 2.2); clampRig();
    }
  }
  if (!hoveringPanel && wrist.hover) { wrist.hover = null; wrist.dirty = true; }
}
function snapTurn(a) {
  const cam = new THREE.Vector3(); camera.getWorldPosition(cam);
  rig.position.sub(cam).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(cam); rig.rotateY(a);
}

// VR button (shows "VR NOT SUPPORTED" on desktop browsers — expected)
const vrBtn = VRButton.createButton(renderer);
vrBtn.id = 'VRButton';
document.getElementById('vrSlot').appendChild(vrBtn);
renderer.xr.addEventListener('sessionstart', () => { rig.rotation.set(0, yaw, 0); camera.rotation.set(0, 0, 0); camera.position.set(0, 0, 0); document.body.classList.add('xr'); toggleHelp(false); });
renderer.xr.addEventListener('sessionend', () => { wrist.visible = false; teleMarker.visible = false; camera.position.set(0, 1.6, 0); yaw = rig.rotation.y; rig.rotation.set(0, 0, 0); document.body.classList.remove('xr'); });

// ---------- loop ----------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (renderer.xr.isPresenting) updateXR(dt);
  else {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(-fwd.z, 0, fwd.x);
    const sp = (keys.has('shift') ? 9 : 4.5) * dt;
    if (keys.has('w') || keys.has('arrowup')) rig.position.addScaledVector(fwd, sp);
    if (keys.has('s') || keys.has('arrowdown')) rig.position.addScaledVector(fwd, -sp);
    if (keys.has('a') || keys.has('arrowleft')) rig.position.addScaledVector(right, -sp);
    if (keys.has('d') || keys.has('arrowright')) rig.position.addScaledVector(right, sp);
    if (keys.has(' ')) rig.position.y = Math.min(rig.position.y + sp, 20);
    if (keys.has('c')) rig.position.y = Math.max(rig.position.y - sp, 0);
    clampRig();
    if (lockGrab) {
      const p = new THREE.Vector3(), d = new THREE.Vector3(); camera.getWorldPosition(p); camera.getWorldDirection(d);
      lockGrab.obj.position.copy(p.addScaledVector(d, lockGrab.dist)); keepAboveGround(lockGrab.obj); clampWorld(lockGrab.obj); selBox.setFromObject(lockGrab.obj);
    }
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt / 0.25;
    const k = p.t >= 1 ? 1 : 1 + 2.7 * Math.pow(p.t - 1, 3) + 1.7 * Math.pow(p.t - 1, 2);
    p.o.scale.copy(p.s).multiplyScalar(Math.max(0.01, k));
    if (p.o === selected) selBox.setFromObject(p.o);
    if (p.t >= 1) pops.splice(i, 1);
  }
  const t = params.has('capture') ? 0 : performance.now() / 1000;
  ring.material.color.setHSL(0.76, 1, 0.55 + 0.08 * Math.sin(t * 1.5));
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- start: restore autosave, or a small starter scene ----------
try {
  const saved = JSON.parse(localStorage.getItem(AUTO_KEY) || 'null');
  if (saved && saved.length && !params.has('fresh')) deserialize(saved);
} catch {}
updateCount();

// tiny API for testing / demos
window.sandbox = { spawn, act, recolor, select, serialize, deserialize, world, rig, camera, renderer,
  look: (y, p) => { yaw = y; pitch = p; }, get selected() { return selected; } };
