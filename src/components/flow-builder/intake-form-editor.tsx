"use client";

import { useCallback } from "react";
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Layers } from "lucide-react";
import { useFlowBuilderStore } from "@/stores/flow-builder-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
  { value: "select", label: "Dropdown" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
] as const;

type FieldType = "text" | "textarea" | "select" | "date" | "number";

interface IntakeField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder: string;
  options: string[];
  defaultValue: string;
}

interface IntakeStep {
  id: string;
  title: string;
  description: string;
  fields: IntakeField[];
}

export function IntakeFormEditor() {
  const intakeForm = useFlowBuilderStore((s) => s.templateIntakeForm);
  const setIntakeForm = useFlowBuilderStore((s) => s.setTemplateIntakeForm);
  const steps = intakeForm.steps;

  const updateSteps = useCallback((newSteps: IntakeStep[]) => {
    setIntakeForm({ steps: newSteps });
  }, [setIntakeForm]);

  const addStep = useCallback(() => {
    updateSteps([...steps, {
      id: `step_${Date.now()}`,
      title: `Step ${steps.length + 1}`,
      description: "",
      fields: [],
    }]);
  }, [steps, updateSteps]);

  const updateStep = useCallback((stepIndex: number, updates: Partial<IntakeStep>) => {
    const updated = [...steps];
    updated[stepIndex] = { ...updated[stepIndex], ...updates };
    updateSteps(updated);
  }, [steps, updateSteps]);

  const removeStep = useCallback((stepIndex: number) => {
    updateSteps(steps.filter((_, i) => i !== stepIndex));
  }, [steps, updateSteps]);

  const moveStep = useCallback((stepIndex: number, direction: -1 | 1) => {
    const newIndex = stepIndex + direction;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const updated = [...steps];
    [updated[stepIndex], updated[newIndex]] = [updated[newIndex], updated[stepIndex]];
    updateSteps(updated);
  }, [steps, updateSteps]);

  const addField = useCallback((stepIndex: number) => {
    const updated = [...steps];
    updated[stepIndex] = {
      ...updated[stepIndex],
      fields: [...updated[stepIndex].fields, {
        id: `field_${Date.now()}`,
        label: "New Field",
        type: "text" as FieldType,
        required: false,
        placeholder: "",
        options: [],
        defaultValue: "",
      }],
    };
    updateSteps(updated);
  }, [steps, updateSteps]);

  const updateField = useCallback((stepIndex: number, fieldIndex: number, updates: Partial<IntakeField>) => {
    const updated = [...steps];
    const fields = [...updated[stepIndex].fields];
    fields[fieldIndex] = { ...fields[fieldIndex], ...updates };
    updated[stepIndex] = { ...updated[stepIndex], fields };
    updateSteps(updated);
  }, [steps, updateSteps]);

  const removeField = useCallback((stepIndex: number, fieldIndex: number) => {
    const updated = [...steps];
    updated[stepIndex] = {
      ...updated[stepIndex],
      fields: updated[stepIndex].fields.filter((_, i) => i !== fieldIndex),
    };
    updateSteps(updated);
  }, [steps, updateSteps]);

  const moveField = useCallback((stepIndex: number, fieldIndex: number, direction: -1 | 1) => {
    const newIndex = fieldIndex + direction;
    const fields = steps[stepIndex].fields;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const updated = [...steps];
    const newFields = [...fields];
    [newFields[fieldIndex], newFields[newIndex]] = [newFields[newIndex], newFields[fieldIndex]];
    updated[stepIndex] = { ...updated[stepIndex], fields: newFields };
    updateSteps(updated);
  }, [steps, updateSteps]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Request Form Steps</h3>
          <p className="text-[11px] text-muted-foreground">
            Define the steps and fields requesters must complete
          </p>
        </div>
        <Button size="xs" variant="outline" onClick={addStep} className="gap-1">
          <Plus className="size-3" />
          Add Step
        </Button>
      </div>

      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Layers className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">
            No form steps defined. Requesters will only provide title, client, and priority.
          </p>
          <Button size="xs" variant="outline" onClick={addStep} className="mt-3 gap-1">
            <Plus className="size-3" />
            Add First Step
          </Button>
        </div>
      ) : (
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-3 pr-2">
            {steps.map((step, stepIndex) => (
              <Card key={step.id} className="border-primary/20">
                <CardContent className="p-3 space-y-3">
                  {/* Step header */}
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      Step {stepIndex + 1}
                    </Badge>
                    <Input
                      value={step.title}
                      onChange={(e) => updateStep(stepIndex, { title: e.target.value })}
                      className="h-7 text-xs font-medium flex-1"
                      placeholder="Step title"
                    />
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button size="icon-xs" variant="ghost" onClick={() => moveStep(stepIndex, -1)} disabled={stepIndex === 0}>
                        <ChevronUp className="size-3" />
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => moveStep(stepIndex, 1)} disabled={stepIndex === steps.length - 1}>
                        <ChevronDown className="size-3" />
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => removeStep(stepIndex)}>
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <Input
                    value={step.description}
                    onChange={(e) => updateStep(stepIndex, { description: e.target.value })}
                    className="h-6 text-[11px] text-muted-foreground"
                    placeholder="Step description (shown to requester)"
                  />

                  <Separator />

                  {/* Fields in this step */}
                  {step.fields.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-2">No fields in this step</p>
                  ) : (
                    <div className="space-y-2">
                      {step.fields.map((field, fieldIndex) => (
                        <div key={field.id} className="flex items-center gap-2 rounded border p-2 bg-muted/30">
                          <GripVertical className="size-3 text-muted-foreground/40 shrink-0" />
                          <Input
                            value={field.label}
                            onChange={(e) => updateField(stepIndex, fieldIndex, { label: e.target.value })}
                            className="h-6 text-[11px] flex-1"
                            placeholder="Field label"
                          />
                          <Select
                            value={field.type}
                            onValueChange={(v) => { if (v) updateField(stepIndex, fieldIndex, { type: v as FieldType }); }}
                          >
                            <SelectTrigger className="h-6 w-[80px] text-[10px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((ft) => (
                                <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                              field.required
                                ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                                : "bg-muted text-muted-foreground hover:bg-accent"
                            }`}
                            onClick={() => updateField(stepIndex, fieldIndex, { required: !field.required })}
                          >
                            {field.required ? "Req" : "Opt"}
                          </button>
                          <div className="flex gap-0.5 shrink-0">
                            <Button size="icon-xs" variant="ghost" onClick={() => moveField(stepIndex, fieldIndex, -1)} disabled={fieldIndex === 0}>
                              <ChevronUp className="size-2.5" />
                            </Button>
                            <Button size="icon-xs" variant="ghost" onClick={() => moveField(stepIndex, fieldIndex, 1)} disabled={fieldIndex === step.fields.length - 1}>
                              <ChevronDown className="size-2.5" />
                            </Button>
                            <Button size="icon-xs" variant="ghost" onClick={() => removeField(stepIndex, fieldIndex)}>
                              <Trash2 className="size-2.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Select options editor for select fields */}
                  {step.fields.some(f => f.type === "select") && (
                    <div className="space-y-1">
                      {step.fields.map((field, fieldIndex) =>
                        field.type === "select" ? (
                          <div key={field.id} className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground shrink-0 w-20 truncate">{field.label}:</span>
                            <Input
                              value={field.options.join(", ")}
                              onChange={(e) => updateField(stepIndex, fieldIndex, {
                                options: e.target.value.split(",").map(o => o.trim()).filter(Boolean),
                              })}
                              className="h-6 text-[10px] flex-1"
                              placeholder="Option 1, Option 2, Option 3"
                            />
                          </div>
                        ) : null
                      )}
                    </div>
                  )}

                  <Button size="xs" variant="ghost" onClick={() => addField(stepIndex)} className="w-full gap-1 text-[11px]">
                    <Plus className="size-3" />
                    Add Field
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
