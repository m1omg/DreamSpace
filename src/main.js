// DreamSpace - entry point.
//
// Timing model: requestAnimationFrame only decides *when* we draw. Game logic
// runs in fixed 1/120 s steps (see sim/game.js) and the picture is interpolated
// between the last two steps, so behaviour is identical at any refresh rate.

import * as THREE from 'three';
import { createGame, advance, STEP } from './sim/game.js';
import { waterLevelAt, shoreZ } from './sim/terrain.js';
import { eyeY, respawnPlayer } from './sim/player.js';
import { resetCroc } from './sim/croc.js';
import { U, FOG_AIR, FOG_WATER } from './gfx/shared.js';
import { createPipeline } from './gfx/pipeline.js';
import { createSky } from './gfx/sky.js';
import { createTerrain } from './gfx/terrainMesh.js';
import { createWater } from './gfx/water.js';
import { createResort } from './gfx/resort.js';
import { createPalms, createMangroves, createBushes, createSeagrass } from './gfx/vegetation.js';
import { createReef } from './gfx/reef.js';
import { createCrocModel } from './gfx/crocModel.js';
import { createPearls } from './gfx/pearls.js';
import { createParticles } from './gfx/particles.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('dreamspace.' + k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('dreamspace.' + k, v); } catch (e) { /* private mode */ } },
};

const coarse = matchMedia('(pointer: coarse)').matches;
const quality = params.get('q') || store.get('quality', coarse ? 'low' : 'medium');
$('quality').value = quality;
$('sens').value = store.get('sens', '1');

// ---- renderer & world -------------------------------------------------------------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = true;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_AIR.color.getHex(), FOG_AIR.density);
const camera = new THREE.PerspectiveCamera(74, 1, 0.15, 9000);
camera.rotation.order = 'YXZ';

const pipeline = createPipeline(renderer, scene, camera, quality);
const sky = createSky(renderer, scene, quality);
scene.add(createTerrain(quality));
const water = createWater(pipeline, sky, quality);
scene.add(water);
createResort(scene, quality);
createPalms(scene, quality);
createMangroves(scene, quality);
createBushes(scene, quality);
createSeagrass(scene, quality);
const reef = createReef(scene, quality);

let game = createGame();
const crocModels = game.crocs.map((c) => createCrocModel(scene, c));
const pearls = createPearls(scene, game.pearls);
const particles = createParticles(scene);
const hud = createHud();
const audio = createAudio();

