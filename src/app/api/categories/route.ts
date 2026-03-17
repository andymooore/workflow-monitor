import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Category name must be 100 characters or fewer"),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer")
    .optional()
    .nullable(),
  icon: z.string().max(50).optional().default("FolderOpen"),
  color: z.string().max(30).optional().default("slate"),
  sortOrder: z.number().int().min(0).optional().default(0),
});

// ---------------------------------------------------------------------------
// GET /api/categories
// List all workflow categories ordered by sortOrder.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const categories = await prisma.workflowCategory.findMany({
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(categories);
  },
});

// ---------------------------------------------------------------------------
// POST /api/categories
// Create a new workflow category.
// ---------------------------------------------------------------------------
export const POST = withAdminAuth({
  schema: createCategorySchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const existing = await prisma.workflowCategory.findUnique({
      where: { name: body.name },
    });
    if (existing) {
      throw ApiError.conflict("A category with this name already exists");
    }

    const category = await prisma.workflowCategory.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        icon: body.icon ?? "FolderOpen",
        color: body.color ?? "slate",
        sortOrder: body.sortOrder ?? 0,
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "CATEGORY_CREATED",
      details: { categoryId: category.id, name: body.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(category, { status: 201 });
  },
});
