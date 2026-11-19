import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Articulated humans: hips, torso, neck, head, shoulders+elbows, hips+knees,
// hands and shoes. Geometry and materials are shared between all people, so a
// crowd of 100 only costs ~14 meshes each and almost no memory.
// ---------------------------------------------------------------------------

const matCache = new Map();
function mat(hex, rough = 0.85, extra) {
  const key = hex + '_' + rough + (extra ? JSON.stringify(Object.keys(extra)) : '');
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, ...(extra || {}) }); matCache.set(key, m); }
  return m;
}

const geoCache = new Map();
function cap(r, len, rs = 5, hs = 8) {
  const key = 'c' + r + '_' + len;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CapsuleGeometry(r, len, rs, hs));
  return geoCache.get(key);
}
const sphere = new THREE.SphereGeometry(1, 14, 10);
const box = new THREE.BoxGeometry(1, 1, 1);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const floral = canvasTex(64, 64, (g) => {
  g.fillStyle = '#19b5a5'; g.fillRect(0, 0, 64, 64);
  const cols = ['#ff4f9a', '#ffd166', '#ffffff', '#ff7a3d'];
  for (let i = 0; i < 26; i++) {
    g.fillStyle = cols[i % 4];
    g.beginPath(); g.arc(Math.random() * 64, Math.random() * 64, 2.5 + Math.random() * 3.5, 0, 7); g.fill();
  }
});
const floralMat = new THREE.MeshStandardMaterial({ map: floral, roughness: 0.8 });

const OUTFITS = ['tee', 'jacket', 'dress', 'shorts', 'suit', 'tank'];

/**
 * o = { skin, shirt, pants, hair, shoe, glasses, floral, outfit, hairStyle, female, height }
 */
