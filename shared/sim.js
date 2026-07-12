// Authoritative game simulation — the single source of truth for game rules.
//
// This module has no DOM/canvas dependency, so it runs unmodified in two places:
//   - the browser, for solo play (no server round-trip needed)
//   - the Node server, as the authoritative simulation for multiplayer rooms
//
// It never reads wall-clock time and never touches the DOM. All non-deterministic
// side effects that are purely cosmetic (blood, screen flash, banners) are recorded
// as entries in gs.events instead of being applied directly, so the renderer decides
// how to present them and multiplayer clients don't need gameplay-irrelevant fields
// synced over the network.
import { TILE, WEAPONS, WWALL, PSTARTS } from './constants.js';
import { slide, safePos, wallHit } from './map.js';
import { makePlayer, makeZombie } from './entities.js';

export function createGameState(names) {
  return {
    players: names.map((n, i) => makePlayer(i, n)),
    zombies: [], bullets: [], drops: [],
    wave: 1, zombLeft: 0, zombTotal: 0,
    between: true, betTimer: 5, tick: 0, simTime: 0,
    spawnQ: 0, spawnT: 0,
    gameOver: false,
    events: [],
    // Stable per-entity ids for zombies/bullets, so multiplayer clients can
    // match entities across snapshots (needed to interpolate their motion
    // smoothly between the server's ticks instead of rendering discrete jumps).
    nextId: 1,
  };
}

// Continuous per-frame input (movement + aim + fire-held). Clamped/validated
// here since it's the one thing a multiplayer client can freely send.
export function applyInput(player, msg) {
  let dx = +msg.dx || 0, dy = +msg.dy || 0;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  const angle = Number.isFinite(+msg.angle) ? +msg.angle : 0;
  player.input.dx = dx;
  player.input.dy = dy;
  player.input.angle = angle;
  player.input.firing = !!msg.firing;
}

// Shared by the server's authoritative step and the client's local movement
// prediction (main.js), so the two can never silently diverge.
export function playerSpeed(p) {
  return p.speed * (p.perk === 'speed' ? 1.65 : 1);
}

// One-shot discrete actions (key press, not held state).
export function applyAction(gs, player, action) {
  if (!player.alive) return;
  if (action === 'reload') doReload(player);
  else if (action === 'buy') tryBuy(gs, player);
  else if (action === 'pickup') tryPickup(gs, player);
  else if (action === 'reset') resetPos(player);
}

function doReload(p) {
  const w = WEAPONS[p.wIdx];
  if (p.reloading || p.clip === w.ammo || p.reserve === 0) return;
  p.reloading = true; p.reloadPct = 0;
}

function tryBuy(gs, p) {
  for (const wp of WWALL) {
    const wx = (wp.tx + .5) * TILE, wy = (wp.ty + .5) * TILE;
    if (Math.hypot(p.x - wx, p.y - wy) < TILE * 1.8) {
      const w = WEAPONS[wp.wi];
      if (p.wIdx === wp.wi) { gs.events.push({ type: 'msg', text: 'HAI GIÀ ' + w.name }); return; }
      if (p.points < w.cost) { gs.events.push({ type: 'msg', text: 'SERVE ' + w.cost + ' PTS' }); return; }
      p.points -= w.cost; p.wIdx = wp.wi; p.clip = w.ammo; p.reserve = w.reserve; p.reloading = false;
      gs.events.push({ type: 'msg', text: '✓ ' + w.name });
      return;
    }
  }
  gs.events.push({ type: 'msg', text: "AVVICINATI A UN'ARMA" });
}

function tryPickup(gs, p) {
  for (let i = gs.drops.length - 1; i >= 0; i--) {
    if (Math.hypot(p.x - gs.drops[i].x, p.y - gs.drops[i].y) < TILE) {
      applyDrop(gs, p, gs.drops[i]); gs.drops.splice(i, 1); break;
    }
  }
}

function resetPos(p) {
  const s = PSTARTS[p.id] || PSTARTS[0];
  const sp = safePos(s.tx, s.ty);
  p.x = sp.x; p.y = sp.y;
  if (!p.alive && p.lives > 0) respawn(p);
}

function killPlayer(gs, p) {
  if (p.isDead) return;
  p.alive = false; p.isDead = true; p.hp = 0; p.lives--;
  gs.events.push({ type: 'playerDeath', x: p.x, y: p.y, name: p.name });
  if (p.lives > 0) p.respTimer = 3;
}

