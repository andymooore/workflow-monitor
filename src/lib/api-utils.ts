import { NextResponse, type NextRequest } from "next/server";
import { auth } from "./auth";
import { z } from "zod";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Structured API error class
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new ApiError(400, message, "BAD_REQUEST", details);
  }

  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message, "UNAUTHORIZED");
  }

  static forbidden(message = "Insufficient permissions") {
    return new ApiError(403, message, "FORBIDDEN");
  }

  static notFound(message = "Resource not found") {
    return new ApiError(404, message, "NOT_FOUND");
  }

  static conflict(message: string) {
    return new ApiError(409, message, "CONFLICT");
  }

  static tooManyRequests(message = "Too many requests", retryAfterSeconds?: number) {
    return new ApiError(429, message, "TOO_MANY_REQUESTS", retryAfterSeconds ? { retryAfter: retryAfterSeconds } : undefined);
  }

  static internal(message = "Internal server error") {
    return new ApiError(500, message, "INTERNAL_ERROR");
  }
}

// ---------------------------------------------------------------------------
// Consistent error response format
// ---------------------------------------------------------------------------
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    const headers: Record<string, string> = {};

    // Add Retry-After header for rate-limited responses (429)
    if (error.statusCode === 429) {
      const retryAfter = error.details?.retryAfter;
      headers["Retry-After"] = String(typeof retryAfter === "number" ? retryAfter : 60);
    }

    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.statusCode, headers }
    );
  }

  // Log unexpected errors server-side only — never leak details to client
  logger.error("Unhandled API error", error);

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
    { status: 500 }
  );
}

// ---------------------------------------------------------------------------
// Sanitize Zod validation errors for production
// In development, expose full field paths and messages for debugging.
// In production, sanitize field names to prevent leaking internal schema details.
// ---------------------------------------------------------------------------
function formatValidationErrors(
  zodError: z.ZodError
): Record<string, unknown> {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // Development: full detail for debugging
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of zodError.issues) {
      const path = issue.path.join(".") || "_root";
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    return { fields: fieldErrors };
  }

  // Production: sanitize — only expose generic messages, not field names
  const errors: string[] = [];
  for (const issue of zodError.issues) {
    // Use only the user-facing message, strip internal path details
    errors.push(issue.message);
  }
  return { errors };
}

// ---------------------------------------------------------------------------
// Authenticated user type returned by withAuth
// ---------------------------------------------------------------------------
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

// ---------------------------------------------------------------------------
// Context passed to withAuth handlers
// ---------------------------------------------------------------------------
export interface AuthContext<T = unknown> {
  user: AuthUser;
  body: T;
  params: Record<string, string>;
}

// ---------------------------------------------------------------------------
// withAuth: Higher-order function wrapping API handlers with auth,
// input validation, and structured error handling.
// ---------------------------------------------------------------------------
export function withAuth<T extends z.ZodType = z.ZodNever>(options: {
  schema?: T;
  handler: (
    req: NextRequest,
    ctx: AuthContext<T extends z.ZodNever ? never : z.infer<T>>
  ) => Promise<NextResponse>;
}) {
  return async (
    req: NextRequest,
    routeContext?: { params?: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      // 1. Authenticate
      const session = await auth();
      if (!session?.user?.id || !session.user.email || !session.user.name) {
        return errorResponse(ApiError.unauthorized());
      }

      const user: AuthUser = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        roles: session.user.roles ?? [],
      };

      // 2. Resolve route params
      const params = routeContext?.params ? await routeContext.params : {};

      // 3. Parse and validate body if schema is provided
      let body: unknown = undefined;
      if (options.schema) {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return errorResponse(
            ApiError.badRequest("Invalid or missing JSON body")
          );
        }

        const result = options.schema.safeParse(rawBody);
        if (!result.success) {
          const details = formatValidationErrors(
            (result as { error: z.ZodError }).error
          );
          return errorResponse(
            ApiError.badRequest("Validation failed", details)
          );
        }

        body = result.data;
      }

      // 4. Execute the handler
      return await options.handler(req, {
        user,
        body: body as T extends z.ZodNever ? never : z.infer<T>,
        params,
      });
    } catch (error) {
      // 5. Log with request context for debugging
      const path = req.nextUrl.pathname;
      const method = req.method;
      logger.error("API handler error", error, { method, path });

      return errorResponse(error);
    }
  };
}

// ---------------------------------------------------------------------------
// withAdminAuth: Like withAuth but requires the 'admin' role.
// ---------------------------------------------------------------------------
export function withAdminAuth<T extends z.ZodType = z.ZodNever>(options: {
  schema?: T;
  handler: (
    req: NextRequest,
    ctx: AuthContext<T extends z.ZodNever ? never : z.infer<T>>
  ) => Promise<NextResponse>;
}) {
  return withAuth({
    schema: options.schema,
    handler: async (req, ctx) => {
      if (!ctx.user.roles.includes("admin")) {
        throw ApiError.forbidden("Admin role required");
      }
      return options.handler(req, ctx);
    },
  });
}
