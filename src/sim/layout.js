// Procedural placement of everything that stands on the map, plus the
// collision structures built from it. Deterministic (seeded).

import { mulberry32, fbm } from './noise.js';
import {
  BUILDINGS, HUTS, POOLS, ISLETS, PEARLS, CROC_HOMES, BOMMIES, BEACH_HALF,
} from './mapdata.js';
import { shoreZ, terrainHeight, flatMask, channelMask, groundAt } from './terrain.js';

function insideBuilding(x, z, margin) {
  for (const b of BUILDINGS) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const lx = (x - b.x) * c - (z - b.z) * s, lz = (x - b.x) * s + (z - b.z) * c;
    if (Math.abs(lx) < b.w / 2 + margin && Math.abs(lz) < b.d / 2 + margin) return true;
  }
  return false;
}
function nearPool(x, z, margin) {
  for (const p of POOLS) {
    const dx = (x - p.x) / (p.rx + margin), dz = (z - p.z) / (p.rz + margin);
    if (dx * dx + dz * dz < 1) return true;
  }
  return false;
}
function nearHut(x, z, margin) {
  for (const h of HUTS) if (Math.hypot(x - h.x, z - h.z) < h.r + margin) return true;
  return false;
}

function build() {
  const rnd = mulberry32(20261117);
  const L = {
    palms: [], bushes: [], umbrellas: [], sunbeds: [], mangroves: [], buoys: [],
    pearls: [], crocs: [], bommies: [], seagrass: [], reefCorals: [],
  };

  // --- pearls & crocs (authored, resolved to world coordinates) -----------
  for (const p of PEARLS) {
    const z = p.d + shoreZ(p.x);
    const g = terrainHeight(p.x, z);
    L.pearls.push({ x: p.x, z, y: g + (p.kind === 'islet' ? 0.75 : 0.6), kind: p.kind });
  }
  for (const c of CROC_HOMES) L.crocs.push({ x: c.x, z: c.d + shoreZ(c.x) });
  for (const b of BOMMIES) {
    const z = b.d + shoreZ(b.x);
    L.bommies.push({ x: b.x, z, y: terrainHeight(b.x, z), r: 3.2 + rnd() * 2.2, seed: (rnd() * 1e9) | 0 });
  }

  // --- palms ---------------------------------------------------------------
  const palmOk = (x, z, minD) => {
    if (insideBuilding(x, z, 2.5) || nearPool(x, z, 2.5) || nearHut(x, z, 2)) return false;
    for (const p of L.palms) if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD) return false;
    return true;
  };
  const addPalm = (x, z, s) => L.palms.push({
    x, z, y: terrainHeight(x, z), s, rot: rnd() * 6.283, lean: 0.04 + rnd() * 0.12, v: (rnd() * 3) | 0,
  });
  addPalm(POOLS[0].island.x, POOLS[0].island.z, 1.15);
  L.palms[0].y = POOLS[0].deckY;
  // promenade row behind the beach
  for (let x = -BEACH_HALF - 20; x <= BEACH_HALF + 20; x += 13) {
    const px = x + (rnd() - 0.5) * 5, pz = shoreZ(px) - 40 + (rnd() - 0.5) * 4;
    if (palmOk(px, pz, 5)) addPalm(px, pz, 0.9 + rnd() * 0.4);
  }
  // gardens
  for (let i = 0; i < 1400 && L.palms.length < 150; i++) {
    const px = (rnd() - 0.5) * 560, pz = -48 - rnd() * 215;
    if (palmOk(px, pz, 7)) addPalm(px, pz, 0.8 + rnd() * 0.6);
  }
  // a few on the beach itself
  for (let i = 0; i < 200 && L.palms.length < 166; i++) {
    const px = (rnd() - 0.5) * 520, pz = shoreZ(px) - 16 - rnd() * 16;
    if (palmOk(px, pz, 11)) addPalm(px, pz, 0.9 + rnd() * 0.4);
  }

  // --- garden bushes ---------------------------------------------------------
  for (let i = 0; i < 2500 && L.bushes.length < 260; i++) {
    const bx = (rnd() - 0.5) * 570, bz = -46 - rnd() * 220;
    if (insideBuilding(bx, bz, 1.2) || nearPool(bx, bz, 7.5) || nearHut(bx, bz, 1.5)) continue;
    if (fbm(bx / 30 + 9, bz / 30, 3) < 0.5) continue;
    L.bushes.push({ x: bx, z: bz, y: terrainHeight(bx, bz), s: 0.7 + rnd() * 0.9, rot: rnd() * 6.283 });
  }

  // --- beach umbrellas and sunbeds --------------------------------------------
  for (let row = 0; row < 2; row++) {
    for (let x = -BEACH_HALF + 8; x <= BEACH_HALF - 8; x += 7.5) {
      const ux = x + (rnd() - 0.5) * 0.8, uz = shoreZ(ux) - 9 - row * 8.5 + (rnd() - 0.5) * 0.6;
      if (nearHut(ux, uz, 3) || !palmOk(ux, uz, 2)) continue;
      const y = terrainHeight(ux, uz);
      L.umbrellas.push({ x: ux, z: uz, y, rot: rnd() * 6.283 });
      for (const side of [-1, 1]) {
        const sx = ux + side * 1.25, sz = uz + 0.3;
        L.sunbeds.push({ x: sx, z: sz, y: terrainHeight(sx, sz), rot: Math.PI + (rnd() - 0.5) * 0.15 });
      }
    }
  }
  // around the pools
  for (const p of POOLS) {
    if (p.id === 'kids') continue;
    const n = Math.round((p.rx + p.rz) * 0.55);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + 0.2;
      const ux = p.x + Math.cos(a) * (p.rx + 4.2), uz = p.z + Math.sin(a) * (p.rz + 4.2);
      if (insideBuilding(ux, uz, 1.5) || nearHut(ux, uz, 2.5)) continue;
      L.umbrellas.push({ x: ux, z: uz, y: p.deckY, rot: rnd() * 6.283 });
      const rot = Math.atan2(-(p.x - ux), -(p.z - uz));
      const tx = -Math.sin(a), tz = Math.cos(a);
      L.sunbeds.push({ x: ux + tx * 1.2, z: uz + tz * 1.2, y: p.deckY, rot });
      L.sunbeds.push({ x: ux - tx * 1.2, z: uz - tz * 1.2, y: p.deckY, rot });
    }
  }

  // --- mangroves -------------------------------------------------------------
  const cell = 6, mgGrid = new Map();
  const key = (x, z) => Math.floor(x / cell) + ':' + Math.floor(z / cell);
  const mgNear = (x, z, minD) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = mgGrid.get((cx + i) + ':' + (cz + j));
      if (arr) for (const m of arr) if ((m.x - x) ** 2 + (m.z - z) ** 2 < minD * minD) return true;
    }
    return false;
  };
  const keepClear = [...L.pearls.map((p) => [p.x, p.z, 4.5]), ...L.crocs.map((c) => [c.x, c.z, 4])];
  for (let i = 0; i < 26000 && L.mangroves.length < 560; i++) {
    const x = (rnd() - 0.5) * 960, z = 8 + rnd() * 240;
    const d = z - shoreZ(x);
    if (flatMask(x, d) < 0.92 || channelMask(x, d) > 0.02) continue;
    const y = terrainHeight(x, z);
    if (y < -0.66 || y > 0.45) continue;
    const dens = fbm(x / 38 + 4.2, z / 38, 3);
    if (dens < 0.44 + 0.1 * rnd()) continue;
    if (mgNear(x, z, 5.2)) continue;
    let clear = true;
    for (const k of keepClear) if ((k[0] - x) ** 2 + (k[1] - z) ** 2 < k[2] * k[2]) { clear = false; break; }
    if (!clear) continue;
    const m = { x, z, y, s: 0.8 + rnd() * 0.75, rot: rnd() * 6.283, v: (rnd() * 3) | 0 };
    L.mangroves.push(m);
    const k = key(x, z);
    if (!mgGrid.has(k)) mgGrid.set(k, []);
    mgGrid.get(k).push(m);
  }

  // --- buoy line at the lagoon edge ---------------------------------------------
  for (let x = -236; x <= 236; x += 11.8) L.buoys.push({ x, z: shoreZ(x) + 97 });

  // --- seagrass patches in the lagoon --------------------------------------------
  for (let i = 0; i < 9000 && L.seagrass.length < 3600; i++) {
    const x = (rnd() - 0.5) * 520, z = shoreZ(x) + 16 + rnd() * 84;
    const y = terrainHeight(x, z);
    if (y > -0.9 || y < -3.3) continue;
    if (fbm(x / 16 + 2.2, z / 16 + 7.7, 3) < 0.56) continue;
    L.seagrass.push({ x, z, y, s: 0.6 + rnd() * 0.9, rot: rnd() * 6.283 });
  }

  // --- corals along the outer reef wall ---------------------------------------------
  for (let i = 0; i < 6000 && L.reefCorals.length < 620; i++) {
    const x = (rnd() - 0.5) * 760, z = shoreZ(x) + 233 + rnd() * 34;
    const y = terrainHeight(x, z);
    if (y > -0.55 || y < -22) continue;
    L.reefCorals.push({ x, z, y, s: 0.5 + rnd() * 1.3, rot: rnd() * 6.283, t: (rnd() * 4) | 0, c: rnd() });
  }

  return L;
}

