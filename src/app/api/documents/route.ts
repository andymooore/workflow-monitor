import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { createDocumentSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// GET /api/documents - List documents with filters
export const GET = withAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const { searchParams } = request.nextUrl;
    const clientId = searchParams.get("clientId");
    const projectId = searchParams.get("projectId");
    const instanceId = searchParams.get("instanceId");
    const type = searchParams.get("type");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;
    if (projectId) where.projectId = projectId;
    if (instanceId) where.instanceId = instanceId;
    if (type) where.type = type;

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          client: { select: { id: true, name: true, shortCode: true } },
          project: { select: { id: true, name: true } },
          instance: { select: { id: true, title: true } },
          uploadedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);

    return NextResponse.json({ data: documents, total, limit, offset, hasMore: offset + limit < total });
  },
});

// POST /api/documents - Upload/create a document record
export const POST = withAuth({
  schema: createDocumentSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    // Validate referenced entities exist
    if (body.clientId) {
      const client = await prisma.client.findUnique({ where: { id: body.clientId } });
      if (!client) throw ApiError.badRequest("Referenced client not found");
    }
    if (body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: body.projectId } });
      if (!project) throw ApiError.badRequest("Referenced project not found");
    }
    if (body.instanceId) {
      const instance = await prisma.workflowInstance.findUnique({ where: { id: body.instanceId } });
      if (!instance) throw ApiError.badRequest("Referenced workflow instance not found");
    }

    const document = await prisma.document.create({
      data: {
        title: body.title,
        type: body.type,
        description: body.description ?? null,
        fileName: body.fileName ?? null,
        fileUrl: body.fileUrl ?? null,
        reference: body.reference ?? null,
        clientId: body.clientId ?? null,
        projectId: body.projectId ?? null,
        instanceId: body.instanceId ?? null,
        uploadedById: user.id,
      },
      include: {
        client: { select: { id: true, name: true, shortCode: true } },
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "DOCUMENT_UPLOADED",
      details: {
        documentId: document.id,
        title: document.title,
        type: document.type,
        clientId: body.clientId,
        projectId: body.projectId,
        instanceId: body.instanceId,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(document, { status: 201 });
  },
});
