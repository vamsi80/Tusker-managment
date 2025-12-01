// /app/api/register-invite/route.ts (or a server action)

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";


export async function inviteUser({
  name, email, password, role, workspaceId
}: {
  name: string;
  email: string;
  password: string;

  role: "ADMIN" | "MEMBER" | "VIEWER";
  workspaceId: string;
}) {
  const result = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
      callbackURL: `/verify?workspaceId=${workspaceId}`
    }
  });

  if (result?.user?.id) {
    await prisma.workspaceMember.create({
      data: {
        userId: result.user.id,
        workspaceId,
        workspaceRole: role,
      }
    });
  }

  return result;
}
