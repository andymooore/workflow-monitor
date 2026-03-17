import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import { randomBytes } from "crypto";

const VALID_EVENTS = [
  "WORKFLOW_STARTED", "WORKFLOW_COMPLETED", "WORKFLOW_CANCELLED",
  "TASK_ASSIGNED", "TASK_COMPLETED", "APPROVAL_DECISION", "SLA_BREACHED",
] as const;

const createWebhookSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url("Must be a valid URL").max(1000),
  events: z.array(z.enum(VALID_EVENTS)).min(1, "At least one event is required"),
  generateSecret: z.boolean().optional().default(true),
});

// GET /api/webhooks - List all webhooks (admin only)
export const GET = withAdminAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const webhooks = await prisma.webhook.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { deliveries: true } },
      },
    });

    // Mask secrets in response
    const masked = webhooks.map((w) => ({
      ...w,
      secret: w.secret ? `${w.secret.slice(0, 8)}...` : null,
    }));

    return NextResponse.json(masked);
  },
});

// POST /api/webhooks - Register a new webhook (admin only)
export const POST = withAdminAuth({
  schema: createWebhookSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const secret = body.generateSecret
      ? `whsec_${randomBytes(24).toString("hex")}`
      : null;

    const webhook = await prisma.webhook.create({
      data: {
        name: body.name,
        url: body.url,
        events: body.events,
        secret,
        createdById: user.id,
      },
    });

    // Return webhook with masked secret (show full only this once via separate header)
    return NextResponse.json(
      {
        ...webhook,
        secret: webhook.secret ? `${webhook.secret.slice(0, 12)}...` : null,
        // The full secret is in the X-Webhook-Secret header — save it now, it won't be shown again
      },
      {
        status: 201,
        headers: webhook.secret
          ? {
              "X-Webhook-Secret": webhook.secret,
              "Cache-Control": "no-store, no-cache",
            }
          : { "Cache-Control": "no-store, no-cache" },
      },
    );
  },
});
