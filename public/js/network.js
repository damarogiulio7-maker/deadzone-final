// Thin WebSocket client. Connects to the same origin the page was served
// from, so this works unmodified on localhost and on a deployed host —
// there's no hardcoded server address to update when you deploy.
let ws = null;
const handlers = {};

export function on(type, fn) { handlers[type] = fn; }

export function connect(onOpen, onError, onClose) {
  if (ws) { ws.onclose = null; ws.close(); }
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(proto + location.host);
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
