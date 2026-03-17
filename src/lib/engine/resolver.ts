import type { WorkflowNode } from "@/generated/prisma/client";
import type { PrismaTransaction } from "./types";

interface RoleAssignment {
  roleId: string;
  assignToOwner: boolean;
}

type NodeWithRoleAssignments = WorkflowNode & {
  roleAssignments: RoleAssignment[];
};

/**
 * Resolves user assignments for workflow nodes based on role configuration.
 * Supports delegation — if a resolved user has an active delegation,
 * the delegate can also act on their behalf.
 */
export class RoleResolver {
  /**
   * Resolve a single assignee for a TASK node.
   */
  async resolveAssignee(
    node: NodeWithRoleAssignments,
    instanceOwnerId: string,
    prisma: PrismaTransaction,
  ): Promise<string> {
    const ownerAssignment = node.roleAssignments.find(
      (ra: RoleAssignment) => ra.assignToOwner,
    );
    if (ownerAssignment) {
      return instanceOwnerId;
    }

    const roleIds = node.roleAssignments.map(
      (ra: RoleAssignment) => ra.roleId,
    );
    if (roleIds.length === 0) {
      throw new Error(
        `RoleResolver: node "${node.label}" (${node.id}) has no role assignments — cannot resolve assignee`,
      );
    }

    const userRole = await prisma.userRole.findFirst({
      where: {
        roleId: { in: roleIds },
        user: { status: "ACTIVE" },
      },
      orderBy: { user: { createdAt: "asc" } },
      select: { userId: true },
    });

    if (!userRole) {
      throw new Error(
        `RoleResolver: no active user found for roles [${roleIds.join(", ")}] on node "${node.label}" (${node.id})`,
      );
    }

    return userRole.userId;
  }

  /**
   * Resolve all approvers for an APPROVAL node.
   * Includes delegates for any approver who has an active delegation.
   */
  async resolveApprovers(
    node: NodeWithRoleAssignments,
    instanceOwnerId: string,
    prisma: PrismaTransaction,
  ): Promise<string[]> {
    const approverIds = new Set<string>();

    const hasOwnerAssignment = node.roleAssignments.some(
      (ra: RoleAssignment) => ra.assignToOwner,
    );
    if (hasOwnerAssignment) {
      approverIds.add(instanceOwnerId);
    }

    const roleIds = node.roleAssignments
      .filter((ra: RoleAssignment) => !ra.assignToOwner)
      .map((ra: RoleAssignment) => ra.roleId);

    if (roleIds.length > 0) {
      const userRoles = await prisma.userRole.findMany({
        where: {
          roleId: { in: roleIds },
          user: { status: "ACTIVE" },
        },
        select: { userId: true },
        distinct: ["userId"],
      });

      for (const ur of userRoles) {
        approverIds.add(ur.userId);
      }
    }

    if (approverIds.size === 0) {
      throw new Error(
        `RoleResolver: no approvers found for node "${node.label}" (${node.id})`,
      );
    }

    // Check for active delegations — include delegates as additional approvers
    const now = new Date();
    const originalApprovers = Array.from(approverIds);

    for (const approverId of originalApprovers) {
      const activeDelegation = await prisma.delegation.findFirst({
        where: {
          delegatorId: approverId,
          isActive: true,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        select: { delegateId: true },
      });

      if (activeDelegation) {
        approverIds.add(activeDelegation.delegateId);
      }
    }

    return Array.from(approverIds);
  }
}