export function makeHuman(o) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const outfit = o.outfit || 'tee';
  const female = !!o.female;
  const H = o.height || 1;

  const skin = mat(o.skin, 0.72);
  const shirt = o.floral ? floralMat : mat(o.shirt ?? 0xffffff, 0.85);
  const pantsHex = o.pants ?? 0x2b3a67;
  const pants = mat(pantsHex, 0.9);
  const hairM = mat(o.hair ?? 0x151515, 0.8);
  const shoeM = mat(o.shoe ?? 0x1c1c1f, 0.6);
  const black = mat(0x111111, 0.5);
  const white = mat(0xf4f4f4, 0.5);

  const part = (geo, m, p, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.scale.set(sx, sy, sz);
    p.add(me);
    return me;
  };

  // --- upper body (twists / bobs while walking) -----------------------------
  const upper = new THREE.Group();
  upper.position.y = 0.93;
  g.add(upper);

  const sw = female ? 0.86 : 1;          // shoulder width factor
  part(box, mat(pantsHex, 0.9), upper, 0, 0.02, 0, female ? 0.34 : 0.32, 0.16, 0.21);           // pelvis
  part(cap(0.17, 0.26), shirt, upper, 0, 0.3, 0, 1.28 * sw, 1, 0.78);                           // chest
  if (outfit === 'suit' || outfit === 'jacket') {
    part(box, outfit === 'suit' ? white : shirt, upper, 0, 0.36, 0.145, 0.1, 0.34, 0.02);        // shirt / zip line
  }
  if (outfit === 'tank') part(box, skin, upper, 0, 0.5, 0, 0.18, 0.05, 0.2);
  part(cap(0.045, 0.04, 3, 6), skin, upper, 0, 0.62, 0);                                          // neck
  const head = new THREE.Group();
  head.position.set(0, 0.76, 0);
  upper.add(head);
  part(sphere, skin, head, 0, 0, 0, 0.105, 0.125, 0.115);                                         // skull
  part(box, skin, head, 0, -0.01, 0.112, 0.022, 0.045, 0.03);                                     // nose
  part(sphere, black, head, -0.04, 0.02, 0.1, 0.012, 0.012, 0.012);                               // eyes
  part(sphere, black, head, 0.04, 0.02, 0.1, 0.012, 0.012, 0.012);
  part(box, mat(0x7a3a3a, 0.6), head, 0, -0.065, 0.098, 0.04, 0.008, 0.01);                      // mouth
  part(sphere, skin, head, -0.108, 0, 0, 0.018, 0.03, 0.02);                                      // ears
  part(sphere, skin, head, 0.108, 0, 0, 0.018, 0.03, 0.02);
  if (o.glasses) {
    part(box, mat(0x0a0a0a, 0.2, { metalness: 0.7 }), head, 0, 0.022, 0.108, 0.108, 0.04, 0.02);
  }
  const hs = o.hairStyle || (female ? 'long' : 'short');
  if (hs === 'short' || hs === 'cap') {
    part(sphere, hairM, head, 0, 0.035, -0.01, 0.112, 0.105, 0.122);
  } else if (hs === 'long') {
    part(sphere, hairM, head, 0, 0.03, -0.012, 0.115, 0.115, 0.128);
    part(cap(0.075, 0.2, 3, 6), hairM, head, 0, -0.14, -0.075, 1.2, 1, 0.7);
  } else if (hs === 'afro') {
    part(sphere, hairM, head, 0, 0.05, -0.01, 0.15, 0.15, 0.15);
  } else if (hs === 'bun') {
    part(sphere, hairM, head, 0, 0.035, -0.01, 0.112, 0.105, 0.122);
    part(sphere, hairM, head, 0, 0.16, -0.03, 0.05, 0.05, 0.05);
  }
  if (hs === 'cap') {
    const capC = mat(o.shirt ?? 0xd62839, 0.7);
    part(sphere, capC, head, 0, 0.055, -0.005, 0.118, 0.085, 0.128);
    part(box, capC, head, 0, 0.03, 0.115, 0.14, 0.015, 0.1);
  }
  if (o.hat === 'cop') {
    const navy = mat(0x14213d, 0.7);
    part(sphere, navy, head, 0, 0.07, -0.005, 0.122, 0.07, 0.132);
    part(box, black, head, 0, 0.04, 0.12, 0.15, 0.012, 0.08);
  }

  // --- arms -------------------------------------------------------------------
  const sleeveShort = outfit === 'tee' || outfit === 'dress' || o.floral;
  const armM = outfit === 'tank' ? skin : shirt;
  const arm = (sx) => {
    const sh = new THREE.Group();                                   // shoulder pivot
    sh.position.set(sx * 0.225 * sw, 0.5, 0);
    upper.add(sh);
    part(sphere, armM, sh, 0, 0, 0, 0.058, 0.058, 0.058);
    part(cap(0.047, 0.17), armM, sh, 0, -0.14, 0);                  // upper arm
    const el = new THREE.Group();                                   // elbow pivot
    el.position.set(0, -0.285, 0);
    sh.add(el);
    part(sphere, sleeveShort ? skin : armM, el, 0, 0, 0, 0.042, 0.042, 0.042);
    part(cap(0.04, 0.17), sleeveShort ? skin : armM, el, 0, -0.14, 0);   // forearm
    part(sphere, skin, el, 0, -0.3, 0.005, 0.042, 0.05, 0.034);     // hand
    return { sh, el };
  };
  const aL = arm(1), aR = arm(-1);

  // --- legs -------------------------------------------------------------------
  const shortsLeg = outfit === 'shorts';
  const leg = (sx) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.095, 0.93, 0);
    g.add(hip);
    part(cap(0.072, 0.3), pants, hip, 0, -0.22, 0);                  // thigh
    const kn = new THREE.Group();
    kn.position.set(0, -0.44, 0);
    hip.add(kn);
    part(sphere, shortsLeg ? skin : pants, kn, 0, 0, 0, 0.062, 0.062, 0.062);
    part(cap(0.058, 0.28), shortsLeg ? skin : pants, kn, 0, -0.23, 0);   // shin
    part(box, shoeM, kn, 0, -0.45, 0.045, 0.105, 0.075, 0.27);      // shoe
    part(box, white, kn, 0, -0.485, 0.045, 0.11, 0.015, 0.275);      // sole
    return { hip, kn };
  };
  const lL = leg(1), lR = leg(-1);

  if (outfit === 'dress' || (female && o.skirt)) {                  // skirt cone
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.42, 12, 1, true), outfit === 'dress' ? shirt : pants);
    sk.material = (outfit === 'dress' ? shirt : pants);
    sk.position.set(0, -0.2, 0);
    sk.scale.set(1, 1, 0.8);
    upper.add(sk);
  }

  g.scale.setScalar(H);
  g.userData = {
    upper, head, armL: aL.sh, armR: aR.sh, foreL: aL.el, foreR: aR.el,
    legL: lL.hip, legR: lR.hip, shinL: lL.kn, shinR: lR.kn,
    ph: Math.random() * 6.28, gesture: 0, gPh: Math.random() * 6, atk: 0, atkMax: 0, atkKind: '',
    breathe: Math.random() * 6, H,
  };
  return g;
}

const _t = { v: 0 };
/**
 * speed: ground speed in m/s (0 = idle). dt: seconds.
 */
