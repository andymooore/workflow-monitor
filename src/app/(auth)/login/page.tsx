"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  Workflow,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LoginStep = "credentials" | "2fa";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 2FA state
  const [step, setStep] = useState<LoginStep>("credentials");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [twoFactorMethod, setTwoFactorMethod] = useState<"EMAIL" | "TOTP">(
    "EMAIL"
  );
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus OTP input when 2FA step is shown
  useEffect(() => {
    if (step === "2fa" && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [step]);

  const handleCredentialsSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError("");

      try {
        // First, check if 2FA is required
        const challengeRes = await fetch("/api/auth/login-challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const challengeData = await challengeRes.json();

        if (!challengeRes.ok) {
          setError(
            challengeData?.error?.message ?? "Invalid email or password"
          );
          setLoading(false);
          return;
        }

        if (challengeData.requires2FA) {
          // Show 2FA input
          setChallengeToken(challengeData.challengeToken);
          setTwoFactorMethod(challengeData.method);
          setStep("2fa");
          setLoading(false);
          return;
        }

        // No 2FA — proceed with normal sign-in
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError("Invalid email or password");
          setLoading(false);
        } else {
          router.push("/dashboard");
        }
      } catch {
        setError("An unexpected error occurred");
        setLoading(false);
      }
    },
    [email, password, router]
  );

  const handleTwoFactorSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError("");

      try {
        // Verify the 2FA code
        const verifyRes = await fetch("/api/auth/verify-2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeToken,
            code: twoFactorCode,
          }),
        });

        const verifyData = await verifyRes.json();

        if (!verifyRes.ok) {
          setError(
            verifyData?.error?.message ?? "Invalid verification code"
          );
          setLoading(false);
          return;
        }

        if (!verifyData.verified) {
          setError("Verification failed. Please try again.");
          setLoading(false);
          return;
        }

        // 2FA verified — complete sign-in with the verification token
        const result = await signIn("credentials", {
          email,
          password,
          twoFactorToken: verifyData.verificationToken,
          redirect: false,
        });

        if (result?.error) {
          setError("Authentication failed. Please try again.");
          setLoading(false);
        } else {
          router.push("/dashboard");
        }
      } catch {
        setError("An unexpected error occurred");
        setLoading(false);
      }
    },
    [challengeToken, twoFactorCode, email, password, router]
  );

  const handleBackToCredentials = useCallback(() => {
    setStep("credentials");
    setTwoFactorCode("");
    setChallengeToken("");
    setError("");
  }, []);

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
            Enterprise workflow
            <br />
            <span className="bg-gradient-to-r from-[oklch(0.65_0.15_195)] to-[oklch(0.78_0.14_80)] bg-clip-text text-transparent">
              orchestration
            </span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[oklch(0.6_0.01_260)]">
            Manage, monitor, and automate IT-SEC-002 compliant workflows across
            government departments with full audit trails and SLA tracking.
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap gap-2">
            {["IT-SEC-002 Compliant", "JDPA Ready", "SLA Tracking", "Audit Trails"].map(
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

      {/* Right panel — Login form */}
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
              {step === "credentials" ? "Welcome back" : "Two-Factor Verification"}
            </h1>
            <p className="mt-1.5 text-sm text-[oklch(0.55_0.01_260)]">
              {step === "credentials"
                ? "Sign in to your account to continue"
                : twoFactorMethod === "EMAIL"
                  ? "Check your email for a verification code"
                  : "Enter the code from your authenticator app"}
            </p>
          </div>

          {/* Login Card */}
          <div className="rounded-2xl border border-[oklch(1_0_0_/_7%)] bg-[oklch(1_0_0_/_4%)] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
            {step === "credentials" ? (
              /* ──────── Credentials Form ──────── */
              <form onSubmit={handleCredentialsSubmit} className="space-y-5">
                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-[oklch(0.6_0.01_260)]">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[oklch(0.4_0.01_260)]" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@jis.gov.jm"
                      required
                      autoComplete="email"
                      className="h-11 rounded-xl border-[oklch(1_0_0_/_8%)] bg-[oklch(1_0_0_/_3%)] pl-10 text-white transition-all placeholder:text-[oklch(0.35_0.01_260)] focus:border-[oklch(0.65_0.15_195_/_40%)] focus:bg-[oklch(1_0_0_/_5%)] focus:ring-1 focus:ring-[oklch(0.65_0.15_195_/_20%)]"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-[oklch(0.6_0.01_260)]">
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
                      autoComplete="current-password"
                      className="h-11 rounded-xl border-[oklch(1_0_0_/_8%)] bg-[oklch(1_0_0_/_3%)] pl-10 pr-10 text-white transition-all placeholder:text-[oklch(0.35_0.01_260)] focus:border-[oklch(0.65_0.15_195_/_40%)] focus:bg-[oklch(1_0_0_/_5%)] focus:ring-1 focus:ring-[oklch(0.65_0.15_195_/_20%)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-1/2 right-3.5 -translate-y-1/2 text-[oklch(0.4_0.01_260)] transition-colors hover:text-[oklch(0.6_0.01_260)]"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Forgot password */}
                <div className="flex justify-end -mt-1">
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-[oklch(0.55_0.01_260)] transition-colors hover:text-[oklch(0.65_0.15_195)]"
                  >
                    Forgot your password?
                  </Link>
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
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign in
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </form>
            ) : (
              /* ──────── 2FA Verification Form ──────── */
              <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
                {/* Method indicator */}
                <div className="flex items-center gap-3 rounded-xl border border-[oklch(1_0_0_/_6%)] bg-[oklch(1_0_0_/_3%)] p-3">
                  {twoFactorMethod === "EMAIL" ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                      <Mail className="h-4 w-4 text-blue-400" />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                      <Smartphone className="h-4 w-4 text-purple-400" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">
                      {twoFactorMethod === "EMAIL"
                        ? "Email Verification"
                        : "Authenticator App"}
                    </p>
                    <p className="text-xs text-[oklch(0.5_0.01_260)]">
                      {twoFactorMethod === "EMAIL"
                        ? `Code sent to ${email}`
                        : "Open your authenticator app"}
                    </p>
                  </div>
                </div>

                {/* OTP Code Input */}
                <div className="space-y-2">
                  <Label htmlFor="otp-code" className="text-xs font-medium uppercase tracking-wider text-[oklch(0.6_0.01_260)]">
                    Verification Code
                  </Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[oklch(0.4_0.01_260)]" />
                    <Input
                      ref={otpInputRef}
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      value={twoFactorCode}
                      onChange={(e) =>
                        setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                      }
                      placeholder="Enter 6-digit code"
                      required
                      autoComplete="one-time-code"
                      maxLength={8}
                      className="h-11 rounded-xl border-[oklch(1_0_0_/_8%)] bg-[oklch(1_0_0_/_3%)] pl-10 text-center text-lg font-mono tracking-[0.3em] text-white transition-all placeholder:text-[oklch(0.35_0.01_260)] placeholder:tracking-normal placeholder:text-sm placeholder:font-sans focus:border-[oklch(0.65_0.15_195_/_40%)] focus:bg-[oklch(1_0_0_/_5%)] focus:ring-1 focus:ring-[oklch(0.65_0.15_195_/_20%)]"
                    />
                  </div>
                  <p className="text-[11px] text-[oklch(0.45_0.01_260)]">
                    You can also use a backup code
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="animate-shake rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBackToCredentials}
                    className="h-11 rounded-xl border-[oklch(1_0_0_/_10%)] bg-transparent text-[oklch(0.6_0.01_260)] hover:bg-[oklch(1_0_0_/_5%)] hover:text-white"
                    disabled={loading}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="submit"
                    className="h-11 flex-1 rounded-xl bg-gradient-to-r from-[oklch(0.55_0.14_210)] to-[oklch(0.50_0.13_230)] font-semibold text-white shadow-lg shadow-[oklch(0.50_0.13_230_/_25%)] transition-all hover:from-[oklch(0.58_0.14_210)] hover:to-[oklch(0.53_0.13_230)] hover:shadow-xl hover:shadow-[oklch(0.50_0.13_230_/_35%)] disabled:opacity-50"
                    disabled={loading || twoFactorCode.length < 6}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Verify & Sign in
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>

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
