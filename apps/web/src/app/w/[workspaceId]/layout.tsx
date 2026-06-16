import { WorkspaceShell } from "../_components/sidebar/workspace-shell";

interface Props {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}

/**
 * Workspace Layout shell.
 *
 * NOTE: Server-side hydration of the /layout payload (serverApiFetch -> initialData)
 * was reverted after it caused a production error-rate spike — it added an authenticated
 * server-to-server round-trip (RSC -> Worker, direct to the API domain) on every
 * workspace route, multiplying Worker invocations and per-request DB connections.
 * The client WorkspaceLayoutProvider already fetches the layout itself when
 * `initialData` is undefined, so the shell hydrates client-side (pre-deploy behavior).
 *
 * To re-enable SSR hydration safely, first make authenticated server-side fetches
 * reliable on the split web/API-domain setup (proxy the API under the web domain, or
 * share a parent cookie domain) and confirm the Worker can absorb the added load.
 * See plan: Phase 3.
 */
export default async function WorkSpaceLayout({ children, params }: Props) {
  const { workspaceId } = await params;

  return (
    <WorkspaceShell workspaceId={workspaceId}>
      {children}
    </WorkspaceShell>
  );
}
