// ---------------------------------------------------------------------------
// Structured logger for production readiness.
// Outputs JSON in production (machine-parseable for log aggregators),
// human-readable format in development.
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel =
  LEVEL_PRIORITY[
    (process.env.LOG_LEVEL as LogLevel) ?? "info"
  ] ?? LEVEL_PRIORITY.info;

const isProduction = process.env.NODE_ENV === "production";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= minLevel;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function serialize(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  if (isProduction) {
    // Structured JSON for log aggregators (Datadog, CloudWatch, etc.)
    return JSON.stringify(entry);
  }

  // Human-readable for development
  const tag = level.toUpperCase().padEnd(5);
  const time = entry.timestamp.slice(11, 23); // HH:MM:SS.mmm
  const metaStr = meta && Object.keys(meta).length > 0
    ? ` ${JSON.stringify(meta)}`
    : "";
  return `${time} [${tag}] ${message}${metaStr}`;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      error: error.message,
      stack: isProduction ? undefined : error.stack,
      ...(("code" in error && typeof error.code === "string")
        ? { errorCode: error.code }
        : {}),
    };
  }
  return { error: String(error) };
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("debug")) {
      console.debug(serialize("debug", message, meta));
    }
  },

  info(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("info")) {
      console.info(serialize("info", message, meta));
    }
  },

  warn(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("warn")) {
      console.warn(serialize("warn", message, meta));
    }
  },

  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    if (shouldLog("error")) {
      const errorMeta = error ? serializeError(error) : {};
      console.error(serialize("error", message, { ...errorMeta, ...meta }));
    }
  },
};
