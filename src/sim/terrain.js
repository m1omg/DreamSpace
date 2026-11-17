// Analytic terrain + water model. Pure functions of position (and time for
// waves) so the simulation and the renderer agree exactly.

import { fbm, vnoise, smoothstep, clamp, lerp, mulberry32 } from './noise.js';
import { POOLS, CROSS_CHANNELS, POCKETS, REEF_EDGE, LAGOONS, GROVE } from './mapdata.js';

// ---- monotone cubic interpolation through control points -----------------
function pchip(points) {
  const X = points.map((p) => p[0]), Y = points.map((p) => p[1]);
  const n = X.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((Y[i + 1] - Y[i]) / (X[i + 1] - X[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= X[0]) return Y[0];
    if (x >= X[n - 1]) return Y[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (X[mid] <= x) lo = mid; else hi = mid; }
    const h = X[hi] - X[lo], t = (x - X[lo]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * Y[lo] + (t3 - 2 * t2 + t) * h * m[lo] +
      (-2 * t3 + 3 * t2) * Y[hi] + (t3 - t2) * h * m[hi];
  };
}

// ---- shoreline and reef edge -------------------------------------------------
export function shoreZ(x) {
  return 7 * Math.sin(x / 110 + 0.4) + 3 * Math.sin(x / 43 + 1.7);
}
// Distance from the shore to the outer reef edge at this x.
export const reefD = pchip(REEF_EDGE);

// Cross-shore profile from the desert down to the reef platform.
const profile = pchip([
  [-3000, 240], [-1500, 140], [-800, 52], [-500, 16], [-360, 6.5], [-270, 3.7],
  [-60, 2.85], [-28, 2.45], [-13, 1.15], [-4, 0.32], [0, 0], [6, -0.32],
  [16, -0.85], [30, -1.5], [50, -2.05], [70, -2.2], [88, -2.0], [100, -1.25],
  [110, -0.62], [120, -0.42], [3000, -0.42],
]);
// Beyond the reef edge: crest, wall, deep sea.
const dropY = pchip([[0, -0.36], [7, -1.2], [16, -5], [34, -16], [64, -30], [164, -44], [1700, -60]]);

// ---- zone masks ------------------------------------------------------------------
function groveMask(x, d) {
  if (x < GROVE.x0 - 16 || x > GROVE.x1 + 16 || d > GROVE.d1 + 16) return 0;
  return smoothstep(GROVE.x0 - 14, GROVE.x0 + 8, x) * (1 - smoothstep(GROVE.x1 - 6, GROVE.x1 + 14, x)) *
    (1 - smoothstep(GROVE.d1 - 6, GROVE.d1 + 12, d));
}

// Weight of the mangrove mud flat at (x, d), ignoring the deep lagoons.
export function flatMask(x, d) {
  const E = reefD(x);
  const outer = 1 - smoothstep(E - 12, E - 2, d);
  const main = smoothstep(102, 116, d) * outer;
  const side = smoothstep(240, 278, Math.abs(x)) * smoothstep(14, 30, d) * outer;
  return Math.max(main, side, groveMask(x, d) * smoothstep(1, 5, d));
}

// 0..1: inside one of the deep lagoons (with an irregular outline).
export function lagoonMask(x, d) {
  let m = 0;
  for (const L of LAGOONS) {
    const dx = (x - L.x) / L.rx, dd = (d - L.d) / L.rd;
    let q = dx * dx + dd * dd;
    if (q > 1.8) continue;
    q *= 1 + 0.5 * (fbm(x / 28 + L.x * 0.1, d / 28, 3) - 0.5);
    m = Math.max(m, 1 - smoothstep(0.6, 1.0, q));
  }
  return m;
}

// Centre line of the long channel that runs parallel to the coast.
export function longChannelD(x) {
  return 172 + 20 * Math.sin(x / 52) + 9 * Math.sin(x / 21 + 2);
}
function crossChannelX(i, d) {
  return CROSS_CHANNELS[i] + 11 * Math.sin(d / 24 + i * 2.1);
}
// 0..1: how much (x, d) is inside a tidal channel.
export function channelMask(x, d) {
  const E = reefD(x);
  if (d < 90 || d > E + 4) return 0;
  const lc = Math.abs(d - longChannelD(x));
  let m = (1 - smoothstep(3.0, 6.5, lc)) * (1 - smoothstep(285, 310, Math.abs(x))) * (1 - smoothstep(E - 30, E - 16, d));
  const win = smoothstep(92, 104, d) * (1 - smoothstep(E - 6, E + 4, d));
  for (let i = 0; i < CROSS_CHANNELS.length; i++) {
    const cd = Math.abs(x - crossChannelX(i, d));
    m = Math.max(m, (1 - smoothstep(2.5, 5.5, cd)) * win);
  }
  return m;
}

// ---- mud islets: generated once on the open parts of the flat ---------------------
export const ISLETS = (() => {
  const rnd = mulberry32(8123);
  const out = [];
  const clear = (x, d) => flatMask(x, d) > 0.97 && channelMask(x, d) < 0.01 && lagoonMask(x, d) < 0.01;
  for (let gx = -318; gx <= 340; gx += 46) {
    for (let gd = 126; gd <= 400; gd += 42) {
      const x = gx + (rnd() - 0.5) * 24, d = gd + (rnd() - 0.5) * 20;
      const r = 6 + rnd() * 4, h = 0.66 + rnd() * 0.14;
      if (d > reefD(x) - 24) continue;
      if (!clear(x, d) || !clear(x + 11, d) || !clear(x - 11, d) || !clear(x, d + 11) || !clear(x, d - 11)) continue;
      out.push({ x, d, r, h });
    }
  }
  return out;
})();

// ---- resort pools (free-form) -----------------------------------------------------
function poolShape(p, t) { return 1 + p.a * Math.cos(2 * t + p.pa) + p.b * Math.cos(3 * t + p.pb); }
for (const p of POOLS) p.rAvg = (p.rx + p.rz) / 2;
// (normalised radius)^2 of a point relative to the pool outline grown by `margin` metres.
export function poolQ(p, x, z, margin) {
  const u = (x - p.x) / p.rx, v = (z - p.z) / p.rz;
  const rho2 = u * u + v * v;
  const lim = 1.35 + margin / p.rAvg;
  if (rho2 > lim * lim) return 9;
  const s = poolShape(p, Math.atan2(v, u)) + margin / p.rAvg;
  return rho2 / (s * s);
}
export function poolOutline(p, n, margin = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const s = poolShape(p, t) + margin / p.rAvg;
    pts.push([p.x + Math.cos(t) * s * p.rx, p.z + Math.sin(t) * s * p.rz]);
  }
  return pts;
}
const POOL_Z0 = Math.min(...POOLS.map((p) => p.z - p.rz * 1.4)) - 20;
const POOL_Z1 = Math.max(...POOLS.map((p) => p.z + p.rz * 1.4)) + 20;

// ---- natural ground -----------------------------------------------------------------
function naturalHeight(x, z) {
  const d = z - shoreZ(x);
  let y = profile(d);

  if (d < -30) {
    // resort plateau rises gently inland, desert dunes and mountains behind
    y += (-d - 30) * 0.003 * (1 - smoothstep(250, 400, -d));
    const desert = smoothstep(262, 340, -d);
    if (desert > 0) {
      y += desert * (fbm(x / 60, z / 60, 4) - 0.35) * 7;
      const mtn = smoothstep(430, 1100, -d);
      if (mtn > 0) {
        const r = 1 - Math.abs(2 * fbm(x / 420 + 3.1, z / 420, 5) - 1);
        y += mtn * (r * r * 190 + fbm(x / 90, z / 90, 3) * 30 - 30);
      }
    }
    return y;
  }

  if (d > 2) {
    const E = reefD(x);
    // near-shore lagoon relief
    const lag = smoothstep(12, 30, d) * (1 - smoothstep(92, 104, d));
    if (lag > 0) {
      y += lag * (fbm(x / 22, z / 22, 3) - 0.5) * 0.7;
      for (const p of POCKETS) {
        const dx = x - p.x, dd = d - p.d;
        y += lag * p.h * Math.exp(-(dx * dx + dd * dd) / (p.r * p.r));
      }
    }
    const F = flatMask(x, d);
    if (F > 0) {
      const flatY = -0.42 + 0.22 * (fbm(x / 13, z / 13, 3) - 0.5) + 0.05 * (vnoise(x / 2.3, z / 2.3) - 0.5);
      y = lerp(y, Math.max(y, flatY), F);
      for (const s of ISLETS) {
        const dx = x - s.x, dd = d - s.d, q = (dx * dx + dd * dd) / (s.r * s.r);
        if (q < 6) y += F * s.h * Math.exp(-q * 1.6);
      }
    }
    const ch = channelMask(x, d);
    if (ch > 0) y = lerp(y, Math.min(y, -1.9 + 0.2 * (vnoise(x / 4, z / 4) - 0.5)), ch);
    // deep lagoons
    for (const L of LAGOONS) {
      const dx = (x - L.x) / L.rx, dd = (d - L.d) / L.rd;
      let q = dx * dx + dd * dd;
      if (q > 1.8) continue;
      q *= 1 + 0.5 * (fbm(x / 28 + L.x * 0.1, d / 28, 3) - 0.5);
      const m = 1 - smoothstep(0.6, 1.0, q);
      if (m <= 0) continue;
      const target = -L.depth * (0.5 + 0.5 * (1 - Math.min(q, 1))) + 0.4 * (fbm(x / 9, z / 9, 2) - 0.5);
      y = lerp(y, Math.min(y, target), m);
    }
    // reef crest, then the wall down to the open sea
    const e = d - E;
    if (e > -16) {
      y = lerp(y, Math.max(y, -0.36 + 0.1 * (vnoise(x / 3, z / 3) - 0.5)), smoothstep(-16, -4, e) * (1 - ch));
      if (e > 0) {
        const wall = dropY(e) + smoothstep(6, 24, e) * (fbm(x / 30, z / 30, 3) - 0.5) * 5;
        y = lerp(y, wall, smoothstep(0, 4, e));
      }
    }
  }
  return y;
}

// Deck heights are derived once from the natural terrain at each pool centre.
for (const p of POOLS) {
  p.deckY = naturalHeight(p.x, p.z) + 0.1;
  p.level = p.deckY - 0.14;
  p.floor = p.level - p.depth;
}

// Terrain surface with the ground levelled around the pools.
export function terrainHeight(x, z) {
  let y = naturalHeight(x, z);
  if (z < POOL_Z1 && z > POOL_Z0) {
    for (const p of POOLS) {
      const q = poolQ(p, x, z, 14);
      if (q < 1) y = lerp(p.deckY - 0.06, y, smoothstep(1.0, 1.9, poolQ(p, x, z, 6)));
    }
  }
  return y;
}

export function poolAt(x, z) {
  if (z > POOL_Z1 || z < POOL_Z0) return null;
  for (const p of POOLS) if (poolQ(p, x, z, 0) < 1) return p;
  return null;
}

// ---- roofs: buildings are part of the walkable height field ----------------------
// (walls then block movement the same way pool edges do, and a glide can end
// on a roof). Boxes are registered by layout.js.
let ROOFS = [];
let ROOF_ZMAX = -1e9;
export function setRoofs(boxes) {
  ROOFS = boxes;
  ROOF_ZMAX = Math.max(...boxes.map((b) => b.z + b.rad));
}
function roofAt(x, z) {
  if (z > ROOF_ZMAX) return -1e9;
  let top = -1e9;
  for (const b of ROOFS) {
    const ox = x - b.x, oz = z - b.z;
    if (Math.abs(ox) > b.rad || Math.abs(oz) > b.rad) continue;
    const lx = ox * b.c - oz * b.s, lz = ox * b.s + oz * b.c;
    if (Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd && b.top > top) top = b.top;
  }
  return top;
}

// Walkable ground: terrain, pool basins cut in, roofs on top.
export function groundAt(x, z) {
  const p = poolAt(x, z);
  if (p) {
    for (const i of p.islands) {
      const dx = x - i.x, dz = z - i.z;
      if (dx * dx + dz * dz < i.r * i.r) return p.deckY + 0.05;
    }
    return p.floor;
  }
  const y = terrainHeight(x, z);
  if (z < ROOF_ZMAX) { const r = roofAt(x, z); if (r > y) return r; }
  return y;
}

// ---- waves -----------------------------------------------------------------------
// Three travelling sines. Parameters are shared with the water shader.
export const WAVES = [
  // dirX, dirZ, wavelength, amplitude weight, phase
  { dx: 0.26, dz: -0.966, len: 9.0, amp: 0.5, ph: 0.0 },
  { dx: -0.42, dz: -0.907, len: 5.5, amp: 0.3, ph: 1.3 },
  { dx: 0.71, dz: -0.71, len: 3.2, amp: 0.2, ph: 4.1 },
];
for (const w of WAVES) {
  w.k = (2 * Math.PI) / w.len;
  w.omega = Math.sqrt(9.81 * w.k);
}
export const WAVE_AMP_LAGOON = 0.035;
export const WAVE_AMP_SEA = 0.3;

// 0 inside the reef platform, 1 on the open sea.
export function openSea(x, z) {
  return smoothstep(-12, 55, z - shoreZ(x) - reefD(x));
}
export function seaLevelAt(x, z, t) {
  let h = 0;
  for (const w of WAVES) h += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) + w.omega * t + w.ph);
  return h * (WAVE_AMP_LAGOON + WAVE_AMP_SEA * openSea(x, z));
}

// Water surface height at a point: pool level inside a pool, the sea elsewhere.
export function waterLevelAt(x, z, t) {
  const p = poolAt(x, z);
  if (p) return p.level;
  return seaLevelAt(x, z, t);
}

export { clamp, lerp, smoothstep };
