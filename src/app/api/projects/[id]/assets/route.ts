import { NextResponse, type NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import type { AssetCategory } from "@/generated/prisma/client";

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

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".pptx",
  ".txt", ".csv", ".png", ".jpg", ".jpeg", ".gif", ".webp",
]);

const VALID_CATEGORIES = new Set(["MOCKUP", "DRAFT", "ASSET"]);

interface AssetVersion {
  id: string;
  title: string;
  version: number;
  fileName: string | null;
  fileUrl: string | null;
  description: string | null;
  assetCategory: string;
  groupId: string;
  createdAt: Date;
  uploadedBy: { id: string; name: string };
}

interface AssetGroup {
  groupId: string;
  title: string;
  latestVersion: number;
  assetCategory: string;
  versions: AssetVersion[];
}

function buildGroups(docs: AssetVersion[]): AssetGroup[] {
  const map = new Map<string, AssetGroup>();
  for (const doc of docs) {
    if (!doc.groupId) continue;
    const existing = map.get(doc.groupId);
    if (!existing) {
      map.set(doc.groupId, {
        groupId: doc.groupId,
        title: doc.title,
        latestVersion: doc.version,
        assetCategory: doc.assetCategory,
        versions: [doc],
      });
    } else {
      existing.versions.push(doc);
      if (doc.version > existing.latestVersion) {
        existing.latestVersion = doc.version;
        existing.title = doc.title;
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    const aLatest = a.versions[0]?.createdAt;
    const bLatest = b.versions[0]?.createdAt;
    if (!aLatest || !bLatest) return 0;
    return new Date(bLatest).getTime() - new Date(aLatest).getTime();
  });
}

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/assets
// Returns versioned assets grouped by category and groupId
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw ApiError.notFound("Project not found");

    const docs = await prisma.document.findMany({
      where: {
        projectId: params.id,
        assetCategory: { not: null },
      },
      orderBy: [{ groupId: "asc" }, { version: "desc" }],
      select: {
        id: true,
        title: true,
        version: true,
        fileName: true,
        fileUrl: true,
        description: true,
        assetCategory: true,
        groupId: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    const mockups = buildGroups(
      docs.filter((d) => d.assetCategory === "MOCKUP") as unknown as AssetVersion[],
    );
    const drafts = buildGroups(
      docs.filter((d) => d.assetCategory === "DRAFT") as unknown as AssetVersion[],
    );
    const assets = buildGroups(
      docs.filter((d) => d.assetCategory === "ASSET") as unknown as AssetVersion[],
    );

    return NextResponse.json({ mockups, drafts, assets });
  },
});

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/assets
// Multipart upload. Creates a versioned Document asset.
// If groupId provided → new version. If not → new asset group.
// ---------------------------------------------------------------------------
export const POST = withAuth({
  handler: async (request: NextRequest, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw ApiError.notFound("Project not found");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string)?.trim();
    const categoryStr = (formData.get("assetCategory") as string) ?? "";
    const groupId = (formData.get("groupId") as string) || null;
    const description = (formData.get("description") as string) || null;

    if (!file || typeof file.name !== "string") {
      throw ApiError.badRequest("No file provided");
    }
    if (!title) {
      throw ApiError.badRequest("Title is required");
    }
    if (!VALID_CATEGORIES.has(categoryStr)) {
      throw ApiError.badRequest(`Invalid asset category. Must be one of: ${[...VALID_CATEGORIES].join(", ")}`);
    }

    // Validate file size
    if (file.size > env.maxFileSizeBytes) {
      throw ApiError.badRequest(`File size exceeds maximum of ${env.MAX_FILE_SIZE_MB}MB`);
    }

    // Validate file type
    const ext = extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw ApiError.badRequest(
        `File type "${ext}" is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
      );
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      throw ApiError.badRequest(`MIME type "${file.type}" is not allowed`);
    }

    // Determine version
    let version = 1;
    let resolvedGroupId = groupId;

    if (groupId) {
      // New version of existing asset
      const latest = await prisma.document.findFirst({
        where: { groupId, projectId: params.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      if (!latest) throw ApiError.badRequest("Asset group not found");
      version = latest.version + 1;
    } else {
      resolvedGroupId = randomUUID();
    }

    // Store file
    const fileId = randomUUID();
    const safeFileName = `${fileId}${ext}`;
    const uploadDir = join(process.cwd(), env.UPLOAD_DIR);
    await mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(join(uploadDir, safeFileName), buffer);

    logger.info("Asset uploaded", {
      fileName: file.name,
      storedAs: safeFileName,
      size: file.size,
      userId: user.id,
      projectId: params.id,
      assetCategory: categoryStr,
      version,
    });

    // Create document record
    const document = await prisma.document.create({
      data: {
        title,
        type: "OTHER",
        description,
        fileName: file.name,
        fileUrl: `/api/documents/upload/${safeFileName}`,
        projectId: params.id,
        clientId: project.clientId,
        uploadedById: user.id,
        version,
        groupId: resolvedGroupId,
        assetCategory: categoryStr as AssetCategory,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "DOCUMENT_UPLOADED",
      details: {
        documentId: document.id,
        title: document.title,
        assetCategory: categoryStr,
        version,
        groupId: resolvedGroupId,
        fileName: file.name,
        fileSize: file.size,
        projectId: params.id,
      },
      ipAddress: ip,
    });

    recordActivity({
      userId: user.id,
      type: "DOCUMENT_UPLOADED",
      title: `Uploaded ${categoryStr.toLowerCase()} "${title}" (v${version})`,
      projectId: params.id,
      clientId: project.clientId,
      metadata: { assetCategory: categoryStr, version, groupId: resolvedGroupId },
    }).catch(() => {});

    return NextResponse.json(document, { status: 201 });
  },
});
