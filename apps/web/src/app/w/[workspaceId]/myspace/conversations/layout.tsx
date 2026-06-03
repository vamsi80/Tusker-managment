"use client";

import { ReactNode } from "react";
import { ConversationsProvider, useConversations } from "./_components/conversations-context";
import { ConversationShell } from "./_components/conversation-shell";
import { ConversationList } from "./_components/conversation-list";

function ConversationsLayoutContent({ children }: { children: React.ReactNode }) {
  const { 
    conversations, 
    isLoading 
  } = useConversations();
  
  return (
    <div className="h-full bg-background">
      <ConversationShell
        sidebar={
          <ConversationList 
            conversations={conversations} 
            isLoading={isLoading}
          />
        }
      >
        {children}
      </ConversationShell>
    </div>
  );
}

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConversationsProvider>
      <ConversationsLayoutContent>
        {children}
      </ConversationsLayoutContent>
    </ConversationsProvider>
  );
}
