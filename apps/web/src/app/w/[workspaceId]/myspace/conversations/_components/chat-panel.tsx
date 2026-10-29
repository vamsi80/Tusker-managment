"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Forward,
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import Link from "next/link";
import { getUserDisplayInitial, getUserDisplayName } from "@tusker/core/lib/user-display-name";

interface ChatPanelProps {
  conversationId: string;
  workspaceId: string;
  messages: any[];
  conversations: any[];
  isLoading: boolean;
  onSendMessage: (content: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessages: (messageIds: string[], scope: "me" | "everyone") => Promise<void>;
  onForwardMessages: (messageIds: string[], targetConversationIds: string[]) => Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  isOtherTyping?: boolean;
  /** More history exists above what's loaded. */
  hasOlder?: boolean;
  /** Prepends the previous page; resolves true when it added messages. */
  onLoadOlder?: () => Promise<boolean>;
  otherUser: any;
  currentUserId: string;
}

/** Within this distance of the bottom counts as "reading the latest". */
const NEAR_BOTTOM_PX = 120;

const EDIT_WINDOW_MS = 10 * 60 * 1000;

export function ChatPanel({
  conversationId,
  workspaceId,
  messages,
  conversations,
  isLoading,
  onSendMessage,
  onEditMessage,
  onDeleteMessages,
  onForwardMessages,
  onTyping,
  isOtherTyping = false,
  hasOlder = false,
  onLoadOlder,
  otherUser,
  currentUserId,
}: ChatPanelProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionMessageIds, setActionMessageIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTargets, setForwardTargets] = useState<Set<string>>(new Set());
  const [isActing, setIsActing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const newestIdRef = useRef<string | null>(null);
  const oldestIdRef = useRef<string | null>(null);
  // Set while older messages load: the scroll height before, to hold the view.
  const olderAnchorRef = useRef<number | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const lastTypingSentRef = useRef<number>(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Until the chat list has loaded (e.g. opened from a notification) the other
  // person is unknown: show nothing rather than a placeholder "Member".
  const otherUserName = otherUser ? getUserDisplayName(otherUser) : "";
  const isSelecting = selectedIds.size > 0;

  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedIds.has(message.id)),
    [messages, selectedIds]
  );
  const actionMessages = useMemo(
    () => messages.filter((message) => actionMessageIds.includes(message.id)),
    [actionMessageIds, messages]
  );
  const canDeleteForEveryone = actionMessages.length > 0 && actionMessages.every(
    (message) => message.senderId === currentUserId && !message.isDeleted
  );

  // Scroll only when it helps. It used to snap to the bottom on every change,
  // including the other person's read receipts every few seconds, so reading
  // back through a chat kept getting yanked down.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Older page prepended (the oldest message changed): keep the same message
    // under the reader's eyes.
    const oldest = messages[messages.length - 1];
    const olderArrived = oldest && oldest.id !== oldestIdRef.current;
    oldestIdRef.current = oldest?.id ?? null;
    if (olderAnchorRef.current !== null && olderArrived) {
      el.scrollTop += el.scrollHeight - olderAnchorRef.current;
      olderAnchorRef.current = null;
      return;
    }

