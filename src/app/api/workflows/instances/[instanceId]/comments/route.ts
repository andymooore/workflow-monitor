import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { createCommentSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { notifyCommentAdded } from "@/lib/notifications";
import { canAccessInstance } from "@/lib/auth-guard";
import { recordActivity } from "@/lib/activity";

// ---------------------------------------------------------------------------
// GET /api/workflows/instances/[instanceId]/comments
// List comments for the instance.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId } = params;

    const hasAccess = await canAccessInstance(user.id, instanceId, user.roles);
    if (!hasAccess) {
      throw ApiError.forbidden("You do not have access to this workflow instance");
    }

    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      select: { id: true },
    });

    if (!instance) {
      throw ApiError.notFound("Instance not found");
    }

    const comments = await prisma.comment.findMany({
      where: { instanceId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(comments);
  },
});

// ---------------------------------------------------------------------------
// POST /api/workflows/instances/[instanceId]/comments
// Add a comment. Body: { content }
// ---------------------------------------------------------------------------
export const POST = withAuth({
  schema: createCommentSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId } = params;
    const { content } = body;

    const hasAccess = await canAccessInstance(user.id, instanceId, user.roles);
    if (!hasAccess) {
      throw ApiError.forbidden("You do not have access to this workflow instance");
    }

    // Verify instance exists
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, ownerId: true, title: true, clientId: true, projectId: true },
    });

    if (!instance) {
      throw ApiError.notFound("Instance not found");
    }

    const comment = await prisma.comment.create({
      data: {
        instanceId,
        userId: user.id,
        content: content.trim(),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Record in audit log
    await prisma.auditLog.create({
      data: {
        instanceId,
        userId: user.id,
        action: "COMMENT_ADDED",
        details: { commentId: comment.id },
      },
    });

    // Notify only the requester + people with currently active tasks
    // (not everyone who ever touched this workflow)
    const activeParticipants = await prisma.taskInstance.findMany({
      where: {
        instanceId,
        assigneeId: { not: null },
        status: "IN_PROGRESS",
      },
      select: { assigneeId: true },
      distinct: ["assigneeId"],
    });
    const recipientIds = new Set<string>();
    if (instance!.ownerId !== user.id) recipientIds.add(instance!.ownerId);
    for (const t of activeParticipants) {
      if (t.assigneeId && t.assigneeId !== user.id) recipientIds.add(t.assigneeId);
    }
    if (recipientIds.size > 0) {
      notifyCommentAdded(
        [...recipientIds],
        instanceId,
        instance!.title,
        user.name,
      ).catch(() => {});
    }

    // Fire-and-forget activity recording
    recordActivity({
      userId: user.id,
      type: "COMMENT_ADDED",
      title: `Commented on "${instance!.title}"`,
      clientId: instance!.clientId ?? undefined,
      projectId: instance!.projectId ?? undefined,
      instanceId,
    }).catch(() => {});

    return NextResponse.json(comment, { status: 201 });
  },
});
