// Sky dome (art-directed gradient, sun glow and thin clouds), the sun light
// with a shadow frustum that follows the player, and an environment map
// baked once from the sky.

import * as THREE from 'three';
import { SUN_DIR, U, GLSL_NOISE } from './shared.js';

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform float uDisc;
varying vec3 vDir;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 zenith = vec3(0.07, 0.27, 0.78);
  vec3 mid = vec3(0.25, 0.55, 1.02);
  vec3 horizon = vec3(0.7, 0.9, 1.12);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, zenith, smoothstep(0.15, 0.95, h));
  // sun glow and disc
  float sd = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.85, 0.6) * (pow(sd, 6.0)*0.22 + pow(sd, 60.0)*0.5 + pow(sd, 700.0)*2.0);
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.99955, 0.9998, sd) * 70.0 * uDisc;
  // thin high clouds, denser towards the horizon
  if (d.y > 0.01) {
    vec2 p = d.xz / (d.y + 0.12);
    float c = fbm(p*0.9 + vec2(3.0, 1.0)) * 0.65 + fbm(p*2.6 - vec2(1.5, 4.0)) * 0.35;
    float cover = smoothstep(0.52, 0.78, c) * smoothstep(0.01, 0.16, d.y) * (1.0 - 0.55*smoothstep(0.3, 0.9, d.y));
    vec3 cloud = mix(vec3(0.95, 0.97, 1.05), vec3(1.25, 1.2, 1.1), pow(sd, 3.0));
    col = mix(col, cloud, cover*0.8);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function skyMaterial(disc) {
  return new THREE.ShaderMaterial({
    uniforms: { uSunDir: U.uSunDir, uDisc: { value: disc } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * viewMatrix * vec4(position*7000.0 + cameraPosition, 1.0); gl_Position = p.xyww; }',
    fragmentShader: SKY_FRAG,
    // drawn after the opaque scene at the far plane: the cloud shader only runs where nothing covers the sky
    side: THREE.BackSide, depthWrite: false, depthFunc: THREE.LessEqualDepth, fog: false,
  });
}

const SHADOW_R = 85;

export function createSky(renderer, scene, quality) {
  const geo = new THREE.SphereGeometry(1, 32, 16);
  const sky = new THREE.Mesh(geo, skyMaterial(1));
  sky.frustumCulled = false;
  sky.renderOrder = 10;
  scene.add(sky);

  // Bake the sky (without the sun disc: the directional light already is the
  // sun) into a cube map for water reflections and image-based lighting.
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(0.5, 10000, cubeRT);
  const bakeScene = new THREE.Scene();
  const bakeSky = new THREE.Mesh(geo, skyMaterial(0));
  bakeSky.frustumCulled = false;
  bakeScene.add(bakeSky);
  cubeCam.update(renderer, bakeScene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(cubeRT.texture).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.42;

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.93, 0.8), 3.3);
  sun.position.copy(SUN_DIR).multiplyScalar(200);
  scene.add(sun);
  scene.add(sun.target);
  const shadowSize = quality === 'low' ? 0 : quality === 'high' ? 4096 : 2048;
  if (shadowSize) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const c = sun.shadow.camera;
    c.left = -SHADOW_R; c.right = SHADOW_R; c.top = SHADOW_R; c.bottom = -SHADOW_R; c.near = 10; c.far = 420;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
  }
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.6, 0.8, 1.0), new THREE.Color(0.75, 0.66, 0.5), 0.28);
  scene.add(hemi);

  U.uSunColor.value.set(1.0, 0.93, 0.8);

  // The shadow camera looks down SUN_DIR with the default up vector, so these
  // are its x and y axes (same construction as Matrix4.lookAt).
  const LX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
  const LY = new THREE.Vector3().crossVectors(SUN_DIR, LX);
  const tmp = new THREE.Vector3();
  const view = { x: 0, y: 0, z: 0, ux: LX.x, uy: LX.y, uz: LX.z, vx: LY.x, vy: LY.y, vz: LY.z, R: SHADOW_R };
  return {
    mesh: sky, sun, hemi, cubeTexture: cubeRT.texture,
    shadowView: shadowSize ? view : null,
    // Keep the shadow frustum centred on the player. The centre is snapped to
    // whole shadow-map texels *in light space*: snapping world x/z instead
    // shifts the map by fractions of a texel and makes every shadow edge crawl.
    follow(x, y, z) {
      if (!shadowSize) return;
      const texel = (2 * SHADOW_R) / shadowSize;
      const u = Math.round((x * LX.x + z * LX.z) / texel) * texel;
      const v = Math.round((x * LY.x + z * LY.z) / texel) * texel;
      const w = x * SUN_DIR.x + z * SUN_DIR.z;
      tmp.set(0, 0, 0).addScaledVector(LX, u).addScaledVector(LY, v).addScaledVector(SUN_DIR, w);
      sun.target.position.copy(tmp);
      sun.position.copy(tmp).addScaledVector(SUN_DIR, 220);
      sun.target.updateMatrixWorld();
      view.x = tmp.x; view.y = tmp.y; view.z = tmp.z;
    },
  };
}
