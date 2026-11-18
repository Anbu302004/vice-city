import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './style.css';
import { makeCar, makeBoat, makeSmoke, updateCarVisuals, headMat } from './vehicles.js';
import { unlockAudio, radio, engine, sfx } from './audio.js';

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
const LAND = 380;                          // half-size of the main island (sand edge)
const PIER = { z: 150, end: LAND + 62, hw: 4 };
const ISLANDS = [                          // small islands out at sea (boat missions)
  { x: -700, z: 520, r: 80, light: true },
  { x: 640, z: -640, r: 95 },
  { x: 880, z: 470, r: 55 },
  { x: -620, z: -760, r: 70 },
];
const SEA_LIMIT = 1100;

const waveH = (x, z, t) => Math.sin(x * 0.045 + t * 0.9) * 0.2 + Math.sin(z * 0.06 - t * 1.1) * 0.17 + Math.sin((x + z) * 0.11 + t * 1.7) * 0.07;
const oceanUniforms = { uTime: { value: 0 } };
const oceanMat = new THREE.MeshStandardMaterial({ color: 0x0a86a8, roughness: 0.2, metalness: 0.3 });
oceanMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = oceanUniforms.uTime;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      uniform float uTime;
      float waveH(vec2 p){ return sin(p.x*0.045+uTime*0.9)*0.2 + sin(p.y*0.06-uTime*1.1)*0.17 + sin((p.x+p.y)*0.11+uTime*1.7)*0.07; }`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      vec4 wp0 = modelMatrix * vec4(position, 1.0);
      float eps = 0.6;
      float hx = waveH(wp0.xz + vec2(eps, 0.)) - waveH(wp0.xz - vec2(eps, 0.));
      float hz = waveH(wp0.xz + vec2(0., eps)) - waveH(wp0.xz - vec2(0., eps));
      objectNormal = normalize(vec3(-hx / (2. * eps), 1., -hz / (2. * eps)));`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.y += waveH((modelMatrix * vec4(position, 1.0)).xz);`);
};
const oceanGeo = new THREE.PlaneGeometry(2600, 2600, 260, 260);
oceanGeo.rotateX(-Math.PI / 2);
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.position.y = WATER_Y;
ocean.frustumCulled = false;

const sandMat = new THREE.MeshStandardMaterial({ color: 0xe8d3a0, roughness: 1 });
const sand = new THREE.Mesh(new THREE.PlaneGeometry(LAND * 2, LAND * 2), sandMat);
sand.rotation.x = -Math.PI / 2; sand.position.y = -0.2;
// gentle beach slope that runs down under the water on all four sides
const slope = new THREE.Mesh(new THREE.CylinderGeometry(LAND * Math.SQRT2, (LAND + 50) * Math.SQRT2, 5, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0xd9bf86, roughness: 1, side: THREE.DoubleSide }));
slope.rotation.y = Math.PI / 4; slope.position.y = -2.7;

const asphaltTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#2b2b32'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3500; i++) {
    const v = 30 + Math.random() * 30 | 0;
    g.fillStyle = `rgb(${v},${v},${v + 6})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}, true);
asphaltTex.repeat.set(60, 60);
const asphalt = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9 })
);
asphalt.rotation.x = -Math.PI / 2;
scene.add(ocean, sand, slope, asphalt);

// ======================= CITY LAYOUT =======================
const CELL = 80, BLOCK = 60, GRID = 3, LIMIT = LAND - 2;
const ROADS = [-200, -120, -40, 40, 120, 200];
const colliders = [];
const blocks = [];

