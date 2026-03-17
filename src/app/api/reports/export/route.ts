import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { canAccessInstance } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// GET /api/reports/export?instanceId=xxx
// Export a workflow instance as a structured report (HTML for PDF printing).
// Users can print to PDF from the browser using Ctrl+P.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request: NextRequest, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const instanceId = request.nextUrl.searchParams.get("instanceId");
    if (!instanceId) throw ApiError.badRequest("instanceId is required");

    // Verify user has access to this instance
    const hasAccess = await canAccessInstance(user.id, instanceId, user.roles);
    if (!hasAccess) {
      throw ApiError.forbidden("You do not have access to this workflow instance");
    }

    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: {
        template: { select: { name: true, description: true, category: true } },
        owner: { select: { name: true, email: true } },
        client: { select: { name: true, shortCode: true, slaTier: true } },
        project: { select: { name: true } },
        taskInstances: {
          include: {
            node: { select: { label: true, type: true } },
            assignee: { select: { name: true, email: true } },
            approvals: {
              include: {
                decider: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        auditLogs: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
        comments: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!instance) throw ApiError.notFound("Instance not found");

    // Generate print-friendly HTML report
    const html = generateReportHtml(instance);

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="report-${instance.id}.html"`,
      },
    });
  },
});

function generateReportHtml(instance: any): string {
  const tasks = instance.taskInstances ?? [];
  const auditLogs = instance.auditLogs ?? [];
  const comments = instance.comments ?? [];

  const taskRows = tasks
    .filter((t: any) => t.node.type !== "START" && t.node.type !== "CONDITION")
    .map(
      (t: any) => `
    <tr>
      <td>${esc(t.node.label)}</td>
      <td>${t.node.type}</td>
      <td><span class="status status-${t.status.toLowerCase()}">${t.status}</span></td>
      <td>${esc(t.assignee?.name ?? "—")}</td>
      <td>${t.activatedAt ? new Date(t.activatedAt).toLocaleString() : "—"}</td>
      <td>${t.completedAt ? new Date(t.completedAt).toLocaleString() : "—"}</td>
      <td>${t.approvals.map((a: any) => `${esc(a.decider?.name ?? "?")} : ${a.decision}`).join("<br>") || "—"}</td>
    </tr>`,
    )
    .join("");

  const auditRows = auditLogs
    .map(
      (log: any) => `
    <tr>
      <td>${new Date(log.createdAt).toLocaleString()}</td>
      <td>${esc(log.user?.name ?? log.userId)}</td>
      <td>${log.action}</td>
    </tr>`,
    )
    .join("");

  const commentRows = comments
    .map(
      (c: any) => `
    <div class="comment">
      <strong>${esc(c.user?.name ?? "Unknown")}</strong>
      <span class="date">${new Date(c.createdAt).toLocaleString()}</span>
      <p>${esc(c.content)}</p>
    </div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Workflow Report — ${esc(instance.title)}</title>
<style>
  @media print { body { font-size: 11px; } }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; color: #1a1a2e; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-top: 32px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .meta span { margin-right: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
  th { background: #f9fafb; font-weight: 600; }
  .status { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .status-completed, .status-approved { background: #d1fae5; color: #065f46; }
  .status-in_progress { background: #dbeafe; color: #1e40af; }
  .status-rejected { background: #fecaca; color: #991b1b; }
  .status-pending { background: #f3f4f6; color: #6b7280; }
  .status-skipped { background: #f3f4f6; color: #9ca3af; }
  .comment { border-left: 3px solid #e5e7eb; padding: 8px 12px; margin: 8px 0; }
  .comment .date { color: #9ca3af; font-size: 11px; margin-left: 8px; }
  .footer { margin-top: 40px; color: #9ca3af; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
</style>
</head>
<body>
<h1>${esc(instance.title)}</h1>
<div class="meta">
  <span><strong>Template:</strong> ${esc(instance.template.name)}</span>
  <span><strong>Status:</strong> ${instance.status}</span>
  <span><strong>Owner:</strong> ${esc(instance.owner.name)}</span><br>
  <span><strong>Client:</strong> ${esc(instance.client?.name ?? "—")} (${esc(instance.client?.shortCode ?? "")})</span>
  <span><strong>SLA:</strong> ${esc(instance.client?.slaTier ?? "—")}</span>
  <span><strong>Started:</strong> ${instance.startedAt ? new Date(instance.startedAt).toLocaleString() : "—"}</span>
  <span><strong>Completed:</strong> ${instance.completedAt ? new Date(instance.completedAt).toLocaleString() : "—"}</span>
</div>

<h2>Tasks & Approvals</h2>
<table>
<thead><tr><th>Step</th><th>Type</th><th>Status</th><th>Assignee</th><th>Started</th><th>Completed</th><th>Decisions</th></tr></thead>
<tbody>${taskRows || "<tr><td colspan='7'>No tasks</td></tr>"}</tbody>
</table>

${comments.length > 0 ? `<h2>Comments</h2>${commentRows}` : ""}

<h2>Audit Trail</h2>
<table>
<thead><tr><th>Time</th><th>User</th><th>Action</th></tr></thead>
<tbody>${auditRows || "<tr><td colspan='3'>No audit entries</td></tr>"}</tbody>
</table>

<div class="footer">
  Generated ${new Date().toLocaleString()} — WorkFlow Monitor — IT-SEC-002 Compliant
</div>
</body>
</html>`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
