import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './style.css';
import { makeCar, makeBoat, makeBike, makeSmoke, updateCarVisuals, headMat } from './vehicles.js';
import { makeHuman, animateHuman, startAttack, randomLook } from './humans.js';
import { createCrowd } from './crowd.js';
import { createTraffic } from './traffic.js';
import { makeWater } from './water.js';
import { buildScenery } from './scenery.js';
import { createWeapons } from './weapons.js';
import { buildInteriors } from './interiors.js';
import { unlockAudio, radio, engine, sfx, ambient } from './audio.js';

// ======================= RENDERER / SCENE =======================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.3, 1400);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // reflections on car paint
scene.environmentIntensity = 0.5;
scene.fog = new THREE.Fog(0xff9a6b, 80, 520);

const hemi = new THREE.HemisphereLight(0xffc4e0, 0x333355, 0.9);
const sunDir = new THREE.Vector3(0.5, 0.14, -0.85).normalize();
const sun = new THREE.DirectionalLight(0xffa56b, 2.0);
sun.position.copy(sunDir).multiplyScalar(300);
scene.add(hemi, sun);

// ======================= UI =======================
function el(id, cls = 'hud', html = '') {
  const e = document.createElement('div');
  e.id = id; e.className = cls; e.innerHTML = html;
  document.body.appendChild(e);
  return e;
}
el('vignette');
const damageEl = el('damage');
const moneyEl = el('money');
const starsEl = el('stars');
const levelEl = el('level');
const healthEl = el('health', 'hud', '<span class="lbl">HEALTH</span><div class="bar"><i></i></div>');
const hpFill = healthEl.querySelector('i');
const missionEl = el('mission');
const toastEl = el('toast');
const bannerEl = el('banner');
const wastedEl = el('wasted', 'hud', 'WASTED');
const promptEl = el('prompt');
const speedEl = el('speed');
const radioEl = el('radio', 'hud',
  '<div class="disc"></div><div class="rtxt"><span class="st">VICE FM</span><b></b><em></em></div>' +
  '<div class="eq"><i></i><i></i><i></i><i></i></div><div class="rkeys">R next · T prev · N off</div>');
el('hint', 'hud', 'M map  ·  F enter / exit  ·  J punch  ·  K kick  ·  R radio  ·  Enter cheats');

const title = document.createElement('div');
title.id = 'title';
title.innerHTML =
  '<div class="grid"></div><div class="sunset"></div>' +
  '<div class="inner"><h1>VICE CITY</h1><h2>MINI</h2>' +
  '<div class="keys">' +
  '<div><b>W A S D</b><span>drive / walk / fly</span></div>' +
  '<div><b>Space</b><span>handbrake / climb</span></div>' +
  '<div><b>F</b><span>enter / exit vehicle</span></div>' +
  '<div><b>J · K</b><span>punch · kick</span></div>' +
  '<div><b>R · T · N</b><span>radio next · prev · off</span></div>' +
  '<div><b>M</b><span>big map</span></div>' +
  '</div>' +
  '<p class="go">PRESS ENTER OR CLICK TO START</p></div>';
document.body.appendChild(title);

const cheatBox = document.createElement('div');
cheatBox.id = 'cheat';
cheatBox.innerHTML = '<span>CHEAT</span><input maxlength="24" spellcheck="false" autocomplete="off">';
document.body.appendChild(cheatBox);
const cheatInput = cheatBox.querySelector('input');

let toastTimer = 0;
function toast(text, ms = 2500) {
  toastEl.textContent = text;
  toastEl.style.opacity = 1;
  toastEl.classList.remove('pop'); void toastEl.offsetWidth; toastEl.classList.add('pop');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.style.opacity = 0), ms);
}
let bannerTimer = 0;
function banner(top, big, ms = 4200) {
  bannerEl.innerHTML = '<small>' + top + '</small><b>' + big + '</b>';
  bannerEl.classList.remove('show'); void bannerEl.offsetWidth; bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), ms);
}
const htmlCache = new WeakMap();
function setHTML(node, html) { if (htmlCache.get(node) !== html) { htmlCache.set(node, html); node.innerHTML = html; } }

function loadNum(k, d = 0) { try { return Number(localStorage.getItem(k)) || d; } catch (e) { return d; } }
function saveNum(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
let money = loadNum('vc_money', 0);
function addMoney(n) {
  money += n;
  saveNum('vc_money', money);
  renderMoney();
}
function renderMoney() { moneyEl.textContent = '$' + money.toLocaleString(); }
renderMoney();

// ======================= HELPERS =======================
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1985);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const dummy = new THREE.Object3D();
function inst(geo, mat, items) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y || 0, it.z);
    dummy.rotation.set(0, it.ry || 0, 0);
    dummy.scale.set(it.sx || 1, it.sy || 1, it.sz || 1);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
  });
  m.instanceMatrix.needsUpdate = true;
  scene.add(m);
  return m;
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);

// ======================= SKY / SUN / STARS =======================
function skyTexture(stops) {
  return canvasTex(4, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    stops.forEach(([p, col]) => gr.addColorStop(p, col));
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  });
}
const skyDay = skyTexture([[0, '#1b1464'], [0.25, '#6a2c91'], [0.42, '#ff4f9a'], [0.5, '#ffb36b'], [1, '#ff9a6b']]);
const skyNight = skyTexture([[0, '#050818'], [0.3, '#0e1240'], [0.45, '#3a1c6b'], [0.5, '#7a3a8a'], [1, '#3a1c6b']]);
const skyMat = new THREE.MeshBasicMaterial({ map: skyDay, side: THREE.BackSide, fog: false, depthWrite: false });
const sky = new THREE.Group();
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
skyDome.renderOrder = -10;
sky.add(skyDome);

const sunTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,120,.9)');
  gr.addColorStop(1, 'rgba(255,120,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: sunTex, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
}));
sunSprite.scale.set(320, 320, 1);
sunSprite.position.copy(sunDir).multiplyScalar(800);
sky.add(sunSprite);

const starPos = [];
for (let i = 0; i < 400; i++) {
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
  if (u < 0.05) continue;
  starPos.push(Math.cos(a) * r * 850, u * 850, Math.sin(a) * r * 850);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
stars.visible = false;
sky.add(stars);
scene.add(sky);

// ======================= ISLAND (animated ocean, beach, asphalt) =======================
const WATER_Y = -0.6;
const LAND = 470;                          // half-size of the main island (sand edge)
const PIER = { z: 150, end: LAND + 62, hw: 4 };
const ISLANDS = [                          // small islands out at sea (boat missions)
  { x: -875, z: 650, r: 80, light: true },
  { x: 800, z: -800, r: 95 },
  { x: 1100, z: 590, r: 55 },
  { x: -775, z: -950, r: 70 },
];
const SEA_LIMIT = 1400;

const waveH = (x, z, t) => Math.sin(x * 0.045 + t * 0.9) * 0.2 + Math.sin(z * 0.06 - t * 1.1) * 0.17 + Math.sin((x + z) * 0.11 + t * 1.7) * 0.07;
// island outline: a big square with rounded corners (distance < 0 means inside the shoreline)
const CORNER_R = 90;
function islandDist(x, z) {
  const qx = Math.abs(x) - (LAND - CORNER_R), qz = Math.abs(z) - (LAND - CORNER_R);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - CORNER_R;
}
const groundH = (x, z) => { const d = islandDist(x, z); return d <= 0 ? -0.2 : Math.max(-0.2 - d * 0.075, -10); };
const SHORE_OFF = 5.3;                          // the beach slope meets the water this far outside the nominal edge
const water = makeWater({ land: LAND + SHORE_OFF, cornerR: CORNER_R, islands: ISLANDS.map((i) => ({ x: i.x, z: i.z, r: i.r * 0.64 / 0.82 })), sunDir });
const ocean = water.mesh;
ocean.position.y = WATER_Y;
const oceanUniforms = water.uniforms;

// beach + sea floor: one height-field with wet-sand shading that slopes away under the water
const sandTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f3e3bb'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = 200 + Math.random() * 45 | 0;
    g.fillStyle = `rgba(${v},${v - 18},${v - 62},${0.25 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(150,120,80,${0.08 + Math.random() * 0.1})`;
    g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 8, 1 + Math.random() * 2, Math.random() * 3, 0, 7); g.fill();
  }
}, true);
sandTex.repeat.set(70, 70);
const TERR = LAND * 2 + 300, TSEG = 340;
const terrGeo = new THREE.PlaneGeometry(TERR, TERR, TSEG, TSEG);
terrGeo.rotateX(-Math.PI / 2);
{
  const pos = terrGeo.attributes.position, col = new Float32Array(pos.count * 3);
  const dry = new THREE.Color(0xf0dcaa), wet = new THREE.Color(0xa88a5a), bed = new THREE.Color(0x8d8f78), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = islandDist(x, z);
    const y = d <= 0 ? -0.2 : Math.max(-0.2 - d * 0.075, -10);
    pos.setY(i, y);
    const wetT = THREE.MathUtils.smoothstep(d, -30, 4);
    tmp.copy(dry).lerp(wet, wetT);
    if (d > 4) tmp.lerp(bed, THREE.MathUtils.smoothstep(d, 4, 60));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  terrGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  terrGeo.computeVertexNormals();
}
const terrain = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({ map: sandTex, vertexColors: true, roughness: 1 }));

const asphaltTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#2b2b32'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3500; i++) {
    const v = 30 + Math.random() * 30 | 0;
    g.fillStyle = `rgb(${v},${v},${v + 6})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}, true);
asphaltTex.repeat.set(70, 70);
const asphalt = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9 })
);
asphalt.rotation.x = -Math.PI / 2;
scene.add(ocean, terrain, asphalt);

// ======================= CITY LAYOUT =======================
const CELL = 80, BLOCK = 60, GRID = 4, LIMIT = LAND - 2;
const ROADS = [-280, -200, -120, -40, 40, 120, 200, 280];
const CITY_R = GRID * CELL + 30;
const colliders = [];
const blocks = [];
const bldgs = [];

// ----- road markings -----
const markWhite = new THREE.MeshStandardMaterial({ color: 0xe9e9e2, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const markYellow = new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const dashGeo = new THREE.PlaneGeometry(0.3, 3.2); dashGeo.rotateX(-Math.PI / 2);
const stripeGeo = new THREE.PlaneGeometry(0.9, 3.4); stripeGeo.rotateX(-Math.PI / 2);
const lineGeo = new THREE.PlaneGeometry(0.22, 1); lineGeo.rotateX(-Math.PI / 2);

const dashes = [], yellows = [], zebra = [];
const bounds = [-CITY_R, ...ROADS, CITY_R];
for (const r of ROADS) {
  for (let i = 0; i < bounds.length - 1; i++) {
    const s = bounds[i] + (i === 0 ? 0 : 17);
    const e = bounds[i + 1] - (i === bounds.length - 2 ? 0 : 17);
    const mid = (s + e) / 2, len = e - s;
    for (const o of [-0.25, 0.25]) {
      yellows.push({ x: r + o, z: mid, sz: len });
      yellows.push({ x: mid, z: r + o, sz: len, ry: Math.PI / 2 });
    }
    for (let t = s + 2; t < e - 2; t += 8) {
      for (const o of [-5, 5]) {
        dashes.push({ x: r + o, z: t });
        dashes.push({ x: t, z: r + o, ry: Math.PI / 2 });
      }
    }
  }
}
for (const rx of ROADS) {
  for (const rz of ROADS) {
    for (let k = -4; k <= 4; k++) {
      for (const sgn of [-1, 1]) {
        zebra.push({ x: rx + k * 2, z: rz + sgn * 13 });
        zebra.push({ x: rx + sgn * 13, z: rz + k * 2, ry: Math.PI / 2 });
      }
    }
  }
}
inst(lineGeo, markYellow, yellows).position.y = 0.03;
inst(dashGeo, markWhite, dashes).position.y = 0.03;
inst(stripeGeo, markWhite, zebra).position.y = 0.03;

// ----- buildings -----
const winBase = canvasTex(128, 128, (g) => {
  g.fillStyle = '#f1eeea'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = '#24344f'; g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x * 16 + 3, y * 16 + 4, 10, 3);
  }
}, true);
const wr = mulberry32(77);
const winLit = canvasTex(128, 128, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (wr() < 0.45) {
      g.fillStyle = `hsl(${38 + wr() * 22},100%,${58 + wr() * 25}%)`;
      g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
    }
  }
}, true);

const SIGNS = [['HOTEL', '#ff3d9a'], ['CLUB', '#27e8ff'], ['BAR', '#ffd166'], ['PIZZA', '#ff6b35'],
  ['MOTEL', '#9b5de5'], ['CAFE', '#7cfc00'], ['DISCO', '#ff3d9a']];
const signMats = SIGNS.map(([word, col]) => new THREE.MeshBasicMaterial({
  toneMapped: false,
  map: canvasTex(256, 76, (g) => {
    g.fillStyle = '#120a1e'; g.fillRect(0, 0, 256, 76);
    g.strokeStyle = col; g.lineWidth = 5; g.strokeRect(5, 5, 246, 66);
    g.fillStyle = col; g.font = 'bold 50px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(word, 128, 40);
  }),
}));
const signGeo = new THREE.PlaneGeometry(7, 2.1);

const lit = []; // window materials (glow at night)
const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4a55, roughness: 0.95 });
const acMat = new THREE.MeshStandardMaterial({ color: 0x8a8a95, roughness: 0.8 });
const pastel = [0xff9ecb, 0x7fe6e0, 0xfff1a8, 0xc6a8ff, 0xffffff, 0xffb48a, 0x9ad7ff];
const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xa9a7b3, roughness: 0.95 });

const PARKS = [[2, -2], [-3, 2], [3, 3], [-1, -3], [0, 2]];
const parkTrees = [];
const parkGrass = new THREE.MeshStandardMaterial({ color: 0x3f9b55, roughness: 1 });
const parkWater = new THREE.MeshStandardMaterial({ color: 0x2aa6c8, roughness: 0.1, metalness: 0.3 });
for (let i = -GRID; i <= GRID; i++) {
  for (let j = -GRID; j <= GRID; j++) {
    const cx = i * CELL, cz = j * CELL;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.3, BLOCK), sidewalkMat);
    slab.position.set(cx, 0.15, cz);
    scene.add(slab);
    blocks.push({ x: cx, z: cz });
    if (PARKS.some(([pi, pj]) => pi === i && pj === j)) {
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - 4, BLOCK - 4), parkGrass);
      grass.rotation.x = -Math.PI / 2; grass.position.set(cx, 0.32, cz);
      scene.add(grass);
      const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 24), parkWater);
      pond.rotation.x = -Math.PI / 2; pond.position.set(cx + 8, 0.34, cz - 6);
      scene.add(pond);
      for (let k = 0; k < 16; k++) parkTrees.push({ x: cx + (rand() - 0.5) * 50, z: cz + (rand() - 0.5) * 50, ry: rand() * 6, sx: 0.9 + rand() * 0.5, sy: 0.9 + rand() * 0.6, sz: 0.9 + rand() * 0.5 });
      continue;
    }

    for (const ox of [-15, 15]) {
      for (const oz of [-15, 15]) {
        if (rand() < 0.15) continue;
        const w = 20 + rand() * 4, d = 20 + rand() * 4;
        const ring = Math.max(Math.abs(i), Math.abs(j));
        const h = ring <= 1 ? 26 + rand() * (rand() < 0.45 ? 80 : 40) : ring >= GRID - 0 ? 8 + rand() * 14 : 12 + rand() * (rand() < 0.25 ? 55 : 28);
        const color = pastel[Math.floor(rand() * pastel.length)];

        const map = winBase.clone();
        map.repeat.set((w + d) / 2 / 24, h / 29);
        map.needsUpdate = true;
        const em = winLit.clone();
        em.repeat.copy(map.repeat);
        em.needsUpdate = true;
        const mat = new THREE.MeshStandardMaterial({
          color, map, emissive: 0xffcf8a, emissiveMap: em, emissiveIntensity: 0.15, roughness: 0.55, metalness: 0.15,
        });
        lit.push(mat);

        const bx = cx + ox, bz = cz + oz;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(bx, h / 2 + 0.3, bz);
        const roof = new THREE.Mesh(unitBox, roofMat);
        roof.scale.set(w + 0.6, 0.5, d + 0.6);
        roof.position.set(bx, h + 0.55, bz);
        scene.add(b, roof);

        if (rand() < 0.5) {
          const ac = new THREE.Mesh(unitBox, acMat);
          ac.scale.set(3, 1.6, 3);
          ac.position.set(bx + (rand() - 0.5) * (w - 6), h + 1.8, bz + (rand() - 0.5) * (d - 6));
          scene.add(ac);
        }
        if (rand() < 0.4) {
          const sgn = oz < 0 ? -1 : 1;
          const sign = new THREE.Mesh(signGeo, signMats[Math.floor(rand() * signMats.length)]);
          sign.position.set(bx, 6 + rand() * 6, bz + sgn * (d / 2 + 0.1));
          sign.rotation.y = sgn > 0 ? 0 : Math.PI;
          scene.add(sign);
        }
        bldgs.push({ bx, bz, w, d, h, sx: ox < 0 ? -1 : 1, sz: oz < 0 ? -1 : 1 });
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2, h });
      }
    }
  }
}

// ----- palm trees + street lamps -----
function frondGeo() {
  const pos = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx;
    const m = [cx * 1.8, 0.55, cz * 1.8], t = [cx * 3.4, -0.6, cz * 3.4];
    const L = [m[0] + px * 0.45, m[1], m[2] + pz * 0.45], R = [m[0] - px * 0.45, m[1], m[2] - pz * 0.45];
    pos.push(0, 0, 0, ...L, ...R, ...L, ...t, ...R);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.translate(0, 7, 0);
  return g;
}
const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 7, 6); trunkGeo.translate(0, 3.5, 0);
const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 6, 6); poleGeo.translate(0, 3, 0);
const headGeo = new THREE.BoxGeometry(0.9, 0.18, 0.35); headGeo.translate(0.45, 6.1, 0);
const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd27a, emissiveIntensity: 0.6 });

const palms = [], poles = [], heads = [];
for (const b of blocks) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      palms.push({ x: b.x + sx * 29.5, z: b.z + sz * 29.5, ry: rand() * 6.28, sx: 0.8 + rand() * 0.5, sy: 0.8 + rand() * 0.5, sz: 0.8 + rand() * 0.5 });
    }
  }
  for (const [ox, oz, ry] of [[29.7, 0, 0], [-29.7, 0, Math.PI], [0, 29.7, -Math.PI / 2], [0, -29.7, Math.PI / 2]]) {
    poles.push({ x: b.x + ox, z: b.z + oz });
    heads.push({ x: b.x + ox, z: b.z + oz, ry });
  }
}
palms.push(...parkTrees);
inst(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }), palms);
inst(frondGeo(), new THREE.MeshStandardMaterial({ color: 0x1f9d55, roughness: 0.8, side: THREE.DoubleSide }), palms);
inst(poleGeo, new THREE.MeshStandardMaterial({ color: 0x44444c, metalness: 0.6, roughness: 0.5 }), poles);
inst(headGeo, lampMat, heads);

// ----- scenery: beach life, boardwalk, street furniture, shop fronts, clouds, gulls -----
const scenery = buildScenery({ scene, rand, CELL, GRID, LAND, PIER, canvasTex, blocks, bldgs, lit, islandDist, lampMat, ROADS });
inst(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }), scenery.palms);
inst(frondGeo(), new THREE.MeshStandardMaterial({ color: 0x1f9d55, roughness: 0.8, side: THREE.DoubleSide }), scenery.palms);

// ----- pier + islands + lighthouse -----
const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 });
const pierLen = PIER.end - (LAND - 6);
const deck = new THREE.Mesh(unitBox, woodMat);
deck.scale.set(pierLen, 0.3, PIER.hw * 2 + 0.6);
deck.position.set(LAND - 6 + pierLen / 2, -0.13, PIER.z);
scene.add(deck);
const pilesA = [], railsA = [], lampsA = [];
for (let x = LAND; x <= PIER.end; x += 6) {
  for (const sz of [-1, 1]) {
    pilesA.push({ x, y: -2.4, z: PIER.z + sz * (PIER.hw + 0.1), sy: 5 });
    if (x % 12 === 8) lampsA.push({ x, z: PIER.z + sz * (PIER.hw + 0.1) });
  }
}
const pile = new THREE.CylinderGeometry(0.22, 0.26, 1, 8);
inst(pile, new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 }), pilesA);
for (const sz of [-1, 1]) {
  const rail = new THREE.Mesh(unitBox, woodMat);
  rail.scale.set(pierLen, 0.1, 0.1); rail.position.set(LAND - 6 + pierLen / 2, 1.0, PIER.z + sz * (PIER.hw + 0.4));
  scene.add(rail);
}
inst(poleGeo, new THREE.MeshStandardMaterial({ color: 0x44444c, metalness: 0.6, roughness: 0.5 }), lampsA);
inst(new THREE.SphereGeometry(0.28, 8, 6), lampMat, lampsA.map((l) => ({ x: l.x, y: 6.1, z: l.z })));

const islandMat = new THREE.MeshStandardMaterial({ color: 0xe8d3a0, roughness: 1 });
const islandGrass = new THREE.MeshStandardMaterial({ color: 0x3f9b55, roughness: 1 });
const islandPalms = [];
for (const isl of ISLANDS) {
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(isl.r * 0.55, isl.r, 6, 28), islandMat);
  cone.position.set(isl.x, 0.6 - 3, isl.z);
  scene.add(cone);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(isl.r * 0.34, isl.r * 0.5, 0.5, 24), islandGrass);
  cap.position.set(isl.x, 0.62, isl.z);
  scene.add(cap);
  const n = Math.round(isl.r / 7);
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.28, d = rand() * isl.r * 0.42;
    islandPalms.push({ x: isl.x + Math.cos(a) * d, y: 0.8, z: isl.z + Math.sin(a) * d, ry: rand() * 6.28, sx: 0.9 + rand() * 0.6, sy: 0.9 + rand() * 0.7, sz: 0.9 + rand() * 0.6 });
  }
  isl.coll = isl.r * 0.78 + 1;
  if (isl.light) {
    const lt = canvasTex(64, 128, (g, w, h) => {
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d62839'; g.fillRect(0, i * (h / 6), w, h / 6 + 1); }
    });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 34, 16), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.7 }));
    tower.position.set(isl.x, 18, isl.z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff1a8, toneMapped: false }));
    lamp.position.set(isl.x, 37, isl.z);
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3, 16), new THREE.MeshStandardMaterial({ color: 0x333344 }));
    roof2.position.set(isl.x, 40.4, isl.z);
    scene.add(tower, lamp, roof2);
  }
}
if (islandPalms.length) {
  inst(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }), islandPalms);
  inst(frondGeo(), new THREE.MeshStandardMaterial({ color: 0x1f9d55, roughness: 0.8, side: THREE.DoubleSide }), islandPalms);
}

// ======================= COLLISION =======================
function clampWorld(pos, lim) {
  if (lim !== LIMIT) {
    pos.x = THREE.MathUtils.clamp(pos.x, -lim, lim);
    pos.z = THREE.MathUtils.clamp(pos.z, -lim, lim);
    return;
  }
  pos.x = Math.max(pos.x, -LIMIT);
  pos.z = THREE.MathUtils.clamp(pos.z, -LIMIT, LIMIT);
  { // rounded island corners
    const cx = LAND - CORNER_R, qx = Math.abs(pos.x) - cx, qz = Math.abs(pos.z) - cx;
    if (qx > 0 && qz > 0 && pos.x <= LIMIT) {
      const len = Math.hypot(qx, qz), lim = CORNER_R - 2;
      if (len > lim) { const k = lim / len; pos.x = Math.sign(pos.x) * (cx + qx * k); pos.z = Math.sign(pos.z) * (cx + qz * k); }
    }
  }
  if (pos.x > LIMIT) {                       // east edge: only the pier leads out over the water
    if (Math.abs(pos.z - PIER.z) <= PIER.hw) pos.x = Math.min(pos.x, PIER.end);
    else if (pos.x > LIMIT + 4) {
      pos.z = THREE.MathUtils.clamp(pos.z, PIER.z - PIER.hw, PIER.z + PIER.hw);
      pos.x = Math.min(pos.x, PIER.end);
    } else pos.x = LIMIT;
  }
}
function collide(pos, r, y = 0, lim = LIMIT) {
  let hit = false;
  for (const b of colliders) {
    if (y > b.h + 1) continue;
    const cx = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist < r) {
      hit = true;
      if (dist === 0) { pos.x += r; continue; }
      const push = (r - dist) / dist;
      pos.x += dx * push;
      pos.z += dz * push;
    }
  }
  clampWorld(pos, lim);
  return hit;
}

// boats: blocked by the island, the pier and the small islands
function collideBoat(pos, r = 1.6) {
  let hit = false;
  const L = LAND + 4;
  const cx = LAND - CORNER_R, qx = Math.abs(pos.x) - cx, qz = Math.abs(pos.z) - cx;
  if (qx > 0 && qz > 0) {                                  // round corner of the island
    const len = Math.hypot(qx, qz), lim = CORNER_R + 4 + r;
    if (len < lim) { const k = lim / len; pos.x = Math.sign(pos.x) * (cx + qx * k); pos.z = Math.sign(pos.z) * (cx + qz * k); hit = true; }
  } else if (Math.abs(pos.x) < L + r && Math.abs(pos.z) < L + r) {
    const px = L + r - Math.abs(pos.x), pz = L + r - Math.abs(pos.z);
    if (px < pz) pos.x += Math.sign(pos.x || 1) * px; else pos.z += Math.sign(pos.z || 1) * pz;
    hit = true;
  }
  const x0 = LAND - 6 - r, x1 = PIER.end + r, z0 = PIER.z - PIER.hw - r, z1 = PIER.z + PIER.hw + r;
  if (pos.x > x0 && pos.x < x1 && pos.z > z0 && pos.z < z1) {
    const dl = pos.x - x0, dr = x1 - pos.x, dt = pos.z - z0, db = z1 - pos.z, m = Math.min(dl, dr, dt, db);
    if (m === dr) pos.x = x1; else if (m === dt) pos.z = z0; else if (m === db) pos.z = z1; else pos.x = x0;
    hit = true;
  }
  for (const isl of ISLANDS) {
    const dx = pos.x - isl.x, dz = pos.z - isl.z, d = Math.hypot(dx, dz), lim = isl.coll + r;
    if (d < lim) { pos.x = isl.x + (dx / (d || 1)) * lim; pos.z = isl.z + (dz / (d || 1)) * lim; hit = true; }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, -SEA_LIMIT, SEA_LIMIT);
  pos.z = THREE.MathUtils.clamp(pos.z, -SEA_LIMIT, SEA_LIMIT);
  return hit;
}

function collideCar(car) {
  const a = car.userData.angle;
  const fwd = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  let hit = false;
  for (const off of [-1.2, 1.2]) {
    const p = car.position.clone().addScaledVector(fwd, off);
    const before = p.clone();
    if (collide(p, 1.15, 0, LAND + 110)) { hit = true; car.position.add(p.sub(before)); }
  }
  if (hit) car.userData.speed *= 0.6;
  return hit;
}

// ======================= CARS =======================
const LUX = [0xffd400, 0x111111, 0xe63946, 0xffffff, 0x00c2ff, 0xff4fa3];
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1a28, metalness: 0.9, roughness: 0.08 });
const darkTrim = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.6 });
const blobTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
function makeBlob(sx, sz) {
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.scale.set(sx, 1, sz);
  m.position.y = 0.05;
  return m;
}
const smoke = makeSmoke(scene);

function makeCop() {
  const car = makeCar(0xf4f4f4, 'sedan');
  const stripe = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x1b2a8a, roughness: 0.5 }));
  stripe.scale.set(1.94, 0.22, 3.0);
  stripe.position.set(0, 0.62, -0.1);
  const bar = new THREE.Mesh(unitBox, darkTrim);
  bar.scale.set(0.95, 0.1, 0.3);
  bar.position.set(0, 1.58, -0.2);
  const red = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xff1e1e, toneMapped: false }));
  const blue = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0x2a6bff, toneMapped: false }));
  red.scale.set(0.4, 0.13, 0.26); blue.scale.set(0.4, 0.13, 0.26);
  red.position.set(-0.25, 1.66, -0.25); blue.position.set(0.25, 1.66, -0.25);
  car.userData.chassis.add(stripe, bar, red, blue);
  Object.assign(car.userData, { red, blue, stuck: 0, rev: 0 });
  return car;
}

const cars = [];
[[0xff2d55, 'sedan'], [0xffffff, 'sedan'], [0xffd400, 'sport'], [0x111111, 'sport'], [0x00c2ff, 'sedan']].forEach(([c, k], i) => {
  const car = makeCar(c, k);
  car.position.set(36, 0, 6 + i * 8);
  scene.add(car);
  cars.push(car);
});

// motorbikes parked around the start area and on a few corners
[[0xe63946, 46, 4, 0.4], [0x00c2ff, 47, 16, -0.3], [0xffd400, -26, -34, 1.2], [0xff4fa3, 94, 28, 2.2], [0x80ed99, -66, 46, 3.0], [0xf2f2f2, 30, -78, 0.8]].forEach(([c, x, z, a]) => {
  const b = makeBike(c);
  b.position.set(x, 0, z);
  b.userData.angle = a; b.rotation.y = a;
  scene.add(b);
  cars.push(b);
});

const boats = [];
[[0xf5f5f5, 0xff2d95], [0xffd166, 0x27e8ff]].forEach(([c, st], i) => {
  const b = makeBoat(c, st);
  b.position.set(LAND + 24, WATER_Y, PIER.z + (i ? -8 : 8));
  b.userData.angle = Math.PI / 2;
  b.rotation.y = Math.PI / 2;
  scene.add(b);
  boats.push(b);
});

// ======================= HUMANS =======================
const player = makeHuman({ floral: true, pants: 0xf3efe6, skin: 0xe0b08a, hair: 0x1a1a1a, glasses: true });
player.position.set(38, 0, 3);
scene.add(player);

// ----- pedestrians: walk the sidewalk graph, cross roads, chat, dodge cars, can be shoved -----
const PH = 28.3;
let walkSpeed = 0;
const crowd = createCrowd({
  scene, rand, CELL, PH, GRID, count: 130, cars,
  collide: (pos, r) => collide(pos, r),
  getPlayer: () => {
    const p = getPos();
    return { x: p.x, z: p.z, onFoot: mode === 'foot' && !dead, speed: mode === 'foot' ? walkSpeed : Math.abs(currentVehicle() ? currentVehicle().userData.speed : 0) };
  },
  getWanted: () => wanted,
  onCarHit: (ped, c) => hitPed(ped, c),
  onShove: (ped, hard) => { if (hard) sfx.hit(); },
});
const peds = crowd.peds;

// ----- AI traffic -----
const TRAFFIC_COLORS = [0xf2f2f2, 0x1a1a1f, 0x8c9099, 0x2d4a8a, 0xb02a37, 0xd9d9d9, 0x2f6f4e, 0x6b4a2f, 0xe0b422];
function makeTrafficCar() {
  const r = rand();
  let car;
  if (r < 0.16) {                                          // taxi
    car = makeCar(0xffc400, 'sedan');
    const sign = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xfff4b0, toneMapped: false }));
    sign.scale.set(0.5, 0.16, 0.24); sign.position.set(0, 1.58, -0.1);
    car.userData.chassis.add(sign);
  } else car = makeCar(TRAFFIC_COLORS[Math.floor(rand() * TRAFFIC_COLORS.length)], rand() < 0.2 ? 'sport' : 'sedan');
  return car;
}
const traffic = createTraffic({
  scene, ROADS, cars, rand, count: 40, makeVehicle: makeTrafficCar,
  getPeds: () => peds,
});

// ======================= HELICOPTERS =======================
function makeHeli(color, police) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const bodyM = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.35, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.5, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), bodyM);
  body.scale.set(1.15, 1.05, 2.3); body.position.y = 1.5;
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glassMat);
  glass.scale.set(0.95, 0.8, 1.25); glass.position.set(0, 1.75, 1.2);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.1, 4.6, 10), bodyM);
  boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.75, -3.9);
  const fin = new THREE.Mesh(unitBox, police ? new THREE.MeshStandardMaterial({ color: 0x1b2a8a }) : bodyM);
  fin.scale.set(0.1, 1.3, 1.0); fin.position.set(0, 2.35, -6.0);
  g.add(body, glass, boom, fin);

  const tail = new THREE.Group();
  tail.position.set(0.2, 2.2, -6.1);
  const tb1 = new THREE.Mesh(unitBox, dark); tb1.scale.set(0.04, 1.5, 0.14);
  const tb2 = new THREE.Mesh(unitBox, dark); tb2.scale.set(0.04, 0.14, 1.5);
  tail.add(tb1, tb2);
  g.add(tail);

  [-1, 1].forEach((sx) => {
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 8), dark);
    sk.rotation.x = Math.PI / 2; sk.position.set(sx * 1.05, 0.12, 0.2);
    g.add(sk);
    [-0.9, 1.1].forEach((z) => {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), dark);
      st.position.set(sx * 1.0, 0.6, z);
      g.add(st);
    });
  });

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 8), dark);
  mast.position.y = 2.85;
  const main = new THREE.Group();
  main.position.y = 3.2;
  const bl = new THREE.BoxGeometry(9.6, 0.05, 0.36);
  const b1 = new THREE.Mesh(bl, dark), b2 = new THREE.Mesh(bl, dark);
  b2.rotation.y = Math.PI / 2;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(4.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  main.add(b1, b2, disc);
  g.add(mast, main);

  const blob = makeBlob(9, 9);
  scene.add(blob);
  g.userData = { speed: 0, angle: 0, vy: 0, pitch: 0, roll: 0, rotor: police ? 30 : 0, main, tail, life: 0, orbit: 0, police, blob };

  if (police) {
    const red = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xff1e1e, toneMapped: false }));
    const blue = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0x2a6bff, toneMapped: false }));
    red.scale.set(0.4, 0.14, 0.3); blue.scale.set(0.4, 0.14, 0.3);
    red.position.set(-0.35, 2.55, 0.2); blue.position.set(0.35, 2.55, 0.2);
    g.add(red, blue);
    Object.assign(g.userData, { red, blue });
  }
  return g;
}
function removeHeli(h) { scene.remove(h); scene.remove(h.userData.blob); }

const helis = [];       // flyable
const polHelis = [];    // police
function makePad(x, z) {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#3a3a44'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#ffd166'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
    g.fillStyle = '#ffd166'; g.font = 'bold 140px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('H', 128, 138);
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(6.5, 40),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z);
  scene.add(m);
}
makePad(40, 70);
const parkedHeli = makeHeli(0xff7a1a, false);
parkedHeli.position.set(40, 0, 70);
parkedHeli.userData.angle = Math.PI;
parkedHeli.rotation.y = Math.PI;
scene.add(parkedHeli);
helis.push(parkedHeli);

// ======================= LIGHTS FOR NIGHT =======================
const headSpot = new THREE.SpotLight(0xfff0d0, 0, 70, 0.5, 0.6, 2);
const headTarget = new THREE.Object3D();
headSpot.target = headTarget;
scene.add(headSpot, headTarget);
const heliSpot = new THREE.SpotLight(0xdfefff, 0, 120, 0.2, 0.5, 2);
const heliTarget = new THREE.Object3D();
heliSpot.target = heliTarget;
scene.add(heliSpot, heliTarget);

let night = false;
function setWaterNight(n) {
  const u = oceanUniforms;
  u.uHorizon.value.set(n ? 0x7a3a8a : 0xffb36b);
  u.uZenith.value.set(n ? 0x0a0f30 : 0x3a62a8);
  u.uDeep.value.set(n ? 0x02101e : 0x06527a);
  u.uShallow.value.set(n ? 0x0b4a55 : 0x35d0c8);
  u.uSunColor.value.set(n ? 0x8aa0ff : 0xffb27a);
  u.uSunPower.value = n ? 0.25 : 1;
  u.uNight.value = n ? 1 : 0;
}
function setNight(n) {
  night = n;
  skyMat.map = n ? skyNight : skyDay;
  skyMat.needsUpdate = true;
  scene.fog.color.set(n ? 0x2a1450 : 0xff9a6b);
  hemi.intensity = n ? 0.35 : 0.9;
  hemi.color.set(n ? 0x6a6cff : 0xffc4e0);
  sun.intensity = n ? 0.25 : 2.0;
  sun.color.set(n ? 0x8aa0ff : 0xffa56b);
  sunSprite.visible = !n;
  setWaterNight(n);
  scenery.setNight(n);
  stars.visible = n;
  scene.environmentIntensity = n ? 0.2 : 0.5;
  for (const m of lit) m.emissiveIntensity = n ? 1.6 : 0.15;
  lampMat.emissiveIntensity = n ? 4 : 0.6;
  headMat.emissiveIntensity = n ? 4 : 0.5;
}

// ======================= GAME STATE =======================
let started = false;
let mode = 'foot'; // 'foot' | 'car' | 'heli' | 'boat'
let currentCar = null;
let currentHeli = null;
let currentBoat = null;
let playerAngle = 0;
let bigMap = false;
let cheatOpen = false;

const keys = {};
function getPos() {
  return mode === 'car' ? currentCar.position : mode === 'heli' ? currentHeli.position : mode === 'boat' ? currentBoat.position : player.position;
}
function getHeading() {
  return mode === 'car' ? currentCar.userData.angle : mode === 'heli' ? currentHeli.userData.angle : mode === 'boat' ? currentBoat.userData.angle : playerAngle;
}
function currentVehicle() { return mode === 'car' ? currentCar : mode === 'heli' ? currentHeli : mode === 'boat' ? currentBoat : null; }

function nearestVehicle() {
  let best = null, bd = Infinity, type = '';
  for (const c of cars) {
    if (c.userData.wreck) continue;
    const d = flat(c.position, player.position);
    if (d < 5 && d < bd) { best = c; bd = d; type = 'car'; }
  }
  for (const h of helis) {
    const d = flat(h.position, player.position);
    if (d < 7 && d < bd && h.position.y < 2) { best = h; bd = d; type = 'heli'; }
  }
  for (const b of boats) {
    const d = flat(b.position, player.position);
    if (d < 9 && d < bd) { best = b; bd = d; type = 'boat'; }
  }
  return best ? { obj: best, type } : null;
}

function carjack(car) {
  traffic.release(car);
  const a = car.userData.angle;
  const left = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
  const p = car.position.clone().addScaledVector(left, 2.4);
  crowd.eject(p.x, p.z, randomLook(rand));
  car.userData.speed = 0;
  sfx.punch();
  toast('CARJACKED!', 1300);
  if (wanted < 1 && Math.random() < 0.6) { setWanted(1); toast('WANTED', 1200); }
}

function setDriverVisible(v, on) { if (v && v.userData.driver) v.userData.driver.visible = on; }

function toggleVehicle() {
  if (mode === 'foot') {
    if (dead) return;
    if (inside) { if (nearExit()) exitInterior(); return; }
    const v = nearestVehicle();
    if (!v) { const dr = nearestDoor(); if (dr && !swimming) enterInterior(dr); return; }
    weapons.aiming = false; weapons.setMouse(false);
    if (v.type === 'car' && v.obj.userData.ai) carjack(v.obj);
    player.visible = false;
    if (v.type === 'car') {
      currentCar = v.obj; mode = 'car';
      currentCar.add(headSpot, headTarget);
      headSpot.position.set(0, 1, 2.2);
      headTarget.position.set(0, 0.4, 22);
    } else if (v.type === 'boat') {
      currentBoat = v.obj; mode = 'boat';
    } else {
      currentHeli = v.obj; mode = 'heli';
    }
    setDriverVisible(v.obj, true);
    radio.setActive(true);
    if (v.type !== 'heli') sfx.punch();
  } else if (mode === 'car') {
    const a = currentCar.userData.angle;
    const left = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    player.position.copy(currentCar.position).addScaledVector(left, 2.8);
    playerAngle = a;
    player.visible = true;
    currentCar.userData.speed = 0;
    setDriverVisible(currentCar, false);
    scene.add(headSpot, headTarget);
    currentCar = null; mode = 'foot';
    radio.setActive(false);
  } else if (mode === 'boat') {
    const bp = currentBoat.position;
    const near = Math.abs(bp.x) < LAND + 30 && Math.abs(bp.z) < LAND + 30;
    if (!near) { toast('GET CLOSER TO THE SHORE', 1400); return; }
    // step out onto the pier if close to it, otherwise onto the beach
    const onPier = bp.x > LAND && Math.abs(bp.z - PIER.z) < 14;
    if (onPier) player.position.set(Math.min(bp.x - 1, PIER.end - 1), 0, PIER.z + THREE.MathUtils.clamp(bp.z - PIER.z, -PIER.hw + 0.8, PIER.hw - 0.8));
    else player.position.set(THREE.MathUtils.clamp(bp.x, -LIMIT, LIMIT), 0, THREE.MathUtils.clamp(bp.z, -LIMIT, LIMIT));
    clampWorld(player.position, LIMIT);
    player.visible = true;
    currentBoat.userData.speed = 0;
    setDriverVisible(currentBoat, false);
    currentBoat = null; mode = 'foot';
    radio.setActive(false);
  } else {
    if (currentHeli.position.y > 2) { toast('LAND FIRST', 1000); return; }
    const hp = currentHeli.position;
    if (Math.abs(hp.x) > LIMIT || Math.abs(hp.z) > LIMIT) { toast("CAN'T LAND ON WATER", 1400); return; }
    const a = currentHeli.userData.angle;
    const left = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    player.position.copy(currentHeli.position).addScaledVector(left, 3.8);
    player.position.y = 0;
    playerAngle = a;
    player.visible = true;
    currentHeli.userData.speed = 0;
    currentHeli = null; mode = 'foot';
    radio.setActive(false);
  }
}

// ======================= PLAYER HEALTH =======================
const MAX_HP = 100;
let hp = MAX_HP, hurtTimer = 0, dead = false, deadTimer = 0, atkCD = 0, pendingHit = null;
function renderHealth() {
  hpFill.style.width = Math.max(0, hp) + '%';
  healthEl.classList.toggle('low', hp < 30);
}
renderHealth();
function damagePlayer(n, lethal = true) {
  if (dead) return;
  hp -= n;
  if (!lethal) hp = Math.max(hp, 1);
  hurtTimer = 6;
  damageEl.classList.remove('hit'); void damageEl.offsetWidth; damageEl.classList.add('hit');
  renderHealth();
  if (hp <= 0) wasted();
}

// ======================= WANTED + POLICE =======================
let wanted = 0, crimeCD = 0, ramCD = 0, pedCD = 0, coolTimer = 0, bustTimer = 0, spawnCD = 0, heliCalled = false;
const cops = [];

function renderStars() {
  starsEl.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
  starsEl.style.color = wanted ? '#ffd166' : '#8a8aa0';
}
renderStars();

function clearCops() {
  for (const c of cops) scene.remove(c);
  cops.length = 0;
  for (const h of polHelis) removeHeli(h);
  polHelis.length = 0;
}
function setWanted(n) {
  n = Math.max(0, Math.min(5, n));
  if (n === wanted) return;
  wanted = n;
  renderStars();
  if (n === 0) clearCops();
  else if (n < 4) for (const h of polHelis) h.userData.life = Math.min(h.userData.life, 0);
}
function addWanted(n) { setWanted(wanted + n); }

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
function blockedAt(x, z) {
  for (const b of colliders) {
    if (x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2) return true;
  }
  return false;
}

function spawnCop() {
  const p = getPos();
  for (let k = 0; k < 30; k++) {
    const r = ROADS[Math.floor(Math.random() * ROADS.length)];
    const s = (Math.random() - 0.5) * 520;
    const alongX = Math.random() < 0.5;
    const x = alongX ? s : r, z = alongX ? r : s;
    if (Math.hypot(x - p.x, z - p.z) > 90 && Math.hypot(x - p.x, z - p.z) < 170) {
      const cop = makeCop();
      cop.position.set(x, 0, z);
      cop.userData.angle = Math.atan2(p.x - x, p.z - z);
      cop.rotation.y = cop.userData.angle;
      scene.add(cop);
      cops.push(cop);
      return;
    }
  }
}

function spawnPoliceHeli() {
  const p = getPos();
  const a = Math.random() * Math.PI * 2;
  const h = makeHeli(0xf5f5f5, true);
  h.position.set(p.x + Math.cos(a) * 160, 60, p.z + Math.sin(a) * 160);
  h.userData.life = 35;
  h.userData.orbit = a;
  scene.add(h);
  polHelis.push(h);
}

function updateCop(c, dt, t) {
  const d = c.userData;
  const p = getPos();
  const dx = p.x - c.position.x, dz = p.z - c.position.z;
  const dist = Math.hypot(dx, dz);
  const target = Math.atan2(dx, dz);
  const ahead = (ang, len) => [c.position.x + Math.sin(ang) * len, c.position.z + Math.cos(ang) * len];

  const want = angleDiff(d.angle, target);
  let steer = Math.sign(want) * Math.min(1, Math.abs(want) * 2);

  let blocked = false;
  const [ax, az] = ahead(d.angle, 14);
  if (blockedAt(ax, az)) {
    blocked = true;
    const [lx, lz] = ahead(d.angle + 0.8, 14);
    const [rx, rz] = ahead(d.angle - 0.8, 14);
    const lb = blockedAt(lx, lz), rb = blockedAt(rx, rz);
    if (lb && !rb) steer = -1;
    else if (rb && !lb) steer = 1;
    else steer = want >= 0 ? 1 : -1;
  }

  let targetSpd = 30 + wanted * 3;
  if (dist > 110) targetSpd *= 1.35;
  if (dist < 10) targetSpd = 10;
  if (blocked) targetSpd = Math.min(targetSpd, 14);
  d.speed += (targetSpd - d.speed) * Math.min(1, 1.5 * dt);

  if (Math.abs(d.speed) < 3 && dist > 6) d.stuck += dt; else d.stuck = 0;
  if (d.stuck > 1) { d.rev = 1.0; d.stuck = 0; }
  if (d.rev > 0) { d.rev -= dt; d.speed = -10; steer = -steer; }

  d.steerIn = steer;
  d.angle += steer * 2.0 * dt * THREE.MathUtils.clamp(d.speed / 10, -1, 1);
  moveCar(c, dt);

  const ph = Math.floor(t * 6) % 2 === 0;
  d.red.visible = ph;
  d.blue.visible = !ph;
}

function updatePoliceHeli(h, dt, t) {
  const d = h.userData;
  const p = getPos();
  const px = h.position.x, pz = h.position.z;
  if (d.life > 0) {
    d.life -= dt; d.orbit += dt * 0.6;
    const tx = p.x + Math.cos(d.orbit) * 20, tz = p.z + Math.sin(d.orbit) * 20;
    const k = Math.min(1, 2.0 * dt);
    h.position.x += (tx - h.position.x) * k;
    h.position.z += (tz - h.position.z) * k;
    h.position.y += (Math.max(34, p.y + 30) - h.position.y) * Math.min(1, dt);
    d.angle = Math.atan2(p.x - h.position.x, p.z - h.position.z);
  } else {
    h.position.y += 14 * dt;
    h.position.x += Math.sin(d.angle) * 25 * dt;
    h.position.z += Math.cos(d.angle) * 25 * dt;
  }
  const spd = Math.hypot(h.position.x - px, h.position.z - pz) / Math.max(dt, 0.001);
  d.pitch += (Math.min(spd / 40, 1) * 0.25 - d.pitch) * Math.min(1, 3 * dt);
  h.rotation.set(d.pitch, d.angle, 0);
  d.main.rotation.y += d.rotor * dt;
  d.tail.rotation.x += d.rotor * 1.6 * dt;
  const ph = Math.floor(t * 6) % 2 === 0;
  d.red.visible = ph; d.blue.visible = !ph;
  d.blob.position.set(h.position.x, 0.05, h.position.z);
}

function separateCars() {
  const all = cops.concat(cars);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.userData.wreck || b.userData.wreck) continue;
      const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.2 && dist > 0.001) {
        const push = (3.2 - dist) / 2 / dist;
        a.position.x -= dx * push; a.position.z -= dz * push;
        b.position.x += dx * push; b.position.z += dz * push;
        const rel = Math.abs(a.userData.speed - b.userData.speed);
        if (rel > 10 && (a.userData.crashCD || 0) <= 0 && (b.userData.crashCD || 0) <= 0) { a.userData.crashCD = b.userData.crashCD = 0.4; damageCar(a, rel * 0.45); damageCar(b, rel * 0.45); if (a === currentCar || b === currentCar) { sfx.crash(); weapons.addShake(0.35); } }
        a.userData.speed *= 0.97; b.userData.speed *= 0.97;
        const aCop = cops.includes(a), bCop = cops.includes(b);
        const playerHit = (a === currentCar && bCop) || (b === currentCar && aCop);
        if (playerHit && ramCD <= 0 && Math.abs(currentCar.userData.speed) > 12) {
          ramCD = 3;
          addWanted(1);
          toast('RAMMED A COP!', 1200);
        }
      }
    }
  }
}

function respawnPlayer() {
  const v = currentVehicle();
  if (v) { v.userData.speed = 0; setDriverVisible(v, false); }
  if (mode === 'car') scene.add(headSpot, headTarget);
  currentCar = currentBoat = currentHeli = null;
  mode = 'foot';
  player.visible = true;
  player.rotation.set(0, 0, 0);
  player.position.set(38, 0, 3);
  playerAngle = 0;
  hp = MAX_HP; renderHealth();
  radio.setActive(false);
}

function busted() {
  const fine = Math.min(money, 250);
  addMoney(-fine);
  toast('BUSTED\n-$' + fine, 3500);
  setWanted(0);
  clearCops();
  bustTimer = 0; coolTimer = 0;
  abortMission();
  clearThugs();
  respawnPlayer();
}

function wasted() {
  dead = true; deadTimer = 3.4;
  wastedEl.classList.add('show');
  sfx.fail();
  addMoney(-Math.min(money, 100));
  setWanted(0);
  clearCops();
  bustTimer = 0; coolTimer = 0;
  abortMission();
  clearThugs();
  const v = currentVehicle();
  if (v) v.userData.speed = 0;
  if (mode !== 'foot') { setDriverVisible(v, false); player.position.copy(getPos()); player.position.y = 0; player.visible = true; if (mode === 'car') scene.add(headSpot, headTarget); currentCar = currentBoat = currentHeli = null; mode = 'foot'; radio.setActive(false); }
  clampWorld(player.position, LIMIT);
}

function updatePolice(dt, t) {
  crimeCD -= dt; ramCD -= dt; pedCD -= dt; spawnCD -= dt;
  const p = getPos();

  const targetCops = wanted === 0 ? 0 : Math.min(6, wanted + 1);
  if (cops.length < targetCops && spawnCD <= 0) { spawnCop(); spawnCD = 1.5; }
  if (cops.length > targetCops) {
    for (let i = cops.length - 1; i >= 0; i--) {
      if (cops[i].position.distanceTo(p) > 110) { scene.remove(cops[i]); cops.splice(i, 1); break; }
    }
  }

  // helicopters at 4+ stars (they give up after ~35s)
  if (wanted >= 4 && !heliCalled) {
    heliCalled = true;
    for (let i = 0; i < wanted - 3; i++) spawnPoliceHeli();
    toast('POLICE HELICOPTER!', 1800);
  }
  if (wanted < 4) heliCalled = false;

  let nearest = Infinity;
  for (const c of cops) { updateCop(c, dt, t); nearest = Math.min(nearest, flat(c.position, p)); }
  let leader = null;
  for (let i = polHelis.length - 1; i >= 0; i--) {
    const h = polHelis[i];
    updatePoliceHeli(h, dt, t);
    if (h.userData.life > 0) { nearest = Math.min(nearest, flat(h.position, p) * 1.5); leader = leader || h; }
    if (h.userData.life <= 0 && h.position.y > 110) { removeHeli(h); polHelis.splice(i, 1); }
  }
  if (leader) {
    heliSpot.intensity = 9000;
    heliSpot.position.set(leader.position.x, leader.position.y - 1, leader.position.z);
    heliTarget.position.set(p.x, 0, p.z);
  } else heliSpot.intensity = 0;

  if (wanted > 0 && nearest > 90) {
    coolTimer += dt;
    if (coolTimer > 10) {
      coolTimer = 0;
      setWanted(wanted - 1);
      toast(wanted === 0 ? 'WANTED LEVEL CLEARED' : 'LOOKING GOOD...', 2000);
    }
  } else coolTimer = 0;

  const slow = mode === 'foot' || (mode === 'car' && Math.abs(currentCar.userData.speed) < 8);
  if (wanted > 0 && nearest < 4.5 && slow) {
    bustTimer += dt;
    if (bustTimer > 1.8) busted();
  } else bustTimer = Math.max(0, bustTimer - dt);

  starsEl.style.opacity = wanted > 0 && coolTimer > 0 ? (Math.floor(t * 4) % 2 ? 0.3 : 1) : 1;
}

// ======================= PEDESTRIAN UPDATE =======================
function hitPed(ped, c) {
  const a = c.userData.angle, sp = c.userData.speed;
  crowd.knock(ped, Math.sin(a) * sp * 0.5, Math.cos(a) * sp * 0.5);
  if (c === currentCar && pedCD <= 0) {
    pedCD = 2;
    sfx.hit();
    if (wanted < 2) { addWanted(1); toast('WANTED', 1200); }
  }
}
function updatePeds(dt) {
  crowd.update(dt, camera, cars.concat(cops));
}

// ======================= FIGHTING =======================
const thugs = [];
const thugShirts = [0xb3202a, 0x1a1a1a, 0x6a1b9a, 0xd9822b];
function spawnThug(x, z) {
  const look = randomLook(Math.random, 'male');
  Object.assign(look, { shirt: thugShirts[Math.floor(Math.random() * thugShirts.length)], pants: 0x1c1c24, outfit: Math.random() < 0.5 ? 'jacket' : 'tank', hairStyle: Math.random() < 0.5 ? 'cap' : 'short', hair: 0x111111, glasses: Math.random() < 0.4 });
  const mesh = makeHuman(look);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const th = { mesh, hp: 45, state: 'chase', cd: 1 + Math.random(), t: 0, vx: 0, vz: 0, stun: 0, hitCD: 0, hitPending: 0 };
  thugs.push(th);
  return th;
}
function clearThugs() { for (const t of thugs) scene.remove(t.mesh); thugs.length = 0; }
function aliveThugs() { let n = 0; for (const t of thugs) if (t.state !== 'ko') n++; return n; }

function knockThug(th, ang, force, dmg) {
  th.hp -= dmg;
  th.stun = 0.55; th.hitCD = 0.5;
  th.vx = Math.sin(ang) * force; th.vz = Math.cos(ang) * force;
  smoke.emit(th.mesh.position.x, 1.1, th.mesh.position.z);
  if (th.hp <= 0 && th.state !== 'ko') { th.state = 'ko'; th.t = 0; }
}

function updateThugs(dt) {
  const p = getPos();
  const rammers = cars.concat(cops);
  for (let i = thugs.length - 1; i >= 0; i--) {
    const th = thugs[i], m = th.mesh;
    if (th.state === 'ko') {
      th.t += dt;
      m.position.x += th.vx * dt; m.position.z += th.vz * dt;
      th.vx *= 1 - 3 * dt; th.vz *= 1 - 3 * dt;
      m.position.y = 0.2;
      m.rotation.x = Math.max(-Math.PI / 2, -th.t * 7);
      if (th.t > 5) { scene.remove(m); thugs.splice(i, 1); }
      continue;
    }
    th.cd -= dt; th.stun -= dt; th.hitCD -= dt;
    const dx = p.x - m.position.x, dz = p.z - m.position.z, dist = Math.hypot(dx, dz);
    let moving = 0;
    if (th.stun <= 0) {
      const face = Math.atan2(dx, dz);
      m.rotation.y = face;
      if (dist > 1.6) {
        const spd = dist > 25 ? 5.4 : 3.7;
        m.position.x += Math.sin(face) * spd * dt;
        m.position.z += Math.cos(face) * spd * dt;
        moving = spd;
      } else if (th.cd <= 0 && !dead) {
        startAttack(m, Math.random() < 0.7 ? 'punch' : 'kick');
        th.cd = 1.0 + Math.random() * 0.6;
        th.hitPending = 0.15;
      }
    } else {
      m.position.x += th.vx * dt; m.position.z += th.vz * dt;
      th.vx *= 1 - 4 * dt; th.vz *= 1 - 4 * dt;
    }
    if (th.hitPending > 0) {
      th.hitPending -= dt;
      if (th.hitPending <= 0 && !dead && flat(m.position, getPos()) < 2.4) {
        damagePlayer((6 + Math.random() * 5) * (mode === 'foot' ? 1 : 0.5));
        sfx.hit();
      }
    }
    for (const o of thugs) {                     // don't stack on top of each other
      if (o === th || o.state === 'ko') continue;
      const ox = m.position.x - o.mesh.position.x, oz = m.position.z - o.mesh.position.z, od = Math.hypot(ox, oz);
      if (od < 0.9 && od > 0.001) { m.position.x += (ox / od) * (0.9 - od) * 0.5; m.position.z += (oz / od) * (0.9 - od) * 0.5; }
    }
    collide(m.position, 0.5);
    animateHuman(m, moving, dt);
    if (th.hitCD <= 0) {                          // run them over
      for (const c of rammers) {
        const sp = Math.abs(c.userData.speed);
        if (sp < 6) continue;
        const ddx = m.position.x - c.position.x, ddz = m.position.z - c.position.z;
        if (ddx * ddx + ddz * ddz < 4.2) { knockThug(th, c.userData.angle, sp * 0.5, 40 + sp); if (c === currentCar) sfx.hit(); break; }
      }
    }
  }
}

function tryAttack(kind) {
  if (!started || cheatOpen || dead || mode !== 'foot' || atkCD > 0) return;
  atkCD = kind === 'kick' ? 0.65 : 0.4;
  startAttack(player, kind);
  sfx.punch();
  pendingHit = { t: kind === 'kick' ? 0.2 : 0.12, kind };
}
function resolveHit(kind) {
  const reach = kind === 'kick' ? 2.6 : 2.1, dmg = kind === 'kick' ? 26 : 15;
  const fx = Math.sin(playerAngle), fz = Math.cos(playerAngle);
  let landed = false;
  const inFront = (pos) => {
    const dx = pos.x - player.position.x, dz = pos.z - player.position.z, d = Math.hypot(dx, dz);
    return d > 0.01 && d < reach && (dx * fx + dz * fz) / d > 0.4;
  };
  for (const th of thugs) {
    if (th.state !== 'ko' && inFront(th.mesh.position)) { knockThug(th, playerAngle, kind === 'kick' ? 9 : 5, dmg * (0.85 + Math.random() * 0.3)); landed = true; }
  }
  for (const ped of peds) {
    if (ped.state === 0 && ped.mesh.visible && inFront(ped.mesh.position)) {
      crowd.knock(ped, fx * 6, fz * 6); landed = true;
      smoke.emit(ped.mesh.position.x, 1.1, ped.mesh.position.z);
      if (wanted < 1 && pedCD <= 0) { pedCD = 2; setWanted(1); toast('WANTED', 1200); }
    }
  }
  if (landed) sfx.hit();
}

// ======================= MISSIONS & LEVELS =======================
const START = { x: 40, z: -15 };
const PIER_START = { x: PIER.end - 8, z: PIER.z };
const HELI_START = { x: 40, z: 56 };
const LEVELS = [
  { name: 'OCEAN DRIVE', bonus: 2000, missions: [
    { title: 'Warm-up Run', need: 'foot', time: 40, reward: 200, stages: [{ x: 40, z: -120 }] },
    { title: 'First Wheels', need: 'vehicle', time: 45, reward: 500, stages: [{ x: 120, z: 40 }] },
    { title: 'Beach Delivery', need: 'vehicle', time: 75, reward: 1000, wanted: 1, stages: [{ x: 200, z: -120 }, { x: -40, z: -200 }] },
    { title: 'Street Brawl', need: 'foot', time: 80, reward: 1200, stages: [{ x: -120, z: -120, fight: 4 }] },
    { title: 'Vice City Tour', need: 'vehicle', time: 110, reward: 2500, wanted: 2,
      stages: [{ x: 120, z: 200 }, { x: -120, z: 120 }, { x: -200, z: -40 }, { x: 40, z: 40 }] },
  ] },
  { name: 'HARBOR', bonus: 4000, missions: [
    { title: 'Meet at the Pier', need: 'foot', time: 80, reward: 800, stages: [{ x: PIER.end - 8, z: PIER.z }] },
    { title: 'Speedboat Run', need: 'boat', start: PIER_START, time: 85, reward: 1800,
      stages: [{ x: 650, z: 120 }, { x: 790, z: -60 }, { x: 680, z: -240 }, { x: 570, z: -60 }] },
    { title: 'Dockside Brawl', need: 'foot', time: 100, reward: 2200, wanted: 1, stages: [{ x: PIER.end - 14, z: PIER.z, fight: 5 }] },
    { title: 'Lighthouse Run', need: 'boat', start: PIER_START, time: 120, reward: 2800,
      stages: [{ x: 600, z: 590 }, { x: -200, z: 600 }, { x: -800, z: 600 }] },
  ] },
  { name: 'SKY HIGH', bonus: 6000, missions: [
    { title: 'Take to the Skies', need: 'heli', start: HELI_START, time: 80, reward: 2500,
      stages: [{ x: -200, z: 200 }, { x: 200, z: 200 }, { x: 200, z: -200 }, { x: -200, z: -200 }] },
    { title: 'Island Hopper', need: 'heli', start: HELI_START, time: 160, reward: 3500,
      stages: [{ x: 800, z: -800 }, { x: 1100, z: 590 }, { x: -875, z: 650 }] },
    { title: 'Gang War', need: 'foot', time: 130, reward: 4000, wanted: 2, stages: [{ x: 40, z: 40, fight: 8 }] },
    { title: 'The Grand Heist', need: 'vehicle', time: 150, reward: 8000, wanted: 3,
      stages: [{ x: 200, z: 200 }, { x: -200, z: 200 }, { x: -200, z: -200 }, { x: 200, z: -200 }, { x: 40, z: -120 }] },
  ] },
];
const NEED_PROMPT = { foot: '', vehicle: 'Get in a vehicle!', boat: 'Get in a speedboat!', heli: 'Get in the helicopter!' };
const NEED_TEXT = { foot: 'On foot', vehicle: 'Any vehicle', boat: 'Speedboat', heli: 'Helicopter' };

let levelIdx = Math.min(loadNum('vc_level', 0), LEVELS.length);
let missionIndex = loadNum('vc_mi', 0);
if (LEVELS[levelIdx] && missionIndex >= LEVELS[levelIdx].missions.length) missionIndex = 0;
let mission = null;
let hudTimer = 0;
const curLevel = () => LEVELS[levelIdx];
const curDef = () => (LEVELS[levelIdx] ? LEVELS[levelIdx].missions[missionIndex] : null);

function makeMarker(color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 60, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 30;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.2, 8, 32), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  g.add(beam, ring);
  g.userData.ring = ring;
  g.userData.mats = [beam.material, ring.material];
  scene.add(g);
  return g;
}
function setMarkerColor(m, hex) { for (const mat of m.userData.mats) mat.color.setHex(hex); }
const startMarker = makeMarker(0xffd166);
startMarker.position.set(START.x, 0, START.z);
const objMarker = makeMarker(0xff2d95);
objMarker.visible = false;

function renderLevel() {
  const L = curLevel();
  if (!L) { setHTML(levelEl, '<span class="lv">LEVEL</span><b>MAX</b><em>ALL COMPLETE</em>'); return; }
  setHTML(levelEl, '<span class="lv">LEVEL ' + (levelIdx + 1) + '</span><b>' + L.name + '</b><em>' + missionIndex + ' / ' + L.missions.length + '</em>' +
    '<div class="pips">' + L.missions.map((_, i) => '<i class="' + (i < missionIndex ? 'done' : i === missionIndex ? 'cur' : '') + '"></i>').join('') + '</div>');
}

function startMission() {
  const def = curDef();
  mission = { def, stage: 0, timeLeft: def.time, spawned: false };
  if (def.wanted) setWanted(Math.max(wanted, def.wanted));
  toast(def.title.toUpperCase());
}
function levelComplete() {
  const L = curLevel();
  addMoney(L.bonus);
  sfx.level();
  levelIdx++; missionIndex = 0;
  saveNum('vc_level', levelIdx); saveNum('vc_mi', 0);
  const next = LEVELS[levelIdx];
  banner('LEVEL COMPLETE  ·  BONUS $' + L.bonus.toLocaleString(), next ? 'LEVEL ' + (levelIdx + 1) + '  ·  ' + next.name : 'YOU OWN VICE CITY', 6500);
}
function finishMission(passed) {
  if (passed) {
    const r = mission.def.reward;
    addMoney(r);
    sfx.pass();
    toast('MISSION PASSED\n+$' + r.toLocaleString(), 3500);
    missionIndex++;
    saveNum('vc_mi', missionIndex);
    mission = null;
    if (missionIndex >= curLevel().missions.length) levelComplete();
  } else {
    sfx.fail();
    toast('MISSION FAILED', 3000);
    mission = null;
  }
  objMarker.visible = false;
  clearThugs();
}
function abortMission() { mission = null; objMarker.visible = false; }
function skipCurrent() {
  if (mission) { finishMission(true); return; }
  const d = curDef();
  if (!d) return;
  addMoney(d.reward);
  missionIndex++;
  saveNum('vc_mi', missionIndex);
  if (missionIndex >= curLevel().missions.length) levelComplete();
}

function updateMissions(dt, t) {
  startMarker.userData.ring.position.y = 0.5 + Math.sin(t * 3) * 0.3;
  objMarker.userData.ring.position.y = 0.5 + Math.sin(t * 3) * 0.3;
  const p = getPos();
  const refresh = (hudTimer -= dt) <= 0;
  if (refresh) { hudTimer = 0.1; renderLevel(); }

  if (!mission) {
    objMarker.visible = false;
    const def = curDef();
    if (!def) {
      startMarker.visible = false;
      if (refresh) setHTML(missionEl, '<div class="m-tag">ALL LEVELS COMPLETE</div><div class="m-title">Legend of Vice City</div><div class="m-obj">Try the cheat codes (Enter)</div>');
      return;
    }
    const st = def.start || START;
    startMarker.visible = true;
    startMarker.position.set(st.x, 0, st.z);
    if (refresh) {
      setHTML(missionEl,
        '<div class="m-tag">NEXT JOB  ·  ' + curLevel().name + '</div><div class="m-title">' + def.title + '</div>' +
        '<div class="m-obj">Reward $' + def.reward.toLocaleString() + '  ·  ' + NEED_TEXT[def.need] + '</div>' +
        '<div class="m-row"><span>Follow the yellow dot</span><span>' + Math.round(flat(p, st)) + 'm</span></div>');
    }
    if (flat(p, st) < 3.5 && p.y < 15 && !dead) startMission();
    return;
  }

  startMarker.visible = false;
  const def = mission.def;
  const st = def.stages[mission.stage];
  mission.timeLeft -= dt;
  const need = def.need;
  const wrongMode = (need === 'vehicle' && mode === 'foot') || (need === 'boat' && mode !== 'boat') || (need === 'heli' && mode !== 'heli');
  const fighting = !!st.fight && mission.spawned;

  objMarker.visible = !fighting;
  objMarker.position.set(st.x, need === 'boat' ? WATER_Y : 0, st.z);
  setMarkerColor(objMarker, st.fight ? 0xff3030 : 0xff2d95);

  if (refresh) {
    let obj = fighting ? 'Defeat the gang  ·  ' + aliveThugs() + ' left' : wrongMode ? NEED_PROMPT[need] : st.fight ? 'Go to the red marker' : 'Follow the pink dot on the map';
    const secs = Math.max(0, Math.ceil(mission.timeLeft));
    setHTML(missionEl,
      '<div class="m-tag">MISSION  ·  LEVEL ' + (levelIdx + 1) + '</div><div class="m-title">' + def.title + '</div>' +
      '<div class="m-obj' + (wrongMode ? ' warn' : '') + '">' + obj + '</div>' +
      '<div class="m-row"><span>' + (fighting ? 'FIGHT!' : Math.round(flat(p, st)) + 'm') + '</span><span>Stage ' + (mission.stage + 1) + ' / ' + def.stages.length + '</span></div>' +
      '<div class="m-time' + (secs <= 10 ? ' low' : '') + '"><i style="width:' + Math.min(100, (mission.timeLeft / def.time) * 100) + '%"></i><b>' + secs + 's</b></div>');
  }

  if (mission.timeLeft <= 0) { finishMission(false); return; }

  let advance = false;
  if (st.fight) {
    if (!mission.spawned) {
      if (flat(p, st) < 9 && p.y < 15) {
        mission.spawned = true;
        for (let i = 0; i < st.fight; i++) {
          const a = (i / st.fight) * Math.PI * 2 + Math.random(), r = 9 + Math.random() * 5;
          spawnThug(st.x + Math.cos(a) * r, st.z + Math.sin(a) * r);
        }
        toast('FIGHT!', 1500);
      }
    } else if (aliveThugs() === 0) advance = true;
  } else if (!wrongMode) {
    const radius = need === 'heli' ? 16 : need === 'boat' ? 9 : 4;
    const hOk = need === 'heli' ? p.y < 90 : p.y < 15;
    if (flat(p, st) < radius && hOk) advance = true;
  }
  if (advance) {
    mission.stage++;
    mission.spawned = false;
    if (mission.stage >= def.stages.length) finishMission(true);
    else { sfx.pass(); toast('CHECKPOINT!', 1200); }
  }
}

// ======================= MINIMAP =======================
const mapCanvas = document.createElement('canvas');
mapCanvas.id = 'map';
const mctx = mapCanvas.getContext('2d');
document.body.appendChild(mapCanvas);
function applyMapStyle() {
  const S = bigMap ? Math.min(560, innerHeight - 100) : 220;
  mapCanvas.width = mapCanvas.height = S;
  mapCanvas.className = bigMap ? 'big' : '';
}
applyMapStyle();

function drawMap(t) {
  const S = mapCanvas.width, c = S / 2;
  const R = bigMap ? 900 : 90;
  const sc = c / R;
  const p = getPos();
  const heading = getHeading();
  const a = bigMap ? 0 : heading;
  const ox = bigMap ? 0 : p.x, oz = bigMap ? 0 : p.z;
  const sa = Math.sin(a), ca = Math.cos(a);

  const tm = (x, z) => {
    const rx = x - ox, rz = z - oz;
    return [c - (rx * ca - rz * sa) * sc, c - (rx * sa + rz * ca) * sc];
  };
  const poly = (x1, z1, x2, z2, col) => {
    mctx.fillStyle = col;
    mctx.beginPath();
    let q = tm(x1, z1); mctx.moveTo(q[0], q[1]);
    q = tm(x2, z1); mctx.lineTo(q[0], q[1]);
    q = tm(x2, z2); mctx.lineTo(q[0], q[1]);
    q = tm(x1, z2); mctx.lineTo(q[0], q[1]);
    mctx.closePath();
    mctx.fill();
  };
  const edge = (x, z) => {
    let [mx, my] = tm(x, z);
    const dx = mx - c, dy = my - c, len = Math.hypot(dx, dy), lim = c - 10;
    if (len > lim) { mx = c + (dx / len) * lim; my = c + (dy / len) * lim; }
    return [mx, my];
  };
  const dot = (x, z, col, r) => {
    const [mx, my] = edge(x, z);
    mctx.fillStyle = col;
    mctx.beginPath(); mctx.arc(mx, my, r, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#000'; mctx.lineWidth = 1.5; mctx.stroke();
  };

  mctx.fillStyle = '#0d3b57';                                         // sea
  mctx.fillRect(0, 0, S, S);
  poly(-LAND, -LAND, LAND, LAND, '#5b5238');                           // beach
  poly(-CITY_R, -CITY_R, CITY_R, CITY_R, '#1d1d2b');                               // asphalt
  poly(LAND - 6, PIER.z - PIER.hw, PIER.end, PIER.z + PIER.hw, '#8a6a45'); // pier
  for (const isl of ISLANDS) {
    const [ix, iy] = tm(isl.x, isl.z);
    mctx.fillStyle = '#5b5238'; mctx.beginPath(); mctx.arc(ix, iy, isl.r * 0.78 * sc, 0, Math.PI * 2); mctx.fill();
    if (isl.light) { mctx.fillStyle = '#fff1a8'; mctx.beginPath(); mctx.arc(ix, iy, Math.max(2, 4 * sc * 3), 0, Math.PI * 2); mctx.fill(); }
  }
  for (const b of blocks) poly(b.x - 30, b.z - 30, b.x + 30, b.z + 30, '#34344d');
  for (const b of colliders) if (!b.interior) poly(b.minX, b.minZ, b.maxX, b.maxZ, '#6a6a9c');

  let tgt = null, tcol = '#ffd166';
  if (mission) {
    const st = mission.def.stages[mission.stage];
    if (!(st.fight && mission.spawned)) { tgt = st; tcol = st.fight ? '#ff3030' : '#ff2d95'; }
  } else { const d = curDef(); if (d) tgt = d.start || START; }
  if (tgt) {
    const [px, py] = tm(p.x, p.z);
    const [mx, my] = edge(tgt.x, tgt.z);
    mctx.strokeStyle = tcol; mctx.globalAlpha = 0.6; mctx.lineWidth = 2; mctx.setLineDash([6, 6]);
    mctx.beginPath(); mctx.moveTo(px, py); mctx.lineTo(mx, my); mctx.stroke();
    mctx.setLineDash([]); mctx.globalAlpha = 1;
  }

  for (const car of cars) if (!car.userData.ai && !car.userData.wreck) dot(car.position.x, car.position.z, '#00e5ff', 3.5);
  for (const bt of boats) dot(bt.position.x, bt.position.z, '#7cfc00', 4);
  for (const th of thugs) if (th.state !== 'ko') dot(th.mesh.position.x, th.mesh.position.z, '#ff3030', 3.5);
  for (const h of helis) dot(h.position.x, h.position.z, '#ffae00', 4.5);
  if (tgt) dot(tgt.x, tgt.z, tcol, 7);
  const flash = Math.floor(t * 6) % 2 === 0;
  for (const cop of cops) dot(cop.position.x, cop.position.z, flash ? '#ff2d2d' : '#2d6bff', 5);
  for (const h of polHelis) dot(h.position.x, h.position.z, flash ? '#2d6bff' : '#ff2d2d', 6);

  const [px, py] = tm(p.x, p.z);
  mctx.save();
  mctx.translate(px, py);
  mctx.rotate(a - heading);
  mctx.fillStyle = '#fff'; mctx.strokeStyle = '#000'; mctx.lineWidth = 2;
  mctx.beginPath();
  mctx.moveTo(0, -9); mctx.lineTo(7, 8); mctx.lineTo(0, 4); mctx.lineTo(-7, 8);
  mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}

// ======================= MOVEMENT =======================
const MAX_REVERSE = -15, BRAKE = 45;
const camTarget = new THREE.Vector3();

function driveCar(car, dt) {
  const d = car.userData;
  const up = keys.ArrowUp || keys.KeyW, down = keys.ArrowDown || keys.KeyS;
  const left = keys.ArrowLeft || keys.KeyA, right = keys.ArrowRight || keys.KeyD;
  if (up) d.speed += d.accel * dt;
  else if (down) d.speed -= BRAKE * dt;
  else d.speed *= 1 - 1.2 * dt;
  if (keys.Space) d.speed *= 1 - 3 * dt;
  d.speed = THREE.MathUtils.clamp(d.speed, MAX_REVERSE, d.maxSpeed);
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  d.steerIn = steer;
  d.brake = !!(keys.Space || (down && d.speed > 1));
  d.throttle = up ? 1 : 0;
  d.angle += steer * d.turn * dt * THREE.MathUtils.clamp(d.speed / 10, -1, 1);
}

// far-away traffic: just advance, no visuals
function moveCarCheap(car, dt) {
  const d = car.userData;
  car.position.x += Math.sin(d.angle) * d.speed * dt;
  car.position.z += Math.cos(d.angle) * d.speed * dt;
  car.rotation.y = d.angle;
}
let smokeT = 0;
const _v = new THREE.Vector3();
function moveCar(car, dt) {
  const d = car.userData;
  const before = Math.abs(d.speed);
  const fwd = new THREE.Vector3(Math.sin(d.angle), 0, Math.cos(d.angle));
  car.position.addScaledVector(fwd, d.speed * dt);
  car.rotation.y = d.angle;
  const hit = collideCar(car);
  updateSink(car, dt);
  d.crashCD = (d.crashCD || 0) - dt;
  if (hit && before > 10 && d.crashCD <= 0) { d.crashCD = 0.35; damageCar(car, (before - 8) * 0.9); }
  if (d.hp !== undefined && d.hp < 55 && !d.wreck && !d.sinking) {
    d.fume = (d.fume || 0) - dt;
    if (d.fume <= 0) { d.fume = d.hp < 25 ? 0.07 : 0.17; _v.set((Math.random() - 0.5) * 0.6, 1.0, 1.6); car.updateMatrixWorld(); car.localToWorld(_v); smoke.emit(_v.x, _v.y, _v.z); }
  }

  d.spin += (d.speed * dt) / d.wr;
  d.steerVis += ((d.steerIn || 0) * 0.45 - d.steerVis) * Math.min(1, 8 * dt);
  for (const s of d.spinners) s.rotation.x = d.spin;
  for (const f of d.fronts) f.rotation.y = d.steerVis;
  updateCarVisuals(car, dt, night);
  if (d.kind === 'bike') {                                   // lean into the corner
    const target = -THREE.MathUtils.clamp((d.steerIn || 0) * Math.abs(d.speed) * 0.011, -0.55, 0.55) * Math.sign(d.speed || 1);
    d.lean += (target - d.lean) * Math.min(1, 6 * dt);
    d.chassis.rotation.z = d.lean;
  }

  // tyre smoke: handbrake turns and hard cornering
  if (car === currentCar) {
    const sp = Math.abs(d.speed);
    d.skid = (keys.Space && sp > 12) ? 1 : (Math.abs(d.steerIn) > 0 && sp > 32 ? 0.55 : 0);
    smokeT -= dt;
    if (d.skid > 0 && smokeT <= 0) {
      smokeT = 0.05;
      car.updateMatrixWorld();
      for (const sx of [-0.85, 0.85]) { _v.set(sx, 0.2, -1.4); car.localToWorld(_v); smoke.emit(_v.x, _v.y, _v.z); }
    }
  }

  // crashing into walls is not a crime: no wanted level (only hitting people, cops or shooting raises it)
  if (hit && car === currentCar && before > 18 && hurtTimer < 5.7) {
    sfx.crash();
    if (before > 30) damagePlayer(Math.min(10, (before - 28) * 0.6), false);
    hurtTimer = Math.max(hurtTimer, 6);
  }
}

// ----- speedboat -----
function driveBoat(b, dt) {
  const d = b.userData;
  const up = keys.ArrowUp || keys.KeyW, down = keys.ArrowDown || keys.KeyS;
  const left = keys.ArrowLeft || keys.KeyA, right = keys.ArrowRight || keys.KeyD;
  if (up) d.speed += d.accel * dt;
  else if (down) d.speed -= 28 * dt;
  else d.speed *= 1 - 0.45 * dt;
  if (keys.Space) d.speed *= 1 - 2 * dt;
  d.speed = THREE.MathUtils.clamp(d.speed, -12, d.maxSpeed);
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  d.steerIn = steer;
  d.throttle = up ? 1 : 0;
  d.angle += steer * d.turn * dt * THREE.MathUtils.clamp(Math.abs(d.speed) / 8, 0, 1) * (d.speed < 0 ? -1 : 1);
}
function moveBoat(b, dt, t) {
  const d = b.userData;
  b.position.x += Math.sin(d.angle) * d.speed * dt;
  b.position.z += Math.cos(d.angle) * d.speed * dt;
  const before = Math.abs(d.speed);
  const hit = collideBoat(b.position);
  if (hit) {
    d.speed *= 0.5;
    if (b === currentBoat && before > 12) { sfx.crash(); toast('CRASH!', 600); if (before > 25) damagePlayer(Math.min(8, (before - 22) * 0.5), false); }
  }
  const w = waveH(b.position.x, b.position.z, t);
  b.position.y = WATER_Y + 0.12 + w * 0.9;
  b.rotation.y = d.angle;
  const tp = THREE.MathUtils.clamp(-Math.abs(d.speed) * 0.0045, -0.18, 0) + Math.sin(t * 1.6 + d.bob) * 0.012;
  const tr = THREE.MathUtils.clamp((d.steerIn || 0) * d.speed * 0.004, -0.2, 0.2) + Math.sin(t * 1.3 + d.bob * 1.7) * 0.015;
  d.pitch += (tp - d.pitch) * Math.min(1, 4 * dt);
  d.roll += (tr - d.roll) * Math.min(1, 4 * dt);
  d.hullPivot.rotation.x = d.pitch;
  d.hullPivot.rotation.z = d.roll;
  d.prop.rotation.y += d.speed * dt * 4;
  d.wakeMat.opacity += (Math.min(Math.abs(d.speed) / 30, 0.55) - d.wakeMat.opacity) * Math.min(1, 4 * dt);
  d.wake.scale.z = 0.5 + Math.min(Math.abs(d.speed) / 40, 1) * 0.7;
  if (Math.abs(d.speed) > 6 && Math.random() < dt * 14) {           // spray
    _v.set((Math.random() - 0.5) * 1.6, 0.1, -2.8);
    b.updateMatrixWorld(); b.localToWorld(_v); smoke.emit(_v.x, WATER_Y + 0.3, _v.z);
  }
}

// ----- crash damage: dents, smoke, fire and explosions -----
const wreckMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 });
function makeWreck() {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, sx, sy, sz) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.scale.set(sx, sy, sz); g.add(me); };
  add(unitBox, wreckMat, 0, 0.7, 0, 2.0, 0.8, 4.4);
  add(unitBox, wreckMat, 0, 1.25, -0.3, 1.7, 0.5, 2.1);
  for (const sx of [-1, 1]) for (const sz of [-1.4, 1.4]) add(unitBox, new THREE.MeshStandardMaterial({ color: 0x0c0c0c }), sx * 1.0, 0.35, sz, 0.3, 0.7, 0.7);
  return g;
}
function damageCar(car, dmg) {
  const d = car.userData;
  if (d.ai || d.wreck || d.sinking || dmg <= 0) return;
  d.hp = (d.hp ?? 100) - dmg;
  const f = 1 - Math.max(0, d.hp) / 100;
  if (d.chassis) { d.chassis.scale.z = 1 - f * 0.07; d.chassis.scale.y = 1 - f * 0.05; }
  if (d.hp <= 0) explodeCar(car);
}
function explodeCar(car) {
  const d = car.userData, p = car.position;
  const x = p.x, z = p.z;
  weapons.burst(x, 1.0, z, 0xff8a1a, 26, 9, 1.6, 0.9, -1, 1.4);
  weapons.burst(x, 1.2, z, 0xffe08a, 14, 7, 1.1, 0.6, -1, 1.2);
  weapons.burst(x, 0.8, z, 0x222222, 18, 6, 2.0, 1.6, -2, 1.0);
  for (let i = 0; i < 10; i++) smoke.emit(x + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, z + (Math.random() - 0.5) * 3);
  if (flat(p, camera.position) < 150) sfx.explosion();
  if (flat(p, camera.position) < 40) weapons.addShake(0.9);
  if (car === currentCar) damagePlayer(999);
  else {
    const dp = flat(p, player.position);
    if (mode === 'foot' && dp < 9) damagePlayer(70 * (1 - dp / 9));
  }
  for (const pd of peds) { const dd = Math.hypot(pd.x - x, pd.z - z); if (dd < 10 && pd.state === 0 && !pd.dead) { if (dd < 4) crowd.kill(pd, (pd.x - x) * 1.5, (pd.z - z) * 1.5); else crowd.knock(pd, (pd.x - x) * 1.2, (pd.z - z) * 1.2); } }
  for (const th of thugs) if (th.state !== 'ko' && Math.hypot(th.mesh.position.x - x, th.mesh.position.z - z) < 8) knockThug(th, Math.atan2(th.mesh.position.x - x, th.mesh.position.z - z), 8, 80);
  for (const o of cars.concat(cops)) if (o !== car && flat(o.position, p) < 8) damageCar(o, 45);
  crowd.panic(x, z, 60);
  if (cops.includes(car)) {
    cops.splice(cops.indexOf(car), 1); scene.remove(car);
  } else {
    d.wreck = true; d.wreckT = 28; d.speed = 0; car.visible = false;
    d.wreckMesh = makeWreck(); d.wreckMesh.position.copy(p); d.wreckMesh.rotation.y = d.angle; scene.add(d.wreckMesh);
  }
}
function updateWreck(car, dt) {
  const d = car.userData;
  d.wreckT -= dt;
  d.fume = (d.fume || 0) - dt;
  if (d.fume <= 0 && d.wreckT > 4) { d.fume = 0.16; smoke.emit(car.position.x + (Math.random() - 0.5), 1.4, car.position.z + (Math.random() - 0.5)); }
  if (d.wreckT <= 0 && flat(car.position, camera.position) > 60) {
    scene.remove(d.wreckMesh); d.wreckMesh = null; d.wreck = false; d.hp = 100;
    if (d.chassis) { d.chassis.scale.set(1, 1, 1); }
    const h = d.home || { x: car.position.x, z: car.position.z, angle: d.angle };
    car.position.set(h.x, 0, h.z); d.angle = h.angle; d.speed = 0; car.visible = true; car.rotation.set(0, d.angle, 0);
  }
}

// ----- water: only boats float. Cars and bikes sink, people wade and swim -----
const SWIM_MAX = 55;
const onPierDeck = (p) => p.x > LAND - 6 && p.x < PIER.end + 0.3 && Math.abs(p.z - PIER.z) < PIER.hw + 0.3;
function splashFX(x, z, n = 8, big = false) {
  for (let i = 0; i < n; i++) smoke.emit(x + (Math.random() - 0.5) * (big ? 4 : 1), WATER_Y + 0.1, z + (Math.random() - 0.5) * (big ? 4 : 1));
}
function startSink(car) {
  const d = car.userData;
  d.sinking = true; d.sinkT = 0; d.sink = 0; d.sinkV = 0.4; d.bubT = 0; d.bubSnd = 0;
  car.rotation.order = 'YXZ';
  splashFX(car.position.x, car.position.z, 14, true);
  if (flat(car.position, camera.position) < 120) sfx.splashBig();
  if (car === currentCar) toast('SINKING!', 1600);
}
function updateSink(car, dt) {
  const d = car.userData, p = car.position;
  if (!d.home) d.home = { x: p.x, z: p.z, angle: d.angle };
  if (!d.sinking) {
    if (!d.ai && islandDist(p.x, p.z) > 6.5 && !onPierDeck(p)) startSink(car);
    return;
  }
  d.speed *= 1 - 3.2 * dt;
  d.sinkT += dt;
  d.sinkV = Math.min(2.4, d.sinkV + 0.5 * dt);
  d.sink += d.sinkV * dt;
  const floor = groundH(p.x, p.z) + 0.05;
  p.y = Math.max(-d.sink, floor);
  car.rotation.x += (0.32 - car.rotation.x) * Math.min(1, 1.4 * dt);
  car.rotation.z += ((Math.sin(d.sinkT * 1.7) * 0.12 + 0.1) - car.rotation.z) * Math.min(1, 2 * dt);
  d.bubT -= dt;
  if (d.bubT <= 0 && d.sinkT < 9) {
    d.bubT = 0.14;
    smoke.emit(p.x + (Math.random() - 0.5) * 2, WATER_Y + 0.05, p.z + (Math.random() - 0.5) * 3);
  }
  d.bubSnd -= dt;
  if (d.bubSnd <= 0 && d.sinkT < 8 && flat(p, camera.position) < 60) { d.bubSnd = 1.4; sfx.bubbles(5); }
  if (car === currentCar && d.sinkT > 2.4) { toggleVehicle(); toast('ABANDON SHIP!', 1400); }
  if (d.sinkT > 22 && flat(p, camera.position) > 70 && car !== currentCar) {             // the wreck is towed away
    d.sinking = false; d.sink = 0; d.speed = 0;
    p.set(d.home.x, 0, d.home.z); d.angle = d.home.angle;
    car.rotation.set(0, d.angle, 0);
  }
}

// walking into a parked car shoves it along; you can't walk through cars
function pushCars(dt) {
  for (const c of cars) {
    if (c.userData.wreck) continue;
    if (c.userData.ai && Math.abs(c.userData.speed) > 2) continue;
    const a = c.userData.angle, fx = Math.sin(a), fz = Math.cos(a);
    const dx = player.position.x - c.position.x, dz = player.position.z - c.position.z;
    const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;            // player in the car's frame
    const hw = c.userData.kind === 'bike' ? 0.55 : 1.15, hl = c.userData.kind === 'bike' ? 1.15 : 2.5;
    const ox = hw + 0.45 - Math.abs(lx), oz = hl + 0.45 - Math.abs(lz);
    if (ox > 0 && oz > 0) {
      let nx, nz;
      if (ox < oz) { nx = fz * Math.sign(lx || 1); nz = -fx * Math.sign(lx || 1); }
      else { nx = fx * Math.sign(lz || 1); nz = fz * Math.sign(lz || 1); }
      const depth = Math.min(ox, oz);
      player.position.x += nx * depth; player.position.z += nz * depth;               // keep the player outside
      const push = Math.min(depth, 0.35) * 5 * Math.min(1, walkSpeed / 3);
      c.position.x -= nx * push * dt; c.position.z -= nz * push * dt;                 // the car rolls away
      c.userData.speed *= 0.9;
    }
  }
}

let swimming = false, stepAcc = 0, inWaterPrev = false, farWarn = 0;
function clampFoot(pos) {
  if (onPierDeck(pos)) { pos.x = Math.min(pos.x, PIER.end); return; }
  const d = islandDist(pos.x, pos.z);
  if (d > SWIM_MAX) {
    const nx = islandDist(pos.x + 1, pos.z) - islandDist(pos.x - 1, pos.z), nz = islandDist(pos.x, pos.z + 1) - islandDist(pos.x, pos.z - 1);
    const l = Math.hypot(nx, nz) || 1;
    pos.x -= (nx / l) * (d - SWIM_MAX); pos.z -= (nz / l) * (d - SWIM_MAX);
    if (farWarn <= 0) { toast('TOO FAR OUT TO SWIM', 1200); farWarn = 3; }
  }
}
function walk(dt) {
  const left = keys.ArrowLeft || keys.KeyA, right = keys.ArrowRight || keys.KeyD;
  const up = keys.ArrowUp || keys.KeyW, down = keys.ArrowDown || keys.KeyS;
  const run = keys.ShiftLeft || keys.ShiftRight;
  farWarn -= dt;
  playerAngle += ((left ? 1 : 0) - (right ? 1 : 0)) * 2.6 * dt;
  const p = player.position;
  const deck0 = onPierDeck(p);
  const depth0 = deck0 || inside ? 0 : Math.max(0, WATER_Y - groundH(p.x, p.z));
  const swimNow = depth0 > 1.15;
  const spd = (swimNow ? (run ? 4.6 : 3.2) : (run ? 10 : 5) * (1 - Math.min(depth0, 1.1) * 0.35)) * (weapons.aiming && weapons.armed ? 0.55 : 1);
  const move = (up ? 1 : 0) - (down ? 0.6 : 0);
  const fwd = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle));
  p.addScaledVector(fwd, move * spd * dt);
  player.rotation.y = playerAngle;
  collide(p, 0.5, 0, inside ? 1e7 : LAND + 120);
  if (!inside) clampFoot(p);
  walkSpeed = Math.abs(move) * spd;
  pushCars(dt);

  // height: wade on the sea floor, swim at the surface
  const deck = onPierDeck(p) || !!inside, d = inside ? -50 : islandDist(p.x, p.z);
  const depth = deck ? 0 : Math.max(0, WATER_Y - groundH(p.x, p.z));
  swimming = depth > 1.15;
  let ty = 0;
  if (!deck && d > 0) ty = swimming ? WATER_Y - 0.3 + waveH(p.x, p.z, clock.elapsedTime) * 0.6 : groundH(p.x, p.z) + 0.2;
  p.y += (ty - p.y) * Math.min(1, 9 * dt);
  const inWater = depth > 0.05;
  if (inWater && !inWaterPrev) { sfx.wade(); splashFX(p.x, p.z, 3); }
  inWaterPrev = inWater;
  if (inWater && walkSpeed > 0.5) {
    stepAcc += walkSpeed * dt;
    const stride = swimming ? 2.2 : 1.5;
    if (stepAcc > stride) {
      stepAcc = 0;
      if (swimming) sfx.swim(); else sfx.wade();
      splashFX(p.x + fwd.x * 0.4, p.z + fwd.z * 0.4, swimming ? 3 : 2);
    }
  }

  animateHuman(player, swimming ? 0 : walkSpeed, dt);
  player.rotation.x += ((swimming ? 1.3 : 0) - player.rotation.x) * Math.min(1, 6 * dt);
  if (swimming) {                                                     // crawl stroke + flutter kick
    const u = player.userData, ph = clock.elapsedTime * (3 + walkSpeed * 0.9);
    u.armL.rotation.set(-1.7 + Math.sin(ph) * 1.5, 0, -0.1); u.armR.rotation.set(-1.7 + Math.sin(ph + Math.PI) * 1.5, 0, 0.1);
    u.foreL.rotation.x = -0.3; u.foreR.rotation.x = -0.3;
    u.legL.rotation.x = Math.sin(ph * 2) * 0.4; u.legR.rotation.x = Math.sin(ph * 2 + Math.PI) * 0.4;
    u.shinL.rotation.x = 0.2; u.shinR.rotation.x = 0.2;
    u.head.rotation.x = -0.9;
  }
  weapons.pose(dt, swimming);
}

function flyHeli(h, dt) {
  const d = h.userData;
  const up = keys.Space, down = keys.ShiftLeft || keys.ShiftRight;
  const fw = keys.KeyW || keys.ArrowUp, bk = keys.KeyS || keys.ArrowDown;
  const l = keys.KeyA || keys.ArrowLeft, r = keys.KeyD || keys.ArrowRight;

  d.rotor += (30 - d.rotor) * Math.min(1, 0.8 * dt);
  const spool = d.rotor > 18;
  const targetVy = spool ? (up ? 12 : down ? -12 : 0) : 0;
  d.vy += (targetVy - d.vy) * Math.min(1, 3 * dt);
  h.position.y = Math.max(0, h.position.y + d.vy * dt);
  if (h.position.y <= 0 && d.vy < 0) d.vy = 0;
  const airborne = h.position.y > 0.6;

  const targetSpd = airborne ? (fw ? 38 : bk ? -14 : 0) : 0;
  d.speed += (targetSpd - d.speed) * Math.min(1, 1.2 * dt);
  const steer = (l ? 1 : 0) - (r ? 1 : 0);
  if (airborne) d.angle += steer * 1.4 * dt;

  h.position.x += Math.sin(d.angle) * d.speed * dt;
  h.position.z += Math.cos(d.angle) * d.speed * dt;
  if (collide(h.position, 3, h.position.y, SEA_LIMIT)) d.speed *= 0.4;

  d.pitch += ((d.speed / 38) * 0.25 - d.pitch) * Math.min(1, 3 * dt);
  d.roll += ((airborne ? -steer * 0.3 * (Math.abs(d.speed) / 38) : 0) - d.roll) * Math.min(1, 3 * dt);
  h.rotation.set(d.pitch, d.angle, d.roll);
  d.main.rotation.y += d.rotor * dt;
  d.tail.rotation.x += d.rotor * 1.6 * dt;
  d.blob.position.set(h.position.x, 0.05, h.position.z);
}
function idleHeli(h, dt) {
  const d = h.userData;
  d.rotor += (0 - d.rotor) * Math.min(1, 0.5 * dt);
  d.main.rotation.y += d.rotor * dt;
  d.tail.rotation.x += d.rotor * 1.6 * dt;
  d.blob.position.set(h.position.x, 0.05, h.position.z);
}

function followCamera(target, angle, dist, height, dt, side = 0) {
  if (import.meta.env && import.meta.env.DEV && window.__vcFreeCam) return;
  const fwd = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  const rx = -Math.cos(angle) * side, rz = Math.sin(angle) * side;
  camTarget.copy(target).addScaledVector(fwd, -dist).add(new THREE.Vector3(rx, height, rz));
  camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
  camera.position.y = Math.max(camera.position.y, 1.2);
  camera.lookAt(target.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(rx * 0.9, 1, rz * 0.9)));
}

// ======================= CHEATS =======================
function spawnNearPlayer(o, type) {
  const p = getPos(), a = getHeading();
  const dist = type === 'heli' ? 12 : 7;
  o.position.set(p.x + Math.sin(a) * dist, 0, p.z + Math.cos(a) * dist);
  o.userData.angle = a;
  o.rotation.y = a;
  scene.add(o);
  (type === 'heli' ? helis : cars).push(o);
}
const CHEATS = {
  HESOYAM: () => { addMoney(250000); hp = MAX_HP; renderHealth(); return '+$250,000  ·  FULL HEALTH'; },
  LEAVEMEALONE: () => { setWanted(0); return 'WANTED LEVEL CLEARED'; },
  TURNUPTHEHEAT: () => { addWanted(2); return 'WANTED LEVEL UP'; },
  COMEFLYWITHME: () => { spawnNearPlayer(makeHeli(0xff7a1a, false), 'heli'); return 'HELICOPTER READY'; },
  GETTHEREQUICKLY: () => { spawnNearPlayer(makeCar(LUX[Math.floor(Math.random() * LUX.length)], 'sport'), 'car'); return 'SUPERCAR READY'; },
  NIGHTPROWLER: () => { setNight(!night); return night ? 'NIGHT TIME' : 'DAY TIME'; },
  TAKEMEHOME: () => { getPos().set(38, 0, 3); return 'TELEPORTED'; },
  SKIPMISSION: () => { skipCurrent(); return 'MISSION SKIPPED'; },
  NEXTLEVEL: () => { abortMission(); clearThugs(); if (curLevel()) levelComplete(); return 'LEVEL SKIPPED'; },
  NEWGAME: () => { abortMission(); clearThugs(); levelIdx = 0; missionIndex = 0; saveNum('vc_level', 0); saveNum('vc_mi', 0); return 'PROGRESS RESET'; },
  BOATTIME: () => { if (mode === 'foot') { player.position.set(PIER_START.x, 0, PIER_START.z); } return 'AT THE PIER'; },
  FIGHTCLUB: () => { const p = getPos(); for (let i = 0; i < 3; i++) spawnThug(p.x + 6 + i * 2, p.z + i * 2 - 2); return 'THREE THUGS INCOMING'; },
};
function openCheat() {
  cheatOpen = true;
  Object.keys(keys).forEach((k) => (keys[k] = false));
  cheatBox.classList.add('show');
  cheatInput.value = '';
  cheatInput.focus();
}
function closeCheat() {
  cheatOpen = false;
  cheatBox.classList.remove('show');
  cheatInput.blur();
}
cheatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.code === 'Escape') closeCheat();
  if (e.code === 'Enter') {
    const code = cheatInput.value.trim().toUpperCase();
    closeCheat();
    const fn = CHEATS[code];
    if (fn) toast('CHEAT ACTIVATED\n' + fn(), 2200);
    else toast('WRONG CODE', 1200);
  }
});

// ======================= RADIO UI =======================
function updateRadioUI() {
  const t = radio.current;
  radioEl.querySelector('b').textContent = t.title;
  radioEl.querySelector('em').textContent = t.artist;
  radioEl.querySelector('.st').textContent = t.kind === 'file' ? 'MY MUSIC' : 'VICE FM';
  radioEl.classList.toggle('muted', radio.muted);
}
radio.onChange(updateRadioUI);
updateRadioUI();

// ======================= INPUT / START =======================
function startGame() {
  if (started) return;
  started = true;
  document.body.classList.add('playing');
  title.classList.add('hide');
  setTimeout(() => (title.style.display = 'none'), 600);
  unlockAudio();
  banner('WELCOME TO', 'VICE CITY MINI', 3200);
}
title.addEventListener('click', startGame);
addEventListener('keydown', (e) => {
  if (!started) { if (e.code === 'Enter') startGame(); return; }
  if (cheatOpen) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Enter') openCheat();
  if (e.code === 'KeyF') toggleVehicle();
  if (e.code === 'KeyM') { bigMap = !bigMap; applyMapStyle(); }
  if (e.code === 'KeyR') { if (mode === 'foot') weapons.startReload(); else radio.next(); }
  if (e.code === 'KeyQ' && mode === 'foot') weapons.cycle(1);
  if (e.code === 'KeyE' && mode === 'foot' && !dead) { const sp = interiorSpot(); if (sp) useSpot(sp); }
  if (mode === 'foot' && !dead && e.code >= 'Digit1' && e.code <= 'Digit5') weapons.select(weapons.ORDER[+e.code.slice(5) - 1]);
  if (e.code === 'KeyH' && canShoot()) weapons.shoot(performance.now() / 1000);
  if (e.code === 'KeyT') radio.prev();
  if (e.code === 'KeyN') radio.toggleMute();
  if (e.code === 'KeyJ') tryAttack('punch');
  if (e.code === 'KeyK') tryAttack('kick');
});
addEventListener('keyup', (e) => (keys[e.code] = false));
const canShoot = () => started && !cheatOpen && !dead && mode === 'foot' && !swimming && weapons.armed;
addEventListener('pointerdown', (e) => {
  if (!started || e.target !== renderer.domElement) return;
  if (e.button === 0) {
    if (canShoot()) { weapons.setMouse(true); weapons.shoot(performance.now() / 1000); }
    else tryAttack('punch');
  } else if (e.button === 2 && mode === 'foot' && weapons.armed) {
    weapons.aiming = true;
    try { renderer.domElement.requestPointerLock(); } catch (err) {}
  }
});
addEventListener('pointerup', (e) => {
  if (e.button === 0) weapons.setMouse(false);
  if (e.button === 2) { weapons.aiming = false; try { if (document.pointerLockElement) document.exitPointerLock(); } catch (err) {} }
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { if (weapons.aiming && document.pointerLockElement && mode === 'foot') playerAngle -= e.movementX * 0.0034; });
addEventListener('wheel', (e) => { if (started && mode === 'foot' && !cheatOpen) weapons.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: true });

// ======================= WEAPONS =======================
let frameId = 0, humansAt = -1, humansList = [], vehAt = -1, vehList = [];
const weapons = createWeapons({
  scene, camera, player, sfx, smoke, keys, colliders, toast,
  getAngle: () => playerAngle, getSpeed: () => walkSpeed, getPos: () => player.position,
  isWater: (x, z) => islandDist(x, z) > 5.3,
  humans() {
    if (humansAt === frameId) return humansList;
    humansAt = frameId; humansList = [];
    for (const th of thugs) if (th.state !== 'ko') humansList.push({ x: th.mesh.position.x, z: th.mesh.position.z, r: 0.42, y0: 0, y1: 1.8, kind: 'thug', ref: th });
    for (const p of peds) if (p.mesh.visible && p.state === 0 && !p.dead) humansList.push({ x: p.x, z: p.z, r: 0.4, y0: 0, y1: 1.75 * (p.mesh.userData.H || 1), kind: 'ped', ref: p });
    return humansList;
  },
  vehicles() {
    if (vehAt === frameId) return vehList;
    vehAt = frameId; vehList = [];
    for (const c of cars) if (c.visible && c !== currentCar) vehList.push(c);
    for (const c of cops) vehList.push(c);
    return vehList;
  },
  onHitHuman(h, dmg, head, dir) {
    const ang = Math.atan2(dir.x, dir.z);
    if (h.kind === 'thug') {
      knockThug(h.ref, ang, 2 + dmg * 0.06, dmg);
      if (h.ref.state === 'ko') { addMoney(40 + Math.floor(Math.random() * 60)); if (head) toast('HEADSHOT', 900); }
    } else {
      const p = h.ref;
      p.hpShot = (p.hpShot ?? 40) - dmg;
      if (p.hpShot <= 0) {
        crowd.kill(p, dir.x * 3, dir.z * 3);
        addMoney(10 + Math.floor(Math.random() * 40));
        if (head) toast('HEADSHOT', 900);
        if (wanted < 2) { setWanted(2); toast('WANTED', 1200); }
      } else {
        crowd.knock(p, dir.x * 2.5, dir.z * 2.5);
        if (wanted < 1) { setWanted(1); toast('WANTED', 1200); }
      }
      crowd.panic(player.position.x, player.position.z, 45);
    }
  },
  onHitVehicle(c, dmg) {
    damageCar(c, dmg * 0.35);
    if (cops.includes(c) && crimeCD <= 0) { crimeCD = 3; addWanted(1); toast('SHOT AT A COP', 1200); }
    else if (c.userData.ai) c.userData.panic = 3;
  },
  onShot() {
    crowd.panic(player.position.x, player.position.z, 28);
    if (wanted < 1 && crimeCD <= 0) {
      for (const p of peds) if (p.mesh.visible && p.state === 0 && Math.hypot(p.x - player.position.x, p.z - player.position.z) < 30) { crimeCD = 4; setWanted(1); toast('WANTED', 1200); break; }
    }
  },
});
// ammo crates around town
{
  const spots = [[46, 8], [30, 10], [-30, -10], [120, 22], [-110, 30]];
  for (const [x, z] of spots) weapons.addPickup(x, z);
  const bl = blocks.filter((b) => !PARKS.some(([i, j]) => i * CELL === b.x && j * CELL === b.z));
  for (let i = 0; i < 14; i++) { const b = bl[Math.floor(rand() * bl.length)]; weapons.addPickup(b.x + (rand() < 0.5 ? -1 : 1) * 29.4, b.z + (rand() - 0.5) * 24); }
}

// ======================= INTERIORS =======================
const interiorSys = buildInteriors({ scene, colliders, canvasTex, rand });
const interiorLight = new THREE.PointLight(0xffffff, 0, 45, 1.2);
scene.add(interiorLight);
const fadeEl = document.createElement('div');
fadeEl.id = 'fade'; document.body.appendChild(fadeEl);
let inside = null, intReturn = null, intWanted = 0;
const LIGHTS = [[0xfff1d6, 55], [0xffe9c0, 50], [0xffd9a8, 45], [0xb066ff, 90]];
function flashFade() { fadeEl.style.transition = 'none'; fadeEl.style.opacity = '1'; void fadeEl.offsetWidth; fadeEl.style.transition = 'opacity .55s ease'; fadeEl.style.opacity = '0'; }
function nearestDoor() {
  let best = null, bd = 2.6;
  for (const d of scenery.doors) { const k = Math.hypot(d.x - player.position.x, d.z - player.position.z); if (k < bd) { bd = k; best = d; } }
  return best;
}
function snapCamera() {
  const a = playerAngle;
  camera.position.set(player.position.x - Math.sin(a) * 3.4, inside ? 2.2 : 3, player.position.z - Math.cos(a) * 3.4);
}
function enterInterior(door) {
  const it = interiorSys.list[door.type];
  inside = it; intReturn = door;
  weapons.aiming = false; weapons.setMouse(false);
  player.position.set(it.entry.x, 0, it.entry.z);
  playerAngle = 0; player.rotation.set(0, 0, 0);
  it.group.visible = true;
  const L = LIGHTS[door.type];
  interiorLight.color.setHex(L[0]); interiorLight.intensity = L[1];
  interiorLight.position.set(it.cx, it.h - 0.9, it.cz);
  intWanted = wanted;
  if (wanted > 0) { clearCops(); setWanted(0); toast('LAYING LOW', 1200); }
  if (it.music) radio.setActive(true);
  sfx.door(); flashFade(); snapCamera();
}
function exitInterior() {
  const it = inside, d = intReturn;
  it.group.visible = false;
  interiorLight.intensity = 0;
  inside = null;
  player.position.set(d.x, 0, d.z);
  playerAngle = Math.atan2(d.nx, d.nz); player.rotation.set(0, playerAngle, 0);
  if (intWanted > 0) { setWanted(Math.max(0, intWanted - 1)); intWanted = 0; }
  radio.setActive(false);
  sfx.door(); flashFade(); snapCamera();
}
function interiorSpot() {
  if (!inside) return null;
  for (const sp of inside.spots) if (Math.hypot(inside.cx + sp.x - player.position.x, inside.cz + sp.z - player.position.z) < sp.r) return sp;
  return null;
}
function nearExit() {
  return inside && Math.hypot(inside.exit.x - player.position.x, inside.exit.z - player.position.z) < inside.exit.r;
}
function useSpot(sp) {
  const pay = (n) => { if (money < n) { toast('NOT ENOUGH CASH', 1200); return false; } addMoney(-n); return true; };
  if (sp.act === 'snack' && pay(20)) { hp = Math.min(MAX_HP, hp + 30); renderHealth(); toast('YUM  +30 HP', 1300); sfx.pass(); }
  else if (sp.act === 'ammo' && pay(150)) { weapons.refillAll(); toast('AMMO REFILLED', 1300); sfx.pass(); }
  else if (sp.act === 'drink' && pay(30)) { hp = Math.min(MAX_HP, hp + 15); renderHealth(); toast('CHEERS  +15 HP', 1300); sfx.pass(); }
  else if (sp.act === 'sleep') { hp = MAX_HP; renderHealth(); setNight(!night); flashFade(); toast(night ? 'YOU SLEPT\nIT IS NIGHT' : 'YOU SLEPT\nA NEW DAY', 2200); }
}

// ======================= MAIN LOOP =======================
const clock = new THREE.Clock();

function update(dt, t) {
  frameId++;
  updatePeds(dt);

  if (!started) {
    const a = t * 0.08;
    camera.position.set(Math.cos(a) * 170, 60, Math.sin(a) * 170);
    camera.lookAt(0, 15, 0);
    return;
  }

  traffic.update(dt, t, cars.concat(cops), camera.position);
  for (const c of cars) {
    if (c.userData.wreck) { updateWreck(c, dt); continue; }
    if (c.userData.ai) { /* driven by traffic.update */ }
    else if (c !== currentCar) { c.userData.speed *= 1 - 3 * dt; c.userData.steerIn = 0; c.userData.brake = false; c.userData.skid = 0; }
    else driveCar(c, dt);
    if (c.visible) moveCar(c, dt); else moveCarCheap(c, dt);
  }
  for (const b of boats) {
    if (b !== currentBoat) { b.userData.speed *= 1 - 1.5 * dt; b.userData.steerIn = 0; }
    else driveBoat(b, dt);
    moveBoat(b, dt, t);
  }
  for (const h of helis) (h === currentHeli ? flyHeli(h, dt) : idleHeli(h, dt));

  // combat timers + health regeneration
  atkCD -= dt;
  if (pendingHit) { pendingHit.t -= dt; if (pendingHit.t <= 0) { resolveHit(pendingHit.kind); pendingHit = null; } }
  hurtTimer -= dt;
  if (hurtTimer <= 0 && hp < MAX_HP && !dead) { hp = Math.min(MAX_HP, hp + 4 * dt); renderHealth(); }

  let msg = '';
  if (mode === 'foot') {
    if (dead) {
      deadTimer -= dt;
      player.rotation.x = Math.max(-Math.PI / 2, player.rotation.x - dt * 5);
      player.position.y = 0.15;
      followCamera(player.position, playerAngle, 7, 3, dt);
      if (deadTimer <= 0) { dead = false; wastedEl.classList.remove('show'); respawnPlayer(); }
    } else {
      walk(dt);
      const ad = weapons.aiming && weapons.armed;
      if (inside) {
        followCamera(player.position, playerAngle, ad ? 2.8 : 3.8, ad ? 1.9 : 2.3, dt, weapons.armed ? 0.6 : 0);
        const bd = inside.bounds;
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, bd.minX, bd.maxX);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, bd.minZ, bd.maxZ);
        camera.position.y = Math.min(camera.position.y, bd.h - 0.35);
      } else followCamera(player.position, playerAngle, ad ? 4.4 : 7, ad ? 2.3 : 3, dt, weapons.armed ? (ad ? 1.1 : 0.8) : 0);
      if (weapons.shake > 0) { camera.position.x += (Math.random() - 0.5) * weapons.shake * 0.12; camera.position.y += (Math.random() - 0.5) * weapons.shake * 0.08; }
      const v = inside ? null : nearestVehicle();
      const door = inside ? null : nearestDoor();
      const spot = interiorSpot();
      if (inside) msg = spot ? spot.label : nearExit() ? 'Press F to leave' : '';
      else if (!v && door && !swimming) msg = 'Press F to enter  ' + door.name;
      else if (v) msg = v.type === 'heli' ? 'Press F to board helicopter' : v.type === 'boat' ? 'Press F to board speedboat' : v.obj.userData.kind === 'bike' ? 'Press F to get on the bike' : v.obj.userData.ai ? 'Press F to carjack!' : 'Press F to enter car';
      else if (aliveThugs() > 0) msg = 'J punch  ·  K kick';
    }
  } else if (mode === 'car') {
    followCamera(currentCar.position, currentCar.userData.angle, currentCar.userData.kind === 'bike' ? 8 : 10, currentCar.userData.kind === 'bike' ? 3.3 : 4.5, dt);
    msg = currentCar.userData.kind === 'bike' ? 'Press F to get off' : 'Press F to exit car';
  } else if (mode === 'boat') {
    followCamera(currentBoat.position, currentBoat.userData.angle, 13, 5.5, dt);
    msg = 'Press F near the shore to get out';
  } else {
    followCamera(currentHeli.position, currentHeli.userData.angle, 24, 9, dt);
    msg = currentHeli.position.y > 2 ? 'Space climb  ·  Shift descend  ·  land to exit' : 'Space to take off  ·  F to exit';
  }
  promptEl.textContent = msg;
  promptEl.classList.toggle('show', !!msg);

  // speedometer
  const veh = currentVehicle();
  speedEl.classList.toggle('show', !!veh);
  if (mode === 'heli') setHTML(speedEl, '<div class="num">' + Math.round(currentHeli.position.y) + '</div><div class="unit">M ALT</div><div class="bar"><i style="width:' + Math.min(100, currentHeli.position.y / 80 * 100) + '%"></i></div>');
  else if (veh) setHTML(speedEl, '<div class="num">' + Math.round(Math.abs(veh.userData.speed) * 3.4) + '</div><div class="unit">KM/H</div><div class="bar"><i style="width:' + Math.min(100, Math.abs(veh.userData.speed) / veh.userData.maxSpeed * 100) + '%"></i></div>');

  // field of view widens with speed
  const vd = veh && veh.userData;
  const targetFov = vd && mode !== 'heli' ? 68 + Math.min(1, Math.abs(vd.speed) / vd.maxSpeed) * 12 : (weapons.aiming && weapons.armed && mode === 'foot' ? 52 : 68);
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov += (targetFov - camera.fov) * Math.min(1, 4 * dt); camera.updateProjectionMatrix(); }

  // sound
  if (veh && !dead) {
    if (mode === 'heli') engine.update('heli', Math.min(1, vd.rotor / 30), 0);
    else engine.update(mode, Math.min(1, Math.abs(vd.speed) / vd.maxSpeed), vd.throttle || 0, vd.skid || 0);
  } else engine.update(null, 0, 0);
  radioEl.classList.toggle('show', !!veh);

  { const gp = getPos(), gd = islandDist(gp.x, gp.z); ambient.sea(inside ? 0 : gd > 0 ? 1 : Math.max(0, 1 - (-gd) / 140)); }
  if (inside) interiorSys.update(inside, dt, t);
  headSpot.intensity = night && mode === 'car' ? 900 : 0;

  updateThugs(dt);
  weapons.update(dt, t, mode === 'foot' && !dead && !swimming);
  updateMissions(dt, t);
  updatePolice(dt, t);
  separateCars();
  drawMap(t);
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt, clock.elapsedTime);
  smoke.update(dt);
  scenery.update(dt, clock.elapsedTime, camera.position);
  oceanUniforms.uTime.value = clock.elapsedTime;
  oceanUniforms.uFogColor.value.copy(scene.fog.color);
  ocean.position.x = Math.round(camera.position.x / 10) * 10;
  ocean.position.z = Math.round(camera.position.z / 10) * 10;
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  applyMapStyle();
});

// handy for testing in the browser console while running "npm run dev"
let simT = 0;
if (import.meta.env && import.meta.env.DEV) {
  window.__vc = {
    THREE, scene, camera, cars, boats, helis, player, thugs, peds, crowd, traffic, cops, weapons, spawnThug, interiorSys, enterInterior, exitInterior, doors: () => scenery.doors, inside: () => inside, getAngle: () => playerAngle, setAngle: (a) => { playerAngle = a; },
    state: () => ({ mode, levelIdx, missionIndex, hp, money, wanted, dead, mission: mission && { title: mission.def.title, stage: mission.stage, t: Math.round(mission.timeLeft) } }),
    setPos: (x, z) => player.position.set(x, 0, z),
    enter: toggleVehicle,
    cheat: (c) => CHEATS[c](),
    damage: (n) => damagePlayer(n),
    pos: () => getPos().toArray(),
    keys, renderer,
    step: (n, dt = 0.05) => { for (let i = 0; i < n; i++) { simT += dt; update(dt, simT); smoke.update(dt); } },
  };
}
