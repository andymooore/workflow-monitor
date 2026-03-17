-- AlterTable
ALTER TABLE "TaskInstance" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Approval_deciderId_decision_idx" ON "Approval"("deciderId", "decision");

-- CreateIndex
CREATE INDEX "TaskInstance_assigneeId_status_idx" ON "TaskInstance"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "TaskInstance_dueDate_idx" ON "TaskInstance"("dueDate");
