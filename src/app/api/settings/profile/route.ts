import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(1).max(200),
});

export const PUT = withAuth({
  schema: updateProfileSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    await prisma.user.update({
      where: { id: user.id },
      data: { name: body.name.trim() },
    });

    await logAdminAction({
      userId: user.id,
      action: "USER_UPDATED",
      details: { targetUserId: user.id, name: body.name.trim(), selfUpdate: true },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
