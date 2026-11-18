// DreamSpace - entry point.
//
// Timing model: requestAnimationFrame only decides *when* we draw. Game logic
// runs in fixed 1/120 s steps (see sim/game.js) and the picture is interpolated
// between the last two steps, so behaviour is identical at any refresh rate.
//
// Story: the game first presents itself as an ordinary Red Sea holiday. That
// it is all a dream is revealed the first time the player "dies" (they wake
// up) or, failing that, on the final screen.

import * as THREE from 'three';
import { t, onLangChange } from './i18n.js';
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
import { createCrocs } from './gfx/crocModel.js';
import { createPearls } from './gfx/pearls.js';
import { createParticles } from './gfx/particles.js';
import { setView, updatePools } from './gfx/instancing.js';
import { createInput, ACTIONS, keyName } from './input.js';
import { createHazardModels } from './gfx/hazards.js';
import { resetHazards } from './sim/hazards.js';
import { createHud } from './hud.js';
import { createPacer } from './pacing.js';
import { createAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const params = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('dreamspace.' + k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('dreamspace.' + k, v); } catch (e) { /* private mode */ } },
};
// point a translated element at another text
function setKey(el, key) {
  if (el.dataset.i18nHtml !== undefined) { el.dataset.i18nHtml = key; el.innerHTML = t(key, el.dataset.vars ? JSON.parse(el.dataset.vars) : undefined); }
  else { el.dataset.i18n = key; el.textContent = t(key); }
}

const coarse = matchMedia('(pointer: coarse)').matches;
const quality = params.get('q') || store.get('quality', coarse ? 'low' : 'medium');
$('quality').value = quality;
$('sens').value = store.get('sens', '1');
$('fov').value = store.get('fov', '76');
$('invertY').checked = store.get('invertY', '0') === '1';
let baseFov = parseFloat($('fov').value);
$('fovVal').textContent = baseFov + '°';

// ---- renderer & world -------------------------------------------------------------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = true;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_AIR.color.getHex(), FOG_AIR.density);
const camera = new THREE.PerspectiveCamera(76, 1, 0.15, 9000);
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
const crocs = createCrocs(scene, game.crocs);
const crocPoses = game.crocs.map(() => ({ x: 0, z: 0, yaw: 0 }));
const pearls = createPearls(scene, game.pearls);
const hazardModels = createHazardModels(scene, game.hazards);
$('goal').dataset.vars = JSON.stringify({ n: game.pearls.length });
setKey($('goal'), 'menu.goal');
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
  invertY: $('invertY').checked,
  active: () => state === 'play',
  binds: (() => { try { return JSON.parse(store.get('binds', 'null')); } catch (e) { return null; } })(),
  onBindsChanged(b) { store.set('binds', JSON.stringify(b)); renderBinds(); },
  onAction(a) { if (a === 'mute' && state === 'play') hud.toast(t(audio.toggleMute() ? 'toast.soundOff' : 'toast.soundOn'), 1.2); },
  touchUI: { root: $('touch'), zone: $('tzone'), stick: $('stick'), knob: $('knob'), jump: $('tJump'), dive: $('tDive') },
  onLock(locked) { if (!locked && state === 'play') pause(); },
  onKey(code) {
    if (code === 'Enter' && state === 'menu' && !$('start').disabled && !input.capturing) start();
  },
});
$('sens').addEventListener('input', (e) => { input.setSensitivity(parseFloat(e.target.value)); store.set('sens', e.target.value); });
$('fov').addEventListener('input', (e) => { baseFov = parseFloat(e.target.value); $('fovVal').textContent = baseFov + '°'; store.set('fov', e.target.value); });
$('invertY').addEventListener('change', (e) => { input.setInvertY(e.target.checked); store.set('invertY', e.target.checked ? '1' : '0'); });
$('bindReset').addEventListener('click', () => input.resetBinds());

