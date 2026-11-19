import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Firearms: pistol, SMG, shotgun, assault rifle. Hit-scan bullets with spread,
// recoil, ammo + reloading, tracers, impact effects, aim assist, pick-ups and
// procedural gunshot sounds (from audio.js). Keys 1-5 pick a weapon, left mouse
// (or H) fires, right mouse aims, R reloads.
// ---------------------------------------------------------------------------

const DEFS = {
  fists:   { name: 'FISTS',   slot: 1 },
  pistol:  { name: 'PISTOL',  slot: 2, mag: 12, start: 48,  dmg: 30, rate: 0.26, auto: false, spread: 0.014, range: 90,  pellets: 1, reload: 1.25, sound: 'pistol',  recoil: 0.55, two: false, bloom: 0.012 },
  smg:     { name: 'SMG',     slot: 3, mag: 30, start: 120, dmg: 15, rate: 0.075, auto: true,  spread: 0.03,  range: 65,  pellets: 1, reload: 1.7,  sound: 'smg',     recoil: 0.25, two: true,  bloom: 0.006 },
  shotgun: { name: 'SHOTGUN', slot: 4, mag: 6,  start: 24,  dmg: 13, rate: 0.95, auto: false, spread: 0.075, range: 34,  pellets: 8, reload: 2.4,  sound: 'shotgun', recoil: 1.0,  two: true,  bloom: 0.0 },
  rifle:   { name: 'RIFLE',   slot: 5, mag: 30, start: 90,  dmg: 26, rate: 0.105, auto: true,  spread: 0.012, range: 150, pellets: 1, reload: 2.0,  sound: 'rifle',   recoil: 0.4,  two: true,  bloom: 0.005 },
};
const ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

// ------------------------------------------------------------------ gun models
const metal = new THREE.MeshStandardMaterial({ color: 0x2b2e36, metalness: 0.45, roughness: 0.4 });
const metalLight = new THREE.MeshStandardMaterial({ color: 0x8a8e98, metalness: 0.5, roughness: 0.35 });
const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.7 });
const grip = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.9 });
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
cyl.rotateX(Math.PI / 2);                                   // along z

function part(g, geo, m, x, y, z, sx, sy, sz) {
  const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.scale.set(sx, sy, sz); me.castShadow = false; g.add(me); return me;
}
function gunCore(kind) {
  const g = new THREE.Group();
  let mz = 0.3;
  if (kind === 'pistol') {
    part(g, box, metal, 0, 0.035, 0.1, 0.035, 0.045, 0.24);            // slide
    part(g, cyl, metalLight, 0, 0.035, 0.24, 0.011, 0.011, 0.06);      // barrel tip
    part(g, box, grip, 0, -0.03, 0.03, 0.032, 0.11, 0.05).rotation.x = -0.18;   // grip
    part(g, box, metal, 0, -0.005, 0.1, 0.028, 0.02, 0.12);            // frame
    part(g, box, metal, 0, -0.012, 0.075, 0.006, 0.03, 0.02);          // trigger guard
    mz = 0.28;
  } else if (kind === 'smg') {
    part(g, box, metal, 0, 0.02, 0.17, 0.05, 0.075, 0.33);             // receiver
    part(g, cyl, metalLight, 0, 0.03, 0.38, 0.014, 0.014, 0.12);       // barrel
    part(g, cyl, metal, 0, 0.03, 0.34, 0.022, 0.022, 0.1);             // suppressor sleeve
    part(g, box, grip, 0, -0.07, 0.07, 0.034, 0.12, 0.05).rotation.x = -0.15;   // grip
    part(g, box, metal, 0, -0.1, 0.2, 0.032, 0.17, 0.05);              // magazine
    part(g, box, metal, 0, 0.0, -0.1, 0.02, 0.03, 0.2);                // wire stock
    part(g, box, metalLight, 0, 0.065, 0.14, 0.012, 0.02, 0.1);        // top rail
    mz = 0.46;
  } else if (kind === 'shotgun') {
    part(g, cyl, metal, 0, 0.035, 0.4, 0.019, 0.019, 0.7);             // barrel
    part(g, cyl, metalLight, 0, -0.005, 0.38, 0.016, 0.016, 0.52);     // magazine tube
    part(g, box, wood, 0, -0.005, 0.37, 0.04, 0.045, 0.2);             // pump
    part(g, box, metal, 0, 0.02, 0.08, 0.045, 0.07, 0.2);              // receiver
    part(g, box, wood, 0, -0.01, -0.16, 0.04, 0.075, 0.32).rotation.x = 0.12;   // stock
    part(g, box, grip, 0, -0.05, 0.02, 0.03, 0.09, 0.04).rotation.x = -0.2;
    mz = 0.78;
  } else {
    part(g, box, metal, 0, 0.02, 0.12, 0.05, 0.08, 0.42);              // receiver
    part(g, cyl, metalLight, 0, 0.035, 0.52, 0.012, 0.012, 0.3);       // barrel
    part(g, box, metal, 0, 0.03, 0.42, 0.03, 0.04, 0.22);              // handguard
    part(g, box, grip, 0, -0.07, 0.04, 0.034, 0.12, 0.05).rotation.x = -0.15;   // grip
    part(g, box, metal, 0, -0.095, 0.2, 0.03, 0.15, 0.06).rotation.x = 0.2;     // curved mag
    part(g, box, grip, 0, 0.0, -0.17, 0.04, 0.09, 0.28);               // stock
    const scope = part(g, cyl, metal, 0, 0.1, 0.12, 0.022, 0.022, 0.16);        // scope
    part(g, cyl, new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x112244, roughness: 0.1 }), 0, 0.1, 0.205, 0.016, 0.016, 0.005);
    mz = 0.68;
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.035, mz); g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}
export const makeGunMesh = gunCore;
function buildGun(kind) {
  const g = gunCore(kind), muzzle = g.userData.muzzle;
  // put the barrel along the forearm's local -y so it points forward when the arm is raised
  const holder = new THREE.Group();
  holder.add(g);
  g.rotation.x = 0;
  holder.rotation.x = Math.PI / 2;
  holder.position.set(0, -0.29, 0.02);
  holder.userData.muzzle = muzzle;
  return holder;
}

