// The resort, modelled on the real one: serrated two-storey terracotta blocks
// with arched loggias, turquoise railings and salmon domes; stone bungalows by
// the beach; free-form pools in flagstone decks; the round thatched restaurant,
// the hexagonal pavilion, beach bars, three rows of umbrellas.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, HUTS, POOLS, VOLLEYBALL } from '../sim/mapdata.js';
import { LAYOUT, UNIT_W } from '../sim/layout.js';
import { terrainHeight, shoreZ, poolOutline } from '../sim/terrain.js';
import { patchMaterial, canvasTexture, detailTextures } from './shared.js';
import { createPool, trs } from './instancing.js';
import { t, onLangChange } from '../i18n.js';

// material ids for the detail shader
const M = { PLASTER: 0, STONE: 1, PAVING: 2, WOOD: 3, THATCH: 4, GLASS: 5, PAINT: 6, TILE: 7 };

const C = {
  terra: new THREE.Color(0.8, 0.36, 0.22),
  terra2: new THREE.Color(0.86, 0.42, 0.26),
  terraDark: new THREE.Color(0.6, 0.27, 0.17),
  dome: new THREE.Color(1.0, 0.62, 0.5),
  cream: new THREE.Color(0.9, 0.82, 0.68),
  white: new THREE.Color(0.93, 0.92, 0.88),
  wood: new THREE.Color(0.42, 0.26, 0.14),
  woodLight: new THREE.Color(0.62, 0.44, 0.26),
  glass: new THREE.Color(0.05, 0.09, 0.12),
  teal: new THREE.Color(0.05, 0.5, 0.52),
  thatch: new THREE.Color(0.78, 0.63, 0.36),
  thatchDark: new THREE.Color(0.55, 0.43, 0.24),
  stone: new THREE.Color(0.86, 0.76, 0.6),
  paving: new THREE.Color(0.95, 0.86, 0.68),
  tile: new THREE.Color(0.42, 0.78, 0.92),
  sand: new THREE.Color(0.9, 0.78, 0.55),
  red: new THREE.Color(0.85, 0.12, 0.08),
  yellow: new THREE.Color(0.9, 0.72, 0.2),
  lamp: new THREE.Color(0.15, 0.13, 0.12),
};

// Every part carries its colour, a material id for the detail shader, an
// ambient-occlusion factor and its height above the building's base (walls
// get darker where they meet the ground). `ao` is a number or a function of
// the face normal; floors and `flat` parts (paving lying on the ground) get
// no ground band.
function prep(g, color, mat, ao = 1, flat = false) {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  const count = n.attributes.position.count;
  const P = n.attributes.position, N = n.attributes.normal;
  const c = new Float32Array(count * 3), m = new Float32Array(count), o = new Float32Array(count), h = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; m[i] = mat;
    o[i] = typeof ao === 'function' ? ao(N.getX(i), N.getY(i), N.getZ(i)) : ao;
    h[i] = flat || Math.abs(N.getY(i)) > 0.7 ? 9 : P.getY(i); // the band is for walls, not floors
  }
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  n.setAttribute('aMat', new THREE.BufferAttribute(m, 1));
  n.setAttribute('aAO', new THREE.BufferAttribute(o, 1));
  n.setAttribute('aH', new THREE.BufferAttribute(h, 1));
  return n;
}
function box(w, h, d, color, mat, x, y, z, ry = 0, ao = 1, flat = false) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return prep(g, color, mat, ao, flat);
}
function dome(r, color, x, y, z, squash = 1, seg = 22) {
  const g = new THREE.SphereGeometry(r, seg, Math.round(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  return prep(g, color, M.PLASTER);
}
function cyl(rt, rb, h, color, mat, x, y, z, seg = 14, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.translate(x, y + h / 2, z);
  return prep(g, color, mat);
}
// A wall panel with an arched opening, standing in the xy plane.
function archPanel(w, h, aw, spring, thick, color, mat = M.PLASTER, curveSegments = 9) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-aw / 2, 0.001); hole.lineTo(-aw / 2, spring);
  hole.absarc(0, spring, aw / 2, Math.PI, 0, true);
  hole.lineTo(aw / 2, 0.001); hole.closePath();
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -thick / 2);
  return prep(g, color, mat);
}
function moved(g, x, y, z, ry = 0) {
  const c = g.clone();
  if (ry) c.rotateY(ry);
  c.translate(x, y, z);
  if (y) { const h = c.attributes.aH.array; for (let i = 0; i < h.length; i++) h[i] += y; }
  return c;
}