// ---- resolution -----------------------------------------------------------------------
const maxRatio = quality === 'low' ? 1.3 : quality === 'high' ? 2 : 1.5;
let renderScale = 1;
function resize() {
  const pr = Math.min(devicePixelRatio || 1, maxRatio) * renderScale;
  pipeline.setSize(innerWidth, innerHeight, pr);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- input -------------------------------------------------------------------------------
let state = 'menu'; // menu | play | end
const input = createInput(canvas, {
  yaw: game.player.yaw,
  sensitivity: parseFloat($('sens').value),
  touchUI: { root: $('touch'), zone: $('tzone'), stick: $('stick'), knob: $('knob'), jump: $('tJump'), dive: $('tDive') },
  onLock(locked) { if (!locked && state === 'play') pause(); },
  onKey(code) {
    if (code === 'KeyM') hud.toast(audio.toggleMute() ? 'Zvuk vypnutý' : 'Zvuk zapnutý', 1.2);
    if (code === 'Enter' && state === 'menu' && !$('start').disabled) start();
  },
});
$('sens').addEventListener('input', (e) => { input.setSensitivity(parseFloat(e.target.value)); store.set('sens', e.target.value); });
$('quality').addEventListener('change', (e) => {
  store.set('quality', e.target.value);
  const u = new URL(location.href); u.searchParams.delete('q'); location.href = u.toString();
});

function setState(s) {
  state = s;
  $('menu').classList.toggle('on', s === 'menu');
  $('end').classList.toggle('on', s === 'end');
  hud.show(s === 'play');
  $('touch').classList.toggle('play', s === 'play');
}
function start() {
  audio.start();
  setState('play');
  input.lock();
  if (!started) {
    started = true;
    hud.toast('Si na pláži. More volá.', 3.5);
  }
  $('start').textContent = 'Pokračovať';
}
function pause() {
  $('story').textContent = 'Sen počká. Perly, ktoré máš, ti zostanú.';
  setState('menu');
}
let started = false;
$('start').addEventListener('click', start);
$('tPause').addEventListener('touchstart', (e) => { e.preventDefault(); pause(); }, { passive: false });
canvas.addEventListener('click', () => { if (state === 'play' && !input.locked) input.lock(); });
$('again').addEventListener('click', () => { setState('play'); input.lock(); });
$('restart').addEventListener('click', () => { newDream(); setState('play'); input.lock(); });

function newDream() {
  const fresh = createGame();
  // keep the same objects the models are bound to
  Object.assign(game.player, fresh.player);
  game.crocs.forEach(resetCroc);
  game.pearls.forEach((p) => { p.taken = false; });
  game.collected = 0; game.wakeups = 0; game.playTime = 0; game.won = false; game.allFound = false;
  game.events.length = 0;
  input.state.yaw = game.player.yaw; input.state.pitch = 0;
  hintStage = 0;
}

function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${s.toString().padStart(2, '0')}`; }
function showEnd() {
  const p = game.player;
  $('endTitle').textContent = 'Sen sa splnil';
  $('endText').textContent = 'Všetkých dvanásť perál je na pláži. Krokodíly ostali v mangrovoch.';
  $('stats').innerHTML = [
    ['Čas', fmtTime(game.playTime)],
    ['Najvyššia rýchlosť', p.maxSpeed.toFixed(1) + ' m/s'],
    ['Najdlhší let', p.bestFlight.toFixed(1) + ' m'],
    ['Najdlhšia séria hopov', '×' + p.bestCombo],
    ['Perfektné hopy', String(p.perfects)],
    ['Prebudenia', String(game.wakeups)],
  ].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
  input.unlock();
  setState('end');
}

// ---- contextual hints ----------------------------------------------------------------------
let hintStage = 0, hintT = 0;
function updateHints(dt) {
  const p = game.player;
  const d = p.z - shoreZ(p.x);
  hintT += dt;
  let h = '';
  if (game.allFound && !game.won) h = 'Máš všetky perly. Vráť sa na pláž!';
  else if (p.mode === 'swim' && d < 95) h = input.isTouch ? 'Pozri sa dole a plávaj dopredu = potápanie. ▼ potopiť, HOP vynoriť.' : 'W + pohľad dole = potápanie · C potopiť · Medzerník vynoriť · Shift rýchlejšie';
  else if (p.mode !== 'swim' && d > 100 && p.depth > 0.12 && Math.hypot(p.vx, p.vz) < 4) h = input.isTouch ? 'Tu sa nedá plávať. Drž HOP a hýb sa – naberieš rýchlosť.' : 'Tu sa nedá plávať. Drž W + Medzerník – bunnyhopom naberieš rýchlosť.';
  else if (p.mode === 'air' && p.combo >= 3 && p.combo < 9) h = 'Pusť a stlač skok tesne pred dopadom = perfektný hop. Pri rýchlosti drž skok = plachtenie.';
  else if (d < 0 && game.collected === 0 && hintT < 40) h = 'Perly svietia modrým lúčom. Prvé sú v lagúne pred tebou.';
  hud.hint(h);
  void hintStage;
}

// ---- sim events -> effects ---------------------------------------------------------------------
const fx = { hurt: 0, shake: 0, dip: 0, fovKick: 0 };
function handleEvents() {
  const ev = game.events, p = game.player;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    switch (e.type) {
      case 'hop':
        if (e.depth > 0.02) { particles.splash(e.x, waterLevelAt(e.x, e.z, game.time), e.z, 1.5 + e.speed * 0.25, p.vx * 0.4, p.vz * 0.4); audio.splash(1 + e.speed * 0.2); }
        else audio.step();
        if (e.kind === 'perfect') audio.hopPerfect(e.combo);
        if (e.combo >= 2) hud.combo(e.combo, e.kind);
        break;
      case 'land':
        fx.dip = Math.min(0.22, 0.05 + Math.abs(e.vy) * 0.016);
        if (e.depth > 0.02) { particles.splash(e.x, waterLevelAt(e.x, e.z, game.time), e.z, 1 + e.speed * 0.3 + Math.abs(e.vy) * 0.2, p.vx * 0.3, p.vz * 0.3); audio.splash(0.6 + e.speed * 0.15); }
        else audio.step();
        break;
      case 'plunge':
        particles.splash(e.x, waterLevelAt(e.x, e.z, game.time), e.z, 5 + e.speed * 0.3, p.vx * 0.3, p.vz * 0.3);
        audio.plunge();
        break;
      case 'pearl':
        audio.pearl();
        hud.toast(`Perla ${e.count} / ${game.pearls.length}`, 2.4, 'good');
        break;
      case 'allFound':
        hud.toast('Máš všetky perly! Vráť sa na pláž.', 5, 'good');
        break;
      case 'crocAlert': audio.alert(); if (e.dist < 40) hud.toast('Krokodíl si ťa všimol!', 1.8, 'bad'); break;
      case 'crocWindup': audio.alert(); break;
      case 'crocLunge': {
        audio.lunge();
        const c = game.crocs[e.croc];
        particles.splash(c.x, waterLevelAt(c.x, c.z, game.time), c.z, 6, Math.sin(c.yaw) * 4, Math.cos(c.yaw) * 4);
        break;
      }
      case 'crocMiss': audio.snap(); particles.splash(e.x, waterLevelAt(e.x, e.z, game.time), e.z, 4); break;
      case 'bite':
        audio.bite(); fx.hurt = 1; fx.shake = 1;
        hud.toast('Uhryzol ťa!', 1.6, 'bad');
        break;
      case 'wake':
        audio.wake(); fx.fade = 0;
        input.state.yaw = p.yaw; input.state.pitch = 0;
        hud.toast('Zobudil si sa… a zaspal znova. Perly ti ostali.', 4.5, 'bad');
        break;
      case 'win': audio.win(); showEnd(); break;
    }
  }
  ev.length = 0;
}
fx.fade = 0;

// ---- frame loop ------------------------------------------------------------------------------------
const cam = { x: 0, y: 0, z: 0, roll: 0, bob: 0, bobPhase: 0, fov: 74 };
let last = performance.now(), menuT = 0, frames = 0, fpsT = 0, slowT = 0, fastT = 0, uiTime = 0;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.25) dt = 0.25;
  uiTime += dt;

  if (state === 'play') {
    advance(game, dt, input.sample);
    handleEvents();
  } else {
    game.time += dt; // only the wave clock keeps running while paused
    game.alpha = 1;
  }
  const p = game.player, a = game.alpha, prev = game.prev;
  const time = game.time + (state === 'play' ? (a - 1) * STEP : 0);
  U.uTime.value = time;

  // interpolated eye position
  const ex = prev.px + (p.x - prev.px) * a, ey0 = prev.py + (eyeY(p) - prev.py) * a, ez = prev.pz + (p.z - prev.pz) * a;
  const speed = Math.hypot(p.vx, p.vz);

  if (state === 'menu' && !started) {
    menuT += dt;
    const ang = 0.35 * Math.sin(menuT * 0.07);
    camera.position.set(-30 + 60 * Math.sin(menuT * 0.05), 7.5 + Math.sin(menuT * 0.11), -34);
    camera.rotation.set(-0.16, Math.PI + ang, 0);
    cam.fov = 62;
  } else {
    // camera feel (all smoothing is exponential in real time => rate independent)
    const moving = p.mode === 'ground' && speed > 0.4;
    if (moving && state === 'play') cam.bobPhase += dt * (4.5 + speed * 1.1);
    cam.bob = damp(cam.bob, moving ? 1 : 0, 8, dt);
    fx.dip = damp(fx.dip, 0, 9, dt);
    fx.shake = damp(fx.shake, 0, 5, dt);
    const bobY = Math.sin(cam.bobPhase * 2) * 0.035 * cam.bob - fx.dip;
    const swimBob = p.mode === 'swim' && !p.underwater ? Math.sin(uiTime * 2.2) * 0.02 : 0;
    const sx = (Math.random() - 0.5) * fx.shake * 0.12, sy = (Math.random() - 0.5) * fx.shake * 0.12;
    camera.position.set(ex + sx, ey0 + bobY + swimBob + sy, ez);
    const strafe = (p.vx * Math.cos(p.yaw) - p.vz * Math.sin(p.yaw));
    cam.roll = damp(cam.roll, -strafe * 0.006 - (p.gliding > 0.3 ? strafe * 0.01 : 0), 6, dt);
    camera.rotation.set(input.state.pitch + Math.sin(cam.bobPhase) * 0.004 * cam.bob, input.state.yaw, cam.roll + (Math.random() - 0.5) * fx.shake * 0.03);
    cam.fov = damp(cam.fov, 74 + Math.min(22, Math.max(0, speed - 6) * 1.7), 5, dt);
  }
  if (dbg.freeCam) {
    const c = dbg.freeCam;
    camera.position.set(c.x, c.y, c.z); camera.rotation.set(c.pitch || 0, c.yaw || 0, 0); cam.fov = c.fov || 74;
  }
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();

  // above or below the surface?
  const surf = waterLevelAt(camera.position.x, camera.position.z, time);
  const under = camera.position.y < surf;
  scene.fog.color.copy(under ? FOG_WATER.color : FOG_AIR.color);
  scene.fog.density = under ? FOG_WATER.density : FOG_AIR.density;
  const f = pipeline.final;
  f.uUnder.value = under ? 1 : 0;
  f.uWaterY.value = surf;
  fx.hurt = damp(fx.hurt, 0, 2.2, dt);
  fx.fade = damp(fx.fade, 1, 1.6, dt);
  f.uHurt.value = fx.hurt;
  f.uDanger.value = state === 'play' ? game.danger : 0;
  f.uFade.value = fx.fade;
  f.uSpeed.value = damp(f.uSpeed.value, p.mode === 'air' ? Math.min(1, Math.max(0, speed - 9) / 8) : 0, 6, dt);

  sky.follow(camera.position.x, 0, camera.position.z);
  water.update(camera);
  reef.update(time);
  pearls.update(time, dt);
  for (let i = 0; i < crocModels.length; i++) {
    const c = game.crocs[i], pc = prev.crocs[i];
    let dy = c.yaw - pc.yaw;
    if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
    crocModels[i].update(pc.x + (c.x - pc.x) * a, pc.z + (c.z - pc.z) * a, pc.yaw + dy * a, dt, time);
  }
  particles.update(camera, under, pipeline.uRes.value.y);

  if (state === 'play') {
    hud.update(dt, game);
    updateHints(dt);
    audio.update(dt, { under, speed, air: p.mode === 'air', danger: game.danger, seaside: Math.max(0, 1 - Math.abs(p.z - shoreZ(p.x)) / 60) });
  }

  pipeline.render(dt);

  // adaptive resolution: only the picture gets cheaper, never the simulation
  frames++; fpsT += dt;
  if (fpsT >= 1) {
    const fps = frames / fpsT; frames = 0; fpsT = 0;
    window.__fps = fps;
    if (fps < 42) { slowT++; fastT = 0; } else if (fps > 57) { fastT++; slowT = 0; } else { slowT = 0; fastT = 0; }
    if (slowT >= 3 && renderScale > 0.55) { renderScale = Math.max(0.55, renderScale * 0.85); slowT = 0; resize(); }
    if (fastT >= 8 && renderScale < 1) { renderScale = Math.min(1, renderScale / 0.9); fastT = 0; resize(); }
  }
  window.__frames = (window.__frames || 0) + 1;
}

// expose a little for automated checks
const dbg = { get game() { return game; }, camera, scene, renderer, pipeline, sky, input, start, setState, respawnPlayer, freeCam: null };
window.__dbg = dbg;

// compile shaders up front so the first seconds of play do not stutter
$('start').disabled = true;
requestAnimationFrame((t) => {
  last = t;
  try { renderer.compile(scene, camera); } catch (e) { /* not fatal */ }
  $('start').disabled = false;
  $('loadMsg').textContent = input.isTouch ? 'Dotyk: ľavý palec pohyb, pravý rozhľad, HOP skok.' : 'Klikni na „Zaspať“ – myš sa uzamkne do hry. Esc ju uvoľní.';
  if (params.get('autostart')) { started = true; setState('play'); }
  requestAnimationFrame(frame);
});
