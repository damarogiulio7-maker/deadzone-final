// Shared entity factories — used by both the browser client and the Node server.
import { PSTARTS, PNAMES, MAX_LIVES, WEAPONS } from './constants.js';
import { safePos, zombieSpawn } from './map.js';

export function makePlayer(idx, name) {
  const s = PSTARTS[idx] || PSTARTS[0];
  const sp = safePos(s.tx, s.ty);
  const w = WEAPONS[0];
  return {
    id: idx, name: name || PNAMES[idx] || ('P' + (idx + 1)),
    x: sp.x, y: sp.y,
    hp: 100, maxHp: 100, speed: 175, angle: 0, points: 0, alive: true,
    wIdx: 0, clip: w.ammo, reserve: w.reserve,
    reloading: false, reloadPct: 0, reloadDur: 1.3, lastShot: 0,
    killStreak: 0, perk: null, perkTimer: 0,
    lives: MAX_LIVES, respTimer: 0, isDead: false,
    // Latest known input, applied each sim step. Never trust anything else
    // sent by a client — this is the only per-tick channel from client to sim.
    input: { dx: 0, dy: 0, angle: 0, firing: false },
  };
}

export function makeZombie(wave) {
  const sp = zombieSpawn();
  const hp = Math.round((40 + wave * 12) * 0.5);
  return {
    x: sp.x, y: sp.y, hp, maxHp: hp, speed: 55 + wave * 6,
    angle: 0, alive: true, atkCD: 0, flashT: 0,
    wandA: Math.random() * Math.PI * 2, wandT: 0,
  };
}
