// Coral gardens, fish schools and sea turtles.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT, CORAL_SIZE } from '../sim/layout.js';
import { terrainHeight, shoreZ, bommieSurface, bommieRadius } from '../sim/terrain.js';
import { mulberry32, vnoise } from '../sim/noise.js';
import { patchMaterial } from './shared.js';
import { heightAt } from './terrainMesh.js';
import { createPool, sphereVisible, VIEW } from './instancing.js';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();

const PALETTE = [
  [0.95, 0.42, 0.5], [1.0, 0.52, 0.2], [0.58, 0.36, 0.88], [0.95, 0.82, 0.3],
  [0.3, 0.52, 0.95], [0.7, 0.9, 0.6], [0.85, 0.22, 0.25], [0.95, 0.6, 0.75],
];

function lumpy(geo, amp, freq, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    V.set(p.getX(i), p.getY(i), p.getZ(i));
    const n = vnoise(V.x * freq + seed, V.z * freq + V.y * freq * 1.7) - 0.5;
    const l = V.length() || 1;
    V.multiplyScalar(1 + (n * amp) / l);
    p.setXYZ(i, V.x, V.y, V.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// `lo`: the same colonies with far fewer triangles, for the distance
function coralGeometries(lo = false) {
  const rnd = mulberry32(4242);
  const clean = (g) => { g.deleteAttribute('uv'); return g; };
  // 0 boulder / brain coral
  const boulder = lumpy(new THREE.SphereGeometry(0.5, lo ? 9 : 16, lo ? 6 : 10), 0.16, 4.5, 1);
  boulder.scale(1, 0.72, 1); boulder.translate(0, 0.22, 0);
  // 1 table coral
  const stalk = new THREE.CylinderGeometry(0.1, 0.16, 0.45, lo ? 4 : 6); stalk.translate(0, 0.22, 0);
  const plate = lumpy(new THREE.CylinderGeometry(0.85, 0.5, 0.11, lo ? 10 : 26, lo ? 1 : 2), 0.1, 3, 2); plate.translate(0, 0.5, 0);
  const table = mergeGeometries([clean(stalk), clean(plate)]);
  // 2 staghorn
  const horns = [];
  for (let i = 0; i < 13; i++) {
    const h = 0.4 + rnd() * 0.5;
    const c = new THREE.CylinderGeometry(0.018, 0.06, h, lo ? 4 : 7, lo ? 1 : 2);
    c.translate(0, h / 2, 0);
    c.rotateZ((rnd() - 0.5) * 1.3); c.rotateX((rnd() - 0.5) * 1.3);
    c.translate((rnd() - 0.5) * 0.35, 0, (rnd() - 0.5) * 0.35);
    horns.push(clean(c));
  }
  const stag = mergeGeometries(horns);
  // 3 tube sponges
  const tubes = [];
  for (let i = 0; i < 5; i++) {
    const h = 0.35 + rnd() * 0.55;
    const c = new THREE.CylinderGeometry(0.11, 0.07, h, lo ? 6 : 12, lo ? 1 : 2, true);
    c.translate((rnd() - 0.5) * 0.4, h / 2, (rnd() - 0.5) * 0.4);
    tubes.push(clean(c));
  }
  const sponge = mergeGeometries(tubes);
  return [clean(boulder), table, stag, sponge];
}

// radius of the part of each kind of colony that touches the ground, at scale 1
const FOOT = [0.42, 0.16, 0.24, 0.28];
const UP = new THREE.Vector3(0, 1, 0), N = new THREE.Vector3(), QA = new THREE.Quaternion();

// Seat a colony on what is actually drawn under it: lean it with the slope and
// sink its foot, so that nothing hangs in the water on the steep reef wall.
function seat(c, rnd) {
  const e = Math.max(0.3, CORAL_SIZE[c.t][0] * c.s);
  const h0 = heightAt(c.x, c.z);
  const hx0 = heightAt(c.x - e, c.z), hx1 = heightAt(c.x + e, c.z), hz0 = heightAt(c.x, c.z - e), hz1 = heightAt(c.x, c.z + e);
  const gx = (hx1 - hx0) / (2 * e), gz = (hz1 - hz0) / (2 * e), g = Math.hypot(gx, gz);
  const slope = Math.atan(g), tilt = Math.min(slope * 0.85, 0.95);
  N.set(g > 1e-5 ? -gx / g * Math.sin(tilt) : 0, Math.cos(tilt), g > 1e-5 ? -gz / g * Math.sin(tilt) : 0);
  N.x += (rnd() - 0.5) * 0.16; N.z += (rnd() - 0.5) * 0.16; N.normalize();
  QA.setFromUnitVectors(UP, N);
  Q.setFromAxisAngle(UP, c.rot).premultiply(QA);
  // on a bump the middle is higher than the ground around it
  const y = Math.min(h0, (hx0 + hx1) / 2, (hz0 + hz1) / 2)
    - 0.04 - 0.07 * c.s - Math.tan(slope - tilt + 0.1) * FOOT[c.t] * c.s;
  return new THREE.Matrix4().compose(V.set(c.x, y, c.z), Q, S.set(c.s, c.sy, c.s));
}

// A coral rock: a disc of rings draped over the simulation's own height
// function, so the picture and the collision are the same shape.
function rockGeometry(b, NR, NS) {
  const pos = [b.x, bommieSurface(b, b.x, b.z), b.z], idx = [];
  for (let i = 1; i <= NR + 1; i++) {
    const q = i > NR ? 1 : 1 - Math.pow(1 - i / NR, 1.8); // rings crowd towards the steep rim
    for (let j = 0; j < NS; j++) {
      const a = (j / NS) * Math.PI * 2, R = bommieRadius(b, a) * q;
      const x = b.x + Math.cos(a) * R, z = b.z + Math.sin(a) * R;
      // the last ring is a skirt going down into the sea bed
      pos.push(x, i > NR ? b.base - 2.2 : i === NR ? b.base : bommieSurface(b, x, z), z);
    }
  }
  for (let j = 0; j < NS; j++) idx.push(0, 1 + (j + 1) % NS, 1 + j);
  for (let i = 0; i < NR; i++) {
    for (let j = 0; j < NS; j++) {
      const A = 1 + i * NS + j, B = 1 + i * NS + (j + 1) % NS, C = A + NS, D = B + NS;
      idx.push(A, B, C, B, D, C);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function createReef(scene, quality) {
  const rnd = mulberry32(999);
  const geos = coralGeometries(), geosLo = coralGeometries(true);
  const items = [[], [], [], []];
  for (const c of LAYOUT.corals) items[c.t].push(c);

  const coralMat = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide }), {
    key: 'coral',
    // polyp texture: pale dots and ridges over the colony colour, paler tips
    color: `float pol = vnoise(vWPos.xz*38.0 + vWPos.y*31.0);
diffuseColor.rgb *= 0.62 + 0.5*vnoise(vWPos.xz*6.0 + vWPos.y*5.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.9), smoothstep(0.62, 0.9, pol)*0.45);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*1.5 + 0.08, smoothstep(0.25, 0.8, vObj.y)*0.5);`,
    bump: 'bumpH = (vnoise(vWPos.xz*38.0 + vWPos.y*31.0)*0.6 + vnoise(vWPos.zx*90.0 + vWPos.y*70.0)*0.4) * 0.05;',
  });
  // under water the bottom fades out within a few tens of metres, so the
  // coral is drawn only nearby, with a simpler model beyond ~40 m
  items.forEach((list, t) => {
    if (!list.length) return;
    const inst = list.map((c) => {
      const matrix = seat(c, rnd);
      const p = PALETTE[(c.c * PALETTE.length) | 0];
      return { matrix, color: new THREE.Color(p[0], p[1], p[2]).multiplyScalar(0.75 + rnd() * 0.35) };
    });
    createPool(scene, {
      name: 'coral' + t, items: inst, margin: 0.2,
      levels: [
        { maxDist: 38, parts: [{ geometry: geos[t], material: coralMat, color: true }] },
        { maxDist: quality === 'low' ? 80 : 120, parts: [{ geometry: geosLo[t], material: coralMat, color: true }] },
      ],
    });
  });

  // coral rocks
  {
    const rockMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x8c7f6a, roughness: 0.95 }), {
      key: 'rock',
      color: `float e = smoothstep(0.55, 0.8, vnoise(vWPos.xz*1.7 + vWPos.y*2.0));
diffuseColor.rgb = mix(diffuseColor.rgb*(0.7 + 0.5*vnoise(vWPos.xz*3.0)), mix(vec3(0.7,0.3,0.45), vec3(0.35,0.5,0.3), vnoise(vWPos.zx*0.9)), e*0.6);
diffuseColor.rgb *= 0.8 + 0.4*vnoise(vWPos.xz*9.0 + vWPos.y*7.0);`,
      bump: 'bumpH = (fbm(vWPos.xz*4.0 + vWPos.y*3.0)*0.7 + vnoise(vWPos.xz*30.0 + vWPos.y*24.0)*0.3) * 0.08;',
    });
    const lo = quality === 'low';
    for (const b of LAYOUT.bommies) {
      const rock = new THREE.Mesh(rockGeometry(b, lo ? 9 : 13, lo ? 28 : 40), rockMat);
      rock.receiveShadow = true; rock.castShadow = true;
      scene.add(rock);
    }
  }

  const fish = createFish(scene, quality);
  const turtles = createTurtles(scene);
  return {
    update(t) { fish.update(t); turtles.update(t); },
  };
}

