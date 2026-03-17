"use client";

import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import {
  Loader2,
  Clock,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Calendar,
  ArrowRight,
  Send,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Ban,
  Building2,
  FolderOpen,
} from "lucide-react";

import { usePolling } from "@/hooks/use-polling";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusStartNode } from "@/components/flow-builder/status-nodes";
import { StatusEndNode } from "@/components/flow-builder/status-nodes";
import { StatusTaskNode } from "@/components/flow-builder/status-nodes";
import { StatusApprovalNode } from "@/components/flow-builder/status-nodes";
import { StatusConditionNode } from "@/components/flow-builder/status-nodes";
import { LabeledEdge } from "@/components/flow-builder/custom-edges/labeled-edge";
import type { NodeStatus, AuditAction } from "@/generated/prisma/client";

// -------------------------------------------------------------------------
// Types for the API response
// -------------------------------------------------------------------------
interface InstanceDetail {
  id: string;
  title: string;
  status: string;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  owner: { id: string; name: string; email: string };
  client: { id: string; name: string; shortCode: string } | null;
  project: { id: string; name: string } | null;
  template: {
    id: string;
    name: string;
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      positionX: number;
      positionY: number;
      config: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      label: string | null;
      conditionBranch: string | null;
    }>;
  };
  taskInstances: Array<{
    id: string;
    nodeId: string;
    status: NodeStatus;
    assignee: { id: string; name: string; email: string } | null;
    notes: string | null;
    activatedAt: string | null;
    completedAt: string | null;
    node: { id: string; type: string; label: string };
    approvals: Array<{
      id: string;
      decision: string;
      comment: string | null;
      decidedAt: string | null;
      decider: { id: string; name: string; email: string } | null;
    }>;
  }>;
}

