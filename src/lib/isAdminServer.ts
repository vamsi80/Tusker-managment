// src/app/data/workspace/is-admin-server.ts
import { requireUser } from "@/app/data/user/require-user";
import { getUserWorkspaces } from "@/app/data/workspace/get-user-workspace";

export async function isAdminServer(workspaceId: string): Promise<boolean> {
  const sessionUser = await requireUser(); // will throw if unauthenticated
  const data = await getUserWorkspaces(sessionUser.id);
  const ws = data.workspaces.find((w) => w.workspaceId === workspaceId);
  return ws?.workspaceRole === "ADMIN";
}
