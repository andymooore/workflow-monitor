"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Building2,
  Calendar,
  Users,
  Target,
  Activity,
  DollarSign,
  Shield,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  UserCircle,
  Crown,
  Code2,
  Eye,
  UserMinus,
  FolderOpen,
  TrendingUp,
  CircleDot,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

// ---- Types ----------------------------------------------------------------

interface MilestoneData {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  targetDate: string;
  completedAt: string | null;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectMemberData {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    status?: string;
  };
}

interface ProjectDetail {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  status: string;
  health: string;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: number | null;
  budgetSpent: number | null;
  budgetCurrency: string;
  slaReference: string | null;
  slaSignedDate: string | null;
  slaSummary: string | null;
  torReference: string | null;
  torSignedDate: string | null;
  torSummary: string | null;
  stagingUrl: string | null;
  liveUrl: string | null;
  client: {
    id: string;
    name: string;
    shortCode: string;
    slaTier: string;
  };
  milestones: MilestoneData[];
  members: ProjectMemberData[];
  milestoneStats: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    missed: number;
  };
  activeWorkflows: number;
  _count: {
    instances: number;
    milestones: number;
    members: number;
    documents: number;
  };
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface ActivityResponse {
  data: ActivityItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

// ---- Constants ------------------------------------------------------------

const PROJECT_STATUS_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  PLANNING: {
    label: "Planning",
    color: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-400 dark:border-slate-700",
    dotColor: "bg-slate-500",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
    dotColor: "bg-blue-500 animate-pulse",
  },
  ON_HOLD: {
    label: "On Hold",
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    dotColor: "bg-amber-500",
  },
  COMPLETED: {
    label: "Completed",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    dotColor: "bg-emerald-500",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
    dotColor: "bg-red-500",
  },
};

const HEALTH_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  ON_TRACK: {
    label: "On Track",
    color: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  AT_RISK: {
    label: "At Risk",
    color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    icon: AlertTriangle,
  },
  BLOCKED: {
    label: "Blocked",
    color: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
    icon: XCircle,
  },
};

const MILESTONE_STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  PENDING: {
    label: "Pending",
    color: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950/40 dark:text-slate-400 dark:border-slate-700",
    icon: Clock,
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
    icon: TrendingUp,
  },
  COMPLETED: {
    label: "Completed",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  MISSED: {
    label: "Missed",
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
    icon: XCircle,
  },
};

