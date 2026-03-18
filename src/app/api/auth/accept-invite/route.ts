import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { acceptInvitationSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { reassignFallbackTasks } from "@/lib/role-reassign";

// ---------------------------------------------------------------------------
// GET /api/auth/accept-invite?token=xxx
// Validate an invitation token (public — no auth).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(ip, "read")) {
    return NextResponse.json(
      { error: { code: "TOO_MANY_REQUESTS", message: "Too many requests" } },
      { status: 429 }
    );
  }

  const token = request.nextUrl.searchParams.get("token");
  if (!token || typeof token !== "string" || token.length > 128) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid token" } },
      { status: 400 }
    );
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      expiresAt: true,
      role: { select: { id: true, name: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Invitation not found" } },
      { status: 404 }
    );
  }

  if (invitation.status !== "PENDING") {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_STATE",
          message:
            invitation.status === "ACCEPTED"
              ? "This invitation has already been accepted"
              : invitation.status === "REVOKED"
                ? "This invitation has been revoked"
                : "This invitation has expired",
        },
      },
      { status: 410 }
    );
  }

  if (new Date() > invitation.expiresAt) {
    // Auto-expire
    await prisma.invitation.update({
      where: { token },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json(
      { error: { code: "EXPIRED", message: "This invitation has expired" } },
      { status: 410 }
    );
  }

  return NextResponse.json({
    valid: true,
    email: invitation.email,
    name: invitation.name,
    role: invitation.role?.name ?? null,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/accept-invite
// Accept an invitation — create user account (public — no auth).
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(ip, "write")) {
    return NextResponse.json(
      { error: { code: "TOO_MANY_REQUESTS", message: "Too many requests" } },
      { status: 429 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const parsed = acceptInvitationSchema.safeParse(rawBody);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message);
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: { errors: messages },
        },
      },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;

  // Find and validate the invitation
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      name: true,
      roleId: true,
      status: true,
      expiresAt: true,
      invitedById: true,
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Invitation not found" } },
      { status: 404 }
    );
  }

  if (invitation.status !== "PENDING") {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_STATE",
          message: "This invitation is no longer valid",
        },
      },
      { status: 410 }
    );
  }

  if (new Date() > invitation.expiresAt) {
    await prisma.invitation.update({
      where: { token },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json(
      { error: { code: "EXPIRED", message: "This invitation has expired" } },
      { status: 410 }
    );
  }

  // Ensure no user with this email exists yet
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });
  if (existingUser) {
    // Mark invitation as accepted since the user already exists
    await prisma.invitation.update({
      where: { token },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message: "An account with this email already exists. Please sign in.",
        },
      },
      { status: 409 }
    );
  }

  // Create user + accept invitation in a transaction
  const passwordHash = await hash(password, 12);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: invitation.name,
          email: invitation.email,
          passwordHash,
          status: "ACTIVE",
          ...(invitation.roleId
            ? { roles: { create: { roleId: invitation.roleId } } }
            : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          roles: { include: { role: true } },
        },
      });

      await tx.invitation.update({
        where: { token },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: "INVITATION_ACCEPTED",
          details: {
            invitationId: invitation.id,
            invitedById: invitation.invitedById,
          },
          ipAddress: ip,
        },
      });

      return newUser;
    });

    // Reassign any fallback tasks that match the new user's role (fire-and-forget)
    if (invitation.roleId) {
      reassignFallbackTasks(result.id, [invitation.roleId]).catch(() => {});
    }

    return NextResponse.json(
      { success: true, email: result.email },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Failed to accept invitation", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create account. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
