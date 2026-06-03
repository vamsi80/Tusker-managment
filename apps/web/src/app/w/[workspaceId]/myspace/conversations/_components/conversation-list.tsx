"use client";

import { authClient } from "@/lib/auth-client";
import { useState, useEffect, useMemo } from "react";
import { useConversations } from "./conversations-context";
import { Search, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

interface ConversationListProps {
  conversations: any[];
  isLoading: boolean;
}

export function ConversationList({ conversations, isLoading }: ConversationListProps) {
  const { workspaceId, conversationId } = useParams();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { members, fetchMembers, setConversations } = useConversations();
  const [search, setSearch] = useState("");

  // Fetch members on mount to ensure the "Team" list is ready
  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Create a unified list of everyone
  const unifiedList = useMemo(() => {
    // 1. Start with existing conversations
    const list: Array<{
      type: "conversation" | "member";
      id: string;
      otherUser: any;
      lastMessageAt: string | null;
      lastMessage: any | null;
      name: string;
    }> = [...conversations].map(conv => ({
      type: "conversation",
      id: conv.id,
      otherUser: conv.otherUser,
      lastMessageAt: conv.lastMessageAt,
      lastMessage: conv.lastMessage,
      name: (conv.otherUser?.surname || "").toLowerCase(),
    }));

    // 2. Add members who don't have a conversation yet
    members.forEach(member => {
      const hasConv = conversations.some(c => c.otherUser?.id === member.user.id);
      if (!hasConv && member.user.id !== session?.user?.id) {
        list.push({
          type: "member" as const,
          id: member.user.id, // Using user ID as temp ID
          otherUser: member.user,
          lastMessageAt: null,
          lastMessage: null,
          name: (member.user.surname || "").toLowerCase(),
        });
      }
    });

    // 3. Filter by search
    const filtered = list.filter(item => item.name.includes(search.toLowerCase()));

    // 4. Sort: Recents first, then alphabetically
    return filtered.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) {
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      }
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [conversations, members, search, session?.user?.id]);

  const handleStartChat = async (userId: string) => {
    try {
      const res = await fetch(`/api/v1/conversations/${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: userId })
      });
      const data = await res.json();
      if (data.success) {
        setConversations(prev => {
          const exists = prev.some(c => c.id === data.data.id);
          if (exists) return prev;
          return [data.data, ...prev];
        });
        setSearch("");
        router.push(`/w/${workspaceId}/myspace/conversations/${data.data.id}`);
      }
    } catch (error) {
      console.error("Failed to start chat", error);
    }
  };

  return (
    <div className="flex flex-col h-full">

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search team or chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 bg-muted/40 border-none rounded-xl text-sm focus-visible:ring-1 focus-visible:ring-primary/20 shadow-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        <div className="flex flex-col px-3 pb-6 gap-0.5">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="size-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 bg-muted rounded" />
                  <div className="h-2 w-32 bg-muted rounded" />
                </div>
              </div>
            ))
          ) : (
            <>
              {unifiedList.map((item) => {
                const otherUser = item.otherUser;
                const isActive = item.type === "conversation"
                  ? conversationId === item.id
                  : conversations.find(c => c.id === conversationId)?.otherUser?.id === item.id;

                const content = (
                  <div className="flex items-center gap-3 p-2.5 rounded-2xl transition-all active:scale-[0.98] group relative w-full text-left">
                    <div className="relative">
                      <Avatar className="size-10 rounded-full">
                        <AvatarImage src={otherUser?.image} />
                        <AvatarFallback className={cn(
                          "rounded-full font-medium text-xs uppercase transition-colors",
                          isActive ? "bg-primary-foreground/20 text-white" : "bg-primary/10 text-primary"
                        )}>
                          {otherUser?.surname?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {otherUser?.lastActiveAt && (new Date().getTime() - new Date(otherUser.lastActiveAt).getTime() < 120000) && (
                        <div className="absolute bottom-0.5 right-0.5 size-2.5 bg-emerald-500 rounded-full border-2 border-background" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-semibold truncate">
                          {otherUser?.surname}
                        </span>
                        {item.lastMessageAt && (
                          <span className={cn(
                            "text-[9px] whitespace-nowrap opacity-60",
                            isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: false }).replace('about ', '')}
                          </span>
                        )}
                      </div>
                      <p className={cn(
                        "text-[11px] truncate",
                        isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}>
                        {item.lastMessage?.content || "Start chatting..."}
                      </p>
                    </div>
                  </div>
                );

                if (item.type === "conversation") {
                  return (
                    <Link
                      key={item.id}
                      href={`/w/${workspaceId}/myspace/conversations/${item.id}`}
                      onClick={() => setSearch("")}
                      className={cn(
                        "block rounded-2xl transition-all",
                        isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "hover:bg-muted/60"
                      )}
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => handleStartChat(item.id)}
                    className={cn(
                      "block rounded-2xl transition-all w-full",
                      isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "hover:bg-muted/60"
                    )}
                  >
                    {content}
                  </button>
                );
              })}

              {unifiedList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center opacity-30">
                  <MessageSquare className="size-10 mb-4 text-primary/50" />
                  <p className="text-sm font-bold tracking-tight">No one here yet</p>
                  <p className="text-xs mt-1">Try searching for someone else.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
