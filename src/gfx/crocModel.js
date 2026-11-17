// Procedural saltwater crocodile: a lofted body with scutes, a hinged upper
// jaw with teeth, four legs, and a tail that sways in the vertex shader.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vnoise } from '../sim/noise.js';
import { patchMaterial, paint, detailTextures } from './shared.js';
import { groundAt, waterLevelAt } from '../sim/terrain.js';

// stations along the spine: z, half width, top y, bottom y
const BODY = [
  [0.98, 0.3, 0.3, 0.02], [0.75, 0.31, 0.33, 0.0], [0.3, 0.4, 0.43, -0.03], [-0.2, 0.47, 0.48, -0.05],
  [-0.7, 0.46, 0.47, -0.04], [-1.15, 0.36, 0.42, 0.0], [-1.6, 0.25, 0.37, 0.04], [-2.1, 0.17, 0.32, 0.07],
  [-2.6, 0.11, 0.27, 0.09], [-3.1, 0.07, 0.22, 0.1], [-3.55, 0.035, 0.16, 0.1], [-3.9, 0.012, 0.12, 0.1],
];
const LOWER = [
  [2.12, 0.07, 0.07, 0.03], [1.95, 0.12, 0.09, 0.01], [1.6, 0.15, 0.1, 0.0], [1.25, 0.24, 0.12, 0.0],
  [1.0, 0.3, 0.14, 0.02], [0.9, 0.3, 0.16, 0.02],
];
const UPPER = [
  [2.14, 0.075, 0.17, 0.07], [2.0, 0.125, 0.21, 0.09], [1.6, 0.155, 0.21, 0.1], [1.3, 0.24, 0.27, 0.12],
  [1.12, 0.29, 0.38, 0.14], [0.95, 0.3, 0.36, 0.15], [0.85, 0.3, 0.31, 0.16],
];

function interp(st, z) {
  if (z >= st[0][0]) return st[0];
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1];
    if (z <= a[0] && z >= b[0]) {
      const t = (a[0] - z) / (a[0] - b[0]), s = t * t * (3 - 2 * t);
      return [z, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s];
    }
  }
  return st[st.length - 1];
}

