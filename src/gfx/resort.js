// The resort: Nubian-style low buildings with domes, pools with decks, beach
// bars, umbrellas, sunbeds, promenade, buoy line and the warning sign.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, HUTS, POOLS } from '../sim/mapdata.js';
import { LAYOUT } from '../sim/layout.js';
import { terrainHeight, shoreZ } from '../sim/terrain.js';
import { patchMaterial, paint, canvasTexture } from './shared.js';

const C = {
  plaster: new THREE.Color(0.9, 0.78, 0.6),
  plaster2: new THREE.Color(0.86, 0.66, 0.46),
  terracotta: new THREE.Color(0.7, 0.36, 0.22),
  white: new THREE.Color(0.93, 0.91, 0.86),
  wood: new THREE.Color(0.3, 0.19, 0.11),
  glass: new THREE.Color(0.05, 0.1, 0.14),
  door: new THREE.Color(0.06, 0.42, 0.47),
  thatch: new THREE.Color(0.66, 0.52, 0.28),
  stone: new THREE.Color(0.8, 0.72, 0.6),
  tile: new THREE.Color(0.5, 0.8, 0.9),
  cushion: new THREE.Color(0.15, 0.45, 0.7),
  red: new THREE.Color(0.85, 0.12, 0.08),
};

function prep(g, color) {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  return paint(n, color);
}
function box(w, h, d, color, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return prep(g, color);
}
function dome(r, color, x, y, z, squash = 1) {
  const g = new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  return prep(g, color);
}
function cyl(rt, rb, h, color, x, y, z, seg = 12) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y + h / 2, z);
  return prep(g, color);
}
function place(parts, b, y0) {
  const g = mergeGeometries(parts);
  g.rotateY(b.rot || 0);
  g.translate(b.x, y0, b.z);
  return g;
}

function roomBlock(b) {
  // local frame: length along x
  const along = b.w >= b.d;
  const L = along ? b.w : b.d, D = along ? b.d : b.w, H = b.h;
  const parts = [];
  const tone = (Math.abs(b.x) + Math.abs(b.z)) % 2 < 1 ? C.plaster : C.plaster2;
  parts.push(box(L, H + 1.5, D, tone, 0, -1.5, 0));
  parts.push(box(L + 0.3, 0.35, D + 0.3, C.terracotta, 0, H, 0));
  parts.push(box(L + 0.1, 0.5, D + 0.1, C.terracotta, 0, 3.05, 0));
  const bays = Math.floor(L / 4.6);
  for (let i = 0; i < bays; i++) {
    const x = -L / 2 + (i + 0.5) * (L / bays);
    for (const side of [-1, 1]) {
      const z = side * (D / 2 + 0.03);
      for (const fy of [0.15, 3.65]) {
        parts.push(box(1.5, 2.15, 0.08, C.glass, x - 0.7, fy, z));
        parts.push(box(1.7, 0.12, 0.14, C.wood, x - 0.7, fy + 2.15, z));
        parts.push(box(0.95, 2.15, 0.08, C.door, x + 1.0, fy, z));
      }
      // balcony
      parts.push(box(L / bays - 0.5, 0.14, 1.3, C.white, x, 3.5, side * (D / 2 + 0.65)));
      parts.push(box(L / bays - 0.5, 0.85, 0.07, C.white, x, 3.64, side * (D / 2 + 1.27)));
      parts.push(box(0.2, 3.5, 0.2, C.white, x + (L / bays) / 2 - 0.25, 0, side * (D / 2 + 1.2)));
    }
  }
  parts.push(dome(2.3, C.white, -L / 2 + 3.4, H + 0.3, 0));
  parts.push(dome(2.3, C.white, L / 2 - 3.4, H + 0.3, 0));
  parts.push(cyl(2.4, 2.4, 0.5, tone, -L / 2 + 3.4, H, 0, 18));
  parts.push(cyl(2.4, 2.4, 0.5, tone, L / 2 - 3.4, H, 0, 18));
  const g = mergeGeometries(parts);
  if (!along) g.rotateY(Math.PI / 2);
  g.rotateY(b.rot || 0);
  g.translate(b.x, terrainHeight(b.x, b.z), b.z);
  return g;
}

