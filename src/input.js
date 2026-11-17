// Keyboard + mouse (pointer lock) with rebindable controls, and touch.
// Look angles change per input event, never per frame, so turning speed does
// not depend on the frame rate either.

export const ACTIONS = [
  ['forward', 'Dopredu'], ['back', 'Dozadu'], ['left', 'Doľava'], ['right', 'Doprava'],
  ['jump', 'Skok / nahor vo vode'], ['dive', 'Potopiť sa'], ['sprint', 'Šprint / rýchle plávanie'], ['mute', 'Zvuk'],
];
export const DEFAULT_BINDS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'Mouse2'], dive: ['KeyC', 'ControlLeft'], sprint: ['ShiftLeft', 'ShiftRight'], mute: ['KeyM', null],
};

const NAMES = {
  Space: 'Medzerník', ShiftLeft: 'Ľ Shift', ShiftRight: 'P Shift', ControlLeft: 'Ľ Ctrl', ControlRight: 'P Ctrl',
  AltLeft: 'Ľ Alt', AltRight: 'P Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab',
  Enter: 'Enter', Backquote: '`', CapsLock: 'Caps Lock',
  Mouse0: 'Ľavé tl. myši', Mouse1: 'Koliesko (klik)', Mouse2: 'Pravé tl. myši', Mouse3: 'Myš 4', Mouse4: 'Myš 5',
  WheelUp: 'Koliesko hore', WheelDown: 'Koliesko dole',
};
export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export function createInput(canvas, opts) {
  const down = new Set();
  const pulse = { WheelUp: 0, WheelDown: 0 };
  const state = { mx: 0, mz: 0, jump: false, down: false, sprint: false, yaw: opts.yaw || 0, pitch: 0 };
  const touch = { mx: 0, mz: 0, jump: false, down: false, sprint: false };
  let binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));
  if (opts.binds) for (const k in DEFAULT_BINDS) if (Array.isArray(opts.binds[k])) binds[k] = [opts.binds[k][0] || null, opts.binds[k][1] || null];
  let sens = opts.sensitivity || 1, invertY = !!opts.invertY;
  let locked = false, capture = null;
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  // mouse buttons count whenever the game is running, even if the browser refused pointer lock
  const playing = () => locked || (opts.active ? opts.active() : false);

  const look = (dx, dy, k) => {
    state.yaw -= dx * k;
    state.pitch -= dy * k * (invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.02;
    if (state.pitch > lim) state.pitch = lim; else if (state.pitch < -lim) state.pitch = -lim;
  };
  const active = (action) => {
    const b = binds[action];
    for (let i = 0; i < 2; i++) {
      const c = b[i];
      if (c && (down.has(c) || pulse[c] > 0)) return true;
    }
    return false;
  };
  const press = (code) => {
    down.add(code);
    if (binds.mute.includes(code) && opts.onAction) opts.onAction('mute');
  };

  // while a binding is being captured, the next key / button / wheel goes to it
  const finishCapture = (code) => {
    const c = capture; capture = null;
    if (code === 'Escape') { c.done(null, true); return; }
    const value = (code === 'Backspace' || code === 'Delete') ? null : code;
    if (value) for (const a in binds) for (let i = 0; i < 2; i++) if (binds[a][i] === value) binds[a][i] = null; // one job per key
    binds[c.action][c.slot] = value;
    c.done(value, false);
    if (opts.onBindsChanged) opts.onBindsChanged(binds);
  };

  addEventListener('keydown', (e) => {
    if (capture) { e.preventDefault(); e.stopPropagation(); finishCapture(e.code); return; }
    if (e.repeat) return;
    press(e.code);
    if (locked && (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow') || e.code.startsWith('Alt') || e.code.startsWith('Control'))) e.preventDefault();
    if (opts.onKey) opts.onKey(e.code);
  }, true);
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => down.clear());
  addEventListener('mousedown', (e) => {
    if (capture) { e.preventDefault(); e.stopPropagation(); finishCapture('Mouse' + e.button); return; }
    if (playing()) { press('Mouse' + e.button); e.preventDefault(); }
  }, true);
  addEventListener('mouseup', (e) => down.delete('Mouse' + e.button));
  addEventListener('contextmenu', (e) => { if (playing() || capture || e.target === canvas) e.preventDefault(); });
  addEventListener('wheel', (e) => {
    const code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
    if (capture) { e.preventDefault(); finishCapture(code); return; }
    if (playing()) pulse[code] = 7; // held for a few simulation steps
  }, { passive: false });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    // some browsers report a huge delta on the first event after locking
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    look(e.movementX, e.movementY, 0.0022 * sens);
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) down.clear();
    if (opts.onLock) opts.onLock(locked);
  });

  // ---- touch -------------------------------------------------------------------
  const ui = opts.touchUI;
  if (isTouch && ui) {
    ui.root.classList.add('on');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const R = 56;
    const setStick = (dx, dy) => {
      const l = Math.hypot(dx, dy), k = l > R ? R / l : 1;
      dx *= k; dy *= k;
      ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      touch.mx = dx / R; touch.mz = -dy / R;
      touch.sprint = l > R * 0.92;
    };
    ui.zone.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.42 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          ui.stick.style.left = sx + 'px'; ui.stick.style.top = sy + 'px'; ui.stick.classList.add('on');
          setStick(0, 0);
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    ui.zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) setStick(t.clientX - sx, t.clientY - sy);
        else if (t.identifier === lookId) { look(t.clientX - lx, t.clientY - ly, 0.0055 * sens); lx = t.clientX; ly = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; touch.mx = touch.mz = 0; touch.sprint = false; ui.stick.classList.remove('on'); }
        else if (t.identifier === lookId) lookId = null;
      }
    };
    ui.zone.addEventListener('touchend', end);
    ui.zone.addEventListener('touchcancel', end);
    const hold = (el, prop) => {
      el.addEventListener('touchstart', (e) => { touch[prop] = true; el.classList.add('on'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
      const off = (e) => { touch[prop] = false; el.classList.remove('on'); e.preventDefault(); e.stopPropagation(); };
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
    };
    hold(ui.jump, 'jump');
    hold(ui.dive, 'down');
  }

  return {
    state, isTouch,
    get locked() { return locked || isTouch; },
    get binds() { return binds; },
    get capturing() { return !!capture; },
    setSensitivity(v) { sens = v; },
    setInvertY(v) { invertY = v; },
    resetBinds() { binds = JSON.parse(JSON.stringify(DEFAULT_BINDS)); if (opts.onBindsChanged) opts.onBindsChanged(binds); },
    // wait for the next key, mouse button or wheel tick and bind it
    captureBind(action, slot, done) { capture = { action, slot, done }; },
    label(action) { const b = binds[action]; return keyName(b[0] || b[1]); },
    lock() { if (!isTouch && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    // read the current input for one simulation step
    sample() {
      state.mx = (active('right') ? 1 : 0) - (active('left') ? 1 : 0) + touch.mx;
      state.mz = (active('forward') ? 1 : 0) - (active('back') ? 1 : 0) + touch.mz;
      state.jump = active('jump') || touch.jump;
      state.down = active('dive') || touch.down;
      state.sprint = active('sprint') || touch.sprint;
      if (pulse.WheelUp > 0) pulse.WheelUp--;
      if (pulse.WheelDown > 0) pulse.WheelDown--;
      return state;
    },
  };
}
