import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// POST /api/cron/retention
// Data retention cleanup. Triggered by external cron (daily recommended).
// Protected by CRON_SECRET.
//
// Default retention periods:
//   - Read notifications:  30 days
//   - Completed instances audit logs: 2 years
//   - Webhook deliveries:  90 days
//   - Expired delegations: 90 days
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // Verify cron secret — reject if not configured or mismatched
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !cronSecret.trim()) {
    logger.error("CRON_SECRET is not configured — rejecting cron request");
    return NextResponse.json(
      { error: "Cron endpoint is not configured" },
      { status: 401 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results: Record<string, number> = {};

  try {
    // 1. Delete read notifications older than 30 days
    const notifCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const deletedNotifs = await prisma.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: { lt: notifCutoff },
      },
    });
    results.readNotifications = deletedNotifs.count;

    // 2. Delete webhook deliveries older than 90 days
    const webhookCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const deletedDeliveries = await prisma.webhookDelivery.deleteMany({
      where: {
        createdAt: { lt: webhookCutoff },
      },
    });
    results.webhookDeliveries = deletedDeliveries.count;

    // 3. Clean up expired delegations (mark inactive)
    const expiredDelegations = await prisma.delegation.updateMany({
      where: {
        isActive: true,
        endDate: { lt: now },
      },
      data: { isActive: false },
    });
    results.expiredDelegations = expiredDelegations.count;

    // 4. Delete old inactive delegations (90+ days past end date)
    const delegationCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const deletedDelegations = await prisma.delegation.deleteMany({
      where: {
        isActive: false,
        endDate: { lt: delegationCutoff },
      },
    });
    results.oldDelegations = deletedDelegations.count;

    logger.info("Data retention cleanup completed", results);
    return NextResponse.json({ success: true, cleaned: results });
  } catch (error) {
    logger.error("Data retention cleanup failed", error);
    return NextResponse.json(
      { error: "Retention cleanup failed" },
      { status: 500 },
    );
  }
}