function mainBuilding(b) {
  const parts = [];
  const { w: L, d: D, h: H } = b;
  parts.push(box(L, H + 2, D, C.plaster, 0, -2, 0));
  parts.push(box(L + 0.4, 0.45, D + 0.4, C.terracotta, 0, H, 0));
  parts.push(box(26, H + 3.2, D + 4, C.plaster2, 0, 0, 0));
  parts.push(box(26.4, 0.5, D + 4.4, C.terracotta, 0, H + 3.2, 0));
  parts.push(cyl(8.4, 8.4, 1.6, C.white, 0, H + 3.2, 0, 24));
  parts.push(dome(8.2, C.white, 0, H + 4.8, 0, 0.82));
  parts.push(cyl(0.12, 0.12, 2.2, C.terracotta, 0, H + 11.4, 0, 6));
  for (const sx of [-1, 1]) {
    parts.push(box(7, H + 2.4, 7, C.plaster2, sx * (L / 2 - 3.5), 0, D / 2 - 2));
    parts.push(dome(3.3, C.white, sx * (L / 2 - 3.5), H + 2.4, D / 2 - 2));
  }
  // arcade facing the pools
  for (let i = -6; i <= 6; i++) {
    parts.push(box(0.6, 4.2, 0.6, C.white, i * 4.4, 0, D / 2 + 4.2));
    if (i < 6) parts.push(box(3.2, 2.6, 0.1, C.glass, i * 4.4 + 2.2, 0.2, D / 2 + 0.06));
  }
  parts.push(box(57, 0.4, 5.2, C.terracotta, 0, 4.2, D / 2 + 2.4));
  for (let i = -7; i <= 7; i++) {
    if (Math.abs(i) < 3) continue;
    parts.push(box(2.2, 1.6, 0.1, C.glass, i * 4.4, 5.6, D / 2 + 0.06));
    parts.push(box(2.2, 1.6, 0.1, C.glass, i * 4.4, 5.6, -D / 2 - 0.06));
  }
  return place(parts, b, terrainHeight(b.x, b.z));
}

function restaurant(b) {
  const parts = [];
  const { w: L, d: D, h: H } = b;
  parts.push(box(L, H + 1.5, D, C.plaster, 0, -1.5, 0));
  parts.push(box(L + 0.4, 0.4, D + 0.4, C.terracotta, 0, H, 0));
  parts.push(dome(4.2, C.white, 0, H + 0.4, 0, 0.75));
  for (let i = -3; i <= 3; i++) {
    parts.push(box(3.0, 2.8, 0.1, C.glass, i * 4, 0.3, D / 2 + 0.06));
    parts.push(box(0.35, 3.4, 0.35, C.wood, i * 4 + 2, 0, D / 2 + 6));
  }
  parts.push(box(L, 0.25, 6.4, C.thatch, 0, 3.4, D / 2 + 3.2));
  return place(parts, b, terrainHeight(b.x, b.z));
}

function diveCenter(b) {
  const parts = [];
  parts.push(box(b.w, b.h + 1, b.d, C.white, 0, -1, 0));
  parts.push(box(b.w + 0.3, 0.3, b.d + 0.3, C.door, 0, b.h, 0));
  parts.push(box(3, 2.3, 0.1, C.glass, -3, 0.2, b.d / 2 + 0.06));
  parts.push(box(1.2, 2.3, 0.1, C.door, 2.5, 0.2, b.d / 2 + 0.06));
  parts.push(box(b.w, 0.2, 4, C.thatch, 0, 2.9, b.d / 2 + 2));
  for (const sx of [-1, 1]) parts.push(box(0.25, 2.9, 0.25, C.wood, sx * (b.w / 2 - 0.3), 0, b.d / 2 + 3.8));
  return place(parts, b, terrainHeight(b.x, b.z));
}

