"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play, Square, ClipboardList, ShieldCheck, GitBranch, Check, X, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { Node } from "@xyflow/react";

// -------------------------------------------------------------------------
// Common status styling helpers
// -------------------------------------------------------------------------
interface StatusNodeData {
  label: string;
  nodeStatus: string;
  assignee?: { name: string; email?: string } | null;
  isCurrentUserActionable?: boolean;
  [key: string]: unknown;
}

/** Returns gradient-based border styles for premium look */
function getStatusClasses(status: string): string {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
      return "border-emerald-500 shadow-emerald-500/20 bg-gradient-to-br from-card to-emerald-50/30 dark:to-emerald-950/20";
    case "IN_PROGRESS":
      return "border-blue-500 shadow-blue-500/25 bg-gradient-to-br from-card to-blue-50/30 dark:to-blue-950/20";
    case "REJECTED":
      return "border-red-500 shadow-red-500/20 bg-gradient-to-br from-card to-red-50/30 dark:to-red-950/20";
    case "SKIPPED":
      return "border-gray-300 dark:border-gray-600 opacity-40";
    case "PENDING":
    case "WAITING":
    default:
      return "border-gray-300 dark:border-gray-600 border-dashed";
  }
}

function getStatusBgClass(status: string): string {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
      return "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30";
    case "IN_PROGRESS":
      return "bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30";
    case "REJECTED":
      return "bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/30";
    case "SKIPPED":
      return "bg-gray-400 opacity-40";
    case "PENDING":
    case "WAITING":
    default:
      return "bg-gray-400 dark:bg-gray-600";
  }
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "COMPLETED" || status === "APPROVED"
      ? "secondary"
      : status === "IN_PROGRESS"
        ? "default"
        : status === "REJECTED"
          ? "destructive"
          : "outline";
  return (
    <Badge variant={variant} className="mt-2 text-[10px] uppercase tracking-wider">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

/** Status overlay icon for completed/rejected/skipped states */
function StatusOverlay({ status }: { status: string }) {
  if (status === "COMPLETED" || status === "APPROVED") {
    return (
      <div className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40 ring-2 ring-white dark:ring-gray-900">
        <Check className="size-3 text-white" strokeWidth={3} />
      </div>
    );
  }
  if (status === "REJECTED") {
    return (
      <div className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-red-500 shadow-sm shadow-red-500/40 ring-2 ring-white dark:ring-gray-900">
        <X className="size-3 text-white" strokeWidth={3} />
      </div>
    );
  }
  if (status === "SKIPPED") {
    return (
      <div className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-gray-400 shadow-sm ring-2 ring-white dark:ring-gray-900">
        <SkipForward className="size-3 text-white" strokeWidth={3} />
      </div>
    );
  }
  return null;
}

/** Assignee avatar badge shown on task/approval nodes */
function AssigneeAvatar({ assignee }: { assignee: { name: string; email?: string } }) {
  const initials = assignee.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="absolute -bottom-2 -right-2 z-10">
              <Avatar size="sm" className="ring-2 ring-white dark:ring-gray-900">
                <AvatarFallback className="text-[9px] font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </div>
          }
        />
        <TooltipContent side="bottom">
          <span>{assignee.name}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Glow animation wrapper for actionable nodes */
function ActionableGlow({ isActionable, children }: { isActionable?: boolean; children: React.ReactNode }) {
  if (!isActionable) return <>{children}</>;
  return (
    <div className="relative">
      <div className="absolute -inset-1 animate-pulse rounded-xl bg-blue-400/20 blur-sm" />
      <div className="relative">{children}</div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Status START Node
// -------------------------------------------------------------------------
function StatusStartNodeComponent({
  data,
}: NodeProps<Node<StatusNodeData, "start">>) {
  const status = (data as StatusNodeData).nodeStatus ?? "PENDING";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-full px-6 py-3 shadow-lg transition-all duration-300",
        "min-w-[120px]",
        getStatusBgClass(status),
      )}
    >
      <div className="flex items-center gap-2">
        <Play className="h-4 w-4 text-white" fill="currentColor" />
        <span className="text-sm font-semibold text-white tracking-wide">{data.label}</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white !bg-emerald-600"
      />
    </div>
  );
}
export const StatusStartNode = memo(StatusStartNodeComponent);

// -------------------------------------------------------------------------
// Status END Node
// -------------------------------------------------------------------------
function StatusEndNodeComponent({
  data,
}: NodeProps<Node<StatusNodeData, "end">>) {
  const status = (data as StatusNodeData).nodeStatus ?? "PENDING";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-full px-6 py-3 shadow-lg transition-all duration-300",
        "min-w-[120px]",
        getStatusBgClass(status),
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-red-600"
      />
      <div className="flex items-center gap-2">
        <Square className="h-4 w-4 text-white" fill="currentColor" />
        <span className="text-sm font-semibold text-white tracking-wide">{data.label}</span>
      </div>
    </div>
  );
}
export const StatusEndNode = memo(StatusEndNodeComponent);

