-- CreateEnum
CREATE TYPE "MinistryStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('PRIMARY', 'TECHNICAL', 'ESCALATION', 'BILLING', 'DATA_PROTECTION_OFFICER');

-- CreateEnum
CREATE TYPE "SlaTier" AS ENUM ('GOLD', 'SILVER', 'BRONZE');

-- CreateEnum
CREATE TYPE "JamaicanParish" AS ENUM ('KINGSTON', 'ST_ANDREW', 'ST_THOMAS', 'PORTLAND', 'ST_MARY', 'ST_ANN', 'TRELAWNY', 'ST_JAMES', 'HANOVER', 'WESTMORELAND', 'ST_ELIZABETH', 'MANCHESTER', 'CLARENDON', 'ST_CATHERINE');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MINISTRY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MINISTRY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MINISTRY_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_DELETED';

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "contactEmail",
DROP COLUMN "contactName",
ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressParish" "JamaicanParish",
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "agreementDate" TIMESTAMP(3),
ADD COLUMN     "agreementReference" TEXT,
ADD COLUMN     "hasSignedAgreement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ministryId" TEXT,
ADD COLUMN     "referenceNumber" TEXT,
ADD COLUMN     "slaTier" "SlaTier" NOT NULL DEFAULT 'BRONZE';

-- CreateTable
CREATE TABLE "Ministry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "description" TEXT,
    "status" "MinistryStatus" NOT NULL DEFAULT 'ACTIVE',
    "website" TEXT,
    "headOfEntity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ministry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "title" TEXT,
    "department" TEXT,
    "role" "ContactRole" NOT NULL DEFAULT 'PRIMARY',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "ProjectContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ministry_name_key" ON "Ministry"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Ministry_shortCode_key" ON "Ministry"("shortCode");

-- CreateIndex
CREATE INDEX "Ministry_status_idx" ON "Ministry"("status");

-- CreateIndex
CREATE INDEX "Ministry_name_idx" ON "Ministry"("name");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_isPrimary_idx" ON "ClientContact"("clientId", "isPrimary");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_role_idx" ON "ClientContact"("clientId", "role");

-- CreateIndex
CREATE INDEX "ClientContact_email_idx" ON "ClientContact"("email");

-- CreateIndex
CREATE INDEX "ProjectContact_projectId_idx" ON "ProjectContact"("projectId");

-- CreateIndex
CREATE INDEX "ProjectContact_contactId_idx" ON "ProjectContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContact_projectId_contactId_key" ON "ProjectContact"("projectId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_referenceNumber_key" ON "Client"("referenceNumber");

-- CreateIndex
CREATE INDEX "Client_ministryId_idx" ON "Client"("ministryId");

-- CreateIndex
CREATE INDEX "Client_slaTier_idx" ON "Client"("slaTier");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "Ministry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
