"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Building2,
  FolderOpen,
  Play,
  CheckCircle2,
  MessageSquare,
  StickyNote,
  UserPlus,
  UserMinus,
  FileUp,
  Flag,
  AlertTriangle,
  Milestone,
  Pencil,
  BookOpen,
  Loader2,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActivityUser {
  id: string;
  name: string;
  email: string;
}

interface ActivityProject {
  id: string;
  name: string;
}

interface ActivityClient {
  id: string;
  name: string;
}

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
  user: ActivityUser;
  project?: ActivityProject | null;
  client?: ActivityClient | null;
}

interface ActivityFeedResponse {
  data: ActivityEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface ActivityFeedProps {
  /** The API endpoint URL to fetch activities from */
  fetchUrl: string;
  /** Optional title shown above the feed */
  title?: string;
  /** Optional: show client column (useful for global feeds) */
  showClient?: boolean;
  /** Optional additional CSS classes for the container */
  className?: string;
  /** Number of items per page (default: 15) */
  pageSize?: number;
}

// ─── Activity Type Configuration ────────────────────────────────────────────

const ACTIVITY_CONFIG: Record<
  string,
  { icon: typeof Activity; color: string; bgColor: string }
> = {
  CLIENT_CREATED: {
    icon: Building2,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  CLIENT_UPDATED: {
    icon: Pencil,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
  },
  PROJECT_CREATED: {
    icon: FolderOpen,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-950/40",
  },
  PROJECT_UPDATED: {
    icon: Pencil,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
  },
  PROJECT_STATUS_CHANGED: {
    icon: Flag,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
  },
  MILESTONE_CREATED: {
    icon: Milestone,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/40",
  },
  MILESTONE_COMPLETED: {
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  MILESTONE_MISSED: {
    icon: AlertTriangle,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/40",
  },
  TEAM_MEMBER_ADDED: {
    icon: UserPlus,
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-50 dark:bg-teal-950/40",
  },
  TEAM_MEMBER_REMOVED: {
    icon: UserMinus,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/40",
  },
  DOCUMENT_UPLOADED: {
    icon: FileUp,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/40",
  },
  WORKFLOW_STARTED: {
    icon: Play,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
  },
  WORKFLOW_COMPLETED: {
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  COMMENT_ADDED: {
    icon: MessageSquare,
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-50 dark:bg-slate-950/40",
  },
  NOTE_ADDED: {
    icon: StickyNote,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/40",
  },
  KNOWLEDGE_ARTICLE_CREATED: {
    icon: BookOpen,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
  },
  KNOWLEDGE_ARTICLE_UPDATED: {
    icon: BookOpen,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
  },
};

const DEFAULT_CONFIG = {
  icon: Activity,
  color: "text-slate-600 dark:text-slate-400",
  bgColor: "bg-slate-50 dark:bg-slate-950/40",
};

// ─── Relative time formatter ────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  if (diffDay < 30) {
    const weeks = Math.floor(diffDay / 7);
    return `${weeks}w ago`;
  }

  // Beyond a month, show date
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(dateStr).getFullYear() !== new Date().getFullYear()
        ? "numeric"
        : undefined,
  });
}

function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ActivityFeed({
  fetchUrl,
  title,
  showClient = false,
  className,
  pageSize = 15,
}: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchActivities = useCallback(
    async (pageNum: number, append: boolean) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const separator = fetchUrl.includes("?") ? "&" : "?";
      const url = `${fetchUrl}${separator}page=${pageNum}&limit=${pageSize}`;

      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Failed to load activities (${res.status})`);
        }
        const json: ActivityFeedResponse = await res.json();

        setActivities((prev) =>
          append ? [...prev, ...json.data] : json.data,
        );
        setHasMore(json.pagination.hasMore);
        setTotal(json.pagination.total);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [fetchUrl, pageSize],
  );

  useEffect(() => {
    setIsLoading(true);
    setActivities([]);
    setPage(1);
    fetchActivities(1, false);

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchActivities]);

  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    setIsLoadingMore(true);
    fetchActivities(nextPage, true);
  }, [page, fetchActivities]);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        {title && (
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </h3>
        )}
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading activity...
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("space-y-4", className)}>
        {title && (
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </h3>
        )}
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="size-7 text-destructive/60" />
            <p className="mt-3 text-sm font-medium text-destructive">
              Failed to load activity feed
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setIsLoading(true);
                setPage(1);
                fetchActivities(1, false);
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state
  if (activities.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        {title && (
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </h3>
        )}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <Activity className="size-7 text-muted-foreground/50" />
            </div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              No activity yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Activity will appear here as actions are taken
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </h3>
          <Badge variant="secondary" className="text-[10px]">
            {total} event{total !== 1 ? "s" : ""}
          </Badge>
        </div>
      )}

      {/* Activity timeline */}
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

        <div className="space-y-0">
          {activities.map((event) => {
            const config = ACTIVITY_CONFIG[event.type] ?? DEFAULT_CONFIG;
            const Icon = config.icon;

            return (
              <div key={event.id} className="relative flex gap-3 pb-4">
                {/* Icon dot */}
                <div
                  className={cn(
                    "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border",
                    config.bgColor,
                    "border-background",
                  )}
                >
                  <Icon className={cn("size-4", config.color)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">
                        {event.title}
                      </p>
                      {event.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <span
                      className="shrink-0 text-[11px] text-muted-foreground tabular-nums"
                      title={new Date(event.createdAt).toLocaleString()}
                    >
                      {relativeTime(event.createdAt)}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {/* User avatar + name */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                        {getUserInitials(event.user.name)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {event.user.name}
                      </span>
                    </div>

                    {/* Project tag */}
                    {event.project && (
                      <Badge
                        variant="outline"
                        className="text-[10px] gap-0.5 font-normal"
                      >
                        <FolderOpen className="size-2.5" />
                        {event.project.name}
                      </Badge>
                    )}

                    {/* Client tag (for global feeds) */}
                    {showClient && event.client && (
                      <Badge
                        variant="outline"
                        className="text-[10px] gap-0.5 font-normal"
                      >
                        <Building2 className="size-2.5" />
                        {event.client.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
