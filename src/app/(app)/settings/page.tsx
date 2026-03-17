"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Save,
  User,
  Bell,
  Palette,
  Settings,
  Shield,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Mail,
  Copy,
  Download,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name ?? "");
      setEmail(session.user.email ?? "");
    }
  }, [session]);

  const handleSaveProfile = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? err.error ?? "Failed to update profile");
        return;
      }
      toast.success("Profile updated — changes will appear on next login");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }, [name]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Both current and new password are required");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error?.message ?? err.error ?? "Failed to change password");
        return;
      }
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Failed to change password");
    } finally {
      setIsSaving(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={email} disabled className="bg-muted" />
            <p className="text-[11px] text-muted-foreground">
              Email cannot be changed. Contact an administrator.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-1.5">
              {(session?.user?.roles ?? []).map((role) => (
                <Badge key={role} variant="secondary">{role}</Badge>
              ))}
              {(session?.user?.roles ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">No roles assigned</span>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isSaving} size="sm">
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleChangePassword} disabled={isSaving} size="sm">
              {isSaving ? "Changing..." : "Change Password"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Security Tab (2FA) ─────────────────────────────────────────────────────

type TwoFactorStatus = {
  enabled: boolean;
  method: "EMAIL" | "TOTP" | null;
  hasBackupCodes: boolean;
  backupCodesRemaining?: number;
};

type SetupStep = "idle" | "choose-method" | "totp-scan" | "email-verify" | "verify-code" | "backup-codes";

function SecurityTab() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [setupStep, setSetupStep] = useState<SetupStep>("idle");
  const [isProcessing, setIsProcessing] = useState(false);

  // TOTP setup state
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");

  // Backup codes state
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Disable dialog state
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [isDisabling, setIsDisabling] = useState(false);

  const codeInputRef = useRef<HTMLInputElement>(null);

  // Fetch 2FA status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/2fa/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      toast.error("Failed to load 2FA status");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Focus code input
  useEffect(() => {
    if ((setupStep === "verify-code" || setupStep === "totp-scan" || setupStep === "email-verify") && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [setupStep]);

  // Start TOTP setup
  const handleSetupTOTP = useCallback(async () => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "TOTP" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error?.message ?? "Failed to start TOTP setup");
        return;
      }
      setQrCodeUrl(data.qrCodeUrl);
      setTotpSecret(data.secret);
      setSetupStep("totp-scan");
    } catch {
      toast.error("Failed to start TOTP setup");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Start EMAIL setup
  const handleSetupEmail = useCallback(async () => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "EMAIL" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error?.message ?? "Failed to start email 2FA setup");
        return;
      }
      setChallengeToken(data.challengeToken);
      setSetupStep("email-verify");
    } catch {
      toast.error("Failed to start email 2FA setup");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Verify setup code
  const handleVerifySetup = useCallback(async () => {
    if (!verificationCode || verificationCode.length < 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }
    setIsProcessing(true);
    try {
      const body: Record<string, string> = { code: verificationCode };
      if (challengeToken) {
        body.challengeToken = challengeToken;
      }
      const res = await fetch("/api/auth/2fa/verify-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error?.message ?? "Invalid verification code");
        return;
      }
      if (data.enabled && data.backupCodes) {
        setBackupCodes(data.backupCodes);
        setSetupStep("backup-codes");
        toast.success("Two-factor authentication enabled!");
        fetchStatus();
      }
    } catch {
      toast.error("Failed to verify code");
    } finally {
      setIsProcessing(false);
    }
  }, [verificationCode, challengeToken, fetchStatus]);

  // Disable 2FA
  const handleDisable = useCallback(async () => {
    if (!disablePassword) {
      toast.error("Password is required to disable 2FA");
      return;
    }
    setIsDisabling(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error?.message ?? "Failed to disable 2FA");
        return;
      }
      toast.success("Two-factor authentication disabled");
      setShowDisableDialog(false);
      setDisablePassword("");
      fetchStatus();
    } catch {
      toast.error("Failed to disable 2FA");
    } finally {
      setIsDisabling(false);
    }
  }, [disablePassword, fetchStatus]);

  // Copy backup codes
  const handleCopyBackupCodes = useCallback(() => {
    const text = backupCodes.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Backup codes copied to clipboard");
    }).catch(() => {
      toast.error("Failed to copy to clipboard");
    });
  }, [backupCodes]);

  // Download backup codes
  const handleDownloadBackupCodes = useCallback(() => {
    const text = [
      "WorkFlowPro - Two-Factor Authentication Backup Codes",
      "====================================================",
      "",
      "Keep these codes in a safe place. Each code can only be used once.",
      "",
      ...backupCodes.map((code, i) => `${(i + 1).toString().padStart(2, "0")}. ${code}`),
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workflowpro-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup codes downloaded");
  }, [backupCodes]);

  // Reset setup flow
  const handleCancelSetup = useCallback(() => {
    setSetupStep("idle");
    setQrCodeUrl("");
    setTotpSecret("");
    setVerificationCode("");
    setChallengeToken("");
    setBackupCodes([]);
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 2FA Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status?.enabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                <CheckCircle2 className="size-5 text-green-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">2FA is enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Method: {status.method === "TOTP" ? "Authenticator App" : "Email OTP"}
                    {status.backupCodesRemaining !== undefined && (
                      <span className="ml-2">
                        ({status.backupCodesRemaining} backup code{status.backupCodesRemaining !== 1 ? "s" : ""} remaining)
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDisableDialog(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <ShieldOff className="size-3.5 mr-1.5" />
                  Disable
                </Button>
              </div>
            </div>
          ) : setupStep === "idle" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <AlertTriangle className="size-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">2FA is not enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Add an extra layer of security to your account
                  </p>
                </div>
              </div>

              <Button
                onClick={() => setSetupStep("choose-method")}
                className="w-full"
                size="sm"
              >
                <ShieldCheck className="size-3.5 mr-1.5" />
                Enable Two-Factor Authentication
              </Button>
            </div>
          ) : setupStep === "choose-method" ? (
            /* ---- Method Selection ---- */
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                Choose how you want to receive verification codes:
              </p>

              <button
                onClick={handleSetupTOTP}
                disabled={isProcessing}
                className="flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Smartphone className="size-5 text-purple-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Authenticator App</p>
                  <p className="text-xs text-muted-foreground">
                    Use Google Authenticator, Authy, or similar apps
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
              </button>

              <button
                onClick={handleSetupEmail}
                disabled={isProcessing}
                className="flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Mail className="size-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Email OTP</p>
                  <p className="text-xs text-muted-foreground">
                    Receive a code via email each time you log in
                  </p>
                </div>
              </button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelSetup}
                className="w-full mt-2"
              >
                Cancel
              </Button>
            </div>
          ) : setupStep === "totp-scan" ? (
            /* ---- TOTP QR Code Scan ---- */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app, then enter the 6-digit code to verify.
              </p>

              {qrCodeUrl && (
                <div className="flex justify-center">
                  <div className="rounded-xl border bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrCodeUrl}
                      alt="TOTP QR Code"
                      width={200}
                      height={200}
                      className="rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] text-muted-foreground mb-1">
                  Manual entry key:
                </p>
                <code className="text-xs font-mono break-all select-all">
                  {totpSecret}
                </code>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totp-verify">Verification Code</Label>
                <Input
                  ref={codeInputRef}
                  id="totp-verify"
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(e) =>
                    setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  maxLength={6}
                  className="text-center text-lg font-mono tracking-[0.3em]"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancelSetup} className="flex-1">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleVerifySetup}
                  disabled={isProcessing || verificationCode.length < 6}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  ) : (
                    <KeyRound className="size-3.5 mr-1.5" />
                  )}
                  Verify
                </Button>
              </div>
            </div>
          ) : setupStep === "email-verify" ? (
            /* ---- Email OTP Verification ---- */
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                <Mail className="size-5 text-blue-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Check your email</p>
                  <p className="text-xs text-muted-foreground">
                    We sent a verification code to your email address. It expires in 10 minutes.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-verify">Verification Code</Label>
                <Input
                  ref={codeInputRef}
                  id="email-verify"
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(e) =>
                    setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  maxLength={6}
                  className="text-center text-lg font-mono tracking-[0.3em]"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancelSetup} className="flex-1">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleVerifySetup}
                  disabled={isProcessing || verificationCode.length < 6}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  ) : (
                    <KeyRound className="size-3.5 mr-1.5" />
                  )}
                  Verify
                </Button>
              </div>
            </div>
          ) : setupStep === "backup-codes" ? (
            /* ---- Backup Codes ---- */
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                <CheckCircle2 className="size-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">2FA enabled successfully!</p>
                  <p className="text-xs text-muted-foreground">
                    Save these backup codes in a secure location. Each code can only be used once.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, i) => (
                    <div
                      key={i}
                      className="rounded-md border bg-background px-3 py-1.5 text-center font-mono text-sm"
                    >
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  These codes will only be shown once. If you lose them and your 2FA device, you will be locked out.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyBackupCodes}
                  className="flex-1"
                >
                  <Copy className="size-3.5 mr-1.5" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadBackupCodes}
                  className="flex-1"
                >
                  <Download className="size-3.5 mr-1.5" />
                  Download
                </Button>
              </div>

              <Button
                size="sm"
                onClick={handleCancelSetup}
                className="w-full"
              >
                Done
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Disable 2FA Dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              This will remove the extra security layer from your account.
              Enter your password to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="disable-password">Password</Label>
              <Input
                id="disable-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowDisableDialog(false);
                setDisablePassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisable}
              disabled={isDisabling || !disablePassword}
            >
              {isDisabling ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <ShieldOff className="size-3.5 mr-1.5" />
              )}
              Disable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Notifications Tab ───────────────────────────────────────────────────────

