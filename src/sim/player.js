// Player physics. Runs only at the fixed simulation step, so the result does
// not depend on the display refresh rate.
//
// Three movement modes:
//   swim   - water deeper than ~1.3 m: free 3D swimming, breath-hold diving
//   ground - dry land or wading: the deeper the water, the slower you walk
//   air    - jumping. Landing with jump held chains a bunny hop that keeps
//            (and builds) speed; at speed, holding jump turns the hop into a
//            glide that can be pulled up into a climb or pushed into a dive.

import { groundAt, waterLevelAt, clamp, lerp, smoothstep } from './terrain.js';
import { resolveCollisions } from './layout.js';
import { SPAWN } from './mapdata.js';

export const PC = {
  EYE: 1.62, EYE_SWIM: 0.38, RADIUS: 0.36,
  GRAVITY: 15, JUMP_V: 7.2,
  WALK: 5.6, SPRINT: 8.2, WADE: 2.1,
  GROUND_ACCEL: 11, FRICTION: 8, STOP_SPEED: 2,
  AIR_RATE: 80, AIR_CAP: 1.0,
  SWIM_IN: 1.3, SWIM_OUT: 1.15,
  SWIM_SPEED: 3.9, SWIM_SPRINT: 6.4,
  PERFECT_WINDOW: 0.14,
  HOP_PERFECT: 3.0, HOP_AUTO: 1.75,
  GLIDE_MIN: 8, GLIDE_FULL: 15, GLIDE_LIFT: 0.93, GLIDE_DRAG: 0.55,
  GLIDE_PULL: 1.6,           // how fast a glide can be steered up or down (rad/s at full pitch)
  GLIDE_CEIL0: 7, GLIDE_CEIL1: 13, // lift fades out between these heights above the ground
  STEP_UP: 0.7,
  BREATH: 45,
  POISON_SLOW: 0.62,
};

export function createPlayer() {
  const p = {
    x: SPAWN.x, z: SPAWN.z, feetY: 0, eyeH: PC.EYE,
    vx: 0, vy: 0, vz: 0,
    yaw: SPAWN.yaw, pitch: 0,
    mode: 'ground',
    health: 100, o2: 1, invuln: 0, sinceHurt: 99, poison: 0, stingCool: 0,
    jumpAge: 99, prevJump: false, landed: false, groundTime: 1, airTime: 0,
    combo: 0, gliding: 0, flightDist: 0, underwater: false, depth: 0, height: 0,
    // stats
    maxSpeed: 0, bestFlight: 0, bestCombo: 0, bestHeight: 0, hops: 0, perfects: 0, stings: 0,
  };
  p.feetY = groundAt(p.x, p.z);
  return p;
}

export function eyeY(p) { return p.feetY + p.eyeH; }
export function hSpeed(p) { return Math.hypot(p.vx, p.vz); }

const pos = { x: 0, z: 0 }, vel = { x: 0, z: 0 };

// Move horizontally with tree/building collision and a step-height limit so
// pool edges, walls and similar ledges block movement from below.
function moveXZ(p, dt, refY, stepUp) {
  pos.x = p.x + p.vx * dt; pos.z = p.z + p.vz * dt;
  vel.x = p.vx; vel.z = p.vz;
  resolveCollisions(pos, vel, PC.RADIUS, refY);
  const g = groundAt(pos.x, pos.z);
  if (g - refY > stepUp) {
    // blocked: try sliding along each axis
    const gx = groundAt(pos.x, p.z), gz = groundAt(p.x, pos.z);
    if (gx - refY <= stepUp) { pos.z = p.z; vel.z = 0; }
    else if (gz - refY <= stepUp) { pos.x = p.x; vel.x = 0; }
    else { pos.x = p.x; pos.z = p.z; vel.x = 0; vel.z = 0; }
  }
  // soft edge of the dream
  let fx = 0, fz = 0;
  if (pos.x > 470) fx = -(pos.x - 470) * 2; else if (pos.x < -470) fx = -(pos.x + 470) * 2;
  if (pos.z > 500) fz = -(pos.z - 500) * 2; else if (pos.z < -300) fz = -(pos.z + 300) * 2;
  vel.x += fx * dt; vel.z += fz * dt;
  p.x = pos.x; p.z = pos.z; p.vx = vel.x; p.vz = vel.z;
}

