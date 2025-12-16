import { NextRequest, NextResponse } from "next/server";
import { getSubTasks } from "@/data/task";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ workspaceId: string; slug: string }> }
) {
    try {
        const { workspaceId } = await params;
        const searchParams = request.nextUrl.searchParams;

        const parentTaskId = searchParams.get("parentTaskId");
        const projectId = searchParams.get("projectId");
        const page = parseInt(searchParams.get("page") || "1");
        const pageSize = parseInt(searchParams.get("pageSize") || "10");

        if (!parentTaskId || !projectId) {
            return NextResponse.json(
                { error: "Missing required parameters" },
                { status: 400 }
            );
        }

        const result = await getSubTasks(
            parentTaskId,
            workspaceId,
            projectId,
            page,
            pageSize
        );

        return NextResponse.json(result, {
            headers: {
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
            },
        });
    } catch (error) {
        console.error("Error fetching subtasks:", error);
        return NextResponse.json(
            { error: "Failed to fetch subtasks" },
            { status: 500 }
        );
    }
}
