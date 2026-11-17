// Analytic terrain + water model. Pure functions of position (and time for
// waves) so the simulation and the renderer agree exactly.

import { fbm, vnoise, smoothstep, clamp, lerp } from './noise.js';
import { POOLS, ISLETS, CROSS_CHANNELS, POCKETS } from './mapdata.js';

// ---- shoreline -----------------------------------------------------------
export function shoreZ(x) {
  return 7 * Math.sin(x / 110 + 0.4) + 3 * Math.sin(x / 43 + 1.7);
}

// ---- cross-shore profile (monotone cubic through control points) ---------
const PROFILE = [
  [-3000, 240], [-1500, 140], [-800, 52], [-500, 16], [-360, 6.5], [-270, 3.7],
  [-60, 2.8], [-34, 2.35], [-14, 1.1], [-4, 0.32], [0, 0], [6, -0.32],
  [16, -0.85], [30, -1.55], [50, -2.3], [70, -2.5], [88, -2.2], [100, -1.3],
  [110, -0.62], [120, -0.42], [228, -0.42], [236, -0.3], [243, -1.2],
  [252, -5], [270, -16], [300, -30], [400, -44], [2000, -60],
];
const PX = PROFILE.map((p) => p[0]);
const PY = PROFILE.map((p) => p[1]);
const PM = (() => {
  const n = PX.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((PY[i + 1] - PY[i]) / (PX[i + 1] - PX[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
})();

function profile(d) {
  const n = PX.length;
  if (d <= PX[0]) return PY[0];
  if (d >= PX[n - 1]) return PY[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (PX[mid] <= d) lo = mid; else hi = mid; }
  const h = PX[hi] - PX[lo], t = (d - PX[lo]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * PY[lo] + (t3 - 2 * t2 + t) * h * PM[lo] +
    (-2 * t3 + 3 * t2) * PY[hi] + (t3 - t2) * h * PM[hi];
}

// ---- zone masks ------------------------------------------------------------
// Weight of the mangrove mud flat at (x, d).
export function flatMask(x, d) {
  const outer = 1 - smoothstep(232, 241, d);
  const main = smoothstep(102, 116, d) * outer;
  const side = smoothstep(240, 278, Math.abs(x)) * smoothstep(14, 30, d) * outer;
  return Math.max(main, side);
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
  let m = 0;
  const lc = Math.abs(d - longChannelD(x));
  m = (1 - smoothstep(3.0, 6.5, lc)) * (1 - smoothstep(285, 310, Math.abs(x)));
  if (d > 90 && d < 250) {
    const win = smoothstep(92, 104, d) * (1 - smoothstep(238, 248, d));
    for (let i = 0; i < CROSS_CHANNELS.length; i++) {
      const cd = Math.abs(x - crossChannelX(i, d));
      m = Math.max(m, (1 - smoothstep(2.5, 5.5, cd)) * win);
    }
  }
  return m;
}

// ---- pools -----------------------------------------------------------------
function poolQ(p, x, z, margin) {
  const dx = (x - p.x) / (p.rx + margin), dz = (z - p.z) / (p.rz + margin);
  return dx * dx + dz * dz;
}

// Natural ground, before pools are cut in.
function naturalHeight(x, z) {
  const d = z - shoreZ(x);
  let y = profile(d);

  if (d < -40) {
    // resort plateau rises gently inland, desert dunes and mountains behind
    y += (-d - 40) * 0.0035 * (1 - smoothstep(250, 400, -d));
    const desert = smoothstep(255, 330, -d);
    if (desert > 0) {
      y += desert * (fbm(x / 60, z / 60, 4) - 0.35) * 7;
      const mtn = smoothstep(420, 1100, -d);
      if (mtn > 0) {
        const r = 1 - Math.abs(2 * fbm(x / 420 + 3.1, z / 420, 5) - 1);
        y += mtn * (r * r * 190 + fbm(x / 90, z / 90, 3) * 30 - 30);
      }
    }
    return y;
  }

  if (d > 12) {
    // lagoon floor relief
    const lag = smoothstep(12, 30, d) * (1 - smoothstep(92, 104, d));
    if (lag > 0) {
      y += lag * (fbm(x / 22, z / 22, 3) - 0.5) * 0.8;
      for (const p of POCKETS) {
        const dx = x - p.x, dd = d - p.d;
        y += lag * p.h * Math.exp(-(dx * dx + dd * dd) / (p.r * p.r));
      }
    }
    const F = flatMask(x, d);
    if (F > 0) {
      const flatY = -0.42 + 0.22 * (fbm(x / 13, z / 13, 3) - 0.5) + 0.05 * (vnoise(x / 2.3, z / 2.3) - 0.5);
      y = lerp(y, flatY, F);
      for (const s of ISLETS) {
        const dx = x - s.x, dd = d - s.d, q = (dx * dx + dd * dd) / (s.r * s.r);
        if (q < 6) y += F * s.h * Math.exp(-q * 1.6);
      }
    }
    const ch = channelMask(x, d);
    if (ch > 0) y = lerp(y, Math.min(y, -1.9 + 0.2 * (vnoise(x / 4, z / 4) - 0.5)), ch);
    // open sea floor relief
    if (d > 244) y += smoothstep(244, 262, d) * (fbm(x / 30, z / 30, 3) - 0.5) * 5;
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
  if (z < -50 && z > -190) {
    for (const p of POOLS) {
      const q = poolQ(p, x, z, 14);
      if (q < 1) {
        const qi = poolQ(p, x, z, 6);
        y = lerp(p.deckY - 0.06, y, smoothstep(1.0, 1.9, qi) * 1.0);
      }
    }
  }
  return y;
}

export function poolAt(x, z) {
  if (z > -50 || z < -190) return null;
  for (const p of POOLS) if (poolQ(p, x, z, 0) < 1) return p;
  return null;
}

// Walkable ground: terrain, but pool basins are cut in.
export function groundAt(x, z) {
  const p = poolAt(x, z);
  if (p) {
    if (p.island) {
      const dx = x - p.island.x, dz = z - p.island.z;
      if (dx * dx + dz * dz < p.island.r * p.island.r) return p.deckY + 0.05;
    }
    return p.floor;
  }
  return terrainHeight(x, z);
}

// ---- waves -----------------------------------------------------------------
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

export function waveAmp(z) {
  return WAVE_AMP_LAGOON + WAVE_AMP_SEA * smoothstep(225, 300, z);
}

export function seaLevelAt(x, z, t) {
  let h = 0;
  for (const w of WAVES) h += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) + w.omega * t + w.ph);
  return h * waveAmp(z);
}

// Water surface height at a point: pool level inside a pool, the sea elsewhere.
export function waterLevelAt(x, z, t) {
  const p = poolAt(x, z);
  if (p) return p.level;
  return seaLevelAt(x, z, t);
}

export { clamp, lerp, smoothstep };