// ---- room unit: one bay of a two-storey block ----------------------------------
// `lo` is the distant version: coarser curves, no window frames or balusters.
function roomUnitGeometry(lo = false) {
  const W = UNIT_W, CORE = 7.0, LOG = 2.1, H = 6.9, F2 = 3.42, T = 0.36;
  const IN = LOG - T; // depth of the loggia behind the arched front
  const parts = [];
  // the core; its front and back faces are the shaded walls inside the loggias
  parts.push(box(W, H + 1.4, CORE, C.terra, M.PLASTER, 0, -1.4, 0, 0, (nx, ny, nz) => (Math.abs(nz) > 0.5 ? 0.72 : 1)));
  // dome on a low drum
  parts.push(cyl(1.75, 1.85, 0.32, C.terra2, M.PLASTER, 0, H, 0, lo ? 10 : 20));
  parts.push(dome(1.68, C.dome, 0, H + 0.3, 0, 0.78, lo ? 10 : 22));
  const lower = archPanel(W, F2, 3.1, 1.25, T, C.terra2, M.PLASTER, lo ? 3 : 9);
  const upper = archPanel(W, H - F2, 3.1, 1.2, T, C.terra2, M.PLASTER, lo ? 3 : 9);
  for (const s of [-1, 1]) {
    const zf = s * (CORE / 2 + LOG), zc = s * (CORE / 2 + IN / 2);
    parts.push(moved(lower, 0, 0, zf - s * T / 2));
    parts.push(moved(upper, 0, F2, zf - s * T / 2));
    // Loggia floors and the fin walls between neighbours end at the back of
    // the arched front and inside the fins: faces lying flush on the facade
    // used to z-fight with it and flicker.
    parts.push(box(W - 0.56, 0.2, IN, C.stone, M.PAVING, 0, -0.12, zc, 0, (nx, ny) => (ny > 0.5 ? 0.8 : 1)));
    parts.push(box(W - 0.56, 0.2, IN, C.terraDark, M.PLASTER, 0, F2 - 0.2, zc, 0, (nx, ny) => (ny < -0.5 ? 0.55 : ny > 0.5 ? 0.8 : 1)));
    for (const sx of [-1, 1]) parts.push(box(0.28, H + 1.4, IN, C.terra, M.PLASTER, sx * (W / 2 - 0.14), -1.4, zc, 0, (nx) => (Math.abs(nx) > 0.5 ? 0.8 : 1)));
    // stepped parapet
    parts.push(box(W, 0.42, 0.4, C.terra2, M.PLASTER, 0, H, zf - s * 0.18));
    for (const sx of [-1, 1]) parts.push(box(0.5, 0.36, 0.44, C.terra2, M.PLASTER, sx * (W / 2 - 0.25), H + 0.42, zf - s * 0.18));
    // doors and windows on the recessed wall, both floors
    for (const fy of [0.02, F2 + 0.02]) {
      parts.push(box(1.05, 2.15, 0.07, C.wood, M.WOOD, -0.95, fy, s * (CORE / 2 + 0.03), 0, 0.75));
      parts.push(box(1.5, 1.35, 0.06, C.glass, M.GLASS, 0.75, fy + 0.8, s * (CORE / 2 + 0.03), 0, 0.75));
      if (!lo) {
        parts.push(box(1.66, 0.09, 0.1, C.wood, M.WOOD, 0.75, fy + 2.15, s * (CORE / 2 + 0.03), 0, 0.75));
        parts.push(box(1.66, 0.09, 0.1, C.wood, M.WOOD, 0.75, fy + 0.72, s * (CORE / 2 + 0.03), 0, 0.75));
      }
    }
    // turquoise railing upstairs
    const rz = zf - s * 0.2;
    parts.push(box(3.1, 0.07, 0.07, C.teal, M.PAINT, 0, F2 + 0.95, rz));
    if (!lo) {
      parts.push(box(3.1, 0.06, 0.06, C.teal, M.PAINT, 0, F2 + 0.12, rz));
      for (let i = -5; i <= 5; i++) parts.push(box(0.045, 0.85, 0.045, C.teal, M.PAINT, i * 0.28, F2 + 0.12, rz));
    }
  }
  return mergeVertices(mergeGeometries(parts));
}

// ---- bungalow unit: single-storey, stone-clad, salmon dome --------------------------
function bungalowGeometry(lo = false) {
  const W = UNIT_W, D = 6.2, H = 3.3;
  const parts = [];
  parts.push(box(W, H + 1.2, D, C.stone, M.STONE, 0, -1.2, 0));
  parts.push(box(W + 0.12, 0.28, D + 0.12, C.terra2, M.PLASTER, 0, H, 0));
  parts.push(cyl(1.95, 2.0, 0.25, C.dome, M.PLASTER, 0, H + 0.28, 0, lo ? 10 : 20));
  parts.push(dome(1.9, C.dome, 0, H + 0.5, 0, 0.72, lo ? 10 : 22));
  for (const s of [-1, 1]) {
    const door = archPanel(1.5, 2.5, 1.05, 1.6, 0.14, C.terra2, M.PLASTER, lo ? 3 : 9);
    parts.push(moved(door, -0.8, 0, s * (D / 2 + 0.05)));
    parts.push(box(1.0, 2.1, 0.06, C.wood, M.WOOD, -0.8, 0, s * (D / 2 + 0.02), 0, 0.8));
    parts.push(box(1.0, 1.0, 0.06, C.glass, M.GLASS, 1.0, 1.05, s * (D / 2 + 0.02), 0, 0.85));
    if (!lo) parts.push(box(1.16, 0.1, 0.1, C.wood, M.WOOD, 1.0, 0.98, s * (D / 2 + 0.03)));
    parts.push(box(W, 0.14, 1.4, C.stone, M.PAVING, 0, -0.06, s * (D / 2 + 0.7), 0, (nx, ny) => (ny > 0.5 ? 0.85 : 1)));
  }
  return mergeVertices(mergeGeometries(parts));
}

