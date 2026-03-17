-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ProjectHealth" AS ENUM ('ON_TRACK', 'AT_RISK', 'BLOCKED');
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'MISSED');
CREATE TYPE "ActivityType" AS ENUM ('CLIENT_CREATED', 'CLIENT_UPDATED', 'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_STATUS_CHANGED', 'MILESTONE_CREATED', 'MILESTONE_COMPLETED', 'MILESTONE_MISSED', 'TEAM_MEMBER_ADDED', 'TEAM_MEMBER_REMOVED', 'DOCUMENT_UPLOADED', 'WORKFLOW_STARTED', 'WORKFLOW_COMPLETED', 'COMMENT_ADDED', 'NOTE_ADDED', 'KNOWLEDGE_ARTICLE_CREATED', 'KNOWLEDGE_ARTICLE_UPDATED');

-- AlterEnum: Add new audit actions
ALTER TYPE "AuditAction" ADD VALUE 'MILESTONE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MILESTONE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MILESTONE_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_MEMBER_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_MEMBER_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'KNOWLEDGE_ARTICLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'KNOWLEDGE_ARTICLE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'KNOWLEDGE_ARTICLE_DELETED';

-- AlterTable: Add project management fields to Project
ALTER TABLE "Project" ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING';
ALTER TABLE "Project" ADD COLUMN "health" "ProjectHealth" NOT NULL DEFAULT 'ON_TRACK';
ALTER TABLE "Project" ADD COLUMN "budgetAmount" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "budgetSpent" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "budgetCurrency" TEXT NOT NULL DEFAULT 'JMD';

-- CreateIndex on Project
CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_health_idx" ON "Project"("health");

-- CreateTable: Milestone
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");
CREATE INDEX "Milestone_targetDate_idx" ON "Milestone"("targetDate");
CREATE INDEX "Milestone_status_idx" ON "Milestone"("status");
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ProjectMember
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ActivityEvent
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "instanceId" TEXT,
    "userId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActivityEvent_clientId_createdAt_idx" ON "ActivityEvent"("clientId", "createdAt");
CREATE INDEX "ActivityEvent_projectId_createdAt_idx" ON "ActivityEvent"("projectId", "createdAt");
CREATE INDEX "ActivityEvent_instanceId_createdAt_idx" ON "ActivityEvent"("instanceId", "createdAt");
CREATE INDEX "ActivityEvent_userId_createdAt_idx" ON "ActivityEvent"("userId", "createdAt");
CREATE INDEX "ActivityEvent_type_idx" ON "ActivityEvent"("type");
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: KnowledgeArticle
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "authorId" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeArticle_slug_key" ON "KnowledgeArticle"("slug");
CREATE INDEX "KnowledgeArticle_slug_idx" ON "KnowledgeArticle"("slug");
CREATE INDEX "KnowledgeArticle_authorId_idx" ON "KnowledgeArticle"("authorId");
CREATE INDEX "KnowledgeArticle_clientId_idx" ON "KnowledgeArticle"("clientId");
CREATE INDEX "KnowledgeArticle_projectId_idx" ON "KnowledgeArticle"("projectId");
CREATE INDEX "KnowledgeArticle_isPublished_idx" ON "KnowledgeArticle"("isPublished");
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: KnowledgeTag
CREATE TABLE "KnowledgeTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    CONSTRAINT "KnowledgeTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeTag_name_key" ON "KnowledgeTag"("name");

-- CreateTable: KnowledgeArticleTag
CREATE TABLE "KnowledgeArticleTag" (
    "articleId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "KnowledgeArticleTag_pkey" PRIMARY KEY ("articleId","tagId")
);
CREATE INDEX "KnowledgeArticleTag_articleId_idx" ON "KnowledgeArticleTag"("articleId");
CREATE INDEX "KnowledgeArticleTag_tagId_idx" ON "KnowledgeArticleTag"("tagId");
ALTER TABLE "KnowledgeArticleTag" ADD CONSTRAINT "KnowledgeArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticleTag" ADD CONSTRAINT "KnowledgeArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "KnowledgeTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
