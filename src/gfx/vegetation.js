// Date palms, mangroves, garden plants and seagrass. Everything is instanced.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from '../sim/layout.js';
import { mulberry32 } from '../sim/noise.js';
import { patchMaterial, paint, canvasTexture, detailTextures } from './shared.js';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();

function setInst(mesh, i, x, y, z, rotY, s, tiltX = 0, tiltZ = 0) {
  E.set(tiltX, rotY, tiltZ, 'YXZ');
  Q.setFromEuler(E);
  M4.compose(V.set(x, y, z), Q, S.set(s, s, s));
  mesh.setMatrixAt(i, M4);
}

// ---- textures --------------------------------------------------------------
function frondTexture() {
  return canvasTexture(256, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const rnd = mulberry32(5);
    const n = 86;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y = h - 14 - t * (h - 34);
      const len = (w * 0.47) * Math.pow(Math.sin(Math.PI * (0.08 + 0.9 * t) * 0.96), 0.7) * (0.88 + rnd() * 0.2);
      for (const side of [-1, 1]) {
        const lit = rnd();
        const gr = g.createLinearGradient(w / 2, 0, w / 2 + side * len, 0);
        gr.addColorStop(0, `rgb(${52 + lit * 30},${96 + lit * 40},${30 + lit * 14})`);
        gr.addColorStop(1, `rgb(${88 + lit * 50},${132 + lit * 50},${44 + lit * 20})`);
        g.strokeStyle = gr;
        g.lineWidth = 3.4 + rnd() * 1.6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(w / 2, y);
        g.quadraticCurveTo(w / 2 + side * len * 0.55, y - 22 - rnd() * 8, w / 2 + side * len, y - 12 + rnd() * 14);
        g.stroke();
      }
    }
    const rib = g.createLinearGradient(0, h, 0, 0);
    rib.addColorStop(0, '#8d8a3e'); rib.addColorStop(1, '#6f8a30');
    g.strokeStyle = rib; g.lineWidth = 7;
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 10); g.stroke();
  });
}

function leafTexture(kind) {
  return canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.scale(2, 2); w /= 2; h /= 2;
    const rnd = mulberry32(kind === 'flower' ? 91 : kind === 'hedge' ? 55 : 17);
    const n = kind === 'hedge' ? 420 : 230;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * w * 0.45;
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r;
      const lit = rnd();
      g.save();
      g.translate(x, y); g.rotate(rnd() * 6.283);
      const big = kind === 'hedge' ? 0.55 : 1;
      if (kind === 'flower' && rnd() < 0.4) {
        g.fillStyle = `rgb(${205 + rnd() * 50},${30 + rnd() * 60},${120 + rnd() * 90})`;
        g.beginPath(); g.ellipse(0, 0, 8 + rnd() * 4, 6 + rnd() * 3, 0, 0, 6.283); g.fill();
      } else {
        const gr = g.createLinearGradient(0, -6 * big, 0, 6 * big);
        gr.addColorStop(0, `rgb(${40 + lit * 60},${96 + lit * 80},${30 + lit * 30})`);
        gr.addColorStop(1, `rgb(${18 + lit * 30},${56 + lit * 50},${18 + lit * 18})`);
        g.fillStyle = gr;
        g.beginPath(); g.ellipse(0, 0, (12 + rnd() * 5) * big, (5 + rnd() * 2) * big, 0, 0, 6.283); g.fill();
        g.strokeStyle = 'rgba(200,230,130,0.4)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(-11 * big, 0); g.lineTo(11 * big, 0); g.stroke();
      }
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

// ---- date palms --------------------------------------------------------------------
function palmGeometry(variant) {
  const rnd = mulberry32(100 + variant * 7);
  const H = 6.4 + variant * 1.4;
  const bend = 0.016 + variant * 0.01;
  // trunk: flared foot, slight taper, a swollen "boot" under the crown
  const profile = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    let r = 0.25 - 0.05 * t + 0.14 * Math.exp(-t * 14) + 0.09 * Math.exp(-((t - 0.97) ** 2) / 0.004);
    r += 0.012 * Math.sin(t * 60);
    profile.push(new THREE.Vector2(r, t * H));
  }
  const trunk = new THREE.LatheGeometry(profile, 12);
  const tp = trunk.attributes.position, tuv = trunk.attributes.uv;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setX(i, tp.getX(i) + bend * y * y);
    tuv.setXY(i, tuv.getX(i) * 3, (y / H) * H * 0.9);
  }
  trunk.computeVertexNormals();
  const topX = bend * H * H;

  const fronds = [];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const ring = i / n;
    const L = 3.3 + rnd() * 1.0, W = 1.2;
    const g = new THREE.PlaneGeometry(W, L, 2, 8);
    const p = g.attributes.position;
    // young fronds stand up in the middle, old ones hang
    const up = 1.15 - ring * 1.75 + (rnd() - 0.5) * 0.25;
    for (let k = 0; k < p.count; k++) {
      const u = p.getX(k) / W, t = p.getY(k) / L + 0.5;
      const out = t * L;
      const droop = -0.13 * out * out * (1.15 - up * 0.35);
      const yy = Math.sin(up) * out + droop - Math.abs(u) * W * (0.3 + 0.25 * t);
      const zz = Math.cos(up) * out * (1 - 0.05 * out);
      p.setXYZ(k, u * W * (1 - 0.15 * t), yy, zz);
    }
    g.computeVertexNormals();
    g.rotateY(i * 2.39996 + rnd() * 0.3);
    g.translate(topX, H - 0.05, 0);
    fronds.push(g);
  }
  return { trunk, fronds: mergeGeometries(fronds) };
}

