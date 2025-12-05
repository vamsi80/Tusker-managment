import { TaskHeaderSkeleton, TaskTableSkeleton } from "./_components/task-page-skeleton";
import { TaskPageWrapper } from "./_components/task-page-wrapper";

/**
 * Loading UI for the Task Page
 * 
 * This file is automatically used by Next.js during navigation.
 * When a user clicks a link to this page, this loading UI shows INSTANTLY
 * while the actual page content loads in the background.
 * 
 * Result: Navigation feels instant, no blank screen!
 */
export default function TaskPageLoading() {
    return (
        <TaskPageWrapper>
            {/* Header skeleton */}
            <TaskHeaderSkeleton />

            {/* Table skeleton */}
            <div>
                <TaskTableSkeleton />
            </div>
        </TaskPageWrapper>
    );
}
