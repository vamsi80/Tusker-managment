import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{
    workspaceId: string;
  }>;
}

/**
 * The vendors pages are client components, so this server layout is where the
 * Settings -> Permissions gate lives. It covers /vendors and everything nested
 * under it (detail, edit, new) in one place.
 */
export default async function VendorsLayout({ children, params }: LayoutProps) {
  const { workspaceId } = await params;
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  const permissions = await getWorkspacePermissions(workspaceId, user.id, true);
  if (!permissions.capabilities?.["vendors:view"]) {
    redirect(`/w/${workspaceId}`);
  }

  return <>{children}</>;
}
