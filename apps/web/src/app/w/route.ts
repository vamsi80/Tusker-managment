import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

export async function GET(request: NextRequest) {
    const origin = new URL(request.url).origin;

    try {
        const reqHeaders = await headers();
        const session = await auth.api.getSession({ headers: reqHeaders });

        if (!session?.user?.id) {
            return NextResponse.redirect(`${origin}/sign-in`);
        }

        const { data } = await serverApiFetch<{ success: boolean; data: { workspaces: { id: string }[] } }>(
            "/workspaces"
        );

        if (!data?.workspaces?.length) {
            return NextResponse.redirect(`${origin}/create-workspace?noWorkspace=1`);
        }

        return NextResponse.redirect(`${origin}/w/${data.workspaces[0].id}`);
    } catch (err: any) {
        console.error("[/w route] error:", err?.message ?? err);
        return NextResponse.redirect(`${origin}/sign-in`);
    }
}