// ---- fish --------------------------------------------------------------------------
const SPECIES = [
  { body: [1.0, 0.45, 0.12], size: 0.11, n: 34, spread: 2.6 },   // anthias
  { body: [0.98, 0.85, 0.15], size: 0.17, n: 16, spread: 2.2 },  // butterflyfish
  { body: [0.2, 0.55, 1.0], size: 0.2, n: 30, spread: 3.4 },     // fusiliers
  { body: [0.85, 0.88, 0.9], size: 0.16, n: 22, spread: 2.4 },   // sergeants
  { body: [0.95, 0.3, 0.45], size: 0.14, n: 24, spread: 2.2 },
];

function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 8, 6);
  body.scale(0.24, 0.52, 1.0);
  { const bp = body.attributes.position; for (let i = 0; i < bp.count; i++) { const z = bp.getZ(i); if (z < 0) bp.setY(i, bp.getY(i) * (1 + z * 1.2)); } body.computeVertexNormals(); }
  body.deleteAttribute('uv');
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.4, 0, 0.36, -0.95, 0, -0.36, -0.95], 3));
  tail.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  tail.setIndex([0, 1, 2]);
  return mergeGeometries([body, tail]);
}

function createFish(scene, quality) {
  const schools = [];
  const rnd = mulberry32(2024);
  LAYOUT.bommies.forEach((b, i) => {
    const top = b.base + b.h;
    schools.push({ x: b.x, z: b.z, y: Math.min(-0.8, top + 0.6), sp: SPECIES[i % 2 === 0 ? 0 : 1 + (i % 4)], range: b.r + 2.5, ph: rnd() * 10 });
    if (i % 3 === 0) schools.push({ x: b.x, z: b.z, y: Math.min(-0.7, top + 1.1), sp: SPECIES[3], range: b.r + 5, ph: rnd() * 10 });
  });
  for (let i = 0; i < 9; i++) {
    const x = -300 + i * 75 + rnd() * 30, z = shoreZ(x) + 244 + rnd() * 10;
    schools.push({ x, z, y: Math.min(-1.6, terrainHeight(x, z) + 2.5), sp: SPECIES[i % SPECIES.length], range: 9, ph: rnd() * 10 });
  }
  let total = 0;
  const div = quality === 'low' ? 2 : 1;
  for (const s of schools) {
    s.n = Math.ceil(s.sp.n / div); s.start = total; total += s.n;
    // everything a school can reach: its wandering centre plus the spread of the fish
    s.br = s.range * 0.75 + s.sp.spread * 1.6 + 1.5;
  }
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.15, side: THREE.DoubleSide }), {
    key: 'fish',
    // countershading, a dark eye and vertical bars whose strength varies per fish
    color: `float bars = smoothstep(0.35, 0.5, abs(fract(vObj.z*2.6 + 0.15) - 0.5));
float barAmt = step(0.5, fract(vWPos.x*0.37 + vWPos.z*0.21)*0.0 + fract(diffuseColor.g*7.0));
diffuseColor.rgb *= mix(1.0, 0.45 + 0.55*bars, barAmt*0.8);
diffuseColor.rgb = mix(diffuseColor.rgb*0.7, diffuseColor.rgb*1.2 + 0.1, smoothstep(-0.2, 0.2, -vObj.y));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), 1.0 - smoothstep(0.035, 0.05, length(vObj.yz - vec2(0.06, 0.33))));`,
  });
  const mesh = new THREE.InstancedMesh(fishGeometry(), mat, total);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.Color();
  const seeds = new Float32Array(total * 4), colors = new Float32Array(total * 3);
  for (const s of schools) {
    for (let i = 0; i < s.n; i++) {
      const k = s.start + i;
      seeds[k * 4] = rnd() * 6.283; seeds[k * 4 + 1] = rnd() * 6.283; seeds[k * 4 + 2] = 0.5 + rnd() * 0.5; seeds[k * 4 + 3] = 0.75 + rnd() * 0.5;
      col.setRGB(s.sp.body[0], s.sp.body[1], s.sp.body[2]).multiplyScalar(0.8 + rnd() * 0.35);
      col.toArray(colors, k * 3);
      mesh.setColorAt(k, col);
    }
  }
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  // first frame: a single zero-size fish, just to compile the shader
  mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
  mesh.count = 1;
  scene.add(mesh);

  const P = new THREE.Vector3(), P2 = new THREE.Vector3();
  const fishPos = (s, k, t, out) => {
    const a = seeds[k * 4], b = seeds[k * 4 + 1], r = seeds[k * 4 + 2];
    // school centre wanders on a loop, each fish orbits within the school
    const ct = t * 0.11 + s.ph;
    const cx = s.x + Math.cos(ct) * s.range * 0.55 + Math.sin(ct * 2.3) * s.range * 0.2;
    const cz = s.z + Math.sin(ct * 1.3) * s.range * 0.55;
    const cy = s.y + Math.sin(ct * 1.7) * 0.35;
    const ft = t * (0.35 + 0.25 * r) + a;
    out.set(
      cx + Math.cos(ft) * s.sp.spread * r + Math.sin(ft * 2.1 + b) * 0.5,
      cy + Math.sin(ft * 1.3 + b) * s.sp.spread * 0.3 * r,
      cz + Math.sin(ft + b) * s.sp.spread * r + Math.cos(ft * 1.7 + a) * 0.5,
    );
    const floor = heightAt(out.x, out.z) + 0.25;
    if (out.y < floor) out.y = floor;
    if (out.y > -0.3) out.y = -0.3;
  };
  const ic = mesh.instanceColor.array;
  return {
    update(t) {
      // fish are tiny and under water: only schools close by and in view are
      // animated and drawn, packed to the front of the instance buffer
      let slot = 0;
      for (const s of schools) {
        const dx = s.x - VIEW.x, dz = s.z - VIEW.z;
        if (dx * dx + dz * dz > (55 + s.br) ** 2 || !sphereVisible(s.x, s.y, s.z, s.br)) continue;
        for (let i = 0; i < s.n; i++) {
          const k = s.start + i;
          fishPos(s, k, t, P);
          fishPos(s, k, t + 0.08, P2);
          const dx = P2.x - P.x, dy = P2.y - P.y, dz = P2.z - P.z;
          const yaw = Math.atan2(dx, dz) + Math.sin(t * 11 + seeds[k * 4] * 5) * 0.16;
          const pitch = -Math.atan2(dy, Math.hypot(dx, dz) + 1e-5) * 0.6;
          E.set(pitch, yaw, 0, 'YXZ'); Q.setFromEuler(E);
          const sz = s.sp.size * seeds[k * 4 + 3] * 2;
          M4.compose(P, Q, S.set(sz, sz, sz));
          mesh.setMatrixAt(slot, M4);
          ic[slot * 3] = colors[k * 3]; ic[slot * 3 + 1] = colors[k * 3 + 1]; ic[slot * 3 + 2] = colors[k * 3 + 2];
          slot++;
        }
      }
      mesh.count = slot;
      mesh.visible = slot > 0;
      if (slot) {
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, slot * 16); mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, slot * 3); mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}

