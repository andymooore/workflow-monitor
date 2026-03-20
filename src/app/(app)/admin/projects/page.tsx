"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  Loader2,
  Search,
  FolderOpen,
  Building2,
  Calendar,
  Users,
  Target,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingUp,
} from "lucide-react";

import { usePolling } from "@/hooks/use-polling";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  health: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  client: {
    id: string;
    name: string;
    shortCode: string;
    slaTier: string;
  };
  _count: {
    instances: number;
    milestones: number;
    members: number;
  };
}

interface ProjectsResponse {
  data: ProjectListItem[];
  total: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  PLANNING: {
    label: "Planning",
    color: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-400 dark:border-slate-700",
    dotColor: "bg-slate-500",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
    dotColor: "bg-blue-500 animate-pulse",
  },
  ON_HOLD: {
    label: "On Hold",
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    dotColor: "bg-amber-500",
  },
  COMPLETED: {
    label: "Completed",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    dotColor: "bg-emerald-500",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
    dotColor: "bg-red-500",
  },
};

const HEALTH_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2 }> = {
  ON_TRACK: { label: "On Track", icon: CheckCircle2 },
  AT_RISK: { label: "At Risk", icon: AlertTriangle },
  BLOCKED: { label: "Blocked", icon: XCircle },
};

const HEALTH_COLORS: Record<string, string> = {
  ON_TRACK: "text-emerald-600 dark:text-emerald-400",
  AT_RISK: "text-amber-600 dark:text-amber-400",
  BLOCKED: "text-red-600 dark:text-red-400",
};

const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "PLANNING", label: "Planning" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminProjectsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (searchQuery.trim()) p.set("search", searchQuery.trim());
    if (statusFilter !== "ALL") p.set("status", statusFilter);
    p.set("limit", "200");
    return p.toString();
  }, [searchQuery, statusFilter]);

  const { data: res, isLoading } = usePolling<ProjectsResponse>(
    `/api/projects?${queryParams}`,
    { interval: 15000 },
  );

  const projects = res?.data ?? [];

  // Auth guard
  const userRoles: string[] = session?.user?.roles ?? [];
  if (sessionStatus === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!userRoles.includes("admin")) {
    router.push("/dashboard");
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {res?.total ?? 0} project{(res?.total ?? 0) !== 1 ? "s" : ""} across all clients
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects or clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "ALL")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Project Cards */}
      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <FolderOpen className="size-8 text-muted-foreground/50" />
            </div>
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              No projects found
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              {searchQuery || statusFilter !== "ALL"
                ? "Try adjusting your filters"
                : "Projects are created from the Clients page"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.PLANNING;
            const healthCfg = HEALTH_CONFIG[project.health] ?? HEALTH_CONFIG.ON_TRACK;
            const HealthIcon = healthCfg.icon;
            const healthColor = HEALTH_COLORS[project.health] ?? "";

            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="group relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/20 cursor-pointer h-full">
                  <CardContent className="p-5 space-y-4">
                    {/* Title + Status */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                          {project.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={`shrink-0 gap-1 text-[10px] ${statusCfg.color}`}
                        >
                          <span className={`size-1.5 rounded-full ${statusCfg.dotColor}`} />
                          {statusCfg.label}
                        </Badge>
                      </div>

                      {/* Client */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="size-3 shrink-0" />
                        <span className="truncate">{project.client.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                          {project.client.shortCode}
                        </Badge>
                      </div>
                    </div>

                    {/* Description */}
                    {project.description && (
                      <p className="text-xs text-muted-foreground/70 line-clamp-2">
                        {project.description}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      {/* Health */}
                      <div className={`flex items-center gap-1 ${healthColor}`}>
                        <HealthIcon className="size-3" />
                        <span>{healthCfg.label}</span>
                      </div>

                      {/* Date range */}
                      {(project.startDate || project.endDate) && (
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          <span>
                            {project.startDate
                              ? format(new Date(project.startDate), "MMM d")
                              : "—"}
                            {" – "}
                            {project.endDate
                              ? format(new Date(project.endDate), "MMM d, yyyy")
                              : "—"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 pt-1 border-t text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Target className="size-3" />
                        <span>{project._count.milestones} milestones</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="size-3" />
                        <span>{project._count.members}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="size-3" />
                        <span>{project._count.instances} workflows</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
