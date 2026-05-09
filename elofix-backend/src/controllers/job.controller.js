const AppError = require("../utils/AppError");
const { filePathToPublicUrl } = require("../middleware/upload.middleware");
const jobService = require("../services/job.service");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function uploadJobImage(req, res) {
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  res.json({ success: true, url: filePathToPublicUrl(req.file.path) });
}

async function createJob(req, res) {
  const job = await jobService.createJob(req.user.userId, req.body || {});
  res.status(201).json({ success: true, job });
}

async function getJobs(req, res) {
  const jobs = await jobService.getJobsForActor(req.user.userId, req.user.role);
  res.json({ success: true, jobs });
}

async function getJobById(req, res) {
  const id = String(req.params.id || "").trim();
  if (!UUID_RE.test(id)) {
    throw new AppError("Invalid job id", 400);
  }
  const job = await jobService.getJobByIdForActor(id, req.user.userId, req.user.role);
  res.json({ success: true, job });
}

async function getMatchedJobs(req, res) {
  const jobs = await jobService.getMatchedJobsForProvider(req.user.userId);
  res.json({ success: true, jobs });
}

async function acceptJob(req, res) {
  const job = await jobService.acceptJob(req.params.id, req.user.userId);
  res.json({ success: true, job });
}

async function deleteJob(req, res) {
  const result = await jobService.deleteJob(req.params.id, req.user.userId, req.user.role);
  res.json({ success: true, ...result });
}

async function addMaterials(req, res) {
  const job = await jobService.addMaterials(req.params.id, req.body?.materials || []);
  res.json({ success: true, job });
}

async function removeMaterial(req, res) {
  const job = await jobService.removeMaterial(
    req.params.id,
    req.body?.productId || req.query.productId,
    req.body?.supplierId || req.query.supplierId
  );
  res.json({ success: true, job });
}

async function addJobNote(req, res) {
  const job = await jobService.addJobNote(
    req.params.id,
    { ...req.user, name: req.body?.authorName || req.user.email },
    req.body?.message,
    req.body?.title
  );
  res.json({ success: true, job });
}

async function addChatMessage(req, res) {
  const job = await jobService.addChatMessage(
    req.params.id,
    { ...req.user, name: req.body?.authorName || req.user.email },
    req.body?.message
  );
  res.json({ success: true, job });
}

async function submitServicePrice(req, res) {
  const id = String(req.params.id || "").trim();
  if (!UUID_RE.test(id)) {
    throw new AppError("Invalid job id", 400);
  }
  const rawAmount = req.body?.amount;
  if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === "") {
    throw new AppError("Amount is required", 400);
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AppError("Amount must be a non-negative number", 400);
  }
  const note = req.body?.note;
  if (note != null && String(note).length > 5000) {
    throw new AppError("note is too long", 400);
  }
  const job = await jobService.submitServicePrice(id, amount, note);
  res.json({ success: true, job });
}

async function payLabor(req, res) {
  const id = String(req.params.id || "").trim();
  if (!UUID_RE.test(id)) {
    throw new AppError("Invalid job id", 400);
  }
  const job = await jobService.payLabor(
    id,
    req.user.userId,
    req.body?.cardLast4 || req.body?.cardId || "****",
    req.financialIdempotencyKey,
    req.financialRequestHash,
    req.financialIdempotencyRoute
  );
  res.json({ success: true, job });
}

async function submitMaterials(req, res) {
  const job = await jobService.submitMaterials(
    req.params.id,
    req.body?.materials || [],
    req.user.userId
  );
  res.json({ success: true, job });
}

async function rejectJob(req, res) {
  const job = await jobService.rejectJob(req.params.id, req.body?.reason, req.body?.details);
  res.json({ success: true, job });
}

async function rejectJobByProvider(req, res) {
  const job = await jobService.rejectJobByProvider(
    req.params.id,
    req.body?.reason,
    req.body?.details,
    req.user.userId
  );
  res.json({ success: true, job });
}

