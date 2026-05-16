"use client";

import { Search, Plus, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import { useConversations } from "./conversations-context";

interface ConversationListProps {
  conversations: any[];
  isLoading: boolean;
  onNewChat: () => void;
}

export function ConversationList({ conversations, isLoading, onNewChat }: ConversationListProps) {
  const { workspaceId, conversationId } = useParams();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { members, fetchMembers } = useConversations();
  const [search, setSearch] = useState("");

  // Fetch members if search is active and members are empty
  useEffect(() => {
    if (search.length > 0 && members.length === 0) {
      fetchMembers();
    }
  }, [search, members.length, fetchMembers]);

  const filteredConversations = conversations.filter(conv => {
    const name = (conv.otherUser?.surname || "").toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const filteredMembers = members.filter(m => {
    // Only show members who DON'T already have a conversation in the conversations list
    const hasConversation = conversations.some(conv => conv.otherUser?.id === m.user.id);
    if (hasConversation) return false;

    const name = `${m.user.name} ${m.user.surname}`.toLowerCase();
    return name.includes(search.toLowerCase()) || m.user.email.toLowerCase().includes(search.toLowerCase());
  }).slice(0, 5); // Limit to 5 new people

  const handleStartChat = async (userId: string) => {
    try {
      const res = await fetch(`/api/v1/conversations/${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: userId })
      });
      const data = await res.json();
      if (data.success) {
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
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search people or chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-muted/40 border-none rounded-xl text-sm focus-visible:ring-1 focus-visible:ring-primary/20"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        <div className="flex flex-col p-2 gap-0.5">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="h-10 w-10 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 bg-muted rounded" />
                  <div className="h-2 w-32 bg-muted rounded" />
                </div>
              </div>
            ))
          ) : (
            <>
              {/* Active Conversations */}
              {filteredConversations.map((conv) => {
                const otherUser = conv.otherUser;
                const lastMsg = conv.lastMessage;
                const isActive = conversationId === conv.id;

                return (
                  <Link
                    key={conv.id}
                    href={`/w/${workspaceId}/myspace/conversations/${conv.id}`}
                    onClick={() => setSearch("")}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-xl transition-all active:scale-[0.98] group",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10 rounded-full">
                        <AvatarImage src={otherUser?.image} />
                        <AvatarFallback className={cn(
                          "rounded-full font-medium text-xs uppercase",
                          isActive ? "bg-primary-foreground/20 text-white" : "bg-primary/10 text-primary"
                        )}>
                          {otherUser?.surname?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {otherUser?.lastActiveAt && (new Date().getTime() - new Date(otherUser.lastActiveAt).getTime() < 120000) && (
                        <div className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-emerald-500 rounded-full border-2 border-background" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-semibold truncate">
                          {otherUser?.surname}
                        </span>
                        <span className={cn(
                          "text-[10px] whitespace-nowrap opacity-60",
                          isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {conv.lastMessageAt ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false }).replace('about ', '') : ''}
                        </span>
                      </div>
                      <p className={cn(
                        "text-xs truncate",
                        isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}>
                        {lastMsg?.content || "Start chatting..."}
                      </p>
                    </div>
                  </Link>
                );
              })}

              {/* Workspace Members (New Chats) */}
              {search && filteredMembers.length > 0 && (
                <div className="mt-4 px-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Other Members</p>
                  {filteredMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => handleStartChat(member.user.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted/60 transition-all active:scale-[0.98] text-left"
                    >
                      <div className="relative">
                        <Avatar className="h-8 w-8 rounded-full">
                          <AvatarFallback className="rounded-full bg-primary/10 text-primary font-medium text-[14px] uppercase">
                            {member.user.surname?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        {member.user.lastActiveAt && (new Date().getTime() - new Date(member.user.lastActiveAt).getTime() < 120000) && (
                          <div className="absolute bottom-0 right-0 h-2 w-2 bg-emerald-500 rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-normal truncate block">
                          {member.user.surname}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate block italic">
                          Start new chat
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {filteredConversations.length === 0 && filteredMembers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center opacity-40">
                  <UserPlus className="h-8 w-8 mb-2" />
                  <p className="text-xs font-medium">{search ? "No members found" : "No conversations yet"}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
