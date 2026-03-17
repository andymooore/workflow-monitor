"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConditionNode as ConditionNodeType } from "@/types/flow";

function ConditionNodeComponent({ data, selected }: NodeProps<ConditionNodeType>) {
  return (
    <div className="flex flex-col items-center">
      {/* Diamond shape */}
      <div
        className={cn(
          "relative flex h-[100px] w-[100px] rotate-45 items-center justify-center rounded-lg border-2 border-purple-400 bg-card shadow-md transition-all",
          selected
            ? "ring-2 ring-purple-300 ring-offset-2 ring-offset-background"
            : "ring-0"
        )}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-white !bg-purple-500"
        />

        {/* Inner content rotated back */}
        <div className="-rotate-45 flex flex-col items-center gap-1">
          <GitBranch className="h-4 w-4 text-purple-500" />
          <span className="max-w-[70px] truncate text-center text-[10px] font-semibold text-foreground">
            {data.label}
          </span>
        </div>

        {/* Rejected handle - bottom-left of diamond */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="rejected"
          className="!h-3 !w-3 !border-2 !border-white !bg-red-500"
          style={{ left: "25%", bottom: "-6px" }}
        />

        {/* Approved handle - bottom-right of diamond */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="approved"
          className="!h-3 !w-3 !border-2 !border-white !bg-green-500"
          style={{ left: "75%", bottom: "-6px" }}
        />
      </div>

      {/* Labels beneath the diamond */}
      <div className="mt-2 flex w-[140px] justify-between px-1">
        <span className="text-[9px] font-medium text-red-500">Rejected</span>
        <span className="text-[9px] font-medium text-green-600">Approved</span>
      </div>
    </div>
  );
}

export const ConditionNode = memo(ConditionNodeComponent);
