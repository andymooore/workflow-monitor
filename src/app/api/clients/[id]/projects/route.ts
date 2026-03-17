import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { createProjectSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";

// GET /api/clients/[id]/projects
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const { searchParams } = request.nextUrl;
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Record<string, unknown> = { clientId: params.id };
    if (!includeInactive) where.isActive = true;

    const projects = await prisma.project.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { instances: true } },
      },
    });

    return NextResponse.json(projects);
  },
});

// POST /api/clients/[id]/projects
export const POST = withAdminAuth({
  schema: createProjectSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const client = await prisma.client.findUnique({ where: { id: params.id } });
    if (!client) throw ApiError.notFound("Client not found");

    const existing = await prisma.project.findUnique({
      where: { clientId_name: { clientId: params.id, name: body.name } },
    });
    if (existing) throw ApiError.conflict("A project with this name already exists for this client");

    const project = await prisma.project.create({
      data: {
        clientId: params.id,
        name: body.name,
        description: body.description ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        slaReference: body.slaReference ?? null,
        slaSignedDate: body.slaSignedDate ? new Date(body.slaSignedDate) : null,
        slaSummary: body.slaSummary ?? null,
        torReference: body.torReference ?? null,
        torSignedDate: body.torSignedDate ? new Date(body.torSignedDate) : null,
        torSummary: body.torSummary ?? null,
        stagingUrl: body.stagingUrl ?? null,
        liveUrl: body.liveUrl ?? null,
      },
      include: { _count: { select: { instances: true } } },
    });

    await logAdminAction({
      userId: user.id,
      action: "PROJECT_CREATED",
      details: { projectId: project.id, clientId: params.id, name: project.name },
      ipAddress: getClientIp(request),
    });

    // Fire-and-forget activity recording
    recordActivity({
      userId: user.id,
      type: "PROJECT_CREATED",
      title: `Created project "${project.name}"`,
      description: body.description ?? undefined,
      clientId: params.id,
      projectId: project.id,
    }).catch(() => {});

    return NextResponse.json(project, { status: 201 });
  },
});
