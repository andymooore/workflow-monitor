import { NextResponse, type NextRequest } from "next/server";
import { checkSlaBreaches } from "@/lib/sla-escalation";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// POST /api/cron/sla-check
// Triggered by external cron (e.g. Docker healthcheck, Cloudflare Worker, etc.)
// Protected by CRON_SECRET to prevent unauthorized access.
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

  try {
    const result = await checkSlaBreaches();
    logger.info("SLA check completed", { escalated: result.escalated });
    return NextResponse.json(result);
  } catch (error) {
    logger.error("SLA check failed", error);
    return NextResponse.json(
      { error: "SLA check failed" },
      { status: 500 },
    );
  }
}
