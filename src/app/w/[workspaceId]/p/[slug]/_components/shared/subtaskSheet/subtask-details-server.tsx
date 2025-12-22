import { getTaskById } from "@/data/task/get-task-by-id";
import { getTaskComments, getReviewComments } from "@/data/comments";
import { SubTaskDetailsSheet } from "./subtask-details-sheet";
import { requireUser } from "@/lib/auth/require-user";

interface SubTaskDetailsServerProps {
    taskId: string;
    workspaceId: string;
    projectId: string;
    isOpen: boolean;
    disableUrlSync?: boolean;
}

/**
 * Server component wrapper that fetches subtask data and comments by ID
 * 
 * Benefits:
 * - Always fetches fresh data from database
 * - Simpler API - just pass task ID
 * - Leverages data layer caching (60s cache)
 * - Pre-fetches comments for instant display
 * - Better performance with dual caching
 * 
 * @param taskId - ID of the subtask to display
 * @param workspaceId - Workspace ID for permission check
 * @param projectId - Project ID for permission check
 * @param isOpen - Whether the sheet is open
 * @param disableUrlSync - Whether to disable URL synchronization
 */
export async function SubTaskDetailsServer({
    taskId,
    workspaceId,
    projectId,
    isOpen,
    disableUrlSync = false,
}: SubTaskDetailsServerProps) {
    // Early return if sheet is closed
    if (!isOpen) {
        return (
            <SubTaskDetailsSheet
                subTask={null}
                isOpen={false}
                disableUrlSync={disableUrlSync}
                initialComments={[]}
                initialReviewComments={[]}
                currentUserId={null}
            />
        );
    }

    try {
        // Get current user
        const user = await requireUser();

        // Fetch subtask data using cached data layer function
        // This includes role-based access control
        const subTask = await getTaskById(taskId, workspaceId, projectId);

        // Fetch comments and review comments in parallel
        // Both functions use dual caching (React cache + Next.js cache)
        const [comments, reviewComments] = await Promise.all([
            getTaskComments(taskId),
            getReviewComments(taskId),
        ]);

        return (
            <SubTaskDetailsSheet
                subTask={subTask}
                isOpen={isOpen}
                disableUrlSync={disableUrlSync}
                initialComments={comments}
                initialReviewComments={reviewComments}
                currentUserId={user.id}
            />
        );
    } catch (error) {
        console.error("Error fetching subtask details:", error);

        // Fallback to client-side loading on error
        return (
            <SubTaskDetailsSheet
                subTask={null}
                isOpen={isOpen}
                disableUrlSync={disableUrlSync}
                initialComments={[]}
                initialReviewComments={[]}
                currentUserId={null}
            />
        );
    }
}
