"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Rocket,
  Circle,
  FileInput,
} from "lucide-react";

import { useFlowBuilderStore } from "@/stores/flow-builder-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { IntakeFormEditor } from "@/components/flow-builder/intake-form-editor";
import { usePolling } from "@/hooks/use-polling";

interface FlowToolbarProps {
  onSave: () => Promise<void>;
  onValidate: () => Promise<void>;
  onPublish: () => Promise<void>;
}

interface CategoryOption {
  id: string;
  name: string;
}

export function FlowToolbar({ onSave, onValidate, onPublish }: FlowToolbarProps) {
  const { data: categories } = usePolling<CategoryOption[]>("/api/categories", { interval: 60000 });
  const templateName = useFlowBuilderStore((s) => s.templateName);
  const templateDescription = useFlowBuilderStore((s) => s.templateDescription);
  const templateCategory = useFlowBuilderStore((s) => s.templateCategory);
  const setTemplateName = useFlowBuilderStore((s) => s.setTemplateName);
  const setTemplateDescription = useFlowBuilderStore(
    (s) => s.setTemplateDescription
  );
  const setTemplateCategory = useFlowBuilderStore((s) => s.setTemplateCategory);
  const isDirty = useFlowBuilderStore((s) => s.isDirty);

  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showFormEditor, setShowFormEditor] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      await onValidate();
    } finally {
      setIsValidating(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await onPublish();
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex items-center gap-3 border-b bg-background px-4 py-2">
      {/* Back button */}
      <Link href="/workflows" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Back to workflows">
        <ArrowLeft className="size-4" />
      </Link>

      <Separator orientation="vertical" className="!h-6" />

      {/* Template name (inline editable) */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="h-7 border-transparent bg-transparent px-1.5 text-sm font-semibold hover:border-input focus-visible:border-ring"
            placeholder="Workflow name"
          />
          <Select value={templateCategory} onValueChange={(v) => { if (v) setTemplateCategory(v); }}>
            <SelectTrigger className="h-7 w-[180px] shrink-0 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {(categories ?? []).map((cat) => (
                <SelectItem key={cat.id} value={cat.name}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          value={templateDescription}
          onChange={(e) => setTemplateDescription(e.target.value)}
          className="h-6 border-transparent bg-transparent px-1.5 text-xs text-muted-foreground hover:border-input focus-visible:border-ring"
          placeholder="Add a description..."
        />
      </div>

      {/* Unsaved changes indicator */}
      {isDirty && (
        <Badge variant="outline" className="shrink-0 gap-1.5">
          <Circle className="size-2 fill-amber-500 text-amber-500" />
          Unsaved changes
        </Badge>
      )}

      <Separator orientation="vertical" className="!h-6" />

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={handleValidate}
          disabled={isValidating}
        >
          <CheckCircle2 className="size-3.5" data-icon="inline-start" />
          {isValidating ? "Validating..." : "Validate"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFormEditor(true)}
          className="gap-1"
        >
          <FileInput className="size-3.5" data-icon="inline-start" />
          Form
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
        >
          <Save className="size-3.5" data-icon="inline-start" />
          {isSaving ? "Saving..." : "Save"}
        </Button>

        <Button
          size="sm"
          onClick={handlePublish}
          disabled={isPublishing}
        >
          <Rocket className="size-3.5" data-icon="inline-start" />
          {isPublishing ? "Publishing..." : "Publish"}
        </Button>
      </div>

      <Dialog open={showFormEditor} onOpenChange={setShowFormEditor}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Intake Form</DialogTitle>
            <DialogDescription>
              Define the fields that requesters must fill out when starting this workflow
            </DialogDescription>
          </DialogHeader>
          <IntakeFormEditor />
        </DialogContent>
      </Dialog>
    </div>
  );
}
