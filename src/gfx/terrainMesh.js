// Terrain mesh: one grid, dense over the playable area and stretched towards
// the horizon, shaded procedurally (sand, wet sand, mud, reef rock, lawn, desert).

import * as THREE from 'three';
import { terrainHeight, shoreZ, flatMask, channelMask, lagoonMask, reefD, poolQ, bommieAt } from '../sim/terrain.js';
import { POOLS } from '../sim/mapdata.js';
import { smoothstep } from '../sim/noise.js';
import { patchMaterial, rippleTexture } from './shared.js';

function axis(lo, hi, step, farLo, farHi) {
  const a = [];
  for (let v = lo; v <= hi + 1e-6; v += step) a.push(v);
  let s = step, v = hi;
  while (v < farHi) { s *= 1.32; v += s; a.push(v); }
  s = step; v = lo;
  const pre = [];
  while (v > farLo) { s *= 1.32; v -= s; pre.push(v); }
  return pre.reverse().concat(a);
}

// Cheap height lookup for things that are only drawn (fish, turtles, the
// crocodiles' render pose): bilinear on the terrain mesh's own samples, so it
// matches what is on screen (coral rocks included). Exact terrainHeight() until
// the mesh exists.
export let heightAt = (x, z) => Math.max(terrainHeight(x, z), bommieAt(x, z));
// The same samples as a texture, for shaders (shore foam): value = height in
// metres; `info` maps world x/z to texture coordinates.
export const heightMap = { texture: null, info: new THREE.Vector4(-480, -330, 2, 1) };

function underPool(x, z) {
  for (const p of POOLS) if (poolQ(p, x, z, 3) < 1) return p;
  return null;
}

