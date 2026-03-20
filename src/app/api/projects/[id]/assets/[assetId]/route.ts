import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]/assets/[assetId]
// Deletes a single version of an asset. Admin or uploader only.
// ---------------------------------------------------------------------------
export const DELETE = withAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const doc = await prisma.document.findUnique({
      where: { id: params.assetId },
    });

    if (!doc || doc.projectId !== params.id) {
      throw ApiError.notFound("Asset not found");
    }

    const isAdmin = (user.roles ?? []).includes("admin");
    if (doc.uploadedById !== user.id && !isAdmin) {
      throw ApiError.forbidden("Only the uploader or an admin can delete this asset");
    }

    await prisma.document.delete({ where: { id: params.assetId } });

    await logAdminAction({
      userId: user.id,
      action: "DOCUMENT_DELETED",
      details: {
        documentId: doc.id,
        title: doc.title,
        assetCategory: doc.assetCategory,
        version: doc.version,
        groupId: doc.groupId,
        projectId: params.id,
      },
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  },
});
