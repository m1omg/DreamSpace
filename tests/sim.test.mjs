// Node checks for the simulation. Run: node tests/sim.test.mjs
//
// 1. Frame-rate independence: the same scripted input played back at very
//    different display rates must end in exactly the same state.
// 2. Sanity of the movement model: bunny hopping in the shallows is much
//    faster than wading and outruns a crocodile; wading does not.

import { createGame, advance, stepGame, STEP } from '../src/sim/game.js';
import { groundAt, waterLevelAt, terrainHeight, shoreZ } from '../src/sim/terrain.js';
import { LAYOUT } from '../src/sim/layout.js';
import { PC } from '../src/sim/player.js';

let failed = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
}

// Input as a pure function of simulation time.
function script(t) {
  const inp = { mx: 0, mz: 0, jump: false, down: false, sprint: false, yaw: Math.PI, pitch: 0 };
  if (t < 4) { inp.mz = 1; inp.sprint = true; }                         // run down the beach into the sea
  else if (t < 30) { inp.mz = 1; inp.sprint = true; inp.pitch = t < 12 ? -0.25 : 0.1; } // swim, dive a bit
  else if (t < 34) { inp.mz = 1; inp.jump = true; }
  else { inp.mz = 1; inp.mx = Math.sin(t * 2) > 0 ? 1 : -1; inp.jump = true; inp.yaw = Math.PI + 0.3 * Math.sin(t * 2); }
  return inp;
}

function runAt(fps, seconds, jitter = 0) {
  const g = createGame();
  let wall = 0, seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // advance until an exact number of fixed steps has been simulated
  const target = Math.round(seconds / STEP);
  let steps = 0;
  while (steps < target) {
    let dt = 1 / fps;
    if (jitter) dt *= 1 + (rnd() - 0.5) * jitter;
    wall += dt;
    g.acc += dt;
    while (g.acc >= STEP && steps < target) {
      stepGame(g, script(g.time));
      g.acc -= STEP;
      steps++;
    }
  }
  const p = g.player;
  return { x: p.x, z: p.z, y: p.feetY, vx: p.vx, vz: p.vz, hp: p.health, mode: p.mode, hops: p.hops, time: g.time };
}

// --- 1. frame-rate independence ------------------------------------------------
{
  const ref = runAt(60, 60);
  for (const [fps, jit] of [[24, 0], [30, 0.6], [59.94, 0], [75, 0], [144, 0.4], [165, 0], [240, 0], [360, 0.8]]) {
    const r = runAt(fps, 60, jit);
    const same = r.x === ref.x && r.z === ref.z && r.y === ref.y && r.vx === ref.vx && r.hp === ref.hp && r.hops === ref.hops;
    check(`identical result at ${fps} Hz${jit ? ' (jittered frames)' : ''}`, same,
      `x=${r.x.toFixed(4)} z=${r.z.toFixed(4)} hops=${r.hops}`);
  }
  console.log(`     reference @60 Hz: x=${ref.x.toFixed(4)} z=${ref.z.toFixed(4)} mode=${ref.mode} hops=${ref.hops} hp=${ref.hp.toFixed(1)}`);
}

// advance() itself: step count depends only on elapsed time
{
  const g1 = createGame(), g2 = createGame();
  const inp = () => ({ mx: 0, mz: 1, jump: true, down: false, sprint: false, yaw: Math.PI, pitch: 0 });
  let n1 = 0, n2 = 0;
  for (let i = 0; i < 300; i++) n1 += advance(g1, 1 / 30, inp);
  for (let i = 0; i < 1440; i++) n2 += advance(g2, 1 / 144, inp);
  check('advance(): same number of steps for 10 s at 30 and 144 Hz', Math.abs(n1 - n2) <= 1, `${n1} vs ${n2}`);
  check('advance(): positions agree', Math.abs(g1.player.z - g2.player.z) < 0.2, `${g1.player.z.toFixed(3)} vs ${g2.player.z.toFixed(3)}`);
}

