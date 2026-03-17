"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StartNode as StartNodeType } from "@/types/flow";

function StartNodeComponent({ data, selected }: NodeProps<StartNodeType>) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-green-500 px-6 py-3 shadow-md transition-all",
        "min-w-[120px]",
        selected
          ? "ring-2 ring-green-300 ring-offset-2 ring-offset-background"
          : "ring-0"
      )}
    >
      <Play className="mr-2 h-4 w-4 text-white" />
      <span className="text-sm font-semibold text-white">{data.label}</span>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white !bg-green-700"
      />
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
