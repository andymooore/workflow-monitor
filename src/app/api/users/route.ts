import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { createUserSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { hash } from "bcryptjs";
import { sendEmail, welcomeEmail } from "@/lib/email";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// GET /api/users
// List all active users with roles.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { searchParams } = request.nextUrl;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const search = searchParams.get("search");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    const where: Record<string, unknown> = includeInactive ? {} : { status: "ACTIVE" as const };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          roles: {
            include: {
              role: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({ data: users, total, limit, offset, hasMore: offset + limit < total });
  },
});

// ---------------------------------------------------------------------------
// POST /api/users
// Create a new user. Body: { name, email, password, roleId? }
// ---------------------------------------------------------------------------
export const POST = withAdminAuth({
  schema: createUserSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { name, email, password, roleId } = body;

    // Check for duplicate email
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });
    if (existing) {
      throw ApiError.conflict("A user with that email already exists");
    }

    // Validate role exists if provided
    if (roleId) {
      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role) {
        throw ApiError.badRequest("The specified role does not exist");
      }
    }

    const passwordHash = await hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        status: "ACTIVE",
        ...(roleId
          ? { roles: { create: { roleId } } }
          : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
        roles: { include: { role: true } },
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "USER_CREATED",
      details: { createdUserId: newUser.id, email: body.email, name: body.name },
      ipAddress: getClientIp(request),
    });

    // Send welcome email with temporary password (fire-and-forget)
    const loginUrl = `${env.NEXTAUTH_URL}/login`;
    const welcome = welcomeEmail(body.name, body.email, body.password, loginUrl);
    sendEmail({ to: body.email, ...welcome }).catch(() => {});

    return NextResponse.json(newUser, { status: 201 });
  },
});
