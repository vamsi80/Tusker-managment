import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/require-user";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

export async function GET(request: NextRequest) {
    const origin = new URL(request.url).origin;

    try {
        // getSession() wraps auth.api.getSession in a try/catch — safe against DB errors
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.redirect(`${origin}/sign-in`);
        }

        // serverApiFetch<T> returns T directly (not { data: T })
        const response = await serverApiFetch<{ success: boolean; data: { workspaces: { id: string }[] } }>(
            "/workspaces"
        );

        if (!response?.data?.workspaces?.length) {
            return NextResponse.redirect(`${origin}/create-workspace?noWorkspace=1`);
        }

        return NextResponse.redirect(`${origin}/w/${response.data.workspaces[0].id}`);
    } catch (err: any) {
        console.error("[/w route] error:", err?.message ?? err);
        return NextResponse.redirect(`${origin}/sign-in`);
    }
}
