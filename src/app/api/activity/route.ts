import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// GET /api/activity
// Global activity feed.
// Admin users see all activities; non-admin users see only their own.
// Query params: page, limit, type (optional ActivityType filter)
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const { searchParams } = request.nextUrl;
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      100,
    );
    const typeFilter = searchParams.get("type");

    const skip = (page - 1) * limit;

    const isAdmin = user.roles.includes("admin");

    const where: Record<string, unknown> = {};
    if (!isAdmin) {
      where.userId = user.id;
    }
    if (typeFilter) {
      where.type = typeFilter;
    }

    const [activities, total] = await Promise.all([
      prisma.activityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.activityEvent.count({ where }),
    ]);

    return NextResponse.json({
      data: activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    });
  },
});
