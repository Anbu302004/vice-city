import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ======================= SMALL HELPERS =======================
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);

// rounded polygon: every corner becomes a smooth curve (radius per corner)
function roundedShape(pts, rad) {
  const s = new THREE.Shape(), n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const r = Array.isArray(rad) ? rad[i] : rad;
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k1 = Math.min(r, d1 / 2) / d1, k2 = Math.min(r, d2 / 2) / d2;
    const a = [p1[0] + (p0[0] - p1[0]) * k1, p1[1] + (p0[1] - p1[1]) * k1];
    const b = [p1[0] + (p2[0] - p1[0]) * k2, p1[1] + (p2[1] - p1[1]) * k2];
    if (i === 0) s.moveTo(a[0], a[1]); else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  s.closePath();
  return s;
}
// side profile (x = length, y = height) -> solid with rounded edges, centred, length along world Z
function extrudeSide(shape, depth, bevel, segs = 4) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 10, steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}
// inward offset of a convex polygon
function insetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
    const nx = -dy / L * sgn, ny = dx / L * sgn;
    return { x: p[0] + nx * d, y: p[1] + ny * d, dx, dy };
  });
  return lines.map((l2, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const den = l1.dx * l2.dy - l1.dy * l2.dx;
    const t = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / den;
    return [l1.x + l1.dx * t, l1.y + l1.dy * t];
  });
}
function clipX(pts, keep, lim) { // keep points with x<=lim ('max') or x>=lim ('min')
  const out = [], n = pts.length;
  const inside = (p) => (keep === 'max' ? p[0] <= lim : p[0] >= lim);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = (lim - a[0]) / (b[0] - a[0]); out.push([lim, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
function sideGlass(poly, x) { // flat window on the car's side, at lateral position x
  const g = new THREE.ShapeGeometry(roundedShape(poly, 0.05));
  g.rotateY(-Math.PI / 2); // shape x -> world +z, facing -x
  g.translate(x, 0, 0);
  return g;
}
function slopedQuad(a, b, halfW, off) { // a,b = [z,y] ends of a slanted edge ; quad spans full width
  const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy);
  let nz = dy / L, ny = -dz / L; // outward normal (pointing away from the cabin centre)
  if (nz * (a[0] > 0 ? 1 : -1) < 0) { nz = -nz; ny = -ny; }
  const v = (x, p) => [x, p[1] + ny * off, p[0] + nz * off];
  const P = [v(-halfW, a), v(halfW, a), v(halfW, b), v(-halfW, b)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

// merge every static mesh of a group that shares a material into one mesh (far fewer draw calls)
function bakeStatic(group, keep = []) {
  const buckets = new Map(), done = [];
  for (const ch of group.children) {
    if (!ch.isMesh || keep.includes(ch) || ch.material.map) continue;
    ch.updateMatrix();
    let g = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
    g.applyMatrix4(ch.matrix);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!buckets.has(ch.material)) buckets.set(ch.material, []);
    buckets.get(ch.material).push(g);
    done.push(ch);
  }
  for (const ch of done) group.remove(ch);
  for (const [mat, geos] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    group.add(m);
    geos.forEach((g) => g.dispose());
  }
}

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ======================= SHARED MATERIALS =======================
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0c1c2c, metalness: 0.6, roughness: 0.04, transparent: true, opacity: 0.78, side: THREE.DoubleSide, envMapIntensity: 1.6 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, metalness: 1, roughness: 0.12 });
const darkTrim = new THREE.MeshStandardMaterial({ color: 0x131318, roughness: 0.55, metalness: 0.2 });
const seatMat = new THREE.MeshStandardMaterial({ color: 0x23232b, roughness: 0.9 });
const discMat = new THREE.MeshStandardMaterial({ color: 0x777782, metalness: 0.9, roughness: 0.4 });
const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd8232a, roughness: 0.5 });
export const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0.5 });
const drlMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, toneMapped: false });
const revMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15 });
const indMat = new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0xff7a00, emissiveIntensity: 0.4 });

const blobTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
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
const glowTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const glowGeo = new THREE.PlaneGeometry(1, 1); glowGeo.rotateX(-Math.PI / 2);

