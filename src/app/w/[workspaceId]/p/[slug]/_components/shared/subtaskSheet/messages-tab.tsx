"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowUp, Loader2 } from "lucide-react";
import { createTaskCommentAction } from "@/actions/comment";

interface Comment {
    id: string;
    content: string;
    userId: string;
    taskId: string;
    user: {
        id: string;
        name: string;
        surname: string;
        email: string;
        image: string;
    };
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
    comments: Comment[];
    setComments: (comments: Comment[]) => void;
    currentUserId: string | null;
    isLoading: boolean;
}

/**
 * Messages Tab Component
 * 
 * Displays and manages task comments:
 * - Shows all comments in chat-style UI
 * - Allows sending new comments
 * - Auto-scrolls to bottom
 * - Distinguishes current user vs others
 */
export function MessagesTab({
    taskId,
    comments,
    setComments,
    currentUserId,
    isLoading,
}: MessagesTabProps) {
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [comments]);

    const handleSendMessage = async () => {
        if (!message.trim()) return;

        setIsSending(true);
        try {
            const result = await createTaskCommentAction(taskId, message.trim());

            if (result.success && result.comment) {
                setComments([...comments, result.comment as Comment]);
                setMessage("");
                toast.success("Comment added successfully");
            } else {
                toast.error(result.error || "Failed to add comment");
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
            {/* Chat Messages - Scrollable Area */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-muted/20 min-h-0">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : comments.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        No messages yet. Start the conversation!
                    </div>
                ) : (
                    <div className="space-y-3">
                        {comments.map((comment) => {
                            const isCurrentUser = currentUserId ? comment.userId === currentUserId : false;
                            return (
                                <div
                                    key={comment.id}
                                    className={cn(
                                        "flex gap-2 items-end",
                                        isCurrentUser ? "justify-end" : "justify-start"
                                    )}
                                >
                                    {!isCurrentUser && (
                                        <Avatar className="h-8 w-8 flex-shrink-0">
                                            <AvatarImage src={comment.user.image || ""} />
                                            <AvatarFallback className="text-xs">
                                                {comment.user.name[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                    )}
                                    <div className={cn(
                                        "flex flex-col gap-1 max-w-[75%]",
                                        isCurrentUser ? "items-end" : "items-start"
                                    )}>
                                        <div
                                            className={cn(
                                                "rounded-2xl px-4 py-2.5 shadow-sm",
                                                isCurrentUser
                                                    ? "bg-primary text-primary-foreground rounded-br-sm"
                                                    : "bg-background text-foreground rounded-bl-sm border"
                                            )}
                                        >
                                            {!isCurrentUser && (
                                                <p className="text-xs font-semibold mb-1 text-primary">
                                                    {comment.user.name} {comment.user.surname || ""}
                                                </p>
                                            )}
                                            <p className="text-sm leading-relaxed break-words">
                                                {comment.content}
                                            </p>
                                            <span className={cn(
                                                "text-xs mt-1 block",
                                                isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground"
                                            )}>
                                                {new Date(comment.createdAt).toLocaleTimeString('en-US', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                                {comment.isEdited && " • edited"}
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
