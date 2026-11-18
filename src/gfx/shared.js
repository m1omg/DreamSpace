// Shared uniforms, GLSL snippets and material patches.

import * as THREE from 'three';
import { WAVES, WAVE_AMP_LAGOON, WAVE_AMP_SEA, flatMask, lagoonMask, openSea, shoreZ } from '../sim/terrain.js';
import { mulberry32 } from '../sim/noise.js';

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
// the haze thins out with height (scale height in metres), so distant
// mountain tops keep their contrast while the sea horizon stays hazy
export const FOG_HEIGHT = 180;
export const FOG_WATER = { color: new THREE.Color(0.03, 0.34, 0.44), density: 0.042 };

// ---- engine-wide shader tweaks ---------------------------------------------------
{
  const C = THREE.ShaderChunk, d = SUN_DIR;
  const sun = `vec3(${d.x.toFixed(5)}, ${d.y.toFixed(5)}, ${d.z.toFixed(5)})`;
  const FOG_H = FOG_HEIGHT.toFixed(1);
  // Aerial perspective: the haze glows warm towards the sun, the way the sky
  // does at the horizon (only for the air fog; the water fog is dark teal).
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogDir;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogDir = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;\n#endif';
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogDir;');
  C.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		// mean density along the ray, for a haze that thins out exponentially with height
		float fogH0 = cameraPosition.y, fogDy = vFogDir.y;
		float fogAvg = abs( fogDy ) > 1e-3
			? ( exp( - fogH0 / ${FOG_H} ) - exp( - ( fogH0 + fogDy ) / ${FOG_H} ) ) * ${FOG_H} / fogDy
			: exp( - fogH0 / ${FOG_H} );
		float fogD = fogDensity * vFogDepth * mix( 1.0, fogAvg, smoothstep( 0.3, 0.6, fogColor.r ) );
		float fogFactor = 1.0 - exp( - fogD * fogD );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	float fogSd = max( dot( normalize( vFogDir ), ${sun} ), 0.0 );
	vec3 fogCol = fogColor + vec3( 1.0, 0.85, 0.6 ) * ( pow( fogSd, 6.0 ) * 0.22 + pow( fogSd, 48.0 ) * 0.3 ) * smoothstep( 0.3, 0.6, fogColor.r );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`;
  // Sun shadows fade out over the last stretch of the shadow map instead of
  // stopping at a hard line around the player.
  C.shadowmap_pars_fragment = C.shadowmap_pars_fragment.replace('return mix( 1.0, shadow, shadowIntensity );', `vec2 shEdge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );
		return mix( 1.0, shadow, shadowIntensity * clamp( min( shEdge.x, shEdge.y ) * 9.0, 0.0, 1.0 ) );`);
}

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + vec2(17.1,-9.7); a *= 0.5; } return s/0.9375; }
// Weight for a noise layer of the given frequency (cycles per metre) when one
// pixel covers fw metres: layers finer than a pixel fade to their mean value
// instead of sparkling as the camera moves.
float aaw(float freq, float fw){ return 1.0 - smoothstep(0.18, 0.55, freq*fw); }
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
float waveHeight(vec2 p, float t, float amp){ float h = 0.0;
${h}  return h*amp; }
vec2 waveGrad(vec2 p, float t, float amp){ vec2 g = vec2(0.0);
${gx}${gz}  return g*amp; }
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
    opts.fragmentPars || '', opts.color || '', opts.bump || '', opts.normalVertex || '', opts.ao || ''].join('|');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uSunDir = U.uSunDir;
    shader.uniforms.uWaterLevel = waterLevel;
    if (opts.uniforms) Object.assign(shader.uniforms, opts.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vObj;
uniform float uTime;
${opts.vertexPars || ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
${opts.normalVertex || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vObj = position;
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
varying vec3 vObj;
uniform float uTime;
uniform vec3 uSunDir;
uniform float uWaterLevel;
${GLSL_NOISE}
${GLSL_CAUSTICS}
${opts.fragmentPars || ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float gFw = max(length(dFdx(vWPos)), length(dFdy(vWPos)));
${opts.color || ''}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
${opts.ao ? `{
  float gAO = 1.0;
  ${opts.ao}
  reflectedLight.indirectDiffuse *= gAO;
  reflectedLight.indirectSpecular *= gAO;
  reflectedLight.directDiffuse *= mix(1.0, gAO, 0.3);
}` : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${opts.bump ? `{
  float bumpH; ${opts.bump}
  vec3 bsx = dFdx(-vViewPosition), bsy = dFdy(-vViewPosition);
  vec3 br1 = cross(bsy, normal), br2 = cross(normal, bsx);
  float bdet = dot(bsx, br1);
  vec3 bgrad = sign(bdet) * (dFdx(bumpH) * br1 + dFdy(bumpH) * br2);
  normal = normalize(abs(bdet) * normal - bgrad);
}` : ''}`)
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

export const WAVE_AMP = { lagoon: WAVE_AMP_LAGOON, sea: WAVE_AMP_SEA };

