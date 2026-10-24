import * as THREE from 'three';
import { createNet, SERVER_URL } from './net.js';
import MAPS_DATA from '../../shared/maps.json';

const V3 = THREE.Vector3;
// ---------- tuning ----------
const PIT_R = 7, CURB_W = 0.9, CURB_H = 0.7, INNER = PIT_R + CURB_W, OUTER_R = 17, BODY_R = 0.65;
const G = 28, SPEED = 7.2, JUMP = 9.5, BREATH_V = 17, BREATH_CD = 7;
const HOOK_SPEED = 46, HOOK_RANGE = 21, HOOK_CD = 4, PULL_SPEED = 26, PULL_GAP = 4.2, KILL_Y = -14;
const EYE = 2.05;
const DEFLECT_A = 0.12, DEFLECT_B = 0.3;
const FLICK_T = 0.3, FLICK_MAX = 75 * Math.PI / 180;
const MELEE_T = 0.77, MELEE_HIT = 0.2, MELEE_RANGE = 2.7, SHOVE_V = 8, SHOVE_UP = 6.8;
const DIFF = {
  easy:   { aim: 1.7, cd: [6, 8.5], save: 0.2,  react: 0.75, smart: 0.55, flick: 0.2, deflect: 0.1 },
  normal: { aim: 1.0, cd: [4.5, 6.5], save: 0.4, react: 0.45, smart: 0.85, flick: 0.5, deflect: 0.3 },
  hard:   { aim: 0.5, cd: [4, 5],   save: 0.65, react: 0.25, smart: 0.95, flick: 0.85, deflect: 0.55 }
};
const NAMES = ['Hamhock','Porkchop','Truffles','Snoutbert','Hogwash','Chorizo','Pancetta','Gammon','Lardo','Sir Oinks','Bacon Bits'];
const PANTS = [0x3a7bd5,0xd94f3d,0x4caf50,0x9c5bd6,0xe0b03a,0x2bb3a6,0xe36fa8,0x6d7f8c,0xf07d2a,0x5560c9,0x8bc34a];
const SKINS = [0xe7a08f,0xd88f80,0xf0b2a0,0xdc9a86,0xe9ab95];

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf3c18e, 30, 190);
const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 1200);
camera.rotation.order = 'YXZ';
// ---------- player settings (saved per browser) ----------
const SETTINGS_KEY = 'ptp-settings';
const DEFAULT_SETTINGS = { sens: 1, vol: 0.7, fov: 78 };
const settings = Object.assign({}, DEFAULT_SETTINGS, (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } })());
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ } }
camera.fov = settings.fov;
scene.add(camera);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const rnd = (a, b) => a + Math.random() * (b - a);
const lam = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}

// ---------- sky + light ----------
const sunDir = new V3(-0.62, 0.26, -0.72).normalize();
scene.add(new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x8f9ad2) }, mid: { value: new THREE.Color(0xffcf92) }, bot: { value: new THREE.Color(0xf0b07a) }, sd: { value: sunDir } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top,mid,bot,sd; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.0 ? mix(mid,top,pow(clamp(h*1.7,0.0,1.0),0.65)) : bot; float s=max(dot(vP,sd),0.0); c += vec3(1.0,0.86,0.62)*(pow(s,400.0)*1.4 + pow(s,10.0)*0.28); gl_FragColor=vec4(c,1.0); }'
})));
scene.add(new THREE.HemisphereLight(0xffd6a6, 0x94623f, 0.72));
const sun = new THREE.DirectionalLight(0xffc489, 1.05);
sun.position.copy(sunDir).multiplyScalar(70);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 180 });
sun.shadow.bias = -0.0006;
scene.add(sun);

