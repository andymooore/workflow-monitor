import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { createRoleSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// ---------------------------------------------------------------------------
// GET /api/roles
// List roles with pagination support.
// Query params: ?page=1&limit=50
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1),
      200,
    );
    const offset = (page - 1) * limit;

    const [roles, total] = await Promise.all([
      prisma.role.findMany({
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
        include: {
          _count: { select: { users: true } },
        },
      }),
      prisma.role.count(),
    ]);

    return NextResponse.json({
      data: roles,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    });
  },
});

// ---------------------------------------------------------------------------
// POST /api/roles
// Create a role. Body: { name, description? }
// ---------------------------------------------------------------------------
export const POST = withAdminAuth({
  schema: createRoleSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { name, description } = body;

    // Check for duplicate name
    const existing = await prisma.role.findUnique({
      where: { name: name.trim() },
    });
    if (existing) {
      throw ApiError.conflict("A role with that name already exists");
    }

    const role = await prisma.role.create({
      data: {
        name: name.trim(),
        description: description?.trim() ?? null,
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "ROLE_CREATED",
      details: { roleId: role.id, roleName: body.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(role, { status: 201 });
  },
});
