// Palms, mangroves, garden bushes and seagrass. Everything is instanced.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from '../sim/layout.js';
import { mulberry32 } from '../sim/noise.js';
import { patchMaterial, paint, canvasTexture } from './shared.js';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();

function setInst(mesh, i, x, y, z, rotY, s, tiltX = 0, tiltZ = 0) {
  E.set(tiltX, rotY, tiltZ, 'YXZ');
  Q.setFromEuler(E);
  M4.compose(V.set(x, y, z), Q, S.set(s, s, s));
  mesh.setMatrixAt(i, M4);
}

// ---- textures --------------------------------------------------------------
function frondTexture() {
  return canvasTexture(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const rnd = mulberry32(5);
    for (let i = 0; i < 46; i++) {
      const t = i / 45, y = h - 8 - t * (h - 20);
      const len = (w * 0.48) * Math.sin(Math.PI * (0.12 + 0.88 * t) * 0.92) * (0.9 + rnd() * 0.2);
      for (const side of [-1, 1]) {
        const gr = 95 + rnd() * 70;
        g.strokeStyle = `rgb(${30 + rnd() * 30},${gr},${22 + rnd() * 20})`;
        g.lineWidth = 5.2;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(w / 2, y);
        g.quadraticCurveTo(w / 2 + side * len * 0.6, y - 16, w / 2 + side * len, y - 6 + rnd() * 8);
        g.stroke();
      }
    }
    g.strokeStyle = '#6f7a2e'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 8); g.stroke();
  });
}

function leafTexture(flower) {
  return canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.scale(2, 2); w /= 2; h /= 2;
    const rnd = mulberry32(flower ? 91 : 17);
    for (let i = 0; i < 210; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * w * 0.44;
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r;
      const lit = rnd();
      g.save();
      g.translate(x, y); g.rotate(rnd() * 6.283);
      if (flower && rnd() < 0.36) g.fillStyle = `rgb(${200 + rnd() * 55},${30 + rnd() * 50},${120 + rnd() * 80})`;
      else g.fillStyle = `rgb(${28 + lit * 50},${78 + lit * 80},${24 + lit * 30})`;
      g.beginPath(); g.ellipse(0, 0, 12 + rnd() * 5, 5 + rnd() * 2, 0, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(190,220,120,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-11, 0); g.lineTo(11, 0); g.stroke();
      g.restore();
    }
  });
}

// A card whose normals point away from `centre`, so a cluster shades like a soft ball.
function leafCard(size, pos, centre, rnd) {
  const g = new THREE.PlaneGeometry(size, size);
  g.rotateX((rnd() - 0.5) * 1.6); g.rotateY(rnd() * 6.283); g.rotateZ((rnd() - 0.5) * 1.2);
  g.translate(pos.x, pos.y, pos.z);
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    V.set(p.getX(i) - centre.x, p.getY(i) - centre.y + size * 0.25, p.getZ(i) - centre.z).normalize();
    n.setXYZ(i, V.x, V.y, V.z);
  }
  return g;
}

// ---- palms ---------------------------------------------------------------------
function palmGeometry(variant) {
  const rnd = mulberry32(100 + variant * 7);
  const H = 6.2 + variant * 1.3;
  const bend = 0.035 + variant * 0.012;
  const trunk = new THREE.CylinderGeometry(0.15, 0.27, H, 7, 9);
  trunk.translate(0, H / 2, 0);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setX(i, tp.getX(i) + bend * y * y);
  }
  trunk.computeVertexNormals();
  const topX = bend * H * H;

  const fronds = [];
  const n = 15;
  for (let i = 0; i < n; i++) {
    const L = 3.1 + rnd() * 1.0, W = 1.15;
    const g = new THREE.PlaneGeometry(W, L, 2, 7);
    const p = g.attributes.position;
    const up = i < 5 ? 0.95 - rnd() * 0.2 : 0.45 - rnd() * 0.75; // inner fronds stand up, outer droop
    for (let k = 0; k < p.count; k++) {
      const u = p.getX(k) / W, t = p.getY(k) / L + 0.5;
      const out = t * L;
      const droop = -0.16 * out * out * (1.1 - up * 0.4);
      const yy = Math.sin(up) * out + droop - Math.abs(u) * W * 0.42;
      const zz = Math.cos(up) * out * (1 - 0.06 * out);
      p.setXYZ(k, u * W, yy, zz);
    }
    g.computeVertexNormals();
    g.rotateY((i / n) * 6.283 * 2.4 + rnd() * 0.4);
    g.translate(topX, H - 0.1, 0);
    fronds.push(g);
  }
  return { trunk, fronds: mergeGeometries(fronds) };
}

