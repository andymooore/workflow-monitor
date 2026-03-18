"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  Workflow,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Mail,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PageState = "loading" | "valid" | "invalid" | "success";

export default function AcceptInvitePageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[oklch(0.08_0.02_260)]">
          <Loader2 className="h-8 w-8 animate-spin text-[oklch(0.65_0.15_195)]" />
        </div>
      }
    >
      <AcceptInvitePage />
    </Suspense>
  );
}

interface InviteInfo {
  email: string;
  name: string;
  role: string | null;
}

const PASSWORD_RULES = [
  { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  {
    label: "One special character",
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
  },
];

function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [pageState, setPageState] = useState<PageState>("loading");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setPageState("invalid");
      setErrorMessage("No invitation token provided.");
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/auth/accept-invite?token=${encodeURIComponent(token)}`
        );
        const data = await res.json();

        if (!res.ok) {
          setPageState("invalid");
          setErrorMessage(
            data?.error?.message ?? "This invitation is not valid."
          );
          return;
        }

        setInviteInfo({ email: data.email, name: data.name, role: data.role });
        setPageState("valid");
      } catch {
        setPageState("invalid");
        setErrorMessage("Failed to validate invitation. Please try again.");
      }
    })();
  }, [token]);

  const allRulesPassing = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError("");

      if (!allRulesPassing) {
        setFormError("Password does not meet all requirements.");
        return;
      }
      if (!passwordsMatch) {
        setFormError("Passwords do not match.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/auth/accept-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          setFormError(
            data?.error?.message ?? "Failed to create account. Please try again."
          );
          setSubmitting(false);
          return;
        }

        setPageState("success");
      } catch {
        setFormError("An unexpected error occurred. Please try again.");
        setSubmitting(false);
      }
    },
    [token, password, allRulesPassing, passwordsMatch]
  );

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[oklch(0.08_0.02_260)]">
      {/* Ambient light orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

      {/* Dot grid pattern */}
      <div className="topo-grid pointer-events-none absolute inset-0" />

      {/* Left panel — Branding */}
      <div className="relative z-10 hidden w-[45%] flex-col justify-between p-12 lg:flex">
        <div
          className={cn(
            "transition-all duration-1000 delay-200",
            mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.65_0.15_195)] to-[oklch(0.50_0.13_230)] shadow-lg shadow-[oklch(0.65_0.15_195_/_25%)]">
              <Workflow className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              WorkFlow Monitor
            </span>
          </div>
        </div>

        <div
          className={cn(
            "max-w-md transition-all duration-1000 delay-500",
            mounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          )}
        >
          <h2 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white">
            Join your
            <br />
            <span className="bg-gradient-to-r from-[oklch(0.65_0.15_195)] to-[oklch(0.78_0.14_80)] bg-clip-text text-transparent">
              team
            </span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[oklch(0.6_0.01_260)]">
            You&apos;ve been invited to join WorkFlow Monitor. Set up your
            account to start managing workflows across government departments.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {[
              "Invite Only",
              "Enterprise Security",
              "Role-Based Access",
              "2FA Ready",
            ].map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-[oklch(1_0_0_/_6%)] bg-[oklch(1_0_0_/_4%)] px-3 py-1 text-xs font-medium text-[oklch(0.7_0.01_250)]"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "transition-all duration-1000 delay-700",
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          )}
        >
          <p className="text-xs text-[oklch(0.4_0.01_260)]">
            &copy; {new Date().getFullYear()} WorkFlow Monitor. All rights
            reserved.
          </p>
        </div>
      </div>

      {/* Right panel — Form */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        <div
          className={cn(
            "w-full max-w-[420px] transition-all duration-700 delay-300",
            mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          )}
        >
          {/* Mobile brand */}
          <div className="mb-10 text-center lg:hidden">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.65_0.15_195)] to-[oklch(0.50_0.13_230)] shadow-lg shadow-[oklch(0.65_0.15_195_/_25%)]">
              <Workflow className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              WorkFlow Monitor
            </h1>
          </div>

          {/* Loading state */}
          {pageState === "loading" && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[oklch(0.65_0.15_195)]" />
              <p className="text-sm text-[oklch(0.55_0.01_260)]">
                Validating your invitation...
              </p>
            </div>
          )}

          {/* Invalid/expired state */}
          {pageState === "invalid" && (
            <div className="rounded-2xl border border-[oklch(1_0_0_/_7%)] bg-[oklch(1_0_0_/_4%)] p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
                <XCircle className="h-7 w-7 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white">
                Invalid Invitation
              </h2>
              <p className="mt-2 text-sm text-[oklch(0.55_0.01_260)]">
                {errorMessage}
              </p>
              <Link href="/login">
                <Button
                  variant="outline"
                  className="mt-6 border-[oklch(1_0_0_/_10%)] bg-transparent text-[oklch(0.7_0.01_260)] hover:bg-[oklch(1_0_0_/_5%)] hover:text-white"
                >
                  Go to Sign In
                </Button>
              </Link>
            </div>
          )}

          {/* Success state */}
          {pageState === "success" && (
            <div className="rounded-2xl border border-[oklch(1_0_0_/_7%)] bg-[oklch(1_0_0_/_4%)] p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white">
                Account Created!
              </h2>
              <p className="mt-2 text-sm text-[oklch(0.55_0.01_260)]">
                Your account has been set up successfully. You can now sign in
                with your email and password.
              </p>
              <Link href="/login">
                <Button className="mt-6 h-11 rounded-xl bg-gradient-to-r from-[oklch(0.55_0.14_210)] to-[oklch(0.50_0.13_230)] font-semibold text-white shadow-lg shadow-[oklch(0.50_0.13_230_/_25%)]">
                  <span className="flex items-center gap-2">
                    Sign In
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
              </Link>
            </div>
          )}

          {/* Valid — set password form */}
          {pageState === "valid" && inviteInfo && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Set Up Your Account
                </h1>
                <p className="mt-1.5 text-sm text-[oklch(0.55_0.01_260)]">
                  Choose a strong password to complete your registration
                </p>
              </div>

              <div className="rounded-2xl border border-[oklch(1_0_0_/_7%)] bg-[oklch(1_0_0_/_4%)] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
                {/* Invite info card */}
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-[oklch(1_0_0_/_6%)] bg-[oklch(1_0_0_/_3%)] p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                    <UserPlus className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {inviteInfo.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-[oklch(0.45_0.01_260)]" />
                      <p className="truncate text-xs text-[oklch(0.5_0.01_260)]">
                        {inviteInfo.email}
                      </p>
                    </div>
                  </div>
                  {inviteInfo.role && (
                    <span className="shrink-0 rounded-full border border-[oklch(0.65_0.15_195_/_20%)] bg-[oklch(0.65_0.15_195_/_10%)] px-2.5 py-0.5 text-[10px] font-medium text-[oklch(0.65_0.15_195)]">
                      {inviteInfo.role}
                    </span>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Password */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="text-xs font-medium uppercase tracking-wider text-[oklch(0.6_0.01_260)]"
                    >
                      Password
                    </Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[oklch(0.4_0.01_260)]" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="h-11 rounded-xl border-[oklch(1_0_0_/_8%)] bg-[oklch(1_0_0_/_3%)] pl-10 pr-10 text-white transition-all placeholder:text-[oklch(0.35_0.01_260)] focus:border-[oklch(0.65_0.15_195_/_40%)] focus:bg-[oklch(1_0_0_/_5%)] focus:ring-1 focus:ring-[oklch(0.65_0.15_195_/_20%)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute top-1/2 right-3.5 -translate-y-1/2 text-[oklch(0.4_0.01_260)] transition-colors hover:text-[oklch(0.6_0.01_260)]"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Password strength rules */}
                    {password.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {PASSWORD_RULES.map((rule) => {
                          const passing = rule.test(password);
                          return (
                            <div
                              key={rule.label}
                              className="flex items-center gap-1.5"
                            >
                              <div
                                className={cn(
                                  "h-1 w-1 rounded-full transition-colors",
                                  passing
                                    ? "bg-emerald-400"
                                    : "bg-[oklch(0.35_0.01_260)]"
                                )}
                              />
                              <span
                                className={cn(
                                  "text-[11px] transition-colors",
                                  passing
                                    ? "text-emerald-400"
                                    : "text-[oklch(0.45_0.01_260)]"
                                )}
                              >
                                {rule.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="confirm-password"
                      className="text-xs font-medium uppercase tracking-wider text-[oklch(0.6_0.01_260)]"
                    >
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[oklch(0.4_0.01_260)]" />
                      <Input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="h-11 rounded-xl border-[oklch(1_0_0_/_8%)] bg-[oklch(1_0_0_/_3%)] pl-10 text-white transition-all placeholder:text-[oklch(0.35_0.01_260)] focus:border-[oklch(0.65_0.15_195_/_40%)] focus:bg-[oklch(1_0_0_/_5%)] focus:ring-1 focus:ring-[oklch(0.65_0.15_195_/_20%)]"
                      />
                    </div>
                    {confirmPassword.length > 0 && !passwordsMatch && (
                      <p className="text-[11px] text-red-400">
                        Passwords do not match
                      </p>
                    )}
                  </div>

                  {/* Error */}
                  {formError && (
                    <div className="animate-shake rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
                      {formError}
                    </div>
                  )}

                  {/* Submit */}
                  <Button
                    type="submit"
                    className="h-11 w-full rounded-xl bg-gradient-to-r from-[oklch(0.55_0.14_210)] to-[oklch(0.50_0.13_230)] font-semibold text-white shadow-lg shadow-[oklch(0.50_0.13_230_/_25%)] transition-all hover:from-[oklch(0.58_0.14_210)] hover:to-[oklch(0.53_0.13_230)] hover:shadow-xl hover:shadow-[oklch(0.50_0.13_230_/_35%)] disabled:opacity-50"
                    disabled={submitting || !allRulesPassing || !passwordsMatch}
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Account...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Create Account
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </form>
              </div>

              {/* Security footer */}
              <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-[oklch(0.4_0.01_260)]">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>256-bit encrypted &middot; IT-SEC-002 compliant</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
