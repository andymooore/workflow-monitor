import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GraphNode {
  id: string;
  type: "client" | "project" | "user" | "workflow" | "ministry" | "article";
  label: string;
  metadata: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

// ---------------------------------------------------------------------------
// GET /api/knowledge/graph - Build knowledge graph data
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) throw ApiError.tooManyRequests();

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();

    function addNode(node: GraphNode) {
      if (!nodeIds.has(node.id)) {
        nodeIds.add(node.id);
        nodes.push(node);
      }
    }

    // 1. Fetch top 20 active clients with their ministry
    const clients = await prisma.client.findMany({
      where: { status: "ACTIVE" },
      take: 20,
      orderBy: { name: "asc" },
      include: {
        ministry: { select: { id: true, name: true, shortCode: true } },
      },
    });

    for (const client of clients) {
      addNode({
        id: `client-${client.id}`,
        type: "client",
        label: client.name,
        metadata: {
          shortCode: client.shortCode,
          slaTier: client.slaTier,
          status: client.status,
        },
      });

      // Client -> Ministry
      if (client.ministry) {
        addNode({
          id: `ministry-${client.ministry.id}`,
          type: "ministry",
          label: client.ministry.name,
          metadata: { shortCode: client.ministry.shortCode },
        });
        edges.push({
          source: `client-${client.id}`,
          target: `ministry-${client.ministry.id}`,
          label: "under ministry",
        });
      }
    }

    const clientIds = clients.map((c) => c.id);

    // 2. Fetch projects for these clients
    const projects = await prisma.project.findMany({
      where: { clientId: { in: clientIds }, isActive: true },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
              // Only include active team members
            },
          },
          take: 10, // Limit members per project
        },
      },
    });

    for (const project of projects) {
      addNode({
        id: `project-${project.id}`,
        type: "project",
        label: project.name,
        metadata: {
          status: project.status,
          health: project.health,
        },
      });

      // Client -> Project
      edges.push({
        source: `client-${project.clientId}`,
        target: `project-${project.id}`,
        label: "has project",
      });

      // Project -> Members (Users)
      for (const member of project.members) {
        addNode({
          id: `user-${member.user.id}`,
          type: "user",
          label: member.user.name,
          metadata: {
            email: member.user.email,
            projectRole: member.role,
          },
        });
        edges.push({
          source: `user-${member.user.id}`,
          target: `project-${project.id}`,
          label: "member of",
        });
      }
    }

    const projectIds = projects.map((p) => p.id);

    // 3. Fetch recent workflow instances for these projects (last 10 per project)
    const instances = await prisma.workflowInstance.findMany({
      where: {
        projectId: { in: projectIds },
        status: { in: ["RUNNING", "COMPLETED"] },
      },
      take: 50, // Global limit
      orderBy: { createdAt: "desc" },
      include: {
        template: { select: { id: true, name: true } },
      },
    });

    // Track templates to avoid duplicates
    const templateIds = new Set<string>();

    for (const instance of instances) {
      addNode({
        id: `workflow-${instance.id}`,
        type: "workflow",
        label: instance.title,
        metadata: {
          status: instance.status,
          templateName: instance.template.name,
        },
      });

      // Project -> Instance
      if (instance.projectId) {
        edges.push({
          source: `project-${instance.projectId}`,
          target: `workflow-${instance.id}`,
          label: "runs workflow",
        });
      }

      // Instance -> Template
      if (!templateIds.has(instance.template.id)) {
        templateIds.add(instance.template.id);
      }
      edges.push({
        source: `workflow-${instance.id}`,
        target: `template-${instance.template.id}`,
        label: "uses template",
      });
    }

    // Add template nodes
    if (templateIds.size > 0) {
      const templates = await prisma.workflowTemplate.findMany({
        where: { id: { in: Array.from(templateIds) } },
        select: { id: true, name: true, category: true },
      });
      for (const tmpl of templates) {
        addNode({
          id: `template-${tmpl.id}`,
          type: "workflow",
          label: `[Template] ${tmpl.name}`,
          metadata: { category: tmpl.category, isTemplate: true },
        });
      }
    }

    // 4. Fetch knowledge articles scoped to clients/projects
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        isPublished: true,
        OR: [
          { clientId: { in: clientIds } },
          { projectId: { in: projectIds } },
        ],
      },
      take: 50,
      select: {
        id: true,
        title: true,
        slug: true,
        clientId: true,
        projectId: true,
      },
    });

    for (const article of articles) {
      addNode({
        id: `article-${article.id}`,
        type: "article",
        label: article.title,
        metadata: { slug: article.slug },
      });

      if (article.clientId && nodeIds.has(`client-${article.clientId}`)) {
        edges.push({
          source: `article-${article.id}`,
          target: `client-${article.clientId}`,
          label: "documented in",
        });
      }
      if (article.projectId && nodeIds.has(`project-${article.projectId}`)) {
        edges.push({
          source: `article-${article.id}`,
          target: `project-${article.projectId}`,
          label: "documented in",
        });
      }
    }

    // 5. Fetch user roles for users already in the graph
    const userNodeIds = nodes
      .filter((n) => n.type === "user")
      .map((n) => n.id.replace("user-", ""));

    if (userNodeIds.length > 0) {
      const userRoles = await prisma.userRole.findMany({
        where: { userId: { in: userNodeIds } },
        include: {
          role: { select: { id: true, name: true } },
        },
      });

      const roleSet = new Set<string>();
      for (const ur of userRoles) {
        if (!roleSet.has(ur.role.id)) {
          roleSet.add(ur.role.id);
          addNode({
            id: `role-${ur.role.id}`,
            type: "user",
            label: `[Role] ${ur.role.name}`,
            metadata: { isRole: true },
          });
        }
        edges.push({
          source: `user-${ur.userId}`,
          target: `role-${ur.role.id}`,
          label: "has role",
        });
      }
    }

    return NextResponse.json({ nodes, edges });
  },
});
