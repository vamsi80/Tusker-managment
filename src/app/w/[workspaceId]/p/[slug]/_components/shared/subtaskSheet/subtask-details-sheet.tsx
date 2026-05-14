"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useProjectLayout as useOptionalProjectLayout } from "../../project-layout-context";
import { SubtaskSheetHeader } from "./subtask-sheet-header";
import { SubtaskSheetNavBar } from "./subtask-sheet-navbar";
import { MessagesTab } from "./messages-tab";
import { ActivityTab } from "./activity-tab";
import { Tabs } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import type { SubTaskType } from "@/types/task";
import { toast } from "sonner";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

interface SubTaskDetailsSheetProps {
    subTask: SubTaskType | null;
    isOpen: boolean;
    onClose: () => void;
    onSubTaskAssigned?: (subTaskId: string, updatedData: any) => void;
}

export function SubTaskDetailsSheet({
    subTask,
    isOpen,
    onClose,
    onSubTaskAssigned
}: SubTaskDetailsSheetProps) {
    // 🚀 Context Safety: GlobalSubTaskSheet might be used outside ProjectLayout
    let projectCtx: any = null;
    try { projectCtx = useOptionalProjectLayout(); } catch (e) { }

    const { data: workspaceData, workspaceId: workspaceIdFromContext } = useWorkspaceLayout();
    
    // Fallback to local state if project context is missing
    const [localMembers, setLocalMembers] = useState<any[]>([]);
    const [isLocalLoading, setIsLocalLoading] = useState(false);

    const workspaceId = projectCtx?.workspaceId || subTask?.workspaceId || workspaceIdFromContext;
    const projectId = projectCtx?.projectId || subTask?.projectId;
    const members = projectCtx?.projectMembers || localMembers;
    const tags = projectCtx?.workspaceTags || workspaceData?.tags || [];
    
    const permissions = projectCtx?.projectPermissions || {
        userId: workspaceData?.permissions?.userId,
        isWorkspaceAdmin: workspaceData?.permissions?.workspaceRole === 'ADMIN' || workspaceData?.permissions?.workspaceRole === 'OWNER',
        isProjectManager: false
    };

    const currentUserId = permissions.userId;
    const isAdmin = permissions.isWorkspaceAdmin;
    const isProjectManager = permissions.isProjectManager;

    const [activeTab, setActiveTab] = useState<"messages" | "review">("messages");
    const [comments, setComments] = useState<any[]>([]);
    const [activities, setActivities] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingActivity, setIsLoadingActivity] = useState(false);
    
    // Pagination states
    const [nextCommentsCursor, setNextCommentsCursor] = useState<string | null>(null);
    const [hasMoreComments, setHasMoreComments] = useState(true);
    const [nextActivitiesCursor, setNextActivitiesCursor] = useState<string | null>(null);
    const [hasMoreActivities, setHasMoreActivities] = useState(true);

    const [cachedData, setCachedData] = useState<Record<string, any>>({});

    const lastValidTask = useRef<SubTaskType | null>(null);
    if (subTask) {
        lastValidTask.current = subTask;
    }

    // Fetch members if context is missing
    useEffect(() => {
        if (!projectCtx && projectId && isOpen) {
            const fetchMembers = async () => {
                try {
                    setIsLocalLoading(true);
                    const membersList = await apiClient.projects.getMembers(projectId);
                    setLocalMembers(membersList || []);
                } catch (e) {
                    console.error("Failed to fetch local project members:", e);
                } finally {
                    setIsLocalLoading(false);
                }
            };
            fetchMembers();
        }
    }, [projectCtx, projectId, isOpen]);

    const loadComments = useCallback(async (isLoadMore = false) => {
        if (!subTask?.id || (isLoadMore && !hasMoreComments) || isLoading) return;

        try {
            setIsLoading(true);
            const limit = 10;
            const cursor = isLoadMore ? (nextCommentsCursor || undefined) : undefined;
            
            const res = await apiClient.comments.getComments(subTask.id, cursor, limit);

            if (res.data) {
                const newComments = res.data.items || [];
                console.log(`DEBUG [SubTaskDetailsSheet] Fetched ${newComments.length} comments. isLoadMore: ${isLoadMore}`);
                
                setComments(prev => {
                    const combined = isLoadMore ? [...prev, ...newComments] : newComments;
                    // De-duplicate by ID
                    const seen = new Set();
                    return combined.filter(c => {
                        if (seen.has(c.id)) return false;
                        seen.add(c.id);
                        return true;
                    });
                });
                setNextCommentsCursor(res.data.nextCursor || null);
                setHasMoreComments(!!res.data.nextCursor);

                if (!isLoadMore) {
                    setCachedData(prev => ({
                        ...prev,
                        [subTask.id]: {
                            ...prev[subTask.id],
                            comments: res.data
                        }
                    }));
                }
            }
        } catch (error) {
            console.error("Failed to load comments:", error);
        } finally {
            setIsLoading(false);
        }
    }, [subTask?.id, nextCommentsCursor, hasMoreComments, isLoading]);

    const loadActivities = useCallback(async (isLoadMore = false) => {
        if (!subTask?.id || (isLoadMore && !hasMoreActivities) || isLoadingActivity) return;

        try {
            setIsLoadingActivity(true);
            const limit = 10;
            const cursor = isLoadMore ? (nextActivitiesCursor || undefined) : undefined;

            const res = await apiClient.comments.getActivities(subTask.id, cursor, limit);

            if (res.data) {
                const newActivities = res.data.items || [];
                setActivities(prev => isLoadMore ? [...prev, ...newActivities] : newActivities);
                setNextActivitiesCursor(res.data.nextCursor || null);
                setHasMoreActivities(!!res.data.nextCursor);

                if (!isLoadMore) {
                    setCachedData(prev => ({
                        ...prev,
                        [subTask.id]: {
                            ...prev[subTask.id],
                            activities: res.data
                        }
                    }));
                }
            }
        } catch (error) {
            console.error("Failed to load activities:", error);
        } finally {
            setIsLoadingActivity(false);
        }
    }, [subTask?.id, nextActivitiesCursor, hasMoreActivities, isLoadingActivity]);

    // Initial load when subTask changes
    useEffect(() => {
        if (isOpen && subTask?.id) {
            const cached = cachedData[subTask.id];
            if (cached) {
                setComments(cached.comments?.items || []);
                setNextCommentsCursor(cached.comments?.nextCursor || null);
                setHasMoreComments(!!cached.comments?.nextCursor);
                
                setActivities(cached.activities?.items || []);
                setNextActivitiesCursor(cached.activities?.nextCursor || null);
                setHasMoreActivities(!!cached.activities?.nextCursor);
            } else {
                loadComments();
                loadActivities();
            }
        }
    }, [subTask?.id, isOpen]);

    const handleTabChange = (tab: "messages" | "review") => {
        setActiveTab(tab);
    };

    const handleSubTaskUpdated = useCallback(async (updatedData: any) => {
        if (!subTask?.id || !workspaceId || !projectId) return;
        try {
            const res = await apiClient.tasks.updateTask(subTask.id, workspaceId, projectId, updatedData);
            if (res.status === "success") {
                toast.success("Task updated successfully");
                if (projectCtx?.revalidate) projectCtx.revalidate();
            } else {
                toast.error(res.message || "Failed to update task");
            }
        } catch (error) {
            toast.error("Failed to update task");
        }
    }, [subTask?.id, workspaceId, projectId, projectCtx]);

    const task = isOpen ? subTask : lastValidTask.current;

    if (!task && isOpen) {
        return (
            <div className="flex-1 flex flex-col p-6 space-y-6">
                <div className="space-y-2">
                    <div className="h-8 w-1/3 bg-muted animate-pulse rounded-lg" />
                    <div className="h-4 w-1/4 bg-muted animate-pulse rounded-lg" />
                </div>
                <div className="space-y-4">
                    <div className="h-32 w-full bg-muted animate-pulse rounded-lg" />
                    <div className="h-32 w-full bg-muted animate-pulse rounded-lg" />
                    <div className="h-32 w-full bg-muted animate-pulse rounded-lg" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            {task ? (
                <>
                    <SubtaskSheetHeader
                        subTask={task as any}
                        currentUserId={currentUserId || ""}
                        members={members}
                        tags={tags}
                        isAdmin={isAdmin}
                        isProjectManager={isProjectManager}
                        onSubTaskUpdated={handleSubTaskUpdated}
                        onSubTaskAssigned={(memberObj) => {
                            const updatedData = {
                                assigneeId: memberObj.id
                            };
                            onSubTaskAssigned?.(task.id, updatedData);
                            handleSubTaskUpdated(updatedData);
                        }}
                    />

                    <div className="border-t flex-1 flex flex-col min-h-0">
                        <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as "messages" | "review")} className="flex flex-col h-full">
                            <SubtaskSheetNavBar
                                activeTab={activeTab}
                                onTabChange={handleTabChange}
                                messagesCount={comments.length}
                                activityCount={activities.length}
                            />

                            <div className="flex-1 flex flex-col min-h-0 relative">
                                <div className={activeTab === "messages" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
                                    <MessagesTab
                                        taskId={task.id}
                                        workspaceId={workspaceId || ""}
                                        projectId={projectId || ""}
                                        comments={comments}
                                        setComments={setComments}
                                        currentUserId={currentUserId}
                                        isLoading={isLoading}
                                        hasMore={hasMoreComments}
                                        onLoadMore={() => loadComments(true)}
                                    />
                                </div>

                                <div className={activeTab === "review" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
                                    <ActivityTab
                                        activities={activities}
                                        isLoadingActivity={isLoadingActivity}
                                        hasMore={hasMoreActivities}
                                        onLoadMore={() => loadActivities(true)}
                                    />
                                </div>
                            </div>
                        </Tabs>
                    </div>
                </>
            ) : null}
        </div>
    );
}
