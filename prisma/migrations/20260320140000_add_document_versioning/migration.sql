-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('MOCKUP', 'DRAFT', 'ASSET');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "groupId" TEXT,
ADD COLUMN "assetCategory" "AssetCategory";

-- CreateIndex
CREATE INDEX "Document_groupId_idx" ON "Document"("groupId");

-- CreateIndex
CREATE INDEX "Document_projectId_assetCategory_idx" ON "Document"("projectId", "assetCategory");
