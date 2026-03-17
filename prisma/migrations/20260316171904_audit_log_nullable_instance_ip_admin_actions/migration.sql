-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'TEMPLATE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'TEMPLATE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'TEMPLATE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'TEMPLATE_PUBLISHED';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "ipAddress" TEXT,
ALTER COLUMN "instanceId" DROP NOT NULL;
