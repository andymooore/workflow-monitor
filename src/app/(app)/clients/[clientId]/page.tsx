"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Building2,
  Landmark,
  MapPin,
  Globe,
  FileCheck,
  Shield,
  Clock,
  CheckCircle2,
  FolderOpen,
  Activity,
  ExternalLink,
  FileText,
  Mail,
  Phone,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Interfaces for the report data
interface ClientReport {
  client: {
    id: string;
    name: string;
    shortCode: string;
    slaTier: string;
    ministry: { id: string; name: string; shortCode: string } | null;
    hasSignedAgreement: boolean;
    projectCount: number;
    contactCount: number;
  };
  instances: {
    total: number;
    byStatus: Record<string, number>;
    completionRate: number;
  };
  performance: {
    avgCompletionHours: number;
    slaCompliance: number | null;
  };
  topAssignees: Array<{ userId: string; name: string; completedTasks: number }>;
  recentInstances: Array<{
    id: string;
    title: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    template: { name: string };
    owner: { name: string };
  }>;
  projects: Array<{
    id: string;
    name: string;
    isActive: boolean;
    instanceCount: number;
  }>;
}

interface ClientDetail {
  id: string;
  name: string;
  shortCode: string;
  description: string | null;
  status: string;
  website: string | null;
  ministryId: string | null;
  slaTier: string;
  addressStreet: string | null;
  addressCity: string | null;
  addressParish: string | null;
  hasSignedAgreement: boolean;
  agreementDate: string | null;
  agreementReference: string | null;
  ministry: { id: string; name: string; shortCode: string } | null;
  contacts: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    title: string | null;
    department: string | null;
    role: string;
    isPrimary: boolean;
    isActive: boolean;
  }>;
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    slaReference: string | null;
    torReference: string | null;
    stagingUrl: string | null;
    liveUrl: string | null;
  }>;
}

interface DocumentEntry {
  id: string;
  title: string;
  type: string;
  description: string | null;
  fileName: string | null;
  fileUrl: string | null;
  reference: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string };
}

