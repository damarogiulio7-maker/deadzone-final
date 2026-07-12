// Snapshot interpolation buffer for smooth multiplayer rendering.
//
// The server only broadcasts state ~20x/sec, but the browser renders at up
// to 60-144fps. Rather than holding entities at a stale position and
// jumping them every ~50ms, we keep a short history of received snapshots
// and render slightly in the past (INTERP_DELAY_MS), so there are always
// two real snapshots to interpolate between instead of guessing ahead of
// what the server has actually confirmed. This is the same "delayed
// interpolation" approach most server-authoritative multiplayer games use
// (e.g. Source engine's cl_interp). It only affects what's drawn — gs itself
// (used for HUD text, ammo, points, wave) always reflects the latest
// snapshot with no delay.
const BUFFER_MS = 300;
export const INTERP_DELAY_MS = 100;

let buffer = []; // [{t, state}], oldest first

export function reset() { buffer = []; }

export function pushSnapshot(state) {
  buffer.push({ t: performance.now(), state });
  const cutoff = performance.now() - BUFFER_MS;
  while (buffer.length > 2 && buffer[1].t < cutoff) buffer.shift();
}

// Finds the two buffered snapshots bracketing renderTime and an interpolation
// factor between them. Returns null if nothing has been received yet.
export function sampleBracket(renderTime) {
  if (buffer.length === 0) return null;
  if (buffer.length === 1) return { s0: buffer[0].state, s1: buffer[0].state, alpha: 0 };
  const first = buffer[0], last = buffer[buffer.length - 1];
  if (renderTime <= first.t) return { s0: first.state, s1: first.state, alpha: 0 };
  if (renderTime >= last.t) return { s0: last.state, s1: last.state, alpha: 0 };
  for (let i = 0; i < buffer.length - 1; i++) {
    const a = buffer[i], b = buffer[i + 1];
    if (renderTime >= a.t && renderTime <= b.t) {
      const alpha = b.t > a.t ? (renderTime - a.t) / (b.t - a.t) : 0;
      return { s0: a.state, s1: b.state, alpha };
    }
  }
  return { s0: last.state, s1: last.state, alpha: 0 };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

// Builds a render-only game state: same shape as a server snapshot, but with
// zombies/bullets/other-players' positions interpolated between the two
// bracketing snapshots (matched by stable id). Never used for gameplay
// decisions, only for drawing. `localOverride` replaces our own player's
// position with the client-predicted one (see main.js) so our own movement
// never has interpolation delay on top of it.
export function buildRenderState(bracket, myIdx, localOverride) {
  const { s0, s1, alpha } = bracket;
  const indexOf = (arr) => { const m = new Map(); for (const e of arr) m.set(e.id, e); return m; };

  const z0 = indexOf(s0.zombies);
  const zombies = s1.zombies.map(z => {
    const prev = z0.get(z.id);
    if (!prev) return z;
    return { ...z, x: lerp(prev.x, z.x, alpha), y: lerp(prev.y, z.y, alpha), angle: lerpAngle(prev.angle, z.angle, alpha) };
  });

  const b0 = indexOf(s0.bullets);
  const bullets = s1.bullets.map(b => {
    const prev = b0.get(b.id);
    if (!prev) return b;
    return { ...b, x: lerp(prev.x, b.x, alpha), y: lerp(prev.y, b.y, alpha) };
  });

  const players = s1.players.map((p, i) => {
    if (i === myIdx && localOverride) return { ...p, x: localOverride.x, y: localOverride.y, angle: localOverride.angle };
    const prev = s0.players[i];
    if (!prev || prev.alive !== p.alive) return p;
    return { ...p, x: lerp(prev.x, p.x, alpha), y: lerp(prev.y, p.y, alpha), angle: lerpAngle(prev.angle, p.angle, alpha) };
  });

  return { ...s1, zombies, bullets, players };
}
