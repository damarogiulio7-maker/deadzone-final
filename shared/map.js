// Shared map/collision logic — used by both the browser client and the Node server.
import { TILE, COLS, ROWS } from './constants.js';

export const DOOR_TILES = [];

export const MAP = (() => {
  const doors = [
    [8, 0], [16, 0], [24, 0], [8, ROWS - 1], [16, ROWS - 1], [24, ROWS - 1],
    [0, 5], [0, 11], [0, 17], [COLS - 1, 5], [COLS - 1, 11], [COLS - 1, 17],
  ];
  const isDoor = (c, r) => doors.some(([dc, dr]) => dc === c && dr === r);
  const m = [];
  for (let r = 0; r < ROWS; r++) {
    m.push([]);
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) { m[r].push(isDoor(c, r) ? 2 : 1); continue; }
      if ((r >= 5 && r <= 6) && (c >= 6 && c <= 7)) { m[r].push(1); continue; }
      if ((r >= 5 && r <= 6) && (c >= 24 && c <= 25)) { m[r].push(1); continue; }
      if ((r >= 15 && r <= 16) && (c >= 6 && c <= 7)) { m[r].push(1); continue; }
      if ((r >= 15 && r <= 16) && (c >= 24 && c <= 25)) { m[r].push(1); continue; }
      if ((r >= 9 && r <= 10) && (c >= 8 && c <= 9)) { m[r].push(1); continue; }
      if ((r >= 11 && r <= 12) && (c >= 22 && c <= 23)) { m[r].push(1); continue; }
      if ((r >= 5 && r <= 6) && (c >= 14 && c <= 15)) { m[r].push(1); continue; }
      if ((r >= 15 && r <= 16) && (c >= 14 && c <= 15)) { m[r].push(1); continue; }
      m[r].push(0);
    }
  }
  doors.forEach(([dc, dr]) => {
    const sx = dc === 0 ? 1 : dc === COLS - 1 ? COLS - 2 : dc;
    const sy = dr === 0 ? 1 : dr === ROWS - 1 ? ROWS - 2 : dr;
    DOOR_TILES.push({ x: sx, y: sy, dc, dr });
  });
  return m;
})();

export function blocked(tx, ty) {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return true;
  return MAP[ty][tx] === 1;
}

export function wallHit(x, y, r = 11) {
  return blocked(Math.floor((x - r) / TILE), Math.floor((y - r) / TILE)) ||
         blocked(Math.floor((x + r) / TILE), Math.floor((y - r) / TILE)) ||
         blocked(Math.floor((x - r) / TILE), Math.floor((y + r) / TILE)) ||
         blocked(Math.floor((x + r) / TILE), Math.floor((y + r) / TILE));
}

export function clamp(e, r = 11) {
  const MW = COLS * TILE, MH = ROWS * TILE;
  e.x = Math.max(r, Math.min(MW - r, e.x));
  e.y = Math.max(r, Math.min(MH - r, e.y));
}

export function slide(e, dx, dy, r = 11) {
  const MW = COLS * TILE, MH = ROWS * TILE;
  clamp(e, r);
  const nx = Math.max(r, Math.min(MW - r, e.x + dx));
  const ny = Math.max(r, Math.min(MH - r, e.y + dy));
  if (!wallHit(nx, e.y, r)) e.x = nx;
  if (!wallHit(e.x, ny, r)) e.y = ny;
  clamp(e, r);
}

export function safePos(tx, ty) {
  for (let d = 0; d < 8; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        const r2 = ty + dr, c2 = tx + dc;
        if (r2 > 0 && r2 < ROWS - 1 && c2 > 0 && c2 < COLS - 1 && MAP[r2][c2] === 0) {
          return { x: (c2 + .5) * TILE, y: (r2 + .5) * TILE };
        }
      }
    }
  }
  return { x: 16 * TILE, y: 11 * TILE };
}

export function zombieSpawn() {
  const d = DOOR_TILES[Math.floor(Math.random() * DOOR_TILES.length)];
  return { x: (d.x + .5) * TILE, y: (d.y + .5) * TILE };
}
