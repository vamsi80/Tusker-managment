import { NextResponse } from "next/server";
import { getSubTasksByParentIds } from "@/data/task/get-subtasks-batch";
import { getSession } from "@/lib/auth/require-user";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ taskId: string }> }
) {
    try {
        const { taskId } = await params;
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId");
        if (!workspaceId) {
            return new NextResponse("Missing workspaceId", { status: 400 });
        }

        const projectId = url.searchParams.get("projectId") || undefined;
        const viewMode = url.searchParams.get("viewMode") || "list";
        const pageSize = parseInt(url.searchParams.get("pageSize") || "30", 10);

        // Extract filters safely
        const filters: any = {};

        try {
            const statusStr = url.searchParams.get("status");
            if (statusStr) filters.status = JSON.parse(statusStr);

            const assigneeStr = url.searchParams.get("assigneeId");
            if (assigneeStr) filters.assigneeId = JSON.parse(assigneeStr);

            const tagStr = url.searchParams.get("tagId");
            if (tagStr) filters.tagId = JSON.parse(tagStr);
        } catch (e) {
            // Ignoring JSON parse errors
        }

        const search = url.searchParams.get("search");
        if (search) filters.search = search;

        const dueAfter = url.searchParams.get("dueAfter");
        if (dueAfter && dueAfter !== "undefined" && dueAfter !== "null") filters.dueAfter = new Date(dueAfter);

        const dueBefore = url.searchParams.get("dueBefore");
        if (dueBefore && dueBefore !== "undefined" && dueBefore !== "null") filters.dueBefore = new Date(dueBefore);

        const results = await getSubTasksByParentIds(
            [taskId],
            workspaceId,
            projectId,
            filters,
            pageSize,
            viewMode,
            session.user.id,
            true
        );

        const responsePayload = (results && results.length > 0) ? {
            success: true,
            subTasks: results[0].subTasks,
            totalCount: results[0].totalCount,
            hasMore: results[0].hasMore,
            nextCursor: results[0].nextCursor
        } : {
            success: true,
            subTasks: [],
            totalCount: 0,
            hasMore: false,
            nextCursor: null
        };

        return NextResponse.json(responsePayload);

    } catch (error) {
        console.error("Error in GET subtasks API:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
