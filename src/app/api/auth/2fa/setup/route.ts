import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import {
  errorResponse,
  ApiError,
  withAuth,
  type AuthContext,
} from "@/lib/api-utils";
import { sendEmail, twoFactorCodeEmail } from "@/lib/email";

const setup2FASchema = z.object({
  method: z.enum(["EMAIL", "TOTP"]),
});

export const POST = withAuth({
  schema: setup2FASchema,
  handler: async (
    req: NextRequest,
    ctx: AuthContext<z.infer<typeof setup2FASchema>>
  ) => {
    const ip = getClientIp(req);
    if (!rateLimit(ip, "write")) {
      return rateLimitResponse(ip, "write");
    }

    const { method } = ctx.body;
    const userId = ctx.user.id;

    // Check if already has a verified config
    const existing = await prisma.twoFactorConfig.findUnique({
      where: { userId },
      select: { isEnabled: true, isVerified: true },
    });

    if (existing?.isEnabled && existing?.isVerified) {
      return errorResponse(
        ApiError.conflict(
          "2FA is already enabled. Disable it first to change method."
        )
      );
    }

    if (method === "TOTP") {
      // Generate TOTP secret
      const secret = authenticator.generateSecret();
      const otpauth = authenticator.keyuri(
        ctx.user.email,
        "WorkFlowPro",
        secret
      );
      const qrCodeUrl = await QRCode.toDataURL(otpauth);

      // Upsert config (pending verification)
      await prisma.twoFactorConfig.upsert({
        where: { userId },
        create: {
          userId,
          method: "TOTP",
          totpSecret: secret,
          isEnabled: false,
          isVerified: false,
          backupCodes: [],
        },
        update: {
          method: "TOTP",
          totpSecret: secret,
          isEnabled: false,
          isVerified: false,
          backupCodes: [],
        },
      });

      logger.info("2FA TOTP setup initiated", { userId });

      return NextResponse.json(
        {
          method: "TOTP",
          secret,
          qrCodeUrl,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, no-transform",
            "Pragma": "no-cache",
          },
        },
      );
    } else {
      // EMAIL method
      // Generate a verification code and send it
      const code = crypto.randomInt(100000, 999999).toString();
      const hashedCode = crypto
        .createHash("sha256")
        .update(code)
        .digest("hex");
      const challengeToken = crypto.randomBytes(32).toString("hex");

      // Upsert config (pending verification)
      await prisma.twoFactorConfig.upsert({
        where: { userId },
        create: {
          userId,
          method: "EMAIL",
          totpSecret: null,
          isEnabled: false,
          isVerified: false,
          backupCodes: [],
        },
        update: {
          method: "EMAIL",
          totpSecret: null,
          isEnabled: false,
          isVerified: false,
          backupCodes: [],
        },
      });

      // Create a challenge for verification
      await prisma.twoFactorChallenge.create({
        data: {
          userId,
          code: hashedCode,
          token: challengeToken,
          method: "EMAIL",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      // Send verification code
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      if (user) {
        const emailContent = twoFactorCodeEmail(user.name, code);
        await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
      }

      logger.info("2FA EMAIL setup initiated", { userId });

      return NextResponse.json({
        method: "EMAIL",
        challengeToken,
      });
    }
  },
});
