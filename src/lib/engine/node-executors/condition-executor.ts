import type { ExecutionContext, ExecutionResult, PrismaTransaction } from "../types";
import { BaseExecutor } from "./base-executor";

/**
 * Executor for CONDITION nodes.
 *
 * A condition node inspects the status of its upstream approval node to
 * determine which branch to take. The actual branch routing is handled by
 * `advanceWorkflow` in the engine — this executor simply marks the condition
 * node as COMPLETED so the engine can read the upstream status and follow the
 * correct edge.
 */
export class ConditionExecutor extends BaseExecutor {
  async activate(
    ctx: ExecutionContext,
    prisma: PrismaTransaction,
  ): Promise<ExecutionResult> {
    // Find the upstream approval node's TaskInstance by traversing incoming
    // edges. We look for the first predecessor whose node type is APPROVAL.
    const incomingEdges = await prisma.workflowEdge.findMany({
      where: {
        targetId: ctx.node.id,
        templateId: ctx.node.templateId,
      },
      include: {
        source: true,
      },
    });

    let upstreamStatus: string | undefined;

    for (const edge of incomingEdges) {
      if (edge.source.type === "APPROVAL") {
        const upstreamTask = await prisma.taskInstance.findFirst({
          where: {
            instanceId: ctx.instance.id,
            nodeId: edge.sourceId,
          },
        });
        if (upstreamTask) {
          upstreamStatus = upstreamTask.status;
          break;
        }
      }
    }

    // If no upstream approval is found, fall back to looking at any
    // predecessor's task instance status.
    if (!upstreamStatus) {
      for (const edge of incomingEdges) {
        const upstreamTask = await prisma.taskInstance.findFirst({
          where: {
            instanceId: ctx.instance.id,
            nodeId: edge.sourceId,
          },
        });
        if (upstreamTask) {
          upstreamStatus = upstreamTask.status;
          break;
        }
      }
    }

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
            upstreamStatus: upstreamStatus ?? "UNKNOWN",
          },
        },
      ],
    };
  }
}
