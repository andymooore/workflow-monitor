"use client";

import { useState } from "react";
import { useFlowBuilderStore } from "@/stores/flow-builder-store";
import type {
  TaskNodeData,
  ApprovalNodeData,
  ConditionNodeData,
  WorkflowNodeData,
  NodeNotificationConfig,
} from "@/types/flow";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Trash2, Settings2, Bell, ChevronDown, ChevronRight } from "lucide-react";
import type { Node } from "@xyflow/react";

// ---------------------------------------------------------------------------
// Helper: type-narrow the selected node by its `type` field
// ---------------------------------------------------------------------------
function isTaskNode(
  node: Node<WorkflowNodeData>
): node is Node<TaskNodeData> & { type: "task" } {
  return node.type === "task";
}

function isApprovalNode(
  node: Node<WorkflowNodeData>
): node is Node<ApprovalNodeData> & { type: "approval" } {
  return node.type === "approval";
}

function isConditionNode(
  node: Node<WorkflowNodeData>
): node is Node<ConditionNodeData> & { type: "condition" } {
  return node.type === "condition";
}

// ---------------------------------------------------------------------------
// Shared Notification Settings Panel (used by Task and Approval panels)
// ---------------------------------------------------------------------------

function NotificationSettingsPanel({
  nodeId,
  notifications,
}: {
  nodeId: string;
  notifications?: NodeNotificationConfig;
}) {
  const updateNodeData = useFlowBuilderStore((s) => s.updateNodeData);
  const [isOpen, setIsOpen] = useState(false);

  const config = notifications ?? {};

  const updateNotifConfig = (updates: Partial<NodeNotificationConfig>) => {
    updateNodeData(nodeId, {
      notifications: { ...config, ...updates },
    });
  };

  return (
    <div className="mt-2">
      <Separator className="mb-3" />
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
      >
        <Bell className="size-3.5" />
        <span className="flex-1 text-left">Notification Settings</span>
        {isOpen ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
      </button>

      {isOpen && (
        <div className="mt-2 space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${nodeId}-notify-roles`} className="text-xs">
              Also notify these roles
            </Label>
            <Input
              id={`${nodeId}-notify-roles`}
              placeholder="Comma-separated role IDs"
              className="text-xs h-8"
              value={(config.notifyRoles ?? []).join(", ")}
              onChange={(e) =>
                updateNotifConfig({
                  notifyRoles: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            <p className="text-[10px] text-muted-foreground">
              Additional role IDs to receive notifications for this step
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`${nodeId}-notify-owner`}
              className="size-3.5 rounded border-input accent-primary"
              checked={config.notifyOwner ?? false}
              onChange={(e) =>
                updateNotifConfig({ notifyOwner: e.target.checked })
              }
            />
            <Label htmlFor={`${nodeId}-notify-owner`} className="text-xs">
              Notify workflow owner
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`${nodeId}-notify-assignees`}
              className="size-3.5 rounded border-input accent-primary"
              checked={config.notifyAssignees ?? false}
              onChange={(e) =>
                updateNotifConfig({ notifyAssignees: e.target.checked })
              }
            />
            <Label htmlFor={`${nodeId}-notify-assignees`} className="text-xs">
              Notify all current assignees
            </Label>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs">Email notifications</Label>
              <p className="text-[10px] text-muted-foreground">
                {config.suppressEmail
                  ? "In-app only (email suppressed)"
                  : "Email + in-app notifications"}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateNotifConfig({
                  suppressEmail: !config.suppressEmail,
                })
              }
              className={`relative h-5 w-9 rounded-full transition-colors ${
                !config.suppressEmail
                  ? "bg-primary"
                  : "bg-muted-foreground/20"
              }`}
              aria-label="Toggle email notifications"
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  !config.suppressEmail
                    ? "translate-x-4"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

function StartEndPanel({ node }: { node: Node<WorkflowNodeData> }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="node-label">Label</Label>
        <Input id="node-label" value={node.data.label} readOnly disabled />
      </div>
    </div>
  );
}

function TaskPanel({ node }: { node: Node<TaskNodeData> }) {
  const updateNodeData = useFlowBuilderStore((s) => s.updateNodeData);
  const data = node.data as TaskNodeData;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="task-label">Label</Label>
        <Input
          id="task-label"
          value={data.label}
          onChange={(e) =>
            updateNodeData(node.id, { label: e.target.value })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-description">Description</Label>
        <Textarea
          id="task-description"
          placeholder="Describe what this task involves..."
          value={data.description ?? ""}
          onChange={(e) =>
            updateNodeData(node.id, { description: e.target.value })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-roles">Assigned Role IDs</Label>
        <Input
          id="task-roles"
          placeholder="Comma-separated role IDs"
          value={(data.assignedRoleIds ?? []).join(", ")}
          onChange={(e) =>
            updateNodeData(node.id, {
              assignedRoleIds: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          Enter role IDs separated by commas
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="task-handback"
          className="size-4 rounded border-input accent-primary"
          checked={data.handbackToOwner ?? false}
          onChange={(e) =>
            updateNodeData(node.id, { handbackToOwner: e.target.checked })
          }
        />
        <Label htmlFor="task-handback">Hand back to owner</Label>
      </div>

      <NotificationSettingsPanel
        nodeId={node.id}
        notifications={data.notifications}
      />
    </div>
  );
}

function ApprovalPanel({ node }: { node: Node<ApprovalNodeData> }) {
  const updateNodeData = useFlowBuilderStore((s) => s.updateNodeData);
  const data = node.data as ApprovalNodeData;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="approval-label">Label</Label>
        <Input
          id="approval-label"
          value={data.label}
          onChange={(e) =>
            updateNodeData(node.id, { label: e.target.value })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label>Strategy</Label>
        <Select
          value={data.strategy}
          onValueChange={(val) =>
            updateNodeData(node.id, { strategy: val as ApprovalNodeData["strategy"] })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL_MUST_APPROVE">All Must Approve</SelectItem>
            <SelectItem value="ANY_CAN_APPROVE">Any Can Approve</SelectItem>
            <SelectItem value="SEQUENTIAL">Sequential</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="approval-count">Required Count</Label>
        <Input
          id="approval-count"
          type="number"
          min={1}
          value={data.requiredCount}
          onChange={(e) =>
            updateNodeData(node.id, {
              requiredCount: Math.max(1, parseInt(e.target.value, 10) || 1),
            })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="approval-roles">Approver Role IDs</Label>
        <Input
          id="approval-roles"
          placeholder="Comma-separated role IDs"
          value={(data.approverRoleIds ?? []).join(", ")}
          onChange={(e) =>
            updateNodeData(node.id, {
              approverRoleIds: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          Enter role IDs separated by commas
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="approval-instructions">Instructions</Label>
        <Textarea
          id="approval-instructions"
          placeholder="Instructions for approvers..."
          value={data.instructions ?? ""}
          onChange={(e) =>
            updateNodeData(node.id, { instructions: e.target.value })
          }
        />
      </div>

      <NotificationSettingsPanel
        nodeId={node.id}
        notifications={data.notifications}
      />
    </div>
  );
}

function ConditionPanel({ node }: { node: Node<ConditionNodeData> }) {
  const updateNodeData = useFlowBuilderStore((s) => s.updateNodeData);
  const nodes = useFlowBuilderStore((s) => s.nodes);
  const data = node.data as ConditionNodeData;

  // Collect all approval nodes in the current flow for the dropdown
  const approvalNodes = nodes.filter((n) => n.type === "approval");

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="condition-label">Label</Label>
        <Input
          id="condition-label"
          value={data.label}
          onChange={(e) =>
            updateNodeData(node.id, { label: e.target.value })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label>Source Approval Node</Label>
        <Select
          value={data.sourceApprovalNodeId ?? ""}
          onValueChange={(val) =>
            updateNodeData(node.id, {
              sourceApprovalNodeId: val || undefined,
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an approval node" />
          </SelectTrigger>
          <SelectContent>
            {approvalNodes.length === 0 ? (
              <SelectItem value="" disabled>
                No approval nodes in flow
              </SelectItem>
            ) : (
              approvalNodes.map((an) => (
                <SelectItem key={an.id} value={an.id} label={`${an.data.label}`}>
                  {an.data.label} ({an.id.slice(0, 8)}...)
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The approval result this condition branches on
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main config panel
// ---------------------------------------------------------------------------
export function NodeConfigPanel() {
  const selectedNodeId = useFlowBuilderStore((s) => s.selectedNodeId);
  const nodes = useFlowBuilderStore((s) => s.nodes);
  const removeNode = useFlowBuilderStore((s) => s.removeNode);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  if (!selectedNode) {
    return (
      <div className="flex h-full w-72 flex-col items-center justify-center border-l bg-background p-6 text-center">
        <Settings2 className="mb-3 size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">
          No node selected
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Click a node on the canvas to configure it
        </p>
      </div>
    );
  }

  const nodeType = selectedNode.type as string;
  const isDeletable = nodeType !== "start" && nodeType !== "end";

  return (
    <div className="flex h-full w-72 flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Configure Node
          </h2>
          <Badge variant="secondary" className="mt-1 capitalize">
            {nodeType}
          </Badge>
        </div>
        {isDeletable && (
          <Button
            variant="destructive"
            size="icon-sm"
            onClick={() => removeNode(selectedNode.id)}
            aria-label="Delete node"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      <Separator />

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4">
        {(nodeType === "start" || nodeType === "end") && (
          <StartEndPanel node={selectedNode} />
        )}
        {isTaskNode(selectedNode) && <TaskPanel node={selectedNode} />}
        {isApprovalNode(selectedNode) && (
          <ApprovalPanel node={selectedNode} />
        )}
        {isConditionNode(selectedNode) && (
          <ConditionPanel node={selectedNode} />
        )}
      </div>
    </div>
  );
}
