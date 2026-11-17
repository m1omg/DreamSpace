// Models for the venomous wildlife: blue-spotted stingrays on the bottom and
// lionfish hovering by the coral.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundAt } from '../sim/terrain.js';
import { mulberry32 } from '../sim/noise.js';
import { patchMaterial, canvasTexture } from './shared.js';

function rayTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const rnd = mulberry32(61);
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gr.addColorStop(0, '#b3a060'); gr.addColorStop(0.75, '#9a8648'); gr.addColorStop(1, '#6f5c30');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${70 + rnd() * 50},${60 + rnd() * 40},${30 + rnd() * 20},0.35)`;
      g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 2, 0, 6.283); g.fill();
    }
    // the electric-blue spots that give the ray away
    for (let i = 0; i < 46; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * w * 0.44;
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r, s = 4 + rnd() * 6;
      g.fillStyle = '#0d2f9a'; g.beginPath(); g.arc(x, y, s + 1.5, 0, 6.283); g.fill();
      g.fillStyle = '#2f8cff'; g.beginPath(); g.arc(x, y, s, 0, 6.283); g.fill();
      g.fillStyle = '#8fd0ff'; g.beginPath(); g.arc(x - s * 0.25, y - s * 0.25, s * 0.4, 0, 6.283); g.fill();
    }
    // eyes
    for (const sx of [-1, 1]) { g.fillStyle = '#1a1408'; g.beginPath(); g.arc(w / 2 + sx * 22, h * 0.26, 6, 0, 6.283); g.fill(); }
  });
}

function rayGeometry() {
  const disc = new THREE.CircleGeometry(0.5, 40, 0, Math.PI * 2);
  // subdivide radially by hand: rebuild as rings so the body can be domed
  const rings = 6, seg = 40, pos = [], uv = [], idx = [];
  pos.push(0, 0.075, 0); uv.push(0.5, 0.5);
  for (let r = 1; r <= rings; r++) for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2, t = r / rings;
    // rounded kite: wide wings, blunt snout towards +z, pinched towards the tail
    const rad = 0.46 * (1 + 0.16 * Math.cos(2 * a) - 0.07 * Math.cos(4 * a)) * (1 - 0.1 * Math.max(0, -Math.sin(a)));
    const x = Math.cos(a) * rad * t, z = Math.sin(a) * rad * t * 0.92;
    const y = 0.075 * (1 - t * t) * (1 - 0.5 * Math.abs(Math.cos(a)));
    pos.push(x, y, z); uv.push(0.5 + Math.cos(a) * 0.5 * t, 0.5 - Math.sin(a) * 0.5 * t);
  }
  for (let k = 0; k < seg; k++) idx.push(0, 1 + ((k + 1) % seg), 1 + k);
  for (let r = 1; r < rings; r++) for (let k = 0; k < seg; k++) {
    const a = 1 + (r - 1) * seg + k, b = 1 + (r - 1) * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex(idx);
  body.computeVertexNormals();
  const tail = new THREE.CylinderGeometry(0.006, 0.035, 0.8, 7);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0.02, -0.78);
  const tu = tail.attributes.uv;
  for (let i = 0; i < tu.count; i++) tu.setXY(i, 0.5, 0.98);
  disc.dispose();
  return mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()]);
}

function lionTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const rnd = mulberry32(77);
    // left half: a fan of banded spines with a pale membrane
    const ox = 128, oy = 250;
    for (let i = 0; i < 15; i++) {
      const a = -Math.PI * 0.94 + (i / 14) * Math.PI * 0.88;
      const len = 215 + rnd() * 25;
      g.fillStyle = 'rgba(236,214,190,0.95)';
      g.beginPath(); g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a - 0.028) * len * 0.72, oy + Math.sin(a - 0.028) * len * 0.72);
      g.lineTo(ox + Math.cos(a + 0.028) * len * 0.72, oy + Math.sin(a + 0.028) * len * 0.72);
      g.closePath(); g.fill();
      for (let k = 0; k < 11; k++) {
        const t0 = k / 11, t1 = (k + 1) / 11;
        g.strokeStyle = k % 2 ? '#f4ead8' : '#7a2418';
        g.lineWidth = 5.5 * (1 - t0 * 0.6);
        g.beginPath(); g.moveTo(ox + Math.cos(a) * len * t0, oy + Math.sin(a) * len * t0);
        g.lineTo(ox + Math.cos(a) * len * t1, oy + Math.sin(a) * len * t1); g.stroke();
      }
    }
    // right half: body bars
    for (let x = 256; x < 512; x += 4) {
      const band = Math.sin((x - 256) * 0.2) + 0.6 * Math.sin((x - 256) * 0.47);
      g.fillStyle = band > 0.2 ? '#6e1e14' : band > -0.3 ? '#c9836a' : '#f1e3cf';
      g.fillRect(x, 0, 4, h);
    }
  });
}

function lionGeometry() {
  const parts = [];
  const body = new THREE.SphereGeometry(0.5, 16, 12);
  body.scale(0.2, 0.3, 0.72);
  const bp = body.attributes.position, bu = body.attributes.uv;
  for (let i = 0; i < bp.count; i++) {
    const z = bp.getZ(i);
    if (z < 0) bp.setY(i, bp.getY(i) * (1 + z * 1.5));     // taper to the tail
    bu.setXY(i, 0.52 + 0.46 * (z / 0.72 * 0.5 + 0.5), bu.getY(i));
  }
  body.computeVertexNormals();
  parts.push(body.toNonIndexed());
  const fan = (w, h, tx, ty, tz, rx, ry, rz) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    const u = g.attributes.uv;
    for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * 0.5);
    g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry);
    g.translate(tx, ty, tz);
    parts.push(g.toNonIndexed());
  };
  for (const s of [-1, 1]) {
    fan(0.62, 0.5, s * 0.07, -0.02, 0.1, 0.5, s * 1.25, s * -0.9);   // pectoral fans
    fan(0.3, 0.22, s * 0.04, -0.1, 0.0, 2.6, s * 0.5, 0);            // pelvic
  }
  fan(0.5, 0.36, 0, 0.1, -0.02, 0, Math.PI / 2, 0);                  // dorsal spines
  fan(0.36, 0.3, 0, 0.0, -0.3, -Math.PI / 2, Math.PI / 2, 0);        // tail
  return mergeGeometries(parts);
}

export function createHazardModels(scene, hazards) {
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), E = new THREE.Euler();

  const rayMat = patchMaterial(new THREE.MeshStandardMaterial({ map: rayTexture(), roughness: 0.5, side: THREE.DoubleSide }), { key: 'ray' });
  const rays = new THREE.InstancedMesh(rayGeometry(), rayMat, hazards.rays.length);
  rays.frustumCulled = false; rays.receiveShadow = true;
  rays.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const rayY = hazards.rays.map((r) => groundAt(r.x, r.z));
  const placeRay = (r, i, t) => {
    if (r.state !== 'rest') rayY[i] = groundAt(r.x, r.z);
    const flap = r.state === 'flee' ? Math.sin(t * 14 + i) * 0.12 : 0;
    E.set(flap * 0.4, r.yaw, 0, 'YXZ'); Q.setFromEuler(E);
    S.set(1.25, 1 + (r.state === 'flee' ? 0.6 : 0), 1.25);
    M4.compose(V.set(r.x, rayY[i] + 0.025 + r.lift, r.z), Q, S);
    rays.setMatrixAt(i, M4);
  };
  hazards.rays.forEach((r, i) => placeRay(r, i, 0));
  scene.add(rays);

  const lionMat = patchMaterial(new THREE.MeshStandardMaterial({ map: lionTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5 }), {
    key: 'lion', vertex: 'transformed.x += sin(uTime*2.2 + position.y*7.0 + position.z*5.0) * 0.02 * smoothstep(0.08, 0.4, length(position.xy));',
  });
  const lions = new THREE.InstancedMesh(lionGeometry(), lionMat, hazards.lions.length);
  lions.frustumCulled = false; lions.castShadow = true;
  lions.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(lions);

  return {
    update(t) {
      let dirty = false;
      hazards.rays.forEach((r, i) => { if (r.state !== 'rest' || r.dirty !== false) { placeRay(r, i, t); r.dirty = r.state !== 'rest'; dirty = true; } });
      if (dirty) rays.instanceMatrix.needsUpdate = true;
      S.set(1.15, 1.15, 1.15);
      hazards.lions.forEach((l, i) => {
        E.set(Math.sin(t * 0.7 + i) * 0.08, l.yaw, 0, 'YXZ'); Q.setFromEuler(E);
        M4.compose(V.set(l.x, l.y + Math.sin(t * 1.1 + i * 2.0) * 0.04, l.z), Q, S);
        lions.setMatrixAt(i, M4);
      });
      lions.instanceMatrix.needsUpdate = true;
    },
  };
}
