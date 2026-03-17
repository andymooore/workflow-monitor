import type { ExecutionContext, ExecutionResult, PrismaTransaction } from "../types";
import { BaseExecutor } from "./base-executor";

/**
 * Executor for END nodes.
 *
 * END nodes complete immediately but do NOT signal the engine to advance
 * (there are no successors). The engine detects END completion separately and
 * marks the workflow instance as COMPLETED.
 */
export class EndExecutor extends BaseExecutor {
  async activate(
    ctx: ExecutionContext,
    _prisma: PrismaTransaction,
  ): Promise<ExecutionResult> {
    return {
      newStatus: "COMPLETED",
      shouldAdvance: false,
      auditEntries: [
        {
          action: "NODE_COMPLETED",
          details: {
            nodeId: ctx.node.id,
            nodeType: ctx.node.type,
            label: ctx.node.label,
          },
        },
      ],
    };
  }
}
