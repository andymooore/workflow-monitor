import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError, errorResponse } from "@/lib/api-utils";
import { createTemplateSchema, nodeTypeEnum, conditionBranchEnum } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// ---------------------------------------------------------------------------
// GET /api/workflows/templates
// List templates with optional ?published=true filter.
// Returns templates with _count of instances and nodes, sorted by updatedAt desc.
// Does NOT include full nodes/edges data - use the single-template GET route
// for that.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { searchParams } = request.nextUrl;
    const publishedFilter = searchParams.get("published");
    const search = searchParams.get("search");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    const where: Record<string, unknown> =
      publishedFilter === "true"
        ? { isPublished: true }
        : publishedFilter === "false"
          ? { isPublished: false }
          : {};
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [templates, total] = await Promise.all([
      prisma.workflowTemplate.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          version: true,
          isPublished: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { instances: true, nodes: true } },
        },
      }),
      prisma.workflowTemplate.count({ where }),
    ]);

    return NextResponse.json({ data: templates, total, limit, offset, hasMore: offset + limit < total });
  },
});

// ---------------------------------------------------------------------------
// POST /api/workflows/templates
// Create a new template with nodes and edges in a transaction.
// Body: { name, description, nodes: [...], edges: [...] }
// ---------------------------------------------------------------------------
export const POST = withAuth({
  schema: createTemplateSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { name, description, category, intakeForm, nodes, edges } = body;

    const template = await prisma.$transaction(async (tx) => {
      // Create template
      const created = await tx.workflowTemplate.create({
        data: {
          name,
          description: description ?? "",
          category: category ?? "General",
          intakeForm: (intakeForm ?? []) as object,
          createdById: user.id,
        },
      });

      // Create nodes
      for (const node of nodes ?? []) {
        // Validate node type against the enum instead of unsafe cast
        const parsedType = nodeTypeEnum.safeParse(node.type.toUpperCase());
        if (!parsedType.success) {
          throw ApiError.badRequest(
            `Invalid node type "${node.type}". Must be one of: START, END, TASK, APPROVAL, CONDITION`,
          );
        }

        const createdNode = await tx.workflowNode.create({
          data: {
            id: node.id,
            templateId: created.id,
            type: parsedType.data,
            label: node.label,
            positionX: node.positionX,
            positionY: node.positionY,
            config: (node.config ?? {}) as object,
          },
        });

        // Create role assignments for the node
        if (node.roleAssignments) {
          for (const ra of node.roleAssignments) {
            await tx.workflowNodeRoleAssignment.create({
              data: {
                nodeId: createdNode.id,
                roleId: ra.roleId,
                assignToOwner: ra.assignToOwner ?? false,
              },
            });
          }
        }
      }

      // Create edges
      for (const edge of edges ?? []) {
        // Validate conditionBranch if provided
        let validatedBranch: "APPROVED_PATH" | "REJECTED_PATH" | null = null;
        if (edge.conditionBranch != null) {
          const parsedBranch = conditionBranchEnum.safeParse(edge.conditionBranch);
          if (!parsedBranch.success) {
            throw ApiError.badRequest(
              `Invalid conditionBranch "${edge.conditionBranch}". Must be one of: APPROVED_PATH, REJECTED_PATH`,
            );
          }
          validatedBranch = parsedBranch.data;
        }

        await tx.workflowEdge.create({
          data: {
            id: edge.id,
            templateId: created.id,
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            label: edge.label ?? null,
            conditionBranch: validatedBranch,
          },
        });
      }

      // Return with full relations
      return tx.workflowTemplate.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          nodes: {
            include: {
              roleAssignments: { include: { role: true } },
            },
          },
          edges: true,
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { instances: true } },
        },
      });
    });

    await logAdminAction({
      userId: user.id,
      action: "TEMPLATE_CREATED",
      details: { templateId: template.id, name: body.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(template, { status: 201 });
  },
});