// ---------- textures ----------
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
  return t;
}
function cloneTex(t, rx, ry) { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); return c; }
function speckle(x, w, h, n, rgb, a0, a1) { for (let k = 0; k < n; k++) { x.fillStyle = `rgba(${rgb},${rnd(a0, a1)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(3, 24), rnd(2, 8)); } }
const floorTex = canvasTex(512, 512, (x, w) => {
  x.fillStyle = '#8c6a4c'; x.fillRect(0, 0, w, w);
  const rows = 4, rh = w / rows;
  for (let r = 0; r < rows; r++) {
    let cx = (r % 2) ? -rh * 0.55 : 0;
    while (cx < w) {
      const sw = rh * rnd(0.9, 1.6), l = rnd(-14, 10);
      x.fillStyle = `rgb(${228 + l},${198 + l},${160 + l})`; x.fillRect(cx + 3, r * rh + 3, sw - 6, rh - 6); cx += sw;
    }
  }
  speckle(x, w, w, 900, '110,70,35', 0.02, 0.07);
}, 14, 14);
const plasterTex = canvasTex(256, 256, (x, w) => {
  x.fillStyle = '#f3e3c8'; x.fillRect(0, 0, w, w);
  speckle(x, w, w, 500, '150,100,55', 0.02, 0.06); speckle(x, w, w, 200, '255,255,255', 0.04, 0.1);
}, 0.22, 0.22);
const blockTex = canvasTex(256, 256, (x, w) => {
  x.fillStyle = '#7a5c40'; x.fillRect(0, 0, w, w);
  const rows = 4, rh = w / rows;
  for (let r = 0; r < rows; r++) {
    let cx = (r % 2) ? -40 : 0;
    while (cx < w) { const sw = rnd(60, 110), l = rnd(-16, 10); x.fillStyle = `rgb(${210 + l},${180 + l},${140 + l})`; x.fillRect(cx + 2, r * rh + 2, sw - 4, rh - 4); cx += sw; }
  }
  speckle(x, w, w, 400, '90,55,25', 0.03, 0.08);
});
const latticeTex = canvasTex(256, 256, (x, w) => {
  x.clearRect(0, 0, w, w); x.strokeStyle = '#3a2a1f'; x.lineWidth = 7;
  for (let i = -8; i <= 16; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + w, w); x.stroke(); x.beginPath(); x.moveTo(i * 32, w); x.lineTo(i * 32 + w, 0); x.stroke(); }
  x.lineWidth = 16; x.strokeRect(0, 0, w, w);
});
const glowPanelTex = canvasTex(256, 256, (x, w) => {
  x.fillStyle = '#17150f'; x.fillRect(0, 0, w, w);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (Math.random() < 0.45) { x.fillStyle = `rgba(170,255,80,${rnd(0.5, 1)})`; x.fillRect(i * 32, j * 32, 32, 32); }
  const g = x.createLinearGradient(0, 0, 0, w); g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
});
const barrierTex = canvasTex(64, 256, (x, w, h) => {
  const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(190,130,255,1)'); g.addColorStop(0.6, 'rgba(120,60,230,.75)'); g.addColorStop(1, 'rgba(80,30,200,.35)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) { x.fillStyle = 'rgba(255,230,255,.25)'; x.fillRect(0, y, w, 2); }
});
const puffTex = canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
});

// ---------- arena: Ilios-style well courtyard ----------
const wellG = new THREE.Group(); scene.add(wellG);
const floor = mesh(new THREE.RingGeometry(INNER, 44, 128, 4), lam(0xffffff, { map: floorTex }), 0, 0, 0);
floor.rotation.x = -Math.PI / 2; floor.castShadow = false; wellG.add(floor);
const band = mesh(new THREE.RingGeometry(INNER, INNER + 1.3, 128, 1), lam(0xd8b98f, { map: cloneTex(blockTex, 5, 5) }), 0, 0.012, 0);
band.rotation.x = -Math.PI / 2; band.castShadow = false; wellG.add(band);
// chunky segmented curb
{
  const V2 = THREE.Vector2, b = 0.09, NSEG = 20, gap = 0.004;
  const prof = [new V2(PIT_R, -0.8), new V2(PIT_R, CURB_H - b), new V2(PIT_R + b, CURB_H), new V2(INNER - b, CURB_H), new V2(INNER, CURB_H - b), new V2(INNER, 0)];
  const fill = [new V2(PIT_R + 0.04, -0.8), new V2(PIT_R + 0.04, CURB_H - 0.05), new V2(INNER - 0.04, CURB_H - 0.05), new V2(INNER - 0.04, 0)];
  wellG.add(mesh(new THREE.LatheGeometry(fill, 96), lam(0x9a7a58, { side: THREE.DoubleSide })));
  for (let i = 0; i < NSEG; i++) {
    const tone = rnd(0.86, 1.0);
    wellG.add(mesh(new THREE.LatheGeometry(prof, 5, (i / NSEG) * Math.PI * 2 + gap, (Math.PI * 2) / NSEG - gap * 2), lam(new THREE.Color(0xe9d1aa).multiplyScalar(tone), { map: plasterTex, side: THREE.DoubleSide })));
  }
}
// pit walls: stone blocks fading to black
{
  const geo = new THREE.CylinderGeometry(PIT_R, PIT_R, 24, 64, 12, true);
  const cols = [], pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const t = Math.pow((pos.getY(i) + 12) / 24, 2.6); cols.push(0.5 * t, 0.38 * t, 0.29 * t); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const wall = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, map: cloneTex(blockTex, 12, 7), side: THREE.BackSide, fog: false }));
  wall.position.y = -12.8; wellG.add(wall);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(PIT_R, 48), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  bottom.rotation.x = -Math.PI / 2; bottom.position.y = -24.5; wellG.add(bottom);
}
// glowing rim
const glowMat = new THREE.MeshBasicMaterial({ color: 0x7dff4a });
const rim = new THREE.Mesh(new THREE.TorusGeometry(PIT_R + 0.03, 0.06, 6, 128), glowMat);
rim.rotation.x = Math.PI / 2; rim.position.y = CURB_H + 0.01; wellG.add(rim);
const halo = new THREE.Mesh(new THREE.RingGeometry(PIT_R, PIT_R + 0.16, 128, 1), new THREE.MeshBasicMaterial({ color: 0x7dff4a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
halo.rotation.x = -Math.PI / 2; halo.position.y = CURB_H + 0.012; wellG.add(halo);

// courtyard facades
const safeSpots = [];
const barrierMats = [];
{
  const NB = 10, R_F = OUTER_R + 0.7, BAYW = 2 * R_F * Math.tan(Math.PI / NB) + 0.06;
  const TYPES = ['safe', 'lattice', 'arch', 'tower', 'safe', 'arch', 'lattice', 'safe', 'arch', 'tower'];
  const trimM = lam(0xf6e9d3), blueM = lam(0x3d6fb0), tealM = lam(0x2e7f86), stepM = lam(0xd6bb93), ironM = lam(0x1d1a18);
  const roomM = new THREE.MeshBasicMaterial({ color: 0x33251b, side: THREE.BackSide });
  const lampM = new THREE.MeshBasicMaterial({ color: 0xffd58a });
  const darkWinM = new THREE.MeshBasicMaterial({ color: 0x2a211b });
  const latM = new THREE.MeshLambertMaterial({ map: latticeTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  const glowSprite = new THREE.SpriteMaterial({ map: puffTex, color: 0xffb860, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  function archHole(cx, y0, w, h) {
    const p = new THREE.Path(), r = w / 2, sh = y0 + h - r;
    p.moveTo(cx - r, y0); p.lineTo(cx + r, y0); p.lineTo(cx + r, sh); p.absarc(cx, sh, r, 0, Math.PI, false); p.lineTo(cx - r, y0); return p;
  }
  function archShape(w, h) { const s = new THREE.Shape(), r = w / 2, sh = h - r; s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, sh); s.absarc(0, sh, r, 0, Math.PI, false); s.lineTo(-r, 0); return s; }
  function facadeShape(W, H, door) {
    const s = new THREE.Shape(); s.moveTo(-W / 2, 0);
    if (door) { const r = door.w / 2, sh = door.h - r; s.lineTo(-r, 0); s.lineTo(-r, sh); s.absarc(0, sh, r, Math.PI, 0, true); s.lineTo(r, 0); }
    s.lineTo(W / 2, 0); s.lineTo(W / 2, H); s.lineTo(-W / 2, H); s.lineTo(-W / 2, 0); return s;
  }
  function molding(g, w, h, y0 = 0) {
    const r = w / 2;
    g.add(mesh(new THREE.TorusGeometry(r + 0.13, 0.14, 6, 24, Math.PI), trimM, 0, y0 + h - r, 0.06));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.3, h - r, 0.28), trimM, s * (r + 0.13), y0 + (h - r) / 2, 0.06));
  }
  function lantern(g, x, y) {
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.07, 0.45), ironM, x, y + 0.42, 0.22));
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), ironM, x, y, 0.45));
    g.add(mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), lampM, x, y, 0.45, false));
    const cap = mesh(new THREE.ConeGeometry(0.3, 0.28, 4), ironM, x, y + 0.38, 0.45); cap.rotation.y = Math.PI / 4; g.add(cap);
    const s = new THREE.Sprite(glowSprite); s.position.set(x, y, 0.6); s.scale.setScalar(1.9); g.add(s);
  }
  function smallWindow(g, x, y, w, h, shutter) {
    const dw = new THREE.Mesh(new THREE.ShapeGeometry(archShape(w, h)), darkWinM); dw.position.set(x, y, 0.02); g.add(dw);
    const lt = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.75), latM); lt.position.set(x, y + h * 0.375, 0.04); g.add(lt);
    g.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.14, 0.3), shutter, x, y - 0.05, 0.12));
  }
  for (let i = 0; i < NB; i++) {
    const type = TYPES[i], a = (i / NB) * Math.PI * 2;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * R_F, 0, Math.sin(a) * R_F);
    g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); wellG.add(g);
    const H = type === 'tower' ? rnd(12.5, 14) : rnd(8.5, 10.5);
    const tint = new THREE.Color().setHSL(rnd(0.085, 0.1), rnd(0.4, 0.6), rnd(0.8, 0.87));
    let door = null, roomD = 0.3;
    if (type === 'safe') { door = { w: 3.4, h: 5 }; roomD = 6; }
    else if (type === 'arch') { door = { w: 4.2, h: 6 }; roomD = 10; }
    else if (type === 'tower') { door = { w: 2.2, h: 3.4 }; roomD = 1.6; }
    const shape = facadeShape(BAYW, H, door);
    if (type === 'lattice') shape.holes.push(archHole(0, 1.3, 4.2, 5.4));
    const fac = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false }), lam(tint, { map: plasterTex }));
    fac.position.z = -0.8; g.add(fac);
    g.add(mesh(new THREE.BoxGeometry(BAYW + 0.02, 0.4, 1.3), trimM, 0, H + 0.2, -0.4));
    if (i % 2 === 0) g.add(mesh(new THREE.BoxGeometry(BAYW, 0.14, 0.12), blueM, 0, H - 1.1, 0.06));
    const plinthM = lam(tint.clone().multiplyScalar(0.82));
    if (door) { const r = door.w / 2 + 0.28, pw = BAYW / 2 - r; for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(pw, 0.45, 0.25), plinthM, s * (r + pw / 2), 0.22, 0.1)); }
    else g.add(mesh(new THREE.BoxGeometry(BAYW, 0.45, 0.25), plinthM, 0, 0.22, 0.1));
    const depth = 0.8 + roomD;
    g.add(mesh(new THREE.BoxGeometry(BAYW, 0.5, depth), lam(tint), 0, H - 0.25, -depth / 2));
    g.add(mesh(new THREE.BoxGeometry(BAYW, H, 10), lam(tint.clone().multiplyScalar(0.95)), 0, H / 2, -depth - 5));
    if (door) {
      const r = door.w / 2, rw = door.w + 0.6, rh = door.h + 0.6;
      molding(g, door.w, door.h);
      const room = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, roomD), roomM); room.position.set(0, rh / 2, -0.8 - roomD / 2); g.add(room);
      if (type !== 'tower') for (const s of [-1, 1]) lantern(g, s * (r + 1.1), door.h - r + 0.2);
    }
    if (type === 'safe') {
      for (let k = 0; k < 7; k++) g.add(mesh(new THREE.BoxGeometry(door.w + 0.5, 0.28 * (k + 1), 0.6), stepM, 0, 0.14 * (k + 1), -1.1 - k * 0.6));
      const tex = cloneTex(barrierTex, 1 / door.w, 1 / door.h); tex.offset.set(0.5, 0);
      const bm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      barrierMats.push(bm);
      const bar = new THREE.Mesh(new THREE.ShapeGeometry(archShape(door.w, door.h)), bm); bar.position.set(0, 0, -0.45); g.add(bar);
      safeSpots.push(a);
    }
    if (type === 'arch') {
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(door.w, door.h), new THREE.MeshBasicMaterial({ color: 0xffdcae }));
      lit.position.set(0, door.h / 2, -0.8 - roomD + 0.05); g.add(lit);
      safeSpots.push(a);
    }
    if (type === 'lattice') {
      molding(g, 4.2, 5.4, 1.3);
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.4), new THREE.MeshBasicMaterial({ map: glowPanelTex })); gp.position.set(0, 4.0, -0.7); g.add(gp);
      const lt = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.4), latM); lt.position.set(0, 4.0, -0.3); g.add(lt);
      g.add(mesh(new THREE.BoxGeometry(4.6, 0.2, 0.5), trimM, 0, 1.25, 0.1));
      for (const s of [-1, 1]) lantern(g, s * 3.4, 4.2);
    }
    if (type === 'tower') {
      const R = BAYW * 0.3;
      g.add(mesh(new THREE.CylinderGeometry(R, R, 1.6, 24), lam(tint, { map: plasterTex }), 0, H + 0.8, -4));
      g.add(mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), blueM, 0, H + 1.6, -4));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), ironM, 0, H + 1.6 + R + 0.5, -4));
      smallWindow(g, 0, H - 5, 1.4, 2.2, tealM);
      smallWindow(g, -BAYW * 0.32, 4.2, 1.2, 1.8, blueM); smallWindow(g, BAYW * 0.32, 4.2, 1.2, 1.8, blueM);
    } else if (type !== 'lattice' || H > 9.5) {
      const wy = type === 'lattice' ? H - 2.6 : H - 3.6;
      if (type === 'lattice') smallWindow(g, 0, wy, 1.1, 1.6, tealM);
      else for (const s of [-1, 1]) smallWindow(g, s * BAYW * 0.33, wy, 1.2, 1.9, i % 3 ? blueM : tealM);
    }
  }
  // agave pots tucked into the corners
  const potM = lam(0xb5643a), agaveM = lam(0x6f9a7a);
  for (let i = 0; i < NB; i++) {
    const a = ((i + 0.5) / NB) * Math.PI * 2, r = R_F / Math.cos(Math.PI / NB) - 0.9;
    const pot = new THREE.Group(); pot.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    pot.add(mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.75, 12), potM, 0, 0.37, 0));
    for (let k = 0; k < 10; k++) { const l = mesh(new THREE.ConeGeometry(0.07, rnd(0.8, 1.3), 4), agaveM, 0, 0.9, 0); l.rotation.set(rnd(0.3, 0.9), (k / 10) * Math.PI * 2, 0, 'YXZ'); pot.add(l); }
    wellG.add(pot);
  }
  // second row skyline
  const roofM = lam(0x3d6fb0), whiteM = lam(0xf2ead9);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd(-0.08, 0.08), r = rnd(27, 34), h = rnd(13, 21), w = rnd(6, 10), d = rnd(6, 10);
    const b = mesh(new THREE.BoxGeometry(w, h, d), lam(new THREE.Color().setHSL(rnd(0.07, 0.1), rnd(0.3, 0.5), rnd(0.74, 0.88))), Math.cos(a) * r, h / 2, Math.sin(a) * r);
    b.lookAt(0, h / 2, 0); wellG.add(b);
    b.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), whiteM, 0, h / 2 + 0.2, 0));
    if (i % 3 === 0) b.add(mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.35, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), roofM, 0, h / 2 + 0.4, 0));
    else if (i % 3 === 1) { const c = mesh(new THREE.ConeGeometry(Math.min(w, d) * 0.5, 2.6, 4), roofM, 0, h / 2 + 1.7, 0); c.rotation.y = Math.PI / 4; b.add(c); }
  }
  // palms peeking over the walls
  const trunkM = lam(0x8a6038), leafM = lam(0x4f7d32, { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, r = rnd(21.5, 24);
    const palm = new THREE.Group(); palm.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const th = rnd(12, 15), tr = mesh(new THREE.CylinderGeometry(0.25, 0.4, th, 8), trunkM, 0, th / 2, 0); tr.rotation.z = rnd(-0.08, 0.08); palm.add(tr);
    for (let k = 0; k < 8; k++) {
      const leaf = mesh(new THREE.ConeGeometry(0.6, 4.8, 4), leafM, 0, th, 0);
      leaf.scale.z = 0.15; leaf.rotation.set(0, (k / 8) * Math.PI * 2, 1.85); leaf.translateY(2.3); palm.add(leaf);
    }
    wellG.add(palm);
  }
  // orange cliffs on the horizon
  const rockM = new THREE.MeshLambertMaterial({ color: 0xc98552, flatShading: true });
  for (let i = 0; i < 11; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(95, 150), s = rnd(22, 42);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), rockM);
    rock.position.set(Math.cos(a) * r, rnd(-4, 6), Math.sin(a) * r); rock.scale.set(rnd(0.9, 1.4), rnd(1.1, 1.9), rnd(0.9, 1.4)); rock.rotation.y = rnd(0, 6);
    wellG.add(rock);
  }
}

// Surfaces the grapple can stick to: everything built around the courtyard (buildings, towers, domes,
// roofs, palms, the second row). The floor, curb and pit are round and handled separately.
const wellSurfaces = [];
scene.updateMatrixWorld(true);
wellG.traverse((o) => {
  if (!o.isMesh || !o.geometry) return;
  if (o.material && (o.material.blending === THREE.AdditiveBlending)) return;
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
  if (Math.hypot(c.x, c.z) > 5 && Math.hypot(c.x, c.z) < 60) wellSurfaces.push(o);
});
let grappleSurfaces = wellSurfaces;
const grappleRay = new THREE.Raycaster();

// ---------- map 2: Ilios Rooftops ----------
// Flat roofs at different heights above the town, split by alleys. Fall into an alley and you're out.
// No railings anywhere; a green line marks every deadly edge, like the well's rim.
const ROOFS = MAPS_DATA.roofs;
const ROOF_STEP = 0.35; // you can walk up a ledge this high without jumping
const ROOF_BOXES = ROOFS.boxes.map((b) => Object.assign({}, b, { bottom: b.kind === 'chimney' ? b.base : ROOFS.ground, links: [], breathLinks: [] }));
const WALKABLE = ROOF_BOXES.filter((b) => b.kind !== 'chimney');
const RING = WALKABLE.filter((b) => b.kind === 'roof' && b.id !== 'C');
const rectGap = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
for (const a of WALKABLE) for (const b of WALKABLE) {
  if (a === b) continue;
  const gap = rectGap(a, b), up = b.top - a.top;
  if (gap <= 3.4 && up <= 0.8) a.links.push(b);        // jump or walk across
  else if (gap <= 3.4 && up <= 4) a.breathLinks.push(b); // needs the breathing mask to get up there
}
const inRect = (b, x, z, m = 0) => x >= b.x0 + m && x <= b.x1 - m && z >= b.z0 + m && z <= b.z1 - m;
function roofTopUnder(x, z, maxY, list = ROOF_BOXES) {
  let g = null;
  for (const b of list) if (inRect(b, x, z) && b.top <= maxY && (!g || b.top > g.top)) g = b;
  return g;
}
const roofAt = (pos) => roofTopUnder(pos.x, pos.z, pos.y + 0.15, WALKABLE);
function randInRoof(b, m) { return new V3(rnd(b.x0 + m, b.x1 - m), b.top, rnd(b.z0 + m, b.z1 - m)); }
function closestOnRect(b, x, z) { return [Math.max(b.x0, Math.min(x, b.x1)), Math.max(b.z0, Math.min(z, b.z1))]; }
function pointToward(b, x, z, inward, spread) {
  // a point on roof b near the edge closest to (x, z), pulled inward
  let [cx, cz] = closestOnRect(b, x, z);
  const mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2;
  const dx = mx - cx, dz = mz - cz, L = Math.hypot(dx, dz) || 1;
  cx += dx / L * inward + (-dz / L) * spread; cz += dz / L * inward + (dx / L) * spread;
  const m = Math.min(0.7, (b.x1 - b.x0) / 2 - 0.05, (b.z1 - b.z0) / 2 - 0.05);
  return new V3(Math.max(b.x0 + m, Math.min(cx, b.x1 - m)), b.top, Math.max(b.z0 + m, Math.min(cz, b.z1 - m)));
}
function edgeDist(b, x, z) { return Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z); }

function collideRoofs(p, ox, oy, oz, wasGround) {
  const stepY = wasGround ? ROOF_STEP : 0.05;
  for (const b of ROOF_BOXES) {
    if (p.pos.y >= b.top - 0.02 || oy >= b.top - 0.05) continue;   // above it, or landing on it
    if (wasGround && b.top - p.pos.y <= stepY) continue;              // small ledge: step up
    if (p.pos.y + 2.4 < b.bottom) continue;
    const [cx, cz] = closestOnRect(b, p.pos.x, p.pos.z);
    const dx = p.pos.x - cx, dz = p.pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= BODY_R * BODY_R) continue;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      p.pos.x = cx + nx * BODY_R; p.pos.z = cz + nz * BODY_R;
      const vn = p.vel.x * nx + p.vel.z * nz; if (vn < 0) { p.vel.x -= nx * vn; p.vel.z -= nz * vn; }
    } else { // inside the block: push out the shortest way
      const opts = [[b.x0 - BODY_R, null], [b.x1 + BODY_R, null], [null, b.z0 - BODY_R], [null, b.z1 + BODY_R]];
      let best = opts[0], bd = 1e9;
      for (const o of opts) { const dd = o[0] !== null ? Math.abs(o[0] - p.pos.x) : Math.abs(o[1] - p.pos.z); if (dd < bd) { bd = dd; best = o; } }
      if (best[0] !== null) p.pos.x = best[0]; else p.pos.z = best[1];
    }
  }
  const g = roofTopUnder(p.pos.x, p.pos.z, Math.max(oy, p.pos.y) + stepY);
  if (g && p.pos.y <= g.top) { p.pos.y = g.top; if (p.vel.y < 0) p.vel.y = 0; p.onGround = true; }
}
// segment vs one block: where it enters and through which face
function segBox(a, b2, bx) {
  const d = [b2.x - a.x, b2.y - a.y, b2.z - a.z], A = [a.x, a.y, a.z];
  const mins = [bx.x0, bx.bottom, bx.z0], maxs = [bx.x1, bx.top, bx.z1];
  let tmin = 0, tmax = 1, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (A[i] < mins[i] || A[i] > maxs[i]) return null; continue; }
    let t1 = (mins[i] - A[i]) / d[i], t2 = (maxs[i] - A[i]) / d[i], s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    tmax = Math.min(tmax, t2); if (tmin > tmax) return null;
  }
  if (axis < 0) return null;
  const n = [0, 0, 0]; n[axis] = sign;
  return { t: tmin, n: new V3(n[0], n[1], n[2]) };
}
function firstBoxHit(a, b2) {
  let best = null;
  for (const bx of ROOF_BOXES) { const h = segBox(a, b2, bx); if (h && (!best || h.t < best.t)) best = Object.assign(h, { box: bx }); }
  return best;
}
function roofsTerrain(prev, pos) {
  const h = firstBoxHit(prev, pos); if (!h) return null;
  const at = prev.clone().lerp(pos, h.t), b = h.box;
  const m = Math.min(0.6, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2);
  const inside = (v) => { v.x = Math.max(b.x0 + m, Math.min(v.x, b.x1 - m)); v.z = Math.max(b.z0 + m, Math.min(v.z, b.z1 - m)); return v; };
  if (h.n.y > 0.5) return { at, goal: inside(at.clone().setY(b.top + 0.7)) };               // landed on top
  if (h.n.y < -0.5) return null;                                                           // underside: nothing to grab
  return { at, goal: inside(at.clone().addScaledVector(h.n, -0.9).setY(b.top + 0.7)) };    // a wall: climb onto the top
}

// visuals
const roofsG = new THREE.Group(); roofsG.visible = false; scene.add(roofsG);
{
  // plaster walls with arched lattice windows (one tile = 4.5 m wide, one storey band)
  const winTex = (trim) => canvasTex(256, 256, (x, w) => {
    x.fillStyle = '#efdcbf'; x.fillRect(0, 0, w, w); speckle(x, w, w, 400, '150,100,55', 0.02, 0.06);
    x.fillStyle = 'rgba(120,70,30,.16)'; x.fillRect(0, 238, w, 8);
    for (const cx of [64, 192]) {
      x.fillStyle = trim; x.beginPath(); x.moveTo(cx - 32, 210); x.lineTo(cx - 32, 112); x.arc(cx, 112, 32, Math.PI, 0); x.lineTo(cx + 32, 210); x.closePath(); x.fill();
      x.fillStyle = '#2b2430'; x.beginPath(); x.moveTo(cx - 24, 204); x.lineTo(cx - 24, 114); x.arc(cx, 114, 24, Math.PI, 0); x.lineTo(cx + 24, 204); x.closePath(); x.fill();
      x.strokeStyle = trim; x.lineWidth = 3;
      for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(cx + i * 9 - 28, 204); x.lineTo(cx + i * 9 + 28, 106); x.stroke(); x.beginPath(); x.moveTo(cx + i * 9 + 28, 204); x.lineTo(cx + i * 9 - 28, 106); x.stroke(); }
    }
  });
  const ROOF_WIN_TEX = [winTex('#2f63a8'), winTex('#2e8f8a'), winTex('#3b4a9e')];
  const G0 = ROOFS.ground;
  const tileTex = canvasTex(256, 256, (x, w) => {
    x.fillStyle = '#e8d6b6'; x.fillRect(0, 0, w, w);
    x.strokeStyle = 'rgba(120,85,50,.25)'; x.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, w); x.stroke(); x.beginPath(); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.stroke(); }
    speckle(x, w, w, 500, '120,80,40', 0.02, 0.07);
  });
  const plankTex = canvasTex(128, 256, (x, w, h) => {
    for (let i = 0; i < 8; i++) { const l = rnd(-14, 12); x.fillStyle = `rgb(${132 + l},${92 + l},${58 + l})`; x.fillRect(0, i * 32, w, 30); }
    x.fillStyle = 'rgba(40,25,10,.6)'; for (let i = 0; i < 8; i++) x.fillRect(0, i * 32 + 30, w, 2);
  });
  const trimM = lam(0xf6e9d3), lowM = lam(0x7d5c44), capM = lam(0x3a2c24), postM = lam(0x5a3d25);
  const edge = (x, z, w, d, y) => { const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), glowMat); e.position.set(x, y + 0.03, z); roofsG.add(e); };
  ROOF_BOXES.forEach((b, i) => {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    if (b.kind === 'roof') {
      const upperH = 5, lowH = b.top - upperH - G0;
      roofsG.add(mesh(new THREE.BoxGeometry(w, lowH, d), lowM, cx, G0 + lowH / 2, cz));
      const tint = new THREE.Color().setHSL(rnd(0.085, 0.1), rnd(0.4, 0.6), rnd(0.8, 0.87));
      const wt = ROOF_WIN_TEX[i % 3];
      const sx = lam(tint, { map: cloneTex(wt, Math.max(1, Math.round(d / 4.5)), 1) }), sz = lam(tint, { map: cloneTex(wt, Math.max(1, Math.round(w / 4.5)), 1) });
      const top = lam(0xffffff, { map: cloneTex(tileTex, w / 3, d / 3) });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, upperH, d), [sx, sx, top, lowM, sz, sz]);
      m.position.set(cx, b.top - upperH / 2, cz); m.castShadow = m.receiveShadow = true; roofsG.add(m);
      roofsG.add(mesh(new THREE.BoxGeometry(w + 0.25, 0.28, d + 0.25), trimM, cx, b.top - 0.5, cz));
      edge(cx, b.z0 + 0.03, w, 0.06, b.top); edge(cx, b.z1 - 0.03, w, 0.06, b.top);
      edge(b.x0 + 0.03, cz, 0.06, d, b.top); edge(b.x1 - 0.03, cz, 0.06, d, b.top);
      if (b.id === 'C') { // the high roof gets a blue dome corner and a flag
        roofsG.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), postM, b.x0 + 0.5, b.top + 1.6, b.z0 + 0.5));
        const flag = mesh(new THREE.PlaneGeometry(1.2, 0.7), lam(0x3d6fb0, { side: THREE.DoubleSide }), b.x0 + 1.1, b.top + 2.8, b.z0 + 0.5); roofsG.add(flag);
      }
    } else if (b.kind === 'bridge') {
      roofsG.add(mesh(new THREE.BoxGeometry(w, 0.25, d), lam(0xffffff, { map: cloneTex(plankTex, 1, Math.max(1, Math.round(d / 1.5))) }), cx, b.top - 0.125, cz));
      for (const [px, pz] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) roofsG.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), postM, px, b.top - 0.4, pz));
      if (w < d) { edge(b.x0 + 0.03, cz, 0.06, d, b.top); edge(b.x1 - 0.03, cz, 0.06, d, b.top); }
      else { edge(cx, b.z0 + 0.03, w, 0.06, b.top); edge(cx, b.z1 - 0.03, w, 0.06, b.top); }
    } else {
      const h = b.top - b.base;
      roofsG.add(mesh(new THREE.BoxGeometry(w, h, d), lam(0xe9d6b8, { map: plasterTex }), cx, b.base + h / 2, cz));
      roofsG.add(mesh(new THREE.BoxGeometry(w + 0.2, 0.18, d + 0.2), capM, cx, b.top - 0.09, cz));
    }
  });
  // alley floor far below, the town around and the sea
  const alley = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), lam(0x3b2a1f)); alley.rotation.x = -Math.PI / 2; alley.position.y = G0; roofsG.add(alley);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), lam(0x4b88ad)); sea.rotation.x = -Math.PI / 2; sea.position.y = G0 - 0.5; roofsG.add(sea);
  const roofM = lam(0x3d6fb0), whiteM = lam(0xf2ead9);
  for (let i = 0; i < 46; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(24, 60), h = rnd(8, 15) + (r > 45 ? rnd(0, 8) : 0), w = rnd(6, 11), d = rnd(6, 11);
    const tint = new THREE.Color().setHSL(rnd(0.07, 0.1), rnd(0.3, 0.5), rnd(0.74, 0.88)), wt = ROOF_WIN_TEX[i % 3];
    const sx = lam(tint, { map: cloneTex(wt, Math.max(1, Math.round(d / 4.5)), Math.max(1, Math.round(h / 5))) }), sz = lam(tint, { map: cloneTex(wt, Math.max(1, Math.round(w / 4.5)), Math.max(1, Math.round(h / 5))) });
    const bx = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sx, sx, lam(0xffffff, { map: cloneTex(tileTex, w / 3, d / 3) }), lowM, sz, sz]);
    bx.position.set(Math.cos(a) * r, G0 + h / 2, Math.sin(a) * r); bx.castShadow = bx.receiveShadow = true;
    bx.rotation.y = rnd(0, Math.PI); roofsG.add(bx);
    bx.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), whiteM, 0, h / 2 + 0.17, 0));
    if (i % 4 === 0) bx.add(mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.33, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), roofM, 0, h / 2 + 0.35, 0));
  }
  const trunkM = lam(0x8a6038), leafM = lam(0x4f7d32, { side: THREE.DoubleSide });
  for (const [px, pz] of [[-4.5, 4.5], [4.5, -4.5], [15.5, 4], [-15.5, -4], [4, -15.5], [-6.5, 15.5]]) {
    const palm = new THREE.Group(); palm.position.set(px, G0, pz);
    const th = rnd(14, 16.5); palm.add(mesh(new THREE.CylinderGeometry(0.25, 0.42, th, 8), trunkM, 0, th / 2, 0));
    for (let k = 0; k < 8; k++) { const leaf = mesh(new THREE.ConeGeometry(0.6, 4.6, 4), leafM, 0, th, 0); leaf.scale.z = 0.15; leaf.rotation.set(0, (k / 8) * Math.PI * 2, 1.85); leaf.translateY(2.2); palm.add(leaf); }
    roofsG.add(palm);
  }
  const rockM = new THREE.MeshLambertMaterial({ color: 0xc98552, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(170, 230), s = rnd(18, 30);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), rockM);
    rock.position.set(Math.cos(a) * r, G0 - 12 + rnd(-4, 4), Math.sin(a) * r); rock.scale.set(rnd(0.9, 1.4), rnd(1.1, 1.8), rnd(0.9, 1.4)); roofsG.add(rock);
  }
}

// ---------- the two maps behind one interface ----------
function wellSpawn(p) {
  let best = null, bestD = -1;
  for (let k = 0; k < 8; k++) {
    const a = safeSpots.length ? safeSpots[(Math.random() * safeSpots.length) | 0] + rnd(-0.1, 0.1) : Math.random() * Math.PI * 2;
    const r = rnd(OUTER_R - 3, OUTER_R - 1.3), c = new V3(Math.cos(a) * r, 0, Math.sin(a) * r);
    let md = 99; for (const q of pigs) if (q !== p && q.state !== 'dead') md = Math.min(md, q.pos.distanceTo(c));
    if (md > bestD) { bestD = md; best = c; }
  }
  return best;
}
function roofsSpawn(p) {
  let best = null, bestD = -1;
  for (let k = 0; k < 10; k++) {
    const c = randInRoof(RING[(Math.random() * RING.length) | 0], 1.6);
    let md = 99; for (const q of pigs) if (q !== p && q.state !== 'dead') md = Math.min(md, q.pos.distanceTo(c));
    if (md > bestD) { bestD = md; best = c; }
  }
  return best;
}
const MAPS = {
  well: {
    id: 'well', name: 'Ilios Well', group: wellG, killY: KILL_Y, word: 'PIT', fell: 'fell in',
    cam: { r: 13, h: 8.5, look: -1 },
    collide: (p, ox, oy, oz) => collideWell(p, ox, oy, oz),
    spawn: wellSpawn,
    rimSpot: () => { const a = Math.random() * Math.PI * 2, r = INNER + 1.1; return new V3(Math.cos(a) * r, 0, Math.sin(a) * r); },
    deadlyEnd: (e) => Math.hypot(e.x, e.z) < PIT_R - 0.4,
    nearDanger: (q) => Math.hypot(q.pos.x, q.pos.z) < INNER + 1.6,
    rescue(b) {
      const r = Math.hypot(b.pos.x, b.pos.z) || 1;
      if (!(b.pos.y < -0.2 && r < PIT_R)) return null;
      const wx = b.pos.x / r, wz = b.pos.z / r;
      return { wx, wz, aim: new V3(wx * PIT_R, rnd(-0.6, 0.2), wz * PIT_R) };
    },
    botGoal(b, ai) {
      const nearRim = Math.random() < 0.8, a = Math.atan2(b.pos.z, b.pos.x) + rnd(-0.9, 0.9);
      const gr = nearRim ? rnd(INNER + 0.7, INNER + 1.3) : rnd(INNER + 2.5, OUTER_R - 1.5);
      ai.goal.set(Math.cos(a) * gr, 0, Math.sin(a) * gr); ai.goalRoof = null;
    },
    reachable: () => true,
    edgeJump: null,
    allowPush: () => true,
    hookBlocked(prev, pos) {
      const r = Math.hypot(pos.x, pos.z);
      return (pos.y < 0 && r >= INNER) || (pos.y < CURB_H && r >= PIT_R && r < INNER) || r > OUTER_R + 1;
    },
    terrain: (prev, pos) => terrainHit(prev, pos),
    clampGoal(goal) { const gr = Math.hypot(goal.x, goal.z), maxR = OUTER_R - 0.9; if (gr > maxR) { goal.x *= maxR / gr; goal.z *= maxR / gr; } },
    pickupSpot() { const a = rnd(0, Math.PI * 2), r = rnd(INNER + 1.6, OUTER_R - 1.8); return [Math.cos(a) * r, Math.sin(a) * r, 0]; }
  },
  roofs: {
    id: 'roofs', name: ROOFS.name, group: roofsG, killY: ROOFS.killY, word: 'DROP', fell: 'fell off',
    cam: { r: 21, h: 13, look: -2 },
    collide: collideRoofs,
    spawn: roofsSpawn,
    rimSpot() { const b = RING[(Math.random() * RING.length) | 0]; return pointToward(b, 0, 0, 0.9, rnd(-1.5, 1.5)); },
    deadlyEnd: (e) => !roofTopUnder(e.x, e.z, e.y + 0.05),
    nearDanger(q) { const b = roofAt(q.pos); return !b || edgeDist(b, q.pos.x, q.pos.z) < 1.6; },
    rescue(b) {
      if (b.onGround || roofTopUnder(b.pos.x, b.pos.z, b.pos.y + 0.05)) return null;
      let best = null, bd = 1e9;
      for (const r of WALKABLE) { const [cx, cz] = closestOnRect(r, b.pos.x, b.pos.z); const d = Math.hypot(cx - b.pos.x, cz - b.pos.z); if (d < bd) { bd = d; best = { r, cx, cz }; } }
      if (!best || b.pos.y > best.r.top - 0.3) return null; // still above roof level: a normal jump, not a fall
      const dx = best.cx - b.pos.x, dz = best.cz - b.pos.z, L = Math.hypot(dx, dz) || 1;
      return { wx: dx / L, wz: dz / L, aim: new V3(best.cx + dx / L * 0.3, best.r.top - 0.5, best.cz + dz / L * 0.3) };
    },
    botGoal(b, ai) {
      const cur = roofAt(b.pos) || RING[0];
      let tgt = cur;
      if (cur.breathLinks.length && b.breathCd <= 0 && Math.random() < 0.08) tgt = cur.breathLinks[(Math.random() * cur.breathLinks.length) | 0];
      else if (cur.links.length && Math.random() < 0.35) tgt = cur.links[(Math.random() * cur.links.length) | 0];
      if (tgt === cur) ai.goal.copy(Math.random() < 0.65 ? pointToward(cur, rnd(-3, 3), rnd(-3, 3), 0.9, rnd(-2, 2)) : randInRoof(cur, Math.min(1, (cur.x1 - cur.x0) / 2 - 0.1, (cur.z1 - cur.z0) / 2 - 0.1)));
      else ai.goal.copy(pointToward(tgt, b.pos.x, b.pos.z, 1.6, rnd(-1, 1)));
      ai.goalRoof = tgt;
    },
    reachable(b, pos, ai) {
      const cur = roofAt(b.pos), there = roofTopUnder(pos.x, pos.z, pos.y + 0.2, WALKABLE);
      if (!cur || !there) return false;
      if (there === cur || cur.links.includes(there)) { ai.goalRoof = there; return true; }
      return false;
    },
    edgeJump(b, wx, wz) {
      if (!b.onGround || (!wx && !wz)) return null;
      if (roofTopUnder(b.pos.x + wx * 0.9, b.pos.z + wz * 0.9, b.pos.y + ROOF_STEP)) return null; // ground ahead
      const cur = roofAt(b.pos), goal = b.ai.goalRoof;
      if (!goal || goal === cur) return 'stop';
      // only jump if the other roof is within reach along this direction
      let reach = null;
      for (let d = 0.5; d <= 5; d += 0.25) if (inRect(goal, b.pos.x + wx * d, b.pos.z + wz * d, 0.35)) { reach = d; break; }
      const up = goal.top - b.pos.y;
      if (reach === null || reach > (up > 0.8 ? 4.6 : 4.0)) return 'stop';
      if (up > 0.8) return b.breathCd <= 0 ? 'breath' : 'stop';
      return 'jump';
    },
    allowPush: (p, x, z) => !p.onGround || !!roofTopUnder(x, z, p.pos.y + 0.1),
    hookBlocked: (prev, pos) => !!firstBoxHit(prev, pos) || pos.y < ROOFS.ground,
    terrain: roofsTerrain,
    clampGoal() {},
    pickupSpot() { const roofs = WALKABLE.filter((b) => b.kind === 'roof'); const b = roofs[(Math.random() * roofs.length) | 0]; const v = randInRoof(b, 1.2); return [v.x, v.z, b.top]; }
  }
};
let MAP = MAPS.well;
function setMap(id) {
  MAP = MAPS[id] || MAPS.well;
  for (const m of Object.values(MAPS)) m.group.visible = m === MAP;
  grappleSurfaces = MAP.id === 'well' ? wellSurfaces : [];
}

// ---------- pigs ----------
function makePig(skin, pants) {
  const g = new THREE.Group();
  const skinM = lam(skin), bellyM = lam(new THREE.Color(skin).lerp(new THREE.Color(0xffffff), 0.25)), darkM = lam(0x2f2a28), metalM = lam(0x7a756f), pantsM = lam(pants), goldM = lam(0xd4a23a), tankM = lam(0x6aa84f);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.4 * s, 0.75, 0);
    leg.add(mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.7, 10), pantsM, 0, -0.35, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.36, 0.2, 0.55), darkM, 0, -0.68, 0.08));
    g.add(leg); legs.push(leg);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.9, 0.78, 0.55, 18), pantsM, 0, 0.92, 0));
  const body = mesh(new THREE.SphereGeometry(1, 22, 16), skinM, 0, 1.6, 0); body.scale.set(1.08, 0.98, 0.96); g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.72, 18, 12), bellyM, 0, 1.4, 0.38));
  g.add(mesh(new THREE.SphereGeometry(0.44, 16, 12), skinM, 0, 2.48, 0.3));
  for (const s of [-1, 1]) { const ear = mesh(new THREE.ConeGeometry(0.14, 0.3, 6), skinM, 0.28 * s, 2.86, 0.2); ear.rotation.z = -0.5 * s; g.add(ear); }
  const snout = mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.36, 12), darkM, 0, 2.4, 0.74); snout.rotation.x = Math.PI / 2; g.add(snout);
  for (const s of [-1, 1]) {
    const f = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 10), metalM, 0.32 * s, 2.34, 0.6); f.rotation.z = Math.PI / 2; g.add(f);
    g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), lam(0xff9a3c, { emissive: 0x552200 }), 0.17 * s, 2.58, 0.64));
  }
  const tank = mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.0, 12), tankM, 0, 2.0, -0.85); tank.rotation.x = 0.3; g.add(tank);
  const armL = mesh(new THREE.SphereGeometry(1, 12, 10), skinM, -1.02, 1.62, 0.25); armL.scale.set(0.3, 0.55, 0.3); armL.rotation.x = -0.8; g.add(armL);
  const armR = mesh(new THREE.SphereGeometry(1, 12, 10), skinM, 1.02, 1.62, 0.25); armR.scale.set(0.3, 0.55, 0.3); armR.rotation.x = -0.8; g.add(armR);
  const gun = new THREE.Group(); gun.position.set(1.05, 1.35, 0.75);
  gun.add(mesh(new THREE.BoxGeometry(0.32, 0.34, 0.95), goldM));
  const barrel = mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.4, 10), darkM, 0, 0.02, 0.62); barrel.rotation.x = Math.PI / 2; gun.add(barrel);
  g.add(gun);
  const hook = new THREE.Group(); hook.position.set(-1.05, 1.35, 0.72);
  const hk = mesh(new THREE.TorusGeometry(0.22, 0.055, 6, 14, Math.PI * 1.4), metalM); hk.rotation.y = Math.PI / 2; hook.add(hk);
  g.add(hook);
  return { g, legs, hook };
}
function makeTag(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '800 38px "Saira Condensed", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(name.toUpperCase(), 128, 34);
  x.fillStyle = '#ff6b6b'; x.fillText(name.toUpperCase(), 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true }));
  s.scale.set(2.6, 0.65, 1); s.position.y = 3.45; return s;
}
const chainGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6); chainGeo.translate(0, 0.5, 0);
const chainMat = lam(0x5b5550, { emissive: 0x1a1612 });
const hookHeadGeo = new THREE.TorusGeometry(0.26, 0.07, 6, 14, Math.PI * 1.4);
function makeHookVis() {
  const chain = new THREE.Mesh(chainGeo, chainMat); chain.visible = false; scene.add(chain);
  const head = new THREE.Group(); const t = new THREE.Mesh(hookHeadGeo, lam(0x9a948c, { emissive: 0x221e1a })); t.rotation.y = Math.PI / 2; head.add(t);
  head.visible = false; scene.add(head);
  return { chain, head };
}

const pigs = [];
function newPig(name, isPlayer, i) {
  const p = {
    name, isPlayer, pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, onGround: false, state: 'dead',
    hookCd: 0, breathCd: 0, stunT: 0, protect: 0, respawnT: 0, kills: 0, lastHooker: null, lastHookT: -99,
    hook: null, pull: null, walk: 0, hasGrapple: false, grapple: null, zipping: false, meleeT: 0, meleeHit: false, knockT: 0, ai: { thinkT: 0, tgt: null, aimT: 0, goal: new V3(), goalT: 0, save: undefined, saveT: 0 }
  };
  if (!isPlayer) {
    const m = makePig(SKINS[i % SKINS.length], PANTS[i % PANTS.length]);
    p.mesh = m.g; p.legs = m.legs; p.handHook = m.hook; p.mesh.add(makeTag(name)); scene.add(p.mesh);
    p.mesh.visible = false;
  }
  p.vis = makeHookVis();
  pigs.push(p); return p;
}
const player = newPig('You', true, 0);
NAMES.forEach((n, i) => newPig(n, false, i));
const net = createNet({ scene, makePig, makeTag, makeHookVis, makeGrappleVis, player, SKINS, PANTS, toast, HOOK_SPEED, HOOK_RANGE });

// ---------- first-person viewmodel ----------
const vm = new THREE.Group(); camera.add(vm);
const vmSkin = lam(0xe7a08f), vmMetal = lam(0x8a847c), vmGold = lam(0xd4a23a, { emissive: 0x2a1a00 }), vmDark = lam(0x2f2a28);
const vmGun = new THREE.Group(); vmGun.position.set(0.3, -0.27, -0.7); vm.add(vmGun);
vmGun.add(mesh(new THREE.BoxGeometry(0.12, 0.13, 0.36), vmGold, 0, 0, 0, false));
{ const b = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 10), vmDark, 0, 0.01, -0.25, false); b.rotation.x = Math.PI / 2; vmGun.add(b);
  const fa = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 10), vmSkin, 0.01, -0.07, 0.2, false); fa.rotation.x = Math.PI / 2; vmGun.add(fa); }
const vmHookArm = new THREE.Group(); vmHookArm.position.set(-0.3, -0.29, -0.7); vm.add(vmHookArm);
{ const fa = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 10), vmSkin, 0, -0.03, 0.18, false); fa.rotation.x = Math.PI / 2; vmHookArm.add(fa); }
const vmHook = mesh(new THREE.TorusGeometry(0.075, 0.02, 6, 14, Math.PI * 1.35), vmMetal, 0, 0.03, -0.03, false); vmHook.rotation.y = Math.PI / 2; vmHookArm.add(vmHook);
const vmMask = new THREE.Group(); vm.add(vmMask);
vmMask.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 12), vmDark, 0, 0, 0, false));
for (const s of [-1, 1]) { const f = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10), vmMetal, 0.13 * s, -0.03, 0, false); f.rotation.z = Math.PI / 2; vmMask.add(f); }
vmMask.rotation.x = Math.PI / 2; vmMask.position.set(0, -1.2, -0.5);
vm.traverse(o => { if (o.material) { o.renderOrder = 10; } });

// ---------- particles ----------
const puffs = [];
function puff(pos, color = 0x7dff4a, n = 8, size = 1.4) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, opacity: 0.7, depthWrite: false }));
    s.position.copy(pos).add(new V3(rnd(-0.7, 0.7), rnd(0, 0.6), rnd(-0.7, 0.7)));
    s.scale.setScalar(size); scene.add(s);
    puffs.push({ s, v: new V3(rnd(-1.5, 1.5), rnd(-0.5, 1.2), rnd(-1.5, 1.5)), life: 0.9, max: 0.9, size });
  }
}

// ---------- audio ----------
let AC = null, master = null, noiseBuf = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.45 * settings.vol; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function vol(pos) { if (!pos) return 1; const d = pos.distanceTo(camera.position); return Math.max(0, 1 - d / 45); }
function tone(f, dur, type, v, to, delay = 0) {
  if (!AC || v <= 0.002) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function hiss(dur, v, f0, f1) {
  if (!AC || v <= 0.002) return;
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
const sfx = {
  throw: (p) => { const v = vol(p); hiss(0.2, 0.35 * v, 1200, 3500); tone(260, 0.12, 'square', 0.06 * v, 820); },
  clank: (p) => { const v = vol(p); tone(1250, 0.28, 'triangle', 0.3 * v); tone(1870, 0.22, 'triangle', 0.18 * v, null, 0.02); },
  oink: (p, k = 1) => { const v = vol(p); tone(330 * k, 0.12, 'sawtooth', 0.12 * v, 210 * k); tone(300 * k, 0.15, 'sawtooth', 0.1 * v, 170 * k, 0.13); },
  breath: (p) => { const v = vol(p); hiss(0.65, 0.5 * v, 300, 2200); tone(90, 0.4, 'sine', 0.25 * v, 200); },
  scream: (p) => { const v = vol(p); tone(720, 1.1, 'sawtooth', 0.11 * v, 110); },
  kill: () => { tone(880, 0.14, 'square', 0.12); tone(1320, 0.3, 'square', 0.12, null, 0.08); },
  jump: () => tone(200, 0.1, 'sine', 0.08, 320),
  deflect: (p) => {
    const v = vol(p);
    [523, 1397, 2093, 3135, 4186].forEach((f, i) => tone(f * rnd(0.98, 1.02), 0.55 - i * 0.07, i % 2 ? 'sine' : 'triangle', (0.24 - i * 0.035) * v));
    hiss(0.07, 0.6 * v, 3500, 7000);
    for (let k = 0; k < 7; k++) tone(rnd(2400, 3800), 0.035, 'triangle', 0.07 * v, null, 0.07 + k * 0.032 + rnd(0, 0.015));
  },
  swipe: (p) => { const v = vol(p); hiss(0.2, 0.3 * v, 700, 2600); },
  thud: (p) => { const v = vol(p); tone(150, 0.18, 'sine', 0.4 * v, 55); hiss(0.1, 0.25 * v, 400, 200); }
};

// ---------- helpers ----------
const center = (p, o = new V3()) => o.set(p.pos.x, p.pos.y + 1.5, p.pos.z);
function fwd(p) { return new V3(Math.sin(p.yaw), 0, Math.cos(p.yaw)); }
function handPos(p) {
  if (p.isPlayer) return camera.localToWorld(new V3(-0.3, -0.26, -0.75));
  return p.mesh.localToWorld(new V3(-1.05, 1.35, 0.72));
}
function segSphere(a, b, c, r) {
  const ab = b.clone().sub(a), l2 = ab.lengthSq();
  const t = l2 ? Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / l2)) : 0;
  return a.clone().addScaledVector(ab, t).distanceToSquared(c) <= r * r;
}
function pullEnd(hooker, target) {
  const d = new V3(target.pos.x - hooker.pos.x, 0, target.pos.z - hooker.pos.z);
  const L = d.length(); if (L < 0.01) d.set(0, 0, 1); else d.divideScalar(L);
  const gap = Math.min(PULL_GAP, L);
  const end = hooker.pos.clone().addScaledVector(d, gap); end.y = hooker.pos.y + 1.0;
  return { end, dir: d, gap };
}
function endInPit(h, t) { const { end } = pullEnd(h, t); return MAP.deadlyEnd(end); }

// ---------- game state ----------
const game = { state: 'menu', target: 15, diff: 'normal', T: 0, practice: true, dummy: true, online: false };
const practiceOn = () => game.practice && (game.state === 'playing' || game.state === 'paused');
let D = DIFF.normal;

function spawn(p) {
  p.pos.copy(MAP.spawn(p)); p.vel.set(0, 0, 0); p.state = 'alive'; p.stunT = 0; p.protect = 1.2; p.hook = null; p.pull = null;
  p.lastHooker = null; p.meleeT = 0; p.knockT = 0; p.hookCd = p.isPlayer ? 0 : rnd(1, 3); p.breathCd = 0; p.onGround = true;
  if (!p.isPlayer && practiceOn() && game.dummy) { p.pos.copy(MAP.rimSpot()); p.protect = 0; }
  p.yaw = Math.atan2(-p.pos.x, -p.pos.z); p.pitch = -0.12;
  p.ai.tgt = null; p.ai.goalT = 0; p.ai.save = undefined;
  if (p.mesh) p.mesh.visible = true;
}

function fireHook(p, origin, dir) {
  if (p.hook || p.hookCd > 0 || p.state !== 'alive' || p.stunT > 0) return;
  p.hook = { phase: 'out', pos: origin.clone(), dir: dir.clone().normalize(), dist: 0, target: null };
  p.hookCd = p.isPlayer ? HOOK_CD : rnd(D.cd[0], D.cd[1]);
  sfx.throw(origin);
  if (p.isPlayer && net.room) { p.hook.id = net.newHookId(); net.send('hook_fire', { id: p.hook.id, o: origin.toArray(), d: p.hook.dir.toArray() }); }
}
function breathe(p, wx = 0, wz = 0) {
  if (p.breathCd > 0 || p.state !== 'alive' || p.stunT > 0) return false;
  p.vel.y = BREATH_V; p.vel.x += wx * 4; p.vel.z += wz * 4; p.onGround = false; p.breathCd = BREATH_CD;
  puff(p.pos.clone().add(new V3(0, 0.4, 0)), 0x7dff4a, 10, 1.8); sfx.breath(p.pos);
  if (p.isPlayer) { gasfx.style.opacity = 1; setTimeout(() => gasfx.style.opacity = 0, 350); breathAnim = 0.7; }
  if (p.isPlayer && net.room) net.send('fx', { k: 'breath', p: p.pos.toArray() });
  return true;
}
function meleeTarget(p) {
  const f = fwd(p); let best = null, bd = MELEE_RANGE;
  const cands = p.isPlayer && net.room ? pigs.concat(net.proxies()) : pigs;
  for (const q of cands) {
    if (q === p || q.state !== 'alive' || q.protect > 0) continue;
    const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d > bd || Math.abs(q.pos.y - p.pos.y) > 2 || d < 0.01) continue;
    if ((dx * f.x + dz * f.z) / d < 0.35) continue;
    best = q; bd = d;
  }
  return best;
}
function melee(p) {
  if (p.state !== 'alive' || p.stunT > 0 || p.meleeT > 0) return;
  p.meleeT = MELEE_T; p.meleeHit = false; sfx.swipe(p.pos);
  if (p.isPlayer && net.room) net.send('fx', { k: 'swipe', p: p.pos.toArray() });
}
function meleeStrike(p) {
  const q = meleeTarget(p); if (!q) return;
  const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
  if (q.isRemote) {
    net.send('shove', { to: q.id, d: [dx / d, dz / d] });
    sfx.thud(q.pos); puff(q.pos.clone().add(new V3(0, 1.4, 0)), 0xfff2d0, 4, 0.9); toast('Shoved ' + q.name);
    return;
  }
  q.vel.set(dx / d * SHOVE_V, Math.max(q.vel.y, SHOVE_UP), dz / d * SHOVE_V);
  q.onGround = false; q.knockT = 0.45;
  q.lastHooker = p; q.lastHookT = game.T;
  sfx.thud(q.pos); sfx.oink(q.pos, rnd(1.1, 1.3));
  puff(q.pos.clone().add(new V3(0, 1.4, 0)), 0xfff2d0, 4, 0.9);
  if (p.isPlayer) toast('Shoved ' + q.name);
  if (q.isPlayer) { hurtfx.style.opacity = 1; setTimeout(() => hurtfx.style.opacity = 0, 200); }
}
function deflectCheck(p, h, prev) {
  for (const q of pigs) {
    if (q === p || q.state !== 'alive' || q.meleeT <= 0) continue;
    const el = MELEE_T - q.meleeT; if (el < DEFLECT_A || el > DEFLECT_B) continue;
    const dc = center(q).addScaledVector(fwd(q), 1.1);
    if (!segSphere(prev, h.pos, dc, 1.35)) continue;
    h.phase = 'back';
    p.stunT = Math.max(p.stunT, 0.5);
    p.hookCd += p.isPlayer ? HOOK_CD : rnd(D.cd[0], D.cd[1]);
    sfx.deflect(h.pos);
    puff(h.pos.clone(), 0xffd070, 10, 0.45); puff(h.pos.clone(), 0xffffff, 4, 0.3);
    if (q.isPlayer) toast('Deflected!', 'k');
    if (p.isPlayer) toast('Hook deflected by ' + q.name);
    return true;
  }
  return false;
}
function hookHit(h, q) {
  const hk = h.hook;
  if (q.state === 'hooked' && q.pull) { const prev = q.pull.hooker; if (prev.hook) prev.hook.phase = 'back'; }
  if (q.hook) q.hook.phase = 'back';
  const { end, dir, gap } = pullEnd(h, q);
  q.state = 'hooked'; q.pull = { hooker: h, end, dir, gap, base: Math.atan2(dir.x, dir.z), t: 0 };
  if (!h.isPlayer) h.ai.flick = Math.random() < D.flick; q.vel.set(0, 0, 0);
  q.lastHooker = h; q.lastHookT = game.T;
  hk.phase = 'pull'; hk.target = q;
  sfx.clank(q.pos); sfx.oink(q.pos, rnd(0.9, 1.2));
  if (h.isPlayer) toast('Enemy hooked +10');
  if (q.isPlayer) { toast('Hooked by ' + h.name); hurtfx.style.opacity = 1; setTimeout(() => hurtfx.style.opacity = 0, 250); }
}
function releasePull(q) {
  if (!q.pull) return;
  const h = q.pull.hooker;
  if (h.hook && h.hook.target === q) h.hook.phase = 'back';
  if (q.isPlayer && h.isRemote && q.pull.hookId) net.send('pull_end', { id: q.pull.hookId, to: h.id });
  q.vel.set(q.pull.dir.x * 2, 0, q.pull.dir.z * 2);
  q.state = 'alive'; q.stunT = 0.35; q.pull = null; q.onGround = false;
}
function eliminate(v) {
  if (v.state === 'hooked') releasePull(v);
  v.state = 'dead'; v.respawnT = v.isPlayer ? 3 : 2.5; v.grapple = null; v.hasGrapple = false;
  if (v.hook) { const t = v.hook.target; v.hook = null; if (t && t.pull && t.pull.hooker === v) releasePull(t); }
  if (v.mesh) v.mesh.visible = false;
  const k = (v.lastHooker && v.lastHooker !== v && game.T - v.lastHookT < 6 && v.lastHooker.state !== undefined) ? v.lastHooker : null;
  sfx.scream(v.pos);
  if (v.isPlayer && net.room) net.send('died', { by: k && k.isRemote ? k.id : null });
  else if (k) {
    k.kills++;
    feed(k, v);
    if (k.isPlayer) { toast('Eliminated ' + v.name + '  +100', 'k'); sfx.kill(); }
  } else feed(null, v);
  if (v.isPlayer) showDead(k);
  if (game.state === 'playing' && !net.room && k && k.kills >= game.target) endGame(k);
}

// ---------- physics ----------
function setR(p, r) { const cr = Math.hypot(p.pos.x, p.pos.z) || 1; p.pos.x *= r / cr; p.pos.z *= r / cr; }
function stepBody(p, dt, wx, wz, jump) {
  if (p.stunT > 0) { wx = wz = 0; jump = false; }
  const k = p.onGround ? 14 : 3;
  if (p.knockT <= 0 && !p.zipping && (p.onGround || wx || wz)) {
    const f = Math.min(1, k * dt);
    p.vel.x += (wx * SPEED - p.vel.x) * f; p.vel.z += (wz * SPEED - p.vel.z) * f;
  }
  if (jump && p.onGround) { p.vel.y = JUMP; p.onGround = false; if (p.isPlayer) sfx.jump(); }
  p.vel.y -= G * dt;
  const ox = p.pos.x, oy = p.pos.y, oz = p.pos.z, wasGround = p.onGround;
  p.pos.addScaledVector(p.vel, dt);
  p.onGround = false;
  MAP.collide(p, ox, oy, oz, wasGround);
}
function collideWell(p, ox, oy, oz) {
  const oldR = Math.hypot(ox, oz), oldY = oy;
  let r = Math.hypot(p.pos.x, p.pos.z);
  if (r > OUTER_R - BODY_R) { setR(p, OUTER_R - BODY_R); r = OUTER_R - BODY_R; }
  if (r >= INNER) {
    if (p.pos.y <= 0) { p.pos.y = 0; if (p.vel.y < 0) p.vel.y = 0; p.onGround = true; }
    const flying = (p.knockT > 0 && p.vel.y > 0) || p.zipping; // a shoved pig rising off the ground clears the curb
    if (!flying && p.pos.y < CURB_H - 0.01 && r < INNER + BODY_R) setR(p, INNER + BODY_R);
  } else if (r >= PIT_R) {
    if (p.pos.y <= CURB_H && oldY >= CURB_H - 0.08) { p.pos.y = CURB_H; if (p.vel.y < 0) p.vel.y = 0; p.onGround = true; }
    else if (p.pos.y < CURB_H && !(p.knockT > 0 && p.vel.y > 0) && !p.zipping) { if (oldR >= INNER - 0.001) setR(p, INNER + BODY_R); else setR(p, PIT_R - BODY_R * 0.5); }
  } else if (!p.zipping && p.pos.y < CURB_H && r > PIT_R - BODY_R * 0.5) setR(p, PIT_R - BODY_R * 0.5);
}
function stepPull(q, dt) {
  const pl = q.pull, h = pl.hooker; pl.t += dt;
  if (pl.t <= FLICK_T) {
    // hook flick: during the first moments of the pull, the drop point follows where the hooker faces
    let da = h.yaw - pl.base; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const a = pl.base + Math.max(-FLICK_MAX, Math.min(FLICK_MAX, da));
    pl.dir.set(Math.sin(a), 0, Math.cos(a));
    pl.end.set(h.pos.x + pl.dir.x * pl.gap, h.pos.y + 1.0, h.pos.z + pl.dir.z * pl.gap);
  }
  const d = pl.end.clone().sub(q.pos), L = d.length(), s = PULL_SPEED * dt;
  if (L <= s || pl.t > 1.3 || h.state !== 'alive') { q.pos.copy(L <= s ? pl.end : q.pos); releasePull(q); }
  else q.pos.addScaledVector(d.divideScalar(L), s);
}

// ---------- bots ----------
function botThink(b, dt) {
  if (practiceOn() && game.dummy) return [0, 0, false];
  const ai = b.ai; let wx = 0, wz = 0, jump = false;
  if (b.stunT > 0) return [0, 0, false];
  const res = MAP.rescue(b);
  if (res) {
    if (ai.save === undefined) { ai.save = Math.random() < D.save; ai.saveT = rnd(0.12, 0.45); }
    ai.saveT -= dt; wx = res.wx; wz = res.wz;
    if (ai.save && ai.saveT <= 0) breathe(b, wx, wz);
    if (b.hasGrapple && !b.grapple && ai.saveT <= -0.15 && b.breathCd > 0.5) { const o = center(b); fireGrapple(b, o, res.aim.clone().sub(o)); }
    b.yaw = Math.atan2(wx, wz);
    return [wx, wz, false];
  }
  if (b.onGround) ai.save = undefined;
  if (b.meleeT <= 0 && !(b.hook && b.hook.phase === 'pull')) {
    const c = center(b);
    for (const o of pigs) {
      const h = o.hook; if (o === b || !h || h.phase !== 'out') continue;
      const to = c.clone().sub(h.pos), d = to.length(), along = to.dot(h.dir);
      if (d > 14 || along <= 0 || to.addScaledVector(h.dir, -along).length() > 1.6) continue;
      h.tryBy = h.tryBy || new Map();
      if (!h.tryBy.has(b)) h.tryBy.set(b, Math.random() < D.deflect ? rnd(-0.06, 0.06) : null);
      const err = h.tryBy.get(b); if (err === null) continue;
      if (d / HOOK_SPEED <= MELEE_HIT + 0.01 + err) { b.yaw = Math.atan2(h.pos.x - b.pos.x, h.pos.z - b.pos.z); melee(b); break; }
    }
  }
  ai.thinkT -= dt; ai.aimT -= dt; ai.goalT -= dt;
  if (ai.thinkT <= 0) {
    ai.thinkT = rnd(0.35, 0.8);
    let best = null, bs = 1e9; const c0 = center(b);
    for (const q of pigs) {
      if (q === b || q.state !== 'alive' || q.protect > 0) continue;
      const d = center(q).distanceTo(c0); if (d > HOOK_RANGE - 1) continue;
      const s = d + rnd(0, 6) - (endInPit(b, q) ? 9 : 0);
      if (s < bs) { bs = s; best = q; }
    }
    if (best !== ai.tgt) { ai.tgt = best; ai.aimT = D.react * rnd(0.7, 1.4); }
  }
  if (ai.goalT <= 0 || Math.hypot(ai.goal.x - b.pos.x, ai.goal.z - b.pos.z) < 0.8) {
    MAP.botGoal(b, ai); ai.goalT = rnd(2, 5);
    if (pickup.active && !b.hasGrapple && Math.random() < 0.3 && MAP.reachable(b, pickup.pos, ai)) { ai.goal.copy(pickup.pos); ai.goalT = 6; }
  }
  const t = ai.tgt;
  const rooted = b.hook && b.hook.phase === 'pull';
  if (!rooted) {
    const gx = ai.goal.x - b.pos.x, gz = ai.goal.z - b.pos.z, gl = Math.hypot(gx, gz);
    if (gl > 0.5) { wx = gx / gl; wz = gz / gl; }
    if (b.onGround && !MAP.edgeJump && Math.random() < 0.004) jump = true; // idle hops are deadly on rooftops
    if (MAP.edgeJump) { const j = MAP.edgeJump(b, wx, wz); if (j === 'stop') { wx = wz = 0; ai.goalT = 0; } else if (j === 'jump') jump = true; else if (j === 'breath') breathe(b, wx, wz); }
  }
  if (b.meleeT <= 0 && !rooted) {
    const q = meleeTarget(b);
    if (q && Math.random() < dt * (MAP.nearDanger(q) ? 5 : 0.8)) melee(b);
  }
  let face = (wx || wz) ? Math.atan2(wx, wz) : b.yaw;
  if (t && t.state === 'alive') {
    const tc = center(t); face = Math.atan2(tc.x - b.pos.x, tc.z - b.pos.z);
    if (b.hasGrapple && !b.grapple && b.onGround && tc.distanceTo(center(b)) > 9 && Math.random() < dt * 0.25) fireGrapple(b, center(b), tc.clone().sub(center(b)));
    if (ai.aimT <= 0 && !b.hook && b.hookCd <= 0 && b.stunT <= 0) {
      const good = endInPit(b, t);
      if (good || Math.random() > D.smart) {
        const o = center(b).addScaledVector(fwd(b), 0.8);
        const dist = tc.distanceTo(o), lead = dist / HOOK_SPEED;
        const aim = tc.addScaledVector(t.vel, lead * rnd(0.6, 1.1));
        aim.add(new V3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)).multiplyScalar(D.aim * (0.4 + dist / 16)));
        fireHook(b, o, aim.sub(o));
        ai.aimT = D.react;
      } else ai.aimT = 0.4;
    }
  }
  if (rooted && ai.flick) face = Math.atan2(-b.pos.x, -b.pos.z);
  if (b.meleeT > 0) face = b.yaw;
  let dy = face - b.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  b.yaw += dy * Math.min(1, dt * 10);
  return [wx, wz, jump];
}

// ---------- input ----------
// Every control is an action with two slots. Codes are keyboard codes ("KeyW") or mouse buttons ("Mouse0".."Mouse4").
const keys = {};   // codes currently held down
let locked = false, dragMode = false, dragging = false, breathAnim = 0, recoil = 0, capturing = null;
const SENS = 0.0022; // base sensitivity, scaled by the Settings slider
const ACTIONS = [
  ['forward', 'Move forward', ['KeyW', 'ArrowUp']],
  ['back', 'Move back', ['KeyS', 'ArrowDown']],
  ['left', 'Strafe left', ['KeyA', 'ArrowLeft']],
  ['right', 'Strafe right', ['KeyD', 'ArrowRight']],
  ['jump', 'Jump', ['Space', null]],
  ['hook', 'Chain hook', ['ShiftLeft', 'ShiftRight']],
  ['breath', 'Breathing mask', ['KeyE', null]],
  ['shove', 'Shove / deflect', ['KeyV', 'Mouse3']],
  ['grapple', 'Grapple hook', ['KeyR', null]],
  ['scores', 'Scoreboard (hold)', ['Tab', null]],
  ['dummy', 'Practice bot: dummy or combat', ['KeyB', null]]
];
const DEFAULT_KEYS = Object.fromEntries(ACTIONS.map(([id, , d]) => [id, d.slice()]));
const binds = (() => {
  const saved = settings.keys || {}, out = {};
  for (const [id] of ACTIONS) out[id] = Array.isArray(saved[id]) && saved[id].length === 2 ? saved[id].slice() : DEFAULT_KEYS[id].slice();
  return out;
})();
function held(a) { return binds[a].some((c) => c && keys[c]); }
function actionsFor(code) { return ACTIONS.map(([id]) => id).filter((id) => binds[id].includes(code)); }
function keyName(c) {
  if (!c) return '—';
  const M = { Mouse0: 'Mouse 1', Mouse1: 'Mouse 3', Mouse2: 'Mouse 2', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', ShiftLeft: 'Shift', ShiftRight: 'R-Shift',
    ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return M[c] || c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}
function keyLabel(a) { return binds[a].filter(Boolean).map(keyName).join(' / ') || 'unbound'; }
function keyShort(a) { const n = keyName(binds[a][0] || binds[a][1]); return n === 'Shift' ? '⇧' : n.length > 5 ? n.slice(0, 5) : n; }
function pressAction(a) {
  if (a === 'dummy') { if (game.state === 'playing' && game.practice) setDummy(!game.dummy); return; }
  if (game.state !== 'playing' || player.state !== 'alive') return;
  if (a === 'hook') {
    if (player.hookCd <= 0 && !player.hook && player.stunT <= 0) {
      const dir = new V3(); camera.getWorldDirection(dir);
      fireHook(player, camera.position.clone().addScaledVector(dir, 0.6), dir); recoil = 1;
    }
  } else if (a === 'shove') melee(player);
  else if (a === 'grapple') { if (player.hasGrapple) { const dir = new V3(); camera.getWorldDirection(dir); fireGrapple(player, camera.position.clone().addScaledVector(dir, 0.6), dir); } }
  else if (a === 'breath') { const [wx, wz] = moveWish(); breathe(player, wx, wz); }
}
function codeDown(code, e) {
  if (capturing) return;
  const acts = actionsFor(code);
  if (acts.length && game.state === 'playing' && e) e.preventDefault();
  if (keys[code]) return; keys[code] = true;
  for (const a of acts) pressAction(a);
}
addEventListener('keydown', (e) => { if (e.code === 'Tab') e.preventDefault(); codeDown(e.code, e); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing') return;
  if (!locked && !(dragMode && dragging)) return;
  const s = SENS * settings.sens;
  player.yaw -= e.movementX * s;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * s));
});
canvas.addEventListener('mousedown', () => { dragging = true; if (game.state === 'playing' && !locked && !dragMode) lockPointer(); });
addEventListener('mouseup', (e) => { dragging = false; keys['Mouse' + e.button] = false; if (e.button === 3 || e.button === 4) e.preventDefault(); });
document.addEventListener('mousedown', (e) => {
  if (e.button === 3 || e.button === 4) e.preventDefault(); // keep the browser's back/forward buttons from leaving the game
  if (game.state === 'playing' && (locked || dragMode)) codeDown('Mouse' + e.button, e);
});
addEventListener('contextmenu', (e) => { if (game.state === 'playing') e.preventDefault(); });
function lockPointer() {
  try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { dragMode = true; }); }
  catch (e) { dragMode = true; }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && game.state === 'playing' && !dragMode) pauseGame();
});
document.addEventListener('pointerlockerror', () => { dragMode = true; });
function moveWish() {
  const f = fwd(player), r = new V3(-f.z, 0, f.x);
  let x = 0, z = 0;
  const fw = (held('forward') ? 1 : 0) - (held('back') ? 1 : 0), st = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  x = f.x * fw + r.x * st; z = f.z * fw + r.z * st;
  const l = Math.hypot(x, z); return l ? [x / l, z / l] : [0, 0];
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const gasfx = $('gasfx'), hurtfx = $('hurtfx');
const HOOK_SVG = () => `<span class="pit">⟶ ${MAP.word}</span>`;
function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function feed(k, v) {
  if (game.state !== 'playing') return;
  const d = document.createElement('div');
  const nm = (p) => `<b class="${p.isPlayer ? 'me' : ''}">${esc(p.name)}</b>`;
  d.innerHTML = k ? `${nm(k)}${HOOK_SVG()}${nm(v)}` : `${nm(v)}<span class="pit">${MAP.fell}</span>`;
  const f = $('feed'); f.prepend(d); while (f.children.length > 5) f.lastChild.remove();
  setTimeout(() => d.remove(), 5000);
}
function toast(t, cls = '') {
  if (game.state !== 'playing') return;
  const d = document.createElement('div'); d.textContent = t; if (cls) d.className = cls;
  const w = $('toasts'); w.appendChild(d); while (w.children.length > 3) w.firstChild.remove();
  setTimeout(() => d.remove(), 1600);
}
function showDead(k) {
  const el = $('dead'); el.hidden = false;
  el.querySelector('.big').innerHTML = k ? `Pulled in by <b>${esc(k.name)}</b>` : 'You fell in the <b>pit</b>';
}
function ranked() { return pigs.filter(p => !(p.state === 'dead' && p.respawnT === Infinity)).sort((a, b) => b.kills - a.kills || (a.isPlayer ? -1 : 1)); }
function sbRows(list, win) {
  return list.map((p, i) => `<tr class="${p === win ? 'win' : p.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td class="n">${p.kills}</td></tr>`).join('');
}
let hudT = 0;
function updateHUD(dt) {
  if (game.state !== 'playing' && game.state !== 'paused') return;
  const stunned = player.state === 'hooked' || (player.state === 'alive' && player.stunT > 0);
  $('banner').hidden = !stunned;
  const hc = player.hook ? 0 : 1 - Math.max(0, player.hookCd) / HOOK_CD;
  const bc = 1 - Math.max(0, player.breathCd) / BREATH_CD;
  const H = $('hookcd'), B = $('breathcd');
  H.style.setProperty('--p', hc.toFixed(3)); B.style.setProperty('--p', bc.toFixed(3));
  H.classList.toggle('ready', hc >= 1); B.classList.toggle('ready', bc >= 1);
  H.querySelector('.in').textContent = player.hookCd > 0 ? Math.ceil(player.hookCd) : keyShort('hook');
  B.querySelector('.in').textContent = player.breathCd > 0 ? Math.ceil(player.breathCd) : keyShort('breath');
  const GR = $('grapcd'); GR.hidden = !player.hasGrapple; GR.querySelector('.in').textContent = keyShort('grapple'); GR.style.setProperty('--p', '1');
  if (player.state === 'dead') $('dead').querySelector('.sm').textContent = 'Respawning in ' + Math.max(0, player.respawnT).toFixed(1) + 's';
  else $('dead').hidden = true;
  hudT -= dt; if (hudT > 0) return; hudT = 0.2;
  const list = net.room ? net.scoreList(player) : ranked();
  if (!list.includes(player)) list.push(player);
  const lead = list[0], myRank = list.indexOf(player) + 1;
  const row = (p, rk, cls) => `<div class="row ${cls}"><span class="rk">${rk}</span><span>${esc(p.name)}</span><span class="n">${p.kills}</span></div>`;
  $('score').innerHTML = `<div class="cap">${game.online ? 'Online · ' + net.count() + (net.count() === 1 ? ' pig' : ' pigs') + ' in room' : practiceOn() ? 'Practice · ' + (game.dummy ? 'Dummy' : 'Combat') + ' bot · B to switch' : 'First to ' + game.target}</div>` + (lead === player ? row(player, 1, 'lead') + (list[1] ? row(list[1], 2, '') : '') : row(lead, 1, 'lead') + row(player, myRank, 'me'));
  $('you').innerHTML = `<small>Eliminations</small>${player.kills} / ${game.target}`;
  const tab = $('tabsb'), showTab = held('scores'); tab.hidden = !showTab;
  if (showTab) tab.innerHTML = `<table class="sb">${sbRows(list)}</table>`;
}

// ---------- online combat ----------
// The thrower's browser decides hooks and shoves; the victim's browser applies them (or answers "deflected").
const DEFLECT_GRACE_EARLY = 0.08, DEFLECT_GRACE_LATE = 0.14; // extra time for lag when a hit arrives over the network
const deflectedIds = new Set();
function onlineHookHit(h, r) {
  const hk = h.hook;
  hk.phase = 'pull'; hk.target = r; r.pullingMe = true; r.pullDeadline = performance.now() + 1700;
  net.send('hook_hit', { id: hk.id, to: r.id });
  net.send('hook_upd', { id: hk.id, s: 'attach', tgt: r.id });
  sfx.clank(r.pos); toast('Enemy hooked +10');
}
function facing(p, q) {
  const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1, f = fwd(p);
  return (dx * f.x + dz * f.z) / d;
}
function canDeflect(from) {
  if (player.state !== 'alive' || player.meleeT <= 0) return false;
  const el = MELEE_T - player.meleeT;
  return el >= DEFLECT_A - DEFLECT_GRACE_EARLY && el <= DEFLECT_B + DEFLECT_GRACE_LATE && facing(player, from) > 0.3;
}
function localDeflect(id, from, at) {
  deflectedIds.add(id);
  net.send('hook_result', { id, to: from.id, r: 'deflect' });
  net.send('fx', { k: 'deflect', p: at.toArray() });
  sfx.deflect(at); puff(at.clone(), 0xffd070, 10, 0.45); puff(at.clone(), 0xffffff, 4, 0.3);
  toast('Deflected!', 'k');
}
function checkIncomingDeflects() {
  if (player.state !== 'alive' || player.meleeT <= 0) return;
  const el = MELEE_T - player.meleeT; if (el < DEFLECT_A || el > DEFLECT_B) return;
  const dc = center(player).addScaledVector(fwd(player), 1.1);
  for (const ch of net.incoming()) {
    if (ch.kind === 'grap' || ch.phase !== 'out' || deflectedIds.has(ch.id)) continue;
    const from = net.proxies().find((r) => r.id === ch.from); if (!from) continue;
    if (segSphere(ch.prev, ch.pos, dc, 1.35)) { ch.phase = 'back'; localDeflect(ch.id, from, ch.pos.clone()); }
  }
}
net.on('hook_hit', (m, from) => {
  if (!from) return;
  if (deflectedIds.has(m.id)) return; // we already deflected this hook
  const reply = (r) => net.send('hook_result', { id: m.id, to: from.id, r });
  if (player.state !== 'alive' || player.protect > 0 || game.state !== 'playing') return reply('reject');
  if (canDeflect(from)) return localDeflect(m.id, from, center(player).addScaledVector(fwd(player), 1.1));
  if (player.hook) player.hook.phase = 'back';
  const { end, dir, gap } = pullEnd(from, player);
  player.state = 'hooked'; player.vel.set(0, 0, 0);
  player.pull = { hooker: from, end, dir, gap, base: Math.atan2(dir.x, dir.z), t: 0, hookId: m.id };
  player.lastHooker = from; player.lastHookT = game.T;
  sfx.clank(player.pos); sfx.oink(player.pos, rnd(0.9, 1.2));
  toast('Hooked by ' + from.name); hurtfx.style.opacity = 1; setTimeout(() => hurtfx.style.opacity = 0, 250);
  reply('ok');
});
net.on('hook_result', (m, from) => {
  const h = player.hook;
  if (!h || h.id !== m.id) return;
  if (m.r === 'ok') return;
  h.phase = 'back'; if (h.target && h.target.isRemote) h.target.pullingMe = false;
  if (m.r === 'deflect') {
    player.stunT = Math.max(player.stunT, 0.5); player.hookCd += HOOK_CD;
    toast('Hook deflected by ' + (from ? from.name : 'someone'));
  }
});
net.on('pull_end', (m, from) => { if (from) from.pullingMe = false; });
net.on('shove', (m, from) => {
  if (!from || player.state !== 'alive' || player.protect > 0 || !Array.isArray(m.d)) return;
  player.vel.set(m.d[0] * SHOVE_V, Math.max(player.vel.y, SHOVE_UP), m.d[1] * SHOVE_V);
  player.onGround = false; player.knockT = 0.45;
  player.lastHooker = from; player.lastHookT = game.T;
  sfx.thud(player.pos); hurtfx.style.opacity = 1; setTimeout(() => hurtfx.style.opacity = 0, 200);
});
net.on('fx', (m) => {
  const at = new V3(...m.p);
  if (m.k === 'breath') { puff(at.clone().add(new V3(0, 0.4, 0)), 0x7dff4a, 10, 1.8); sfx.breath(at); }
  else if (m.k === 'deflect') { sfx.deflect(at); puff(at.clone(), 0xffd070, 10, 0.45); }
  else if (m.k === 'swipe') sfx.swipe(at);
});
net.on('kill', (m) => {
  const me = net.myId;
  const k = m.killer ? { name: net.nameOf(m.killer), isPlayer: m.killer === me } : null;
  const v = { name: net.nameOf(m.victim), isPlayer: m.victim === me };
  feed(k, v);
  if (m.killer === me) { toast('Eliminated ' + v.name + '  +100', 'k'); sfx.kill(); }
});
net.on('win', (m) => { toast((m.who === net.myId ? 'You win' : m.name + ' wins') + ' the round!', 'k'); if (m.who === net.myId) sfx.kill(); });
net.on('round', () => toast('New round! Scores reset'));
net.on('grab_ok', () => grantGrapple(player));
net.on('grabbed', (m, from) => { sfx.pickup(pickup.pos); toast((from ? from.name : 'Someone') + ' grabbed the grapple'); });

// ---------- flow ----------
function setPressed(groupId, v) { $(groupId).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
$('diff').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { game.diff = b.dataset.v; setPressed('diff', b.dataset.v); } });
$('mode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { game.practice = b.dataset.v === 'practice'; game.online = b.dataset.v === 'online'; setPressed('mode', b.dataset.v); $('botopt').hidden = !game.practice; $('onlineopt').hidden = !game.online; } });
try { $('pname').value = localStorage.getItem('ptp-name') || ''; } catch (e) { /* storage unavailable */ }
$('pbot').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setDummy(b.dataset.v === 'dummy'); });
function setDummy(v) { game.dummy = v; setPressed('pbot', v ? 'dummy' : 'combat'); toast(v ? 'Practice bot: dummy' : 'Practice bot: combat'); }
game.mapId = 'well';
$('mapsel').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.dataset.v === game.mapId) return;
  game.mapId = b.dataset.v; setPressed('mapsel', game.mapId); setMap(game.mapId);
  resetPickup();
  for (const p of pigs) if (!p.isPlayer) { p.hook = null; p.pull = null; p.state = 'alive'; spawn(p); }
});
$('tgt').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { game.target = +b.dataset.v; setPressed('tgt', b.dataset.v); } });
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('mnote').textContent = 'Pull The Pig needs a keyboard and mouse.';

