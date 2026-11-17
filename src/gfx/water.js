// Water surface: refraction of the already-rendered scene with depth-based
// absorption (that is what makes a sandy lagoon turquoise), sky reflection
// with Fresnel, sun glitter, shore foam, and a proper underside with Snell's
// window when the camera is below the surface.

import * as THREE from 'three';
import { U, GLSL_NOISE, GLSL_WAVES, LAYER_FX, FOG_AIR, FOG_WATER } from './shared.js';
import { POOLS } from '../sim/mapdata.js';

const VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uCenter;
uniform float uIsPool;
varying vec3 vWorld;
varying float vViewZ;
${GLSL_WAVES}
void main(){
  vec3 p = position;
  vec4 wp;
  if (uIsPool > 0.5) {
    wp = modelMatrix * vec4(p, 1.0);
  } else {
    wp = vec4(p.x + uCenter.x, 0.0, p.z + uCenter.y, 1.0);
    wp.y = waveHeight(wp.xz, uTime);
  }
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform samplerCube tSky;
uniform vec2 uRes;
uniform float uNear, uFar, uTime, uIsPool;
uniform vec3 uSunDir, uSunColor;
uniform vec3 uAbsorb, uScatter;
uniform vec3 uFogAir, uFogWater;
uniform float uFogAirD, uFogWaterD;
varying vec3 vWorld;
varying float vViewZ;
${GLSL_NOISE}
${GLSL_WAVES}

// same zone shape as flatMask() in the simulation
float murkMask(vec2 p){
  float d = p.y - (7.0*sin(p.x/110.0 + 0.4) + 3.0*sin(p.x/43.0 + 1.7));
  float outer = 1.0 - smoothstep(232.0, 241.0, d);
  float mainF = smoothstep(102.0, 116.0, d)*outer;
  float sideF = smoothstep(240.0, 278.0, abs(p.x))*smoothstep(14.0, 30.0, d)*outer;
  return max(mainF, sideF);
}

float linZ(float d){ float z = d*2.0 - 1.0; return 2.0*uNear*uFar/(uFar + uNear - z*(uFar - uNear)); }

float ripple(vec2 p, float t){
  return vnoise(p*0.9 + vec2(t*0.35, t*0.22)) + 0.5*vnoise(p*2.3 - vec2(t*0.5, -t*0.3)) + 0.25*vnoise(p*5.1 + vec2(-t*0.6, t*0.7));
}

vec3 surfaceNormal(vec2 p, float dist){
  vec2 g = (uIsPool > 0.5) ? vec2(0.0) : waveGrad(p, uTime) * (1.0 - smoothstep(60.0, 380.0, dist));
  float e = 0.12;
  float r0 = ripple(p, uTime), rx = ripple(p + vec2(e, 0.0), uTime), rz = ripple(p + vec2(0.0, e), uTime);
  float k = (uIsPool > 0.5 ? 0.05 : 0.085) / (1.0 + dist*0.03);
  g += vec2(rx - r0, rz - r0)/e * k;
  return normalize(vec3(-g.x, 1.0, -g.y));
}

void main(){
  vec3 toFrag = vWorld - cameraPosition;
  float dist = length(toFrag);
  vec3 V = toFrag/dist;
  vec3 N = surfaceNormal(vWorld.xz, dist);
  vec2 suv = gl_FragCoord.xy/uRes;
  vec3 col;

  if (gl_FrontFacing) {
    float sceneZ = linZ(texture2D(tDepth, suv).x);
    float thick = max(sceneZ - vViewZ, 0.0);
    vec2 off = N.xz * 0.05 * clamp(thick*0.7, 0.0, 1.0) / (1.0 + dist*0.04);
    float sceneZ2 = linZ(texture2D(tDepth, suv + off).x);
    if (sceneZ2 < vViewZ) { off = vec2(0.0); sceneZ2 = sceneZ; }
    float thick2 = max(sceneZ2 - vViewZ, 0.0);
    vec3 refr = texture2D(tScene, suv + off).rgb;
    float path = min(thick2 * dist / max(vViewZ, 0.001), 400.0);
    float vdepth = path * max(-V.y, 0.0);
    float murk = (uIsPool > 0.5) ? 0.0 : murkMask(vWorld.xz);
    vec3 trans = exp(-path * mix(uAbsorb, vec3(0.75, 0.42, 0.62), murk));
    vec3 body = refr*trans + mix(uScatter * (1.0 - exp(-path*0.09)), vec3(0.075, 0.1, 0.035) * (1.0 - exp(-path*0.55)), murk);

    // reflection
    float cosT = max(dot(-V, N), 0.0);
    float F = 0.02 + 0.98*pow(1.0 - cosT, 5.0);
    // far away the sea is rough at sub-pixel scale: it mirrors higher, bluer sky and less of it
    float far = smoothstep(40.0, 600.0, dist);
    F *= mix(1.0, 0.6, far);
    vec3 R = reflect(V, N); R.y = abs(R.y) + 0.02 + 0.22*far;
    vec3 sky = textureCube(tSky, normalize(R)).rgb;
    float sd = max(dot(normalize(R), uSunDir), 0.0);
    float spec = pow(sd, 900.0)*45.0 + pow(sd, 90.0)*0.45;
    col = mix(body, sky, F) + uSunColor*spec;

    // foam where the water gets very thin
    if (uIsPool < 0.5) {
      float fn = vnoise(vWorld.xz*1.7 + uTime*0.12);
      float shore = 1.0 - smoothstep(0.0, 0.2, vdepth + (fn - 0.5)*0.12);
      float lap = 0.5 + 0.5*sin(vdepth*30.0 - uTime*1.7 + fn*5.0);
      float foam = shore*(0.4 + 0.6*lap)*smoothstep(0.35, 0.6, fn + shore*0.5);
      // breaking crests out on the reef
      float crest = smoothstep(0.55, 1.0, waveHeight(vWorld.xz, uTime)/max(waveAmp(vWorld.z), 0.001))
                    * smoothstep(0.12, 0.3, waveAmp(vWorld.z)) * smoothstep(0.5, 0.8, vnoise(vWorld.xz*0.8 + uTime*0.3));
      col = mix(col, vec3(1.0), clamp(foam*0.8 + crest*0.6, 0.0, 1.0));
    }
    float f = 1.0 - exp(-uFogAirD*uFogAirD*dist*dist);
    col = mix(col, uFogAir, f);
  } else {
    // seen from below
    vec3 Nd = -N;
    vec3 T = refract(V, Nd, 1.333);
    vec3 deep = uFogWater*1.25;
    if (dot(T, T) < 0.001) {
      // total internal reflection: the surface mirrors the water below
      col = deep*(0.75 + 0.5*N.x);
    } else {
      vec3 sky = textureCube(tSky, normalize(T)).rgb;
      float sd = max(dot(normalize(T), uSunDir), 0.0);
      float sun = pow(sd, 260.0)*30.0 + pow(sd, 18.0)*0.7;
      vec3 through = sky*vec3(0.75, 1.0, 1.0)*1.1 + uSunColor*sun;
      float cosT = max(dot(-V, Nd), 0.0);
      float F = 0.02 + 0.98*pow(1.0 - cosT, 5.0);
      col = mix(through, deep, clamp(F*1.4, 0.0, 1.0));
    }
    float f = 1.0 - exp(-uFogWaterD*uFogWaterD*dist*dist);
    col = mix(col, uFogWater, f);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function makeUniforms(pipeline, sky, pool) {
  return {
    uTime: U.uTime,
    uSunDir: U.uSunDir,
    uSunColor: U.uSunColor,
    uCenter: { value: new THREE.Vector2() },
    uIsPool: { value: pool ? 1 : 0 },
    tScene: pipeline.uScene,
    tDepth: pipeline.uDepth,
    tSky: { value: sky.cubeTexture },
    uRes: pipeline.uRes,
    uNear: pipeline.uNear,
    uFar: pipeline.uFar,
    uAbsorb: { value: pool ? new THREE.Vector3(0.22, 0.05, 0.03) : new THREE.Vector3(0.3, 0.052, 0.036) },
    uScatter: { value: pool ? new THREE.Vector3(0.02, 0.3, 0.42) : new THREE.Vector3(0.0, 0.17, 0.34) },
    uFogAir: { value: FOG_AIR.color },
    uFogWater: { value: FOG_WATER.color },
    uFogAirD: { value: FOG_AIR.density },
    uFogWaterD: { value: FOG_WATER.density },
  };
}

export function createWater(pipeline, sky, quality) {
  const group = new THREE.Group();
  const seg = quality === 'low' ? 128 : quality === 'high' ? 256 : 192;
  const geo = new THREE.PlaneGeometry(2, 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i);
    const wx = x * 110 + Math.sign(x) * Math.pow(Math.abs(x), 6) * 6000;
    const wz = z * 110 + Math.sign(z) * Math.pow(Math.abs(z), 6) * 6000;
    pa.setXYZ(i, wx, 0, wz);
  }
  const seaMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: makeUniforms(pipeline, sky, false),
    side: THREE.DoubleSide,
  });
  const sea = new THREE.Mesh(geo, seaMat);
  sea.frustumCulled = false;
  sea.layers.set(LAYER_FX);
  sea.renderOrder = 0;
  group.add(sea);

  const poolMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: makeUniforms(pipeline, sky, true),
    side: THREE.DoubleSide,
  });
  for (const p of POOLS) {
    const g = new THREE.CircleGeometry(1, 48);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, poolMat);
    m.scale.set(p.rx, 1, p.rz);
    m.position.set(p.x, p.level, p.z);
    m.layers.set(LAYER_FX);
    group.add(m);
  }

  group.update = (camera) => {
    const snap = 4;
    seaMat.uniforms.uCenter.value.set(Math.round(camera.position.x / snap) * snap, Math.round(camera.position.z / snap) * snap);
  };
  return group;
}
