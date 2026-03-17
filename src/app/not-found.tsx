import Link from "next/link";
import { Workflow, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[oklch(0.65_0.15_195)] to-[oklch(0.50_0.13_230)] shadow-lg shadow-[oklch(0.65_0.15_195_/_20%)]">
          <Workflow className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-6xl font-extrabold tracking-tight text-foreground">
          404
        </h1>
        <p className="mt-3 text-lg font-medium text-muted-foreground">
          Page not found
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
