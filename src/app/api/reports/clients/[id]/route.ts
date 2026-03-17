import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const GET = withAuth({
  handler: async (request, { params, user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const isAdmin = user.roles.includes("admin");

    const client = await prisma.client.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        shortCode: true,
        slaTier: true,
        hasSignedAgreement: true,
        ministry: { select: { id: true, name: true, shortCode: true } },
        _count: { select: { projects: true, contacts: true } },
      },
    });
    if (!client) throw ApiError.notFound("Client not found");

    // Row-level security: non-admin users can only see data for instances
    // they own or are assigned tasks on
    const instanceScopeWhere: Record<string, unknown> = { clientId: params.id };
    const taskScopeWhere: Record<string, unknown> = { instance: { clientId: params.id } };
    if (!isAdmin) {
      instanceScopeWhere.OR = [
        { ownerId: user.id },
        { taskInstances: { some: { assigneeId: user.id } } },
      ];
      taskScopeWhere.instance = {
        clientId: params.id,
        OR: [
          { ownerId: user.id },
          { taskInstances: { some: { assigneeId: user.id } } },
        ],
      };
    }

    // Instance breakdown by status - uses groupBy aggregation (no full records loaded)
    const instancesByStatus = await prisma.workflowInstance.groupBy({
      by: ["status"],
      _count: true,
      where: instanceScopeWhere,
    });

    const statusMap: Record<string, number> = {};
    let totalInstances = 0;
    for (const g of instancesByStatus) {
      statusMap[g.status] = g._count;
      totalInstances += g._count;
    }

    // Average completion time - bounded query with limit
    const completedInstances = await prisma.workflowInstance.findMany({
      where: {
        ...instanceScopeWhere,
        status: "COMPLETED",
        startedAt: { not: null },
        completedAt: { not: null },
      },
      select: { startedAt: true, completedAt: true },
      take: 100,
      orderBy: { completedAt: "desc" },
    });

    let avgCompletionHours = 0;
    if (completedInstances.length > 0) {
      const totalMs = completedInstances.reduce((sum, i) =>
        sum + (i.completedAt!.getTime() - i.startedAt!.getTime()), 0);
      avgCompletionHours = Math.round(totalMs / completedInstances.length / (1000 * 60 * 60) * 10) / 10;
    }

    // SLA compliance for this client - use count queries instead of loading records
    const [totalTasksWithDue, onTimeResult] = await Promise.all([
      prisma.taskInstance.count({
        where: {
          ...taskScopeWhere,
          dueDate: { not: null },
          status: { in: ["COMPLETED", "APPROVED"] },
          completedAt: { not: null },
        },
      }),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        isAdmin
          ? `SELECT COUNT(*) as count FROM "TaskInstance" t
             INNER JOIN "WorkflowInstance" wi ON t."instanceId" = wi.id
             WHERE wi."clientId" = $1
             AND t."dueDate" IS NOT NULL
             AND t.status IN ('COMPLETED', 'APPROVED')
             AND t."completedAt" IS NOT NULL
             AND t."completedAt" <= t."dueDate"`
          : `SELECT COUNT(*) as count FROM "TaskInstance" t
             INNER JOIN "WorkflowInstance" wi ON t."instanceId" = wi.id
             WHERE wi."clientId" = $1
             AND t."dueDate" IS NOT NULL
             AND t.status IN ('COMPLETED', 'APPROVED')
             AND t."completedAt" IS NOT NULL
             AND t."completedAt" <= t."dueDate"
             AND (wi."ownerId" = $2 OR t."assigneeId" = $2)`,
        params.id,
        ...(isAdmin ? [] : [user.id]),
      ),
    ]);
    const onTime = Number(onTimeResult[0]?.count ?? 0);
    const slaCompliance = totalTasksWithDue > 0 ? Math.round((onTime / totalTasksWithDue) * 100) : null;

    // Top assignees working on this client's tasks - uses groupBy (no full records)
    const topAssignees = await prisma.taskInstance.groupBy({
      by: ["assigneeId"],
      _count: true,
      where: {
        instance: { clientId: params.id },
        assigneeId: { not: null },
        status: { in: ["COMPLETED", "APPROVED"] },
      },
      orderBy: { _count: { assigneeId: "desc" } },
      take: 5,
    });

    const assigneeIds = topAssignees.map(a => a.assigneeId).filter((id): id is string => id !== null);
    const assignees = assigneeIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true },
        })
      : [];
    const assigneeMap = new Map(assignees.map(u => [u.id, u.name]));

    // Recent instances - bounded with take: 10
    const recentInstances = await prisma.workflowInstance.findMany({
      where: instanceScopeWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, title: true, status: true, startedAt: true, completedAt: true, createdAt: true,
        template: { select: { name: true } },
        owner: { select: { name: true } },
      },
    });

    // Projects with instance counts - bounded to this client's projects
    const projects = await prisma.project.findMany({
      where: { clientId: params.id },
      select: {
        id: true,
        name: true,
        isActive: true,
        _count: { select: { instances: true } },
      },
      orderBy: { name: "asc" },
      take: 100,
    });

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        shortCode: client.shortCode,
        slaTier: client.slaTier,
        ministry: client.ministry,
        hasSignedAgreement: client.hasSignedAgreement,
        projectCount: client._count.projects,
        contactCount: client._count.contacts,
      },
      instances: {
        total: totalInstances,
        byStatus: statusMap,
        completionRate: totalInstances > 0 ? Math.round(((statusMap["COMPLETED"] ?? 0) / totalInstances) * 100) : 0,
      },
      performance: {
        avgCompletionHours,
        slaCompliance,
      },
      topAssignees: topAssignees.map(a => ({
        userId: a.assigneeId,
        name: assigneeMap.get(a.assigneeId ?? "") ?? "Unknown",
        completedTasks: a._count,
      })),
      recentInstances,
      projects: projects.map(p => ({
        id: p.id, name: p.name, isActive: p.isActive,
        instanceCount: p._count.instances,
      })),
    });
  },
});
