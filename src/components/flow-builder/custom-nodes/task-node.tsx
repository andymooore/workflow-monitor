"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaskNode as TaskNodeType } from "@/types/flow";

function TaskNodeComponent({ data, selected }: NodeProps<TaskNodeType>) {
  return (
    <div
      className={cn(
        "w-[260px] rounded-lg border-2 border-blue-400 bg-card p-4 shadow-md transition-all",
        selected
          ? "ring-2 ring-blue-300 ring-offset-2 ring-offset-background"
          : "ring-0"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
      />

      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 shrink-0 text-blue-500" />
        <span className="truncate text-sm font-semibold text-foreground">
          {data.label}
        </span>
      </div>

      {data.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {data.description}
        </p>
      )}

      {data.assignedRoleIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {data.assignedRoleIds.map((roleId) => (
            <Badge key={roleId} variant="secondary" className="text-[10px]">
              {roleId}
            </Badge>
          ))}
        </div>
      )}

      {data.handbackToOwner && (
        <div className="mt-2">
          <Badge variant="outline" className="text-[10px]">
            Handback to owner
          </Badge>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
      />
    </div>
  );
}

export const TaskNode = memo(TaskNodeComponent);
