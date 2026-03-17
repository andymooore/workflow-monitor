import type { ExecutionContext, ExecutionResult, PrismaTransaction } from "../types";
import { BaseExecutor } from "./base-executor";

/**
 * Executor for TASK nodes.
 *
 * On activation the task enters IN_PROGRESS and waits for a user to
 * explicitly complete it via `handleAction("complete", ...)`.
 */
export class TaskExecutor extends BaseExecutor {
  async activate(
    ctx: ExecutionContext,
    _prisma: PrismaTransaction,
  ): Promise<ExecutionResult> {
    return {
      newStatus: "IN_PROGRESS",
      shouldAdvance: false,
      auditEntries: [
        {
          action: "NODE_ACTIVATED",
          details: {
            nodeId: ctx.node.id,
            nodeType: ctx.node.type,
            label: ctx.node.label,
          },
        },
      ],
    };
  }

  async handleAction(
    ctx: ExecutionContext,
    action: string,
    _payload: Record<string, unknown>,
    _prisma: PrismaTransaction,
  ): Promise<ExecutionResult> {
    if (action !== "complete") {
      throw new Error(`TaskExecutor: unsupported action "${action}"`);
    }

    return {
      newStatus: "COMPLETED",
      shouldAdvance: true,
      auditEntries: [
        {
          action: "TASK_COMPLETED",
          details: {
            nodeId: ctx.node.id,
            nodeType: ctx.node.type,
            label: ctx.node.label,
            taskInstanceId: ctx.taskInstance.id,
          },
        },
      ],
    };
  }
}
