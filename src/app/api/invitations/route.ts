import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { createInvitationSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { sendEmail, invitationEmail } from "@/lib/email";
import { env } from "@/lib/env";

const INVITATION_EXPIRY_DAYS = 7;

// ---------------------------------------------------------------------------
// GET /api/invitations
// List all invitations (admin only).
// ---------------------------------------------------------------------------
export const GET = withAdminAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1),
      200
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0
    );

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const [invitations, total] = await Promise.all([
      prisma.invitation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          invitedBy: { select: { id: true, name: true, email: true } },
          role: { select: { id: true, name: true } },
        },
      }),
      prisma.invitation.count({ where }),
    ]);

    return NextResponse.json({
      data: invitations,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  },
});

// ---------------------------------------------------------------------------
// POST /api/invitations
// Send an invitation to a new user (admin only).
// ---------------------------------------------------------------------------
export const POST = withAdminAuth({
  schema: createInvitationSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { name, email, roleId } = body;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existingUser) {
      throw ApiError.conflict("A user with that email already exists");
    }

    // Check for pending invitation to the same email
    const existingInvite = await prisma.invitation.findFirst({
      where: { email: normalizedEmail, status: "PENDING" },
      select: { id: true },
    });
    if (existingInvite) {
      throw ApiError.conflict(
        "A pending invitation already exists for that email"
      );
    }

    // Validate role if provided
    if (roleId) {
      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role) {
        throw ApiError.badRequest("The specified role does not exist");
      }
    }

    // Generate secure token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    const invitation = await prisma.invitation.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        roleId: roleId || null,
        token,
        expiresAt,
        invitedById: user.id,
      },
      include: {
        invitedBy: { select: { id: true, name: true, email: true } },
        role: { select: { id: true, name: true } },
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "INVITATION_SENT",
      details: {
        invitationId: invitation.id,
        email: normalizedEmail,
        name: name.trim(),
        roleId: roleId || null,
      },
      ipAddress: ip,
    });

    // Send invitation email (fire-and-forget)
    const acceptUrl = `${env.NEXTAUTH_URL}/accept-invite?token=${token}`;
    const emailContent = invitationEmail(
      name.trim(),
      user.name,
      acceptUrl,
      INVITATION_EXPIRY_DAYS
    );
    sendEmail({ to: normalizedEmail, ...emailContent }).catch(() => {});

    return NextResponse.json(invitation, { status: 201 });
  },
});