// ======================= CAR SPECS =======================
export const SPECS = {
  sedan: {
    w: 1.9, zf: 2.4, wr: 0.38, wz: 1.45, lightY: 0.68,
    maxSpeed: 45, accel: 30, turn: 1.8,
    body: [[-2.28, 0.36], [2.28, 0.36], [2.34, 0.6], [2.24, 0.76], [1.5, 0.87], [0.85, 0.94], [-1.5, 0.94], [-2.18, 0.87], [-2.3, 0.62]],
    bodyR: [0.08, 0.08, 0.12, 0.2, 0.45, 0.3, 0.45, 0.22, 0.12],
    cabin: [[0.88, 0.92], [0.42, 1.47], [-0.85, 1.47], [-1.47, 0.92]], cabinR: [0.02, 0.22, 0.5, 0.02],
    pillar: [-0.2, -0.1], plateZ: 2.4, spoiler: false, rim: 5, rimR: 0.62,
  },
  sport: {
    w: 2.0, zf: 2.42, wr: 0.36, wz: 1.4, lightY: 0.56,
    maxSpeed: 62, accel: 42, turn: 2.1,
    body: [[-2.25, 0.3], [2.25, 0.3], [2.36, 0.48], [2.22, 0.64], [1.6, 0.73], [0.65, 0.84], [-1.3, 0.84], [-2.12, 0.84], [-2.3, 0.56]],
    bodyR: [0.08, 0.08, 0.14, 0.25, 0.6, 0.3, 0.5, 0.22, 0.14],
    cabin: [[0.7, 0.82], [0.12, 1.2], [-0.75, 1.22], [-1.4, 0.82]], cabinR: [0.02, 0.22, 0.45, 0.02],
    pillar: null, plateZ: 2.42, spoiler: true, rim: 6, rimR: 0.68,
  },
};

// ======================= WHEEL =======================
const tireCache = {};
function tireGeo(wr) {
  if (tireCache[wr]) return tireCache[wr];
  const p = [[wr * 0.66, -0.145], [wr * 0.9, -0.145], [wr * 0.985, -0.11], [wr, -0.06], [wr, 0.06], [wr * 0.985, 0.11], [wr * 0.9, 0.145], [wr * 0.66, 0.145], [wr * 0.66, -0.145]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(p, 28);
  g.rotateZ(Math.PI / 2);
  return (tireCache[wr] = g);
}
function makeWheel(S, sx, rimMat) {
  const spin = new THREE.Group();
  spin.add(new THREE.Mesh(tireGeo(S.wr), tireMat));
  const rr = S.wr * S.rimR;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.26, 20), rimMat);
  barrel.rotation.z = Math.PI / 2;
  spin.add(barrel);
  const face = sx * 0.131;
  for (let k = 0; k < S.rim; k++) {
    const sp = new THREE.Mesh(unitBox, rimMat);
    sp.scale.set(0.03, rr * 1.85, 0.07);
    sp.rotation.x = (k / S.rim) * Math.PI;
    sp.position.x = face;
    spin.add(sp);
  }
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.016, 6, 24), rimMat);
  lip.rotation.y = Math.PI / 2; lip.position.x = face;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.2, rr * 0.2, 0.05, 12), chromeMat);
  cap.rotation.z = Math.PI / 2; cap.position.x = face + sx * 0.01;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.82, rr * 0.82, 0.03, 20), discMat);
  disc.rotation.z = Math.PI / 2; disc.position.x = -sx * 0.02;
  spin.add(lip, cap, disc);
  return spin;
}

