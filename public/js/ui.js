// Lobby, modals (options/pause/abandon), and pre-game status UI. Game-in-progress
// HUD/canvas rendering lives in render.js; this module owns everything shown
// before/around a match. Business logic (what happens when you click "host",
// what the server said) is decided by main.js and passed in via callbacks —
// this module only touches the DOM.
import { toggleStereo } from './audio.js';

export function showModal(id) { document.getElementById(id).style.display = 'flex'; }
export function hideModal(id) { document.getElementById(id).style.display = 'none'; }
export function isModalOpen(id) { return document.getElementById(id).style.display === 'flex'; }

export function showProgress(label, ms, cb) {
  document.getElementById('pb-lbl').textContent = label;
  document.getElementById('pb-lbl').style.display = 'block';
  document.getElementById('pb-wrap').style.display = 'block';
  const bar = document.getElementById('pb');
  bar.style.width = '0%';
  let i = 0;
  const t = setInterval(() => {
    i++;
    bar.style.width = (i / 50 * 100) + '%';
    if (i >= 50) { clearInterval(t); setTimeout(cb, 120); }
  }, ms / 50);
}

function hideProgress() {
  document.getElementById('pb-lbl').style.display = 'none';
  document.getElementById('pb-wrap').style.display = 'none';
}

export function setStatus(elId, text, ok) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.className = 'st' + (ok === true ? ' ok' : ok === false ? ' err' : '');
}

export function showRoomCreated(code) {
  document.getElementById('rc').textContent = code;
  document.getElementById('rc').style.display = 'block';
  document.getElementById('cl-wrap').style.display = 'block';
  document.getElementById('bstart').style.display = 'block';
  setStatus('sh', 'Stanza pronta! Codice: ' + code, true);
  hideProgress();
}

export function updateLobbyPlayerCount(count) {
  document.getElementById('bstart').textContent = '▶ INIZIA (' + count + '/4)';
}

export function showJoinedStatus() {
  setStatus('sj', "Connesso — aspetta l'host", true);
  hideProgress();
}

export function showConnError(elId, msg) {
  setStatus(elId, msg, false);
  hideProgress();
}

export function hideLobby() { document.getElementById('lobby').style.display = 'none'; }
export function showHud() { document.getElementById('hud').style.display = 'block'; }

export function showGameOver(wave, points) {
  document.getElementById('go-w').textContent = 'Hai resistito fino alla WAVE ' + wave;
  document.getElementById('go-p').textContent = 'Punti totali: ' + points;
  document.getElementById('go').style.display = 'flex';
}

export function readRoomFromURL() {
  const p = new URLSearchParams(location.search);
  const r = p.get('room');
  if (!r) return;
  document.getElementById('jc').value = r.toUpperCase();
  setStatus('sj', 'Codice dal link: ' + r.toUpperCase(), true);
}

export function initUI(cb) {
  document.getElementById('bsolo').onclick = () => {
    const name = document.getElementById('hn').value.trim() || 'Giulio';
    showProgress('AVVIO...', 900, () => cb.onSolo(name));
  };
  document.getElementById('bhost').onclick = () => {
    const name = document.getElementById('hn').value.trim() || 'Host';
    showProgress('CREAZIONE STANZA...', 1400, () => cb.onHostCreate(name));
  };
  document.getElementById('bcopy').onclick = () => {
    cb.onCopyInvite(url => {
      navigator.clipboard.writeText(url).catch(() => {}).finally(() => {
        const btn = document.getElementById('bcopy');
        btn.textContent = '✓ COPIATO!';
        setTimeout(() => { btn.textContent = '📋 COPIA LINK INVITO'; }, 2000);
      });
    });
  };
  document.getElementById('bstart').onclick = () => cb.onStart();
  document.getElementById('bjoin').onclick = () => {
    const name = document.getElementById('jn').value.trim() || 'Player';
    const code = document.getElementById('jc').value.trim().toUpperCase();
    if (!code) { setStatus('sj', 'Inserisci il codice!', false); return; }
    showProgress('CONNESSIONE A ' + code + '...', 1800, () => cb.onJoin(name, code));
  };

  document.getElementById('lobby-opt-btn').onclick = () => showModal('opt-modal');
  document.getElementById('lobby-stereo-btn').onclick = toggleStereo;
  document.getElementById('opt-close-btn').onclick = () => hideModal('opt-modal');

  document.getElementById('pause-resume-btn').onclick = () => cb.onResume();
  document.getElementById('pause-opt-btn').onclick = () => { hideModal('pause-modal'); showModal('opt-modal'); };
  document.getElementById('pause-stereo-btn').onclick = toggleStereo;
  document.getElementById('pause-abandon-btn').onclick = () => showModal('abandon-modal');

  document.getElementById('abandon-no-btn').onclick = () => hideModal('abandon-modal');
  document.getElementById('abandon-yes-btn').onclick = () => location.reload();

  document.getElementById('hud-pause-btn').onclick = () => cb.onPause();
  document.getElementById('hud-stereo-btn').onclick = toggleStereo;

  document.getElementById('go-replay-btn').onclick = () => location.reload();

  readRoomFromURL();
}