// ---- single buildings ---------------------------------------------------------------
function place(parts, b) {
  const g = mergeGeometries(parts);
  g.rotateY(b.rot || 0);
  g.translate(b.x, b.y ?? terrainHeight(b.x, b.z), b.z);
  return g;
}

function mainBuilding(b) {
  const parts = [];
  const { w: L, d: D, h: H } = b;
  parts.push(box(L, H + 2, D, C.terra, M.PLASTER, 0, -2, 0));
  parts.push(box(L + 0.5, 0.5, D + 0.5, C.terra2, M.PLASTER, 0, H, 0));
  // raised centre with the big dome
  parts.push(box(22, H + 3.4, D + 3, C.terra2, M.PLASTER, 0, 0, 0));
  parts.push(box(22.5, 0.5, D + 3.5, C.terraDark, M.PLASTER, 0, H + 3.4, 0));
  parts.push(cyl(7.2, 7.4, 1.5, C.terra2, M.PLASTER, 0, H + 3.4, 0, 28));
  parts.push(dome(7.0, C.dome, 0, H + 4.9, 0, 0.8, 32));
  parts.push(cyl(0.1, 0.1, 2.0, C.terraDark, M.PAINT, 0, H + 10.4, 0, 6));
  for (const sx of [-1, 1]) {
    // the corner wings stand 0.3 m proud: flush side walls used to z-fight
    parts.push(box(6.8, H + 2.2, 6.5, C.terra2, M.PLASTER, sx * (L / 2 - 3.1), 0, D / 2 - 2));
    parts.push(dome(3.0, C.dome, sx * (L / 2 - 3.25), H + 2.2, D / 2 - 2, 0.8));
    for (let i = 0; i < 4; i++) parts.push(dome(1.7, C.dome, sx * (7 + i * 4.6 + 6), H + 0.5, 0, 0.75));
  }
  // arcade towards the pools (the sea side) and at the back
  const arch = archPanel(4.6, 4.6, 3.4, 2.3, 0.5, C.terra2);
  const arch2 = archPanel(4.6, 3.6, 2.6, 1.6, 0.4, C.terra2);
  const nA = Math.floor(L / 4.6);
  for (let i = 0; i < nA; i++) {
    const x = -L / 2 + (i + 0.5) * (L / nA);
    for (const s of [-1, 1]) {
      parts.push(moved(arch, x, 0, s * (D / 2 + 3.4)));
      if (Math.abs(x) > 12) parts.push(moved(arch2, x, 4.9, s * (D / 2 + 0.3)));
      parts.push(box(3.2, 3.0, 0.08, C.glass, M.GLASS, x, 0.2, s * (D / 2 + 0.05), 0, 0.75));
      parts.push(box(3.4, 0.14, 0.14, C.wood, M.WOOD, x, 3.2, s * (D / 2 + 0.07), 0, 0.75));
    }
  }
  for (const s of [-1, 1]) {
    parts.push(box(L, 0.4, 3.9, C.terraDark, M.PLASTER, 0, 4.6, s * (D / 2 + 1.9), 0, (nx, ny) => (ny < -0.5 ? 0.55 : 1)));
    parts.push(box(L, 0.16, 3.9, C.stone, M.PAVING, 0, -0.08, s * (D / 2 + 1.9), 0, (nx, ny) => (ny > 0.5 ? 0.82 : 1)));
    parts.push(box(L, 0.5, 0.4, C.terra2, M.PLASTER, 0, 5.0, s * (D / 2 + 3.4)));
  }
  return place(parts, b);
}

