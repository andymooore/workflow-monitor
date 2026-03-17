import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const createArticleSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(300, "Title must be 300 characters or fewer"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(100_000, "Content must be 100,000 characters or fewer"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(300, "Slug must be 300 characters or fewer")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens"
    ),
  excerpt: z
    .string()
    .max(500, "Excerpt must be 500 characters or fewer")
    .optional()
    .nullable(),
  clientId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  isPublished: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/articles - List articles (all authenticated users)
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search");
    const tagId = searchParams.get("tagId");
    const clientId = searchParams.get("clientId");
    const projectId = searchParams.get("projectId");
    const published = searchParams.get("published");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      100
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0
    );

    // Build where clause
    const where: Record<string, unknown> = {};

    // Non-admins can only see published articles; admins can filter
    const isAdmin = user.roles.includes("admin");
    if (published === "true") where.isPublished = true;
    else if (published === "false" && isAdmin) where.isPublished = false;
    else if (!isAdmin) where.isPublished = true;

    if (clientId) where.clientId = clientId;
    if (projectId) where.projectId = projectId;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
        { excerpt: { contains: search, mode: "insensitive" } },
      ];
    }

    if (tagId) {
      where.tags = { some: { tagId } };
    }

    const [articles, total] = await Promise.all([
      prisma.knowledgeArticle.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          author: { select: { id: true, name: true, email: true } },
          tags: {
            include: {
              tag: true,
            },
          },
        },
      }),
      prisma.knowledgeArticle.count({ where }),
    ]);

    return NextResponse.json({
      data: articles,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  },
});

// ---------------------------------------------------------------------------
// POST /api/knowledge/articles - Create article (admin only)
// ---------------------------------------------------------------------------
export const POST = withAdminAuth({
  schema: createArticleSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    // Validate slug uniqueness
    const existingSlug = await prisma.knowledgeArticle.findUnique({
      where: { slug: body.slug },
    });
    if (existingSlug) {
      throw ApiError.conflict("An article with this slug already exists");
    }

    // Create article with tags in a transaction
    const article = await prisma.$transaction(async (tx) => {
      const created = await tx.knowledgeArticle.create({
        data: {
          title: body.title,
          content: body.content,
          slug: body.slug,
          excerpt: body.excerpt ?? null,
          authorId: user.id,
          clientId: body.clientId ?? null,
          projectId: body.projectId ?? null,
          isPublished: body.isPublished ?? false,
        },
      });

      // Attach tags if provided
      if (body.tags && body.tags.length > 0) {
        // Ensure all tags exist (create if not)
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
            data: { articleId: created.id, tagId: tag.id },
          });
        }
      }

      return tx.knowledgeArticle.findUnique({
        where: { id: created.id },
        include: {
          author: { select: { id: true, name: true, email: true } },
          tags: { include: { tag: true } },
        },
      });
    });

    await logAdminAction({
      userId: user.id,
      action: "KNOWLEDGE_ARTICLE_CREATED",
      details: {
        articleId: article!.id,
        title: body.title,
        slug: body.slug,
      },
      ipAddress: ip,
    });

    return NextResponse.json(article, { status: 201 });
  },
});
