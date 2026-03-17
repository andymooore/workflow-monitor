import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";

const updateCategorySchema = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Category name must be 100 characters or fewer")
    .optional(),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer")
    .optional()
    .nullable(),
  icon: z.string().max(50).optional(),
  color: z.string().max(30).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/categories/[id]
// Get a single category with count of templates using it.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const category = await prisma.workflowCategory.findUnique({
      where: { id: params.id },
    });

    if (!category) {
      throw ApiError.notFound("Category not found");
    }

    // Count templates using this category name
    const templateCount = await prisma.workflowTemplate.count({
      where: { category: category.name },
    });

    return NextResponse.json({ ...category, _count: { templates: templateCount } });
  },
});

// ---------------------------------------------------------------------------
// PUT /api/categories/[id]
// Update a category. If name changes, update all templates referencing old name.
// ---------------------------------------------------------------------------
export const PUT = withAdminAuth({
  schema: updateCategorySchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const existing = await prisma.workflowCategory.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      throw ApiError.notFound("Category not found");
    }

    // Check name uniqueness if changing
    if (body.name && body.name !== existing.name) {
      const conflict = await prisma.workflowCategory.findUnique({
        where: { name: body.name },
      });
      if (conflict) {
        throw ApiError.conflict("A category with this name already exists");
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If name is changing, update all templates that reference the old name
      if (body.name && body.name !== existing.name) {
        await tx.workflowTemplate.updateMany({
          where: { category: existing.name },
          data: { category: body.name },
        });
      }

      return tx.workflowCategory.update({
        where: { id: params.id },
        data: {
          name: body.name ?? existing.name,
          description: body.description !== undefined ? body.description : existing.description,
          icon: body.icon ?? existing.icon,
          color: body.color ?? existing.color,
          sortOrder: body.sortOrder ?? existing.sortOrder,
        },
      });
    });

    await logAdminAction({
      userId: user.id,
      action: "CATEGORY_UPDATED",
      details: { categoryId: params.id, changes: body },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(updated);
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/categories/[id]
// Delete a category. Templates keep their category string (becomes orphaned).
// ---------------------------------------------------------------------------
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const category = await prisma.workflowCategory.findUnique({
      where: { id: params.id },
    });

    if (!category) {
      throw ApiError.notFound("Category not found");
    }

    // Reset templates using this category to "General"
    await prisma.$transaction(async (tx) => {
      await tx.workflowTemplate.updateMany({
        where: { category: category.name },
        data: { category: "General" },
      });
      await tx.workflowCategory.delete({ where: { id: params.id } });
    });

    await logAdminAction({
      userId: user.id,
      action: "CATEGORY_DELETED",
      details: { categoryId: params.id, categoryName: category.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
