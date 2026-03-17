import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { updateClientSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";

// GET /api/clients/[id]
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const client = await prisma.client.findUnique({
      where: { id: params.id },
      include: {
        ministry: { select: { id: true, name: true, shortCode: true } },
        contacts: {
          where: { isActive: true },
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        },
        projects: { where: { isActive: true }, orderBy: { name: "asc" } },
        _count: {
          select: {
            projects: true,
            instances: true,
            contacts: true,
          },
        },
      },
    });

    if (!client) throw ApiError.notFound("Client not found");
    return NextResponse.json(client);
  },
});

// PUT /api/clients/[id]
export const PUT = withAdminAuth({
  schema: updateClientSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const existing = await prisma.client.findUnique({ where: { id: params.id } });
    if (!existing) throw ApiError.notFound("Client not found");

    if (body.name && body.name !== existing.name) {
      const dup = await prisma.client.findUnique({ where: { name: body.name } });
      if (dup) throw ApiError.conflict("A client with this name already exists");
    }
    if (body.shortCode && body.shortCode !== existing.shortCode) {
      const dup = await prisma.client.findUnique({ where: { shortCode: body.shortCode } });
      if (dup) throw ApiError.conflict("A client with this short code already exists");
    }
    if (body.referenceNumber && body.referenceNumber !== existing.referenceNumber) {
      const dup = await prisma.client.findUnique({ where: { referenceNumber: body.referenceNumber } });
      if (dup) throw ApiError.conflict("A client with this reference number already exists");
    }

    const updated = await prisma.client.update({
      where: { id: params.id },
      data: {
        name: body.name ?? existing.name,
        shortCode: body.shortCode ?? existing.shortCode,
        description: body.description !== undefined ? body.description : existing.description,
        website: body.website !== undefined ? body.website : existing.website,
        status: body.status ?? existing.status,
        ministryId: body.ministryId !== undefined ? body.ministryId : existing.ministryId,
        referenceNumber: body.referenceNumber !== undefined ? body.referenceNumber : existing.referenceNumber,
        slaTier: body.slaTier ?? existing.slaTier,
        addressStreet: body.addressStreet !== undefined ? body.addressStreet : existing.addressStreet,
        addressCity: body.addressCity !== undefined ? body.addressCity : existing.addressCity,
        addressParish: body.addressParish !== undefined ? body.addressParish : existing.addressParish,
        hasSignedAgreement: body.hasSignedAgreement ?? existing.hasSignedAgreement,
        agreementDate: body.agreementDate !== undefined ? (body.agreementDate ? new Date(body.agreementDate) : null) : existing.agreementDate,
        agreementReference: body.agreementReference !== undefined ? body.agreementReference : existing.agreementReference,
      },
      include: {
        ministry: { select: { id: true, name: true, shortCode: true } },
        _count: { select: { projects: true, instances: true, contacts: true } },
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "CLIENT_UPDATED",
      details: { clientId: params.id, changes: body },
      ipAddress: getClientIp(request),
    });

    // Fire-and-forget activity recording
    recordActivity({
      userId: user.id,
      type: "CLIENT_UPDATED",
      title: `Updated client "${updated.name}"`,
      clientId: params.id,
      metadata: { changes: Object.keys(body) },
    }).catch(() => {});

    return NextResponse.json(updated);
  },
});

// DELETE /api/clients/[id] - Archives the client
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const client = await prisma.client.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { instances: { where: { status: "RUNNING" } } } },
      },
    });

    if (!client) throw ApiError.notFound("Client not found");
    if (client._count.instances > 0) {
      throw ApiError.conflict(`Cannot archive "${client.name}" — it has ${client._count.instances} running workflow(s)`);
    }

    await prisma.client.update({
      where: { id: params.id },
      data: { status: "ARCHIVED" },
    });

    await logAdminAction({
      userId: user.id,
      action: "CLIENT_DELETED",
      details: { clientId: params.id, clientName: client.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
