-- Courier delivery steps on DeliveryRequest (uses MaterialFulfillmentStatus column)
ALTER TYPE "MaterialFulfillmentStatus" ADD VALUE IF NOT EXISTS 'COLLECTING';
ALTER TYPE "MaterialFulfillmentStatus" ADD VALUE IF NOT EXISTS 'COLLECTED';
ALTER TYPE "MaterialFulfillmentStatus" ADD VALUE IF NOT EXISTS 'AT_DESTINATION';
