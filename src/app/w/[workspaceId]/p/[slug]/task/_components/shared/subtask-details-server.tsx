"use server";
import { getTaskComments, getReviewComments } from "@/data/comments";
import { SubTaskDetailsSheet } from "./subtask-details-sheet";
import { FlatTaskType } from "@/data/task";
import { SubTaskType } from "@/app/data/task/get-project-tasks";

interface SubTaskDetailsServerProps {
    subTask: FlatTaskType | SubTaskType[number];
    isOpen: boolean;
    onClose: () => void;
    disableUrlSync?: boolean;
}

/**
 * Server component wrapper that fetches comments using data layer
 * Passes initial data to client component to avoid POST requests on mount
 */
export async function SubTaskDetailsServer({
    subTask,
    isOpen,
    onClose,
    disableUrlSync = false,
}: SubTaskDetailsServerProps) {
    if (!isOpen || !subTask) {
        return (
            <SubTaskDetailsSheet
                subTask={subTask}
                isOpen={isOpen}
                onClose={onClose}
                disableUrlSync={disableUrlSync}
                initialComments={[]}
                initialReviewComments={[]}
                currentUserId={null}
            />
        );
    }

    // Fetch data using data layer (direct DB access, cached, no POST)
    const [comments, reviewComments] = await Promise.all([
        getTaskComments(subTask.id),
        getReviewComments(subTask.id),
    ]);

    // Get current user ID
    const { auth } = await import("@/lib/auth");
    const { headers } = await import("next/headers");
    const session = await auth.api.getSession({ headers: await headers() });
    const currentUserId = session?.user?.id || null;

    return (
        <SubTaskDetailsSheet
            subTask={subTask}
            isOpen={isOpen}
            onClose={onClose}
            disableUrlSync={disableUrlSync}
            initialComments={comments}
            initialReviewComments={reviewComments}
            currentUserId={currentUserId}
        />
    );
}
