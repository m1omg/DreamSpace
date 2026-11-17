// Node checks for the simulation. Run: node tests/sim.test.mjs
//
// 1. Frame-rate independence: the same scripted input played back at very
//    different display rates must end in exactly the same state.
// 2. Sanity of the world and of the movement model: bunny hopping in the
//    shallows is much faster than wading and outruns a crocodile; wading
//    does not; glides can climb; stingrays and lionfish sting.

import { createGame, advance, stepGame, STEP } from '../src/sim/game.js';
import { groundAt, waterLevelAt, terrainHeight, shoreZ, reefD, lagoonMask, channelMask, flatMask } from '../src/sim/terrain.js';
import { LAYOUT } from '../src/sim/layout.js';
import { PC } from '../src/sim/player.js';
import { CC } from '../src/sim/croc.js';

let failed = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
}
const inp0 = () => ({ mx: 0, mz: 0, jump: false, down: false, sprint: false, yaw: Math.PI, pitch: 0 });

// Input as a pure function of simulation time.
function script(t) {
  const inp = inp0();
  if (t < 4) { inp.mz = 1; inp.sprint = true; }                         // run down the beach into the sea
  else if (t < 26) { inp.mz = 1; inp.sprint = true; inp.pitch = t < 12 ? -0.25 : 0.1; } // swim, dive a bit
  else if (t < 30) { inp.mz = 1; inp.jump = true; }
  else { inp.mz = 1; inp.mx = Math.sin(t * 2) > 0 ? 1 : -1; inp.jump = Math.sin(t * 9) > -0.8; inp.yaw = Math.PI + 0.3 * Math.sin(t * 2); inp.pitch = 0.3 * Math.sin(t * 0.7); }
  return inp;
}

function runAt(fps, seconds, jitter = 0) {
  const g = createGame();
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const target = Math.round(seconds / STEP);
  let steps = 0;
  while (steps < target) {
    let dt = 1 / fps;
    if (jitter) dt *= 1 + (rnd() - 0.5) * jitter;
    g.acc += dt;
    while (g.acc >= STEP && steps < target) {
      stepGame(g, script(g.time));
      g.acc -= STEP;
      steps++;
    }
  }
  const p = g.player;
  const cs = g.crocs.reduce((a, c) => a + c.x * 3 + c.z, 0), hs = g.hazards.lions.reduce((a, l) => a + l.x + l.y + l.z, 0);
  return { x: p.x, z: p.z, y: p.feetY, vx: p.vx, vz: p.vz, hp: p.health, mode: p.mode, hops: p.hops, cs, hs };
}

// --- 1. frame-rate independence ------------------------------------------------
{
  const ref = runAt(60, 60);
  for (const [fps, jit] of [[24, 0], [30, 0.6], [59.94, 0], [75, 0], [144, 0.4], [165, 0], [240, 0], [360, 0.8]]) {
    const r = runAt(fps, 60, jit);
    const same = r.x === ref.x && r.z === ref.z && r.y === ref.y && r.vx === ref.vx && r.hp === ref.hp && r.hops === ref.hops && r.cs === ref.cs && r.hs === ref.hs;
    check(`identical result at ${fps} Hz${jit ? ' (jittered frames)' : ''}`, same,
      `x=${r.x.toFixed(4)} z=${r.z.toFixed(4)} hops=${r.hops}`);
  }
  console.log(`     reference @60 Hz: x=${ref.x.toFixed(4)} z=${ref.z.toFixed(4)} mode=${ref.mode} hops=${ref.hops} hp=${ref.hp.toFixed(1)}`);
}
{
  const g1 = createGame(), g2 = createGame();
  const inp = () => ({ ...inp0(), mz: 1, jump: true });
  let n1 = 0, n2 = 0;
  for (let i = 0; i < 300; i++) n1 += advance(g1, 1 / 30, inp);
  for (let i = 0; i < 1440; i++) n2 += advance(g2, 1 / 144, inp);
  check('advance(): same number of steps for 10 s at 30 and 144 Hz', Math.abs(n1 - n2) <= 1, `${n1} vs ${n2}`);
  check('advance(): positions agree', Math.abs(g1.player.z - g2.player.z) < 0.3, `${g1.player.z.toFixed(3)} vs ${g2.player.z.toFixed(3)}`);
}

