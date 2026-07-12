// Thin WebSocket client. Defaults to connecting back to the same origin the
// page was served from (works unmodified on localhost and on a single-service
// deploy). If the client is hosted separately from the server (e.g. Netlify
// + Render), set WS_URL in config.js instead.
import { WS_URL } from './config.js';

let ws = null;
const handlers = {};

export function on(type, fn) { handlers[type] = fn; }

export function connect(onOpen, onError, onClose) {
  if (ws) { ws.onclose = null; ws.close(); }
  const url = WS_URL || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws = new WebSocket(url);
  ws.onopen = () => onOpen && onOpen();
  ws.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    const h = handlers[msg.type];
    if (h) h(msg);
  };
  ws.onerror = () => onError && onError();
  ws.onclose = () => onClose && onClose();
}

export function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

export function isOpen() {
  return !!ws && ws.readyState === WebSocket.OPEN;
}
