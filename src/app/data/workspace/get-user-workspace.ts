import { cache } from "react";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { requireUser } from "../user/require-user";

export const getUserWorkspaces = cache(async () => {
  const session = await requireUser();

  const data = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      workspaces: {
        select: {
          workspaceId: true,
          accessLevel: true,
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
            }
          }
        }
      }
    }
  });

  if (!data) {
    return notFound();
  }
  return data;
});
