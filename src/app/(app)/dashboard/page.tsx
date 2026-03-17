"use client";

import { useSession } from "next-auth/react";
import { usePolling } from "@/hooks/use-polling";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  LayoutDashboard,
  CheckSquare,
  ShieldCheck,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  PlayCircle,
  ClipboardList,
  Clock,
  Inbox,
  GitBranch,
  Activity,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  DashboardSkeleton,
  StatCardSkeleton,
  CardSkeleton,
} from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import type { InstanceStatus, NodeStatus } from "@/generated/prisma/client";
import type { PaginatedResponse } from "@/types/api";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface DashboardStats {
  activeWorkflows: number;
  myPendingTasks: number;
  pendingApprovals: number;
  completedThisWeek: number;
}

interface ActiveInstance {
  id: string;
  title: string;
  templateName: string;
  ownerName: string;
  status: InstanceStatus;
  startedAt: string;
  progress: { completed: number; total: number };
}

interface MyTask {
  id: string;
  instanceId: string;
  label: string;
  workflowTitle: string;
  status: NodeStatus;
  assignedAt: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data: stats, isLoading: statsLoading } = usePolling<DashboardStats>(
    "/api/workflows/dashboard/stats",
    { interval: 30000 }
  );
  const { data: instancesRes, isLoading: instancesLoading } = usePolling<
    PaginatedResponse<ActiveInstance>
  >("/api/workflows/instances?status=RUNNING&limit=10", { interval: 30000 });
  const instances = instancesRes?.data ?? null;
  const { data: tasksRes, isLoading: tasksLoading } = usePolling<PaginatedResponse<MyTask>>(
    "/api/workflows/my-tasks?status=IN_PROGRESS&limit=10",
    { interval: 15000 }
  );
  const tasks = tasksRes?.data ?? null;

  const firstName = session?.user?.name?.split(" ")[0] || "there";

  if (statsLoading && instancesLoading && tasksLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-r from-[oklch(0.50_0.13_230_/_6%)] via-[oklch(0.55_0.14_210_/_4%)] to-[oklch(0.65_0.15_195_/_6%)] p-7 dark:from-[oklch(0.50_0.13_230_/_8%)] dark:via-[oklch(0.55_0.14_210_/_4%)] dark:to-[oklch(0.65_0.15_195_/_8%)]">
        <div className="relative z-10">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground/80">
            Here&apos;s what&apos;s happening with your workflows today.
          </p>
        </div>
        <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-[oklch(0.65_0.15_195_/_8%)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -right-8 h-32 w-32 rounded-full bg-[oklch(0.78_0.14_80_/_6%)] blur-2xl" />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <PremiumStatCard
              title="Active Workflows"
              value={stats?.activeWorkflows ?? 0}
              icon={LayoutDashboard}
              trend={{ value: 12, direction: "up" }}
              accentColor="blue"
            />
            <PremiumStatCard
              title="My Pending Tasks"
              value={stats?.myPendingTasks ?? 0}
              icon={CheckSquare}
              trend={{ value: 3, direction: "down" }}
              accentColor="amber"
            />
            <PremiumStatCard
              title="Pending Approvals"
              value={stats?.pendingApprovals ?? 0}
              icon={ShieldCheck}
              trend={{ value: 5, direction: "up" }}
              accentColor="violet"
            />
            <PremiumStatCard
              title="Completed This Week"
              value={stats?.completedThisWeek ?? 0}
              icon={CheckCircle}
              trend={{ value: 18, direction: "up" }}
              accentColor="emerald"
            />
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          Quick actions
        </span>
        <Link
          href="/workflows"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-2"
          )}
        >
          <PlayCircle className="h-3.5 w-3.5" />
          Start Workflow
        </Link>
        <Link
          href="/my-tasks"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-2"
          )}
        >
          <ClipboardList className="h-3.5 w-3.5" />
          View My Tasks
        </Link>
        <Link
          href="/approvals"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-2"
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Review Approvals
        </Link>
      </div>

      {/* Active Workflows */}
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">
              Active Workflows
            </CardTitle>
            {instances && instances.length > 0 && (
              <Badge variant="secondary" className="text-[11px]">
                {instances.length}
              </Badge>
            )}
          </div>
          <Link
            href="/instances"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {instancesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : instances && instances.length > 0 ? (
            <div className="space-y-2">
              {instances.map((inst) => {
                const progressPct =
                  inst.progress.total > 0
                    ? Math.round(
                        (inst.progress.completed / inst.progress.total) * 100
                      )
                    : 0;
                return (
                  <Link key={inst.id} href={`/instances/${inst.id}`}>
                    <div className="group flex items-center justify-between rounded-lg border border-border/40 bg-card px-4 py-3 transition-all duration-200 hover:border-border hover:bg-accent/30 hover:shadow-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium group-hover:text-foreground">
                            {inst.title}
                          </p>
                          <StatusBadge status={inst.status} size="sm" />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {inst.templateName} &middot; {inst.ownerName} &middot;{" "}
                          {getRelativeTime(inst.startedAt)}
                        </p>
                      </div>
                      <div className="ml-4 flex items-center gap-3">
                        {/* Progress bar */}
                        <div className="hidden w-24 sm:block">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              {inst.progress.completed}/{inst.progress.total}
                            </span>
                            <span>{progressPct}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={GitBranch}
              title="No active workflows"
              description="Start a new workflow to see it appear here."
              action={
                <Link
                  href="/workflows"
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "gap-2"
                  )}
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  Start Workflow
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* My Tasks */}
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">My Tasks</CardTitle>
            {tasks && tasks.length > 0 && (
              <Badge variant="secondary" className="text-[11px]">
                {tasks.length}
              </Badge>
            )}
          </div>
          <Link
            href="/my-tasks"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {tasksLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : tasks && tasks.length > 0 ? (
            <div className="space-y-2">
              {tasks.map((task) => (
                <Link key={task.id} href={`/instances/${task.instanceId}`}>
                  <div className="group flex items-center justify-between rounded-lg border border-border/40 bg-card px-4 py-3 transition-all duration-200 hover:border-border hover:bg-accent/30 hover:shadow-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium group-hover:text-foreground">
                          {task.label}
                        </p>
                        <StatusBadge status={task.status} size="sm" />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <span>{task.workflowTitle}</span>
                        <span>&middot;</span>
                        <Clock className="h-3 w-3" />
                        <span>{getRelativeTime(task.assignedAt)}</span>
                      </p>
                    </div>
                    <ArrowRight className="ml-4 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Inbox}
              title="No pending tasks"
              description="You're all caught up. New tasks will appear here when assigned."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Premium Stat Card ─── */

const accentColors = {
  blue: {
    icon: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    gradient: "from-blue-500/8 to-transparent dark:from-blue-500/5",
    ring: "group-hover:ring-blue-500/10 dark:group-hover:ring-blue-500/8",
  },
  amber: {
    icon: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    gradient: "from-amber-500/8 to-transparent dark:from-amber-500/5",
    ring: "group-hover:ring-amber-500/10 dark:group-hover:ring-amber-500/8",
  },
  violet: {
    icon: "bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
    gradient: "from-violet-500/8 to-transparent dark:from-violet-500/5",
    ring: "group-hover:ring-violet-500/10 dark:group-hover:ring-violet-500/8",
  },
  emerald: {
    icon: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    gradient: "from-emerald-500/8 to-transparent dark:from-emerald-500/5",
    ring: "group-hover:ring-emerald-500/10 dark:group-hover:ring-emerald-500/8",
  },
};

interface PremiumStatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  trend?: { value: number; direction: "up" | "down" };
  accentColor: keyof typeof accentColors;
}

function PremiumStatCard({
  title,
  value,
  icon: Icon,
  trend,
  accentColor,
}: PremiumStatCardProps) {
  const colors = accentColors[accentColor];

  return (
    <Card className={cn(
      "group relative overflow-hidden border-border/40 transition-all duration-300 hover:border-border/60 hover:shadow-lg dark:hover:shadow-black/30",
      colors.ring, "ring-0 ring-inset hover:ring-1"
    )}>
      {/* Ambient gradient */}
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", colors.gradient)} />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight">{value}</p>
          </div>
          <div className={cn("rounded-xl p-2.5", colors.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1.5">
            {trend.direction === "up" ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            )}
            <span
              className={cn(
                "text-xs font-semibold",
                trend.direction === "up"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {trend.direction === "up" ? "+" : "-"}
              {trend.value}%
            </span>
            <span className="text-[11px] text-muted-foreground/70">vs last week</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
