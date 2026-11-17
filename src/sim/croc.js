// Saltwater crocodile AI. Fixed-step, deterministic.
//
// idle  -> drifting or basking near home
// alert -> noticed the player: turns to face, short warning before the chase
// chase -> swims / gallops after the player, tires after a while
// windup-> close enough: locks a direction, opens the jaws
// lunge -> fast straight dash; bites if it connects
// rest  -> recovering after a lunge or a failed chase, then goes home

import { groundAt, waterLevelAt, clamp, flatMask, shoreZ } from './terrain.js';
import { resolveCollisions } from './layout.js';
import { mulberry32 } from './noise.js';

export const CC = {
  SENSE: 27, SENSE_LOUD: 36, LEASH: 95, GIVE_UP: 60,
  SPEED_SHALLOW: 6.9, SPEED_DEEP: 8.4, SPEED_LAND: 4.6, SPEED_IDLE: 0.9,
  TURN: 2.1, ACCEL: 6.5,
  LUNGE_RANGE: 5.6, LUNGE_SPEED: 14, LUNGE_TIME: 0.45, WINDUP: 0.38,
  BITE_REACH: 1.15, BITE_HEIGHT: 1.05, DAMAGE: 34,
  STAMINA: 13, RADIUS: 0.55, HEAD: 1.7,
};

export function createCroc(home, index) {
  const rnd = mulberry32(977 + index * 131);
  return {
    index, hx: home.x, hz: home.z, x: home.x, z: home.z,
    yaw: rnd() * 6.283, speed: 0, state: 'idle', t: rnd() * 5, stamina: CC.STAMINA,
    tx: home.x, tz: home.z, jaw: 0, calm: 0, rnd,
    lungeYaw: 0, bitten: false, size: 0.9 + rnd() * 0.35,
  };
}

function angDiff(a, b) {
  let d = (a - b) % 6.283185307179586;
  if (d > Math.PI) d -= 6.283185307179586; else if (d < -Math.PI) d += 6.283185307179586;
  return d;
}

const pos = { x: 0, z: 0 }, vel = { x: 0, z: 0 };

function inTerritory(x, z) {
  // crocodiles keep to the shallow flats and their channels
  const d = z - shoreZ(x);
  return flatMask(x, d) > 0.35 || (d > 96 && d < 250);
}

