"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Plus,
  Pencil,
  Archive,
  Building2,
  Globe,
  FolderOpen,
  Activity,
  Landmark,
  Users,
  CheckCircle2,
  Shield,
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
import { Separator } from "@/components/ui/separator";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientWithCounts {
  id: string;
  name: string;
  shortCode: string;
  description: string | null;
  status: string;
  website: string | null;
  ministryId: string | null;
  referenceNumber: string | null;
  slaTier: string;
  addressStreet: string | null;
  addressCity: string | null;
  addressParish: string | null;
  hasSignedAgreement: boolean;
  agreementDate: string | null;
  agreementReference: string | null;
  ministry: { id: string; name: string; shortCode: string } | null;
  _count: { projects: number; instances: number; contacts: number };
}

interface MinistryOption {
  id: string;
  name: string;
  shortCode: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SLA_BADGE_COLORS: Record<string, string> = {
  GOLD: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  SILVER: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  BRONZE: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950/40 dark:text-slate-400 dark:border-slate-700",
};

const PARISH_OPTIONS = [
  { value: "KINGSTON", label: "Kingston" },
  { value: "ST_ANDREW", label: "St. Andrew" },
  { value: "ST_THOMAS", label: "St. Thomas" },
  { value: "PORTLAND", label: "Portland" },
  { value: "ST_MARY", label: "St. Mary" },
  { value: "ST_ANN", label: "St. Ann" },
  { value: "TRELAWNY", label: "Trelawny" },
  { value: "ST_JAMES", label: "St. James" },
  { value: "HANOVER", label: "Hanover" },
  { value: "WESTMORELAND", label: "Westmoreland" },
  { value: "ST_ELIZABETH", label: "St. Elizabeth" },
  { value: "MANCHESTER", label: "Manchester" },
  { value: "CLARENDON", label: "Clarendon" },
  { value: "ST_CATHERINE", label: "St. Catherine" },
] as const;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminClientsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const { data: clientsRes, isLoading, refetch } = usePolling<{ data: ClientWithCounts[]; total: number }>(
    "/api/clients?status=ACTIVE",
    { interval: 30000 },
  );
  const clients = clientsRes?.data ?? null;

