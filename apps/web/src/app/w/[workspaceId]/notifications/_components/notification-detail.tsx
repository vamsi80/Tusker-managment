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
import { useNotifications } from "./notifications-context";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { cn, toTitleCase } from "@/lib/utils";

interface NotificationDetailProps {
  notificationId: string;
}

export function NotificationDetail({ notificationId }: NotificationDetailProps) {
  const { data: workspaceData, workspaceId } = useWorkspaceLayout();
  const { unreadNotifications, readNotifications } = useNotifications();
  const allNotifs = [...unreadNotifications, ...readNotifications];
  const matchedNotif = allNotifs.find(n => n.id === notificationId || n.taskId === notificationId);

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
      const targetId = matchedNotif?.taskId || notificationId;
      try {
        const res = await apiClient.tasks.getTaskBySlug(workspaceId, targetId);
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
  }, [workspaceId, notificationId, matchedNotif?.taskId]);

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
    if (matchedNotif) {
      const commenterUser = matchedNotif.latestComment?.user || {};
      const commenterName = commenterUser.surname || commenterUser.name || "System";
      const content = matchedNotif.latestComment?.content || "";
      const createdAt = matchedNotif.latestComment?.createdAt ? new Date(matchedNotif.latestComment.createdAt) : new Date();

      return (
        <div className="flex flex-col h-full bg-background overflow-hidden p-6 space-y-6">
          <div className="flex flex-col gap-2">
            {/* Project / Type Breadcrumb */}
            <div className="flex items-center gap-2 overflow-hidden">
              <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-md shrink-0">
                {matchedNotif.projectName || "System"}
              </Badge>
              <span className="text-muted-foreground/40 text-[10px] font-bold">/</span>
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest truncate">
                {toTitleCase(matchedNotif.type?.replace(/_/g, " ") || "Notification")}
              </span>
            </div>

            {/* Notification Title */}
            <h2 className="text-xl sm:text-2xl font-medium break-words leading-tight text-foreground">
              {toTitleCase(matchedNotif.taskName || "Notification Details")}
            </h2>
          </div>

          <div className="border-t pt-6 flex-1 flex flex-col gap-4">
            <div className="flex gap-3 items-start p-4 rounded-xl bg-muted/30 border border-muted/50">
              <Avatar className="size-10 shrink-0">
                <AvatarImage src={commenterUser.image} />
                <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                  {commenterName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{commenterName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {content}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

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
