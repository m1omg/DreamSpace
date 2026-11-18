// Pearls: an open clam with a glowing pearl and a soft beacon of light so
// they can be spotted from a distance. All pearls share four draw calls
// (shells, pearls, beams, glows) instead of five objects each.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_FX, U, patchMaterial } from './shared.js';

export function createPearls(scene, pearls) {
  const n = pearls.length;
  const shellMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xe9d9c4, roughness: 0.4, side: THREE.DoubleSide }), { key: 'clam' });
  const pearlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfe9ff, emissiveIntensity: 2.2, roughness: 0.15 });

  // the two halves of the clam, the upper one hinged open at the back
  const half = new THREE.SphereGeometry(0.34, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  half.scale(1, 0.45, 0.85);
  const lower = half.clone().rotateX(Math.PI);
  const upper = half.clone().translate(0, 0, 0.28).rotateX(-0.95).translate(0, 0, -0.28);
  const shellG = mergeGeometries([lower, upper]);
  const pearlG = new THREE.SphereGeometry(0.13, 16, 12).translate(0, 0.06, 0);

  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uColor: { value: new THREE.Color(0.55, 0.9, 1.0) } },
    vertexShader: /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vec4 p = vec4(position, 1.0);
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    nrm = mat3(instanceMatrix) * nrm;
  #endif
  vec4 mv = modelViewMatrix * p;
  vN = normalize(normalMatrix * nrm); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float a = rim * (1.0 - vUv.y) * (1.0 - vUv.y) * (0.75 + 0.25*sin(uTime*2.0 + vUv.y*9.0));
  gl_FragColor = vec4(uColor * a * 0.7, 1.0);
}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beamG = new THREE.CylinderGeometry(0.9, 0.18, 16, 14, 1, true);
  beamG.translate(0, 8, 0);

  const mk = (g, m, fx) => {
    const im = new THREE.InstancedMesh(g, m, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    if (fx) im.layers.set(LAYER_FX);
    scene.add(im);
    return im;
  };
  const shells = mk(shellG, shellMat, false), pearlMesh = mk(pearlG, pearlMat, false), beams = mk(beamG, beamMat, true);

  // soft glows: one point sprite per pearl
  const gp = new Float32Array(n * 3), gs = new Float32Array(n);
  const glowG = new THREE.BufferGeometry();
  glowG.setAttribute('position', new THREE.BufferAttribute(gp, 3).setUsage(THREE.DynamicDrawUsage));
  glowG.setAttribute('aSize', new THREE.BufferAttribute(gs, 1).setUsage(THREE.DynamicDrawUsage));
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: /* glsl */ `
uniform float uScale; attribute float aSize;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.3);
}`,
    fragmentShader: /* glsl */ `
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  // the old sprite gradient: white core, pale blue halo
  vec3 c = mix(vec3(1.0), vec3(0.67, 0.9, 1.0), smoothstep(0.0, 0.25, r));
  float a = mix(1.0, 0.55, smoothstep(0.0, 0.25, r)) * (1.0 - smoothstep(0.25, 1.0, r));
  gl_FragColor = vec4(c * a, 1.0);
}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glows = new THREE.Points(glowG, glowMat);
  glows.frustumCulled = false;
  glows.layers.set(LAYER_FX);
  scene.add(glows);

  const fade = new Float32Array(n).fill(1);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

  return {
    // pixelsPerMetre: how many pixels one metre covers at a distance of one metre
    update(t, dt, pixelsPerMetre) {
      glowMat.uniforms.uScale.value = pixelsPerMetre;
      for (let i = 0; i < n; i++) {
        const d = pearls[i];
        let y, s, rot;
        if (d.taken) {
          // rise and shrink away once collected
          fade[i] = Math.max(0, fade[i] - dt * 2.5);
          y = d.y + (1 - fade[i]) * 1.2; s = Math.max(1e-4, fade[i]); rot = t * 0.4 + d.index;
        } else {
          fade[i] = 1;
          y = d.y + Math.sin(t * 1.3 + d.index) * 0.07; s = 1; rot = t * 0.4 + d.index;
        }
        if (fade[i] <= 0) s = 0;
        M.compose(P.set(d.x, y, d.z), Q.setFromAxisAngle(Y, rot), S.setScalar(s));
        shells.setMatrixAt(i, M); pearlMesh.setMatrixAt(i, M); beams.setMatrixAt(i, M);
        gp[i * 3] = d.x; gp[i * 3 + 1] = y + 0.1 * s; gp[i * 3 + 2] = d.z;
        gs[i] = s * (1.6 + 0.3 * Math.sin(t * 3 + d.index));
      }
      shells.instanceMatrix.needsUpdate = true; pearlMesh.instanceMatrix.needsUpdate = true; beams.instanceMatrix.needsUpdate = true;
      glowG.attributes.position.needsUpdate = true; glowG.attributes.aSize.needsUpdate = true;
    },
  };
}
