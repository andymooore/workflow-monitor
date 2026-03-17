"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Loader2,
  PlayCircle,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Inbox,
  ArrowRight,
  ArrowLeft,
  Server,
  Shield,
  KeyRound,
  Rocket,
  FolderOpen,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { InstanceStatus } from "@/generated/prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PublishedTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  version: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string };
  _count: { instances: number };
  intakeForm: Array<{
    id: string;
    label: string;
    type: "text" | "textarea" | "select" | "date" | "number";
    required: boolean;
    placeholder: string;
    options: string[];
    defaultValue: string;
  }> | {
    steps: Array<{
      id: string;
      title: string;
      description: string;
      fields: Array<{
        id: string;
        label: string;
        type: "text" | "textarea" | "select" | "date" | "number";
        required: boolean;
        placeholder: string;
        options: string[];
        defaultValue: string;
      }>;
    }>;
  };
}

interface Instance {
  id: string;
  title: string;
  templateName: string;
  templateId: string;
  ownerName: string;
  ownerId: string;
  status: InstanceStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  progress: { completed: number; total: number };
}

// ─── Category config (resolved from API) ─────────────────────────────────────

interface CategoryRecord {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  sortOrder: number;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Server, Shield, KeyRound, Rocket, FolderOpen, FileText,
};

