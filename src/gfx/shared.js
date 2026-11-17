// Shared uniforms, GLSL snippets and material patches.

import * as THREE from 'three';
import { WAVES, WAVE_AMP_LAGOON, WAVE_AMP_SEA } from '../sim/terrain.js';

export const LAYER_MAIN = 0;
export const LAYER_FX = 1; // water + transparent effects, drawn after the opaque scene

export const SUN_DIR = new THREE.Vector3(0.36, 0.6, 0.72).normalize();

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: new THREE.Color(1.0, 0.93, 0.8) },
  uWind: { value: 1 },
};

export const FOG_AIR = { color: new THREE.Color(0.7, 0.88, 1.08), density: 0.00085 };
export const FOG_WATER = { color: new THREE.Color(0.03, 0.34, 0.44), density: 0.042 };

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + vec2(17.1,-9.7); a *= 0.5; } return s/0.9375; }
`;

// Sun-light network on everything below the water line.
export const GLSL_CAUSTICS = /* glsl */ `
float caustic(vec2 p, float t){
  vec2 q = p; float c = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    q += 0.55*vec2(sin(q.y*1.7 + t*0.9 + fi*1.3), cos(q.x*1.5 - t*0.7 + fi*2.1));
    float v = sin(q.x*2.1 + t*0.6 + fi)*cos(q.y*2.3 - t*0.5);
    c += pow(1.0 - abs(v), 7.0);
    q = q*1.35 + 3.1;
  }
  return c/3.0;
}
`;

// Geometric waves, generated from the same constants the simulation uses.
export const GLSL_WAVES = (() => {
  let h = '', gx = '', gz = '';
  WAVES.forEach((w, i) => {
    const ph = `${w.k.toFixed(5)}*(${w.dx.toFixed(4)}*p.x + ${w.dz.toFixed(4)}*p.y) + ${w.omega.toFixed(5)}*t + ${w.ph.toFixed(3)}`;
    h += `  h += ${w.amp.toFixed(3)}*sin(${ph});\n`;
    gx += `  g.x += ${(w.amp * w.k * w.dx).toFixed(5)}*cos(${ph});\n`;
    gz += `  g.y += ${(w.amp * w.k * w.dz).toFixed(5)}*cos(${ph});\n`;
  });
  return /* glsl */ `
float waveAmp(float z){ return ${WAVE_AMP_LAGOON.toFixed(4)} + ${WAVE_AMP_SEA.toFixed(4)}*smoothstep(225.0, 300.0, z); }
float waveHeight(vec2 p, float t){ float h = 0.0;
${h}  return h*waveAmp(p.y); }
vec2 waveGrad(vec2 p, float t){ vec2 g = vec2(0.0);
${gx}${gz}  return g*waveAmp(p.y); }
`;
})();

/**
 * Patch a built-in material: world position varying, caustics + depth tint
 * below the water line, optional wind sway. `opts`:
 *   waterLevel  - y of the water surface this object sits under (default 0)
 *   sway        - amplitude of wind sway (0 = none), scaled by height above pivot
 *   swayWater   - underwater sway (seagrass)
 *   extraVertex / extraFragment - additional GLSL
 */
export function patchMaterial(mat, opts = {}) {
  const waterLevel = { value: opts.waterLevel ?? 0 };
  const key = ['uw', opts.sway || 0, opts.swayWater || 0, opts.key || '', opts.vertexPars || '', opts.vertex || '',
    opts.fragmentPars || '', opts.color || ''].join('|');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uSunDir = U.uSunDir;
    shader.uniforms.uWaterLevel = waterLevel;
    if (opts.uniforms) Object.assign(shader.uniforms, opts.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uTime;
${opts.vertexPars || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${opts.sway ? `{
  #ifdef USE_INSTANCING
    vec3 ipos = instanceMatrix[3].xyz;
  #else
    vec3 ipos = modelMatrix[3].xyz;
  #endif
  float hgt = max(transformed.y, 0.0);
  float ph = ipos.x*0.21 + ipos.z*0.17;
  float sw = sin(uTime*1.3 + ph) + 0.5*sin(uTime*2.7 + ph*1.7 + transformed.x);
  transformed.x += sw * ${opts.sway.toFixed(4)} * hgt * hgt * 0.02;
  transformed.z += cos(uTime*1.1 + ph*1.3) * ${opts.sway.toFixed(4)} * hgt * hgt * 0.012;
}` : ''}
${opts.swayWater ? `{
  #ifdef USE_INSTANCING
    vec3 ipos = instanceMatrix[3].xyz;
  #else
    vec3 ipos = modelMatrix[3].xyz;
  #endif
  float hgt = max(transformed.y, 0.0);
  float ph = ipos.x*0.9 + ipos.z*0.7;
  transformed.x += sin(uTime*1.6 + ph + hgt*2.0) * ${opts.swayWater.toFixed(4)} * hgt;
  transformed.z += cos(uTime*1.2 + ph*1.4 + hgt*1.5) * ${opts.swayWater.toFixed(4)} * hgt * 0.6;
}` : ''}
${opts.vertex || ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  vWPos = (modelMatrix * wp).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uTime;
uniform vec3 uSunDir;
uniform float uWaterLevel;
${GLSL_NOISE}
${GLSL_CAUSTICS}
${opts.fragmentPars || ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${opts.color || ''}`)
      .replace('#include <opaque_fragment>', `{
  float dpt = uWaterLevel - vWPos.y;
  if (dpt > 0.0) {
    vec2 cp = vWPos.xz - uSunDir.xz / uSunDir.y * dpt;
    float c = caustic(cp*0.85, uTime*1.15);
    float cd = length(vViewPosition);
    float fade = smoothstep(0.0, 0.35, dpt) * exp(-dpt*0.11) / (1.0 + cd*cd*0.00035);
    outgoingLight += diffuseColor.rgb * c * fade * 1.25 * vec3(1.0, 0.96, 0.82);
    outgoingLight *= mix(vec3(1.0), vec3(0.62, 0.9, 1.0), 1.0 - exp(-dpt*0.22));
  }
}
#include <opaque_fragment>`);
    if (opts.patch) opts.patch(shader);
  };
  return mat;
}

// Small helpers for building merged, vertex-coloured geometry.
export function paint(geo, color) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = color instanceof THREE.Color ? color : new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

export function xform(geo, { t, r, s } = {}) {
  if (s) geo.scale(s[0], s[1], s[2]);
  if (r) {
    if (r[0]) geo.rotateX(r[0]);
    if (r[2]) geo.rotateZ(r[2]);
    if (r[1]) geo.rotateY(r[1]);
  }
  if (t) geo.translate(t[0], t[1], t[2]);
  return geo;
}

// Canvas texture helper.
export function canvasTexture(w, h, draw, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