async function startGame() {
  initAudio();
  if (game.online && !net.room) {
    const name = ($('pname').value || '').trim() || 'Pig';
    try { localStorage.setItem('ptp-name', name); } catch (e) { /* storage unavailable */ }
    $('mnote').textContent = 'Connecting to ' + SERVER_URL + '…';
    try { await net.connect(name, game.mapId); }
    catch (e) { $('mnote').textContent = 'Could not reach the game server at ' + SERVER_URL + '. Start it with "npm run dev" and try again.'; return; }
    $('mnote').textContent = 'Click Play to lock the mouse. Press Esc to pause.';
  }
  if (game.online) { game.target = 15; setPressed('tgt', '15'); }
  if (!game.online && net.room) net.leave();
  D = DIFF[game.diff];
  for (const p of pigs) { p.kills = 0; p.state = 'dead'; p.hook = null; p.pull = null; if (p.mesh) p.mesh.visible = false; }
  resetPickup();
  game.state = 'playing';
  for (const p of pigs) { if (!p.isPlayer && (game.online || (game.practice && p !== pigs[1]))) { p.respawnT = Infinity; continue; } spawn(p); }
  $('feed').innerHTML = ''; $('toasts').innerHTML = '';
  $('menu').hidden = true; $('over').hidden = true; $('pause').hidden = true; $('hudwrap').hidden = false; $('dead').hidden = true;
  vm.visible = true;
  game.state = 'playing';
  lockPointer(); canvas.focus();
}
function pauseGame() { if (game.state !== 'playing') return; game.state = 'paused'; $('pause').hidden = false; }
function resumeGame() { $('pause').hidden = true; game.state = 'playing'; lockPointer(); canvas.focus(); }
function wakeBots() { for (const p of pigs) if (!p.isPlayer && p.state === 'dead' && p.respawnT === Infinity) p.respawnT = rnd(0, 1); }
function toMenu() {
  wakeBots(); net.leave();
  game.state = 'menu'; $('pause').hidden = true; $('over').hidden = true; $('hudwrap').hidden = true; $('menu').hidden = false;
  player.state = 'dead'; player.hook = null; vm.visible = false;
  if (document.exitPointerLock && locked) document.exitPointerLock();
}
function endGame(w) {
  game.state = 'over'; wakeBots();
  if (document.exitPointerLock && locked) document.exitPointerLock();
  $('hudwrap').hidden = true; vm.visible = false;
  $('owin').innerHTML = w.isPlayer ? 'You <em style="color:var(--hog);font-style:normal">win!</em>' : esc(w.name) + ' <em style="color:var(--hog);font-style:normal">wins</em>';
  $('otable').innerHTML = sbRows(ranked(), w);
  $('over').hidden = false;
  player.state = 'dead'; player.hook = null;
}
$('play').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
$('resume').addEventListener('click', resumeGame);
$('quit').addEventListener('click', toMenu);

