import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { canAccessInstance } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// GET /api/workflows/instances/[instanceId]/timeline
// Return audit logs for the instance, ordered by createdAt.
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

    // Verify instance exists
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      select: { id: true },
    });

    if (!instance) {
      throw ApiError.notFound("Instance not found");
    }

    const { searchParams } = request.nextUrl;
    const actionFilter = searchParams.get("action");
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    const where: Record<string, unknown> = { instanceId };
    if (actionFilter) where.action = actionFilter;
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        ...(toDate ? { lte: new Date(toDate) } : {}),
      };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(logs);
  },
});
