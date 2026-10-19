// Connects the page to its game server and announces it.
// Picks a test fake when one is installed (window.__MINIMEP_FAKE), otherwise Firebase when firebase-config.js has a config.
// On success sets window.MiniNet and fires 'mininet-ready'; on failure fires 'mininet-failed'.
//
// window.MiniNet API (both backends):
//   uid                                  this browser's anonymous player id
//   getSession(pin) -> session | null
//   watchSession(pin, cb) -> unsubscribe     cb(session | null)
//   watchPlayers(pin, cb) -> unsubscribe     cb([{id, ...player}])
//   setPlayer(pin, data)                 replace this player's own document
//   createSession(pin, data)             host: create a game (hostUid is added)
//   updateSession(pin, patch)            host: change status
//   removePlayer(pin, playerId)          host: remove a player
async function boot() {
  try {
    let api = null;
    if (window.__MINIMEP_FAKE) api = await window.__MINIMEP_FAKE;
    else if (window.MINIMEP_FIREBASE) api = await (await import('./backend-firebase.js')).connect(window.MINIMEP_FIREBASE);
    if (!api) return;
    window.MiniNet = api;
    window.dispatchEvent(new Event('mininet-ready'));
  } catch (e) {
    console.error('Mini MEP: could not connect', e);
    window.dispatchEvent(new CustomEvent('mininet-failed', { detail: String(e) }));
  }
}
boot();
