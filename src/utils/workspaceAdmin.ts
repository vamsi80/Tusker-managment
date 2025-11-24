// utils/authorization.ts
import prisma from "@/lib/db";

export async function requireWorkspaceAdmin(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });

  if (!member) {
    throw new Error("Access denied: not a workspace member");
  }

  if (member.accessLevel !== "ADMIN") {
    throw new Error("Access denied: admin role required");
  }

  return member;
}
