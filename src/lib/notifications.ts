import { prisma } from "@/lib/db";
import type { NotificationType } from "@/generated/prisma/client";
import {
  sendEmail,
  taskAssignedEmail,
  approvalRequestedEmail,
  approvalDecisionEmail,
  workflowCompletedEmail,
  taskCompletedEmail,
  workflowCancelledEmail,
  commentAddedEmail,
} from "@/lib/email";
import { logger } from "@/lib/logger";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  instanceId?: string;
  link?: string;
}

// ─── Preference helpers ──────────────────────────────────────────────────────

/**
 * Check if a user wants to receive email for a given notification type.
 * Defaults to `true` if no preference exists (opt-out model).
 */
export async function shouldSendEmail(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
      select: { email: true },
    });
    return pref?.email ?? true;
  } catch {
    // On error, default to sending (fail-open for notifications)
    return true;
  }
}

/**
 * Check if a user wants to receive in-app notifications for a given type.
 * Defaults to `true` if no preference exists (opt-out model).
 */
export async function shouldSendInApp(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
      select: { inApp: true },
    });
    return pref?.inApp ?? true;
  } catch {
    return true;
  }
}

/**
 * Batch-check email preferences for multiple users.
 * Returns the subset of userIds that have email enabled for the given type.
 */
async function filterEmailRecipients(
  userIds: string[],
  type: NotificationType,
): Promise<string[]> {
  if (userIds.length === 0) return [];

  try {
    // Find users who explicitly opted out
    const optedOut = await prisma.notificationPreference.findMany({
      where: {
        userId: { in: userIds },
        type,
        email: false,
      },
      select: { userId: true },
    });

    const optedOutIds = new Set(optedOut.map((p) => p.userId));
    return userIds.filter((id) => !optedOutIds.has(id));
  } catch {
    return userIds; // fail-open
  }
}

/**
 * Batch-check in-app preferences for multiple users.
 * Returns the subset of userIds that have in-app enabled for the given type.
 */
async function filterInAppRecipients(
  userIds: string[],
  type: NotificationType,
): Promise<string[]> {
  if (userIds.length === 0) return [];

  try {
    const optedOut = await prisma.notificationPreference.findMany({
      where: {
        userId: { in: userIds },
        type,
        inApp: false,
      },
      select: { userId: true },
    });

    const optedOutIds = new Set(optedOut.map((p) => p.userId));
    return userIds.filter((id) => !optedOutIds.has(id));
  } catch {
    return userIds; // fail-open
  }
}

// ─── Core notification creation (preference-aware) ───────────────────────────

/**
 * Create a single notification for a user, respecting their in-app preference.
 */
export async function createNotification(params: CreateNotificationParams) {
  const shouldNotify = await shouldSendInApp(params.userId, params.type);
  if (!shouldNotify) return null;

  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      instanceId: params.instanceId ?? null,
      link:
        params.link ??
        (params.instanceId ? `/instances/${params.instanceId}` : null),
    },
  });
}

/**
 * Create notifications for multiple users at once, respecting preferences.
 */
export async function createNotifications(
  userIds: string[],
  params: Omit<CreateNotificationParams, "userId">,
) {
  if (userIds.length === 0) return;

  const eligibleIds = await filterInAppRecipients(userIds, params.type);
  if (eligibleIds.length === 0) return;

  const link =
    params.link ??
    (params.instanceId ? `/instances/${params.instanceId}` : null);

  await prisma.notification.createMany({
    data: eligibleIds.map((userId) => ({
      userId,
      type: params.type,
      title: params.title,
      message: params.message,
      instanceId: params.instanceId ?? null,
      link,
    })),
  });
}

// ─── Convenience helpers for each notification type ──────────────────────────

interface NotifyOptions {
  /** Additional user IDs to receive this notification (from per-node routing) */
  additionalRecipientIds?: string[];
  /** If true, suppress email for this event (in-app only) — from node config */
  suppressEmail?: boolean;
}