// key list in the menu and the rebinding table
function renderBinds() {
  const b = input.binds;
  const k = (a) => b[a].filter(Boolean).map((c) => `<kbd>${esc(keyName(c))}</kbd>`).join(' ') || '<kbd>—</kbd>';
  const k1 = (a) => `<kbd>${esc(keyName(b[a][0] || b[a][1]))}</kbd>`;
  $('keyList').innerHTML = [
    t('keys.move', { f: k1('forward'), l: k1('left'), b: k1('back'), r: k1('right') }),
    t('keys.jump', { k: k('jump') }),
    t('keys.dive', { k: k('dive') }),
    t('keys.sprint', { k: k('sprint') }),
    t('keys.mute', { k: k('mute') }),
  ].map((s) => `<li>${s}</li>`).join('');
  $('binds').innerHTML = ACTIONS.map((a) =>
    `<tr><td>${esc(t('act.' + a))}</td><td><button data-a="${a}" data-s="0">${esc(keyName(b[a][0]))}</button></td><td><button data-a="${a}" data-s="1">${esc(keyName(b[a][1]))}</button></td></tr>`).join('');
}
$('binds').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn || input.capturing) return;
  btn.classList.add('wait'); btn.textContent = t('bind.wait');
  // start listening after this click has finished, so the click itself is not captured
  setTimeout(() => input.captureBind(btn.dataset.a, +btn.dataset.s, () => renderBinds()), 0);
});

$('quality').addEventListener('change', (e) => {
  store.set('quality', e.target.value);
  const u = new URL(location.href); u.searchParams.delete('q'); location.href = u.toString();
});

function setState(s) {
  state = s;
  $('menu').classList.toggle('on', s === 'menu');
  $('end').classList.toggle('on', s === 'end');
  hud.show(s === 'play' && revealT <= 0);
  $('touch').classList.toggle('play', s === 'play');
  if (s !== 'play') $('reveal').classList.remove('on');
}
function start() {
  audio.start();
  setState('play');
  input.lock();
  if (!started) {
    started = true;
    hud.toast(t('toast.start'), 3.5);
  }
  setKey($('start'), 'menu.continue');
}
function pause() {
  setKey($('story'), revealed ? 'menu.pausedDream' : 'menu.paused');
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
  resetHazards(game.hazards);
  game.collected = 0; game.wakeups = 0; game.playTime = 0; game.won = false; game.allFound = false;
  game.events.length = 0;
  input.state.yaw = game.player.yaw; input.state.pitch = 0;
}

// ---- the dream comes out -----------------------------------------------------------------
let revealed = false, revealT = 0, endTwist = false;
const REVEAL_HOLD = 7;
function fillReveal() {
  const r = $('reveal');
  r.querySelector('.r1').textContent = t('reveal.1');
  r.querySelector('.r2').textContent = t('reveal.2');
  r.querySelector('.r3').textContent = t(game.collected > 0 ? 'reveal.3pearls' : 'reveal.3');
}
function startReveal() {
  revealed = true;
  revealT = REVEAL_HOLD;
  fillReveal();
  hud.show(false);
  audio.dream();
}
// called every frame while the reveal runs: black screen, text, then the beach fades in
function updateReveal(dt) {
  revealT -= dt;
  fx.fade = 0;
  $('reveal').classList.toggle('on', revealT > 1.1);
  if (revealT <= 0) { revealT = 0; hud.show(true); }
}

