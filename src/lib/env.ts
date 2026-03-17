// ---------------------------------------------------------------------------
// Environment variable validation — fail fast on missing required config.
// Import this module early (e.g. in db.ts, auth.ts) so the app crashes at
// startup rather than at request time.
// ---------------------------------------------------------------------------

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[ENV] Missing required environment variable: ${key}. ` +
        `Check your .env file or deployment configuration.`,
    );
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`[ENV] ${key} must be a valid integer, got: "${raw}"`);
  }
  return parsed;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw === "true" || raw === "1";
}

// ---------------------------------------------------------------------------
// Validated environment — access these instead of process.env directly.
// ---------------------------------------------------------------------------
export const env = {
  // ── Core ──────────────────────────────────────────────────────────────
  NODE_ENV: optional("NODE_ENV", "development"),
  DATABASE_URL: required("DATABASE_URL"),
  AUTH_SECRET: required("AUTH_SECRET"),

  // ── Application ──────────────────────────────────────────────────────
  NEXTAUTH_URL: optional("NEXTAUTH_URL", "http://localhost:3000"),
  LOG_LEVEL: optional("LOG_LEVEL", "info") as
    | "debug"
    | "info"
    | "warn"
    | "error",

  // ── Email (Resend) ───────────────────────────────────────────────────
  RESEND_API_KEY: optional("RESEND_API_KEY", ""),
  EMAIL_FROM: optional("EMAIL_FROM", "WorkFlowPro <onboarding@resend.dev>"),

  // ── Auth ────────────────────────────────────────────────────────────
  AUTH_ALLOWED_DOMAIN: optional("AUTH_ALLOWED_DOMAIN", "jis.gov.jm"),

  // ── File uploads ─────────────────────────────────────────────────────
  UPLOAD_DIR: optional("UPLOAD_DIR", "./uploads"),
  MAX_FILE_SIZE_MB: optionalInt("MAX_FILE_SIZE_MB", 10),

  // ── Database pool ────────────────────────────────────────────────────
  DB_POOL_SIZE: optionalInt("DB_POOL_SIZE", 10),

  // ── Derived ──────────────────────────────────────────────────────────
  get isProduction() {
    return this.NODE_ENV === "production";
  },
  get isDevelopment() {
    return this.NODE_ENV === "development";
  },
  get maxFileSizeBytes() {
    return this.MAX_FILE_SIZE_MB * 1024 * 1024;
  },
} as const;
