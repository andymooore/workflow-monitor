import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { notifyTaskAssigned } from "@/lib/notifications";
import { canAccessInstance } from "@/lib/auth-guard";
import { z } from "zod";

const reassignSchema = z.object({
  assigneeId: z.string().min(1, "assigneeId is required"),
});

// ---------------------------------------------------------------------------
// POST /api/workflows/instances/[instanceId]/tasks/[taskId]/reassign
// Reassign an in-progress task to a different user.
// ---------------------------------------------------------------------------
export const POST = withAuth({
  schema: reassignSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId, taskId } = params;

    // Instance-level authorization
    const hasAccess = await canAccessInstance(user.id, instanceId, user.roles);
    if (!hasAccess) {
      throw ApiError.forbidden("You do not have access to this workflow instance");
    }

    const taskInstance = await prisma.taskInstance.findUnique({
      where: { id: taskId },
      include: {
        instance: true,
        node: true,
      },
    });

    if (!taskInstance || taskInstance.instanceId !== instanceId) {
      throw ApiError.notFound("Task not found");
    }

    if (taskInstance.status !== "IN_PROGRESS") {
      throw ApiError.conflict("Can only reassign tasks that are in progress");
    }

    // Only instance owner or admin can reassign
    const isOwner = taskInstance.instance.ownerId === user.id;
    const adminRole = await prisma.userRole.findFirst({
      where: {
        userId: user.id,
        role: { name: "admin" },
      },
    });
    const isAdmin = !!adminRole;

    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden(
        "Only the workflow owner or an admin can reassign tasks"
      );
    }

    // Verify new assignee exists and is active
    const newAssignee = await prisma.user.findUnique({
      where: { id: body.assigneeId },
      select: { id: true, name: true, status: true },
    });

    if (!newAssignee || newAssignee.status !== "ACTIVE") {
      throw ApiError.badRequest("Target user not found or is inactive");
    }

    // Reassign
    await prisma.taskInstance.update({
      where: { id: taskId },
      data: { assigneeId: body.assigneeId },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        instanceId,
        userId: user.id,
        action: "TASK_ASSIGNED",
        details: {
          nodeId: taskInstance.nodeId,
          label: taskInstance.node.label,
          taskInstanceId: taskId,
          previousAssigneeId: taskInstance.assigneeId,
          reassignedBy: user.id,
        },
      },
    });

    // Notify new assignee (fire-and-forget)
    notifyTaskAssigned(
      body.assigneeId,
      instanceId,
      taskInstance.node.label,
      taskInstance.instance.title
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      assigneeId: body.assigneeId,
      assigneeName: newAssignee.name,
    });
  },
});