async function deleteRejectedFromProviderView(req, res) {
  const result = await jobService.deleteRejectedRequestFromProviderView(req.params.id, req.user.userId);
  res.json({ success: true, ...result });
}

async function updateProviderRequirements(req, res) {
  const job = await jobService.updateProviderRequirements(req.params.id, req.body || {});
  res.json({ success: true, job });
}

async function addUserMaterialSuggestion(req, res) {
  const job = await jobService.addUserMaterialSuggestion(req.params.id, req.body?.suggested, req.body?.message);
  res.json({ success: true, job });
}

async function acceptUserSuggestion(req, res) {
  const job = await jobService.acceptUserSuggestion(req.params.id, req.params.suggestionId);
  res.json({ success: true, job });
}

async function rejectUserSuggestion(req, res) {
  const job = await jobService.rejectUserSuggestion(req.params.id, req.params.suggestionId);
  res.json({ success: true, job });
}

async function addProviderMaterialSuggestion(req, res) {
  const job = await jobService.addProviderMaterialSuggestion(req.params.id, req.body?.suggested, req.body?.message);
  res.json({ success: true, job });
}

async function acceptProviderSuggestion(req, res) {
  const job = await jobService.acceptProviderSuggestion(req.params.id, req.params.suggestionId);
  res.json({ success: true, job });
}

async function rejectProviderSuggestion(req, res) {
  const job = await jobService.rejectProviderSuggestion(req.params.id, req.params.suggestionId);
  res.json({ success: true, job });
}

async function proposeNewLaborPrice(req, res) {
  const job = await jobService.proposeNewLaborPrice(req.params.id, req.body?.amount, req.body?.reason);
  res.json({ success: true, job });
}

async function acceptProposedPrice(req, res) {
  const job = await jobService.acceptProposedPrice(req.params.id);
  res.json({ success: true, job });
}

async function cancelJob(req, res) {
  const result = await jobService.cancelJob(req.params.id, req.body?.reason, req.body?.details);
  res.json({ success: true, ...result });
}

async function confirmJobCompletion(req, res) {
  const job = await jobService.confirmJobCompletion(req.params.id, req.body?.rating, req.body?.review);
  res.json({ success: true, job });
}

async function setStoreDeliveryOption(req, res) {
  const job = await jobService.setStoreDeliveryOption(req.params.id, req.params.storeId, req.body || {});
  res.json({ success: true, job });
}

async function approveStoreDeliveryRequest(req, res) {
  const job = await jobService.approveStoreDeliveryRequest(req.params.id, req.params.storeId);
  res.json({ success: true, job });
}

async function updateStoreOrderDeliveryStatus(req, res) {
  const job = await jobService.updateStoreOrderDeliveryStatus(req.params.id, req.params.storeId, req.body?.status);
  res.json({ success: true, job });
}

async function updateStoreOrderDelivery(req, res) {
  const job = await jobService.updateStoreOrderDelivery(req.params.id, req.params.storeId, req.body || {});
  res.json({ success: true, job });
}

async function approveStoreOrderDelivery(req, res) {
  const job = await jobService.approveStoreOrderDelivery(req.params.id, req.params.storeId);
  res.json({ success: true, job });
}

async function rejectStoreOrderDelivery(req, res) {
  const job = await jobService.rejectStoreOrderDelivery(req.params.id, req.params.storeId);
  res.json({ success: true, job });
}

async function payStoreOrderDelivery(req, res) {
  const job = await jobService.payStoreOrderDelivery(
    req.params.id,
    req.params.storeId,
    req.body?.cardLast4 || "****",
    req.body?.fee
  );
  res.json({ success: true, job });
}

async function payForStoreMaterials(req, res) {
  const job = await jobService.payForStoreMaterials(
    req.params.id,
    req.params.storeId,
    req.body?.cardLast4 || "****",
    req.body || {}
  );
  res.json({ success: true, job });
}

