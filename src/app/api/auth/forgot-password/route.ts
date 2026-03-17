import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { sendEmail, passwordResetEmail } from "@/lib/email";
import { errorResponse, ApiError } from "@/lib/api-utils";

const forgotPasswordSchema = z.object({
  email: z.string().email("Must be a valid email address"),
});

const GENERIC_MESSAGE =
  "If an account exists with that email, a reset link has been sent";

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIp(req);
    if (!rateLimit(ip, "auth")) {
      return rateLimitResponse(ip, "auth");
    }

    // Parse body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return errorResponse(ApiError.badRequest("Invalid or missing JSON body"));
    }

    const result = forgotPasswordSchema.safeParse(rawBody);
    if (!result.success) {
      // Still return generic message to prevent email enumeration
      return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
    }

    const { email } = result.data;

    // Look up user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, name: true, status: true },
    });

    // Only proceed if user exists and is ACTIVE
    if (user && user.status === "ACTIVE") {
      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Create password reset token
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });

      // Build reset URL
      const resetUrl = `${env.NEXTAUTH_URL}/reset-password?token=${token}`;

      // Send email
      const emailContent = passwordResetEmail(user.name, resetUrl);
      await sendEmail({
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
      });

      logger.info("Password reset email sent", { userId: user.id });
    } else {
      logger.debug("Password reset requested for non-existent or inactive user", {
        email,
      });
    }

    // Always return 200 with generic message
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  } catch (error) {
    logger.error("Forgot password error", error);
    // Still return generic message to avoid leaking information
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }
}