// ----- road markings -----
const markWhite = new THREE.MeshStandardMaterial({ color: 0xe9e9e2, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const markYellow = new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const dashGeo = new THREE.PlaneGeometry(0.3, 3.2); dashGeo.rotateX(-Math.PI / 2);
const stripeGeo = new THREE.PlaneGeometry(0.9, 3.4); stripeGeo.rotateX(-Math.PI / 2);
const lineGeo = new THREE.PlaneGeometry(0.22, 1); lineGeo.rotateX(-Math.PI / 2);

const dashes = [], yellows = [], zebra = [];
const bounds = [-300, ...ROADS, 300];
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

for (let i = -GRID; i <= GRID; i++) {
  for (let j = -GRID; j <= GRID; j++) {
    const cx = i * CELL, cz = j * CELL;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.3, BLOCK), sidewalkMat);
    slab.position.set(cx, 0.15, cz);
    scene.add(slab);
    blocks.push({ x: cx, z: cz });

    for (const ox of [-15, 15]) {
      for (const oz of [-15, 15]) {
        if (rand() < 0.15) continue;
        const w = 20 + rand() * 4, d = 20 + rand() * 4;
        const h = 12 + rand() * (rand() < 0.25 ? 55 : 28);
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
inst(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }), palms);
inst(frondGeo(), new THREE.MeshStandardMaterial({ color: 0x1f9d55, roughness: 0.8, side: THREE.DoubleSide }), palms);
inst(poleGeo, new THREE.MeshStandardMaterial({ color: 0x44444c, metalness: 0.6, roughness: 0.5 }), poles);
inst(headGeo, lampMat, heads);

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
  if (Math.abs(pos.x) < L + r && Math.abs(pos.z) < L + r) {
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
    if (collide(p, 1.15)) { hit = true; car.position.add(p.sub(before)); }
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
const SKIN = [0xf2c9a0, 0xd9a273, 0xa8734a, 0x7a4e2d, 0xffdbb5];
const floral = canvasTex(64, 64, (g) => {
  g.fillStyle = '#19b5a5'; g.fillRect(0, 0, 64, 64);
  const cols = ['#ff4f9a', '#ffd166', '#ffffff', '#ff7a3d'];
  for (let i = 0; i < 22; i++) {
    g.fillStyle = cols[i % 4];
    g.beginPath(); g.arc(Math.random() * 64, Math.random() * 64, 3 + Math.random() * 3, 0, 7); g.fill();
  }
}, true);

function makeHuman(o) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const skin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.75 });
  const shirt = new THREE.MeshStandardMaterial(o.floral ? { map: floral, roughness: 0.8 } : { color: o.shirt, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.9 });
  const hairM = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  const add = (geo, mat, x, y, z, p = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    p.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.52, 0.64, 0.28), shirt, 0, 1.18, 0);
  add(new THREE.BoxGeometry(0.14, 0.1, 0.14), skin, 0, 1.55, 0);
  add(new THREE.SphereGeometry(0.17, 16, 12), skin, 0, 1.7, 0).scale.set(1, 1.1, 1);
  add(new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 1.72, -0.01);
  if (o.glasses) add(new THREE.BoxGeometry(0.3, 0.06, 0.05), black, 0, 1.71, 0.16);
  const limb = (w, h, mat, x, y, tip) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    add(new THREE.BoxGeometry(w, h, w), mat, 0, -h / 2, 0, p);
    if (tip) add(new THREE.BoxGeometry(w + 0.02, 0.1, w + 0.12), tip, 0, -h + 0.05, 0.04, p);
    g.add(p);
    return p;
  };
  g.userData = {
    armL: limb(0.13, 0.58, skin, 0.35, 1.47), armR: limb(0.13, 0.58, skin, -0.35, 1.47),
    legL: limb(0.2, 0.84, pants, 0.13, 0.86, black), legR: limb(0.2, 0.84, pants, -0.13, 0.86, black),
    ph: Math.random() * 6,
  };
  return g;
}

function animateHuman(h, speed, dt) {
  const u = h.userData;
  u.ph += speed * dt * 3.2;
  const amp = Math.min(speed / 2.5, 1) * 0.75;
  const s = Math.sin(u.ph) * amp;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
  if (u.atk > 0) {                                  // punch / kick animation overrides the walk cycle
    u.atk -= dt;
    const k = Math.sin(Math.min(1, 1 - Math.max(u.atk, 0) / u.atkMax) * Math.PI);
    if (u.atkKind === 'kick') { u.legR.rotation.x = -1.5 * k; u.armL.rotation.x = 0.8 * k; }
    else { u.armR.rotation.x = -1.8 * k; u.armL.rotation.x = 0.5 * k; h.rotation.x = 0.12 * k; }
  } else if (u.atkKind) { u.atkKind = ''; h.rotation.x = 0; }
}
function startAttack(h, kind) {
  const u = h.userData;
  u.atkKind = kind;
  u.atk = u.atkMax = kind === 'kick' ? 0.45 : 0.3;
}