export function createPalms(scene, quality) {
  const trunkMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x8d7252, roughness: 0.95 }), {
    sway: 0.35, key: 'palmTrunk',
    color: 'diffuseColor.rgb *= 0.78 + 0.22*step(0.5, fract(vWPos.y*3.2)) ;',
  });
  const frondMat = patchMaterial(new THREE.MeshStandardMaterial({
    map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, color: 0xd9e8c4,
  }), { sway: 0.35, key: 'palmFrond' });
  frondMat.alphaToCoverage = quality !== 'low';
  const group = new THREE.Group();
  for (let v = 0; v < 3; v++) {
    const list = LAYOUT.palms.filter((p) => p.v === v);
    if (!list.length) continue;
    const g = palmGeometry(v);
    const t = new THREE.InstancedMesh(g.trunk, trunkMat, list.length);
    const f = new THREE.InstancedMesh(g.fronds, frondMat, list.length);
    list.forEach((p, i) => {
      setInst(t, i, p.x, p.y - 0.15, p.z, p.rot, p.s);
      setInst(f, i, p.x, p.y - 0.15, p.z, p.rot, p.s);
    });
    for (const m of [t, f]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; group.add(m); }
  }
  scene.add(group);
  return group;
}

// ---- mangroves ------------------------------------------------------------------
function mangroveGeometry(variant) {
  const rnd = mulberry32(700 + variant * 13);
  const bark = [], leaves = [];
  const trunkH = 2.4 + rnd() * 0.8;
  const lean = new THREE.Vector3((rnd() - 0.5) * 0.7, 0, (rnd() - 0.5) * 0.7);
  const trunkTop = new THREE.Vector3(lean.x, 1.1 + trunkH, lean.z);
  const trunkBase = new THREE.Vector3(0, 1.0, 0);
  const tube = (a, c, b, r, seg, sides) => {
    const curve = new THREE.QuadraticBezierCurve3(a, c, b);
    return new THREE.TubeGeometry(curve, seg, r, sides, false);
  };
  bark.push(tube(trunkBase, new THREE.Vector3(lean.x * 0.2, 2.2, lean.z * 0.2), trunkTop, 0.15, 4, 6));
  // stilt roots
  const nRoots = 9 + variant;
  for (let i = 0; i < nRoots; i++) {
    const a = (i / nRoots) * 6.283 + rnd() * 0.5;
    const rad = 0.95 + rnd() * 0.95;
    const startY = 0.9 + rnd() * 0.9;
    const start = new THREE.Vector3(Math.cos(a) * 0.08, startY, Math.sin(a) * 0.08);
    const end = new THREE.Vector3(Math.cos(a) * rad, -0.75, Math.sin(a) * rad);
    const ctrl = new THREE.Vector3(Math.cos(a) * rad * 0.95, startY + 0.25, Math.sin(a) * rad * 0.95);
    bark.push(tube(start, ctrl, end, 0.045 + rnd() * 0.025, 5, 4));
  }
  // branches and leaf clusters
  const nClusters = 4 + (variant % 2);
  for (let i = 0; i < nClusters; i++) {
    const a = (i / nClusters) * 6.283 + rnd();
    const r = i === 0 ? 0.2 : 1.1 + rnd() * 0.9;
    const c = new THREE.Vector3(trunkTop.x + Math.cos(a) * r, trunkTop.y + 0.2 + rnd() * 0.9, trunkTop.z + Math.sin(a) * r);
    const from = trunkBase.clone().lerp(trunkTop, 0.55 + rnd() * 0.4);
    bark.push(tube(from, from.clone().lerp(c, 0.5).add(new THREE.Vector3(0, 0.4, 0)), c, 0.06, 3, 4));
    const cr = 1.0 + rnd() * 0.5;
    for (let k = 0; k < 14; k++) {
      const th = rnd() * 6.283, ph = Math.acos(1 - rnd() * 1.5);
      const pos = new THREE.Vector3(c.x + Math.sin(ph) * Math.cos(th) * cr * 0.85, c.y + Math.cos(ph) * cr * 0.6, c.z + Math.sin(ph) * Math.sin(th) * cr * 0.85);
      leaves.push(leafCard(1.5 + rnd() * 0.7, pos, c, rnd).toNonIndexed());
    }
  }
  const barkGeo = mergeGeometries(bark.map((g) => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; }));
  return { bark: barkGeo, leaves: mergeGeometries(leaves) };
}

