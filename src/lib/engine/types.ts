import type {
  WorkflowNode,
  WorkflowInstance,
  TaskInstance,
  Approval,
  AuditAction,
  NodeStatus,
  PrismaClient,
} from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Transaction-compatible Prisma client type
// ---------------------------------------------------------------------------
export type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// ---------------------------------------------------------------------------
// Execution context passed to node executors
// ---------------------------------------------------------------------------
export interface ExecutionContext {
  instance: WorkflowInstance;
  taskInstance: TaskInstance & { approvals: Approval[] };
  node: WorkflowNode & {
    roleAssignments: Array<{
      roleId: string;
      assignToOwner: boolean;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Result returned by node executors
// ---------------------------------------------------------------------------
export interface ExecutionResult {
  newStatus: NodeStatus;
  shouldAdvance: boolean;
  auditEntries: Array<{
    action: AuditAction;
    details: Record<string, unknown>;
  }>;
}

// ---------------------------------------------------------------------------
// Validation error for template validation
// ---------------------------------------------------------------------------
export interface ValidationError {
  nodeId?: string;
  message: string;
}
