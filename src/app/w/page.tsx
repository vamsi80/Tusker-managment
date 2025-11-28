import { requireUser } from "../data/user/require-user";
import { getUserWorkspaces } from "../data/workspace/get-user-workspace";
import { redirect } from "next/navigation";

export default async function App() {
  await requireUser();
  const workspaces = await getUserWorkspaces();
  if (!workspaces?.workspaces?.length) {
    redirect("/create-workspace?noWorkspace=1");
  }
  return redirect(`/w/${workspaces.workspaces[0].workspaceId}`);
}