function smallBuilding(b) {
  const parts = [];
  const { w, d, h } = b;
  if (b.kind === 'dive') {
    parts.push(box(w, h + 1, d, C.white, M.PLASTER, 0, -1, 0));
    parts.push(box(w + 0.3, 0.3, d + 0.3, C.teal, M.PAINT, 0, h, 0));
    parts.push(box(3.2, 2.2, 0.08, C.glass, M.GLASS, -3, 0.3, d / 2 + 0.05));
    parts.push(box(1.2, 2.2, 0.08, C.teal, M.PAINT, 2.5, 0.1, d / 2 + 0.05));
    parts.push(box(w, 0.2, 3.6, C.thatch, M.THATCH, 0, 2.9, d / 2 + 1.8));
    for (const sx of [-1, 1]) parts.push(box(0.2, 2.9, 0.2, C.wood, M.WOOD, sx * (w / 2 - 0.3), 0, d / 2 + 3.4));
    for (let i = 0; i < 5; i++) parts.push(cyl(0.18, 0.18, 0.7, i % 2 ? C.yellow : C.teal, M.PAINT, -5 + i * 0.5, 0, d / 2 + 2.6, 10)); // tanks
  } else if (b.kind === 'white') {
    parts.push(box(w, h + 1, d, C.white, M.PLASTER, 0, -1, 0));
    parts.push(box(w + 0.2, 0.4, d + 0.2, C.cream, M.PLASTER, 0, h, 0));
    for (let i = -1; i <= 1; i++) for (const fy of [0.9, 3.9]) for (const s of [-1, 1]) {
      parts.push(box(1.6, 1.5, 0.08, C.glass, M.GLASS, i * 5, fy, s * (d / 2 + 0.04)));
    }
  } else { // villa
    parts.push(box(w, h + 1, d, C.cream, M.PLASTER, 0, -1, 0));
    parts.push(box(w + 0.2, 0.3, d + 0.2, C.terra2, M.PLASTER, 0, h, 0));
    parts.push(dome(2.0, C.white, -w / 4, h + 0.3, 0, 0.7));
    parts.push(box(2.4, 2.1, 0.08, C.glass, M.GLASS, -2, 0.2, d / 2 + 0.04));
    parts.push(box(1.0, 2.1, 0.08, C.wood, M.WOOD, 2.6, 0.1, d / 2 + 0.04));
    parts.push(box(w * 0.7, 0.14, 3, C.woodLight, M.WOOD, 0, 2.6, d / 2 + 1.5));
    for (const sx of [-1, 1]) parts.push(box(0.16, 2.6, 0.16, C.woodLight, M.WOOD, sx * w * 0.32, 0, d / 2 + 2.8));
  }
  return place(parts, b);
}

function thatchRoof(r, h, y, seg, color = C.thatch, rings = 3) {
  const out = [];
  const cone = new THREE.ConeGeometry(r, h, seg, rings, true);
  cone.translate(0, y + h / 2, 0);
  out.push(prep(cone, color, M.THATCH));
  const skirt = new THREE.CylinderGeometry(r, r + 0.12, 0.4, seg, 1, true);
  skirt.translate(0, y - 0.2, 0);
  out.push(prep(skirt, C.thatchDark, M.THATCH));
  return out;
}

function hut(h) {
  const parts = [];
  const y0 = terrainHeight(h.x, h.z);
  if (h.kind === 'tower') {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(box(0.16, 4.6, 0.16, C.white, M.WOOD, sx * 0.95, 0, sz * 0.95));
    parts.push(box(2.3, 0.14, 2.3, C.woodLight, M.WOOD, 0, 2.3, 0));
    parts.push(box(2.3, 0.7, 0.08, C.white, M.WOOD, 0, 2.44, -1.1));
    parts.push(box(0.08, 0.7, 2.3, C.white, M.WOOD, -1.1, 2.44, 0));
    parts.push(box(0.08, 0.7, 2.3, C.white, M.WOOD, 1.1, 2.44, 0));
    parts.push(...thatchRoof(2.2, 1.1, 4.6, 8));
    parts.push(box(0.06, 1.8, 0.06, C.white, M.PAINT, 1.2, 4.7, 1.2));
    parts.push(box(0.8, 0.5, 0.03, C.red, M.PAINT, 1.62, 5.95, 1.2));
    for (let i = 0; i < 3; i++) parts.push(box(0.5, 0.06, 0.12, C.woodLight, M.WOOD, 0, 0.6 + i * 0.6, 1.25 - i * 0.05));
  } else if (h.kind === 'restaurant') {
    // big round open-sided restaurant under a two-tier thatched roof
    parts.push(cyl(h.r, h.r, 0.3, C.stone, M.PAVING, 0, -0.1, 0, 32));
    parts.push(cyl(h.r - 0.3, h.r - 0.3, 0.9, C.stone, M.STONE, 0, 0.2, 0, 32, true));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283;
      parts.push(cyl(0.16, 0.18, 3.6, C.wood, M.WOOD, Math.cos(a) * (h.r - 0.4), 0.2, Math.sin(a) * (h.r - 0.4), 8));
    }
    parts.push(cyl(0.3, 0.34, 7.2, C.wood, M.WOOD, 0, 0.2, 0, 10));
    parts.push(...thatchRoof(h.r + 1.3, 3.2, 3.7, 32));
    parts.push(...thatchRoof(h.r * 0.42, 2.0, 6.5, 24));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283 + 0.3;
      parts.push(cyl(0.55, 0.55, 0.06, C.woodLight, M.WOOD, Math.cos(a) * 4.2, 0.95, Math.sin(a) * 4.2, 12));
      parts.push(cyl(0.06, 0.06, 0.75, C.wood, M.WOOD, Math.cos(a) * 4.2, 0.2, Math.sin(a) * 4.2, 6));
    }
  } else if (h.kind === 'pavilion') {
    parts.push(cyl(h.r, h.r, 0.25, C.stone, M.PAVING, 0, -0.1, 0, 6));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283 + 0.52;
      parts.push(cyl(0.14, 0.16, 3.2, C.wood, M.WOOD, Math.cos(a) * (h.r - 0.5), 0.15, Math.sin(a) * (h.r - 0.5), 8));
    }
    parts.push(...thatchRoof(h.r + 0.9, 2.6, 3.3, 6));
    parts.push(cyl(1.3, 1.3, 1.05, C.wood, M.WOOD, 0, 0.15, 0, 12));
    parts.push(cyl(1.5, 1.5, 0.08, C.woodLight, M.WOOD, 0, 1.2, 0, 12));
  } else {
    // round bar
    parts.push(cyl(h.r - 1.2, h.r - 1.2, 1.1, C.wood, M.WOOD, 0, 0, 0, 18));
    parts.push(cyl(h.r - 0.95, h.r - 0.95, 0.1, C.woodLight, M.WOOD, 0, 1.1, 0, 18));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283;
      parts.push(cyl(0.09, 0.1, 3.1, C.wood, M.WOOD, Math.cos(a) * (h.r - 0.4), 0, Math.sin(a) * (h.r - 0.4), 8));
      parts.push(cyl(0.2, 0.2, 0.06, C.woodLight, M.WOOD, Math.cos(a + 0.5) * (h.r - 0.3), 0.72, Math.sin(a + 0.5) * (h.r - 0.3), 10)); // stools
      parts.push(cyl(0.04, 0.04, 0.72, C.wood, M.WOOD, Math.cos(a + 0.5) * (h.r - 0.3), 0, Math.sin(a + 0.5) * (h.r - 0.3), 6));
    }
    parts.push(cyl(0.15, 0.15, 3.8, C.wood, M.WOOD, 0, 0, 0, 8));
    parts.push(...thatchRoof(h.r + 1.1, 2.6, 3.0, 22));
  }
  const g = mergeGeometries(parts);
  g.translate(h.x, y0, h.z);
  return g;
}

