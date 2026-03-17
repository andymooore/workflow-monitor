import { NextResponse, type NextRequest } from "next/server";
import { processWebhookRetries } from "@/lib/webhooks";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// POST /api/cron/webhook-retries
// Processes pending webhook delivery retries with exponential backoff.
// Triggered by external cron (recommended: every 1 minute).
// Protected by CRON_SECRET to prevent unauthorized access.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // Verify cron secret
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

  try {
    const result = await processWebhookRetries();
    logger.info("Webhook retry cron completed", {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      deadLettered: result.deadLettered,
    });
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Webhook retry cron failed", error);
    return NextResponse.json(
      { error: "Webhook retry processing failed" },
      { status: 500 },
    );
  }
}
