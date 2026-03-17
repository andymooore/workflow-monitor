import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { updateProjectMemberSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";

// PUT /api/projects/[id]/members/[memberId] — Update member role
export const PUT = withAdminAuth({
  schema: updateProjectMemberSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const member = await prisma.projectMember.findUnique({
      where: { id: params.memberId },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    if (!member || member.projectId !== params.id) {
      throw ApiError.notFound("Project member not found");
    }

    const updated = await prisma.projectMember.update({
      where: { id: params.memberId },
      data: { role: body.role },
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

    await logAdminAction({
      userId: user.id,
      action: "TEAM_MEMBER_ADDED",
      details: {
        projectId: params.id,
        memberId: params.memberId,
        previousRole: member.role,
        newRole: body.role,
        action: "role_updated",
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(updated);
  },
});

// DELETE /api/projects/[id]/members/[memberId] — Remove member from project
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const member = await prisma.projectMember.findUnique({
      where: { id: params.memberId },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, clientId: true, name: true } },
      },
    });

    if (!member || member.projectId !== params.id) {
      throw ApiError.notFound("Project member not found");
    }

    await prisma.projectMember.delete({
      where: { id: params.memberId },
    });

    // Fire-and-forget activity recording
    recordActivity({
      userId: user.id,
      type: "TEAM_MEMBER_REMOVED",
      title: `Team member removed: ${member.user.name}`,
      description: `${user.name} removed ${member.user.name} from the project`,
      projectId: params.id,
      clientId: member.project.clientId,
      metadata: {
        removedUserId: member.userId,
        removedUserName: member.user.name,
        role: member.role,
      },
    }).catch(() => {});

    await logAdminAction({
      userId: user.id,
      action: "TEAM_MEMBER_REMOVED",
      details: {
        projectId: params.id,
        memberId: params.memberId,
        removedUserId: member.userId,
        removedUserName: member.user.name,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
