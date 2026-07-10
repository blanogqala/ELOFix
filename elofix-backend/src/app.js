const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const routes = require("./routes");
const errorMiddleware = require("./middleware/error.middleware");
const asyncHandler = require("./middleware/asyncHandler");
const paymentController = require("./controllers/payment.controller");
const uploadsStaticMiddleware = require("./middleware/uploadsStatic.middleware");
const { getAllowedOrigins, createCorsOriginChecker } = require("./utils/corsOrigins.util");

const app = express();

const allowedOrigins = getAllowedOrigins();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: createCorsOriginChecker(allowedOrigins),
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
app.use("/uploads", uploadsStaticMiddleware);

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