// ---------- settings + how to play screens ----------
let settingsFrom = 'menu';
const SLIDERS = {
  sens: { el: 's-sens', out: 'o-sens', fmt: (v) => v.toFixed(2) + '×' },
  vol: { el: 's-vol', out: 'o-vol', fmt: (v) => Math.round(v * 100) + '%' },
  fov: { el: 's-fov', out: 'o-fov', fmt: (v) => Math.round(v) + '°' }
};
function applySettings() {
  camera.fov = settings.fov; camera.updateProjectionMatrix();
  if (master) master.gain.value = 0.45 * settings.vol;
  for (const [k, c] of Object.entries(SLIDERS)) { $(c.el).value = settings[k]; $(c.out).textContent = c.fmt(settings[k]); }
}
let volBeep = 0;
for (const [k, c] of Object.entries(SLIDERS)) {
  $(c.el).addEventListener('input', () => {
    settings[k] = +$(c.el).value; applySettings(); saveSettings();
    if (k === 'vol') { initAudio(); clearTimeout(volBeep); volBeep = setTimeout(() => sfx.clank(), 120); }
  });
}
function openSettings(from) { settingsFrom = from; $(from).hidden = true; applySettings(); $('settings').hidden = false; $('s-sens').focus(); }
function closeSettings() { $('settings').hidden = true; $(settingsFrom).hidden = false; }
$('msettings').addEventListener('click', () => openSettings('menu'));
$('psettings').addEventListener('click', () => openSettings('pause'));
$('sdone').addEventListener('click', closeSettings);
$('sreset').addEventListener('click', () => { Object.assign(settings, DEFAULT_SETTINGS); applySettings(); saveSettings(); });
function openHowto() { $('howto').hidden = false; $('hdone').focus(); }
$('mhowto').addEventListener('click', openHowto);
$('hdone').addEventListener('click', () => { $('howto').hidden = true; try { localStorage.setItem('ptp-seen-howto', '1'); } catch (e) { /* storage unavailable */ } });

