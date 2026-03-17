import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// GET /api/clients/[id]/activity
// Paginated activity feed for a client (includes all projects under the client).
// Query params: page, limit, type (optional ActivityType filter)
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const clientId = params.id;

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) throw ApiError.notFound("Client not found");

    // Parse query params
    const { searchParams } = request.nextUrl;
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      100,
    );
    const typeFilter = searchParams.get("type");

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { clientId };
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