// --- 2. world sanity ----------------------------------------------------------
{
  const sx = 6;
  check('spawn is on dry sand', groundAt(sx, -6) > 0.2, `y=${groundAt(sx, -6).toFixed(2)}`);
  check('lagoon is swimmable', -terrainHeight(20, shoreZ(20) + 60) > PC.SWIM_IN, `depth=${(-terrainHeight(20, shoreZ(20) + 60)).toFixed(2)}`);
  let shallow = 0, n = 0;
  for (let x = -220; x <= 220; x += 7) for (let d = 122; d <= 226; d += 7) {
    n++;
    const dep = -terrainHeight(x, shoreZ(x) + d);
    if (dep < PC.SWIM_OUT) shallow++;
  }
  check('mangrove flat is mostly too shallow to swim', shallow / n > 0.8, `${(100 * shallow / n).toFixed(0)}% shallow`);
  check('open sea is deep', terrainHeight(0, 300) < -20, `y=${terrainHeight(0, 300).toFixed(1)}`);
  check('mangroves placed', LAYOUT.mangroves.length > 300, `${LAYOUT.mangroves.length}`);
  check('palms placed', LAYOUT.palms.length > 100, `${LAYOUT.palms.length}`);
  for (const p of LAYOUT.pearls) {
    const dep = waterLevelAt(p.x, p.z, 0) - groundAt(p.x, p.z);
    if (p.kind === 'islet' && dep > 0.9) check('islet pearl reachable on foot', false, `pearl at ${p.x},${p.z} depth ${dep.toFixed(2)}`);
  }
}

// --- 3. movement model ----------------------------------------------------------
function flatRun(mode, seconds) {
  // start on the flat, away from crocs' interest (crocs still simulate)
  const g = createGame();
  const p = g.player;
  p.x = -70; p.z = shoreZ(-70) + 122; p.feetY = groundAt(p.x, p.z);
  g.crocs.length = 0;
  const start = { x: p.x, z: p.z };
  let maxSp = 0;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) {
    const inp = { mx: 0, mz: 1, jump: false, down: false, sprint: true, yaw: Math.PI / 2, pitch: 0 };
    if (mode === 'auto') inp.jump = true;
    if (mode === 'perfect') {
      // hold jump in the air (glide), let go just above the ground and
      // press again right before touching down
      const h = p.feetY - groundAt(p.x, p.z);
      const falling = p.mode === 'air' && p.vy < 0;
      inp.jump = !(falling && h < 0.7 && h > 0.25);
    }
    stepGame(g, inp);
    maxSp = Math.max(maxSp, Math.hypot(p.vx, p.vz));
  }
  return { dist: Math.hypot(p.x - start.x, p.z - start.z), maxSp, best: p.bestFlight };
}
{
  const wade = flatRun('wade', 8), auto = flatRun('auto', 8), perfect = flatRun('perfect', 8);
  console.log(`     8 s on the flat: wade ${wade.dist.toFixed(1)} m (max ${wade.maxSp.toFixed(1)} m/s), ` +
    `hold-jump ${auto.dist.toFixed(1)} m (max ${auto.maxSp.toFixed(1)}), timed hops ${perfect.dist.toFixed(1)} m (max ${perfect.maxSp.toFixed(1)}, best flight ${perfect.best.toFixed(1)} m)`);
  check('wading is slow', wade.maxSp < 3.2, `${wade.maxSp.toFixed(2)} m/s`);
  check('held bunny hop beats crocodile cruise speed', auto.maxSp > 7.2, `${auto.maxSp.toFixed(2)} m/s`);
  check('timed bunny hops are faster still', perfect.maxSp > auto.maxSp + 1.5, `${perfect.maxSp.toFixed(2)} m/s`);
  check('fast hops turn into glides', perfect.best > 10, `${perfect.best.toFixed(1)} m`);
}

// --- 4. chase outcomes ------------------------------------------------------------
function chase(mode) {
  const g = createGame();
  const p = g.player, c = g.crocs[1];
  // stand 22 m from a crocodile, then flee straight away from it
  g.crocs = [c];
  const ang = 0.4;
  p.x = c.x + Math.sin(ang) * 22; p.z = c.z + Math.cos(ang) * 22; p.feetY = groundAt(p.x, p.z);
  const yawAway = Math.atan2(-(p.x - c.x), -(p.z - c.z)); // forward = (-sin, -cos)
  let bites = 0, minDist = 99;
  for (let i = 0; i < 20 / STEP; i++) {
    const inp = { mx: 0, mz: 1, jump: mode !== 'wade', down: false, sprint: true, yaw: yawAway, pitch: 0 };
    stepGame(g, inp);
    for (const e of g.events) if (e.type === 'bite') bites++;
    g.events.length = 0;
    minDist = Math.min(minDist, Math.hypot(p.x - c.x, p.z - c.z));
  }
  return { bites, minDist, wake: g.wakeups, hp: p.health };
}
{
  const w = chase('wade'), h = chase('hop');
  console.log(`     chase: wading -> ${w.bites} bites, ${w.wake} wake-ups; hopping -> ${h.bites} bites, closest ${h.minDist.toFixed(1)} m`);
  check('wading away from a crocodile gets you bitten', w.bites >= 1);
  check('bunny hopping away escapes', h.bites === 0, `closest ${h.minDist.toFixed(1)} m`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
