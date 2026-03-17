"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, PlayCircle, ArrowUpDown, Clock, CheckCircle2, XCircle, AlertCircle, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { usePolling } from "@/hooks/use-polling";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InstanceStatus } from "@/generated/prisma/client";
import type { PaginatedResponse } from "@/types/api";

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

type SortOption = "started" | "title";

export default function InstancesPage() {
  const [tab, setTab] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("started");
  const [clientFilter, setClientFilter] = useState("");

  const { data: clientsRes } = usePolling<PaginatedResponse<{ id: string; name: string; shortCode: string }>>(
    "/api/clients",
    { interval: 60000 },
  );
  const clientOptions = clientsRes?.data ?? [];

  const statusParam = tab === "all" ? "" : `status=${tab.toUpperCase()}`;
  const clientParam = clientFilter ? `clientId=${clientFilter}` : "";
  const queryParts = [statusParam, clientParam].filter(Boolean);
  const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
  const { data: instancesRes, isLoading } = usePolling<PaginatedResponse<Instance>>(
    `/api/workflows/instances${queryString}`,
    { interval: 15000 },
  );
  const instances = instancesRes?.data ?? null;

  // Compute tab counts from all instances
  const { data: allInstancesRes } = usePolling<PaginatedResponse<Instance>>(
    "/api/workflows/instances?limit=200",
    { interval: 30000 },
  );
  const allInstances = allInstancesRes?.data ?? null;

  const counts = useMemo(() => {
    const c = { all: 0, running: 0, completed: 0, cancelled: 0 };
    if (!allInstances) return c;
    c.all = allInstancesRes?.total ?? allInstances.length;
    for (const inst of allInstances) {
      if (inst.status === "RUNNING") c.running++;
      else if (inst.status === "COMPLETED") c.completed++;
      else if (inst.status === "CANCELLED") c.cancelled++;
    }
    return c;
  }, [allInstances, allInstancesRes?.total]);

  const sorted = useMemo(() => {
    if (!instances) return [];
    const list = [...instances];
    if (sortBy === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      list.sort((a, b) => {
        const da = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const db = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        return db - da;
      });
    }
    return list;
  }, [instances, sortBy]);

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflow Instances</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and manage running workflow instances
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={clientFilter} onValueChange={(v) => setClientFilter(v ?? "")}>
            <SelectTrigger className="w-[180px]">
              <Building2 className="mr-1.5 size-3.5 text-muted-foreground" />
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Clients</SelectItem>
              {clientOptions.map((c) => (
                <SelectItem key={c.id} value={c.id} label={`${c.shortCode} — ${c.name}`}>
                  <span className="font-mono text-muted-foreground mr-1">{c.shortCode}</span>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => { if (v) setSortBy(v as SortOption); }}>
            <SelectTrigger className="w-[160px]">
              <ArrowUpDown className="mr-1.5 size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="started">Started Date</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-1.5">
            All
            <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
              {counts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="running" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
            Running
            <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
              {counts.running}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Completed
            <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
              {counts.completed}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-red-500" />
            Cancelled
            <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
              {counts.cancelled}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading instances...</p>
            </div>
          ) : sorted.length > 0 ? (
            <div className="space-y-2">
              {sorted.map((inst) => {
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
                          {/* Status icon */}
                          <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                            inst.status === "RUNNING"
                              ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                              : inst.status === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                                : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                          }`}>
                            <StatusIcon className="size-5" />
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-semibold">{inst.title}</p>
                              <Badge
                                variant={STATUS_BADGE_VARIANT[inst.status] ?? "outline"}
                                className="shrink-0 gap-1"
                              >
                                <span className={`size-1.5 rounded-full ${STATUS_DOT_COLOR[inst.status] ?? "bg-gray-400"}`} />
                                {inst.status}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {inst.templateName}
                            </p>

                            {/* Progress bar */}
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

                          {/* Right side: avatar + time */}
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <div className="flex items-center gap-2">
                              <Avatar size="sm">
                                <AvatarFallback className="text-[10px]">
                                  {getInitials(inst.ownerName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground">{inst.ownerName}</span>
                            </div>
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
            <div className="flex h-48 flex-col items-center justify-center gap-3">
              <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                <PlayCircle className="size-7 text-muted-foreground/50" />
              </div>
              <div className="text-center">
                <p className="font-medium text-muted-foreground">No instances found</p>
                <p className="mt-0.5 text-sm text-muted-foreground/70">
                  Start a workflow from the workflows page to create an instance
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