function hut(h) {
  const parts = [];
  const y0 = terrainHeight(h.x, h.z);
  if (h.kind === 'tower') {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(box(0.16, 4.6, 0.16, C.white, sx * 0.95, 0, sz * 0.95));
    parts.push(box(2.3, 0.14, 2.3, C.wood, 0, 2.3, 0));
    parts.push(box(2.3, 0.7, 0.08, C.white, 0, 2.44, -1.1));
    parts.push(box(0.08, 0.7, 2.3, C.white, -1.1, 2.44, 0));
    parts.push(box(0.08, 0.7, 2.3, C.white, 1.1, 2.44, 0));
    parts.push(box(2.8, 0.14, 2.8, C.red, 0, 4.6, 0));
    parts.push(box(0.06, 1.6, 0.06, C.white, 1.2, 4.7, 1.2));
    parts.push(box(0.8, 0.5, 0.03, C.red, 1.62, 5.75, 1.2));
    parts.push(box(0.5, 0.06, 0.12, C.wood, 0, 0.6, 1.25));
    parts.push(box(0.5, 0.06, 0.12, C.wood, 0, 1.2, 1.2));
    parts.push(box(0.5, 0.06, 0.12, C.wood, 0, 1.8, 1.15));
  } else {
    parts.push(cyl(h.r - 1.2, h.r - 1.2, 1.15, C.wood, 0, 0, 0, 14));
    parts.push(cyl(h.r - 1.0, h.r - 1.0, 0.1, C.stone, 0, 1.15, 0, 14));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283;
      parts.push(cyl(0.09, 0.09, 3.1, C.wood, Math.cos(a) * (h.r - 0.4), 0, Math.sin(a) * (h.r - 0.4), 6));
    }
    parts.push(cyl(0.15, 0.15, 3.6, C.wood, 0, 0, 0, 6));
    const roof = new THREE.ConeGeometry(h.r + 1.1, 2.7, 16, 1, true);
    roof.translate(0, 3.0 + 1.35, 0);
    parts.push(prep(roof, C.thatch));
    const skirt = new THREE.CylinderGeometry(h.r + 1.1, h.r + 1.25, 0.45, 16, 1, true);
    skirt.translate(0, 2.85, 0);
    parts.push(prep(skirt, C.thatch.clone().multiplyScalar(0.8)));
  }
  const g = mergeGeometries(parts);
  g.translate(h.x, y0, h.z);
  return g;
}

function ellipseShape(rx, rz, n = 56) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * rz;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return s;
}

