// Terrain mesh: one grid, dense over the playable area and stretched towards
// the horizon, shaded procedurally (sand, wet sand, mud, reef rock, lawn, desert).

import * as THREE from 'three';
import { terrainHeight, shoreZ, flatMask, channelMask, poolAt } from '../sim/terrain.js';
import { POOLS } from '../sim/mapdata.js';
import { smoothstep } from '../sim/noise.js';
import { patchMaterial } from './shared.js';

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

function underPool(x, z) {
  for (const p of POOLS) {
    const dx = (x - p.x) / (p.rx + 3), dz = (z - p.z) / (p.rz + 3);
    if (dx * dx + dz * dz < 1) return p;
  }
  return null;
}

export function createTerrain(quality) {
  const step = quality === 'low' ? 3 : 2;
  const xs = axis(-400, 400, step, -5200, 5200);
  const zs = axis(-330, 344, step, -5200, 900);
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
      const F = d > 10 ? flatMask(x, d) : 0;
      const ch = d > 90 ? channelMask(x, d) : 0;
      mask[m++] = F * (1 - 0.6 * ch);                                  // mud
      mask[m++] = Math.max(smoothstep(226, 240, d), 0);                // reef rock
      mask[m++] = smoothstep(-262, -246, d) * (1 - smoothstep(-52, -42, d)); // gardens
      mask[m++] = smoothstep(250, 310, -d);                            // desert
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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  patchMaterial(mat, {
    key: 'terrain',
    vertexPars: 'attribute vec4 aMask;\nvarying vec4 vMask;\nvarying vec3 vWN;',
    vertex: 'vMask = aMask; vWN = normal;',
    fragmentPars: /* glsl */ `
varying vec4 vMask;
varying vec3 vWN;
float terrBump(vec2 p, float rip){
  float w = vnoise(p*0.35)*5.0;
  return rip*0.5*sin(p.y*4.6 + w + p.x*0.8) + 0.5*vnoise(p*2.7) + 0.25*vnoise(p*9.0);
}`,
    color: /* glsl */ `
{
  vec2 p = vWPos.xz;
  float h = vWPos.y;
  float big = fbm(p*0.06);
  vec3 sand = mix(vec3(0.93,0.8,0.58), vec3(0.8,0.65,0.44), big);
  sand *= 0.9 + 0.2*vnoise(p*7.0);
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
    vec3 grass = mix(vec3(0.16,0.36,0.09), vec3(0.32,0.5,0.15), fbm(p*0.3));
    grass *= 0.8 + 0.4*vnoise(p*11.0);
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
  float rip = (1.0 - smoothstep(-0.3, 0.15, vWPos.y)) * (1.0 - vMask.x) * (1.0 - vMask.y);
  float e = 0.06;
  float b0 = terrBump(p, rip);
  float bx = terrBump(p + vec2(e,0.0), rip);
  float bz = terrBump(p + vec2(0.0,e), rip);
  vec3 g = vec3((bx-b0)/e, 0.0, (bz-b0)/e) * 0.085 * amt * (1.0 + vMask.x);
  normal = normalize(normal - (viewMatrix * vec4(g, 0.0)).xyz);
  }
}`);
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'terrain';
  return mesh;
}
