const AppError = require("../utils/AppError");
const materialRequestService = require("../services/materialRequest.service");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function postCreate(req, res) {
  const mr = await materialRequestService.createDraft(req.user.userId, req.body || {});
  res.status(201).json({ success: true, materialRequest: mr });
}

async function postSubmit(req, res) {
  await materialRequestService.submitFromBody(req.user.userId, req.body || {});
  res.json({ success: true, message: "Materials submitted" });
}

async function getByJob(req, res) {
  const jobId = String(req.params.jobId || "").trim();
  if (!UUID_RE.test(jobId)) {
    throw new AppError("Invalid job id", 400);
  }
  const list = await materialRequestService.listForJobActor(jobId, req.user.userId, req.user.role);
  res.json({ success: true, materialRequests: list });
}

async function patchPay(req, res) {
  const id = String(req.params.id || "").trim();
  if (!UUID_RE.test(id)) {
    throw new AppError("Invalid material request id", 400);
  }
  const materialRequest = await materialRequestService.patchMarkPaidForCustomer(id, req.user.userId);
  res.json({ success: true, materialRequest });
}

module.exports = {
  postCreate,
  postSubmit,
  getByJob,
  patchPay,
};
