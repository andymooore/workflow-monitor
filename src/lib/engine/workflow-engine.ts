import type {
  NodeStatus,
  NodeType,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeRoleAssignment,
  TaskInstance,
  Approval,
  PrismaClient,
} from "@/generated/prisma/client";
import type { PrismaTransaction, ExecutionContext } from "./types";
import { RoleResolver } from "./resolver";
import { StartExecutor } from "./node-executors/start-executor";
import { EndExecutor } from "./node-executors/end-executor";
import { TaskExecutor } from "./node-executors/task-executor";
import { ApprovalExecutor } from "./node-executors/approval-executor";
import { ConditionExecutor } from "./node-executors/condition-executor";
import { BaseExecutor } from "./node-executors/base-executor";
import {
  notifyTaskAssigned,
  notifyApprovalRequested,
  notifyApprovalDecision,
  notifyTaskCompleted,
  notifyWorkflowCompleted,
  notifyWorkflowCancelled,
} from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { fireWebhooks } from "@/lib/webhooks";

// ---------------------------------------------------------------------------
// Structured engine error types
// ---------------------------------------------------------------------------
export class WorkflowEngineError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "WorkflowEngineError";
    this.code = code;
    this.context = context;
  }

  static templateNotPublished(templateId: string, templateName: string) {
    return new WorkflowEngineError(
      "TEMPLATE_NOT_PUBLISHED",
      `Cannot start an instance of unpublished template "${templateName}"`,
      { templateId, templateName }
    );
  }

  static noStartNode(templateId: string) {
    return new WorkflowEngineError(
      "NO_START_NODE",
      "Template has no START node",
      { templateId }
    );
  }

  static taskInstanceNotFound(taskInstanceId: string, nodeId?: string) {
    return new WorkflowEngineError(
      "TASK_INSTANCE_NOT_FOUND",
      `TaskInstance not found`,
      { taskInstanceId, nodeId }
    );
  }

  static notAssignee(userId: string, taskInstanceId: string) {
    return new WorkflowEngineError(
      "NOT_ASSIGNEE",
      "User is not the assignee of this task",
      { userId, taskInstanceId }
    );
  }

  static invalidTaskStatus(taskInstanceId: string, currentStatus: string, expectedStatus: string) {
    return new WorkflowEngineError(
      "INVALID_TASK_STATUS",
      `Task is not in the expected status (current: ${currentStatus}, expected: ${expectedStatus})`,
      { taskInstanceId, currentStatus, expectedStatus }
    );
  }

  static invalidNodeType(taskInstanceId: string, nodeType: string, expectedType: string) {
    return new WorkflowEngineError(
      "INVALID_NODE_TYPE",
      `Operation not supported on ${nodeType} nodes (expected: ${expectedType})`,
      { taskInstanceId, nodeType, expectedType }
    );
  }

  static noApprovalRecord(userId: string, taskInstanceId: string) {
    return new WorkflowEngineError(
      "NO_APPROVAL_RECORD",
      "No approval record found for this user on this task",
      { userId, taskInstanceId }
    );
  }

  static approvalAlreadyDecided(approvalId: string, decision: string) {
    return new WorkflowEngineError(
      "APPROVAL_ALREADY_DECIDED",
      `Approval has already been decided (${decision})`,
      { approvalId, decision }
    );
  }

  static cannotCancelInstance(instanceId: string, currentStatus: string) {
    return new WorkflowEngineError(
      "CANNOT_CANCEL",
      `Cannot cancel instance with status ${currentStatus}`,
      { instanceId, currentStatus }
    );
  }

  static noExecutor(nodeType: string) {
    return new WorkflowEngineError(
      "NO_EXECUTOR",
      `No executor registered for node type: ${nodeType}`,
      { nodeType }
    );
  }

  static nodeActivationFailed(nodeId: string, nodeLabel: string, cause: string) {
    return new WorkflowEngineError(
      "NODE_ACTIVATION_FAILED",
      `Failed to activate node "${nodeLabel}": ${cause}`,
      { nodeId, nodeLabel, cause }
    );
  }

  static conditionResolutionFailed(nodeId: string, nodeLabel: string) {
    return new WorkflowEngineError(
      "CONDITION_RESOLUTION_FAILED",
      `Cannot determine upstream status for CONDITION node "${nodeLabel}"`,
      { nodeId, nodeLabel }
    );
  }
}

// ---------------------------------------------------------------------------
// Helper types for rich includes
// ---------------------------------------------------------------------------
type NodeWithRelations = WorkflowNode & {
  roleAssignments: WorkflowNodeRoleAssignment[];
  outgoingEdges: WorkflowEdge[];
  incomingEdges: WorkflowEdge[];
};

