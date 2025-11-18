
import { getUserWorkspaces } from "../data/workspace/get-user-workspace";
import { redirect } from "next/navigation";


export default async function AdminIndexPage() {
  const workspaces = await getUserWorkspaces();
  if (!workspaces.length) return redirect('/create-workspace');
  return redirect(`/workspace/${workspaces[0].slug}`);
}
