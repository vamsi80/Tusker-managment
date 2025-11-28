import { getUserWorkspaces } from "../data/workspace/get-user-workspace";
import { redirect } from "next/navigation";

export default async function App() {
  const workspaces = await getUserWorkspaces();
  if (!workspaces?.workspaces?.length) {
    redirect("/create-workspace?noWorkspace=1");
  }
  return redirect(`/workspace/${workspaces.workspaces[0].workspaceId}`);
}