export async function notifyTaskAssigned(
  assigneeId: string,
  instanceId: string,
  taskLabel: string,
  workflowTitle: string,
  options?: NotifyOptions,
) {
  const allRecipientIds = deduplicateIds([
    assigneeId,
    ...(options?.additionalRecipientIds ?? []),
  ]);

  // In-app notifications (preference-aware)
  await createNotifications(allRecipientIds, {
    type: "TASK_ASSIGNED",
    title: "New task assigned",
    message: `You've been assigned "${taskLabel}" in ${workflowTitle}`,
    instanceId,
  });

  // Email (preference-aware + suppressEmail from node config)
  if (!options?.suppressEmail) {
    const emailRecipients = await filterEmailRecipients(
      allRecipientIds,
      "TASK_ASSIGNED",
    );
    if (emailRecipients.length > 0) {
      resolveUserEmails(emailRecipients)
        .then((emails) => {
          if (emails.length > 0) {
            const instanceUrl = `${baseUrl()}/instances/${instanceId}`;
            const tmpl = taskAssignedEmail(taskLabel, workflowTitle, instanceUrl);
            sendEmail({ to: emails, ...tmpl });
          }
        })
        .catch((e) =>
          logger.error("Email delivery failed (task assigned)", e),
        );
    }
  }
}

export async function notifyApprovalRequested(
  approverIds: string[],
  instanceId: string,
  taskLabel: string,
  workflowTitle: string,
  options?: NotifyOptions,
) {
  const allRecipientIds = deduplicateIds([
    ...approverIds,
    ...(options?.additionalRecipientIds ?? []),
  ]);

  // In-app notifications
  await createNotifications(allRecipientIds, {
    type: "APPROVAL_REQUESTED",
    title: "Approval needed",
    message: `Your approval is requested for "${taskLabel}" in ${workflowTitle}`,
    instanceId,
  });

  // Email
  if (!options?.suppressEmail) {
    const emailRecipients = await filterEmailRecipients(
      allRecipientIds,
      "APPROVAL_REQUESTED",
    );
    if (emailRecipients.length > 0) {
      resolveUserEmails(emailRecipients)
        .then((emails) => {
          if (emails.length > 0) {
            const instanceUrl = `${baseUrl()}/instances/${instanceId}`;
            const tmpl = approvalRequestedEmail(
              taskLabel,
              workflowTitle,
              instanceUrl,
            );
            sendEmail({ to: emails, ...tmpl });
          }
        })
        .catch((e) =>
          logger.error("Email delivery failed (approval requested)", e),
        );
    }
  }
}

export async function notifyApprovalDecision(
  ownerId: string,
  instanceId: string,
  taskLabel: string,
  decision: "APPROVED" | "REJECTED",
  deciderName: string,
  options?: NotifyOptions,
) {
  const verb = decision === "APPROVED" ? "approved" : "rejected";

  const allRecipientIds = deduplicateIds([
    ownerId,
    ...(options?.additionalRecipientIds ?? []),
  ]);

  await createNotifications(allRecipientIds, {
    type: "APPROVAL_DECISION",
    title: `Request ${verb}`,
    message: `${deciderName} ${verb} "${taskLabel}"`,
    instanceId,
  });

  if (!options?.suppressEmail) {
    const emailRecipients = await filterEmailRecipients(
      allRecipientIds,
      "APPROVAL_DECISION",
    );
    if (emailRecipients.length > 0) {
      resolveUserEmails(emailRecipients)
        .then((emails) => {
          if (emails.length > 0) {
            const instanceUrl = `${baseUrl()}/instances/${instanceId}`;
            const tmpl = approvalDecisionEmail(
              taskLabel,
              decision,
              deciderName,
              instanceUrl,
            );
            sendEmail({ to: emails, ...tmpl });
          }
        })
        .catch((e) =>
          logger.error("Email delivery failed (approval decision)", e),
        );
    }
  }
}

export async function notifyTaskCompleted(
  ownerId: string,
  instanceId: string,
  taskLabel: string,
  completedByName: string,
  workflowTitle: string,
  options?: NotifyOptions,
) {
  const allRecipientIds = deduplicateIds([
    ownerId,
    ...(options?.additionalRecipientIds ?? []),
  ]);

  await createNotifications(allRecipientIds, {
    type: "TASK_COMPLETED",
    title: "Task completed",
    message: `${completedByName} completed "${taskLabel}"`,
    instanceId,
  });

  if (!options?.suppressEmail) {
    const emailRecipients = await filterEmailRecipients(
      allRecipientIds,
      "TASK_COMPLETED",
    );
    if (emailRecipients.length > 0) {
      resolveUserEmails(emailRecipients)
        .then((emails) => {
          if (emails.length > 0) {
            const instanceUrl = `${baseUrl()}/instances/${instanceId}`;
            const tmpl = taskCompletedEmail(
              taskLabel,
              completedByName,
              workflowTitle,
              instanceUrl,
            );
            sendEmail({ to: emails, ...tmpl });
          }
        })
        .catch((e) =>
          logger.error("Email delivery failed (task completed)", e),
        );
    }
  }
}

