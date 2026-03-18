import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// ---------------------------------------------------------------------------
// DELETE /api/invitations/[id]
// Revoke a pending invitation (admin only).
// ---------------------------------------------------------------------------
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { id } = params;
    if (!id) throw ApiError.badRequest("Invitation ID is required");

    const invitation = await prisma.invitation.findUnique({
      where: { id },
      select: { id: true, email: true, status: true },
    });

    if (!invitation) {
      throw ApiError.notFound("Invitation not found");
    }

    if (invitation.status !== "PENDING") {
      throw ApiError.badRequest(
        `Cannot revoke an invitation with status "${invitation.status}"`
      );
    }

    await prisma.invitation.update({
      where: { id },
      data: { status: "REVOKED" },
    });

    await logAdminAction({
      userId: user.id,
      action: "INVITATION_REVOKED",
      details: { invitationId: id, email: invitation.email },
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  },
});

// ---------------------------------------------------------------------------
// POST /api/invitations/[id]/resend
// Resend an invitation email (admin only) — reuses same token, resets expiry.
// ---------------------------------------------------------------------------
export const PATCH = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { id } = params;
    if (!id) throw ApiError.badRequest("Invitation ID is required");

    const invitation = await prisma.invitation.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, token: true, status: true },
    });

    if (!invitation) {
      throw ApiError.notFound("Invitation not found");
    }

    if (invitation.status !== "PENDING") {
      throw ApiError.badRequest(
        `Cannot resend an invitation with status "${invitation.status}"`
      );
    }

    // Reset expiry
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const updated = await prisma.invitation.update({
      where: { id },
      data: { expiresAt },
      include: {
        invitedBy: { select: { id: true, name: true, email: true } },
        role: { select: { id: true, name: true } },
      },
    });

    // Resend email
    const { sendEmail, invitationEmail } = await import("@/lib/email");
    const { env } = await import("@/lib/env");
    const acceptUrl = `${env.NEXTAUTH_URL}/accept-invite?token=${invitation.token}`;
    const emailContent = invitationEmail(
      invitation.name,
      user.name,
      acceptUrl,
      7
    );
    sendEmail({ to: invitation.email, ...emailContent }).catch(() => {});

    return NextResponse.json(updated);
  },
});