// ======================= CAR =======================
export function makeCar(color, kind = 'sedan') {
  const S = SPECS[kind];
  const car = new THREE.Group();
  const chassis = new THREE.Group();
  car.add(chassis);

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
  const rimMat = new THREE.MeshStandardMaterial({ color: kind === 'sport' ? 0x2a2a31 : 0xd8d8e0, metalness: 1, roughness: kind === 'sport' ? 0.35 : 0.22 });
  const add = (geo, mat, x, y, z, p = chassis) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };

  // ---- body + cabin ----
  const bevel = 0.07;
  chassis.add(new THREE.Mesh(extrudeSide(roundedShape(S.body, S.bodyR), S.w - bevel * 2, bevel), paint));
  const cabDepth = S.w - 0.55;
  chassis.add(new THREE.Mesh(extrudeSide(roundedShape(S.cabin, S.cabinR), cabDepth, 0.05, 3), paint));
  const cabHalf = cabDepth / 2 + 0.05;

  // ---- glass ----
  const C = S.cabin;
  const wsA = lerp2(C[0], C[1], 0.12), wsB = lerp2(C[0], C[1], 0.9);
  const rwA = lerp2(C[3], C[2], 0.12), rwB = lerp2(C[3], C[2], 0.9);
  chassis.add(new THREE.Mesh(slopedQuad(wsA, wsB, cabHalf - 0.07, 0.018), glassMat));
  chassis.add(new THREE.Mesh(slopedQuad(rwA, rwB, cabHalf - 0.07, 0.018), glassMat));
  let win = insetPoly(C, 0.07);
  win = win.map(([z, y]) => [z, Math.max(y, C[0][1] + 0.05)]);
  const wins = S.pillar ? [clipX(win, 'max', S.pillar[1]), clipX(win, 'min', S.pillar[0])] : [win];
  for (const sx of [-1, 1]) {
    for (const w of wins) {
      const m = new THREE.Mesh(sideGlass(w, -(cabHalf + 0.012)), glassMat);
      if (sx > 0) m.scale.x = -1;
      chassis.add(m);
    }
  }

  // ---- interior (seen through the glass) ----
  const sy = C[0][1], backH = (C[1][1] - sy) * 0.7;
  add(unitBox, seatMat, 0, sy + 0.08, 0.62).scale.set(cabHalf * 1.7, 0.18, 0.4);   // dash
  for (const sx of [-1, 1]) {
    add(unitBox, seatMat, sx * 0.42, sy - 0.02, -0.1).scale.set(0.5, 0.18, 0.55);
    const back = add(unitBox, seatMat, sx * 0.42, sy + backH / 2 + 0.02, -0.45); back.scale.set(0.5, backH, 0.12); back.rotation.x = -0.15;
  }
  add(unitBox, seatMat, 0, sy - 0.02, -0.95).scale.set(cabHalf * 1.7, 0.2, 0.5);
  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 18), darkTrim);
  wheelRing.position.set(0.42, sy + 0.15, 0.42); wheelRing.rotation.x = -1.0;
  chassis.add(wheelRing);

  // driver (only visible while someone sits in the car)
  const driver = new THREE.Group();
  const dt1 = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x19b5a5, roughness: 0.8 }));
  dt1.scale.set(0.4, 0.5, 0.22); dt1.position.y = 0.3;
  const dh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), new THREE.MeshStandardMaterial({ color: 0xe0b08a, roughness: 0.7 }));
  dh.position.y = 0.7;
  const dhair = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  dhair.position.set(0, 0.72, -0.01);
  const dgl = new THREE.Mesh(unitBox, darkTrim); dgl.scale.set(0.28, 0.05, 0.04); dgl.position.set(0, 0.7, 0.14);
  driver.add(dt1, dh, dhair, dgl);
  driver.position.set(0.42, C[1][1] - 0.95, -0.35);
  driver.visible = false;
  chassis.add(driver);

  // ---- panel details ----
  const half = S.w / 2;
  for (const sx of [-1, 1]) {
    const X = sx * (half + 0.003);
    const seams = S.pillar ? [0.7, -0.35, -1.3] : [0.55, -0.9];
    for (const z of seams) add(unitBox, darkTrim, X, C[0][1] - 0.18, z).scale.set(0.012, 0.42, 0.012);
    add(unitBox, darkTrim, X, C[0][1] - 0.03, -0.3).scale.set(0.012, 0.012, 2.1);                   // belt line
    for (const z of S.pillar ? [0.2, -0.75] : [0.05]) add(unitBox, chromeMat, X + sx * 0.012, C[0][1] - 0.08, z).scale.set(0.02, 0.035, 0.2); // handles
    // mirrors
    const mx = sx * (cabHalf + 0.16), my = C[0][1] + 0.12, mz = C[0][0] - 0.28;
    add(unitBox, paint, mx, my, mz).scale.set(0.2, 0.13, 0.13);
    add(unitBox, darkTrim, sx * (cabHalf + 0.04), my - 0.04, mz).scale.set(0.1, 0.03, 0.04);
    // wheel-arch openings
    const arch = new THREE.Mesh(new THREE.CircleGeometry(S.wr + 0.075, 24), darkTrim);
    arch.rotation.y = sx * Math.PI / 2;
    for (const sz of [-1, 1]) { const a = arch.clone(); a.position.set(sx * (half + 0.004), S.wr, sz * S.wz); chassis.add(a); }
    // side skirts
    add(unitBox, darkTrim, sx * (half - 0.02), S.body[0][1] + 0.02, 0).scale.set(0.09, 0.1, S.wz * 2 - 0.9);
    // indicators
    add(unitBox, indMat, sx * (half - 0.08), S.lightY - 0.06, S.zf + 0.02).scale.set(0.18, 0.05, 0.05);
  }

  // ---- front end ----
  const grille = add(unitBox, darkTrim, 0, S.lightY - 0.1, S.zf + 0.02); grille.scale.set(0.95, 0.2, 0.09);
  for (let i = 0; i < 3; i++) add(unitBox, chromeMat, 0, S.lightY - 0.17 + i * 0.07, S.zf + 0.07).scale.set(0.9, 0.012, 0.01);
  add(unitBox, darkTrim, 0, S.body[0][1] + 0.1, S.zf - 0.02).scale.set(S.w - 0.15, 0.13, 0.35);      // splitter
  add(unitBox, darkTrim, 0, S.body[0][1] + 0.12, -S.zf + 0.02).scale.set(S.w - 0.15, 0.16, 0.3);     // rear diffuser
  for (const sx of [-1, 1]) {
    const hx = sx * (half - 0.42);
    add(unitBox, darkTrim, hx, S.lightY + 0.02, S.zf - 0.02).scale.set(0.58, 0.19, 0.12);
    add(unitBox, headMat, hx, S.lightY + 0.02, S.zf + 0.04).scale.set(0.5, 0.13, 0.05);
    add(new THREE.SphereGeometry(0.06, 10, 8), chromeMat, hx - sx * 0.1, S.lightY + 0.02, S.zf + 0.07);
    add(unitBox, drlMat, hx, S.lightY + 0.12, S.zf + 0.05).scale.set(0.5, 0.025, 0.03);
    add(new THREE.CylinderGeometry(0.055, 0.06, 0.28, 10), chromeMat, sx * 0.5, S.body[0][1] + 0.08, -S.zf - 0.06).rotation.x = Math.PI / 2; // exhaust
  }
  // tail lights (own material so brake lights can glow)
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.8 });
  const tailBar = add(unitBox, tailMat, 0, S.lightY + 0.04, -S.zf - 0.01); tailBar.scale.set(S.w - 0.35, 0.11, 0.06);
  for (const sx of [-1, 1]) {
    add(unitBox, tailMat, sx * (half - 0.35), S.lightY + 0.04, -S.zf - 0.01).scale.set(0.5, 0.17, 0.07);
    add(unitBox, revMat, sx * 0.62, S.lightY - 0.13, -S.zf - 0.03).scale.set(0.12, 0.05, 0.04);
  }

  // ---- number plates ----
  const plate = canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#f4f1e6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8232a'; g.fillRect(0, 0, w, 6);
    g.fillStyle = '#151515'; g.font = 'bold 20px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('VC ' + (100 + Math.floor(Math.random() * 899)), w / 2, 20);
  });
  const plateMat = new THREE.MeshStandardMaterial({ map: plate, roughness: 0.6 });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), plateMat);
  pf.position.set(0, S.body[0][1] + 0.2, S.zf + 0.1);
  const pr = pf.clone(); pr.position.set(0, S.lightY - 0.12, -S.zf - 0.09); pr.rotation.y = Math.PI;
  chassis.add(pf, pr);

  // ---- sport extras ----
  let glow = null;
  if (S.spoiler) {
    const zr = -S.zf + 0.15, yr = S.body[5][1] + 0.22;
    add(unitBox, paint, 0, yr, zr).scale.set(S.w - 0.2, 0.05, 0.42);
    for (const sx of [-1, 1]) {
      add(unitBox, darkTrim, sx * 0.55, yr - 0.14, zr + 0.05).scale.set(0.05, 0.26, 0.1);
      add(unitBox, paint, sx * (S.w / 2 - 0.1), yr + 0.04, zr).scale.set(0.04, 0.15, 0.45);
    }
    for (const sx of [-1, 1]) add(unitBox, darkTrim, sx * 0.45, S.body[4][1] + 0.1, 1.25).scale.set(0.35, 0.02, 0.6); // hood vents
    // neon underglow
    glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff2d95, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.set(S.w + 1.8, 1, 5.6); glow.position.y = 0.08;
    car.add(glow);
  }

  // ---- wheels ----
  const spinners = [], fronts = [];
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (half - 0.1), S.wr, sz * S.wz);
    const spin = makeWheel(S, sx, rimMat);
    pivot.add(spin);
    const cal = new THREE.Mesh(unitBox, caliperMat);
    cal.scale.set(0.05, 0.16, 0.12); cal.position.set(-sx * 0.04, S.wr * 0.45, 0.05);
    pivot.add(cal);
    chassis.add(pivot);
    spinners.push(spin);
    if (sz > 0) fronts.push(pivot);
  });

  bakeStatic(chassis, [pf, pr]);
  car.add(makeBlob(S.w + 1.2, 6.2));
  car.userData = {
    speed: 0, angle: 0, steerIn: 0, steerVis: 0, spin: 0, kind, brake: false,
    maxSpeed: S.maxSpeed, accel: S.accel, turn: S.turn, spinners, fronts, wr: S.wr,
    chassis, driver, tailMat, revMat, paint, prevSpeed: 0, acc: 0, roll: 0, pitch: 0, glow, skid: 0,
  };
  return car;
}

