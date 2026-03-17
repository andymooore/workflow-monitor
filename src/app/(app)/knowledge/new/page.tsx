"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Save,
  Tag,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface KnowledgeTag {
  id: string;
  name: string;
  color: string;
}

interface Client {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  clientId: string;
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
  tags: { tag: KnowledgeTag }[];
}

// ---------------------------------------------------------------------------
// Markdown preview renderer (same as detail page)
// ---------------------------------------------------------------------------
function renderMarkdown(markdown: string): string {
  let html = markdown;
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, lang, code) =>
      `<pre class="rounded-lg bg-muted p-4 overflow-x-auto text-sm my-4"><code class="language-${lang}">${code.trim()}</code></pre>`
  );
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">$1</code>'
  );
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
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-primary underline underline-offset-4 hover:text-primary/80" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  html = html.replace(
    /^---$/gm,
    '<hr class="my-8 border-border" />'
  );
  html = html.replace(
    /^&gt; (.+)$/gm,
    '<blockquote class="border-l-4 border-primary/30 pl-4 my-4 text-muted-foreground italic">$1</blockquote>'
  );
  html = html.replace(
    /^[\-\*] (.+)$/gm,
    '<li class="ml-4 list-disc text-muted-foreground">$1</li>'
  );
  html = html.replace(
    /^\d+\. (.+)$/gm,
    '<li class="ml-4 list-decimal text-muted-foreground">$1</li>'
  );
  html = html.replace(
    /(<li class="ml-4 list-disc[^>]*>[\s\S]*?<\/li>\n?)+/g,
    (match) => `<ul class="my-4 space-y-1">${match}</ul>`
  );
  html = html.replace(
    /(<li class="ml-4 list-decimal[^>]*>[\s\S]*?<\/li>\n?)+/g,
    (match) => `<ol class="my-4 space-y-1">${match}</ol>`
  );
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
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
// Slug generator
// ---------------------------------------------------------------------------
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function ArticleEditorPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditing = !!editId;
  const userRoles: string[] = session?.user?.roles ?? [];
  const isAdmin = userRoles.includes("admin");

  // Redirect non-admins
  useEffect(() => {
    if (session && !isAdmin) {
      router.replace("/knowledge");
    }
  }, [session, isAdmin, router]);

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [clientId, setClientId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");

  // Data
  const [existingTags, setExistingTags] = useState<KnowledgeTag[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugManual && !isEditing) {
      setSlug(generateSlug(title));
    }
  }, [title, slugManual, isEditing]);

  // Fetch reference data
  useEffect(() => {
    Promise.all([
      fetch("/api/knowledge/tags").then((r) => r.json()),
      fetch("/api/clients?limit=200").then((r) => r.json()),
    ]).then(([tagsData, clientsData]) => {
      setExistingTags(Array.isArray(tagsData) ? tagsData : []);
      setClients(
        Array.isArray(clientsData?.data) ? clientsData.data : []
      );
    });
  }, []);

  // Fetch projects when client changes
  useEffect(() => {
    if (clientId) {
      fetch(`/api/clients/${clientId}/projects`)
        .then((r) => r.json())
        .then((data) => {
          setProjects(Array.isArray(data) ? data : data?.data ?? []);
        })
        .catch(() => setProjects([]));
    } else {
      setProjects([]);
      setProjectId("");
    }
  }, [clientId]);

  // Load existing article for editing
  useEffect(() => {
    if (!editId) return;
    setIsLoadingArticle(true);
    fetch(`/api/knowledge/articles/${editId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((article: Article) => {
        setTitle(article.title);
        setSlug(article.slug);
        setSlugManual(true);
        setExcerpt(article.excerpt ?? "");
        setContent(article.content);
        setIsPublished(article.isPublished);
        setClientId(article.clientId ?? "");
        setProjectId(article.projectId ?? "");
        setSelectedTags(article.tags.map((t) => t.tag.name));
      })
      .catch(() => {
        toast.error("Article not found");
        router.replace("/knowledge");
      })
      .finally(() => setIsLoadingArticle(false));
  }, [editId, router]);

  const addTag = useCallback(
    (tagName: string) => {
      const trimmed = tagName.trim();
      if (trimmed && !selectedTags.includes(trimmed)) {
        setSelectedTags((prev) => [...prev, trimmed]);
      }
    },
    [selectedTags]
  );

  const removeTag = useCallback((tagName: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tagName));
  }, []);

  const handleAddNewTag = () => {
    if (newTagName.trim()) {
      addTag(newTagName.trim());
      setNewTagName("");
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!slug.trim()) {
      toast.error("Slug is required");
      return;
    }
    if (!content.trim()) {
      toast.error("Content is required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim(),
        content: content.trim(),
        excerpt: excerpt.trim() || null,
        isPublished,
        clientId: clientId || null,
        projectId: projectId || null,
        tags: selectedTags,
      };

      const url = isEditing
        ? `/api/knowledge/articles/${editId}`
        : "/api/knowledge/articles";

      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          err?.error?.message ?? "Failed to save article"
        );
      }

      const saved = await res.json();
      toast.success(
        isEditing ? "Article updated" : "Article created"
      );
      router.push(`/knowledge/${saved.slug ?? slug}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save article"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) return null;

  if (isLoadingArticle) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/knowledge">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {isEditing ? "Edit Article" : "New Article"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEditing
                ? "Update this knowledge base article"
                : "Create a new knowledge base article"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                Preview
              </>
            )}
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isEditing ? "Update" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main Editor */}
        <div className="space-y-5">
          {showPreview ? (
            <Card>
              <CardContent className="p-6">
                <h1 className="text-2xl font-bold text-foreground mb-4">
                  {title || "Untitled Article"}
                </h1>
                {excerpt && (
                  <p className="text-muted-foreground mb-6">{excerpt}</p>
                )}
                <div
                  className="prose-custom"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(content || "*No content yet.*"),
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Article title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg font-semibold"
                />
              </div>

              {/* Slug */}
              <div className="space-y-2">
                <Label htmlFor="slug">
                  Slug
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (URL-friendly identifier)
                  </span>
                </Label>
                <Input
                  id="slug"
                  placeholder="article-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugManual(true);
                  }}
                  className="font-mono text-sm"
                />
              </div>

              {/* Excerpt */}
              <div className="space-y-2">
                <Label htmlFor="excerpt">
                  Excerpt
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (optional summary)
                  </span>
                </Label>
                <Textarea
                  id="excerpt"
                  placeholder="Brief summary of the article..."
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label htmlFor="content">
                  Content
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (Markdown supported)
                  </span>
                </Label>
                <Textarea
                  id="content"
                  placeholder="Write your article content in Markdown..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={20}
                  className="font-mono text-sm leading-relaxed"
                />
              </div>
            </>
          )}
        </div>

        {/* Sidebar Controls */}
        <div className="space-y-5">
          {/* Publish Toggle */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Publishing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Status
                </span>
                <button
                  type="button"
                  onClick={() => setIsPublished(!isPublished)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isPublished ? "bg-emerald-500" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
                      isPublished ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {isPublished
                  ? "Article is visible to all users"
                  : "Article is in draft mode (admin only)"}
              </p>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Selected tags */}
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedTags.map((tagName) => (
                    <Badge
                      key={tagName}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {tagName}
                      <button
                        type="button"
                        onClick={() => removeTag(tagName)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Existing tags to pick from */}
              {existingTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {existingTags
                    .filter((t) => !selectedTags.includes(t.name))
                    .map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => addTag(tag.name)}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        <Plus className="h-2.5 w-2.5" />
                        {tag.name}
                      </button>
                    ))}
                </div>
              )}

              {/* Add new tag */}
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder="New tag..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddNewTag();
                    }
                  }}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={handleAddNewTag}
                  disabled={!newTagName.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Scope */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Scope
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (optional)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Client</Label>
                <Select
                  value={clientId || "__none__"}
                  onValueChange={(v) =>
                    setClientId(v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="No client scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No client scope</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {clientId && projects.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Project</Label>
                  <Select
                    value={projectId || "__none__"}
                    onValueChange={(v) =>
                      setProjectId(v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="No project scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        No project scope
                      </SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ArticleEditorPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
      <ArticleEditorPageContent />
    </Suspense>
  );
}
