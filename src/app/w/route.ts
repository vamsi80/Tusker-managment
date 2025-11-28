// src/app/(whatever)/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUser } from "../data/user/require-user";
import { getUserWorkspaces } from "../data/workspace/get-user-workspace";
import { AuthError } from "../data/user/errors";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  try {
    // requireUser must throw if not signed in
    const session = await requireUser();

    // defensive check (should not happen if requireUser is correct)
    if (!session?.id) return NextResponse.redirect(`${origin}/login`);

    // fetch user's workspaces (cached)
    const workspaces = await getUserWorkspaces(session.id);

    if (!workspaces?.workspaces?.length) {
      return NextResponse.redirect(`${origin}/create-workspace?noWorkspace=1`);
    }

    const firstId = workspaces.workspaces[0].workspaceId;
    return NextResponse.redirect(`${origin}/w/${firstId}`);
  } catch (err: any) {
    // Unauthenticated -> redirect to login
    if (err instanceof AuthError || err?.message === "missing_user_id") {
      return NextResponse.redirect(`${origin}/login`);
    }

    // Unexpected errors -> log and return 500 JSON (or redirect to a friendly error page)
    console.error("workspace route error:", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
