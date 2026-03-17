import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { updateTemplateSchema, nodeTypeEnum, conditionBranchEnum } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// ---------------------------------------------------------------------------
// GET /api/workflows/templates/[templateId]
// Single template with nodes, edges, roleAssignments.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { templateId } = params;

    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
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

    if (!template) {
      throw ApiError.notFound("Template not found");
    }

    return NextResponse.json(template);
  },
});

// ---------------------------------------------------------------------------
// PUT /api/workflows/templates/[templateId]
// Update template: delete all existing nodes/edges, recreate from payload.
// ---------------------------------------------------------------------------
export const PUT = withAuth({
  schema: updateTemplateSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { templateId } = params;
    const { name, description, category, intakeForm, nodes, edges } = body;

    const template = await prisma.$transaction(async (tx) => {
      // Verify template exists
      const existing = await tx.workflowTemplate.findUnique({
        where: { id: templateId },
      });
      if (!existing) {
        throw ApiError.notFound("Template not found");
      }

      // Update template metadata
      await tx.workflowTemplate.update({
        where: { id: templateId },
        data: {
          name: name ?? existing.name,
          description: description ?? existing.description,
          category: category ?? existing.category,
          intakeForm: intakeForm !== undefined ? (intakeForm as object ?? {}) : (existing.intakeForm ?? {}),
          isPublished: false, // Unpublish on edit so re-validation is required
          version: { increment: 1 },
        },
      });

      // Delete existing nodes (cascade will remove edges and role assignments)
      await tx.workflowNode.deleteMany({ where: { templateId } });

      // Recreate nodes
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
            templateId,
            type: parsedType.data,
            label: node.label,
            positionX: node.positionX,
            positionY: node.positionY,
            config: (node.config ?? {}) as object,
          },
        });

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

      // Recreate edges
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
            templateId,
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            label: edge.label ?? null,
            conditionBranch: validatedBranch,
          },
        });
      }

      // Return updated template with full relations
      return tx.workflowTemplate.findUniqueOrThrow({
        where: { id: templateId },
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
      action: "TEMPLATE_UPDATED",
      details: { templateId: params.templateId, name: body.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(template);
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/workflows/templates/[templateId]
// Only if no active instances.
// ---------------------------------------------------------------------------
export const DELETE = withAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { templateId } = params;

    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      include: {
        _count: {
          select: {
            instances: {
              where: { status: { in: ["RUNNING", "DRAFT"] } },
            },
          },
        },
      },
    });

    if (!template) {
      throw ApiError.notFound("Template not found");
    }

    if (template._count.instances > 0) {
      throw ApiError.conflict("Cannot delete template with active instances");
    }

    await prisma.workflowTemplate.delete({ where: { id: templateId } });

    await logAdminAction({
      userId: user.id,
      action: "TEMPLATE_DELETED",
      details: { templateId: params.templateId },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
