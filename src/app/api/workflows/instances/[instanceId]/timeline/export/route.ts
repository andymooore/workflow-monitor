import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// GET /api/workflows/instances/[instanceId]/timeline/export
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId } = params;

    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, title: true },
    });

    if (!instance) {
      throw ApiError.notFound("Instance not found");
    }

    const logs = await prisma.auditLog.findMany({
      where: { instanceId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    const headers = ["Timestamp", "Action", "User", "Email", "Details"];
    const rows = logs.map((log) => [
      log.createdAt.toISOString(),
      log.action,
      `"${log.user.name.replace(/"/g, '""')}"`,
      log.user.email,
      `"${JSON.stringify(log.details).replace(/"/g, '""')}"`,
    ].join(","));

    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${instanceId.slice(0, 8)}-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  },
});
