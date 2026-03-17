-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'DEAD_LETTER');

-- AlterTable: Add retry-related columns to WebhookDelivery
ALTER TABLE "WebhookDelivery" ADD COLUMN "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "WebhookDelivery" ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "WebhookDelivery" ADD COLUMN "lastError" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "WebhookDelivery" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

-- AlterTable: Change default for attempts from 1 to 0
ALTER TABLE "WebhookDelivery" ALTER COLUMN "attempts" SET DEFAULT 0;

-- Backfill: Mark existing successful deliveries as SUCCESS, failed as FAILED
UPDATE "WebhookDelivery" SET "status" = 'SUCCESS' WHERE "success" = true;
UPDATE "WebhookDelivery" SET "status" = 'FAILED' WHERE "success" = false;

-- CreateIndex: Composite index for the retry query
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON "WebhookDelivery"("status", "nextRetryAt");
