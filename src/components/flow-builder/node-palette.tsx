"use client";

import type { DragEvent } from "react";
import {
  Play,
  Square,
  ClipboardList,
  ShieldCheck,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowNodeType } from "@/types/flow";

interface PaletteItem {
  type: FlowNodeType;
  label: string;
  icon: React.ElementType;
  color: string; // Tailwind border/bg accent
  bgColor: string;
}

const paletteItems: PaletteItem[] = [
  {
    type: "start",
    label: "Start",
    icon: Play,
    color: "border-green-500 text-green-700 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/40",
  },
  {
    type: "task",
    label: "Task",
    icon: ClipboardList,
    color: "border-blue-500 text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
  },
  {
    type: "approval",
    label: "Approval",
    icon: ShieldCheck,
    color: "border-amber-500 text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
  },
  {
    type: "condition",
    label: "Condition",
    icon: GitBranch,
    color: "border-purple-500 text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
  },
  {
    type: "end",
    label: "End",
    icon: Square,
    color: "border-red-500 text-red-700 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/40",
  },
];

function onDragStart(event: DragEvent<HTMLDivElement>, nodeType: FlowNodeType) {
  event.dataTransfer.setData("application/reactflow-node-type", nodeType);
  event.dataTransfer.effectAllowed = "move";
}

export function NodePalette() {
  return (
    <div className="flex h-full w-60 flex-col border-r bg-background">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Node Palette</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Drag nodes onto the canvas
        </p>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {paletteItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              className={cn(
                "flex cursor-grab items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 transition-colors",
                "hover:bg-muted/60 active:cursor-grabbing",
                item.color,
                item.bgColor
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
