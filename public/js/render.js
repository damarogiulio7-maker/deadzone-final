// Canvas rendering, HUD, minimap, and purely-cosmetic effects (blood, corpses,
// particles, screen flash, announcements, kill feed). None of this affects
// gameplay, so in multiplayer it's driven client-side from the `events` list
// the server includes with each state broadcast rather than being simulated
// or synced as gameplay state.
import { COLS, ROWS, TILE, MW, MH, PCOLORS, MAX_LIVES, WEAPONS, WWALL } from '/shared/constants.js';
import { MAP } from '/shared/map.js';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const mm = document.getElementById('mmcv');
const mctx = mm.getContext('2d');

let bloodPools = [], corpses = [], particles = [];
let dmgT = 0;
let annTid = null, msgTid = null;
const KF = [];

export function getCanvas() { return cv; }

export function resizeCanvas() {
  cv.width = window.innerWidth;
  cv.height = window.innerHeight;
}

export function resetCosmetics() {
  bloodPools = []; corpses = []; particles = []; KF.length = 0; dmgT = 0;
}

function spawnBlood(x, y, n = 5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 80;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .45, maxLife: .45, color: Math.random() < .7 ? '#aa0000' : '#660000', size: 1.5 + Math.random() * 3 });
  }
  bloodPools.push({ x: x + (Math.random() - .5) * 10, y: y + (Math.random() - .5) * 10, r: 6 + Math.random() * 10, a: .45 + Math.random() * .2 });
}

export function showAnn(text, sub) {
  const el = document.getElementById('ann');
  el.innerHTML = '';
  el.appendChild(document.createTextNode(text));
  if (sub) {
    el.appendChild(document.createElement('br'));
    const small = document.createElement('small');
    small.style.fontSize = '16px';
    small.textContent = sub;
    el.appendChild(small);
  }
  el.style.display = 'block';
  if (annTid) clearTimeout(annTid);
  annTid = setTimeout(() => { el.style.display = 'none'; }, 2800);
}

export function showMsg(text) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.style.display = 'block';
  if (msgTid) clearTimeout(msgTid);
  msgTid = setTimeout(() => { el.style.display = 'none'; }, 2000);
}

function flashDmg() { dmgT = .15; }

function addKF(name) {
  KF.push({ n: name, t: 4 });
  if (KF.length > 5) KF.shift();
  const el = document.getElementById('kf');
  el.innerHTML = '';
  for (const k of KF) {
    const row = document.createElement('div');
    row.className = 'kfi';
    row.textContent = k.n + ' +45'; // textContent: player-supplied names can never inject markup here
    el.appendChild(row);
  }
}

// Consumes the simulation's event list (cosmetic side effects only) for one tick.
export function applyEvents(events, myIdx, onGameOver) {
  for (const e of events) {
    switch (e.type) {
      case 'hit': spawnBlood(e.x, e.y, 6); break;
      case 'kill':
        corpses.push({ x: e.x, y: e.y, angle: e.angle || 0, timer: 3, alpha: 1 });
        spawnBlood(e.x, e.y, 10);
        if (e.killer) addKF(e.killer);
        break;
      case 'msg': showMsg(e.text); break;
      case 'ann': showAnn(e.text, e.sub); break;
      case 'playerHit': if (e.playerIdx === myIdx) flashDmg(); break;
      case 'gameover': if (onGameOver) onGameOver(e.wave, e.points); break;
    }
  }
}

export function tickCosmetics(dt) {
  particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .82; p.vy *= .82; p.life -= dt; });
  particles = particles.filter(p => p.life > 0);
  corpses.forEach(c => { c.timer -= dt; c.alpha = Math.min(1, c.timer); });
  corpses = corpses.filter(c => c.timer > 0);
  KF.forEach(k => k.t -= dt);
  while (KF.length && KF[0].t <= 0) KF.shift();
  dmgT -= dt;
  document.getElementById('dmg').style.borderColor = dmgT > 0 ? 'rgba(200,0,0,.7)' : 'transparent';
}

