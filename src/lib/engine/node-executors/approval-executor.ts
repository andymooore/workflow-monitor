import type { Approval, ApprovalStrategy } from "@/generated/prisma/client";
import type { ExecutionContext, ExecutionResult, PrismaTransaction } from "../types";
import { BaseExecutor } from "./base-executor";

/**
 * Executor for APPROVAL nodes.
 *
 * On activation the node enters IN_PROGRESS and waits for one or more users
 * to cast their approval decisions. The `handleAction` method re-evaluates
 * the approval gate each time a decision is recorded.
 */
export class ApprovalExecutor extends BaseExecutor {
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
    if (action !== "approve" && action !== "reject") {
      throw new Error(`ApprovalExecutor: unsupported action "${action}"`);
    }

    const config = ctx.node.config as Record<string, unknown> | null;
    const strategy: ApprovalStrategy =
      (config?.approvalStrategy as ApprovalStrategy) ?? "ALL_MUST_APPROVE";

    const result = this.evaluateGate(strategy, ctx.taskInstance.approvals);

    return {
      newStatus: result,
      shouldAdvance: result === "APPROVED" || result === "REJECTED",
      auditEntries:
        result === "APPROVED"
          ? [
              {
                action: "APPROVAL_GRANTED",
                details: {
                  nodeId: ctx.node.id,
                  label: ctx.node.label,
                  strategy,
                  taskInstanceId: ctx.taskInstance.id,
                },
              },
            ]
          : result === "REJECTED"
            ? [
                {
                  action: "APPROVAL_REJECTED",
                  details: {
                    nodeId: ctx.node.id,
                    label: ctx.node.label,
                    strategy,
                    taskInstanceId: ctx.taskInstance.id,
                  },
                },
              ]
            : [],
    };
  }

  /**
   * Evaluate the approval gate given the current set of approval records.
   *
   * Returns:
   * - "APPROVED"    if the gate is fully approved
   * - "REJECTED"    if the gate is definitively rejected
   * - "IN_PROGRESS" if more decisions are still required
   */
  evaluateGate(
    strategy: ApprovalStrategy,
    approvals: Approval[],
  ): "APPROVED" | "REJECTED" | "IN_PROGRESS" {
    if (approvals.length === 0) {
      return "IN_PROGRESS";
    }

    switch (strategy) {
      case "ALL_MUST_APPROVE": {
        // Any single rejection fails the entire gate.
        if (approvals.some((a) => a.decision === "REJECTED")) {
          return "REJECTED";
        }
        // All must have decided APPROVED.
        if (approvals.every((a) => a.decision === "APPROVED")) {
          return "APPROVED";
        }
        return "IN_PROGRESS";
      }

      case "ANY_CAN_APPROVE": {
        // First approval wins; a rejection only matters if everyone rejects.
        if (approvals.some((a) => a.decision === "APPROVED")) {
          return "APPROVED";
        }
        if (approvals.every((a) => a.decision === "REJECTED")) {
          return "REJECTED";
        }
        return "IN_PROGRESS";
      }

      case "SEQUENTIAL": {
        // Approvals must be handled in sequenceOrder.
        const sorted = [...approvals].sort(
          (a, b) => a.sequenceOrder - b.sequenceOrder,
        );

        for (const approval of sorted) {
          if (approval.decision === "REJECTED") {
            return "REJECTED";
          }
          if (approval.decision === "PENDING") {
            // Waiting for this approver in the sequence.
            return "IN_PROGRESS";
          }
          // APPROVED – continue to the next in sequence.
        }

        // All in the sequence approved.
        return "APPROVED";
      }

      default: {
        throw new Error(
          `Unknown approval strategy: ${strategy as string}`,
        );
      }
    }
  }
}
