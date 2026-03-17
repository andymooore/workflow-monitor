import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { updateProjectSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";

// GET /api/projects/[id]
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            shortCode: true,
            slaTier: true,
          },
        },
        milestones: {
          orderBy: { sortOrder: "asc" },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        _count: {
          select: {
            instances: true,
            milestones: true,
            members: true,
            documents: true,
          },
        },
      },
    });

    if (!project) throw ApiError.notFound("Project not found");

    // Compute milestone stats
    const milestoneStats = {
      total: project.milestones.length,
      completed: project.milestones.filter((m) => m.status === "COMPLETED").length,
      inProgress: project.milestones.filter((m) => m.status === "IN_PROGRESS").length,
      pending: project.milestones.filter((m) => m.status === "PENDING").length,
      missed: project.milestones.filter((m) => m.status === "MISSED").length,
    };

    // Count active workflows
    const activeWorkflows = await prisma.workflowInstance.count({
      where: { projectId: params.id, status: "RUNNING" },
    });

    return NextResponse.json({
      ...project,
      milestoneStats,
      activeWorkflows,
    });
  },
});

// PUT /api/projects/[id]
export const PUT = withAdminAuth({
  schema: updateProjectSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const existing = await prisma.project.findUnique({ where: { id: params.id } });
    if (!existing) throw ApiError.notFound("Project not found");

    if (body.name && body.name !== existing.name) {
      const dup = await prisma.project.findUnique({
        where: { clientId_name: { clientId: existing.clientId, name: body.name } },
      });
      if (dup) throw ApiError.conflict("A project with this name already exists for this client");
    }

    const statusChanged = body.status && body.status !== existing.status;
    const previousStatus = existing.status;

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        name: body.name ?? existing.name,
        description: body.description !== undefined ? body.description : existing.description,
        isActive: body.isActive ?? existing.isActive,
        status: body.status ?? existing.status,
        health: body.health ?? existing.health,
        budgetAmount: body.budgetAmount !== undefined ? body.budgetAmount : existing.budgetAmount,
        budgetSpent: body.budgetSpent !== undefined ? body.budgetSpent : existing.budgetSpent,
        budgetCurrency: body.budgetCurrency ?? existing.budgetCurrency,
        startDate: body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : existing.startDate,
        endDate: body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : existing.endDate,
        slaReference: body.slaReference !== undefined ? body.slaReference : existing.slaReference,
        slaSignedDate: body.slaSignedDate !== undefined ? (body.slaSignedDate ? new Date(body.slaSignedDate) : null) : existing.slaSignedDate,
        slaSummary: body.slaSummary !== undefined ? body.slaSummary : existing.slaSummary,
        torReference: body.torReference !== undefined ? body.torReference : existing.torReference,
        torSignedDate: body.torSignedDate !== undefined ? (body.torSignedDate ? new Date(body.torSignedDate) : null) : existing.torSignedDate,
        torSummary: body.torSummary !== undefined ? body.torSummary : existing.torSummary,
        stagingUrl: body.stagingUrl !== undefined ? body.stagingUrl : existing.stagingUrl,
        liveUrl: body.liveUrl !== undefined ? body.liveUrl : existing.liveUrl,
      },
      include: {
        client: { select: { id: true, name: true, shortCode: true, slaTier: true } },
        milestones: { orderBy: { sortOrder: "asc" } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: "asc" },
        },
        _count: { select: { instances: true, milestones: true, members: true, documents: true } },
      },
    });

    // When status changes to COMPLETED, auto-mark remaining PENDING milestones as MISSED
    if (statusChanged && body.status === "COMPLETED") {
      await prisma.milestone.updateMany({
        where: {
          projectId: params.id,
          status: "PENDING",
        },
        data: {
          status: "MISSED",
        },
      });
    }

    // Fire-and-forget activity recording
    if (statusChanged) {
      recordActivity({
        userId: user.id,
        type: "PROJECT_STATUS_CHANGED",
        title: `Project status changed from ${previousStatus} to ${body.status}`,
        description: `${user.name} changed the project status`,
        projectId: params.id,
        clientId: existing.clientId,
        metadata: { previousStatus, newStatus: body.status },
      }).catch(() => {});
    }

    recordActivity({
      userId: user.id,
      type: "PROJECT_UPDATED",
      title: "Project updated",
      description: `${user.name} updated project details`,
      projectId: params.id,
      clientId: existing.clientId,
      metadata: { changes: Object.keys(body) },
    }).catch(() => {});

    await logAdminAction({
      userId: user.id,
      action: "PROJECT_UPDATED",
      details: { projectId: params.id, changes: body },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(updated);
  },
});

// DELETE /api/projects/[id] - Deactivates the project
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { instances: { where: { status: "RUNNING" } } } },
      },
    });

    if (!project) throw ApiError.notFound("Project not found");
    if (project._count.instances > 0) {
      throw ApiError.conflict(`Cannot deactivate — project has ${project._count.instances} running workflow(s)`);
    }

    await prisma.project.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    await logAdminAction({
      userId: user.id,
      action: "PROJECT_DELETED",
      details: { projectId: params.id, projectName: project.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
