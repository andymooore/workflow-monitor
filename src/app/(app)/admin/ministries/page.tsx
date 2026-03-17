"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Pencil,
  Archive,
  Landmark,
  Globe,
  Building2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface MinistryWithCounts {
  id: string;
  name: string;
  shortCode: string;
  description: string | null;
  status: string;
  website: string | null;
  headOfEntity: string | null;
  createdAt: string;
  _count: { clients: number };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminMinistriesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const { data: ministries, isLoading, refetch } = usePolling<MinistryWithCounts[]>(
    "/api/ministries",
    { interval: 30000 },
  );

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingMinistry, setEditingMinistry] = useState<MinistryWithCounts | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<MinistryWithCounts | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formShortCode, setFormShortCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formWebsite, setFormWebsite] = useState("");
  const [formHeadOfEntity, setFormHeadOfEntity] = useState("");
  const [formStatus, setFormStatus] = useState("ACTIVE");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreate = useCallback(() => {
    setFormName("");
    setFormShortCode("");
    setFormDescription("");
    setFormWebsite("");
    setFormHeadOfEntity("");
    setFormStatus("ACTIVE");
    setEditingMinistry(null);
    setDialogMode("create");
  }, []);

  const openEdit = useCallback((ministry: MinistryWithCounts) => {
    setFormName(ministry.name);
    setFormShortCode(ministry.shortCode);
    setFormDescription(ministry.description ?? "");
    setFormWebsite(ministry.website ?? "");
    setFormHeadOfEntity(ministry.headOfEntity ?? "");
    setFormStatus(ministry.status);
    setEditingMinistry(ministry);
    setDialogMode("edit");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formName.trim() || !formShortCode.trim()) {
      toast.error("Name and short code are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: formName.trim(),
        shortCode: formShortCode.trim().toUpperCase(),
        description: formDescription.trim() || null,
        website: formWebsite.trim() || null,
        headOfEntity: formHeadOfEntity.trim() || null,
      };

      if (dialogMode === "edit") {
        payload.status = formStatus;
      }

      const url = dialogMode === "edit" && editingMinistry
        ? `/api/ministries/${editingMinistry.id}`
        : "/api/ministries";
      const method = dialogMode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? err.error ?? "Failed to save ministry");
        return;
      }

      toast.success(dialogMode === "edit" ? "Ministry updated" : "Ministry created");
      setDialogMode(null);
      refetch();
    } catch {
      toast.error("Failed to save ministry");
    } finally {
      setIsSubmitting(false);
    }
  }, [formName, formShortCode, formDescription, formWebsite, formHeadOfEntity, formStatus, dialogMode, editingMinistry, refetch]);

  const handleArchive = useCallback(async () => {
    if (!archiveTarget) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/ministries/${archiveTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? err.error ?? "Failed to archive");
        return;
      }
      toast.success("Ministry archived");
      setArchiveTarget(null);
      refetch();
    } catch {
      toast.error("Failed to archive ministry");
    } finally {
      setIsSubmitting(false);
    }
  }, [archiveTarget, refetch]);

  // Auth guard — must come after all hooks
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
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading ministries...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ministries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage government ministries and departments that oversee client organizations
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" data-icon="inline-start" />
          New Ministry
        </Button>
      </div>

      {/* Ministry list */}
      {(ministries?.length ?? 0) > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ministries!.map((ministry) => (
            <Card key={ministry.id} className="transition-all hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                      <Landmark className="size-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{ministry.name}</h3>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {ministry.shortCode}
                        </Badge>
                      </div>
                      {ministry.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {ministry.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {ministry.headOfEntity && (
                          <span className="flex items-center gap-1">
                            <User className="size-3" />
                            {ministry.headOfEntity}
                          </span>
                        )}
                        {ministry.website && (
                          <span className="flex items-center gap-1">
                            <Globe className="size-3" />
                            {ministry.website}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Building2 className="size-3" />
                          {ministry._count.clients} client{ministry._count.clients !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(ministry)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setArchiveTarget(ministry)}>
                      <Archive className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <Landmark className="size-8 text-muted-foreground/50" />
            </div>
            <p className="mt-4 text-lg font-medium text-muted-foreground">No ministries yet</p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Create ministries to organize client organizations under government departments
            </p>
            <Button className="mt-6" onClick={openCreate}>
              <Plus className="size-4" data-icon="inline-start" />
              Create Ministry
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
              {dialogMode === "edit" ? "Edit Ministry" : "New Ministry"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "edit"
                ? "Update the ministry details"
                : "Add a new government ministry or department"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ministry of National Security"
                />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  value={formShortCode}
                  onChange={(e) => setFormShortCode(e.target.value.toUpperCase())}
                  placeholder="MNS"
                  maxLength={10}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief description of the ministry"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Head of Entity</Label>
              <Input
                value={formHeadOfEntity}
                onChange={(e) => setFormHeadOfEntity(e.target.value)}
                placeholder="Minister / Permanent Secretary name"
              />
            </div>

            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={formWebsite}
                onChange={(e) => setFormWebsite(e.target.value)}
                placeholder="https://mns.gov.jm"
              />
            </div>

            {dialogMode === "edit" && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={(v) => { if (v) setFormStatus(v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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
              disabled={isSubmitting || !formName.trim() || !formShortCode.trim()}
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

      {/* ── Archive Confirmation Dialog ── */}
      <Dialog
        open={!!archiveTarget}
        onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Ministry</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive &quot;{archiveTarget?.name}&quot;? This ministry
              will no longer appear in dropdowns for new clients. Existing client associations
              will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveTarget(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