const player = makeHuman({ floral: true, pants: 0xf3efe6, skin: 0xe0b08a, hair: 0x1a1a1a, glasses: true });
player.position.set(38, 0, 3);
scene.add(player);

// ----- pedestrians walk around the sidewalk of a block -----
const PH = 28.3, PL = PH * 2, PER = PL * 4;
const shirts = [0xff5d8f, 0x2ec4b6, 0xffd166, 0xffffff, 0x7b61ff, 0xff9f1c];
const pantsC = [0xf2e8d5, 0x2b3a67, 0x222222, 0x8d6e63, 0xffffff];
const hairsC = [0x151515, 0x3a2616, 0x7a4b1f, 0xd9b36c];
const peds = [];
for (let i = 0; i < 40; i++) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const mesh = makeHuman({ shirt: pick(shirts), pants: pick(pantsC), skin: pick(SKIN), hair: pick(hairsC), glasses: rand() < 0.3 });
  scene.add(mesh);
  peds.push({
    mesh, cx: (Math.floor(rand() * 7) - 3) * CELL, cz: (Math.floor(rand() * 7) - 3) * CELL,
    s: rand() * PER, dir: rand() < 0.5 ? 1 : -1, spd: 1.2 + rand(), state: 0, t: 0, vx: 0, vz: 0,
  });
}
function pedPos(p) {
  let u = p.dir > 0 ? p.s : PER - p.s;
  u = ((u % PER) + PER) % PER;
  const side = Math.floor(u / PL), t = u - side * PL;
  let x, z, a;
  if (side === 0) { x = -PH + t; z = -PH; a = Math.PI / 2; }
  else if (side === 1) { x = PH; z = -PH + t; a = 0; }
  else if (side === 2) { x = PH - t; z = PH; a = -Math.PI / 2; }
  else { x = -PH; z = PH - t; a = Math.PI; }
  if (p.dir < 0) a += Math.PI;
  return [p.cx + x, p.cz + z, a];
}

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
  oceanMat.color.set(n ? 0x06324f : 0x0a86a8);
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

function setDriverVisible(v, on) { if (v && v.userData.driver) v.userData.driver.visible = on; }

