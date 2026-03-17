"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Server,
  Shield,
  KeyRound,
  Rocket,
  FolderOpen,
  FileText,
  AlertTriangle,
  Monitor,
  Globe,
  Database,
  Settings,
  Zap,
  BookOpen,
  Users,
  Bell,
} from "lucide-react";
import { toast } from "sonner";

import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ─── Icon & color options ────────────────────────────────────────────────────

const ICON_OPTIONS = [
  { value: "Server", label: "Server", Icon: Server },
  { value: "Shield", label: "Shield", Icon: Shield },
  { value: "KeyRound", label: "Key", Icon: KeyRound },
  { value: "Rocket", label: "Rocket", Icon: Rocket },
  { value: "FolderOpen", label: "Folder", Icon: FolderOpen },
  { value: "FileText", label: "Document", Icon: FileText },
  { value: "AlertTriangle", label: "Alert", Icon: AlertTriangle },
  { value: "Monitor", label: "Monitor", Icon: Monitor },
  { value: "Globe", label: "Globe", Icon: Globe },
  { value: "Database", label: "Database", Icon: Database },
  { value: "Settings", label: "Settings", Icon: Settings },
  { value: "Zap", label: "Zap", Icon: Zap },
  { value: "BookOpen", label: "Book", Icon: BookOpen },
  { value: "Users", label: "Users", Icon: Users },
  { value: "Bell", label: "Bell", Icon: Bell },
] as const;

const COLOR_OPTIONS = [
  { value: "blue", label: "Blue", swatch: "bg-blue-500" },
  { value: "amber", label: "Amber", swatch: "bg-amber-500" },
  { value: "purple", label: "Purple", swatch: "bg-purple-500" },
  { value: "emerald", label: "Emerald", swatch: "bg-emerald-500" },
  { value: "slate", label: "Slate", swatch: "bg-slate-500" },
  { value: "red", label: "Red", swatch: "bg-red-500" },
  { value: "orange", label: "Orange", swatch: "bg-orange-500" },
  { value: "cyan", label: "Cyan", swatch: "bg-cyan-500" },
  { value: "pink", label: "Pink", swatch: "bg-pink-500" },
  { value: "indigo", label: "Indigo", swatch: "bg-indigo-500" },
] as const;

const ICON_MAP: Record<string, React.ElementType> = Object.fromEntries(
  ICON_OPTIONS.map((o) => [o.value, o.Icon]),
);

