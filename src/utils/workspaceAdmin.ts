// utils/authorization.ts
import { requireUser } from "@/app/data/user/require-user";
import prisma from "@/lib/db";

export async function requireWorkspaceAdmin(workspaceId: string) {
  const user = await requireUser();
  const userId = user.id;
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
