// DOM heads-up display and the minimap.

import { terrainHeight, shoreZ, flatMask, lagoonMask, poolOutline } from './sim/terrain.js';
import { POOLS, HUTS } from './sim/mapdata.js';
import { LAYOUT } from './sim/layout.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

const MAP = { x0: -460, x1: 460, z0: -265, z1: 505, w: 216, h: 180 };
const mapX = (x) => (MAP.x1 - x) / (MAP.x1 - MAP.x0) * MAP.w; // +x is on the left when facing the sea
const mapY = (z) => (MAP.z1 - z) / (MAP.z1 - MAP.z0) * MAP.h;

function drawMapBackground() {
  const cv = document.createElement('canvas');
  cv.width = MAP.w; cv.height = MAP.h;
  const g = cv.getContext('2d');
  const img = g.createImageData(MAP.w, MAP.h);
  for (let j = 0; j < MAP.h; j++) {
    for (let i = 0; i < MAP.w; i++) {
      const x = MAP.x1 - (i + 0.5) / MAP.w * (MAP.x1 - MAP.x0);
      const z = MAP.z1 - (j + 0.5) / MAP.h * (MAP.z1 - MAP.z0);
      const y = terrainHeight(x, z), d = z - shoreZ(x);
      let r, gr, b;
      if (y > 0) {
        if (d < -262) { r = 206; gr = 172; b = 122; }
        else if (d < -30) { r = 150; gr = 176; b = 104; }
        else { r = 236; gr = 216; b = 166; }
        if (d > 20) { r = 120; gr = 104; b = 70; }
      } else {
        const F = d > 1 ? flatMask(x, d) * (1 - lagoonMask(x, d)) : 0;
        const t = Math.min(1, -y / 3.2);
        r = 96 - 80 * t; gr = 214 - 70 * t; b = 214 - 30 * t;
        if (y < -5) { const k = Math.min(1, (-y - 5) / 20); r = 16 - 8 * k; gr = 144 - 84 * k; b = 184 - 64 * k; }
        if (F > 0.5 && y > -1.1) { r = 104; gr = 132; b = 96; }
      }
      const k = (j * MAP.w + i) * 4;
      img.data[k] = r; img.data[k + 1] = gr; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#2f6b3a';
  for (const m of LAYOUT.mangroves) g.fillRect(mapX(m.x) - 1, mapY(m.z) - 1, 2, 2);
  const sx = MAP.w / (MAP.x1 - MAP.x0), sz = MAP.h / (MAP.z1 - MAP.z0);
  for (const p of POOLS) {
    g.fillStyle = p.tint === 'green' ? '#5f9a4a' : '#3aa8d8';
    g.beginPath();
    poolOutline(p, 24).forEach(([x, z], i) => { if (i === 0) g.moveTo(mapX(x), mapY(z)); else g.lineTo(mapX(x), mapY(z)); });
    g.closePath(); g.fill();
  }
  g.fillStyle = '#b8603c';
  for (const b of LAYOUT.boxes) {
    g.save(); g.translate(mapX(b.x), mapY(b.z)); g.rotate(b.rot);
    g.fillRect(-b.hw * sx, -b.hd * sz, b.hw * 2 * sx, b.hd * 2 * sz); g.restore();
  }
  g.fillStyle = '#c9a25a';
  for (const h of HUTS) { g.beginPath(); g.arc(mapX(h.x), mapY(h.z), Math.max(1.5, h.r * sx), 0, 6.283); g.fill(); }
  return cv;
}

export function createHud() {
  const el = {
    hud: $('hud'), pearls: $('pearls'), hp: $('hpFill'), o2: $('o2Fill'), o2Row: $('o2Row'),
    speed: $('speedVal'), speedFill: $('speedFill'), combo: $('combo'), mode: $('mode'),
    toast: $('toast'), hint: $('hint'), map: $('minimap'), danger: $('dangerTxt'), poison: $('poisonTxt'),
  };
  const bg = drawMapBackground();
  const mctx = el.map.getContext('2d');
  el.map.width = MAP.w; el.map.height = MAP.h;
  let toastT = 0, comboT = 0, mapT = 0, textT = 0, last = {};
  const set = (key, node, prop, val) => { if (last[key] !== val) { last[key] = val; node[prop] = val; } };
  const scale = (v) => `scaleX(${Math.max(0, Math.min(1, v)).toFixed(3)})`;

  return {
    refresh() { delete last.mode; textT = 0; },
    show(v) { el.hud.classList.toggle('on', v); },
    toast(text, secs = 3.2, cls = '') {
      el.toast.textContent = text; el.toast.className = 'toast on ' + cls; toastT = secs;
    },
    hint(text) { set('hint', el.hint, 'textContent', text); },
    combo(n, kind) {
      el.combo.textContent = t(kind === 'perfect' ? 'combo.perfect' : 'combo.hop', { n });
      el.combo.className = 'combo on ' + (kind === 'perfect' ? 'perfect' : '');
      comboT = 1.1;
    },
    update(dt, game) {
      const p = game.player;
      set('pearls', el.pearls, 'textContent', `${game.collected} / ${game.pearls.length}`);
      set('hp', el.hp.style, 'transform', scale(Math.round(p.health) / 100));
      set('o2', el.o2.style, 'transform', scale(Math.round(p.o2 * 100) / 100));
      set('o2v', el.o2Row.style, 'opacity', p.o2 < 0.995 || p.underwater ? '1' : '0.25');
      set('o2low', el.o2Row, 'className', 'bar-row' + (p.o2 < 0.25 ? ' low' : ''));
      const sp = Math.hypot(p.vx, p.vz);
      set('spf', el.speedFill.style, 'transform', scale(Math.round(sp / 30 * 200) / 200));
      set('spc', el.speedFill.style, 'background', sp > 16 ? '#7df9ff' : sp > 9.5 ? '#8dffb0' : '#ffd36b');
      // numbers change every frame; re-laying out text that often costs more than it shows
      textT -= dt;
      if (textT <= 0) {
        textT = 1 / 15;
        set('sp', el.speed, 'textContent', sp.toFixed(1));
        const mode = p.mode === 'swim' ? t(p.underwater ? 'mode.dive' : 'mode.swim')
          : p.mode === 'air' ? (p.gliding > 0.5 ? t('mode.glide', { h: Math.max(0, p.height).toFixed(1) }) : t('mode.air'))
            : t(p.depth > 0.12 ? 'mode.wade' : 'mode.land');
        set('mode', el.mode, 'textContent', mode);
      }
      set('danger', el.danger, 'className', game.chasing ? 'on' : '');
      set('poison', el.poison, 'className', 'poison' + (p.poison > 0 ? ' on' : ''));
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.className = 'toast'; }
      if (comboT > 0) { comboT -= dt; if (comboT <= 0) el.combo.className = 'combo'; }

      mapT -= dt;
      if (mapT <= 0) {
        mapT = 0.08;
        mctx.drawImage(bg, 0, 0);
        for (const pe of game.pearls) {
          if (pe.taken) continue;
          mctx.fillStyle = '#ffffff'; mctx.beginPath(); mctx.arc(mapX(pe.x), mapY(pe.z), 3.2, 0, 6.283); mctx.fill();
          mctx.fillStyle = '#35d0ff'; mctx.beginPath(); mctx.arc(mapX(pe.x), mapY(pe.z), 2, 0, 6.283); mctx.fill();
        }
        for (const c of game.crocs) {
          const hunting = c.state !== 'idle' && c.state !== 'home';
          const near = Math.hypot(c.x - p.x, c.z - p.z) < 60;
          if (!hunting && !near) continue;
          mctx.fillStyle = hunting ? '#ff2a1a' : '#b8552a';
          mctx.beginPath(); mctx.arc(mapX(c.x), mapY(c.z), hunting ? 3.2 : 2.2, 0, 6.283); mctx.fill();
        }
        // player arrow
        const px = mapX(p.x), py = mapY(p.z);
        mctx.save(); mctx.translate(px, py);
        // forward = (-sin yaw, -cos yaw); on the map x is mirrored and z points up
        mctx.rotate(Math.PI - p.yaw);
        mctx.fillStyle = '#fff'; mctx.strokeStyle = '#102030'; mctx.lineWidth = 1.2;
        mctx.beginPath(); mctx.moveTo(0, -6.5); mctx.lineTo(4.5, 5); mctx.lineTo(0, 2.5); mctx.lineTo(-4.5, 5); mctx.closePath();
        mctx.fill(); mctx.stroke(); mctx.restore();
      }
    },
  };
}
