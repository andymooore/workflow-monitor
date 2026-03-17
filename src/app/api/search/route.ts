import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// GET /api/search?q=<term>
// Global search across workflows, instances, users, and clients.
// Returns categorized results (max 5 per category).
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { user }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const isAdmin = user.roles.includes("admin");
    const containsFilter = { contains: q, mode: "insensitive" as const };

    // Run all queries in parallel
    const [templates, instances, users, clients] = await Promise.all([
      // Workflow templates
      prisma.workflowTemplate.findMany({
        where: {
          isPublished: true,
          OR: [
            { name: containsFilter },
            { description: containsFilter },
          ],
        },
        select: { id: true, name: true, description: true },
        take: 5,
      }),

      // Workflow instances (only those the user can access)
      prisma.workflowInstance.findMany({
        where: {
          OR: [
            { title: containsFilter },
            { template: { name: containsFilter } },
          ],
          ...(isAdmin
            ? {}
            : {
                AND: {
                  OR: [
                    { ownerId: user.id },
                    { taskInstances: { some: { assigneeId: user.id } } },
                  ],
                },
              }),
        },
        select: {
          id: true,
          title: true,
          status: true,
          template: { select: { name: true } },
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),

      // Users (admin-only search)
      isAdmin
        ? prisma.user.findMany({
            where: {
              OR: [
                { name: containsFilter },
                { email: containsFilter },
              ],
            },
            select: { id: true, name: true, email: true },
            take: 5,
          })
        : [],

      // Clients
      prisma.client.findMany({
        where: {
          OR: [
            { name: containsFilter },
            { shortCode: containsFilter },
          ],
        },
        select: { id: true, name: true, shortCode: true },
        take: 5,
      }),
    ]);

    const results = [
      ...templates.map((t) => ({
        type: "workflow" as const,
        title: t.name,
        description: t.description?.slice(0, 100) ?? null,
        url: `/workflows/${t.id}`,
      })),
      ...instances.map((i) => ({
        type: "instance" as const,
        title: i.title,
        description: `${i.template.name} · ${i.status}`,
        url: `/instances/${i.id}`,
      })),
      ...users.map((u) => ({
        type: "user" as const,
        title: u.name,
        description: u.email,
        url: `/admin/users`,
      })),
      ...clients.map((c) => ({
        type: "client" as const,
        title: c.name,
        description: c.shortCode,
        url: `/admin/clients/${c.id}`,
      })),
    ];

    return NextResponse.json({ results });
  },
});