// controls list in Settings
function renderKeys() {
  const list = $('keylist'); list.innerHTML = '';
  for (const [id, label] of ACTIONS) {
    const row = document.createElement('div'); row.className = 'krow';
    const name = document.createElement('span'); name.textContent = label; row.appendChild(name);
    for (let i = 0; i < 2; i++) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'kslot'; b.id = `k-${id}-${i}`;
      const waiting = capturing && capturing.a === id && capturing.i === i;
      b.textContent = waiting ? 'Press a key…' : keyName(binds[id][i]);
      if (waiting) b.classList.add('cap'); if (!binds[id][i]) b.classList.add('empty');
      b.addEventListener('click', () => { capturing = { a: id, i, t: performance.now() }; renderKeys(); });
      row.appendChild(b);
    }
    list.appendChild(row);
  }
}
function refreshKeyLabels() {
  document.querySelectorAll('[data-act]').forEach((el) => {
    const a = el.dataset.act, f = el.dataset.fmt;
    if (a === 'move') { const n = ['forward', 'left', 'back', 'right'].map((x) => keyName(binds[x][0] || binds[x][1])); el.textContent = n.join('') === 'WASD' ? 'WASD' : n.join(' '); }
    else el.textContent = f === 'short' ? keyShort(a) : keyLabel(a);
  });
}
function assignKey(code) {
  const { a, i } = capturing;
  let moved = null;
  if (code) for (const [id] of ACTIONS) for (let j = 0; j < 2; j++) if (binds[id][j] === code && !(id === a && j === i)) { binds[id][j] = null; moved = id; }
  binds[a][i] = code;
  settings.keys = binds; saveSettings();
  capturing = null; renderKeys(); refreshKeyLabels();
  if (moved) { const lbl = ACTIONS.find((x) => x[0] === moved)[1]; $('knote').textContent = `${keyName(code)} was moved from ${lbl}.`; }
  else $('knote').textContent = 'Click a slot, then press a key or mouse button. Backspace clears it, Esc cancels.';
}
addEventListener('keydown', (e) => {
  if (!capturing) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code === 'Escape') { capturing = null; renderKeys(); return; }
  assignKey(e.code === 'Backspace' || e.code === 'Delete' ? null : e.code);
}, true);
addEventListener('mousedown', (e) => {
  if (!capturing || performance.now() - capturing.t < 150) return;
  e.preventDefault(); e.stopImmediatePropagation();
  assignKey('Mouse' + e.button);
}, true);
addEventListener('contextmenu', (e) => { if (capturing) e.preventDefault(); }, true);
$('kreset').addEventListener('click', () => { for (const [id] of ACTIONS) binds[id] = DEFAULT_KEYS[id].slice(); settings.keys = binds; saveSettings(); capturing = null; renderKeys(); refreshKeyLabels(); });
renderKeys(); refreshKeyLabels();
applySettings();
try { if (!localStorage.getItem('ptp-seen-howto')) openHowto(); } catch (e) { openHowto(); }

