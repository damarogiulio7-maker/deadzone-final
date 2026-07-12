// Raw input capture: keyboard, mouse, and touch (virtual joysticks + buttons).
// This module only tracks device state — it has no idea what a "reload" or a
// "pause" means. Interpreting raw state into game actions is main.js's job,
// since that depends on current game/UI state this module shouldn't know about.
export const keys = {};
export const mouse = { x: 0, y: 0, down: false };
export const touch = { move: { x: 0, y: 0 }, aim: { angle: 0, active: false }, fire: false };

export function initKeyboard(onKeyDown, onKeyUp) {
  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (onKeyDown) onKeyDown(e.code, e);
  });
  document.addEventListener('keyup', e => {
    keys[e.code] = false;
    if (onKeyUp) onKeyUp(e.code, e);
  });
}

export function initPointer(cv) {
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  cv.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; });
  cv.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
}

export function initTouch(onReload, onBuy) {
  const mob = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;
  if (!mob) return;
  document.getElementById('touch').style.display = 'block';
  document.getElementById('hint').style.display = 'none';
  const JR = 50;

  const jlz = document.getElementById('jlz'), jlb = document.getElementById('jlb'), jlk = document.getElementById('jlk');
  let jlId = -1, jlCX = 0, jlCY = 0;
  jlz.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0]; jlId = t.identifier;
    const r = jlz.getBoundingClientRect(); jlCX = t.clientX - r.left; jlCY = t.clientY - r.top;
    jlb.style.left = (jlCX - 50) + 'px'; jlb.style.top = (jlCY - 50) + 'px'; jlb.style.display = 'block';
    jlk.style.display = 'block'; jlk.style.left = jlCX + 'px'; jlk.style.top = jlCY + 'px';
  }, { passive: false });
  jlz.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== jlId) continue;
      const r = jlz.getBoundingClientRect();
      const dx = t.clientX - r.left - jlCX, dy = t.clientY - r.top - jlCY;
      const dist = Math.min(Math.hypot(dx, dy), JR);
      const ang = Math.atan2(dy, dx);
      touch.move.x = Math.cos(ang) * (dist / JR); touch.move.y = Math.sin(ang) * (dist / JR);
      jlk.style.left = (jlCX + Math.cos(ang) * dist) + 'px'; jlk.style.top = (jlCY + Math.sin(ang) * dist) + 'px';
    }
  }, { passive: false });
  const endL = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== jlId) continue;
      touch.move.x = 0; touch.move.y = 0; jlb.style.display = 'none'; jlk.style.display = 'none';
    }
  };
  jlz.addEventListener('touchend', endL, { passive: false });
  jlz.addEventListener('touchcancel', endL, { passive: false });

  const jrz = document.getElementById('jrz'), jrb = document.getElementById('jrb'), jrk = document.getElementById('jrk');
  let jrId = -1, jrCX = 0, jrCY = 0;
  jrz.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0]; jrId = t.identifier;
    const r = jrz.getBoundingClientRect(); jrCX = t.clientX - r.left; jrCY = t.clientY - r.top;
    jrb.style.left = (jrCX - 50) + 'px'; jrb.style.top = (jrCY - 50) + 'px'; jrb.style.display = 'block';
    jrk.style.display = 'block'; jrk.style.left = jrCX + 'px'; jrk.style.top = jrCY + 'px';
    touch.fire = true;
  }, { passive: false });
  jrz.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== jrId) continue;
      const r = jrz.getBoundingClientRect();
      const dx = t.clientX - r.left - jrCX, dy = t.clientY - r.top - jrCY;
      const dist = Math.min(Math.hypot(dx, dy), JR);
      const ang = Math.atan2(dy, dx);
      touch.aim.angle = ang; touch.aim.active = dist > 8;
      jrk.style.left = (jrCX + Math.cos(ang) * dist) + 'px'; jrk.style.top = (jrCY + Math.sin(ang) * dist) + 'px';
    }
  }, { passive: false });
  const endR = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== jrId) continue;
      touch.fire = false; touch.aim.active = false; jrb.style.display = 'none'; jrk.style.display = 'none';
    }
  };
  jrz.addEventListener('touchend', endR, { passive: false });
  jrz.addEventListener('touchcancel', endR, { passive: false });

  document.getElementById('tbr').addEventListener('touchstart', e => { e.preventDefault(); onReload && onReload(); }, { passive: false });
  document.getElementById('tbq').addEventListener('touchstart', e => { e.preventDefault(); onBuy && onBuy(); }, { passive: false });
}