// ------------------------------------------------------------------ ray helpers
function rayCyl(O, D, cx, cz, r, y0, y1, maxT) {
  const a = D.x * D.x + D.z * D.z;
  if (a < 1e-9) return null;
  const ox = O.x - cx, oz = O.z - cz;
  const b = 2 * (ox * D.x + oz * D.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxT) return null;
  const y = O.y + D.y * t;
  if (y < y0 || y > y1) return null;
  return t;
}
function rayBox(ox, oy, oz, dx, dy, dz, minX, maxX, minY, maxY, minZ, maxZ, maxT) {
  let t0 = 0, t1 = maxT;
  const slab = (o, d, mn, mx) => {
    if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
    let a = (mn - o) / d, b = (mx - o) / d;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    return t0 <= t1;
  };
  if (!slab(ox, dx, minX, maxX) || !slab(oy, dy, minY, maxY) || !slab(oz, dz, minZ, maxZ)) return null;
  return t0 > 0 ? t0 : null;
}

export function createWeapons(ctx) {
  const { scene, player, camera, sfx, smoke } = ctx;
  const state = {};
  for (const k of ORDER) if (DEFS[k].mag) state[k] = { mag: DEFS[k].mag, reserve: DEFS[k].start };
  let cur = 'fists';
  let cool = 0, reloadT = 0, aiming = false, mouseDown = false, bloom = 0, kick = 0, lastShot = -9, flashT = 0, shake = 0;

  // ---- models in the right hand
  const models = {};
  for (const k of ORDER) {
    if (k === 'fists') continue;
    models[k] = buildGun(k);
    models[k].visible = false;
    player.userData.foreR.add(models[k]);
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: false }));
  scene.add(flash);

  // ---- particles
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const parts = [];
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; s.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, sz: 0.1 };
    scene.add(s); parts.push(s);
  }
  let pk = 0;
  function burst(x, y, z, color, n, speed, size, life, grav, up = 0.5) {
    for (let i = 0; i < n; i++) {
      const s = parts[pk++ % parts.length], u = s.userData;
      s.position.set(x, y, z);
      u.vx = (Math.random() - 0.5) * speed; u.vz = (Math.random() - 0.5) * speed; u.vy = Math.random() * speed * up + speed * 0.15;
      u.g = grav; u.life = u.max = life * (0.6 + Math.random() * 0.6); u.sz = size * (0.6 + Math.random() * 0.8);
      s.material.color.setHex(color); s.scale.setScalar(u.sz); s.visible = true;
    }
  }
  const tracers = [];
  const trMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9, depthWrite: false });
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(box, trMat.clone()); m.visible = false; m.userData = { life: 0 }; scene.add(m); tracers.push(m);
  }
  let tk = 0;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function tracer(from, to) {
    const m = tracers[tk++ % tracers.length];
    _a.copy(to).sub(from); const len = _a.length();
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.scale.set(0.025, 0.025, len);
    m.lookAt(to);
    m.material.opacity = 0.85; m.userData.life = 0.07; m.visible = true;
  }

  // ---- HUD
  const hud = document.createElement('div'); hud.id = 'weapon';
  hud.innerHTML = '<div class="wname"></div><div class="wammo"></div><div class="wslots"></div><div class="wmsg"></div>';
  document.body.appendChild(hud);
  const xh = document.createElement('div'); xh.id = 'xhair';
  xh.innerHTML = '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i>';
  document.body.appendChild(xh);
  const eName = hud.querySelector('.wname'), eAmmo = hud.querySelector('.wammo'), eSlots = hud.querySelector('.wslots'), eMsg = hud.querySelector('.wmsg');
  function renderHud() {
    const d = DEFS[cur], st = state[cur];
    eName.textContent = d.name;
    eAmmo.innerHTML = st ? '<b>' + st.mag + '</b> / ' + st.reserve : '';
    eSlots.innerHTML = ORDER.map((k) => '<i class="' + (k === cur ? 'on' : '') + '">' + DEFS[k].slot + '</i>').join('');
    eMsg.textContent = reloadT > 0 ? 'RELOADING' : (st && st.mag === 0 && st.reserve === 0 ? 'NO AMMO' : '');
  }
  renderHud();

  // ---- pick-ups
  const pickups = [];
  const crateGeo = new THREE.BoxGeometry(0.7, 0.45, 0.5);
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x1b4d2b, roughness: 0.6, emissive: 0x0f7a2f, emissiveIntensity: 0.6 });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  function addPickup(x, z) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(crateGeo, crateMat));
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.1), stripeMat); s.position.y = 0.05; g.add(s);
    g.position.set(x, 0.7, z);
    scene.add(g);
    pickups.push({ g, x, z, t: 0, ph: Math.random() * 6 });
  }

  // ---- selection
  function select(k) {
    if (!DEFS[k] || cur === k) return;
    cur = k; reloadT = 0; cool = 0.2; bloom = 0;
    for (const m in models) models[m].visible = (m === k);
    renderHud();
    if (k !== 'fists') sfx.click();
  }
  function cycle(dir) { select(ORDER[(ORDER.indexOf(cur) + dir + ORDER.length) % ORDER.length]); }

  function startReload() {
    const d = DEFS[cur], st = state[cur];
    if (!st || reloadT > 0 || st.mag >= d.mag || st.reserve <= 0) return;
    reloadT = d.reload; sfx.reload(cur === 'shotgun' ? 'shotgun' : 'pistol'); renderHud();
  }

  // ---- shooting
  const O = new THREE.Vector3(), D = new THREE.Vector3(), P = new THREE.Vector3(), M = new THREE.Vector3();

  function nearestHit(O, D, range, tmin) {
    let best = { t: range, kind: 'none' };
    const hum = ctx.humans();
    for (const h of hum) {
      const t = rayCyl(O, D, h.x, h.z, h.r, h.y0, h.y1, best.t);
      if (t !== null && t > tmin && t < best.t) { const y = O.y + D.y * t; best = { t, kind: 'human', ref: h, head: (y - h.y0) / (h.y1 - h.y0) > 0.8 }; }
    }
    for (const b of ctx.colliders) {
      if (O.x < b.minX - range && D.x <= 0 && false) continue;
      const t = rayBox(O.x, O.y, O.z, D.x, D.y, D.z, b.minX, b.maxX, 0, b.h, b.minZ, b.maxZ, best.t);
      if (t !== null && t > tmin && t < best.t) best = { t, kind: 'wall' };
    }
    for (const c of ctx.vehicles()) {
      const d = c.userData, ca = Math.cos(d.angle), sa = Math.sin(d.angle);
      const dx = O.x - c.position.x, dz = O.z - c.position.z;
      const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
      const ldx = D.x * ca - D.z * sa, ldz = D.x * sa + D.z * ca;
      const bike = d.kind === 'bike';
      const hw = bike ? 0.4 : 1.0, hl = bike ? 1.0 : 2.3, y0 = c.position.y;
      const t = rayBox(lx, O.y - y0, lz, ldx, D.y, ldz, -hw, hw, 0, bike ? 1.4 : 1.4, -hl, hl, best.t);
      if (t !== null && t > tmin && t < best.t) best = { t, kind: 'vehicle', ref: c };
    }
    if (D.y < -1e-4) {
      const t = (-0.0 - O.y) / D.y;
      if (t > tmin && t < best.t) best = { t, kind: 'ground' };
    }
    return best;
  }

  function aimDirection(angle, spreadMul) {
    // straight ahead at chest height, nudged towards the closest person in front (aim assist)
    const fx = Math.sin(angle), fz = Math.cos(angle);
    D.set(fx, 0, fz);
    const cone = aiming ? 0.16 : 0.1;
    let bestA = cone, tgt = null;
    for (const h of ctx.humans()) {
      const dx = h.x - O.x, dz = h.z - O.z, dist = Math.hypot(dx, dz);
      if (dist < 1.2 || dist > DEFS[cur].range) continue;
      const a = Math.abs(Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz));
      if (a < bestA) { bestA = a; tgt = h; }
    }
    if (tgt) {
      const dx = tgt.x - O.x, dz = tgt.z - O.z, dist = Math.hypot(dx, dz);
      const ty = tgt.y0 + (tgt.y1 - tgt.y0) * 0.68;
      D.set(dx, ty - O.y, dz).normalize();
    }
    return D;
  }

  function fire(t) {
    const d = DEFS[cur], st = state[cur];
    if (!st || cool > 0 || reloadT > 0) return;
    if (st.mag <= 0) { sfx.click(); cool = 0.25; if (st.reserve > 0) startReload(); else renderHud(); return; }
    st.mag--; cool = d.rate; lastShot = t;
    models[cur].parent.updateWorldMatrix(true, true);
    models[cur].userData.muzzle.getWorldPosition(M);
    player.getWorldPosition(O); O.y += 1.3;                      // aim from the chest, draw from the muzzle
    const ang = ctx.getAngle();
    const baseDir = aimDirection(ang, 1).clone();
    const sp = (d.spread + bloom) * (aiming ? 0.45 : 1) * (ctx.getSpeed() > 1 ? 1.6 : 1);
    sfx.gun(d.sound); if (cur !== 'shotgun') sfx.shell();
    let didHuman = false;
    for (let i = 0; i < d.pellets; i++) {
      const dir = baseDir.clone();
      dir.x += (Math.random() - 0.5) * 2 * sp; dir.y += (Math.random() - 0.5) * 2 * sp; dir.z += (Math.random() - 0.5) * 2 * sp;
      dir.normalize();
      const hit = nearestHit(O, dir, d.range, 0.2);
      P.copy(O).addScaledVector(dir, hit.t);
      if (i < 3 || d.pellets === 1) tracer(M, P);
      const fall = cur === 'shotgun' ? Math.max(0.25, 1 - hit.t / 34) : 1;
      if (hit.kind === 'human') {
        const dmg = d.dmg * fall * (hit.head ? 2.6 : 1);
        ctx.onHitHuman(hit.ref, dmg, hit.head, dir);
        burst(P.x, P.y, P.z, 0xb3121a, hit.head ? 9 : 5, 3.2, 0.16, 0.5, 8);
        didHuman = true;
      } else if (hit.kind === 'vehicle') {
        burst(P.x, P.y, P.z, 0xffd166, 5, 4, 0.08, 0.3, 8);
        if (i === 0) sfx.ricochet();
        ctx.onHitVehicle(hit.ref, d.dmg * fall);
      } else if (hit.kind === 'wall') {
        burst(P.x, P.y, P.z, 0xd9cdb4, 5, 3, 0.2, 0.55, 5);
        burst(P.x, P.y, P.z, 0xffd166, 3, 4, 0.07, 0.25, 8);
        if (i === 0 && Math.random() < 0.5) sfx.ricochet();
      } else if (hit.kind === 'ground') {
        if (ctx.isWater(P.x, P.z)) burst(P.x, -0.4, P.z, 0xffffff, 6, 2.5, 0.28, 0.6, 6, 1.2);
        else burst(P.x, 0.05, P.z, 0xe0c890, 4, 2.2, 0.2, 0.5, 5);
      }
    }
    ctx.onShot(didHuman, M);
    bloom = Math.min(0.09, bloom + d.bloom);
    kick = Math.min(1.2, kick + d.recoil);
    shake = Math.min(1, shake + d.recoil * 0.5);
    flashT = 0.055;
    flash.position.copy(M); flash.scale.setScalar(cur === 'shotgun' ? 1.1 : cur === 'pistol' ? 0.55 : 0.8);
    flash.material.opacity = 1;
    if (cur === 'shotgun') setTimeout(() => sfx.click(), 380);
    renderHud();
    if (st.mag === 0 && st.reserve > 0) setTimeout(startReload, 250);
  }

  // ---- per-frame
  const _p = new THREE.Vector3();
  function update(dt, t, active) {
    cool -= dt; kick = Math.max(0, kick - dt * 5); shake = Math.max(0, shake - dt * 6); bloom = Math.max(0, bloom - dt * 0.12);
    if (reloadT > 0) {
      reloadT -= dt;
      if (reloadT <= 0) {
        const d = DEFS[cur], st = state[cur];
        const take = Math.min(d.mag - st.mag, st.reserve); st.mag += take; st.reserve -= take; reloadT = 0; renderHud();
      }
    }
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.material.opacity = 0; }
    const armed = cur !== 'fists' && active;
    if (models[cur]) models[cur].visible = armed;
    if (armed && (mouseDown || ctx.keys.KeyH) && DEFS[cur].auto) fire(t);
    // crosshair at the point the bullets are heading for
    xh.classList.toggle('on', armed);
    if (armed) {
      player.getWorldPosition(_p);
      const a = ctx.getAngle();
      _p.x += Math.sin(a) * 28; _p.z += Math.cos(a) * 28; _p.y += 1.3;
      _p.project(camera);
      const px = (_p.x * 0.5 + 0.5) * innerWidth, py = (-_p.y * 0.5 + 0.5) * innerHeight;
      xh.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px)';
      const gap = 6 + (DEFS[cur].spread + bloom) * (aiming ? 0.45 : 1) * 420;
      xh.style.setProperty('--g', gap.toFixed(1) + 'px');
      xh.classList.toggle('aim', aiming);
    }
    // pick-ups
    for (const p of pickups) {
      p.ph += dt; p.g.rotation.y += dt * 1.5; p.g.position.y = 0.75 + Math.sin(p.ph * 2.5) * 0.12;
      if (p.t > 0) { p.t -= dt; p.g.visible = p.t <= 0; continue; }
      if (!active) continue;
      const pp = ctx.getPos();
      if ((pp.x - p.x) ** 2 + (pp.z - p.z) ** 2 < 2.6) {
        for (const k of ORDER) { const d = DEFS[k]; if (d.mag) state[k].reserve += Math.ceil(d.start * 0.5); }
        p.t = 70; p.g.visible = false; sfx.pass(); ctx.toast('AMMO  +50%', 1300); renderHud();
      }
    }
    // particles + tracers
    for (const s of parts) {
      if (!s.visible) continue;
      const u = s.userData; u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      u.vy -= u.g * dt; s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      const k = u.life / u.max; s.material.opacity = Math.min(1, k * 1.4); s.scale.setScalar(u.sz * (1.2 - k * 0.5));
    }
    for (const m of tracers) { if (!m.visible) continue; m.userData.life -= dt; m.material.opacity = Math.max(0, m.userData.life / 0.07) * 0.85; if (m.userData.life <= 0) m.visible = false; }
  }

  // arm pose after the walk animation has run
  function pose(dt, swimming) {
    const armed = cur !== 'fists' && !swimming;
    if (!armed) return;
    const u = player.userData, d = DEFS[cur];
    const hot = aiming || (performance.now() / 1000 - lastShot < 2.2) || mouseDown;
    const k = kick * 0.18;
    if (hot) {
      u.armR.rotation.set(-1.5 + k, 0, 0.05); u.foreR.rotation.set(-0.12, 0, 0);
      if (d.two) { u.armL.rotation.set(-1.25 + k * 0.6, 0, -0.42); u.foreL.rotation.set(-0.55, 0, 0); }
      u.upper.rotation.y += d.two ? 0.18 : 0.08;
    } else {
      u.armR.rotation.set(-0.55 + k, 0, 0.1); u.foreR.rotation.set(-0.85, 0, 0);
      if (d.two) { u.armL.rotation.set(-0.6, 0, -0.3); u.foreL.rotation.set(-0.7, 0, 0); }
    }
    if (reloadT > 0) { u.foreL.rotation.set(-1.0 - Math.sin(reloadT * 9) * 0.2, 0, 0); u.armL.rotation.set(-0.9, 0, -0.45); }
  }

  return {
    DEFS, ORDER,
    get current() { return cur; },
    get armed() { return cur !== 'fists'; },
    get aiming() { return aiming; },
    set aiming(v) { aiming = v; },
    get shake() { return shake; },
    select, cycle, startReload, update, pose, addPickup, fire,
    refillAll() { for (const k of ORDER) { const d = DEFS[k]; if (d.mag) { state[k].mag = d.mag; state[k].reserve = Math.max(state[k].reserve, d.start * 2); } } reloadT = 0; renderHud(); },
    setMouse(v) { mouseDown = v; },
    shoot: (t) => fire(t),
    renderHud,
    state,
    burst,
    addShake(v) { shake = Math.min(1.5, shake + v); },
  };
}
