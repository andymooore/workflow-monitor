import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";

const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

// ---------------------------------------------------------------------------
// GET /api/users/[id] - Get user detail
// ---------------------------------------------------------------------------
export const GET = withAdminAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
        roles: { include: { role: true } },
        _count: {
          select: {
            taskAssignments: { where: { status: "IN_PROGRESS" } },
            ownedInstances: { where: { status: "RUNNING" } },
          },
        },
      },
    });

    if (!user) throw ApiError.notFound("User not found");
    return NextResponse.json(user);
  },
});

// ---------------------------------------------------------------------------
// PUT /api/users/[id] - Activate/deactivate user
// ---------------------------------------------------------------------------
export const PUT = withAdminAuth({
  schema: updateUserStatusSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            taskAssignments: { where: { status: "IN_PROGRESS" } },
          },
        },
      },
    });

    if (!targetUser) throw ApiError.notFound("User not found");

    // Prevent deactivating users with active tasks
    if (body.status === "INACTIVE" && targetUser._count.taskAssignments > 0) {
      throw ApiError.conflict(
        `Cannot deactivate "${targetUser.name}" — they have ${targetUser._count.taskAssignments} active task(s). Reassign tasks first.`
      );
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { status: body.status },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
        roles: { include: { role: true } },
      },
    });

    await logAdminAction({
      userId: user.id,
      action: body.status === "INACTIVE" ? "USER_DEACTIVATED" : "USER_UPDATED",
      details: { targetUserId: params.id, newStatus: body.status, userName: updated.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(updated);
  },
});
