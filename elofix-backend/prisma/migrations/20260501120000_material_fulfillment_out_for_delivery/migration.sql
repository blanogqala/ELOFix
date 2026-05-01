-- AlterEnum: add supplier dispatch step between READY and COMPLETED
ALTER TYPE "MaterialFulfillmentStatus" ADD VALUE 'OUT_FOR_DELIVERY';