// Loft a closed skin through the stations. `scutes` adds the armoured ridges.
function loft(st, rings, scutes, mouth) {
  const RAD = 22;
  const pos = [], col = [], idx = [], uvs = [];
  const z0 = st[0][0], z1 = st[st.length - 1][0];
  const back = new THREE.Color(0.13, 0.17, 0.085), belly = new THREE.Color(0.46, 0.43, 0.27), band = new THREE.Color(0.05, 0.065, 0.035);
  const c = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    const z = z0 + (z1 - z0) * (r / rings);
    const [, w, top, bot] = interp(st, z);
    const mid = (top + bot) / 2, hh = (top - bot) / 2;
    for (let k = 0; k <= RAD; k++) {
      const a = (k / RAD) * Math.PI * 2;
      // squarish cross-section: flat belly, flat armoured back
      const cs = Math.cos(a), sn = Math.sin(a);
      const ex = Math.sign(cs) * Math.pow(Math.abs(cs), 0.6), ey = Math.sign(sn) * Math.pow(Math.abs(sn), 0.75);
      let x = ex * w, y = mid + ey * hh;
      if (scutes && sn > 0.35) {
        const ridge = Math.max(0, Math.sin(z * 15)) * 0.035 * Math.min(1, w * 5);
        const rows = Math.abs(Math.cos(a * 3)) * 0.02;
        y += (ridge + rows) * sn;
        if (z < -1.5 && Math.abs(cs) < 0.3) y += 0.07 * Math.max(0, Math.sin(z * 11)) * Math.min(1, (-1.5 - z) * 1.5);
      }
      if (mouth === 'upper' && sn > 0.5 && z < 1.25 && z > 1.0 && Math.abs(Math.abs(ex) - 0.6) < 0.35) y += 0.05; // eye ridges
      pos.push(x, y, z);
      uvs.push((k / RAD) * 5, z * 1.7);
      const t = Math.max(0, Math.min(1, (ey + 0.8) / 0.45));
      c.copy(belly).lerp(back, t);
      const n = vnoise(z * 3.1 + 5, a * 2.0);
      if (t > 0.4) c.lerp(band, Math.max(0, n - 0.45) * 1.6);
      c.multiplyScalar(1.3 + 0.45 * vnoise(z * 9, a * 5));
      if (mouth && ((mouth === 'upper' && ey < -0.5) || (mouth === 'lower' && ey > 0.5))) c.setRGB(0.95, 0.5, 0.45);
      col.push(c.r, c.g, c.b);
    }
  }
  const ST = RAD + 1; // the seam column is duplicated so the texture wraps cleanly
  for (let r = 0; r < rings; r++) for (let k = 0; k < RAD; k++) {
    const a = r * ST + k, b = a + 1, d = a + ST, e = b + ST;
    idx.push(a, d, b, b, d, e);
  }
  // caps
  const capA = pos.length / 3; pos.push(0, (st[0][2] + st[0][3]) / 2, z0); col.push(0.3, 0.3, 0.2); uvs.push(0, 0);
  const capB = pos.length / 3; pos.push(0, (st[st.length - 1][2] + st[st.length - 1][3]) / 2, z1); col.push(0.2, 0.22, 0.13); uvs.push(0, 0);
  for (let k = 0; k < RAD; k++) {
    idx.push(capA, k, k + 1);
    idx.push(capB, rings * ST + k + 1, rings * ST + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed(); // smooth normals are kept
}

function teeth(st, up) {
  const parts = [];
  for (let i = 0; i < 11; i++) {
    const z = 1.02 + i * 0.1;
    const [, w, top, bot] = interp(st, z);
    for (const sx of [-1, 1]) {
      const t = new THREE.ConeGeometry(0.02, 0.085, 4);
      if (up) t.rotateX(Math.PI);
      t.translate(sx * w * 0.86, up ? bot - 0.03 : top + 0.03, z);
      const n = t.toNonIndexed();
      const tu = n.attributes.uv; for (let q = 0; q < tu.count; q++) tu.setXY(q, 0.02, 0.02);
      parts.push(paint(n, new THREE.Color(1.25, 1.2, 1.1)));
    }
  }
  return mergeGeometries(parts);
}

let shared = null;
function geometries() {
  if (shared) return shared;
  const toNI = (g) => g;
  const body = mergeGeometries([toNI(loft(BODY, 78, true, null)), toNI(loft(LOWER, 16, false, 'lower')), teeth(LOWER, false)]);
  const upperRaw = mergeGeometries([toNI(loft(UPPER, 20, true, 'upper')), teeth(UPPER, true)]);
  // hinge at the back of the head
  upperRaw.translate(0, -0.14, -0.9);
  const leg = (() => {
    const col = new THREE.Color(0.12, 0.15, 0.08);
    const up = new THREE.CapsuleGeometry(0.085, 0.3, 4, 10); up.rotateZ(Math.PI / 2 - 0.5); up.translate(0.2, -0.04, 0);
    const low = new THREE.CapsuleGeometry(0.065, 0.2, 4, 10); low.rotateZ(0.25); low.translate(0.4, -0.13, 0.02);
    const foot = new THREE.SphereGeometry(0.13, 10, 8); foot.scale(1.25, 0.32, 1.0); foot.translate(0.47, -0.25, 0.06);
    const parts = [up, low, foot];
    for (let i = -1; i <= 1; i++) {
      const toe = new THREE.ConeGeometry(0.03, 0.16, 6); toe.rotateZ(-Math.PI / 2); toe.rotateY(-i * 0.45); toe.translate(0.62, -0.26, 0.06 + i * 0.07);
      parts.push(toe);
    }
    return paint(mergeGeometries(parts.map((g) => g.toNonIndexed())), col);
  })();
  const eye = new THREE.SphereGeometry(0.04, 14, 10);
  shared = { body, upper: upperRaw, leg, eye };
  return shared;
}

export function createCrocModel(scene, croc) {
  const G = geometries();
  const sway = { value: 0 }, swayAmp = { value: 0.25 };
  const T = detailTextures();
  const mk = () => patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, map: T.scales, bumpMap: T.scales, bumpScale: 3.0, roughness: 0.55, metalness: 0.0 }), {
    key: 'croc',
    uniforms: { uSway: sway, uSwayAmp: swayAmp },
    vertexPars: 'uniform float uSway; uniform float uSwayAmp;',
    vertex: `{
  float tz = min(transformed.z - 0.3, 0.0);
  transformed.x += sin(uSway + tz*1.25) * uSwayAmp * tz*tz*0.16 + sin(uSway + 1.2) * uSwayAmp * 0.12 * max(transformed.z, 0.0);
}`,
  });
  const bodyMat = mk();
  const group = new THREE.Group();
  const body = new THREE.Mesh(G.body, bodyMat);
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.14, 0.9);
  const upper = new THREE.Mesh(G.upper, bodyMat);
  jaw.add(upper);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x302000, emissive: 0xffc21a, emissiveIntensity: 2.6, roughness: 0.2 });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(G.eye, eyeMat);
    e.position.set(sx * 0.2, 0.235, 0.22);
    e.scale.set(1, 1, 1.4);
    jaw.add(e);
  }
  group.add(body, jaw);
  const legMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: T.scales, bumpMap: T.scales, bumpScale: 2.0, roughness: 0.6 });
  const legs = [];
  for (const [sx, z] of [[1, 0.3], [-1, 0.3], [1, -1.0], [-1, -1.0]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.3, 0.12, z);
    const l = new THREE.Mesh(G.leg, legMat);
    l.scale.x = sx;
    pivot.add(l); group.add(pivot);
    legs.push({ pivot, sx, front: z > 0 });
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  group.scale.setScalar(croc.size);
  scene.add(group);

  let phase = croc.index * 1.7, y = 0, pitch = 0, yawPrev = croc.yaw;
  return {
    group,
    // x, z, yaw are the interpolated render pose
    update(x, z, yaw, dt, time) {
      const ground = groundAt(x, z), surf = waterLevelAt(x, z, time);
      const depth = surf - ground;
      const lurk = croc.state === 'idle' || croc.state === 'home' || croc.state === 'rest';
      // walk on the bottom in the shallows, float with eyes out in deep water
      const targetY = Math.max(ground + 0.04 * croc.size, surf - (lurk ? 0.36 : 0.27) * croc.size);
      y += (targetY - y) * (1 - Math.exp(-9 * dt));
      const ahead = groundAt(x + Math.sin(yaw) * 1.4, z + Math.cos(yaw) * 1.4);
      const tp = depth < 0.3 ? Math.atan2(ahead - ground, 1.4) * 0.8 : 0;
      pitch += (tp - pitch) * (1 - Math.exp(-6 * dt));
      group.position.set(x, y, z);
      let dyaw = yaw - yawPrev;
      if (dyaw > Math.PI) dyaw -= Math.PI * 2; else if (dyaw < -Math.PI) dyaw += Math.PI * 2;
      yawPrev = yaw;
      group.rotation.set(-pitch + (croc.state === 'lunge' ? -0.12 : 0), yaw, 0, 'YXZ');
      const sp = croc.speed;
      phase += dt * (2.2 + sp * 1.25);
      sway.value = phase;
      swayAmp.value = 0.1 + Math.min(1, sp / 7) * 0.32;
      jaw.rotation.x = -croc.jaw * 0.62;
      const walk = depth < 0.9 ? 1 : 0.35;
      for (const l of legs) {
        const ph = phase * 1.5 + (l.front ? 0 : Math.PI) + (l.sx > 0 ? 0 : Math.PI);
        l.pivot.rotation.y = Math.sin(ph) * 0.5 * walk * Math.min(1, sp / 2 + 0.15);
        l.pivot.rotation.z = l.sx * (Math.max(0, Math.cos(ph)) * 0.18 * walk);
      }
    },
  };
}
