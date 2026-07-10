const prisma = require("../config/prisma");
const { ACTION_CATEGORIES } = require("../constants/auditActions");
const { deriveSeverity } = require("../utils/auditSeverity.util");

const EXPORT_MAX_ROWS = 10000;

function parseDateStart(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateEnd(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function actionsForCategory(category) {
  const key = String(category || "").trim().toLowerCase();
  if (!key || key === "all") return null;
  const prefixes = ACTION_CATEGORIES[key];
  if (!prefixes) return null;
  return prefixes;
}

function matchesCategory(action, category) {
  const prefixes = actionsForCategory(category);
  if (!prefixes) return true;
  const a = String(action || "");
  return prefixes.some((p) => a.startsWith(p));
}

function buildWhere(query = {}) {
  const where = {};
  const and = [];

  const entityType = String(query.entityType || "").trim().toLowerCase();
  if (entityType && entityType !== "all") {
    and.push({ entityType });
  }

  const userId = String(query.userId || "").trim();
  if (userId) {
    and.push({ userId });
  }

  const actorType = String(query.actorType || "").trim().toUpperCase();
  if (actorType && actorType !== "ALL") {
    and.push({ actorType });
  }

  const actorRole = String(query.actorRole || query.userRole || "").trim().toUpperCase();
  if (actorRole && actorRole !== "ALL") {
    and.push({ user: { role: actorRole } });
  }

  const from = parseDateStart(query.from);
  const to = parseDateEnd(query.to);
  if (from || to) {
    const createdAt = {};
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    and.push({ createdAt });
  }

  const search = String(query.search || "").trim();
  if (search) {
    and.push({
      OR: [
        { action: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search, mode: "insensitive" } },
        {
          user: {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
}

function toRowDto(row, deviceProfile = null) {
  const device = deviceProfile
    ? {
        os: deviceProfile.os || null,
        city: deviceProfile.city || null,
        country: deviceProfile.country || null,
        userAgent: deviceProfile.userAgent || null,
      }
    : null;
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name || null,
    userEmail: row.user?.email || null,
    userRole: row.user?.role || null,
    actorType: row.actorType,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    oldValue: row.oldValue,
    newValue: row.newValue,
    ipAddress: row.ipAddress,
    deviceFingerprint: row.deviceFingerprint,
    metadata: row.metadata,
    severity: deriveSeverity(row.action),
    device,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

async function loadDeviceProfilesForRows(rows) {
  const fingerprints = [
    ...new Set(
      rows
        .map((r) => String(r.deviceFingerprint || "").trim())
        .filter(Boolean)
    ),
  ];
  if (fingerprints.length === 0) return new Map();
  const profiles = await prisma.deviceProfile.findMany({
    where: { deviceFingerprint: { in: fingerprints } },
    select: {
      deviceFingerprint: true,
      os: true,
      city: true,
      country: true,
      userAgent: true,
    },
  });
  return new Map(profiles.map((p) => [p.deviceFingerprint, p]));
}

function mapRowsToDtos(rows, deviceMap) {
  return rows.map((row) => {
    const fp = String(row.deviceFingerprint || "").trim();
    const deviceProfile = fp ? deviceMap.get(fp) || null : null;
    return toRowDto(row, deviceProfile);
  });
}

function filterBySeverity(dtos, severity) {
  const s = String(severity || "").trim().toLowerCase();
  if (!s || s === "all") return dtos;
  return dtos.filter((d) => d.severity === s);
}

function filterByCategory(rows, category) {
  if (!category || String(category).trim().toLowerCase() === "all") return rows;
  return rows.filter((r) => matchesCategory(r.action, category));
}

async function listAuditLogs(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const category = query.actionCategory;
  const severity = query.severity;

  const where = buildWhere(query);
  const needsPostFilter = (category && category !== "all") || (severity && severity !== "all");

  let items = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: needsPostFilter ? limit + offset + 500 : limit,
    skip: needsPostFilter ? 0 : offset,
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (category && category !== "all") {
    items = filterByCategory(items, category);
  }

  const deviceMap = await loadDeviceProfilesForRows(items);
  let dtos = mapRowsToDtos(items, deviceMap);
  dtos = filterBySeverity(dtos, severity);

  if (needsPostFilter) {
    const total = dtos.length;
    dtos = dtos.slice(offset, offset + limit);
    return { items: dtos, total };
  }

  const total = await prisma.auditLog.count({ where });
  return { items: dtos, total };
}

function csvEscape(value) {
  if (value == null) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows) {
  const headers = [
    "Time",
    "Actor",
    "Actor Type",
    "Action",
    "Entity Type",
    "Entity ID",
    "Old Value",
    "New Value",
    "IP Address",
    "Device Fingerprint",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.createdAt,
        row.userEmail || row.userName || row.userId || "",
        row.actorType,
        row.action,
        row.entityType || "",
        row.entityId || "",
        row.oldValue,
        row.newValue,
        row.ipAddress || "",
        row.deviceFingerprint || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

async function exportAuditLogsCsv(query = {}) {
  const category = query.actionCategory;
  const where = buildWhere(query);

  let rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_MAX_ROWS + 1,
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (category && category !== "all") {
    rows = filterByCategory(rows, category);
  }

  const deviceMap = await loadDeviceProfilesForRows(rows);
  let dtos = mapRowsToDtos(rows, deviceMap);
  dtos = filterBySeverity(dtos, query.severity);

  const truncated = dtos.length > EXPORT_MAX_ROWS;
  if (truncated) {
    dtos = dtos.slice(0, EXPORT_MAX_ROWS);
  } else if (rows.length > EXPORT_MAX_ROWS) {
    dtos = dtos.slice(0, EXPORT_MAX_ROWS);
  }

  return { csv: rowsToCsv(dtos), truncated, rowCount: dtos.length };
}

module.exports = {
  listAuditLogs,
  exportAuditLogsCsv,
  EXPORT_MAX_ROWS,
  deriveSeverity,
};
