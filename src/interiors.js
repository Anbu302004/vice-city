import * as THREE from 'three';
import { makeHuman, animateHuman, randomLook } from './humans.js';
import { makeGunMesh } from './weapons.js';

// ---------------------------------------------------------------------------
// Walk-in interiors: a 24/7 shop, a gun shop, an apartment and a night club.
// Each lives in its own sealed room far away from the city; doors in the city
// teleport you in. Interiors are hidden (not rendered) while you are outside.
// ---------------------------------------------------------------------------

const box = new THREE.BoxGeometry(1, 1, 1);
const cylG = new THREE.CylinderGeometry(1, 1, 1, 14);
const sph = new THREE.SphereGeometry(1, 16, 12);
export const INT_Z = 3000;
export const INT_X = 3000;

export function buildInteriors({ scene, colliders, canvasTex, rand }) {
  const M = (color, rough = 0.85, extra) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...(extra || {}) });
  const glow = (color, k = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.5 });
  const interiors = [];

  function room(idx, name, w, d, h, o) {
    const cx = INT_X + idx * 60, cz = INT_Z;
    const g = new THREE.Group();
    g.visible = false;
    scene.add(g);
    const add = (geo, mat, x, y, z, sx, sy, sz, ry = 0, solid = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx + x, y, cz + z); m.scale.set(sx, sy, sz); m.rotation.y = ry;
      g.add(m);
      if (solid) {
        const c = Math.abs(Math.cos(ry)) > 0.7;
        const hx = (c ? sx : sz) / 2, hz = (c ? sz : sx) / 2;
        colliders.push({ minX: cx + x - hx, maxX: cx + x + hx, minZ: cz + z - hz, maxZ: cz + z + hz, h: solid, interior: true });
      }
      return m;
    };
    // floor, ceiling
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), o.floor);
    fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0.01, cz); g.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(o.ceil ?? 0xeeeeee, 0.9));
    ce.rotation.x = Math.PI / 2; ce.position.set(cx, h, cz); g.add(ce);
    // walls (solid, thick) + skirting
    const wm = o.wall;
    add(box, wm, 0, h / 2, d / 2 + 0.25, w + 1, h, 0.5, 0, h);
    add(box, wm, 0, h / 2, -d / 2 - 0.25, w + 1, h, 0.5, 0, h);
    add(box, wm, w / 2 + 0.25, h / 2, 0, 0.5, h, d, 0, h);
    add(box, wm, -w / 2 - 0.25, h / 2, 0, 0.5, h, d, 0, h);
    const skirt = M(o.trim ?? 0x333333, 0.7);
    add(box, skirt, 0, 0.1, d / 2 - 0.03, w, 0.2, 0.06);
    add(box, skirt, 0, 0.1, -d / 2 + 0.03, w, 0.2, 0.06);
    add(box, skirt, w / 2 - 0.03, 0.1, 0, 0.06, 0.2, d);
    add(box, skirt, -w / 2 + 0.03, 0.1, 0, 0.06, 0.2, d);
    // ceiling light panels
    const panel = glow(o.light ?? 0xfff3d6, 1.1);
    for (let x = -w / 2 + 3; x < w / 2 - 1; x += 5) for (let z = -d / 2 + 2.5; z < d / 2 - 1; z += 4.5) add(box, panel, x, h - 0.04, z, 2.2, 0.06, 0.7);
    // entrance door with EXIT sign
    add(box, M(0x5a3a22, 0.7), 0, 1.1, -d / 2 + 0.02, 1.7, 2.2, 0.08);
    add(box, M(0x9ad7ff, 0.1, { metalness: 0.5, emissive: 0x2a4a66, emissiveIntensity: 0.4 }), 0, 1.5, -d / 2 + 0.07, 1.3, 1.2, 0.02);
    add(box, glow(0x37ff7a, 1.2), 0, 2.45, -d / 2 + 0.05, 0.9, 0.22, 0.04);

    const data = {
      idx, name, group: g, cx, cz, w, d, h, add, spots: [], npcs: [], anim: [],
      bounds: { minX: cx - w / 2 + 0.45, maxX: cx + w / 2 - 0.45, minZ: cz - d / 2 + 0.45, maxZ: cz + d / 2 - 0.45, h },
      entry: { x: cx, z: cz - d / 2 + 1.7, angle: 0 },
      exit: { x: cx, z: cz - d / 2 + 0.9, r: 1.8 },
      music: !!o.music,
    };
    interiors.push(data);
    return data;
  }
  const npc = (it, look, x, z, ry, extra = {}) => {
    const h = makeHuman(look);
    h.position.set(it.cx + x, 0, it.cz + z); h.rotation.y = ry;
    it.group.add(h);
    it.npcs.push({ h, g: 0, dance: !!extra.dance, ph: Math.random() * 6 });
    return h;
  };
  const checker = (a, b) => canvasTex(128, 128, (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * 32, y * 32, 32, 32); } }, true);
  const textSign = (txt, col, bg, w = 256, h = 64) => canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = 'bold ' + (h * 0.62) + 'px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 10; g.fillStyle = col; g.fillText(txt, w / 2, h / 2 + 2);
  });
  const sign = (it, txt, col, bg, x, y, z, sx, sy, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: textSign(txt, col, bg), toneMapped: false }));
    m.position.set(it.cx + x, y, it.cz + z); m.scale.set(sx, sy, 1); m.rotation.y = ry; it.group.add(m); return m;
  };
  const inst = (it, geo, mat, items, colors) => {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const d = new THREE.Object3D(), c = new THREE.Color();
    items.forEach((p, i) => {
      d.position.set(it.cx + p.x, p.y, it.cz + p.z); d.rotation.set(0, p.ry || 0, 0); d.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1); d.updateMatrix();
      im.setMatrixAt(i, d.matrix); if (colors) { c.setHex(colors[(Math.random() * colors.length) | 0]); im.setColorAt(i, c); }
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    it.group.add(im); return im;
  };
  const PROD = [0xff4f9a, 0x27e8ff, 0xffd166, 0x80ed99, 0xff7a3d, 0xffffff, 0x7b61ff, 0xe63946];

  // ======================================================= 0: 24/7 SHOP
  {
    const it = room(0, '24/7 MART', 18, 14, 3.6, { floor: new THREE.MeshStandardMaterial({ map: (() => { const t = checker('#f4f4f4', '#2ec4b6'); t.repeat.set(4.5, 3.5); return t; })(), roughness: 0.5 }), wall: M(0xf6ecdc), trim: 0x2ec4b6 });
    // shelves
    const sh = M(0xdfe3ea, 0.6, { metalness: 0.2 });
    const prods = [];
    for (const z of [-0.5, 2.3, 5.0]) {
      it.add(box, sh, -2, 0.9, z, 11, 1.8, 0.55, 0, 1.8);
      for (const side of [-1, 1]) for (const y of [0.45, 0.95, 1.45]) for (let x = -7; x <= 3; x += 0.42) {
        if (Math.random() < 0.08) continue;
        prods.push({ x, y, z: z + side * 0.3, sx: 0.3, sy: 0.32, sz: 0.18 });
      }
    }
    inst(it, box, M(0xffffff, 0.6), prods, PROD);
    // fridges on the back wall
    const fr = M(0xcfd8e3, 0.4, { metalness: 0.4 }), glass = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, emissive: 0x4a9dd6, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.1 });
    const bottles = [];
    for (let x = -7; x <= 7; x += 2.4) {
      it.add(box, fr, x, 1.1, 6.6, 2.1, 2.2, 0.8, 0, 2.2);
      it.add(box, glass, x, 1.1, 6.18, 1.9, 2.0, 0.04);
      for (const y of [0.5, 1.0, 1.5]) for (let b = -0.8; b <= 0.8; b += 0.26) bottles.push({ x: x + b, y, z: 6.3, sx: 0.12, sy: 0.3, sz: 0.12 });
    }
    inst(it, cylG, M(0xffffff, 0.3), bottles, [0xff4f9a, 0x27e8ff, 0xffd166, 0x80ed99, 0xff7a3d, 0xe63946]);
    // counter + register
    it.add(box, M(0x2ec4b6, 0.5), 4, 0.55, -3.2, 5.5, 1.1, 0.9, 0, 1.1);
    it.add(box, M(0x222222, 0.4), 4, 1.16, -3.2, 5.5, 0.06, 1.0);
    it.add(box, M(0x2a2e38, 0.4), 3.2, 1.4, -3.1, 0.5, 0.4, 0.4);
    it.add(box, glow(0x37ff7a, 0.9), 3.2, 1.5, -3.34, 0.36, 0.18, 0.02);
    for (let i = 0; i < 6; i++) it.add(box, M(PROD[i], 0.5), 5.2 + (i % 3) * 0.3, 1.25 + (i > 2 ? 0.18 : 0), -3.5, 0.22, 0.16, 0.12);
    sign(it, '24/7 MART', '#27e8ff', '#101822', 0, 3.0, 6.95, 5, 1.05, Math.PI);
    sign(it, 'FRESH  •  SNACKS  •  COLD DRINKS', '#ffd166', '#1b1b24', 0, 2.65, -6.88, 6.5, 0.5, 0);
    npc(it, randomLook(Math.random, 'male'), 4, -2.4, Math.PI);
    npc(it, randomLook(Math.random, 'female'), -5, 3.6, 1.2);
    npc(it, randomLook(Math.random, 'male'), 1, 0.9, -1.4);
    it.spots.push({ x: 4, z: -4.6, r: 1.9, label: 'Press E: buy a snack  ($20  ·  +30 HP)', act: 'snack' });
  }

  // ======================================================= 1: GUN SHOP
  {
    const it = room(1, 'GUN SHOP', 16, 12, 3.6, { floor: M(0x3a3d46, 0.5), wall: M(0x30343f), trim: 0xffd166, light: 0xfff0c8 });
    // back wall rack
    it.add(box, M(0x1e2026, 0.9), 0, 1.8, 5.8, 14, 2.6, 0.2);
    const kinds = ['rifle', 'shotgun', 'smg', 'pistol', 'rifle', 'smg', 'shotgun', 'pistol'];
    kinds.forEach((k, i) => {
      const gm = makeGunMesh(k); gm.scale.setScalar(1.25);
      gm.position.set(it.cx - 6.1 + i * 1.75, 1.0 + (k === 'pistol' ? 0.5 : 0.0), it.cz + 5.62);
      gm.rotation.order = 'ZYX'; gm.rotation.set(0, Math.PI / 2, Math.PI / 2);                 // barrel up, side towards the room
      it.group.add(gm);
    });
    // glass counters
    const gl = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.35, roughness: 0.05 });
    it.add(box, M(0x15171c, 0.5), -3.2, 0.55, -1.0, 8, 1.1, 1.1, 0, 1.1);
    it.add(box, gl, -3.2, 1.3, -1.0, 7.8, 0.45, 1.0);
    it.add(box, M(0x15171c, 0.5), 2.5, 0.55, 1.0, 1.1, 1.1, 5, 0, 1.1);
    it.add(box, gl, 2.5, 1.3, 1.0, 1.0, 0.45, 4.8);
    ['pistol', 'smg', 'pistol', 'pistol'].forEach((k, i) => {
      const gm = makeGunMesh(k); gm.scale.setScalar(1.1); gm.position.set(it.cx - 6 + i * 1.8, 1.2, it.cz - 1.0); gm.rotation.y = Math.PI / 2; it.group.add(gm);
    });
    // ammo crates + target posters
    for (let i = 0; i < 4; i++) it.add(box, M(0x4a5a2a, 0.8), 6.2 - (i % 2) * 0.1, 0.3 + Math.floor(i / 2) * 0.55, -4 + (i % 2) * 0.9, 0.9, 0.5, 0.6, 0, 0.5);
    const tg = canvasTex(64, 64, (g) => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 64, 64); for (let r = 28; r > 0; r -= 7) { g.fillStyle = r % 14 ? '#d62839' : '#ffffff'; g.beginPath(); g.arc(32, 32, r, 0, 7); g.fill(); } g.fillStyle = '#111'; g.beginPath(); g.arc(32, 32, 3, 0, 7); g.fill(); });
    for (const x of [-7.9, 7.9]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: tg })); p.position.set(it.cx + x, 1.9, it.cz + 1); p.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; it.group.add(p); }
    sign(it, 'GUNS & AMMO', '#ff3d3d', '#12131a', 0, 3.0, 5.65, 5, 1.0, Math.PI);
    npc(it, Object.assign(randomLook(Math.random, 'male'), { outfit: 'jacket', hairStyle: 'cap', shirt: 0x6b705c, glasses: true }), -3.2, 0.5, Math.PI);
    it.spots.push({ x: -3.2, z: -2.5, r: 2.4, label: 'Press E: refill all ammo  ($150)', act: 'ammo' });
  }

  // ======================================================= 2: APARTMENT
  {
    const wood = canvasTex(128, 128, (g, w, h) => { for (let y = 0; y < 8; y++) { g.fillStyle = `hsl(28,${35 + Math.random() * 10}%,${42 + Math.random() * 10}%)`; g.fillRect(0, y * 16, w, 15); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, y * 16 + 15, w, 1); } }, true);
    wood.repeat.set(4, 3);
    const it = room(2, 'APARTMENT', 16, 12, 3.2, { floor: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 }), wall: M(0xe9d8c4), trim: 0xffffff, light: 0xffe2b0 });
    // rug
    const rug = canvasTex(64, 64, (g) => { g.fillStyle = '#7b61ff'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#ffd166'; g.lineWidth = 3; g.strokeRect(5, 5, 54, 54); g.strokeStyle = '#ff4f9a'; g.strokeRect(14, 14, 36, 36); });
    const rg = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshStandardMaterial({ map: rug, roughness: 1 })); rg.rotation.x = -Math.PI / 2; rg.position.set(it.cx + 4.5, 0.02, it.cz + 1.5); it.group.add(rg);
    // sofa facing the TV (east wall)
    const fab = M(0xd94f7a, 0.9);
    it.add(box, fab, 2.6, 0.3, 1.5, 1.1, 0.6, 3.4, 0, 0.9);
    it.add(box, fab, 2.2, 0.75, 1.5, 0.3, 0.8, 3.4);
    for (const dz of [-1.1, 0, 1.1]) it.add(box, M(0xe86a93, 0.9), 2.7, 0.65, 1.5 + dz, 0.8, 0.14, 1.0);
    it.add(box, M(0x3a2a22, 0.5), 5.2, 0.22, 1.5, 1.2, 0.44, 2.0, 0, 0.5);              // coffee table
    // TV (animated screen)
    it.add(box, M(0x111111, 0.4), 7.85, 0.35, 1.5, 0.5, 0.7, 3.0, 0, 0.7);
    const tv = it.add(box, new THREE.MeshBasicMaterial({ color: 0x3355ff, toneMapped: false }), 7.8, 1.55, 1.5, 0.08, 1.6, 2.8);
    it.anim.push((t) => { tv.material.color.setHSL((t * 0.15) % 1, 0.7, 0.5 + Math.sin(t * 3) * 0.1); });
    // bedroom corner
    it.add(box, M(0x6b4a2a, 0.7), -5.6, 0.25, 3.7, 3.2, 0.5, 2.3, 0, 0.55);
    it.add(box, M(0xf4f4f4, 0.9), -5.6, 0.62, 3.7, 3.0, 0.2, 2.1);
    it.add(box, M(0x2ec4b6, 0.9), -5.6, 0.74, 3.35, 3.0, 0.08, 1.4);
    for (const dx of [-0.8, 0.8]) it.add(box, M(0xffffff, 0.9), -5.6 + dx, 0.82, 4.5, 1.0, 0.18, 0.55);
    it.add(box, M(0x6b4a2a, 0.7), -7.4, 0.9, 4.5, 0.9, 1.8, 0.7, 0, 1.8);                 // wardrobe-ish
    it.add(box, M(0x5a3a22, 0.7), -3.5, 0.3, 4.9, 0.6, 0.6, 0.6, 0, 0.6);                 // nightstand
    it.add(cylG, glow(0xffd27a, 0.9), -3.5, 0.9, 4.9, 0.18, 0.3, 0.18);
    // kitchen
    it.add(box, M(0xf4f4f4, 0.5), 1.5, 0.5, 5.6, 7, 1.0, 0.8, 0, 1.0);
    it.add(box, M(0x444a55, 0.3, { metalness: 0.6 }), 1.5, 1.02, 5.6, 7, 0.05, 0.85);
    it.add(box, M(0xcfd8e3, 0.4, { metalness: 0.5 }), 6.4, 1.0, 5.5, 1.1, 2.0, 0.9, 0, 2.0);   // fridge
    // dining table + chairs
    it.add(box, M(0x8a5a30, 0.7), -2.5, 0.75, -1.8, 2.2, 0.08, 1.2, 0, 0.8);
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) it.add(box, M(0x8a5a30, 0.7), -2.5 + dx, 0.38, -1.8 + dz, 0.08, 0.76, 0.08);
    for (const dz of [-1.0, 1.0]) it.add(box, M(0x2a2e38, 0.7), -2.5, 0.45, -1.8 + dz, 0.6, 0.08, 0.5);
    // windows with sunset glow
    for (const z of [-2.5, 1.5]) { it.add(box, new THREE.MeshBasicMaterial({ color: 0xff9a6b, toneMapped: false }), -7.93, 1.8, z, 0.06, 1.5, 2.2); it.add(box, M(0xffffff, 0.5), -7.9, 1.8, z, 0.08, 1.6, 0.08); }
    // plants + art
    for (const [x, z] of [[-7, -5], [7, -5], [7.2, 3.8]]) { it.add(cylG, M(0x8a5a30, 0.8), x, 0.3, z, 0.35, 0.6, 0.35); it.add(sph, M(0x2f8f4e, 0.9), x, 0.95, z, 0.5, 0.55, 0.5); }
    const art = canvasTex(64, 48, (g) => { g.fillStyle = '#ff9a6b'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#7b61ff'; g.fillRect(0, 24, 64, 24); g.fillStyle = '#ffd166'; g.beginPath(); g.arc(32, 24, 12, 0, 7); g.fill(); });
    const ap = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshBasicMaterial({ map: art })); ap.position.set(it.cx - 1, 1.9, it.cz + 5.95); ap.rotation.y = Math.PI; it.group.add(ap);
    npc(it, Object.assign(randomLook(Math.random, 'female'), { outfit: 'dress' }), 3.6, -1.8, -1.6);
    it.spots.push({ x: -5.6, z: 1.9, r: 2.2, label: 'Press E: sleep until the next day / night', act: 'sleep' });
  }

  // ======================================================= 3: NIGHT CLUB
  {
    const it = room(3, 'CLUB NEON', 24, 18, 4.4, { floor: M(0x0e0a1a, 0.35), wall: M(0x15102a), ceil: 0x0a0716, trim: 0xff2d95, light: 0xaa66ff, music: true });
    // dance floor (animated tiles)
    const dc = document.createElement('canvas'); dc.width = dc.height = 128;
    const dg = dc.getContext('2d');
    const dtex = new THREE.CanvasTexture(dc); dtex.colorSpace = THREE.SRGBColorSpace;
    const floorM = new THREE.MeshBasicMaterial({ map: dtex, toneMapped: false });
    const df = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), floorM); df.rotation.x = -Math.PI / 2; df.position.set(it.cx + 1, 0.03, it.cz + 0.5); it.group.add(df);
    let lastTile = -1;
    it.anim.push((t) => {
      const k = Math.floor(t * 3);
      if (k === lastTile) return; lastTile = k;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { dg.fillStyle = `hsl(${(x * 30 + y * 45 + k * 70) % 360},90%,${((x + y + k) % 2) ? 52 : 24}%)`; dg.fillRect(x * 16, y * 16, 16, 16); }
      dtex.needsUpdate = true;
    });
    // neon strips on the walls
    const neon = [0xff2d95, 0x27e8ff, 0xffd166];
    neon.forEach((c, i) => {
      it.add(box, glow(c, 1.6), 0, 3.6 - i * 0.18, 8.93, 22, 0.07, 0.05);
      it.add(box, glow(c, 1.6), 11.93, 3.6 - i * 0.18, 0, 0.05, 0.07, 16);
      it.add(box, glow(c, 1.6), -11.93, 3.6 - i * 0.18, 0, 0.05, 0.07, 16);
    });
    // DJ booth + speakers
    it.add(box, M(0x1a1a24, 0.5), 1, 0.6, 7.3, 6, 1.2, 1.2, 0, 1.2);
    for (const dx of [-0.8, 0.8]) it.add(cylG, M(0x2a2a34, 0.3, { metalness: 0.6 }), 1 + dx, 1.25, 7.3, 0.4, 0.06, 0.4);
    it.add(box, glow(0xff2d95, 1.2), 1, 0.6, 6.68, 5.6, 0.1, 0.03);
    for (const x of [-4.4, 6.4]) { it.add(box, M(0x101018, 0.6), x, 1.1, 7.8, 1.3, 2.2, 1.0, 0, 2.2); it.add(cylG, M(0x333344, 0.4), x, 0.7, 7.28, 0.45, 0.05, 0.45).rotation.x = Math.PI / 2; it.add(cylG, M(0x333344, 0.4), x, 1.5, 7.28, 0.3, 0.05, 0.3).rotation.x = Math.PI / 2; }
    // bar along the west wall
    it.add(box, M(0x2a1a3a, 0.4), -9.2, 0.55, 0, 1.2, 1.1, 11, 0, 1.1);
    it.add(box, glow(0x27e8ff, 1.0), -8.58, 0.55, 0, 0.04, 0.12, 11);
    it.add(box, M(0xffffff, 0.2, { metalness: 0.2 }), -9.2, 1.12, 0, 1.3, 0.05, 11.1);
    it.add(box, M(0x1a1226, 0.7), -11.55, 1.8, 0, 0.4, 2.6, 12.5);
    const bt = [];
    for (let z = -5.2; z <= 5.2; z += 0.35) for (const y of [1.2, 1.9, 2.5]) bt.push({ x: -11.3, y, z, sx: 0.14, sy: 0.4, sz: 0.14 });
    const botIm = inst(it, cylG, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.2 }), bt, [0xff4f9a, 0x27e8ff, 0xffd166, 0x80ed99, 0xff7a3d, 0xc77dff]);
    const stools = []; for (let z = -4.5; z <= 4.6; z += 1.5) stools.push({ x: -7.7, y: 0.4, z, sx: 0.28, sy: 0.8, sz: 0.28 });
    inst(it, cylG, M(0xff2d95, 0.5), stools);
    // booths on the east wall
    for (const z of [-5, 0, 5]) { it.add(box, M(0x5a1a6a, 0.8), 10.3, 0.35, z, 1.4, 0.7, 3, 0, 0.8); it.add(box, M(0x5a1a6a, 0.8), 10.9, 0.9, z, 0.4, 1.5, 3); it.add(box, M(0x2a2a34, 0.4), 8.9, 0.4, z, 0.8, 0.08, 1.2, 0, 0.8); }
    // disco ball + spot cones
    const ballG = new THREE.Group(); ballG.position.set(it.cx + 1, 3.5, it.cz + 0.5); it.group.add(ballG);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.12, flatShading: true, emissive: 0x666677, emissiveIntensity: 0.6 }));
    ballG.add(ball);
    const rod = new THREE.Mesh(cylG, M(0x888888, 0.5)); rod.scale.set(0.02, 1.0, 0.02); rod.position.y = 0.9; ballG.add(rod);
    const cones = [];
    [0xff2d95, 0x27e8ff, 0xffd166, 0x7cfc00].forEach((c, i) => {
      const cg = new THREE.Group(); cg.position.set(it.cx + 1 + Math.cos(i * 1.57) * 4, 4.3, it.cz + 0.5 + Math.sin(i * 1.57) * 4); it.group.add(cg);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 18, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      cone.position.y = -2.1; cg.add(cone); cones.push(cg);
    });
    it.anim.push((t) => { ball.rotation.y = t * 0.8; cones.forEach((cg, i) => { cg.rotation.x = Math.sin(t * 1.3 + i * 1.7) * 0.45; cg.rotation.z = Math.cos(t * 1.1 + i * 2.1) * 0.45; }); });
    sign(it, 'CLUB NEON', '#ff2d95', '#0a0716', 1, 3.2, 8.93, 6, 1.2, Math.PI);
    // people: bartender + dancers
    npc(it, Object.assign(randomLook(Math.random, 'male'), { outfit: 'suit', shirt: 0x111111 }), -10.2, 0, Math.PI / 2);
    npc(it, Object.assign(randomLook(Math.random, 'male'), { outfit: 'tank', glasses: true }), 1, 7.3, Math.PI);
    for (let i = 0; i < 8; i++) {
      const female = i % 3 !== 0;
      const look = randomLook(Math.random, female ? 'female' : 'male');
      npc(it, look, 1 + (Math.random() - 0.5) * 7, 0.5 + (Math.random() - 0.5) * 7, Math.random() * 6, { dance: true });
    }
    it.spots.push({ x: -6.9, z: 0, r: 2.6, label: 'Press E: buy a drink  ($30  ·  +15 HP)', act: 'drink' });
  }

  // ---- per-frame
  function updateNpcs(it, dt, t) {
    for (const f of it.anim) f(t);
    for (const n of it.npcs) {
      const h = n.h, u = h.userData;
      if (n.dance) {
        const p = t * 5.5 + n.ph;
        u.upper.position.y = 0.93 + Math.abs(Math.sin(p)) * 0.04;
        u.upper.rotation.y = Math.sin(p * 0.5) * 0.45;
        u.armL.rotation.set(-2.4 + Math.sin(p) * 0.6, 0, -0.5); u.armR.rotation.set(-2.4 + Math.sin(p + Math.PI) * 0.6, 0, 0.5);
        u.foreL.rotation.x = -0.6; u.foreR.rotation.x = -0.6;
        u.legL.rotation.x = Math.sin(p) * 0.3; u.legR.rotation.x = Math.sin(p + Math.PI) * 0.3;
        u.shinL.rotation.x = Math.max(0, -Math.sin(p)) * 0.6; u.shinR.rotation.x = Math.max(0, Math.sin(p)) * 0.6;
        u.head.rotation.y = Math.sin(p * 0.5) * 0.3;
      } else {
        u.breathe += dt;
        animateHuman(h, 0, dt);
        n.g -= dt; if (n.g < 0) { u.gesture = 2.2; n.g = 5 + Math.random() * 8; }
      }
    }
  }
  function update(active, dt, t) { if (active) updateNpcs(active, dt, t); }

  return { list: interiors, update };
}
