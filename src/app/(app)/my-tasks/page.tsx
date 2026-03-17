"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, CheckSquare, CheckCircle, XCircle, AlertCircle, ShieldCheck, ClipboardList, Clock, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { usePolling } from "@/hooks/use-polling";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface MyTask {
  id: string;
  instanceId: string;
  label: string;
  nodeType: string;
  workflowTitle: string;
  templateName: string;
  templateId: string;
  status: string;
  assignedAt: string | null;
  owner: { id: string; name: string; email: string };
  notes: string | null;
  approvals: Array<{
    id: string;
    decision: string;
    comment: string | null;
    decider: { id: string; name: string; email: string } | null;
  }>;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  IN_PROGRESS: "default",
  COMPLETED: "secondary",
  APPROVED: "secondary",
  REJECTED: "destructive",
  PENDING: "outline",
  WAITING: "outline",
  SKIPPED: "outline",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isOverdue(assignedAt: string | null): boolean {
  if (!assignedAt) return false;
  const assigned = new Date(assignedAt);
  const now = new Date();
  const diff = now.getTime() - assigned.getTime();
  return diff > 48 * 60 * 60 * 1000; // 48 hours
}

export default function MyTasksPage() {
  const { data: tasksRes, isLoading, refetch } = usePolling<{ data: MyTask[]; total: number }>(
    "/api/workflows/my-tasks",
    { interval: 15000 },
  );
  const tasks = tasksRes?.data ?? null;

  // Group tasks by priority
  const { urgent, pending, completed } = useMemo(() => {
    if (!tasks) return { urgent: [], pending: [], completed: [] };

    const urgent: MyTask[] = [];
    const pending: MyTask[] = [];
    const completed: MyTask[] = [];

    for (const task of tasks) {
      if (task.status === "COMPLETED" || task.status === "APPROVED" || task.status === "REJECTED" || task.status === "SKIPPED") {
        completed.push(task);
      } else if (task.status === "IN_PROGRESS" && isOverdue(task.assignedAt)) {
        urgent.push(task);
      } else {
        pending.push(task);
      }
    }

    return { urgent, pending, completed };
  }, [tasks]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tasks assigned to you across all active workflows
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading your tasks...</p>
        </div>
      ) : tasks && tasks.length > 0 ? (
        <div className="space-y-8">
          {/* Urgent / Overdue */}
          {urgent.length > 0 && (
            <TaskGroup
              title="Urgent"
              subtitle="Overdue tasks requiring immediate attention"
              icon={AlertCircle}
              iconColor="text-red-500"
              borderColor="border-red-200 dark:border-red-900"
              bgColor="bg-red-50/30 dark:bg-red-950/10"
              tasks={urgent}
              refetch={refetch}
            />
          )}

          {/* Pending / Active */}
          {pending.length > 0 && (
            <TaskGroup
              title="Pending"
              subtitle="Active tasks awaiting your action"
              icon={Clock}
              iconColor="text-blue-500"
              borderColor="border-blue-200 dark:border-blue-900"
              bgColor="bg-blue-50/30 dark:bg-blue-950/10"
              tasks={pending}
              refetch={refetch}
            />
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <TaskGroup
              title="Completed"
              subtitle="Recently finished tasks"
              icon={CheckCircle}
              iconColor="text-emerald-500"
              borderColor="border-emerald-200 dark:border-emerald-900"
              bgColor="bg-emerald-50/30 dark:bg-emerald-950/10"
              tasks={completed}
              refetch={refetch}
            />
          )}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <Inbox className="size-8 text-muted-foreground/50" />
            </div>
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              All caught up!
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              No tasks assigned to you right now
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TaskGroup({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  borderColor,
  bgColor,
  tasks,
  refetch,
}: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  iconColor: string;
  borderColor: string;
  bgColor: string;
  tasks: MyTask[];
  refetch: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`size-5 ${iconColor}`} />
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant="secondary" className="ml-2 text-[10px]">{tasks.length}</Badge>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => (
          <Card key={task.id} className={`${borderColor} ${bgColor} transition-all duration-200 hover:shadow-md`}>
            <CardContent className="flex items-center justify-between p-4">
              <Link
                href={`/instances/${task.instanceId}`}
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    task.nodeType === "APPROVAL"
                      ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                      : "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                  }`}>
                    {task.nodeType === "APPROVAL" ? (
                      <ShieldCheck className="size-4" />
                    ) : (
                      <ClipboardList className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{task.label}</p>
                      <Badge variant={STATUS_VARIANT[task.status] ?? "outline"} className="shrink-0 text-[10px]">
                        {task.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {task.workflowTitle}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Avatar size="sm" className="size-4">
                        <AvatarFallback className="text-[7px]">
                          {getInitials(task.owner.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{task.owner.name}</span>
                      {task.assignedAt && (
                        <>
                          <span className="text-muted-foreground/50">--</span>
                          <span>
                            Assigned{" "}
                            {formatDistanceToNow(new Date(task.assignedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
              <div className="ml-4 flex shrink-0 gap-2">
                {task.status === "IN_PROGRESS" && task.nodeType === "TASK" && (
                  <TaskCompleteAction
                    instanceId={task.instanceId}
                    taskId={task.id}
                    taskLabel={task.label}
                    onComplete={refetch}
                  />
                )}
                {task.status === "IN_PROGRESS" && task.nodeType === "APPROVAL" && (
                  <TaskApproveAction
                    instanceId={task.instanceId}
                    taskId={task.id}
                    taskLabel={task.label}
                    onComplete={refetch}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TaskCompleteAction({
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
              Mark &quot;{taskLabel}&quot; as complete.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Add optional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleComplete} disabled={isSubmitting}>
              {isSubmitting ? "Completing..." : "Complete Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TaskApproveAction({
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
      toast.error("Comment is required for rejection");
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
      toast.success(decision === "APPROVED" ? "Approved" : "Rejected");
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
        <ShieldCheck className="size-3.5" data-icon="inline-start" />
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
          <Textarea
            placeholder="Add your comment..."
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
              <CheckCircle className="size-3.5" data-icon="inline-start" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
