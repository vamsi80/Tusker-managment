import { WorkspaceShell } from "../_components/sidebar/workspace-shell";

interface Props {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}

/**
 * Workspace Layout: Final Zero-Weight Structural Shell
 * Optimized for "Zero RSC Payload" - transferring only the ID, 
 * offloading all structural data and state hydration to the client bootstrap.
 */
export default async function WorkSpaceLayout({ children, params }: Props) {
  const { workspaceId } = await params;

  return (
    <WorkspaceShell workspaceId={workspaceId}>
      {children}
    </WorkspaceShell>
  );
}
