import { NextResponse, type NextRequest } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { passwordSchema } from "@/lib/validations";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: passwordSchema,
});

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

    const result = resetPasswordSchema.safeParse(rawBody);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.message);
      return errorResponse(
        ApiError.badRequest("Validation failed", { errors: issues })
      );
    }

    const { token, password } = result.data;

    // Find the token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, status: true } } },
    });

    if (!resetToken) {
      return errorResponse(
        ApiError.badRequest("Invalid or expired reset token")
      );
    }

    // Check if already used
    if (resetToken.usedAt) {
      return errorResponse(
        ApiError.badRequest("This reset token has already been used")
      );
    }

    // Check if expired
    if (new Date() > resetToken.expiresAt) {
      return errorResponse(
        ApiError.badRequest("This reset token has expired. Please request a new one.")
      );
    }

    // Check user is still active
    if (resetToken.user.status !== "ACTIVE") {
      return errorResponse(
        ApiError.badRequest("This account is no longer active")
      );
    }

    // Hash the new password (cost 12)
    const passwordHash = await hash(password, 12);

    // Update password and mark token as used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    logger.info("Password reset successful", { userId: resetToken.userId });

    return NextResponse.json(
      { message: "Password has been reset successfully. You can now sign in with your new password." },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Reset password error", error);
    return errorResponse(error);
  }
}
