"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  GitBranch,
  Loader2,
  Search,
  ArrowUpDown,
  PlayCircle,
  Copy,
  MoreHorizontal,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Template {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string };
  _count: { instances: number };
}

type SortOption = "updated" | "name" | "created";

export default function WorkflowsPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("updated");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/workflows/templates");
        if (!res.ok) throw new Error("Failed to load templates");
        const json = await res.json();
        setTemplates(json.data ?? json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleDuplicate = useCallback(
    async (template: Template) => {
      try {
        const res = await fetch(`/api/workflows/templates/${template.id}`);
        if (!res.ok) throw new Error("Failed to load template");
        const original = await res.json();

        const createRes = await fetch("/api/workflows/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${original.name} (Copy)`,
            description: original.description,
            nodes: original.nodes.map((n: Record<string, unknown>) => ({
              id: n.id,
              type: n.type,
              label: n.label,
              positionX: n.positionX,
              positionY: n.positionY,
              config: n.config,
              roleAssignments: (n.roleAssignments as Array<Record<string, unknown>>).map(
                (ra) => ({ roleId: ra.roleId, assignToOwner: ra.assignToOwner }),
              ),
            })),
            edges: original.edges.map((e: Record<string, unknown>) => ({
              id: e.id,
              sourceId: e.sourceId,
              targetId: e.targetId,
              label: e.label,
              conditionBranch: e.conditionBranch,
            })),
          }),
        });

        if (!createRes.ok) throw new Error("Failed to duplicate");
        const newTemplate = await createRes.json();
        toast.success("Workflow duplicated");
        router.push(`/workflows/${newTemplate.id}`);
      } catch {
        toast.error("Failed to duplicate workflow");
      }
    },
    [router],
  );

  const handleStartInstance = useCallback(
    async (templateId: string, templateName: string) => {
      try {
        const res = await fetch("/api/workflows/instances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId,
            title: `${templateName} - ${new Date().toLocaleDateString()}`,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to start instance" }));
          toast.error(err.error);
          return;
        }

        const instance = await res.json();
        toast.success("Workflow instance started");
        router.push(`/instances/${instance.id}`);
      } catch {
        toast.error("Failed to start workflow instance");
      }
    },
    [router],
  );

  const filteredAndSorted = useMemo(() => {
    let result = [...templates];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.createdBy.name.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "updated":
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [templates, searchQuery, sortBy]);

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading workflows...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage workflow templates
          </p>
        </div>
        <Link href="/workflows/new" className={buttonVariants()}>
          <Plus className="size-4" data-icon="inline-start" />
          New Workflow
        </Link>
      </div>

      {/* Search and filter bar */}
      {templates.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search workflows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => { if (v) setSortBy(v as SortOption); }}>
            <SelectTrigger className="w-[160px]">
              <ArrowUpDown className="mr-1.5 size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Last Updated</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="created">Date Created</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {filteredAndSorted.length === 0 && templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <GitBranch className="size-8 text-muted-foreground/60" />
            </div>
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              No workflows yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Create your first workflow template to get started
            </p>
            <Link href="/workflows/new" className={buttonVariants({ className: "mt-6" })}>
              <Plus className="size-4" data-icon="inline-start" />
              Create Workflow
            </Link>
          </CardContent>
        </Card>
      ) : filteredAndSorted.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2">
          <Search className="size-8 text-muted-foreground/40" />
          <p className="text-muted-foreground">No workflows match your search</p>
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => setSearchQuery("")}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAndSorted.map((template) => (
            <Card
              key={template.id}
              className="group relative h-full transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
            >
              <Link href={`/workflows/${template.id}`} className="absolute inset-0 z-0" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="line-clamp-1 text-base group-hover:text-primary transition-colors">
                    {template.name}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    {template.isPublished ? (
                      <Badge variant="default" className="gap-1 shrink-0">
                        <span className="size-1.5 rounded-full bg-emerald-300 animate-pulse" />
                        Published
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 shrink-0">
                        <span className="size-1.5 rounded-full bg-gray-400" />
                        Draft
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {template.description ? (
                  <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                    {template.description}
                  </p>
                ) : (
                  <p className="mb-3 line-clamp-2 text-sm text-muted-foreground/50 italic">
                    No description
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Activity className="size-3" />
                    <span>
                      {template._count.instances} instance
                      {template._count.instances !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">v{template.version}</Badge>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarFallback className="text-[10px]">
                        {getInitials(template.createdBy.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">{template.createdBy.name}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(template.updatedAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>

                {/* Actions row */}
                <div className="mt-3 flex items-center gap-2 relative z-10">
                  {template.isPublished && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleStartInstance(template.id, template.name);
                      }}
                    >
                      <PlayCircle className="size-3" />
                      Start
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={(e) => e.preventDefault()}
                        />
                      }
                    >
                      <MoreHorizontal className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="bottom">
                      <DropdownMenuItem onClick={() => router.push(`/workflows/${template.id}`)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                        <Copy className="size-3.5" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