export function createPalms(scene, quality) {
  const T = detailTextures();
  const trunkMat = patchMaterial(new THREE.MeshStandardMaterial({ map: T.palmBark, bumpMap: T.palmBark, bumpScale: 2.2, color: 0xb59a7c, roughness: 0.95 }), {
    sway: 0.3, key: 'palmTrunk',
  });
  const frondMat = patchMaterial(new THREE.MeshStandardMaterial({
    map: frondTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.55, color: 0xdfeacb,
  }), { sway: 0.3, key: 'palmFrond', vertex: 'transformed.y += sin(uTime*1.9 + position.z*0.9 + position.x*1.3)*0.012*dot(position.xz - vec2(0.0), position.xz)*0.2;' });
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
    for (const m of [t, f]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
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
  const tube = (a, c, b, r0, r1, seg, sides) => {
    const curve = new THREE.QuadraticBezierCurve3(a, c, b);
    const g = new THREE.TubeGeometry(curve, seg, 1, sides, false);
    // taper along the length
    const p = g.attributes.position, uv = g.attributes.uv;
    const pt = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const t = uv.getX(i);
      curve.getPointAt(Math.min(1, Math.max(0, t)), pt);
      const r = r0 + (r1 - r0) * t;
      p.setXYZ(i, pt.x + (p.getX(i) - pt.x) * r, pt.y + (p.getY(i) - pt.y) * r, pt.z + (p.getZ(i) - pt.z) * r);
      uv.setXY(i, uv.getY(i) * 2, t * 3);
    }
    return g;
  };
  bark.push(tube(trunkBase, new THREE.Vector3(lean.x * 0.2, 2.2, lean.z * 0.2), trunkTop, 0.19, 0.11, 5, 7));
  // stilt roots, some of them forking
  const nRoots = 10 + variant;
  for (let i = 0; i < nRoots; i++) {
    const a = (i / nRoots) * 6.283 + rnd() * 0.5;
    const rad = 0.95 + rnd() * 1.0;
    const startY = 0.9 + rnd() * 0.9;
    const start = new THREE.Vector3(Math.cos(a) * 0.08, startY, Math.sin(a) * 0.08);
    const end = new THREE.Vector3(Math.cos(a) * rad, -0.75, Math.sin(a) * rad);
    const ctrl = new THREE.Vector3(Math.cos(a) * rad * 0.95, startY + 0.25, Math.sin(a) * rad * 0.95);
    bark.push(tube(start, ctrl, end, 0.075, 0.04, 6, 5));
    if (i % 3 === 0) {
      const mid = new THREE.QuadraticBezierCurve3(start, ctrl, end).getPoint(0.55);
      const a2 = a + 0.5;
      bark.push(tube(mid, new THREE.Vector3(mid.x * 1.25, mid.y * 0.9, mid.z * 1.25), new THREE.Vector3(Math.cos(a2) * rad * 1.15, -0.75, Math.sin(a2) * rad * 1.15), 0.045, 0.03, 4, 4));
    }
  }
  // branches and leaf clusters
  const nClusters = 4 + (variant % 2);
  for (let i = 0; i < nClusters; i++) {
    const a = (i / nClusters) * 6.283 + rnd();
    const r = i === 0 ? 0.2 : 1.1 + rnd() * 0.9;
    const c = new THREE.Vector3(trunkTop.x + Math.cos(a) * r, trunkTop.y + 0.2 + rnd() * 0.9, trunkTop.z + Math.sin(a) * r);
    const from = trunkBase.clone().lerp(trunkTop, 0.55 + rnd() * 0.4);
    bark.push(tube(from, from.clone().lerp(c, 0.5).add(new THREE.Vector3(0, 0.4, 0)), c, 0.075, 0.035, 4, 5));
    const cr = 1.0 + rnd() * 0.5;
    for (let k = 0; k < 15; k++) {
      const th = rnd() * 6.283, ph = Math.acos(1 - rnd() * 1.5);
      const pos = new THREE.Vector3(c.x + Math.sin(ph) * Math.cos(th) * cr * 0.85, c.y + Math.cos(ph) * cr * 0.6, c.z + Math.sin(ph) * Math.sin(th) * cr * 0.85);
      leaves.push(leafCard(1.4 + rnd() * 0.7, pos, c, rnd).toNonIndexed());
    }
  }
  return { bark: mergeGeometries(bark.map((g) => g.toNonIndexed())), leaves: mergeGeometries(leaves) };
}