export async function notifyWorkflowCompleted(
  ownerId: string,
  instanceId: string,
  workflowTitle: string,
  options?: NotifyOptions,
) {
  const allRecipientIds = deduplicateIds([
    ownerId,
    ...(options?.additionalRecipientIds ?? []),
  ]);

  await createNotifications(allRecipientIds, {
    type: "WORKFLOW_COMPLETED",
    title: "Workflow completed",
    message: `"${workflowTitle}" has been completed`,
    instanceId,
  });

  if (!options?.suppressEmail) {
    const emailRecipients = await filterEmailRecipients(
      allRecipientIds,
      "WORKFLOW_COMPLETED",
    );
    if (emailRecipients.length > 0) {
      resolveUserEmails(emailRecipients)
        .then((emails) => {
          if (emails.length > 0) {
            const instanceUrl = `${baseUrl()}/instances/${instanceId}`;
            const tmpl = workflowCompletedEmail(workflowTitle, instanceUrl);
            sendEmail({ to: emails, ...tmpl });
          }
        })
        .catch((e) =>
          logger.error("Email delivery failed (workflow completed)", e),
        );
    }
  }
}

export async function notifyWorkflowCancelled(
  ownerId: string,
  instanceId: string,
  workflowTitle: string,
  options?: NotifyOptions,
) {
  const allRecipientIds = deduplicateIds([
    ownerId,
    ...(options?.additionalRecipientIds ?? []),
  ]);

  await createNotifications(allRecipientIds, {
    type: "WORKFLOW_CANCELLED",
    title: "Workflow cancelled",
    message: `"${workflowTitle}" has been cancelled`,
    instanceId,
  });

  if (!options?.suppressEmail) {
    const emailRecipients = await filterEmailRecipients(
      allRecipientIds,
      "WORKFLOW_CANCELLED",
    );
    if (emailRecipients.length > 0) {
      resolveUserEmails(emailRecipients)
        .then((emails) => {
          if (emails.length > 0) {
            const instanceUrl = `${baseUrl()}/instances/${instanceId}`;
            const tmpl = workflowCancelledEmail(workflowTitle, instanceUrl);
            sendEmail({ to: emails, ...tmpl });
          }
        })
        .catch((e) =>
          logger.error("Email delivery failed (workflow cancelled)", e),
        );
    }
  }
}

export async function notifyCommentAdded(
  recipientIds: string[],
  instanceId: string,
  workflowTitle: string,
  commenterName: string,
  options?: NotifyOptions,
) {
  const allRecipientIds = deduplicateIds([
    ...recipientIds,
    ...(options?.additionalRecipientIds ?? []),
  ]);

  await createNotifications(allRecipientIds, {
    type: "COMMENT_ADDED",
    title: "New comment",
    message: `${commenterName} commented on "${workflowTitle}"`,
    instanceId,
  });

  if (!options?.suppressEmail) {
    const emailRecipients = await filterEmailRecipients(
      allRecipientIds,
      "COMMENT_ADDED",
    );
    if (emailRecipients.length > 0) {
      resolveUserEmails(emailRecipients)
        .then((emails) => {
          if (emails.length > 0) {
            const instanceUrl = `${baseUrl()}/instances/${instanceId}`;
            const tmpl = commentAddedEmail(
              commenterName,
              workflowTitle,
              instanceUrl,
            );
            sendEmail({ to: emails, ...tmpl });
          }
        })
        .catch((e) =>
          logger.error("Email delivery failed (comment added)", e),
        );
    }
  }
}

// ─── Email helper utilities ──────────────────────────────────────────────────

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

async function resolveUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? null;
  } catch {
    return null;
  }
}

async function resolveUserEmails(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { email: true },
    });
    return users.map((u) => u.email);
  } catch {
    return [];
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Deduplicate user IDs while preserving order */
function deduplicateIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

// Keep resolveUserEmail exported for any other consumers
export { resolveUserEmail, resolveUserEmails };
