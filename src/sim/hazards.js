// Venomous wildlife. Fixed-step, deterministic.
//
// Stingrays (blue-spotted ribbontail rays) lie on the bottom in wading depth:
// put a foot on one and it stings, then bolts.
// Lionfish hover around coral and drift towards a nearby swimmer; brushing
// against their spines stings too.
// A sting hurts and poisons: slower movement for a few seconds.

import { groundAt, waterLevelAt, clamp } from './terrain.js';
import { LAYOUT } from './layout.js';

export const HC = {
  RAY_RADIUS: 0.62, RAY_DAMAGE: 22, RAY_POISON: 7,
  LION_RADIUS: 0.6, LION_DAMAGE: 16, LION_POISON: 6, LION_SPEED: 0.8, LION_NOTICE: 7, LION_LEASH: 6,
};

export function createHazards() {
  return {
    rays: LAYOUT.rays.map((r, i) => ({ index: i, x: r.x, z: r.z, hx: r.x, hz: r.z, yaw: r.yaw, state: 'rest', t: 0, lift: 0 })),
    lions: LAYOUT.lionfish.map((l, i) => ({ index: i, x: l.x, y: l.y, z: l.z, hx: l.x, hy: l.y, hz: l.z, yaw: i * 2.4, cool: 0 })),
  };
}

function sting(p, damage, poison) {
  p.health -= damage;
  p.poison = Math.max(p.poison, poison);
  p.sinceHurt = 0;
  p.stingCool = 1.2;
  p.stings++;
}

export function stepHazards(h, p, dt, time, events) {
  const ground = groundAt(p.x, p.z);
  const surf = waterLevelAt(p.x, p.z, time);
  const footDown = p.mode !== 'swim' && p.feetY - ground < 0.22 && surf - ground > 0.08;

  for (const r of h.rays) {
    if (r.state === 'rest') {
      const dx = p.x - r.x, dz = p.z - r.z;
      if (dx > 3 || dx < -3 || dz > 3 || dz < -3) continue;
      if (footDown && p.stingCool <= 0 && p.health > 0 && dx * dx + dz * dz < HC.RAY_RADIUS * HC.RAY_RADIUS) {
        sting(p, HC.RAY_DAMAGE, HC.RAY_POISON);
        events.push({ type: 'sting', kind: 'ray', x: r.x, z: r.z });
        r.state = 'flee'; r.t = 0;
        r.yaw = Math.atan2(r.x - p.x, r.z - p.z) + 0.4;
      }
    } else if (r.state === 'flee') {
      r.t += dt;
      const sp = 4.2 * Math.max(0, 1 - r.t / 2.6);
      const nx = r.x + Math.sin(r.yaw) * sp * dt, nz = r.z + Math.cos(r.yaw) * sp * dt;
      const g = groundAt(nx, nz);
      // stay under water
      if (waterLevelAt(nx, nz, time) - g > 0.15) { r.x = nx; r.z = nz; } else r.yaw += 2.5 * dt;
      r.lift = Math.sin(Math.min(1, r.t / 2.6) * Math.PI) * 0.22;
      if (r.t > 2.6) { r.state = 'calm'; r.t = 0; r.lift = 0; }
    } else {
      // settled again, harmless for a while
      r.t += dt;
      if (r.t > 14) r.state = 'rest';
    }
  }

  const ex = p.x, ez = p.z, ey = p.feetY + Math.min(p.eyeH, 1.0);
  for (const l of h.lions) {
    l.cool = Math.max(0, l.cool - dt);
    const dx = ex - l.x, dy = ey - l.y, dz = ez - l.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    // slow hover around home; drifts towards a swimmer that comes close
    let tx = l.hx + Math.sin(time * 0.23 + l.index) * 1.1, tz = l.hz + Math.cos(time * 0.19 + l.index * 1.7) * 1.1;
    let ty = l.hy + Math.sin(time * 0.31 + l.index * 0.6) * 0.3;
    const inWater = p.feetY < surf - 0.3;
    if (l.cool <= 0 && inWater && d2 < HC.LION_NOTICE * HC.LION_NOTICE) {
      const hd = Math.hypot(ex - l.hx, ez - l.hz);
      const k = hd > HC.LION_LEASH ? HC.LION_LEASH / hd : 1;
      tx = l.hx + (ex - l.hx) * k; tz = l.hz + (ez - l.hz) * k; ty = ey;
    }
    const mx = tx - l.x, my = ty - l.y, mz = tz - l.z;
    const md = Math.hypot(mx, my, mz);
    if (md > 0.02) {
      const step = Math.min(md, HC.LION_SPEED * dt);
      l.x += (mx / md) * step; l.y += (my / md) * step * 0.6; l.z += (mz / md) * step;
      const wantYaw = Math.atan2(mx, mz);
      let dyaw = (wantYaw - l.yaw) % 6.283185307179586;
      if (dyaw > Math.PI) dyaw -= 6.283185307179586; else if (dyaw < -Math.PI) dyaw += 6.283185307179586;
      l.yaw += clamp(dyaw, -1.5 * dt, 1.5 * dt);
    }
    const lg = groundAt(l.x, l.z);
    l.y = clamp(l.y, lg + 0.35, -0.45);
    if (l.cool <= 0 && p.stingCool <= 0 && p.health > 0 && d2 < HC.LION_RADIUS * HC.LION_RADIUS) {
      sting(p, HC.LION_DAMAGE, HC.LION_POISON);
      l.cool = 6;
      events.push({ type: 'sting', kind: 'lionfish', x: l.x, z: l.z });
    }
  }
}

export function resetHazards(h) {
  for (const r of h.rays) { r.x = r.hx; r.z = r.hz; r.state = 'rest'; r.t = 0; r.lift = 0; }
  for (const l of h.lions) { l.x = l.hx; l.y = l.hy; l.z = l.hz; l.cool = 0; }
}