export function draw(gs, camX, camY, myIdx) {
  cv.width = cv.width; // clears the canvas
  ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (!gs) return;
  ctx.save(); ctx.translate(-camX, -camY);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE, y = r * TILE;
      if (MAP[r][c] === 1) {
        ctx.fillStyle = '#252525'; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1; ctx.strokeRect(x, y, TILE, TILE);
      } else if (MAP[r][c] === 2) {
        ctx.fillStyle = '#3a0000'; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#cc0000'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        ctx.fillStyle = '#ff3333'; ctx.font = 'bold 10px serif'; ctx.textAlign = 'center';
        ctx.fillText('▶', x + TILE / 2, y + TILE / 2 + 4);
      } else {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#0f0f0f' : '#0c0c0c'; ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }

  ctx.strokeStyle = 'rgba(150,0,0,.12)'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, MW - 4, MH - 4);

  bloodPools.forEach(b => {
    ctx.globalAlpha = b.a * .85;
    ctx.fillStyle = '#550000'; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * .6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#330000'; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * .5, b.r * .3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });

  // Weapon mounts
  WWALL.forEach(wp => {
    const w = WEAPONS[wp.wi]; const x = wp.tx * TILE, y = wp.ty * TILE;
    ctx.fillStyle = 'rgba(255,120,0,.06)'; ctx.fillRect(x - 2, y - 2, TILE + 4, TILE + 4);
    ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = '#ff8800'; ctx.font = 'bold 8px Courier New'; ctx.textAlign = 'center'; ctx.fillText(w.name, x + TILE / 2, y + TILE / 2 - 5);
    ctx.fillStyle = '#ffcc00'; ctx.font = '7px Courier New'; ctx.fillText(w.cost + ' pts [Q]', x + TILE / 2, y + TILE / 2 + 6);
  });

  // Drops — bob/pulse animate off the local wall clock (purely cosmetic,
  // so every client can animate it smoothly at 60fps regardless of how
  // often the network state actually updates).
  const animT = Date.now() / 1000;
  gs.drops.forEach(d => {
    const bob = Math.sin(animT * 4) * 3;
    const isPerk = d.type === 'perk';
    const rad = isPerk ? 22 : 14;
    const pulse = isPerk ? (1 + Math.sin(animT * 5) * .12) : 1;
    const color = dropColor(d), label = dropLabel(d);
    ctx.save(); ctx.translate(d.x, d.y + bob);
    if (isPerk) {
      const rot = (Date.now() / 700) % (Math.PI * 2);
      for (let i = 0; i < 6; i++) {
        const a = rot + i * Math.PI / 3;
        ctx.strokeStyle = color + '77'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * (rad + 6), Math.sin(a) * (rad + 6)); ctx.lineTo(Math.cos(a) * (rad + 14), Math.sin(a) * (rad + 14)); ctx.stroke();
      }
      ctx.shadowColor = color; ctx.shadowBlur = 22;
      ctx.strokeStyle = color + '88'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, rad * pulse + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = color + (isPerk ? '44' : '22'); ctx.beginPath(); ctx.arc(0, 0, rad * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = isPerk ? 3 : 1.5;
    if (isPerk) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
    ctx.beginPath(); ctx.arc(0, 0, rad * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    if (isPerk) {
      const icon = PERK_ICONS[d.perk];
      ctx.font = 'bold 18px serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.fillText(icon, 0, 6); ctx.shadowBlur = 0;
      const lw = label.length * 6 + 14;
      ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(-lw / 2, rad * pulse + 5, lw, 14);
      ctx.fillStyle = color; ctx.font = 'bold 8px Courier New'; ctx.fillText(label, 0, rad * pulse + 16);
    } else {
      ctx.fillStyle = color; ctx.font = 'bold 7px Courier New'; ctx.textAlign = 'center'; ctx.fillText(label, 0, 4);
    }
    ctx.restore();
  });

  // Corpses
  corpses.forEach(c => {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle + Math.PI / 2);
    ctx.globalAlpha = Math.max(0, c.alpha * .55);
    ctx.fillStyle = '#1a3a0a'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();
  });

  // Particles
  particles.forEach(p => { ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;

  // Zombies
  gs.zombies.forEach(z => {
    if (!z.alive) return;
    ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(z.angle);
    const fl = z.flashT > 0;
    ctx.fillStyle = fl ? '#fff' : '#2d6b18'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff2200'; ctx.beginPath(); ctx.arc(9, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fl ? '#fff' : '#1e4d10'; ctx.fillRect(-3, -13, 4, 9); ctx.fillRect(-3, 4, 4, 9);
    ctx.restore();
    const bw = 26; ctx.fillStyle = '#400'; ctx.fillRect(z.x - bw / 2, z.y - 22, bw, 3); ctx.fillStyle = '#f00'; ctx.fillRect(z.x - bw / 2, z.y - 22, bw * (z.hp / z.maxHp), 3);
  });

  // Bullets
  gs.bullets.forEach(b => {
    const tr = 10, tx = b.x - Math.cos(b.ang || 0) * tr, ty = b.y - Math.sin(b.ang || 0) * tr;
    const g = ctx.createLinearGradient(tx, ty, b.x, b.y);
    g.addColorStop(0, 'rgba(255,140,0,0)'); g.addColorStop(1, 'rgba(255,240,100,.9)');
    ctx.strokeStyle = g; ctx.lineWidth = (b.size || 3) + 1; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.fillStyle = '#fffde0'; ctx.beginPath(); ctx.arc(b.x, b.y, (b.size || 3) + 1, 0, Math.PI * 2); ctx.fill();
  });

  // Players
  gs.players.forEach((p, i) => {
    if (!p.alive) return;
    const col = PCOLORS[i];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    if (p.perk) { ctx.shadowColor = PERK_COLORS[p.perk]; ctx.shadowBlur = 16; }
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(7, -3, 15, 5); ctx.fillStyle = '#aaa'; ctx.fillRect(7, -2, 15, 3);
    ctx.shadowBlur = 0; ctx.restore();
    const bw = 26, hc = p.hp > 60 ? '#00ee44' : p.hp > 30 ? '#ffaa00' : '#ff2200';
    ctx.fillStyle = '#300'; ctx.fillRect(p.x - bw / 2, p.y - 22, bw, 3); ctx.fillStyle = hc; ctx.fillRect(p.x - bw / 2, p.y - 22, bw * (p.hp / p.maxHp), 3);
    ctx.fillStyle = col; ctx.font = 'bold 9px Courier New'; ctx.textAlign = 'center'; ctx.fillText(p.name, p.x, p.y - 26);
    for (let l = 0; l < MAX_LIVES; l++) { ctx.fillStyle = l < p.lives ? col : '#222'; ctx.beginPath(); ctx.arc(p.x - 8 + l * 8, p.y - 33, 2.5, 0, Math.PI * 2); ctx.fill(); }
  });

  ctx.restore();
  drawMM(gs, myIdx);
}

export function updateHUD(gs, myIdx) {
  if (!gs) return;
  const me = gs.players[myIdx];
  if (!me) return;
  const w = WEAPONS[me.wIdx];
  document.getElementById('wlbl').textContent = 'WAVE ' + gs.wave;
  document.getElementById('btlbl').textContent = gs.between ? '⏱ NEXT IN ' + Math.ceil(gs.betTimer) + 's' : 'ZOMBIES: ' + gs.zombLeft + '/' + gs.zombTotal;
  document.getElementById('ptlbl').textContent = me.points + ' PTS';
  document.getElementById('wn').textContent = w.name + (me.reloading ? ' …RELOADING' : '');
  document.getElementById('ac').textContent = me.clip;
  document.getElementById('ar').textContent = '/ ' + w.ammo + ' · RESERVE: ' + me.reserve;
  document.getElementById('rb').style.width = (me.reloading ? Math.round(me.reloadPct * 100) : 0) + '%';

  const hpEl = document.getElementById('hpbars');
  hpEl.innerHTML = '';
  gs.players.forEach((p, i) => {
    const c = p.hp > 60 ? '#00ee44' : p.hp > 30 ? '#ffaa00' : '#ff2200';
    const lv = '♥'.repeat(p.lives) + '♡'.repeat(Math.max(0, MAX_LIVES - p.lives));
    const row = document.createElement('div'); row.className = 'hprow';
    const nameEl = document.createElement('div'); nameEl.className = 'hpn'; nameEl.style.color = PCOLORS[i]; nameEl.textContent = p.name;
    const bg = document.createElement('div'); bg.className = 'hpbg';
    const fill = document.createElement('div'); fill.className = 'hpfill'; fill.style.width = (p.alive ? p.hp : 0) + '%'; fill.style.background = c;
    bg.appendChild(fill);
    const stat = document.createElement('span'); stat.style.cssText = 'font-size:9px;color:#444;margin-left:3px';
    stat.textContent = (p.alive ? p.hp + '%' : 'DEAD') + ' ' + lv;
    row.append(nameEl, bg, stat);
    hpEl.appendChild(row);
  });

  const pd = document.getElementById('prkd');
  if (me.perk) {
    const c = me.perk === 'nuke' ? '#ff00ff' : me.perk === 'damage' ? '#ff4400' : '#00ffaa';
    pd.textContent = '⚡ ' + me.perk.toUpperCase() + ' (' + Math.ceil(me.perkTimer) + 's)';
    pd.style.color = c;
  } else pd.textContent = '';

  document.getElementById('lives').textContent = 'LIVES: ' + '♥ '.repeat(me.lives) + '♡ '.repeat(Math.max(0, MAX_LIVES - me.lives));

  const ro = document.getElementById('resp');
  if (me.isDead && me.lives > 0) {
    ro.style.display = 'flex';
    document.getElementById('resp-p').textContent = 'YOU DIED';
    document.getElementById('resp-s').textContent = 'Respawn in ' + Math.ceil(me.respTimer) + 's · Lives: ' + me.lives + '/' + MAX_LIVES;
  } else ro.style.display = 'none';
}

function drawMM(gs, myIdx) {
  const mw = 150, mh = 150, sx = mw / MW, sy = mh / MH;
  mctx.fillStyle = 'rgba(0,0,0,.9)'; mctx.fillRect(0, 0, mw, mh);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAP[r][c] === 1) { mctx.fillStyle = '#333'; mctx.fillRect(c * TILE * sx, r * TILE * sy, TILE * sx + 1, TILE * sy + 1); }
      else if (MAP[r][c] === 2) { mctx.fillStyle = '#550000'; mctx.fillRect(c * TILE * sx, r * TILE * sy, TILE * sx + 1, TILE * sy + 1); }
    }
  }
  if (!gs) return;
  gs.drops.forEach(d => { mctx.fillStyle = dropColor(d); mctx.fillRect(d.x * sx - 2, d.y * sy - 2, 4, 4); });
  gs.zombies.forEach(z => { if (!z.alive) return; mctx.fillStyle = '#f00'; mctx.beginPath(); mctx.arc(z.x * sx, z.y * sy, 2, 0, Math.PI * 2); mctx.fill(); });
  gs.players.forEach((p, i) => {
    if (!p.alive) return;
    mctx.fillStyle = PCOLORS[i]; mctx.beginPath(); mctx.arc(p.x * sx, p.y * sy, 4, 0, Math.PI * 2); mctx.fill();
    if (i === myIdx) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.beginPath(); mctx.arc(p.x * sx, p.y * sy, 5, 0, Math.PI * 2); mctx.stroke(); }
  });
  mctx.strokeStyle = '#222'; mctx.lineWidth = 1; mctx.strokeRect(0, 0, mw, mh);
}

const DROP_COLORS = { ammo: '#ffcc00', health: '#00ff88' };
const PERK_COLORS = { damage: '#ff4400', speed: '#00ffaa', nuke: '#ff00ff' };
const PERK_ICONS = { nuke: '☢', damage: '⚡', speed: '💨' };
const PERK_LABELS = { damage: 'DMG×2', speed: 'SPEED', nuke: 'NUKE' };
function dropColor(d) { return d.type === 'perk' ? PERK_COLORS[d.perk] : DROP_COLORS[d.type]; }
function dropLabel(d) { return d.type === 'perk' ? PERK_LABELS[d.perk] : (d.type === 'ammo' ? 'AMMO' : '+HP'); }
