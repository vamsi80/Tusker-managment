import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { WorkspaceService } from "@/server/services/workspace.service";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  try {
    const reqHeaders = await headers();
    const cookieHeader = reqHeaders.get("cookie") ?? "";
    console.log("[/w] cookies present:", cookieHeader.replace(/=[^;]+/g, "=<redacted>"));
    console.log("[/w] VERCEL_URL:", process.env.VERCEL_URL ?? "unset");
    console.log("[/w] BETTER_AUTH_URL:", process.env.BETTER_AUTH_URL ?? "unset");

    const session = await auth.api.getSession({ headers: reqHeaders });
    console.log("[/w] session user id:", session?.user?.id ?? "null");

    if (!session?.user?.id) {
      return NextResponse.redirect(`${origin}/sign-in`);
    }

    const { workspaces } = await WorkspaceService.getWorkspaces(session.user.id);
    console.log("[/w] workspace count:", workspaces?.length ?? 0);

    if (!workspaces?.length) {
      return NextResponse.redirect(`${origin}/create-workspace?noWorkspace=1`);
    }

    return NextResponse.redirect(`${origin}/w/${workspaces[0].id}`);
  } catch (err: any) {
    console.error("[/w route] error:", err?.message ?? err);
    return NextResponse.redirect(`${origin}/sign-in`);
  }
}
