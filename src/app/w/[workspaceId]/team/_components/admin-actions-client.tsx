"use client";

import { InviteUserForm } from "./create-user";

interface AdminActionsClientProps {
  workspaceId: string;
  isAdmin: boolean;
}

/**
 * Client-side variant of AdminActions.
 * Only renders the invite form if isAdmin is true.
 */
export function AdminActionsClient({
  workspaceId,
  isAdmin,
}: AdminActionsClientProps) {
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <InviteUserForm workspaceId={workspaceId} isAdmin={true} />
    </div>
  );
}
