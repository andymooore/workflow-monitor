-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "liveUrl" TEXT,
ADD COLUMN     "slaReference" TEXT,
ADD COLUMN     "slaSignedDate" TIMESTAMP(3),
ADD COLUMN     "slaSummary" TEXT,
ADD COLUMN     "stagingUrl" TEXT,
ADD COLUMN     "torReference" TEXT,
ADD COLUMN     "torSignedDate" TIMESTAMP(3),
ADD COLUMN     "torSummary" TEXT;
