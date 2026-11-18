// Frame pipeline:
//   1. opaque scene (layer 0)            -> HDR target with a depth texture
//   2. copy colour + depth, then draw water and effects (layer 1) on top;
//      the water shader reads target 1 for refraction and depth
//   3. bloom
//   4. final pass: underwater light shafts, grading, tone mapping, sRGB

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { U, LAYER_MAIN, LAYER_FX, FOG_WATER } from './shared.js';

const COPY = {
  uniforms: { tColor: { value: null }, tDepthIn: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */ `
uniform sampler2D tColor; uniform sampler2D tDepthIn; varying vec2 vUv;
void main(){ gl_FragColor = texture2D(tColor, vUv); gl_FragDepth = texture2D(tDepthIn, vUv).x; }`,
};

const FINAL = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null },
    uUnder: { value: 0 }, uTime: U.uTime, uDanger: { value: 0 }, uHurt: { value: 0 }, uSpeed: { value: 0 }, uPoison: { value: 0 },
    uExposure: { value: 0.66 }, uFade: { value: 1 }, uRays: { value: 1 },
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() }, uSunDir: U.uSunDir,
    uNear: { value: 0.1 }, uFar: { value: 1000 }, uWaterY: { value: 0 },
    uFogWater: { value: FOG_WATER.color },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse; uniform sampler2D tDepth;
uniform float uUnder, uTime, uDanger, uHurt, uSpeed, uPoison, uExposure, uFade, uRays, uNear, uFar, uWaterY;
uniform mat4 uInvProj, uCamWorld; uniform vec3 uCamPos, uSunDir, uFogWater;
varying vec2 vUv;

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float linZ(float d){ float z = d*2.0 - 1.0; return 2.0*uNear*uFar/(uFar + uNear - z*(uFar - uNear)); }
float shaftPattern(vec2 p, float t){
  float a = sin(p.x*0.9 + t*0.7 + sin(p.y*0.6 - t*0.4)*1.6);
  float b = sin(p.y*1.1 - t*0.5 + sin(p.x*0.7 + t*0.3)*1.4);
  return pow(max(a*b*0.5 + 0.5, 0.0), 3.0);
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }

