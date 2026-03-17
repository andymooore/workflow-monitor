import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { createMinistrySchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// GET /api/ministries - List ministries (all authenticated users can read)
export const GET = withAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get("status");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (statusFilter) where.status = statusFilter;
    else where.status = "ACTIVE"; // default to active only
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { shortCode: { contains: search, mode: "insensitive" } },
      ];
    }

    const ministries = await prisma.ministry.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { clients: true } },
      },
    });

    return NextResponse.json(ministries);
  },
});

// POST /api/ministries - Create ministry (admin only)
export const POST = withAdminAuth({
  schema: createMinistrySchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    // Check uniqueness
    const existingName = await prisma.ministry.findUnique({ where: { name: body.name } });
    if (existingName) throw ApiError.conflict("A ministry with this name already exists");

    const existingCode = await prisma.ministry.findUnique({ where: { shortCode: body.shortCode } });
    if (existingCode) throw ApiError.conflict("A ministry with this short code already exists");

    const ministry = await prisma.ministry.create({
      data: {
        name: body.name,
        shortCode: body.shortCode,
        description: body.description ?? null,
        website: body.website ?? null,
        headOfEntity: body.headOfEntity ?? null,
      },
      include: { _count: { select: { clients: true } } },
    });

    await logAdminAction({
      userId: user.id,
      action: "MINISTRY_CREATED",
      details: { ministryId: ministry.id, name: ministry.name, shortCode: ministry.shortCode },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(ministry, { status: 201 });
  },
});
