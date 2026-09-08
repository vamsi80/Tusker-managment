"use client";

import { useState, useEffect, use, useRef, useCallback } from "react";
import { ChatPanel } from "../_components/chat-panel";
import { useConversations } from "../_components/conversations-context";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import { pubsub, EVENTS } from "@/lib/pubsub";

interface PageProps {
  params: Promise<{ workspaceId: string; conversationId: string }>;
}

export default function ChatPage({ params }: PageProps) {
  const { workspaceId, conversationId } = use(params);
  const { data: session } = authClient.useSession();
  const { conversations, setConversations } = useConversations();

  const [messages, setMessages] = useState<any[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(true);

  const lastMessageTimestampRef = useRef<string | null>(null);

  const mergeMessages = useCallback((current: any[], incoming: any[]) => {
    const byId = new Map(current.map((message) => [message.id, message]));
    incoming.forEach((message) => {
      byId.set(message.id, { ...byId.get(message.id), ...message });
    });
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, []);

  const updateWatermark = useCallback((nextMessages: any[]) => {
    const newestUpdate = nextMessages.reduce<string | null>((latest, message) => {
      const value = message.updatedAt || message.createdAt;
      return !latest || new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
    }, lastMessageTimestampRef.current);
    lastMessageTimestampRef.current = newestUpdate;
  }, []);

  const fetchMessages = useCallback(async (isInitial = false) => {
    try {
      const url = new URL(`${window.location.origin}/api/v1/conversations/${workspaceId}/${conversationId}/messages`);
      if (!isInitial && lastMessageTimestampRef.current) {
        url.searchParams.append("since", lastMessageTimestampRef.current);
      }

      const res = await fetch(url.toString());
      const data = await res.json();
      
      if (data.success) {
        const newMessages = data.data || [];
        updateWatermark(newMessages);
        if (isInitial) {
          setMessages(newMessages);
        } else if (newMessages.length > 0) {
          setMessages((previous) => mergeMessages(previous, newMessages));
        }

        const hasUnreadIncoming = newMessages.some(
          (message: any) => message.senderId !== session?.user?.id && !message.isRead
        );
        if (hasUnreadIncoming) {
          await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/read`, {
            method: "PATCH",
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch messages", error);
    } finally {
      if (isInitial) setIsMessagesLoading(false);
    }
  }, [conversationId, mergeMessages, session?.user?.id, updateWatermark, workspaceId]);

  useEffect(() => {
    lastMessageTimestampRef.current = null;
    setIsMessagesLoading(true);
    fetchMessages(true);
    
    const msgInterval = setInterval(() => {
      fetchMessages(false);
    }, 5000);

    const unsubscribe = pubsub.subscribe(EVENTS.CONVERSATION_UPDATE, (event: any) => {
      if (event.conversationId !== conversationId) return;
      if (event.action === "messages_deleted" && event.scope === "me" && event.actorId === session?.user?.id) {
        lastMessageTimestampRef.current = null;
        fetchMessages(true);
        return;
      }
      fetchMessages(false);
    });
    
    return () => {
      clearInterval(msgInterval);
      unsubscribe();
    };
  }, [conversationId, fetchMessages, session?.user?.id]);

  const handleSendMessage = async (content: string) => {
    try {
      const res = await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to send message");
      if (data.success) {
        const newMsg = data.data;
        setMessages((previous) => mergeMessages(previous, [newMsg]));
        updateWatermark([newMsg]);
        
        // Update global conversations state for sidebar preview
        setConversations(prev => prev.map(c => 
          c.id === conversationId 
            ? { ...c, lastMessageAt: new Date().toISOString(), lastMessage: newMsg }
            : c
        ));
      }
    } catch (error) {
      toast.error("Failed to send message");
      throw error;
    }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    const res = await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast.error(data.error || "Failed to edit message");
      throw new Error(data.error || "Failed to edit message");
    }
    setMessages((previous) => mergeMessages(previous, [data.data]));
    updateWatermark([data.data]);
    toast.success("Message edited");
  };

  const handleDeleteMessages = async (messageIds: string[], scope: "me" | "everyone") => {
    const res = await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/messages/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds, scope }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast.error(data.error || "Failed to delete messages");
      throw new Error(data.error || "Failed to delete messages");
    }

    if (scope === "me") {
      setMessages((previous) => previous.filter((message) => !messageIds.includes(message.id)));
    } else {
      const deletedAt = new Date().toISOString();
      setMessages((previous) => previous.map((message) =>
        messageIds.includes(message.id)
          ? { ...message, content: "", isDeleted: true, deletedAt, updatedAt: deletedAt }
          : message
      ));
    }
    toast.success(scope === "me" ? "Deleted for you" : "Deleted for everyone");
  };

  const handleForwardMessages = async (messageIds: string[], targetConversationIds: string[]) => {
    const res = await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/messages/forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds, targetConversationIds }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast.error(data.error || "Failed to forward messages");
      throw new Error(data.error || "Failed to forward messages");
    }
    toast.success(`Forwarded ${messageIds.length === 1 ? "message" : `${messageIds.length} messages`}`);
  };

  const activeConv = conversations.find((c: any) => c.id === conversationId);
  const otherUser = activeConv?.otherUser;

  return (
    <ChatPanel
      conversationId={conversationId}
      workspaceId={workspaceId}
      messages={messages}
      isLoading={isMessagesLoading}
      onSendMessage={handleSendMessage}
      onEditMessage={handleEditMessage}
      onDeleteMessages={handleDeleteMessages}
      onForwardMessages={handleForwardMessages}
      conversations={conversations.filter((conversation: any) => conversation.id !== conversationId)}
      otherUser={otherUser}
      currentUserId={session?.user?.id || ""}
    />
  );
}
