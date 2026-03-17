import { NextResponse, type NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

// Allowed MIME types for upload
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

// Allowed file extensions (defense in depth — don't trust MIME alone)
const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".pptx",
  ".txt", ".csv", ".png", ".jpg", ".jpeg", ".gif", ".webp",
]);

// ---------------------------------------------------------------------------
// POST /api/documents/upload
// Multipart file upload. Creates a Document record + stores the file.
// ---------------------------------------------------------------------------
export const POST = withAuth({
  handler: async (request: NextRequest, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) ?? "";
    const type = (formData.get("type") as string) ?? "OTHER";
    const description = (formData.get("description") as string) ?? null;
    const clientId = (formData.get("clientId") as string) || null;
    const projectId = (formData.get("projectId") as string) || null;
    const instanceId = (formData.get("instanceId") as string) || null;
    const reference = (formData.get("reference") as string) || null;

    if (!file || typeof file.name !== "string") {
      throw ApiError.badRequest("No file provided");
    }

    if (!title || title.trim().length === 0) {
      throw ApiError.badRequest("Title is required");
    }

    // ── Validate file size ──────────────────────────────────────────────
    if (file.size > env.maxFileSizeBytes) {
      throw ApiError.badRequest(
        `File size exceeds maximum of ${env.MAX_FILE_SIZE_MB}MB`,
      );
    }

    // ── Validate file type ──────────────────────────────────────────────
    const ext = extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw ApiError.badRequest(
        `File type "${ext}" is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
      );
    }

    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      throw ApiError.badRequest(`MIME type "${file.type}" is not allowed`);
    }

    // ── Validate referenced entities ────────────────────────────────────
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) throw ApiError.badRequest("Referenced client not found");
    }
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw ApiError.badRequest("Referenced project not found");
    }
    if (instanceId) {
      const instance = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
      if (!instance) throw ApiError.badRequest("Referenced workflow instance not found");
    }

    // ── Store file ──────────────────────────────────────────────────────
    const fileId = randomUUID();
    const safeFileName = `${fileId}${ext}`;
    const uploadDir = join(process.cwd(), env.UPLOAD_DIR);

    await mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filePath = join(uploadDir, safeFileName);
    await writeFile(filePath, buffer);

    logger.info("File uploaded", {
      fileName: file.name,
      storedAs: safeFileName,
      size: file.size,
      userId: user.id,
    });

    // ── Create document record ──────────────────────────────────────────
    const document = await prisma.document.create({
      data: {
        title: title.trim(),
        type: type as "SLA" | "TOR" | "CLIENT_ACCESS_AGREEMENT" | "CONTRACT" | "PROPOSAL" | "CHANGE_REQUEST" | "REPORT" | "MEETING_MINUTES" | "OTHER",
        description,
        fileName: file.name,
        fileUrl: `/api/documents/upload/${safeFileName}`,
        reference,
        clientId,
        projectId,
        instanceId,
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
        fileName: file.name,
        fileSize: file.size,
        clientId,
        projectId,
        instanceId,
      },
      ipAddress: ip,
    });

    return NextResponse.json(document, { status: 201 });
  },
});
