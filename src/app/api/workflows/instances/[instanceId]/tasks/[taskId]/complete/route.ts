import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { workflowEngine } from "@/lib/engine/workflow-engine";
import { completeTaskSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { canAccessInstance, authorizeTaskAction } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// POST /api/workflows/instances/[instanceId]/tasks/[taskId]/complete
// Complete a task. Body: { notes? }
// ---------------------------------------------------------------------------
export const POST = withAuth({
  schema: completeTaskSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId, taskId } = params;
    const { notes } = body;

    // Instance-level authorization
    const hasAccess = await canAccessInstance(user.id, instanceId, user.roles);
    if (!hasAccess) {
      throw ApiError.forbidden("You do not have access to this workflow instance");
    }

    // Task-level authorization: only assignee or admin
    try {
      await authorizeTaskAction(user.id, taskId, instanceId, user.roles);
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "TASK_NOT_FOUND") throw ApiError.notFound("Task not found");
      if (e instanceof Error && e.message === "TASK_FORBIDDEN") throw ApiError.forbidden("Only the task assignee or an admin can complete this task");
      throw e;
    }

    await workflowEngine.completeTask(taskId, user.id, notes ?? null, prisma);

    return NextResponse.json({ success: true });
  },
});
