import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAdminAuth, ApiError } from "@/lib/api-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// DELETE /api/projects/[id]/contacts/[contactId] - Unlink contact from project (admin only)
export const DELETE = withAdminAuth({
  handler: async (request, { params }) => {
    const ip = getClientIp(request);
    if (!rateLimit(ip, "write")) throw ApiError.tooManyRequests();

    const projectContact = await prisma.projectContact.findUnique({
      where: { projectId_contactId: { projectId: params.id, contactId: params.contactId } },
    });

    if (!projectContact) throw ApiError.notFound("Contact is not linked to this project");

    await prisma.projectContact.delete({
      where: { id: projectContact.id },
    });

    return NextResponse.json({ success: true });
  },
});