function accelerate(p, wx, wz, wishSpeed, accel, dt) {
  const cur = p.vx * wx + p.vz * wz;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  const a = Math.min(accel * dt, add);
  p.vx += a * wx; p.vz += a * wz;
}

function doJump(p, depthF, kind, wx, wz, wishLen, events) {
  const slow = p.poison > 0 ? PC.POISON_SLOW : 1;
  let sp = Math.hypot(p.vx, p.vz);
  if (kind !== 'first') {
    // chained hop: keep momentum; water costs some unless the timing is perfect
    if (kind === 'auto') sp *= 1 - (0.03 + 0.08 * depthF);
    if (wishLen > 0.1) {
      let boost;
      if (kind === 'perfect') boost = PC.HOP_PERFECT * clamp(1 - (sp - 7) / 24, 0.3, 1);
      else boost = PC.HOP_AUTO * clamp(1 - (sp - 6) / 8, 0, 1);
      boost *= slow;
      // steer a little towards where the player wants to go
      const cur = Math.hypot(p.vx, p.vz);
      const dx = cur > 0.01 ? p.vx / cur : wx, dz = cur > 0.01 ? p.vz / cur : wz;
      let nx = dx + wx * 0.25, nz = dz + wz * 0.25;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      sp += boost;
      p.vx = nx * sp; p.vz = nz * sp;
    } else {
      const cur = Math.hypot(p.vx, p.vz) || 1;
      p.vx *= sp / cur; p.vz *= sp / cur;
    }
    p.combo++;
    if (kind === 'perfect') p.perfects++;
    if (p.combo > p.bestCombo) p.bestCombo = p.combo;
  } else {
    p.combo = 0;
  }
  p.hops++;
  p.vy = PC.JUMP_V * (1 - 0.3 * depthF) * (p.poison > 0 ? 0.85 : 1);
  p.mode = 'air';
  p.airTime = 0;
  p.flightDist = 0;
  p.jumpAge = 99;
  events.push({ type: 'hop', kind, depth: depthF, speed: sp, combo: p.combo, x: p.x, z: p.z });
}

/**
 * Advance the player by one fixed step.
 * input: { mx, mz, jump, down, sprint, yaw, pitch }
 */
