"use server";

import { requireUser } from "@/lib/auth/require-user";
import { getReviewComments } from "@/data/comments";

interface FetchReviewCommentsResult {
    success: boolean;
    error?: string;
    reviewComments?: any[];
}

/**
 * Server action to fetch review comments for a subtask
 * This is a wrapper around the data layer function for client components
 * 
 * @param subTaskId - ID of the subtask to fetch review comments for
 */
export async function fetchReviewCommentsAction(
    subTaskId: string
): Promise<FetchReviewCommentsResult> {
    try {
        // 1. Authenticate user
        const user = await requireUser();

        // 2. Use centralized data fetching with caching
        const reviewComments = await getReviewComments(subTaskId);

        return {
            success: true,
            reviewComments,
        };
    } catch (error) {
        console.error("Error fetching review comments:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch review comments",
        };
    }
}
