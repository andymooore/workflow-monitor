import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { createMilestoneSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";

// GET /api/projects/[id]/milestones — List milestones for a project
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!project) throw ApiError.notFound("Project not found");

    const milestones = await prisma.milestone.findMany({
      where: { projectId: params.id },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(milestones);
  },
});

// POST /api/projects/[id]/milestones — Create a milestone (admin only)
export const POST = withAdminAuth({
  schema: createMilestoneSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, clientId: true, name: true },
    });
    if (!project) throw ApiError.notFound("Project not found");

    // Auto-calculate sortOrder if not provided
    let sortOrder = body.sortOrder;
    if (sortOrder === undefined || sortOrder === null) {
      const maxSort = await prisma.milestone.findFirst({
        where: { projectId: params.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      sortOrder = (maxSort?.sortOrder ?? -1) + 1;
    }

    const milestone = await prisma.milestone.create({
      data: {
        projectId: params.id,
        title: body.title,
        description: body.description ?? null,
        targetDate: new Date(body.targetDate),
        sortOrder,
      },
    });

    // Fire-and-forget activity recording
    recordActivity({
      userId: user.id,
      type: "MILESTONE_CREATED",
      title: `Milestone created: ${body.title}`,
      description: `${user.name} added a milestone to ${project.name}`,
      projectId: params.id,
      clientId: project.clientId,
      metadata: { milestoneId: milestone.id, title: body.title },
    }).catch(() => {});

    await logAdminAction({
      userId: user.id,
      action: "MILESTONE_CREATED",
      details: { projectId: params.id, milestoneId: milestone.id, title: body.title },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(milestone, { status: 201 });
  },
});
