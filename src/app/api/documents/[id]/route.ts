import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { updateDocumentSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// GET /api/documents/[id]
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const document = await prisma.document.findUnique({
      where: { id: params.id },
      include: {
        client: { select: { id: true, name: true, shortCode: true } },
        project: { select: { id: true, name: true } },
        instance: { select: { id: true, title: true } },
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!document) throw ApiError.notFound("Document not found");
    return NextResponse.json(document);
  },
});

// PUT /api/documents/[id]
export const PUT = withAuth({
  schema: updateDocumentSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const existing = await prisma.document.findUnique({ where: { id: params.id } });
    if (!existing) throw ApiError.notFound("Document not found");

    // Only uploader or admin can edit
    const isAdmin = user.roles?.includes("admin");
    if (existing.uploadedById !== user.id && !isAdmin) {
      throw ApiError.forbidden("Only the uploader or an admin can edit this document");
    }

    const updated = await prisma.document.update({
      where: { id: params.id },
      data: {
        title: body.title ?? existing.title,
        type: body.type ?? existing.type,
        description: body.description !== undefined ? body.description : existing.description,
        fileName: body.fileName !== undefined ? body.fileName : existing.fileName,
        fileUrl: body.fileUrl !== undefined ? body.fileUrl : existing.fileUrl,
        reference: body.reference !== undefined ? body.reference : existing.reference,
      },
      include: {
        client: { select: { id: true, name: true, shortCode: true } },
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  },
});

// DELETE /api/documents/[id]
export const DELETE = withAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const document = await prisma.document.findUnique({ where: { id: params.id } });
    if (!document) throw ApiError.notFound("Document not found");

    const isAdmin = user.roles?.includes("admin");
    if (document.uploadedById !== user.id && !isAdmin) {
      throw ApiError.forbidden("Only the uploader or an admin can delete this document");
    }

    await prisma.document.delete({ where: { id: params.id } });

    await logAdminAction({
      userId: user.id,
      action: "DOCUMENT_DELETED",
      details: { documentId: params.id, title: document.title, type: document.type },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
