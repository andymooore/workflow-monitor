import { type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/events
// Server-Sent Events endpoint for real-time updates.
// Pushes: task assignments, approvals, workflow completions, notifications.
// Falls back to polling if SSE is not supported.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`),
      );

      // Poll for changes every 5 seconds and push as SSE
      // In a production system, this would use PostgreSQL LISTEN/NOTIFY
      let lastCheck = new Date();

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        try {
          // Check for new notifications since last check
          const newNotifications = await prisma.notification.findMany({
            where: {
              userId,
              createdAt: { gt: lastCheck },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          });

          if (newNotifications.length > 0) {
            controller.enqueue(
              encoder.encode(
                `event: notifications\ndata: ${JSON.stringify({
                  count: newNotifications.length,
                  latest: newNotifications[0],
                })}\n\n`,
              ),
            );
          }

          // Check for task status changes
          const updatedTasks = await prisma.taskInstance.findMany({
            where: {
              assigneeId: userId,
              updatedAt: { gt: lastCheck },
              instance: { status: "RUNNING" },
            },
            select: {
              id: true,
              status: true,
              node: { select: { label: true } },
              instanceId: true,
            },
            take: 10,
          });

          if (updatedTasks.length > 0) {
            controller.enqueue(
              encoder.encode(
                `event: tasks\ndata: ${JSON.stringify({ tasks: updatedTasks })}\n\n`,
              ),
            );
          }

          lastCheck = new Date();

          // Heartbeat to keep connection alive
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Connection likely closed
          clearInterval(interval);
        }
      }, 5000);

      // Clean up on abort
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
