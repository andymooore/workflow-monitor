import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { TemplateValidator } from "@/lib/engine/validators";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// ---------------------------------------------------------------------------
// POST /api/workflows/templates/[templateId]/publish
// Validate and publish a template.
// ---------------------------------------------------------------------------
export const POST = withAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { templateId } = params;

    // Load template with all relations needed for validation
    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      include: {
        nodes: {
          include: {
            roleAssignments: true,
          },
        },
        edges: true,
      },
    });

    if (!template) {
      throw ApiError.notFound("Template not found");
    }

    // Validate using TemplateValidator
    const validator = new TemplateValidator();
    const errors = validator.validate({
      nodes: template.nodes,
      edges: template.edges,
    });

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "Template validation failed",
            details: { errors },
          },
        },
        { status: 422 },
      );
    }

    // Mark as published
    const updated = await prisma.workflowTemplate.update({
      where: { id: templateId },
      data: { isPublished: true },
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

    await logAdminAction({
      userId: user.id,
      action: "TEMPLATE_PUBLISHED",
      details: { templateId: params.templateId },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ valid: true, template: updated });
  },
});