function buildPools(scene) {
  const deckParts = [];
  for (const p of POOLS) {
    // deck with a hole
    const outer = ellipseShape(p.rx + 7.5, p.rz + 7.5);
    const hole = new THREE.Path();
    for (let i = 0; i <= 56; i++) {
      const a = -(i / 56) * Math.PI * 2;
      const x = Math.cos(a) * p.rx, y = Math.sin(a) * p.rz;
      if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
    }
    outer.holes.push(hole);
    const deck = new THREE.ShapeGeometry(outer, 8);
    deck.rotateX(-Math.PI / 2);
    deck.translate(p.x, p.deckY, p.z);
    deckParts.push(prep(deck, C.stone));
    // coping stones around the edge
    const rim = new THREE.TorusGeometry(1, 0.012, 4, 56);
    rim.rotateX(Math.PI / 2); rim.scale(p.rx + 0.15, 6, p.rz + 0.15);
    rim.translate(p.x, p.deckY + 0.03, p.z);
    deckParts.push(prep(rim, C.white));

    // basin (tiles + walls), lit by caustics at this pool's own water level
    const basinParts = [];
    const floor = new THREE.ShapeGeometry(ellipseShape(p.rx, p.rz), 8);
    floor.rotateX(-Math.PI / 2);
    floor.translate(p.x, p.floor, p.z);
    basinParts.push(prep(floor, C.tile));
    const hW = p.deckY - p.floor;
    const wall = new THREE.CylinderGeometry(1, 1, hW, 56, 1, true);
    wall.scale(-p.rx, 1, p.rz); // flipped so the inside faces the swimmer
    wall.translate(p.x, p.floor + hW / 2, p.z);
    const w2 = prep(wall, C.tile);
    // flipping x mirrors the winding; reverse triangles to keep them front-facing inwards
    const pa = w2.attributes.position, na = w2.attributes.normal;
    for (let i = 0; i < na.count; i++) na.setXYZ(i, -(pa.getX(i) - p.x) / p.rx, 0, -(pa.getZ(i) - p.z) / p.rz);
    basinParts.push(w2);
    if (p.island) {
      const isl = new THREE.CylinderGeometry(p.island.r, p.island.r + 0.3, hW + 0.05, 28);
      isl.translate(p.island.x, p.floor + (hW + 0.05) / 2, p.island.z);
      basinParts.push(prep(isl, C.stone));
    }
    const basinMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, side: THREE.DoubleSide }), {
      waterLevel: p.level, key: 'basin',
      color: 'diffuseColor.rgb *= 0.86 + 0.14*step(0.07, fract(vWPos.x*1.6))*step(0.07, fract(vWPos.z*1.6));',
    });
    const basin = new THREE.Mesh(mergeGeometries(basinParts), basinMat);
    basin.receiveShadow = true;
    scene.add(basin);
  }
  return deckParts;
}

