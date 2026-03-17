"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import type { Node, Edge } from "@xyflow/react";

import { useFlowBuilderStore } from "@/stores/flow-builder-store";
import type { WorkflowNodeData, LabeledEdgeData, TaskNodeData, ApprovalNodeData } from "@/types/flow";
import { FlowCanvas } from "@/components/flow-builder/flow-canvas";
import { NodePalette } from "@/components/flow-builder/node-palette";
import { NodeConfigPanel } from "@/components/flow-builder/node-config-panel";
import { FlowToolbar } from "@/components/flow-builder/flow-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle, CheckCircle2, Keyboard, Activity } from "lucide-react";

/**
 * Convert API template data into React Flow nodes and edges
 * that the flow builder store expects.
 */
function apiNodesToFlowNodes(
  apiNodes: Array<{
    id: string;
    type: string;
    label: string;
    positionX: number;
    positionY: number;
    config: Record<string, unknown>;
    roleAssignments: Array<{
      roleId: string;
      assignToOwner: boolean;
      role: { id: string; name: string };
    }>;
  }>,
): Node<WorkflowNodeData>[] {
  return apiNodes.map((n) => {
    const type = n.type.toLowerCase();
    const config = (n.config ?? {}) as Record<string, unknown>;
    let data: WorkflowNodeData;

    switch (type) {
      case "start":
        data = { label: n.label };
        break;
      case "end":
        data = { label: n.label };
        break;
      case "task":
        data = {
          label: n.label,
          description: (config.description as string) ?? "",
          assignedRoleIds: n.roleAssignments.map((ra) => ra.roleId),
          handbackToOwner: n.roleAssignments.some((ra) => ra.assignToOwner),
          ...(config.notifications ? { notifications: config.notifications as TaskNodeData["notifications"] } : {}),
        };
        break;
      case "approval":
        data = {
          label: n.label,
          strategy:
            (config.strategy as "ALL_MUST_APPROVE" | "ANY_CAN_APPROVE" | "SEQUENTIAL") ??
            "ALL_MUST_APPROVE",
          requiredCount: (config.requiredCount as number) ?? 1,
          approverRoleIds: n.roleAssignments.map((ra) => ra.roleId),
          instructions: (config.instructions as string) ?? "",
          ...(config.notifications ? { notifications: config.notifications as ApprovalNodeData["notifications"] } : {}),
        };
        break;
      case "condition":
        data = {
          label: n.label,
          sourceApprovalNodeId: config.sourceApprovalNodeId as string | undefined,
        };
        break;
      default:
        data = { label: n.label };
    }

    return {
      id: n.id,
      type,
      position: { x: n.positionX, y: n.positionY },
      data,
    };
  });
}

function apiEdgesToFlowEdges(
  apiEdges: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    label: string | null;
    conditionBranch: string | null;
  }>,
): Edge<LabeledEdgeData>[] {
  return apiEdges.map((e) => ({
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    type: "labeled",
    data: {
      label: e.label ?? undefined,
      conditionBranch: e.conditionBranch as LabeledEdgeData["conditionBranch"],
    },
  }));
}

/**
 * Serialize store nodes/edges into the shape the API expects.
 */
function serializeForApi(store: ReturnType<typeof useFlowBuilderStore.getState>) {
  const nodes = store.nodes.map((n) => ({
    id: n.id,
    type: (n.type ?? "task").toUpperCase(),
    label: (n.data as Record<string, unknown>).label as string,
    positionX: n.position.x,
    positionY: n.position.y,
    config: (() => {
      const data = { ...n.data } as Record<string, unknown>;
      delete data.label;
      return data;
    })(),
    roleAssignments: (() => {
      const data = n.data as Record<string, unknown>;
      const roleIds =
        (data.assignedRoleIds as string[] | undefined) ??
        (data.approverRoleIds as string[] | undefined) ??
        [];
      const handbackToOwner = (data.handbackToOwner as boolean | undefined) ?? false;
      return roleIds.map((roleId: string) => ({
        roleId,
        assignToOwner: handbackToOwner,
      }));
    })(),
  }));

  const edges = store.edges.map((e) => ({
    id: e.id,
    sourceId: e.source,
    targetId: e.target,
    label: (e.data as Record<string, unknown> | undefined)?.label as string | undefined,
    conditionBranch: (e.data as Record<string, unknown> | undefined)?.conditionBranch as
      | string
      | undefined,
  }));

  return { nodes, edges };
}