// ---- zone map: murky swamp water (R) and open-sea swell (G) -------------------
export const ZONE = { x0: -640, x1: 640, z0: -60, z1: 580, w: 256, h: 128 };
let zoneTex = null;
export function zoneTexture() {
  if (zoneTex) return zoneTex;
  const { x0, x1, z0, z1, w, h } = ZONE;
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) / w * (x1 - x0), z = z0 + (j + 0.5) / h * (z1 - z0);
    const d = z - shoreZ(x);
    const murk = d > 0 ? flatMask(x, d) * (1 - lagoonMask(x, d)) : 0;
    const k = (j * w + i) * 4;
    data[k] = Math.round(murk * 255); data[k + 1] = Math.round(openSea(x, z) * 255); data[k + 2] = 0; data[k + 3] = 255;
  }
  zoneTex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  zoneTex.magFilter = zoneTex.minFilter = THREE.LinearFilter;
  zoneTex.needsUpdate = true;
  return zoneTex;
}
export const GLSL_ZONE = /* glsl */ `
uniform sampler2D tZone;
vec2 zoneUV(vec2 p){ return vec2((p.x - (${ZONE.x0.toFixed(1)})) / ${(ZONE.x1 - ZONE.x0).toFixed(1)}, (p.y - (${ZONE.z0.toFixed(1)})) / ${(ZONE.z1 - ZONE.z0).toFixed(1)}); }
`;

// ---- water ripples ------------------------------------------------------------
// A tileable ripple field (a sum of waves with whole-number wave vectors, so it
// wraps seamlessly), stored as its slope in RG and two smooth noises in BA.
// Sampled at a few scales it replaces nine value-noise evaluations per water
// pixel, and mipmapping keeps distant water from sparkling.
let rippleTex = null;
export function rippleTexture() {
  if (rippleTex) return rippleTex;
  const N = 256, rnd = mulberry32(4711);
  const waves = [];
  for (let i = 0; i < 44; i++) {
    let kx, ky, k;
    do { kx = Math.round((rnd() - 0.5) * 30); ky = Math.round((rnd() - 0.5) * 30); k = Math.hypot(kx, ky); } while (k < 2.5 || k > 15);
    // mostly along one direction, like wind-driven ripples
    const along = Math.abs(kx * 0.8 + ky * 0.6) / k;
    waves.push({ kx, ky, a: Math.pow(k, -1.6) * (0.45 + 0.55 * along), ph: rnd() * Math.PI * 2 });
  }
  const gx = new Float32Array(N * N), gy = new Float32Array(N * N);
  let mx = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let sx = 0, sy = 0;
    for (const w of waves) {
      const s = -Math.sin((2 * Math.PI) * (w.kx * i + w.ky * j) / N + w.ph) * w.a * 2 * Math.PI;
      sx += s * w.kx; sy += s * w.ky;
    }
    gx[j * N + i] = sx; gy[j * N + i] = sy;
    mx = Math.max(mx, Math.abs(sx), Math.abs(sy));
  }
  // tileable value noise for foam break-up
  const lattice = (cells, seed) => { const r = mulberry32(seed), v = new Float32Array(cells * cells); for (let k = 0; k < v.length; k++) v[k] = r(); return v; };
  const L1 = lattice(16, 91), L2 = lattice(8, 92);
  const vn = (L, cells, u, v) => {
    const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => L[((b % cells + cells) % cells) * cells + ((a % cells + cells) % cells)];
    const a0 = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx, a1 = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return a0 + (a1 - a0) * sy;
  };
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i) * 4, u = i / N, v = j / N;
    data[k] = Math.round(127.5 + 127 * gx[j * N + i] / mx);
    data[k + 1] = Math.round(127.5 + 127 * gy[j * N + i] / mx);
    data[k + 2] = Math.round(255 * vn(L1, 16, u, v));
    data[k + 3] = Math.round(255 * (0.65 * vn(L2, 8, u, v) + 0.35 * vn(L1, 16, u + 0.37, v + 0.71)));
  }
  rippleTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.magFilter = THREE.LinearFilter;
  rippleTex.minFilter = THREE.LinearMipmapLinearFilter;
  rippleTex.generateMipmaps = true;
  rippleTex.anisotropy = 4;
  rippleTex.needsUpdate = true;
  return rippleTex;
}