const COLOR_CLASS: Record<string, { text: string; bg: string; border: string }> = {
  blue: { text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800" },
  amber: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800" },
  purple: { text: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/40", border: "border-purple-200 dark:border-purple-800" },
  emerald: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800" },
  slate: { text: "text-slate-600 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-950/40", border: "border-slate-200 dark:border-slate-800" },
  red: { text: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/40", border: "border-red-200 dark:border-red-800" },
  orange: { text: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-200 dark:border-orange-800" },
  cyan: { text: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-950/40", border: "border-cyan-200 dark:border-cyan-800" },
  pink: { text: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-950/40", border: "border-pink-200 dark:border-pink-800" },
  indigo: { text: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-200 dark:border-indigo-800" },
};

function getColorClasses(color: string) {
  return COLOR_CLASS[color] ?? COLOR_CLASS.slate;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminCategoriesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: categories, isLoading, refetch } = usePolling<Category[]>(
    "/api/categories",
    { interval: 30000 },
  );

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIcon, setFormIcon] = useState("FolderOpen");
  const [formColor, setFormColor] = useState("slate");
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreate = useCallback(() => {
    setFormName("");
    setFormDescription("");
    setFormIcon("FolderOpen");
    setFormColor("slate");
    setFormSortOrder((categories?.length ?? 0));
    setEditingCategory(null);
    setDialogMode("create");
  }, [categories]);

  const openEdit = useCallback((cat: Category) => {
    setFormName(cat.name);
    setFormDescription(cat.description ?? "");
    setFormIcon(cat.icon);
    setFormColor(cat.color);
    setFormSortOrder(cat.sortOrder);
    setEditingCategory(cat);
    setDialogMode("edit");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formName.trim()) {
      toast.error("Category name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        icon: formIcon,
        color: formColor,
        sortOrder: formSortOrder,
      };

      const url = dialogMode === "edit" && editingCategory
        ? `/api/categories/${editingCategory.id}`
        : "/api/categories";
      const method = dialogMode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error);
        return;
      }

      toast.success(dialogMode === "edit" ? "Category updated" : "Category created");
      setDialogMode(null);
      refetch();
    } catch {
      toast.error("Failed to save category");
    } finally {
      setIsSubmitting(false);
    }
  }, [formName, formDescription, formIcon, formColor, formSortOrder, dialogMode, editingCategory, refetch]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/categories/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error);
        return;
      }

      toast.success("Category deleted");
      setDeleteTarget(null);
      refetch();
    } catch {
      toast.error("Failed to delete category");
    } finally {
      setIsSubmitting(false);
    }
  }, [deleteTarget, refetch]);

  // Auth guard — must come after all hooks
  const userRoles: string[] = session?.user?.roles ?? [];
  if (status === "loading") {
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
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading categories...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflow Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage categories that organize workflows in the service catalog
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" data-icon="inline-start" />
          New Category
        </Button>
      </div>

      {/* Category list */}
      {(categories?.length ?? 0) > 0 ? (
        <div className="space-y-3">
          {categories!.map((cat) => {
            const colorClasses = getColorClasses(cat.color);
            const Icon = ICON_MAP[cat.icon] ?? FolderOpen;

            return (
              <Card key={cat.id} className={`${colorClasses.border}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Drag handle + icon */}
                    <div className="flex items-center gap-2">
                      <GripVertical className="size-4 text-muted-foreground/40" />
                      <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${colorClasses.bg}`}>
                        <Icon className={`size-5 ${colorClasses.text}`} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{cat.name}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          Order: {cat.sortOrder}
                        </Badge>
                      </div>
                      {cat.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
                          {cat.description}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(cat)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTarget(cat)}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <FolderOpen className="size-8 text-muted-foreground/50" />
            </div>
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              No categories yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Create categories to organize your workflows in the service catalog
            </p>
            <Button className="mt-6" onClick={openCreate}>
              <Plus className="size-4" data-icon="inline-start" />
              Create Category
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => { if (!open) setDialogMode(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "edit" ? "Edit Category" : "New Category"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "edit"
                ? "Update the category details"
                : "Create a new category for organizing workflows"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Environment Management"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description shown in the service catalog"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={formIcon} onValueChange={(v) => { if (v) setFormIcon(v); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <opt.Icon className="size-3.5" />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <Select value={formColor} onValueChange={(v) => { if (v) setFormColor(v); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <span className={`size-3 rounded-full ${opt.swatch}`} />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-order">Sort Order</Label>
              <Input
                id="cat-order"
                type="number"
                min={0}
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
              />
              <p className="text-[11px] text-muted-foreground">
                Lower numbers appear first in the service catalog
              </p>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className={`flex items-center gap-3 rounded-lg border p-3 ${getColorClasses(formColor).border}`}>
                <div className={`flex size-9 items-center justify-center rounded-lg ${getColorClasses(formColor).bg}`}>
                  {(() => {
                    const PreviewIcon = ICON_MAP[formIcon] ?? FolderOpen;
                    return <PreviewIcon className={`size-4.5 ${getColorClasses(formColor).text}`} />;
                  })()}
                </div>
                <div>
                  <p className="text-sm font-medium">{formName || "Category Name"}</p>
                  <p className="text-xs text-muted-foreground">{formDescription || "Description"}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogMode(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !formName.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : dialogMode === "edit" ? (
                "Update"
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? Any workflows using this category will be moved to &quot;General&quot;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
