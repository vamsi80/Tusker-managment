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

export async function SubTaskDetailsServer({
    taskId,
    workspaceId,
    projectId,
    isOpen,
    disableUrlSync = false,
}: SubTaskDetailsServerProps) {
    // Early return is allowed (outside try/catch)
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

    let subTask = null;
    let comments: any[] = [];
    let reviewComments: any[] = [];
    let currentUserId: string | null = null;

    try {
        const user = await requireUser();

        subTask = await getTaskById(taskId, workspaceId, projectId);

        [comments, reviewComments] = await Promise.all([
            getTaskComments(taskId),
            getReviewComments(taskId),
        ]);

        currentUserId = user.id;
    } catch (error) {
        console.error("Error fetching subtask details:", error);
    }

    // ✅ SINGLE JSX RETURN — OUTSIDE try/catch
    return (
        <SubTaskDetailsSheet
            subTask={subTask}
            isOpen={isOpen}
            disableUrlSync={disableUrlSync}
            initialComments={comments}
            initialReviewComments={reviewComments}
            currentUserId={currentUserId}
        />
    );
}
