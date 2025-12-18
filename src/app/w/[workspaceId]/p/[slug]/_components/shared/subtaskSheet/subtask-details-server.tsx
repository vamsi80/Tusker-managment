import { getTaskComments, getReviewComments } from "@/data/comments";
import { SubTaskDetailsSheet } from "./subtask-details-sheet";
import { FlatTaskType } from "@/data/task";
import { SubTaskType } from "@/data/task/get-project-tasks";
import { requireUser } from "@/lib/auth/require-user";

interface SubTaskDetailsServerProps {
    subTask: FlatTaskType | SubTaskType[number] | null;
    isOpen: boolean;
    disableUrlSync?: boolean;
}

/**
 * Server component wrapper that fetches comments using data layer
 * Passes initial data to client component to avoid client-side fetching on mount
 * 
 * Benefits:
 * - Pre-fetches data on server (faster initial load)
 * - Uses cached data layer functions
 * - Eliminates client-side POST requests
 * - Better SEO and performance
 */
export async function SubTaskDetailsServer({
    subTask,
    isOpen,
    disableUrlSync = false,
}: SubTaskDetailsServerProps) {
    // Early return if sheet is closed or no subtask
    if (!isOpen || !subTask) {
        return (
            <SubTaskDetailsSheet
                subTask={subTask}
                isOpen={isOpen}
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

        // Fetch data using data layer (direct DB access, cached, no POST)
        // Both functions use dual caching (React cache + Next.js cache)
        const [comments, reviewComments] = await Promise.all([
            getTaskComments(subTask.id),
            getReviewComments(subTask.id),
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
        console.error("Error fetching subtask details data:", error);

        // Fallback to client-side loading on error
        return (
            <SubTaskDetailsSheet
                subTask={subTask}
                isOpen={isOpen}
                disableUrlSync={disableUrlSync}
                initialComments={[]}
                initialReviewComments={[]}
                currentUserId={null}
            />
        );
    }
}
