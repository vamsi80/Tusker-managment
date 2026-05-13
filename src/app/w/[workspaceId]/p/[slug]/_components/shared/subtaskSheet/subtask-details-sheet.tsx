"use client";

import { toast } from "sonner";
import { Tabs } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback, Suspense, useMemo } from "react";
import type { TaskByIdType } from "@/server/services/task/tasks.service";
import { SheetTitle, SheetDescription } from "@/components/ui/sheet";

import { projectsClient } from "@/lib/api-client/projects";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { SubtaskSheetHeader } from "./subtask-sheet-header";
import { SubtaskSheetNavBar } from "./subtask-sheet-navbar";
import { ProjectMembersType } from "@/types/project";
import dynamic from "next/dynamic";
const MessagesTab = dynamic(() => import("./messages-tab").then(mod => mod.MessagesTab), {
    ssr: false,
    loading: () => (
        <div className="flex-1 p-4 space-y-4">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex w-full justify-start">
                    <div className="h-16 w-full max-w-[70%] bg-muted animate-pulse rounded-lg" />
                </div>
            ))}
        </div>
    )
});
const ActivityTab = dynamic(() => import("./activity-tab").then(mod => mod.ActivityTab), {
    ssr: false,
    loading: () => (
        <div className="flex-1 p-4 space-y-4">
            {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 w-full bg-muted animate-pulse rounded-lg" />
            ))}
        </div>
    )
});

interface SubTaskDetailsSheetProps {
    subTask: TaskByIdType | null;
    isOpen: boolean;
    onClose?: () => void;
    disableUrlSync?: boolean;
    initialComments?: any[];
    initialActivities?: any[];
    currentUserId?: string | null;
    onSubTaskAssigned?: (subTaskId: string, updatedData: any) => void;
    isAdmin?: boolean;
    isProjectManager?: boolean;
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

interface Activity {
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
        surname: string;
    };
    createdAt: Date;
}

// 🚀 Global Cache for "Magic Instant Load"
const PREFETCH_CACHE: Record<string, { data: any, timestamp: number }> = {};
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

/**
 * Prefetches subtask data (comments/activity) to make the sheet load instantly
 */
export const prefetchSubTask = async (taskId: string) => {
    if (!taskId || PREFETCH_CACHE[taskId]) return;

    try {
        // We only prefetch comments and activity for now as they are the heaviest
        const [comments, activities] = await Promise.all([
            apiClient.comments.getComments(taskId),
            apiClient.comments.getActivities(taskId)
        ]);

        PREFETCH_CACHE[taskId] = {
            data: { comments: comments.data, activities: activities.data },
            timestamp: Date.now()
        };
    } catch (e) {
        console.error("Prefetch failed for:", taskId);
    }
};

/**
 * Subtask Details Sheet Component (Refactored)
 */
