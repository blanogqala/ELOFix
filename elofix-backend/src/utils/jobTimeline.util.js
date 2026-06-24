const TIMELINE_EVENTS_MAX = 50;

function normalizeTimelineEvents(events) {
  const arr = Array.isArray(events) ? events : [];
  return arr
    .filter((e) => e && typeof e === "object" && e.type && e.at)
    .slice(-TIMELINE_EVENTS_MAX);
}

function hasTimelineEventType(meta, type) {
  const events = normalizeTimelineEvents(meta && meta.timelineEvents);
  return events.some((e) => String(e.type) === String(type));
}

function appendTimelineEventIfAbsent(meta, event) {
  const base = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  const events = normalizeTimelineEvents(base.timelineEvents);
  if (events.some((e) => String(e.type) === String(event.type))) {
    return { ...base, timelineEvents: events };
  }
  const next = {
    type: String(event.type),
    at: String(event.at),
  };
  if (event.source) next.source = String(event.source);
  return {
    ...base,
    timelineEvents: [...events, next].slice(-TIMELINE_EVENTS_MAX),
  };
}

module.exports = {
  TIMELINE_EVENTS_MAX,
  normalizeTimelineEvents,
  hasTimelineEventType,
  appendTimelineEventIfAbsent,
};
