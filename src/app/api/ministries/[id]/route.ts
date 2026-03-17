import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { updateMinistrySchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// GET /api/ministries/[id]
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const ministry = await prisma.ministry.findUnique({
      where: { id: params.id },
      include: {
        clients: {
          where: { status: "ACTIVE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, shortCode: true, status: true },
        },
        _count: { select: { clients: true } },
      },
    });

    if (!ministry) throw ApiError.notFound("Ministry not found");
    return NextResponse.json(ministry);
  },
});

// PUT /api/ministries/[id]
export const PUT = withAdminAuth({
  schema: updateMinistrySchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const existing = await prisma.ministry.findUnique({ where: { id: params.id } });
    if (!existing) throw ApiError.notFound("Ministry not found");

    if (body.name && body.name !== existing.name) {
      const dup = await prisma.ministry.findUnique({ where: { name: body.name } });
      if (dup) throw ApiError.conflict("A ministry with this name already exists");
    }
    if (body.shortCode && body.shortCode !== existing.shortCode) {
      const dup = await prisma.ministry.findUnique({ where: { shortCode: body.shortCode } });
      if (dup) throw ApiError.conflict("A ministry with this short code already exists");
    }

    const updated = await prisma.ministry.update({
      where: { id: params.id },
      data: {
        name: body.name ?? existing.name,
        shortCode: body.shortCode ?? existing.shortCode,
        description: body.description !== undefined ? body.description : existing.description,
        website: body.website !== undefined ? body.website : existing.website,
        headOfEntity: body.headOfEntity !== undefined ? body.headOfEntity : existing.headOfEntity,
        status: body.status ?? existing.status,
      },
      include: { _count: { select: { clients: true } } },
    });

    await logAdminAction({
      userId: user.id,
      action: "MINISTRY_UPDATED",
      details: { ministryId: params.id, changes: body },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(updated);
  },
});

// DELETE /api/ministries/[id] - Archives the ministry
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const ministry = await prisma.ministry.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { clients: { where: { status: "ACTIVE" } } } },
      },
    });

    if (!ministry) throw ApiError.notFound("Ministry not found");
    if (ministry._count.clients > 0) {
      throw ApiError.conflict(`Cannot archive "${ministry.name}" — it has ${ministry._count.clients} active client(s)`);
    }

    await prisma.ministry.update({
      where: { id: params.id },
      data: { status: "ARCHIVED" },
    });

    await logAdminAction({
      userId: user.id,
      action: "MINISTRY_DELETED",
      details: { ministryId: params.id, ministryName: ministry.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  },
});
