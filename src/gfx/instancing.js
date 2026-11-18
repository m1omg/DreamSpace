// Large instanced sets (trees, buildings, coral, seagrass...) culled per
// instance on the CPU, with distance levels of detail.
//
// three.js can only cull an InstancedMesh as a whole, and the bounding sphere
// of a set spread over the whole map is always in view, so every instance used
// to be drawn in every pass. Here, once per frame:
//   - each instance picks a level of detail by its distance from the camera;
//   - the instances of a level are packed into its instance buffer in two
//     groups, and each pass draws a prefix of the buffer (the shadow pass
//     switches the count in onBeforeShadow). Near levels put the visible
//     instances first: the camera pass draws only those, the shadow pass all
//     of them (off-screen trees still cast shadows into view). Far levels put
//     the sun's shadow box first: the shadow pass skips distant trees that
//     cannot shadow anything near the player.
// A level can consist of several meshes (bark + leaves) that share one
// instance buffer, so they are uploaded once.

import * as THREE from 'three';

export const VIEW = {
  x: 0, y: 0, z: 0,
  planes: new Float32Array(24),
  // sun shadow box: centre, two light-space axes and the half size
  sh: { on: false, x: 0, y: 0, z: 0, ux: 1, uy: 0, uz: 0, vx: 0, vy: 1, vz: 0, R: 0 },
  serial: 0,
};

const _pv = new THREE.Matrix4(), _fr = new THREE.Frustum(), _last = new Float32Array(20);

/** Update the shared view once per frame, after the camera has moved. */
export function setView(camera, shadow) {
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  // skip the work when nothing moved
  const e = _pv.elements, s = VIEW.sh;
  let same = true;
  for (let i = 0; i < 16; i++) if (_last[i] !== e[i]) { same = false; _last[i] = e[i]; }
  if (shadow) {
    if (_last[16] !== shadow.x || _last[17] !== shadow.z || _last[18] !== shadow.y) { same = false; _last[16] = shadow.x; _last[17] = shadow.z; _last[18] = shadow.y; }
  }
  if (same) return;
  _fr.setFromProjectionMatrix(_pv);
  for (let i = 0; i < 6; i++) {
    const p = _fr.planes[i];
    VIEW.planes[i * 4] = p.normal.x; VIEW.planes[i * 4 + 1] = p.normal.y; VIEW.planes[i * 4 + 2] = p.normal.z; VIEW.planes[i * 4 + 3] = p.constant;
  }
  VIEW.x = camera.position.x; VIEW.y = camera.position.y; VIEW.z = camera.position.z;
  if (shadow) Object.assign(s, shadow, { on: true }); else s.on = false;
  VIEW.serial++;
}

export function sphereVisible(x, y, z, r) {
  const P = VIEW.planes;
  for (let i = 0; i < 24; i += 4) if (P[i] * x + P[i + 1] * y + P[i + 2] * z + P[i + 3] < -r) return false;
  return true;
}

export function inShadowBox(x, y, z, r) {
  const s = VIEW.sh;
  if (!s.on) return false;
  const dx = x - s.x, dy = y - s.y, dz = z - s.z;
  const u = dx * s.ux + dy * s.uy + dz * s.uz, v = dx * s.vx + dy * s.vy + dz * s.vz;
  return u < s.R + r && u > -s.R - r && v < s.R + r && v > -s.R - r;
}

export const POOLS = [];
export function updatePools() { for (const p of POOLS) p.update(); }

const _box = new THREE.Box3(), _b2 = new THREE.Box3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();

/**
 * items:  [{ matrix: Matrix4, color?: Color }]
 * levels: [{ maxDist, parts: [{ geometry, material, color?: bool, castShadow?: bool }] }]
 *         ordered from the most to the least detailed
 * margin: extra bounding radius (e.g. for wind sway)
 */
