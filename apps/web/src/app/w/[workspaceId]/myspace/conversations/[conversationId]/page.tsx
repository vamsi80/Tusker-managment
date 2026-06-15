"use client";

import { useState, useEffect, use, useRef } from "react";
import { ChatPanel } from "../_components/chat-panel";
import { useConversations } from "../_components/conversations-context";
import { authClient } from "@/lib/auth-client";
import { dedupe } from "@/lib/api-client/dedupe";
import { toast } from "sonner";

interface PageProps {
  params: Promise<{ workspaceId: string; conversationId: string }>;
}

export default function ChatPage({ params }: PageProps) {
  const { workspaceId, conversationId } = use(params);
  const { data: session } = authClient.useSession();
  const { conversations, setConversations } = useConversations();

  const [messages, setMessages] = useState<Array<{ id?: string; senderId: string; content: string; createdAt: string }>>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(true);

  const lastMessageTimestampRef = useRef<string | null>(null);

  const fetchMessages = async (isInitial = false) => {
    try {
      const url = new URL(`${window.location.origin}/api/v1/conversations/${workspaceId}/${conversationId}/messages`);
      const since = !isInitial && lastMessageTimestampRef.current ? lastMessageTimestampRef.current : null;
      if (since) {
        url.searchParams.append("since", since);
      }

      // Dedupe concurrent identical reads (StrictMode mount + overlapping polls).
      const data = await dedupe(
        `messages:${workspaceId}:${conversationId}:${since ?? "initial"}`,
        () => fetch(url.toString()).then((r) => r.json()),
      );
      
      if (data.success) {
        const newMessages = data.data;
        if (newMessages.length > 0) {
          lastMessageTimestampRef.current = newMessages[0].createdAt;
          if (isInitial) {
            setMessages(newMessages);
          } else {
            setMessages(prev => [...newMessages, ...prev]);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch messages", error);
    } finally {
      if (isInitial) setIsMessagesLoading(false);
    }
  };

  useEffect(() => {
    lastMessageTimestampRef.current = null;
    setIsMessagesLoading(true);
    fetchMessages(true);

    // Poll for new messages, but back off to 10s and skip while the tab is hidden
    // (mirrors the global pubsub poll) so this isn't a second always-on 5s request loop.
    const POLL_MS = 10000;
    const msgInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchMessages(false);
    }, POLL_MS);

    // Catch up immediately when the tab regains focus after being hidden.
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchMessages(false);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(msgInterval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversationId]);

  const handleSendMessage = async (content: string) => {
    try {
      const res = await fetch(`/api/v1/conversations/${workspaceId}/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.success) {
        const newMsg = data.data;
        setMessages(prev => [newMsg, ...prev]);
        lastMessageTimestampRef.current = newMsg.createdAt;
        
        // Update global conversations state for sidebar preview
        setConversations(prev => prev.map(c => 
          c.id === conversationId 
            ? { ...c, lastMessageAt: new Date().toISOString(), lastMessage: newMsg }
            : c
        ));
      }
    } catch (error) {
      toast.error("Failed to send message");
    }
  };

  const activeConv = conversations.find((c) => c.id === conversationId);
  const otherUser = activeConv?.otherUser;

  return (
    <ChatPanel
      conversationId={conversationId}
      workspaceId={workspaceId}
      messages={messages}
      isLoading={isMessagesLoading}
      onSendMessage={handleSendMessage}
      otherUser={otherUser}
      currentUserId={session?.user?.id || ""}
    />
  );
}