// --- 2. world sanity ----------------------------------------------------------
{
  check('spawn is on dry sand', groundAt(6, -9) > 0.2, `y=${groundAt(6, -9).toFixed(2)}`);
  check('near-shore lagoon is swimmable', -terrainHeight(20, shoreZ(20) + 60) > PC.SWIM_IN, `depth=${(-terrainHeight(20, shoreZ(20) + 60)).toFixed(2)}`);
  let shallow = 0, n = 0;
  for (let x = -300; x <= 300; x += 9) for (let d = 122; d < reefD(x) - 20; d += 9) {
    if (lagoonMask(x, d) > 0.01 || flatMask(x, d) < 0.9) continue;
    n++;
    if (-terrainHeight(x, shoreZ(x) + d) < PC.SWIM_OUT) shallow++;
  }
  check('mangrove flat is mostly too shallow to swim', shallow / n > 0.8, `${(100 * shallow / n).toFixed(0)}% of ${n} samples`);
  check('big lagoon has a deep core', terrainHeight(26, shoreZ(26) + 258) < -8, `y=${terrainHeight(26, shoreZ(26) + 258).toFixed(1)}`);
  check('reef edge bulges offshore in front of the resort', reefD(0) > 380 && reefD(-325) < 120, `${reefD(0).toFixed(0)} m / ${reefD(-325).toFixed(0)} m`);
  check('open sea is deep', terrainHeight(0, shoreZ(0) + reefD(0) + 70) < -20);
  check('mangroves placed', LAYOUT.mangroves.length > 500, `${LAYOUT.mangroves.length}`);
  const grove = LAYOUT.mangroves.filter((m) => m.x > 96 && m.x < 212 && m.z - shoreZ(m.x) < 34).length;
  check('real mangrove stand by the beach is dense', grove > 60, `${grove} trees`);
  check('palms, units, hazards placed', LAYOUT.palms.length > 120 && LAYOUT.units.length > 100 && LAYOUT.rays.length > 150 && LAYOUT.lionfish.length > 20,
    `${LAYOUT.palms.length} palms, ${LAYOUT.units.length} units, ${LAYOUT.rays.length} rays, ${LAYOUT.lionfish.length} lionfish`);
  for (const p of LAYOUT.pearls) {
    const dep = waterLevelAt(p.x, p.z, 0) - groundAt(p.x, p.z);
    if (p.kind === 'islet' && dep > 0.9) check('islet pearl reachable on foot', false, `pearl at ${p.x},${p.z} depth ${dep.toFixed(2)}`);
  }
  const b = LAYOUT.boxes[0];
  check('roofs are part of the ground', Math.abs(groundAt(b.x, b.z) - b.top) < 1e-6 && groundAt(b.x, b.z) > terrainHeight(b.x, b.z) + 3);
}

// --- 3. movement model ----------------------------------------------------------
function findLane() {
  // a straight stretch of open flat without trees, heading -x
  let best = null;
  for (let d = 120; d < 236; d += 3) for (let x0 = 300; x0 > -160; x0 -= 6) {
    const z = shoreZ(x0) + d;
    let len = 0;
    for (let s = 0; s < 220; s += 2) {
      const x = x0 - s, dd = z - shoreZ(x);
      if (channelMask(x, dd) > 0.01 || lagoonMask(x, dd) > 0.01 || flatMask(x, dd) < 0.9 || terrainHeight(x, z) > -0.15) break;
      if (LAYOUT.mangroves.some((m) => Math.abs(m.z - z) < 2.2 && Math.abs(m.x - x) < 2.2)) break;
      len = s;
    }
    if (!best || len > best.len) best = { x: x0, z, len };
  }
  return best;
}
const lane = findLane();
console.log(`     test lane: ${lane.len} m of open flat from x=${lane.x}, z=${lane.z.toFixed(0)}`);
function flatRun(mode, seconds, pitch = 0) {
  const g = createGame();
  const p = g.player;
  p.x = lane.x; p.z = lane.z; p.feetY = groundAt(p.x, p.z);
  g.crocs.length = 0; g.hazards.rays.length = 0; g.hazards.lions.length = 0;
  const start = { x: p.x, z: p.z };
  let maxSp = 0;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) {
    const inp = { ...inp0(), mz: 1, sprint: true, yaw: Math.PI / 2 };
    if (mode === 'auto') inp.jump = true;
    if (mode === 'perfect') {
      // hold jump in the air (glide), let go just above the ground and
      // press again right before touching down
      const h = p.feetY - groundAt(p.x, p.z);
      inp.jump = !(p.mode === 'air' && p.vy < 0 && h < 0.7 && h > 0.25);
      if (i * STEP > 5) inp.pitch = pitch;
    }
    stepGame(g, inp);
    maxSp = Math.max(maxSp, Math.hypot(p.vx, p.vz));
  }
  return { dist: Math.hypot(p.x - start.x, p.z - start.z), maxSp, best: p.bestFlight, height: p.bestHeight };
}
{
  const wade = flatRun('wade', 8), auto = flatRun('auto', 8), perfect = flatRun('perfect', 8), climb = flatRun('perfect', 9, 0.6);
  console.log(`     8 s on the flat: wade ${wade.dist.toFixed(1)} m (max ${wade.maxSp.toFixed(1)} m/s), ` +
    `hold-jump ${auto.dist.toFixed(1)} m (max ${auto.maxSp.toFixed(1)}), timed hops ${perfect.dist.toFixed(1)} m (max ${perfect.maxSp.toFixed(1)}, best flight ${perfect.best.toFixed(1)} m, height ${perfect.height.toFixed(1)} m), pull-up height ${climb.height.toFixed(1)} m`);
  check('wading is slow', wade.maxSp < 3.6, `${wade.maxSp.toFixed(2)} m/s`);
  check('held bunny hop beats crocodile cruise speed', auto.maxSp > CC.SPEED_SHALLOW + 0.5, `${auto.maxSp.toFixed(2)} vs ${CC.SPEED_SHALLOW} m/s`);
  check('timed bunny hops are faster still', perfect.maxSp > auto.maxSp + 2.5, `${perfect.maxSp.toFixed(2)} m/s`);
  check('fast hops turn into long glides', perfect.best > 18, `${perfect.best.toFixed(1)} m`);
  check('pulling up in a glide gains real height', climb.height > 4 && climb.height < 16, `${climb.height.toFixed(1)} m`);
}

