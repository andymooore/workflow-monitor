"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, CheckCircle, XCircle, User, Clock, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { usePolling } from "@/hooks/use-polling";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface PendingApproval {
  id: string;
  instanceId: string;
  label: string;
  nodeType: string;
  workflowTitle: string;
  templateName: string;
  status: string;
  assignedAt: string | null;
  owner: { id: string; name: string; email: string };
  approvals: Array<{
    id: string;
    decision: string;
    comment: string | null;
    decider: { id: string; name: string; email: string } | null;
  }>;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ApprovalsPage() {
  const { data: tasksRes, isLoading, refetch } = usePolling<{ data: PendingApproval[]; total: number }>(
    "/api/workflows/my-tasks?status=IN_PROGRESS",
    { interval: 15000 },
  );
  const tasks = tasksRes?.data ?? null;

  // Filter to only approval-type tasks
  const approvalTasks = tasks?.filter((t) => t.nodeType === "APPROVAL") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Approvals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and action pending approval requests
          </p>
        </div>
        {approvalTasks.length > 0 && (
          <Badge variant="default" className="text-sm px-3 py-1">
            {approvalTasks.length} pending
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading approvals...</p>
        </div>
      ) : approvalTasks.length > 0 ? (
        <div className="space-y-3">
          {approvalTasks.map((task) => (
            <Card
              key={task.id}
              className="transition-all duration-200 hover:border-amber-300 hover:shadow-md hover:shadow-amber-500/5 dark:hover:border-amber-800"
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  {/* Approval icon */}
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                    <ShieldCheck className="size-5" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/instances/${task.instanceId}`}
                          className="group"
                        >
                          <h3 className="font-semibold group-hover:text-primary transition-colors">
                            {task.label}
                          </h3>
                        </Link>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {task.workflowTitle}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <User className="size-3" />
                            <span>Requested by <span className="font-medium text-foreground">{task.owner.name}</span></span>
                          </div>
                          {task.assignedAt && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="size-3" />
                              <span>
                                {formatDistanceToNow(new Date(task.assignedAt), {
                                  addSuffix: true,
                                })}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Other approvers status */}
                        {task.approvals.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">Other reviewers:</p>
                            <div className="flex flex-wrap gap-2">
                              {task.approvals.map((approval) => (
                                <div
                                  key={approval.id}
                                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                                    approval.decision === "APPROVED"
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                      : approval.decision === "REJECTED"
                                        ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                  }`}
                                >
                                  <Avatar size="sm" className="size-4">
                                    <AvatarFallback className="text-[7px]">
                                      {approval.decider ? getInitials(approval.decider.name) : "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{approval.decider?.name ?? "Unknown"}</span>
                                  {approval.decision === "APPROVED" && <CheckCircle className="size-3 text-emerald-500" />}
                                  {approval.decision === "REJECTED" && <XCircle className="size-3 text-red-500" />}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action button */}
                      <div className="shrink-0">
                        <ApprovalDialog
                          instanceId={task.instanceId}
                          taskId={task.id}
                          taskLabel={task.label}
                          workflowTitle={task.workflowTitle}
                          requester={task.owner.name}
                          onComplete={refetch}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <Inbox className="size-8 text-muted-foreground/50" />
            </div>
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              No pending approvals
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              You are all caught up - check back later for new requests
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ApprovalDialog({
  instanceId,
  taskId,
  taskLabel,
  workflowTitle,
  requester,
  onComplete,
}: {
  instanceId: string;
  taskId: string;
  taskLabel: string;
  workflowTitle: string;
  requester: string;
  onComplete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const triggerSidebarRefresh = useUIStore((s) => s.triggerSidebarRefresh);

  const handleDecision = async (decision: "APPROVED" | "REJECTED") => {
    if (decision === "REJECTED" && !comment.trim()) {
      setRejectError(true);
      toast.error("Comment is required for rejection");
      return;
    }

    if (decision === "REJECTED" && !confirmReject) {
      setConfirmReject(true);
      return;
    }

    setRejectError(false);
    setConfirmReject(false);
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
      toast.success(
        decision === "APPROVED"
          ? "Approval granted"
          : "Request rejected",
      );
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
      <Button size="sm" onClick={() => setIsOpen(true)} className="gap-1.5">
        <ShieldCheck className="size-3.5" data-icon="inline-start" />
        Review
      </Button>
      <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setConfirmReject(false);
          setRejectError(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{taskLabel}</DialogTitle>
            <DialogDescription>
              Workflow: {workflowTitle} -- Requested by: {requester}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              placeholder="Add your review comment (required for rejection)..."
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (rejectError && e.target.value.trim()) setRejectError(false);
                setConfirmReject(false);
              }}
              rows={4}
              className={rejectError ? "border-red-500 ring-red-500/20 ring-2" : ""}
            />
            {rejectError && (
              <p className="text-xs text-red-500">A comment is required when rejecting a request</p>
            )}
            {confirmReject && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                <XCircle className="size-4 shrink-0" />
                <span>Click Reject again to confirm your rejection</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => handleDecision("REJECTED")}
              disabled={isSubmitting}
            >
              <XCircle className="size-3.5" data-icon="inline-start" />
              {confirmReject ? "Confirm Reject" : "Reject"}
            </Button>
            <Button
              onClick={() => handleDecision("APPROVED")}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                "Submitting..."
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
