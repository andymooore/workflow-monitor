import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { sendEmail, twoFactorCodeEmail } from "@/lib/email";

const loginChallengeSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z.string().min(1, "Password is required"),
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

    const result = loginChallengeSchema.safeParse(rawBody);
    if (!result.success) {
      return errorResponse(ApiError.badRequest("Invalid credentials"));
    }

    const { email, password } = result.data;

    // Validate input format
    if (typeof email !== "string" || email.length > 254) {
      return errorResponse(ApiError.unauthorized("Invalid credentials"));
    }
    if (typeof password !== "string" || password.length > 128) {
      return errorResponse(ApiError.unauthorized("Invalid credentials"));
    }

    // Normalize email to lowercase for consistent matching
    const normalizedEmail = email.toLowerCase().trim();

    // Restrict login to allowed email domain
    if (!normalizedEmail.endsWith(`@${env.AUTH_ALLOWED_DOMAIN}`)) {
      return errorResponse(ApiError.unauthorized("Invalid credentials"));
    }

    // Look up user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        status: true,
        twoFactorConfig: {
          select: { isEnabled: true, isVerified: true, method: true },
        },
      },
    });

    if (!user || !user.passwordHash) {
      return errorResponse(ApiError.unauthorized("Invalid credentials"));
    }

    // Check user status
    if (user.status !== "ACTIVE") {
      return errorResponse(ApiError.unauthorized("Invalid credentials"));
    }

    // Verify password
    const isValid = await compare(password, user.passwordHash);
    if (!isValid) {
      return errorResponse(ApiError.unauthorized("Invalid credentials"));
    }

    // Check if 2FA is enabled
    if (user.twoFactorConfig?.isEnabled && user.twoFactorConfig?.isVerified) {
      const method = user.twoFactorConfig.method;
      const challengeToken = crypto.randomBytes(32).toString("hex");

      if (method === "EMAIL") {
        // Generate 6-digit code using crypto.randomInt for security
        const code = crypto.randomInt(100000, 999999).toString();
        const hashedCode = crypto
          .createHash("sha256")
          .update(code)
          .digest("hex");

        // Save challenge
        await prisma.twoFactorChallenge.create({
          data: {
            userId: user.id,
            code: hashedCode,
            token: challengeToken,
            method: "EMAIL",
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          },
        });

        // Send email
        const emailContent = twoFactorCodeEmail(user.name, code);
        await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        logger.info("2FA email challenge sent", { userId: user.id });
      } else {
        // TOTP — just create a challenge token, user provides code from app
        // Store a placeholder code hash (not used for TOTP verification)
        const placeholderHash = crypto
          .createHash("sha256")
          .update("totp-challenge")
          .digest("hex");

        await prisma.twoFactorChallenge.create({
          data: {
            userId: user.id,
            code: placeholderHash,
            token: challengeToken,
            method: "TOTP",
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          },
        });

        logger.info("2FA TOTP challenge created", { userId: user.id });
      }

      return NextResponse.json({
        requires2FA: true,
        challengeToken,
        method,
      });
    }

    // No 2FA — proceed normally
    return NextResponse.json({ requires2FA: false });
  } catch (error) {
    logger.error("Login challenge error", error);
    return errorResponse(ApiError.internal());
  }
}
