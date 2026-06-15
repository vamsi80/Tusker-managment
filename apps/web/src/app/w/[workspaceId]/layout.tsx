import { WorkspaceShell } from "../_components/sidebar/workspace-shell";
import { serverApiFetch } from "@/lib/api-client/server-fetch";
import type { WorkspaceLayoutData } from "@/types/workspace";

interface Props {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}

/**
 * Workspace Layout shell.
 *
 * The unified /layout payload is fetched HERE on the server (the RSC already holds the
 * session cookie) and handed to the shell as `initialData`, so the client hydrates the
 * Zustand store directly — eliminating the previous render→useEffect→fetch round-trip
 * (and its loading flash) on every workspace route. Falls back to the client-side fetch
 * (initialData = undefined) if the server fetch fails, preserving resilience.
 */
export default async function WorkSpaceLayout({ children, params }: Props) {
  const { workspaceId } = await params;

  const initialData = await serverApiFetch<{ success: boolean; data: WorkspaceLayoutData }>(
    `/workspaces/${workspaceId}/layout`,
  )
    .then((res) => res.data)
    .catch(() => undefined);

  return (
    <WorkspaceShell workspaceId={workspaceId} initialData={initialData}>
      {children}
    </WorkspaceShell>
  );
}
