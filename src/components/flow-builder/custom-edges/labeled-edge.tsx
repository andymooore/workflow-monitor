"use client";

import { memo } from "react";
import {
  getSmoothStepPath,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { LabeledEdgeData } from "@/types/flow";

function LabeledEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps & { data?: LabeledEdgeData }) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const label = data?.label;
  const conditionBranch = data?.conditionBranch;

  // Determine label text and color for condition branches
  let displayLabel = label;
  let labelColorClass = "bg-muted text-muted-foreground";

  if (conditionBranch === "APPROVED_PATH") {
    displayLabel = displayLabel ?? "Approved";
    labelColorClass = "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400";
  } else if (conditionBranch === "REJECTED_PATH") {
    displayLabel = displayLabel ?? "Rejected";
    labelColorClass = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
  }

  // Determine edge stroke color
  let strokeClass = "stroke-muted-foreground";
  if (conditionBranch === "APPROVED_PATH") {
    strokeClass = "stroke-green-500";
  } else if (conditionBranch === "REJECTED_PATH") {
    strokeClass = "stroke-red-500";
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={cn(
          strokeClass,
          selected ? "!stroke-[3px]" : "!stroke-[2px]"
        )}
      />

      {displayLabel && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-auto absolute rounded-full px-2 py-0.5 text-[10px] font-medium shadow-sm",
              labelColorClass
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const LabeledEdge = memo(LabeledEdgeComponent);
