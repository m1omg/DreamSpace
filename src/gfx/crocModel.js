// Procedural saltwater crocodiles: a lofted body with scutes, a hinged upper
// jaw with teeth, four legs, and a tail that sways.
//
// All crocodiles are one instanced mesh with one draw call (plus one for the
// shadow). Every vertex knows which part it belongs to (body, upper jaw, one
// of the legs) and the vertex shader bends the jaw, swings the legs and sways
// the tail from a few numbers per crocodile, so nothing is drawn as a separate
// object. Crocodiles out of view are not drawn at all.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vnoise } from '../sim/noise.js';
import { patchMaterial, paint, detailTextures } from './shared.js';
import { waterLevelAt } from '../sim/terrain.js';
import { heightAt } from './terrainMesh.js';
import { VIEW, sphereVisible, inShadowBox } from './instancing.js';

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
function loft(st, rings, scutes, mouth, RAD = 22) {
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
  return g;
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
      const tu = t.attributes.uv; for (let q = 0; q < tu.count; q++) tu.setXY(q, 0.02, 0.02);
      parts.push(paint(t, new THREE.Color(1.25, 1.2, 1.1)));
    }
  }
  return mergeGeometries(parts);
}

// aRig = (part: 0 body, 1 upper jaw, 2 leg; leg side; leg phase offset; eye), aPivot = joint
function rig(g, part, pivot, side = 0, phase = 0, eye = 0) {
  const n = g.attributes.position.count;
  const r = new Float32Array(n * 4), p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    r[i * 4] = part; r[i * 4 + 1] = side; r[i * 4 + 2] = phase; r[i * 4 + 3] = eye;
    p[i * 3] = pivot[0]; p[i * 3 + 1] = pivot[1]; p[i * 3 + 2] = pivot[2];
  }
  g.setAttribute('aRig', new THREE.BufferAttribute(r, 4));
  g.setAttribute('aPivot', new THREE.BufferAttribute(p, 3));
  return g;
}
function mirrorX(g) {
  const m = g.clone();
  m.scale(-1, 1, 1);
  const idx = m.index.array; // keep the triangles facing outwards
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return m;
}

const HINGE = [0, 0.14, 0.9];
// `lo`: the distant crocodile, about a tenth of the triangles (no teeth, toes or scutes)
function crocGeometry(lo = false) {
  const parts = [];
  parts.push(rig(loft(BODY, lo ? 24 : 78, !lo, null, lo ? 10 : 22), 0, [0, 0, 0]));
  parts.push(rig(loft(LOWER, lo ? 6 : 16, false, 'lower', lo ? 10 : 22), 0, [0, 0, 0]));
  if (!lo) parts.push(rig(teeth(LOWER, false), 0, [0, 0, 0]));
  parts.push(rig(loft(UPPER, lo ? 7 : 20, !lo, 'upper', lo ? 10 : 22), 1, HINGE));
  if (!lo) parts.push(rig(teeth(UPPER, true), 1, HINGE));
  for (const sx of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.04, lo ? 6 : 14, lo ? 4 : 10);
    eye.scale(1, 1, 1.4);
    eye.translate(sx * 0.2, HINGE[1] + 0.235, HINGE[2] + 0.22);
    parts.push(rig(paint(eye, new THREE.Color(0x302000)), 1, HINGE, 0, 0, 1));
  }
  const leg = (() => {
    const up = new THREE.CapsuleGeometry(0.085, 0.3, lo ? 1 : 4, lo ? 5 : 10); up.rotateZ(Math.PI / 2 - 0.5); up.translate(0.2, -0.04, 0);
    const low = new THREE.CapsuleGeometry(0.065, 0.2, lo ? 1 : 4, lo ? 5 : 10); low.rotateZ(0.25); low.translate(0.4, -0.13, 0.02);
    const foot = new THREE.SphereGeometry(0.13, lo ? 6 : 10, lo ? 4 : 8); foot.scale(1.25, 0.32, 1.0); foot.translate(0.47, -0.25, 0.06);
    const p = [up, low, foot];
    for (let i = -1; i <= 1 && !lo; i++) {
      const toe = new THREE.ConeGeometry(0.03, 0.16, 6); toe.rotateZ(-Math.PI / 2); toe.rotateY(-i * 0.45); toe.translate(0.62, -0.26, 0.06 + i * 0.07);
      p.push(toe);
    }
    return paint(mergeGeometries(p), new THREE.Color(0.12, 0.15, 0.08));
  })();
  // legs: front/back, right/left; diagonal pairs step together
  for (const [sx, z, ph] of [[1, 0.3, 0], [-1, 0.3, Math.PI], [1, -1.0, Math.PI], [-1, -1.0, 0]]) {
    const g = sx > 0 ? leg.clone() : mirrorX(leg);
    g.translate(sx * 0.3, 0.12, z);
    parts.push(rig(g, 2, [sx * 0.3, 0.12, z], sx, ph));
  }
  return mergeGeometries(parts);
}

