"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitBranch,
  CheckSquare,
  ShieldCheck,
  Users,
  Tags,
  PanelLeftClose,
  PanelLeft,
  Workflow,
  FileText,
  Activity,
  FolderOpen,
  Settings,
  Building2,
  Landmark,
  BookOpen,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/ui-store";
import { usePolling } from "@/hooks/use-polling";

interface BadgeCounts {
  myPendingTasks: number;
  pendingApprovals: number;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, badgeKey: null },
  { name: "Requests", href: "/requests", icon: FileText, badgeKey: null },
  { name: "My Tasks", href: "/my-tasks", icon: CheckSquare, badgeKey: "myPendingTasks" as const },
  { name: "Approvals", href: "/approvals", icon: ShieldCheck, badgeKey: "pendingApprovals" as const },
  { name: "Knowledge", href: "/knowledge", icon: BookOpen, badgeKey: null },
  { name: "Settings", href: "/settings", icon: Settings, badgeKey: null },
];

const adminNav = [
  { name: "Workflows", href: "/workflows", icon: GitBranch },
  { name: "Instances", href: "/instances", icon: Activity },
  { name: "Ministries", href: "/admin/ministries", icon: Landmark },
  { name: "Clients", href: "/admin/clients", icon: Building2 },
  { name: "Categories", href: "/admin/categories", icon: FolderOpen },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Roles", href: "/admin/roles", icon: Tags },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { data: session } = useSession();
  const userRoles: string[] = session?.user?.roles ?? [];
  const isAdmin = userRoles.includes("admin");
  const sidebarRefreshKey = useUIStore((s) => s.sidebarRefreshKey);
  const { data: counts, refetch: refetchCounts } = usePolling<BadgeCounts>(
    "/api/workflows/dashboard/stats",
    { interval: 15000 }
  );

  // Immediately refetch badge counts when another component triggers a refresh
  useEffect(() => {
    if (sidebarRefreshKey > 0) refetchCounts();
  }, [sidebarRefreshKey, refetchCounts]);

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <aside
      className={cn(
        "sidebar-glow relative flex h-screen flex-col bg-sidebar transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        sidebarCollapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      {/* Brand */}
      <div className="flex h-[60px] items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.65_0.15_195)] to-[oklch(0.50_0.13_230)] shadow-md shadow-[oklch(0.65_0.15_195_/_20%)]">
          <Workflow className="h-[18px] w-[18px] text-white" />
        </div>
        <div
          className={cn(
            "overflow-hidden transition-all duration-300",
            sidebarCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          )}
        >
          <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">
            WorkFlow
          </span>
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-[oklch(0.65_0.15_195)]">
            Pro
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <div className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const badgeCount = item.badgeKey && counts ? counts[item.badgeKey] : 0;

            const linkContent = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/55 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                {isActive && (
                  <div className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-[oklch(0.65_0.15_195)] to-[oklch(0.50_0.13_230)] shadow-sm shadow-[oklch(0.65_0.15_195_/_40%)]" />
                )}
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                    isActive
                      ? "text-[oklch(0.65_0.15_195)]"
                      : "text-sidebar-foreground/35 group-hover:text-sidebar-foreground/65"
                  )}
                />
                <span
                  className={cn(
                    "overflow-hidden truncate transition-all duration-300",
                    sidebarCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                  )}
                >
                  {item.name}
                </span>
                {!sidebarCollapsed && badgeCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-md bg-[oklch(0.65_0.15_195_/_12%)] px-1.5 text-[10px] font-bold tabular-nums text-[oklch(0.65_0.15_195)]">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
                {sidebarCollapsed && badgeCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[oklch(0.65_0.15_195)] shadow-sm shadow-[oklch(0.65_0.15_195_/_50%)]" />
                )}
              </Link>
            );

            if (sidebarCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger className="w-full">
                    {linkContent}
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    <span className="flex items-center gap-2">
                      {item.name}
                      {badgeCount > 0 && (
                        <span className="rounded-md bg-[oklch(0.65_0.15_195_/_15%)] px-1.5 py-0.5 text-[10px] font-bold text-[oklch(0.65_0.15_195)]">
                          {badgeCount}
                        </span>
                      )}
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <>
            <div className="my-4 px-3">
              <div className="h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
            </div>

            {!sidebarCollapsed && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/25">
                Administration
              </p>
            )}

            <div className="space-y-0.5">
              {adminNav.map((item) => {
                const isActive = pathname.startsWith(item.href);

                const linkContent = (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/55 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    {isActive && (
                      <div className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-[oklch(0.78_0.14_80)] to-[oklch(0.65_0.15_195)] shadow-sm shadow-[oklch(0.78_0.14_80_/_30%)]" />
                    )}
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                        isActive
                          ? "text-[oklch(0.78_0.14_80)]"
                          : "text-sidebar-foreground/35 group-hover:text-sidebar-foreground/65"
                      )}
                    />
                    <span
                      className={cn(
                        "overflow-hidden truncate transition-all duration-300",
                        sidebarCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                      )}
                    >
                      {item.name}
                    </span>
                  </Link>
                );

                if (sidebarCollapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger className="w-full">
                        {linkContent}
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return linkContent;
              })}
            </div>
          </>
        )}
      </nav>

      {/* Bottom section: User + Collapse */}
      <div className="border-t border-sidebar-border p-3">
        {/* User info row */}
        {!sidebarCollapsed && session?.user && (
          <div className="mb-3 flex items-center gap-2.5 rounded-lg bg-sidebar-accent/30 px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.50_0.13_230)] to-[oklch(0.45_0.12_240)] text-[11px] font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-sidebar-foreground">
                {session.user.name}
              </p>
              <p className="truncate text-[10px] text-sidebar-foreground/40">
                {session.user.email}
              </p>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className={cn(
            "h-8 w-full text-sidebar-foreground/35 transition-all duration-200 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            sidebarCollapsed && "w-8"
          )}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