export function stepPlayer(p, input, dt, time, events) {
  p.yaw = input.yaw; p.pitch = input.pitch;
  if (input.jump && !p.prevJump) p.jumpAge = 0; else p.jumpAge += dt;
  p.prevJump = input.jump;
  p.invuln = Math.max(0, p.invuln - dt);
  p.stingCool = Math.max(0, p.stingCool - dt);
  p.poison = Math.max(0, p.poison - dt);
  p.sinceHurt += dt;
  const slow = p.poison > 0 ? PC.POISON_SLOW : 1;

  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  // forward = (-sy, -cy), right = (cy, -sy)
  let wx = -sy * input.mz + cy * input.mx;
  let wz = -cy * input.mz - sy * input.mx;
  let wishLen = Math.hypot(wx, wz);
  if (wishLen > 1) { wx /= wishLen; wz /= wishLen; wishLen = 1; }
  else if (wishLen > 1e-4) { wx /= wishLen; wz /= wishLen; }

  let ground = groundAt(p.x, p.z);
  let surf = waterLevelAt(p.x, p.z, time);
  let depth = surf - ground;
  const depthF = smoothstep(0.12, 1.0, depth);   // how much water slows a hop
  const wadeF = smoothstep(0.05, 0.5, depth);    // how much water slows walking

  if (p.mode === 'ground') {
    if (depth > PC.SWIM_IN) {
      p.mode = 'swim';
    } else {
      p.groundTime += dt;
      if (p.groundTime > 0.3) p.combo = 0;
      if (p.jumpAge < PC.PERFECT_WINDOW || input.jump) {
        const chained = p.landed && p.groundTime < 0.12;
        const kind = !chained ? 'first' : (p.jumpAge < PC.PERFECT_WINDOW ? 'perfect' : 'auto');
        doJump(p, depthF, kind, wx, wz, wishLen, events);
        p.landed = false;
      } else {
        // friction (Quake style), stronger in water
        const sp = Math.hypot(p.vx, p.vz);
        if (sp > 1e-4) {
          const fr = PC.FRICTION * (1 + 1.6 * wadeF);
          const drop = Math.max(sp, PC.STOP_SPEED * (1 - 0.8 * wadeF)) * fr * dt;
          const ns = Math.max(0, sp - drop) / sp;
          p.vx *= ns; p.vz *= ns;
        }
        const max = lerp(input.sprint ? PC.SPRINT : PC.WALK, PC.WADE, wadeF) * slow;
        if (wishLen > 1e-4) accelerate(p, wx, wz, max * wishLen, PC.GROUND_ACCEL * PC.WALK, dt);
        moveXZ(p, dt, p.feetY, PC.STEP_UP);
        const g = groundAt(p.x, p.z);
        if (p.feetY - g > 0.5) {
          // walked off a ledge
          p.mode = 'air'; p.vy = 0; p.airTime = 0; p.flightDist = 0; p.landed = false;
        } else {
          p.feetY = g; p.vy = 0;
        }
      }
      p.eyeH += (PC.EYE - p.eyeH) * (1 - Math.exp(-7 * dt));
    }
  }

  if (p.mode === 'air') {
    p.airTime += dt;
    // air strafing
    if (wishLen > 1e-4) accelerate(p, wx, wz, PC.AIR_CAP, PC.AIR_RATE, dt);
    // glide: at speed, holding jump turns the body into a wing
    let sp = Math.hypot(p.vx, p.vz);
    let lift = 0;
    const above = p.feetY - Math.max(ground, surf);
    if (input.jump && sp > PC.GLIDE_MIN && p.airTime > 0.12) {
      const frac = clamp((sp - PC.GLIDE_MIN) / (PC.GLIDE_FULL - PC.GLIDE_MIN), 0, 1);
      lift = PC.GLIDE_LIFT * frac * (1 - smoothstep(PC.GLIDE_CEIL0, PC.GLIDE_CEIL1, above));
      const k = lift / PC.GLIDE_LIFT;
      // bank towards the view direction
      const fx = -sy, fz = -cy;
      const cross = (p.vx * fz - p.vz * fx) / sp, dot = (p.vx * fx + p.vz * fz) / sp;
      const turn = clamp(Math.atan2(cross, dot), -1.7 * dt, 1.7 * dt) * k;
      const ct = Math.cos(turn), st = Math.sin(turn);
      const nvx = p.vx * ct - p.vz * st, nvz = p.vx * st + p.vz * ct;
      p.vx = nvx; p.vz = nvz;
      // pull up / push down: rotate the velocity in the vertical plane, which
      // trades speed for height (and back) the way a real glide does
      const want = Math.sin(p.pitch);
      const w = PC.GLIDE_PULL * want * k * dt;
      if (w !== 0) {
        const nvh = sp * Math.cos(w) - p.vy * Math.sin(w);
        const nvy = sp * Math.sin(w) + p.vy * Math.cos(w);
        if (nvh > 1) { p.vx *= nvh / sp; p.vz *= nvh / sp; p.vy = nvy; sp = nvh; }
      }
      // drag
      const ns = Math.max(0, sp - PC.GLIDE_DRAG * k * dt) / sp;
      p.vx *= ns; p.vz *= ns;
      if (p.vy > 0) lift *= 0.75;
    }
    p.gliding += ((lift > 0.15 ? 1 : 0) - p.gliding) * (1 - Math.exp(-8 * dt));
    p.vy -= PC.GRAVITY * (1 - lift) * dt;
    p.feetY += p.vy * dt;
    const px = p.x, pz = p.z;
    moveXZ(p, dt, p.feetY, 0.35);
    p.flightDist += Math.hypot(p.x - px, p.z - pz);
    ground = groundAt(p.x, p.z);
    surf = waterLevelAt(p.x, p.z, time);
    depth = surf - ground;
    p.height = p.feetY - Math.max(ground, surf);
    if (p.height > p.bestHeight) p.bestHeight = p.height;
    if (depth > PC.SWIM_IN && surf - p.feetY > 0.95) {
      // plunged into deep water
      p.mode = 'swim';
      if (p.flightDist > p.bestFlight) p.bestFlight = p.flightDist;
      events.push({ type: 'plunge', speed: Math.hypot(p.vx, p.vz, p.vy), x: p.x, z: p.z });
      p.vx *= 0.55; p.vz *= 0.55; p.vy *= 0.35;
      p.combo = 0; p.landed = false;
    } else if (p.feetY <= ground && p.vy <= 0) {
      p.feetY = ground;
      p.mode = 'ground';
      p.groundTime = 0;
      p.landed = true;
      if (p.flightDist > p.bestFlight) p.bestFlight = p.flightDist;
      const dF = smoothstep(0.12, 1.0, depth);
      events.push({ type: 'land', depth: dF, speed: Math.hypot(p.vx, p.vz), vy: p.vy, x: p.x, z: p.z });
      p.vy = 0;
      if (p.jumpAge < PC.PERFECT_WINDOW || input.jump) {
        // hop on the very same step: no ground friction at all
        doJump(p, dF, p.jumpAge < PC.PERFECT_WINDOW ? 'perfect' : 'auto', wx, wz, wishLen, events);
        p.landed = false;
      } else {
        // a flat landing in water costs speed immediately
        const k = 1 - 0.45 * dF;
        p.vx *= k; p.vz *= k;
      }
    }
    p.eyeH += (PC.EYE - p.eyeH) * (1 - Math.exp(-7 * dt));
  } else {
    p.gliding += (0 - p.gliding) * (1 - Math.exp(-8 * dt));
    p.height = 0;
  }

  if (p.mode === 'swim') {
    let ey = p.feetY + p.eyeH;
    p.eyeH += (PC.EYE_SWIM - p.eyeH) * (1 - Math.exp(-5 * dt));
    if (depth < PC.SWIM_OUT) {
      // shallow enough to stand up
      p.mode = 'ground';
      p.eyeH = clamp(ey - ground, PC.EYE_SWIM, PC.EYE);
      p.feetY = ground;
      p.groundTime = 1; p.landed = false; p.vy = 0;
    } else {
      const sp = (input.sprint ? PC.SWIM_SPRINT : PC.SWIM_SPEED) * slow;
      const cp = Math.cos(p.pitch), spz = Math.sin(p.pitch);
      // desired velocity: full 3D along the view direction
      const dx = (-sy * cp * input.mz + cy * input.mx) * sp;
      const dz = (-cy * cp * input.mz - sy * input.mx) * sp;
      let dy = spz * input.mz * sp;
      if (input.jump) dy += sp * 0.8;
      if (input.down) dy -= sp * 0.8;
      const submerged = ey < surf - 0.05;
      if (!input.down && Math.abs(input.mz) < 0.05 && !input.jump) dy += submerged ? 0.45 : 0;
      const k = 1 - Math.exp(-3.2 * dt);
      p.vx += (dx - p.vx) * k; p.vz += (dz - p.vz) * k; p.vy += (dy - p.vy) * k;
      moveXZ(p, dt, ey - 0.35, 0.95);
      ey += p.vy * dt;
      ground = groundAt(p.x, p.z);
      surf = waterLevelAt(p.x, p.z, time);
      // stay in the water: float line on top, sea bed below
      const top = surf + 0.12;
      if (ey > top) { ey += (top - ey) * (1 - Math.exp(-14 * dt)); if (p.vy > 0) p.vy *= Math.exp(-10 * dt); }
      if (ey < ground + 0.35) { ey = ground + 0.35; if (p.vy < 0) p.vy = 0; }
      p.feetY = ey - p.eyeH;
    }
  }

  // --- breath & health ---------------------------------------------------------
  surf = waterLevelAt(p.x, p.z, time);
  const eye = p.feetY + p.eyeH;
  p.underwater = eye < surf - 0.04;
  p.depth = surf - groundAt(p.x, p.z);
  if (p.underwater) {
    p.o2 = Math.max(0, p.o2 - dt / PC.BREATH);
    if (p.o2 <= 0) { p.health -= 14 * dt; p.sinceHurt = 0; }
  } else {
    p.o2 = Math.min(1, p.o2 + dt / 2.5);
  }
  if (p.sinceHurt > 6 && p.poison <= 0 && p.health < 100) p.health = Math.min(100, p.health + 5 * dt);

  const s = Math.hypot(p.vx, p.vz);
  if (s > p.maxSpeed) p.maxSpeed = s;
}

export function respawnPlayer(p) {
  p.x = SPAWN.x; p.z = SPAWN.z; p.feetY = groundAt(p.x, p.z); p.eyeH = PC.EYE;
  p.vx = p.vy = p.vz = 0; p.mode = 'ground'; p.health = 100; p.o2 = 1; p.poison = 0;
  p.invuln = 2; p.combo = 0; p.groundTime = 1; p.landed = false; p.gliding = 0;
}