// ---- pools ----------------------------------------------------------------------------
function shapeFrom(points, flipZ = true) {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => { if (i === 0) s.moveTo(x, flipZ ? -z : z); else s.lineTo(x, flipZ ? -z : z); });
  return s;
}

function buildPools(scene) {
  const deckParts = [];
  for (const p of POOLS) {
    const outline = poolOutline(p, 72);
    // flagstone deck with the pool cut out
    const deckShape = shapeFrom(poolOutline(p, 72, 7.5));
    const hole = new THREE.Path();
    [...outline].reverse().forEach(([x, z], i) => { if (i === 0) hole.moveTo(x, -z); else hole.lineTo(x, -z); });
    deckShape.holes.push(hole);
    const deck = new THREE.ShapeGeometry(deckShape, 6);
    deck.rotateX(-Math.PI / 2);
    deck.translate(0, p.deckY, 0);
    deckParts.push(prep(deck, C.paving, M.PAVING, 1, true));
    // coping stones
    const rimPts = poolOutline(p, 72, 0.32);
    for (let i = 0; i < 72; i++) {
      const [x0, z0] = rimPts[i], [x1, z1] = rimPts[(i + 1) % 72];
      const len = Math.hypot(x1 - x0, z1 - z0);
      deckParts.push(box(len + 0.03, 0.07, 0.62, C.white, M.STONE, (x0 + x1) / 2, p.deckY, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0), 1, true));
    }

    // basin: tiled floor and walls, lit by caustics at this pool's own level
    const basinParts = [];
    const floor = new THREE.ShapeGeometry(shapeFrom(outline), 6);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, p.floor, 0);
    basinParts.push(prep(floor, C.tile, M.TILE));
    const pos = [], nor = [];
    for (let i = 0; i < 72; i++) {
      const [x0, z0] = outline[i], [x1, z1] = outline[(i + 1) % 72];
      const nx = -(z1 - z0), nz = x1 - x0, nl = Math.hypot(nx, nz) || 1;
      // inward normal: the outline runs counter-clockwise around the centre
      const cx = p.x - x0, cz = p.z - z0, sgn = (nx * cx + nz * cz) > 0 ? 1 : -1;
      const quad = sgn > 0
        ? [x0, p.floor, z0, x1, p.floor, z1, x1, p.deckY, z1, x0, p.floor, z0, x1, p.deckY, z1, x0, p.deckY, z0]
        : [x0, p.floor, z0, x1, p.deckY, z1, x1, p.floor, z1, x0, p.floor, z0, x0, p.deckY, z0, x1, p.deckY, z1];
      pos.push(...quad);
      for (let k = 0; k < 6; k++) nor.push(sgn * nx / nl, 0, sgn * nz / nl);
    }
    const wall = new THREE.BufferGeometry();
    wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wall.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    basinParts.push(prep(wall, C.tile, M.TILE));
    for (const isl of p.islands) {
      const hW = p.deckY - p.floor + 0.05;
      const g = new THREE.CylinderGeometry(isl.r, isl.r + 0.35, hW, 26);
      g.translate(isl.x, p.floor + hW / 2, isl.z);
      basinParts.push(prep(g, C.stone, M.TILE));
    }
    const green = p.tint === 'green';
    const basinMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, side: THREE.DoubleSide }), {
      waterLevel: p.level, key: 'basin' + (green ? 'g' : ''),
      color: green
        ? 'diffuseColor.rgb = mix(vec3(0.2,0.3,0.12), vec3(0.34,0.4,0.18), fbm(vWPos.xz*0.6));'
        : `vec2 tp = vWPos.xz*4.0 + vWPos.y*4.0; vec2 tf = abs(fract(tp) - 0.5);
float grout = smoothstep(0.44, 0.48, max(tf.x, tf.y));
vec2 tid = floor(tp);
diffuseColor.rgb *= (0.86 + 0.2*hash12(tid)) * (1.0 - 0.3*grout);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1,0.32,0.62), step(0.93, hash12(tid + 7.0))*0.6);`,
    });
    const basin = new THREE.Mesh(mergeGeometries(basinParts), basinMat);
    basin.receiveShadow = true;
    scene.add(basin);
  }
  return deckParts;
}

