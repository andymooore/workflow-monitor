import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { updateContactSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// GET /api/clients/[id]/contacts/[contactId]
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const contact = await prisma.clientContact.findUnique({
      where: { id: params.contactId },
      include: {
        projects: {
          include: {
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!contact) throw ApiError.notFound("Contact not found");
    if (contact.clientId !== params.id) throw ApiError.notFound("Contact not found");

    return NextResponse.json(contact);
  },
});

// PUT /api/clients/[id]/contacts/[contactId]
export const PUT = withAdminAuth({
  schema: updateContactSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const existing = await prisma.clientContact.findUnique({ where: { id: params.contactId } });
    if (!existing) throw ApiError.notFound("Contact not found");
    if (existing.clientId !== params.id) throw ApiError.notFound("Contact not found");

    // If isPrimary is being set to true, unset others in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      if (body.isPrimary === true && !existing.isPrimary) {
        await tx.clientContact.updateMany({
          where: { clientId: params.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.clientContact.update({
        where: { id: params.contactId },
        data: {
          name: body.name ?? existing.name,
          email: body.email ?? existing.email,
          phone: body.phone !== undefined ? body.phone : existing.phone,
          title: body.title !== undefined ? body.title : existing.title,
          department: body.department !== undefined ? body.department : existing.department,
          role: body.role ?? existing.role,
          isPrimary: body.isPrimary ?? existing.isPrimary,
          isActive: body.isActive ?? existing.isActive,
          notes: body.notes !== undefined ? body.notes : existing.notes,
        },
      });
    });

    await logAdminAction({
      userId: user.id,
      action: "CONTACT_UPDATED",
      details: { contactId: params.contactId, clientId: params.id, changes: body },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(updated);
  },
});

// DELETE /api/clients/[id]/contacts/[contactId] - Deactivate (soft delete)
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const contact = await prisma.clientContact.findUnique({ where: { id: params.contactId } });
    if (!contact) throw ApiError.notFound("Contact not found");
    if (contact.clientId !== params.id) throw ApiError.notFound("Contact not found");

    await prisma.clientContact.update({
      where: { id: params.contactId },
      data: { isActive: false },
    });

    await logAdminAction({
      userId: user.id,
      action: "CONTACT_DELETED",
      details: { contactId: params.contactId, clientId: params.id, contactName: contact.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