interface TimelineEntry {
  id: string;
  action: AuditAction;
  details: Record<string, unknown>;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface CommentEntry {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

// -------------------------------------------------------------------------
// Status-aware node types for read-only flow view
// -------------------------------------------------------------------------
const statusNodeTypes: NodeTypes = {
  start: StatusStartNode,
  end: StatusEndNode,
  task: StatusTaskNode,
  approval: StatusApprovalNode,
  condition: StatusConditionNode,
};

const statusEdgeTypes: EdgeTypes = {
  labeled: LabeledEdge,
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// -------------------------------------------------------------------------
// Status badge styling
// -------------------------------------------------------------------------
function getStatusColor(status: string) {
  switch (status) {
    case "RUNNING":
      return { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500 animate-pulse" };
    case "COMPLETED":
      return { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" };
    case "CANCELLED":
    case "FAILED":
      return { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" };
    default:
      return { bg: "bg-gray-50 dark:bg-gray-900/40", text: "text-gray-700 dark:text-gray-300", dot: "bg-gray-500" };
  }
}

// -------------------------------------------------------------------------
// Main page component
// -------------------------------------------------------------------------
export default function InstanceDetailPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("flow");

  // Poll instance data
  const { data: instance, isLoading, refetch } = usePolling<InstanceDetail>(
    `/api/workflows/instances/${instanceId}`,
    { interval: 10000 },
  );

  // Poll timeline
  const { data: timeline } = usePolling<TimelineEntry[]>(
    `/api/workflows/instances/${instanceId}/timeline`,
    { interval: 15000, enabled: activeTab === "timeline" },
  );

  // Poll comments
  const {
    data: comments,
    refetch: refetchComments,
  } = usePolling<CommentEntry[]>(
    `/api/workflows/instances/${instanceId}/comments`,
    { interval: 15000, enabled: activeTab === "comments" },
  );

  // Reassignment state
  const [reassignTask, setReassignTask] = useState<{ id: string; label: string; currentAssignee: string | null } | null>(null);
  const [reassignUserId, setReassignUserId] = useState("");

  // Fetch available users for reassignment dropdown
  const { data: usersRes } = usePolling<{ data: Array<{ id: string; name: string; email: string }>; total: number }>(
    "/api/users",
    { interval: 60000 },
  );
  const availableUsers = usersRes?.data ?? null;

  // Build React Flow nodes from instance data
  const { flowNodes, flowEdges } = useMemo(() => {
    if (!instance) return { flowNodes: [], flowEdges: [] };

    const statusByNodeId = new Map<string, NodeStatus>();
    const taskByNodeId = new Map<string, InstanceDetail["taskInstances"][0]>();
    for (const ti of instance.taskInstances) {
      statusByNodeId.set(ti.nodeId, ti.status);
      taskByNodeId.set(ti.nodeId, ti);
    }

    const nodes: Node[] = instance.template.nodes.map((n) => {
      const nodeStatus = statusByNodeId.get(n.id) ?? "PENDING";
      const task = taskByNodeId.get(n.id);

      return {
        id: n.id,
        type: n.type.toLowerCase(),
        position: { x: n.positionX, y: n.positionY },
        data: {
          label: n.label,
          nodeStatus,
          assignee: task?.assignee ?? null,
          isCurrentUserActionable: task?.status === "IN_PROGRESS",
          ...n.config,
        },
        draggable: false,
        selectable: false,
        connectable: false,
      };
    });

    const edges: Edge[] = instance.template.edges.map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      type: "labeled",
      data: {
        label: e.label ?? undefined,
        conditionBranch: e.conditionBranch ?? undefined,
      },
    }));

    return { flowNodes: nodes, flowEdges: edges };
  }, [instance]);

  // Cancel handler
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/workflows/instances/${instanceId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to cancel" }));
        toast.error(err.error?.message ?? err.error ?? "Failed to cancel workflow");
        return;
      }
      toast.success("Workflow cancelled");
      setShowCancelDialog(false);
      refetch();
    } catch {
      toast.error("Failed to cancel workflow");
    } finally {
      setIsCancelling(false);
    }
  }, [instanceId, refetch]);

  const handleReassign = useCallback(async () => {
    if (!reassignTask || !reassignUserId) return;
    const res = await fetch(
      `/api/workflows/instances/${instanceId}/tasks/${reassignTask.id}/reassign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: reassignUserId }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed" }));
      toast.error(err.error?.message ?? err.error ?? "Failed to reassign");
      return;
    }
    toast.success("Task reassigned");
    setReassignTask(null);
    setReassignUserId("");
    refetch();
  }, [reassignTask, reassignUserId, instanceId, refetch]);

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="relative">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="absolute inset-0 h-8 w-8 animate-ping rounded-full bg-primary/10" />
        </div>
        <p className="text-sm text-muted-foreground">Loading workflow instance...</p>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-6 text-destructive" />
        </div>
        <p className="font-medium text-destructive">Instance not found</p>
        <Link href="/instances" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to instances
        </Link>
      </div>
    );
  }

  const statusColor = getStatusColor(instance.status);
  const activeTasks = instance.taskInstances.filter(
    (ti) => ti.status === "IN_PROGRESS",
  );
  const progressTotal = instance.taskInstances.length;
  const progressCompleted = instance.taskInstances.filter(
    (ti) => ti.status === "COMPLETED" || ti.status === "APPROVED",
  ).length;
  const progressPct = progressTotal > 0 ? Math.round((progressCompleted / progressTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Premium Header */}
      <div className="rounded-xl border bg-gradient-to-r from-background to-muted/30 p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{instance.title}</h1>
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusColor.bg} ${statusColor.text}`}>
                <span className={`size-2 rounded-full ${statusColor.dot}`} />
                {instance.status}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <ExternalLink className="size-3.5" />
                <Link href={`/workflows/${instance.template.id}`} className="hover:text-primary hover:underline">
                  {instance.template.name}
                </Link>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="size-3.5" />
                <span>{instance.owner.name}</span>
              </div>
              {instance.client && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="size-3.5" />
                  <Link href={`/clients/${instance.client.id}`} className="hover:underline hover:text-primary transition-colors">
                    {instance.client.name}
                  </Link>
                  <Badge variant="outline" className="text-[10px] font-mono ml-1">{instance.client.shortCode}</Badge>
                </div>
              )}
              {instance.project && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <FolderOpen className="size-3.5" />
                  <span>{instance.project.name}</span>
                </div>
              )}
              {instance.startedAt && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  <span>Started {formatDistanceToNow(new Date(instance.startedAt), { addSuffix: true })}</span>
                </div>
              )}
              {instance.completedAt && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="size-3.5 text-emerald-500" />
                  <span>Completed {format(new Date(instance.completedAt), "MMM d, yyyy HH:mm")}</span>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-3 max-w-md">
              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    instance.status === "COMPLETED" ? "bg-emerald-500"
                    : instance.status === "CANCELLED" ? "bg-red-500"
                    : "bg-blue-500"
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground tabular-nums whitespace-nowrap">
                {progressCompleted}/{progressTotal} tasks ({progressPct}%)
              </span>
            </div>
          </div>

          {instance.status === "RUNNING" && session?.user?.id === instance.owner.id && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowCancelDialog(true)}
            >
              <Ban className="size-3.5" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Submitted Request Details */}
      {instance.metadata && Object.keys(instance.metadata).filter(k => !k.startsWith("_")).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Request Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {typeof instance.metadata._priority === "string" && instance.metadata._priority && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Priority</span>
                <Badge variant={
                  instance.metadata._priority === "Critical" ? "destructive" :
                  instance.metadata._priority === "High" ? "default" :
                  "secondary"
                }>
                  {instance.metadata._priority}
                </Badge>
              </div>
            )}
            {Object.entries(instance.metadata)
              .filter(([k]) => !k.startsWith("_"))
              .map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm gap-4">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="font-medium text-right">{String(value)}</span>
                </div>
              ))
            }
          </CardContent>
        </Card>
      )}

      {/* Active task actions panel */}
      {activeTasks.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-full bg-blue-500">
                <AlertCircle className="size-3.5 text-white" />
              </div>
              <CardTitle className="text-base">
                Your Active Tasks
                <Badge variant="default" className="ml-2 text-[10px]">{activeTasks.length}</Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border bg-background p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex size-8 items-center justify-center rounded-lg ${
                      task.node.type === "APPROVAL"
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                        : "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                    }`}>
                      {task.node.type === "APPROVAL" ? (
                        <AlertCircle className="size-4" />
                      ) : (
                        <CheckCircle className="size-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{task.node.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.node.type === "APPROVAL" ? "Needs your review" : "Assigned to you"}
                        {task.assignee && ` - ${task.assignee.name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {instance.status === "RUNNING" &&
                     session?.user?.id === instance.owner.id &&
                     task.status === "IN_PROGRESS" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => setReassignTask({
                          id: task.id,
                          label: task.node.label,
                          currentAssignee: task.assignee?.name ?? null,
                        })}
                      >
                        Reassign
                      </Button>
                    )}
                    {task.node.type === "TASK" && (
                      <CompleteTaskButton
                        instanceId={instanceId}
                        taskId={task.id}
                        taskLabel={task.node.label}
                        onComplete={refetch}
                      />
                    )}
                    {task.node.type === "APPROVAL" && (
                      <ApproveTaskButton
                        instanceId={instanceId}
                        taskId={task.id}
                        taskLabel={task.node.label}
                        onComplete={refetch}
                      />
                    )}
                  </div>
                </div>
                {/* Approval decisions and comments */}
                {task.approvals.length > 0 && (
                  <div className="mt-2 ml-11 space-y-1">
                    {task.approvals.map((approval) => (
                      <div key={approval.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        {approval.decision === "APPROVED" && <CheckCircle className="size-3 mt-0.5 shrink-0 text-emerald-500" />}
                        {approval.decision === "REJECTED" && <XCircle className="size-3 mt-0.5 shrink-0 text-red-500" />}
                        <span>{approval.decider?.name ?? "Unknown"} - {approval.decision.toLowerCase()}</span>
                        {approval.comment && (
                          <p className="mt-1 text-xs text-muted-foreground italic">
                            &quot;{approval.comment}&quot;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabs: Flow View, Timeline, Comments */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="flow" className="gap-1.5">
            <ArrowRight className="size-3.5" />
            Flow View
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <Clock className="size-3.5" />
            Timeline
            {timeline && (
              <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
                {timeline.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="comments" className="gap-1.5">
            <MessageSquare className="size-3.5" />
            Comments
            {comments && (
              <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
                {comments.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="mt-4">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[560px] w-full">
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={statusNodeTypes}
                  edgeTypes={statusEdgeTypes}
                  fitView
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  panOnDrag
                  zoomOnScroll
                  defaultEdgeOptions={{ type: "labeled" }}
                >
                  <Background />
                  <Controls showInteractive={false} />
                  <MiniMap className="!bg-muted/50 !rounded-lg !border !shadow-sm" />
                </ReactFlow>
              </div>
            </CardContent>
          </Card>

          {/* Node status legend */}
          <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium">Legend:</span>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded border-2 border-emerald-500 bg-emerald-50" />
              Completed
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded border-2 border-blue-500 bg-blue-50 animate-pulse" />
              In Progress
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded border-2 border-dashed border-gray-300 bg-gray-50" />
              Pending
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded border-2 border-red-500 bg-red-50" />
              Rejected
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded border-2 border-gray-300 bg-gray-50 opacity-40" />
              Skipped
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <ScrollArea className="h-[540px]">
                {timeline && timeline.length > 0 ? (
                  <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

                    <div className="space-y-6">
                      {timeline.map((entry, index) => (
                        <TimelineItem key={entry.id} entry={entry} isLast={index === timeline.length - 1} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-48 flex-col items-center justify-center gap-2">
                    <Clock className="size-8 text-muted-foreground/30" />
                    <p className="text-muted-foreground">No timeline events yet</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <CommentSection
                instanceId={instanceId}
                comments={comments ?? []}
                onCommentAdded={refetchComments}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Cancel confirmation dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this workflow? This action cannot be undone. All pending tasks will be abandoned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Running
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              <Ban className="size-3.5" />
              {isCancelling ? "Cancelling..." : "Cancel Workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign task dialog */}
      <Dialog open={!!reassignTask} onOpenChange={(open) => { if (!open) { setReassignTask(null); setReassignUserId(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reassign Task</DialogTitle>
            <DialogDescription>
              {reassignTask?.label}
              {reassignTask?.currentAssignee && (
                <span className="block mt-1">Currently assigned to: {reassignTask.currentAssignee}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reassign-user">New Assignee</Label>
            <Select value={reassignUserId} onValueChange={(v) => setReassignUserId(v ?? "")}>
              <SelectTrigger id="reassign-user">
                <SelectValue placeholder="Select a user..." />
              </SelectTrigger>
              <SelectContent>
                {(availableUsers ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id} label={`${u.name} (${u.email})`}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignTask(null)}>Cancel</Button>
            <Button onClick={handleReassign} disabled={!reassignUserId}>
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

function CompleteTaskButton({
  instanceId,
  taskId,
  taskLabel,
  onComplete,
}: {
  instanceId: string;
  taskId: string;
  taskLabel: string;
  onComplete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const triggerSidebarRefresh = useUIStore((s) => s.triggerSidebarRefresh);

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/workflows/instances/${instanceId}/tasks/${taskId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: notes || undefined }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error);
        return;
      }
      toast.success("Task completed successfully");
      setIsOpen(false);
      setNotes("");
      onComplete();
      triggerSidebarRefresh();
    } catch {
      toast.error("Failed to complete task");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setIsOpen(true)}>
        <CheckCircle className="size-3.5" data-icon="inline-start" />
        Complete
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
            <DialogDescription>
              Mark &quot;{taskLabel}&quot; as complete. You can add optional notes below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              placeholder="Add optional notes about this task..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleComplete} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
                  Completing...
                </>
              ) : (
                <>
                  <CheckCircle className="size-3.5" data-icon="inline-start" />
                  Complete Task
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApproveTaskButton({
  instanceId,
  taskId,
  taskLabel,
  onComplete,
}: {
  instanceId: string;
  taskId: string;
  taskLabel: string;
  onComplete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState(false);
  const triggerSidebarRefresh = useUIStore((s) => s.triggerSidebarRefresh);

  const handleDecision = async (decision: "APPROVED" | "REJECTED") => {
    if (decision === "REJECTED" && !comment.trim()) {
      setRejectError(true);
      toast.error("A comment is required when rejecting");
      return;
    }
    setRejectError(false);
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/workflows/instances/${instanceId}/tasks/${taskId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, comment: comment || undefined }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error);
        return;
      }
      toast.success(decision === "APPROVED" ? "Approved successfully" : "Rejected");
      setIsOpen(false);
      setComment("");
      onComplete();
      triggerSidebarRefresh();
    } catch {
      toast.error("Failed to submit decision");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setIsOpen(true)}>
        <AlertCircle className="size-3.5" data-icon="inline-start" />
        Review
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review: {taskLabel}</DialogTitle>
            <DialogDescription>
              Approve or reject this task. A comment is required for rejections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              placeholder="Add your review comment..."
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (rejectError && e.target.value.trim()) setRejectError(false);
              }}
              rows={3}
              className={rejectError ? "border-red-500 ring-red-500/20 ring-2" : ""}
            />
            {rejectError && (
              <p className="text-xs text-red-500">Comment is required for rejection</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => handleDecision("REJECTED")}
              disabled={isSubmitting}
            >
              <XCircle className="size-3.5" data-icon="inline-start" />
              Reject
            </Button>
            <Button
              onClick={() => handleDecision("APPROVED")}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="size-3.5" data-icon="inline-start" />
                  Approve
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Vertical timeline item with color-coded dot and expandable details */
function TimelineItem({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  const dotColor = getTimelineDotColor(entry.action);

  return (
    <div className="relative flex gap-4 pl-1">
      {/* Dot */}
      <div className={`relative z-10 mt-1 flex size-[30px] shrink-0 items-center justify-center rounded-full ring-4 ring-background ${dotColor.bg}`}>
        <TimelineIcon action={entry.action} className={`size-3.5 ${dotColor.icon}`} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{formatAction(entry.action)}</p>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar size="sm" className="size-4">
            <AvatarFallback className="text-[7px]">{getInitials(entry.user.name)}</AvatarFallback>
          </Avatar>
          <span>{entry.user.name}</span>
          <span className="text-muted-foreground/50">--</span>
          <span>{format(new Date(entry.createdAt), "MMM d, yyyy HH:mm:ss")}</span>
        </div>

        {hasDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? "Hide details" : "Show details"}
          </button>
        )}

        {expanded && hasDetails && (
          <pre className="mt-2 max-w-full overflow-x-auto rounded-lg bg-muted p-3 text-xs font-mono">
            {JSON.stringify(entry.details, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function getTimelineDotColor(action: string) {
  if (action.includes("COMPLETED") || action.includes("APPROVED")) {
    return { bg: "bg-emerald-100 dark:bg-emerald-900/40", icon: "text-emerald-600 dark:text-emerald-400" };
  }
  if (action.includes("REJECTED") || action.includes("CANCELLED")) {
    return { bg: "bg-red-100 dark:bg-red-900/40", icon: "text-red-600 dark:text-red-400" };
  }
  if (action.includes("STARTED") || action.includes("ASSIGNED")) {
    return { bg: "bg-blue-100 dark:bg-blue-900/40", icon: "text-blue-600 dark:text-blue-400" };
  }
  if (action.includes("COMMENT")) {
    return { bg: "bg-purple-100 dark:bg-purple-900/40", icon: "text-purple-600 dark:text-purple-400" };
  }
  return { bg: "bg-amber-100 dark:bg-amber-900/40", icon: "text-amber-600 dark:text-amber-400" };
}

function TimelineIcon({ action, className }: { action: string; className?: string }) {
  if (action.includes("COMPLETED") || action.includes("APPROVED")) {
    return <CheckCircle className={className} />;
  }
  if (action.includes("REJECTED") || action.includes("CANCELLED")) {
    return <XCircle className={className} />;
  }
  if (action.includes("STARTED") || action.includes("ASSIGNED")) {
    return <Clock className={className} />;
  }
  if (action.includes("COMMENT")) {
    return <MessageSquare className={className} />;
  }
  return <Clock className={className} />;
}

function formatAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/** Chat-like comment section */
function CommentSection({
  instanceId,
  comments,
  onCommentAdded,
}: {
  instanceId: string;
  comments: CommentEntry[];
  onCommentAdded: () => void;
}) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/workflows/instances/${instanceId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error);
        return;
      }
      setContent("");
      onCommentAdded();
    } catch {
      toast.error("Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      <ScrollArea className="h-[420px]">
        {comments.length > 0 ? (
          <div className="space-y-4">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <Avatar size="sm" className="mt-0.5 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(c.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{c.user.name}</p>
                      <p className="shrink-0 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-2">
            <MessageSquare className="size-8 text-muted-foreground/30" />
            <p className="text-muted-foreground">No comments yet</p>
            <p className="text-xs text-muted-foreground/70">Be the first to add a comment</p>
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="flex gap-2">
        <Textarea
          placeholder="Write a comment... (Ctrl+Enter to send)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          className="flex-1 resize-none"
        />
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !content.trim()}
          className="shrink-0 self-end"
          size="sm"
        >
          {isSubmitting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
