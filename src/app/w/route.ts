import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUser } from "../../data/user/require-user";
import { AuthError } from "../data/user/errors";
import { getUserWorkspaces } from "@/data/user/get-user-workspace";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  try {
    const session = await requireUser();

    if (!session?.id) {
      return NextResponse.redirect(`${origin}/login`);
    }

    const workspaces = await getUserWorkspaces(session.id);

    if (!workspaces?.workspaces?.length) {
      return NextResponse.redirect(`${origin}/create-workspace?noWorkspace=1`);
    }

    const firstId = workspaces.workspaces[0].workspaceId;
    return NextResponse.redirect(`${origin}/w/${firstId}`);
  } catch (err: any) {
    if (err instanceof AuthError || err?.message === "missing_user_id") {
      return NextResponse.redirect(`${origin}/login`);
    }

    console.error("workspace route error:", err);

    return NextResponse.redirect(`${origin}/`);
  }
}
