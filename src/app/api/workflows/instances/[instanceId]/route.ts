import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { workflowEngine } from "@/lib/engine/workflow-engine";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { canAccessInstance } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// GET /api/workflows/instances/[instanceId]
// Full instance with taskInstances, nodes, assignees, approvals.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId } = params;

    const hasAccess = await canAccessInstance(user.id, instanceId, user.roles);
    if (!hasAccess) {
      throw ApiError.forbidden("You do not have access to this workflow instance");
    }

    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            nodes: {
              include: {
                roleAssignments: { include: { role: true } },
              },
            },
            edges: true,
          },
        },
        owner: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true, shortCode: true } },
        project: { select: { id: true, name: true } },
        requestedByContact: { select: { id: true, name: true, email: true, role: true, title: true } },
        documents: {
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
        taskInstances: {
          include: {
            node: true,
            assignee: { select: { id: true, name: true, email: true } },
            approvals: {
              include: {
                decider: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!instance) {
      throw ApiError.notFound("Instance not found");
    }

    return NextResponse.json(instance);
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/workflows/instances/[instanceId]
// Cancel instance via engine.
// ---------------------------------------------------------------------------
export const DELETE = withAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId } = params;

    const hasAccess = await canAccessInstance(user.id, instanceId, user.roles);
    if (!hasAccess) {
      throw ApiError.forbidden("You do not have access to this workflow instance");
    }

    await workflowEngine.cancelInstance(instanceId, user.id, prisma);

    return NextResponse.json({ success: true });
  },
});