function toggleVehicle() {
  if (mode === 'foot') {
    if (dead) return;
    const v = nearestVehicle();
    if (!v) return;
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
      const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.2 && dist > 0.001) {
        const push = (3.2 - dist) / 2 / dist;
        a.position.x -= dx * push; a.position.z -= dz * push;
        b.position.x += dx * push; b.position.z += dz * push;
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
  ped.state = 1; ped.t = 0;
  const a = c.userData.angle, s = c.userData.speed;
  ped.vx = Math.sin(a) * s * 0.5;
  ped.vz = Math.cos(a) * s * 0.5;
  if (c === currentCar && pedCD <= 0) {
    pedCD = 2;
    if (wanted < 2) { addWanted(1); toast('WANTED', 1200); }
  }
}
function updatePeds(dt) {
  const vehicles = cars.concat(cops);
  for (const ped of peds) {
    const m = ped.mesh;
    if (ped.state === 0) {
      ped.s += ped.spd * dt;
      const [x, z, a] = pedPos(ped);
      m.position.set(x, 0, z);
      m.rotation.set(0, a, 0);
      animateHuman(m, ped.spd, dt);
      for (const c of vehicles) {
        if (Math.abs(c.userData.speed) > 5) {
          const dx = c.position.x - x, dz = c.position.z - z;
          if (dx * dx + dz * dz < 2.9) { hitPed(ped, c); break; }
        }
      }
    } else {
      ped.t += dt;
      m.position.x += ped.vx * dt;
      m.position.z += ped.vz * dt;
      ped.vx *= 1 - 2 * dt; ped.vz *= 1 - 2 * dt;
      m.position.y = 0.2;
      m.rotation.x = Math.max(-Math.PI / 2, -ped.t * 6);
      if (ped.t > 4) { ped.state = 0; m.rotation.x = 0; ped.s = Math.random() * PER; }
    }
  }
}

// ======================= FIGHTING =======================
const thugs = [];
const thugShirts = [0xb3202a, 0x1a1a1a, 0x6a1b9a, 0xd9822b];
function spawnThug(x, z) {
  const mesh = makeHuman({ shirt: thugShirts[Math.floor(Math.random() * thugShirts.length)], pants: 0x1c1c24, skin: SKIN[Math.floor(Math.random() * SKIN.length)], hair: 0x111111, glasses: Math.random() < 0.4 });
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
    if (ped.state === 0 && inFront(ped.mesh.position)) {
      ped.state = 1; ped.t = 0; ped.vx = fx * 6; ped.vz = fz * 6; landed = true;
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
      stages: [{ x: 520, z: 120 }, { x: 640, z: -60 }, { x: 540, z: -240 }, { x: 440, z: -60 }] },
    { title: 'Dockside Brawl', need: 'foot', time: 100, reward: 2200, wanted: 1, stages: [{ x: PIER.end - 14, z: PIER.z, fight: 5 }] },
    { title: 'Lighthouse Run', need: 'boat', start: PIER_START, time: 120, reward: 2800,
      stages: [{ x: 500, z: 470 }, { x: -200, z: 480 }, { x: -625, z: 450 }] },
  ] },
  { name: 'SKY HIGH', bonus: 6000, missions: [
    { title: 'Take to the Skies', need: 'heli', start: HELI_START, time: 80, reward: 2500,
      stages: [{ x: -200, z: 200 }, { x: 200, z: 200 }, { x: 200, z: -200 }, { x: -200, z: -200 }] },
    { title: 'Island Hopper', need: 'heli', start: HELI_START, time: 160, reward: 3500,
      stages: [{ x: 640, z: -640 }, { x: 880, z: 470 }, { x: -700, z: 520 }] },
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
  poly(-300, -300, 300, 300, '#1d1d2b');                               // asphalt
  poly(LAND - 6, PIER.z - PIER.hw, PIER.end, PIER.z + PIER.hw, '#8a6a45'); // pier
  for (const isl of ISLANDS) {
    const [ix, iy] = tm(isl.x, isl.z);
    mctx.fillStyle = '#5b5238'; mctx.beginPath(); mctx.arc(ix, iy, isl.r * 0.78 * sc, 0, Math.PI * 2); mctx.fill();
    if (isl.light) { mctx.fillStyle = '#fff1a8'; mctx.beginPath(); mctx.arc(ix, iy, Math.max(2, 4 * sc * 3), 0, Math.PI * 2); mctx.fill(); }
  }
  for (const b of blocks) poly(b.x - 30, b.z - 30, b.x + 30, b.z + 30, '#34344d');
  for (const b of colliders) poly(b.minX, b.minZ, b.maxX, b.maxZ, '#6a6a9c');

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

  for (const car of cars) dot(car.position.x, car.position.z, '#00e5ff', 3.5);
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

let smokeT = 0;
const _v = new THREE.Vector3();
function moveCar(car, dt) {
  const d = car.userData;
  const before = Math.abs(d.speed);
  const fwd = new THREE.Vector3(Math.sin(d.angle), 0, Math.cos(d.angle));
  car.position.addScaledVector(fwd, d.speed * dt);
  car.rotation.y = d.angle;
  const hit = collideCar(car);

  d.spin += (d.speed * dt) / d.wr;
  d.steerVis += ((d.steerIn || 0) * 0.45 - d.steerVis) * Math.min(1, 8 * dt);
  for (const s of d.spinners) s.rotation.x = d.spin;
  for (const f of d.fronts) f.rotation.y = d.steerVis;
  updateCarVisuals(car, dt, night);

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

  if (hit && car === currentCar && before > 25 && crimeCD <= 0) {
    crimeCD = 4;
    if (wanted < 1) { setWanted(1); toast('WANTED', 1500); }
  }
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

function walk(dt) {
  const left = keys.ArrowLeft || keys.KeyA, right = keys.ArrowRight || keys.KeyD;
  const up = keys.ArrowUp || keys.KeyW, down = keys.ArrowDown || keys.KeyS;
  playerAngle += ((left ? 1 : 0) - (right ? 1 : 0)) * 2.6 * dt;
  const spd = keys.ShiftLeft || keys.ShiftRight ? 10 : 5;
  const move = (up ? 1 : 0) - (down ? 0.6 : 0);
  const fwd = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle));
  player.position.addScaledVector(fwd, move * spd * dt);
  player.rotation.set(0, playerAngle, 0);
  collide(player.position, 0.5);
  animateHuman(player, Math.abs(move) * spd, dt);
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

function followCamera(target, angle, dist, height, dt) {
  if (import.meta.env && import.meta.env.DEV && window.__vcFreeCam) return;
  const fwd = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  camTarget.copy(target).addScaledVector(fwd, -dist).add(new THREE.Vector3(0, height, 0));
  camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
  camera.position.y = Math.max(camera.position.y, 1.2);
  camera.lookAt(target.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, 1, 0)));
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
  if (e.code === 'KeyR') radio.next();
  if (e.code === 'KeyT') radio.prev();
  if (e.code === 'KeyN') radio.toggleMute();
  if (e.code === 'KeyJ') tryAttack('punch');
  if (e.code === 'KeyK') tryAttack('kick');
});
addEventListener('keyup', (e) => (keys[e.code] = false));
addEventListener('pointerdown', (e) => { if (started && e.button === 0 && e.target === renderer.domElement) tryAttack('punch'); });

