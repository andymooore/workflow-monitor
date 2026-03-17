import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// DELETE /api/delegations/[id] - Revoke a delegation
export const DELETE = withAuth({
  handler: async (request: NextRequest, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const delegation = await prisma.delegation.findUnique({
      where: { id: params.id },
    });

    if (!delegation) throw ApiError.notFound("Delegation not found");
    if (delegation.delegatorId !== user.id) {
      throw ApiError.forbidden("You can only revoke your own delegations");
    }

    await prisma.delegation.update({
      where: { id: params.id },
      data: { isActive: false, revokedAt: new Date() },
    });

    await logAdminAction({
      userId: user.id,
      action: "DELEGATION_REVOKED",
      details: { delegationId: params.id },
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  },
});
