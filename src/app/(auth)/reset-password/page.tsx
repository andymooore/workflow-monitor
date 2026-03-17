"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Password strength requirements displayed to the user
const PASSWORD_RULES = [
  { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const allRulesMet = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allRulesMet && passwordsMatch && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message =
          data?.error?.message ?? "Something went wrong. Please try again.";
        setError(message);
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // No token in URL
  if (!token) {
    return (
      <div className="relative flex min-h-screen overflow-hidden bg-[oklch(0.08_0.02_260)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="login-orb login-orb-1" />
          <div className="login-orb login-orb-2" />
          <div className="login-orb login-orb-3" />
        </div>
        <div className="topo-grid pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-[420px]">
            <div className="rounded-2xl border border-[oklch(1_0_0_/_7%)] bg-[oklch(1_0_0_/_4%)] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/20">
                  <AlertTriangle className="h-7 w-7 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Invalid reset link
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[oklch(0.55_0.01_260)]">
                    This password reset link is invalid or missing a token.
                    Please request a new reset link.
                  </p>
                </div>
                <Link
                  href="/forgot-password"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[oklch(0.65_0.15_195)] transition-colors hover:text-[oklch(0.72_0.15_195)]"
                >
                  Request new reset link
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            mounted
              ? "translate-y-0 opacity-100"
              : "translate-y-6 opacity-0"
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
            mounted
              ? "translate-y-0 opacity-100"
              : "translate-y-8 opacity-0"
          )}
        >
          <h2 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white">
            Set your new
            <br />
            <span className="bg-gradient-to-r from-[oklch(0.65_0.15_195)] to-[oklch(0.78_0.14_80)] bg-clip-text text-transparent">
              password
            </span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[oklch(0.6_0.01_260)]">
            Choose a strong, unique password that meets our enterprise security
            requirements. Your password must meet all complexity rules.
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap gap-2">
            {["12+ Characters", "Mixed Case", "Numbers Required", "Special Characters"].map(
              (feature) => (
                <span
                  key={feature}
                  className="rounded-full border border-[oklch(1_0_0_/_6%)] bg-[oklch(1_0_0_/_4%)] px-3 py-1 text-xs font-medium text-[oklch(0.7_0.01_250)]"
                >
                  {feature}
                </span>
              )
            )}
          </div>
        </div>

        <div
          className={cn(
            "transition-all duration-1000 delay-700",
            mounted
              ? "translate-y-0 opacity-100"
              : "translate-y-4 opacity-0"
          )}
        >
          <p className="text-xs text-[oklch(0.4_0.01_260)]">
            &copy; {new Date().getFullYear()} WorkFlow Monitor.
            All rights reserved.
          </p>
        </div>
      </div>

      {/* Right panel — Form */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        <div
          className={cn(
            "w-full max-w-[420px] transition-all duration-700 delay-300",
            mounted
              ? "translate-y-0 opacity-100"
              : "translate-y-6 opacity-0"
          )}
        >
          {/* Mobile brand (hidden on lg) */}
          <div className="mb-10 text-center lg:hidden">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.65_0.15_195)] to-[oklch(0.50_0.13_230)] shadow-lg shadow-[oklch(0.65_0.15_195_/_25%)]">
              <Workflow className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              WorkFlow Monitor
            </h1>
          </div>

          {/* Form header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Reset your password
            </h1>
            <p className="mt-1.5 text-sm text-[oklch(0.55_0.01_260)]">
              Create a new secure password for your account
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-[oklch(1_0_0_/_7%)] bg-[oklch(1_0_0_/_4%)] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
            {success ? (
              /* Success state */
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Password reset complete
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[oklch(0.55_0.01_260)]">
                    Your password has been successfully updated. You can now sign
                    in with your new password.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[oklch(0.55_0.14_210)] to-[oklch(0.50_0.13_230)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[oklch(0.50_0.13_230_/_25%)] transition-all hover:from-[oklch(0.58_0.14_210)] hover:to-[oklch(0.53_0.13_230)]"
                >
                  Sign in
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              /* Form state */
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* New Password */}
                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-xs font-medium uppercase tracking-wider text-[oklch(0.6_0.01_260)]"
                  >
                    New Password
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
                </div>

                {/* Password requirements */}
                {password.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-[oklch(1_0_0_/_5%)] bg-[oklch(1_0_0_/_2%)] p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[oklch(0.5_0.01_260)]">
                      Password requirements
                    </p>
                    {PASSWORD_RULES.map((rule) => {
                      const met = rule.test(password);
                      return (
                        <div
                          key={rule.label}
                          className="flex items-center gap-2 text-xs"
                        >
                          {met ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-[oklch(0.35_0.01_260)]" />
                          )}
                          <span
                            className={cn(
                              met
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

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label
                    htmlFor="confirmPassword"
                    className="text-xs font-medium uppercase tracking-wider text-[oklch(0.6_0.01_260)]"
                  >
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[oklch(0.4_0.01_260)]" />
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="h-11 rounded-xl border-[oklch(1_0_0_/_8%)] bg-[oklch(1_0_0_/_3%)] pl-10 pr-10 text-white transition-all placeholder:text-[oklch(0.35_0.01_260)] focus:border-[oklch(0.65_0.15_195_/_40%)] focus:bg-[oklch(1_0_0_/_5%)] focus:ring-1 focus:ring-[oklch(0.65_0.15_195_/_20%)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute top-1/2 right-3.5 -translate-y-1/2 text-[oklch(0.4_0.01_260)] transition-colors hover:text-[oklch(0.6_0.01_260)]"
                      tabIndex={-1}
                    >
                      {showConfirm ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400">
                      <XCircle className="h-3.5 w-3.5" />
                      Passwords do not match
                    </div>
                  )}
                  {passwordsMatch && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Passwords match
                    </div>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <div className="animate-shake rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
                    {error}
                  </div>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-gradient-to-r from-[oklch(0.55_0.14_210)] to-[oklch(0.50_0.13_230)] font-semibold text-white shadow-lg shadow-[oklch(0.50_0.13_230_/_25%)] transition-all hover:from-[oklch(0.58_0.14_210)] hover:to-[oklch(0.53_0.13_230)] hover:shadow-xl hover:shadow-[oklch(0.50_0.13_230_/_35%)] disabled:opacity-50"
                  disabled={!canSubmit}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resetting password...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Reset password
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </form>
            )}
          </div>

          {/* Back to login link */}
          {!success && (
            <div className="mt-6 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[oklch(0.55_0.01_260)] transition-colors hover:text-[oklch(0.65_0.15_195)]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </div>
          )}

          {/* Security footer */}
          <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-[oklch(0.4_0.01_260)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>256-bit encrypted &middot; IT-SEC-002 compliant</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[oklch(0.08_0.02_260)]">
          <Loader2 className="h-8 w-8 animate-spin text-[oklch(0.65_0.15_195)]" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
