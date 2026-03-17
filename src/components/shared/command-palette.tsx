"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  FileText,
  CheckSquare,
  ShieldCheck,
  Settings,
  Workflow,
  Activity,
  Users,
  Tags,
  Building2,
  Landmark,
  ArrowRight,
  Loader2,
  Globe,
  User,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  type: "workflow" | "instance" | "user" | "client";
  title: string;
  description: string | null;
  url: string;
}

interface NavItem {
  title: string;
  url: string;
  icon: React.ReactNode;
  group: string;
}

// ---------------------------------------------------------------------------
// Static navigation items
// ---------------------------------------------------------------------------

const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" />, group: "Navigation" },
  { title: "Requests", url: "/requests", icon: <FileText className="h-4 w-4" />, group: "Navigation" },
  { title: "My Tasks", url: "/my-tasks", icon: <CheckSquare className="h-4 w-4" />, group: "Navigation" },
  { title: "Approvals", url: "/approvals", icon: <ShieldCheck className="h-4 w-4" />, group: "Navigation" },
  { title: "Settings", url: "/settings", icon: <Settings className="h-4 w-4" />, group: "Navigation" },
  { title: "Workflows", url: "/workflows", icon: <Workflow className="h-4 w-4" />, group: "Administration" },
  { title: "Instances", url: "/instances", icon: <Activity className="h-4 w-4" />, group: "Administration" },
  { title: "Users", url: "/admin/users", icon: <Users className="h-4 w-4" />, group: "Administration" },
  { title: "Roles", url: "/admin/roles", icon: <Tags className="h-4 w-4" />, group: "Administration" },
  { title: "Clients", url: "/admin/clients", icon: <Building2 className="h-4 w-4" />, group: "Administration" },
  { title: "Ministries", url: "/admin/ministries", icon: <Landmark className="h-4 w-4" />, group: "Administration" },
  { title: "Categories", url: "/admin/categories", icon: <Tags className="h-4 w-4" />, group: "Administration" },
];

// ---------------------------------------------------------------------------
// Icon by result type
// ---------------------------------------------------------------------------

function getResultIcon(type: string) {
  switch (type) {
    case "workflow":
      return <Workflow className="h-4 w-4 text-blue-400" />;
    case "instance":
      return <Activity className="h-4 w-4 text-emerald-400" />;
    case "user":
      return <User className="h-4 w-4 text-purple-400" />;
    case "client":
      return <Globe className="h-4 w-4 text-amber-400" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ---- Keyboard shortcut to open ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ---- Focus input when opened ----
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // ---- Debounced search ----
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ---- Build the items list ----
  const filteredNav = query
    ? NAV_ITEMS.filter((item) =>
        item.title.toLowerCase().includes(query.toLowerCase())
      )
    : NAV_ITEMS;

  const allItems: { title: string; description?: string | null; url: string; icon: React.ReactNode; group: string }[] = [];

  // Add nav items
  if (filteredNav.length > 0 && query.length < 2) {
    for (const item of filteredNav) {
      allItems.push({ ...item });
    }
  } else if (filteredNav.length > 0 && query.length >= 2) {
    for (const item of filteredNav.slice(0, 3)) {
      allItems.push({ ...item });
    }
  }

  // Add search results
  if (results.length > 0) {
    for (const r of results) {
      allItems.push({
        title: r.title,
        description: r.description,
        url: r.url,
        icon: getResultIcon(r.type),
        group: r.type === "workflow" ? "Workflows" : r.type === "instance" ? "Instances" : r.type === "user" ? "Users" : "Clients",
      });
    }
  }

  // Reset index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allItems.length]);

  // ---- Navigate to selected ----
  const navigate = useCallback(
    (url: string) => {
      setOpen(false);
      router.push(url);
    },
    [router],
  );

  // ---- Keyboard navigation ----
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, allItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && allItems[selectedIndex]) {
        e.preventDefault();
        navigate(allItems[selectedIndex].url);
      }
    },
    [allItems, selectedIndex, navigate],
  );

  // ---- Scroll selected item into view ----
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  // Group items for display
  const grouped = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const group = grouped.get(item.group) ?? [];
    group.push(item);
    grouped.set(item.group, group);
  }

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="fixed top-[15%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, workflows, instances..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <kbd className="hidden rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {allItems.length === 0 && query.length >= 2 && !loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            Array.from(grouped.entries()).map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {group}
                </div>
                {items.map((item) => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={`${item.url}-${idx}`}
                      data-index={idx}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        idx === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/80 hover:bg-muted/50"
                      }`}
                      onClick={() => navigate(item.url)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className="shrink-0 opacity-70">{item.icon}</span>
                      <span className="flex-1 truncate">
                        <span className="font-medium">{item.title}</span>
                        {item.description && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                      </span>
                      {idx === selectedIndex && (
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/40 px-4 py-2 text-[11px] text-muted-foreground/60">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono text-[10px]">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono text-[10px]">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export the open trigger for use in topbar
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