export function SubTaskDetailsSheet({
    subTask,
    isOpen,
    onClose = () => { },
    disableUrlSync = false,
    initialComments = [],
    initialActivities = [],
    currentUserId: initialCurrentUserId = null,
    onSubTaskAssigned,
    isAdmin = false,
    isProjectManager = false,
}: SubTaskDetailsSheetProps) {
    // Check prefetch cache on mount
    const cachedData = useMemo(() => {
        if (!subTask?.id) return null;
        const cached = PREFETCH_CACHE[subTask.id];
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            console.log(`✨ [MAGIC] Instant load for ${subTask.name} (Hit Pre-fetch Cache)`);
            return cached.data;
        }
        return null;
    }, [subTask?.id, subTask?.name]);

    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    // 🚀 Optimized Initial Tab: Prevent flash of default tab
    const getInitialTab = () => {
        if (disableUrlSync) return "messages";
        const urlTab = searchParams.get("tab");
        return urlTab === "activity" ? "review" : "messages";
    };

    const [activeTab, setActiveTab] = useState<"messages" | "review">(getInitialTab);

    const handleTabChange = useCallback((newTab: "messages" | "review") => {
        setActiveTab(newTab);
        if (!disableUrlSync) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", newTab === "review" ? "activity" : "messages");
            // 🚀 CRITICAL FIX: Use native replaceState instead of router.replace
            // router.replace forces Next.js to re-render the Server Components, which resets 
            // the initialTasks prop and collapses all parent/project rows in the table.
            window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
        }
    }, [disableUrlSync, searchParams, pathname]);
    const [comments, setComments] = useState<Comment[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingActivity, setIsLoadingActivity] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(initialCurrentUserId);
    const [members, setMembers] = useState<ProjectMembersType>([]);
    const [tags, setTags] = useState<{ id: string; name: string }[]>([]);

    // Rely on the subTask prop as the source of truth
    const task = subTask;

    // Remove redundant pathname/searchParams hooks since they are moved up


    const loadedSubTaskIdRef = useRef<string>("");
    const activitiesLoadedAtRef = useRef<number>(0);

    // URL synchronization disabled as per user request.

    // Set initial states
    useEffect(() => {
        if (subTask) {
            if (cachedData) {
                setComments(cachedData.comments || []);
                setActivities(cachedData.activities || []);
            } else {
                setComments(initialComments as Comment[]);
                setActivities(initialActivities as Activity[]);
            }
        }
    }, [subTask?.id, isOpen, cachedData]);

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

    // 🏷️ Metadata Hydration: Fetch project members and tags when the sheet opens
    // This solves the issue where workspace-level edits show incorrect assignees
    // or empty tags because the parent context (GlobalSubTaskSheet) is stateless.
    useEffect(() => {
        if (!isOpen || !task?.projectId) return;

        let mounted = true;

        // Determine workspaceId from the path or the task
        const workspaceIdMatch = pathname.match(/\/w\/([^\/]+)/);
        const workspaceId = workspaceIdMatch ? workspaceIdMatch[1] : (task as any).workspaceId;
        if (!workspaceId) return;

        const fetchMetadata = async () => {
            try {
                const [projectMembers, workspaceTags] = await Promise.all([
                    projectsClient.getMembers(task.projectId),
                    workspacesClient.getTags(workspaceId)
                ]);

                if (mounted) {
                    const mappedTags = workspaceTags.map(t => ({ id: t.id, name: t.name }));

                    // Update states
                    setMembers(projectMembers);
                    setTags(mappedTags);
                }
            } catch (error) {
                console.error("Failed to fetch subtask metadata:", error);
            }
        };

        fetchMetadata();
        return () => { mounted = false; };
    }, [isOpen, task?.projectId, pathname]);

    const handleSubTaskUpdated = useCallback((updatedData: Partial<TaskByIdType>) => {
        if (task?.id && onSubTaskAssigned) {
            onSubTaskAssigned(task.id, updatedData);
        }
    }, [task?.id, onSubTaskAssigned]);

    // URL synchronization is now handled globally via context hooks
    // to ensure consistency across all opening/closing methods.

    const loadComments = useCallback(async () => {
        if (!subTask) return;

        setIsLoading(true);
        try {
            const { data, error } = await apiClient.comments.getComments(subTask.id);
            if (!error && data) {
                const fetchedComments = data as Comment[];
                setComments(fetchedComments);

                // Note: currentUserId might need to be handled differently if not in the response
                // but usually the session hook handles this.
            } else {
                toast.error(error?.message || "Failed to load comments");
            }
        } catch (error) {
            console.error("Error loading comments:", error);
            toast.error("Failed to load comments");
        } finally {
            setIsLoading(false);
        }
    }, [subTask?.id]);

    const loadActivities = useCallback(async () => {
        if (!subTask) return;

        setIsLoadingActivity(true);
        try {
            const { data, error } = await apiClient.comments.getActivities(subTask.id);
            if (!error && data) {
                const fetchedActivities = data as Activity[];
                setActivities(fetchedActivities);
            } else {
                toast.error(error?.message || "Failed to load activities");
            }
        } catch (error) {
            console.error("Error loading activities:", error);
            toast.error("Failed to load activities");
        } finally {
            setIsLoadingActivity(false);
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

    // Load activities when switching to activity tab
    useEffect(() => {
        if (activeTab === "review" && subTask && !isLoadingActivity) {
            const lastUpdated = subTask.updatedAt ? new Date(subTask.updatedAt).getTime() : 0;

            // Re-fetch ONLY if we haven't loaded yet OR if the task was updated since we last loaded
            if (activitiesLoadedAtRef.current < lastUpdated || activitiesLoadedAtRef.current === 0) {
                activitiesLoadedAtRef.current = Date.now();
                loadActivities();
            }
        }

        // Reset when subtask changes
        if (subTask?.id !== loadedSubTaskIdRef.current) {
            activitiesLoadedAtRef.current = 0;
        }
    }, [activeTab, subTask?.id, subTask?.updatedAt, isLoadingActivity, loadActivities]);





    // 🚀 REAL-TIME COMMENT SYNC
    useEffect(() => {
        if (!isOpen || !subTask?.id) return;

        const unsubscribe = pubsub.subscribe(EVENTS.APP_ACTIVITY_LOG, (data: any) => {
            const isComment = data.action === "COMMENT_CREATED";
            const isForThisTask = data.entityId === subTask.id;

            if (isComment && isForThisTask) {
                const newComment = data.newData?.comment;
                if (newComment) {
                    // Update local state
                    setComments(prev => {
                        // Avoid duplicates (crucial since actor now receives their own event)
                        if (prev.some(c => c.id === newComment.id)) return prev;
                        return [...prev, newComment];
                    });
                }
            }
        });

        return () => unsubscribe();
    }, [isOpen, subTask?.id, currentUserId]);

    return (
        <div className="flex flex-col h-full bg-background">
            <SheetTitle className="sr-only">{subTask?.name || "SubTask Details"}</SheetTitle>
            <SheetDescription className="sr-only">
                {task ? `Details and activity for subtask ${task.name}` : "Loading subtask details..."}
            </SheetDescription>
            {task ? (
                <>
                    {/* Header Component */}
                    <SubtaskSheetHeader
                        subTask={task}
                        currentUserId={currentUserId}
                        members={members}
                        tags={tags}
                        isAdmin={isAdmin || members.find(m => m.userId === currentUserId)?.workspaceRole === 'ADMIN' || members.find(m => m.userId === currentUserId)?.workspaceRole === 'OWNER'}
                        isProjectManager={isProjectManager || members.find(m => m.userId === currentUserId)?.projectRole === 'PROJECT_MANAGER'}
                        onSubTaskUpdated={handleSubTaskUpdated}
                        onSubTaskAssigned={(memberObj) => {
                            const updatedData = {
                                assignee: {
                                    id: memberObj.id,
                                    workspaceMember: {
                                        userId: memberObj.id,
                                        user: {
                                            id: memberObj.id,
                                            name: memberObj.name || "",
                                            surname: memberObj.surname || null,
                                        }
                                    }
                                }
                            };
                            // 1. Update the local sheet context/URL state
                            onSubTaskAssigned?.(task.id, updatedData);
                            // 2. Update the global task cache so parent views (like SubTaskRow) reflect the change immediately
                            handleSubTaskUpdated(updatedData);
                        }}
                    />

                    {/* Tabbed Section - Takes Remaining Space */}
                    <div className="border-t flex-1 flex flex-col min-h-0">
                        <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as "messages" | "review")} className="flex flex-col h-full">
                            {/* Navigation Bar Component */}
                            <SubtaskSheetNavBar
                                activeTab={activeTab}
                                onTabChange={handleTabChange}
                                messagesCount={comments.length}
                                activityCount={activities.length}
                            />

                            {/* Tab Content - Kept mounted for instant switching */}
                            <Suspense fallback={<div className="flex-1 p-4 space-y-4"><div className="h-32 w-full bg-muted animate-pulse rounded-lg" /><div className="h-32 w-full bg-muted animate-pulse rounded-lg" /></div>}>
                                <div className={activeTab === "messages" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
                                    <MessagesTab
                                        taskId={task.id}
                                        workspaceId={task.workspaceId}
                                        projectId={task.projectId}
                                        comments={comments}
                                        setComments={setComments}
                                        currentUserId={currentUserId}
                                        isLoading={isLoading}
                                    />
                                </div>

                                <div className={activeTab === "review" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
                                    <ActivityTab
                                        activities={activities}
                                        isLoadingActivity={isLoadingActivity}
                                    />
                                </div>
                            </Suspense>
                        </Tabs>
                    </div>
                </>
            ) : (
                <div className="flex flex-col h-full bg-background">
                    {/* Header Skeleton */}
                    <div className="p-6 space-y-4 border-b">
                        <div className="flex items-center justify-between">
                            <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                            <div className="flex gap-2">
                                <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
                                <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
                            </div>
                        </div>
                        <div className="h-8 w-3/4 bg-muted animate-pulse rounded" />
                        <div className="flex gap-4">
                            <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                            <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                        </div>
                    </div>
                    {/* Nav Skeleton */}
                    <div className="flex gap-4 p-4 border-b">
                        <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                        <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                    </div>
                    {/* Content Skeleton - Matches intended tab layout */}
                    <div className="flex-1 p-6 space-y-4 overflow-hidden">
                        {getInitialTab() === "messages" ? (
                            <div className="space-y-6">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className={`flex w-full ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                                        <div className={`h-16 w-full max-w-[70%] bg-muted animate-pulse rounded-lg ${i % 2 === 0 ? "rounded-tr-none" : "rounded-tl-none"}`} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-32 w-full bg-muted animate-pulse rounded-lg" />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