    const newest = messages[0]; // newest first
    const isNewArrival = newest && newest.id !== newestIdRef.current;
    const isFirstLoad = newestIdRef.current === null;
    newestIdRef.current = newest?.id ?? null;
    // A new message lands at the bottom: follow it if the reader is there, or
    // if they sent it. Otherwise (reading history) leave the view alone.
    if (isFirstLoad || (isNewArrival && (nearBottomRef.current || newest.senderId === currentUserId))) {
      el.scrollTop = el.scrollHeight;
      nearBottomRef.current = true;
      setIsNearBottom(true);
    }
  }, [messages, currentUserId]);

  useLayoutEffect(() => {
    if (isOtherTyping && nearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOtherTyping]);

  useEffect(() => {
    setSelectedIds(new Set());
    setEditingMessageId(null);
    setContent("");
    newestIdRef.current = null; // next load scrolls to the bottom again
    oldestIdRef.current = null;
    olderAnchorRef.current = null;
    nearBottomRef.current = true;
    setIsNearBottom(true);
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onTyping?.(false);
    };
  }, [conversationId]);

  // Dynamically keep textarea height fitted to content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [content]);

  const loadOlder = async () => {
    const el = scrollRef.current;
    if (!onLoadOlder || !hasOlder || isLoadingOlder || !el) return;
    setIsLoadingOlder(true);
    try {
      olderAnchorRef.current = el.scrollHeight;
      // Nothing added: drop the anchor so a later new message isn't offset by it.
      if (!(await onLoadOlder())) olderAnchorRef.current = null;
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setIsNearBottom(near);
    // Reaching the top pulls in the previous page.
    if (el.scrollTop < 80) loadOlder();
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelected = (messageId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const beginEdit = (message: any) => {
    setEditingMessageId(message.id);
    setContent(message.content);
    clearSelection();
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setContent("");
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = event.target.value;
    setContent(text);

    if (onTyping && !editingMessageId) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 2000) {
        onTyping(true);
        lastTypingSentRef.current = now;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 3000);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextContent = content.trim();
    if (!nextContent || isSending) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onTyping?.(false);

    // Clear at once and keep the box enabled and focused, so the next message
    // can be typed straight away (disabling it dropped focus after every send).
    // On failure the text comes back, nothing is lost.
    setIsSending(true);
    setContent("");
    try {
      if (editingMessageId) {
        await onEditMessage(editingMessageId, nextContent);
        setEditingMessageId(null);
      } else {
        await onSendMessage(nextContent);
      }
    } catch {
      setContent((current) => current || nextContent);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const openDelete = (ids: string[]) => {
    setActionMessageIds(ids);
    setDeleteOpen(true);
  };

  const openForward = (ids: string[]) => {
    setActionMessageIds(ids);
    setForwardTargets(new Set());
    setForwardOpen(true);
  };

  const deleteMessages = async (scope: "me" | "everyone") => {
    setIsActing(true);
    try {
      await onDeleteMessages(actionMessageIds, scope);
      setDeleteOpen(false);
      clearSelection();
    } finally {
      setIsActing(false);
    }
  };

  const forwardMessages = async () => {
    if (forwardTargets.size === 0) return;
    setIsActing(true);
    try {
      await onForwardMessages(actionMessageIds, Array.from(forwardTargets));
      setForwardOpen(false);
      clearSelection();
    } finally {
      setIsActing(false);
    }
  };

  const deliveryIcon = (message: any) => {
    if (message.isPending) {
      return <Clock className="size-3.5 opacity-60 animate-pulse" aria-label="Sending" />;
    }
    if (message.readAt || message.isRead) {
      return <CheckCheck className="size-3.5 text-sky-300" aria-label="Read" />;
    }
    if (message.deliveredAt) {
      return <CheckCheck className="size-3.5" aria-label="Delivered" />;
    }
    return <Check className="size-3.5" aria-label="Sent" />;
  };

  const formatMessageTime = (dateVal: any) => {
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return "";
      return format(d, "h:mm a");
    } catch {
      return "";
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="z-10 flex min-h-12 items-center justify-between border-b px-2 py-1">
        {isSelecting ? (
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon" onClick={clearSelection} aria-label="Cancel selection">
                <X className="size-5" />
              </Button>
              <span className="text-sm font-semibold">{selectedIds.size} selected</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={selectedMessages.every((message) => message.isDeleted)}
                onClick={() => openForward(selectedMessages.filter((message) => !message.isDeleted).map((message) => message.id))}
                aria-label="Forward selected messages"
              >
                <Forward className="size-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => openDelete(Array.from(selectedIds))}
                aria-label="Delete selected messages"
              >
                <Trash2 className="size-5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href={`/w/${workspaceId}/myspace/conversations`}
              className="-ml-2 rounded-full p-1 hover:bg-muted lg:hidden"
            >
              <ArrowLeft className="size-5" />
            </Link>

            <div className="relative">
              <Avatar className="size-10 rounded-full">
                <AvatarFallback className="rounded-full bg-primary/10 font-semibold uppercase text-primary-ink">
                  {getUserDisplayInitial(otherUser)}
                </AvatarFallback>
              </Avatar>
              {otherUser?.lastActiveAt && (Date.now() - new Date(otherUser.lastActiveAt).getTime() < 120000) && (
                <div className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
              )}
            </div>

            <div className="flex flex-col">
              {otherUserName ? (
                <span className="text-sm font-semibold leading-tight">{otherUserName}</span>
              ) : (
                <span className="h-4 w-24 animate-pulse rounded bg-muted" aria-label="Loading" />
              )}
              {otherUser?.lastActiveAt && (Date.now() - new Date(otherUser.lastActiveAt).getTime() < 120000) && (
                <span className="text-[10px] font-medium tracking-wide text-emerald-500">Online</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="chat-pattern pointer-events-none absolute inset-0 opacity-[0.02]" />

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 flex-1 overflow-y-auto px-4 py-6"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-2">
            {/* Scrolling to the top loads earlier messages; the button covers a
                short chat that doesn't scroll. */}
            {hasOlder && messages.length > 0 && (
              <div className="flex justify-center pb-2">
                <Button type="button" variant="ghost" size="sm" disabled={isLoadingOlder} onClick={loadOlder}>
                  {isLoadingOlder && <Loader2 className="size-3.5 animate-spin" />}
                  {isLoadingOlder ? "Loading earlier messages…" : "Load earlier messages"}
                </Button>
              </div>
            )}
            {isLoading && messages.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-6 animate-spin text-primary-ink/20" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                <MessageSquare className="mb-4 size-12" />
                <p className="text-sm font-semibold">{otherUserName ? `Wave to ${otherUserName}!` : "Say hello!"}</p>
                <p className="mt-1 text-xs">Start your conversation now.</p>
              </div>
            ) : (
              [...messages].reverse().map((message, index) => {
                const isMe = message.senderId === currentUserId;
                const isSelected = selectedIds.has(message.id);
                const canEdit = isMe
                  && !message.isDeleted
                  && Date.now() - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;

                return (
                  <div
                    key={message.id || index}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-lg py-0.5 transition-colors",
                      isMe ? "justify-end" : "justify-start",
                      isSelected && "bg-primary/10"
                    )}
                    onClick={() => isSelecting && toggleSelected(message.id)}
                  >
                    {isSelecting && !isMe && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelected(message.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Select message"
                      />
                    )}

                    <div className={cn("flex max-w-[80%] flex-col", isMe ? "items-end" : "items-start")}>
                      <div className={cn(
                        "relative rounded-3xl px-4 py-2.5 text-sm shadow-sm transition-all duration-200",
                        isMe
                          ? "rounded-tr-none bg-primary text-primary-foreground"
                          : "rounded-tl-none border border-border/10 bg-muted text-foreground"
                      )}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded-full opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100",
                                isMe ? "hover:bg-primary-foreground/15" : "hover:bg-background/70"
                              )}
                              onClick={(event) => event.stopPropagation()}
                              aria-label="Message options"
                            >
                              <ChevronDown className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={isMe ? "end" : "start"}>
                            {canEdit && (
                              <DropdownMenuItem onSelect={() => beginEdit(message)}>
                                <Pencil /> Edit
                              </DropdownMenuItem>
                            )}
                            {!message.isDeleted && (
                              <DropdownMenuItem onSelect={() => openForward([message.id])}>
                                <Forward /> Forward
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => toggleSelected(message.id)}>
                              <Check /> Select
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => openDelete([message.id])}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {message.isDeleted ? (
                          <p className="pr-5 italic opacity-70">This message was deleted</p>
                        ) : (
                          <>
                            {message.isForwarded && (
                              <div className="mb-0.5 flex items-center gap-1 text-[10px] italic opacity-65">
                                <Forward className="size-3" /> Forwarded
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words pr-5 leading-relaxed">{message.content}</p>
                          </>
                        )}

                        <div className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-[9px] font-medium opacity-60",
                          isMe ? "text-primary-foreground" : "text-muted-foreground"
                        )}>
                          {message.editedAt && !message.isDeleted && <span>edited</span>}
                          <span>{formatMessageTime(message.createdAt)}</span>
                          {isMe && deliveryIcon(message)}
                        </div>
                      </div>
                    </div>

                    {isSelecting && isMe && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelected(message.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Select message"
                      />
                    )}
                  </div>
                );
              })
            )}

            {isOtherTyping && (
              <div className="flex items-center gap-2 py-1 px-1 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="flex gap-1.5 items-center bg-muted/60 px-3 py-1.5 rounded-2xl border border-border/10 shadow-xs">
                  <span className="font-medium text-foreground/80 text-[11px]">{otherUserName || "Someone"}</span>
                  <span className="text-[11px]">is typing</span>
                  <span className="flex gap-0.5 ml-0.5">
                    <span className="size-1 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.3s]" />
                    <span className="size-1 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.15s]" />
                    <span className="size-1 rounded-full bg-primary/70 animate-bounce" />
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isNearBottom && messages.length > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                setIsNearBottom(true);
              }
            }}
            className="rounded-full shadow-lg border border-border/20 text-xs gap-1.5 h-8 px-3.5 bg-background/95 backdrop-blur-md hover:bg-background"
          >
            <ChevronDown className="size-3.5" />
            Jump to present
          </Button>
        </div>
      )}

      <div className="border-t p-4">
        {editingMessageId && (
          <div className="mx-auto mb-2 flex max-w-4xl items-center justify-between rounded-lg border-l-2 border-primary-ink bg-muted/40 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-primary-ink">Editing message</p>
              <p className="max-w-[70vw] truncate text-xs text-muted-foreground">{content}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={cancelEdit} aria-label="Cancel edit">
              <X className="size-4" />
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-4xl items-end gap-3">
          <div className="relative flex min-h-[44px] flex-1 items-center rounded-3xl bg-muted/40 px-4 py-1">
            <textarea
              placeholder="Write something..."
              value={content}
              onChange={handleInputChange}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (content.trim() && !isSending) handleSubmit(event);
                }
              }}
              rows={1}
              className="scrollbar-none min-h-[24px] max-h-[120px] w-full resize-none overflow-y-auto border-none bg-transparent px-0 py-2.5 text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:ring-0"
              ref={textareaRef}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!content.trim() || isSending}
            className="size-11 shrink-0 rounded-full shadow-lg transition-all active:scale-90"
            aria-label={editingMessageId ? "Save edit" : "Send message"}
          >
            {isSending ? <Loader2 className="size-5 animate-spin" /> : editingMessageId ? <Check className="size-5" /> : <Send className="size-5" />}
          </Button>
        </form>
      </div>

      <Dialog open={deleteOpen} onOpenChange={(open) => !isActing && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {actionMessageIds.length === 1 ? "message" : `${actionMessageIds.length} messages`}?</DialogTitle>
            <DialogDescription>
              Delete for you hides the selection only in your chat. Delete for everyone replaces messages for all participants.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" disabled={isActing} onClick={() => deleteMessages("me")}>
              Delete for me
            </Button>
            {canDeleteForEveryone && (
              <Button type="button" variant="destructive" disabled={isActing} onClick={() => deleteMessages("everyone")}>
                {isActing && <Loader2 className="size-4 animate-spin" />}
                Delete for everyone
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={forwardOpen} onOpenChange={(open) => !isActing && setForwardOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forward {actionMessageIds.length === 1 ? "message" : `${actionMessageIds.length} messages`}</DialogTitle>
            <DialogDescription>Select one or more chats to receive the messages.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No other chats available.</p>
            ) : conversations.map((conversation) => {
              const name = getUserDisplayName(conversation.otherUser);
              const checked = forwardTargets.has(conversation.id);
              return (
                <button
                  type="button"
                  key={conversation.id}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                  onClick={() => setForwardTargets((previous) => {
                    const next = new Set(previous);
                    if (next.has(conversation.id)) next.delete(conversation.id);
                    else next.add(conversation.id);
                    return next;
                  })}
                >
                  <Checkbox checked={checked} tabIndex={-1} aria-hidden />
                  <Avatar className="size-8">
                    <AvatarFallback>{getUserDisplayInitial(conversation.otherUser)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{name}</span>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isActing} onClick={() => setForwardOpen(false)}>Cancel</Button>
            <Button type="button" disabled={isActing || forwardTargets.size === 0} onClick={forwardMessages}>
              {isActing && <Loader2 className="size-4 animate-spin" />}
              Forward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .chat-pattern {
          background-image: radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0);
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
}
