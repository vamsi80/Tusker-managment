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
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [conversationOtherUser, setConversationOtherUser] = useState<any>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);

  const lastMessageTimestampRef = useRef<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (data.otherUser) {
          setConversationOtherUser(data.otherUser);
        }
        if (isInitial) {
          setMessages(newMessages);
          setOlderCursor(data.hasMore ? data.nextCursor : null);
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

  /** Prepends the previous page. Resolves true when it added messages. */
  const loadOlderMessages = useCallback(async () => {
    if (!olderCursor) return false;
    try {
      const url = new URL(`${window.location.origin}/api/v1/conversations/${workspaceId}/${conversationId}/messages`);
      url.searchParams.append("cursor", olderCursor);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load earlier messages");
      const older = data.data || [];
      setMessages((previous) => mergeMessages(previous, older));
      setOlderCursor(data.hasMore ? data.nextCursor : null);
      return older.length > 0;
    } catch (error: any) {
      toast.error(error?.message || "Failed to load earlier messages");
      return false;
    }
  }, [conversationId, mergeMessages, olderCursor, workspaceId]);

  useEffect(() => {
    // Reset state on conversation switch to prevent stale flash
    setMessages([]);
    setIsOtherTyping(false);
    lastMessageTimestampRef.current = null;
    setOlderCursor(null);
    setIsMessagesLoading(true);
    fetchMessages(true);
    
    const msgInterval = setInterval(() => {
      fetchMessages(false);
    }, 5000);

    const unsubscribe = pubsub.subscribe(EVENTS.CONVERSATION_UPDATE, (event: any) => {
      if (event.conversationId !== conversationId) return;

      // Realtime surgical state sync
      if (event.action === "new_message" && event.message) {
        setMessages((previous) => mergeMessages(previous, [event.message]));
        updateWatermark([event.message]);
        if (event.message.senderId !== session?.user?.id) {
          fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/read`, {
            method: "PATCH",
          }).catch(() => {});
        }
        return;
      }

      if (event.action === "message_edited" && event.message) {
        setMessages((previous) => mergeMessages(previous, [event.message]));
        updateWatermark([event.message]);
        return;
      }

      if (event.action === "messages_deleted") {
        if (event.scope === "me" && event.actorId === session?.user?.id) {
          lastMessageTimestampRef.current = null;
          fetchMessages(true);
          return;
        }
        if (event.scope === "everyone" && Array.isArray(event.messageIds)) {
          const deletedAt = event.timestamp || new Date().toISOString();
          setMessages((previous) =>
            previous.map((message) =>
              event.messageIds.includes(message.id)
                ? { ...message, content: "", isDeleted: true, deletedAt, updatedAt: deletedAt }
                : message
            )
          );
          return;
        }
      }

      if (event.action === "messages_read") {
        setMessages((previous) =>
          previous.map((m) =>
            m.senderId === session?.user?.id && !m.isRead
              ? { ...m, isRead: true, readAt: event.timestamp || new Date().toISOString() }
              : m
          )
        );
        return;
      }

      fetchMessages(false);
    });

    const unsubscribeTyping = pubsub.subscribe(EVENTS.TYPING, (event: any) => {
      if (event.conversationId !== conversationId || event.userId === session?.user?.id) return;
      if (event.isTyping) {
        setIsOtherTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setIsOtherTyping(false), 4000);
      } else {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        setIsOtherTyping(false);
      }
    });

    return () => {
      clearInterval(msgInterval);
      unsubscribe();
      unsubscribeTyping();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [conversationId, fetchMessages, mergeMessages, session?.user?.id, updateWatermark, workspaceId]);

  const activeConv = conversations.find((c: any) => c.id === conversationId);
  const otherUser = activeConv?.otherUser || conversationOtherUser;

  // Realtime presence update for conversation partner
  useEffect(() => {
    if (!otherUser?.id) return;
    const unsubPresence = pubsub.subscribe(EVENTS.PRESENCE_UPDATE, (data: any) => {
      if (data.userId === otherUser.id) {
        setConversationOtherUser((prev: any) =>
          prev ? { ...prev, lastActiveAt: data.lastActiveAt } : prev
        );
      }
    });
    return unsubPresence;
  }, [otherUser?.id]);

  const handleSendMessage = async (content: string) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();
    const optimisticMessage = {
      id: tempId,
      content,
      senderId: session?.user?.id || "",
      conversationId,
      createdAt: nowIso,
      updatedAt: nowIso,
      isDeleted: false,
      deletedAt: null,
      isRead: false,
      deliveredAt: null,
      readAt: null,
      editedAt: null,
      isForwarded: false,
      forwardedFromId: null,
      user: {
        id: session?.user?.id || "",
        name: session?.user?.name || "",
        surname: (session?.user as any)?.surname || "",
      },
      isPending: true,
    };

    // Optimistic UI updates
    setMessages((previous) => mergeMessages(previous, [optimisticMessage]));
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessageAt: nowIso, lastMessage: optimisticMessage }
          : c
      )
    );

    try {
      const res = await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to send message");

      const serverMsg = data.data;
      // Replace optimistic placeholder with real confirmed message
      setMessages((previous) =>
        previous.map((m) => (m.id === tempId ? serverMsg : m))
      );
      updateWatermark([serverMsg]);

      // Update global conversations preview
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessageAt: serverMsg.createdAt, lastMessage: serverMsg }
            : c
        )
      );
    } catch (error) {
      // Rollback optimistic message on failure
      setMessages((previous) => previous.filter((m) => m.id !== tempId));
      toast.error("Failed to send message");
      throw error;
    }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    const original = messages.find((m) => m.id === messageId);
    const editedAt = new Date().toISOString();

    // Optimistically update
    setMessages((previous) =>
      previous.map((m) => (m.id === messageId ? { ...m, content, editedAt, updatedAt: editedAt } : m))
    );

    try {
      const res = await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to edit message");
      }
      setMessages((previous) => mergeMessages(previous, [data.data]));
      updateWatermark([data.data]);
      toast.success("Message edited");
    } catch (error: any) {
      if (original) {
        setMessages((previous) => previous.map((m) => (m.id === messageId ? original : m)));
      }
      toast.error(error?.message || "Failed to edit message");
      throw error;
    }
  };

  const handleDeleteMessages = async (messageIds: string[], scope: "me" | "everyone") => {
    const originals = messages.filter((m) => messageIds.includes(m.id));
    const deletedAt = new Date().toISOString();

    // Optimistic deletion
    if (scope === "me") {
      setMessages((previous) => previous.filter((message) => !messageIds.includes(message.id)));
    } else {
      setMessages((previous) =>
        previous.map((message) =>
          messageIds.includes(message.id)
            ? { ...message, content: "", isDeleted: true, deletedAt, updatedAt: deletedAt }
            : message
        )
      );
    }

    try {
      const res = await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/messages/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds, scope }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete messages");
      }
      toast.success(scope === "me" ? "Deleted for you" : "Deleted for everyone");
    } catch (error: any) {
      setMessages((previous) => mergeMessages(previous, originals));
      toast.error(error?.message || "Failed to delete messages");
      throw error;
    }
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

  const handleTyping = useCallback(async (isTyping: boolean) => {
    try {
      await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTyping }),
      });
    } catch {
      // Typing presence failures are non-blocking
    }
  }, [conversationId, workspaceId]);

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
      onTyping={handleTyping}
      isOtherTyping={isOtherTyping}
      hasOlder={!!olderCursor}
      onLoadOlder={loadOlderMessages}
      conversations={conversations.filter((conversation: any) => conversation.id !== conversationId)}
      otherUser={otherUser}
      currentUserId={session?.user?.id || ""}
    />
  );
}
