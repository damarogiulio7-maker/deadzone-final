// Local music player ("stereo"). Purely a client-side convenience feature —
// tracks are loaded from the player's own device via <input type=file> and
// never leave the browser, so there's no need to sync this over the network.
import { S } from './settings.js';

let tracks = [], tIdx = 0, audio = null, playing = false, shuf = false;

function renderTracks() {
  const el = document.getElementById('st-list');
  el.innerHTML = '';
  tracks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'st-track' + (i === tIdx ? ' now' : '');
    row.textContent = t.name; // local filenames only — textContent is enough, but also never networked
    row.addEventListener('click', () => playTrack(i));
    el.appendChild(row);
  });
}

export function playTrack(idx) {
  if (!tracks.length) return;
  if (audio) { audio.pause(); audio.src = ''; }
  tIdx = idx;
  audio = new Audio(tracks[tIdx].url);
  audio.volume = S.musicVol;
  audio.onended = () => playTrack(shuf ? Math.floor(Math.random() * tracks.length) : (tIdx + 1) % tracks.length);
  audio.play().catch(() => {});
  playing = true;
  document.getElementById('st-name').textContent = tracks[tIdx].name;
  document.getElementById('st-play').textContent = '⏸';
  renderTracks();
}

export function setMusicVolume(v01) {
  S.musicVol = v01;
  if (audio) audio.volume = v01;
  const pct = Math.round(v01 * 100);
  document.getElementById('st-vol').value = pct;
  document.getElementById('st-vl').textContent = pct;
}

export function toggleStereo() {
  const el = document.getElementById('stereo');
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

export function initStereo() {
  document.getElementById('st-file').onchange = e => {
    for (const f of e.target.files) tracks.push({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) });
    renderTracks();
    if (!playing && tracks.length) playTrack(0);
  };
  document.getElementById('st-vol').oninput = function () { setMusicVolume(this.value / 100); syncMasterVolLabel(); };
  document.getElementById('st-play').onclick = () => {
    if (!tracks.length) return;
    if (!audio) playTrack(0);
    else if (playing) { audio.pause(); playing = false; document.getElementById('st-play').textContent = '▶'; }
    else { audio.play().catch(() => {}); playing = true; document.getElementById('st-play').textContent = '⏸'; }
  };
  document.getElementById('st-next').onclick = () => tracks.length && playTrack((tIdx + 1) % tracks.length);
  document.getElementById('st-prev').onclick = () => tracks.length && playTrack((tIdx - 1 + tracks.length) % tracks.length);
  document.getElementById('st-shuf').onclick = function () { shuf = !shuf; this.style.color = shuf ? '#ffcc00' : '#888'; };
  document.getElementById('stereo-close-btn').onclick = toggleStereo;
}

function syncMasterVolLabel() {
  document.getElementById('lmm').textContent = Math.round(S.musicVol * 100);
  document.getElementById('omm').value = Math.round(S.musicVol * 100);
}
