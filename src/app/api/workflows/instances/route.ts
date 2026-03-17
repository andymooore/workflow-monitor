import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { InstanceStatus } from "@/generated/prisma/client";

// Valid instance statuses for filtering
const VALID_STATUSES: InstanceStatus[] = [
  "DRAFT",
  "RUNNING",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
];

// ---------------------------------------------------------------------------
// GET /api/workflows/instances
// List instances with filters: ?status=RUNNING&limit=10&ownerId=...
// Includes template name, owner, task progress counts.
// Uses _count for total tasks and a grouped count query for completed tasks
// instead of loading all task instance rows.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { searchParams } = request.nextUrl;
    const statusParam = searchParams.get("status");
    const limitParam = searchParams.get("limit");
    const ownerId = searchParams.get("ownerId");

    // Validate status filter
    if (statusParam && !VALID_STATUSES.includes(statusParam as InstanceStatus)) {
      throw ApiError.badRequest(`Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const status = statusParam as InstanceStatus | null;
    const limit = Math.min(
      Math.max(parseInt(limitParam ?? "50", 10) || 50, 1),
      200,
    );

    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    const isAdmin = user.roles.includes("admin");
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (ownerId) where.ownerId = ownerId;

    const clientId = searchParams.get("clientId");
    const projectId = searchParams.get("projectId");
    if (clientId) where.clientId = clientId;
    if (projectId) where.projectId = projectId;

    // Non-admins can only see instances they own or are assigned to
    if (!isAdmin) {
      where.OR = [
        { ownerId: user.id },
        { taskInstances: { some: { assigneeId: user.id } } },
      ];
    }

    const [instances, total] = await Promise.all([
      prisma.workflowInstance.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          metadata: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          clientId: true,
          projectId: true,
          template: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true, email: true } },
          client: { select: { id: true, name: true, shortCode: true } },
          project: { select: { id: true, name: true } },
          _count: { select: { taskInstances: true } },
        },
      }),
      prisma.workflowInstance.count({ where }),
    ]);

    // Batch-fetch completed task counts for all returned instances in one query
    const instanceIds = instances.map((inst) => inst.id);
    const completedCounts = instanceIds.length > 0
      ? await prisma.taskInstance.groupBy({
          by: ["instanceId"],
          _count: true,
          where: {
            instanceId: { in: instanceIds },
            status: { in: ["COMPLETED", "APPROVED", "SKIPPED"] },
          },
        })
      : [];
    const completedMap = new Map(
      completedCounts.map((g) => [g.instanceId, g._count]),
    );

    // Map to include progress counts
    const data = instances.map((inst) => {
      const taskTotal = inst._count.taskInstances;
      const completed = completedMap.get(inst.id) ?? 0;

      return {
        id: inst.id,
        title: inst.title,
        templateName: inst.template.name,
        templateId: inst.template.id,
        ownerName: inst.owner.name,
        ownerId: inst.owner.id,
        clientId: inst.clientId,
        clientName: inst.client?.name ?? null,
        clientCode: inst.client?.shortCode ?? null,
        projectId: inst.projectId,
        projectName: inst.project?.name ?? null,
        status: inst.status,
        metadata: inst.metadata,
        startedAt: inst.startedAt,
        completedAt: inst.completedAt,
        createdAt: inst.createdAt,
        progress: { completed, total: taskTotal },
      };
    });

    return NextResponse.json({ data, total, limit, offset, hasMore: offset + limit < total });
  },
});
