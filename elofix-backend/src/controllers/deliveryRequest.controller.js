const deliveryRequestService = require("../services/deliveryRequest.service");

async function create(req, res) {
  const request = await deliveryRequestService.createDeliveryRequest(req.user.userId, req.body || {});
  res.status(201).json({ success: true, request });
}

async function listMine(req, res) {
  const requests = await deliveryRequestService.listDeliveryRequestsForCustomer(req.user.userId);
  res.json({ success: true, requests });
}

async function deliveryInbox(req, res) {
  const requests = await deliveryRequestService.listDirectDeliveryInboxForCourier(req.user.userId);
  res.json({ success: true, requests });
}

async function getById(req, res) {
  const request = await deliveryRequestService.getDeliveryRequestById(
    req.params.id,
    req.user.userId,
    req.user.role
  );
  if (!request) {
    return res.json({ success: true, request: null });
  }
  res.json({ success: true, request });
}

async function getByJobId(req, res) {
  const request = await deliveryRequestService.getDeliveryRequestByJobId(
    req.params.jobId,
    req.user.userId,
    req.user.role
  );
  if (!request) {
    return res.json({ success: true, request: null });
  }
  res.json({ success: true, request });
}

async function submitQuote(req, res) {
  const request = await deliveryRequestService.submitDirectDeliveryQuote(
    req.params.id,
    req.user.userId,
    { fee: req.body?.fee, note: req.body?.note }
  );
  res.json({ success: true, request });
}

async function rejectRequest(req, res) {
  const request = await deliveryRequestService.rejectDirectDeliveryRequest(
    req.params.id,
    req.user.userId,
    req.body?.reason
  );
  res.json({ success: true, request });
}

async function acceptQuote(req, res) {
  const request = await deliveryRequestService.acceptDirectDeliveryQuote(req.params.id, req.user.userId);
  res.json({ success: true, request });
}

async function pay(req, res) {
  const request = await deliveryRequestService.payDirectDeliveryRequest(
    req.params.id,
    req.user.userId,
    req.body?.fee
  );
  res.json({ success: true, request });
}

async function patchFulfillment(req, res) {
  const request = await deliveryRequestService.updateDirectDeliveryFulfillment(
    req.params.id,
    req.user.userId,
    req.body?.status
  );
  res.json({ success: true, request });
}

module.exports = {
  create,
  listMine,
  deliveryInbox,
  getById,
  getByJobId,
  submitQuote,
  rejectRequest,
  acceptQuote,
  pay,
  patchFulfillment,
};
