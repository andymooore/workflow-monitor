import { prisma } from "@/lib/db";
import type { ActivityType } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

/**
 * Record a client/project activity event.
 *
 * This is fire-and-forget by design: errors are logged but never thrown,
 * so callers can safely await or ignore the returned promise without
 * risking request failures.
 */
export async function recordActivity(params: {
  userId: string;
  type: ActivityType;
  title: string;
  description?: string;
  clientId?: string;
  projectId?: string;
  instanceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        description: params.description ?? null,
        clientId: params.clientId ?? null,
        projectId: params.projectId ?? null,
        instanceId: params.instanceId ?? null,
        metadata: params.metadata ? (params.metadata as object) : null,
      },
    });
  } catch (error) {
    // Fire-and-forget: log the error but never throw
    logger.error("Failed to record activity event", error, {
      type: params.type,
      userId: params.userId,
    });
  }
}
