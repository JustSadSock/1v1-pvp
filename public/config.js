// Configuration for client-server connection.
// By default, use the public cloudflared endpoint. Override by setting window.SERVER_HOST
// in the global scope (e.g., editing this file) before loading game.js.
(function configureServerHost() {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  // Prefer an existing override but fall back to local dev or the public Cloudflare tunnel.
  const defaultHost = isLocalhost ? `${window.location.hostname}:3000` : 'irgri.uk';
  if (!window.SERVER_HOST) {
    window.SERVER_HOST = defaultHost;
  }
})();
