import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * When a user gains a role, find any running workflow tasks that were assigned
 * to the instance owner as a fallback (because no user with the required role
 * existed at the time) and reassign them to this user.
 *
 * Only reassigns tasks where:
 * - The workflow instance is RUNNING
 * - The task is PENDING or IN_PROGRESS
 * - The task's node has a role assignment matching the new user's role
 * - The current assignee does NOT have the required role (was a fallback)
 */
export async function reassignFallbackTasks(
  userId: string,
  roleIds: string[]
): Promise<number> {
  if (roleIds.length === 0) return 0;

  try {
    // Find task instances on running workflows where:
    // - The node requires one of these roles
    // - The task is still actionable (PENDING or IN_PROGRESS)
    // - There IS an assignee (fallback was used)
    const candidates = await prisma.taskInstance.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        instance: { status: "RUNNING" },
        assigneeId: { not: null },
        node: {
          type: { in: ["TASK", "APPROVAL"] },
          roleAssignments: {
            some: {
              roleId: { in: roleIds },
              assignToOwner: false,
            },
          },
        },
      },
      select: {
        id: true,
        assigneeId: true,
        node: {
          select: {
            id: true,
            label: true,
            roleAssignments: {
              select: { roleId: true },
            },
          },
        },
        instance: {
          select: { ownerId: true },
        },
      },
    });

    let reassigned = 0;

    for (const task of candidates) {
      // Only reassign if the current assignee is the instance owner (fallback)
      if (task.assigneeId !== task.instance.ownerId) continue;

      // Verify the current assignee doesn't actually have the required role
      const nodeRoleIds = task.node.roleAssignments.map((ra) => ra.roleId);
      const ownerHasRole = await prisma.userRole.findFirst({
        where: {
          userId: task.assigneeId!,
          roleId: { in: nodeRoleIds },
        },
        select: { id: true },
      });

      // If the owner legitimately has the role, don't reassign
      if (ownerHasRole) continue;

      // Reassign to the new user
      await prisma.taskInstance.update({
        where: { id: task.id },
        data: { assigneeId: userId },
      });

      reassigned++;
      logger.info("Reassigned fallback task", {
        taskInstanceId: task.id,
        nodeLabel: task.node.label,
        fromUserId: task.assigneeId,
        toUserId: userId,
      });
    }

    // Also reassign pending approvals
    if (reassigned > 0) {
      // Update approval records where the decider was the fallback owner
      const reassignedTaskIds = candidates
        .filter((t) => t.assigneeId === t.instance.ownerId)
        .map((t) => t.id);

      if (reassignedTaskIds.length > 0) {
        await prisma.approval.updateMany({
          where: {
            taskInstanceId: { in: reassignedTaskIds },
            decision: "PENDING",
            deciderId: { not: userId },
          },
          data: { deciderId: userId },
        });
      }
    }

    if (reassigned > 0) {
      logger.info(`Reassigned ${reassigned} fallback task(s) to user ${userId}`);
    }

    return reassigned;
  } catch (error) {
    logger.error("Failed to reassign fallback tasks", error);
    return 0;
  }
}
