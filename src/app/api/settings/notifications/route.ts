import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import type { NotificationType } from "@/generated/prisma/client";

// All valid notification types for validation
const VALID_NOTIFICATION_TYPES: NotificationType[] = [
  "TASK_ASSIGNED",
  "APPROVAL_REQUESTED",
  "APPROVAL_DECISION",
  "TASK_COMPLETED",
  "WORKFLOW_COMPLETED",
  "WORKFLOW_CANCELLED",
  "COMMENT_ADDED",
  "SLA_BREACH",
  "TASK_ESCALATED",
];

export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const preferences = await prisma.notificationPreference.findMany({
      where: { userId: user.id },
      select: { type: true, email: true, inApp: true },
    });

    // Build a complete map with defaults for missing types
    const prefsMap: Record<string, { email: boolean; inApp: boolean }> = {};
    for (const type of VALID_NOTIFICATION_TYPES) {
      prefsMap[type] = { email: true, inApp: true };
    }
    for (const pref of preferences) {
      prefsMap[pref.type] = { email: pref.email, inApp: pref.inApp };
    }

    return NextResponse.json({ preferences: prefsMap });
  },
});

export const PUT = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw ApiError.badRequest("Invalid JSON");
    }

    const parsed = body as Record<string, unknown>;
    if (!parsed.preferences || typeof parsed.preferences !== "object") {
      throw ApiError.badRequest("preferences object required");
    }

    const preferences = parsed.preferences as Record<
      string,
      { email?: boolean; inApp?: boolean } | boolean
    >;

    // Upsert each preference
    const upserts = [];
    for (const [type, value] of Object.entries(preferences)) {
      if (!VALID_NOTIFICATION_TYPES.includes(type as NotificationType)) {
        continue;
      }

      // Support both legacy format (boolean) and new format ({ email, inApp })
      let emailEnabled: boolean;
      let inAppEnabled: boolean;

      if (typeof value === "boolean") {
        // Legacy: single boolean controls both channels
        emailEnabled = value;
        inAppEnabled = value;
      } else if (typeof value === "object" && value !== null) {
        emailEnabled = value.email ?? true;
        inAppEnabled = value.inApp ?? true;
      } else {
        continue;
      }

      upserts.push(
        prisma.notificationPreference.upsert({
          where: {
            userId_type: {
              userId: user.id,
              type: type as NotificationType,
            },
          },
          create: {
            userId: user.id,
            type: type as NotificationType,
            email: emailEnabled,
            inApp: inAppEnabled,
          },
          update: {
            email: emailEnabled,
            inApp: inAppEnabled,
          },
        })
      );
    }

    await Promise.all(upserts);

    return NextResponse.json({ success: true });
  },
});
