import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { addUserRoleSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { reassignFallbackTasks } from "@/lib/role-reassign";

// ---------------------------------------------------------------------------
// POST /api/users/[id]/roles
// Add a role to a user. Body: { roleId }
// ---------------------------------------------------------------------------
export const POST = withAdminAuth({
  schema: addUserRoleSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const userId = params.id;
    const { roleId } = body;

    // Verify user exists (select only id — never fetch passwordHash)
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!targetUser) {
      throw ApiError.notFound("User not found");
    }

    // Verify role exists
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true },
    });
    if (!role) {
      throw ApiError.badRequest("The specified role does not exist");
    }

    // Check if user already has this role
    const existing = await prisma.userRole.findFirst({
      where: { userId, roleId },
      select: { id: true },
    });
    if (existing) {
      throw ApiError.conflict("User already has this role");
    }

    const userRole = await prisma.userRole.create({
      data: { userId, roleId },
      include: { role: true },
    });

    await logAdminAction({
      userId: user.id,
      action: "ROLE_ASSIGNED",
      details: { targetUserId: params.id, roleId: body.roleId },
      ipAddress: getClientIp(request),
    });

    // Reassign any fallback tasks that match the new role (fire-and-forget)
    reassignFallbackTasks(userId, [roleId]).catch(() => {});

    return NextResponse.json(userRole, { status: 201 });
  },
});