  const { data: ministries } = usePolling<MinistryOption[]>(
    "/api/ministries",
    { interval: 60000 },
  );

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingClient, setEditingClient] = useState<ClientWithCounts | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ClientWithCounts | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formShortCode, setFormShortCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formWebsite, setFormWebsite] = useState("");
  const [formMinistryId, setFormMinistryId] = useState("");
  const [formSlaTier, setFormSlaTier] = useState("BRONZE");
  const [formAddressStreet, setFormAddressStreet] = useState("");
  const [formAddressCity, setFormAddressCity] = useState("");
  const [formAddressParish, setFormAddressParish] = useState("");
  const [formHasSignedAgreement, setFormHasSignedAgreement] = useState(false);
  const [formAgreementDate, setFormAgreementDate] = useState("");
  const [formAgreementReference, setFormAgreementReference] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormShortCode("");
    setFormDescription("");
    setFormWebsite("");
    setFormMinistryId("");
    setFormSlaTier("BRONZE");
    setFormAddressStreet("");
    setFormAddressCity("");
    setFormAddressParish("");
    setFormHasSignedAgreement(false);
    setFormAgreementDate("");
    setFormAgreementReference("");
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setEditingClient(null);
    setDialogMode("create");
  }, [resetForm]);

  const openEdit = useCallback((client: ClientWithCounts) => {
    setFormName(client.name);
    setFormShortCode(client.shortCode);
    setFormDescription(client.description ?? "");
    setFormWebsite(client.website ?? "");
    setFormMinistryId(client.ministryId ?? "");
    setFormSlaTier(client.slaTier);
    setFormAddressStreet(client.addressStreet ?? "");
    setFormAddressCity(client.addressCity ?? "");
    setFormAddressParish(client.addressParish ?? "");
    setFormHasSignedAgreement(client.hasSignedAgreement);
    setFormAgreementDate(client.agreementDate ? client.agreementDate.split("T")[0] : "");
    setFormAgreementReference(client.agreementReference ?? "");
    setEditingClient(client);
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
        ministryId: formMinistryId || null,
        slaTier: formSlaTier,
        addressStreet: formAddressStreet.trim() || null,
        addressCity: formAddressCity.trim() || null,
        addressParish: formAddressParish || null,
        hasSignedAgreement: formHasSignedAgreement,
        agreementDate: formAgreementDate ? new Date(formAgreementDate).toISOString() : null,
        agreementReference: formAgreementReference.trim() || null,
      };

      const url = dialogMode === "edit" && editingClient
        ? `/api/clients/${editingClient.id}`
        : "/api/clients";
      const method = dialogMode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? err.error ?? "Failed to save client");
        return;
      }

      toast.success(dialogMode === "edit" ? "Client updated" : "Client created");
      setDialogMode(null);
      refetch();
    } catch {
      toast.error("Failed to save client");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    formName, formShortCode, formDescription, formWebsite,
    formMinistryId, formSlaTier, formAddressStreet, formAddressCity, formAddressParish,
    formHasSignedAgreement, formAgreementDate, formAgreementReference,
    dialogMode, editingClient, refetch,
  ]);

  const handleArchive = useCallback(async () => {
    if (!archiveTarget) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${archiveTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? err.error ?? "Failed to archive");
        return;
      }
      toast.success("Client archived");
      setArchiveTarget(null);
      refetch();
    } catch {
      toast.error("Failed to archive client");
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
        <p className="text-sm text-muted-foreground">Loading clients...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage client organizations linked to workflow requests
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" data-icon="inline-start" />
          New Client
        </Button>
      </div>

      {(clients?.length ?? 0) > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {clients!.map((client) => (
            <Card key={client.id} className="transition-all hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{client.name}</h3>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {client.shortCode}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold ${SLA_BADGE_COLORS[client.slaTier] ?? SLA_BADGE_COLORS.BRONZE}`}
                        >
                          <Shield className="size-2.5" />
                          {client.slaTier}
                        </Badge>
                      </div>

                      {client.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {client.description}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {client.ministry && (
                          <span className="flex items-center gap-1">
                            <Landmark className="size-3" />
                            {client.ministry.name}
                          </span>
                        )}
                        {client.website && (
                          <span className="flex items-center gap-1">
                            <Globe className="size-3" />
                            {client.website}
                          </span>
                        )}
                        {client.hasSignedAgreement && (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" />
                            Agreement signed
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <FolderOpen className="size-3" />
                          {client._count.projects} project{client._count.projects !== 1 ? "s" : ""}
                        </Badge>
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Activity className="size-3" />
                          {client._count.instances} instance{client._count.instances !== 1 ? "s" : ""}
                        </Badge>
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Users className="size-3" />
                          {client._count.contacts} contact{client._count.contacts !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(client)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setArchiveTarget(client)}>
                        <Archive className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                    <Link href={`/admin/clients/${client.id}`}>
                      <Button variant="outline" size="xs" className="mt-1">
                        <Users className="size-3" data-icon="inline-start" />
                        Manage Contacts
                      </Button>
                    </Link>
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
              <Building2 className="size-8 text-muted-foreground/50" />
            </div>
            <p className="mt-4 text-lg font-medium text-muted-foreground">No clients yet</p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Create your first client organization
            </p>
            <Button className="mt-6" onClick={openCreate}>
              <Plus className="size-4" data-icon="inline-start" />
              Create Client
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) setDialogMode(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === "edit" ? "Edit Client" : "New Client"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "edit" ? "Update client details" : "Add a new client organization"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="E-Gov Jamaica Ltd"
                />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  value={formShortCode}
                  onChange={(e) => setFormShortCode(e.target.value.toUpperCase())}
                  placeholder="EGOV"
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
                placeholder="Brief description"
                rows={2}
              />
            </div>

            <Separator />

            {/* Ministry + SLA */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ministry</Label>
                <Select
                  value={formMinistryId || "__none__"}
                  onValueChange={(v) => setFormMinistryId(v === "__none__" || v === null ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select ministry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No ministry</SelectItem>
                    {(ministries ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id} label={`${m.name} (${m.shortCode})`}>
                        {m.name} ({m.shortCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>SLA Tier</Label>
                <Select value={formSlaTier} onValueChange={(v) => { if (v) setFormSlaTier(v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GOLD">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full bg-emerald-500" />
                        Gold
                      </div>
                    </SelectItem>
                    <SelectItem value="SILVER">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full bg-blue-500" />
                        Silver
                      </div>
                    </SelectItem>
                    <SelectItem value="BRONZE">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full bg-slate-400" />
                        Bronze
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={formWebsite}
                onChange={(e) => setFormWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <Separator />

            {/* Address */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address</p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Street</Label>
                <Input
                  value={formAddressStreet}
                  onChange={(e) => setFormAddressStreet(e.target.value)}
                  placeholder="123 Main Street"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={formAddressCity}
                    onChange={(e) => setFormAddressCity(e.target.value)}
                    placeholder="Kingston"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Parish</Label>
                  <Select
                    value={formAddressParish || "__none__"}
                    onValueChange={(v) => setFormAddressParish(v === "__none__" || v === null ? "" : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select parish" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No parish</SelectItem>
                      {PARISH_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Agreement */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agreement</p>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formHasSignedAgreement}
                  onChange={(e) => setFormHasSignedAgreement(e.target.checked)}
                  className="size-4 rounded border-border accent-primary"
                />
                <span className="text-sm">Has signed agreement</span>
              </label>
              {formHasSignedAgreement && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Agreement Date</Label>
                    <Input
                      type="date"
                      value={formAgreementDate}
                      onChange={(e) => setFormAgreementDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference #</Label>
                    <Input
                      value={formAgreementReference}
                      onChange={(e) => setFormAgreementReference(e.target.value)}
                      placeholder="AGR-2026-001"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !formName.trim() || !formShortCode.trim()}>
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

      {/* ── Archive Confirmation ── */}
      <Dialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive &quot;{archiveTarget?.name}&quot;? This client will
              no longer appear in dropdowns for new requests.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive} disabled={isSubmitting}>
              {isSubmitting ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