function fmtTime(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${r.toString().padStart(2, '0')}`; }
function fillEnd() {
  const p = game.player, n = game.pearls.length;
  $('endTitle').textContent = t(endTwist ? 'end.twistTitle' : 'end.title');
  $('endText').textContent = t(endTwist ? 'end.twistText' : 'end.text', { n });
  $('stats').innerHTML = [
    ['stat.time', fmtTime(game.playTime)],
    ['stat.speed', p.maxSpeed.toFixed(1) + ' m/s'],
    ['stat.flight', p.bestFlight.toFixed(1) + ' m'],
    ['stat.height', p.bestHeight.toFixed(1) + ' m'],
    ['stat.combo', '×' + p.bestCombo],
    ['stat.perfect', String(p.perfects)],
    ['stat.stings', String(p.stings)],
    ['stat.wakes', String(game.wakeups)],
  ].map((r) => `<tr><td>${esc(t(r[0]))}</td><td>${esc(r[1])}</td></tr>`).join('');
}
function showEnd() {
  endTwist = !revealed; // nobody has told them yet: the alarm clock does
  if (endTwist) { revealed = true; audio.dream(); }
  fillEnd();
  input.unlock();
  setState('end');
}

onLangChange(() => {
  renderBinds();
  hud.refresh();
  if (state === 'end') fillEnd();
  if (revealT > 0) fillReveal();
});

// ---- contextual hints ----------------------------------------------------------------------
let hintT = 0;
function updateHints(dt) {
  const p = game.player;
  const d = p.z - shoreZ(p.x);
  hintT += dt;
  let h = '';
  const J = input.label('jump'), F = input.label('forward');
  if (game.allFound && !game.won) h = t('hint.allFound');
  else if (p.poison > 0) h = t('hint.poison');
  else if (p.mode === 'air' && p.gliding > 0.5) h = t('hint.glide');
  else if (p.mode === 'swim' && d < 95) h = input.isTouch ? t('hint.diveTouch') : t('hint.dive', { f: F, d: input.label('dive'), j: J, s: input.label('sprint') });
  else if (p.mode !== 'swim' && d > 100 && p.depth > 0.12 && Math.hypot(p.vx, p.vz) < 4) h = input.isTouch ? t('hint.shallowTouch') : t('hint.shallow', { f: F, j: J });
  else if (p.mode === 'air' && p.combo >= 3 && p.combo < 9) h = t('hint.combo');
  else if (d > 0 && d < 30 && p.mode === 'ground' && p.depth > 0.1) h = t('hint.rays');
  else if (d < 0 && game.collected === 0 && hintT < 40) h = t('hint.pearls');
  hud.hint(h);
}

// ---- sim events -> effects ---------------------------------------------------------------------
const fx = { hurt: 0, shake: 0, dip: 0, fovKick: 0, fade: 0 };
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
        hud.toast(t('toast.pearl', { n: e.count, t: game.pearls.length }), 2.4, 'good');
        break;
      case 'allFound':
        hud.toast(t('toast.allFound'), 5, 'good');
        break;
      case 'crocAlert': audio.alert(); if (e.dist < 40) hud.toast(t('toast.crocAlert'), 1.8, 'bad'); break;
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
        hud.toast(t('toast.bite'), 1.6, 'bad');
        break;
      case 'sting':
        audio.sting(); fx.hurt = 0.7; fx.shake = 0.5;
        particles.splash(e.x, waterLevelAt(e.x, e.z, game.time), e.z, 2);
        hud.toast(t(e.kind === 'ray' ? 'toast.stingRay' : 'toast.stingLion'), 2.6, 'bad');
        break;
      case 'wake':
        audio.wake(); fx.fade = 0;
        input.state.yaw = p.yaw; input.state.pitch = 0;
        if (!revealed) startReveal();
        else hud.toast(t('toast.wake'), 4.5, 'bad');
        break;
      case 'win': audio.win(); showEnd(); break;
    }
  }
  ev.length = 0;
}

// ---- frame pacing (see pacing.js) ------------------------------------------------------------
const pacer = createPacer();

// ---- adaptive resolution ------------------------------------------------------------------------
// If frames keep missing the display (or 60 fps on faster displays), render
// fewer pixels; try more again after a long run of on-time frames. A step up
// that is immediately undone is not retried for a while. Only the picture gets
// cheaper, never the simulation.
const ar = { win: 0, frames: 0, missed: 0, bad: 0, good: 0, sinceUp: 99, ceil: 1, ceilT: 0 };
function adaptResolution(raw) {
  const budget = Math.min(Math.max(pacer.interval || 1 / 60, 1 / 60), 1 / 50);
  ar.frames++;
  if (raw > budget * 1.45) ar.missed++;
  ar.win += raw; ar.sinceUp += raw;
  if (ar.ceilT > 0 && (ar.ceilT -= raw) <= 0) ar.ceil = 1;
  if (ar.win < 0.5) return;
  const fps = ar.frames / ar.win;
  const bad = ar.missed > Math.max(1, ar.frames * 0.06) || fps < 0.85 / budget, good = ar.missed === 0;
  window.__fps = fps;
  ar.win = 0; ar.frames = 0; ar.missed = 0;
  ar.bad = bad ? ar.bad + 1 : 0;
  ar.good = good ? ar.good + 1 : 0;
  if (ar.bad >= 2 && renderScale > 0.5) {
    if (ar.sinceUp < 5) { ar.ceil = renderScale * 0.97; ar.ceilT = 45; }
    renderScale = Math.max(0.5, renderScale * 0.86); ar.bad = 0; resize();
  } else if (ar.good >= 12 && renderScale < Math.min(1, ar.ceil)) {
    renderScale = Math.min(1, ar.ceil, renderScale / 0.92); ar.good = 0; ar.sinceUp = 0; resize();
  }
}

// ---- frame loop ------------------------------------------------------------------------------------
const cam = { x: 0, y: 0, z: 0, roll: 0, bob: 0, bobPhase: 0, fov: 76 };
let last = performance.now(), menuT = 0, uiTime = 0;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, (now - last) / 1000);
  last = now;
  const dt = pacer.step(raw);
  uiTime += dt;

  const running = state === 'play' && revealT <= 0;
  if (running) {
    advance(game, dt, input.sample);
    handleEvents();
  } else {
    game.time += dt; // only the wave clock keeps running while paused
    game.alpha = 1;
  }
  if (state === 'play' && revealT > 0) updateReveal(dt);
  const p = game.player, a = game.alpha, prev = game.prev;
  const time = game.time + (running ? (a - 1) * STEP : 0);
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
    if (moving && running) cam.bobPhase += dt * (4.5 + speed * 1.1);
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
    cam.fov = damp(cam.fov, baseFov + Math.min(24, Math.max(0, speed - 7) * 1.35), 5, dt);
  }
  if (dbg.freeCam) {
    const c = dbg.freeCam;
    camera.position.set(c.x, c.y, c.z); camera.rotation.set(c.pitch || 0, c.yaw || 0, 0); cam.fov = c.fov || 76;
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
  if (revealT <= 0) fx.fade = damp(fx.fade, 1, 1.6, dt);
  f.uHurt.value = fx.hurt;
  f.uDanger.value = running ? game.danger : 0;
  f.uFade.value = fx.fade;
  f.uSpeed.value = damp(f.uSpeed.value, p.mode === 'air' ? Math.min(1, Math.max(0, speed - 11) / 10) : 0, 6, dt);
  f.uPoison.value = damp(f.uPoison.value, running && p.poison > 0 ? 1 : 0, 4, dt);

  // what is in view decides what gets drawn this frame
  sky.follow(camera.position.x, 0, camera.position.z);
  setView(camera, sky.shadowView);
  updatePools();
  water.update(camera);
  reef.update(time);
  pearls.update(time, dt, pipeline.uRes.value.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  hazardModels.update(time);
  for (let i = 0; i < crocPoses.length; i++) {
    const c = game.crocs[i], pc = prev.crocs[i], o = crocPoses[i];
    let dy = c.yaw - pc.yaw;
    if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
    o.x = pc.x + (c.x - pc.x) * a; o.z = pc.z + (c.z - pc.z) * a; o.yaw = pc.yaw + dy * a;
  }
  crocs.update(crocPoses, dt, time);
  particles.update(camera, under, pipeline.uRes.value.y);

  if (state === 'play') {
    hud.update(dt, game);
    updateHints(dt);
    audio.update(dt, { under, speed, air: p.mode === 'air', danger: running ? game.danger : 0, seaside: Math.max(0, 1 - Math.abs(p.z - shoreZ(p.x)) / 60) });
  }

  pipeline.render(dt);

  if (raw > 0 && raw <= 0.25) adaptResolution(raw);
  window.__frames = (window.__frames || 0) + 1;
}

// expose a little for automated checks
const dbg = { get game() { return game; }, camera, scene, renderer, pipeline, sky, input, start, pause, setState, respawnPlayer, freeCam: null, get renderScale() { return renderScale; }, pacer };
window.__dbg = dbg;

// compile shaders up front so the first seconds of play do not stutter
$('start').disabled = true;
renderBinds();
requestAnimationFrame((t0) => {
  last = t0;
  try {
    renderer.compile(scene, camera);
    // one full frame with every model present compiles the shadow shaders as well
    sky.follow(0, 0, 0);
    pipeline.render(0);
  } catch (e) { /* not fatal */ }
  $('start').disabled = false;
  setKey($('loadMsg'), input.isTouch ? 'menu.readyTouch' : 'menu.ready');
  if (params.get('autostart')) { started = true; setState('play'); }
  requestAnimationFrame(frame);
});
