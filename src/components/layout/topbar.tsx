"use client";

import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LogOut,
  User,
  Bell,
  Search,
  ChevronRight,
  Command,
  CheckCheck,
  ShieldCheck,
  CheckSquare,
  PlayCircle,
  XCircle,
  MessageSquare,
  Zap,
  Sun,
  Moon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { usePolling } from "@/hooks/use-polling";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  instanceId: string | null;
  createdAt: string;
}

interface NotificationResponse {
  data: Notification[];
  unreadCount: number;
  total: number;
}

const NOTIFICATION_ICON: Record<string, React.ElementType> = {
  TASK_ASSIGNED: CheckSquare,
  APPROVAL_REQUESTED: ShieldCheck,
  APPROVAL_DECISION: ShieldCheck,
  TASK_COMPLETED: CheckCheck,
  WORKFLOW_COMPLETED: PlayCircle,
  WORKFLOW_CANCELLED: XCircle,
  COMMENT_ADDED: MessageSquare,
};

const NOTIFICATION_COLOR: Record<string, string> = {
  TASK_ASSIGNED: "text-blue-500",
  APPROVAL_REQUESTED: "text-amber-500",
  APPROVAL_DECISION: "text-emerald-500",
  TASK_COMPLETED: "text-emerald-500",
  WORKFLOW_COMPLETED: "text-emerald-500",
  WORKFLOW_CANCELLED: "text-red-500",
  COMMENT_ADDED: "text-purple-500",
};

/** Check if a segment looks like a CUID (e.g. "cmmuw611i0000rgr78k9lqeb7") */
function isCuidSegment(seg: string): boolean {
  return /^c[a-z0-9]{20,}$/.test(seg);
}

/** Derive breadcrumbs from the current pathname */
function useBreadcrumbs() {
  const pathname = usePathname();
  let hrefAccum = "";
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      hrefAccum += "/" + seg;
      return {
        label: isCuidSegment(seg)
          ? "Details"
          : seg
              .replace(/-/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
        href: hrefAccum,
      };
    });
  return segments;
}

export function Topbar() {
  const { data: session } = useSession();
  const breadcrumbs = useBreadcrumbs();
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: notifData, refetch } = usePolling<NotificationResponse>(
    "/api/notifications?limit=20",
    { interval: 15000 },
  );

  const unreadCount = notifData?.unreadCount ?? 0;
  const notifications = notifData?.data ?? [];

  const markAllRead = useCallback(async () => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    refetch();
  }, [refetch]);

  const markRead = useCallback(async (ids: string[]) => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    refetch();
  }, [refetch]);

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <header className="flex h-[60px] items-center justify-between border-b border-border/50 bg-card/60 px-6 backdrop-blur-xl">
      {/* Left: Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            )}
            <span
              className={cn(
                "font-medium",
                i === breadcrumbs.length - 1
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Search / Command Palette Trigger */}
        <button
          className="flex h-8 items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 text-sm text-muted-foreground transition-all hover:border-border/60 hover:bg-muted/50 hover:shadow-sm"
          onClick={() => {
            // Dispatch Ctrl+K to open the command palette
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
          }}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="pointer-events-none hidden h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* Theme Toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        )}

        {/* Notification Bell */}
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white ring-2 ring-card">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[380px] p-0">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-xs text-muted-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    markAllRead();
                  }}
                >
                  <CheckCheck className="size-3" />
                  Mark all read
                </Button>
              )}
            </div>

            {/* Notification list */}
            <ScrollArea className="max-h-[400px]">
              {notifications.length > 0 ? (
                <div className="divide-y">
                  {notifications.map((notif) => {
                    const Icon = NOTIFICATION_ICON[notif.type] ?? Zap;
                    const color = NOTIFICATION_COLOR[notif.type] ?? "text-muted-foreground";

                    return (
                      <Link
                        key={notif.id}
                        href={notif.link ?? "#"}
                        onClick={() => {
                          if (!notif.isRead) markRead([notif.id]);
                          setIsOpen(false);
                        }}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                          !notif.isRead && "bg-blue-50/50 dark:bg-blue-950/20",
                        )}
                      >
                        <div className={`mt-0.5 shrink-0 ${color}`}>
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              "text-sm",
                              !notif.isRead ? "font-semibold" : "font-medium text-muted-foreground"
                            )}>
                              {notif.title}
                            </p>
                            {!notif.isRead && (
                              <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {notif.message}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground/60">
                            {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10">
                  <Bell className="size-8 text-muted-foreground/30" />
                  <p className="mt-2 text-sm text-muted-foreground">No notifications</p>
                </div>
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Separator */}
        <div className="mx-1 h-6 w-px bg-border/60" />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="relative">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-gradient-to-br from-[oklch(0.50_0.13_230)] to-[oklch(0.45_0.12_240)] text-[11px] font-bold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {/* Online indicator */}
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-none">
                {session?.user?.name}
              </p>
              <p className="mt-0.5 text-[11px] leading-none text-muted-foreground">
                {session?.user?.email}
              </p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-2 sm:hidden">
              <p className="text-sm font-medium">{session?.user?.name}</p>
              <p className="text-xs text-muted-foreground">
                {session?.user?.email}
              </p>
            </div>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem className="gap-2" disabled>
              <User className="h-4 w-4" />
              Profile Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
