import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const ministry = await prisma.ministry.findUnique({
      where: { id: params.id },
    });
    if (!ministry) throw ApiError.notFound("Ministry not found");

    const clients = await prisma.client.findMany({
      where: { ministryId: params.id },
      select: {
        id: true, name: true, shortCode: true, slaTier: true, status: true,
        hasSignedAgreement: true,
        _count: { select: { instances: true, projects: true, contacts: true } },
      },
    });

    const clientIds = clients.map(c => c.id);

    // Aggregate instances across all clients
    const instancesByStatus = await prisma.workflowInstance.groupBy({
      by: ["status"],
      _count: true,
      where: { clientId: { in: clientIds } },
    });

    const statusMap: Record<string, number> = {};
    let totalInstances = 0;
    for (const g of instancesByStatus) {
      statusMap[g.status] = g._count;
      totalInstances += g._count;
    }

    // Per-client breakdown
    const perClient = await prisma.workflowInstance.groupBy({
      by: ["clientId", "status"],
      _count: true,
      where: { clientId: { in: clientIds } },
    });

    const clientBreakdown: Record<string, Record<string, number>> = {};
    for (const g of perClient) {
      if (!g.clientId) continue;
      if (!clientBreakdown[g.clientId]) clientBreakdown[g.clientId] = {};
      clientBreakdown[g.clientId][g.status] = g._count;
    }

    return NextResponse.json({
      ministry: {
        id: ministry.id, name: ministry.name, shortCode: ministry.shortCode,
        headOfEntity: ministry.headOfEntity, status: ministry.status,
      },
      clients: clients.map(c => ({
        ...c,
        instanceBreakdown: clientBreakdown[c.id] ?? {},
      })),
      aggregate: {
        totalClients: clients.length,
        activeClients: clients.filter(c => c.status === "ACTIVE").length,
        totalInstances,
        byStatus: statusMap,
        completionRate: totalInstances > 0 ? Math.round(((statusMap["COMPLETED"] ?? 0) / totalInstances) * 100) : 0,
        totalProjects: clients.reduce((sum, c) => sum + c._count.projects, 0),
        agreementCoverage: clients.length > 0
          ? Math.round((clients.filter(c => c.hasSignedAgreement).length / clients.length) * 100)
          : 0,
      },
    });
  },
});
