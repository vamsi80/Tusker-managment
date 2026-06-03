"use client";

import { useState } from "react";
import { useNotifications } from "./notifications-context";
import { NotificationListItem } from "./notification-list-item";
import { Input } from "@/components/ui/input";
import { Search, Bell, CheckSquare, MessageSquare } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function NotificationList() {
  const { workspaceId, notificationId } = useParams();
  const router = useRouter();
  const {
    unreadNotifications,
    readNotifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    hasMore,
    loadNotifications,
    markRead,
    markAllRead,
  } = useNotifications();

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("new");

  const filterList = (list: any[]) => {
    return list.filter((notif) => {
      const searchLower = search.toLowerCase();
      const taskName = (notif.taskName || "").toLowerCase();
      const projectName = (notif.projectName || "").toLowerCase();
      const parentTaskName = (notif.parentTaskName || "").toLowerCase();
      const commenterName = (notif.latestComment?.user?.surname || "").toLowerCase();
      const commentContent = (notif.latestComment?.content || "").toLowerCase();

      return (
        taskName.includes(searchLower) ||
        projectName.includes(searchLower) ||
        parentTaskName.includes(searchLower) ||
        commenterName.includes(searchLower) ||
        commentContent.includes(searchLower)
      );
    });
  };

  const filteredUnread = filterList(unreadNotifications);
  const filteredRead = filterList(readNotifications);

  const handleSelectNotif = (notif: any) => {
    const targetId = notif.id || notif.taskId;
    // If notif is in unread notifications, mark it read
    if (notif.isNew !== false) {
      markRead(targetId);
    }
    // Navigate to detail page
    router.push(`/w/${workspaceId}/notifications/${targetId}`);
  };

  return (
    <div className="flex flex-col h-full bg-background border-r">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b pb-3.5 shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="size-4.5 text-primary" />
          <h2 className="text-base font-bold tracking-tight">Notifications</h2>
        </div>
        {unreadNotifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            className="text-[11px] h-7 px-2 font-semibold text-muted-foreground hover:text-primary transition-colors"
          >
            Mark all read
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="p-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 bg-muted/40 border-none rounded-xl text-sm focus-visible:ring-1 focus-visible:ring-primary/20 shadow-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="new" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 border-b shrink-0">
          <TabsList className="w-full bg-transparent border-none p-0 h-10 gap-4">
            <TabsTrigger
              value="new"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 h-10 text-xs font-semibold gap-2"
            >
              New
              {unreadCount > 0 && (
                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 h-10 text-xs font-semibold"
            >
              History
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1 min-h-0">
          <TabsContent value="new" className="m-0 focus-visible:outline-none">
            {isLoading && unreadNotifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Checking for updates...
              </div>
            ) : filteredUnread.length === 0 ? (
              <div className="p-12 text-center">
                <MessageSquare className="size-8 mx-auto mb-2 text-muted-foreground/20" />
                <p className="text-sm font-medium text-muted-foreground">All caught up!</p>
                <p className="text-xs text-muted-foreground/60 mt-1">No unread notifications</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredUnread.map((notif, index) => (
                  <NotificationListItem
                    key={`${notif.id || notif.taskId}-${notif.type}-${index}`}
                    notif={notif}
                    isActive={notificationId === (notif.id || notif.taskId)}
                    onClick={() => handleSelectNotif(notif)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="m-0 focus-visible:outline-none">
            {filteredRead.length === 0 ? (
              <div className="p-12 text-center">
                <div className="size-8 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
                  <Bell className="size-4 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No history</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Recently read notifications appear here</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredRead.map((notif, index) => (
                  <NotificationListItem
                    key={`${notif.id || notif.taskId}-${notif.type}-${index}`}
                    notif={notif}
                    isRead
                    isActive={notificationId === (notif.id || notif.taskId)}
                    onClick={() => handleSelectNotif(notif)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </ScrollArea>

        {hasMore && (activeTab === "new" ? filteredUnread.length > 0 : filteredRead.length > 0) && (
          <div className="p-2 border-t text-center bg-muted/5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-8 text-muted-foreground hover:text-primary"
              onClick={() => loadNotifications(false)}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading..." : "Load more notifications"}
            </Button>
          </div>
        )}
      </Tabs>
    </div>
  );
}