function path(points, width, color) {
  const pos = [], idx = [];
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const [nx, nz] = points[Math.min(i + 1, points.length - 1)];
    const [px, pz] = points[Math.max(i - 1, 0)];
    let tx = nx - px, tz = nz - pz;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const ox = -tz * width / 2, oz = tx * width / 2;
    pos.push(x + ox, terrainHeight(x + ox, z + oz) + 0.05, z + oz, x - ox, terrainHeight(x - ox, z - oz) + 0.05, z - oz);
    if (i < points.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.toNonIndexed();
  // make sure the strip faces up regardless of winding
  const na = n.attributes.normal;
  for (let i = 0; i < na.count; i++) if (na.getY(i) < 0) na.setXYZ(i, -na.getX(i), -na.getY(i), -na.getZ(i));
  return paint(n, color);
}

function signTexture() {
  return canvasTexture(512, 320, (g, w, h) => {
    g.fillStyle = '#f3e6c4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b3261e'; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#b3261e'; g.textAlign = 'center';
    g.font = 'bold 62px sans-serif'; g.fillText('⚠ POZOR ⚠', w / 2, 86);
    g.fillStyle = '#2b2118'; g.font = 'bold 34px sans-serif';
    g.fillText('Za bójkami je plytčina,', w / 2, 146);
    g.fillText('mangrovy a', w / 2, 190);
    g.fillStyle = '#b3261e'; g.font = 'bold 50px sans-serif';
    g.fillText('KROKODÍLY', w / 2, 248);
    g.fillStyle = '#2b2118'; g.font = '24px sans-serif';
    g.fillText('Plávanie na vlastné riziko (je to sen)', w / 2, 290);
  });
}

export function createResort(scene, quality) {
  const parts = [];
  for (const b of BUILDINGS) {
    if (b.kind === 'main') parts.push(mainBuilding(b));
    else if (b.kind === 'restaurant') parts.push(restaurant(b));
    else if (b.kind === 'dive') parts.push(diveCenter(b));
    else parts.push(roomBlock(b));
  }
  for (const h of HUTS) parts.push(hut(h));
  parts.push(...buildPools(scene));

  // promenade behind the beach and two garden paths
  const prom = [];
  for (let x = -285; x <= 285; x += 5) prom.push([x, shoreZ(x) - 37]);
  parts.push(path(prom, 3.6, C.stone));
  for (const sx of [-62, 62]) {
    const pts = [];
    for (let z = -206; z <= -40; z += 5) pts.push([sx + 9 * Math.sin((z + 40) / 38), z]);
    parts.push(path(pts, 2.6, C.stone));
  }

  const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }), {
    key: 'resort',
    color: 'diffuseColor.rgb *= 0.9 + 0.2*vnoise(vWPos.xz*0.7 + vWPos.y*1.3);',
  });
  const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);

  // umbrellas
  {
    const pole = cyl(0.045, 0.055, 2.5, C.wood, 0, 0, 0, 6);
    const top = new THREE.ConeGeometry(1.75, 0.95, 12, 1, true);
    top.translate(0, 2.5 + 0.2, 0);
    const skirt = new THREE.CylinderGeometry(1.75, 1.85, 0.28, 12, 1, true);
    skirt.translate(0, 2.1, 0);
    const g = mergeGeometries([pole, prep(top, C.thatch), prep(skirt, C.thatch.clone().multiplyScalar(0.78))]);
    const um = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(g, um, LAYOUT.umbrellas.length);
    const m4 = new THREE.Matrix4();
    LAYOUT.umbrellas.forEach((u, i) => { m4.makeRotationY(u.rot); m4.setPosition(u.x, u.y - 0.1, u.z); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    scene.add(im);
  }
  // sunbeds
  {
    const frame = box(0.68, 0.08, 1.45, C.white, 0, 0.3, 0.2);
    const back = new THREE.BoxGeometry(0.68, 0.08, 0.75);
    back.rotateX(0.75); back.translate(0, 0.58, -0.72);
    const cushion = box(0.6, 0.06, 1.4, C.cushion, 0, 0.38, 0.2);
    const cb = new THREE.BoxGeometry(0.6, 0.06, 0.7);
    cb.rotateX(0.75); cb.translate(0, 0.64, -0.7);
    const legs = [box(0.6, 0.3, 0.06, C.white, 0, 0, 0.8), box(0.6, 0.3, 0.06, C.white, 0, 0, -0.35)];
    const g = mergeGeometries([frame, prep(back, C.white), cushion, prep(cb, C.cushion), ...legs]);
    const sm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    const im = new THREE.InstancedMesh(g, sm, LAYOUT.sunbeds.length);
    const m4 = new THREE.Matrix4();
    LAYOUT.sunbeds.forEach((s, i) => { m4.makeRotationY(s.rot); m4.setPosition(s.x, s.y, s.z); im.setMatrixAt(i, m4); });
    im.castShadow = quality === 'high'; im.receiveShadow = true; im.frustumCulled = false;
    scene.add(im);
  }
  // buoys
  {
    const g = new THREE.SphereGeometry(0.3, 12, 8);
    const bm = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.45 }), { key: 'buoy' });
    const im = new THREE.InstancedMesh(g, bm, LAYOUT.buoys.length);
    const m4 = new THREE.Matrix4();
    LAYOUT.buoys.forEach((b, i) => { m4.makeTranslation(b.x, 0.06, b.z); im.setMatrixAt(i, m4); });
    im.frustumCulled = false; im.castShadow = false;
    scene.add(im);
  }
  // warning sign near the spawn
  {
    const sx = 10.5, sz = shoreZ(10.5) - 1.5, sy = terrainHeight(sx, sz);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.3), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8, side: THREE.DoubleSide }));
    board.position.set(sx, sy + 1.75, sz);
    board.rotation.y = Math.PI + 0.25;
    board.castShadow = true;
    scene.add(board);
    const postG = mergeGeometries([box(0.1, 2.4, 0.1, C.wood, -0.9, 0, 0.06), box(0.1, 2.4, 0.1, C.wood, 0.9, 0, 0.06)]);
    const posts = new THREE.Mesh(postG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    posts.position.set(sx, sy - 0.3, sz);
    posts.rotation.y = Math.PI + 0.25;
    posts.castShadow = true;
    scene.add(posts);
  }
  return mesh;
}
