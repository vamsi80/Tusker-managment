"use client";

import { MessageSquare } from "lucide-react";

export default function ConversationsPage() {

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-0 space-y-4">
      <div className="h-20 w-20 rounded-full bg-primary/5 flex items-center justify-center text-primary/20">
        <MessageSquare className="h-10 w-10" />
      </div>
      <div className="max-w-xs space-y-2">
        <h3 className="text-xl font-medium tracking-tight">Your Messages</h3>
        <p className="text-sm text-muted-foreground font-normal">
          Send private messages to your team members in this workspace.
        </p>
      </div>
      {/* <Button 
        onClick={fetchMembers}
        className="rounded-full px-8 font-bold shadow-lg shadow-primary/20"
      >
        <Plus className="h-4 w-4 mr-2" />
        New Message
      </Button> */}
    </div>
  );
}
