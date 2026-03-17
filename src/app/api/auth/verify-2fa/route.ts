import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticator } = require("otplib");
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { errorResponse, ApiError } from "@/lib/api-utils";

const verify2FASchema = z.object({
  challengeToken: z.string().min(1, "Challenge token is required"),
  code: z.string().min(1, "Code is required").max(20),
});

export async function POST(req: NextRequest) {
  try {
    // Strict rate limit to prevent brute force on 6-digit codes
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

    const result = verify2FASchema.safeParse(rawBody);
    if (!result.success) {
      return errorResponse(ApiError.badRequest("Invalid request"));
    }

    const { challengeToken, code } = result.data;

    // Find the challenge
    const challenge = await prisma.twoFactorChallenge.findUnique({
      where: { token: challengeToken },
      include: {
        user: {
          select: {
            id: true,
            twoFactorConfig: {
              select: {
                id: true,
                totpSecret: true,  // Needed for TOTP verification — never returned to client
                backupCodes: true, // Needed for backup code fallback
              },
            },
          },
        },
      },
    });

    if (!challenge) {
      return errorResponse(ApiError.unauthorized("Invalid or expired challenge"));
    }

    // Check expiry
    if (new Date() > challenge.expiresAt) {
      return errorResponse(ApiError.unauthorized("Challenge has expired"));
    }

    // Check already used
    if (challenge.usedAt) {
      return errorResponse(ApiError.unauthorized("Challenge has already been used"));
    }

    let isCodeValid = false;

    // Try matching the code based on method
    if (challenge.method === "EMAIL") {
      // Compare hashed code
      const hashedInput = crypto
        .createHash("sha256")
        .update(code)
        .digest("hex");
      isCodeValid = crypto.timingSafeEqual(
        Buffer.from(hashedInput, "hex"),
        Buffer.from(challenge.code, "hex")
      );
    } else if (challenge.method === "TOTP") {
      // Verify TOTP code from authenticator app
      const totpSecret = challenge.user.twoFactorConfig?.totpSecret;
      if (totpSecret) {
        isCodeValid = authenticator.check(code, totpSecret);
      }
    }

    // If code didn't match, try backup codes
    if (!isCodeValid && challenge.user.twoFactorConfig) {
      const backupCodes = challenge.user.twoFactorConfig.backupCodes;
      const hashedInput = crypto
        .createHash("sha256")
        .update(code)
        .digest("hex");

      for (const storedHash of backupCodes) {
        try {
          if (
            crypto.timingSafeEqual(
              Buffer.from(hashedInput, "hex"),
              Buffer.from(storedHash, "hex")
            )
          ) {
            isCodeValid = true;
            // Remove the used backup code
            await prisma.twoFactorConfig.update({
              where: { id: challenge.user.twoFactorConfig.id },
              data: {
                backupCodes: backupCodes.filter((c) => c !== storedHash),
              },
            });
            logger.info("Backup code used for 2FA", {
              userId: challenge.userId,
            });
            break;
          }
        } catch {
          // Length mismatch in timingSafeEqual, skip
          continue;
        }
      }
    }

    if (!isCodeValid) {
      return errorResponse(ApiError.unauthorized("Invalid verification code"));
    }

    // Mark challenge as used and generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    await prisma.twoFactorChallenge.update({
      where: { id: challenge.id },
      data: {
        usedAt: new Date(),
        verificationToken,
      },
    });

    logger.info("2FA verification successful", { userId: challenge.userId });

    return NextResponse.json(
      {
        verified: true,
        verificationToken,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, no-transform",
          "Pragma": "no-cache",
        },
      },
    );
  } catch (error) {
    logger.error("2FA verification error", error);
    return errorResponse(ApiError.internal());
  }
}
