"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EndNode as EndNodeType } from "@/types/flow";

function EndNodeComponent({ data, selected }: NodeProps<EndNodeType>) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-red-500 px-6 py-3 shadow-md transition-all",
        "min-w-[120px]",
        selected
          ? "ring-2 ring-red-300 ring-offset-2 ring-offset-background"
          : "ring-0"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-red-700"
      />

      <Square className="mr-2 h-4 w-4 text-white" />
      <span className="text-sm font-semibold text-white">{data.label}</span>
    </div>
  );
}

export const EndNode = memo(EndNodeComponent);