export const LAYOUT = build();

// ---- colliders ---------------------------------------------------------------
// Circles (trees, huts) in a spatial hash, plus a short list of oriented boxes.
const CELL = 8;
const grid = new Map();
function addCircle(x, z, r) {
  const c = { x, z, r };
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const k = i * 4096 + j;
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(c);
  }
}
for (const p of LAYOUT.palms) addCircle(p.x, p.z, 0.3 * p.s);
for (const m of LAYOUT.mangroves) addCircle(m.x, m.z, 0.62 * m.s);
for (const h of HUTS) addCircle(h.x, h.z, h.r);
for (const b of LAYOUT.bommies) addCircle(b.x, b.z, b.r * 0.5);

const boxes = BUILDINGS.map((b) => ({
  x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, c: Math.cos(b.rot), s: Math.sin(b.rot),
  rad: Math.hypot(b.w, b.d) / 2,
}));

// Push the point (pos.x, pos.z) with radius r out of all colliders, removing
// the velocity component going into them. `tall` skips the low lagoon rocks.
const out = { hit: false };
export function resolveCollisions(pos, vel, r, skipLow) {
  out.hit = false;
  for (let iter = 0; iter < 2; iter++) {
    const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) {
      const a = grid.get(i * 4096 + j);
      if (!a) continue;
      for (const c of a) {
        if (skipLow && c.low) continue;
        const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        pos.x = c.x + nx * rr; pos.z = c.z + nz * rr;
        const vn = vel.x * nx + vel.z * nz;
        if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
        out.hit = true;
      }
    }
    for (const b of boxes) {
      const ox = pos.x - b.x, oz = pos.z - b.z;
      if (Math.abs(ox) > b.rad + r || Math.abs(oz) > b.rad + r) continue;
      const lx = ox * b.c - oz * b.s, lz = ox * b.s + oz * b.c;
      const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qz = Math.max(-b.hd, Math.min(b.hd, lz));
      let dx = lx - qx, dz = lz - qz;
      let d2 = dx * dx + dz * dz, nxl, nzl, pen;
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
      out.hit = true;
    }
  }
  return out.hit;
}

// Lagoon rocks only block things that are underwater near the bottom.
for (const a of grid.values()) for (const c of a) c.low = false;
for (const b of LAYOUT.bommies) {
  const k = Math.floor(b.x / CELL) * 4096 + Math.floor(b.z / CELL);
  const a = grid.get(k);
  if (a) for (const c of a) if (c.x === b.x && c.z === b.z) c.low = true;
}

export { groundAt };
