"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Plus,
  Search,
  User,
  Calendar,
  Tag,
  Building2,
  FolderOpen,
  Network,
  X,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface KnowledgeTag {
  id: string;
  name: string;
  color: string;
  _count: { articles: number };
}

interface ArticleTag {
  tag: { id: string; name: string; color: string };
}

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  isPublished: boolean;
  clientId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; email: string };
  tags: ArticleTag[];
}

interface PaginatedArticles {
  data: Article[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Tag color mapping
// ---------------------------------------------------------------------------
const TAG_COLORS: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  purple:
    "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  orange:
    "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400",
  slate: "bg-muted text-muted-foreground",
};

function getTagColorClass(color: string): string {
  return TAG_COLORS[color] ?? TAG_COLORS.slate;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function KnowledgeBasePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRoles: string[] = session?.user?.roles ?? [];
  const isAdmin = userRoles.includes("admin");

  // State
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<KnowledgeTag[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 12;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, selectedTagId]);

  // Fetch tags
  useEffect(() => {
    fetch("/api/knowledge/tags")
      .then((r) => r.json())
      .then(setTags)
      .catch(() => {});
  }, []);

  // Fetch articles
  const fetchArticles = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (!isAdmin) params.set("published", "true");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (selectedTagId) params.set("tagId", selectedTagId);

      const res = await fetch(`/api/knowledge/articles?${params}`);
      if (!res.ok) throw new Error("Failed to fetch articles");
      const data: PaginatedArticles = await res.json();
      setArticles(data.data);
      setTotal(data.total);
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, [offset, debouncedSearch, selectedTagId, isAdmin]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Articles, guides, and documentation for the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/knowledge/graph">
            <Button variant="outline" size="sm" className="gap-2">
              <Network className="h-4 w-4" />
              Knowledge Graph
            </Button>
          </Link>
          {isAdmin && (
            <Link href="/knowledge/new">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New Article
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search articles by title, content, or excerpt..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tag Filters */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Filter:
          </span>
          {selectedTagId && (
            <button
              onClick={() => setSelectedTagId(null)}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() =>
                setSelectedTagId(selectedTagId === tag.id ? null : tag.id)
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                selectedTagId === tag.id
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background " +
                      getTagColorClass(tag.color)
                  : getTagColorClass(tag.color) +
                      " opacity-70 hover:opacity-100"
              )}
            >
              <Tag className="h-3 w-3" />
              {tag.name}
              <span className="text-[10px] opacity-60">
                {tag._count.articles}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Article Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-5">
                <div className="space-y-3">
                  <div className="h-5 w-3/4 animate-shimmer rounded bg-muted" />
                  <div className="h-4 w-full animate-shimmer rounded bg-muted" />
                  <div className="h-4 w-2/3 animate-shimmer rounded bg-muted" />
                  <div className="flex gap-2 pt-2">
                    <div className="h-5 w-14 animate-shimmer rounded-full bg-muted" />
                    <div className="h-5 w-14 animate-shimmer rounded-full bg-muted" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No articles found"
          description={
            debouncedSearch || selectedTagId
              ? "Try adjusting your search or filter criteria."
              : "The knowledge base is empty. Create the first article to get started."
          }
          action={
            isAdmin && !debouncedSearch && !selectedTagId ? (
              <Link href="/knowledge/new">
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Article
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/knowledge/${article.slug}`}
                className="group"
              >
                <Card className="h-full overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/20 group-hover:bg-accent/30">
                  <CardContent className="flex h-full flex-col p-5">
                    {/* Status badges */}
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      {!article.isPublished && (
                        <Badge
                          variant="outline"
                          className="text-[10px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400"
                        >
                          Draft
                        </Badge>
                      )}
                      {article.clientId && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-1"
                        >
                          <Building2 className="h-2.5 w-2.5" />
                          Client
                        </Badge>
                      )}
                      {article.projectId && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-1"
                        >
                          <FolderOpen className="h-2.5 w-2.5" />
                          Project
                        </Badge>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>

                    {/* Excerpt */}
                    {article.excerpt && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-3 flex-1">
                        {article.excerpt}
                      </p>
                    )}

                    {/* Tags */}
                    {article.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {article.tags.slice(0, 3).map((at) => (
                          <span
                            key={at.tag.id}
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                              getTagColorClass(at.tag.color)
                            )}
                          >
                            {at.tag.name}
                          </span>
                        ))}
                        {article.tags.length > 3 && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            +{article.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Meta */}
                    <div className="mt-3 flex items-center gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {article.author.name}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {getRelativeTime(article.updatedAt)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Showing {offset + 1}-{Math.min(offset + limit, total)} of{" "}
                {total} articles
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
