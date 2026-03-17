import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "fs/promises";
import { join, extname } from "path";
import { withAuth, ApiError } from "@/lib/api-utils";
import { env } from "@/lib/env";

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// ---------------------------------------------------------------------------
// GET /api/documents/upload/[filename]
// Serve uploaded files — requires authentication.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (
    _request: NextRequest,
    { params },
  ) => {
    const filename = params.filename;
    if (!filename) throw ApiError.badRequest("Missing filename");

    // Prevent path traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      throw ApiError.badRequest("Invalid filename");
    }

    const uploadDir = join(process.cwd(), env.UPLOAD_DIR);
    const filePath = join(uploadDir, filename);

    // Verify file is within upload directory (defense in depth)
    if (!filePath.startsWith(uploadDir)) {
      throw ApiError.badRequest("Invalid filename");
    }

    try {
      await stat(filePath);
    } catch {
      throw ApiError.notFound("File not found");
    }

    const buffer = await readFile(filePath);
    const ext = extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
});
