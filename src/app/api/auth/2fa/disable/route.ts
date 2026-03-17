import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import {
  errorResponse,
  ApiError,
  withAuth,
  type AuthContext,
} from "@/lib/api-utils";

const disable2FASchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const POST = withAuth({
  schema: disable2FASchema,
  handler: async (
    req: NextRequest,
    ctx: AuthContext<z.infer<typeof disable2FASchema>>
  ) => {
    const ip = getClientIp(req);
    if (!rateLimit(ip, "auth")) {
      return rateLimitResponse(ip, "auth");
    }

    const { password } = ctx.body;
    const userId = ctx.user.id;

    // Verify password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      return errorResponse(ApiError.unauthorized("Invalid password"));
    }

    const isValid = await compare(password, user.passwordHash);
    if (!isValid) {
      return errorResponse(ApiError.unauthorized("Invalid password"));
    }

    // Delete 2FA config and all challenges
    await prisma.$transaction([
      prisma.twoFactorChallenge.deleteMany({
        where: { userId },
      }),
      prisma.twoFactorConfig.deleteMany({
        where: { userId },
      }),
    ]);

    logger.info("2FA disabled", { userId });

    return NextResponse.json({ disabled: true });
  },
});
