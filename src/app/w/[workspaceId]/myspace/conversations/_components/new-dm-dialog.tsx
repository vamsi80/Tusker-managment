"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewDMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: any[];
  isLoading: boolean;
  onSelectMember: (userId: string) => Promise<void>;
}

export function NewDMDialog({
  open,
  onOpenChange,
  members,
  isLoading,
  onSelectMember
}: NewDMDialogProps) {
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const filteredMembers = members.filter(m => {
    const name = `${m.user.name} ${m.user.surname}`.toLowerCase();
    return name.includes(search.toLowerCase()) || m.user.email.toLowerCase().includes(search.toLowerCase());
  });

  const handleSelect = async (userId: string) => {
    setIsCreating(true);
    try {
      await onSelectMember(userId);
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none rounded-3xl shadow-2xl">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold tracking-tight">New Conversation</DialogTitle>
          <DialogDescription className="text-sm font-medium text-muted-foreground">
            Select a team member to start a private chat.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 bg-muted/40 border-none rounded-2xl text-sm focus-visible:ring-1 focus-visible:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto h-[400px] border-t scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
          <div className="flex flex-col p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary/20" />
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                <UserPlus className="h-10 w-10 mb-2" />
                <p className="text-sm font-semibold">No members found</p>
              </div>
            ) : (
              filteredMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleSelect(member.user.id)}
                  disabled={isCreating}
                  className="flex items-center gap-3 p-3 rounded-2xl transition-all hover:bg-muted/60 active:scale-95 text-left group"
                >
                  <Avatar className="h-10 w-10 rounded-lg border border-border/10 group-hover:border-primary/20 transition-colors">
                    <AvatarImage src={member.user.image} />
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold uppercase">
                      {member.user.surname?.[0] || member.user.name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold truncate">
                      {member.user.surname}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {member.user.email}
                    </span>
                  </div>
                  {isCreating && (
                    <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
