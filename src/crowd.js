import * as THREE from 'three';
import { makeHuman, animateHuman, randomLook } from './humans.js';

// ---------------------------------------------------------------------------
// Pedestrians that really walk the city: they follow the sidewalk graph, wait
// for traffic before crossing, stop to chat, dodge cars, panic when the cops are
// around and can be shoved (or knocked over) by the player.
// ---------------------------------------------------------------------------

const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function createCrowd(ctx) {
  const { scene, rand, CELL, PH, GRID, count = 80, cars, getPlayer, getWanted, onShove } = ctx;

  // ---- sidewalk graph: corners of every block --------------------------------
  const XS = [];
  for (let i = -GRID; i <= GRID; i++) XS.push(i * CELL - PH, i * CELL + PH);
  const N = XS.length;
  const crossing = (a) => a % 2 === 1;                // edge a -> a+1 crosses a road

  function nearestIdx(v) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < N; i++) { const d = Math.abs(XS[i] - v); if (d < bd) { bd = d; bi = i; } }
    return bi;
  }

  const peds = [];
  const camPos = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const keepOut = (p) => {                       // never run through buildings
    if (!ctx.collide) return;
    _v.set(p.x, 0, p.z); ctx.collide(_v, 0.45); p.x = _v.x; p.z = _v.z;
  };

  function makePed(look, x, z, opts = {}) {
    const mesh = makeHuman(look);
    scene.add(mesh);
    const a = nearestIdx(x), b = nearestIdx(z);
    const ped = {
      mesh, x, z, a, b, pa: -1, pb: -1, lat: (rand() - 0.5) * 1.4,
      spd: 1.15 + rand() * 0.55, base: 0, state: 0, t: 0, vx: 0, vz: 0, mode: 'walk', timer: 0, shove: 0,
      ejected: !!opts.ejected, angry: 0,
    };
    ped.base = ped.spd;
    mesh.position.set(x, 0, z);
    if (rand() < 0.1) ped.spd = ped.base = 2.6 + rand() * 1.2;   // joggers
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < count; i++) {
    const a = Math.floor(rand() * N), b = Math.floor(rand() * N);
    const p = makePed(randomLook(rand), XS[a], XS[b]);
    // start somewhere along an edge rather than exactly on a corner
    p.x += (rand() - 0.5) * 30; p.z += (rand() - 0.5) * 30;
    p.x = THREE.MathUtils.clamp(p.x, XS[0], XS[N - 1]); p.z = THREE.MathUtils.clamp(p.z, XS[0], XS[N - 1]);
    p.a = nearestIdx(p.x); p.b = nearestIdx(p.z);
    p.mesh.position.set(p.x, 0, p.z);
  }

  function crossingBusy(ax, az, bx, bz) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    for (const c of cars) {
      if (Math.abs(c.userData.speed) < 3) continue;
      const dx = c.position.x - mx, dz = c.position.z - mz;
      if (dx * dx + dz * dz < 18 * 18) return true;
    }
    return false;
  }

  function pickNext(p) {
    const cand = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [da, db] of dirs) {
      const na = p.a + da, nb = p.b + db;
      if (na < 0 || nb < 0 || na >= N || nb >= N) continue;
      if (na === p.pa && nb === p.pb) continue;
      const isCross = da !== 0 ? crossing(Math.min(p.a, na)) : crossing(Math.min(p.b, nb));
      let w = 1;
      if (p.pa >= 0 && (na - p.a === p.a - p.pa) && (nb - p.b === p.b - p.pb)) w = 3.5;   // keep going straight
      if (isCross) w *= 0.7;
      cand.push({ na, nb, w, isCross });
    }
    if (!cand.length) { cand.push({ na: p.pa, nb: p.pb, w: 1, isCross: false }); }
    let tot = 0; for (const c of cand) tot += c.w;
    let r = rand() * tot, pick = cand[0];
    for (const c of cand) { r -= c.w; if (r <= 0) { pick = c; break; } }
    if (pick.isCross && crossingBusy(XS[p.a], XS[p.b], XS[pick.na], XS[pick.nb])) {
      p.mode = 'wait'; p.timer = 0.8 + rand() * 0.8;               // wait for traffic
      return;
    }
    p.pa = p.a; p.pb = p.b; p.a = pick.na; p.b = pick.nb;
  }

  function knock(ped, vx, vz) {
    ped.state = 1; ped.t = 0; ped.vx = vx; ped.vz = vz; ped.mode = 'walk';
  }

  function update(dt, camera, vehicles) {
    camPos.copy(camera.position);
    const pl = getPlayer();            // { x, z, onFoot, speed, angle, sprint }
    const wanted = getWanted();
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i], m = p.mesh;
      const cdx = p.x - camPos.x, cdz = p.z - camPos.z;
      if (cdx * cdx + cdz * cdz > 150 * 150) { m.visible = false; continue; }
      m.visible = true;

      if (p.state === 1) {                                         // knocked over
        p.t += dt;
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.vx *= 1 - 2 * dt; p.vz *= 1 - 2 * dt;
        keepOut(p);
        m.position.set(p.x, 0.2, p.z);
        m.rotation.x = Math.max(-Math.PI / 2, -p.t * 6);
        if (p.t > 4) {
          p.state = 0; m.rotation.x = 0; m.position.y = 0; p.angry = 2.5;
          p.a = nearestIdx(p.x); p.b = nearestIdx(p.z); p.pa = p.pb = -1;
          if (p.ejected) p.mode = 'flee', p.timer = 6;
        }
        continue;
      }

      // ---- reactions ----------------------------------------------------------
      let react = false;
      for (const c of vehicles) {                                  // dodge fast cars
        const sp = c.userData.speed;
        if (Math.abs(sp) < 9) continue;
        const dx = p.x - c.position.x, dz = p.z - c.position.z, d2 = dx * dx + dz * dz;
        if (d2 > 14 * 14) continue;
        const fx = Math.sin(c.userData.angle) * Math.sign(sp), fz = Math.cos(c.userData.angle) * Math.sign(sp);
        const d = Math.sqrt(d2) || 1;
        if ((dx * fx + dz * fz) / d > 0.6) {
          const side = dx * fz - dz * fx;                          // which side of the car's path
          const sx = fz * Math.sign(side || 1), sz = -fx * Math.sign(side || 1);
          p.vx = sx * 5.5; p.vz = sz * 5.5; p.shove = 0.7; react = true;
          break;
        }
      }
      if (!react && wanted > 0 && pl) {
        const dx = p.x - pl.x, dz = p.z - pl.z;
        if (dx * dx + dz * dz < 22 * 22 && p.mode !== 'flee') { p.mode = 'flee'; p.timer = 3 + rand() * 3; }
      }
      if (pl && pl.onFoot) {                                       // shoving
        const dx = p.x - pl.x, dz = p.z - pl.z, d = Math.hypot(dx, dz);
        if (d < 0.85 && d > 0.001) {
          const sp = pl.speed;
          if (sp > 7.5 && d < 0.95) {                              // sprint into them: knocked over
            knock(p, (dx / d) * 5.5, (dz / d) * 5.5);
            onShove && onShove(p, true);
          } else {
            p.vx = (dx / d) * (2.8 + sp * 0.35); p.vz = (dz / d) * (2.8 + sp * 0.35);
            p.shove = 0.5; p.angry = 2.2;
            if (p.mode !== 'flee') { p.mode = 'turn'; p.timer = 0.8; }
            onShove && onShove(p, false);
          }
        }
      }

      // ---- behaviour ------------------------------------------------------------
      let moving = 0;
      const facePl = () => { if (pl) m.rotation.y += wrapAngle(Math.atan2(pl.x - p.x, pl.z - p.z) - m.rotation.y) * Math.min(1, 8 * dt); };
      if (p.mode === 'wait' || p.mode === 'idle') {
        p.timer -= dt;
        if (p.mode === 'idle' && rand() < dt * 0.6) m.userData.gesture = 0.9 + rand();
        if (p.timer <= 0) p.mode = 'walk';
      } else if (p.mode === 'turn') {                              // stunned after a shove, shouting
        p.timer -= dt; facePl(); m.userData.gesture = Math.max(m.userData.gesture, 0.4);
        if (p.timer <= 0) p.mode = 'walk';
      } else if (p.mode === 'flee') {
        p.timer -= dt;
        let dx = p.x - (pl ? pl.x : 0), dz = p.z - (pl ? pl.z : 0);
        const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        const sp = 5.2;
        p.x += dx * sp * dt; p.z += dz * sp * dt; moving = sp;
        m.rotation.y += wrapAngle(Math.atan2(dx, dz) - m.rotation.y) * Math.min(1, 10 * dt);
        keepOut(p);
        if (p.timer <= 0) { p.mode = 'walk'; p.a = nearestIdx(p.x); p.b = nearestIdx(p.z); p.pa = p.pb = -1; }
      } else {
        if (p.angry > 0) p.angry -= dt;
        // walk towards the goal corner
        const gx = XS[p.a] + p.lat, gz = XS[p.b] + p.lat;
        const dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz);
        if (d < 0.7) {
          if (rand() < 0.12) { p.mode = 'idle'; p.timer = 2 + rand() * 5; }
          else pickNext(p);
        } else {
          const sp = p.angry > 0 ? Math.max(p.spd, 2.4) : p.spd;
          p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt; moving = sp;
          m.rotation.y += wrapAngle(Math.atan2(dx, dz) - m.rotation.y) * Math.min(1, 7 * dt);
        }
      }

      if (p.shove > 0) {                                           // being pushed around
        p.shove -= dt;
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.vx *= 1 - 5 * dt; p.vz *= 1 - 5 * dt;
        keepOut(p);
        m.rotation.x = -0.22 * Math.min(1, p.shove * 3);
      } else if (m.rotation.x !== 0) m.rotation.x = 0;

      m.position.set(p.x, 0, p.z);
      animateHuman(m, moving, dt);

      // run over by a car
      for (const c of vehicles) {
        if (Math.abs(c.userData.speed) > 5) {
          const dx = c.position.x - p.x, dz = c.position.z - p.z;
          if (dx * dx + dz * dz < 2.9) { ctx.onCarHit(p, c); break; }
        }
      }
    }
  }

  // a person leaves a vehicle (carjacking) and runs away
  function eject(x, z, look) {
    const p = makePed(look || randomLook(rand), x, z, { ejected: true });
    p.mode = 'flee'; p.timer = 7;
    if (peds.length > count + 12) {                                // keep the crowd size bounded
      const old = peds.findIndex((q) => q.ejected && q !== p && q.state === 0 && q.mode !== 'flee');
      if (old >= 0) { scene.remove(peds[old].mesh); peds.splice(old, 1); }
    }
    return p;
  }

  return { peds, update, knock, eject, XS };
}
