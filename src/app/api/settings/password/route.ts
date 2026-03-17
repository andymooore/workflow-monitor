import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { passwordSchema } from "@/lib/validations";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const PUT = withAuth({
  schema: changePasswordSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser?.passwordHash) {
      throw ApiError.badRequest("Account does not support password changes");
    }

    const isValid = await compare(body.currentPassword, dbUser.passwordHash);
    if (!isValid) {
      throw ApiError.forbidden("Current password is incorrect");
    }

    const newHash = await hash(body.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return NextResponse.json({ success: true });
  },
});
