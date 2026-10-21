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
//   listMySessions() -> [{pin, ...session}]  host: the games this browser created
//   createSession(pin, data)             host: create a game (hostUid is added)
//   updateSession(pin, patch)            host: change status
//   removePlayer(pin, playerId)          host: remove a player
//   expiresAt(session) -> ms             when a game closes by itself
//
// Games close by themselves after a day: a session past expiresAt reads as closed (expired: true).
// Games from before expiresAt existed count from createdAt; without that they count as long gone.
const DAY = 24 * 3600e3;
const expiresAt = s => s.expiresAt || ((Date.parse(s.createdAt) || 0) + DAY);
const tidy = s => s && s.status !== 'closed' && Date.now() >= expiresAt(s) ? { ...s, status: 'closed', expired: true } : s;
async function boot() {
  try {
    let api = null;
    if (window.__MINIMEP_FAKE) api = await window.__MINIMEP_FAKE;
    else if (window.MINIMEP_FIREBASE) api = await (await import('./backend-firebase.js')).connect(window.MINIMEP_FIREBASE);
    if (!api) return;
    window.MiniNet = { ...api, expiresAt, gameHours: DAY / 3600e3,
      async getSession(pin) { return tidy(await api.getSession(pin)); },
      watchSession(pin, cb) { return api.watchSession(pin, s => cb(tidy(s))); },
      async listMySessions() { return (await api.listMySessions()).map(tidy); } };
    window.dispatchEvent(new Event('mininet-ready'));
  } catch (e) {
    console.error('Mini MEP: could not connect', e);
    window.dispatchEvent(new CustomEvent('mininet-failed', { detail: String(e) }));
  }
}
boot();
