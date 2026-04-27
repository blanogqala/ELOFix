-- Extend category suggestions to support approval pipeline metadata.
ALTER TABLE "CategorySuggestion"
ADD COLUMN "description" TEXT,
ADD COLUMN "icon" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedCategoryId" TEXT;

CREATE INDEX "CategorySuggestion_providerId_status_idx"
ON "CategorySuggestion"("providerId", "status");

CREATE INDEX "CategorySuggestion_createdAt_idx"
ON "CategorySuggestion"("createdAt");