export function stepCroc(c, player, dt, time, events) {
  c.t += dt;
  c.calm = Math.max(0, c.calm - dt);
  const dx = player.x - c.x, dz = player.z - c.z;
  const dist = Math.hypot(dx, dz);
  const ground = groundAt(c.x, c.z);
  const surf = waterLevelAt(c.x, c.z, time);
  const depth = surf - ground;
  const playerSpeed = Math.hypot(player.vx, player.vz);
  const pInTerr = inTerritory(player.x, player.z);
  let targetYaw = c.yaw, targetSpeed = 0, turnRate = CC.TURN;

  switch (c.state) {
    case 'idle': {
      const sense = playerSpeed > 3 ? CC.SENSE_LOUD : CC.SENSE;
      if (c.calm <= 0 && dist < sense && pInTerr && player.health > 0) {
        c.state = 'alert'; c.t = 0;
        events.push({ type: 'crocAlert', croc: c.index, x: c.x, z: c.z, dist });
        break;
      }
      // slow wander around home
      if (c.t > 0 || Math.hypot(c.tx - c.x, c.tz - c.z) < 1.5) {
        if (Math.hypot(c.tx - c.x, c.tz - c.z) < 1.5 || c.t > 9) {
          const a = c.rnd() * 6.283, r = 3 + c.rnd() * 12;
          c.tx = c.hx + Math.cos(a) * r; c.tz = c.hz + Math.sin(a) * r;
          c.t = -(2 + c.rnd() * 6); // pause before moving again
        }
      }
      if (c.t >= 0) {
        targetYaw = Math.atan2(c.tx - c.x, c.tz - c.z);
        targetSpeed = CC.SPEED_IDLE;
        turnRate = 0.8;
      }
      break;
    }
    case 'alert': {
      targetYaw = Math.atan2(dx, dz);
      turnRate = 3.2;
      if (c.t > 0.75) { c.state = 'chase'; c.t = 0; c.stamina = CC.STAMINA; }
      break;
    }
    case 'chase': {
      c.stamina -= dt;
      const homeDist = Math.hypot(c.x - c.hx, c.z - c.hz);
      if (c.stamina <= 0 || dist > CC.GIVE_UP || homeDist > CC.LEASH || !pInTerr || player.health <= 0) {
        c.state = 'rest'; c.t = 0; c.calm = 6;
        events.push({ type: 'crocGiveUp', croc: c.index });
        break;
      }
      // lead the target a little
      const lead = clamp(dist / 12, 0, 0.6);
      const ax = dx + player.vx * lead, az = dz + player.vz * lead;
      targetYaw = Math.atan2(ax, az);
      targetSpeed = depth < 0.08 ? CC.SPEED_LAND : depth < 1.0 ? CC.SPEED_SHALLOW : CC.SPEED_DEEP;
      const facing = Math.abs(angDiff(Math.atan2(dx, dz), c.yaw));
      if (dist < CC.LUNGE_RANGE && facing < 0.5) {
        c.state = 'windup'; c.t = 0;
        events.push({ type: 'crocWindup', croc: c.index, x: c.x, z: c.z });
      }
      break;
    }
    case 'windup': {
      targetYaw = Math.atan2(dx, dz);
      turnRate = 1.6;
      targetSpeed = 1.5;
      c.jaw = Math.min(1, c.jaw + dt / CC.WINDUP);
      if (c.t > CC.WINDUP) {
        c.state = 'lunge'; c.t = 0; c.bitten = false;
        // aim where the player will be in a moment
        c.lungeYaw = Math.atan2(dx + player.vx * 0.22, dz + player.vz * 0.22);
        c.yaw = c.lungeYaw;
        c.speed = CC.LUNGE_SPEED;
        events.push({ type: 'crocLunge', croc: c.index, x: c.x, z: c.z });
      }
      break;
    }
    case 'lunge': {
      targetYaw = c.lungeYaw; turnRate = 0;
      targetSpeed = CC.LUNGE_SPEED;
      c.speed = CC.LUNGE_SPEED;
      if (!c.bitten && player.invuln <= 0 && player.health > 0) {
        const hx = c.x + Math.sin(c.yaw) * CC.HEAD * c.size, hz = c.z + Math.cos(c.yaw) * CC.HEAD * c.size;
        const hd = Math.hypot(player.x - hx, player.z - hz);
        const top = Math.max(ground, surf);
        const lowEnough = player.feetY - top < CC.BITE_HEIGHT;
        if (hd < CC.BITE_REACH * c.size + 0.3 && lowEnough) {
          c.bitten = true;
          events.push({ type: 'bite', croc: c.index, dirX: Math.sin(c.yaw), dirZ: Math.cos(c.yaw) });
        }
      }
      if (c.t > CC.LUNGE_TIME) {
        c.state = 'rest'; c.t = 0;
        c.calm = c.bitten ? 3.5 : 1.3;
        if (!c.bitten) events.push({ type: 'crocMiss', croc: c.index, x: c.x, z: c.z });
      }
      break;
    }
    case 'rest': {
      c.jaw = Math.max(0, c.jaw - dt * 2.5);
      targetSpeed = 0;
      if (c.t > c.calm * 0.45 + 0.5) {
        // after a miss it may go again if the player is still close and it has breath left
        if (c.calm < 2 && c.stamina > 2 && dist < 22 && pInTerr && player.health > 0) {
          c.state = 'chase'; c.t = 0;
        } else {
          c.state = 'home'; c.t = 0; c.calm = Math.max(c.calm, 4);
        }
      }
      break;
    }
    case 'home': {
      const hd = Math.hypot(c.hx - c.x, c.hz - c.z);
      targetYaw = Math.atan2(c.hx - c.x, c.hz - c.z);
      targetSpeed = 2.4;
      turnRate = 1.2;
      if (hd < 5 || c.t > 40) { c.state = 'idle'; c.t = 0; c.tx = c.x; c.tz = c.z; }
      else if (c.calm <= 0 && dist < CC.SENSE * 0.7 && pInTerr && player.health > 0) {
        c.state = 'alert'; c.t = 0;
        events.push({ type: 'crocAlert', croc: c.index, x: c.x, z: c.z, dist });
      }
      break;
    }
  }
  if (c.state !== 'windup' && c.state !== 'lunge') c.jaw = Math.max(0, c.jaw - dt * 2.5);

  // steer
  if (turnRate > 0) {
    const d = angDiff(targetYaw, c.yaw);
    c.yaw += clamp(d, -turnRate * dt, turnRate * dt);
    // slow down for sharp turns
    if (c.state === 'chase') targetSpeed *= 1 - 0.55 * clamp(Math.abs(d) / 1.6, 0, 1);
  }
  if (c.state !== 'lunge') {
    const ds = targetSpeed - c.speed;
    c.speed += clamp(ds, -CC.ACCEL * 1.6 * dt, CC.ACCEL * dt);
  }
  vel.x = Math.sin(c.yaw) * c.speed; vel.z = Math.cos(c.yaw) * c.speed;
  pos.x = c.x + vel.x * dt; pos.z = c.z + vel.z * dt;
  resolveCollisions(pos, vel, CC.RADIUS, true);
  // crocodiles do not climb out onto the resort beach
  const g2 = groundAt(pos.x, pos.z);
  if (g2 > 1.0) { pos.x = c.x; pos.z = c.z; c.speed *= 0.5; }
  c.x = pos.x; c.z = pos.z;
}

export function resetCroc(c) {
  c.x = c.hx; c.z = c.hz; c.state = 'idle'; c.t = 0; c.speed = 0; c.jaw = 0; c.calm = 3;
  c.tx = c.hx; c.tz = c.hz; c.stamina = CC.STAMINA;
}
