"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, ChevronDown, MessageSquare } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface MessagesTabProps {
    taskId: string;
    workspaceId: string;
    projectId: string;
    comments: any[];
    setComments: (comments: any[] | ((prev: any[]) => any[])) => void;
    currentUserId: string | null;
    isLoading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
}

const ACCENT_GREEN = "bg-[#10b981] text-white dark:bg-[#059669]";
const TEXT_GREEN   = "text-[#059669] dark:text-[#10b981]";

export function MessagesTab({
    taskId, workspaceId, projectId,
    comments, setComments,
    currentUserId,
    isLoading, hasMore, onLoadMore,
}: MessagesTabProps) {
    const [message, setMessage]             = useState("");
    const [isSending, setIsSending]         = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);

    const scrollRef         = useRef<HTMLDivElement>(null);
    const didInitialScroll  = useRef(false);   // Have we done the first snap-to-bottom?
    const isLoadingMore     = useRef(false);   // Guard against double load-more
    const hasScrolledDown   = useRef(false);   // User must visit the bottom before paginating

    /* ─── Helpers ─────────────────────────────────────────────────── */
    const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    };

    /* ─── Reset when task changes ─────────────────────────────────── */
    useEffect(() => {
        didInitialScroll.current = false;
        isLoadingMore.current    = false;
        hasScrolledDown.current  = false;
        setShowScrollBtn(false);
    }, [taskId]);

    /* ─── Snap to bottom on FIRST load of comments ────────────────── */
    // This fires when comments go from [] to having data (initial fetch done).
    // It does NOT fire for subsequent load-more fetches because
    // didInitialScroll is already true by then.
    useEffect(() => {
        if (isLoading) return;                    // still fetching, wait
        if (didInitialScroll.current) return;     // already did initial snap
        if (comments.length === 0) return;        // nothing to scroll to yet

        didInitialScroll.current = true;

        // One frame for DOM to paint, then snap
        requestAnimationFrame(() => {
            scrollToBottom("auto");
            // Mark that we've visited the bottom — enables pagination
            hasScrolledDown.current = true;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [comments.length, isLoading]);

    /* ─── Scroll handler ──────────────────────────────────────────── */
    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;

        const { scrollTop, scrollHeight, clientHeight } = el;

        // Show / hide "jump to bottom" button
        setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 200);

        // Track that user has visited the bottom at least once
        if (scrollHeight - scrollTop - clientHeight < 100) {
            hasScrolledDown.current = true;
        }

        // Load older messages when approaching the top — but ONLY after
        // the user has scrolled down to the bottom at least once.
        // This prevents auto-triggering on short conversations.
        if (
            didInitialScroll.current &&
            hasScrolledDown.current &&
            scrollTop <= 80 &&
            hasMore &&
            !isLoading &&
            !isLoadingMore.current
        ) {
            isLoadingMore.current = true;
            const prevHeight = scrollHeight;

            onLoadMore();

            // Wait for React to fully re-render the new messages, then restore position
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const nel = scrollRef.current;
                    if (nel) {
                        const newScrollHeight = nel.scrollHeight;
                        const addedHeight = newScrollHeight - prevHeight;
                        // Position at the junction between old and new messages
                        nel.scrollTop = addedHeight;
                    }
                    isLoadingMore.current = false;
                }, 350);
            });
        }
    };

    /* ─── Send ─────────────────────────────────────────────────────── */
    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!message.trim() || isSending) return;

        try {
            setIsSending(true);
            const res = await apiClient.comments.createComment({
                taskId, workspaceId, projectId, content: message.trim(),
            });

            if (res.data) {
                const newMsg = {
                    ...res.data,
                    userId: currentUserId,
                    createdAt: new Date().toISOString(),
                };
                setComments(prev => [newMsg, ...prev]);   // prepend (newest-first in state)
                setMessage("");
                requestAnimationFrame(() => scrollToBottom());
            } else {
                toast.error(res.error?.message || "Failed to send message");
            }
        } catch {
            toast.error("Failed to send message");
        } finally {
            setIsSending(false);
        }
    };

    /* ─── Render: flip state (newest-first) → chronological (oldest first) ── */
    const msgs = [...comments].reverse();

    return (
        <div className="flex-1 flex flex-col bg-background relative overflow-hidden h-full">

            {/* Dot pattern */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none chat-bg-dots" />

            {/* ── Scroll area ─────────────────────────────────────── */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 sm:px-6 z-10 scrollbar-chat"
            >
                {/* Loading older messages indicator (sticky at top) */}
                {isLoading && hasMore && (
                    <div className="flex justify-center py-3 sticky top-0 z-10">
                        <div className="bg-muted/60 backdrop-blur rounded-full px-3 py-1 flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground font-medium">
                                Loading older messages…
                            </span>
                        </div>
                    </div>
                )}

                {/* Initial loading state */}
                {isLoading && comments.length === 0 && (
                    <div className="flex justify-center items-center h-32">
                        <Loader2 className="size-5 animate-spin text-muted-foreground/30" />
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && msgs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-center opacity-40">
                        <MessageSquare className="size-10 mb-3" />
                        <p className="text-sm font-semibold">No messages yet</p>
                    </div>
                )}

                {/* ── Message list ──────────────────────────────────── */}
                <div className="flex flex-col py-6 gap-0">
                    {msgs.map((c, i) => {
                        const senderId    = c.userId || c.authorId;
                        const isMe        = senderId === currentUserId;
                        const author      = c.user || c.author?.workspaceMember?.user || c.author;
                        const date        = new Date(c.createdAt);
                        const prev        = msgs[i - 1];
                        const isFirstGrp  = !prev || (prev.userId || prev.authorId) !== senderId;
                        const isNewDay    = !prev || !isSameDay(date, new Date(prev.createdAt));

                        return (
                            <div key={c.id + i} className="flex flex-col">

                                {/* Date separator */}
                                {isNewDay && (
                                    <div className="flex justify-center my-5">
                                        <span className="bg-muted/50 backdrop-blur px-3 py-0.5 rounded-full text-[9px] font-bold text-muted-foreground uppercase tracking-widest border border-border/10">
                                            {format(date, "MMMM d, yyyy")}
                                        </span>
                                    </div>
                                )}

                                {/* Bubble row */}
                                <div className={cn(
                                    "flex w-full",
                                    isMe ? "justify-end" : "justify-start",
                                    isFirstGrp ? "mt-4" : "mt-0.5",
                                )}>
                                    <div className={cn(
                                        "flex max-w-[85%] sm:max-w-[75%] gap-2",
                                        isMe ? "flex-row-reverse" : "flex-row",
                                    )}>
                                        {/* Avatar */}
                                        {!isMe && isFirstGrp && (
                                            <Avatar className="size-7 mt-0.5 shrink-0 border border-border/30">
                                                <AvatarImage src={author?.image} />
                                                <AvatarFallback className="bg-muted text-[9px] font-bold">
                                                    {author?.name?.[0]}{author?.surname?.[0]}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}
                                        {!isMe && !isFirstGrp && <div className="w-7 shrink-0" />}

                                        {/* Bubble */}
                                        <div className={cn(
                                            "px-3.5 py-1.5 rounded-[18px] shadow-sm",
                                            isMe
                                                ? `${ACCENT_GREEN} rounded-tr-none`
                                                : "bg-muted text-foreground rounded-tl-none border border-border/20",
                                        )}>
                                            {!isMe && isFirstGrp && (
                                                <span className={cn("block text-[10px] font-bold mb-0.5", TEXT_GREEN)}>
                                                    {author?.name} {author?.surname}
                                                </span>
                                            )}
                                            <div className="flex flex-wrap items-end gap-x-4 gap-y-0.5">
                                                <p className="text-[14px] leading-[19px] whitespace-pre-wrap break-words flex-1 min-w-[50px]">
                                                    {c.content}
                                                </p>
                                                <span className={cn(
                                                    "text-[8.5px] font-bold shrink-0 ml-auto opacity-60",
                                                    isMe ? "text-white" : "text-muted-foreground",
                                                )}>
                                                    {format(date, "h:mm a")}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Jump to bottom ────────────────────────────────────── */}
            {showScrollBtn && (
                <button
                    onClick={() => scrollToBottom()}
                    className="absolute bottom-24 right-5 z-20 size-9 rounded-full bg-background/90 backdrop-blur border border-border/50 flex items-center justify-center shadow-lg hover:bg-muted transition-all"
                >
                    <ChevronDown className="size-5" />
                </button>
            )}

            {/* ── Input ─────────────────────────────────────────────── */}
            <div className="shrink-0 p-4 bg-background/95 backdrop-blur border-t z-20">
                <form onSubmit={handleSend} className="flex gap-2 items-center">
                    <Input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type a message…"
                        disabled={isSending}
                        className="flex-1 bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-emerald-500/20 rounded-[14px] h-12 px-4 text-[14.5px] placeholder:text-muted-foreground/40"
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!message.trim() || isSending}
                        className={cn(
                            "size-12 rounded-full shrink-0 shadow-md transition-all",
                            message.trim()
                                ? `${ACCENT_GREEN} hover:opacity-90`
                                : "bg-muted text-muted-foreground",
                        )}
                    >
                        {isSending
                            ? <Loader2 className="size-5 animate-spin" />
                            : <Send className="size-5" />
                        }
                    </Button>
                </form>
            </div>

            <style jsx global>{`
                .chat-bg-dots {
                    background-image: radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0);
                    background-size: 22px 22px;
                }
                .scrollbar-chat::-webkit-scrollbar { width: 5px; }
                .scrollbar-chat::-webkit-scrollbar-thumb {
                    background: rgba(128,128,128,0.25);
                    border-radius: 10px;
                }
            `}</style>
        </div>
    );
}
