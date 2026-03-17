import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { updateMilestoneSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";

// PUT /api/projects/[id]/milestones/[milestoneId] — Update a milestone
export const PUT = withAdminAuth({
  schema: updateMilestoneSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const milestone = await prisma.milestone.findUnique({
      where: { id: params.milestoneId },
      include: {
        project: { select: { id: true, clientId: true, name: true } },
      },
    });

    if (!milestone || milestone.projectId !== params.id) {
      throw ApiError.notFound("Milestone not found");
    }

    const wasCompleted = milestone.status === "COMPLETED";
    const isBeingCompleted = body.status === "COMPLETED" && !wasCompleted;

    const updated = await prisma.milestone.update({
      where: { id: params.milestoneId },
      data: {
        title: body.title ?? milestone.title,
        description: body.description !== undefined ? body.description : milestone.description,
        status: body.status ?? milestone.status,
        targetDate: body.targetDate ? new Date(body.targetDate) : milestone.targetDate,
        completedAt: isBeingCompleted
          ? new Date()
          : body.completedAt !== undefined
            ? (body.completedAt ? new Date(body.completedAt) : null)
            : milestone.completedAt,
        sortOrder: body.sortOrder ?? milestone.sortOrder,
      },
    });

    // Fire-and-forget activity recording for milestone completion
    if (isBeingCompleted) {
      recordActivity({
        userId: user.id,
        type: "MILESTONE_COMPLETED",
        title: `Milestone completed: ${updated.title}`,
        description: `${user.name} marked milestone as complete`,
        projectId: params.id,
        clientId: milestone.project.clientId,
        metadata: { milestoneId: updated.id, title: updated.title },
      }).catch(() => {});
    }

    await logAdminAction({
      userId: user.id,
      action: "MILESTONE_UPDATED",
      details: {
        projectId: params.id,
        milestoneId: params.milestoneId,
        changes: body,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(updated);
  },
});

// DELETE /api/projects/[id]/milestones/[milestoneId] — Delete a milestone
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const milestone = await prisma.milestone.findUnique({
      where: { id: params.milestoneId },
    });

    if (!milestone || milestone.projectId !== params.id) {
      throw ApiError.notFound("Milestone not found");
    }

    await prisma.milestone.delete({
      where: { id: params.milestoneId },
    });

    await logAdminAction({
      userId: user.id,
      action: "MILESTONE_UPDATED",
      details: {
        projectId: params.id,
        milestoneId: params.milestoneId,
        action: "deleted",
        title: milestone.title,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
