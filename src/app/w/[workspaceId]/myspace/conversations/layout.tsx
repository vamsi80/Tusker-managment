"use client";

import { useState, use } from "react";
import { ConversationsProvider, useConversations } from "./_components/conversations-context";
import { ConversationShell } from "./_components/conversation-shell";
import { ConversationList } from "./_components/conversation-list";
import { NewDMDialog } from "./_components/new-dm-dialog";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";

import { useEffect } from "react";

function ConversationsLayoutContent({ children }: { children: React.ReactNode }) {
  const { workspaceId } = useParams();
  const router = useRouter();


  const { 
    conversations, 
    isLoading, 
    members, 
    isMembersLoading, 
    fetchMembers 
  } = useConversations();
  
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);

  const handleCreateChat = async (userId: string) => {
    try {
      const res = await fetch(`/api/v1/conversations/${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: userId })
      });
      const data = await res.json();
      if (data.success) {
        setIsNewChatOpen(false);
        router.push(`/w/${workspaceId}/myspace/conversations/${data.data.id}`);
      }
    } catch (error) {
      toast.error("Error starting conversation");
    }
  };

  return (
    <div className="h-full bg-background">
      <ConversationShell
        sidebar={
          <ConversationList 
            conversations={conversations} 
            isLoading={isLoading}
            onNewChat={() => {
              setIsNewChatOpen(true);
              fetchMembers();
            }}
          />
        }
      >
        {children}
      </ConversationShell>

      <NewDMDialog 
        open={isNewChatOpen}
        onOpenChange={setIsNewChatOpen}
        members={members}
        isLoading={isMembersLoading}
        onSelectMember={handleCreateChat}
      />
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
