import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// DELETE /api/workflows/instances/[instanceId]/comments/[commentId]
export const DELETE = withAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId, commentId } = params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.instanceId !== instanceId) {
      throw ApiError.notFound("Comment not found");
    }

    // Only comment author or admin can delete
    const isAdmin = user.roles?.includes("admin");
    if (comment.userId !== user.id && !isAdmin) {
      throw ApiError.forbidden("You can only delete your own comments");
    }

    await prisma.comment.delete({ where: { id: commentId } });

    await prisma.auditLog.create({
      data: {
        instanceId,
        userId: user.id,
        action: "COMMENT_ADDED", // reuse closest action type
        details: {
          commentId,
          action: "deleted",
          deletedContent: comment.content.slice(0, 200), // truncate for audit
        },
      },
    });

    return NextResponse.json({ success: true });
  },
});