const MEMBER_ROLE_CONFIG: Record<string, { label: string; icon: typeof UserCircle; color: string }> = {
  lead: { label: "Lead", icon: Crown, color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800" },
  developer: { label: "Developer", icon: Code2, color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800" },
  reviewer: { label: "Reviewer", icon: Eye, color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800" },
  member: { label: "Member", icon: UserCircle, color: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950/40 dark:text-slate-400 dark:border-slate-700" },
};

const SLA_BADGE_COLORS: Record<string, string> = {
  GOLD: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  SILVER: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  BRONZE: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950/40 dark:text-slate-400 dark:border-slate-700",
};

const STATUS_OPTIONS = [
  { value: "PLANNING", label: "Planning" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

const HEALTH_OPTIONS = [
  { value: "ON_TRACK", label: "On Track" },
  { value: "AT_RISK", label: "At Risk" },
  { value: "BLOCKED", label: "Blocked" },
] as const;

const MILESTONE_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "MISSED", label: "Missed" },
] as const;

const MEMBER_ROLE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "developer", label: "Developer" },
  { value: "reviewer", label: "Reviewer" },
  { value: "member", label: "Member" },
] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency: currency || "JMD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---- Page Component -------------------------------------------------------

export default function ProjectDetailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const projectId = params.projectId as string;

  const [activeTab, setActiveTab] = useState("overview");

  // Fetch project
  const { data: project, isLoading, refetch } = usePolling<ProjectDetail>(
    `/api/projects/${projectId}`,
    { interval: 15000 },
  );

  // Fetch activity (only when on activity tab)
  const { data: activityRes, refetch: refetchActivity } = usePolling<ActivityResponse>(
    `/api/projects/${projectId}/activity?limit=30`,
    { interval: 15000, enabled: activeTab === "activity" },
  );

  // Fetch users for add-member dialog
  const { data: usersRes } = usePolling<{ data: UserOption[]; total: number }>(
    "/api/users",
    { interval: 60000 },
  );
  const availableUsers = usersRes?.data ?? [];

  // ---- Status change handler ----
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    setIsChangingStatus(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? "Failed to update status");
        return;
      }
      toast.success(`Project status updated to ${PROJECT_STATUS_CONFIG[newStatus]?.label ?? newStatus}`);
      refetch();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setIsChangingStatus(false);
    }
  }, [projectId, refetch]);

  // ---- Health change handler ----
  const handleHealthChange = useCallback(async (newHealth: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ health: newHealth }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? "Failed to update health");
        return;
      }
      toast.success(`Project health updated to ${HEALTH_CONFIG[newHealth]?.label ?? newHealth}`);
      refetch();
    } catch {
      toast.error("Failed to update health");
    }
  }, [projectId, refetch]);

  // ---- Milestone dialogs ----
  const [milestoneDialogMode, setMilestoneDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<MilestoneData | null>(null);
  const [formMilestoneTitle, setFormMilestoneTitle] = useState("");
  const [formMilestoneDesc, setFormMilestoneDesc] = useState("");
  const [formMilestoneDate, setFormMilestoneDate] = useState("");
  const [formMilestoneStatus, setFormMilestoneStatus] = useState("PENDING");
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<MilestoneData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreateMilestone = useCallback(() => {
    setFormMilestoneTitle("");
    setFormMilestoneDesc("");
    setFormMilestoneDate("");
    setFormMilestoneStatus("PENDING");
    setEditingMilestone(null);
    setMilestoneDialogMode("create");
  }, []);

  const openEditMilestone = useCallback((milestone: MilestoneData) => {
    setFormMilestoneTitle(milestone.title);
    setFormMilestoneDesc(milestone.description ?? "");
    setFormMilestoneDate(milestone.targetDate.split("T")[0]);
    setFormMilestoneStatus(milestone.status);
    setEditingMilestone(milestone);
    setMilestoneDialogMode("edit");
  }, []);

  const handleMilestoneSubmit = useCallback(async () => {
    if (!formMilestoneTitle.trim() || !formMilestoneDate) {
      toast.error("Title and target date are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const isEdit = milestoneDialogMode === "edit" && editingMilestone;
      const url = isEdit
        ? `/api/projects/${projectId}/milestones/${editingMilestone.id}`
        : `/api/projects/${projectId}/milestones`;

      const payload: Record<string, unknown> = {
        title: formMilestoneTitle.trim(),
        description: formMilestoneDesc.trim() || null,
        targetDate: new Date(formMilestoneDate).toISOString(),
      };
      if (isEdit) {
        payload.status = formMilestoneStatus;
      }

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? "Failed to save milestone");
        return;
      }
      toast.success(isEdit ? "Milestone updated" : "Milestone created");
      setMilestoneDialogMode(null);
      refetch();
    } catch {
      toast.error("Failed to save milestone");
    } finally {
      setIsSubmitting(false);
    }
  }, [formMilestoneTitle, formMilestoneDesc, formMilestoneDate, formMilestoneStatus, milestoneDialogMode, editingMilestone, projectId, refetch]);

  const handleDeleteMilestone = useCallback(async () => {
    if (!deleteMilestoneTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${deleteMilestoneTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to delete milestone");
        return;
      }
      toast.success("Milestone deleted");
      setDeleteMilestoneTarget(null);
      refetch();
    } catch {
      toast.error("Failed to delete milestone");
    } finally {
      setIsSubmitting(false);
    }
  }, [deleteMilestoneTarget, projectId, refetch]);

  const handleCompleteMilestone = useCallback(async (milestone: MilestoneData) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestone.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.ok) {
        toast.error("Failed to complete milestone");
        return;
      }
      toast.success(`Milestone "${milestone.title}" completed`);
      refetch();
    } catch {
      toast.error("Failed to complete milestone");
    }
  }, [projectId, refetch]);

  // ---- Member dialogs ----
  const [showAddMember, setShowAddMember] = useState(false);
  const [formMemberUserId, setFormMemberUserId] = useState("");
  const [formMemberRole, setFormMemberRole] = useState("member");
  const [removeMemberTarget, setRemoveMemberTarget] = useState<ProjectMemberData | null>(null);
  const [editMemberTarget, setEditMemberTarget] = useState<ProjectMemberData | null>(null);
  const [editMemberRole, setEditMemberRole] = useState("");

  const handleAddMember = useCallback(async () => {
    if (!formMemberUserId) {
      toast.error("Please select a user");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: formMemberUserId, role: formMemberRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? "Failed to add member");
        return;
      }
      toast.success("Team member added");
      setShowAddMember(false);
      setFormMemberUserId("");
      setFormMemberRole("member");
      refetch();
    } catch {
      toast.error("Failed to add member");
    } finally {
      setIsSubmitting(false);
    }
  }, [formMemberUserId, formMemberRole, projectId, refetch]);

  const handleRemoveMember = useCallback(async () => {
    if (!removeMemberTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${removeMemberTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to remove member");
        return;
      }
      toast.success(`${removeMemberTarget.user.name} removed from project`);
      setRemoveMemberTarget(null);
      refetch();
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setIsSubmitting(false);
    }
  }, [removeMemberTarget, projectId, refetch]);

  const handleUpdateMemberRole = useCallback(async () => {
    if (!editMemberTarget || !editMemberRole) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${editMemberTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editMemberRole }),
      });
      if (!res.ok) {
        toast.error("Failed to update role");
        return;
      }
      toast.success(`${editMemberTarget.user.name}'s role updated`);
      setEditMemberTarget(null);
      refetch();
    } catch {
      toast.error("Failed to update role");
    } finally {
      setIsSubmitting(false);
    }
  }, [editMemberTarget, editMemberRole, projectId, refetch]);

  // Auth guard
  const userRoles: string[] = session?.user?.roles ?? [];
  const isAdmin = userRoles.includes("admin");

  if (sessionStatus === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading || !project) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading project details...</p>
      </div>
    );
  }

  const statusConfig = PROJECT_STATUS_CONFIG[project.status] ?? PROJECT_STATUS_CONFIG.PLANNING;
  const healthConfig = HEALTH_CONFIG[project.health] ?? HEALTH_CONFIG.ON_TRACK;
  const HealthIcon = healthConfig.icon;

  const budgetPct = project.budgetAmount && project.budgetAmount > 0
    ? Math.min(100, Math.round(((project.budgetSpent ?? 0) / project.budgetAmount) * 100))
    : 0;

  const milestonePct = project.milestoneStats.total > 0
    ? Math.round((project.milestoneStats.completed / project.milestoneStats.total) * 100)
    : 0;

  // Filter out already-added members for the add-member dialog
  const existingMemberIds = new Set(project.members.map((m) => m.userId));
  const filteredUsers = availableUsers.filter((u) => !existingMemberIds.has(u.id));

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-gradient-to-r from-background to-muted/30 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Link href={`/admin/clients/${project.clientId}`}>
              <Button variant="ghost" size="icon-sm">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
                {/* Status Badge */}
                <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusConfig.color}`}>
                  <span className={`size-2 rounded-full ${statusConfig.dotColor}`} />
                  {statusConfig.label}
                </div>
                {/* Health Badge */}
                <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${healthConfig.color}`}>
                  <HealthIcon className="size-3.5" />
                  {healthConfig.label}
                </div>
              </div>

              {project.description && (
                <p className="text-sm text-muted-foreground max-w-2xl">{project.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <Link href={`/admin/clients/${project.client.id}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                  <Building2 className="size-3.5" />
                  {project.client.name}
                  <Badge variant="outline" className="text-[10px] font-mono ml-0.5">{project.client.shortCode}</Badge>
                </Link>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold ${SLA_BADGE_COLORS[project.client.slaTier] ?? SLA_BADGE_COLORS.BRONZE}`}
                >
                  <Shield className="size-2.5" />
                  {project.client.slaTier}
                </Badge>
                {project.startDate && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {format(new Date(project.startDate), "MMM d, yyyy")}
                    {project.endDate && (
                      <span> - {format(new Date(project.endDate), "MMM d, yyyy")}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status & Health dropdowns for admins */}
          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <Select value={project.health} onValueChange={handleHealthChange}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEALTH_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={project.status}
                onValueChange={handleStatusChange}
                disabled={isChangingStatus}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <FolderOpen className="size-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="milestones" className="gap-1.5">
            <Target className="size-3.5" />
            Milestones
            <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
              {project.milestoneStats.total}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="size-3.5" />
            Team
            <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 min-w-[1.25rem] px-1">
              {project._count.members}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <Activity className="size-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB                                                */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="overview">
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Quick Stats Row */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
                    <Target className="size-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums">
                      {project.milestoneStats.completed}/{project.milestoneStats.total}
                    </p>
                    <p className="text-xs text-muted-foreground">Milestones Completed</p>
                  </div>
                </div>
                {project.milestoneStats.total > 0 && (
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                      style={{ width: `${milestonePct}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-950/40">
                    <Users className="size-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{project._count.members}</p>
                    <p className="text-xs text-muted-foreground">Team Members</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
                    <Activity className="size-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{project.activeWorkflows}</p>
                    <p className="text-xs text-muted-foreground">Active Workflows</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Budget Card */}
            <Card className="lg:col-span-2">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Budget
                  </h3>
                </div>

                {project.budgetAmount ? (
                  <div className="space-y-3">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Spent</p>
                        <p className="text-xl font-bold">
                          {formatCurrency(project.budgetSpent ?? 0, project.budgetCurrency)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Allocated</p>
                        <p className="text-lg font-semibold text-muted-foreground">
                          {formatCurrency(project.budgetAmount, project.budgetCurrency)}
                        </p>
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">{budgetPct}% utilised</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No budget allocated</p>
                )}
              </CardContent>
            </Card>

            {/* Project Info Card */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Details
                </h3>
                <div className="space-y-3 text-sm">
                  {project.slaReference && (
                    <div>
                      <span className="text-muted-foreground">SLA Reference:</span>
                      <p className="font-mono font-medium">{project.slaReference}</p>
                    </div>
                  )}
                  {project.torReference && (
                    <div>
                      <span className="text-muted-foreground">TOR Reference:</span>
                      <p className="font-mono font-medium">{project.torReference}</p>
                    </div>
                  )}
                  {project.stagingUrl && (
                    <div>
                      <span className="text-muted-foreground">Staging:</span>
                      <a href={project.stagingUrl} target="_blank" rel="noopener noreferrer" className="block text-primary hover:underline truncate">
                        {project.stagingUrl}
                      </a>
                    </div>
                  )}
                  {project.liveUrl && (
                    <div>
                      <span className="text-muted-foreground">Live:</span>
                      <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="block text-primary hover:underline truncate">
                        {project.liveUrl}
                      </a>
                    </div>
                  )}
                  <Separator />
                  <div className="flex items-center gap-4 flex-wrap">
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Activity className="size-3" />
                      {project._count.instances} workflow{project._count.instances !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <FolderOpen className="size-3" />
                      {project._count.documents} document{project._count.documents !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* MILESTONES TAB                                              */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="milestones">
          <div className="mt-4 space-y-4">
            {/* Progress & Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  {project.milestoneStats.completed} of {project.milestoneStats.total} completed
                </p>
                {project.milestoneStats.total > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                        style={{ width: `${milestonePct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">{milestonePct}%</span>
                  </div>
                )}
              </div>
              {isAdmin && (
                <Button onClick={openCreateMilestone} size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  Add Milestone
                </Button>
              )}
            </div>

            {/* Milestone List */}
            {project.milestones.length > 0 ? (
              <div className="space-y-3">
                {project.milestones.map((milestone) => {
                  const mConfig = MILESTONE_STATUS_CONFIG[milestone.status] ?? MILESTONE_STATUS_CONFIG.PENDING;
                  const MIcon = mConfig.icon;
                  const isOverdue = milestone.status !== "COMPLETED" && milestone.status !== "MISSED" && new Date(milestone.targetDate) < new Date();

                  return (
                    <Card key={milestone.id} className={`transition-all hover:shadow-md ${isOverdue ? "border-red-200 dark:border-red-900" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${mConfig.color.split(" ").slice(0, 2).join(" ")}`}>
                              <MIcon className="size-4.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-sm">{milestone.title}</h4>
                                <Badge variant="outline" className={`text-[10px] ${mConfig.color}`}>
                                  {mConfig.label}
                                </Badge>
                                {isOverdue && (
                                  <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800">
                                    <AlertTriangle className="size-2.5" />
                                    Overdue
                                  </Badge>
                                )}
                              </div>
                              {milestone.description && (
                                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{milestone.description}</p>
                              )}
                              <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="size-3" />
                                  Due {format(new Date(milestone.targetDate), "MMM d, yyyy")}
                                </span>
                                {milestone.completedAt && (
                                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="size-3" />
                                    Completed {format(new Date(milestone.completedAt), "MMM d, yyyy")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {isAdmin && (
                            <div className="flex items-center gap-1 shrink-0">
                              {milestone.status !== "COMPLETED" && milestone.status !== "MISSED" && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleCompleteMilestone(milestone)}
                                  title="Mark as completed"
                                >
                                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon-sm" onClick={() => openEditMilestone(milestone)}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" onClick={() => setDeleteMilestoneTarget(milestone)}>
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                    <Target className="size-7 text-muted-foreground/50" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">No milestones yet</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Add milestones to track project progress and deliverables
                  </p>
                  {isAdmin && (
                    <Button className="mt-4" size="sm" onClick={openCreateMilestone}>
                      <Plus className="size-3.5" data-icon="inline-start" />
                      Add Milestone
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TEAM TAB                                                    */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="team">
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {project._count.members} team member{project._count.members !== 1 ? "s" : ""}
              </p>
              {isAdmin && (
                <Button onClick={() => setShowAddMember(true)} size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  Add Member
                </Button>
              )}
            </div>

            {project.members.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {project.members.map((member) => {
                  const roleConfig = MEMBER_ROLE_CONFIG[member.role] ?? MEMBER_ROLE_CONFIG.member;
                  const RoleIcon = roleConfig.icon;

                  return (
                    <Card key={member.id} className="transition-all hover:shadow-md">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Avatar>
                              <AvatarFallback className="text-xs font-medium">
                                {getInitials(member.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-sm">{member.user.name}</h4>
                                <Badge variant="outline" className={`text-[10px] gap-0.5 ${roleConfig.color}`}>
                                  <RoleIcon className="size-2.5" />
                                  {roleConfig.label}
                                </Badge>
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">{member.user.email}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                                Joined {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>

                          {isAdmin && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => {
                                  setEditMemberTarget(member);
                                  setEditMemberRole(member.role);
                                }}
                                title="Edit role"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setRemoveMemberTarget(member)}
                                title="Remove from project"
                              >
                                <UserMinus className="size-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                    <Users className="size-7 text-muted-foreground/50" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">No team members</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Add team members to manage who works on this project
                  </p>
                  {isAdmin && (
                    <Button className="mt-4" size="sm" onClick={() => setShowAddMember(true)}>
                      <Plus className="size-3.5" data-icon="inline-start" />
                      Add Member
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* ACTIVITY TAB                                                */}
        {/* ════════════════════════════════════════════════════════════ */}
        <TabsContent value="activity">
          <div className="mt-4">
            <Card>
              <CardContent className="p-6">
                <ScrollArea className="h-[540px]">
                  {activityRes && activityRes.data.length > 0 ? (
                    <div className="relative">
                      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
                      <div className="space-y-6">
                        {activityRes.data.map((item) => (
                          <ActivityFeedItem key={item.id} item={item} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-48 flex-col items-center justify-center gap-2">
                      <Activity className="size-8 text-muted-foreground/30" />
                      <p className="text-muted-foreground">No activity yet</p>
                      <p className="text-xs text-muted-foreground/70">
                        Activity will appear here as the project progresses
                      </p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Milestone Create/Edit Dialog ──────────────────────────── */}
      <Dialog
        open={milestoneDialogMode !== null}
        onOpenChange={(open) => { if (!open) setMilestoneDialogMode(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {milestoneDialogMode === "edit" ? "Edit Milestone" : "Add Milestone"}
            </DialogTitle>
            <DialogDescription>
              {milestoneDialogMode === "edit"
                ? "Update milestone details and status"
                : "Add a new milestone to track project progress"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={formMilestoneTitle}
                onChange={(e) => setFormMilestoneTitle(e.target.value)}
                placeholder="Phase 1 Completion"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formMilestoneDesc}
                onChange={(e) => setFormMilestoneDesc(e.target.value)}
                placeholder="Brief description of this milestone..."
                rows={2}
              />
            </div>

            <div className={milestoneDialogMode === "edit" ? "grid grid-cols-2 gap-3" : ""}>
              <div className="space-y-2">
                <Label>Target Date *</Label>
                <Input
                  type="date"
                  value={formMilestoneDate}
                  onChange={(e) => setFormMilestoneDate(e.target.value)}
                />
              </div>

              {milestoneDialogMode === "edit" && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formMilestoneStatus} onValueChange={(v) => { if (v) setFormMilestoneStatus(v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MILESTONE_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMilestoneDialogMode(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMilestoneSubmit}
              disabled={isSubmitting || !formMilestoneTitle.trim() || !formMilestoneDate}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : milestoneDialogMode === "edit" ? (
                "Update"
              ) : (
                "Add Milestone"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Milestone Confirmation ─────────────────────────── */}
      <Dialog
        open={!!deleteMilestoneTarget}
        onOpenChange={(open) => { if (!open) setDeleteMilestoneTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Milestone</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteMilestoneTarget?.title}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteMilestoneTarget(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteMilestone}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Member Dialog ─────────────────────────────────────── */}
      <Dialog
        open={showAddMember}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddMember(false);
            setFormMemberUserId("");
            setFormMemberRole("member");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Add a user to the {project.name} project team
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>User *</Label>
              <Select value={formMemberUserId} onValueChange={(v) => setFormMemberUserId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id} label={`${u.name} (${u.email})`}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formMemberRole} onValueChange={(v) => { if (v) setFormMemberRole(v); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMBER_ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMember(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={isSubmitting || !formMemberUserId}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Member"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove Member Confirmation ────────────────────────────── */}
      <Dialog
        open={!!removeMemberTarget}
        onOpenChange={(open) => { if (!open) setRemoveMemberTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {removeMemberTarget?.user.name} from this project?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveMemberTarget(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Member Role Dialog ───────────────────────────────── */}
      <Dialog
        open={!!editMemberTarget}
        onOpenChange={(open) => { if (!open) setEditMemberTarget(null); }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Role</DialogTitle>
            <DialogDescription>
              Change the role for {editMemberTarget?.user.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={editMemberRole} onValueChange={(v) => { if (v) setEditMemberRole(v); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMBER_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMemberTarget(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleUpdateMemberRole} disabled={isSubmitting || !editMemberRole}>
              {isSubmitting ? "Updating..." : "Update Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Activity Feed Item Sub-component ------------------------------------

function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const dotColor = getActivityDotColor(item.type);
  const ActivityIcon = getActivityIcon(item.type);

  return (
    <div className="relative flex gap-4 pl-1">
      <div className={`relative z-10 mt-1 flex size-[30px] shrink-0 items-center justify-center rounded-full ring-4 ring-background ${dotColor.bg}`}>
        <ActivityIcon className={`size-3.5 ${dotColor.icon}`} />
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <p className="text-sm font-medium">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar size="sm" className="size-4">
            <AvatarFallback className="text-[7px]">{getInitials(item.user.name)}</AvatarFallback>
          </Avatar>
          <span>{item.user.name}</span>
          <span className="text-muted-foreground/50">--</span>
          <span>{format(new Date(item.createdAt), "MMM d, yyyy HH:mm")}</span>
        </div>
      </div>
    </div>
  );
}

function getActivityDotColor(type: string) {
  if (type.includes("COMPLETED")) {
    return { bg: "bg-emerald-100 dark:bg-emerald-900/40", icon: "text-emerald-600 dark:text-emerald-400" };
  }
  if (type.includes("MISSED") || type.includes("REMOVED")) {
    return { bg: "bg-red-100 dark:bg-red-900/40", icon: "text-red-600 dark:text-red-400" };
  }
  if (type.includes("CREATED") || type.includes("ADDED") || type.includes("STARTED")) {
    return { bg: "bg-blue-100 dark:bg-blue-900/40", icon: "text-blue-600 dark:text-blue-400" };
  }
  if (type.includes("STATUS") || type.includes("UPDATED")) {
    return { bg: "bg-amber-100 dark:bg-amber-900/40", icon: "text-amber-600 dark:text-amber-400" };
  }
  return { bg: "bg-slate-100 dark:bg-slate-900/40", icon: "text-slate-600 dark:text-slate-400" };
}

function getActivityIcon(type: string): typeof CheckCircle2 {
  if (type.includes("COMPLETED")) return CheckCircle2;
  if (type.includes("MISSED") || type.includes("REMOVED")) return XCircle;
  if (type.includes("MILESTONE")) return Target;
  if (type.includes("MEMBER") || type.includes("TEAM")) return Users;
  if (type.includes("STATUS")) return CircleDot;
  if (type.includes("WORKFLOW")) return Activity;
  return Clock;
}
