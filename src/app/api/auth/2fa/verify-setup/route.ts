import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticator } = require("otplib");
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import {
  errorResponse,
  ApiError,
  withAuth,
  type AuthContext,
} from "@/lib/api-utils";

const verifySetupSchema = z.object({
  code: z.string().min(1, "Code is required").max(20),
  challengeToken: z.string().optional(), // Required for EMAIL method
});

/**
 * Generate 10 backup codes, return both plaintext and hashed versions.
 */
function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < 10; i++) {
    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    plain.push(code);
    hashed.push(
      crypto.createHash("sha256").update(code).digest("hex")
    );
  }

  return { plain, hashed };
}

export const POST = withAuth({
  schema: verifySetupSchema,
  handler: async (
    req: NextRequest,
    ctx: AuthContext<z.infer<typeof verifySetupSchema>>
  ) => {
    const ip = getClientIp(req);
    if (!rateLimit(ip, "auth")) {
      return rateLimitResponse(ip, "auth");
    }

    const { code, challengeToken } = ctx.body;
    const userId = ctx.user.id;

    // Get the pending 2FA config
    const config = await prisma.twoFactorConfig.findUnique({
      where: { userId },
      select: {
        id: true,
        method: true,
        totpSecret: true,  // Needed for TOTP verification during setup
        isEnabled: true,
        isVerified: true,
      },
    });

    if (!config) {
      return errorResponse(
        ApiError.badRequest("No 2FA setup in progress. Start setup first.")
      );
    }

    if (config.isEnabled && config.isVerified) {
      return errorResponse(
        ApiError.conflict("2FA is already enabled and verified.")
      );
    }

    let isCodeValid = false;

    if (config.method === "TOTP") {
      // Verify TOTP code against the stored secret
      if (!config.totpSecret) {
        return errorResponse(
          ApiError.badRequest("TOTP secret not found. Restart setup.")
        );
      }
      isCodeValid = authenticator.check(code, config.totpSecret);
    } else {
      // EMAIL method — verify against the challenge
      if (!challengeToken) {
        return errorResponse(
          ApiError.badRequest("Challenge token is required for email verification.")
        );
      }

      const challenge = await prisma.twoFactorChallenge.findUnique({
        where: { token: challengeToken },
      });

      if (!challenge) {
        return errorResponse(
          ApiError.unauthorized("Invalid or expired challenge")
        );
      }

      if (new Date() > challenge.expiresAt) {
        return errorResponse(
          ApiError.unauthorized("Challenge has expired")
        );
      }

      if (challenge.usedAt) {
        return errorResponse(
          ApiError.unauthorized("Challenge has already been used")
        );
      }

      if (challenge.userId !== userId) {
        return errorResponse(
          ApiError.unauthorized("Challenge does not belong to this user")
        );
      }

      const hashedInput = crypto
        .createHash("sha256")
        .update(code)
        .digest("hex");

      try {
        isCodeValid = crypto.timingSafeEqual(
          Buffer.from(hashedInput, "hex"),
          Buffer.from(challenge.code, "hex")
        );
      } catch {
        isCodeValid = false;
      }

      if (isCodeValid) {
        // Mark challenge as used
        await prisma.twoFactorChallenge.update({
          where: { id: challenge.id },
          data: { usedAt: new Date() },
        });
      }
    }

    if (!isCodeValid) {
      return errorResponse(
        ApiError.unauthorized("Invalid verification code")
      );
    }

    // Generate backup codes
    const { plain: backupCodes, hashed: hashedBackupCodes } =
      generateBackupCodes();

    // Enable 2FA
    await prisma.twoFactorConfig.update({
      where: { userId },
      data: {
        isEnabled: true,
        isVerified: true,
        backupCodes: hashedBackupCodes,
      },
    });

    logger.info("2FA setup verified and enabled", {
      userId,
      method: config.method,
    });

    return NextResponse.json(
      {
        enabled: true,
        backupCodes, // Plaintext — shown once to the user
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, no-transform",
          "Pragma": "no-cache",
        },
      },
    );
  },
});
