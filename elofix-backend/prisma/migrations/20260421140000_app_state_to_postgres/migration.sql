-- Job workflow meta (replaces data/app-state.json jobsMeta)
ALTER TABLE "Job" ADD COLUMN "meta" JSONB;

-- Notifications per user
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Saved payment cards (mock / demo)
CREATE TABLE "SavedCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SavedCard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedCard_userId_idx" ON "SavedCard"("userId");

ALTER TABLE "SavedCard" ADD CONSTRAINT "SavedCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invoices (payload mirrors prior JSON shape)
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Suppliers + product catalog (JSON array)
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "hasDelivery" BOOLEAN NOT NULL DEFAULT true,
    "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "products" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- Material orders (full document in payload)
CREATE TABLE "MaterialOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaterialOrder_userId_idx" ON "MaterialOrder"("userId");

-- Promotional specials (arbitrary JSON per row)
CREATE TABLE "PromoSpecial" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "PromoSpecial_pkey" PRIMARY KEY ("id")
);

-- Delivery providers
CREATE TABLE "DeliveryProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "baseRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "perKmRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimatedTime" TEXT NOT NULL DEFAULT 'N/A',
    "vehicleType" TEXT,
    "numberPlate" TEXT,
    "rating" DOUBLE PRECISION,

    CONSTRAINT "DeliveryProvider_pkey" PRIMARY KEY ("id")
);

-- Registry for uploaded files (paths under /uploads)
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);
