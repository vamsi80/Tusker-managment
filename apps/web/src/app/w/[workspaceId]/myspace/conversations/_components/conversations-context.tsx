"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useParams } from "next/navigation";

interface ConversationItem {
  id?: string;
  otherUser?: { id: string; lastActiveAt?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

interface ConversationMember {
  user: { id: string; lastActiveAt?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

interface ConversationsContextType {
  conversations: ConversationItem[];
  members: ConversationMember[];
  isLoading: boolean;
  isMembersLoading: boolean;
  fetchConversations: () => Promise<void>;
  fetchMembers: () => Promise<void>;
  setConversations: React.Dispatch<React.SetStateAction<ConversationItem[]>>;
}

import { pubsub, EVENTS } from "@/lib/pubsub";
import { dedupe } from "@/lib/api-client/dedupe";

const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { workspaceId } = useParams();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMembersLoading, setIsMembersLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await dedupe(`conversations:${workspaceId}`, () =>
        fetch(`/api/v1/conversations/${workspaceId}`).then((r) => r.json()),
      );
      if (data.success) {
        setConversations(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch conversations", error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  const fetchMembers = useCallback(async () => {
    if (!workspaceId) return;
    setIsMembersLoading(true);
    try {
      const data = await dedupe(`conversation-members:${workspaceId}`, () =>
        fetch(`/api/v1/conversations/${workspaceId}/members`).then((r) => r.json()),
      );
      if (data.success) {
        setMembers(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch members", error);
    } finally {
      setIsMembersLoading(false);
    }
  }, [workspaceId]);

  // Initial-load joint request: conversation list + members in ONE Worker invocation.
  const bootstrap = useCallback(async () => {
    if (!workspaceId) return;
    setIsMembersLoading(true);
    try {
      const data = await dedupe(`conversations-bootstrap:${workspaceId}`, () =>
        fetch(`/api/v1/conversations/${workspaceId}/bootstrap`).then((r) => r.json()),
      );
      if (data.success) {
        setConversations(data.data.conversations);
        setMembers(data.data.members);
      }
    } catch (error) {
      console.error("Failed to bootstrap conversations", error);
    } finally {
      setIsLoading(false);
      setIsMembersLoading(false);
    }
  }, [workspaceId]);

  // Use the centralized pubsub for presence and conversation updates
  useEffect(() => {
    if (!workspaceId) return;

    // 1. Presence Updates
    const unsubscribePresence = pubsub.subscribe(EVENTS.PRESENCE_UPDATE, (data) => {
      const { userId, lastActiveAt, status } = data as { userId: string; lastActiveAt: string; status: string };
      console.log(`✨ [Conversations] Presence update for ${userId}: ${status}`);
      
      setConversations(prev => prev.map(conv => ({
        ...conv,
        otherUser: conv.otherUser?.id === userId
          ? { ...conv.otherUser, lastActiveAt }
          : conv.otherUser
      })));

      setMembers(prev => prev.map(m =>
        m.user.id === userId
          ? { ...m, user: { ...m.user, lastActiveAt } }
          : m
      ));
    });

    // 2. Conversation Updates (New messages, list reordering)
    const unsubscribeConversation = pubsub.subscribe(EVENTS.CONVERSATION_UPDATE, (data) => {
      console.log(`💬 [Conversations] List update triggered by:`, (data as { conversationId?: string }).conversationId);
      fetchConversations(); // Re-fetch list to get latest order and previews
    });

    return () => {
      unsubscribePresence();
      unsubscribeConversation();
    };
  }, [workspaceId, fetchConversations]);

  useEffect(() => {
    if (workspaceId) {
      bootstrap();
    }
  }, [workspaceId, bootstrap]);

  return (
    <ConversationsContext.Provider value={{
      conversations,
      members,
      isLoading,
      isMembersLoading,
      fetchConversations,
      fetchMembers,
      setConversations
    }}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations() {
  const context = useContext(ConversationsContext);
  if (context === undefined) {
    throw new Error("useConversations must be used within a ConversationsProvider");
  }
  return context;
}