// --- 4. chase outcomes ------------------------------------------------------------
function chase(mode) {
  const g = createGame();
  const p = g.player;
  // a crocodile at the far end of the open lane; flee straight along it
  const c = g.crocs[0];
  g.crocs = [c]; g.hazards.rays.length = 0; g.hazards.lions.length = 0;
  c.x = c.hx = lane.x + 26; c.z = c.hz = lane.z; c.tx = c.x; c.tz = c.z;
  p.x = lane.x; p.z = lane.z; p.feetY = groundAt(p.x, p.z);
  let bites = 0, minDist = 99;
  for (let i = 0; i < 14 / STEP; i++) {
    stepGame(g, { ...inp0(), mz: 1, jump: mode !== 'wade', sprint: true, yaw: Math.PI / 2 });
    for (const e of g.events) if (e.type === 'bite') bites++;
    g.events.length = 0;
    minDist = Math.min(minDist, Math.hypot(p.x - c.x, p.z - c.z));
  }
  return { bites, minDist, wake: g.wakeups };
}
{
  const w = chase('wade'), h = chase('hop');
  console.log(`     chase: wading -> ${w.bites} bites, ${w.wake} wake-ups; hopping -> ${h.bites} bites, closest ${h.minDist.toFixed(1)} m`);
  check('wading away from a crocodile gets you bitten', w.bites >= 1);
  check('bunny hopping away escapes', h.bites === 0, `closest ${h.minDist.toFixed(1)} m`);
}

// --- 5. venomous wildlife ---------------------------------------------------------------
{
  const g = createGame(); g.crocs.length = 0;
  const p = g.player, r = g.hazards.rays[0];
  p.x = r.x + 0.2; p.z = r.z; p.feetY = groundAt(p.x, p.z);
  let stung = false;
  for (let i = 0; i < 30; i++) { stepGame(g, inp0()); for (const e of g.events) if (e.type === 'sting' && e.kind === 'ray') stung = true; g.events.length = 0; }
  check('stepping on a stingray stings and poisons', stung && p.poison > 0 && p.health < 100, `hp=${p.health.toFixed(0)} poison=${p.poison.toFixed(1)} s`);
  const wadePoison = (() => { for (let i = 0; i < 240; i++) stepGame(g, { ...inp0(), mz: 1, sprint: true }); return Math.hypot(p.vx, p.vz); })();
  check('poison slows movement', wadePoison < PC.SPRINT * 0.8, `${wadePoison.toFixed(2)} m/s`);

  const g2 = createGame(); g2.crocs.length = 0;
  const q = g2.player, l = g2.hazards.lions[0];
  q.x = l.x; q.z = l.z; q.mode = 'swim'; q.eyeH = PC.EYE_SWIM; q.feetY = l.y - 0.3;
  let stung2 = false;
  for (let i = 0; i < 30; i++) { stepGame(g2, inp0()); for (const e of g2.events) if (e.type === 'sting' && e.kind === 'lionfish') stung2 = true; g2.events.length = 0; }
  check('touching a lionfish stings', stung2 && q.poison > 0);
  const jumped = createGame(); jumped.crocs.length = 0;
  const j = jumped.player, r2 = jumped.hazards.rays[0];
  j.x = r2.x; j.z = r2.z; j.feetY = groundAt(j.x, j.z) + 1.2; j.mode = 'air'; j.vy = 3;
  let stung3 = false;
  for (let i = 0; i < 20; i++) { stepGame(jumped, inp0()); for (const e of jumped.events) if (e.type === 'sting') stung3 = true; jumped.events.length = 0; }
  check('flying over a stingray is safe', !stung3);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
