/**
 * Socket.IO room join authorization — user may only join their own notification room.
 */
function canJoinUserRoom(socketUserId, requestedUserId) {
  if (!socketUserId || !requestedUserId) return false;
  return String(socketUserId) === String(requestedUserId);
}

module.exports = {
  canJoinUserRoom,
};
