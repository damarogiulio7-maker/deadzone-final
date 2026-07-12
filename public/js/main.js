// Composition root: wires network, input, rendering and UI together and owns
// the top-level game/session state.
//
// Solo play never touches the network — it runs the shared simulation
// (shared/sim.js) directly in the browser every frame, exactly like the
// server does for multiplayer. Multiplayer clients never simulate gameplay
// locally: they only send input to the server and render whatever state it
// broadcasts back, so the server is the single source of truth and every
// client always sees the same world.
import { createGameState, stepSim, applyAction, playerSpeed } from '/shared/sim.js';
import { slide } from '/shared/map.js';
import { MW, MH } from '/shared/constants.js';
import * as net from './network.js';
import * as input from './input.js';
import * as interp from './interp.js';
import {
  draw, updateHUD, tickCosmetics, applyEvents, resetCosmetics,
  resizeCanvas, getCanvas, showAnn,
} from './render.js';
import {
  initUI, hideLobby, showHud, showGameOver, showRoomCreated,
  updateLobbyPlayerCount, showJoinedStatus, showConnError, showModal, hideModal, isModalOpen,
} from './ui.js';
import { initStereo, toggleStereo, setMusicVolume } from './audio.js';
import { initSettingsUI } from './settings.js';

const cv = getCanvas();

let gs = null, myIdx = 0, gameRunning = false, gamePaused = false, isSolo = true;
let camX = 0, camY = 0, lastT = 0, roomCode = '';
let lastLocalInput = { dx: 0, dy: 0, angle: 0, firing: false };

// Client-side prediction for our own player in multiplayer: we move
// ourselves immediately from local input using the exact same physics as
// the server (shared/map.js `slide` + shared/sim.js `playerSpeed`), instead
// of waiting ~1 round-trip to see ourselves move. The server's reported
// position for us is still the truth — see reconcile() below.
const predicted = { x: 0, y: 0, angle: 0, inited: false };

function computeLocalInput() {
  let dx = 0, dy = 0;
  if (input.keys['KeyW'] || input.keys['ArrowUp']) dy -= 1;
  if (input.keys['KeyS'] || input.keys['ArrowDown']) dy += 1;
  if (input.keys['KeyA'] || input.keys['ArrowLeft']) dx -= 1;
  if (input.keys['KeyD'] || input.keys['ArrowRight']) dx += 1;
  if (input.touch.move.x || input.touch.move.y) { dx += input.touch.move.x; dy += input.touch.move.y; }
  if (dx || dy) { const l = Math.hypot(dx, dy); dx /= l; dy /= l; }

  // Aim relative to whatever position we're actually rendering ourselves at
  // (predicted, in multiplayer) so the crosshair lines up with what's on screen.
  const posRef = (!isSolo && predicted.inited) ? predicted : (gs && gs.players[myIdx]);
  let angle = lastLocalInput.angle;
  if (input.touch.aim.active) angle = input.touch.aim.angle;
  else if (posRef) angle = Math.atan2((input.mouse.y + camY) - posRef.y, (input.mouse.x + camX) - posRef.x);

  const firing = input.mouse.down || input.touch.fire;
  return { dx, dy, angle, firing };
}

function updatePrediction(dt, inp) {
  const truth = gs && gs.players[myIdx];
  if (!truth) return;
  if (!predicted.inited) {
    predicted.x = truth.x; predicted.y = truth.y; predicted.angle = truth.angle; predicted.inited = true;
  }
  if (!truth.alive) {
    // Dead/respawning: server owns this entirely, nothing to predict.
    predicted.x = truth.x; predicted.y = truth.y; predicted.angle = truth.angle;
    return;
  }

  const spd = playerSpeed(truth);
  slide(predicted, inp.dx * spd * dt, inp.dy * spd * dt, 11);
  predicted.angle = inp.angle;

  // Reconcile against the server's last confirmed position for us. Small
  // drift (rounding, minor timing differences) is corrected smoothly over a
  // few frames; a large gap (respawn, a hit we didn't predict) snaps
  // instantly instead of visibly sliding across the map.
  const dist = Math.hypot(truth.x - predicted.x, truth.y - predicted.y);
  if (dist > 60) {
    predicted.x = truth.x; predicted.y = truth.y;
  } else if (dist > 0.5) {
    const correction = Math.min(1, dt * 10);
    predicted.x += (truth.x - predicted.x) * correction;
    predicted.y += (truth.y - predicted.y) * correction;
  }
}

function dispatchAction(action) {
  if (!gameRunning || !gs) return;
  const me = gs.players[myIdx];
  if (!me || !me.alive) return;
  if (isSolo) applyAction(gs, me, action);
  else net.send({ type: 'action', action });
}

function onGameOver(wave, points) {
  gameRunning = false;
  showGameOver(wave, points);
}

