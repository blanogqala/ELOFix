const { randomUUID } = require("crypto");
const { readState, updateState } = require("./jsonStore.service");

async function getNotifications(userId) {
  const state = await readState();
  const list = state.notificationsByUser?.[userId] || [];
  return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function addNotification(notification) {
  const item = {
    id: randomUUID(),
    userId: String(notification.userId),
    type: String(notification.type || "job_completed"),
    title: String(notification.title || "Notification"),
    message: String(notification.message || ""),
    read: false,
    jobId: notification.jobId || undefined,
    createdAt: new Date().toISOString(),
  };
  await updateState((state) => {
    state.notificationsByUser = state.notificationsByUser || {};
    const current = state.notificationsByUser[item.userId] || [];
    state.notificationsByUser[item.userId] = [item, ...current];
    return state;
  });
  return item;
}

async function markAsRead(userId, notificationId) {
  await updateState((state) => {
    state.notificationsByUser = state.notificationsByUser || {};
    const current = state.notificationsByUser[userId] || [];
    state.notificationsByUser[userId] = current.map((n) =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    return state;
  });
}

async function markAllAsRead(userId) {
  await updateState((state) => {
    state.notificationsByUser = state.notificationsByUser || {};
    const current = state.notificationsByUser[userId] || [];
    state.notificationsByUser[userId] = current.map((n) => ({ ...n, read: true }));
    return state;
  });
}

async function getUnreadCount(userId) {
  const list = await getNotifications(userId);
  return list.filter((n) => !n.read).length;
}

module.exports = {
  getNotifications,
  addNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