// ======================= MAIN LOOP =======================
const clock = new THREE.Clock();

function update(dt, t) {
  updatePeds(dt);

  if (!started) {
    const a = t * 0.08;
    camera.position.set(Math.cos(a) * 170, 60, Math.sin(a) * 170);
    camera.lookAt(0, 15, 0);
    return;
  }

  for (const c of cars) {
    if (c !== currentCar) { c.userData.speed *= 1 - 3 * dt; c.userData.steerIn = 0; c.userData.brake = false; c.userData.skid = 0; }
    else driveCar(c, dt);
    moveCar(c, dt);
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
      followCamera(player.position, playerAngle, 7, 3, dt);
      const v = nearestVehicle();
      if (v) msg = v.type === 'heli' ? 'Press F to board helicopter' : v.type === 'boat' ? 'Press F to board speedboat' : 'Press F to enter car';
      else if (aliveThugs() > 0) msg = 'J punch  ·  K kick';
    }
  } else if (mode === 'car') {
    followCamera(currentCar.position, currentCar.userData.angle, 10, 4.5, dt);
    msg = 'Press F to exit car';
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
  const targetFov = vd && mode !== 'heli' ? 68 + Math.min(1, Math.abs(vd.speed) / vd.maxSpeed) * 12 : 68;
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov += (targetFov - camera.fov) * Math.min(1, 4 * dt); camera.updateProjectionMatrix(); }

  // sound
  if (veh && !dead) {
    if (mode === 'heli') engine.update('heli', Math.min(1, vd.rotor / 30), 0);
    else engine.update(mode, Math.min(1, Math.abs(vd.speed) / vd.maxSpeed), vd.throttle || 0, vd.skid || 0);
  } else engine.update(null, 0, 0);
  radioEl.classList.toggle('show', !!veh);

  headSpot.intensity = night && mode === 'car' ? 900 : 0;

  updateThugs(dt);
  updateMissions(dt, t);
  updatePolice(dt, t);
  separateCars();
  drawMap(t);
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt, clock.elapsedTime);
  smoke.update(dt);
  oceanUniforms.uTime.value = clock.elapsedTime;
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
    THREE, scene, camera, cars, boats, helis, player, thugs, peds,
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