function frame(ts) {
  const dt = Math.min((ts - lastT) / 1000, .05);
  lastT = ts;

  let renderGs = gs;

  if (gameRunning && gs) {
    const me = gs.players[myIdx];
    const inp = computeLocalInput();
    lastLocalInput = inp;

    if (isSolo) {
      if (me) { me.input.dx = inp.dx; me.input.dy = inp.dy; me.input.angle = inp.angle; me.input.firing = inp.firing; }
      stepSim(gs, dt);
      applyEvents(gs.events.splice(0), myIdx, onGameOver);
      if (me && me.alive) {
        camX = Math.max(0, Math.min(me.x - cv.width / 2, MW - cv.width));
        camY = Math.max(0, Math.min(me.y - cv.height / 2, MH - cv.height));
      }
      renderGs = gs;
    } else {
      updatePrediction(dt, inp);
      if (me && me.alive) {
        camX = Math.max(0, Math.min(predicted.x - cv.width / 2, MW - cv.width));
        camY = Math.max(0, Math.min(predicted.y - cv.height / 2, MH - cv.height));
      }
      const renderTime = performance.now() - interp.INTERP_DELAY_MS;
      const bracket = interp.sampleBracket(renderTime);
      renderGs = bracket ? interp.buildRenderState(bracket, myIdx, predicted) : gs;
    }

    tickCosmetics(dt);
    updateHUD(gs, myIdx);
  }

  draw(renderGs, camX, camY, myIdx);
  if (gameRunning || gamePaused) requestAnimationFrame(frame);
}

// Multiplayer input is sent on its own cadence, independent of render rate,
// so a slow/fast display doesn't flood (or starve) the server.
setInterval(() => {
  if (!isSolo && gameRunning && net.isOpen()) net.send({ type: 'input', ...lastLocalInput });
}, 33);

function beginGame() {
  hideLobby(); showHud();
  resizeCanvas();
  resetCosmetics();
  interp.reset();
  predicted.inited = false;
  gameRunning = true; gamePaused = false;
  input.initTouch(() => dispatchAction('reload'), () => dispatchAction('buy'));
  showAnn('GET READY!');
  lastT = performance.now();
  requestAnimationFrame(frame);
}

function onPause() {
  if (!gameRunning) return;
  gamePaused = true; gameRunning = false;
  // Freeze our own player's input server-side immediately, otherwise a paused
  // client would keep moving/firing with whatever input was held at pause time.
  if (!isSolo) net.send({ type: 'input', dx: 0, dy: 0, angle: lastLocalInput.angle, firing: false });
  showModal('pause-modal');
}
function onResume() {
  hideModal('pause-modal');
  gamePaused = false; gameRunning = true;
  lastT = performance.now();
  requestAnimationFrame(frame);
}

function connErrorBoth() {
  showConnError('sh', 'Connection error');
  showConnError('sj', 'Connection error');
}
function onDisconnect() {
  if (gameRunning) { showAnn('CONNECTION LOST'); gameRunning = false; }
  else connErrorBoth();
}

net.on('created', msg => { roomCode = msg.code; myIdx = msg.index; showRoomCreated(roomCode); });
net.on('joined', msg => { myIdx = msg.index; showJoinedStatus(); });
net.on('error', msg => showConnError('sj', msg.msg));
net.on('shutdown', () => {
  if (gameRunning) { showAnn('SERVER RESTARTING'); gameRunning = false; }
  else connErrorBoth();
});
net.on('playerJoined', msg => updateLobbyPlayerCount(msg.playerCount));
net.on('playerLeft', msg => { if (!gameRunning) updateLobbyPlayerCount(msg.playerCount); });
net.on('startGame', () => { if (!gameRunning) beginGame(); });
net.on('state', msg => {
  gs = msg.state;
  interp.pushSnapshot(msg.state);
  applyEvents(msg.events || [], myIdx, onGameOver);
});

initUI({
  onSolo(name) {
    isSolo = true; myIdx = 0;
    gs = createGameState([name]);
    beginGame();
  },
  onHostCreate(name) {
    isSolo = false;
    net.connect(() => net.send({ type: 'create', name }), connErrorBoth, onDisconnect);
  },
  onJoin(name, code) {
    isSolo = false; roomCode = code;
    net.connect(() => net.send({ type: 'join', code, name }), connErrorBoth, onDisconnect);
  },
  onCopyInvite(cb) { cb(location.href.split('?')[0] + '?room=' + roomCode); },
  onStart() { net.send({ type: 'startGame' }); },
  onPause, onResume,
});

initSettingsUI(setMusicVolume);
initStereo();
input.initKeyboard((code) => {
  if (code === 'Escape') {
    if (isModalOpen('opt-modal')) { hideModal('opt-modal'); return; }
    if (isModalOpen('pause-modal')) { onResume(); return; }
    if (gameRunning) { onPause(); return; }
    if (!gameRunning && !gamePaused) showModal('opt-modal');
    return;
  }
  if (code === 'KeyM') toggleStereo();
  if (!gameRunning || !gs) return;
  const me = gs.players[myIdx];
  if (!me || !me.alive) return;
  if (code === 'KeyR') dispatchAction('reload');
  if (code === 'KeyQ' || code === 'KeyE') dispatchAction('buy');
  if (code === 'KeyF') dispatchAction('pickup');
  if (code === 'Digit1') dispatchAction('reset');
});
input.initPointer(cv);
window.addEventListener('resize', resizeCanvas);

requestAnimationFrame(() => draw(gs, camX, camY));