export function animateHuman(h, speed, dt) {
  const u = h.userData;
  u.breathe += dt;
  const run = THREE.MathUtils.clamp((speed - 3.2) / 4, 0, 1);       // 0 = walking, 1 = running
  const gait = THREE.MathUtils.clamp(speed / 1.6, 0, 1);            // 0 = standing
  u.ph += speed * dt * (2.5 - run * 0.5);
  const amp = gait * (0.52 + run * 0.62);
  const s = Math.sin(u.ph), c = Math.cos(u.ph);
  const s2 = Math.sin(u.ph + Math.PI), c2 = Math.cos(u.ph + Math.PI);

  // legs: thigh swings, knee only bends while the leg swings forward
  u.legL.rotation.x = s * amp;
  u.legR.rotation.x = s2 * amp;
  u.shinL.rotation.x = Math.max(0, -c) * amp * 1.15 + run * 0.35 * gait + (1 - gait) * 0;
  u.shinR.rotation.x = Math.max(0, -c2) * amp * 1.15 + run * 0.35 * gait;

  // arms swing against the legs, elbows bend more when running
  u.armL.rotation.x = -s * amp * 0.85;
  u.armR.rotation.x = -s2 * amp * 0.85;
  u.armL.rotation.z = -0.07; u.armR.rotation.z = 0.07;
  const elbow = -(0.12 + gait * 0.25 + run * 1.0);
  u.foreL.rotation.x = elbow - Math.max(0, s) * amp * 0.25;
  u.foreR.rotation.x = elbow - Math.max(0, s2) * amp * 0.25;

  // torso: twist, bob, lean forward when running, breathing when idle
  u.upper.rotation.y = s * amp * 0.16;
  u.upper.rotation.x = run * 0.2 * gait;
  u.upper.position.y = 0.93 + Math.abs(c) * amp * 0.035 + Math.sin(u.breathe * 1.8) * 0.004 * (1 - gait);
  u.head.rotation.y = -s * amp * 0.1 + Math.sin(u.breathe * 0.6 + u.gPh) * 0.12 * (1 - gait);
  u.head.rotation.x = -run * 0.15;

  // talking / waving gesture while standing
  if (u.gesture > 0) {
    u.gesture -= dt;
    const w = Math.sin(u.breathe * 7 + u.gPh);
    u.armR.rotation.x = -1.2 + w * 0.25; u.foreR.rotation.x = -0.9 + w * 0.45;
    u.armR.rotation.z = 0.25;
  }

  // punch / kick animation overrides the walk cycle
  if (u.atk > 0) {
    u.atk -= dt;
    const k = Math.sin(Math.min(1, 1 - Math.max(u.atk, 0) / u.atkMax) * Math.PI);
    if (u.atkKind === 'kick') {
      u.legR.rotation.x = -1.5 * k; u.shinR.rotation.x = 0.2 * k;
      u.armL.rotation.x = 0.8 * k; u.upper.rotation.x = -0.15 * k;
    } else {
      u.armR.rotation.x = -1.6 * k; u.foreR.rotation.x = -0.15;
      u.armL.rotation.x = 0.5 * k; u.foreL.rotation.x = -1.2 * k;
      u.upper.rotation.y = -0.45 * k; h.rotation.x = 0.1 * k;
    }
  } else if (u.atkKind) { u.atkKind = ''; h.rotation.x = 0; }
}

export function startAttack(h, kind) {
  const u = h.userData;
  u.atkKind = kind;
  u.atk = u.atkMax = kind === 'kick' ? 0.45 : 0.3;
}

// random pedestrian look (uses the caller's rng so the world stays deterministic)
const SKIN = [0xf2c9a0, 0xd9a273, 0xa8734a, 0x7a4e2d, 0xffdbb5, 0x5c3a24];
const SHIRTS = [0xff5d8f, 0x2ec4b6, 0xffd166, 0xffffff, 0x7b61ff, 0xff9f1c, 0xe63946, 0x4cc9f0, 0x80ed99, 0x222222];
const PANTS = [0xf2e8d5, 0x2b3a67, 0x222222, 0x8d6e63, 0xffffff, 0x3a506b, 0x6b705c];
const HAIRS = [0x151515, 0x3a2616, 0x7a4b1f, 0xd9b36c, 0x8a8a8a, 0xb5451b];
const SHOES = [0x1c1c1f, 0xffffff, 0xd62839, 0x2d6a4f, 0x8a5a2b];
const HAIRSTYLES_M = ['short', 'short', 'short', 'cap', 'afro'];
const HAIRSTYLES_F = ['long', 'long', 'bun', 'short'];
export function randomLook(rand, kind = 'any') {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const female = kind === 'female' ? true : kind === 'male' ? false : rand() < 0.5;
  const outfit = female ? pick(['tee', 'dress', 'dress', 'tank', 'shorts', 'jacket']) : pick(['tee', 'tee', 'jacket', 'shorts', 'suit', 'tank']);
  return {
    skin: pick(SKIN), shirt: pick(SHIRTS), pants: outfit === 'suit' ? 0x1b1b24 : pick(PANTS), hair: pick(HAIRS),
    shoe: pick(SHOES), glasses: rand() < 0.22, female, outfit,
    hairStyle: pick(female ? HAIRSTYLES_F : HAIRSTYLES_M), height: 0.93 + rand() * 0.14, floral: rand() < 0.08,
  };
}
