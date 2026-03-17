import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// ---------------------------------------------------------------------------
// DELETE /api/users/[id]/roles/[userRoleId]
// Remove a role assignment from a user.
// ---------------------------------------------------------------------------
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { id: userId, userRoleId } = params;

    // Verify the user-role assignment exists and belongs to this user
    const userRole = await prisma.userRole.findUnique({
      where: { id: userRoleId },
    });

    if (!userRole || userRole.userId !== userId) {
      throw ApiError.notFound("Role assignment not found for this user");
    }

    await prisma.userRole.delete({ where: { id: userRoleId } });

    await logAdminAction({
      userId: user.id,
      action: "ROLE_REMOVED",
      details: { targetUserId: params.id, userRoleId: params.userRoleId },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ message: "Role removed" });
  },
});
