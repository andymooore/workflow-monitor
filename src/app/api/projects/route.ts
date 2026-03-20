import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// GET /api/projects — admin-only list of all projects across clients
export const GET = withAdminAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status");
    const clientId = searchParams.get("clientId");
    const includeInactive = searchParams.get("includeInactive") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50") || 50, 200);
    const offset = parseInt(searchParams.get("offset") ?? "0") || 0;

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { client: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          client: {
            select: { id: true, name: true, shortCode: true, slaTier: true },
          },
          _count: {
            select: { instances: true, milestones: true, members: true },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    return NextResponse.json({
      data: projects,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  },
});