export function createTerrain(quality) {
  const step = quality === 'low' ? 3 : 2;
  const xs = axis(-480, 480, step, -5200, 5200);
  const zs = axis(-330, 500, step, -5200, 1100);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const mask = new Float32Array(nx * nz * 4);
  let k = 0, m = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j];
      let y = terrainHeight(x, z);
      const p = underPool(x, z);
      if (p) y = p.floor - 0.45; // hidden below the pool shell
      pos[k++] = x; pos[k++] = y; pos[k++] = z;
      const d = z - shoreZ(x);
      const E = reefD(x);
      const lag = d > 10 ? lagoonMask(x, d) : 0;
      const F = d > 1 ? flatMask(x, d) * (1 - lag) : 0;
      const ch = d > 90 ? channelMask(x, d) : 0;
      // the outer reef flat and the lagoon rims are rock and coral rubble, not mud
      const rock = Math.max(smoothstep(E - 16, E - 3, d), 0.6 * smoothstep(232, 290, d) * F, lag > 0.03 && lag < 0.75 ? 0.8 : 0);
      mask[m++] = F * (1 - 0.6 * ch) * (1 - rock);                       // mud
      mask[m++] = d > 12 ? rock : 0;                                      // reef rock
      mask[m++] = smoothstep(-270, -254, d) * (1 - smoothstep(-34, -28, d)); // gardens
      mask[m++] = smoothstep(258, 318, -d);                              // desert
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let t = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = e;
    }
  }
  {
    const ix0 = xs.findIndex((v) => Math.abs(v + 480) < 1e-6), iz0 = zs.findIndex((v) => Math.abs(v + 330) < 1e-6);
    const NX = Math.round(960 / step) + 1, NZ = Math.round(830 / step) + 1;
    const hd = new Uint16Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) hd[j * NX + i] = THREE.DataUtils.toHalfFloat(pos[((j + iz0) * nx + i + ix0) * 3 + 1]);
    const ht = new THREE.DataTexture(hd, NX, NZ, THREE.RedFormat, THREE.HalfFloatType);
    ht.magFilter = ht.minFilter = THREE.LinearFilter;
    ht.needsUpdate = true;
    heightMap.texture = ht;
    heightMap.info.set(-480, -330, step, 0).setW(NX); heightMap.nz = NZ;
    heightAt = (x, z) => {
      const fx = (x + 480) / step, fz = (z + 330) / step;
      if (!(fx >= 0 && fz >= 0 && fx < NX - 1 && fz < NZ - 1)) return terrainHeight(x, z);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const k = ((j + iz0) * nx + i + ix0) * 3 + 1, r = nx * 3;
      // the two triangles of the cell, split along the same diagonal as the mesh
      const h00 = pos[k], h10 = pos[k + 3], h01 = pos[k + r], h11 = pos[k + r + 3];
      const y = u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
      return Math.max(y, bommieAt(x, z));
    };
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.setIndex(null);

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  patchMaterial(mat, {
    key: 'terrain',
    uniforms: { tRipple: { value: rippleTexture() } },
    vertexPars: 'attribute vec4 aMask;\nvarying vec4 vMask;\nvarying vec3 vWN;',
    vertex: 'vMask = aMask; vWN = normal;',
    fragmentPars: /* glsl */ `
varying vec4 vMask;
varying vec3 vWN;
uniform sampler2D tRipple; // slope in RG, smooth noise in BA, tileable and mipmapped
float fbm2(vec2 p){ return (vnoise(p) + 0.5*vnoise(p*2.03 + vec2(17.1,-9.7))) / 1.5; }`,
    color: /* glsl */ `
{
  vec2 p = vWPos.xz;
  float h = vWPos.y;
  float big = fbm2(p*0.06);
  vec3 sand = mix(vec3(0.93,0.8,0.58), vec3(0.8,0.65,0.44), big);
  sand *= 0.9 + 0.2*texture2D(tRipple, p*0.4375).b;
  sand = mix(sand, vec3(0.95,0.9,0.78), (1.0 - smoothstep(-1.2,-0.1,h))*0.6);
  vec3 col = sand;
  // each zone only pays for its own noise
  if (vMask.x > 0.004) {
    vec3 mud = mix(vec3(0.2,0.16,0.11), vec3(0.36,0.3,0.2), fbm(p*0.35));
    mud = mix(mud, vec3(0.2,0.24,0.12), smoothstep(0.55,0.8,vnoise(p*0.9))*0.5);
    col = mix(col, mud, clamp(vMask.x*(0.85 + 0.3*vnoise(p*0.6)),0.0,1.0));
  }
  if (vMask.y > 0.004) {
    vec3 reef = mix(vec3(0.42,0.37,0.3), vec3(0.66,0.6,0.5), fbm(p*0.45));
    float enc = smoothstep(0.62,0.8,vnoise(p*1.3 + 7.0));
    reef = mix(reef, mix(vec3(0.75,0.35,0.5), vec3(0.4,0.3,0.65), vnoise(p*0.4)), enc*0.55);
    col = mix(col, reef, vMask.y);
  }
  if (vMask.z > 0.004) {
    float lawn = vMask.z * smoothstep(0.38,0.5, fbm(p*0.035 + 3.0));
    vec3 grass = mix(vec3(0.13,0.27,0.07), vec3(0.3,0.4,0.13), fbm(p*0.3));
    grass = mix(grass, vec3(0.42,0.4,0.2), smoothstep(0.55, 0.8, fbm(p*0.09 + 11.0))*0.6);
    float g13 = texture2D(tRipple, p*0.8125).b, g41 = texture2D(tRipple, p*2.5625).a;
    grass *= 0.7 + 0.6*g13*(0.7 + 0.6*g41);
    col = mix(col, grass, lawn);
  }
  if (vMask.w > 0.004) {
    vec3 des = mix(vec3(0.84,0.69,0.48), vec3(0.72,0.54,0.38), fbm(p*0.012));
    vec3 rock = mix(vec3(0.5,0.36,0.27), vec3(0.62,0.47,0.36), fbm(p*0.02 + 5.0));
    des = mix(des, rock, smoothstep(14.0, 60.0, h) * (0.6 + 0.4*(1.0-vWN.y)));
    col = mix(col, des, vMask.w);
  }
  // wet sand at the water's edge
  float wetLine = 0.2 + 0.07*sin(uTime*0.55 + p.x*0.15) + 0.05*vnoise(p*0.8);
  float wet = (1.0 - smoothstep(0.0, wetLine, h)) * smoothstep(-0.6, -0.05, h);
  col *= 1.0 - 0.38*wet;
  diffuseColor.rgb = col;
}`,
    patch(shader) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  float h2 = vWPos.y;
  float wet2 = (1.0 - smoothstep(0.0, 0.25, h2));
  roughnessFactor = mix(0.96, 0.28, wet2 * (1.0 - vMask.w));
}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec2 p = vWPos.xz;
  float dist = length(vViewPosition);
  float amt = 1.0 / (1.0 + dist*dist*0.0006);
  if (amt > 0.04) {
  // slope of the micro relief: wave ripples in the sand under water (analytic)
  // plus fine bumps read from the tileable slope texture (mipmapped, so it
  // stays calm in the distance instead of sparkling)
  float rip = (1.0 - smoothstep(-0.3, 0.15, vWPos.y)) * (1.0 - vMask.x) * (1.0 - vMask.y);
  float w = vnoise(p*0.35)*5.0;
  vec2 g = rip * 0.5 * cos(p.y*4.6 + w + p.x*0.8) * vec2(0.8, 4.6) * aaw(0.9, gFw);
  g += (texture2D(tRipple, p*0.17).xy - 0.5) * 2.6 + (texture2D(tRipple, p.yx*0.53 + 0.31).yx - 0.5) * 1.7;
  g *= 0.085 * amt * (1.0 + vMask.x);
  normal = normalize(normal - (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz);
  }
}`);
    },
  });

  // Tiles share the vertex data but have their own triangles and bounds, so
  // ground outside the view is skipped (and visible tiles draw front to back).
  const group = new THREE.Group();
  group.name = 'terrain';
  const TILE = 128, P = geo.attributes.position, box = new THREE.Box3(), v = new THREE.Vector3();
  for (let j0 = 0; j0 < nz - 1; j0 += TILE) {
    for (let i0 = 0; i0 < nx - 1; i0 += TILE) {
      const j1 = Math.min(nz - 1, j0 + TILE), i1 = Math.min(nx - 1, i0 + TILE);
      const ti = new Uint32Array((i1 - i0) * (j1 - j0) * 6);
      let q = 0;
      box.makeEmpty();
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          box.expandByPoint(v.fromBufferAttribute(P, j * nx + i));
          if (i === i1 || j === j1) continue;
          const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
          ti[q++] = a; ti[q++] = c; ti[q++] = b;
          ti[q++] = b; ti[q++] = c; ti[q++] = e;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', geo.attributes.position);
      g.setAttribute('normal', geo.attributes.normal);
      g.setAttribute('aMask', geo.attributes.aMask);
      g.setIndex(new THREE.BufferAttribute(ti, 1));
      g.boundingBox = box.clone();
      g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      // after the other opaque objects: ground hidden behind buildings and trees
      // is then rejected by the depth test before its (heavy) shader runs
      mesh.renderOrder = 5;
      group.add(mesh);
    }
  }
  return group;
}
