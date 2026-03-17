import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const linkContactSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
});

// GET /api/projects/[id]/contacts - List contacts linked to a project
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw ApiError.notFound("Project not found");

    const projectContacts = await prisma.projectContact.findMany({
      where: { projectId: params.id },
      include: {
        contact: true,
      },
      orderBy: { contact: { name: "asc" } },
    });

    return NextResponse.json(projectContacts);
  },
});

// POST /api/projects/[id]/contacts - Link a contact to a project (admin only)
export const POST = withAdminAuth({
  schema: linkContactSchema,
  handler: async (request, { params, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw ApiError.notFound("Project not found");

    // Verify contact exists and belongs to the same client as the project
    const contact = await prisma.clientContact.findUnique({ where: { id: body.contactId } });
    if (!contact) throw ApiError.notFound("Contact not found");
    if (contact.clientId !== project.clientId) {
      throw ApiError.badRequest("Contact does not belong to the same client as this project");
    }

    // Check if already linked
    const existing = await prisma.projectContact.findUnique({
      where: { projectId_contactId: { projectId: params.id, contactId: body.contactId } },
    });
    if (existing) throw ApiError.conflict("Contact is already linked to this project");

    const projectContact = await prisma.projectContact.create({
      data: {
        projectId: params.id,
        contactId: body.contactId,
      },
      include: {
        contact: true,
      },
    });

    return NextResponse.json(projectContact, { status: 201 });
  },
});
