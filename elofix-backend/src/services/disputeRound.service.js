const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");

function splitAttachments(attachments = []) {
  const images = [];
  const videos = [];
  for (const url of attachments) {
    if (/\.(mp4|webm|mov|m4v)$/i.test(String(url))) videos.push(String(url));
    else images.push(String(url));
  }
  return { images, videos };
}

function toRoundDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    disputeId: row.disputeId,
    roundNumber: row.roundNumber,
    status: row.status,
    requestedResolution: row.requestedResolution,
    customerComment: row.customerComment,
    otherResolutionDetail: row.otherResolutionDetail ?? null,
    customerImages: row.customerImages || [],
    customerVideos: row.customerVideos || [],
    providerComment: row.providerComment ?? null,
    providerImages: row.providerImages || [],
    providerVideos: row.providerVideos || [],
    resolutionAction: row.resolutionAction ?? null,
    resolutionNotes: row.resolutionNotes ?? null,
    openedAt: row.openedAt instanceof Date ? row.openedAt.toISOString() : row.openedAt,
    resolvedAt: row.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : row.resolvedAt,
  };
}

function buildLegacyRounds(row) {
  const logs = row.resolutionLogs || [];
  const customerMsgs = (row.messages || []).filter((m) => m.senderRole === "CUSTOMER");
  const openings = [];
  if (customerMsgs.length > 0) openings.push(customerMsgs[0]);
  for (const log of logs) {
    const next = customerMsgs.find((m) => new Date(m.createdAt) > new Date(log.createdAt));
    if (next && !openings.some((o) => o.id === next.id)) openings.push(next);
  }

  const isOpen = ["OPEN", "UNDER_INVESTIGATION"].includes(String(row.status || "").toUpperCase());

  if (openings.length <= 1) {
    const opening = openings[0];
    const att = opening ? splitAttachments(opening.attachments) : { images: [], videos: [] };
    const log = logs[logs.length - 1];
    return [
      {
        status: isOpen ? row.status : row.status || "RESOLVED",
        requestedResolution: row.requestedResolution,
        customerComment: row.customerComment,
        otherResolutionDetail: row.otherResolutionDetail,
        customerImages: row.customerImages?.length ? row.customerImages : att.images,
        customerVideos: row.customerVideos?.length ? row.customerVideos : att.videos,
        providerComment: row.providerComment,
        providerImages: row.providerImages || [],
        providerVideos: row.providerVideos || [],
        resolutionAction: log?.action || null,
        resolutionNotes: log?.notes || row.adminNotes,
        openedAt: row.openedAt,
        resolvedAt: row.resolvedAt || log?.createdAt || null,
      },
    ];
  }

  const rounds = [];
  for (let i = 0; i < openings.length; i += 1) {
    const opening = openings[i];
    const log = logs[i];
    const att = splitAttachments(opening.attachments);
    const isLast = i === openings.length - 1;

    if (isLast && isOpen) {
      rounds.push({
        status: row.status,
        requestedResolution: row.requestedResolution,
        customerComment: row.customerComment,
        otherResolutionDetail: row.otherResolutionDetail,
        customerImages: row.customerImages?.length ? row.customerImages : att.images,
        customerVideos: row.customerVideos?.length ? row.customerVideos : att.videos,
        providerComment: row.providerComment,
        providerImages: row.providerImages || [],
        providerVideos: row.providerVideos || [],
        resolutionAction: null,
        resolutionNotes: null,
        openedAt: opening.createdAt,
        resolvedAt: null,
      });
    } else {
      rounds.push({
        status: "RESOLVED",
        requestedResolution: row.requestedResolution,
        customerComment: opening.body,
        otherResolutionDetail: null,
        customerImages: att.images,
        customerVideos: att.videos,
        providerComment: null,
        providerImages: [],
        providerVideos: [],
        resolutionAction: log?.action || null,
        resolutionNotes: log?.notes || null,
        openedAt: i === 0 ? row.openedAt : opening.createdAt,
        resolvedAt: log?.createdAt || null,
      });
    }
  }
  return rounds;
}

