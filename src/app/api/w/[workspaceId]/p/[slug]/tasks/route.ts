import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceTasks } from "@/data/task";

import { auth } from "@/lib/auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ workspaceId: string; slug: string }> }
) {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;
        const { workspaceId } = await params;
        const searchParams = request.nextUrl.searchParams;

        const projectId = searchParams.get("projectId");
        const cursorParam = searchParams.get("cursor");
        const cursor = cursorParam ? JSON.parse(cursorParam) : undefined;
        const pageSize = parseInt(searchParams.get("pageSize") || "20");

        if (!projectId) {
            return NextResponse.json(
                { error: "Missing projectId parameter" },
                { status: 400 }
            );
        }

        const result = await getWorkspaceTasks({
            workspaceId,
            projectId,
            hierarchyMode: "parents",
            cursor,
            limit: pageSize
        }, userId);

        return NextResponse.json(result, {
            headers: {
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
            },
        });
    } catch (error) {
        console.error("Error fetching parent tasks:", error);
        return NextResponse.json(
            { error: "Failed to fetch parent tasks" },
            { status: 500 }
        );
    }
}
