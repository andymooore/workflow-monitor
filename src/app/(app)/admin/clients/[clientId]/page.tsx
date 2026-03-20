"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Plus,
  Pencil,
  Archive,
  Building2,
  Globe,
  Landmark,
  Users,
  FolderOpen,
  Activity,
  Mail,
  Phone,
  Shield,
  CheckCircle2,
  ArrowLeft,
  UserCircle,
  Star,
  XCircle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ActivityFeed } from "@/components/shared/activity-feed";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientDetail {
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
  contacts: ClientContact[];
  projects: ProjectSummary[];
  _count: { projects: number; instances: number; contacts: number };
}

interface ClientContact {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  department: string | null;
  role: string;
  isPrimary: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  status?: string;
  health?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SLA_BADGE_COLORS: Record<string, string> = {
  GOLD: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  SILVER: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  BRONZE: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950/40 dark:text-slate-400 dark:border-slate-700",
};

const CONTACT_ROLE_OPTIONS = [
  { value: "PRIMARY", label: "Primary" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "ESCALATION", label: "Escalation" },
  { value: "BILLING", label: "Billing" },
  { value: "DATA_PROTECTION_OFFICER", label: "Data Protection Officer" },
] as const;

const ROLE_BADGE_COLORS: Record<string, string> = {
  PRIMARY: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  TECHNICAL: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800",
  ESCALATION: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  BILLING: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  DATA_PROTECTION_OFFICER: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
};

const PARISH_LABELS: Record<string, string> = {
  KINGSTON: "Kingston",
  ST_ANDREW: "St. Andrew",
  ST_THOMAS: "St. Thomas",
  PORTLAND: "Portland",
  ST_MARY: "St. Mary",
  ST_ANN: "St. Ann",
  TRELAWNY: "Trelawny",
  ST_JAMES: "St. James",
  HANOVER: "Hanover",
  WESTMORELAND: "Westmoreland",
  ST_ELIZABETH: "St. Elizabeth",
  MANCHESTER: "Manchester",
  CLARENDON: "Clarendon",
  ST_CATHERINE: "St. Catherine",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;

  const { data: client, isLoading, refetch } = usePolling<ClientDetail>(
    `/api/clients/${clientId}`,
    { interval: 15000 },
  );

  // Contact dialog state
  const [contactDialogMode, setContactDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ClientContact | null>(null);

  // Contact form state
  const [formContactName, setFormContactName] = useState("");
  const [formContactEmail, setFormContactEmail] = useState("");
  const [formContactPhone, setFormContactPhone] = useState("");
  const [formContactTitle, setFormContactTitle] = useState("");
  const [formContactDepartment, setFormContactDepartment] = useState("");
  const [formContactRole, setFormContactRole] = useState("PRIMARY");
  const [formContactIsPrimary, setFormContactIsPrimary] = useState(false);
  const [formContactNotes, setFormContactNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Project dialog state
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [formProjectName, setFormProjectName] = useState("");
  const [formProjectDesc, setFormProjectDesc] = useState("");
  const [formProjectStart, setFormProjectStart] = useState("");
  const [formProjectEnd, setFormProjectEnd] = useState("");
  const [formProjectStagingUrl, setFormProjectStagingUrl] = useState("");
  const [formProjectLiveUrl, setFormProjectLiveUrl] = useState("");

  const openCreateProject = useCallback(() => {
    setFormProjectName("");
    setFormProjectDesc("");
    setFormProjectStart("");
    setFormProjectEnd("");
    setFormProjectStagingUrl("");
    setFormProjectLiveUrl("");
    setProjectDialogOpen(true);
  }, []);

  const handleProjectSubmit = useCallback(async () => {
    if (!formProjectName.trim()) {
      toast.error("Project name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formProjectName.trim(),
          description: formProjectDesc.trim() || null,
          startDate: formProjectStart ? new Date(formProjectStart).toISOString() : null,
          endDate: formProjectEnd ? new Date(formProjectEnd).toISOString() : null,
          stagingUrl: formProjectStagingUrl.trim() || null,
          liveUrl: formProjectLiveUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error?.message ?? err?.error ?? "Failed to create project");
        return;
      }
      toast.success("Project created");
      setProjectDialogOpen(false);
      refetch();
    } catch {
      toast.error("Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  }, [clientId, formProjectName, formProjectDesc, formProjectStart, formProjectEnd, formProjectStagingUrl, formProjectLiveUrl, refetch]);

  const openCreateContact = useCallback(() => {
    setFormContactName("");
    setFormContactEmail("");
    setFormContactPhone("");
    setFormContactTitle("");
    setFormContactDepartment("");
    setFormContactRole("PRIMARY");
    setFormContactIsPrimary(false);
    setFormContactNotes("");
    setEditingContact(null);
    setContactDialogMode("create");
  }, []);

  const openEditContact = useCallback((contact: ClientContact) => {
    setFormContactName(contact.name);
    setFormContactEmail(contact.email);
    setFormContactPhone(contact.phone ?? "");
    setFormContactTitle(contact.title ?? "");
    setFormContactDepartment(contact.department ?? "");
    setFormContactRole(contact.role);
    setFormContactIsPrimary(contact.isPrimary);
    setFormContactNotes(contact.notes ?? "");
    setEditingContact(contact);
    setContactDialogMode("edit");
  }, []);

  const handleContactSubmit = useCallback(async () => {
    if (!formContactName.trim() || !formContactEmail.trim()) {
      toast.error("Contact name and email are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: formContactName.trim(),
        email: formContactEmail.trim(),
        phone: formContactPhone.trim() || null,
        title: formContactTitle.trim() || null,
        department: formContactDepartment.trim() || null,
        role: formContactRole,
        isPrimary: formContactIsPrimary,
        notes: formContactNotes.trim() || null,
      };

      const url = contactDialogMode === "edit" && editingContact
        ? `/api/clients/${clientId}/contacts/${editingContact.id}`
        : `/api/clients/${clientId}/contacts`;
      const method = contactDialogMode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? err.error ?? "Failed to save contact");
        return;
      }

      toast.success(contactDialogMode === "edit" ? "Contact updated" : "Contact created");
      setContactDialogMode(null);
      refetch();
    } catch {
      toast.error("Failed to save contact");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    formContactName, formContactEmail, formContactPhone, formContactTitle,
    formContactDepartment, formContactRole, formContactIsPrimary, formContactNotes,
    contactDialogMode, editingContact, clientId, refetch,
  ]);

  const handleDeactivateContact = useCallback(async () => {
    if (!deactivateTarget) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${deactivateTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? err.error ?? "Failed to deactivate contact");
        return;
      }
      toast.success("Contact deactivated");
      setDeactivateTarget(null);
      refetch();
    } catch {
      toast.error("Failed to deactivate contact");
    } finally {
      setIsSubmitting(false);
    }
  }, [deactivateTarget, clientId, refetch]);

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

  if (isLoading || !client) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading client details...</p>
      </div>
    );
  }

  const addressParts = [
    client.addressStreet,
    client.addressCity,
    client.addressParish ? PARISH_LABELS[client.addressParish] ?? client.addressParish : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Link href="/admin/clients">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
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
            <p className="mt-1 text-sm text-muted-foreground">{client.description}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">
            Contacts ({client.contacts?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="projects">
            Projects ({client.projects?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="activity">
            Activity
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview">
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Details Card */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Organization Details
                </h3>

                <div className="space-y-3 text-sm">
                  {client.ministry && (
                    <div className="flex items-center gap-2">
                      <Landmark className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Ministry:</span>
                      <span className="font-medium">{client.ministry.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {client.ministry.shortCode}
                      </Badge>
                    </div>
                  )}

                  {client.referenceNumber && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Reference:</span>
                      <span className="font-mono font-medium">{client.referenceNumber}</span>
                    </div>
                  )}

                  {client.website && (
                    <div className="flex items-center gap-2">
                      <Globe className="size-4 text-muted-foreground" />
                      <a
                        href={client.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {client.website}
                      </a>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">SLA Tier:</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold ${SLA_BADGE_COLORS[client.slaTier] ?? SLA_BADGE_COLORS.BRONZE}`}
                    >
                      {client.slaTier}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4">
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
              </CardContent>
            </Card>

            {/* Address Card */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Address & Agreement
                </h3>

                <div className="space-y-3 text-sm">
                  {addressParts.length > 0 ? (
                    <div>
                      <span className="text-muted-foreground">Address:</span>
                      <p className="mt-0.5 font-medium">{addressParts.join(", ")}</p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">No address on file</p>
                  )}

                  <Separator />

                  <div className="flex items-center gap-2">
                    {client.hasSignedAgreement ? (
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="size-4 text-muted-foreground/50" />
                    )}
                    <span className="font-medium">
                      {client.hasSignedAgreement ? "Agreement signed" : "No agreement on file"}
                    </span>
                  </div>

                  {client.hasSignedAgreement && (
                    <div className="space-y-1 pl-6">
                      {client.agreementDate && (
                        <p className="text-muted-foreground">
                          Date: {new Date(client.agreementDate).toLocaleDateString()}
                        </p>
                      )}
                      {client.agreementReference && (
                        <p className="text-muted-foreground">
                          Reference: <span className="font-mono">{client.agreementReference}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Contacts Tab ── */}
        <TabsContent value="contacts">
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {client.contacts?.length ?? 0} active contact{(client.contacts?.length ?? 0) !== 1 ? "s" : ""}
              </p>
              <Button onClick={openCreateContact} size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                Add Contact
              </Button>
            </div>

            {(client.contacts?.length ?? 0) > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {client.contacts.map((contact) => (
                  <Card key={contact.id} className="transition-all hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                            <UserCircle className="size-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{contact.name}</h4>
                              {contact.isPrimary && (
                                <Badge variant="outline" className="gap-0.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
                                  <Star className="size-2.5" />
                                  Primary
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${ROLE_BADGE_COLORS[contact.role] ?? ""}`}
                              >
                                {CONTACT_ROLE_OPTIONS.find((r) => r.value === contact.role)?.label ?? contact.role}
                              </Badge>
                            </div>

                            {contact.title && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{contact.title}</p>
                            )}

                            <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Mail className="size-3" />
                                {contact.email}
                              </span>
                              {contact.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="size-3" />
                                  {contact.phone}
                                </span>
                              )}
                              {contact.department && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="size-3" />
                                  {contact.department}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEditContact(contact)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => setDeactivateTarget(contact)}>
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
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                    <Users className="size-7 text-muted-foreground/50" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">
                    No contacts yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Add contacts to manage communication for this client
                  </p>
                  <Button className="mt-4" size="sm" onClick={openCreateContact}>
                    <Plus className="size-3.5" data-icon="inline-start" />
                    Add Contact
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Projects Tab ── */}
        <TabsContent value="projects">
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {client.projects?.length ?? 0} active project{(client.projects?.length ?? 0) !== 1 ? "s" : ""}
              </p>
              <Button onClick={openCreateProject} size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                Add Project
              </Button>
            </div>

            {(client.projects?.length ?? 0) > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {client.projects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Card className="transition-all hover:shadow-md cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <FolderOpen className="size-4.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold text-sm">{project.name}</h4>
                              {project.status && (
                                <Badge variant="outline" className="text-[10px]">
                                  {project.status.replace(/_/g, " ")}
                                </Badge>
                              )}
                            </div>
                            {project.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                {project.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                    <FolderOpen className="size-7 text-muted-foreground/50" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">
                    No projects yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Create a project to start tracking work for this client
                  </p>
                  <Button className="mt-4" size="sm" onClick={openCreateProject}>
                    <Plus className="size-3.5" data-icon="inline-start" />
                    Add Project
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        {/* ── Activity Tab ── */}
        <TabsContent value="activity">
          <div className="mt-4">
            <ActivityFeed
              fetchUrl={`/api/clients/${clientId}/activity`}
              title="Recent Activity"
              pageSize={20}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Contact Create / Edit Dialog ── */}
      <Dialog
        open={contactDialogMode !== null}
        onOpenChange={(open) => { if (!open) setContactDialogMode(null); }}
      >
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {contactDialogMode === "edit" ? "Edit Contact" : "Add Contact"}
            </DialogTitle>
            <DialogDescription>
              {contactDialogMode === "edit"
                ? "Update the contact details"
                : `Add a new contact for ${client.name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formContactName}
                  onChange={(e) => setFormContactName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formContactEmail}
                  onChange={(e) => setFormContactEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formContactPhone}
                  onChange={(e) => setFormContactPhone(e.target.value)}
                  placeholder="+1 (876) 555-1234"
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={formContactTitle}
                  onChange={(e) => setFormContactTitle(e.target.value)}
                  placeholder="IT Manager"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <Input
                value={formContactDepartment}
                onChange={(e) => setFormContactDepartment(e.target.value)}
                placeholder="Information Technology"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formContactRole} onValueChange={(v) => { if (v) setFormContactRole(v); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={formContactIsPrimary}
                    onChange={(e) => setFormContactIsPrimary(e.target.checked)}
                    className="size-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm">Primary contact</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formContactNotes}
                onChange={(e) => setFormContactNotes(e.target.value)}
                placeholder="Additional notes about this contact"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setContactDialogMode(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleContactSubmit}
              disabled={isSubmitting || !formContactName.trim() || !formContactEmail.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : contactDialogMode === "edit" ? (
                "Update"
              ) : (
                "Add Contact"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate Contact Confirmation ── */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate &quot;{deactivateTarget?.name}&quot;? They will
              no longer appear as an active contact for {client.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivateContact}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Project Dialog ── */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Project</DialogTitle>
            <DialogDescription>
              Create a new project for {client?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Project Name *</Label>
              <Input
                id="proj-name"
                placeholder="Website Redesign"
                value={formProjectName}
                onChange={(e) => setFormProjectName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-desc">Description</Label>
              <Textarea
                id="proj-desc"
                placeholder="Brief project description..."
                value={formProjectDesc}
                onChange={(e) => setFormProjectDesc(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proj-start">Start Date</Label>
                <Input
                  id="proj-start"
                  type="date"
                  value={formProjectStart}
                  onChange={(e) => setFormProjectStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-end">End Date</Label>
                <Input
                  id="proj-end"
                  type="date"
                  value={formProjectEnd}
                  onChange={(e) => setFormProjectEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-staging">Staging URL</Label>
              <Input
                id="proj-staging"
                placeholder="https://staging.example.com"
                value={formProjectStagingUrl}
                onChange={(e) => setFormProjectStagingUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-live">Live URL</Label>
              <Input
                id="proj-live"
                placeholder="https://example.com"
                value={formProjectLiveUrl}
                onChange={(e) => setFormProjectLiveUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleProjectSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create Project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
