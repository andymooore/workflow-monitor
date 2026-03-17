import type { Node, Edge } from "@xyflow/react";
import type { ApprovalStrategy, ConditionBranch } from "@/generated/prisma/client";

// ─── Per-node notification routing config ────────────────────────────────────

export interface NodeNotificationConfig {
  notifyRoles?: string[];     // Additional role IDs to notify
  notifyOwner?: boolean;      // Notify the workflow owner (default: varies by event)
  notifyAssignees?: boolean;  // Notify all current assignees (default: false)
  suppressEmail?: boolean;    // Don't send email for this node's events (in-app only)
}

// Node data types for each custom node
export interface StartNodeData {
  label: string;
  [key: string]: unknown;
}

export interface EndNodeData {
  label: string;
  [key: string]: unknown;
}

export interface TaskNodeData {
  label: string;
  description?: string;
  assignedRoleIds: string[];
  handbackToOwner: boolean;
  notifications?: NodeNotificationConfig;
  [key: string]: unknown;
}

export interface ApprovalNodeData {
  label: string;
  strategy: ApprovalStrategy;
  requiredCount: number;
  approverRoleIds: string[];
  instructions?: string;
  notifications?: NodeNotificationConfig;
  [key: string]: unknown;
}

export interface ConditionNodeData {
  label: string;
  sourceApprovalNodeId?: string;
  [key: string]: unknown;
}

// Union type for all node data
export type WorkflowNodeData =
  | StartNodeData
  | EndNodeData
  | TaskNodeData
  | ApprovalNodeData
  | ConditionNodeData;

// Typed nodes
export type StartNode = Node<StartNodeData, "start">;
export type EndNode = Node<EndNodeData, "end">;
export type TaskNode = Node<TaskNodeData, "task">;
export type ApprovalNode = Node<ApprovalNodeData, "approval">;
export type ConditionNode = Node<ConditionNodeData, "condition">;

export type FlowNode = StartNode | EndNode | TaskNode | ApprovalNode | ConditionNode;

// Edge data
export interface LabeledEdgeData {
  label?: string;
  conditionBranch?: ConditionBranch;
  [key: string]: unknown;
}

export type FlowEdge = Edge<LabeledEdgeData>;

// Node type enum for the palette
export const FLOW_NODE_TYPES = ["start", "end", "task", "approval", "condition"] as const;
export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];
