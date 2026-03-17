import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        client: { select: { id: true, name: true, shortCode: true, slaTier: true } },
        contacts: { include: { contact: { select: { id: true, name: true, email: true, role: true } } } },
      },
    });
    if (!project) throw ApiError.notFound("Project not found");

    const instancesByStatus = await prisma.workflowInstance.groupBy({
      by: ["status"],
      _count: true,
      where: { projectId: params.id },
    });

    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const g of instancesByStatus) {
      statusMap[g.status] = g._count;
      total += g._count;
    }

    const recentInstances = await prisma.workflowInstance.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, title: true, status: true, startedAt: true, completedAt: true, createdAt: true,
        template: { select: { name: true } },
        owner: { select: { name: true } },
      },
    });

    return NextResponse.json({
      project: {
        id: project.id, name: project.name, description: project.description,
        isActive: project.isActive, startDate: project.startDate, endDate: project.endDate,
        client: project.client,
        contacts: project.contacts.map(pc => pc.contact),
      },
      instances: {
        total,
        byStatus: statusMap,
        completionRate: total > 0 ? Math.round(((statusMap["COMPLETED"] ?? 0) / total) * 100) : 0,
      },
      recentInstances,
    });
  },
});
