import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true, name: true, email: true, status: true, createdAt: true,
        roles: { include: { role: { select: { name: true } } } },
        defaultClient: { select: { id: true, name: true, shortCode: true } },
      },
    });
    if (!user) throw ApiError.notFound("User not found");

    // Task stats
    const [totalAssigned, completedTasks, inProgressTasks, overdueTasks] = await Promise.all([
      prisma.taskInstance.count({ where: { assigneeId: params.id } }),
      prisma.taskInstance.count({ where: { assigneeId: params.id, status: { in: ["COMPLETED", "APPROVED"] } } }),
      prisma.taskInstance.count({ where: { assigneeId: params.id, status: "IN_PROGRESS" } }),
      prisma.taskInstance.count({
        where: { assigneeId: params.id, status: "IN_PROGRESS", dueDate: { lt: new Date() } },
      }),
    ]);

    // Average task completion time
    const completedTasksWithTime = await prisma.taskInstance.findMany({
      where: {
        assigneeId: params.id,
        status: { in: ["COMPLETED", "APPROVED"] },
        activatedAt: { not: null },
        completedAt: { not: null },
      },
      select: { activatedAt: true, completedAt: true },
      take: 200,
      orderBy: { completedAt: "desc" },
    });

    let avgTaskHours = 0;
    if (completedTasksWithTime.length > 0) {
      const totalMs = completedTasksWithTime.reduce((sum, t) =>
        sum + (t.completedAt!.getTime() - t.activatedAt!.getTime()), 0);
      avgTaskHours = Math.round(totalMs / completedTasksWithTime.length / (1000 * 60 * 60) * 10) / 10;
    }

    // Approval stats
    const [totalApprovals, approvedCount, rejectedCount] = await Promise.all([
      prisma.approval.count({ where: { deciderId: params.id, decision: { not: "PENDING" } } }),
      prisma.approval.count({ where: { deciderId: params.id, decision: "APPROVED" } }),
      prisma.approval.count({ where: { deciderId: params.id, decision: "REJECTED" } }),
    ]);

    // Average approval turnaround
    const approvalTimes = await prisma.approval.findMany({
      where: {
        deciderId: params.id,
        decision: { not: "PENDING" },
        decidedAt: { not: undefined },
      },
      select: { createdAt: true, decidedAt: true },
      take: 200,
      orderBy: { decidedAt: "desc" },
    });

    let avgApprovalHours = 0;
    if (approvalTimes.length > 0) {
      const totalMs = approvalTimes.reduce((sum, a) =>
        sum + (a.decidedAt!.getTime() - a.createdAt.getTime()), 0);
      avgApprovalHours = Math.round(totalMs / approvalTimes.length / (1000 * 60 * 60) * 10) / 10;
    }

    // Instances owned
    const ownedByStatus = await prisma.workflowInstance.groupBy({
      by: ["status"],
      _count: true,
      where: { ownerId: params.id },
    });
    const ownedMap: Record<string, number> = {};
    let totalOwned = 0;
    for (const g of ownedByStatus) {
      ownedMap[g.status] = g._count;
      totalOwned += g._count;
    }

    // Recent activity
    const recentTasks = await prisma.taskInstance.findMany({
      where: { assigneeId: params.id },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true, status: true, activatedAt: true, completedAt: true,
        node: { select: { label: true, type: true } },
        instance: { select: { id: true, title: true, client: { select: { name: true, shortCode: true } } } },
      },
    });

    return NextResponse.json({
      user: {
        id: user.id, name: user.name, email: user.email, status: user.status,
        roles: user.roles.map(r => r.role.name),
        defaultClient: user.defaultClient,
        memberSince: user.createdAt,
      },
      tasks: {
        totalAssigned,
        completed: completedTasks,
        inProgress: inProgressTasks,
        overdue: overdueTasks,
        completionRate: totalAssigned > 0 ? Math.round((completedTasks / totalAssigned) * 100) : 0,
        avgCompletionHours: avgTaskHours,
      },
      approvals: {
        total: totalApprovals,
        approved: approvedCount,
        rejected: rejectedCount,
        approvalRate: totalApprovals > 0 ? Math.round((approvedCount / totalApprovals) * 100) : 0,
        avgTurnaroundHours: avgApprovalHours,
      },
      ownedInstances: {
        total: totalOwned,
        byStatus: ownedMap,
      },
      recentTasks,
    });
  },
});
