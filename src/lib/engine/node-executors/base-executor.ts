import type { ExecutionContext, ExecutionResult, PrismaTransaction } from "../types";

/**
 * Abstract base class for all node executors.
 *
 * Each node type (START, END, TASK, APPROVAL, CONDITION) provides a concrete
 * implementation that knows how to *activate* the node and how to *handle*
 * user-driven actions on it.
 */
export abstract class BaseExecutor {
  /**
   * Called when a node is being activated (all predecessors are satisfied).
   * Returns the initial status and whether the engine should immediately
   * continue advancing.
   */
  abstract activate(
    ctx: ExecutionContext,
    prisma: PrismaTransaction,
  ): Promise<ExecutionResult>;

  /**
   * Called when a user performs an action on an active node (e.g. completing
   * a task, approving / rejecting an approval gate).
   *
   * The default implementation throws – override in node types that support
   * user actions.
   */
  async handleAction(
    _ctx: ExecutionContext,
    _action: string,
    _payload: Record<string, unknown>,
    _prisma: PrismaTransaction,
  ): Promise<ExecutionResult> {
    throw new Error(
      `handleAction is not supported for this node type`,
    );
  }
}