const COLOR_CLASS: Record<string, { text: string; bg: string; border: string }> = {
  blue: { text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800" },
  amber: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800" },
  purple: { text: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/40", border: "border-purple-200 dark:border-purple-800" },
  emerald: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800" },
  slate: { text: "text-slate-600 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-950/40", border: "border-slate-200 dark:border-slate-800" },
  red: { text: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/40", border: "border-red-200 dark:border-red-800" },
  orange: { text: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-200 dark:border-orange-800" },
  cyan: { text: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-950/40", border: "border-cyan-200 dark:border-cyan-800" },
  pink: { text: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-950/40", border: "border-pink-200 dark:border-pink-800" },
  indigo: { text: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-200 dark:border-indigo-800" },
};

const DEFAULT_COLOR = COLOR_CLASS.slate;

function resolveCategory(cat: CategoryRecord) {
  const colorClasses = COLOR_CLASS[cat.color] ?? DEFAULT_COLOR;
  const icon = ICON_MAP[cat.icon] ?? FolderOpen;
  return { ...colorClasses, icon, description: cat.description ?? "" };
}

function getColorClasses(color: string) {
  return COLOR_CLASS[color] ?? DEFAULT_COLOR;
}

// ─── Intake form normalization ────────────────────────────────────────────────

interface NormalizedIntakeStep {
  id: string;
  title: string;
  description: string;
  fields: Array<{
    id: string;
    label: string;
    type: "text" | "textarea" | "select" | "date" | "number";
    required: boolean;
    placeholder: string;
    options: string[];
    defaultValue: string;
  }>;
}

function normalizeIntakeForm(form: PublishedTemplate["intakeForm"]): NormalizedIntakeStep[] {
  if (!form) return [];
  if (Array.isArray(form)) {
    // Legacy flat format
    return form.length > 0
      ? [{ id: "default", title: "Request Details", description: "", fields: form }]
      : [];
  }
  return (form as { steps: NormalizedIntakeStep[] }).steps ?? [];
}

// ─── Instance status config ──────────────────────────────────────────────────

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RUNNING: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
  DRAFT: "outline",
  FAILED: "destructive",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  RUNNING: Clock,
  COMPLETED: CheckCircle2,
  CANCELLED: XCircle,
  FAILED: AlertCircle,
};

const STATUS_DOT_COLOR: Record<string, string> = {
  RUNNING: "bg-blue-500 animate-pulse",
  COMPLETED: "bg-emerald-500",
  CANCELLED: "bg-red-500",
  FAILED: "bg-red-500",
  DRAFT: "bg-gray-400",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PublishedTemplate | null>(null);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestPriority, setRequestPriority] = useState<string>("Medium");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  interface ClientOption { id: string; name: string; shortCode: string; ministry?: { id: string; name: string; shortCode: string } | null; }
  interface ProjectOption { id: string; name: string; }

  const defaultClientId = (session?.user as any)?.defaultClientId ?? "";

  const { data: templatesRes, isLoading: templatesLoading } = usePolling<{ data: PublishedTemplate[]; total: number }>(
    "/api/workflows/templates?published=true",
    { interval: 30000 },
  );
  const templates = templatesRes?.data ?? null;

  const { data: clientsListRes } = usePolling<{ data: ClientOption[]; total: number }>(
    "/api/clients",
    { interval: 60000 },
  );
  const clientsList = clientsListRes?.data ?? null;

  const { data: projectsList } = usePolling<ProjectOption[]>(
    selectedClientId ? `/api/clients/${selectedClientId}/projects` : "",
    { interval: 60000, enabled: !!selectedClientId },
  );

  const { data: categoryRecords } = usePolling<CategoryRecord[]>(
    "/api/categories",
    { interval: 60000 },
  );

  // Build lookup from category name → CategoryRecord
  const categoryLookup = useMemo(() => {
    const map: Record<string, CategoryRecord> = {};
    for (const cat of categoryRecords ?? []) {
      map[cat.name] = cat;
    }
    return map;
  }, [categoryRecords]);

  const { data: myInstancesRes, isLoading: instancesLoading } = usePolling<{ data: Instance[]; total: number }>(
    userId ? `/api/workflows/instances?ownerId=${userId}` : "",
    { interval: 15000, enabled: !!userId },
  );
  const myInstances = myInstancesRes?.data ?? null;

  // Group templates by category
  const categorized = useMemo(() => {
    const filtered = templates?.filter((t) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }) ?? [];

    const groups: Record<string, PublishedTemplate[]> = {};
    for (const t of filtered) {
      const cat = t.category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }

    // Sort categories by sortOrder from API, then alphabetically for unknowns
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const aCat = categoryLookup[a];
      const bCat = categoryLookup[b];
      const aOrder = aCat?.sortOrder ?? 999;
      const bOrder = bCat?.sortOrder ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.localeCompare(b);
    });

    return { groups, sortedKeys, totalCount: filtered.length };
  }, [templates, searchQuery, categoryLookup]);

  // Filter by active category
  const visibleCategories = activeCategory
    ? categorized.sortedKeys.filter((k) => k === activeCategory)
    : categorized.sortedKeys;

  const runningCount = myInstances?.filter((i) => i.status === "RUNNING").length ?? 0;
  const completedCount = myInstances?.filter((i) => i.status === "COMPLETED").length ?? 0;

  const openRequestDialog = useCallback((template: PublishedTemplate) => {
    setSelectedTemplate(template);
    setRequestTitle(`${template.name} - ${new Date().toLocaleDateString()}`);
    setRequestPriority("Medium");
    setSelectedClientId(defaultClientId || "");
    setSelectedProjectId("");
    // Initialize form values with defaults from all steps
    const defaults: Record<string, string> = {};
    const steps = normalizeIntakeForm(template.intakeForm);
    for (const step of steps) {
      for (const field of step.fields) {
        defaults[field.id] = field.defaultValue ?? "";
      }
    }
    setFormValues(defaults);
    setFormErrors({});
    setCurrentStep(0);
  }, [defaultClientId]);

  // Normalized steps for the selected template
  const templateSteps = useMemo(
    () => (selectedTemplate ? normalizeIntakeForm(selectedTemplate.intakeForm) : []),
    [selectedTemplate],
  );

  // Total wizard steps: 1 (client/project) + N (template steps) + 1 (review)
  const totalSteps = templateSteps.length + 2;

  const validateCurrentStep = useCallback(() => {
    if (!selectedTemplate) return false;
    const errors: Record<string, string> = {};

    if (currentStep === 0) {
      // Built-in step: client, title
      if (!selectedClientId) errors._client = "Client is required";
      if (!requestTitle.trim()) errors._title = "Title is required";
    } else if (currentStep <= templateSteps.length) {
      // Template step fields
      const step = templateSteps[currentStep - 1];
      for (const field of step.fields) {
        if (field.required && !formValues[field.id]?.trim()) {
          errors[field.id] = `${field.label} is required`;
        }
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [selectedTemplate, currentStep, templateSteps, requestTitle, formValues, selectedClientId]);

  const handleNextStep = useCallback(() => {
    if (validateCurrentStep()) {
      setCurrentStep((s) => s + 1);
    }
  }, [validateCurrentStep]);

  const handleSubmitRequest = useCallback(async () => {
    if (!selectedTemplate || !requestTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/workflows/templates/${selectedTemplate.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: requestTitle.trim(),
          priority: requestPriority,
          metadata: { ...formValues },
          clientId: selectedClientId,
          projectId: selectedProjectId || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to submit request" }));
        toast.error(err.error);
        return;
      }

      const instance = await res.json();
      toast.success("Request submitted successfully");
      setSelectedTemplate(null);
      router.push(`/instances/${instance.id}`);
    } catch {
      toast.error("Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedTemplate, requestTitle, requestPriority, formValues, selectedClientId, selectedProjectId, router]);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse available workflows and submit new requests
        </p>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog" className="gap-1.5">
            <FileText className="size-3.5" />
            Service Catalog
            {categorized.totalCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
                {categorized.totalCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="my-requests" className="gap-1.5">
            <PlayCircle className="size-3.5" />
            My Requests
            {runningCount > 0 && (
              <Badge variant="default" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
                {runningCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Service Catalog Tab ── */}
        <TabsContent value="catalog" className="mt-6 space-y-6">
          {/* Search + category filter */}
          {(templates?.length ?? 0) > 0 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search workflows by name, description, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Category pills */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeCategory === null
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  All
                  <span className="tabular-nums">{categorized.totalCount}</span>
                </button>
                {categorized.sortedKeys.map((cat) => {
                  const catRecord = categoryLookup[cat];
                  const colorClasses = getColorClasses(catRecord?.color ?? "slate");
                  const Icon = ICON_MAP[catRecord?.icon ?? "FolderOpen"] ?? FolderOpen;
                  const count = categorized.groups[cat].length;
                  const isActive = activeCategory === cat;

                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(isActive ? null : cat)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : `${colorClasses.bg} ${colorClasses.text} hover:opacity-80`
                      }`}
                    >
                      <Icon className="size-3" />
                      {cat}
                      <span className="tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {templatesLoading ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading available workflows...</p>
            </div>
          ) : visibleCategories.length > 0 ? (
            <div className="space-y-8">
              {visibleCategories.map((cat) => {
                const catRecord = categoryLookup[cat];
                const resolved = catRecord
                  ? resolveCategory(catRecord)
                  : { ...DEFAULT_COLOR, icon: FolderOpen, description: "" };
                const Icon = resolved.icon;
                const items = categorized.groups[cat];

                return (
                  <section key={cat}>
                    {/* Category header */}
                    <div className="mb-4 flex items-start gap-3">
                      <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${resolved.bg}`}>
                        <Icon className={`size-5 ${resolved.text}`} />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold">{cat}</h2>
                        <p className="text-sm text-muted-foreground">{resolved.description}</p>
                      </div>
                    </div>

                    {/* Template cards */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((template) => (
                        <Card
                          key={template.id}
                          className={`group relative flex flex-col transition-all duration-200 hover:shadow-md hover:shadow-primary/5 ${resolved.border} hover:border-primary/40`}
                        >
                          <CardContent className="flex flex-1 flex-col p-4">
                            <div className="flex-1">
                              <h3 className="font-medium leading-snug group-hover:text-primary transition-colors">
                                {template.name}
                              </h3>
                              {template.description ? (
                                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                                  {template.description}
                                </p>
                              ) : (
                                <p className="mt-1.5 text-sm text-muted-foreground/50 italic">
                                  No description
                                </p>
                              )}
                            </div>

                            <div className="mt-3 flex items-center justify-between border-t pt-3">
                              <span className="text-[11px] text-muted-foreground">
                                {template._count.instances} request{template._count.instances !== 1 ? "s" : ""}
                              </span>
                              <Button
                                size="sm"
                                className="gap-1.5"
                                onClick={() => openRequestDialog(template)}
                              >
                                Request
                                <ArrowRight className="size-3.5" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2">
              <Search className="size-8 text-muted-foreground/40" />
              <p className="text-muted-foreground">No workflows match your search</p>
              <button
                className="text-sm text-primary hover:underline"
                onClick={() => { setSearchQuery(""); setActiveCategory(null); }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                  <Inbox className="size-8 text-muted-foreground/50" />
                </div>
                <p className="mt-4 text-lg font-medium text-muted-foreground">
                  No workflows available
                </p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  No published workflows are available yet — check back later
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── My Requests Tab ── */}
        <TabsContent value="my-requests" className="mt-6">
          {/* Summary badges */}
          {(myInstances?.length ?? 0) > 0 && (
            <div className="mb-4 flex items-center gap-3">
              <Badge variant="default" className="gap-1.5">
                <span className="size-1.5 rounded-full bg-blue-300 animate-pulse" />
                {runningCount} running
              </Badge>
              <Badge variant="secondary" className="gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {completedCount} completed
              </Badge>
            </div>
          )}

          {instancesLoading ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading your requests...</p>
            </div>
          ) : (myInstances?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              {myInstances!
                .sort((a, b) => {
                  const da = a.startedAt ? new Date(a.startedAt).getTime() : 0;
                  const db = b.startedAt ? new Date(b.startedAt).getTime() : 0;
                  return db - da;
                })
                .map((inst) => {
                  const progressPct =
                    inst.progress.total > 0
                      ? Math.round((inst.progress.completed / inst.progress.total) * 100)
                      : 0;
                  const StatusIcon = STATUS_ICON[inst.status] ?? Clock;

                  return (
                    <Link key={inst.id} href={`/instances/${inst.id}`}>
                      <Card className="cursor-pointer transition-all duration-200 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div
                              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                                inst.status === "RUNNING"
                                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                                  : inst.status === "COMPLETED"
                                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                                    : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                              }`}
                            >
                              <StatusIcon className="size-5" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-semibold">{inst.title}</p>
                                <Badge
                                  variant={STATUS_BADGE_VARIANT[inst.status] ?? "outline"}
                                  className="shrink-0 gap-1"
                                >
                                  <span
                                    className={`size-1.5 rounded-full ${STATUS_DOT_COLOR[inst.status] ?? "bg-gray-400"}`}
                                  />
                                  {inst.status}
                                </Badge>
                              </div>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {inst.templateName}
                              </p>

                              <div className="mt-2 flex items-center gap-3">
                                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      inst.status === "COMPLETED"
                                        ? "bg-emerald-500"
                                        : inst.status === "CANCELLED"
                                          ? "bg-red-500"
                                          : "bg-blue-500"
                                    }`}
                                    style={{ width: `${progressPct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                                  {inst.progress.completed}/{inst.progress.total}
                                </span>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              {inst.startedAt && (
                                <p className="text-[11px] text-muted-foreground">
                                  {formatDistanceToNow(new Date(inst.startedAt), {
                                    addSuffix: true,
                                  })}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                  <Inbox className="size-8 text-muted-foreground/50" />
                </div>
                <p className="mt-4 text-lg font-medium text-muted-foreground">
                  No requests yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  Browse the service catalog to submit your first request
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Request Dialog (Multistep Wizard) ── */}
      <Dialog
        open={!!selectedTemplate}
        onOpenChange={(open) => {
          if (!open) { setSelectedTemplate(null); setCurrentStep(0); }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {currentStep === totalSteps - 1 ? "Confirm Request" : "Submit Request"}
            </DialogTitle>
            <DialogDescription>
              {selectedTemplate?.name}
              {selectedTemplate?.category && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {selectedTemplate.category}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Step progress indicator */}
          <div className="flex items-center gap-1 px-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= currentStep ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Step label */}
          <p className="text-xs text-muted-foreground text-center -mt-1">
            {currentStep === 0
              ? "Client & Project"
              : currentStep <= templateSteps.length
                ? templateSteps[currentStep - 1].title
                : "Review & Submit"}
            {" "}
            <span className="tabular-nums">({currentStep + 1} of {totalSteps})</span>
          </p>

          <ScrollArea className="flex-1 -mx-4 px-4">
            {/* Step 0: Built-in fields (Client, Project, Title, Priority) */}
            {currentStep === 0 && (
              <div className="space-y-4 pb-2">
                {/* Client */}
                <div className="space-y-2">
                  <Label>
                    Client <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={selectedClientId}
                    onValueChange={(v) => {
                      setSelectedClientId(v ?? "");
                      setSelectedProjectId("");
                      setFormErrors((p) => { const n = {...p}; delete n._client; return n; });
                    }}
                  >
                    <SelectTrigger className={formErrors._client ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select a client...">
                        {selectedClientId
                          ? (() => {
                              const client = (clientsList ?? []).find((c) => c.id === selectedClientId);
                              return client ? `${client.shortCode} \u2014 ${client.name}` : selectedClientId;
                            })()
                          : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(clientsList ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id} label={`${c.shortCode} — ${c.name}`}>
                          <span className="font-mono text-muted-foreground mr-1.5">{c.shortCode}</span>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors._client && <p className="text-xs text-red-500">{formErrors._client}</p>}
                </div>

                {/* Project */}
                {selectedClientId && (projectsList?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Select
                      value={selectedProjectId}
                      onValueChange={(v) => setSelectedProjectId(v ?? "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a project (optional)..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(projectsList ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id} label={p.name}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="request-title">
                    Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="request-title"
                    value={requestTitle}
                    onChange={(e) => { setRequestTitle(e.target.value); setFormErrors((p) => { const n = {...p}; delete n._title; return n; }); }}
                    placeholder="Give your request a descriptive title"
                    className={formErrors._title ? "border-red-500" : ""}
                  />
                  {formErrors._title && <p className="text-xs text-red-500">{formErrors._title}</p>}
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={requestPriority} onValueChange={(v) => { if (v) setRequestPriority(v); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Steps 1..N: Template-defined steps */}
            {currentStep >= 1 && currentStep <= templateSteps.length && (() => {
              const step = templateSteps[currentStep - 1];
              return (
                <div className="space-y-4 pb-2">
                  {step.description && (
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  )}

                  {step.fields.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No fields in this step.
                    </p>
                  ) : (
                    step.fields.map((field) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={`field-${field.id}`}>
                          {field.label}
                          {field.required && <span className="text-red-500 ml-0.5">*</span>}
                        </Label>

                        {field.type === "text" && (
                          <Input
                            id={`field-${field.id}`}
                            value={formValues[field.id] ?? ""}
                            onChange={(e) => {
                              setFormValues((v) => ({ ...v, [field.id]: e.target.value }));
                              setFormErrors((p) => { const n = {...p}; delete n[field.id]; return n; });
                            }}
                            placeholder={field.placeholder}
                            className={formErrors[field.id] ? "border-red-500" : ""}
                          />
                        )}

                        {field.type === "textarea" && (
                          <Textarea
                            id={`field-${field.id}`}
                            value={formValues[field.id] ?? ""}
                            onChange={(e) => {
                              setFormValues((v) => ({ ...v, [field.id]: e.target.value }));
                              setFormErrors((p) => { const n = {...p}; delete n[field.id]; return n; });
                            }}
                            placeholder={field.placeholder}
                            rows={3}
                            className={formErrors[field.id] ? "border-red-500" : ""}
                          />
                        )}

                        {field.type === "select" && (
                          <Select
                            value={formValues[field.id] ?? ""}
                            onValueChange={(v) => {
                              setFormValues((prev) => ({ ...prev, [field.id]: v ?? "" }));
                              setFormErrors((p) => { const n = {...p}; delete n[field.id]; return n; });
                            }}
                          >
                            <SelectTrigger className={formErrors[field.id] ? "border-red-500" : ""}>
                              <SelectValue placeholder={field.placeholder || "Select..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {field.type === "date" && (
                          <Input
                            id={`field-${field.id}`}
                            type="date"
                            value={formValues[field.id] ?? ""}
                            onChange={(e) => {
                              setFormValues((v) => ({ ...v, [field.id]: e.target.value }));
                              setFormErrors((p) => { const n = {...p}; delete n[field.id]; return n; });
                            }}
                            className={formErrors[field.id] ? "border-red-500" : ""}
                          />
                        )}

                        {field.type === "number" && (
                          <Input
                            id={`field-${field.id}`}
                            type="number"
                            value={formValues[field.id] ?? ""}
                            onChange={(e) => {
                              setFormValues((v) => ({ ...v, [field.id]: e.target.value }));
                              setFormErrors((p) => { const n = {...p}; delete n[field.id]; return n; });
                            }}
                            placeholder={field.placeholder}
                            className={formErrors[field.id] ? "border-red-500" : ""}
                          />
                        )}

                        {formErrors[field.id] && <p className="text-xs text-red-500">{formErrors[field.id]}</p>}
                      </div>
                    ))
                  )}
                </div>
              );
            })()}

            {/* Final step: Review & Submit */}
            {currentStep === totalSteps - 1 && (
              <div className="space-y-3 pb-2">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Client</span>
                    <span className="font-medium">
                      {clientsList?.find(c => c.id === selectedClientId)?.name ?? "\u2014"}
                    </span>
                  </div>
                  {(() => {
                    const selectedClient = clientsList?.find(c => c.id === selectedClientId);
                    return selectedClient?.ministry ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ministry</span>
                        <span className="font-medium">{selectedClient.ministry.name}</span>
                      </div>
                    ) : null;
                  })()}
                  {selectedProjectId && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Project</span>
                      <span className="font-medium">
                        {projectsList?.find(p => p.id === selectedProjectId)?.name ?? "\u2014"}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Title</span>
                    <span className="font-medium">{requestTitle}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Priority</span>
                    <Badge variant={
                      requestPriority === "Critical" ? "destructive" :
                      requestPriority === "High" ? "default" :
                      "secondary"
                    }>
                      {requestPriority}
                    </Badge>
                  </div>
                  {templateSteps.map((step) =>
                    step.fields.map((field) =>
                      formValues[field.id]?.trim() ? (
                        <div key={field.id} className="flex justify-between text-sm gap-4">
                          <span className="text-muted-foreground shrink-0">{field.label}</span>
                          <span className="font-medium text-right truncate">{formValues[field.id]}</span>
                        </div>
                      ) : null
                    )
                  )}
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Please review the details above before submitting
                </p>
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            {currentStep > 0 && (
              <Button variant="outline" onClick={() => setCurrentStep((s) => s - 1)} disabled={isSubmitting}>
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
            )}
            {currentStep === 0 && (
              <Button variant="outline" onClick={() => setSelectedTemplate(null)} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            {currentStep < totalSteps - 1 ? (
              <Button onClick={handleNextStep}>
                Next
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button onClick={handleSubmitRequest} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <PlayCircle className="size-3.5" data-icon="inline-start" />
                    Confirm &amp; Submit
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