function respawn(p) {
  const s = PSTARTS[p.id] || PSTARTS[0];
  const sp = safePos(s.tx, s.ty);
  p.x = sp.x; p.y = sp.y; p.hp = 100; p.alive = true; p.isDead = false;
  p.respTimer = 0; p.killStreak = 0; p.perk = null;
  p.clip = WEAPONS[p.wIdx].ammo;
}

function spawnDrop(gs, x, y) {
  const r = Math.random();
  if (r < 0.22) gs.drops.push({ id: gs.nextId++, x, y, type: 'ammo', amount: 8 + Math.floor(Math.random() * 10), life: 14 });
  else if (r < 0.36) gs.drops.push({ id: gs.nextId++, x, y, type: 'health', life: 14 });
  else if (r < 0.43) {
    const pk = ['damage', 'speed', 'nuke'][Math.floor(Math.random() * 3)];
    gs.drops.push({ id: gs.nextId++, x, y, type: 'perk', perk: pk, life: 18 });
  }
}

const PERK_LABELS = { damage: 'DMG×2', speed: 'SPEED', nuke: 'NUKE' };

function applyDrop(gs, p, d) {
  if (d.type === 'ammo') {
    const w = WEAPONS[p.wIdx]; const g = Math.min(d.amount, w.reserve - p.reserve);
    p.reserve += g; gs.events.push({ type: 'msg', text: '+' + g + ' MUNIZIONI' });
  } else if (d.type === 'health') {
    const g = Math.min(20, p.maxHp - p.hp); p.hp += g; gs.events.push({ type: 'msg', text: '+' + g + ' HP' });
  } else if (d.type === 'perk') {
    if (d.perk === 'nuke') {
      gs.zombies.forEach(z => {
        if (!z.alive) return;
        gs.events.push({ type: 'kill', x: z.x, y: z.y, angle: z.angle });
        z.alive = false; gs.zombLeft--; p.points += 45; p.killStreak++;
      });
      gs.zombies = gs.zombies.filter(z => z.alive);
      gs.events.push({ type: 'ann', text: '☢ NUKE!' });
    } else {
      p.perk = d.perk; p.perkTimer = 15;
      gs.events.push({ type: 'msg', text: 'PERK: ' + PERK_LABELS[d.perk] + '!' });
    }
  }
}

