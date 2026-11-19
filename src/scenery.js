import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Scenery that makes the world feel lived in: beach life, boardwalk, street
// furniture, shop fronts with awnings, rooftop clutter, clouds and seagulls.
// ---------------------------------------------------------------------------

export function buildScenery(ctx) {
  const { scene, rand, CELL, GRID, LAND, PIER, canvasTex, blocks, bldgs, lit, islandDist } = ctx;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const shadowCasters = [];

  function instanced(geo, mat, items, { cast = true, receive = false, colors = null } = {}) {
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y || 0, it.z);
      dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      dummy.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (colors) { col.setHex(colors[i % colors.length]); m.setColorAt(i, col); }
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = cast; m.receiveShadow = receive;
    m.frustumCulled = items.length < 6;
    scene.add(m);
    return m;
  }
  const M = (color, rough = 0.85, extra) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...(extra || {}) });
  const box = new THREE.BoxGeometry(1, 1, 1);

  // random spot on the beach strip (between the promenade and the waterline)
  function beachSpot(minD = -34, maxD = -6) {
    for (let k = 0; k < 60; k++) {
      const x = (rand() * 2 - 1) * LAND, z = (rand() * 2 - 1) * LAND;
      const d = islandDist(x, z);
      if (d < minD || d > maxD) continue;
      if (Math.max(Math.abs(x), Math.abs(z)) < 322) continue;               // keep clear of the promenade
      if (x > 0 && Math.abs(z - PIER.z) < 22) continue;                     // and of the pier
      return { x, z, d };
    }
    return null;
  }
  const faceSea = (x, z) => Math.atan2(x, z);                               // yaw pointing away from the island centre

  // ============================ BEACH ==========================================
  // umbrellas + loungers + towels
  const umbrellaTex = canvasTex(128, 32, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ffffff'; g.fillRect(i * 16, 0, 16, h); }
    for (let i = 0; i < 8; i += 2) { g.fillStyle = 'rgba(0,0,0,.0)'; }
  }, true);
  const canopyGeo = new THREE.ConeGeometry(1.9, 0.7, 12, 1, true); canopyGeo.translate(0, 2.55, 0);
  const poleG = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6); poleG.translate(0, 1.3, 0);
  const umbrellas = [], loungers = [], towels = [];
  for (let i = 0; i < 90; i++) {
    const s = beachSpot(-30, -4); if (!s) continue;
    const ry = faceSea(s.x, s.z) + (rand() - 0.5) * 0.4;
    umbrellas.push({ x: s.x, y: -0.2, z: s.z, ry: rand() * 6, rz: (rand() - 0.5) * 0.12, sx: 1.4, sy: 1.4, sz: 1.4 });
    const ox = Math.cos(ry), oz = -Math.sin(ry);
    for (const side of [-1, 1]) {
      if (rand() < 0.75) loungers.push({ x: s.x + ox * 1.1 * side - Math.sin(ry) * 0.2, y: -0.12, z: s.z + oz * 1.1 * side - Math.cos(ry) * 0.2, ry });
    }
    if (rand() < 0.5) towels.push({ x: s.x + Math.sin(ry) * 2.6 + (rand() - 0.5), y: -0.19, z: s.z + Math.cos(ry) * 2.6 + (rand() - 0.5), ry: rand() * 3 });
  }
  const TOWELC = [0xff4f9a, 0x27e8ff, 0xffd166, 0xffffff, 0x7b61ff, 0x80ed99];
  instanced(poleG, M(0xe8e8e8, 0.5), umbrellas);
  instanced(canopyGeo, M(0xffffff, 0.8, { side: THREE.DoubleSide }), umbrellas, { colors: [0xff3d6e, 0x27c8e8, 0xffd166, 0x7cfc00, 0xff8a3d, 0xc77dff] });
  instanced(box, M(0xf4efe6, 0.85), loungers.map((l) => ({ ...l, sx: 0.62, sy: 0.07, sz: 1.9 })), { colors: [0xf4efe6, 0x9ad7ff, 0xffd1dc] });
  instanced(box, M(0xffffff, 0.95), towels.map((t) => ({ ...t, sx: 0.9, sy: 0.012, sz: 1.7 })), { cast: false, colors: TOWELC });

  // beach rocks
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rpos = rockGeo.attributes.position;
  for (let i = 0; i < rpos.count; i++) {                                    // lumpy rocks
    const k = 0.78 + Math.abs(Math.sin(rpos.getX(i) * 7.1 + rpos.getZ(i) * 5.3)) * 0.4;
    rpos.setXYZ(i, rpos.getX(i) * k, rpos.getY(i) * k * 0.7, rpos.getZ(i) * k);
  }
  rockGeo.computeVertexNormals();
  const rocks = [];
  for (let i = 0; i < 46; i++) {
    const s = beachSpot(-8, 7); if (!s) continue;
    const sc = 0.5 + rand() * 1.6;
    rocks.push({ x: s.x, y: -0.35 + sc * 0.1, z: s.z, ry: rand() * 6, sx: sc * (1 + rand() * 0.5), sy: sc * (0.6 + rand() * 0.5), sz: sc });
    if (rand() < 0.5) rocks.push({ x: s.x + 1.2, y: -0.4, z: s.z + 0.8, ry: rand() * 6, sx: sc * 0.5, sy: sc * 0.4, sz: sc * 0.5 });
  }
  instanced(rockGeo, M(0x6f6a64, 0.95), rocks, { colors: [0x6f6a64, 0x8a8277, 0x5a5650, 0x7d7468] });

  // lifeguard towers
  const lg = [];
  for (let i = 0; i < 4; i++) { const s = beachSpot(-26, -14); if (s) lg.push(s); }
  const stripe = canvasTex(64, 64, (g) => { for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d62839'; g.fillRect(0, i * 16, 64, 16); } });
  for (const s of lg) {
    const g = new THREE.Group();
    const wood = M(0xdcdcdc, 0.8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), wood);
      leg.position.set(sx * 0.8, 1.0, sz * 0.8); g.add(leg);
    }
    const deck = new THREE.Mesh(box, wood); deck.scale.set(2.2, 0.12, 2.2); deck.position.y = 2.25; g.add(deck);
    const hut = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7 })); hut.scale.set(1.6, 1.5, 1.6); hut.position.y = 3.05; g.add(hut);
    const roof = new THREE.Mesh(box, M(0xd62839, 0.7)); roof.scale.set(2.0, 0.14, 2.0); roof.position.y = 3.85; g.add(roof);
    const win = new THREE.Mesh(box, M(0x24344f, 0.2, { metalness: 0.6 })); win.scale.set(1.2, 0.6, 0.05); win.position.set(0, 3.15, 0.82); g.add(win);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), wood); pole.position.set(0.95, 4.5, 0.9); g.add(pole);
    const flag = new THREE.Mesh(box, M(0xff3d3d, 0.8)); flag.scale.set(0.7, 0.4, 0.02); flag.position.set(1.3, 5.3, 0.9); g.add(flag);
    g.position.set(s.x, -0.2, s.z); g.rotation.y = faceSea(s.x, s.z);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    scene.add(g);
  }

  // volleyball nets
  const netTex = canvasTex(64, 32, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.2;
    for (let x = 0; x <= w; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  for (let i = 0; i < 3; i++) {
    const s = beachSpot(-38, -24); if (!s) continue;
    const g = new THREE.Group();
    for (const sx of [-4.5, 4.5]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6), M(0xdddddd)); p.position.set(sx, 1.25, 0); g.add(p); }
    const net = new THREE.Mesh(new THREE.PlaneGeometry(9, 1), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    net.position.y = 2.0; g.add(net);
    const court = new THREE.Mesh(new THREE.PlaneGeometry(9, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 }));
    g.position.set(s.x, -0.2, s.z); g.rotation.y = faceSea(s.x, s.z) + Math.PI / 2;
    scene.add(g);
  }

  // palms on the beach and along the promenade
  const palms = [];
  for (let i = 0; i < 60; i++) {
    const s = beachSpot(-60, -14); if (!s) continue;
    palms.push({ x: s.x, y: -0.15, z: s.z, ry: rand() * 6.28, sx: 0.9 + rand() * 0.6, sy: 0.9 + rand() * 0.8, sz: 0.9 + rand() * 0.6 });
  }

  // ============================ PROMENADE =======================================
  const plankTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#9a7549'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = `hsl(30,${30 + rand() * 12}%,${34 + rand() * 12}%)`; g.fillRect(0, y, w, 15);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 15, w, 1);
      const off = rand() * w; g.fillRect(off, y, 1, 15);
    }
  }, true);
  const lampMatLocal = ctx.lampMat;
  const promH = 0.14, promW = 7;
  const promMat = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 });
  const sides = [
    { cx: LAND - 76, cz: 0, sx: promW, sz: 2 * (LAND - 110), gap: true },
    { cx: -(LAND - 76), cz: 0, sx: promW, sz: 2 * (LAND - 110) },
    { cx: 0, cz: LAND - 76, sx: 2 * (LAND - 110), sz: promW },
    { cx: 0, cz: -(LAND - 76), sx: 2 * (LAND - 110), sz: promW },
  ];
  const benches = [], lamps = [], bins = [];
  for (const sd of sides) {
    const pm = promMat.clone(); pm.map = plankTex.clone(); pm.map.needsUpdate = true;
    pm.map.repeat.set(Math.max(sd.sx, sd.sz) / 6, Math.min(sd.sx, sd.sz) / 6);
    if (sd.sx < sd.sz) pm.map.rotation = Math.PI / 2;
    const slab = new THREE.Mesh(box, pm);
    slab.scale.set(sd.sx, promH, sd.sz);
    slab.position.set(sd.cx, promH / 2 - 0.02, sd.cz);
    slab.receiveShadow = true;
    scene.add(slab);
    const alongX = sd.sx > sd.sz;
    const len = Math.max(sd.sx, sd.sz);
    for (let t = -len / 2 + 14; t < len / 2 - 10; t += 26) {
      const x = alongX ? sd.cx + t : sd.cx, z = alongX ? sd.cz : sd.cz + t;
      if (!alongX && sd.cx > 0 && Math.abs(z - PIER.z) < 14) continue;
      const out = alongX ? [0, Math.sign(sd.cz)] : [Math.sign(sd.cx), 0];           // towards the sea
      lamps.push({ x: x + out[0] * 3.2, z: z + out[1] * 3.2 });
      benches.push({ x: x + out[0] * 2.4 + (alongX ? 7 : 0), z: z + out[1] * 2.4 + (alongX ? 0 : 7), ry: Math.atan2(out[0], out[1]) + Math.PI });
      bins.push({ x: x + out[0] * 2.6 - (alongX ? 6 : 0), z: z + out[1] * 2.6 - (alongX ? 0 : 6) });
    }
  }
  const lampPole = new THREE.CylinderGeometry(0.06, 0.09, 4.6, 6); lampPole.translate(0, 2.3, 0);
  instanced(lampPole, M(0x2a2a33, 0.5, { metalness: 0.7 }), lamps.map((l) => ({ ...l, y: 0.1 })));
  instanced(new THREE.SphereGeometry(0.3, 10, 8), lampMatLocal, lamps.map((l) => ({ ...l, y: 4.7 })), { cast: false });
  const benchWood = M(0x8a5a30, 0.9);
  instanced(box, benchWood, benches.map((b) => ({ ...b, y: 0.5, sx: 1.9, sy: 0.08, sz: 0.5 })));
  instanced(box, benchWood, benches.map((b) => ({ x: b.x - Math.sin(b.ry) * 0.25, z: b.z - Math.cos(b.ry) * 0.25, ry: b.ry, y: 0.85, sx: 1.9, sy: 0.4, sz: 0.06 })));
  instanced(box, M(0x2a2a33, 0.6), benches.map((b) => ({ ...b, y: 0.25, sx: 1.7, sy: 0.5, sz: 0.4 })), { cast: false });
  instanced(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 10), M(0x2f6f4e, 0.7), bins.map((b) => ({ ...b, y: 0.5 })));

  // ============================ STREET FURNITURE ================================
  const hydrants = [], sBenches = [], sBins = [], boxes = [];
  for (const b of blocks) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (rand() < 0.45) hydrants.push({ x: b.x + sx * 29.1, z: b.z + sz * 20 });
    }
    for (const [ox, oz, ry] of [[29.1, 11, Math.PI / 2], [-29.1, -11, -Math.PI / 2], [11, 29.1, 0], [-11, -29.1, Math.PI]]) {
      if (rand() < 0.5) sBenches.push({ x: b.x + ox, z: b.z + oz, ry });
    }
    for (const [ox, oz] of [[29.1, -14], [-29.1, 14], [-14, 29.1], [14, -29.1]]) if (rand() < 0.55) sBins.push({ x: b.x + ox, z: b.z + oz });
    if (rand() < 0.4) boxes.push({ x: b.x + (rand() < 0.5 ? -29.1 : 29.1), z: b.z + (rand() - 0.5) * 30, ry: 0 });
  }
  instanced(new THREE.CylinderGeometry(0.14, 0.17, 0.7, 8), M(0xd62839, 0.6), hydrants.map((h) => ({ ...h, y: 0.65 })));
  instanced(new THREE.SphereGeometry(0.15, 8, 6), M(0xd62839, 0.6), hydrants.map((h) => ({ ...h, y: 1.02 })));
  instanced(box, benchWood, sBenches.map((b) => ({ ...b, y: 0.75, sx: 1.8, sy: 0.08, sz: 0.5 })));
  instanced(box, benchWood, sBenches.map((b) => ({ x: b.x - Math.sin(b.ry) * 0.25, z: b.z - Math.cos(b.ry) * 0.25, ry: b.ry, y: 1.1, sx: 1.8, sy: 0.4, sz: 0.06 })));
  instanced(box, M(0x2a2a33, 0.6), sBenches.map((b) => ({ ...b, y: 0.5, sx: 1.6, sy: 0.5, sz: 0.4 })), { cast: false });
  instanced(new THREE.CylinderGeometry(0.28, 0.25, 0.95, 10), M(0x3a3f4a, 0.7), sBins.map((b) => ({ ...b, y: 0.78 })));
  instanced(box, M(0x2b6cb0, 0.5), boxes.map((b) => ({ ...b, y: 0.95, sx: 0.5, sy: 1.3, sz: 0.5 })));

  // manholes + storm drains on the roads
  const manholes = [], drains = [];
  const R = ctx.ROADS;
  for (const r of R) {
    for (let i = 0; i < 14; i++) {
      const t = (rand() * 2 - 1) * 280;
      const sgn = rand() < 0.5 ? -1 : 1;
      manholes.push({ x: r + (rand() < 0.5 ? 2.6 : -2.6) * 1, z: t });
      manholes.push({ x: t, z: r + (rand() < 0.5 ? 2.6 : -2.6) });
      drains.push({ x: r + sgn * 9.6, z: t, ry: 0 });
      drains.push({ x: t, z: r - sgn * 9.6, ry: Math.PI / 2 });
    }
  }
  const mhGeo = new THREE.CircleGeometry(0.55, 14); mhGeo.rotateX(-Math.PI / 2);
  instanced(mhGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), manholes.map((m) => ({ ...m, y: 0.04 })), { cast: false });
  instanced(box, new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), drains.map((d) => ({ ...d, y: 0.04, sx: 0.9, sy: 0.01, sz: 0.5 })), { cast: false });

  // ============================ BUILDING DETAILS ================================
  const awningTex = canvasTex(64, 16, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#9a9a9a'; g.fillRect(i * 8, 0, 8, h); }
  }, true);
  const shopGlass = new THREE.MeshStandardMaterial({ color: 0x4a6a96, metalness: 0.3, roughness: 0.2, emissive: 0xffd9a0, emissiveIntensity: 0.25 });
  lit.push(shopGlass);
  const awningMat = new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.9, side: THREE.DoubleSide });
  const AWN = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xff6b9d, 0xffb703, 0x8338ec];
  const glassItems = [], awnItems = [], doorItems = [], tanks = [], antennas = [], vents = [];
  for (const b of bldgs) {
    for (const face of [[b.sx, 0], [0, b.sz]]) {
      if (rand() < 0.22) continue;
      const alongX = face[0] === 0;                                          // face normal is ±z -> storefront runs along x
      const len = (alongX ? b.w : b.d) * 0.9;
      const nx = face[0], nz = face[1];
      const cx = b.bx + nx * (b.w / 2 + 0.07), cz = b.bz + nz * (b.d / 2 + 0.07);
      glassItems.push({ x: cx, y: 2.2, z: cz, sx: alongX ? len : 0.1, sy: 3.0, sz: alongX ? 0.1 : len });
      // awning: slopes down and out over the shop window
      awnItems.push({ x: cx + nx * 0.95, y: 3.95, z: cz + nz * 0.95, sx: alongX ? len + 0.4 : 2.1, sy: 0.07, sz: alongX ? 2.1 : len + 0.4, rx: alongX ? nz * 0.38 : 0, rz: alongX ? 0 : -nx * 0.38 });
      doorItems.push({ x: cx + (alongX ? (rand() - 0.5) * len * 0.5 : 0) + nx * 0.03, y: 1.2, z: cz + (alongX ? 0 : (rand() - 0.5) * len * 0.5) + nz * 0.03, sx: alongX ? 1.6 : 0.12, sy: 2.4, sz: alongX ? 0.12 : 1.6 });
    }
    if (rand() < 0.38) tanks.push({ x: b.bx + (rand() - 0.5) * (b.w - 8), y: b.h + 0.8, z: b.bz + (rand() - 0.5) * (b.d - 8) });
    if (rand() < 0.45) antennas.push({ x: b.bx + (rand() - 0.5) * (b.w - 5), y: b.h + 0.8, z: b.bz + (rand() - 0.5) * (b.d - 5), sy: 0.7 + rand() * 1.2 });
    if (rand() < 0.5) vents.push({ x: b.bx + (rand() - 0.5) * (b.w - 4), y: b.h + 1.0, z: b.bz + (rand() - 0.5) * (b.d - 4), ry: rand() * 3 });
  }
  instanced(box, shopGlass, glassItems, { cast: false });
  instanced(box, awningMat, awnItems, { colors: AWN });
  instanced(box, M(0x2a2024, 0.7), doorItems, { cast: false });
  const tankGeo = new THREE.CylinderGeometry(1.3, 1.3, 2.2, 12); tankGeo.translate(0, 1.7, 0);
  instanced(tankGeo, M(0x8a6a48, 0.9), tanks);
  instanced(new THREE.ConeGeometry(1.4, 0.7, 12).translate(0, 3.15, 0), M(0x5a4630, 0.9), tanks);
  instanced(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6).translate(0, 0.7, 0), M(0x4a4a52, 0.6), tanks.flatMap((t) => [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].map(([a, c]) => ({ x: t.x + a, y: t.y, z: t.z + c }))));
  instanced(new THREE.CylinderGeometry(0.04, 0.05, 6, 5).translate(0, 3, 0), M(0x3a3a44, 0.5, { metalness: 0.7 }), antennas.map((a) => ({ ...a, sy: a.sy })));
  instanced(new THREE.BoxGeometry(1.4, 0.15, 0.04).translate(0, 5.2, 0), M(0x3a3a44, 0.5), antennas);
  instanced(new THREE.BoxGeometry(1, 1, 1), M(0x7a7a85, 0.7), vents.map((v) => ({ ...v, sx: 1.2, sy: 1.2, sz: 1.2 })));

  // ============================ SKY LIFE ========================================
  const cloudTex = canvasTex(256, 128, (g, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = 40 + rand() * (w - 80), y = h * 0.5 + (rand() - 0.5) * 22, r = 16 + rand() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  });
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xffc2d6, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
    const a = rand() * Math.PI * 2, r = 380 + rand() * 420;
    sp.position.set(Math.cos(a) * r, 120 + rand() * 120, Math.sin(a) * r);
    sp.scale.set(320 + rand() * 260, 110 + rand() * 70, 1);
    sp.renderOrder = -5;
    scene.add(sp);
    clouds.push(sp);
  }

  const gulls = [];
  const gullMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.8, side: THREE.DoubleSide });
  const wingGeo = new THREE.PlaneGeometry(0.9, 0.28); wingGeo.translate(0.45, 0, 0);
  const gbody = new THREE.SphereGeometry(0.16, 8, 6); gbody.scale(0.8, 0.7, 2.0);
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(gbody, gullMat));
    const wl = new THREE.Mesh(wingGeo, gullMat), wr = new THREE.Mesh(wingGeo, gullMat);
    wr.scale.x = -1;
    g.add(wl, wr);
    const hub = { x: 250 + rand() * 170, z: (rand() * 2 - 1) * 260, r: 25 + rand() * 60, h: 22 + rand() * 40, w: (0.15 + rand() * 0.2) * (rand() < 0.5 ? -1 : 1), ph: rand() * 6.28 };
    scene.add(g);
    gulls.push({ g, wl, wr, ...hub });
  }

  const _tmp = new THREE.Vector3();
  function update(dt, t, camPos) {
    for (const c of clouds) {
      c.position.x += 2.2 * dt;
      if (c.position.x > 900) c.position.x -= 1800;
      c.position.y += 0;
    }
    for (const b of gulls) {
      const a = b.ph + t * b.w;
      const x = b.x + Math.cos(a) * b.r, z = b.z + Math.sin(a) * b.r;
      b.g.position.set(x, b.h + Math.sin(t * 0.7 + b.ph) * 2.5, z);
      b.g.rotation.y = Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * Math.sign(b.w)) ;
      b.g.rotation.z = -0.25 * Math.sign(b.w);
      const f = Math.sin(t * 7 + b.ph * 3) * 0.55;
      b.wl.rotation.z = f; b.wr.rotation.z = -f;
      const dx = x - camPos.x, dz = z - camPos.z;
      b.g.visible = dx * dx + dz * dz < 600 * 600;
    }
  }
  function setNight(n) {
    for (const c of clouds) { c.material.color.set(n ? 0x2a2050 : 0xffc2d6); c.material.opacity = n ? 0.5 : 0.85; }
    awningMat.emissive.set(n ? 0x221108 : 0x000000);
  }

  return { palms, update, setNight };
}
