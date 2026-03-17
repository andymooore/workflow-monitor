// ---------------------------------------------------------------------------
// Webhook delivery system with retry logic and dead letter queue.
// Fires registered webhooks for workflow events. Failed deliveries are
// retried with exponential backoff up to 5 times before being moved to
// a dead letter state.
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { logger } from "./logger";
import type { WebhookEvent, DeliveryStatus } from "@/generated/prisma/client";
import { createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of retry attempts before moving to dead letter. */
const MAX_RETRIES = 5;

/**
 * Exponential backoff schedule (in milliseconds).
 * Attempt 1: 1 min, 2: 5 min, 3: 15 min, 4: 1 hr, 5: 4 hr.
 */
const RETRY_DELAYS_MS: readonly number[] = [
  1 * 60 * 1000,       // 1 minute
  5 * 60 * 1000,       // 5 minutes
  15 * 60 * 1000,      // 15 minutes
  60 * 60 * 1000,      // 1 hour
  4 * 60 * 60 * 1000,  // 4 hours
] as const;

/** HTTP timeout for each delivery attempt (10 seconds). */
const DELIVERY_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

interface RetryResult {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fire all registered webhooks for a given event.
 * Non-blocking — logs failures but never throws.
 */
export async function fireWebhooks(
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: {
        isActive: true,
        events: { has: event },
      },
    });

    if (webhooks.length === 0) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const body = JSON.stringify(payload);

    for (const webhook of webhooks) {
      // Create delivery record first, then attempt delivery
      createAndDeliverWebhook(webhook.id, webhook.url, webhook.secret, event, body).catch(
        (err) => logger.error("Webhook delivery failed", err, { webhookId: webhook.id }),
      );
    }
  } catch (error) {
    logger.error("Failed to query webhooks", error);
  }
}

/**
 * Process webhook retries — called by the cron job.
 * Finds all failed deliveries whose nextRetryAt has passed and re-attempts
 * delivery. Deliveries that exhaust all retries are moved to DEAD_LETTER.
 */
