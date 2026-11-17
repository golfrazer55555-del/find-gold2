'use strict';
/* 입력: 키보드 + 마우스 + 터치(가상 조이스틱/버튼)를 하나의 인터페이스로 */
const Input = (() => {
  const keys = new Set();
  const held = new Set();      // 현재 눌린 행동
  const pressed = new Set();   // 이번 프레임에 새로 눌린 행동
  const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  let aim = null;              // 마우스 조준 (화면 좌표)
  let touchMode = false;
  let enabled = true;
  const listeners = [];

  const KEYMAP = {
    KeyE: 'action', Space: 'action', Enter: 'action',
    KeyF: 'shoot', KeyJ: 'shoot',
    KeyQ: 'dynamite', KeyG: 'dynamite',
    KeyT: 'timber',
    KeyM: 'map',
    KeyI: 'bag', Tab: 'bag',
    Escape: 'esc',
    KeyH: 'heal',
    KeyR: 'ride',
    Digit1: 'eat', Digit2: 'drink', Digit3: 'heal', Digit4: 'antidote',
  };
  const MOVE_KEYS = {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  };

  function press(act) {
    if (!held.has(act)) pressed.add(act);
    held.add(act);
    for (const fn of listeners) fn(act);
  }
  function release(act) { held.delete(act); }

  function setTouchMode(v) {
    if (touchMode === v) return;
    touchMode = v;
    document.body.classList.toggle('touch', v);
  }

  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    setTouchMode(false);
    keys.add(e.code);
    const act = KEYMAP[e.code];
    if (act) {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) press(act);
    } else if (e.code.startsWith('Arrow')) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    const act = KEYMAP[e.code];
    if (act) {
      // 같은 행동에 매핑된 다른 키가 아직 눌려 있으면 유지
      const still = Object.keys(KEYMAP).some((k) => KEYMAP[k] === act && keys.has(k));
      if (!still) release(act);
    }
  });
  window.addEventListener('blur', () => { keys.clear(); held.clear(); stick.active = false; resetKnob(); });

  /* 가상 조이스틱 */
  let zone, base, knob;
  const STICK_R = 52;
  function resetKnob() {
    if (!base) return;
    base.classList.remove('on');
    knob.style.transform = 'translate(-50%,-50%)';
  }
  function bindTouch() {
    zone = document.getElementById('stick-zone');
    base = document.getElementById('stick-base');
    knob = document.getElementById('stick-knob');
    zone.addEventListener('pointerdown', (e) => {
      setTouchMode(true);
      if (stick.active) return;
      e.preventDefault();
      stick.active = true; stick.id = e.pointerId;
      const r = zone.getBoundingClientRect();
      stick.ox = e.clientX; stick.oy = e.clientY; stick.x = 0; stick.y = 0;
      base.style.left = (e.clientX - r.left) + 'px';
      base.style.top = (e.clientY - r.top) + 'px';
      base.classList.add('on');
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    const move = (e) => {
      if (!stick.active || e.pointerId !== stick.id) return;
      e.preventDefault();
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      stick.x = dx / STICK_R; stick.y = dy / STICK_R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const end = (e) => {
      if (e.pointerId !== stick.id) return;
      stick.active = false; stick.id = null; stick.x = 0; stick.y = 0;
      resetKnob();
    };
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    document.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      btn.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse') setTouchMode(true);
        e.preventDefault();
        e.stopPropagation();
        Sfx.resume();
        press(act);
        btn.classList.add('down');
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      });
      const up = (e) => { e.preventDefault(); release(act); btn.classList.remove('down'); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', () => { release(act); btn.classList.remove('down'); });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    const canvas = document.getElementById('game');
    canvas.addEventListener('pointerdown', (e) => {
      Sfx.resume();
      canvas.focus({ preventScroll: true });
      if (e.pointerType === 'mouse') {
        setTouchMode(false);
        aim = { x: e.clientX, y: e.clientY, t: performance.now() };
        if (e.button === 0) press('shoot');
        else if (e.button === 2) press('dynamite');
      } else {
        setTouchMode(true);
      }
    });
    canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') aim = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') { release('shoot'); release('dynamite'); }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) setTouchMode(matchMedia('(pointer: coarse)').matches);
    // iOS 확대 제스처 방지
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  function getMove() {
    if (!enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    const k = (list) => list.some((c) => keys.has(c));
    if (k(MOVE_KEYS.left)) x -= 1;
    if (k(MOVE_KEYS.right)) x += 1;
    if (k(MOVE_KEYS.up)) y -= 1;
    if (k(MOVE_KEYS.down)) y += 1;
    if (x || y) { const d = Math.hypot(x, y); return { x: x / d, y: y / d }; }
    if (stick.active) {
      const d = Math.hypot(stick.x, stick.y);
      if (d < 0.18) return { x: 0, y: 0 };
      const m = Math.min(1, (d - 0.18) / 0.62);
      return { x: (stick.x / d) * m, y: (stick.y / d) * m };
    }
    return { x: 0, y: 0 };
  }

  return {
    bindTouch, getMove,
    isHeld: (a) => enabled && held.has(a),
    consume(a) { const had = pressed.has(a); pressed.delete(a); return enabled && had; },
    endFrame() { pressed.clear(); },
    clear() { pressed.clear(); held.clear(); keys.clear(); aim = null; },
    /* 마우스를 최근 3초 안에 움직였을 때만 마우스 조준 */
    takeAim() { return aim && performance.now() - aim.t < 3000 ? aim : null; },
    clearAim() { aim = null; },
    onPress(fn) { listeners.push(fn); },
    get touchMode() { return touchMode; },
    set enabled(v) { enabled = v; if (!v) { pressed.clear(); } },
    get enabled() { return enabled; },
  };
})();
