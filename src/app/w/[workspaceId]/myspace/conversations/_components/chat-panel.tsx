"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, MessageSquare, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import Link from "next/link";

interface ChatPanelProps {
  conversationId: string;
  workspaceId: string;
  messages: any[];
  isLoading: boolean;
  onSendMessage: (content: string) => Promise<void>;
  otherUser: any;
  currentUserId: string;
}

export function ChatPanel({
  conversationId,
  workspaceId,
  messages,
  isLoading,
  onSendMessage,
  otherUser,
  currentUserId
}: ChatPanelProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    }
  };

  useEffect(() => {
    scrollToBottom("auto");
  }, [messages, conversationId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(content.trim());
      setContent("");
      setTimeout(() => scrollToBottom(), 50);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <div className="h-auto py-1 flex items-center justify-between px-2 border-b bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <Link
            href={`/w/${workspaceId}/myspace/conversations`}
            className="lg:hidden p-1 -ml-2 rounded-full hover:bg-muted"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <div className="relative">
            <Avatar className="size-10 rounded-full">
              <AvatarFallback className="rounded-full bg-primary/10 text-primary font-semibold uppercase">
                {otherUser?.surname?.[0]}
              </AvatarFallback>
            </Avatar>
            {otherUser?.lastActiveAt && (new Date().getTime() - new Date(otherUser.lastActiveAt).getTime() < 120000) && (
              <div className="absolute bottom-0 right-0 size-2.5 bg-emerald-500 rounded-full border-2 border-background" />
            )}
          </div>

          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">
              {otherUser?.surname}
            </span>
            {otherUser?.lastActiveAt && (new Date().getTime() - new Date(otherUser.lastActiveAt).getTime() < 120000) && (
              <span className="text-[10px] text-emerald-500 font-medium tracking-wide">
                Online
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none chat-pattern" />

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent"
        >
          <div className="flex flex-col gap-2 max-w-4xl mx-auto">
            {isLoading && messages.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-6 animate-spin text-primary/20" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                <MessageSquare className="size-12 mb-4" />
                <p className="text-sm font-semibold">Wave to {otherUser?.name}!</p>
                <p className="text-xs mt-1">Start your conversation now.</p>
              </div>
            ) : (
              [...messages].reverse().map((msg, idx) => {
                const isMe = msg.senderId === currentUserId;
                return (
                  <div
                    key={msg.id || idx}
                    className={cn(
                      "flex flex-col max-w-[80%] group",
                      isMe ? "ml-auto items-end" : "mr-auto items-start"
                    )}
                  >
                    <div className={cn(
                      "px-4 py-2.5 rounded-3xl text-sm relative transition-all duration-200",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-tr-none shadow-md"
                        : "bg-muted text-foreground rounded-tl-none border border-border/10"
                    )}>
                      <p className="whitespace-pre-wrap leading-relaxed pr-10">{msg.content}</p>

                      <div className={cn(
                        "text-[9px] absolute bottom-1 right-3 font-medium opacity-50",
                        isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {format(new Date(msg.createdAt), "h:mm a")}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="p-4 bg-background/80 backdrop-blur-md border-t">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex gap-3 items-end">
          <div className="flex-1 min-h-[44px] bg-muted/40 rounded-3xl flex items-center px-4 relative py-1">
            <textarea
              placeholder="Write something..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (content.trim() && !isSending) {
                    handleSend(e);
                  }
                }
              }}
              disabled={isSending}
              rows={1}
              className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-sm py-2.5 px-0 resize-none placeholder:text-muted-foreground/30 min-h-[24px] max-h-[120px] overflow-y-auto scrollbar-none"
              style={{ height: "auto" }}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }
              }}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!content.trim() || isSending}
            className="size-11 rounded-full shrink-0 shadow-lg active:scale-90 transition-all"
          >
            {isSending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </Button>
        </form>
      </div>

      <style jsx global>{`
        .chat-pattern {
          background-image: radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0);
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
}
