import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyEmailConnection } from "@/lib/email";

// ---------------------------------------------------------------------------
// GET /api/health
// Liveness + readiness probe for load balancers, Docker, and monitoring.
// Returns 200 if all critical services are reachable, 503 otherwise.
// ---------------------------------------------------------------------------
export async function GET() {
  const checks: Record<
    string,
    { status: "healthy" | "unhealthy" | "disabled"; latencyMs?: number; error?: string }
  > = {};

  // ── Database connectivity ──────────────────────────────────────────────
  const dbStart = Date.now();
  try {
    await prisma.user.findFirst({ select: { id: true } });
    checks.database = { status: "healthy", latencyMs: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: "unhealthy",
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // ── Email transport (non-critical) ─────────────────────────────────────
  const emailConfigured = !!process.env.RESEND_API_KEY;
  if (emailConfigured) {
    const emailStart = Date.now();
    const emailOk = await verifyEmailConnection();
    checks.email = {
      status: emailOk ? "healthy" : "unhealthy",
      latencyMs: Date.now() - emailStart,
    };
  } else {
    checks.email = { status: "disabled" };
  }

  // ── Overall status ────────────────────────────────────────────────────
  // Only critical checks (database) determine overall health.
  const isHealthy = checks.database.status === "healthy";

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
      uptime: Math.floor(process.uptime()),
      checks,
    },
    { status: isHealthy ? 200 : 503 },
  );
}