// -------------------------------------------------------------------------
// Status TASK Node
// -------------------------------------------------------------------------
function StatusTaskNodeComponent({
  data,
}: NodeProps<Node<StatusNodeData, "task">>) {
  const d = data as StatusNodeData;
  const status = d.nodeStatus ?? "PENDING";
  const isActionable = d.isCurrentUserActionable ?? false;

  return (
    <ActionableGlow isActionable={isActionable}>
      <div
        className={cn(
          "relative w-[280px] rounded-xl border-2 p-4 shadow-lg transition-all duration-300",
          getStatusClasses(status),
          status === "SKIPPED" && "line-through decoration-gray-400/60 decoration-2",
          status === "IN_PROGRESS" && "animate-[pulse_3s_ease-in-out_infinite]",
        )}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
        />

        <StatusOverlay status={status} />
        {d.assignee && <AssigneeAvatar assignee={d.assignee} />}

        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            status === "COMPLETED" || status === "APPROVED"
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
              : status === "IN_PROGRESS"
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                : status === "REJECTED"
                  ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
          )}>
            <ClipboardList className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className={cn(
              "block truncate text-sm font-semibold text-foreground",
              status === "SKIPPED" && "text-muted-foreground line-through",
            )}>
              {d.label}
            </span>
            {d.assignee && (
              <p className="truncate text-[11px] text-muted-foreground">
                {d.assignee.name}
              </p>
            )}
          </div>
        </div>

        <StatusBadge status={status} />

        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
        />
      </div>
    </ActionableGlow>
  );
}
export const StatusTaskNode = memo(StatusTaskNodeComponent);

// -------------------------------------------------------------------------
// Status APPROVAL Node
// -------------------------------------------------------------------------
function StatusApprovalNodeComponent({
  data,
}: NodeProps<Node<StatusNodeData, "approval">>) {
  const d = data as StatusNodeData;
  const status = d.nodeStatus ?? "PENDING";
  const isActionable = d.isCurrentUserActionable ?? false;

  return (
    <ActionableGlow isActionable={isActionable}>
      <div
        className={cn(
          "relative w-[280px] rounded-xl border-2 p-4 shadow-lg transition-all duration-300",
          getStatusClasses(status),
          status === "SKIPPED" && "line-through decoration-gray-400/60 decoration-2",
          status === "IN_PROGRESS" && "animate-[pulse_3s_ease-in-out_infinite]",
        )}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-white !bg-amber-500"
        />

        <StatusOverlay status={status} />
        {d.assignee && <AssigneeAvatar assignee={d.assignee} />}

        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            status === "COMPLETED" || status === "APPROVED"
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
              : status === "IN_PROGRESS"
                ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                : status === "REJECTED"
                  ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
          )}>
            <ShieldCheck className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className={cn(
              "block truncate text-sm font-semibold text-foreground",
              status === "SKIPPED" && "text-muted-foreground line-through",
            )}>
              {d.label}
            </span>
            {d.assignee && (
              <p className="truncate text-[11px] text-muted-foreground">
                {d.assignee.name}
              </p>
            )}
          </div>
        </div>

        <StatusBadge status={status} />

        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-white !bg-amber-500"
        />
      </div>
    </ActionableGlow>
  );
}
export const StatusApprovalNode = memo(StatusApprovalNodeComponent);

// -------------------------------------------------------------------------
// Status CONDITION Node
// -------------------------------------------------------------------------
function StatusConditionNodeComponent({
  data,
}: NodeProps<Node<StatusNodeData, "condition">>) {
  const d = data as StatusNodeData;
  const status = d.nodeStatus ?? "PENDING";

  return (
    <div className={cn("flex flex-col items-center", status === "SKIPPED" && "opacity-40")}>
      <div className="relative">
        <StatusOverlay status={status} />
        <div
          className={cn(
            "relative flex h-[100px] w-[100px] rotate-45 items-center justify-center rounded-xl border-2 shadow-lg transition-all duration-300",
            getStatusClasses(status),
          )}
        >
          <Handle
            type="target"
            position={Position.Top}
            className="!h-3 !w-3 !border-2 !border-white !bg-purple-500"
          />
          <div className="-rotate-45 flex flex-col items-center gap-1">
            <div className={cn(
              "flex size-6 items-center justify-center rounded-md",
              status === "IN_PROGRESS"
                ? "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
            )}>
              <GitBranch className="size-3.5" />
            </div>
            <span className="max-w-[70px] truncate text-center text-[10px] font-semibold text-foreground">
              {d.label}
            </span>
          </div>
          <Handle
            type="source"
            position={Position.Bottom}
            id="rejected"
            className="!h-3 !w-3 !border-2 !border-white !bg-red-500"
            style={{ left: "25%", bottom: "-6px" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="approved"
            className="!h-3 !w-3 !border-2 !border-white !bg-emerald-500"
            style={{ left: "75%", bottom: "-6px" }}
          />
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}
export const StatusConditionNode = memo(StatusConditionNodeComponent);
