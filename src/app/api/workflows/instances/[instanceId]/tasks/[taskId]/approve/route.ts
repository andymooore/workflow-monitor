import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { workflowEngine } from "@/lib/engine/workflow-engine";
import { approvalSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { canAccessInstance, authorizeTaskAction } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// POST /api/workflows/instances/[instanceId]/tasks/[taskId]/approve
// Submit an approval decision. Body: { decision: "APPROVED"|"REJECTED", comment? }
// ---------------------------------------------------------------------------
export const POST = withAuth({
  schema: approvalSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId, taskId } = params;
    const { decision, comment } = body;

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
      if (e instanceof Error && e.message === "TASK_FORBIDDEN") throw ApiError.forbidden("Only the task assignee or an admin can approve this task");
      throw e;
    }

    await workflowEngine.submitApproval(
      taskId,
      user.id,
      decision,
      comment ?? null,
      prisma,
    );

    return NextResponse.json({ success: true });
  },
});
