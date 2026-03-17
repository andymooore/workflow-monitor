import {
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  PauseCircle,
  AlertTriangle,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StatusType =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "RUNNING"
  | "FAILED"
  | "CANCELLED"
  | "PENDING"
  | "PAUSED"
  | "WAITING"
  | "SKIPPED"
  | "APPROVED"
  | "REJECTED"
  | string;

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
  size?: "sm" | "default";
  showIcon?: boolean;
}

const statusConfig: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    className: string;
    pulse?: boolean;
  }
> = {
  COMPLETED: {
    label: "Completed",
    icon: CheckCircle2,
    className:
      "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    className:
      "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  IN_PROGRESS: {
    label: "In Progress",
    icon: Loader2,
    className:
      "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    pulse: true,
  },
  RUNNING: {
    label: "Running",
    icon: Loader2,
    className:
      "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    pulse: true,
  },
  FAILED: {
    label: "Failed",
    icon: XCircle,
    className:
      "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  },
  REJECTED: {
    label: "Rejected",
    icon: XCircle,
    className:
      "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: XCircle,
    className:
      "bg-gray-500/10 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  },
  PENDING: {
    label: "Pending",
    icon: Clock,
    className:
      "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  },
  WAITING: {
    label: "Waiting",
    icon: Clock,
    className:
      "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  },
  PAUSED: {
    label: "Paused",
    icon: PauseCircle,
    className:
      "bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
  },
  SKIPPED: {
    label: "Skipped",
    icon: AlertTriangle,
    className:
      "bg-gray-500/10 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400",
  },
};

const fallbackConfig = {
  label: "Unknown",
  icon: Circle,
  className:
    "bg-gray-500/10 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
};

export function StatusBadge({
  status,
  className,
  size = "default",
  showIcon = true,
}: StatusBadgeProps) {
  const config = statusConfig[status] || {
    ...fallbackConfig,
    label: status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  };
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        config.className,
        className
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5",
            config.pulse && "animate-pulse-dot"
          )}
        />
      )}
      {config.label}
    </span>
  );
}
