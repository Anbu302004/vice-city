import * as THREE from 'three';

// ---------------------------------------------------------------------------
// AI traffic: cars follow the road grid in the right-hand lane, take smooth
// corners, obey the traffic lights, queue behind each other, brake for
// pedestrians - and can be carjacked by the player.
// ---------------------------------------------------------------------------

const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export const LIGHT_CYCLE = 26;
// axis 0 = travelling along x, axis 1 = travelling along z
export function lightState(axis, t) {
  const p = (t + (axis ? 13 : 0)) % LIGHT_CYCLE;
  return p < 10 ? 'green' : p < 12 ? 'yellow' : 'red';
}

export function createTraffic(ctx) {
  const { scene, ROADS, cars, rand, makeVehicle, count = 26, getPeds, collide } = ctx;
  const NR = ROADS.length;
  const recs = [];
  const LANES = [2.6, 2.6, 7.4];                 // inner lane most of the time
  const R_TURN = 7;

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const nodeX = (i) => ROADS[i], nodeZ = (j) => ROADS[j];

  // ---- one manoeuvre: arrive at node B heading d1, leave heading d2 -------------
  function maneuver(bi, bj, d1, d2, off) {
    const Bx = nodeX(bi), Bz = nodeZ(bj);
    const r1 = [-d1[1], d1[0]], r2 = [-d2[1], d2[0]];
    const pts = [];
    if (d1[0] === d2[0] && d1[1] === d2[1]) {                          // straight on
      pts.push([Bx + r1[0] * off - d1[0] * R_TURN, Bz + r1[1] * off - d1[1] * R_TURN]);
      pts.push([Bx + r1[0] * off + d1[0] * R_TURN, Bz + r1[1] * off + d1[1] * R_TURN]);
    } else {
      const s1 = off * (r2[0] * d1[0] + r2[1] * d1[1]);
      const Px = Bx + r1[0] * off + d1[0] * s1, Pz = Bz + r1[1] * off + d1[1] * s1;
      const ax = Px - d1[0] * R_TURN, az = Pz - d1[1] * R_TURN;
      const cx = Px + d2[0] * R_TURN, cz = Pz + d2[1] * R_TURN;
      for (let k = 0; k <= 7; k++) {                                   // quadratic bezier a -> P -> c
        const t = k / 7, u = 1 - t;
        pts.push([u * u * ax + 2 * u * t * Px + t * t * cx, u * u * az + 2 * u * t * Pz + t * t * cz]);
      }
    }
    return { bi, bj, d1, d2, pts, wi: 0, Bx, Bz };
  }

  function nextDir(bi, bj, d1) {
    const opts = [];
    for (const d of dirs) {
      if (d[0] === -d1[0] && d[1] === -d1[1]) continue;
      const ni = bi + d[0], nj = bj + d[1];
      if (ni < 0 || nj < 0 || ni >= NR || nj >= NR) continue;
      const straight = d[0] === d1[0] && d[1] === d1[1];
      opts.push({ d, w: straight ? 3 : 1 });
    }
    let tot = 0; for (const o of opts) tot += o.w;
    let r = rand() * tot;
    for (const o of opts) { r -= o.w; if (r <= 0) return o.d; }
    return opts[0].d;
  }

  function planNext(rec) {
    const m = rec.nxt || rec.cur;
    const bi = m.bi + m.d2[0], bj = m.bj + m.d2[1];
    const d1 = m.d2;
    // at the edge of the grid every node still has at least 2 exits (never a dead end)
    let d2 = nextDir(bi, bj, d1);
    return maneuver(bi, bj, d1, d2, rec.off);
  }

  function place(rec, x, z, d) {
    const a = Math.atan2(d[0], d[1]);
    rec.car.position.set(x, 0, z);
    rec.car.userData.angle = a;
    rec.car.rotation.y = a;
  }

  function spawnOne() {
    for (let tries = 0; tries < 40; tries++) {
      const i = Math.floor(rand() * NR), j = Math.floor(rand() * NR);
      const d = dirs[Math.floor(rand() * 4)];
      const bi = i + d[0], bj = j + d[1];
      if (bi < 0 || bj < 0 || bi >= NR || bj >= NR) continue;
      const off = LANES[Math.floor(rand() * LANES.length)];
      const r = [-d[1], d[0]];
      const t = 0.25 + rand() * 0.5;
      const Ax = nodeX(i), Az = nodeZ(j), Bx = nodeX(bi), Bz = nodeZ(bj);
      const x = Ax + (Bx - Ax) * t + r[0] * off, z = Az + (Bz - Az) * t + r[1] * off;
      let ok = true;
      for (const c of cars) if (Math.hypot(c.position.x - x, c.position.z - z) < 11) { ok = false; break; }
      if (!ok) continue;
      const car = makeVehicle();
      const rec = { car, off, cruise: 12 + rand() * 6, stuck: 0, ghost: 0, hornCD: 0, cur: null, nxt: null };
      // first manoeuvre happens at node B, arriving with direction d
      const d2 = nextDir(bi, bj, d);
      rec.cur = maneuver(bi, bj, d, d2, off);
      rec.nxt = planNext(rec);
      place(rec, x, z, d);
      car.userData.speed = rec.cruise * 0.8;
      car.userData.ai = rec;
      if (car.userData.driver) car.userData.driver.visible = true;
      scene.add(car);
      cars.push(car);
      recs.push(rec);
      return rec;
    }
    return null;
  }
  for (let i = 0; i < count; i++) spawnOne();

  // ---- traffic lights (instanced props) ------------------------------------------
  const housingGeo = new THREE.BoxGeometry(0.42, 1.25, 0.34);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 6.2, 8); poleGeo.translate(0, 3.1, 0);
  const discGeo = new THREE.CircleGeometry(0.15, 14);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.6, metalness: 0.3 });
  const faces = [];                                  // {x,z,ry,axis}
  const poles = [];
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = rx + sx * 11.5, pz = rz + sz * 11.5;
          poles.push({ x: px, y: 0, z: pz });
          faces.push({ x: px, z: pz, ry: sx > 0 ? Math.PI / 2 : -Math.PI / 2, axis: 0 });   // seen by traffic moving along x
          faces.push({ x: px, z: pz, ry: sz > 0 ? 0 : Math.PI, axis: 1 });
        }
      }
    }
  }
  const mk = (geo, mat, items, y) => {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
    items.forEach((it, k) => {
      e.set(0, it.ry || 0, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(it.x, it.y ?? y, it.z), q, s);
      im.setMatrixAt(k, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    scene.add(im);
    return im;
  };
  mk(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 0.6, roughness: 0.5 }), poles, 0);
  const lampMats = {};
  for (const axis of [0, 1]) {
    const hs = faces.filter((f) => f.axis === axis).map((f) => ({ x: f.x + Math.sin(f.ry) * 0.0, z: f.z, y: 5.0, ry: f.ry }));
    mk(housingGeo, darkMat, hs, 5.0);
    lampMats[axis] = {};
    ['red', 'yellow', 'green'].forEach((c, k) => {
      const base = { red: 0xff2020, yellow: 0xffc21a, green: 0x20ff6a }[c];
      const m = new THREE.MeshBasicMaterial({ color: base, toneMapped: false });
      m.userData.base = new THREE.Color(base);
      lampMats[axis][c] = m;
      const items = faces.filter((f) => f.axis === axis).map((f) => {
        const off = 0.18;
        return { x: f.x + Math.sin(f.ry) * off, z: f.z + Math.cos(f.ry) * off, y: 5.4 - k * 0.38, ry: f.ry };
      });
      mk(discGeo, m, items, 5);
    });
  }
  const dim = new THREE.Color(0x201010);
  function updateLights(t) {
    for (const axis of [0, 1]) {
      const st = lightState(axis, t);
      for (const c of ['red', 'yellow', 'green']) {
        const m = lampMats[axis][c];
        m.color.copy(st === c ? m.userData.base : dim);
      }
    }
  }

  // ---- driving ---------------------------------------------------------------------
  function drive(car, dt, t, vehicles) {
    const d = car.userData, rec = d.ai;
    if (!rec) return;
    const m = rec.cur;
    // follow the waypoints
    let tp = m.pts[m.wi];
    let dx = tp[0] - car.position.x, dz = tp[1] - car.position.z, dist = Math.hypot(dx, dz);
    while (dist < Math.max(3.2, Math.abs(d.speed) * 0.3)) {
      m.wi++;
      if (m.wi >= m.pts.length) {
        rec.cur = rec.nxt; rec.nxt = planNext(rec);
        return drive(car, dt, t, vehicles);
      }
      tp = m.pts[m.wi];
      dx = tp[0] - car.position.x; dz = tp[1] - car.position.z; dist = Math.hypot(dx, dz);
    }
    const want = Math.atan2(dx, dz);
    const err = angleDiff(d.angle, want);
    const steer = THREE.MathUtils.clamp(err * 2.6, -1, 1);

    // target speed
    let target = rec.cruise;
    const curve = Math.abs(err);
    if (curve > 0.25) target = Math.min(target, 8.5 - Math.min(curve, 1) * 3);
    if (m.d1[0] !== m.d2[0] || m.d1[1] !== m.d2[1]) {              // approaching a turn
      const toB = Math.hypot(m.Bx - car.position.x, m.Bz - car.position.z);
      if (toB < 22) target = Math.min(target, 8);
    }

    // traffic light ahead
    const rel = rec.cur;
    const along = (rel.Bx - car.position.x) * rel.d1[0] + (rel.Bz - car.position.z) * rel.d1[1];
    if (along > 11.5 && along < 60) {
      const st = lightState(rel.d1[0] !== 0 ? 0 : 1, t);
      const stopDist = along - 11.5;
      if (st === 'red' || (st === 'yellow' && stopDist > 4 + Math.abs(d.speed) * 0.35)) {
        target = Math.min(target, Math.sqrt(2 * 7 * Math.max(stopDist, 0)));
      }
    }

    // other vehicles and pedestrians in front
    const fx = Math.sin(d.angle), fz = Math.cos(d.angle);
    if (rec.ghost <= 0) {
      for (const o of vehicles) {
        if (o === car) continue;
        const ox = o.position.x - car.position.x, oz = o.position.z - car.position.z;
        const fd = ox * fx + oz * fz;
        if (fd < 0.5 || fd > 22) continue;
        const lat = Math.abs(ox * fz - oz * fx);
        if (lat > 2.3) continue;
        const gap = fd - 5.2;
        target = Math.min(target, Math.max(0, gap * 1.1) + Math.max(0, o.userData.speed) * 0.5 * (gap > 0 ? 1 : 0));
      }
      const peds = getPeds();
      for (const p of peds) {
        if (p.state !== 0 || !p.mesh.visible) continue;
        const ox = p.x - car.position.x, oz = p.z - car.position.z;
        const fd = ox * fx + oz * fz;
        if (fd < 0.5 || fd > 12) continue;
        const lat = Math.abs(ox * fz - oz * fx);
        if (lat > 2.4) continue;
        target = Math.min(target, Math.max(0, (fd - 4) * 1.0));
      }
    }
    // stuck / gridlock breaker
    if (Math.abs(d.speed) < 0.6 && target < 0.8) { rec.stuck += dt; } else rec.stuck = 0;
    if (rec.stuck > 7) { rec.ghost = 4; rec.stuck = 0; }
    if (rec.ghost > 0) rec.ghost -= dt;

    const acc = target > d.speed ? 15 : -30;
    d.speed += THREE.MathUtils.clamp(target - d.speed, -Math.abs(acc) * dt, Math.abs(acc) * dt * (acc > 0 ? 1 : 1));
    d.brake = target < d.speed - 0.5;
    d.throttle = d.speed < target ? 0.6 : 0;
    d.steerIn = steer;
    d.angle += steer * d.turn * dt * THREE.MathUtils.clamp(d.speed / 8, 0, 1);
  }

  function update(dt, t, vehicles, camPos) {
    updateLights(t);
    for (const rec of recs) {
      const c = rec.car;
      if (!c.userData.ai) continue;
      const far = Math.hypot(c.position.x - camPos.x, c.position.z - camPos.z) > 230;
      c.visible = !far;
      drive(c, dt, t, vehicles);
    }
  }

  // the player steals a moving car: returns true if it was an AI car
  function release(car) {
    const rec = car.userData.ai;
    if (!rec) return false;
    car.userData.ai = null;
    const i = recs.indexOf(rec);
    if (i >= 0) recs.splice(i, 1);
    car.visible = true;
    return true;
  }

  return { recs, update, release, spawnOne, lampMats };
}