const SLA_COLORS: Record<string, { bg: string; text: string }> = {
  GOLD: { bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400" },
  SILVER: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-700 dark:text-slate-300" },
  BRONZE: { bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400" },
};

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "text-blue-600",
  COMPLETED: "text-emerald-600",
  CANCELLED: "text-red-600",
  FAILED: "text-red-600",
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  PRIMARY: "Primary",
  TECHNICAL: "Technical",
  ESCALATION: "Escalation",
  BILLING: "Billing",
  DATA_PROTECTION_OFFICER: "DPO",
};

const ROLE_COLORS: Record<string, string> = {
  PRIMARY: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  TECHNICAL: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  ESCALATION: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  BILLING: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  DATA_PROTECTION_OFFICER: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
};

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();

  const { data: report, isLoading: reportLoading } = usePolling<ClientReport>(
    `/api/reports/clients/${clientId}`,
    { interval: 30000 },
  );

  const { data: detail } = usePolling<ClientDetail>(
    `/api/clients/${clientId}`,
    { interval: 30000 },
  );

  const { data: documents } = usePolling<DocumentEntry[]>(
    `/api/documents?clientId=${clientId}&limit=50`,
    { interval: 30000 },
  );

  if (reportLoading || !report) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading client profile...</p>
      </div>
    );
  }

  const slaColor = SLA_COLORS[report.client.slaTier] ?? SLA_COLORS.BRONZE;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="size-7 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{report.client.name}</h1>
              <Badge variant="outline" className="font-mono">{report.client.shortCode}</Badge>
              <Badge className={`${slaColor.bg} ${slaColor.text} border-0`}>{report.client.slaTier}</Badge>
            </div>
            {report.client.ministry && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Landmark className="size-3.5" />
                {report.client.ministry.name}
              </p>
            )}
            {detail?.description && (
              <p className="mt-1 text-sm text-muted-foreground">{detail.description}</p>
            )}
          </div>
        </div>
        {report.client.hasSignedAgreement && (
          <Badge variant="default" className="gap-1.5 bg-emerald-600">
            <FileCheck className="size-3" />
            Agreement Signed
          </Badge>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Requests</p>
            <p className="mt-1 text-2xl font-bold">{report.instances.total}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="size-3" />
              {report.instances.byStatus["RUNNING"] ?? 0} active
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Completion Rate</p>
            <p className="mt-1 text-2xl font-bold">{report.instances.completionRate}%</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3" />
              {report.instances.byStatus["COMPLETED"] ?? 0} completed
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Completion</p>
            <p className="mt-1 text-2xl font-bold">{report.performance.avgCompletionHours}h</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3" />
              average turnaround
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">SLA Compliance</p>
            <p className="mt-1 text-2xl font-bold">
              {report.performance.slaCompliance !== null ? `${report.performance.slaCompliance}%` : "N/A"}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="size-3" />
              tasks on time
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects" className="gap-1.5">
            Projects
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{report.client.projectCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-1.5">
            Contacts
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{report.client.contactCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="instances">Instances</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            Documents
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{documents?.length ?? 0}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Client Details */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Client Details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {detail?.addressCity && (
                  <div className="flex items-center gap-2">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    <span>{[detail.addressStreet, detail.addressCity, detail.addressParish?.replace(/_/g, " ")].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {detail?.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="size-3.5 text-muted-foreground" />
                    <a href={detail.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{detail.website}</a>
                  </div>
                )}
                {detail?.agreementDate && (
                  <div className="flex items-center gap-2">
                    <FileCheck className="size-3.5 text-muted-foreground" />
                    <span>Agreement signed {format(new Date(detail.agreementDate), "MMM d, yyyy")}</span>
                    {detail.agreementReference && <Badge variant="outline" className="text-[10px]">{detail.agreementReference}</Badge>}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Assignees */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Top Assignees</CardTitle></CardHeader>
              <CardContent>
                {report.topAssignees.length > 0 ? (
                  <div className="space-y-2">
                    {report.topAssignees.map((a) => (
                      <Link key={a.userId} href={`/users/${a.userId}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className="text-[9px]">{getInitials(a.name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{a.name}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">{a.completedTasks} tasks</Badge>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No task data yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects" className="mt-6">
          {(detail?.projects?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              {detail!.projects.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <FolderOpen className="size-4 text-muted-foreground" />
                          <h3 className="font-semibold">{p.name}</h3>
                          {!p.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                        </div>
                        {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.slaReference && <Badge variant="secondary" className="text-[10px] gap-1"><Shield className="size-2.5" />SLA</Badge>}
                        {p.torReference && <Badge variant="secondary" className="text-[10px] gap-1"><FileText className="size-2.5" />TOR</Badge>}
                      </div>
                    </div>
                    {(p.stagingUrl || p.liveUrl) && (
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        {p.stagingUrl && (
                          <a href={p.stagingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                            <ExternalLink className="size-3" /> Staging
                          </a>
                        )}
                        {p.liveUrl && (
                          <a href={p.liveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-emerald-600 hover:underline">
                            <ExternalLink className="size-3" /> Live
                          </a>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No projects</p>
          )}
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="mt-6">
          {(detail?.contacts?.length ?? 0) > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {detail!.contacts.filter(c => c.isActive).map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{getInitials(c.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{c.name}</p>
                            {c.isPrimary && <Badge className="text-[9px] h-4 bg-blue-600">Primary</Badge>}
                          </div>
                          {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                          {c.department && <p className="text-xs text-muted-foreground">{c.department}</p>}
                        </div>
                      </div>
                      <Badge className={`text-[10px] border-0 ${ROLE_COLORS[c.role] ?? "bg-muted text-muted-foreground"}`}>
                        {ROLE_LABELS[c.role] ?? c.role}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Mail className="size-3" />{c.email}</span>
                      {c.phone && <span className="flex items-center gap-1"><Phone className="size-3" />{c.phone}</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contacts</p>
          )}
        </TabsContent>

        {/* Instances Tab */}
        <TabsContent value="instances" className="mt-6">
          {report.recentInstances.length > 0 ? (
            <div className="space-y-2">
              {report.recentInstances.map((inst) => (
                <Link key={inst.id} href={`/instances/${inst.id}`}>
                  <Card className="cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{inst.title}</p>
                        <p className="text-xs text-muted-foreground">{inst.template.name} — {inst.owner.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[inst.status] ?? ""}`}>
                          {inst.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(inst.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No instances yet</p>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          {(documents?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              {documents!.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="size-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.type.replace(/_/g, " ")} — uploaded by {doc.uploadedBy.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.fileUrl && (
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="xs" variant="outline" className="gap-1">
                            <ExternalLink className="size-3" /> View
                          </Button>
                        </a>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