async function ensureDisputeRounds(disputeId) {
  try {
    const existing = await prisma.jobDisputeRound.findMany({
      where: { disputeId: String(disputeId) },
      orderBy: { roundNumber: "asc" },
    });
    if (existing.length) return existing;
  } catch (e) {
    console.warn("[disputeRound] rounds table unavailable:", e?.message || e);
    return null;
  }

  const row = await prisma.jobDispute.findUnique({
    where: { id: String(disputeId) },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      resolutionLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return [];

  const legacy = buildLegacyRounds(row);
  if (!legacy.length) return [];

  try {
    await prisma.jobDisputeRound.createMany({
      data: legacy.map((round, index) => ({
        id: randomUUID(),
        disputeId: row.id,
        roundNumber: index + 1,
        status: round.status,
        requestedResolution: round.requestedResolution,
        customerComment: round.customerComment,
        otherResolutionDetail: round.otherResolutionDetail,
        customerImages: round.customerImages,
        customerVideos: round.customerVideos,
        providerComment: round.providerComment,
        providerImages: round.providerImages,
        providerVideos: round.providerVideos,
        resolutionAction: round.resolutionAction,
        resolutionNotes: round.resolutionNotes,
        openedAt: round.openedAt instanceof Date ? round.openedAt : new Date(round.openedAt),
        resolvedAt: round.resolvedAt
          ? round.resolvedAt instanceof Date
            ? round.resolvedAt
            : new Date(round.resolvedAt)
          : null,
      })),
    });

    return prisma.jobDisputeRound.findMany({
      where: { disputeId: row.id },
      orderBy: { roundNumber: "asc" },
    });
  } catch (e) {
    console.warn("[disputeRound] backfill failed:", e?.message || e);
    return null;
  }
}

function legacyRowsToDtos(disputeId, legacy) {
  return legacy.map((round, index) =>
    toRoundDto({
      id: `${disputeId}-round-${index + 1}`,
      disputeId,
      roundNumber: index + 1,
      ...round,
    })
  );
}

async function getDisputeRounds(disputeId) {
  const rows = await ensureDisputeRounds(disputeId);
  if (Array.isArray(rows) && rows.length) return rows.map(toRoundDto);

  const row = await prisma.jobDispute.findUnique({
    where: { id: String(disputeId) },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      resolutionLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return [];
  return legacyRowsToDtos(disputeId, buildLegacyRounds(row));
}

async function createDisputeRoundInTransaction(tx, disputeId, payload) {
  try {
    const count = await tx.jobDisputeRound.count({ where: { disputeId: String(disputeId) } });
    return tx.jobDisputeRound.create({
      data: {
        id: randomUUID(),
        // Some Prisma client generations require providing the relation explicitly.
        dispute: { connect: { id: String(disputeId) } },
        roundNumber: count + 1,
        status: "OPEN",
        requestedResolution: payload.requestedResolution,
        // Prisma schema requires customerComment (non-null).
        customerComment: payload.customerComment != null ? String(payload.customerComment) : "",
        otherResolutionDetail: payload.otherResolutionDetail ?? null,
        customerImages: payload.customerImages || [],
        customerVideos: payload.customerVideos || [],
        openedAt: payload.openedAt || new Date(),
      },
    });
  } catch (e) {
    console.warn("[disputeRound] create round skipped:", e?.message || e);
    return null;
  }
}

async function closeActiveDisputeRoundInTransaction(tx, disputeId, resolution = {}) {
  try {
    const active = await tx.jobDisputeRound.findFirst({
      where: {
        disputeId: String(disputeId),
        status: { in: ["OPEN", "UNDER_INVESTIGATION"] },
      },
      orderBy: { roundNumber: "desc" },
    });
    if (!active) return null;

    return tx.jobDisputeRound.update({
      where: { id: active.id },
      data: {
        status: "RESOLVED",
        resolvedAt: resolution.resolvedAt || new Date(),
        resolutionAction: resolution.action || null,
        resolutionNotes: resolution.notes ?? null,
        providerComment: resolution.providerComment ?? active.providerComment,
        providerImages: resolution.providerImages ?? active.providerImages,
        providerVideos: resolution.providerVideos ?? active.providerVideos,
      },
    });
  } catch (e) {
    console.warn("[disputeRound] close round skipped:", e?.message || e);
    return null;
  }
}

async function syncProviderEvidenceToActiveRound(disputeId, payload) {
  try {
    const active = await prisma.jobDisputeRound.findFirst({
      where: {
        disputeId: String(disputeId),
        status: { in: ["OPEN", "UNDER_INVESTIGATION"] },
      },
      orderBy: { roundNumber: "desc" },
    });
    if (!active) return;

    await prisma.jobDisputeRound.update({
      where: { id: active.id },
      data: {
        providerComment: payload.providerComment ?? null,
        providerImages: payload.providerImages || [],
        providerVideos: payload.providerVideos || [],
      },
    });
  } catch (e) {
    console.warn("[disputeRound] sync provider evidence skipped:", e?.message || e);
  }
}

async function syncDisputeStatusToActiveRound(disputeId, status) {
  try {
    const active = await prisma.jobDisputeRound.findFirst({
      where: {
        disputeId: String(disputeId),
        status: { in: ["OPEN", "UNDER_INVESTIGATION"] },
      },
      orderBy: { roundNumber: "desc" },
    });
    if (!active) return;

    await prisma.jobDisputeRound.update({
      where: { id: active.id },
      data: { status },
    });
  } catch (e) {
    console.warn("[disputeRound] sync status skipped:", e?.message || e);
  }
}

module.exports = {
  toRoundDto,
  ensureDisputeRounds,
  getDisputeRounds,
  createDisputeRoundInTransaction,
  closeActiveDisputeRoundInTransaction,
  syncProviderEvidenceToActiveRound,
  syncDisputeStatusToActiveRound,
};