export function createMangroves(scene, quality) {
  const barkMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x77634e, roughness: 0.9 }), {
    key: 'mgBark',
    color: 'diffuseColor.rgb *= mix(vec3(0.5,0.52,0.42), vec3(1.0), smoothstep(-0.1, 0.5, vWPos.y)) * (0.85 + 0.3*vnoise(vWPos.xy*9.0));',
  });
  const leafMat = patchMaterial(new THREE.MeshStandardMaterial({
    map: leafTexture(false), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55, color: 0xe6f2d8,
  }), { sway: 0.22, key: 'mgLeaf' });
  leafMat.alphaToCoverage = quality !== 'low';
  const group = new THREE.Group();
  const geos = [0, 1, 2].map(mangroveGeometry);
  const CH = 150;
  const buckets = new Map();
  for (const m of LAYOUT.mangroves) {
    const k = m.v + ':' + Math.floor(m.x / CH);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(m);
  }
  const tint = new THREE.Color();
  for (const [k, list] of buckets) {
    const v = +k.split(':')[0];
    const b = new THREE.InstancedMesh(geos[v].bark, barkMat, list.length);
    const l = new THREE.InstancedMesh(geos[v].leaves, leafMat, list.length);
    list.forEach((m, i) => {
      setInst(b, i, m.x, m.y, m.z, m.rot, m.s);
      setInst(l, i, m.x, m.y, m.z, m.rot, m.s);
      const h = (Math.sin(m.x * 12.9 + m.z * 78.2) * 43758.5) % 1;
      tint.setHSL(0.27 + 0.05 * h, 0.35, 0.78 + 0.12 * Math.abs(h));
      l.setColorAt(i, tint);
    });
    for (const mesh of [b, l]) {
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  scene.add(group);
  return group;
}

// ---- garden bushes (bougainvillea) --------------------------------------------------
export function createBushes(scene, quality) {
  const rnd = mulberry32(31);
  const parts = [];
  const c = new THREE.Vector3(0, 0.75, 0);
  for (let k = 0; k < 15; k++) {
    const th = rnd() * 6.283, ph = Math.acos(1 - rnd() * 1.2);
    const pos = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * 0.8, 0.75 + Math.cos(ph) * 0.6, Math.sin(ph) * Math.sin(th) * 0.8);
    parts.push(leafCard(1.3, pos, c, rnd).toNonIndexed());
  }
  const geo = mergeGeometries(parts);
  const mat = patchMaterial(new THREE.MeshStandardMaterial({
    map: leafTexture(true), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6,
  }), { sway: 0.5, key: 'bush' });
  mat.alphaToCoverage = quality !== 'low';
  const mesh = new THREE.InstancedMesh(geo, mat, LAYOUT.bushes.length);
  LAYOUT.bushes.forEach((b, i) => setInst(mesh, i, b.x, b.y - 0.1, b.z, b.rot, b.s));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// ---- seagrass ---------------------------------------------------------------------------
export function createSeagrass(scene, quality) {
  const rnd = mulberry32(77);
  const blades = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.45 + rnd() * 0.45, w = 0.045;
    const g = new THREE.PlaneGeometry(w, h, 1, 3);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) / h;
      p.setX(k, p.getX(k) * (1 - 0.7 * t));
      p.setZ(k, t * t * 0.18);
    }
    g.rotateY(rnd() * 6.283);
    g.translate((rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5);
    g.computeVertexNormals();
    paint(g, new THREE.Color().setHSL(0.25 + rnd() * 0.07, 0.55, 0.22 + rnd() * 0.14));
    blades.push(g);
  }
  const geo = mergeGeometries(blades);
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }), { swayWater: 0.22, key: 'grass' });
  const list = quality === 'low' ? LAYOUT.seagrass.filter((_, i) => i % 2 === 0) : LAYOUT.seagrass;
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((s, i) => setInst(mesh, i, s.x, s.y - 0.03, s.z, s.rot, s.s * 1.2));
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}
