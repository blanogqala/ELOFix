const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const {
  validateLegalAcceptance,
  validateBranchUserLegalAcceptance,
  buildLegalAcceptanceData,
  buildBranchUserLegalAcceptanceData,
  getLegalVersions,
  getLegalStatusForUser,
  recordLegalAcceptanceEvent,
} = require("../services/legalAcceptance.service");

async function getVersions(_req, res) {
  res.json({ success: true, versions: getLegalVersions() });
}

async function getLegalStatus(req, res) {
  const status = await getLegalStatusForUser(req.user.userId, req.user.role);
  res.json({ success: true, ...status, versions: getLegalVersions() });
}

async function acceptLegalDocuments(req, res) {
  const role = String(req.user?.role || "").toUpperCase();

  if (role === "BRANCH_STAFF") {
    const data = validateBranchUserLegalAcceptance(req.body || {});
    const updated = await prisma.branchUser.update({
      where: { id: req.user.userId },
      data,
      select: {
        id: true,
        acceptedTerms: true,
        acceptedPrivacy: true,
        acceptedSupplierAgreement: true,
        acceptedSupplierParticipationPolicy: true,
        acceptedAt: true,
      },
    });
    await recordLegalAcceptanceEvent(req.user.userId, "BRANCH_STAFF", "REACCEPT", data);
    return res.json({ success: true, acceptance: updated });
  }

  if (role === "SUPPLIER") {
    validateLegalAcceptance(req.body || {}, "SUPPLIER");
    const data = buildLegalAcceptanceData(req.body || {}, "SUPPLIER");
    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: {
        id: true,
        acceptedTerms: true,
        acceptedPrivacy: true,
        acceptedSupplierAgreement: true,
        acceptedSupplierParticipationPolicy: true,
        acceptedAt: true,
      },
    });
    await recordLegalAcceptanceEvent(req.user.userId, "SUPPLIER", "REACCEPT", data);
    return res.json({ success: true, acceptance: updated });
  }

  if (role === "PROVIDER" || role === "CUSTOMER" || role === "USER") {
    const prismaRole = role === "PROVIDER" ? "PROVIDER" : "CUSTOMER";
    validateLegalAcceptance(req.body || {}, prismaRole);
    const data = buildLegalAcceptanceData(req.body || {}, prismaRole);
    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: {
        id: true,
        acceptedTerms: true,
        acceptedPrivacy: true,
        acceptedProviderAgreement: true,
        acceptedRefundPolicy: true,
        acceptedAt: true,
      },
    });
    await recordLegalAcceptanceEvent(req.user.userId, prismaRole, "REACCEPT", data);
    return res.json({ success: true, acceptance: updated });
  }

  throw new AppError("Forbidden", 403);
}

module.exports = { getVersions, getLegalStatus, acceptLegalDocuments };

