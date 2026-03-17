import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { startOfWeek } from "date-fns";

// ---------------------------------------------------------------------------
// GET /api/workflows/dashboard/stats
// Returns { activeWorkflows, myPendingTasks, pendingApprovals, completedThisWeek }
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday

    const [activeWorkflows, myPendingTasks, pendingApprovals, completedThisWeek] =
      await Promise.all([
        // Count running instances
        prisma.workflowInstance.count({
          where: { status: "RUNNING" },
        }),

        // Count tasks assigned to current user that are IN_PROGRESS
        prisma.taskInstance.count({
          where: {
            assigneeId: user.id,
            status: "IN_PROGRESS",
            instance: { status: "RUNNING" },
          },
        }),

        // Count pending approvals where current user is a decider
        prisma.approval.count({
          where: {
            deciderId: user.id,
            decision: "PENDING",
            taskInstance: {
              status: "IN_PROGRESS",
              instance: { status: "RUNNING" },
            },
          },
        }),

        // Count instances completed this week
        prisma.workflowInstance.count({
          where: {
            status: "COMPLETED",
            completedAt: { gte: weekStart },
          },
        }),
      ]);

    return NextResponse.json({
      activeWorkflows,
      myPendingTasks,
      pendingApprovals,
      completedThisWeek,
    });
  },
});
