// Multiplayer server endpoint.
//
// Leave this empty to connect back to whatever origin served the page —
// the default "single service" deployment (client + server on the same
// host, e.g. Render alone; see README). Set it explicitly when the client
// is hosted separately from the server, e.g. client on Netlify + server on
// Render: point this at the server's wss:// URL.
export const WS_URL = ''; // e.g. 'wss://deadzone-final.onrender.com'
