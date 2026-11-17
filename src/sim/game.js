// Game state + fixed-timestep driver.
//
// `advance(realDt, input)` may be called at any display rate. It always runs
// the simulation in identical STEP-sized slices, so physics, AI and timers
// behave the same at 30, 60, 144 or 360 Hz. Rendering interpolates between
// the last two simulation states with `alpha`.

import { createPlayer, stepPlayer, respawnPlayer, eyeY } from './player.js';
import { createCroc, stepCroc, resetCroc, CC } from './croc.js';
import { LAYOUT } from './layout.js';
import { shoreZ } from './terrain.js';

export const STEP = 1 / 120;
const MAX_STEPS = 12; // per frame; beyond this the game slows down instead of spiralling

export function createGame() {
  const g = {
    time: 0, acc: 0, alpha: 0,
    player: createPlayer(),
    crocs: LAYOUT.crocs.map((h, i) => createCroc(h, i)),
    pearls: LAYOUT.pearls.map((p, i) => ({ ...p, index: i, taken: false })),
    collected: 0, wakeups: 0, playTime: 0, won: false, allFound: false,
    events: [], danger: 0, chasing: 0,
    prev: null,
  };
  g.prev = snapshot(g);
  return g;
}

function snapshot(g, out) {
  const p = g.player;
  out = out || { px: 0, py: 0, pz: 0, crocs: g.crocs.map(() => ({ x: 0, z: 0, yaw: 0 })) };
  out.px = p.x; out.py = eyeY(p); out.pz = p.z;
  for (let i = 0; i < g.crocs.length; i++) {
    const c = g.crocs[i], o = out.crocs[i];
    o.x = c.x; o.z = c.z; o.yaw = c.yaw;
  }
  return out;
}

export function stepGame(g, input) {
  const p = g.player, ev = g.events, dt = STEP;
  g.time += dt;
  if (!g.won) g.playTime += dt;

  stepPlayer(p, input, dt, g.time, ev);

  let chasing = 0, nearest = 1e9;
  for (const c of g.crocs) {
    stepCroc(c, p, dt, g.time, ev);
    if (c.state === 'chase' || c.state === 'windup' || c.state === 'lunge' || c.state === 'alert') {
      chasing++;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < nearest) nearest = d;
    }
  }
  g.chasing = chasing;
  const targetDanger = chasing ? Math.max(0.25, 1 - nearest / 40) : 0;
  g.danger += (targetDanger - g.danger) * (1 - Math.exp(-3 * dt));

  // bites are applied here so the player module stays independent of crocs
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.type === 'bite' && !e.applied) {
      e.applied = true;
      p.health -= CC.DAMAGE;
      p.invuln = 1.5; p.sinceHurt = 0;
      p.vx = e.dirX * 7.5; p.vz = e.dirZ * 7.5;
      if (p.mode !== 'swim') { p.mode = 'air'; p.vy = 4.2; p.airTime = 0; p.flightDist = 0; p.landed = false; }
      p.combo = 0;
    }
  }

  // pearls
  const ey = eyeY(p);
  for (const pearl of g.pearls) {
    if (pearl.taken) continue;
    const dx = pearl.x - p.x, dz = pearl.z - p.z;
    if (dx * dx + dz * dz > 4.2) continue;
    const dy = pearl.y - (p.feetY + 0.9);
    if (Math.abs(dy) > 1.7 && Math.abs(pearl.y - ey) > 1.2) continue;
    pearl.taken = true;
    g.collected++;
    ev.push({ type: 'pearl', index: pearl.index, x: pearl.x, y: pearl.y, z: pearl.z, count: g.collected });
    if (g.collected === g.pearls.length) { g.allFound = true; ev.push({ type: 'allFound' }); }
  }

  // waking up: the dream restarts on the beach, pearls stay collected
  if (p.health <= 0) {
    g.wakeups++;
    ev.push({ type: 'wake' });
    respawnPlayer(p);
    for (const c of g.crocs) resetCroc(c);
  }

  // finish: all pearls and back on the dry beach
  if (g.allFound && !g.won && p.mode === 'ground' && p.z - shoreZ(p.x) < -3 && p.feetY > 0.3) {
    g.won = true;
    ev.push({ type: 'win' });
  }
}

/**
 * Advance by a real-time delta. `sample` is called before every fixed step to
 * read the current input, so held keys act identically at any frame rate.
 */
export function advance(g, realDt, sample) {
  if (realDt > 0.25) realDt = 0.25; // tab was in the background
  g.acc += realDt;
  let n = 0;
  while (g.acc >= STEP && n < MAX_STEPS) {
    snapshot(g, g.prev);
    stepGame(g, sample());
    g.acc -= STEP;
    n++;
  }
  if (n === MAX_STEPS && g.acc > STEP) g.acc = 0;
  g.alpha = g.acc / STEP;
  return n;
}

export { LAYOUT };
