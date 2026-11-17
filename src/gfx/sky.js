// Sky dome, sun light with a shadow frustum that follows the player, and an
// environment map baked once from the sky.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SUN_DIR, U } from './shared.js';

export function createSky(renderer, scene, quality) {
  const sky = new Sky();
  sky.scale.setScalar(8000);
  const su = sky.material.uniforms;
  su.turbidity.value = 0.9;
  su.rayleigh.value = 2.1;
  su.mieCoefficient.value = 0.002;
  su.mieDirectionalG.value = 0.82;
  su.sunPosition.value.copy(SUN_DIR);
  // slightly deeper, more saturated blue than the raw analytic sky
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( retColor, 1.0 );',
    'gl_FragColor = vec4( pow( retColor, vec3( 2.1, 1.45, 1.0 ) ) * vec3( 0.9, 1.0, 1.08 ), 1.0 );');
  sky.material.fog = false;
  sky.frustumCulled = false;
  scene.add(sky);

  // Bake the sky into a cube map: used for water reflections and as the
  // image-based light for every standard material.
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(1, 10000, cubeRT);
  const bakeScene = new THREE.Scene();
  const bakeSky = new Sky();
  bakeSky.scale.setScalar(8000);
  // the bake leaves out the sun disc: the directional light already is the sun
  bakeSky.material = sky.material.clone();
  bakeSky.material.fragmentShader = sky.material.fragmentShader.replace('19000.0', '0.0');
  for (const k in su) bakeSky.material.uniforms[k].value = su[k].value;
  bakeScene.add(bakeSky);
  cubeCam.update(renderer, bakeScene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(cubeRT.texture).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.32;

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.93, 0.8), 3.3);
  sun.position.copy(SUN_DIR).multiplyScalar(200);
  scene.add(sun);
  scene.add(sun.target);
  const shadowSize = quality === 'low' ? 0 : quality === 'high' ? 4096 : 2048;
  if (shadowSize) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const c = sun.shadow.camera;
    const R = 85;
    c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 10; c.far = 420;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
  }
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.6, 0.8, 1.0), new THREE.Color(0.75, 0.66, 0.5), 0.28);
  scene.add(hemi);

  U.uSunColor.value.set(1.0, 0.93, 0.8);

  const tmp = new THREE.Vector3();
  return {
    mesh: sky, sun, hemi, cubeTexture: cubeRT.texture,
    // keep the shadow frustum centred on the player, snapped to shadow texels
    follow(x, y, z) {
      if (!shadowSize) return;
      const texel = 170 / shadowSize * 2;
      tmp.set(Math.round(x / texel) * texel, 0, Math.round(z / texel) * texel);
      sun.target.position.copy(tmp);
      sun.position.copy(tmp).addScaledVector(SUN_DIR, 220);
      sun.target.updateMatrixWorld();
    },
  };
}
