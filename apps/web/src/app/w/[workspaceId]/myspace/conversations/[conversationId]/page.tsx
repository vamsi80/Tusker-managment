"use client";

import { useState, useEffect, use, useRef } from "react";
import { ChatPanel } from "../_components/chat-panel";
import { useConversations } from "../_components/conversations-context";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

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

  const fetchMessages = async (isInitial = false) => {
    try {
      const url = new URL(`${window.location.origin}/api/v1/conversations/${workspaceId}/${conversationId}/messages`);
      if (!isInitial && lastMessageTimestampRef.current) {
        url.searchParams.append("since", lastMessageTimestampRef.current);
      }

      const res = await fetch(url.toString());
      const data = await res.json();
      
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
    
    const msgInterval = setInterval(() => {
      fetchMessages(false);
    }, 5000);
    
    return () => clearInterval(msgInterval);
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

  const activeConv = conversations.find((c: any) => c.id === conversationId);
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
