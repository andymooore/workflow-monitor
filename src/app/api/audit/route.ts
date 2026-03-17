import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// GET /api/audit
// Global audit log query — admin only.
// Query params: ?action=, ?userId=, ?from=, ?to=, ?limit=, ?offset=
// ---------------------------------------------------------------------------
export const GET = withAdminAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { searchParams } = request.nextUrl;
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");
    const instanceId = searchParams.get("instanceId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100") || 100, 500);
    const offset = parseInt(searchParams.get("offset") ?? "0") || 0;
    const adminOnly = searchParams.get("adminOnly") === "true";

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (instanceId) where.instanceId = instanceId;
    if (adminOnly) where.instanceId = null; // admin actions have no instance
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, name: true, email: true } },
          instance: { select: { id: true, title: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  },
});