// ======================= MOTORBIKE =======================
let _bikeTire = null;
function bikeTireGeo(wr) {
  if (_bikeTire) return _bikeTire;
  const p = [[wr * 0.72, -0.07], [wr * 0.93, -0.075], [wr * 0.99, -0.045], [wr, -0.02], [wr, 0.02], [wr * 0.99, 0.045], [wr * 0.93, 0.075], [wr * 0.72, 0.07], [wr * 0.72, -0.07]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(p, 28);
  g.rotateZ(Math.PI / 2);
  return (_bikeTire = g);
}
function bikeWheel(wr, rimMat) {
  const spin = new THREE.Group();
  spin.add(new THREE.Mesh(bikeTireGeo(wr), tireMat));
  const rr = wr * 0.7;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.018, 6, 24), rimMat);
  lip.rotation.y = Math.PI / 2;
  spin.add(lip);
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.Mesh(unitBox, rimMat);
    sp.scale.set(0.025, rr * 1.9, 0.045);
    sp.rotation.x = (k / 5) * Math.PI;
    spin.add(sp);
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.62, rr * 0.62, 0.012, 20), discMat);
  disc.rotation.z = Math.PI / 2; disc.position.x = 0.05;
  spin.add(disc);
  return spin;
}

export function makeBike(color = 0xe63946) {
  const WR = 0.36, ZF = 0.82, ZR = -0.78;
  const bike = new THREE.Group();
  const chassis = new THREE.Group();
  bike.add(chassis);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcfcfd8, metalness: 1, roughness: 0.25 });
  const add = (geo, m, x, y, z, p = chassis) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); p.add(me); return me; };
  const cyl = (r, len) => new THREE.CylinderGeometry(r, r, len, 10);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.8 });
  const revMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15 });

  // front end: fork + wheel + bars + headlight (all steer together)
  const front = new THREE.Group();
  front.position.set(0, WR, ZF);
  chassis.add(front);
  const fSpin = bikeWheel(WR, rimMat);
  front.add(fSpin);
  for (const sx of [-1, 1]) {
    const tube = add(cyl(0.028, 0.78), chromeMat, sx * 0.1, 0.4, -0.12, front);
    tube.rotation.x = -0.32;
    add(cyl(0.04, 0.3), chromeMat, sx * 0.1, 0.62, -0.2, front).rotation.x = -0.32;
  }
  add(cyl(0.018, 0.78), chromeMat, 0, 0.78, -0.27, front).rotation.z = Math.PI / 2;               // handlebar
  for (const sx of [-1, 1]) {
    add(cyl(0.022, 0.12), darkTrim, sx * 0.36, 0.78, -0.27, front).rotation.z = Math.PI / 2;     // grips
    add(unitBox, chromeMat, sx * 0.3, 0.88, -0.2, front).scale.set(0.1, 0.07, 0.015);              // mirrors
  }
  const fairing = add(unitBox, paint, 0, 0.66, 0.05, front);
  fairing.scale.set(0.34, 0.3, 0.3); fairing.rotation.x = -0.3;
  add(new THREE.SphereGeometry(0.11, 12, 8), headMat, 0, 0.68, 0.22, front).scale.set(1.05, 0.9, 0.7);
  const screen = add(unitBox, glassMat, 0, 0.9, -0.02, front);
  screen.scale.set(0.3, 0.2, 0.012); screen.rotation.x = -0.55;
  add(unitBox, paint, 0, WR + 0.1, 0.0, front).scale.set(0.16, 0.025, 0.4);                         // front mudguard

  // body
  add(new THREE.CapsuleGeometry(0.17, 0.4, 5, 10), paint, 0, 0.93, 0.27).rotation.x = Math.PI / 2 - 0.1;   // tank
  chassis.children[chassis.children.length - 1].scale.set(1, 1, 0.8);
  add(unitBox, seatMat, 0, 0.84, -0.3).scale.set(0.26, 0.09, 0.6);                                   // seat
  const cowl = add(unitBox, paint, 0, 0.92, -0.78); cowl.scale.set(0.24, 0.16, 0.5); cowl.rotation.x = 0.18;
  add(unitBox, paint, 0, 0.62, -0.7).scale.set(0.2, 0.05, 0.6);                                       // rear fender
  add(unitBox, darkTrim, 0, 0.5, 0.0).scale.set(0.3, 0.38, 0.55);                                     // engine
  add(unitBox, discMat, 0, 0.43, 0.02).scale.set(0.32, 0.12, 0.4);
  for (const sx of [-1, 1]) {
    add(cyl(0.05, 0.95), chromeMat, sx * 0.2, 0.34, -0.55).rotation.x = Math.PI / 2;               // exhausts
    add(cyl(0.065, 0.2), darkTrim, sx * 0.2, 0.36, -1.05).rotation.x = Math.PI / 2;
    add(unitBox, darkTrim, sx * 0.1, WR + 0.02, ZR + 0.35).scale.set(0.045, 0.045, 0.78);            // swing arm
  }
  add(unitBox, tailMat, 0, 0.84, -1.04).scale.set(0.2, 0.07, 0.05);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.13), new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.6 }));
  plate.position.set(0, 0.74, -1.065); plate.rotation.y = Math.PI;
  chassis.add(plate);

  // rear wheel
  const rear = new THREE.Group();
  rear.position.set(0, WR, ZR);
  chassis.add(rear);
  const rSpin = bikeWheel(WR, rimMat);
  rear.add(rSpin);

  // rider (only visible while somebody is on the bike)
  const driver = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.7 });
  const skinM = new THREE.MeshStandardMaterial({ color: 0xe0b08a, roughness: 0.7 });
  const helm = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f4, roughness: 0.25, clearcoat: 1 });
  const torso = add(new THREE.CapsuleGeometry(0.16, 0.34, 4, 8), suit, 0, 1.25, -0.2, driver);
  torso.rotation.x = 0.5; torso.scale.set(1.2, 1, 0.8);
  add(new THREE.SphereGeometry(0.15, 14, 10), helm, 0, 1.56, 0.0, driver);
  add(unitBox, glassMat, 0, 1.56, 0.12, driver).scale.set(0.2, 0.07, 0.06);
  for (const sx of [-1, 1]) {
    const upper = add(new THREE.CapsuleGeometry(0.045, 0.3, 3, 6), suit, sx * 0.24, 1.3, 0.02, driver);
    upper.rotation.x = 1.0;
    add(new THREE.CapsuleGeometry(0.04, 0.25, 3, 6), suit, sx * 0.28, 1.16, 0.26, driver).rotation.x = 1.15;
    add(new THREE.SphereGeometry(0.045, 8, 6), skinM, sx * 0.3, 1.12, 0.37, driver);
    const th = add(new THREE.CapsuleGeometry(0.07, 0.34, 3, 6), suit, sx * 0.2, 0.92, -0.05, driver);
    th.rotation.x = 1.25;
    const sh = add(new THREE.CapsuleGeometry(0.055, 0.34, 3, 6), suit, sx * 0.21, 0.58, 0.28, driver);
    sh.rotation.x = -0.2;
    add(unitBox, darkTrim, sx * 0.21, 0.36, 0.36, driver).scale.set(0.1, 0.07, 0.26);
  }
  driver.visible = false;
  chassis.add(driver);

  bakeStatic(chassis, [plate]);
  bike.add(makeBlob(1.0, 2.8));
  bike.userData = {
    speed: 0, angle: 0, steerIn: 0, steerVis: 0, spin: 0, kind: 'bike', brake: false, lean: 0,
    maxSpeed: 58, accel: 40, turn: 2.9, spinners: [fSpin, rSpin], fronts: [front], wr: WR,
    chassis, driver, tailMat, revMat, paint, prevSpeed: 0, acc: 0, roll: 0, pitch: 0, glow: null, skid: 0,
  };
  return bike;
}

