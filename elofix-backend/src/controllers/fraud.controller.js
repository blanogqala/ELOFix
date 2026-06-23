const deviceIntelligence = require("../services/deviceIntelligence.service");

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || null;
}

async function postDeviceSession(req, res) {
  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const device = await deviceIntelligence.recordDeviceSession(
    userId,
    role,
    {
      browserFingerprint: req.body?.browserFingerprint,
      deviceFingerprint: req.body?.deviceFingerprint,
      userAgent: req.body?.userAgent || req.headers["user-agent"],
    },
    {
      ipAddress: getClientIp(req),
      userAgent: req.body?.userAgent || req.headers["user-agent"],
      country: req.headers["cf-ipcountry"] || null,
      city: null,
    }
  );

  res.json({ success: true, recorded: Boolean(device) });
}

module.exports = { postDeviceSession };
