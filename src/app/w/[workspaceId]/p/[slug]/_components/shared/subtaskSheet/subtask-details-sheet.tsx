"use client";

import { toast } from "sonner";
import { TaskByIdType } from "@/data/task/get-task-by-id";
import { useSearchParams, usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import { fetchCommentsAction, fetchReviewCommentsAction } from "@/actions/comment";

// Import modular components
import { SubtaskSheetHeader } from "./subtask-sheet-header";
import { SubtaskSheetNavBar } from "./subtask-sheet-navbar";
import dynamic from "next/dynamic";
const MessagesTab = dynamic(() => import("./messages-tab").then(mod => mod.MessagesTab), { ssr: false });
const ReviewTab = dynamic(() => import("./review-tab").then(mod => mod.ReviewTab), { ssr: false });

interface SubTaskDetailsSheetProps {
    subTask: TaskByIdType | null;
    isOpen: boolean;
    onClose?: () => void;
    disableUrlSync?: boolean;
    // Pre-fetched data from server component
    initialComments?: any[];
    initialReviewComments?: any[];
    currentUserId?: string | null;
}

interface Comment {
    id: string;
    content: string;
    userId: string;
    taskId: string;
    user: {
        id: string;
        surname: string;
    };
    isEdited: boolean;
    editedAt: Date;
    isDeleted: boolean;
    deletedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    replies?: Comment[];
}

interface ReviewComment {
    id: string;
    text: string;
    attachment: {
        fileName?: string;
        fileType?: string;
        fileSize?: number;
        url?: string;
        previousStatus?: string;
        targetStatus?: string;
    } | null;
    author: {
        id: string;
        name: string;
        surname: string;
        image: string;
    };
    createdAt: Date;
}

// Client-side cache for instant re-opening
export const commentCache = new Map<string, any[]>();
export const reviewCommentCache = new Map<string, any[]>();
export const pendingPrefetches = new Set<string>(); // LOCK: Prevents redundant DB queries

/**
 * Checks if a subtask is in the cache. 
 */
export function prefetchSubTask(taskId: string) {
    // We only log if it's already there, no DB trigger.
    if (commentCache.has(taskId)) {
        console.log(`📡 [CACHE-HIT] Task ${taskId} is ready in local memory.`);
    }
}

/**
 * Subtask Details Sheet Component (Refactored)
 */
export function SubTaskDetailsSheet({
    subTask,
    isOpen,
    onClose = () => { },
    disableUrlSync = false,
    initialComments = [],
    initialReviewComments = [],
    currentUserId: initialCurrentUserId = null,
}: SubTaskDetailsSheetProps) {
    const [activeTab, setActiveTab] = useState<"messages" | "review">("messages");
    const [comments, setComments] = useState<Comment[]>([]);
    const [reviewComments, setReviewComments] = useState<ReviewComment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingReview, setIsLoadingReview] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(initialCurrentUserId);

    const pathname = usePathname();
    const searchParams = useSearchParams();

    const loadedSubTaskIdRef = useRef<string>("");
    const reviewCommentsLoadedRef = useRef<boolean>(false);

    // Initial cache sync
    useEffect(() => {
        if (subTask) {
            const hasCache = commentCache.has(subTask.id);
            if (hasCache) {
                console.log(`✨ [MAGIC] Instant load for ${subTask.name} (Hit Pre-fetch Cache)`);
                setComments(commentCache.get(subTask.id)!);
            } else {
                setComments(initialComments as Comment[]);
            }

            if (reviewCommentCache.has(subTask.id)) {
                setReviewComments(reviewCommentCache.get(subTask.id)!);
            } else {
                setReviewComments(initialReviewComments as ReviewComment[]);
            }
        }
    }, [subTask?.id]);

    // Performance tracking
    const mountTimeRef = useRef<number>(0);

    useEffect(() => {
        if (isOpen) {
            mountTimeRef.current = performance.now();
            if (typeof window !== 'undefined' && (window as any).lastSheetOpenClick) {
                const totalDelay = mountTimeRef.current - (window as any).lastSheetOpenClick;
                console.log(`⏱️ Subtask Sheet visible in: ${totalDelay.toFixed(2)}ms`);
            }
        }
    }, [isOpen]);

    // URL synchronization is now handled globally via context hooks
    // to ensure consistency across all opening/closing methods.

    const loadComments = useCallback(async () => {
        if (!subTask) return;

        if (pendingPrefetches.has(`comments-${subTask.id}`)) return;

        // SKIP IF ACCESSED FROM PRE-FETCH CACHE
        if (commentCache.has(subTask.id)) {
            return; // Already have data, don't re-fetch immediately (even if empty)
        }

        pendingPrefetches.add(`comments-${subTask.id}`);
        setIsLoading(true);
        const startTime = performance.now();
        try {
            const result = await fetchCommentsAction(subTask.id);
            if (result.success && result.comments) {
                const fetchedComments = result.comments as Comment[];
                setComments(fetchedComments);
                commentCache.set(subTask.id, fetchedComments); // Update cache
                if (result.currentUserId) {
                    setCurrentUserId(result.currentUserId);
                }
                const duration = performance.now() - startTime;
                console.log(`🐢 [SLOW LOAD] Comments fetched in: ${duration.toFixed(2)}ms (Missing Pre-fetch)`);
            } else {
                toast.error(result.error || "Failed to load comments");
            }
        } catch (error) {
            console.error("Error loading comments:", error);
            toast.error("Failed to load comments");
        } finally {
            setIsLoading(false);
            pendingPrefetches.delete(`comments-${subTask.id}`);
        }
    }, [subTask?.id]);

    const loadReviewComments = useCallback(async () => {
        if (!subTask) return;

        if (pendingPrefetches.has(`reviews-${subTask.id}`)) return;
        pendingPrefetches.add(`reviews-${subTask.id}`);
        setIsLoadingReview(true);
        try {
            const result = await fetchReviewCommentsAction(subTask.id);
            if (result.success && result.reviewComments) {
                const fetchedReviewComments = result.reviewComments as ReviewComment[];
                setReviewComments(fetchedReviewComments);
                reviewCommentCache.set(subTask.id, fetchedReviewComments); // Update cache
            } else {
                toast.error(result.error || "Failed to load review comments");
            }
        } catch (error) {
            console.error("Error loading review comments:", error);
            toast.error("Failed to load review comments");
        } finally {
            setIsLoadingReview(false);
            pendingPrefetches.delete(`reviews-${subTask.id}`);
        }
    }, [subTask?.id]);

    // Fetch comments when subtask changes or sheet opens
    useEffect(() => {
        if (subTask && isOpen && loadedSubTaskIdRef.current !== subTask.id) {
            loadedSubTaskIdRef.current = subTask.id;
            loadComments();
        }

        // Reset when sheet closes
        if (!isOpen) {
            loadedSubTaskIdRef.current = "";
        }
    }, [subTask?.id, isOpen, loadComments]);

    // Load review comments when switching to review tab
    useEffect(() => {
        if (activeTab === "review" && subTask && !reviewCommentsLoadedRef.current && !isLoadingReview) {
            reviewCommentsLoadedRef.current = true;
            loadReviewComments();
        }

        // Reset when subtask changes
        if (subTask?.id !== loadedSubTaskIdRef.current) {
            reviewCommentsLoadedRef.current = false;
        }
    }, [activeTab, subTask?.id, isLoadingReview, loadReviewComments]);

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-background border-l">
                {subTask ? (
                    <>
                        <SheetTitle className="sr-only">{subTask.name}</SheetTitle>
                        <SheetDescription className="sr-only">
                            Details and activity for subtask {subTask.name}
                        </SheetDescription>
                        {/* Header Component */}
                        <SubtaskSheetHeader subTask={subTask} />

                        {/* Tabbed Section - Takes Remaining Space */}
                        <div className="border-t flex-1 flex flex-col min-h-0">
                            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "messages" | "review")} className="flex flex-col h-full">
                                {/* Navigation Bar Component */}
                                <SubtaskSheetNavBar
                                    activeTab={activeTab}
                                    onTabChange={setActiveTab}
                                    messagesCount={comments.length}
                                    reviewCount={reviewComments.length}
                                />

                                {/* Tab Content */}
                                {activeTab === "messages" && (
                                    <MessagesTab
                                        taskId={subTask.id}
                                        comments={comments}
                                        setComments={setComments}
                                        currentUserId={currentUserId}
                                        isLoading={isLoading}
                                    />
                                )}

                                {activeTab === "review" && (
                                    <ReviewTab
                                        reviewComments={reviewComments}
                                        isLoadingReview={isLoadingReview}
                                    />
                                )}
                            </Tabs>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col h-full items-center justify-center p-8 space-y-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        <span className="text-sm text-muted-foreground">Preparing subtask...</span>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
