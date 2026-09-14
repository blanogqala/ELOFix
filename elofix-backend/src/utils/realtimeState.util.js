/**
 * Socket.IO readiness flag. Kept separate from app.js / server.js so
 * /ready can observe realtime init without a circular require.
 */
let realtimeInitialized = false;

function setRealtimeInitialized(value) {
  realtimeInitialized = Boolean(value);
}

function isRealtimeInitialized() {
  return realtimeInitialized;
}

module.exports = {
  setRealtimeInitialized,
  isRealtimeInitialized,
};
