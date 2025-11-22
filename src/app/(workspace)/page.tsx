import { getUserWorkspaces } from "../data/workspace/get-user-workspace";
import { redirect } from "next/navigation";

export default async function AdminIndexPage() {
  const workspaces = await getUserWorkspaces();
  if (!workspaces?.workspaces?.length) {
    redirect("/create-workspace?noWorkspace=1");
  }
  return redirect(`/${workspaces.workspaces[0].workspaceId}`);
}