const NOTIFICATION_TYPES = [
  { key: "TASK_ASSIGNED", label: "Task Assignments", description: "When a task is assigned to you" },
  { key: "APPROVAL_REQUESTED", label: "Approval Requests", description: "When your approval is needed" },
  { key: "APPROVAL_DECISION", label: "Approval Decisions", description: "When someone approves or rejects your request" },
  { key: "TASK_COMPLETED", label: "Task Completions", description: "When a task in your workflow is completed" },
  { key: "WORKFLOW_COMPLETED", label: "Workflow Completed", description: "When your workflow finishes" },
  { key: "WORKFLOW_CANCELLED", label: "Workflow Cancelled", description: "When your workflow is cancelled" },
  { key: "COMMENT_ADDED", label: "Comments", description: "When someone comments on your workflow" },
  { key: "SLA_BREACH", label: "SLA Breaches", description: "When an SLA deadline is breached" },
  { key: "TASK_ESCALATED", label: "Task Escalations", description: "When a task is escalated" },
];

interface ChannelPrefs {
  email: boolean;
  inApp: boolean;
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<Record<string, ChannelPrefs>>(() => {
    const defaults: Record<string, ChannelPrefs> = {};
    for (const t of NOTIFICATION_TYPES) defaults[t.key] = { email: true, inApp: true };
    return defaults;
  });
  const [isLoading, setIsLoading] = useState(true);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/settings/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.preferences) {
          const loaded: Record<string, ChannelPrefs> = {};
          for (const t of NOTIFICATION_TYPES) {
            const val = data.preferences[t.key];
            if (val && typeof val === "object") {
              loaded[t.key] = {
                email: val.email ?? true,
                inApp: val.inApp ?? true,
              };
            } else {
              loaded[t.key] = { email: true, inApp: true };
            }
          }
          setPrefs(loaded);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // Debounced save — triggers 800ms after the last toggle
  const debouncedSave = useCallback(
    (updatedPrefs: Record<string, ChannelPrefs>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/settings/notifications", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preferences: updatedPrefs }),
          });
          if (!res.ok) {
            toast.error("Failed to save preferences");
            return;
          }
          toast.success("Notification preferences saved");
        } catch {
          toast.error("Failed to save preferences");
        }
      }, 800);
    },
    [],
  );

  const toggleChannel = useCallback(
    (key: string, channel: "email" | "inApp") => {
      setPrefs((prev) => {
        const updated = {
          ...prev,
          [key]: { ...prev[key], [channel]: !prev[key][channel] },
        };
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notification Preferences</CardTitle>
        <p className="text-xs text-muted-foreground">
          Control how you receive notifications for each event type. Changes save automatically.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="flex items-center justify-between px-3 pb-2 border-b mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Event Type
              </span>
              <div className="flex items-center gap-6">
                <span className="w-14 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  In-App
                </span>
                <span className="w-14 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </span>
              </div>
            </div>

            {NOTIFICATION_TYPES.map((type) => (
              <div
                key={type.key}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  {/* In-App toggle */}
                  <div className="w-14 flex justify-center">
                    <button
                      onClick={() => toggleChannel(type.key, "inApp")}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        prefs[type.key]?.inApp
                          ? "bg-primary"
                          : "bg-muted-foreground/20"
                      }`}
                      aria-label={`${type.label} in-app notifications`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          prefs[type.key]?.inApp ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  {/* Email toggle */}
                  <div className="w-14 flex justify-center">
                    <button
                      onClick={() => toggleChannel(type.key, "email")}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        prefs[type.key]?.email
                          ? "bg-primary"
                          : "bg-muted-foreground/20"
                      }`}
                      aria-label={`${type.label} email notifications`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          prefs[type.key]?.email ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Display Tab ─────────────────────────────────────────────────────────────

function DisplayTab() {
  const [theme, setTheme] = useState<string>("system");
  const [sidebarDefault, setSidebarDefault] = useState<string>("expanded");

  useEffect(() => {
    // Load from localStorage
    setTheme(localStorage.getItem("wo-theme") ?? "system");
    setSidebarDefault(localStorage.getItem("wo-sidebar") ?? "expanded");
  }, []);

  const handleSave = useCallback(() => {
    localStorage.setItem("wo-theme", theme);
    localStorage.setItem("wo-sidebar", sidebarDefault);

    // Apply theme
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      // System preference
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    toast.success("Display settings saved");
  }, [theme, sidebarDefault]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Display Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Theme</Label>
          <Select value={theme} onValueChange={(v) => setTheme(v ?? "system")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System Default</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Sidebar Default</Label>
          <Select value={sidebarDefault} onValueChange={(v) => setSidebarDefault(v ?? "expanded")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expanded">Expanded</SelectItem>
              <SelectItem value="collapsed">Collapsed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} size="sm">
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── System Tab (Admin Only) ─────────────────────────────────────────────────

function SystemTab() {
  const [defaultSla, setDefaultSla] = useState("48");
  const [sessionTimeout, setSessionTimeout] = useState("8");
  const [retentionDays, setRetentionDays] = useState("365");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/system")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setDefaultSla(data.defaultSlaDays?.toString() ?? "48");
          setSessionTimeout(data.sessionTimeoutHours?.toString() ?? "8");
          setRetentionDays(data.auditRetentionDays?.toString() ?? "365");
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/system", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultSlaDays: parseInt(defaultSla) || 48,
          sessionTimeoutHours: parseInt(sessionTimeout) || 8,
          auditRetentionDays: parseInt(retentionDays) || 365,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to save system settings");
        return;
      }
      toast.success("System settings saved");
    } catch {
      toast.error("Failed to save system settings");
    } finally {
      setIsSaving(false);
    }
  }, [defaultSla, sessionTimeout, retentionDays]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="size-4" />
          System Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="default-sla">Default Task SLA (hours)</Label>
          <Input
            id="default-sla"
            type="number"
            min={1}
            value={defaultSla}
            onChange={(e) => setDefaultSla(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Default deadline for tasks when no specific due date is set
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="session-timeout">Session Timeout (hours)</Label>
          <Input
            id="session-timeout"
            type="number"
            min={1}
            max={24}
            value={sessionTimeout}
            onChange={(e) => setSessionTimeout(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            How long before a user session expires and requires re-login
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="retention-days">Audit Log Retention (days)</Label>
          <Input
            id="retention-days"
            type="number"
            min={30}
            value={retentionDays}
            onChange={(e) => setRetentionDays(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            How long audit log entries are kept before archival
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? "Saving..." : "Save System Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Settings Page ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes("admin") ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account and application preferences
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="size-3.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <ShieldCheck className="size-3.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="size-3.5" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="display" className="gap-1.5">
            <Palette className="size-3.5" />
            Display
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="system" className="gap-1.5">
              <Settings className="size-3.5" />
              System
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <SecurityTab />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="display" className="mt-6">
          <DisplayTab />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="system" className="mt-6">
            <SystemTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
