import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const updateArticleSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(300, "Title must be 300 characters or fewer")
    .optional(),
  content: z
    .string()
    .min(1, "Content is required")
    .max(100_000, "Content must be 100,000 characters or fewer")
    .optional(),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(300, "Slug must be 300 characters or fewer")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens"
    )
    .optional(),
  excerpt: z
    .string()
    .max(500, "Excerpt must be 500 characters or fewer")
    .optional()
    .nullable(),
  clientId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/articles/[articleId] - Get single article
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const { articleId } = params;
    if (!articleId) throw ApiError.badRequest("Article ID is required");

    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      include: {
        author: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
      },
    });

    if (!article) throw ApiError.notFound("Article not found");

    // Non-admins cannot view unpublished/draft articles
    if (!article.isPublished && !user.roles.includes("admin")) {
      throw ApiError.notFound("Article not found");
    }

    return NextResponse.json(article);
  },
});

// ---------------------------------------------------------------------------
// PUT /api/knowledge/articles/[articleId] - Update article (admin only)
// ---------------------------------------------------------------------------
export const PUT = withAdminAuth({
  schema: updateArticleSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const { articleId } = params;
    if (!articleId) throw ApiError.badRequest("Article ID is required");

    const existing = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
    });
    if (!existing) throw ApiError.notFound("Article not found");

    // Check slug uniqueness if changing slug
    if (body.slug && body.slug !== existing.slug) {
      const slugTaken = await prisma.knowledgeArticle.findUnique({
        where: { slug: body.slug },
      });
      if (slugTaken) {
        throw ApiError.conflict("An article with this slug already exists");
      }
    }

    const article = await prisma.$transaction(async (tx) => {
      // Update the article fields
      const updated = await tx.knowledgeArticle.update({
        where: { id: articleId },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.content !== undefined && { content: body.content }),
          ...(body.slug !== undefined && { slug: body.slug }),
          ...(body.excerpt !== undefined && { excerpt: body.excerpt ?? null }),
          ...(body.clientId !== undefined && {
            clientId: body.clientId ?? null,
          }),
          ...(body.projectId !== undefined && {
            projectId: body.projectId ?? null,
          }),
          ...(body.isPublished !== undefined && {
            isPublished: body.isPublished,
          }),
        },
      });

      // Update tags if provided
      if (body.tags !== undefined) {
        // Remove all existing tags
        await tx.knowledgeArticleTag.deleteMany({
          where: { articleId },
        });

        // Re-attach tags
        for (const tagName of body.tags) {
          let tag = await tx.knowledgeTag.findUnique({
            where: { name: tagName },
          });
          if (!tag) {
            tag = await tx.knowledgeTag.create({
              data: { name: tagName },
            });
          }
          await tx.knowledgeArticleTag.create({
            data: { articleId: updated.id, tagId: tag.id },
          });
        }
      }

      return tx.knowledgeArticle.findUnique({
        where: { id: articleId },
        include: {
          author: { select: { id: true, name: true, email: true } },
          tags: { include: { tag: true } },
        },
      });
    });

    await logAdminAction({
      userId: user.id,
      action: "KNOWLEDGE_ARTICLE_UPDATED",
      details: {
        articleId,
        changes: body,
      },
      ipAddress: ip,
    });

    return NextResponse.json(article);
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/knowledge/articles/[articleId] - Delete article (admin only)
// ---------------------------------------------------------------------------
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const { articleId } = params;
    if (!articleId) throw ApiError.badRequest("Article ID is required");

    const existing = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { id: true, title: true, slug: true },
    });
    if (!existing) throw ApiError.notFound("Article not found");

    await prisma.knowledgeArticle.delete({ where: { id: articleId } });

    await logAdminAction({
      userId: user.id,
      action: "KNOWLEDGE_ARTICLE_DELETED",
      details: {
        articleId: existing.id,
        title: existing.title,
        slug: existing.slug,
      },
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  },
});