export function createPool(scene, { items, levels, castShadow = false, receiveShadow = true, margin = 0.3, name = 'pool', renderOrder = 0 }) {
  const n = items.length;
  const S = new Float32Array(n * 4), M = new Float32Array(n * 16);
  const C = new Float32Array(n * 3);
  // bounds of the most detailed level, used for every level
  _box.makeEmpty();
  for (const part of levels[0].parts) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    _box.union(part.geometry.boundingBox);
  }
  const lc = _box.getCenter(new THREE.Vector3()), lr = _box.getSize(_c).length() / 2;
  const setItem = (i, matrix, color) => {
    M.set(matrix.elements, i * 16);
    _c.copy(lc).applyMatrix4(matrix);
    S[i * 4] = _c.x; S[i * 4 + 1] = _c.y; S[i * 4 + 2] = _c.z; S[i * 4 + 3] = lr * matrix.getMaxScaleOnAxis() + margin;
    if (color) { C[i * 3] = color.r; C[i * 3 + 1] = color.g; C[i * 3 + 2] = color.b; }
  };
  items.forEach((it, i) => setItem(i, it.matrix, it.color));

  const L = levels.map((lv, li) => {
    // near levels: [visible][shadow only]; far levels: [in shadow box][visible only]
    const visFirst = li === 0;
    const out = { far2: lv.maxDist * lv.maxDist, meshes: [], im: null, ic: null, nMain: 0, nShadow: 0, visFirst, tmp: new Int32Array(n), nTmp: 0, nFirst: 0 };
    for (const part of lv.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, n));
      if (!out.im) { out.im = mesh.instanceMatrix; out.im.setUsage(THREE.DynamicDrawUsage); } else mesh.instanceMatrix = out.im;
      if (part.color) {
        if (!out.ic) { out.ic = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3); out.ic.setUsage(THREE.DynamicDrawUsage); }
        mesh.instanceColor = out.ic;
      }
      mesh.name = `${name}:${li}`;
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow && part.castShadow !== false;
      mesh.receiveShadow = receiveShadow;
      mesh.renderOrder = renderOrder;
      mesh.onBeforeShadow = () => { mesh.count = out.nShadow; };
      mesh.onAfterShadow = () => { mesh.count = out.nMain; };
      scene.add(mesh);
      out.meshes.push(mesh);
    }
    return out;
  });

  let serial = -1, dirty = true;
  const copy = (lv, slot, i) => {
    const a = lv.im.array, o = slot * 16, s = i * 16;
    for (let k = 0; k < 16; k++) a[o + k] = M[s + k];
    if (lv.ic) { const b = lv.ic.array; b[slot * 3] = C[i * 3]; b[slot * 3 + 1] = C[i * 3 + 1]; b[slot * 3 + 2] = C[i * 3 + 2]; }
  };

  const pool = {
    name, levels: L, count: n,
    // move one instance (e.g. a fleeing stingray)
    set(i, matrix, color) { setItem(i, matrix, color); dirty = true; },
    update(force) {
      if (!force && !dirty && serial === VIEW.serial) return;
      serial = VIEW.serial; dirty = false;
      for (const lv of L) { lv.nFirst = 0; lv.nTmp = 0; }
      const nl = L.length, cx = VIEW.x, cy = VIEW.y, cz = VIEW.z;
      for (let i = 0; i < n; i++) {
        const x = S[i * 4], y = S[i * 4 + 1], z = S[i * 4 + 2], r = S[i * 4 + 3];
        const dx = x - cx, dy = y - cy, dz = z - cz;
        const d = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - r);
        const d2 = d * d;
        let l = 0;
        while (l < nl && d2 > L[l].far2) l++;
        if (l === nl) continue;
        const lv = L[l];
        const vis = sphereVisible(x, y, z, r), sh = castShadow && inShadowBox(x, y, z, r);
        if (!vis && !sh) continue;
        // first group: visible (near levels) or in the shadow box (far levels)
        if (lv.visFirst ? vis : sh) copy(lv, lv.nFirst++, i);
        else lv.tmp[lv.nTmp++] = i;
      }
      for (const lv of L) {
        let k = lv.nFirst;
        for (let j = 0; j < lv.nTmp; j++) copy(lv, k++, lv.tmp[j]);
        const all = k;
        if (lv.visFirst) { lv.nMain = lv.nFirst; lv.nShadow = castShadow ? all : 0; }
        else { lv.nShadow = lv.nFirst; lv.nMain = all; }
        if (all > 0) {
          lv.im.clearUpdateRanges(); lv.im.addUpdateRange(0, all * 16); lv.im.needsUpdate = true;
          if (lv.ic) { lv.ic.clearUpdateRanges(); lv.ic.addUpdateRange(0, all * 3); lv.ic.needsUpdate = true; }
        }
        for (const m of lv.meshes) { m.count = lv.nMain; m.visible = all > 0; }
      }
    },
  };
  // the first frame draws one instance of every level, so that all shaders
  // (including the shadow ones) are compiled before the game starts
  for (const lv of L) {
    if (n) { copy(lv, 0, 0); lv.nMain = lv.nShadow = 1; }
    for (const m of lv.meshes) m.count = lv.nMain;
  }
  serial = -2;
  POOLS.push(pool);
  return pool;
}

/** Plain matrix helper for building item lists. */
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function trs(x, y, z, rotY = 0, s = 1, tiltX = 0, tiltZ = 0, sy = s) {
  _e.set(tiltX, rotY, tiltZ, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(s, sy, s));
}
export { _m as scratchMatrix };
