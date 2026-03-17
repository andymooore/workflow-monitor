import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";
import { systemSettingsSchema } from "@/lib/validations";

// Default system settings — used when no database record exists yet
const DEFAULT_SETTINGS = {
  defaultSlaDays: 48,
  sessionTimeoutHours: 8,
  auditRetentionDays: 365,
};

const SETTINGS_KEY = "system_settings";

/**
 * Load system settings from the database, falling back to defaults.
 */
async function loadSettings(): Promise<typeof DEFAULT_SETTINGS> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: SETTINGS_KEY },
  });

  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  const stored = row.value as Record<string, unknown>;
  return {
    defaultSlaDays:
      typeof stored.defaultSlaDays === "number"
        ? stored.defaultSlaDays
        : DEFAULT_SETTINGS.defaultSlaDays,
    sessionTimeoutHours:
      typeof stored.sessionTimeoutHours === "number"
        ? stored.sessionTimeoutHours
        : DEFAULT_SETTINGS.sessionTimeoutHours,
    auditRetentionDays:
      typeof stored.auditRetentionDays === "number"
        ? stored.auditRetentionDays
        : DEFAULT_SETTINGS.auditRetentionDays,
  };
}

export const GET = withAdminAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const settings = await loadSettings();
    return NextResponse.json(settings);
  },
});

export const PUT = withAdminAuth({
  schema: systemSettingsSchema,
  handler: async (request, { user, body }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const previous = await loadSettings();

    const updated = {
      defaultSlaDays: body.defaultSlaDays ?? previous.defaultSlaDays,
      sessionTimeoutHours: body.sessionTimeoutHours ?? previous.sessionTimeoutHours,
      auditRetentionDays: body.auditRetentionDays ?? previous.auditRetentionDays,
    };

    await prisma.systemConfig.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: updated as object },
      create: { key: SETTINGS_KEY, value: updated as object },
    });

    await logAdminAction({
      userId: user.id,
      action: "SYSTEM_SETTINGS_UPDATED",
      details: { previous, updated },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(updated);
  },
});
