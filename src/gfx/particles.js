// Splash droplets (analytic ballistic motion in the vertex shader, so they
// look the same at any frame rate) and drifting plankton motes under water.

import * as THREE from 'three';
import { LAYER_FX, U } from './shared.js';

const MAX = 900;

export function createParticles(scene) {
  const geo = new THREE.BufferGeometry();
  const origin = new Float32Array(MAX * 3), velocity = new Float32Array(MAX * 3), info = new Float32Array(MAX * 3);
  for (let i = 0; i < MAX; i++) info[i * 3] = -100;
  geo.setAttribute('position', new THREE.BufferAttribute(origin, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(velocity, 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 3)); // birth, life, size
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
uniform float uTime, uScale; attribute vec3 aVel; attribute vec3 aInfo; varying float vA;
void main(){
  float age = uTime - aInfo.x;
  float k = clamp(age/aInfo.y, 0.0, 1.0);
  vec3 p = position + aVel*age + vec3(0.0, -6.5*age*age, 0.0);
  vA = (age < 0.0 || age > aInfo.y) ? 0.0 : (1.0 - k*k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aInfo.z * uScale / max(-mv.z, 0.2) * (0.6 + 0.6*k);
}`,
    fragmentShader: /* glsl */ `
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
  if (vA <= 0.0 || d > 0.25) discard;
  float a = smoothstep(0.25, 0.02, d) * vA;
  gl_FragColor = vec4(vec3(2.2, 2.4, 2.5) * a, a * 0.75);
}`,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.layers.set(LAYER_FX);
  pts.renderOrder = 5;
  scene.add(pts);
  let head = 0;

  // plankton
  const N = 500, BOX = 16;
  const mg = new THREE.BufferGeometry();
  const mp = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) mp[i] = Math.random() * BOX;
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const mm = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uOn: { value: 0 }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
uniform float uTime, uScale; uniform vec3 uCam; varying float vA;
void main(){
  vec3 p = position + vec3(sin(uTime*0.3 + position.y)*0.3, uTime*0.05, cos(uTime*0.25 + position.x)*0.3);
  p = mod(p - uCam, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + uCam;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  vA = smoothstep(${(BOX / 2).toFixed(1)}, 3.0, d) * smoothstep(0.2, 1.0, d) * step(p.y, -0.05);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = 0.022 * uScale / max(d, 0.2);
}`,
    fragmentShader: /* glsl */ `
uniform float uOn; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
  gl_FragColor = vec4(vec3(0.8, 1.0, 0.95) * vA * uOn * smoothstep(0.25, 0.0, d) * 0.9, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(mg, mm);
  motes.frustumCulled = false;
  motes.layers.set(LAYER_FX);
  motes.renderOrder = 4;
  scene.add(motes);

  const emit = (x, y, z, vx, vy, vz, life, size) => {
    const i = head; head = (head + 1) % MAX;
    origin[i * 3] = x; origin[i * 3 + 1] = y; origin[i * 3 + 2] = z;
    velocity[i * 3] = vx; velocity[i * 3 + 1] = vy; velocity[i * 3 + 2] = vz;
    info[i * 3] = U.uTime.value; info[i * 3 + 1] = life; info[i * 3 + 2] = size;
  };
  return {
    // radial splash; `dir` biases it along the movement direction
    splash(x, y, z, power, dirX = 0, dirZ = 0) {
      const n = Math.min(70, Math.round(10 + power * 9));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, r = 0.4 + Math.random() * 1.6;
        const up = 1.2 + Math.random() * (1.5 + power * 0.55);
        emit(x + Math.cos(a) * 0.2, y + 0.03, z + Math.sin(a) * 0.2,
          Math.cos(a) * r * (0.6 + power * 0.14) + dirX * 0.45, up, Math.sin(a) * r * (0.6 + power * 0.14) + dirZ * 0.45,
          0.45 + Math.random() * 0.5, 0.05 + Math.random() * 0.09);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aVel.needsUpdate = true; geo.attributes.aInfo.needsUpdate = true;
    },
    update(camera, under, pixelH) {
      mm.uniforms.uCam.value.copy(camera.position);
      mm.uniforms.uOn.value = under ? 1 : 0;
      mat.uniforms.uScale.value = pixelH * 0.9;
      mm.uniforms.uScale.value = pixelH * 0.9;
      motes.visible = under;
    },
  };
}
