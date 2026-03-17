// ---------------------------------------------------------------------------
// SLA Breach Detection & Escalation
// Called by /api/cron/sla-check (should be triggered every 15 minutes)
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { createNotification } from "./notifications";
import { logger } from "./logger";

/**
 * Check for overdue tasks and approvals, create escalation notifications.
 * Returns the count of newly escalated items.
 */
export async function checkSlaBreaches(): Promise<{ escalated: number }> {
  const now = new Date();
  let escalated = 0;

  // Find all overdue task instances that are still IN_PROGRESS
  const overdueTasks = await prisma.taskInstance.findMany({
    where: {
      status: "IN_PROGRESS",
      dueDate: { lt: now },
      instance: { status: "RUNNING" },
    },
    include: {
      node: true,
      assignee: { select: { id: true, name: true } },
      instance: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          client: { select: { slaTier: true } },
        },
      },
    },
  });

  for (const task of overdueTasks) {
    // Check if we already sent an SLA breach notification for this task
    const existingNotif = await prisma.notification.findFirst({
      where: {
        instanceId: task.instanceId,
        type: "SLA_BREACH",
        message: { contains: task.id },
      },
    });

    if (existingNotif) continue; // Already notified

    const hoursOverdue = Math.round(
      (now.getTime() - task.dueDate!.getTime()) / (1000 * 60 * 60),
    );

    // Notify the assignee
    if (task.assigneeId) {
      await createNotification({
        userId: task.assigneeId,
        type: "SLA_BREACH",
        title: "Task overdue",
        message: `"${task.node.label}" is ${hoursOverdue}h overdue (${task.id})`,
        instanceId: task.instanceId,
      });
    }

    // Escalate to instance owner (manager)
    if (task.instance.ownerId !== task.assigneeId) {
      await createNotification({
        userId: task.instance.ownerId,
        type: "TASK_ESCALATED",
        title: "Overdue task escalation",
        message: `"${task.node.label}" in "${task.instance.title}" is ${hoursOverdue}h overdue. Assigned to ${task.assignee?.name ?? "unassigned"}. (${task.id})`,
        instanceId: task.instanceId,
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        instanceId: task.instanceId,
        userId: "SYSTEM",
        action: "SLA_BREACHED",
        details: {
          taskInstanceId: task.id,
          nodeLabel: task.node.label,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          hoursOverdue,
          slaTier: task.instance.client?.slaTier ?? "UNKNOWN",
        },
      },
    });

    escalated++;
    logger.warn("SLA breach detected", {
      taskId: task.id,
      instanceId: task.instanceId,
      nodeLabel: task.node.label,
      hoursOverdue,
    });
  }

  return { escalated };
}
