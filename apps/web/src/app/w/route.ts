import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUser } from "../../lib/auth/require-user";
import { AuthError } from "@tusker/core/lib/errors/auth-errors";
import { WorkspaceService } from "@tusker/core/server/services/workspace.service";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  // `redirect()` in requireUser throws NEXT_REDIRECT by design. Keep the auth
  // guard outside the workspace error boundary so that Next.js can handle it.
  const session = await requireUser();

  try {
    if (!session?.id) {
      return NextResponse.redirect(`${origin}/sign-in`);
    }

    const { workspaces } = await WorkspaceService.getWorkspaces(session.id);

    if (!workspaces?.length) {
      return NextResponse.redirect(`${origin}/create-workspace?noWorkspace=1`);
    }

    const firstId = workspaces[0].id;
    return NextResponse.redirect(`${origin}/w/${firstId}`);
  } catch (err: any) {
    if (err instanceof AuthError || err?.message === "missing_user_id") {
      return NextResponse.redirect(`${origin}/sign-in`);
    }

    console.error("workspace route error:", err);

    return NextResponse.redirect(`${origin}/`);
  }
}
