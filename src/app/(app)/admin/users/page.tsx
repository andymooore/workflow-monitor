"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Users,
  Search,
  Send,
  Shield,
  Settings2,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface RoleInfo {
  id: string;
  name: string;
  description: string | null;
}

interface UserWithRoles {
  id: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
  roles: Array<{
    id: string;
    role: RoleInfo;
  }>;
}

interface InvitationRecord {
  id: string;
  email: string;
  name: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string; email: string };
  role: { id: string; name: string } | null;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [allRoles, setAllRoles] = useState<RoleInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRoles | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [usersRes, rolesRes, invitesRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/roles"),
        fetch("/api/invitations"),
      ]);
      if (!usersRes.ok) throw new Error("Failed to load users");
      if (!rolesRes.ok) throw new Error("Failed to load roles");

      const usersJson = await usersRes.json();
      const rolesJson = await rolesRes.json();
      setUsers(usersJson.data ?? usersJson);
      const rolesArray = rolesJson.data ?? rolesJson;
      setAllRoles(
        (Array.isArray(rolesArray) ? rolesArray : []).map(
          (r: RoleInfo & { _count?: unknown }) => ({
            id: r.id,
            name: r.name,
            description: r.description,
          })
        )
      );

      if (invitesRes.ok) {
        const invitesJson = await invitesRes.json();
        setInvitations(invitesJson.data ?? []);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roles.some((r) => r.role.name.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  const pendingInvitations = invitations.filter(
    (i) => i.status === "PENDING"
  );
  const pastInvitations = invitations.filter((i) => i.status !== "PENDING");

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
      <div className="flex h-48 flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2">
        <p className="text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsLoading(true);
            loadData();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage users and send invitations
          </p>
        </div>
        <Button onClick={() => setShowInviteDialog(true)}>
          <Send className="size-4" data-icon="inline-start" />
          Invite User
        </Button>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="size-3.5" />
            Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="invitations" className="gap-1.5">
            <Mail className="size-3.5" />
            Invitations
            {pendingInvitations.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {pendingInvitations.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ──── Users Tab ──── */}
        <TabsContent value="users" className="space-y-4">
          {/* Search */}
          {users.length > 0 && (
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {filtered.length === 0 && users.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                  <Users className="size-8 text-muted-foreground/50" />
                </div>
                <p className="mt-4 text-lg font-medium text-muted-foreground">
                  No users yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  Send an invitation to add your first team member
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setShowInviteDialog(true)}
                >
                  <Send className="size-4" data-icon="inline-start" />
                  Invite User
                </Button>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2">
              <Search className="size-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No users match your search
              </p>
            </div>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[280px]">User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="w-[80px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((user) => (
                    <TableRow key={user.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar size="sm">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`size-2 rounded-full ${
                              user.status === "ACTIVE"
                                ? "bg-emerald-500"
                                : user.status === "INACTIVE"
                                  ? "bg-gray-400"
                                  : "bg-red-500"
                            }`}
                          />
                          <Badge
                            variant={
                              user.status === "ACTIVE"
                                ? "secondary"
                                : user.status === "INACTIVE"
                                  ? "outline"
                                  : "destructive"
                            }
                            className="text-[10px]"
                          >
                            {user.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length > 0 ? (
                            user.roles.map((ur) => (
                              <Badge
                                key={ur.id}
                                variant="outline"
                                className="gap-1 text-[10px]"
                              >
                                <Shield className="size-2.5" />
                                {ur.role.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              No roles assigned
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setEditingUser(user)}
                        >
                          <Settings2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ──── Invitations Tab ──── */}
        <TabsContent value="invitations" className="space-y-6">
          {/* Pending invitations */}
          {pendingInvitations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Pending ({pendingInvitations.length})
              </h3>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[240px]">Invitee</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-[120px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvitations.map((inv) => (
                      <InvitationRow
                        key={inv.id}
                        invitation={inv}
                        onUpdate={loadData}
                      />
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* Past invitations */}
          {pastInvitations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                History ({pastInvitations.length})
              </h3>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[240px]">Invitee</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastInvitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          {inv.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {inv.email}
                        </TableCell>
                        <TableCell>
                          {inv.role ? (
                            <Badge
                              variant="outline"
                              className="gap-1 text-[10px]"
                            >
                              <Shield className="size-2.5" />
                              {inv.role.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              None
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <InvitationStatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(inv.createdAt), {
                            addSuffix: true,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {invitations.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                  <Mail className="size-8 text-muted-foreground/50" />
                </div>
                <p className="mt-4 text-lg font-medium text-muted-foreground">
                  No invitations sent yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  Invite team members to join WorkFlowPro
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setShowInviteDialog(true)}
                >
                  <Send className="size-4" data-icon="inline-start" />
                  Send Invitation
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Invite user dialog */}
      <InviteUserDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        allRoles={allRoles}
        onInvited={loadData}
      />

      {/* Edit roles dialog */}
      {editingUser && (
        <EditUserRolesDialog
          open={!!editingUser}
          onOpenChange={(open) => {
            if (!open) setEditingUser(null);
          }}
          user={editingUser}
          allRoles={allRoles}
          onUpdated={loadData}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invitation status badge
// ---------------------------------------------------------------------------
function InvitationStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PENDING":
      return (
        <Badge variant="outline" className="gap-1 text-[10px] text-amber-500 border-amber-500/30">
          <Clock className="size-2.5" />
          Pending
        </Badge>
      );
    case "ACCEPTED":
      return (
        <Badge variant="outline" className="gap-1 text-[10px] text-emerald-500 border-emerald-500/30">
          <CheckCircle2 className="size-2.5" />
          Accepted
        </Badge>
      );
    case "EXPIRED":
      return (
        <Badge variant="outline" className="gap-1 text-[10px] text-gray-400 border-gray-400/30">
          <Clock className="size-2.5" />
          Expired
        </Badge>
      );
    case "REVOKED":
      return (
        <Badge variant="outline" className="gap-1 text-[10px] text-red-400 border-red-400/30">
          <XCircle className="size-2.5" />
          Revoked
        </Badge>
      );
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Invitation row with actions
// ---------------------------------------------------------------------------
function InvitationRow({
  invitation,
  onUpdate,
}: {
  invitation: InvitationRecord;
  onUpdate: () => void;
}) {
  const [isRevoking, setIsRevoking] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const isExpiringSoon =
    new Date(invitation.expiresAt).getTime() - Date.now() <
    2 * 24 * 60 * 60 * 1000;

  const handleRevoke = async () => {
    setIsRevoking(true);
    try {
      const res = await fetch(`/api/invitations/${invitation.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to revoke invitation");
        return;
      }
      toast.success("Invitation revoked");
      onUpdate();
    } catch {
      toast.error("Failed to revoke invitation");
    } finally {
      setIsRevoking(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      const res = await fetch(`/api/invitations/${invitation.id}`, {
        method: "PATCH",
      });
      if (!res.ok) {
        toast.error("Failed to resend invitation");
        return;
      }
      toast.success("Invitation resent");
      onUpdate();
    } catch {
      toast.error("Failed to resend invitation");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <TableRow className="group">
      <TableCell className="font-medium">{invitation.name}</TableCell>
      <TableCell className="text-muted-foreground">{invitation.email}</TableCell>
      <TableCell>
        {invitation.role ? (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Shield className="size-2.5" />
            {invitation.role.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground italic">None</span>
        )}
      </TableCell>
      <TableCell>
        <span
          className={`text-xs ${isExpiringSoon ? "text-amber-400" : "text-muted-foreground"}`}
        >
          {formatDistanceToNow(new Date(invitation.expiresAt), {
            addSuffix: true,
          })}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleResend}
            disabled={isResending}
            title="Resend invitation"
          >
            {isResending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleRevoke}
            disabled={isRevoking}
            className="text-destructive hover:text-destructive"
            title="Revoke invitation"
          >
            {isRevoking ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Invite user dialog
// ---------------------------------------------------------------------------
function InviteUserDialog({
  open,
  onOpenChange,
  allRoles,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allRoles: RoleInfo[];
  onInvited: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInvite = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          roleId: selectedRoleId || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
          err?.error?.message ?? err?.error ?? "Failed to send invitation";
        toast.error(msg);
        return;
      }

      toast.success(`Invitation sent to ${email.trim()}`);
      onOpenChange(false);
      setName("");
      setEmail("");
      setSelectedRoleId("");
      onInvited();
    } catch {
      toast.error("Failed to send invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Send an invitation email. The user will set their own password when
            they accept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="john@jis.gov.jm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Must be a @jis.gov.jm email address
            </p>
          </div>
          {allRoles.length > 0 && (
            <div className="space-y-1.5">
              <Label>Initial Role (optional)</Label>
              <Select
                value={selectedRoleId}
                onValueChange={(v) => setSelectedRoleId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {allRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id} label={role.name}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleInvite} disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Sending...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send className="size-4" />
                Send Invitation
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit user roles dialog
// ---------------------------------------------------------------------------
function EditUserRolesDialog({
  open,
  onOpenChange,
  user,
  allRoles,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithRoles;
  allRoles: RoleInfo[];
  onUpdated: () => void;
}) {
  const currentRoleIds = user.roles.map((r) => r.role.id);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableRoles = allRoles.filter(
    (r) => !currentRoleIds.includes(r.id)
  );

  const handleAddRole = async () => {
    if (!selectedRoleId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/users/${user.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: selectedRoleId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error);
        return;
      }
      toast.success("Role added");
      setSelectedRoleId("");
      onUpdated();
    } catch {
      toast.error("Failed to add role");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveRole = async (userRoleId: string) => {
    try {
      const res = await fetch(`/api/users/${user.id}/roles/${userRoleId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to remove role");
        return;
      }
      toast.success("Role removed");
      onUpdated();
    } catch {
      toast.error("Failed to remove role");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Roles: {user.name}</DialogTitle>
          <DialogDescription>
            Manage role assignments for {user.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Current roles */}
          <div>
            <Label className="mb-2 block">Current Roles</Label>
            {user.roles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.roles.map((ur) => (
                  <Badge
                    key={ur.id}
                    variant="outline"
                    className="gap-1.5 pr-1"
                  >
                    <Shield className="size-3" />
                    {ur.role.name}
                    <button
                      className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
                      onClick={() => handleRemoveRole(ur.id)}
                    >
                      <span className="text-xs font-bold leading-none">x</span>
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No roles assigned
              </p>
            )}
          </div>

          {/* Add role */}
          {availableRoles.length > 0 && (
            <div className="flex gap-2">
              <Select
                value={selectedRoleId}
                onValueChange={(v) => setSelectedRoleId(v ?? "")}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add a role..." />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id} label={role.name}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddRole}
                disabled={!selectedRoleId || isSubmitting}
                size="sm"
              >
                Add
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