// ---- procedural detail textures -------------------------------------------------
// Tileable Voronoi cells: used for flagstones, stone cladding and reptile scales.
function voronoi(size, n, seed, shade) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([rnd(), rnd(), rnd(), rnd()]);
  return canvasTexture(size, size, (g) => {
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let d1 = 9, d2 = 9, id = 0;
      for (let i = 0; i < n; i++) {
        let dx = Math.abs(u - pts[i][0]), dy = Math.abs(v - pts[i][1]);
        if (dx > 0.5) dx = 1 - dx;
        if (dy > 0.5) dy = 1 - dy;
        const dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; id = i; } else if (dd < d2) d2 = dd;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const c = shade(pts[id][2], pts[id][3], edge * Math.sqrt(n), Math.sqrt(d1) * Math.sqrt(n), rnd);
      const k = (y * size + x) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: true });
}
function speckle(g, w, h, rnd, n, lo, hi, size) {
  for (let i = 0; i < n; i++) {
    const v = lo + rnd() * (hi - lo);
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.4})`;
    const s = size * (0.4 + rnd());
    g.beginPath(); g.ellipse(rnd() * w, rnd() * h, s, s * (0.5 + rnd()), rnd() * 3.14, 0, 6.283); g.fill();
  }
}

let detail = null;
export function detailTextures() {
  if (detail) return detail;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  detail = {
    // hand-trowelled plaster: soft blotches and fine grain, mid grey = neutral
    stucco: canvasTexture(256, 256, (g, w, h) => {
      const rnd = mulberry32(11);
      g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, rnd, 260, 150, 235, 16);
      speckle(g, w, h, rnd, 2600, 130, 250, 1.6);
    }, { repeat: true }),
    // crazy paving / flagstones
    paving: voronoi(256, 34, 7, (a, b, edge) => {
      const m = sm(0.02, 0.07, edge), t = 178 + a * 62;
      return [t * m + 120 * (1 - m), (t - 8 - b * 14) * m + 106 * (1 - m), (t - 34 - b * 22) * m + 86 * (1 - m)];
    }),
    // rough stone cladding
    stone: voronoi(256, 46, 23, (a, b, edge, c) => {
      const m = sm(0.02, 0.09, edge), t = 150 + a * 80 - c * 14;
      return [(t + 10) * m + 58 * (1 - m), (t - 6) * m + 50 * (1 - m), (t - 30 - b * 20) * m + 42 * (1 - m)];
    }),
    wood: canvasTexture(256, 256, (g, w, h) => {
      const rnd = mulberry32(5);
      g.fillStyle = '#b9b9b9'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 150; i++) {
        const v = 110 + rnd() * 130;
        g.strokeStyle = `rgba(${v},${v},${v},0.55)`; g.lineWidth = 0.6 + rnd() * 2;
        const x = rnd() * w;
        g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rnd() * 8 - 4, h * 0.3, x + rnd() * 8 - 4, h * 0.7, x, h); g.stroke();
      }
    }, { repeat: true }),
    thatch: canvasTexture(256, 256, (g, w, h) => {
      const rnd = mulberry32(9);
      g.fillStyle = '#8f8f8f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) {
        const v = 90 + rnd() * 165;
        g.strokeStyle = `rgba(${v},${v * 0.97},${v * 0.9},0.7)`; g.lineWidth = 0.7 + rnd() * 1.4;
        const x = rnd() * w, y = rnd() * h, l = 14 + rnd() * 30;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 5 - 2.5, y + l); g.stroke();
      }
    }, { repeat: true }),
    // reptile scales: keeled plates with dark seams
    scales: voronoi(256, 90, 41, (a, b, edge, c) => {
      const m = sm(0.02, 0.14, edge), k = 1 - Math.min(1, c * 1.1);
      const t = (150 + a * 60 + k * 45) * m + 40 * (1 - m);
      return [t, t, t];
    }),
    // date palm trunk: overlapping diamond leaf bases
    palmBark: canvasTexture(128, 128, (g, w, h) => {
      const rnd = mulberry32(3);
      g.fillStyle = '#5a4a3a'; g.fillRect(0, 0, w, h);
      for (let row = -1; row < 9; row++) for (let col = -1; col < 5; col++) {
        const x = col * 32 + (row % 2 ? 16 : 0), y = row * 16;
        const v = 120 + rnd() * 80;
        const gr = g.createLinearGradient(0, y, 0, y + 26);
        gr.addColorStop(0, `rgb(${v + 40},${v + 22},${v - 10})`); gr.addColorStop(1, `rgb(${v - 50},${v - 60},${v - 78})`);
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 17, y + 12); g.lineTo(x, y + 27); g.lineTo(x - 17, y + 12); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(30,20,12,0.8)'; g.lineWidth = 1.5; g.stroke();
      }
    }, { repeat: true }),
    // furrowed bark
    bark: canvasTexture(128, 256, (g, w, h) => {
      const rnd = mulberry32(13);
      g.fillStyle = '#a79c8e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) {
        const v = 60 + rnd() * 150;
        g.strokeStyle = `rgba(${v},${v * 0.93},${v * 0.84},0.6)`; g.lineWidth = 0.8 + rnd() * 2.6;
        const x = rnd() * w, y = rnd() * h, l = 20 + rnd() * 70;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rnd() * 10 - 5, y + l * 0.3, x + rnd() * 10 - 5, y + l * 0.7, x + rnd() * 6 - 3, y + l); g.stroke();
      }
      speckle(g, w, h, rnd, 60, 140, 200, 6);
    }, { repeat: true }),
  };
  return detail;
}