// A strip of paving draped over the terrain along a polyline.
function path(points, width, color, mat = M.PAVING, lift = 0.06) {
  const pos = [], idx = [];
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const [nx, nz] = points[Math.min(i + 1, points.length - 1)];
    const [px, pz] = points[Math.max(i - 1, 0)];
    let tx = nx - px, tz = nz - pz;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const ox = -tz * width / 2, oz = tx * width / 2;
    pos.push(x + ox, terrainHeight(x + ox, z + oz) + lift, z + oz, x - ox, terrainHeight(x - ox, z - oz) + lift, z - oz);
    if (i < points.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const na = g.attributes.normal;
  if (na.getY(0) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  return prep(g, color, mat, 1, true);
}
function curve(a, b, wobble, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const nx = -(b[1] - a[1]), nz = b[0] - a[0], nl = Math.hypot(nx, nz) || 1;
    const w = Math.sin(t * Math.PI * 2) * wobble;
    pts.push([x + nx / nl * w, z + nz / nl * w]);
  }
  return pts;
}

function drawSign(g, w, h) {
  const fit = (text, size, maxW) => { g.font = `bold ${size}px sans-serif`; while (g.measureText(text).width > maxW && size > 12) g.font = `bold ${--size}px sans-serif`; };
  g.fillStyle = '#f3e6c4'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b3261e'; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#b3261e'; g.textAlign = 'center';
  fit(t('sign.title'), 64, w - 60); g.fillText(t('sign.title'), w / 2, 92);
  g.fillStyle = '#2b2118';
  fit(t('sign.l1'), 36, w - 60); g.fillText(t('sign.l1'), w / 2, 156);
  fit(t('sign.l2'), 36, w - 60); g.fillText(t('sign.l2'), w / 2, 202);
  g.fillStyle = '#b3261e';
  fit(t('sign.l3'), 58, w - 60); g.fillText(t('sign.l3'), w / 2, 272);
}
function signTexture() {
  const tex = canvasTexture(512, 320, drawSign);
  onLangChange(() => { drawSign(tex.image.getContext('2d'), 512, 320); tex.needsUpdate = true; });
  return tex;
}

export function createResort(scene, quality) {
  const T = detailTextures();
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), {
    key: 'resort',
    uniforms: { tStucco: { value: T.stucco }, tStone: { value: T.stone }, tPaving: { value: T.paving }, tWood: { value: T.wood }, tThatch: { value: T.thatch } },
    vertexPars: 'attribute float aMat;\nattribute float aAO;\nattribute float aH;\nvarying float vMat;\nvarying float vAO;\nvarying float vH;\nvarying vec3 vWN;',
    vertex: `vMat = aMat; vAO = aAO; vH = aH;
#ifdef USE_INSTANCING
  vWN = normalize(mat3(instanceMatrix) * normal);
#else
  vWN = normal;
#endif`,
    fragmentPars: /* glsl */ `
varying float vMat; varying float vAO; varying float vH; varying vec3 vWN;
uniform sampler2D tStucco, tStone, tPaving, tWood, tThatch;
float gDetail;
vec3 tri(sampler2D t, float s){
  vec3 bw = pow(abs(vWN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  return texture2D(t, vWPos.zy*s).rgb*bw.x + texture2D(t, vWPos.xz*s).rgb*bw.y + texture2D(t, vWPos.xy*s).rgb*bw.z;
}`,
    color: /* glsl */ `
{
  vec3 det = vec3(0.78);
  float k = 1.0;
  if (vMat < 0.5) { det = tri(tStucco, 0.42); k = 1.45;
    // rain streaks and sun-bleached patches on the plaster
    float streak = smoothstep(0.5, 0.9, vnoise(vec2(dot(vWPos.xz, vec2(2.3, 1.9)), vWPos.y*0.22))) * aaw(3.0, gFw);
    det *= 1.0 - 0.2*streak; det *= 0.86 + 0.3*fbm(vWPos.xz*0.11 + vWPos.y*0.3);
  }
  else if (vMat < 1.5) { det = tri(tStone, 0.36); k = 1.3; }
  else if (vMat < 2.5) { det = tri(tPaving, 0.5); k = 1.2; }
  else if (vMat < 3.5) { det = tri(tWood, 0.9); k = 1.3; }
  else if (vMat < 4.5) { det = tri(tThatch, 0.55); k = 1.5; det *= 0.8 + 0.35*vnoise(vWPos.xz*1.4); }
  else if (vMat < 5.5) { det = vec3(0.8); k = 1.0; }
  gDetail = dot(det, vec3(0.333));
  diffuseColor.rgb *= det * k;
}`,
    bump: 'bumpH = gDetail * (vMat < 0.5 ? 0.012 : vMat < 2.5 ? 0.04 : vMat < 4.5 ? 0.035 : 0.0) * aaw(4.0, gFw);',
    // baked occlusion, plus a darker band where walls meet the ground
    ao: 'gAO = vAO * mix(0.55, 1.0, smoothstep(-0.3, 1.5, vH));',
    patch(shader) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = (vMat > 4.5 && vMat < 5.5) ? 0.05 : (vMat > 5.5 ? 0.45 : 0.88);`);
    },
  });

  // ---- static geometry ----
  // `flat`: paving lying on the ground (decks, paths, the court). It is drawn
  // as a decal with a depth offset, so it never fights with the terrain a few
  // centimetres below it, however far away it is.
  const parts = [], flat = [];
  for (const b of BUILDINGS) parts.push(b.kind === 'main' ? mainBuilding(b) : smallBuilding(b));
  for (const h of HUTS) parts.push(hut(h));
  flat.push(...buildPools(scene));

  // promenade behind the beach and garden paths between the blocks
  const prom = [];
  for (let x = -270; x <= 235; x += 4) prom.push([x, shoreZ(x) - 30]);
  flat.push(path(prom, 3.4, C.paving));
  const paths = [
    [[52, -31], [50, -50]], [[50, -84], [46, -150]], [[-20, -31], [-24, -100]], [[-90, -31], [-88, -78]],
    [[-88, -104], [-96, -200]], [[40, -68], [8, -62]], [[-22, -64], [-66, -90]], [[4, -31], [2, -42]],
    [[44, -150], [-60, -152]], [[104, -40], [106, -150]], [[-128, -40], [-112, -100]], [[70, -150], [44, -172]],
  ];
  for (const [a, b] of paths) flat.push(path(curve(a, b, 1.6), 2.3, C.paving));

  // beach volleyball court
  {
    const v = VOLLEYBALL, y = terrainHeight(v.x, v.z);
    flat.push(box(v.w, 0.12, v.d, C.sand, M.PAINT, v.x, y - 0.04, v.z, 0, 1, true));
    for (const s of [-1, 1]) parts.push(cyl(0.05, 0.05, 2.5, C.white, M.PAINT, v.x, y, v.z + s * (v.d / 2 + 0.3), 8));
    parts.push(box(0.03, 0.9, v.d + 0.6, C.white, M.PAINT, v.x, y + 1.5, v.z));
  }
  // lamp posts along the promenade
  for (const l of LAYOUT.lamps) {
    parts.push(cyl(0.05, 0.07, 3.2, C.lamp, M.PAINT, l.x, l.y, l.z, 8));
    parts.push(cyl(0.2, 0.12, 0.3, C.lamp, M.PAINT, l.x, l.y + 3.2, l.z, 8));
    parts.push(cyl(0.16, 0.16, 0.26, C.cream, M.GLASS, l.x, l.y + 3.5, l.z, 8));
    parts.push(cyl(0.02, 0.24, 0.16, C.lamp, M.PAINT, l.x, l.y + 3.76, l.z, 8));
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const decalMat = mat.clone();
  decalMat.onBeforeCompile = mat.onBeforeCompile; decalMat.customProgramCacheKey = mat.customProgramCacheKey;
  decalMat.polygonOffset = true; decalMat.polygonOffsetFactor = -1; decalMat.polygonOffsetUnits = -4;
  const decals = new THREE.Mesh(mergeGeometries(flat), decalMat);
  decals.receiveShadow = true;
  scene.add(decals);

  // ---- room units: culled per instance, simpler models far away ----
  for (const kind of ['rooms', 'bungalow']) {
    const list = LAYOUT.units.filter((u) => u.kind === kind);
    const geo = kind === 'rooms' ? roomUnitGeometry : bungalowGeometry;
    createPool(scene, {
      name: kind, castShadow: true, margin: 0.3,
      items: list.map((u) => ({ matrix: trs(u.x, u.y, u.z, u.rot) })),
      levels: [
        { maxDist: 60, parts: [{ geometry: geo(), material: mat }] },
        { maxDist: 5000, parts: [{ geometry: geo(true), material: mat }] },
      ],
    });
  }

  // ---- umbrellas: thatch on a yellow pole ----
  {
    const umbrella = (lo) => mergeVertices(mergeGeometries([
      cyl(0.05, 0.06, 2.45, C.yellow, M.PAINT, 0, 0, 0, lo ? 5 : 8),
      ...thatchRoof(1.85, 0.95, 2.25, lo ? 9 : 20, C.thatch, lo ? 1 : 3),
      cyl(0.12, 0.3, 0.2, C.thatchDark, M.THATCH, 0, 3.15, 0, lo ? 5 : 8),
    ]));
    const umat = mat.clone();
    umat.side = THREE.DoubleSide;
    umat.onBeforeCompile = mat.onBeforeCompile; umat.customProgramCacheKey = () => mat.customProgramCacheKey() + 'ds';
    createPool(scene, {
      name: 'umbrellas', castShadow: true, margin: 0.2,
      items: LAYOUT.umbrellas.map((u) => ({ matrix: trs(u.x, u.y - 0.1, u.z, u.rot) })),
      levels: [
        { maxDist: 50, parts: [{ geometry: umbrella(false), material: umat }] },
        { maxDist: 900, parts: [{ geometry: umbrella(true), material: umat }] },
      ],
    });
  }
  // ---- sunbeds: white frame, blue and white striped mattress ----
  {
    const bed = (lo) => {
      const P = [];
      const plain = (g) => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; };
      const add = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); P.push(plain(g)); };
      add(0.7, 0.07, 1.45, 0, 0.33, 0.2); add(0.7, 0.07, 0.78, 0, 0.6, -0.74, 0.72);            // frame
      add(0.62, 0.09, 1.4, 0, 0.41, 0.2); add(0.62, 0.09, 0.72, 0, 0.67, -0.71, 0.72);          // mattress
      if (lo) add(0.56, 0.3, 1.2, 0, 0.15, 0.26);                                               // legs, as one block
      else {
        for (const [x, z] of [[-0.3, 0.82], [0.3, 0.82], [-0.3, -0.3], [0.3, -0.3]]) add(0.06, 0.3, 0.06, x, 0.15, z);
        for (const x of [-0.32, 0.32]) add(0.05, 0.06, 1.5, x, 0.27, 0.2);
      }
      return mergeVertices(mergeGeometries(P));
    };
    const sm = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), {
      key: 'sunbed',
      color: `float mat = step(0.375, vObj.y) * step(abs(vObj.x), 0.312);
float stripe = step(0.5, fract(vObj.z*3.2 + vObj.y*1.2));
vec3 cloth = mix(vec3(0.93,0.94,0.96), vec3(0.08,0.3,0.72), stripe);
diffuseColor.rgb = mix(vec3(0.9,0.93,0.9), cloth, mat);`,
    });
    createPool(scene, {
      name: 'sunbeds', castShadow: quality !== 'low', margin: 0.1,
      items: LAYOUT.sunbeds.map((b) => ({ matrix: trs(b.x, b.y, b.z, b.rot) })),
      levels: [
        { maxDist: 35, parts: [{ geometry: bed(false), material: sm }] },
        { maxDist: 180, parts: [{ geometry: bed(true), material: sm }] },
      ],
    });
  }
  // ---- buoys ----
  const m4 = new THREE.Matrix4();
  {
    const g = new THREE.SphereGeometry(0.3, 10, 6);
    const bm = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.4 }), {
      key: 'buoy', color: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), step(0.12, vObj.y)*step(vObj.y, 0.2));',
    });
    const im = new THREE.InstancedMesh(g, bm, LAYOUT.buoys.length);
    LAYOUT.buoys.forEach((b, i) => { m4.makeTranslation(b.x, 0.06, b.z); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere();
    scene.add(im);
  }
  // ---- warning sign near the spawn ----
  {
    const sx = 10.5, sz = shoreZ(10.5) - 2.2, sy = terrainHeight(sx, sz);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.3), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8, side: THREE.DoubleSide }));
    board.position.set(sx, sy + 1.75, sz);
    board.rotation.y = Math.PI + 0.25;
    board.castShadow = true;
    scene.add(board);
    const pg = new THREE.CylinderGeometry(0.05, 0.06, 2.5, 8);
    const pm = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(pg, pm);
      post.position.set(sx + Math.cos(0.25) * s * 0.9 * -1, sy + 0.95, sz + Math.sin(0.25) * s * 0.9 + 0.05);
      post.castShadow = true;
      scene.add(post);
    }
  }
  return mesh;
}
