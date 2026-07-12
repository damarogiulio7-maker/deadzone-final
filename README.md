# DEAD ZONE

Co-op top-down zombie survival, 1-4 players. Solo runs entirely offline in the
browser; multiplayer connects to a small Node WebSocket server that owns the
game state, so friends can play together over the internet.

## Project layout

```
shared/     Game rules — map, entities, and the simulation step. No DOM,
            no server APIs. Imported unmodified by both the browser
            (solo play) and the server (multiplayer), so there's exactly
            one implementation of "what happens when a zombie hits you".
server/     Node WebSocket server. Authoritative for multiplayer: it
            simulates every room's game and broadcasts state; clients only
            ever send input, never gameplay state.
public/     The browser client — HTML, CSS, and JS modules (rendering,
            input, audio, lobby/menu UI, networking).
```

## Running locally

Requires Node.js 18+.

```
npm install
npm start
```

Then open `http://localhost:3000`. To test multiplayer, open the same URL in
a second tab/browser — "CREA STANZA MULTIPLAYER" in one, then join with the
room code in the other.

There's no build step and no bundler: the client is loaded as native ES
modules straight from `public/js/*.js` and `shared/*.js`.

## Deploying

The server serves the client itself (static files + WebSocket on the same
HTTP port), so this is a single deployable service — e.g. on Render, Railway,
Fly.io, or any host that runs `npm install && npm start` and exposes one
port. No separate static hosting or CORS config needed, and no server URL to
hardcode in the client: it always connects back to whatever origin served the
page (`wss://` on https, `ws://` on http).

Set `PORT` if your host requires it; defaults to 3000.

## Multiplayer architecture

The server is authoritative: it runs `stepSim()` from `shared/sim.js` on a
fixed 20Hz tick per room and broadcasts the resulting state. Clients send
only `input` (movement/aim/fire, sent ~30x/sec) and one-shot `action`
messages (reload/buy/pickup/reset-position). This means:

- Every player in a room sees the same zombies, waves, and hits — nothing is
  simulated independently per-client and then patched over.
- A client can't fake a kill, a pickup, or its own score; the server decides.

Two techniques keep this feeling smooth despite the 20Hz tick and network
latency, both client-side only — the server's authority is unaffected either way:

- **Client-side prediction** (`public/js/main.js`): your own player moves
  immediately from local input using the exact same physics the server uses
  (`playerSpeed()` + `slide()` from `shared/`), instead of waiting a round
  trip to see yourself move. It's continuously reconciled against the
  server's confirmed position for you — small drift is smoothed out over a
  few frames, a large gap (respawn, a hit you didn't predict) snaps instantly.
- **Snapshot interpolation** (`public/js/interp.js`): zombies, bullets, and
  other players are rendered ~100ms behind real time, interpolated between
  the two actual snapshots that bracket that moment (matched by stable
  entity id), rather than jumping to a new position every ~50ms tick. This
  is the same "delayed interpolation" approach used by most
  server-authoritative multiplayer games.

Purely cosmetic effects (blood, corpses, particles, screen flash, banners)
are never part of the synced game state — the sim emits lightweight events
(`gs.events`, cleared each tick) and each client renders its own effects
from them locally.