// ---------- grapple hook power-up ----------
// One glowing claw sits somewhere on the plaza. Walk into it to pick it up, then press R once:
// it zips you to whatever terrain it hits, or to the pig it hits. One use, same range as the chain hook.
const GRAPPLE_RANGE = HOOK_RANGE, GRAPPLE_SPEED = 55, ZIP_SPEED = 24, PICKUP_RESPAWN = 15, PICKUP_R = 1.5, WALL_TOP = 9;
const GRAP_COLOR = 0x4fd1ff;
const ropeGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5); ropeGeo.translate(0, 0.5, 0);
const ropeMat = lam(0xc8a26a, { emissive: 0x2a1c0a });
const clawMat = lam(0x6f7c86, { emissive: 0x0b1a24 });
function makeClaw(scale, mat) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 0.36 * scale, 8), mat);
  shaft.rotation.x = Math.PI / 2; g.add(shaft);
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group(); arm.rotation.z = (i / 3) * Math.PI * 2;
    const prong = new THREE.Mesh(new THREE.ConeGeometry(0.045 * scale, 0.32 * scale, 5), mat);
    prong.position.set(0, 0.1 * scale, 0.2 * scale); prong.rotation.x = Math.PI / 2 - 0.7;
    arm.add(prong); g.add(arm);
  }
  return g;
}
function makeGrappleVis() {
  const chain = new THREE.Mesh(ropeGeo, ropeMat); chain.visible = false; scene.add(chain);
  const head = makeClaw(1, clawMat); head.visible = false; scene.add(head);
  return { chain, head };
}
// the pickup on the map
const pickup = { active: false, pos: new V3(), timer: 3 };
const pickupG = new THREE.Group(); pickupG.visible = false; scene.add(pickupG);
const pickupClaw = makeClaw(2.4, lam(GRAP_COLOR, { emissive: 0x1a6f8f })); pickupClaw.position.y = 1.3; pickupG.add(pickupClaw);
{
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 7, 10, 1, true), new THREE.MeshBasicMaterial(Object.assign({ color: GRAP_COLOR, opacity: 0.28, side: THREE.DoubleSide }, add)));
  beam.position.y = 3.5; pickupG.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 40), new THREE.MeshBasicMaterial(Object.assign({ color: GRAP_COLOR, opacity: 0.55 }, add)));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; pickupG.add(ring);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map: puffTex, color: GRAP_COLOR, opacity: 0.6 }, add)));
  glow.position.y = 1.3; glow.scale.setScalar(2.6); pickupG.add(glow);
}
sfx.grapThrow = (p) => { const v = vol(p); hiss(0.25, 0.3 * v, 2000, 5200); tone(480, 0.15, 'triangle', 0.08 * v, 1500); };
sfx.grapHit = (p) => { const v = vol(p); tone(950, 0.12, 'square', 0.07 * v, 380); hiss(0.1, 0.3 * v, 3200, 1400); };
sfx.pickup = (p) => { const v = vol(p); [660, 880, 1320].forEach((f, i) => tone(f, 0.2, 'triangle', 0.16 * v, null, i * 0.07)); };
function placePickup(x, z, y = 0) { pickup.active = true; pickup.pos.set(x, y, z); pickupG.position.set(x, y, z); pickupG.visible = true; }
function hidePickup() { pickup.active = false; pickupG.visible = false; }
function randomPickupSpot() { return MAP.pickupSpot(); }
function resetPickup() { hidePickup(); pickup.timer = 3; for (const p of pigs) { p.hasGrapple = false; p.grapple = null; } }
function grantGrapple(p) {
  p.hasGrapple = true; sfx.pickup(p.pos);
  puff(p.pos.clone().add(new V3(0, 1.2, 0)), GRAP_COLOR, 8, 1.2);
  if (p.isPlayer) toast('Grapple hook! Press ' + keyLabel('grapple'), 'k');
}
let grabAskT = 0;
function updatePickup(dt) {
  if (net.room) {
    const s = net.pickup();
    if (s && s.active) { if (!pickup.active || pickup.pos.x !== s.x || pickup.pos.z !== s.z) placePickup(s.x, s.z, s.y || 0); }
    else if (pickup.active) hidePickup();
    if (pickup.active && game.state === 'playing' && player.state === 'alive' && !player.hasGrapple && !player.grapple &&
        Math.hypot(player.pos.x - pickup.pos.x, player.pos.z - pickup.pos.z) < PICKUP_R && Math.abs(player.pos.y - pickup.pos.y) < 2 && performance.now() > grabAskT) {
      grabAskT = performance.now() + 800; net.send('grab', {});
    }
    return;
  }
  if (!pickup.active) { pickup.timer -= dt; if (pickup.timer <= 0) { const [x, z, y] = randomPickupSpot(); placePickup(x, z, y); } return; }
  for (const p of pigs) {
    if (p.state !== 'alive' || p.hasGrapple || p.grapple) continue;
    if (Math.hypot(p.pos.x - pickup.pos.x, p.pos.z - pickup.pos.z) < PICKUP_R && Math.abs(p.pos.y - pickup.pos.y) < 2) {
      hidePickup(); pickup.timer = PICKUP_RESPAWN; grantGrapple(p); break;
    }
  }
}
function fireGrapple(p, origin, dir) {
  if (!p.hasGrapple || p.grapple || p.state !== 'alive' || p.stunT > 0) return;
  p.hasGrapple = false;
  p.grapple = { phase: 'out', pos: origin.clone(), prev: origin.clone(), dir: dir.clone().normalize(), dist: 0, goal: null, target: null, t: 0, id: null };
  sfx.grapThrow(origin);
  if (p.isPlayer && net.room) { p.grapple.id = net.newHookId(); net.send('grap_fire', { id: p.grapple.id, o: origin.toArray(), d: p.grapple.dir.toArray() }); }
}
// What did the claw hit? Returns where it stuck and where your feet should end up.
function terrainHit(prev, pos) {
  const r = Math.hypot(pos.x, pos.z) || 1e-6, pr = Math.hypot(prev.x, prev.z);
  const ux = pos.x / r, uz = pos.z / r;
  const at = (rr, y) => new V3(ux * rr, y, uz * rr);
  // grabbing the pit wall from inside the pit pulls you up onto the rim above it
  if (pr < PIT_R && r >= PIT_R && pos.y < CURB_H) return { at: at(PIT_R, Math.min(pos.y, CURB_H)), goal: at(PIT_R + CURB_W * 0.5, CURB_H + 0.6) };
  if (r >= OUTER_R + 0.55 && pos.y > 0 && pos.y < WALL_TOP) return { at: at(OUTER_R + 0.55, pos.y), goal: at(OUTER_R - 0.9, Math.max(0.75, pos.y - 1.3)) };
  if (r >= INNER && pos.y <= 0) return { at: at(r, 0), goal: at(Math.min(r, OUTER_R - 0.9), 0.7) };
  if (r >= PIT_R && r < INNER && pos.y <= CURB_H) {
    if (prev.y > CURB_H) return { at: at(r, CURB_H), goal: at(r, CURB_H + 0.6) };
    if (pr >= INNER) return { at: at(INNER, Math.max(0, pos.y)), goal: at(INNER + 0.9, 0.7) };
  }
  return null;
}
// Did the claw hit a building, tower, roof, palm...? Uses the real shapes, so tall walls and rooftops count.
function buildingHit(prev, pos) {
  const seg = pos.clone().sub(prev), len = seg.length(); if (len < 1e-4) return null;
  grappleRay.set(prev, seg.divideScalar(len)); grappleRay.far = len;
  const hit = grappleRay.intersectObjects(grappleSurfaces, false)[0];
  if (!hit) return null;
  const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new V3(0, 1, 0);
  if (n.dot(seg) > 0) n.negate(); // always face back toward the thrower
  const at = hit.point.clone();
  let goal;
  if (n.y > 0.6) goal = at.clone().add(new V3(0, 0.7, 0));                         // rooftop or top edge
  else goal = at.clone().addScaledVector(new V3(n.x, 0, n.z).normalize(), 0.9).add(new V3(0, -1.3, 0)); // wall face
  // you can't leave the courtyard yet, so far-away surfaces pull you up to that height at the courtyard edge
  MAP.clampGoal(goal);
  goal.y = Math.max(goal.y, 0.75);
  return { at, goal };
}
function endZip(p) {
  const g = p.grapple; if (!g) return;
  p.vel.multiplyScalar(g.target ? 0.06 : 0.4); p.vel.y = Math.max(p.vel.y, 2.5);
  p.onGround = false; p.knockT = 0.2;
  g.phase = 'back'; g.goal = null;
}
function stepGrapple(p, dt) {
  const g = p.grapple; g.t += dt;
  let goal;
  if (g.target) { if (g.target.state === 'dead') return endZip(p); goal = g.target.pos.clone(); }
  else goal = g.goal;
  const d = goal.clone().sub(p.pos), L = d.length();
  const stopAt = g.target ? 1.9 : 0.6; // stop just in front of a pig, right on a spot
  if (L <= stopAt || g.t > 1.8 || p.stunT > 0) { endZip(p); stepBody(p, dt, 0, 0, false); return; }
  d.divideScalar(L);
  p.zipping = true;
  p.vel.copy(d).multiplyScalar(Math.min(ZIP_SPEED, (L - stopAt + 0.05) / dt));
  p.vel.y += G * dt; // cancel gravity while the rope pulls
  stepBody(p, dt, 0, 0, false);
  p.zipping = false;
  if (!p.isPlayer) p.yaw = Math.atan2(d.x, d.z);
}
function updateGrapples(dt) {
  for (const p of pigs) {
    const g = p.grapple; if (!g) continue;
    if (p.state === 'dead') { p.grapple = null; continue; }
    if (p.state === 'hooked' && g.phase !== 'back') g.phase = 'back';
    const ph0 = g.phase;
    if (g.phase === 'out') {
      g.prev.copy(g.pos); const step = GRAPPLE_SPEED * dt; g.pos.addScaledVector(g.dir, step); g.dist += step;
      let hit = null;
      const cands = p.isPlayer && net.room ? pigs.concat(net.proxies()) : pigs;
      for (const q of cands) {
        if (q === p || q.state === 'dead' || q.protect > 0) continue;
        if (segSphere(g.prev, g.pos, new V3(q.pos.x, q.pos.y + 0.9, q.pos.z), 1.0) || segSphere(g.prev, g.pos, new V3(q.pos.x, q.pos.y + 2.1, q.pos.z), 0.95)) { hit = q; break; }
      }
      if (hit) {
        g.phase = 'pull'; g.target = hit; sfx.grapHit(hit.pos);
        if (p.isPlayer) toast('Zipping to ' + hit.name);
        if (g.id && net.room) net.send('grap_upd', { id: g.id, s: 'attach', tgt: hit.isRemote ? hit.id : undefined });
      } else {
        const th = buildingHit(g.prev, g.pos) || MAP.terrain(g.prev, g.pos);
        if (th) {
          g.phase = 'pull'; g.pos.copy(th.at); g.goal = th.goal; sfx.grapHit(th.at);
          puff(th.at.clone(), 0xd8c4a0, 4, 0.6);
          if (g.id && net.room) net.send('grap_upd', { id: g.id, s: 'anchor', a: th.at.toArray() });
        } else if (g.dist > GRAPPLE_RANGE) g.phase = 'back';
      }
    } else if (g.phase === 'pull' && g.target) center(g.target, g.pos);
    if (ph0 !== 'back' && g.phase === 'back' && g.id && net.room) net.send('grap_upd', { id: g.id, s: 'back' });
    if (g.phase === 'back') {
      const hand = handPos(p), d = hand.sub(g.pos), L = d.length(), s = 80 * dt;
      if (L <= s) p.grapple = null; else g.pos.addScaledVector(d.divideScalar(L), s);
    }
  }
}
function drawGrapples(t) {
  for (const p of pigs) {
    if (!p.gvis) p.gvis = makeGrappleVis();
    const v = p.gvis, g = p.grapple;
    if (!g || p.state === 'dead') { v.chain.visible = v.head.visible = false; continue; }
    const hand = handPos(p), d = g.pos.clone().sub(hand), L = d.length();
    v.chain.visible = v.head.visible = true;
    v.chain.position.copy(hand); v.chain.scale.set(1, Math.max(0.01, L), 1);
    if (L > 0.001) v.chain.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.clone().divideScalar(L));
    v.head.position.copy(g.pos);
    v.head.lookAt(g.pos.clone().add(g.phase === 'out' ? g.dir : g.phase === 'back' ? d.clone().negate() : d));
  }
  if (pickupG.visible) { pickupClaw.rotation.y = t * 1.6; pickupClaw.position.y = 1.3 + Math.sin(t * 2.2) * 0.18; }
}

