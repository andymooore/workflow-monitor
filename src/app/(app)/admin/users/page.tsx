"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Users, Search, UserPlus, Shield, Settings2 } from "lucide-react";
import { toast } from "sonner";

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
  const [allRoles, setAllRoles] = useState<RoleInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRoles | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/roles"),
      ]);
      if (!usersRes.ok) throw new Error("Failed to load users");
      if (!rolesRes.ok) throw new Error("Failed to load roles");
      const usersJson = await usersRes.json();
      const rolesJson = await rolesRes.json();
      setUsers(usersJson.data ?? usersJson);
      const rolesArray = rolesJson.data ?? rolesJson;
      setAllRoles((Array.isArray(rolesArray) ? rolesArray : []).map((r: RoleInfo & { _count?: unknown }) => ({
        id: r.id,
        name: r.name,
        description: r.description,
      })));
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
        u.roles.some((r) => r.role.name.toLowerCase().includes(q)),
    );
  }, [users, searchQuery]);

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
        <Button variant="outline" size="sm" onClick={() => { setIsLoading(true); loadData(); }}>
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
            Manage users and their role assignments
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <UserPlus className="size-4" data-icon="inline-start" />
          Create User
        </Button>
      </div>

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
            <p className="mt-4 text-lg font-medium text-muted-foreground">No users found</p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Create your first user to get started
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2">
          <Search className="size-6 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No users match your search</p>
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
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow key={user.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar size="sm">
                        <AvatarFallback className="text-[10px]">{getInitials(user.name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${
                        user.status === "ACTIVE"
                          ? "bg-emerald-500"
                          : user.status === "INACTIVE"
                            ? "bg-gray-400"
                            : "bg-red-500"
                      }`} />
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
                          <Badge key={ur.id} variant="outline" className="gap-1 text-[10px]">
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

      {/* Create user dialog */}
      <CreateUserDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        allRoles={allRoles}
        onCreated={loadData}
      />

      {/* Edit roles dialog */}
      {editingUser && (
        <EditUserRolesDialog
          open={!!editingUser}
          onOpenChange={(open) => { if (!open) setEditingUser(null); }}
          user={editingUser}
          allRoles={allRoles}
          onUpdated={loadData}
        />
      )}
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  allRoles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allRoles: RoleInfo[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("Name, email, and password are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          roleId: selectedRoleId || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error ?? "Failed to create user");
        return;
      }

      toast.success("User created successfully");
      onOpenChange(false);
      setName("");
      setEmail("");
      setPassword("");
      setSelectedRoleId("");
      onCreated();
    } catch {
      toast.error("Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>Add a new user to the platform.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create-name">Name</Label>
            <Input
              id="create-name"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              placeholder="john@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-password">Password</Label>
            <Input
              id="create-password"
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {allRoles.length > 0 && (
            <div className="space-y-1.5">
              <Label>Initial Role (optional)</Label>
              <Select value={selectedRoleId} onValueChange={(v) => setSelectedRoleId(v ?? "")}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

  const availableRoles = allRoles.filter((r) => !currentRoleIds.includes(r.id));

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
          <DialogDescription>Manage role assignments for {user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Current roles */}
          <div>
            <Label className="mb-2 block">Current Roles</Label>
            {user.roles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.roles.map((ur) => (
                  <Badge key={ur.id} variant="outline" className="gap-1.5 pr-1">
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
              <p className="text-sm text-muted-foreground italic">No roles assigned</p>
            )}
          </div>

          {/* Add role */}
          {availableRoles.length > 0 && (
            <div className="flex gap-2">
              <Select value={selectedRoleId} onValueChange={(v) => setSelectedRoleId(v ?? "")}>
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
