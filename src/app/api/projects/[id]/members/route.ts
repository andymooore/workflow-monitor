import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { addProjectMemberSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";

// GET /api/projects/[id]/members — List project members with user details
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!project) throw ApiError.notFound("Project not found");

    const members = await prisma.projectMember.findMany({
      where: { projectId: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json(members);
  },
});

// POST /api/projects/[id]/members — Add a member to the project
export const POST = withAdminAuth({
  schema: addProjectMemberSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, clientId: true, name: true },
    });
    if (!project) throw ApiError.notFound("Project not found");

    // Verify the user exists and is active
    const targetUser = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true, status: true },
    });
    if (!targetUser) throw ApiError.notFound("User not found");
    if (targetUser.status !== "ACTIVE") {
      throw ApiError.badRequest("Cannot add an inactive user to the project");
    }

    // Check if already a member
    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: params.id, userId: body.userId } },
    });
    if (existing) throw ApiError.conflict("User is already a member of this project");

    const member = await prisma.projectMember.create({
      data: {
        projectId: params.id,
        userId: body.userId,
        role: body.role ?? "member",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });

    // Fire-and-forget activity recording
    recordActivity({
      userId: user.id,
      type: "TEAM_MEMBER_ADDED",
      title: `Team member added: ${targetUser.name}`,
      description: `${user.name} added ${targetUser.name} as ${body.role ?? "member"}`,
      projectId: params.id,
      clientId: project.clientId,
      metadata: {
        memberId: member.id,
        addedUserId: body.userId,
        addedUserName: targetUser.name,
        role: body.role ?? "member",
      },
    }).catch(() => {});

    await logAdminAction({
      userId: user.id,
      action: "TEAM_MEMBER_ADDED",
      details: {
        projectId: params.id,
        memberId: member.id,
        addedUserId: body.userId,
        role: body.role ?? "member",
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(member, { status: 201 });
  },
});
