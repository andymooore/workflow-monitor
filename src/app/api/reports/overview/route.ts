import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const isAdmin = user.roles.includes("admin");

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Row-level security: non-admin users only see instances they own or
    // have task assignments on.
    const instanceWhere: Record<string, unknown> = {};
    const taskWhere: Record<string, unknown> = {};
    if (!isAdmin) {
      instanceWhere.OR = [
        { ownerId: user.id },
        { taskInstances: { some: { assigneeId: user.id } } },
      ];
      taskWhere.instance = {
        OR: [
          { ownerId: user.id },
          { taskInstances: { some: { assigneeId: user.id } } },
        ],
      };
    }

    const [
      totalInstances,
      runningInstances,
      completedInstances,
      cancelledInstances,
      completedThisMonth,
      completedThisWeek,
      overdueTasks,
      instancesByClient,
    ] = await Promise.all([
      prisma.workflowInstance.count({ where: instanceWhere }),
      prisma.workflowInstance.count({ where: { ...instanceWhere, status: "RUNNING" } }),
      prisma.workflowInstance.count({ where: { ...instanceWhere, status: "COMPLETED" } }),
      prisma.workflowInstance.count({ where: { ...instanceWhere, status: "CANCELLED" } }),
      prisma.workflowInstance.count({
        where: { ...instanceWhere, status: "COMPLETED", completedAt: { gte: thirtyDaysAgo } },
      }),
      prisma.workflowInstance.count({
        where: { ...instanceWhere, status: "COMPLETED", completedAt: { gte: sevenDaysAgo } },
      }),
      prisma.taskInstance.count({
        where: {
          ...taskWhere,
          dueDate: { lt: now },
          status: { in: ["PENDING", "WAITING", "IN_PROGRESS"] },
        },
      }),
      prisma.workflowInstance.groupBy({
        by: ["clientId"],
        _count: true,
        where: { ...instanceWhere, status: "RUNNING" },
        orderBy: { _count: { clientId: "desc" } },
        take: 10,
      }),
    ]);

    // Use raw SQL aggregation for average completion time instead of loading records
    // This avoids fetching up to 500 rows just to compute an average.
    let avgHours = 0;
    if (isAdmin) {
      const avgResult = await prisma.$queryRawUnsafe<Array<{ avg_hours: number | null }>>(
        `SELECT ROUND(CAST(AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) / 3600) AS numeric), 1) as avg_hours
         FROM "WorkflowInstance"
         WHERE status = 'COMPLETED' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL`,
      );
      avgHours = avgResult[0]?.avg_hours ?? 0;
    } else {
      // For non-admin, compute from a bounded set of their relevant instances
      const userInstances = await prisma.workflowInstance.findMany({
        where: {
          ...instanceWhere,
          status: "COMPLETED",
          startedAt: { not: null },
          completedAt: { not: null },
        },
        select: { startedAt: true, completedAt: true },
        take: 200,
        orderBy: { completedAt: "desc" },
      });
      if (userInstances.length > 0) {
        const totalMs = userInstances.reduce((sum, inst) => {
          return sum + (inst.completedAt!.getTime() - inst.startedAt!.getTime());
        }, 0);
        avgHours = Math.round(totalMs / userInstances.length / (1000 * 60 * 60) * 10) / 10;
      }
    }

    // SLA compliance: use count queries instead of loading all task records
    const slaBaseWhere = {
      ...taskWhere,
      dueDate: { not: null },
      status: { in: ["COMPLETED" as const, "APPROVED" as const] },
      completedAt: { not: null },
    };
    const [totalWithDueDate, onTimeCount] = await Promise.all([
      prisma.taskInstance.count({ where: slaBaseWhere }),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        isAdmin
          ? `SELECT COUNT(*) as count FROM "TaskInstance"
             WHERE "dueDate" IS NOT NULL
             AND status IN ('COMPLETED', 'APPROVED')
             AND "completedAt" IS NOT NULL
             AND "completedAt" <= "dueDate"`
          : `SELECT COUNT(*) as count FROM "TaskInstance" t
             INNER JOIN "WorkflowInstance" wi ON t."instanceId" = wi.id
             WHERE t."dueDate" IS NOT NULL
             AND t.status IN ('COMPLETED', 'APPROVED')
             AND t."completedAt" IS NOT NULL
             AND t."completedAt" <= t."dueDate"
             AND (wi."ownerId" = $1 OR t."assigneeId" = $1)`,
        ...(isAdmin ? [] : [user.id]),
      ),
    ]);
    const onTime = Number(onTimeCount[0]?.count ?? 0);
    const slaComplianceRate = totalWithDueDate > 0
      ? Math.round((onTime / totalWithDueDate) * 100)
      : null;

    // Resolve client names for top clients
    const clientIds = instancesByClient
      .map(g => g.clientId)
      .filter((id): id is string => id !== null);
    const clients = clientIds.length > 0
      ? await prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true, shortCode: true },
        })
      : [];
    const clientMap = new Map(clients.map(c => [c.id, c]));

    const topClients = instancesByClient.map(g => ({
      clientId: g.clientId,
      clientName: clientMap.get(g.clientId ?? "")?.name ?? "Unknown",
      clientCode: clientMap.get(g.clientId ?? "")?.shortCode ?? "?",
      activeInstances: g._count,
    }));

    return NextResponse.json({
      totals: { total: totalInstances, running: runningInstances, completed: completedInstances, cancelled: cancelledInstances },
      throughput: { completedThisWeek, completedThisMonth },
      performance: { avgCompletionTimeHours: avgHours, slaComplianceRate, overdueTasks },
      topClients,
    });
  },
});