void main(){
  vec2 uv = vUv;
  if (uUnder > 0.5) uv += vec2(sin(uv.y*23.0 + uTime*1.7), cos(uv.x*19.0 + uTime*1.3))*0.0016;
  // venom: the picture swims
  uv += vec2(sin(uv.y*9.0 + uTime*2.3), cos(uv.x*7.0 + uTime*1.9))*0.006*uPoison;
  vec3 col = texture2D(tDiffuse, uv).rgb;

  if (uUnder > 0.5) {
    if (uRays > 0.5) {
      vec4 pv = uInvProj * vec4(uv*2.0 - 1.0, 1.0, 1.0);
      vec3 dv = normalize(pv.xyz/pv.w);
      vec3 dir = normalize((uCamWorld * vec4(dv, 0.0)).xyz);
      float sceneD = linZ(texture2D(tDepth, uv).x) / max(-dv.z, 0.05);
      float maxT = min(sceneD, 24.0);
      if (dir.y > 0.001) maxT = min(maxT, (uWaterY - uCamPos.y)/dir.y);
      float jit = hash(gl_FragCoord.xy + fract(uTime)*37.0);
      float acc = 0.0;
      for (int i = 0; i < 7; i++) {
        float t = maxT*(float(i) + jit)/7.0;
        vec3 p = uCamPos + dir*t;
        float below = max(uWaterY - p.y, 0.0);
        vec2 sp = p.xz - uSunDir.xz/uSunDir.y*below;
        acc += shaftPattern(sp*0.55, uTime) * exp(-below*0.16) * exp(-t*0.07);
      }
      float toSun = pow(max(dot(dir, uSunDir), 0.0), 2.0);
      col += vec3(0.55, 0.9, 0.8) * acc/7.0 * maxT * (0.03 + 0.09*toSun);
    }
    col *= vec3(0.86, 1.0, 1.06);
  }

  // speed streaks towards the edges when flying
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  if (uSpeed > 0.01) {
    float ang = atan(c.y, c.x);
    float streak = pow(max(sin(ang*46.0 + hash(vec2(floor(ang*14.0), 1.0))*6.283 + uTime*9.0), 0.0), 14.0);
    col += vec3(0.9, 0.97, 1.0) * streak * smoothstep(0.1, 0.5, r2) * uSpeed * 0.35;
  }

  col *= uExposure;
  col = aces(col);
  // a little extra colour and contrast
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.22);
  col = clamp(mix(col, col*col*(3.0 - 2.0*col), 0.3), 0.0, 1.0);
  col *= 1.0 - r2*(0.55 + 0.5*uUnder);
  // danger pulse and bite flash
  float edge = smoothstep(0.08, 0.5, r2);
  col = mix(col, vec3(0.6, 0.02, 0.0), edge*uDanger*(0.3 + 0.12*sin(uTime*7.0)));
  col = mix(col, vec3(0.75, 0.0, 0.0), uHurt*(0.25 + 0.6*edge));
  col = mix(col, col*vec3(0.75, 1.1, 0.6) + vec3(0.0, 0.05, 0.0), uPoison*(0.25 + 0.5*edge));
  col = pow(col, vec3(1.0/2.2));
  col *= uFade;
  col += (hash(gl_FragCoord.xy + uTime) - 0.5)/255.0;
  gl_FragColor = vec4(col, 1.0);
}`,
};

class WorldPass extends Pass {
  constructor(pl) { super(); this.pl = pl; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    const { scene, camera, sceneRT, copyQuad } = this.pl;
    const oldAuto = renderer.autoClear;
    renderer.autoClear = true;
    camera.layers.set(LAYER_MAIN);
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);

    renderer.setRenderTarget(readBuffer);
    renderer.clear();
    copyQuad.render(renderer);
    renderer.autoClear = false;
    camera.layers.set(LAYER_FX);
    const sh = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.render(scene, camera);
    renderer.shadowMap.autoUpdate = sh;
    camera.layers.set(LAYER_MAIN);
    renderer.autoClear = oldAuto;
  }
}

export function createPipeline(renderer, scene, camera, quality) {
  const pl = {
    scene, camera, quality,
    uScene: { value: null }, uDepth: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNear: { value: camera.near }, uFar: { value: camera.far },
  };
  const samples = quality === 'low' ? 0 : 4;
  const depthTex = new THREE.DepthTexture(4, 4);
  depthTex.type = THREE.UnsignedIntType;
  pl.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples, depthTexture: depthTex });
  pl.uScene.value = pl.sceneRT.texture;
  pl.uDepth.value = depthTex;

  const copyMat = new THREE.ShaderMaterial({ ...COPY, uniforms: THREE.UniformsUtils.clone(COPY.uniforms), depthFunc: THREE.AlwaysDepth, depthWrite: true, depthTest: true });
  copyMat.uniforms.tColor.value = pl.sceneRT.texture;
  copyMat.uniforms.tDepthIn.value = depthTex;
  pl.copyQuad = new FullScreenQuad(copyMat);

  const compRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
  const composer = new EffectComposer(renderer, compRT);
  composer.addPass(new WorldPass(pl));
  let bloom = null;
  if (quality !== 'low') {
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 2.2);
    composer.addPass(bloom);
  }
  const finalMat = new THREE.ShaderMaterial({ ...FINAL, uniforms: FINAL.uniforms, depthTest: false, depthWrite: false });
  const final = new ShaderPass(finalMat, 'tDiffuse');
  final.uniforms.tDepth.value = depthTex;
  final.uniforms.uRays.value = quality === 'low' ? 0 : 1;
  composer.addPass(final);
  pl.final = final.uniforms;
  pl.composer = composer;

  pl.setSize = (w, h, pixelRatio) => {
    const pw = Math.max(2, Math.floor(w * pixelRatio)), ph = Math.max(2, Math.floor(h * pixelRatio));
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    pl.sceneRT.setSize(pw, ph);
    pl.uRes.value.set(pw, ph);
  };

  pl.render = (dt) => {
    const f = pl.final;
    f.uInvProj.value.copy(camera.projectionMatrixInverse);
    f.uCamWorld.value.copy(camera.matrixWorld);
    f.uCamPos.value.copy(camera.position);
    f.uNear.value = camera.near; f.uFar.value = camera.far;
    composer.render(dt);
  };
  return pl;
}