export default function EditWorkflowPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const loadTemplate = useFlowBuilderStore((s) => s.loadTemplate);
  const markClean = useFlowBuilderStore((s) => s.markClean);
  const isDirty = useFlowBuilderStore((s) => s.isDirty);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [instanceCount, setInstanceCount] = useState(0);
  const [hasActiveInstances, setHasActiveInstances] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [templateVersion, setTemplateVersion] = useState(1);

  // Load existing template on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/workflows/templates/${templateId}`);
        if (!res.ok) throw new Error("Failed to load template");
        const template = await res.json();

        const flowNodes = apiNodesToFlowNodes(template.nodes);
        const flowEdges = apiEdgesToFlowEdges(template.edges);

        loadTemplate({
          id: template.id,
          name: template.name,
          description: template.description ?? "",
          category: template.category ?? "General",
          intakeForm: template.intakeForm ?? { steps: [] },
          nodes: flowNodes,
          edges: flowEdges,
        });

        setIsPublished(template.isPublished ?? false);
        setInstanceCount(template._count?.instances ?? 0);
        setHasActiveInstances((template._count?.instances ?? 0) > 0 && template.isPublished);
        setTemplateVersion(template.version ?? 1);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [templateId, loadTemplate]);

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Unsaved changes warning on browser navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useFlowBuilderStore.getState().isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleSave = useCallback(async () => {
    const store = useFlowBuilderStore.getState();
    const { nodes, edges } = serializeForApi(store);

    if (!store.templateName.trim()) {
      toast.error("Please enter a workflow name before saving");
      return;
    }

    const res = await fetch(`/api/workflows/templates/${templateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: store.templateName,
        description: store.templateDescription,
        category: store.templateCategory,
        intakeForm: store.templateIntakeForm,
        nodes,
        edges,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Save failed" }));
      toast.error(err.error ?? "Failed to save template");
      return;
    }

    markClean();
    setValidationErrors([]);
    toast.success("Template saved successfully");
  }, [templateId, markClean]);

  const handleValidate = useCallback(async () => {
    const res = await fetch(
      `/api/workflows/templates/${templateId}/publish`,
      { method: "POST" },
    );

    const data = await res.json();

    if (!res.ok || !data.valid) {
      const errors: Array<{ message: string; nodeId?: string }> = data.errors ?? [{ message: data.error }];
      setValidationErrors(errors.map((e) => e.message));
      for (const err of errors) {
        toast.error(err.message);
      }
      return;
    }

    setValidationErrors([]);
    toast.success("Template is valid and ready to publish");
  }, [templateId]);

  const handlePublish = useCallback(async () => {
    const store = useFlowBuilderStore.getState();

    if (store.isDirty) {
      toast.error("Save unsaved changes before publishing");
      return;
    }

    const res = await fetch(
      `/api/workflows/templates/${templateId}/publish`,
      { method: "POST" },
    );

    const data = await res.json();

    if (!res.ok || !data.valid) {
      const errors: Array<{ message: string; nodeId?: string }> = data.errors ?? [{ message: data.error }];
      setValidationErrors(errors.map((e) => e.message));
      for (const err of errors) {
        toast.error(err.message);
      }
      return;
    }

    setIsPublished(true);
    setValidationErrors([]);
    toast.success("Template published successfully!");
  }, [templateId]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3">
        <div className="relative">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="absolute inset-0 h-8 w-8 animate-ping rounded-full bg-primary/10" />
        </div>
        <p className="text-sm text-muted-foreground">Loading workflow template...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <div className="text-center">
          <p className="font-medium text-destructive">{loadError}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The template may have been deleted or you lack access.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col">
      <FlowToolbar
        onSave={handleSave}
        onValidate={handleValidate}
        onPublish={handlePublish}
      />

      {/* Status indicators bar */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-1.5">
        {isPublished && (
          <Badge variant="default" className="gap-1.5 text-[10px]">
            <CheckCircle2 className="size-3" />
            Published
          </Badge>
        )}
        {!isPublished && (
          <Badge variant="outline" className="text-[10px]">
            Draft
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px]">
          v{templateVersion}
        </Badge>
        {instanceCount > 0 && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Activity className="size-3" />
            {instanceCount} instance{instanceCount !== 1 ? "s" : ""}
          </Badge>
        )}
        {hasActiveInstances && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3" />
            <span>Active instances exist - changes may affect running workflows</span>
          </div>
        )}
      </div>

      {/* Validation errors bar */}
      {validationErrors.length > 0 && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 dark:border-red-900 dark:bg-red-950/30">
          <span className="text-xs font-medium text-red-600 dark:text-red-400">
            Validation errors:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {validationErrors.map((err, i) => (
              <Badge key={i} variant="destructive" className="text-[10px]">
                {err}
              </Badge>
            ))}
          </div>
          <button
            className="ml-auto text-xs text-red-400 hover:text-red-600"
            onClick={() => setValidationErrors([])}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <div className="relative flex-1">
          <FlowCanvas />
          {/* Keyboard shortcuts hint */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
            <Keyboard className="size-3" />
            <span>
              <kbd className="rounded border bg-muted px-1 font-mono text-[9px]">Ctrl+S</kbd> Save
            </span>
            <span className="text-border">|</span>
            <span>
              <kbd className="rounded border bg-muted px-1 font-mono text-[9px]">Del</kbd> Remove node
            </span>
          </div>
        </div>
        <NodeConfigPanel />
      </div>

      {/* Unsaved changes confirmation dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes that will be lost. Do you want to continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnsavedDialog(false)}>
              Stay & Save
            </Button>
            <Button variant="destructive" onClick={() => setShowUnsavedDialog(false)}>
              Discard Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
