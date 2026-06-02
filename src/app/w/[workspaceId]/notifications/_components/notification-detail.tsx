"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { SubtaskSheetHeader } from "@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/subtask-sheet-header";
import { SubtaskSheetNavBar } from "@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/subtask-sheet-navbar";
import { MessagesTab } from "@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/messages-tab";
import { ActivityTab } from "@/app/w/[workspaceId]/p/[slug]/_components/shared/subtaskSheet/activity-tab";
import { Tabs } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { useProjectTags } from "@/hooks/use-project-tags";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";

interface NotificationDetailProps {
  notificationId: string;
}

export function NotificationDetail({ notificationId }: NotificationDetailProps) {
  const { data: workspaceData, workspaceId } = useWorkspaceLayout();

  const [task, setTask] = useState<any | null>(null);
  const [isTaskLoading, setIsTaskLoading] = useState(true);
  const [projectMembers, setProjectMembers] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<"messages" | "review">("messages");
  const [comments, setComments] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [isActivitiesLoading, setIsActivitiesLoading] = useState(false);

  // Pagination states
  const [nextCommentsCursor, setNextCommentsCursor] = useState<string | null>(null);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [nextActivitiesCursor, setNextActivitiesCursor] = useState<string | null>(null);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);

  const workspacePerms = workspaceData?.permissions;
  const isUserWorkspaceAdmin = workspacePerms?.workspaceRole === 'ADMIN' || workspacePerms?.workspaceRole === 'OWNER';

  const projectId = task?.projectId;
  const tags = useProjectTags(workspaceId, projectId);

  const permissions = {
    userId: workspacePerms?.userId,
    userSurname: null,
    workspaceMemberId: workspacePerms?.workspaceMemberId,
    isWorkspaceAdmin: isUserWorkspaceAdmin,
    isProjectManager: isUserWorkspaceAdmin || !!workspacePerms?.managedProjectIds?.includes(projectId || ""),
    isProjectCoordinator: !!workspacePerms?.coordinatorProjectIds?.includes(projectId || ""),
    isProjectLead: !!workspacePerms?.leadProjectIds?.includes(projectId || ""),
  };

  const currentUserId = permissions.userId;
  const isAdmin = permissions.isWorkspaceAdmin;
  const isProjectManager = permissions.isProjectManager;

  // 1. Fetch Task by slug or ID
  useEffect(() => {
    let active = true;
    const fetchTask = async () => {
      if (!workspaceId || !notificationId) return;
      setIsTaskLoading(true);
      try {
        const res = await apiClient.tasks.getTaskBySlug(workspaceId, notificationId);
        if (active) {
          if (res && res.data) {
            setTask(res.data);
          } else {
            setTask(null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch task details:", error);
        if (active) setTask(null);
      } finally {
        if (active) setIsTaskLoading(false);
      }
    };

    fetchTask();
    return () => {
      active = false;
    };
  }, [workspaceId, notificationId]);

  // 2. Fetch Project Members once we have task details
  useEffect(() => {
    if (!projectId) return;
    const fetchMembers = async () => {
      try {
        const membersList = await apiClient.projects.getMembers(projectId);
        setProjectMembers(membersList || []);
      } catch (e) {
        console.error("Failed to fetch project members:", e);
      }
    };
    fetchMembers();
  }, [projectId]);

  // 3. Load comments and activities
  const loadComments = useCallback(async (isLoadMore = false) => {
    if (!task?.id || (isLoadMore && !hasMoreComments) || isCommentsLoading) return;

    try {
      setIsCommentsLoading(true);
      const limit = 10;
      const cursor = isLoadMore ? (nextCommentsCursor || undefined) : undefined;

      const res = await apiClient.comments.getComments(task.id, cursor, limit);

      if (res.data) {
        const newComments = res.data.items || [];
        setComments(prev => {
          const combined = isLoadMore ? [...prev, ...newComments] : newComments;
          const seen = new Set();
          return combined.filter(c => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
          });
        });
        setNextCommentsCursor(res.data.nextCursor || null);
        setHasMoreComments(!!res.data.nextCursor);
      }
    } catch (error) {
      console.error("Failed to load comments:", error);
    } finally {
      setIsCommentsLoading(false);
    }
  }, [task?.id, nextCommentsCursor, hasMoreComments, isCommentsLoading]);

  const loadActivities = useCallback(async (isLoadMore = false) => {
    if (!task?.id || (isLoadMore && !hasMoreActivities) || isActivitiesLoading) return;

    try {
      setIsActivitiesLoading(true);
      const limit = 10;
      const cursor = isLoadMore ? (nextActivitiesCursor || undefined) : undefined;

      const res = await apiClient.comments.getActivities(task.id, cursor, limit);

      if (res.data) {
        const newActivities = res.data.items || [];
        setActivities(prev => isLoadMore ? [...prev, ...newActivities] : newActivities);
        setNextActivitiesCursor(res.data.nextCursor || null);
        setHasMoreActivities(!!res.data.nextCursor);
      }
    } catch (error) {
      console.error("Failed to load activities:", error);
    } finally {
      setIsActivitiesLoading(false);
    }
  }, [task?.id, nextActivitiesCursor, hasMoreActivities, isActivitiesLoading]);

  // Initial comments/activity fetch when task changes
  useEffect(() => {
    if (task?.id) {
      setComments([]);
      setActivities([]);
      setNextCommentsCursor(null);
      setNextActivitiesCursor(null);
      setHasMoreComments(true);
      setHasMoreActivities(true);
      
      // Load initial lists
      loadComments(false);
      loadActivities(false);
    }
  }, [task?.id]);

  const handleSubTaskUpdated = useCallback(async (updatedData: any) => {
    if (!task?.id || !workspaceId || !projectId) return;
    try {
      const res = await apiClient.tasks.updateTask(task.id, workspaceId, projectId, updatedData);
      if (res.status === "success") {
        toast.success("Task updated successfully");
        // Update local task state
        setTask((prev: any) => prev ? { ...prev, ...updatedData } : prev);
      } else {
        toast.error(res.message || "Failed to update task");
      }
    } catch (error) {
      toast.error("Failed to update task");
    }
  }, [task?.id, workspaceId, projectId]);

  if (isTaskLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
        <div className="size-16 rounded-full bg-primary/5 flex items-center justify-center text-primary/30">
          <MessageSquare className="size-8" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Task Not Found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            We couldn't retrieve the details for this notification. The task might have been deleted or you don't have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <SubtaskSheetHeader
        subTask={task}
        currentUserId={currentUserId || ""}
        members={projectMembers}
        tags={tags}
        isAdmin={isAdmin}
        isProjectManager={isProjectManager}
        onSubTaskUpdated={handleSubTaskUpdated}
        onSubTaskAssigned={(memberObj) => {
          const updatedData = {
            assigneeId: memberObj.id
          };
          handleSubTaskUpdated(updatedData);
        }}
      />

      <div className="border-t flex-1 flex flex-col min-h-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "messages" | "review")} className="flex flex-col h-full">
          <SubtaskSheetNavBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            messagesCount={comments.length}
            activityCount={activities.length}
          />

          <div className="flex-1 flex flex-col min-h-0 relative">
            <div className={activeTab === "messages" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
              <MessagesTab
                taskId={task.id}
                workspaceId={workspaceId}
                projectId={projectId}
                comments={comments}
                setComments={setComments}
                currentUserId={currentUserId}
                isLoading={isCommentsLoading}
                hasMore={hasMoreComments}
                onLoadMore={() => loadComments(true)}
              />
            </div>

            <div className={activeTab === "review" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
              <ActivityTab
                activities={activities}
                isLoadingActivity={isActivitiesLoading}
                hasMore={hasMoreActivities}
                onLoadMore={() => loadActivities(true)}
              />
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