export function stepSim(gs, dt) {
  if (gs.gameOver) return;
  gs.tick++;
  gs.simTime += dt * 1000;

  gs.players.forEach(p => {
    if (p.perk) { p.perkTimer -= dt; if (p.perkTimer <= 0) p.perk = null; }
    if (p.isDead && p.lives > 0 && p.respTimer > 0) {
      p.respTimer -= dt; if (p.respTimer <= 0) respawn(p);
    }
    if (!p.alive) return;

    const inp = p.input || { dx: 0, dy: 0, angle: 0, firing: false };
    const spd = playerSpeed(p);
    slide(p, inp.dx * spd * dt, inp.dy * spd * dt, 11);
    p.angle = inp.angle;

    if (p.reloading) {
      p.reloadPct += dt / p.reloadDur;
      if (p.reloadPct >= 1) {
        p.reloading = false; p.reloadPct = 0;
        const w = WEAPONS[p.wIdx]; const need = w.ammo - p.clip; const take = Math.min(need, p.reserve);
        p.clip += take; p.reserve -= take;
      }
    }

    const w = WEAPONS[p.wIdx];
    if (inp.firing && !p.reloading && p.clip > 0 && gs.simTime - p.lastShot > 60000 / w.rpm) {
      p.lastShot = gs.simTime;
      p.clip--;
      const dmg = w.damage * (p.perk === 'damage' ? 2 : 1);
      const spread = w.name === 'MINI UZI' ? 0.06 : 0.02;
      const ang = p.angle + (Math.random() - .5) * spread;
      gs.bullets.push({ id: gs.nextId++, x: p.x, y: p.y, vx: Math.cos(ang) * w.bs, vy: Math.sin(ang) * w.bs, damage: dmg, owner: p.id, alive: true, life: 1.1, size: w.bsz, ang });
      if (p.clip === 0 && p.reserve > 0) doReload(p);
    }

    for (let i = gs.drops.length - 1; i >= 0; i--) {
      if (Math.hypot(p.x - gs.drops[i].x, p.y - gs.drops[i].y) < TILE * .75) {
        applyDrop(gs, p, gs.drops[i]); gs.drops.splice(i, 1);
      }
    }

    if (p.killStreak >= 3) {
      p.killStreak = 0; p.hp = Math.min(p.maxHp, p.hp + 20);
      gs.events.push({ type: 'msg', text: '+20 HP KILL STREAK!' });
    }
  });

  // Bullets
  gs.bullets.forEach(b => {
    if (!b.alive) return;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || wallHit(b.x, b.y, 2)) { b.alive = false; return; }
    for (const z of gs.zombies) {
      if (!z.alive || !b.alive) continue;
      if (Math.hypot(b.x - z.x, b.y - z.y) < 16) {
        z.hp -= b.damage; z.flashT = 0.1; b.alive = false;
        gs.events.push({ type: 'hit', x: z.x, y: z.y });
        if (z.hp <= 0) {
          z.alive = false; gs.zombLeft--;
          const sh = gs.players[b.owner];
          if (sh) { sh.points += 45; sh.killStreak++; }
          gs.events.push({ type: 'kill', x: z.x, y: z.y, angle: z.angle, killer: sh ? sh.name : '?' });
          spawnDrop(gs, z.x, z.y);
        }
      }
    }
  });
  gs.bullets = gs.bullets.filter(b => b.alive);

  // Drops lifecycle
  gs.drops.forEach(d => { d.life -= dt; });
  gs.drops = gs.drops.filter(d => d.life > 0);

  // Zombie AI
  gs.zombies.forEach(z => {
    if (!z.alive) return;
    if (z.flashT > 0) z.flashT -= dt;
    let target = null, minD = Infinity;
    gs.players.forEach(p => { if (!p.alive) return; const d = Math.hypot(p.x - z.x, p.y - z.y); if (d < minD) { minD = d; target = p; } });
    if (!target) return;
    const ta = Math.atan2(target.y - z.y, target.x - z.x);
    z.wandT -= dt;
    if (z.wandT < 0) { z.wandA = ta + (Math.random() - .5) * (minD > TILE * 4 ? 1.2 : .4); z.wandT = .3 + Math.random() * .3; }
    const blend = minD < TILE * 2.5 ? 1 : .8;
    const ma = ta * blend + z.wandA * (1 - blend);
    z.angle = ta;
    const spd = z.speed * (minD < TILE * 1.5 ? 1.25 : 1);
    slide(z, Math.cos(ma) * spd * dt, Math.sin(ma) * spd * dt, 10);
    z.atkCD -= dt;
    if (minD < 20 && z.atkCD <= 0) {
      target.hp -= 20; z.atkCD = .85;
      gs.events.push({ type: 'playerHit', playerIdx: target.id });
      if (target.hp <= 0) killPlayer(gs, target);
    }
  });

  // Wave logic
  if (gs.between) {
    gs.betTimer -= dt;
    if (gs.betTimer <= 0) {
      gs.between = false;
      const count = gs.wave * 5; gs.zombTotal = count; gs.zombLeft = count; gs.spawnQ = count; gs.spawnT = 0;
      gs.events.push({ type: 'ann', text: 'WAVE ' + gs.wave, sub: count + ' ZOMBIE' });
    }
  }
  if (!gs.between && gs.spawnQ > 0) {
    gs.spawnT -= dt;
    if (gs.spawnT <= 0) { const z = makeZombie(gs.wave); z.id = gs.nextId++; gs.zombies.push(z); gs.spawnQ--; gs.spawnT = Math.max(.35, 1.2 - gs.wave * .06); }
  }
  if (!gs.between && gs.spawnQ === 0 && gs.zombLeft <= 0 && gs.zombies.every(z => !z.alive)) {
    gs.between = true; gs.betTimer = 5; gs.wave++;
    gs.zombies = []; gs.bullets = [];
    gs.players.forEach(p => { if (!p.alive) return; const w = WEAPONS[p.wIdx]; p.reserve = Math.min(p.reserve + Math.floor(w.reserve * .25), w.reserve); });
    gs.events.push({ type: 'ann', text: 'WAVE ' + (gs.wave - 1) + ' COMPLETATA!', sub: 'Prossima in 5s...' });
  }

  if (!gs.gameOver && gs.players.length > 0 && gs.players.every(p => !p.alive && p.lives <= 0)) {
    gs.gameOver = true;
    gs.events.push({ type: 'gameover', wave: gs.wave, points: gs.players.reduce((a, p) => a + p.points, 0) });
  }
}