export function createMangroves(scene, quality) {
  const T = detailTextures();
  const barkMat = patchMaterial(new THREE.MeshStandardMaterial({ map: T.bark, bumpMap: T.bark, bumpScale: 1.6, color: 0x9a8468, roughness: 0.9 }), {
    key: 'mgBark',
    // dark and algae-green below the high-water mark, barnacle-pale band just above it
    color: `diffuseColor.rgb *= mix(vec3(0.42,0.46,0.34), vec3(1.0), smoothstep(-0.05, 0.45, vWPos.y));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72,0.7,0.62), smoothstep(0.02,0.1,vWPos.y)*(1.0 - smoothstep(0.12,0.3,vWPos.y))*0.45*vnoise(vWPos.xz*30.0 + vWPos.y*20.0));`,
  });
  const leafMat = patchMaterial(new THREE.MeshStandardMaterial({
    map: leafTexture('mangrove'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.45, color: 0xe6f2d8,
  }), { sway: 0.22, key: 'mgLeaf' });
  leafMat.alphaToCoverage = quality !== 'low';
  const group = new THREE.Group();
  const geos = [0, 1, 2].map(mangroveGeometry);
  const CH = 150;
  const buckets = new Map();
  for (const m of LAYOUT.mangroves) {
    const k = m.v + ':' + Math.floor(m.x / CH) + ':' + Math.floor(m.z / 220);
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

// ---- garden plants: bougainvillea and clipped hedge balls -------------------------------
export function createBushes(scene, quality) {
  const make = (kind, count, squash, cardSize) => {
    const rnd = mulberry32(kind === 'flower' ? 31 : 47);
    const parts = [];
    const c = new THREE.Vector3(0, 0.75, 0);
    for (let k = 0; k < count; k++) {
      const th = rnd() * 6.283, ph = Math.acos(1 - rnd() * 1.3);
      const pos = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * 0.8, 0.75 + Math.cos(ph) * 0.62 * squash, Math.sin(ph) * Math.sin(th) * 0.8);
      parts.push(leafCard(cardSize, pos, c, rnd).toNonIndexed());
    }
    const mat = patchMaterial(new THREE.MeshStandardMaterial({
      map: leafTexture(kind), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55,
    }), { sway: kind === 'flower' ? 0.5 : 0.15, key: 'bush' + kind });
    mat.alphaToCoverage = quality !== 'low';
    return { geo: mergeGeometries(parts), mat };
  };
  const types = [make('flower', 16, 1, 1.3), make('hedge', 22, 1.15, 1.05)];
  types.forEach((t, ti) => {
    const list = LAYOUT.bushes.filter((b) => b.t === ti);
    const mesh = new THREE.InstancedMesh(t.geo, t.mat, list.length);
    list.forEach((b, i) => setInst(mesh, i, b.x, b.y - 0.1, b.z, b.rot, b.s * (ti ? 0.9 : 1)));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    scene.add(mesh);
  });
}

// ---- seagrass ---------------------------------------------------------------------------
export function createSeagrass(scene, quality) {
  const rnd = mulberry32(77);
  const blades = [];
  for (let i = 0; i < 7; i++) {
    const h = 0.4 + rnd() * 0.5, w = 0.05;
    const g = new THREE.PlaneGeometry(w, h, 1, 4);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) / h;
      p.setX(k, p.getX(k) * (1 - 0.7 * t));
      p.setZ(k, t * t * 0.2);
    }
    g.rotateY(rnd() * 6.283);
    g.translate((rnd() - 0.5) * 0.55, 0, (rnd() - 0.5) * 0.55);
    g.computeVertexNormals();
    paint(g, new THREE.Color().setHSL(0.24 + rnd() * 0.08, 0.55, 0.2 + rnd() * 0.16));
    blades.push(g);
  }
  const geo = mergeGeometries(blades);
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 }), {
    swayWater: 0.22, key: 'grass', color: 'diffuseColor.rgb *= 0.55 + 0.9*clamp(vObj.y*2.0, 0.0, 1.0);',
  });
  const list = quality === 'low' ? LAYOUT.seagrass.filter((_, i) => i % 2 === 0) : LAYOUT.seagrass;
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((s, i) => setInst(mesh, i, s.x, s.y - 0.03, s.z, s.rot, s.s * 1.2));
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}
