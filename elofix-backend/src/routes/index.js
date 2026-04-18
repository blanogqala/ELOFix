const express = require("express");
const authRoutes = require("./auth.routes");
const jobRoutes = require("./job.routes");
const categoryRoutes = require("./category.routes");
const providerRoutes = require("./provider.routes");
const adminRoutes = require("./admin.routes");
const supplierRoutes = require("./supplier.routes");
const paymentRoutes = require("./payment.routes");
const materialOrderRoutes = require("./materialOrder.routes");
const notificationRoutes = require("./notification.routes");
const specialRoutes = require("./special.routes");
const userRoutes = require("./user.routes");
const deliveryProviderRoutes = require("./deliveryProvider.routes");
const fileRoutes = require("./file.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/jobs", jobRoutes);
router.use("/categories", categoryRoutes);
router.use("/providers", providerRoutes);
router.use("/admin", adminRoutes);
router.use("/suppliers", supplierRoutes);
router.use("/payments", paymentRoutes);
router.use("/material-orders", materialOrderRoutes);
router.use("/notifications", notificationRoutes);
router.use("/specials", specialRoutes);
router.use("/delivery-providers", deliveryProviderRoutes);
router.use("/users", userRoutes);
router.use("/files", fileRoutes);

module.exports = router;
