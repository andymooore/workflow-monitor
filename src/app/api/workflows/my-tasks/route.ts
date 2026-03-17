import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { NodeStatus } from "@/generated/prisma/client";

// Valid node statuses for filtering
const VALID_STATUSES: NodeStatus[] = [
  "PENDING",
  "WAITING",
  "IN_PROGRESS",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "SKIPPED",
];

// ---------------------------------------------------------------------------
// GET /api/workflows/my-tasks
// Tasks assigned to current user, with optional ?status filter.
// Includes instance title, template name.
// Optimized: uses select instead of include, limits node and approval fields
// to only what the list view needs.
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
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    // Validate status filter
    if (statusParam && !VALID_STATUSES.includes(statusParam as NodeStatus)) {
      throw ApiError.badRequest(`Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const status = statusParam as NodeStatus | null;
    const limit = Math.min(
      Math.max(parseInt(limitParam ?? "50", 10) || 50, 1),
      200,
    );

    const where: Record<string, unknown> = {
      assigneeId: user.id,
      instance: { status: "RUNNING" },
    };
    if (status) where.status = status;

    const [tasks, total] = await Promise.all([
      prisma.taskInstance.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          instanceId: true,
          status: true,
          activatedAt: true,
          notes: true,
          node: {
            select: { label: true, type: true },
          },
          assignee: { select: { id: true, name: true, email: true } },
          instance: {
            select: {
              title: true,
              template: { select: { id: true, name: true } },
              owner: { select: { id: true, name: true, email: true } },
            },
          },
          approvals: {
            select: {
              id: true,
              decision: true,
              comment: true,
              decider: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.taskInstance.count({ where }),
    ]);

    // Flatten for the dashboard consumption format
    const data = tasks.map((task) => ({
      id: task.id,
      instanceId: task.instanceId,
      label: task.node.label,
      nodeType: task.node.type,
      workflowTitle: task.instance.title,
      templateName: task.instance.template.name,
      templateId: task.instance.template.id,
      status: task.status,
      assignedAt: task.activatedAt,
      assignee: task.assignee,
      owner: task.instance.owner,
      notes: task.notes,
      approvals: task.approvals,
    }));

    return NextResponse.json({ data, total, limit, offset, hasMore: offset + limit < total });
  },
});
