import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const template = await prisma.workflowTemplate.findUnique({
      where: { id: params.id },
      select: {
        id: true, name: true, description: true, category: true, version: true, isPublished: true,
        createdBy: { select: { name: true } },
        _count: { select: { instances: true, nodes: true } },
      },
    });
    if (!template) throw ApiError.notFound("Template not found");

    // Instance status breakdown
    const instancesByStatus = await prisma.workflowInstance.groupBy({
      by: ["status"],
      _count: true,
      where: { templateId: params.id },
    });

    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const g of instancesByStatus) {
      statusMap[g.status] = g._count;
      total += g._count;
    }

    // Average completion time
    const completedInstances = await prisma.workflowInstance.findMany({
      where: { templateId: params.id, status: "COMPLETED", startedAt: { not: null }, completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
    });
    let avgHours = 0;
    if (completedInstances.length > 0) {
      const totalMs = completedInstances.reduce((sum, i) =>
        sum + (i.completedAt!.getTime() - i.startedAt!.getTime()), 0);
      avgHours = Math.round(totalMs / completedInstances.length / (1000 * 60 * 60) * 10) / 10;
    }

    // Bottleneck analysis: which nodes take the longest
    const nodeTimings: Record<string, { totalMs: number; count: number; label: string }> = {};
    const completedTasks = await prisma.taskInstance.findMany({
      where: {
        instance: { templateId: params.id },
        status: { in: ["COMPLETED", "APPROVED"] },
        activatedAt: { not: null },
        completedAt: { not: null },
      },
      select: { nodeId: true, activatedAt: true, completedAt: true, node: { select: { label: true } } },
    });

    for (const t of completedTasks) {
      if (!nodeTimings[t.nodeId]) nodeTimings[t.nodeId] = { totalMs: 0, count: 0, label: t.node.label };
      nodeTimings[t.nodeId].totalMs += t.completedAt!.getTime() - t.activatedAt!.getTime();
      nodeTimings[t.nodeId].count++;
    }

    const bottlenecks = Object.entries(nodeTimings)
      .map(([nodeId, data]) => ({
        nodeId,
        label: data.label,
        avgHours: Math.round(data.totalMs / data.count / (1000 * 60 * 60) * 10) / 10,
        completedCount: data.count,
      }))
      .sort((a, b) => b.avgHours - a.avgHours);

    // Top clients using this template
    const topClients = await prisma.workflowInstance.groupBy({
      by: ["clientId"],
      _count: true,
      where: { templateId: params.id, clientId: { not: null } },
      orderBy: { _count: { clientId: "desc" } },
      take: 5,
    });

    const clientIds = topClients.map(g => g.clientId).filter((id): id is string => id !== null);
    const clientsData = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, name: true, shortCode: true },
    });
    const clientMap = new Map(clientsData.map(c => [c.id, c]));

    return NextResponse.json({
      template: {
        ...template,
        nodeCount: template._count.nodes,
        instanceCount: template._count.instances,
      },
      instances: {
        total,
        byStatus: statusMap,
        completionRate: total > 0 ? Math.round(((statusMap["COMPLETED"] ?? 0) / total) * 100) : 0,
        avgCompletionHours: avgHours,
      },
      bottlenecks,
      topClients: topClients.map(g => ({
        clientId: g.clientId,
        clientName: clientMap.get(g.clientId ?? "")?.name ?? "Unknown",
        clientCode: clientMap.get(g.clientId ?? "")?.shortCode ?? "?",
        instanceCount: g._count,
      })),
    });
  },
});
