import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const createTagSchema = z.object({
  name: z
    .string()
    .min(1, "Tag name is required")
    .max(100, "Tag name must be 100 characters or fewer"),
  color: z
    .string()
    .max(30, "Color must be 30 characters or fewer")
    .optional()
    .default("slate"),
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/tags - List all tags with article counts
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const tags = await prisma.knowledgeTag.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { articles: true } },
      },
    });

    return NextResponse.json(tags);
  },
});

// ---------------------------------------------------------------------------
// POST /api/knowledge/tags - Create tag
// ---------------------------------------------------------------------------
export const POST = withAdminAuth({
  schema: createTagSchema,
  handler: async (request, { body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const existing = await prisma.knowledgeTag.findUnique({
      where: { name: body.name },
    });
    if (existing) {
      throw ApiError.conflict("A tag with this name already exists");
    }

    const tag = await prisma.knowledgeTag.create({
      data: {
        name: body.name,
        color: body.color ?? "slate",
      },
      include: {
        _count: { select: { articles: true } },
      },
    });

    return NextResponse.json(tag, { status: 201 });
  },
});
