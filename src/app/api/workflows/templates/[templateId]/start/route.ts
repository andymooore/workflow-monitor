import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { workflowEngine } from "@/lib/engine/workflow-engine";
import { startInstanceSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordActivity } from "@/lib/activity";

// ---------------------------------------------------------------------------
// POST /api/workflows/templates/[templateId]/start
// Start a new workflow instance from a published template.
// Body: { title, metadata? }
// ---------------------------------------------------------------------------
export const POST = withAuth({
  schema: startInstanceSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { templateId } = params;
    const { title, priority, clientId, projectId, requestedByContactId, metadata } = body;

    // Validate client exists and is active
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, status: true, hasSignedAgreement: true },
    });
    if (!client || client.status !== "ACTIVE") {
      throw ApiError.badRequest("Client not found or is not active");
    }

    // IT-SEC-002 S.7: Require signed Client Access Agreement for environment and access workflows
    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      select: { category: true },
    });
    const requiresAgreement = ["Environment Management", "Access Management"].includes(template?.category ?? "");
    if (requiresAgreement && !client.hasSignedAgreement) {
      throw ApiError.badRequest(
        `Client "${client.name}" has not signed the required Client Access Agreement (IT-SEC-002 S.7). Contact an administrator.`
      );
    }

    // Validate project if provided
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project || project.clientId !== clientId || !project.isActive) {
        throw ApiError.badRequest("Project not found, does not belong to this client, or is inactive");
      }
    }

    // Validate requestedByContact if provided
    if (requestedByContactId) {
      const contact = await prisma.clientContact.findUnique({ where: { id: requestedByContactId } });
      if (!contact || contact.clientId !== clientId || !contact.isActive) {
        throw ApiError.badRequest("Requested-by contact not found, does not belong to this client, or is inactive");
      }
    }

    const enrichedMetadata = { ...metadata, _priority: priority ?? "Medium" };

    const result = await workflowEngine.startInstance(
      templateId,
      user.id,
      title,
      enrichedMetadata,
      prisma,
      clientId,
      projectId ?? null,
    );

    if (requestedByContactId) {
      await prisma.workflowInstance.update({
        where: { id: result.instanceId },
        data: { requestedByContactId },
      });
    }

    // Load the full instance to return
    const instance = await prisma.workflowInstance.findUniqueOrThrow({
      where: { id: result.instanceId },
      include: {
        template: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        taskInstances: {
          include: {
            node: true,
            assignee: { select: { id: true, name: true, email: true } },
            approvals: {
              include: {
                decider: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    // Fire-and-forget activity recording
    recordActivity({
      userId: user.id,
      type: "WORKFLOW_STARTED",
      title: `Started workflow "${title}"`,
      description: `Template: ${instance.template.name}`,
      clientId: clientId,
      projectId: projectId ?? undefined,
      instanceId: instance.id,
      metadata: { templateId, templateName: instance.template.name },
    }).catch(() => {});

    return NextResponse.json(instance, { status: 201 });
  },
});