async function customerRejectMaterialBatch(req, res) {
  const role = String(req.user?.role || "");
  if (role !== "CUSTOMER") throw new AppError("Only the customer can reject this batch", 403);
  const job = await jobService.customerRejectProviderMaterialBatch(
    req.params.id,
    req.params.orderId,
    req.user.userId
  );
  res.json({ success: true, job });
}

async function providerCancelMaterialBatch(req, res) {
  const role = String(req.user?.role || "");
  if (role !== "PROVIDER") throw new AppError("Only the provider can cancel this batch", 403);
  const job = await jobService.providerCancelProviderMaterialBatch(
    req.params.id,
    req.params.orderId,
    req.user.userId
  );
  res.json({ success: true, job });
}

async function dismissMaterialBatch(req, res) {
  const job = await jobService.dismissMaterialBatch(
    req.params.id,
    req.params.orderId,
    req.user.userId,
    String(req.user?.role || "")
  );
  res.json({ success: true, job });
}

async function withdrawAcceptedUserSuggestion(req, res) {
  const job = await jobService.withdrawAcceptedUserMaterialSuggestion(
    req.params.id,
    req.params.suggestionId,
    req.user.userId,
    String(req.user?.role || "")
  );
  res.json({ success: true, job });
}

async function purgeWithdrawnUserSuggestion(req, res) {
  const job = await jobService.purgeWithdrawnUserMaterialSuggestion(
    req.params.id,
    req.params.suggestionId,
    req.user.userId,
    String(req.user?.role || "")
  );
  res.json({ success: true, job });
}

async function updateJobStatus(req, res) {
  const id = String(req.params.id || "").trim();
  if (!UUID_RE.test(id)) {
    throw new AppError("Invalid job id", 400);
  }
  const raw = req.body?.status;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    throw new AppError("status is required", 400);
  }
  const status = String(raw).trim();
  if (status.length > 128) {
    throw new AppError("status is too long", 400);
  }
  const job = await jobService.updateJobStatus(id, status);
  res.json({ success: true, job });
}

async function releaseEscrowPayment(req, res) {
  const job = await jobService.releaseEscrowPayment(
    req.params.id,
    req.body?.amount,
    req.financialIdempotencyKey,
    req.financialRequestHash,
    req.financialIdempotencyRoute,
    req.user.userId
  );
  res.json({ success: true, job });
}

async function getLaborInvoice(req, res) {
  const invoice = await jobService.getLaborInvoiceByJobId(req.params.id);
  res.json({ success: true, invoice });
}

async function createLaborInvoice(req, res) {
  const invoice = await jobService.createLaborInvoice(
    req.params.id,
    req.body?.userId || req.user.userId,
    req.body?.laborAmount,
    req.body?.cardLast4
  );
  res.status(201).json({ success: true, invoice });
}

module.exports = {
  uploadJobImage,
  createJob,
  getJobs,
  getJobById,
  getMatchedJobs,
  acceptJob,
  deleteJob,
  addMaterials,
  removeMaterial,
  addJobNote,
  addChatMessage,
  submitServicePrice,
  payLabor,
  submitMaterials,
  rejectJob,
  rejectJobByProvider,
  deleteRejectedFromProviderView,
  updateProviderRequirements,
  addUserMaterialSuggestion,
  acceptUserSuggestion,
  rejectUserSuggestion,
  addProviderMaterialSuggestion,
  acceptProviderSuggestion,
  rejectProviderSuggestion,
  proposeNewLaborPrice,
  acceptProposedPrice,
  cancelJob,
  confirmJobCompletion,
  setStoreDeliveryOption,
  approveStoreDeliveryRequest,
  updateStoreOrderDeliveryStatus,
  updateStoreOrderDelivery,
  approveStoreOrderDelivery,
  rejectStoreOrderDelivery,
  payStoreOrderDelivery,
  payForStoreMaterials,
  customerRejectMaterialBatch,
  providerCancelMaterialBatch,
  dismissMaterialBatch,
  withdrawAcceptedUserSuggestion,
  purgeWithdrawnUserSuggestion,
  updateJobStatus,
  releaseEscrowPayment,
  createLaborInvoice,
  getLaborInvoice,
};
