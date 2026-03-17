import { prisma } from "@/lib/db";
import type { AuditAction } from "@/generated/prisma/client";

/**
 * Log an admin/system operation to the audit trail.
 * Unlike workflow audit entries (which are tied to an instance),
 * admin audit entries have instanceId=null.
 */
export async function logAdminAction(params: {
  userId: string;
  action: AuditAction;
  details: Record<string, unknown>;
  ipAddress?: string | null;
  instanceId?: string;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      details: params.details as object,
      ipAddress: params.ipAddress ?? null,
      instanceId: params.instanceId ?? null,
    },
  });
}