// body pitch / roll, brake lights, reverse lights - call every frame for every car
export function updateCarVisuals(car, dt, night) {
  const d = car.userData;
  const a = (d.speed - d.prevSpeed) / Math.max(dt, 1e-3);
  d.prevSpeed = d.speed;
  d.acc += (THREE.MathUtils.clamp(a, -60, 60) - d.acc) * Math.min(1, 6 * dt);
  const tp = THREE.MathUtils.clamp(-d.acc * 0.0011, -0.05, 0.06);
  const tr = THREE.MathUtils.clamp((d.steerIn || 0) * Math.abs(d.speed) * 0.0017, -0.07, 0.07) * Math.sign(d.speed || 1);
  d.pitch += (tp - d.pitch) * Math.min(1, 7 * dt);
  d.roll += (tr - d.roll) * Math.min(1, 7 * dt);
  d.chassis.rotation.x = d.pitch;
  d.chassis.rotation.z = d.roll;
  d.chassis.position.y = Math.abs(d.pitch) * 0.1;
  const braking = d.brake || d.acc < -14;
  d.tailMat.emissiveIntensity = braking ? 5 : night ? 1.8 : 0.8;
  d.revMat.emissiveIntensity = d.speed < -0.5 ? 3 : 0.15;
}

// ======================= TYRE SMOKE =======================
export function makeSmoke(scene) {
  const mat0 = new THREE.SpriteMaterial({ map: glowTex, color: 0xdddddd, transparent: true, depthWrite: false, opacity: 0 });
  const pool = [];
  for (let i = 0; i < 60; i++) {
    const s = new THREE.Sprite(mat0.clone());
    s.visible = false;
    s.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0 };
    scene.add(s);
    pool.push(s);
  }
  let k = 0;
  return {
    emit(x, y, z) {
      const s = pool[k++ % pool.length];
      s.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      s.userData.life = s.userData.max = 0.7 + Math.random() * 0.5;
      s.userData.vx = (Math.random() - 0.5) * 1.2; s.userData.vz = (Math.random() - 0.5) * 1.2; s.userData.vy = 0.8 + Math.random() * 0.8;
      s.scale.setScalar(0.7);
      s.visible = true;
    },
    update(dt) {
      for (const s of pool) {
        if (!s.visible) continue;
        const u = s.userData;
        u.life -= dt;
        if (u.life <= 0) { s.visible = false; continue; }
        const t = 1 - u.life / u.max;
        s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
        s.scale.setScalar(0.7 + t * 3.2);
        s.material.opacity = (1 - t) * 0.5;
      }
    },
  };
}

