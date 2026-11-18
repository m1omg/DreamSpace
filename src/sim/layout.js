// Procedural placement of everything that stands on the map, plus the
// collision structures built from it. Deterministic (seeded).

import { mulberry32, fbm, hash2 } from './noise.js';
import {
  BUILDINGS, BLOCKS, HUTS, POOLS, PEARLS, CROC_EXTRA, BOMMIES, LAGOONS, GROVE, VOLLEYBALL,
} from './mapdata.js';
import {
  shoreZ, terrainHeight, flatMask, channelMask, lagoonMask, groundAt, reefD, poolQ, ISLETS, setRoofs,
  setBommies, bommieAt, bommieRadius,
} from './terrain.js';

export const UNIT_W = 4.5;
// coral colonies: [radius, height] of each kind at scale 1 (boulder, table, staghorn, sponge)
export const CORAL_SIZE = [[0.46, 0.58], [0.66, 0.6], [0.34, 0.8], [0.3, 0.85]];

function build() {
  const rnd = mulberry32(20261117);
  const L = {
    units: [], boxes: [], palms: [], bushes: [], umbrellas: [], sunbeds: [], mangroves: [], buoys: [],
    pearls: [], crocs: [], bommies: [], seagrass: [], reefCorals: [], corals: [], rays: [], lionfish: [], lamps: [],
  };

  // --- buildings -------------------------------------------------------------
  // serrated room blocks become rows of identical units
  for (const b of BLOCKS) {
    const dx = b.x1 - b.x0, dz = b.z1 - b.z0, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len, rot = Math.atan2(-uz, ux);
    const n = Math.max(2, Math.round(len / UNIT_W));
    const depth = b.kind === 'rooms' ? 11.2 : 6.4, h = b.kind === 'rooms' ? 6.9 : 3.5;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const baseY = terrainHeight(cx, cz);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const stag = b.kind === 'rooms' ? ([0, 1, 2, 1][i % 4] - 1) * 0.85 : 0;
      // lateral = perpendicular to the row
      const x = b.x0 + dx * t - uz * stag, z = b.z0 + dz * t + ux * stag;
      L.units.push({ kind: b.kind, x, z, y: baseY, rot, end: i === 0 ? -1 : i === n - 1 ? 1 : 0 });
    }
    L.boxes.push({ x: cx, z: cz, hw: (n * UNIT_W) / 2, hd: depth / 2 + (b.kind === 'rooms' ? 0.9 : 0), rot, top: baseY + h });
  }
  for (const b of BUILDINGS) {
    b.y = terrainHeight(b.x, b.z);
    L.boxes.push({ x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, rot: b.rot, top: b.y + b.h });
  }
  for (const b of L.boxes) { b.c = Math.cos(b.rot); b.s = Math.sin(b.rot); b.rad = Math.hypot(b.hw, b.hd) + 0.5; }

  const insideBuilding = (x, z, margin) => {
    for (const b of L.boxes) {
      const ox = x - b.x, oz = z - b.z;
      if (Math.abs(ox) > b.rad + margin || Math.abs(oz) > b.rad + margin) continue;
      const lx = ox * b.c - oz * b.s, lz = ox * b.s + oz * b.c;
      if (Math.abs(lx) < b.hw + margin && Math.abs(lz) < b.hd + margin) return true;
    }
    return false;
  };
  const nearPool = (x, z, margin) => POOLS.some((p) => poolQ(p, x, z, margin) < 1);
  const nearHut = (x, z, margin) => HUTS.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + margin);
  const onCourt = (x, z) => Math.abs(x - VOLLEYBALL.x) < VOLLEYBALL.w / 2 + 2 && Math.abs(z - VOLLEYBALL.z) < VOLLEYBALL.d / 2 + 2;

  // --- pearls & crocodiles -------------------------------------------------------
  for (const p of PEARLS) {
    const z = p.d + shoreZ(p.x);
    L.pearls.push({ x: p.x, z, y: terrainHeight(p.x, z) + 0.6, kind: p.kind });
  }
  const isl = [...ISLETS].sort((a, b) => a.x - b.x);
  const pearlIdx = new Set();
  for (let i = 0; i < 7; i++) pearlIdx.add(Math.round((i + 0.5) * (isl.length - 1) / 7));
  isl.forEach((s, i) => {
    const z = s.d + shoreZ(s.x);
    if (pearlIdx.has(i)) {
      L.pearls.push({ x: s.x, z, y: terrainHeight(s.x, z) + 0.75, kind: 'islet' });
    } else {
      const a = rnd() * 6.283;
      L.crocs.push({ x: s.x + Math.cos(a) * 13, z: z + Math.sin(a) * 11 });
    }
  });
  for (const c of CROC_EXTRA) L.crocs.push({ x: c.x, z: c.d + shoreZ(c.x) });

  for (const b of BOMMIES) {
    const z = b.d + shoreZ(b.x);
    L.bommies.push({ x: b.x, z, y: terrainHeight(b.x, z), r: 3.0 + rnd() * 2.2, seed: (rnd() * 1e9) | 0 });
  }
  // the rocks are solid ground from here on; nothing may end up inside one
  setBommies(L.bommies);
  for (const p of L.pearls) p.y = Math.max(p.y, groundAt(p.x, p.z) + 0.6);

  // --- palms ---------------------------------------------------------------------
  const palmOk = (x, z, minD) => {
    if (insideBuilding(x, z, 2.2) || nearPool(x, z, 2.2) || nearHut(x, z, 2) || onCourt(x, z)) return false;
    for (const p of L.palms) if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD) return false;
    return true;
  };
  const addPalm = (x, z, s, y) => L.palms.push({
    x, z, y: y ?? terrainHeight(x, z), s, rot: rnd() * 6.283, v: (rnd() * 3) | 0,
  });
  for (const p of POOLS) for (const i of p.islands) addPalm(i.x, i.z, 1.0 + rnd() * 0.2, p.deckY);
  // the neat row along the promenade behind the beach
  for (let x = -BEACH_ROW; x <= BEACH_ROW; x += 9.5) {
    const px = x + (rnd() - 0.5) * 2.5, pz = shoreZ(px) - 27.5 + (rnd() - 0.5) * 1.5;
    if (palmOk(px, pz, 5)) addPalm(px, pz, 0.95 + rnd() * 0.3);
  }
  // gardens between the blocks
  for (let i = 0; i < 2600 && L.palms.length < 190; i++) {
    const px = (rnd() - 0.5) * 520, pz = -34 - rnd() * 205;
    if (palmOk(px, pz, 6.5)) addPalm(px, pz, 0.85 + rnd() * 0.55);
  }

  // --- garden bushes and lamps ------------------------------------------------------
  for (let i = 0; i < 4000 && L.bushes.length < 330; i++) {
    const bx = (rnd() - 0.5) * 520, bz = -32 - rnd() * 205;
    if (insideBuilding(bx, bz, 1.0) || nearPool(bx, bz, 7.8) || nearHut(bx, bz, 1.5) || onCourt(bx, bz)) continue;
    if (fbm(bx / 26 + 9, bz / 26, 3) < 0.47) continue;
    L.bushes.push({ x: bx, z: bz, y: terrainHeight(bx, bz), s: 0.6 + rnd() * 0.9, rot: rnd() * 6.283, t: rnd() < 0.55 ? 0 : 1 });
  }
  for (let x = -230; x <= 110; x += 19) {
    const lx = x + 4, lz = shoreZ(lx) - 31.8;
    if (!insideBuilding(lx, lz, 1) && !nearHut(lx, lz, 1)) L.lamps.push({ x: lx, z: lz, y: terrainHeight(lx, lz) });
  }

  // --- beach umbrellas and sunbeds: three rows, as on the real beach -------------------
  for (let row = 0; row < 3; row++) {
    for (let x = -236; x <= 92; x += 6.4) {
      const ux = x + (rnd() - 0.5) * 0.7 + (row % 2) * 2.2, uz = shoreZ(ux) - 6.5 - row * 5.8 + (rnd() - 0.5) * 0.5;
      if (nearHut(ux, uz, 2.6) || Math.hypot(ux - 6, uz + 9) < 3.2) continue;
      const y = terrainHeight(ux, uz);
      L.umbrellas.push({ x: ux, z: uz, y, rot: rnd() * 6.283 });
      for (const side of [-1, 1]) {
        const sx = ux + side * 1.2, sz = uz + 0.35;
        L.sunbeds.push({ x: sx, z: sz, y: terrainHeight(sx, sz), rot: Math.PI + (rnd() - 0.5) * 0.14 });
      }
    }
  }
  for (const p of POOLS) {
    if (p.id === 'kids' || p.id === 'pond') continue;
    const n = Math.round(p.rAvg * 1.25);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + 0.2;
      const rr = 1.28 + 4.3 / p.rAvg;
      const ux = p.x + Math.cos(a) * p.rx * rr, uz = p.z + Math.sin(a) * p.rz * rr;
      if (poolQ(p, ux, uz, 2.6) < 1 || insideBuilding(ux, uz, 1.8) || nearHut(ux, uz, 2.4)) continue;
      L.umbrellas.push({ x: ux, z: uz, y: p.deckY, rot: rnd() * 6.283 });
      const rot = Math.atan2(-(p.x - ux), -(p.z - uz));
      const tx = -Math.sin(a), tz = Math.cos(a);
      L.sunbeds.push({ x: ux + tx * 1.2, z: uz + tz * 1.2, y: p.deckY, rot });
      L.sunbeds.push({ x: ux - tx * 1.2, z: uz - tz * 1.2, y: p.deckY, rot });
    }
  }

  // --- mangroves ---------------------------------------------------------------------
  const cell = 6, mgGrid = new Map();
  const mgNear = (x, z, minD) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = mgGrid.get((cx + i) + ':' + (cz + j));
      if (arr) for (const m of arr) if ((m.x - x) ** 2 + (m.z - z) ** 2 < minD * minD) return true;
    }
    return false;
  };
  const keepClear = [...L.pearls.map((p) => [p.x, p.z, 4.5]), ...L.crocs.map((c) => [c.x, c.z, 4])];
  const tryMangrove = (x, z, dense) => {
    const d = z - shoreZ(x);
    if (flatMask(x, d) < 0.9 || channelMask(x, d) > 0.02 || lagoonMask(x, d) > 0.02) return;
    const y = terrainHeight(x, z);
    if (y < -0.66 || y > 0.5) return;
    if (!dense) {
      // the outer reef flat is more open than the swamp behind the lagoon
      const thin = Math.max(0, d - 235) / 420;
      if (fbm(x / 38 + 4.2, z / 38, 3) < 0.45 + thin + 0.1 * rnd()) return;
    }
    if (mgNear(x, z, dense ? 3.7 : 5.2)) return;
    for (const k of keepClear) if ((k[0] - x) ** 2 + (k[1] - z) ** 2 < k[2] * k[2]) return;
    const m = { x, z, y, s: (dense ? 0.75 : 0.8) + rnd() * 0.75, rot: rnd() * 6.283, v: (rnd() * 3) | 0 };
    L.mangroves.push(m);
    const k = Math.floor(x / cell) + ':' + Math.floor(z / cell);
    if (!mgGrid.has(k)) mgGrid.set(k, []);
    mgGrid.get(k).push(m);
  };
  // the real stand at the west end of the beach is dense
  for (let i = 0; i < 2600; i++) {
    const x = GROVE.x0 - 10 + rnd() * (GROVE.x1 - GROVE.x0 + 20);
    tryMangrove(x, shoreZ(x) + 1 + rnd() * (GROVE.d1 + 8), true);
  }
  for (let i = 0; i < 60000 && L.mangroves.length < 820; i++) {
    const x = (rnd() - 0.5) * 980;
    tryMangrove(x, shoreZ(x) + 10 + rnd() * 400, false);
  }

  // --- buoy line at the edge of the swimming lagoon -------------------------------------
  for (let x = -236; x <= 236; x += 11.8) L.buoys.push({ x, z: shoreZ(x) + 97 });

  // --- seagrass: the real flat off the beach is a seagrass meadow ---------------------------
  for (let i = 0; i < 16000 && L.seagrass.length < 5200; i++) {
    const x = (rnd() - 0.5) * 520, z = shoreZ(x) + 8 + rnd() * 92;
    const y = terrainHeight(x, z);
    if (y > -0.6 || y < -3.4) continue;
    if (fbm(x / 16 + 2.2, z / 16 + 7.7, 3) < 0.5) continue;
    L.seagrass.push({ x, z, y, s: 0.6 + rnd() * 0.9, rot: rnd() * 6.283 });
  }

  // --- corals: outer reef wall and the rims of the deep lagoons --------------------------------
  for (let i = 0; i < 9000 && L.reefCorals.length < 620; i++) {
    const x = (rnd() - 0.5) * 960, z = shoreZ(x) + reefD(x) - 4 + rnd() * 36;
    const y = terrainHeight(x, z);
    if (y > -0.55 || y < -22) continue;
    L.reefCorals.push({ x, z, y, s: 0.5 + rnd() * 1.3, rot: rnd() * 6.283, t: (rnd() * 4) | 0, c: rnd() });
  }
  for (let i = 0; i < 9000 && L.reefCorals.length < 1050; i++) {
    const Lg = LAGOONS[(rnd() * LAGOONS.length) | 0];
    const a = rnd() * 6.283, rr = 0.7 + rnd() * 0.45;
    const x = Lg.x + Math.cos(a) * Lg.rx * rr, d = Lg.d + Math.sin(a) * Lg.rd * rr;
    const m = lagoonMask(x, d);
    if (m < 0.08 || m > 0.92) continue;
    const z = d + shoreZ(x), y = terrainHeight(x, z);
    if (y > -0.7) continue;
    L.reefCorals.push({ x, z, y, s: 0.5 + rnd() * 1.1, rot: rnd() * 6.283, t: (rnd() * 4) | 0, c: rnd() });
  }
  // every coral colony, on the rocks and on the reef; the simulation collides
  // with them and the renderer draws them from the same list
  for (const b of L.bommies) {
    const r2 = mulberry32(b.seed);
    const n = 13 + ((r2() * 7) | 0);
    for (let i = 0; i < n; i++) {
      const a = r2() * 6.283, rr = Math.sqrt(r2()) * 0.86 * bommieRadius(b, a);
      const x = b.x + Math.cos(a) * rr, z = b.z + Math.sin(a) * rr;
      const t = (r2() * 4) | 0, s = 0.4 + r2() * 0.7, rot = r2() * 6.283, c = r2();
      L.corals.push({ x, z, y: groundAt(x, z), s, rot, t, c });
    }
  }
  for (const c of L.reefCorals) L.corals.push(c);
  for (const c of L.corals) {
    c.sy = c.s * (0.8 + 0.5 * hash2(Math.round(c.x * 37), Math.round(c.z * 53)));
    // nothing grows out of the water: colonies in the shallows stay small
    const f = (-0.3 - c.y) / (CORAL_SIZE[c.t][1] * c.sy);
    if (f < 1) { c.s *= f; c.sy *= f; }
  }
  L.corals = L.corals.filter((c) => c.s > 0.3);
  const inRock = (o) => bommieAt(o.x, o.z) > -1e8;
  L.seagrass = L.seagrass.filter((g) => !inRock(g));

  // --- hazards -------------------------------------------------------------------------------
  // blue-spotted stingrays resting on the bottom where people wade
  const rayOk = (x, z) => {
    for (const r of L.rays) if ((r.x - x) ** 2 + (r.z - z) ** 2 < 16) return false;
    for (const p of L.pearls) if ((p.x - x) ** 2 + (p.z - z) ** 2 < 9) return false;
    return Math.hypot(x - 6, z) > 9; // not on the very first steps into the sea
  };
  for (let i = 0; i < 3000 && L.rays.length < 44; i++) {
    const x = (rnd() - 0.5) * 500, z = shoreZ(x) + 3 + rnd() * 28;
    const y = terrainHeight(x, z);
    if (y > -0.2 || y < -1.25 || !rayOk(x, z)) continue;
    L.rays.push({ x, z, yaw: rnd() * 6.283 });
  }
  for (let i = 0; i < 20000 && L.rays.length < 230; i++) {
    const x = (rnd() - 0.5) * 900, z = shoreZ(x) + 100 + rnd() * 320;
    const d = z - shoreZ(x);
    if (flatMask(x, d) < 0.9 || channelMask(x, d) > 0.02 || lagoonMask(x, d) > 0.02) continue;
    const y = terrainHeight(x, z);
    if (y > -0.22 || y < -0.7 || !rayOk(x, z) || mgNear(x, z, 1.6)) continue;
    L.rays.push({ x, z, yaw: rnd() * 6.283 });
  }
  L.rays = L.rays.filter((r) => !inRock(r));
  // lionfish hover around coral
  for (const b of L.bommies) {
    const a = rnd() * 6.283;
    L.lionfish.push({ x: b.x + Math.cos(a) * (b.r + 0.6), z: b.z + Math.sin(a) * (b.r + 0.6), y: Math.min(-0.7, b.y + b.r * 0.35 + 0.5) });
  }
  for (let x = -330; x <= 300; x += 62) {
    const lx = x + rnd() * 20, lz = shoreZ(lx) + reefD(lx) + 9 + rnd() * 6;
    L.lionfish.push({ x: lx, z: lz, y: Math.min(-1.5, terrainHeight(lx, lz) + 1.2) });
  }

  return L;
}

