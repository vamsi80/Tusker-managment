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
import { MessagesTab } from "./messages-tab";
import { ReviewTab } from "./review-tab";

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
        name: string;
        surname: string;
        email: string;
        image: string;
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
        fileName: string;
        fileType: string;
        fileSize: number;
        url: string;
    } | null;
    author: {
        id: string;
        user: {
            name: string;
            surname: string;
            image: string;
        };
    };
    createdAt: Date;
}

/**
 * Subtask Details Sheet Component (Refactored)
 * 
 * Modular architecture with separate components:
 * - SubtaskSheetHeader: Task details and info
 * - SubtaskSheetNavBar: Tab navigation
 * - MessagesTab: Comments section
 * - ReviewTab: Review comments section
 * 
 * Can be used with server wrapper (SubTaskDetailsServer) for pre-fetched data
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
    const [comments, setComments] = useState<Comment[]>(initialComments as Comment[]);
    const [reviewComments, setReviewComments] = useState<ReviewComment[]>(initialReviewComments as ReviewComment[]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingReview, setIsLoadingReview] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(initialCurrentUserId);

    const pathname = usePathname();
    const searchParams = useSearchParams();

    const loadedSubTaskIdRef = useRef<string>("");
    const reviewCommentsLoadedRef = useRef<boolean>(false);

    // URL synchronization
    useEffect(() => {
        if (disableUrlSync) return;

        if (isOpen && subTask) {
            const params = new URLSearchParams(searchParams.toString());
            const subtaskIdentifier = subTask.taskSlug || subTask.id;
            params.set('subtask', subtaskIdentifier);
            const newUrl = `${pathname}?${params.toString()}`;
            window.history.pushState(null, '', newUrl);
        } else if (!isOpen) {
            const params = new URLSearchParams(searchParams.toString());
            if (params.has('subtask')) {
                params.delete('subtask');
                const newUrl = params.toString()
                    ? `${pathname}?${params.toString()}`
                    : pathname;
                window.history.pushState(null, '', newUrl);
            }
        }
    }, [isOpen, subTask, pathname, searchParams, disableUrlSync]);

    const loadComments = useCallback(async () => {
        if (!subTask) return;

        // Defer load slightly to prioritize animation
        setTimeout(async () => {
            setIsLoading(true);
            try {
                const result = await fetchCommentsAction(subTask.id);
                if (result.success && result.comments) {
                    setComments(result.comments as Comment[]);
                    if (result.currentUserId) {
                        setCurrentUserId(result.currentUserId);
                    }
                } else {
                    toast.error(result.error || "Failed to load comments");
                }
            } catch (error) {
                console.error("Error loading comments:", error);
                toast.error("Failed to load comments");
            } finally {
                setIsLoading(false);
            }
        }, 300);
    }, [subTask]);

    const loadReviewComments = useCallback(async () => {
        if (!subTask) return;

        setTimeout(async () => {
            setIsLoadingReview(true);
            try {
                const result = await fetchReviewCommentsAction(subTask.id);
                if (result.success && result.reviewComments) {
                    setReviewComments(result.reviewComments as ReviewComment[]);
                } else {
                    toast.error(result.error || "Failed to load review comments");
                }
            } catch (error) {
                console.error("Error loading review comments:", error);
                toast.error("Failed to load review comments");
            } finally {
                setIsLoadingReview(false);
            }
        }, 100);
    }, [subTask]);

    // Fetch comments when subtask changes or sheet opens
    useEffect(() => {
        if (subTask && isOpen && loadedSubTaskIdRef.current !== subTask.id) {
            loadedSubTaskIdRef.current = subTask.id;
            // Only load if no initial data provided
            if (initialComments.length === 0) {
                loadComments();
            }
        }

        // Reset when sheet closes
        if (!isOpen) {
            loadedSubTaskIdRef.current = "";
        }
    }, [subTask?.id, isOpen, loadComments, initialComments.length]);

    // Load review comments when switching to review tab
    useEffect(() => {
        if (activeTab === "review" && subTask && !reviewCommentsLoadedRef.current && !isLoadingReview) {
            // Only load if no initial data provided
            if (initialReviewComments.length === 0) {
                reviewCommentsLoadedRef.current = true;
                loadReviewComments();
            } else {
                reviewCommentsLoadedRef.current = true;
            }
        }

        // Reset when subtask changes
        if (subTask?.id !== loadedSubTaskIdRef.current) {
            reviewCommentsLoadedRef.current = false;
        }
    }, [activeTab, subTask?.id, isLoadingReview, initialReviewComments.length, loadReviewComments]);

    if (!subTask) return null;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col h-full">
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

                        {/* Tab Content - Only render active tab to save mount time */}
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
            </SheetContent>
        </Sheet>
    );
}
