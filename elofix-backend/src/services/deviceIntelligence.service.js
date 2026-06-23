const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { getTrustLevel } = require("../utils/trustLevel.util");
const providerTrustScore = require("./providerTrustScore.service");

const PROVIDER_THRESHOLD = 5;
const CUSTOMER_THRESHOLD = 10;

function parseOsFromUserAgent(ua) {
  const s = String(ua || "");
  if (/Windows/i.test(s)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(s)) return "macOS";
  if (/Android/i.test(s)) return "Android";
  if (/iPhone|iPad|iOS/i.test(s)) return "iOS";
  if (/Linux/i.test(s)) return "Linux";
  return "Unknown";
}

async function recordDeviceSession(userId, userRole, payload, reqMeta = {}) {
  const deviceFingerprint = String(payload?.deviceFingerprint || "").trim();
  if (!deviceFingerprint) return null;

  const browserFingerprint = payload?.browserFingerprint
    ? String(payload.browserFingerprint).trim()
    : null;
  const userAgent = payload?.userAgent ? String(payload.userAgent) : reqMeta.userAgent || null;
  const ipAddress = reqMeta.ipAddress || null;
  const os = parseOsFromUserAgent(userAgent);
  const country = reqMeta.country || null;
  const city = reqMeta.city || null;
  const now = new Date();

  let device = await prisma.deviceProfile.findUnique({
    where: { deviceFingerprint },
  });

  if (device) {
    device = await prisma.deviceProfile.update({
      where: { id: device.id },
      data: {
        browserFingerprint: browserFingerprint || device.browserFingerprint,
        ipAddress: ipAddress || device.ipAddress,
        os: os || device.os,
        country: country || device.country,
        city: city || device.city,
        userAgent: userAgent || device.userAgent,
        lastSeenAt: now,
      },
    });
  } else {
    device = await prisma.deviceProfile.create({
      data: {
        id: randomUUID(),
        deviceFingerprint,
        browserFingerprint,
        ipAddress,
        os,
        country,
        city,
        userAgent,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
  }

  const existingLink = await prisma.deviceUserLink.findUnique({
    where: {
      deviceProfileId_userId: { deviceProfileId: device.id, userId: String(userId) },
    },
  });

  if (existingLink) {
    await prisma.deviceUserLink.update({
      where: { id: existingLink.id },
      data: { lastLoginAt: now, loginCount: { increment: 1 }, role: userRole },
    });
  } else {
    await prisma.deviceUserLink.create({
      data: {
        id: randomUUID(),
        deviceProfileId: device.id,
        userId: String(userId),
        role: userRole,
        firstLoginAt: now,
        lastLoginAt: now,
        loginCount: 1,
      },
    });
  }

  await evaluateDeviceRules(device.id);
  return device;
}

async function evaluateDeviceRules(deviceProfileId) {
  const fraudAlert = require("./fraudAlert.service");

  const links = await prisma.deviceUserLink.findMany({
    where: { deviceProfileId },
    include: { user: { select: { id: true, role: true } } },
  });

  const providerUserIds = links.filter((l) => l.role === "PROVIDER").map((l) => l.userId);
  const customerUserIds = links.filter((l) => l.role === "CUSTOMER").map((l) => l.userId);

  if (providerUserIds.length > PROVIDER_THRESHOLD) {
    const existing = await prisma.fraudAlert.findFirst({
      where: {
        alertType: "SUSPICIOUS_DEVICE",
        status: { in: ["OPEN", "UNDER_REVIEW"] },
        metadata: { path: ["deviceProfileId"], equals: deviceProfileId },
      },
    });
    if (!existing) {
      await fraudAlert.createAlert({
        alertType: "SUSPICIOUS_DEVICE",
        description: `Device has ${providerUserIds.length} linked provider accounts (threshold: ${PROVIDER_THRESHOLD})`,
        metadata: { deviceProfileId, providerCount: providerUserIds.length, providerUserIds },
        applyTrustPenalty: false,
      });
    }
  }

  if (customerUserIds.length > CUSTOMER_THRESHOLD) {
    const existing = await prisma.fraudAlert.findFirst({
      where: {
        alertType: "SUSPICIOUS_DEVICE",
        status: { in: ["OPEN", "UNDER_REVIEW"] },
        metadata: { path: ["deviceProfileId"], equals: deviceProfileId },
      },
    });
    if (!existing) {
      await fraudAlert.createAlert({
        alertType: "SUSPICIOUS_DEVICE",
        description: `Device has ${customerUserIds.length} linked customer accounts (threshold: ${CUSTOMER_THRESHOLD})`,
        metadata: { deviceProfileId, customerCount: customerUserIds.length, customerUserIds },
        applyTrustPenalty: false,
      });
    }
  }

  if (providerUserIds.length >= 2) {
    const providerProfiles = await prisma.provider.findMany({
      where: { userId: { in: providerUserIds } },
      select: { id: true, userId: true },
    });
    for (const p of providerProfiles) {
      const dup = await prisma.fraudAlert.findFirst({
        where: {
          alertType: "SUSPICIOUS_DEVICE",
          providerId: p.id,
          status: { in: ["OPEN", "UNDER_REVIEW"] },
          metadata: { path: ["reason"], equals: "shared_device_fingerprint" },
        },
      });
      if (!dup) {
        await fraudAlert.createAlert({
          alertType: "SUSPICIOUS_DEVICE",
          description: "Multiple providers share identical device fingerprint",
          providerId: p.id,
          metadata: {
            deviceProfileId,
            reason: "shared_device_fingerprint",
            providerUserIds,
          },
        });
      }
    }
  }
}

async function getDeviceDetail(deviceProfileId) {
  const device = await prisma.deviceProfile.findUnique({
    where: { id: deviceProfileId },
    include: {
      userLinks: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              blocked: true,
              providerProfile: {
                select: {
                  id: true,
                  businessName: true,
                  approved: true,
                  trustScore: { select: { score: true } },
                },
              },
            },
          },
        },
        orderBy: { lastLoginAt: "desc" },
      },
    },
  });
  if (!device) return null;

  const alerts = await prisma.fraudAlert.findMany({
    where: {
      metadata: { path: ["deviceProfileId"], equals: deviceProfileId },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const accounts = device.userLinks.map((link) => {
    const trust = link.user.providerProfile?.trustScore?.score;
    return {
      userId: link.user.id,
      name: link.user.name,
      email: link.user.email,
      phone: link.user.phone,
      role: link.user.role,
      blocked: link.user.blocked,
      loginCount: link.loginCount,
      firstLoginAt: link.firstLoginAt,
      lastLoginAt: link.lastLoginAt,
      providerProfile: link.user.providerProfile
        ? {
            id: link.user.providerProfile.id,
            businessName: link.user.providerProfile.businessName,
            approved: link.user.providerProfile.approved,
            trustScore: trust ?? 100,
            trustLevel: getTrustLevel(trust ?? 100),
          }
        : null,
    };
  });

  return { device, accounts, alerts };
}

async function listSuspiciousDevices() {
  const devices = await prisma.deviceProfile.findMany({
    include: {
      userLinks: { select: { userId: true, role: true } },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 100,
  });

  return devices
    .map((d) => {
      const providerCount = d.userLinks.filter((l) => l.role === "PROVIDER").length;
      const customerCount = d.userLinks.filter((l) => l.role === "CUSTOMER").length;
      const suspicious =
        providerCount > PROVIDER_THRESHOLD ||
        customerCount > CUSTOMER_THRESHOLD ||
        providerCount >= 2;
      return {
        id: d.id,
        deviceFingerprint: d.deviceFingerprint,
        ipAddress: d.ipAddress,
        os: d.os,
        country: d.country,
        city: d.city,
        lastSeenAt: d.lastSeenAt,
        providerCount,
        customerCount,
        totalAccounts: d.userLinks.length,
        suspicious,
      };
    })
    .filter((d) => d.suspicious);
}

module.exports = {
  recordDeviceSession,
  evaluateDeviceRules,
  getDeviceDetail,
  listSuspiciousDevices,
  PROVIDER_THRESHOLD,
  CUSTOMER_THRESHOLD,
};
