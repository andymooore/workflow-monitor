import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { withAuth, type AuthContext } from "@/lib/api-utils";

export const GET = withAuth({
  handler: async (req: NextRequest, ctx: AuthContext) => {
    const ip = getClientIp(req);
    if (!rateLimit(ip, "read")) {
      return rateLimitResponse(ip, "read");
    }

    const config = await prisma.twoFactorConfig.findUnique({
      where: { userId: ctx.user.id },
      select: {
        isEnabled: true,
        isVerified: true,
        method: true,
        backupCodes: true,
      },
    });

    if (!config || !config.isEnabled) {
      return NextResponse.json({
        enabled: false,
        method: null,
        hasBackupCodes: false,
      });
    }

    return NextResponse.json({
      enabled: config.isEnabled && config.isVerified,
      method: config.method,
      hasBackupCodes: config.backupCodes.length > 0,
      backupCodesRemaining: config.backupCodes.length,
    });
  },
});
