import { auth } from "./auth";
import { NextResponse } from "next/server";
import { prisma } from "./db";

export async function getAuthUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session.user;
}

export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// ---------------------------------------------------------------------------
// Instance-level authorization
// A user can access an instance if they are:
//   1. The owner (created the instance)
//   2. Assigned to any task (current or historical) on this instance
//   3. An admin
// ---------------------------------------------------------------------------
export async function canAccessInstance(
  userId: string,
  instanceId: string,
  userRoles: string[],
): Promise<boolean> {
  if (userRoles.includes("admin")) return true;

  const instance = await prisma.workflowInstance.findFirst({
    where: {
      id: instanceId,
      OR: [
        { ownerId: userId },
        { taskInstances: { some: { assigneeId: userId } } },
      ],
    },
    select: { id: true },
  });

  return instance !== null;
}

// ---------------------------------------------------------------------------
// Task-level authorization
// A user can act on a task if they are the assignee or an admin.
// Returns the task if authorized, throws if not.
// ---------------------------------------------------------------------------
export async function authorizeTaskAction(
  userId: string,
  taskId: string,
  instanceId: string,
  userRoles: string[],
): Promise<{ assigneeId: string | null; instanceId: string }> {
  const task = await prisma.taskInstance.findUnique({
    where: { id: taskId },
    select: { assigneeId: true, instanceId: true },
  });

  if (!task || task.instanceId !== instanceId) {
    throw new Error("TASK_NOT_FOUND");
  }

  if (task.assigneeId !== userId && !userRoles.includes("admin")) {
    throw new Error("TASK_FORBIDDEN");
  }

  return task;
}
