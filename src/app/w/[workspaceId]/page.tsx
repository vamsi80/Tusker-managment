// app/w/[workspaceId]/page.tsx
import React from "react";
import { notFound } from "next/navigation";

// Adjust these imports if your project paths differ.
// I use absolute imports assuming you put the data helpers under src/app/data/...
import { getUserWorkspaces } from "@/app/data/workspace/get-user-workspace";
import { requireUser } from "@/app/data/user/require-user";
import { getWorkspacesProjectsByWorkspaceId } from "@/app/data/workspace/get-workspace-members";

type Props = {
  params: { workspaceId: string };
};

export default async function WorkSpacePage({ params }: Props) {
  const { workspaceId } = await params;

  // 1) Load the user's workspaces (this helper is expected to use requireUser internally)
  // If your getUserWorkspaces requires a userId param instead, adapt this call accordingly.
  const session = await requireUser();
  const userWorkspaces = await getUserWorkspaces(session.id);

  // Defensive: if no workspaces at all — treat as not found (or redirect elsewhere if you want)
  if (!userWorkspaces?.workspaces?.length) {
    return notFound();
  }

  // 2) Ensure the requested workspaceId belongs to the current user
  const matched = userWorkspaces.workspaces.find((w) => w.workspaceId === workspaceId);
  if (!matched) {
    // user is not a member of the requested workspace
    return notFound();
  }

  // 3) Fetch members + projects for this workspace
  const workspaceData = await getWorkspacesProjectsByWorkspaceId(workspaceId);

  // 4) Render: simple header + preformatted JSON for quick inspection.
  // You can replace the <pre> with nicer UI later.
  return (
    <main style={{ padding: 24 }}>
      <h1>Workspace: {matched.workspace?.name ?? workspaceId}</h1>

      <section style={{ marginTop: 20 }}>
        <h2>Workspace (raw)</h2>
        <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f8", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(
            {
              currentWorkspace: matched,
              userWorkspaces: userWorkspaces.workspaces,
              workspaceData, // contains workspaceMembers and projects
            },
            null,
            2
          )}
        </pre>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Projects</h2>
        <ul>
          {workspaceData.projects.map((p: any) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Members</h2>
        <ul>
          {workspaceData.workspaceMembers.map((m: any) => (
            <li key={m.id}>
              {m.user?.name ?? m.user?.email ?? m.userId}{" "}
              <span style={{ color: "#666" }}>{m.projectAccess?.length ? `• access: ${m.projectAccess.length}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
