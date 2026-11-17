// Dream pearls: an open clam with a glowing pearl and a soft beacon of light
// so they can be spotted from a distance.

import * as THREE from 'three';
import { LAYER_FX, U, patchMaterial } from './shared.js';

export function createPearls(scene, pearls) {
  const shellMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xe9d9c4, roughness: 0.4, side: THREE.DoubleSide }), { key: 'clam' });
  const pearlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfe9ff, emissiveIntensity: 2.2, roughness: 0.15 });
  const half = new THREE.SphereGeometry(0.34, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  half.scale(1, 0.45, 0.85);
  const pearlG = new THREE.SphereGeometry(0.13, 16, 12);

  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uColor: { value: new THREE.Color(0.55, 0.9, 1.0) } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
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

  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(170,230,255,0.55)'); gr.addColorStop(1, 'rgba(120,200,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff });

  const items = pearls.map((p) => {
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    const lower = new THREE.Mesh(half, shellMat);
    lower.rotation.x = Math.PI;
    const upperPivot = new THREE.Group();
    upperPivot.position.set(0, 0, -0.28);
    const upper = new THREE.Mesh(half, shellMat);
    upper.position.set(0, 0, 0.28);
    upperPivot.add(upper);
    upperPivot.rotation.x = -0.95;
    const pearl = new THREE.Mesh(pearlG, pearlMat);
    pearl.position.y = 0.06;
    g.add(lower, upperPivot, pearl);
    const beam = new THREE.Mesh(beamG, beamMat);
    beam.layers.set(LAYER_FX);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.7);
    glow.position.y = 0.1;
    glow.layers.set(LAYER_FX);
    g.add(beam, glow);
    scene.add(g);
    return { g, pearl, glow, beam, base: p.y, data: p, fade: 1 };
  });

  return {
    update(t, dt) {
      for (const it of items) {
        if (it.data.taken) {
          if (it.fade > 0) {
            it.fade = Math.max(0, it.fade - dt * 2.5);
            it.g.scale.setScalar(Math.max(0.001, it.fade));
            it.g.position.y = it.base + (1 - it.fade) * 1.2;
            if (it.fade === 0) it.g.visible = false;
          }
          continue;
        }
        if (!it.g.visible) { it.g.visible = true; it.fade = 1; it.g.scale.setScalar(1); }
        it.g.position.y = it.base + Math.sin(t * 1.3 + it.data.index) * 0.07;
        it.g.rotation.y = t * 0.4 + it.data.index;
        it.glow.scale.setScalar(1.6 + 0.3 * Math.sin(t * 3 + it.data.index));
      }
    },
  };
}