// ---------- main loop ----------
function update(dt) {
  game.T += dt;
  for (const p of pigs) {
    if (p.state === 'dead') {
      if (p.isPlayer && game.state !== 'playing') continue;
      p.respawnT -= dt; if (p.respawnT <= 0) spawn(p); continue;
    }
    p.hookCd -= dt; p.breathCd -= dt; p.stunT -= dt; p.protect -= dt; p.knockT -= dt;
    if (p.meleeT > 0) { p.meleeT -= dt; if (!p.meleeHit && MELEE_T - p.meleeT >= MELEE_HIT && p.state === 'alive') { p.meleeHit = true; meleeStrike(p); } }
    if (p.state === 'hooked') stepPull(p, dt);
    else if (p.grapple && p.grapple.phase === 'pull') stepGrapple(p, dt);
    else {
      let w;
      if (p.isPlayer) { const [x, z] = moveWish(); w = [x, z, held('jump')]; }
      else w = botThink(p, dt);
      if (p.hook && p.hook.phase === 'pull') w = [0, 0, false];
      stepBody(p, dt, w[0], w[1], w[2]);
    }
    if (p.pos.y < MAP.killY) eliminate(p);
  }
  // hooks
  const tmp = new V3();
  for (const p of pigs) {
    const h = p.hook;
    if (!h) continue;
    if (p.state === 'dead') { p.hook = null; continue; }
    const ph0 = h.phase;
    if (h.phase === 'out') {
      const prev = h.pos.clone(), step = HOOK_SPEED * dt;
      h.pos.addScaledVector(h.dir, step); h.dist += step;
      if (!deflectCheck(p, h, prev)) for (const q of pigs) {
        if (q === p || q.state === 'dead' || q.protect > 0) continue;
        const lo = tmp.set(q.pos.x, q.pos.y + 0.9, q.pos.z);
        if (segSphere(prev, h.pos, lo, 1.0) || segSphere(prev, h.pos, new V3(q.pos.x, q.pos.y + 2.1, q.pos.z), 0.95)) { hookHit(p, q); break; }
      }
      if (h.phase === 'out' && p.isPlayer && net.room) for (const r of net.proxies()) {
        if (r.state !== 'alive') continue;
        if (segSphere(prev, h.pos, new V3(r.pos.x, r.pos.y + 0.9, r.pos.z), 1.0) || segSphere(prev, h.pos, new V3(r.pos.x, r.pos.y + 2.1, r.pos.z), 0.95)) { onlineHookHit(p, r); break; }
      }
      if (h.phase === 'out') {
        const r = Math.hypot(h.pos.x, h.pos.z);
        if (h.dist > HOOK_RANGE || MAP.hookBlocked(prev, h.pos)) { h.phase = 'back'; if (h.dist <= HOOK_RANGE) sfx.clank(h.pos); }
      }
    } else if (h.phase === 'pull') {
      if (!h.target || h.target.state !== 'hooked') h.phase = 'back'; else center(h.target, h.pos);
    }
    if (ph0 !== 'back' && h.phase === 'back' && h.id && net.room) { net.send('hook_upd', { id: h.id, s: 'back' }); if (h.target && h.target.isRemote) h.target.pullingMe = false; }
    if (h.phase === 'back') {
      const hand = handPos(p), d = hand.sub(h.pos), L = d.length(), s = 75 * dt;
      if (L <= s) p.hook = null; else h.pos.addScaledVector(d.divideScalar(L), s);
    }
  }
  updateGrapples(dt);
  updatePickup(dt);
  // pig-to-pig separation
  for (let i = 0; i < pigs.length; i++) for (let j = i + 1; j < pigs.length; j++) {
    const a = pigs[i], b = pigs[j];
    if (a.state !== 'alive' || b.state !== 'alive') continue;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.4 && d > 0.001 && Math.abs(a.pos.y - b.pos.y) < 1.8) {
      const push = (1.4 - d) / 2;
      // bumping into each other never shoves a pig off a roof edge (hooks and shoves still can)
      if (MAP.allowPush(a, a.pos.x - dx / d * push, a.pos.z - dz / d * push)) { a.pos.x -= dx / d * push; a.pos.z -= dz / d * push; }
      if (MAP.allowPush(b, b.pos.x + dx / d * push, b.pos.z + dz / d * push)) { b.pos.x += dx / d * push; b.pos.z += dz / d * push; }
    }
  }
}
function syncVisuals(dt, t) {
  for (const p of pigs) {
    if (p.mesh && p.state !== 'dead') {
      p.mesh.position.copy(p.pos); p.mesh.rotation.y = p.yaw;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (p.onGround && sp > 0.5) p.walk += dt * sp * 1.6;
      const sw = Math.sin(p.walk) * Math.min(1, sp / 6) * 0.7;
      p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw;
      if (p.state === 'hooked') { p.mesh.rotation.x = 0.5; p.mesh.rotation.z = Math.sin(t * 30) * 0.15; }
      else if (p.stunT > 0) { p.mesh.rotation.x = 0.2; p.mesh.rotation.z = Math.sin(t * 25) * 0.2; }
      else if (!p.onGround && p.pos.y < 0) { p.mesh.rotation.x = -0.4; p.mesh.rotation.z = Math.sin(t * 14) * 0.3; }
      else { p.mesh.rotation.x *= 0.8; p.mesh.rotation.z *= 0.8; }
      p.handHook.visible = !p.hook;
      const me = p.meleeT > 0 ? MELEE_T - p.meleeT : -1;
      const swg = me < 0 ? 0 : me < 0.12 ? -me / 0.12 : me < 0.3 ? -1 + 2 * (me - 0.12) / 0.18 : Math.max(0, 1 - (me - 0.3) / 0.47);
      p.handHook.position.set(-1.05 + Math.max(0, swg) * 0.8, 1.35 + Math.abs(swg) * 0.2, 0.72 + Math.max(0, swg) * 0.5);
      p.handHook.rotation.y = -swg * 1.2;
    }
    const v = p.vis, h = p.hook;
    if (h && p.state !== 'dead') {
      const hand = handPos(p), d = h.pos.clone().sub(hand), L = d.length();
      v.chain.visible = v.head.visible = true;
      v.chain.position.copy(hand); v.chain.scale.set(1, Math.max(0.01, L), 1);
      if (L > 0.001) v.chain.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.clone().divideScalar(L));
      v.head.position.copy(h.pos); v.head.lookAt(h.pos.clone().add(h.phase === 'back' ? d.negate() : (h.phase === 'out' ? h.dir : d)));
    } else v.chain.visible = v.head.visible = false;
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const f = puffs[i]; f.life -= dt;
    if (f.life <= 0) { scene.remove(f.s); f.s.material.dispose(); puffs.splice(i, 1); continue; }
    f.s.position.addScaledVector(f.v, dt); const k = 1 - f.life / f.max;
    f.s.scale.setScalar(f.size * (1 + k * 1.6)); f.s.material.opacity = 0.7 * (1 - k);
  }
  drawGrapples(t);
  const pulse = 0.75 + Math.sin(t * 3) * 0.25;
  glowMat.color.setRGB(0.49 * pulse + 0.2, 1 * pulse, 0.29 * pulse);
  for (const m of barrierMats) m.map.offset.y = (t * 0.15) % 1;
}
// hook-hand swipe keyframes: [time, x, y, z, rotY, rotZ]
const SWIPE = [[0, -0.3, -0.29, -0.7, 0, 0], [0.12, -0.44, -0.2, -0.6, 0.9, 0.45], [0.26, 0.06, -0.24, -0.84, -0.95, -0.35], [0.36, 0.1, -0.26, -0.8, -1.0, -0.4], [0.77, -0.3, -0.29, -0.7, 0, 0]];
function swipePose(t) {
  if (t < 0) return SWIPE[0].slice(1);
  for (let i = 1; i < SWIPE.length; i++) {
    if (t <= SWIPE[i][0]) {
      const a = SWIPE[i - 1], b = SWIPE[i]; let k = (t - a[0]) / (b[0] - a[0]); k = k * k * (3 - 2 * k);
      return a.slice(1).map((v, j) => v + (b[j + 1] - v) * k);
    }
  }
  return SWIPE[0].slice(1);
}
let orbitA = 0.6;
function updateCamera(dt, t) {
  if (game.state === 'menu' || game.state === 'over') {
    orbitA += dt * 0.07;
    camera.position.set(Math.cos(orbitA) * MAP.cam.r, MAP.cam.h, Math.sin(orbitA) * MAP.cam.r);
    camera.lookAt(0, MAP.cam.look, 0);
    return;
  }
  const p = player;
  const y = p.state === 'dead' ? Math.max(p.pos.y, MAP.killY + 2) : p.pos.y;
  camera.position.set(p.pos.x, y + EYE, p.pos.z);
  camera.rotation.set(p.pitch, p.yaw + Math.PI, 0);
  // viewmodel motion
  const sp = Math.hypot(p.vel.x, p.vel.z), bob = p.onGround ? Math.min(1, sp / SPEED) : 0;
  vm.position.set(Math.sin(p.walk) * 0.025 * bob, Math.abs(Math.cos(p.walk)) * 0.03 * bob - (p.onGround ? 0 : 0.04), 0);
  recoil = Math.max(0, recoil - dt * 4);
  const me = p.meleeT > 0 ? MELEE_T - p.meleeT : -1;
  const kf = swipePose(me);
  vmHookArm.position.set(kf[0], kf[1], kf[2] - recoil * 0.15);
  vmHookArm.rotation.set(0, kf[3], kf[4]);
  vmHook.visible = !p.hook;
  breathAnim = Math.max(0, breathAnim - dt);
  const k = breathAnim > 0 ? Math.sin(Math.min(1, breathAnim / 0.7) * Math.PI) : 0;
  vmMask.position.set(0, -1.2 + k * 0.95, -0.5 + k * 0.1);
  vmGun.position.y = -0.27 - k * 0.12;
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  if (game.state !== 'paused') update(dt);
  net.update(dt);
  if (net.room && game.state === 'playing') checkIncomingDeflects();
  updateCamera(dt, t);
  syncVisuals(dt, t);
  updateHUD(dt);
  renderer.render(scene, camera);
}
// attract mode: bots play behind the menu
D = DIFF.normal; vm.visible = false;
for (const p of pigs) if (!p.isPlayer) spawn(p);
requestAnimationFrame(frame);
if (import.meta.env.DEV) window.__ptp = { pigs, game, player, net };
