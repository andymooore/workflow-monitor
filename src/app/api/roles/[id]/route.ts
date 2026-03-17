import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withAdminAuth, ApiError } from "@/lib/api-utils";
import { updateRoleSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/audit";

// ---------------------------------------------------------------------------
// GET /api/roles/[id]
// Get a single role by ID with user count.
// ---------------------------------------------------------------------------
export const GET = withAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "read")) {
      throw ApiError.tooManyRequests();
    }

    const role = await prisma.role.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { users: true } },
        users: {
          include: {
            user: {
              select: { id: true, name: true, email: true, status: true },
            },
          },
        },
      },
    });

    if (!role) {
      throw ApiError.notFound("Role not found");
    }

    return NextResponse.json(role);
  },
});

// ---------------------------------------------------------------------------
// PUT /api/roles/[id]
// Update a role. Body: { name?, description? }
// ---------------------------------------------------------------------------
export const PUT = withAdminAuth({
  schema: updateRoleSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const existing = await prisma.role.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      throw ApiError.notFound("Role not found");
    }

    // If renaming, check for duplicate
    if (body.name && body.name.trim() !== existing.name) {
      const duplicate = await prisma.role.findUnique({
        where: { name: body.name.trim() },
      });
      if (duplicate) {
        throw ApiError.conflict("A role with that name already exists");
      }
    }

    const role = await prisma.role.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined
          ? { description: body.description?.trim() ?? null }
          : {}),
      },
      include: {
        _count: { select: { users: true } },
      },
    });

    await logAdminAction({
      userId: user.id,
      action: "ROLE_UPDATED",
      details: { roleId: params.id, changes: body },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(role);
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/roles/[id]
// Delete a role if it has no users assigned.
// ---------------------------------------------------------------------------
export const DELETE = withAdminAuth({
  handler: async (request, { user, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const role = await prisma.role.findUnique({
      where: { id: params.id },
      include: { _count: { select: { users: true } } },
    });

    if (!role) {
      throw ApiError.notFound("Role not found");
    }

    if (role._count.users > 0) {
      throw ApiError.conflict(
        `Cannot delete role "${role.name}" — it is assigned to ${role._count.users} user(s). Remove all assignments first.`
      );
    }

    // Check if role is used in any workflow template nodes
    const nodeAssignments = await prisma.workflowNodeRoleAssignment.count({
      where: { roleId: params.id },
    });
    if (nodeAssignments > 0) {
      throw ApiError.conflict(
        `Cannot delete role "${role.name}" — it is configured on ${nodeAssignments} workflow node(s). Remove role from all workflow templates first.`
      );
    }

    await prisma.role.delete({ where: { id: params.id } });

    await logAdminAction({
      userId: user.id,
      action: "ROLE_DELETED",
      details: { roleId: params.id, roleName: role.name },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ message: "Role deleted" });
  },
});
