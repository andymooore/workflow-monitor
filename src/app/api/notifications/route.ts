import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// GET /api/notifications
// List notifications for the current user.
// Query params: ?unread=true, ?limit=50
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { searchParams } = request.nextUrl;
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    const where: Record<string, unknown> = { userId: user.id };
    if (unreadOnly) where.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
    ]);

    return NextResponse.json({ data: notifications, unreadCount, total, limit, offset, hasMore: offset + limit < total });
  },
});

// ---------------------------------------------------------------------------
// POST /api/notifications
// Mark notifications as read.
// Body: { ids: string[] } or { all: true }
// ---------------------------------------------------------------------------
export const POST = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw ApiError.badRequest("Invalid or missing JSON body");
    }

    const parsed = body as Record<string, unknown>;

    if (parsed.all === true) {
      // Mark all as read
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    if (Array.isArray(parsed.ids) && parsed.ids.length > 0 && parsed.ids.every((id: unknown) => typeof id === "string")) {
      // Mark specific notifications as read
      await prisma.notification.updateMany({
        where: {
          id: { in: parsed.ids as string[] },
          userId: user.id,
        },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    throw ApiError.badRequest("Provide { ids: string[] } or { all: true }");
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/notifications
// Delete old read notifications (older than 30 days).
// ---------------------------------------------------------------------------
export const DELETE = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.notification.deleteMany({
      where: {
        userId: user.id,
        isRead: true,
        createdAt: { lt: thirtyDaysAgo },
      },
    });

    return NextResponse.json({ deleted: result.count });
  },
});