// ---- turtles --------------------------------------------------------------------------
function createTurtles(scene) {
  const shellMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x6b5a34, roughness: 0.55 }), {
    key: 'turtle',
    // scutes: hexagonal-ish plates with pale seams
    color: `vec2 sp = vObj.xz*5.0; sp.x += step(1.0, mod(floor(sp.y), 2.0))*0.5; vec2 sf = abs(fract(sp) - 0.5);
float seam = smoothstep(0.38, 0.47, max(sf.x, sf.y));
diffuseColor.rgb = mix(diffuseColor.rgb*(0.7 + 0.6*hash12(floor(sp))), vec3(0.75,0.68,0.45), seam*0.7) * step(0.0, vObj.y) + diffuseColor.rgb*vec3(1.5,1.4,1.0)*step(vObj.y, 0.0);`,
  });
  const skinMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x8a8a5a, roughness: 0.6 }), { key: 'turtleSkin' });
  const list = [];
  const defs = [{ x: -40, d: 56, r: 26, ph: 0 }, { x: 120, d: 62, r: 22, ph: 2.4 }];
  for (const d of defs) {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), shellMat);
    shell.scale.set(0.95, 0.42, 1.2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinMat);
    head.position.set(0, 0.02, 0.72); head.scale.set(1, 0.85, 1.3);
    g.add(shell, head);
    const flip = [];
    for (const [sx, sz, len] of [[1, 0.38, 0.75], [-1, 0.38, 0.75], [1, -0.5, 0.4], [-1, -0.5, 0.4]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.38, -0.02, sz);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), skinMat);
      f.scale.set(len, 0.06, 0.3);
      f.position.set(sx * len * 0.45, 0, sz > 0 ? 0.05 : -0.1);
      pivot.add(f); g.add(pivot);
      flip.push({ pivot, sx, front: sz > 0 });
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    list.push({ g, flip, d });
  }
  return {
    update(t) {
      for (const tu of list) {
        const d = tu.d, a = t * 0.07 + d.ph;
        const cx = d.x, cz = d.d + shoreZ(d.x);
        const x = cx + Math.cos(a) * d.r * 1.6, z = cz + Math.sin(a) * d.r * 0.7;
        // a turtle is a handful of small parts under water: skip it unless it is close
        tu.g.visible = (x - VIEW.x) ** 2 + (z - VIEW.z) ** 2 < 70 * 70;
        if (!tu.g.visible) continue;
        const y = Math.max(heightAt(x, z) + 0.6, -1.1 + Math.sin(a * 3.1) * 0.45);
        tu.g.position.set(x, Math.min(y, -0.35), z);
        const vx = -Math.sin(a) * 1.6, vz = Math.cos(a) * 0.7;
        tu.g.rotation.set(Math.sin(a * 3.1 + 1.5) * 0.12, Math.atan2(vx, vz), 0, 'YXZ');
        for (const f of tu.flip) {
          const w = Math.sin(t * 1.5 + d.ph) * (f.front ? 0.55 : 0.2);
          f.pivot.rotation.z = f.sx * w;
          f.pivot.rotation.y = f.front ? f.sx * (-0.35 + Math.cos(t * 1.5 + d.ph) * 0.25) : 0;
        }
      }
    },
  };
}
