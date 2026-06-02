const path = require("path");
const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const errorMiddleware = require("./middleware/error.middleware");
const asyncHandler = require("./middleware/asyncHandler");
const paymentController = require("./controllers/payment.controller");

const app = express();

app.use(
  cors({
    origin: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "idempotency-key",
      "X-Requested-With",
      "x-payflex-signature",
      "x-payjustnow-signature",
      "x-signature",
      "x-webhook-signature",
    ],
  })
);

// Payment webhooks (before JSON parser where raw body is required)
app.post(
  "/api/payments/webhooks/payfast",
  express.urlencoded({ extended: false }),
  asyncHandler(paymentController.payfastWebhook)
);
app.post(
  "/api/payments/webhooks/payflex",
  express.raw({ type: "application/json" }),
  asyncHandler(paymentController.payflexWebhook)
);
app.post(
  "/api/payments/webhooks/payjustnow",
  express.raw({ type: "application/json" }),
  asyncHandler(paymentController.payjustnowWebhook)
);

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api", routes);

app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

app.use(errorMiddleware);

module.exports = app;
