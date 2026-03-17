import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { createContactSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// GET /api/clients/[id]/contacts - List contacts for a client
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const client = await prisma.client.findUnique({ where: { id: params.id } });
    if (!client) throw ApiError.notFound("Client not found");

    const { searchParams } = request.nextUrl;
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Record<string, unknown> = { clientId: params.id };
    if (!includeInactive) where.isActive = true;

    const contacts = await prisma.clientContact.findMany({
      where,
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(contacts);
  },
});

// POST /api/clients/[id]/contacts - Create contact (admin only)
export const POST = withAdminAuth({
  schema: createContactSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const client = await prisma.client.findUnique({ where: { id: params.id } });
    if (!client) throw ApiError.notFound("Client not found");

    // If isPrimary is true, unset isPrimary on all other contacts for this client in a transaction
    const contact = await prisma.$transaction(async (tx) => {
      if (body.isPrimary) {
        await tx.clientContact.updateMany({
          where: { clientId: params.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.clientContact.create({
        data: {
          clientId: params.id,
          name: body.name,
          email: body.email,
          phone: body.phone ?? null,
          title: body.title ?? null,
          department: body.department ?? null,
          role: body.role,
          isPrimary: body.isPrimary ?? false,
          notes: body.notes ?? null,
        },
      });
    });

    await logAdminAction({
      userId: user.id,
      action: "CONTACT_CREATED",
      details: { contactId: contact.id, clientId: params.id, name: contact.name, email: contact.email },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(contact, { status: 201 });
  },
});
