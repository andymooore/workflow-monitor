"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Clock,
  Pencil,
  Tag,
  Trash2,
  User,
  Building2,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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
  authorId: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; email: string };
  tags: ArticleTag[];
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

// ---------------------------------------------------------------------------
// Markdown renderer — lightweight, handles common markdown syntax
// ---------------------------------------------------------------------------
function renderMarkdown(markdown: string): string {
  let html = markdown;

  // Escape HTML to prevent XSS
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (fenced)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, lang, code) =>
      `<pre class="rounded-lg bg-muted p-4 overflow-x-auto text-sm my-4"><code class="language-${lang}">${code.trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">$1</code>'
  );

  // Headers
  html = html.replace(
    /^#### (.+)$/gm,
    '<h4 class="text-base font-semibold mt-6 mb-2 text-foreground">$1</h4>'
  );
  html = html.replace(
    /^### (.+)$/gm,
    '<h3 class="text-lg font-semibold mt-8 mb-3 text-foreground">$1</h3>'
  );
  html = html.replace(
    /^## (.+)$/gm,
    '<h2 class="text-xl font-bold mt-10 mb-4 text-foreground border-b border-border pb-2">$1</h2>'
  );
  html = html.replace(
    /^# (.+)$/gm,
    '<h1 class="text-2xl font-bold mt-10 mb-4 text-foreground">$1</h1>'
  );

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-primary underline underline-offset-4 hover:text-primary/80" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Horizontal rules
  html = html.replace(
    /^---$/gm,
    '<hr class="my-8 border-border" />'
  );

  // Blockquotes
  html = html.replace(
    /^&gt; (.+)$/gm,
    '<blockquote class="border-l-4 border-primary/30 pl-4 my-4 text-muted-foreground italic">$1</blockquote>'
  );

  // Unordered lists
  html = html.replace(
    /^[\-\*] (.+)$/gm,
    '<li class="ml-4 list-disc text-muted-foreground">$1</li>'
  );

  // Ordered lists
  html = html.replace(
    /^\d+\. (.+)$/gm,
    '<li class="ml-4 list-decimal text-muted-foreground">$1</li>'
  );

  // Wrap consecutive <li> elements in <ul> or <ol>
  html = html.replace(
    /(<li class="ml-4 list-disc[^>]*>[\s\S]*?<\/li>\n?)+/g,
    (match) => `<ul class="my-4 space-y-1">${match}</ul>`
  );
  html = html.replace(
    /(<li class="ml-4 list-decimal[^>]*>[\s\S]*?<\/li>\n?)+/g,
    (match) => `<ol class="my-4 space-y-1">${match}</ol>`
  );

  // Paragraphs (lines that aren't already wrapped in HTML)
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Don't wrap if it's already an HTML element
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<pre") ||
        trimmed.startsWith("<blockquote") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<hr") ||
        trimmed.startsWith("<li")
      ) {
        return trimmed;
      }
      return `<p class="my-3 leading-7 text-muted-foreground">${trimmed.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return html;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ArticleDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const userRoles: string[] = session?.user?.roles ?? [];
  const isAdmin = userRoles.includes("admin");

  const [article, setArticle] = useState<Article | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch article by slug — we search for it
  const fetchArticle = useCallback(async () => {
    setIsLoading(true);
    try {
      // Find article by slug via the list endpoint
      const res = await fetch(
        `/api/knowledge/articles?search=${encodeURIComponent(slug)}&limit=100`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const found = data.data.find((a: Article) => a.slug === slug);

      if (!found) {
        router.replace("/knowledge");
        return;
      }

      // Fetch full article by ID
      const detailRes = await fetch(`/api/knowledge/articles/${found.id}`);
      if (!detailRes.ok) throw new Error("Failed to fetch article");
      const detail: Article = await detailRes.json();
      setArticle(detail);

      // Fetch related articles (same tags)
      if (detail.tags.length > 0) {
        const tagId = detail.tags[0].tag.id;
        const relatedRes = await fetch(
          `/api/knowledge/articles?tagId=${tagId}&limit=5&published=true`
        );
        if (relatedRes.ok) {
          const relatedData = await relatedRes.json();
          setRelatedArticles(
            relatedData.data.filter((a: Article) => a.id !== detail.id)
          );
        }
      }
    } catch {
      router.replace("/knowledge");
    } finally {
      setIsLoading(false);
    }
  }, [slug, router]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  const handleDelete = async () => {
    if (!article) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/knowledge/articles/${article.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Article deleted");
      router.push("/knowledge");
    } catch {
      toast.error("Failed to delete article");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!article) return null;

  const formattedDate = new Date(article.createdAt).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );
  const updatedDate = new Date(article.updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="animate-fade-in">
      {/* Back button */}
      <div className="mb-6">
        <Link href="/knowledge">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Knowledge Base
          </Button>
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main Content */}
        <div>
          {/* Article Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {!article.isPublished && (
                <Badge
                  variant="outline"
                  className="border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400"
                >
                  Draft
                </Badge>
              )}
              {article.clientId && (
                <Badge variant="outline" className="gap-1">
                  <Building2 className="h-3 w-3" />
                  Client Scoped
                </Badge>
              )}
              {article.projectId && (
                <Badge variant="outline" className="gap-1">
                  <FolderOpen className="h-3 w-3" />
                  Project Scoped
                </Badge>
              )}
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {article.title}
            </h1>

            {article.excerpt && (
              <p className="mt-3 text-base text-muted-foreground leading-relaxed">
                {article.excerpt}
              </p>
            )}

            {/* Meta row */}
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {article.author.name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formattedDate}
              </span>
              {article.updatedAt !== article.createdAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  Updated {updatedDate}
                </span>
              )}
            </div>

            {/* Tags */}
            {article.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {article.tags.map((at) => (
                  <span
                    key={at.tag.id}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                      getTagColorClass(at.tag.color)
                    )}
                  >
                    <Tag className="h-3 w-3" />
                    {at.tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Admin actions */}
            {isAdmin && (
              <div className="mt-5 flex items-center gap-2 border-t border-border pt-5">
                <Link href={`/knowledge/new?edit=${article.id}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Article
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            )}
          </div>

          {/* Article Body */}
          <div
            className="prose-custom"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(article.content),
            }}
          />
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Related Articles */}
          {relatedArticles.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Related Articles
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {relatedArticles.map((related) => (
                  <Link
                    key={related.id}
                    href={`/knowledge/${related.slug}`}
                    className="group block"
                  >
                    <div className="rounded-lg border border-border p-3 transition-all hover:bg-accent/50 hover:border-primary/20">
                      <h4 className="text-xs font-semibold text-foreground group-hover:text-primary line-clamp-2">
                        {related.title}
                      </h4>
                      {related.excerpt && (
                        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                          {related.excerpt}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <User className="h-2.5 w-2.5" />
                        {related.author.name}
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Article Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Article Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Author</span>
                <span className="font-medium text-foreground">
                  {article.author.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Created</span>
                <span className="font-medium text-foreground">
                  {formattedDate}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Updated</span>
                <span className="font-medium text-foreground">
                  {updatedDate}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Status</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    article.isPublished
                      ? "border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400"
                      : "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400"
                  )}
                >
                  {article.isPublished ? "Published" : "Draft"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Article</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{article.title}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
