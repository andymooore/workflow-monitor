"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useFlowBuilderStore } from "@/stores/flow-builder-store";
import { FlowCanvas } from "@/components/flow-builder/flow-canvas";
import { NodePalette } from "@/components/flow-builder/node-palette";
import { NodeConfigPanel } from "@/components/flow-builder/node-config-panel";
import { FlowToolbar } from "@/components/flow-builder/flow-toolbar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Keyboard } from "lucide-react";

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
      return roleIds.map((roleId) => ({
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

export default function NewWorkflowPage() {
  const router = useRouter();
  const reset = useFlowBuilderStore((s) => s.reset);
  const markClean = useFlowBuilderStore((s) => s.markClean);
  const setTemplateId = useFlowBuilderStore((s) => s.setTemplateId);
  const isDirty = useFlowBuilderStore((s) => s.isDirty);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Reset store on mount for a fresh canvas
  useEffect(() => {
    reset();
  }, [reset]);

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
  }, []);

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

    const res = await fetch("/api/workflows/templates", {
      method: "POST",
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

    const template = await res.json();
    setTemplateId(template.id);
    markClean();
    setValidationErrors([]);
    toast.success("Template saved successfully");

    // Update URL without full reload
    window.history.replaceState(null, "", `/workflows/${template.id}`);
    router.replace(`/workflows/${template.id}`);
  }, [router, markClean, setTemplateId]);

  const handleValidate = useCallback(async () => {
    const store = useFlowBuilderStore.getState();

    if (!store.templateId) {
      toast.error("Save the template first before validating");
      return;
    }

    const res = await fetch(
      `/api/workflows/templates/${store.templateId}/publish`,
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
  }, []);

  const handlePublish = useCallback(async () => {
    const store = useFlowBuilderStore.getState();

    if (!store.templateId) {
      toast.error("Save the template first before publishing");
      return;
    }

    if (store.isDirty) {
      toast.error("Save unsaved changes before publishing");
      return;
    }

    const res = await fetch(
      `/api/workflows/templates/${store.templateId}/publish`,
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
    toast.success("Template published successfully!");
  }, []);

  const handleNavigationAttempt = useCallback(
    (path: string) => {
      if (isDirty) {
        setPendingNavigation(path);
        setShowUnsavedDialog(true);
      } else {
        router.push(path);
      }
    },
    [isDirty, router],
  );

  const confirmNavigation = useCallback(() => {
    setShowUnsavedDialog(false);
    if (pendingNavigation) {
      router.push(pendingNavigation);
    }
  }, [pendingNavigation, router]);

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col">
      <FlowToolbar
        onSave={handleSave}
        onValidate={handleValidate}
        onPublish={handlePublish}
      />

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
            <Button variant="destructive" onClick={confirmNavigation}>
              Discard Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