// ======================= SPEEDBOAT =======================
export function makeBoat(color = 0xf5f5f5, stripe = 0xff2d95) {
  const boat = new THREE.Group();
  const hullPivot = new THREE.Group();
  boat.add(hullPivot);
  const hullMat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.2, roughness: 0.25, clearcoat: 1 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.4, emissive: stripe, emissiveIntensity: 0.15 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.85 });
  const add = (geo, mat, x, y, z, p = hullPivot) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };

  // hull: plan outline (x width, y length with bow at -y) extruded upward
  const plan = [[-1.05, 2.7], [1.05, 2.7], [1.1, 0.2], [0.8, -2.0], [0, -3.5], [-0.8, -2.0], [-1.1, 0.2]];
  const hullGeo = new THREE.ExtrudeGeometry(roundedShape(plan, [0.15, 0.15, 0.6, 0.9, 0.3, 0.9, 0.6]), { depth: 0.8, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3, curveSegments: 10 });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, -0.35, 0);
  hullPivot.add(new THREE.Mesh(hullGeo, hullMat));
  // coloured stripe around the hull
  const stripeGeo = new THREE.ExtrudeGeometry(roundedShape(plan.map(([x, y]) => [x * 1.012, y]), [0.15, 0.15, 0.6, 0.9, 0.3, 0.9, 0.6]), { depth: 0.12, bevelEnabled: false, curveSegments: 10 });
  stripeGeo.rotateX(-Math.PI / 2); stripeGeo.translate(0, 0.2, 0);
  hullPivot.add(new THREE.Mesh(stripeGeo, stripeMat));
  // deck
  const deck = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(plan.map(([x, y]) => [x * 0.9, y * 0.93]), [0.15, 0.15, 0.6, 0.9, 0.3, 0.9, 0.6]), { depth: 0.05, bevelEnabled: false, curveSegments: 10 }), deckMat);
  deck.geometry.rotateX(-Math.PI / 2); deck.position.y = 0.52;
  hullPivot.add(deck);
  // cockpit: windshield, seats, console
  const ws = new THREE.Mesh(slopedQuad([0.6, 0.55], [0.25, 1.15], 0.8, 0.02), glassMat);
  hullPivot.add(ws);
  add(unitBox, darkTrim, 0, 0.8, 0.95).scale.set(1.6, 0.5, 0.35);
  add(unitBox, seatMat, 0, 0.78, -0.4).scale.set(1.5, 0.25, 0.6);
  add(unitBox, seatMat, 0, 1.0, -0.72).scale.set(1.5, 0.4, 0.14);
  add(unitBox, hullMat, 0, 0.66, -1.9).scale.set(1.5, 0.28, 0.9);
  // bow rail + outboard motor
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), chromeMat, 0, 0.8, 2.3);
  const motor = add(unitBox, darkTrim, 0, 0.55, -2.85); motor.scale.set(0.4, 0.9, 0.5);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), chromeMat, 0, -0.2, -2.95);
  const prop = add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), chromeMat, 0, -0.55, -2.95); prop.rotation.x = Math.PI / 2;
  // driver
  const driver = new THREE.Group();
  const t1 = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x19b5a5 })); t1.scale.set(0.4, 0.5, 0.22); t1.position.y = 0.3;
  const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe0b08a })); h1.position.y = 0.7;
  driver.add(t1, h1); driver.position.set(0.4, 0.9, -0.1); driver.visible = false;
  hullPivot.add(driver);
  // nav lights
  add(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0.95, 0.7, 1.4);
  add(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0x20ff40 }), -0.95, 0.7, 1.4);

  bakeStatic(hullPivot, [prop]);

  // wake: two translucent trails behind the boat
  const wakeMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const wake = new THREE.Group();
  const w1 = new THREE.Mesh(glowGeo, wakeMat), w2 = new THREE.Mesh(glowGeo, wakeMat);
  w1.scale.set(2.2, 1, 12); w2.scale.set(5, 1, 14);
  w1.position.set(0, 0.0, -9); w2.position.set(0, 0.0, -12);
  wake.add(w1, w2);
  wake.position.y = 0.02;
  boat.add(wake);

  boat.userData = {
    speed: 0, angle: 0, steerIn: 0, kind: 'boat', maxSpeed: 40, accel: 20, turn: 1.25,
    hullPivot, driver, wake, wakeMat, prop, bob: Math.random() * 6, roll: 0, pitch: 0, prevSpeed: 0, acc: 0, brake: false,
  };
  return boat;
}