const BEACH_ROW = 262;
export const LAYOUT = build();
setRoofs(LAYOUT.boxes);

// ---- colliders ---------------------------------------------------------------
// Circles (trees, huts) in a spatial hash, plus the building boxes. Every
// collider has a top: anything flying above it passes over.
const CELL = 8;
const grid = new Map();
function addCircle(x, z, r, top) {
  const c = { x, z, r, top };
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const k = i * 4096 + j;
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(c);
  }
}
for (const p of LAYOUT.palms) addCircle(p.x, p.z, 0.34 * p.s, p.y + 7 * p.s);
for (const m of LAYOUT.mangroves) addCircle(m.x, m.z, 0.62 * m.s, m.y + 4.6 * m.s);
for (const h of HUTS) addCircle(h.x, h.z, h.kind === 'tower' ? h.r : h.r - 0.6, terrainHeight(h.x, h.z) + 5.5);
for (const u of LAYOUT.umbrellas) addCircle(u.x, u.z, 0.09, u.y + 2.4);
for (const c of LAYOUT.corals) addCircle(c.x, c.z, CORAL_SIZE[c.t][0] * c.s, c.y + CORAL_SIZE[c.t][1] * c.sy);
const boxes = LAYOUT.boxes;

// Push the point (pos.x, pos.z) with radius r out of all colliders below
// `feetY`'s reach, removing the velocity component going into them.
export function resolveCollisions(pos, vel, r, feetY) {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) {
      const a = grid.get(i * 4096 + j);
      if (!a) continue;
      for (const c of a) {
        if (feetY > c.top) continue;
        const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        pos.x = c.x + nx * rr; pos.z = c.z + nz * rr;
        const vn = vel.x * nx + vel.z * nz;
        if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
        hit = true;
      }
    }
    if (pos.z < 0) for (const b of boxes) {
      if (feetY > b.top - 0.45) continue; // on or above the roof
      const ox = pos.x - b.x, oz = pos.z - b.z;
      if (Math.abs(ox) > b.rad + r || Math.abs(oz) > b.rad + r) continue;
      const lx = ox * b.c - oz * b.s, lz = ox * b.s + oz * b.c;
      const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qz = Math.max(-b.hd, Math.min(b.hd, lz));
      const dx = lx - qx, dz = lz - qz;
      const d2 = dx * dx + dz * dz;
      let nxl, nzl, pen;
      if (d2 > r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2); nxl = dx / d; nzl = dz / d; pen = r - d;
      } else {
        // centre is inside the box: leave through the nearest face
        const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
        if (px < pz) { nxl = Math.sign(lx) || 1; nzl = 0; pen = px + r; }
        else { nxl = 0; nzl = Math.sign(lz) || 1; pen = pz + r; }
      }
      const nx = nxl * b.c + nzl * b.s, nz = -nxl * b.s + nzl * b.c;
      pos.x += nx * pen; pos.z += nz * pen;
      const vn = vel.x * nx + vel.z * nz;
      if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
      hit = true;
    }
  }
  return hit;
}

export { groundAt };
