import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// GET /api/projects/[id]/activity — Activity feed for a project (paginated, newest first)
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!project) throw ApiError.notFound("Project not found");

    // Parse pagination params
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const typeFilter = url.searchParams.get("type");

    const where: Record<string, unknown> = { projectId: params.id };
    if (typeFilter) {
      where.type = typeFilter;
    }

    const [activities, total] = await Promise.all([
      prisma.activityEvent.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activityEvent.count({ where }),
    ]);

    return NextResponse.json({
      data: activities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  },
});
