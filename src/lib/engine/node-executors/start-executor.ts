import type { ExecutionContext, ExecutionResult, PrismaTransaction } from "../types";
import { BaseExecutor } from "./base-executor";

/**
 * Executor for START nodes.
 *
 * START nodes complete immediately upon activation and signal the engine to
 * advance to successor nodes.
 */
export class StartExecutor extends BaseExecutor {
  async activate(
    ctx: ExecutionContext,
    _prisma: PrismaTransaction,
  ): Promise<ExecutionResult> {
    return {
      newStatus: "COMPLETED",
      shouldAdvance: true,
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
