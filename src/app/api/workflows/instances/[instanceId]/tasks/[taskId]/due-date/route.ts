import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const setDueDateSchema = z.object({
  dueDate: z.string().datetime().nullable(),
});

// PUT /api/workflows/instances/[instanceId]/tasks/[taskId]/due-date
export const PUT = withAuth({
  schema: setDueDateSchema,
  handler: async (request, { user, body, params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) {
      throw ApiError.tooManyRequests();
    }

    const { instanceId, taskId } = params;

    const taskInstance = await prisma.taskInstance.findUnique({
      where: { id: taskId },
      include: { instance: true },
    });

    if (!taskInstance || taskInstance.instanceId !== instanceId) {
      throw ApiError.notFound("Task not found");
    }

    // Only instance owner or admin can set due dates
    const isOwner = taskInstance.instance.ownerId === user.id;
    const isAdmin = user.roles?.includes("admin");
    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden("Only the workflow owner or an admin can set due dates");
    }

    const updated = await prisma.taskInstance.update({
      where: { id: taskId },
      data: { dueDate: body.dueDate ? new Date(body.dueDate) : null },
      select: { id: true, dueDate: true },
    });

    return NextResponse.json(updated);
  },
});