export async function processWebhookRetries(): Promise<RetryResult> {
  const now = new Date();
  const result: RetryResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
  };

  try {
    // Find deliveries due for retry
    const pendingRetries = await prisma.webhookDelivery.findMany({
      where: {
        status: "FAILED" as DeliveryStatus,
        attempts: { lt: MAX_RETRIES },
        nextRetryAt: { lte: now },
      },
      include: {
        webhook: true,
      },
      // Process in batches to avoid overwhelming downstream services
      take: 100,
      orderBy: { nextRetryAt: "asc" },
    });

    if (pendingRetries.length === 0) {
      logger.debug("No webhook retries pending");
      return result;
    }

    logger.info("Processing webhook retries", { count: pendingRetries.length });

    for (const delivery of pendingRetries) {
      result.processed++;

      // Skip if the parent webhook has been deactivated or deleted
      if (!delivery.webhook || !delivery.webhook.isActive) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "DEAD_LETTER" as DeliveryStatus,
            lastError: "Webhook deactivated or deleted — moved to dead letter",
            lastAttemptAt: now,
            nextRetryAt: null,
          },
        });
        result.deadLettered++;
        logger.warn("Webhook deactivated, delivery moved to dead letter", {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
        });
        continue;
      }

      const body = JSON.stringify(delivery.payload);
      const attemptNumber = delivery.attempts + 1;

      const { success, statusCode, response, error } = await attemptDelivery(
        delivery.webhook.url,
        delivery.webhook.secret,
        delivery.event,
        body,
      );

      if (success) {
        // Delivery succeeded
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            success: true,
            status: "SUCCESS" as DeliveryStatus,
            statusCode,
            response: response?.slice(0, 1000) ?? null,
            attempts: attemptNumber,
            lastAttemptAt: now,
            nextRetryAt: null,
            lastError: null,
          },
        });
        result.succeeded++;
        logger.info("Webhook retry succeeded", {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
          attempt: attemptNumber,
        });
      } else if (attemptNumber >= MAX_RETRIES) {
        // Max retries exhausted — dead letter
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "DEAD_LETTER" as DeliveryStatus,
            statusCode,
            response: response?.slice(0, 1000) ?? null,
            attempts: attemptNumber,
            lastAttemptAt: now,
            nextRetryAt: null,
            lastError: error ?? `HTTP ${statusCode ?? "unknown"}`,
          },
        });
        result.deadLettered++;
        logger.warn("Webhook delivery exhausted all retries, moved to dead letter", {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
          url: delivery.webhook.url,
          attempts: attemptNumber,
          lastError: error,
        });
      } else {
        // Schedule next retry with exponential backoff
        const nextDelay = getRetryDelay(attemptNumber);
        const nextRetryAt = new Date(now.getTime() + nextDelay);

        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "FAILED" as DeliveryStatus,
            statusCode,
            response: response?.slice(0, 1000) ?? null,
            attempts: attemptNumber,
            lastAttemptAt: now,
            nextRetryAt,
            lastError: error ?? `HTTP ${statusCode ?? "unknown"}`,
          },
        });
        result.failed++;
        logger.info("Webhook retry failed, scheduling next attempt", {
          deliveryId: delivery.id,
          webhookId: delivery.webhookId,
          attempt: attemptNumber,
          nextRetryAt: nextRetryAt.toISOString(),
        });
      }
    }

    logger.info("Webhook retry processing complete", result as unknown as Record<string, unknown>);
  } catch (error) {
    logger.error("Failed to process webhook retries", error);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Create a delivery record and attempt first delivery.
 * On failure, the record is marked FAILED with a scheduled retry.
 */
async function createAndDeliverWebhook(
  webhookId: string,
  url: string,
  secret: string | null,
  event: WebhookEvent,
  body: string,
): Promise<void> {
  const now = new Date();
  const { success, statusCode, response, error } = await attemptDelivery(
    url,
    secret,
    event,
    body,
  );

  if (success) {
    // Record successful delivery
    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload: JSON.parse(body),
        statusCode,
        response: response?.slice(0, 1000) ?? null,
        success: true,
        status: "SUCCESS" as DeliveryStatus,
        attempts: 1,
        lastAttemptAt: now,
        nextRetryAt: null,
        lastError: null,
      },
    }).catch((err) => logger.error("Failed to record webhook delivery", err));
  } else {
    // Record failed delivery with first retry scheduled
    const nextRetryAt = new Date(now.getTime() + getRetryDelay(1));

    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload: JSON.parse(body),
        statusCode,
        response: response?.slice(0, 1000) ?? null,
        success: false,
        status: "FAILED" as DeliveryStatus,
        attempts: 1,
        lastAttemptAt: now,
        nextRetryAt,
        lastError: error ?? `HTTP ${statusCode ?? "unknown"}`,
      },
    }).catch((err) => logger.error("Failed to record webhook delivery", err));

    logger.warn("Webhook initial delivery failed, retry scheduled", {
      webhookId,
      url,
      error: error ?? `HTTP ${statusCode}`,
      nextRetryAt: nextRetryAt.toISOString(),
    });
  }
}

/**
 * Attempt a single HTTP delivery to the webhook URL.
 * Returns structured result — never throws.
 */
async function attemptDelivery(
  url: string,
  secret: string | null,
  event: WebhookEvent,
  body: string,
): Promise<{
  success: boolean;
  statusCode: number | null;
  response: string | null;
  error: string | null;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Event": event,
  };

  // Sign payload with HMAC-SHA256 if secret is configured
  if (secret) {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Webhook-Signature"] = `sha256=${signature}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const statusCode = res.status;
    const responseText = await res.text().catch(() => null);

    return {
      success: res.ok,
      statusCode,
      response: responseText,
      error: res.ok ? null : `HTTP ${statusCode}`,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      statusCode: null,
      response: null,
      error: errorMessage,
    };
  }
}

/**
 * Get the retry delay for a given attempt number (1-indexed).
 * Uses the exponential backoff schedule defined in RETRY_DELAYS_MS.
 * For attempts beyond the schedule length, uses the last delay value.
 */
function getRetryDelay(attemptNumber: number): number {
  const index = Math.min(attemptNumber - 1, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
}
