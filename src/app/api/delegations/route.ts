import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";

const createDelegationSchema = z.object({
  delegateId: z.string().min(1, "Delegate user is required"),
  startDate: z.string().datetime("Start date must be a valid ISO date"),
  endDate: z.string().datetime("End date must be a valid ISO date"),
  reason: z.string().max(500).optional().nullable(),
});

// GET /api/delegations - List active delegations for current user
export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const [given, received] = await Promise.all([
      prisma.delegation.findMany({
        where: { delegatorId: user.id, isActive: true },
        include: { delegate: { select: { id: true, name: true, email: true } } },
        orderBy: { startDate: "desc" },
      }),
      prisma.delegation.findMany({
        where: { delegateId: user.id, isActive: true },
        include: { delegator: { select: { id: true, name: true, email: true } } },
        orderBy: { startDate: "desc" },
      }),
    ]);

    return NextResponse.json({ given, received });
  },
});

// POST /api/delegations - Create a new delegation
export const POST = withAuth({
  schema: createDelegationSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    if (body.delegateId === user.id) {
      throw ApiError.badRequest("Cannot delegate to yourself");
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (endDate <= startDate) {
      throw ApiError.badRequest("End date must be after start date");
    }

    // Verify delegate exists and is active
    const delegate = await prisma.user.findUnique({
      where: { id: body.delegateId },
      select: { id: true, status: true },
    });
    if (!delegate || delegate.status !== "ACTIVE") {
      throw ApiError.badRequest("Delegate user not found or inactive");
    }

    // Check for overlapping active delegations
    const overlap = await prisma.delegation.findFirst({
      where: {
        delegatorId: user.id,
        isActive: true,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap) {
      throw ApiError.conflict("An active delegation already exists for this period");
    }

    const delegation = await prisma.delegation.create({
      data: {
        delegatorId: user.id,
        delegateId: body.delegateId,
        startDate,
        endDate,
        reason: body.reason ?? null,
      },
      include: {
        delegate: { select: { id: true, name: true, email: true } },
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "DELEGATION_CREATED",
      details: {
        delegationId: delegation.id,
        delegateId: body.delegateId,
        startDate: body.startDate,
        endDate: body.endDate,
      },
      ipAddress: ip,
    });

    return NextResponse.json(delegation, { status: 201 });
  },
});
