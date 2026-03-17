-- CreateTable
CREATE TABLE "WorkflowCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'FolderOpen',
    "color" TEXT NOT NULL DEFAULT 'slate',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowCategory_name_key" ON "WorkflowCategory"("name");

-- CreateIndex
CREATE INDEX "WorkflowCategory_sortOrder_idx" ON "WorkflowCategory"("sortOrder");