type TaskInstanceWithRelations = TaskInstance & {
  approvals: Approval[];
  node: NodeWithRelations;
};

// Terminal statuses that count as "done" for predecessor satisfaction checks.
const TERMINAL_STATUSES: NodeStatus[] = [
  "COMPLETED",
  "APPROVED",
  "SKIPPED",
];

// Statuses that indicate a task has resolved and may trigger successor activation.
const RESOLVED_STATUSES: NodeStatus[] = [
  "COMPLETED",
  "APPROVED",
  "REJECTED",
];

// ---------------------------------------------------------------------------
// WorkflowEngine
// ---------------------------------------------------------------------------
export class WorkflowEngine {
  private resolver = new RoleResolver();

  /**
   * Per-invocation notification queue. Each public method sets this before
   * its transaction and flushes after commit, ensuring concurrent requests
   * on the singleton don't interleave notifications.
   */
  private _pendingNotifications: Array<() => Promise<unknown>> = [];

  /** Create a fresh per-request notification queue. */
  private initNotifications(): Array<() => Promise<unknown>> {
    const queue: Array<() => Promise<unknown>> = [];
    this._pendingNotifications = queue;
    return queue;
  }

  /** Flush a specific notification queue (fire-and-forget). */
  private flushNotifications(queue: Array<() => Promise<unknown>>) {
    for (const fn of queue) {
      fn().catch((err) => logger.error("Notification delivery failed", err));
    }
  }

  private executors: Record<NodeType, BaseExecutor> = {
    START: new StartExecutor(),
    END: new EndExecutor(),
    TASK: new TaskExecutor(),
    APPROVAL: new ApprovalExecutor(),
    CONDITION: new ConditionExecutor(),
  };

