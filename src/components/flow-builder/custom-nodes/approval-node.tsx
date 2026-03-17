"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ApprovalNode as ApprovalNodeType } from "@/types/flow";

const strategyLabels: Record<string, string> = {
  ALL_MUST_APPROVE: "All Must Approve",
  ANY_CAN_APPROVE: "Any Can Approve",
  SEQUENTIAL: "Sequential",
};

function ApprovalNodeComponent({ data, selected }: NodeProps<ApprovalNodeType>) {
  return (
    <div
      className={cn(
        "w-[260px] rounded-lg border-2 border-amber-400 bg-card p-4 shadow-md transition-all",
        selected
          ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-background"
          : "ring-0"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-amber-500"
      />

      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-500" />
        <span className="truncate text-sm font-semibold text-foreground">
          {data.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <Badge variant="secondary" className="text-[10px]">
          {strategyLabels[data.strategy] ?? data.strategy}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {data.requiredCount} required
        </Badge>
      </div>

      {data.approverRoleIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.approverRoleIds.map((roleId) => (
            <Badge key={roleId} variant="secondary" className="text-[10px]">
              {roleId}
            </Badge>
          ))}
        </div>
      )}

      {data.instructions && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {data.instructions}
        </p>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white !bg-amber-500"
      />
    </div>
  );
}

export const ApprovalNode = memo(ApprovalNodeComponent);
