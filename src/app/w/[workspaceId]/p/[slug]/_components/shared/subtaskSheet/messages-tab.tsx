"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { cn, formatIST } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowUp, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

interface Comment {
    id: string;
    content: string;
    userId: string;
    taskId: string;
    user: {
        id: string;
        surname: string;
    };
    readBy?: { userId: string }[];
    isEdited: boolean;
    editedAt: Date;
    isDeleted: boolean;
    deletedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    replies?: Comment[];
}

interface MessagesTabProps {
    taskId: string;
    workspaceId: string;
    projectId: string;
    comments: Comment[];
    setComments: (comments: Comment[]) => void;
    currentUserId: string | null;
    isLoading: boolean;
}

export function MessagesTab({
    taskId,
    workspaceId,
    projectId,
    comments,
    setComments,
    currentUserId,
    isLoading,
}: MessagesTabProps) {
    const { data: session } = authClient.useSession();
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [comments]);

    const markReadRef = useRef<string>("");
    // Mark comments as read when tab is opened
    useEffect(() => {
        if (taskId && markReadRef.current !== taskId) {
            markReadRef.current = taskId;
            apiClient.comments.markAsRead(taskId).catch(console.error);
        }
    }, [taskId]);

    const handleSendMessage = async () => {
        if (!message.trim()) return;

        setIsSending(true);
        try {
            const { data, error } = await apiClient.comments.createComment({
                taskId,
                content: message.trim(),
                workspaceId,
                projectId
            });

            if (!error && data) {
                setComments([...comments, data as Comment]);
                setMessage("");
                toast.success("Comment added successfully");
            } else {
                toast.error(error?.message || "Failed to add comment");
            }
        } catch (error) {
            console.error("Error sending message:", error);
            toast.error("Failed to send message");
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <TabsContent value="messages" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden overflow-hidden">
            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
                {isLoading && comments.length === 0 ? (
                    <div className="space-y-4 w-full">
                        {[1, 2, 3, 4, 5].map((i) => {
                            const isCurrentUser = i % 2 !== 0; // Alternate between sent and received
                            return (
                                <div
                                    key={i}
                                    className={cn(
                                        "flex w-full mb-2",
                                        isCurrentUser ? "justify-end" : "justify-start"
                                    )}
                                >
                                    <div className={cn(
                                        "relative max-w-[85%] px-3 py-3 shadow-sm min-w-[160px] animate-pulse",
                                        isCurrentUser
                                            ? "bg-[#dcf8c6]/70 rounded-lg rounded-tr-none ml-auto"
                                            : "bg-white/70 rounded-lg rounded-tl-none mr-auto border border-black/5"
                                    )}>
                                        {/* Name skeleton for incoming */}
                                        {!isCurrentUser && (
                                            <div className="h-2.5 w-16 bg-[#075e54]/20 rounded mb-2" />
                                        )}

                                        {/* Text line skeletons */}
                                        <div className="pr-12 space-y-2">
                                            <div className={cn("h-3 rounded", isCurrentUser ? "bg-black/10 w-full" : "bg-black/5 w-full")} />
                                            {i % 3 === 0 && <div className={cn("h-3 rounded", isCurrentUser ? "bg-black/10 w-2/3" : "bg-black/5 w-2/3")} />}
                                        </div>

                                        {/* Timestamp skeleton */}
                                        <div className="absolute bottom-1 right-1.5">
                                            <div className={cn("h-2 w-8 rounded", isCurrentUser ? "bg-black/10" : "bg-black/5")} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : comments.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm bg-white/50 rounded-lg p-4 m-4">
                        No messages yet. Start the conversation!
                    </div>
                ) : (
                    <div className="space-y-2 w-full">
                        {comments.map((comment) => {
                            // Use session.user.id as the authoritative source — always reliable
                            const sessionUserId = session?.user?.id;
                            const isCurrentUser = sessionUserId
                                ? String(comment.userId) === String(sessionUserId) ||
                                String(comment.user?.id) === String(sessionUserId)
                                : currentUserId
                                    ? String(comment.userId) === String(currentUserId) ||
                                    String(comment.user?.id) === String(currentUserId)
                                    : false;

                            return (
                                <div
                                    key={comment.id}
                                    className={cn(
                                        "flex w-full mb-2",
                                        isCurrentUser ? "justify-end" : "justify-start"
                                    )}
                                >
                                    <div className={cn(
                                        "relative max-w-[85%] px-3 py-2 shadow-sm min-w-[80px]",
                                        isCurrentUser
                                            ? "bg-[#dcf8c6] text-[#303030] rounded-lg rounded-tr-none ml-auto"
                                            : "bg-white text-[#303030] rounded-lg rounded-tl-none mr-auto"
                                    )}>
                                        {/* Name for incoming messages */}
                                        {!isCurrentUser && (
                                            <p className="text-[11px] font-bold text-[#075e54] mb-0.5 leading-none">
                                                {comment.user.surname || "User"}
                                            </p>
                                        )}

                                        <div className="pr-12">
                                            <p className="text-[13.5px] leading-relaxed break-words whitespace-pre-wrap">
                                                {comment.content}
                                            </p>
                                        </div>

                                        {/* Meta info inside bubble */}
                                        <div className="absolute bottom-1 right-1.5 flex items-center gap-1">
                                            <span className="text-[9px] text-[#667781]">
                                                {formatIST(comment.createdAt, "h:mm a")}
                                                {comment.isEdited && " (edited)"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Message Input - Sticky at Bottom */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-t bg-background">
                <div className="flex items-center gap-3">
                    <Input
                        placeholder="Type your message..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="flex-1 h-11"
                    />
                    <Button
                        onClick={handleSendMessage}
                        disabled={!message.trim() || isSending}
                        size="icon"
                        className="rounded-full h-11 w-11 flex-shrink-0"
                    >
                        {isSending ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <ArrowUp className="h-5 w-5" />
                        )}
                    </Button>
                </div>
            </div>
        </TabsContent>
    );
}
