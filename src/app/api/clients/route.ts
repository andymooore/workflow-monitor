import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { createClientSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";

// GET /api/clients - List clients (all authenticated users can read)
export const GET = withAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get("status");
    const search = searchParams.get("search");
    const ministryId = searchParams.get("ministryId");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    const where: Record<string, unknown> = {};
    if (statusFilter) where.status = statusFilter;
    else where.status = "ACTIVE"; // default to active only
    if (ministryId) where.ministryId = ministryId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { shortCode: { contains: search, mode: "insensitive" } },
      ];
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
        include: {
          ministry: { select: { id: true, name: true, shortCode: true } },
          _count: { select: { projects: true, instances: true, contacts: true } },
        },
      }),
      prisma.client.count({ where }),
    ]);

    return NextResponse.json({ data: clients, total, limit, offset, hasMore: offset + limit < total });
  },
});

// POST /api/clients - Create client (admin only)
export const POST = withAdminAuth({
  schema: createClientSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    // Check uniqueness
    const existingName = await prisma.client.findUnique({ where: { name: body.name } });
    if (existingName) throw ApiError.conflict("A client with this name already exists");

    const existingCode = await prisma.client.findUnique({ where: { shortCode: body.shortCode } });
    if (existingCode) throw ApiError.conflict("A client with this short code already exists");

    if (body.referenceNumber) {
      const existingRef = await prisma.client.findUnique({ where: { referenceNumber: body.referenceNumber } });
      if (existingRef) throw ApiError.conflict("A client with this reference number already exists");
    }

    const client = await prisma.client.create({
      data: {
        name: body.name,
        shortCode: body.shortCode,
        description: body.description ?? null,
        website: body.website ?? null,
        ministryId: body.ministryId ?? null,
        referenceNumber: body.referenceNumber ?? null,
        slaTier: body.slaTier ?? "BRONZE",
        addressStreet: body.addressStreet ?? null,
        addressCity: body.addressCity ?? null,
        addressParish: body.addressParish ?? null,
        hasSignedAgreement: body.hasSignedAgreement ?? false,
        agreementDate: body.agreementDate ? new Date(body.agreementDate) : null,
        agreementReference: body.agreementReference ?? null,
      },
      include: {
        ministry: { select: { id: true, name: true, shortCode: true } },
        _count: { select: { projects: true, instances: true, contacts: true } },
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "CLIENT_CREATED",
      details: { clientId: client.id, name: client.name, shortCode: client.shortCode },
      ipAddress: getClientIp(request),
    });

    // Fire-and-forget activity recording
    recordActivity({
      userId: user.id,
      type: "CLIENT_CREATED",
      title: `Created client "${client.name}"`,
      description: client.description ?? undefined,
      clientId: client.id,
      metadata: { shortCode: client.shortCode, slaTier: client.slaTier },
    }).catch(() => {});

    return NextResponse.json(client, { status: 201 });
  },
});