const RIG = /* glsl */ `
attribute vec4 aRig;
attribute vec3 aPivot;
attribute vec4 aAnim;  // per crocodile: sway phase, sway amount, jaw angle, leg phase
attribute vec2 aLeg;   // per crocodile: leg swing, leg lift
mat3 rigRotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rigRotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rigRotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 crocRot(){
  if (aRig.x > 1.5) { float ph = aAnim.w + aRig.z; return rigRotY(sin(ph)*aLeg.x) * rigRotZ(aRig.y*max(0.0, cos(ph))*aLeg.y); }
  if (aRig.x > 0.5) return rigRotX(aAnim.z);
  return mat3(1.0);
}
vec3 crocPos(vec3 p){
  p = aPivot + crocRot() * (p - aPivot);
  float tz = min(p.z - 0.3, 0.0);
  p.x += sin(aAnim.x + tz*1.25)*aAnim.y*tz*tz*0.16 + sin(aAnim.x + 1.2)*aAnim.y*0.12*max(p.z, 0.0);
  return p;
}
`;

export function createCrocs(scene, crocs) {
  const n = crocs.length;
  const T = detailTextures();
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, map: T.scales, bumpMap: T.scales, bumpScale: 2.6, roughness: 0.55, metalness: 0.0 }), {
    key: 'crocs',
    vertexPars: RIG + 'varying float vEye;',
    normalVertex: 'objectNormal = crocRot() * objectNormal;',
    vertex: 'transformed = crocPos(transformed); vEye = aRig.w;',
    fragmentPars: 'varying float vEye;',
    patch(shader) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.2, vEye);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.54, 0.01) * 2.6 * vEye;');
    },
  });
  // the shadow has to bend the same way
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + RIG)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = crocPos(transformed);');
  };
  depth.customProgramCacheKey = () => 'crocDepth';

  // two levels of detail; each draws visible crocodiles first, then the
  // off-screen ones whose shadow may still fall into view
  const level = (lo) => {
    const G = crocGeometry(lo);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const leg = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    anim.setUsage(THREE.DynamicDrawUsage); leg.setUsage(THREE.DynamicDrawUsage);
    G.setAttribute('aAnim', anim);
    G.setAttribute('aLeg', leg);
    const mesh = new THREE.InstancedMesh(G, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.customDepthMaterial = depth;
    mesh.frustumCulled = false;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const L = { mesh, anim, leg, nMain: 1, nAll: 1, later: new Int32Array(n), nl: 0 };
    // first frame: one invisible (zero-size) crocodile, so the shaders get compiled
    new THREE.Matrix4().makeScale(0, 0, 0).toArray(mesh.instanceMatrix.array, 0);
    mesh.count = 1;
    mesh.onBeforeShadow = () => { mesh.count = L.nAll; };
    mesh.onAfterShadow = () => { mesh.count = L.nMain; };
    scene.add(mesh);
    return L;
  };
  const levels = [level(false), level(true)];

  const st = crocs.map((c) => ({ y: 0, pitch: 0, phase: c.index * 1.7, on: false }));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  let poses = null, dtNow = 0, timeNow = 0;

  // pose crocodile i (interpolated position from the simulation) into slot k of a level
  const write = (L, k, i) => {
    const { mesh, anim, leg } = L;
    const croc = crocs[i], s = st[i], { x, z, yaw } = poses[i], dt = dtNow;
    const ground = heightAt(x, z), surf = waterLevelAt(x, z, timeNow);
    const depthW = surf - ground;
    const lurk = croc.state === 'idle' || croc.state === 'home' || croc.state === 'rest';
    // walk on the bottom in the shallows, float with eyes out in deep water
    const targetY = Math.max(ground + 0.04 * croc.size, surf - (lurk ? 0.36 : 0.27) * croc.size);
    const ahead = heightAt(x + Math.sin(yaw) * 1.4, z + Math.cos(yaw) * 1.4);
    const tp = depthW < 0.3 ? Math.atan2(ahead - ground, 1.4) * 0.8 : 0;
    if (s.on) {
      s.y += (targetY - s.y) * (1 - Math.exp(-9 * dt));
      s.pitch += (tp - s.pitch) * (1 - Math.exp(-6 * dt));
    } else { s.y = targetY; s.pitch = tp; }
    s.on = true;
    E.set(-s.pitch + (croc.state === 'lunge' ? -0.12 : 0), yaw, 0, 'YXZ');
    M.compose(P.set(x, s.y, z), Q.setFromEuler(E), S.setScalar(croc.size));
    M.toArray(mesh.instanceMatrix.array, k * 16);
    const sp = croc.speed;
    s.phase += dt * (2.2 + sp * 1.25);
    const walk = depthW < 0.9 ? 1 : 0.35;
    anim.array[k * 4] = s.phase;
    anim.array[k * 4 + 1] = 0.1 + Math.min(1, sp / 7) * 0.32;
    anim.array[k * 4 + 2] = -croc.jaw * 0.62;
    anim.array[k * 4 + 3] = s.phase * 1.5;
    leg.array[k * 2] = 0.5 * walk * Math.min(1, sp / 2 + 0.15);
    leg.array[k * 2 + 1] = 0.18 * walk;
  };

  return {
    // `list` holds the interpolated { x, z, yaw } of every crocodile
    update(list, dt, time) {
      poses = list; dtNow = dt; timeNow = time;
      for (const L of levels) { L.nMain = 0; L.nl = 0; }
      for (let i = 0; i < n; i++) {
        const c = crocs[i], p = list[i], r = 4.2 * c.size;
        const dx = p.x - VIEW.x, dz = p.z - VIEW.z, d2 = dx * dx + dz * dz;
        if (d2 > 320 * 320) { st[i].on = false; continue; }
        const L = levels[d2 < 70 * 70 ? 0 : 1];
        if (sphereVisible(p.x, 0, p.z, r)) write(L, L.nMain++, i);
        else if (inShadowBox(p.x, 0, p.z, r)) L.later[L.nl++] = i;
        else st[i].on = false;
      }
      for (const L of levels) {
        L.nAll = L.nMain;
        for (let k = 0; k < L.nl; k++) write(L, L.nAll++, L.later[k]);
        if (L.nAll > 0) {
          for (const [a, size] of [[L.mesh.instanceMatrix, 16], [L.anim, 4], [L.leg, 2]]) {
            a.clearUpdateRanges(); a.addUpdateRange(0, L.nAll * size); a.needsUpdate = true;
          }
        }
        L.mesh.count = L.nMain;
        L.mesh.visible = L.nAll > 0;
      }
    },
  };
}
