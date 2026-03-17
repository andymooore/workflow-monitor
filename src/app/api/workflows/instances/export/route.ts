import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// GET /api/workflows/instances/export?format=csv
export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { searchParams } = request.nextUrl;
    const format = searchParams.get("format") ?? "csv";
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "5000") || 5000, 10000);

    const clientId = searchParams.get("clientId");
    const projectId = searchParams.get("projectId");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (projectId) where.projectId = projectId;

    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const instances = await prisma.workflowInstance.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true, email: true } },
        template: { select: { name: true, category: true } },
        client: { select: { name: true, shortCode: true, slaTier: true, ministry: { select: { name: true, shortCode: true } } } },
        project: { select: { name: true } },
        taskInstances: {
          select: { status: true },
        },
      },
    });

    if (format === "json") {
      const data = instances.map((inst) => ({
        id: inst.id,
        title: inst.title,
        status: inst.status,
        template: inst.template.name,
        category: inst.template.category,
        client: inst.client?.name ?? "",
        clientCode: inst.client?.shortCode ?? "",
        ministry: inst.client?.ministry?.name ?? null,
        ministryCode: inst.client?.ministry?.shortCode ?? null,
        slaTier: inst.client?.slaTier ?? null,
        project: inst.project?.name ?? "",
        owner: inst.owner.name,
        ownerEmail: inst.owner.email,
        startedAt: inst.startedAt?.toISOString() ?? null,
        completedAt: inst.completedAt?.toISOString() ?? null,
        createdAt: inst.createdAt.toISOString(),
        totalTasks: inst.taskInstances.length,
        completedTasks: inst.taskInstances.filter(
          (t) => ["COMPLETED", "APPROVED", "SKIPPED"].includes(t.status)
        ).length,
      }));
      return NextResponse.json(data);
    }

    // CSV format
    const headers = [
      "ID", "Title", "Status", "Template", "Category", "Client", "Client Code",
      "Ministry", "Ministry Code", "SLA Tier", "Project",
      "Owner", "Owner Email",
      "Started At", "Completed At", "Created At", "Total Tasks", "Completed Tasks"
    ];

    const rows = instances.map((inst) => {
      const completedTasks = inst.taskInstances.filter(
        (t) => ["COMPLETED", "APPROVED", "SKIPPED"].includes(t.status)
      ).length;
      return [
        inst.id,
        `"${inst.title.replace(/"/g, '""')}"`,
        inst.status,
        `"${inst.template.name.replace(/"/g, '""')}"`,
        `"${inst.template.category.replace(/"/g, '""')}"`,
        `"${(inst.client?.name ?? "").replace(/"/g, '""')}"`,
        `"${(inst.client?.shortCode ?? "").replace(/"/g, '""')}"`,
        `"${(inst.client?.ministry?.name ?? "").replace(/"/g, '""')}"`,
        `"${(inst.client?.ministry?.shortCode ?? "").replace(/"/g, '""')}"`,
        `"${(inst.client?.slaTier ?? "").replace(/"/g, '""')}"`,
        `"${(inst.project?.name ?? "").replace(/"/g, '""')}"`,
        `"${inst.owner.name.replace(/"/g, '""')}"`,
        inst.owner.email,
        inst.startedAt?.toISOString() ?? "",
        inst.completedAt?.toISOString() ?? "",
        inst.createdAt.toISOString(),
        inst.taskInstances.length.toString(),
        completedTasks.toString(),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="workflow-instances-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  },
});