  // =========================================================================
  // startInstance
  // =========================================================================
  async startInstance(
    templateId: string,
    ownerId: string,
    title: string,
    metadata: Record<string, unknown>,
    prisma: PrismaClient,
    clientId: string,
    projectId: string | null = null,
  ): Promise<{ instanceId: string }> {
    const queue = this.initNotifications();
    const result = await prisma.$transaction(async (tx: PrismaTransaction) => {
      // 1. Load template with all design-time data.
      const template = await tx.workflowTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: {
          nodes: {
            include: {
              roleAssignments: true,
              outgoingEdges: true,
              incomingEdges: true,
            },
          },
          edges: true,
        },
      });

      if (!template.isPublished) {
        throw WorkflowEngineError.templateNotPublished(
          template.id,
          template.name,
        );
      }

      // 2. Create the workflow instance.
      const instance = await tx.workflowInstance.create({
        data: {
          templateId,
          ownerId,
          clientId,
          projectId,
          title,
          status: "RUNNING",
          metadata: metadata as object,
          startedAt: new Date(),
        },
      });

      // 3. Create a TaskInstance for every node (all start as PENDING).
      const taskInstances = await Promise.all(
        template.nodes.map((node: NodeWithRelations) =>
          tx.taskInstance.create({
            data: {
              instanceId: instance.id,
              nodeId: node.id,
              status: "PENDING",
            },
          }),
        ),
      );

      // 4. Find the START node and mark its TaskInstance as COMPLETED.
      const startNode = template.nodes.find(
        (n: NodeWithRelations) => n.type === "START",
      );
      if (!startNode) {
        throw WorkflowEngineError.noStartNode(templateId);
      }

      const startTask = taskInstances.find(
        (t: TaskInstance) => t.nodeId === startNode.id,
      );
      if (!startTask) {
        throw WorkflowEngineError.taskInstanceNotFound(
          "unknown",
          startNode.id,
        );
      }

      await tx.taskInstance.update({
        where: { id: startTask.id },
        data: {
          status: "COMPLETED",
          activatedAt: new Date(),
          completedAt: new Date(),
        },
      });

      // 5. Advance the workflow from the START node onward.
      await this.advanceWorkflow(instance.id, tx);

      // 6. Write audit log.
      await tx.auditLog.create({
        data: {
          instanceId: instance.id,
          userId: ownerId,
          action: "WORKFLOW_STARTED",
          details: {
            templateId,
            templateName: template.name,
            title,
          },
        },
      });

      return { instanceId: instance.id };
    });

    this.flushNotifications(queue);
    fireWebhooks("WORKFLOW_STARTED", {
      instanceId: result.instanceId,
      templateId,
      ownerId,
      title,
    }).catch(() => {});
    return result;
  }

  // =========================================================================
  // advanceWorkflow
  // =========================================================================
  async advanceWorkflow(
    instanceId: string,
    prisma: PrismaTransaction,
  ): Promise<void> {
    // Outer loop: keep advancing until no more nodes can be activated.
    let changed = true;

    while (changed) {
      changed = false;

      // Reload the full instance state each iteration.
      const instance = await prisma.workflowInstance.findUniqueOrThrow({
        where: { id: instanceId },
      });

      // If the instance is no longer running, stop.
      if (instance.status !== "RUNNING") {
        break;
      }

      const taskInstances = await prisma.taskInstance.findMany({
        where: { instanceId },
        include: {
          approvals: true,
          node: {
            include: {
              roleAssignments: true,
              outgoingEdges: true,
              incomingEdges: true,
            },
          },
        },
      });

      // Index task instances by node ID for fast lookup.
      const taskByNodeId = new Map<string, TaskInstanceWithRelations>();
      for (const ti of taskInstances) {
        taskByNodeId.set(
          ti.nodeId,
          ti as unknown as TaskInstanceWithRelations,
        );
      }

      // Find all task instances that have resolved (COMPLETED/APPROVED/REJECTED)
      // and may have unactivated successors.
      const resolvedTasks = taskInstances.filter(
        (ti: TaskInstance) => RESOLVED_STATUSES.includes(ti.status),
      );

      for (const resolvedTask of resolvedTasks) {
        const node = (resolvedTask as unknown as TaskInstanceWithRelations)
          .node;
        const outgoingEdges = node.outgoingEdges;

        // Determine which edges to follow for CONDITION nodes.
        const edgesToFollow = this.resolveOutgoingEdges(
          node,
          outgoingEdges,
          resolvedTask as unknown as TaskInstanceWithRelations,
          taskByNodeId,
        );

        // Edges NOT taken (for condition branch skipping).
        const skippedEdges = outgoingEdges.filter(
          (e: WorkflowEdge) => !edgesToFollow.includes(e),
        );

        // Skip nodes on non-taken branches.
        for (const edge of skippedEdges) {
          const targetTask = taskByNodeId.get(edge.targetId);
          if (targetTask && targetTask.status === "PENDING") {
            await this.skipNodeAndDescendants(
              targetTask,
              taskByNodeId,
              prisma,
            );
            changed = true;
          }
        }

        // Attempt to activate successor nodes on taken edges.
        for (const edge of edgesToFollow) {
          const targetTask = taskByNodeId.get(edge.targetId);
          if (!targetTask || targetTask.status !== "PENDING") {
            continue; // Already activated, completed, or skipped.
          }

          // Check if ALL predecessors (incoming edges) of the target are satisfied.
          const targetNode = targetTask.node;
          const allPredecessorsSatisfied = targetNode.incomingEdges.every(
            (inEdge: WorkflowEdge) => {
              const predTask = taskByNodeId.get(inEdge.sourceId);
              return predTask && TERMINAL_STATUSES.includes(predTask.status);
            },
          );

          if (!allPredecessorsSatisfied) {
            continue;
          }

          // Activate the target node — with graceful failure handling.
          try {
            await this.activateNode(
              instance,
              targetTask,
              targetNode,
              prisma,
            );
            changed = true;

            // Refresh local map after activation.
            const refreshed = await prisma.taskInstance.findUniqueOrThrow({
              where: { id: targetTask.id },
              include: {
                approvals: true,
                node: {
                  include: {
                    roleAssignments: true,
                    outgoingEdges: true,
                    incomingEdges: true,
                  },
                },
              },
            });
            taskByNodeId.set(
              refreshed.nodeId,
              refreshed as unknown as TaskInstanceWithRelations,
            );

            // If an END node was activated, mark the instance as COMPLETED.
            if (targetNode.type === "END") {
              await prisma.workflowInstance.update({
                where: { id: instanceId },
                data: {
                  status: "COMPLETED",
                  completedAt: new Date(),
                },
              });

              await prisma.auditLog.create({
                data: {
                  instanceId,
                  userId: instance.ownerId,
                  action: "WORKFLOW_COMPLETED",
                  details: { nodeId: targetNode.id, label: targetNode.label },
                },
              });

              // Queue notification for workflow owner
              this._pendingNotifications.push(() =>
                notifyWorkflowCompleted(instance.ownerId, instanceId, instance.title),
              );

              // Fire webhook
              this._pendingNotifications.push(() =>
                fireWebhooks("WORKFLOW_COMPLETED", {
                  instanceId,
                  ownerId: instance.ownerId,
                  title: instance.title,
                }),
              );

              return; // Workflow is done.
            }
          } catch (error) {
            // Graceful fallback: mark the node as FAILED, log the error,
            // but don't crash the entire workflow advancement.
            logger.error(
              `Failed to activate node "${targetNode.label}" (${targetNode.id}) in instance ${instanceId}`,
              error,
              { nodeId: targetNode.id, nodeType: targetNode.type, instanceId },
            );

            // Mark the task instance with a failure-indicating status.
            // We use SKIPPED as a fallback since FAILED is not a NodeStatus,
            // but we log the actual failure in the audit trail.
            await prisma.taskInstance.update({
              where: { id: targetTask.id },
              data: {
                status: "SKIPPED",
                notes: `NODE_ACTIVATION_FAILED: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            });

            await prisma.auditLog.create({
              data: {
                instanceId,
                userId: "SYSTEM",
                action: "NODE_SKIPPED",
                details: {
                  nodeId: targetNode.id,
                  nodeType: targetNode.type,
                  label: targetNode.label,
                  error: error instanceof Error ? error.message : "Unknown error",
                  reason: "NODE_ACTIVATION_FAILED",
                },
              },
            });

            // Update local map so downstream nodes see this as resolved.
            (targetTask as { status: NodeStatus }).status = "SKIPPED";
            changed = true;

            // Check if this is an unrecoverable situation — if all remaining
            // PENDING nodes cannot proceed, mark the instance as FAILED.
            const remainingPending = Array.from(taskByNodeId.values()).filter(
              (t) => t.status === "PENDING",
            );
            const hasEndReachable = remainingPending.some(
              (t) => t.node.type === "END",
            );

            if (!hasEndReachable && remainingPending.length === 0) {
              // No more pending nodes and no END was reached — workflow is stuck
              await prisma.workflowInstance.update({
                where: { id: instanceId },
                data: { status: "FAILED" },
              });

              await prisma.auditLog.create({
                data: {
                  instanceId,
                  userId: "SYSTEM",
                  action: "WORKFLOW_CANCELLED",
                  details: {
                    reason: "UNRECOVERABLE_ERROR",
                    failedNode: targetNode.id,
                    failedNodeLabel: targetNode.label,
                  },
                },
              });

              return;
            }
          }
        }
      }
    }
  }

  // =========================================================================
  // completeTask
  // =========================================================================
  async completeTask(
    taskInstanceId: string,
    userId: string,
    notes: string | null,
    prisma: PrismaClient,
  ): Promise<void> {
    const queue = this.initNotifications();
    await prisma.$transaction(async (tx: PrismaTransaction) => {
      const taskInstance = await tx.taskInstance.findUniqueOrThrow({
        where: { id: taskInstanceId },
        include: {
          approvals: true,
          node: {
            include: {
              roleAssignments: true,
              outgoingEdges: true,
              incomingEdges: true,
            },
          },
          instance: true,
        },
      });

      // Validate the user is the assignee.
      if (taskInstance.assigneeId !== userId) {
        throw WorkflowEngineError.notAssignee(userId, taskInstanceId);
      }

      if (taskInstance.status !== "IN_PROGRESS") {
        throw WorkflowEngineError.invalidTaskStatus(
          taskInstanceId,
          taskInstance.status,
          "IN_PROGRESS",
        );
      }

      if (taskInstance.node.type !== "TASK") {
        throw WorkflowEngineError.invalidNodeType(
          taskInstanceId,
          taskInstance.node.type,
          "TASK",
        );
      }

      // Use the executor to get the result.
      const executor = this.executors.TASK as TaskExecutor;
      const ctx: ExecutionContext = {
        instance: taskInstance.instance,
        taskInstance: taskInstance as unknown as TaskInstance & {
          approvals: Approval[];
        },
        node: taskInstance.node as unknown as NodeWithRelations,
      };

      const result = await executor.handleAction(ctx, "complete", {}, tx);

      // Apply the result.
      await tx.taskInstance.update({
        where: { id: taskInstanceId },
        data: {
          status: result.newStatus,
          completedAt: new Date(),
          notes,
        },
      });

      // Write audit entries.
      for (const entry of result.auditEntries) {
        await tx.auditLog.create({
          data: {
            instanceId: taskInstance.instanceId,
            userId,
            action: entry.action,
            details: entry.details as object,
          },
        });
      }

      // Advance the workflow first so we know what happens next.
      if (result.shouldAdvance) {
        await this.advanceWorkflow(taskInstance.instanceId, tx);
      }

      // ── Read per-node notification config for task completed notifications ──
      const completedNodeConfig = (taskInstance.node.config ?? {}) as Record<string, unknown>;
      const completedNotifConfig = (completedNodeConfig.notifications ?? {}) as {
        notifyRoles?: string[];
        notifyOwner?: boolean;
        notifyAssignees?: boolean;
        suppressEmail?: boolean;
      };
      const completedAdditionalIds = await this.resolveNotificationRecipients(
        completedNotifConfig,
        { id: taskInstance.instanceId, ownerId: taskInstance.instance.ownerId },
        tx,
      );
      const completedNotifyOptions = {
        additionalRecipientIds: completedAdditionalIds.length > 0 ? completedAdditionalIds : undefined,
        suppressEmail: completedNotifConfig.suppressEmail ?? false,
      };

      // Notify the requester that this stage completed — but only if
      // they are NOT the person who just completed it (they already know)
      // and they are NOT being assigned the very next task (that
      // notification is more useful and avoids double-pinging).
      if (userId !== taskInstance.instance.ownerId) {
        const nextOwnerTask = await tx.taskInstance.findFirst({
          where: {
            instanceId: taskInstance.instanceId,
            assigneeId: taskInstance.instance.ownerId,
            status: "IN_PROGRESS",
          },
        });

        // Only send "task completed" if the owner isn't already looking
        // at their own freshly-assigned task.
        if (!nextOwnerTask) {
          const completer = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
          this._pendingNotifications.push(() =>
            notifyTaskCompleted(
              taskInstance.instance.ownerId,
              taskInstance.instanceId,
              taskInstance.node.label,
              completer?.name ?? "Someone",
              taskInstance.instance.title,
              completedNotifyOptions,
            ),
          );
        }
      }
    });

    this.flushNotifications(queue);
  }

  // =========================================================================
  // submitApproval
  // =========================================================================
  async submitApproval(
    taskInstanceId: string,
    userId: string,
    decision: "APPROVED" | "REJECTED",
    comment: string | null,
    prisma: PrismaClient,
  ): Promise<void> {
    const queue = this.initNotifications();
    await prisma.$transaction(async (tx: PrismaTransaction) => {
      // Find the Approval record for this user + taskInstance.
      const approval = await tx.approval.findFirst({
        where: {
          taskInstanceId,
          deciderId: userId,
        },
      });

      if (!approval) {
        throw WorkflowEngineError.noApprovalRecord(userId, taskInstanceId);
      }

      if (approval.decision !== "PENDING") {
        throw WorkflowEngineError.approvalAlreadyDecided(
          approval.id,
          approval.decision,
        );
      }

      // Record the decision.
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          decision,
          comment,
          decidedAt: new Date(),
        },
      });

      // Reload the task instance with all updated approvals.
      const taskInstance = await tx.taskInstance.findUniqueOrThrow({
        where: { id: taskInstanceId },
        include: {
          approvals: true,
          node: {
            include: {
              roleAssignments: true,
              outgoingEdges: true,
              incomingEdges: true,
            },
          },
          instance: true,
        },
      });

      if (taskInstance.status !== "IN_PROGRESS") {
        throw WorkflowEngineError.invalidTaskStatus(
          taskInstanceId,
          taskInstance.status,
          "IN_PROGRESS",
        );
      }

      // Use the ApprovalExecutor to evaluate the gate.
      const approvalExecutor = this.executors.APPROVAL as ApprovalExecutor;
      const action = decision === "APPROVED" ? "approve" : "reject";

      const ctx: ExecutionContext = {
        instance: taskInstance.instance,
        taskInstance: taskInstance as unknown as TaskInstance & {
          approvals: Approval[];
        },
        node: taskInstance.node as unknown as NodeWithRelations,
      };

      const result = await approvalExecutor.handleAction(
        ctx,
        action,
        {},
        tx,
      );

      // If the gate resolved, update the task instance.
      if (result.newStatus === "APPROVED" || result.newStatus === "REJECTED") {
        await tx.taskInstance.update({
          where: { id: taskInstanceId },
          data: {
            status: result.newStatus,
            completedAt: new Date(),
          },
        });
      }

      // Write audit entries.
      for (const entry of result.auditEntries) {
        await tx.auditLog.create({
          data: {
            instanceId: taskInstance.instanceId,
            userId,
            action: entry.action,
            details: entry.details as object,
          },
        });
      }

      // ── Read per-node notification config for approval notifications ──
      const approvalNodeConfig = (taskInstance.node.config ?? {}) as Record<string, unknown>;
      const approvalNotifConfig = (approvalNodeConfig.notifications ?? {}) as {
        notifyRoles?: string[];
        notifyOwner?: boolean;
        notifyAssignees?: boolean;
        suppressEmail?: boolean;
      };
      const approvalAdditionalIds = await this.resolveNotificationRecipients(
        approvalNotifConfig,
        { id: taskInstance.instanceId, ownerId: taskInstance.instance.ownerId },
        tx,
      );
      const approvalNotifyOptions = {
        additionalRecipientIds: approvalAdditionalIds.length > 0 ? approvalAdditionalIds : undefined,
        suppressEmail: approvalNotifConfig.suppressEmail ?? false,
      };

      const gateResolved = result.newStatus === "APPROVED" || result.newStatus === "REJECTED";

      if (gateResolved) {
        // Gate resolved — notify the requester about the final outcome.
        if (userId !== taskInstance.instance.ownerId) {
          const decider = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
          this._pendingNotifications.push(() =>
            notifyApprovalDecision(
              taskInstance.instance.ownerId,
              taskInstance.instanceId,
              taskInstance.node.label,
              result.newStatus as "APPROVED" | "REJECTED",
              decider?.name ?? "Someone",
              approvalNotifyOptions,
            ),
          );
        }
      } else {
        // Gate NOT resolved — for SEQUENTIAL strategy, notify the next
        // approver that it's their turn.
        if (approvalNodeConfig.strategy === "SEQUENTIAL") {
          const nextApproval = taskInstance.approvals
            .filter((a: Approval) => a.decision === "PENDING")
            .sort((a: Approval, b: Approval) => a.sequenceOrder - b.sequenceOrder)[0];

          if (nextApproval?.deciderId) {
            this._pendingNotifications.push(() =>
              notifyApprovalRequested(
                [nextApproval.deciderId!],
                taskInstance.instanceId,
                taskInstance.node.label,
                taskInstance.instance.title,
                approvalNotifyOptions,
              ),
            );
          }
        }
      }

      // Advance the workflow if the gate resolved.
      if (result.shouldAdvance) {
        await this.advanceWorkflow(taskInstance.instanceId, tx);
      }
    });

    this.flushNotifications(queue);
  }

  // =========================================================================
  // cancelInstance
  // =========================================================================
  async cancelInstance(
    instanceId: string,
    userId: string,
    prisma: PrismaClient,
  ): Promise<void> {
    const queue = this.initNotifications();
    await prisma.$transaction(async (tx: PrismaTransaction) => {
      const instance = await tx.workflowInstance.findUniqueOrThrow({
        where: { id: instanceId },
      });

      if (instance.status !== "RUNNING" && instance.status !== "DRAFT") {
        throw WorkflowEngineError.cannotCancelInstance(
          instanceId,
          instance.status,
        );
      }

      await tx.workflowInstance.update({
        where: { id: instanceId },
        data: { status: "CANCELLED" },
      });

      await tx.auditLog.create({
        data: {
          instanceId,
          userId,
          action: "WORKFLOW_CANCELLED",
          details: {
            previousStatus: instance.status,
            cancelledBy: userId,
          },
        },
      });

      // Queue notification for owner
      if (userId !== instance.ownerId) {
        this._pendingNotifications.push(() =>
          notifyWorkflowCancelled(instance.ownerId, instanceId, instance.title),
        );
      }
    });

    this.flushNotifications(queue);
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /**
   * For a resolved node, determine which outgoing edges should be followed.
   *
   * For CONDITION nodes this performs branch routing based on the upstream
   * approval status. For all other node types, all outgoing edges are taken.
   */
  private resolveOutgoingEdges(
    node: NodeWithRelations,
    outgoingEdges: WorkflowEdge[],
    _resolvedTask: TaskInstanceWithRelations,
    taskByNodeId: Map<string, TaskInstanceWithRelations>,
  ): WorkflowEdge[] {
    if (node.type !== "CONDITION") {
      return outgoingEdges;
    }

    // CONDITION node: determine which branch to follow based on the upstream
    // approval node's status.
    const upstreamApprovalStatus = this.findUpstreamApprovalStatus(
      node,
      taskByNodeId,
    );

    const branchToFollow =
      upstreamApprovalStatus === "APPROVED"
        ? "APPROVED_PATH"
        : "REJECTED_PATH";

    return outgoingEdges.filter(
      (e: WorkflowEdge) => e.conditionBranch === branchToFollow,
    );
  }

  /**
   * Look at the CONDITION node's incoming edges to find the upstream
   * approval node and return its status.
   */
  private findUpstreamApprovalStatus(
    conditionNode: NodeWithRelations,
    taskByNodeId: Map<string, TaskInstanceWithRelations>,
  ): NodeStatus {
    // First try to find an APPROVAL predecessor.
    for (const inEdge of conditionNode.incomingEdges) {
      const predTask = taskByNodeId.get(inEdge.sourceId);
      if (predTask && predTask.node.type === "APPROVAL") {
        return predTask.status;
      }
    }

    // Fallback: return the status of the first resolved predecessor.
    for (const inEdge of conditionNode.incomingEdges) {
      const predTask = taskByNodeId.get(inEdge.sourceId);
      if (predTask && RESOLVED_STATUSES.includes(predTask.status)) {
        return predTask.status;
      }
    }

    throw WorkflowEngineError.conditionResolutionFailed(
      conditionNode.id,
      conditionNode.label,
    );
  }

  /**
   * Mark a node and all its descendants (that are still PENDING) as SKIPPED.
   * This handles the non-taken branch of a condition node.
   */
  private async skipNodeAndDescendants(
    taskInstance: TaskInstanceWithRelations,
    taskByNodeId: Map<string, TaskInstanceWithRelations>,
    prisma: PrismaTransaction,
  ): Promise<void> {
    if (taskInstance.status !== "PENDING") {
      return;
    }

    await prisma.taskInstance.update({
      where: { id: taskInstance.id },
      data: { status: "SKIPPED" },
    });

    await prisma.auditLog.create({
      data: {
        instanceId: taskInstance.instanceId,
        userId: "SYSTEM",
        action: "NODE_SKIPPED",
        details: {
          nodeId: taskInstance.nodeId,
          nodeType: taskInstance.node.type,
          label: taskInstance.node.label,
        },
      },
    });

    // Update local map.
    (taskInstance as { status: NodeStatus }).status = "SKIPPED";

    // Recursively skip descendants — but only if all their incoming edges
    // lead to SKIPPED or TERMINAL nodes. This avoids skipping nodes that
    // have another live path feeding them.
    const outgoingEdges = taskInstance.node.outgoingEdges;
    for (const edge of outgoingEdges) {
      const descendant = taskByNodeId.get(edge.targetId);
      if (!descendant || descendant.status !== "PENDING") {
        continue;
      }

      // Check if ALL predecessors of the descendant are skipped/terminal.
      const allPredsDead = descendant.node.incomingEdges.every(
        (inEdge: WorkflowEdge) => {
          const predTask = taskByNodeId.get(inEdge.sourceId);
          return (
            predTask &&
            (predTask.status === "SKIPPED" ||
              TERMINAL_STATUSES.includes(predTask.status))
          );
        },
      );

      // Additionally, ensure there is no live (non-skipped, non-terminal)
      // predecessor that could still activate this node.
      const hasLivePredecessor = descendant.node.incomingEdges.some(
        (inEdge: WorkflowEdge) => {
          const predTask = taskByNodeId.get(inEdge.sourceId);
          return (
            predTask &&
            predTask.status !== "SKIPPED" &&
            !TERMINAL_STATUSES.includes(predTask.status)
          );
        },
      );

      if (allPredsDead && !hasLivePredecessor) {
        await this.skipNodeAndDescendants(descendant, taskByNodeId, prisma);
      }
    }
  }

  /**
   * Activate a single node: resolve assignees, create approval records,
   * run the executor, and persist state.
   */
  private async activateNode(
    instance: { id: string; ownerId: string; title: string },
    taskInstance: TaskInstanceWithRelations,
    node: NodeWithRelations,
    prisma: PrismaTransaction,
  ): Promise<void> {
    const executor = this.executors[node.type];
    if (!executor) {
      throw WorkflowEngineError.noExecutor(node.type);
    }

    // ── Read per-node notification config from the node's config JSON ──
    const nodeConfig = (node.config ?? {}) as Record<string, unknown>;
    const notifConfig = (nodeConfig.notifications ?? {}) as {
      notifyRoles?: string[];
      notifyOwner?: boolean;
      notifyAssignees?: boolean;
      suppressEmail?: boolean;
    };

    // Resolve additional recipients from notification routing config
    const additionalRecipientIds = await this.resolveNotificationRecipients(
      notifConfig,
      instance,
      prisma,
    );

    const notifyOptions = {
      additionalRecipientIds: additionalRecipientIds.length > 0 ? additionalRecipientIds : undefined,
      suppressEmail: notifConfig.suppressEmail ?? false,
    };

    // Resolve SLA tier for due date calculation
    let slaTier: string | null = null;
    if (node.type === "TASK" || node.type === "APPROVAL") {
      const instData = await prisma.workflowInstance.findUnique({
        where: { id: instance.id },
        select: { client: { select: { slaTier: true } } },
      });
      slaTier = instData?.client?.slaTier ?? null;
    }

    // Resolve assignee for TASK nodes.
    if (node.type === "TASK") {
      const assigneeId = await this.resolver.resolveAssignee(
        node,
        instance.ownerId,
        prisma,
      );

      await prisma.taskInstance.update({
        where: { id: taskInstance.id },
        data: { assigneeId },
      });

      await prisma.auditLog.create({
        data: {
          instanceId: instance.id,
          userId: assigneeId,
          action: "TASK_ASSIGNED",
          details: {
            nodeId: node.id,
            label: node.label,
            taskInstanceId: taskInstance.id,
          },
        },
      });

      // Queue notification (fire-and-forget after transaction)
      this._pendingNotifications.push(() =>
        notifyTaskAssigned(assigneeId, instance.id, node.label, instance.title, notifyOptions),
      );

      // Set SLA-aware due date based on client tier
      if (slaTier) {
        const taskSlaDays: Record<string, number> = { GOLD: 2, SILVER: 5, BRONZE: 10 };
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (taskSlaDays[slaTier] ?? 10));
        await prisma.taskInstance.update({
          where: { id: taskInstance.id },
          data: { dueDate },
        });
      }
    }

    // Create Approval records for APPROVAL nodes.
    if (node.type === "APPROVAL") {
      const approverIds = await this.resolver.resolveApprovers(
        node,
        instance.ownerId,
        prisma,
      );

      for (let i = 0; i < approverIds.length; i++) {
        await prisma.approval.create({
          data: {
            taskInstanceId: taskInstance.id,
            deciderId: approverIds[i],
            decision: "PENDING",
            sequenceOrder: i,
          },
        });
      }

      await prisma.auditLog.create({
        data: {
          instanceId: instance.id,
          userId: instance.ownerId,
          action: "APPROVAL_REQUESTED",
          details: {
            nodeId: node.id,
            label: node.label,
            taskInstanceId: taskInstance.id,
            approverIds,
          },
        },
      });

      // Queue notification for approvers — for SEQUENTIAL strategy, only
      // notify the first approver (they act first; the next one gets
      // notified after the previous approver decides).
      const strategy = nodeConfig.strategy as string | undefined;

      const idsToNotify =
        strategy === "SEQUENTIAL"
          ? [approverIds[0]] // only the first in the sequence
          : [...approverIds]; // ALL_MUST_APPROVE / ANY_CAN_APPROVE

      this._pendingNotifications.push(() =>
        notifyApprovalRequested(idsToNotify, instance.id, node.label, instance.title, notifyOptions),
      );

      // Set SLA-aware due date for approval based on client tier
      if (slaTier) {
        const approvalSlaDays: Record<string, number> = { GOLD: 1, SILVER: 3, BRONZE: 5 };
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (approvalSlaDays[slaTier] ?? 5));
        await prisma.taskInstance.update({
          where: { id: taskInstance.id },
          data: { dueDate },
        });
      }
    }

    // Build execution context (reload to get fresh approvals).
    const freshTask = await prisma.taskInstance.findUniqueOrThrow({
      where: { id: taskInstance.id },
      include: { approvals: true },
    });

    const ctx: ExecutionContext = {
      instance: instance as ExecutionContext["instance"],
      taskInstance: freshTask as unknown as TaskInstance & {
        approvals: Approval[];
      },
      node,
    };

    const result = await executor.activate(ctx, prisma);

    // Persist the status from the executor.
    await prisma.taskInstance.update({
      where: { id: taskInstance.id },
      data: {
        status: result.newStatus,
        activatedAt: new Date(),
        ...(result.newStatus === "COMPLETED"
          ? { completedAt: new Date() }
          : {}),
      },
    });

    // Write audit entries from the executor.
    for (const entry of result.auditEntries) {
      await prisma.auditLog.create({
        data: {
          instanceId: instance.id,
          userId: instance.ownerId,
          action: entry.action,
          details: entry.details as object,
        },
      });
    }
  }

  /**
   * Resolve additional notification recipients from per-node notification config.
   * Examines notifyRoles, notifyOwner, and notifyAssignees flags.
   */
  private async resolveNotificationRecipients(
    notifConfig: {
      notifyRoles?: string[];
      notifyOwner?: boolean;
      notifyAssignees?: boolean;
    },
    instance: { id: string; ownerId: string },
    prisma: PrismaTransaction,
  ): Promise<string[]> {
    const recipientIds = new Set<string>();

    // Add workflow owner if requested
    if (notifConfig.notifyOwner) {
      recipientIds.add(instance.ownerId);
    }

    // Add all users in the specified roles
    if (notifConfig.notifyRoles && notifConfig.notifyRoles.length > 0) {
      const userRoles = await prisma.userRole.findMany({
        where: {
          roleId: { in: notifConfig.notifyRoles },
          user: { status: "ACTIVE" },
        },
        select: { userId: true },
        distinct: ["userId"],
      });

      for (const ur of userRoles) {
        recipientIds.add(ur.userId);
      }
    }

    // Add all current assignees of the instance's active tasks
    if (notifConfig.notifyAssignees) {
      const activeTasks = await prisma.taskInstance.findMany({
        where: {
          instanceId: instance.id,
          status: "IN_PROGRESS",
          assigneeId: { not: null },
        },
        select: { assigneeId: true },
      });

      for (const task of activeTasks) {
        if (task.assigneeId) {
          recipientIds.add(task.assigneeId);
        }
      }
    }

    return Array.from(recipientIds);
  }
}

// Singleton instance for convenience.
export const workflowEngine = new WorkflowEngine();
