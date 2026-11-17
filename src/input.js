// Keyboard + mouse (pointer lock) and touch controls.
// Look angles change per input event, never per frame, so turning speed does
// not depend on the frame rate either.

export function createInput(canvas, opts) {
  const keys = new Set();
  const state = { mx: 0, mz: 0, jump: false, down: false, sprint: false, yaw: opts.yaw || 0, pitch: 0 };
  const touch = { active: false, mx: 0, mz: 0, jump: false, down: false, sprint: false };
  let sens = opts.sensitivity || 1;
  let locked = false;
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  const look = (dx, dy, k) => {
    state.yaw -= dx * k;
    state.pitch -= dy * k;
    const lim = Math.PI / 2 - 0.02;
    if (state.pitch > lim) state.pitch = lim; else if (state.pitch < -lim) state.pitch = -lim;
  };

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && locked) e.preventDefault();
    if (opts.onKey) opts.onKey(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    // some browsers report a huge delta on the first event after locking
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    look(e.movementX, e.movementY, 0.0022 * sens);
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) keys.clear();
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
    setSensitivity(v) { sens = v; },
    lock() { if (!isTouch && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    // read the current input for one simulation step
    sample() {
      let mx = 0, mz = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      state.mx = mx + touch.mx; state.mz = mz + touch.mz;
      state.jump = keys.has('Space') || touch.jump;
      state.down = keys.has('KeyC') || keys.has('ControlLeft') || keys.has('KeyQ') || touch.down;
      state.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.sprint;
      return state;
    },
  };
}
