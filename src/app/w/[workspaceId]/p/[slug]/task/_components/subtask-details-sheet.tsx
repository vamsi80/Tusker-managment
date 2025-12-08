"use client";

import { useState, useRef, useEffect } from "react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Tag, User, ArrowUp, Loader2 } from "lucide-react";
import { SubTaskType } from "@/app/data/task/get-project-tasks";
import { cn } from "@/lib/utils";
import { createTaskComment, fetchTaskComments } from "@/app/actions/comment-actions";
import { toast } from "sonner";

interface SubTaskDetailsSheetProps {
    subTask: SubTaskType[number] | null;
    isOpen: boolean;
    onClose: () => void;
}

interface Comment {
    id: string;
    content: string;
    userId: string;
    taskId: string;
    user: {
        id: string;
        name: string;
        surname: string | null;
        email: string;
        image: string | null;
    };
    isEdited: boolean;
    editedAt: Date | null;
    isDeleted: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    replies?: Comment[];
}

export function SubTaskDetailsSheet({ subTask, isOpen, onClose }: SubTaskDetailsSheetProps) {
    const [message, setMessage] = useState("");
    const [comments, setComments] = useState<Comment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [comments]);

    // Fetch comments when subtask changes or sheet opens
    useEffect(() => {
        if (subTask && isOpen) {
            loadComments();
        }
    }, [subTask?.id, isOpen]);

    const loadComments = async () => {
        if (!subTask) return;

        setIsLoading(true);
        try {
            const result = await fetchTaskComments(subTask.id);
            if (result.success && result.comments) {
                setComments(result.comments as Comment[]);
                if (result.currentUserId) {
                    setCurrentUserId(result.currentUserId);
                }
            } else {
                toast.error(result.error || "Failed to load comments");
            }
        } catch (error) {
            console.error("Error loading comments:", error);
            toast.error("Failed to load comments");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!message.trim() || !subTask) return;

        setIsSending(true);
        try {
            const result = await createTaskComment(subTask.id, message.trim());

            if (result.success && result.comment) {
                // Optimistically add the comment to the UI
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

    if (!subTask) return null;

    const assignee = subTask.assignee?.workspaceMember?.user;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col h-full">
                <SheetHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <SheetTitle className="text-2xl font-semibold">
                                {subTask.name}
                            </SheetTitle>
                            <SheetDescription className="mt-1">
                                Subtask Details & Activity
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-1 overflow-y-auto">
                    <div className="px-6 py-6 space-y-6">
                        {/* Details Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                Details
                            </h3>

                            {/* Assignee */}
                            <div className="flex items-center gap-3">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium w-24">Assignee</span>
                                {assignee ? (
                                    <div className="flex items-center gap-2">
                                        <Avatar className="h-6 w-6">
                                            <AvatarImage src={assignee.image || ""} />
                                            <AvatarFallback>{assignee.name?.[0]}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm">{assignee.name}</span>
                                    </div>
                                ) : (
                                    <span className="text-sm text-muted-foreground">Unassigned</span>
                                )}
                            </div>

                            {/* Due Date */}
                            <div className="flex items-center gap-3">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium w-24">Due Date</span>
                                {subTask.startDate ? (
                                    <span className="text-sm">
                                        {new Date(subTask.startDate).toLocaleDateString('en-GB')}
                                    </span>
                                ) : (
                                    <span className="text-sm text-muted-foreground">No due date</span>
                                )}
                            </div>

                            {/* Tag */}
                            <div className="flex items-center gap-3">
                                <Tag className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium w-24">Tag</span>
                                {subTask.tag ? (
                                    <Badge variant="secondary" className="rounded-md">
                                        {subTask.tag}
                                    </Badge>
                                ) : (
                                    <span className="text-sm text-muted-foreground">No tag</span>
                                )}
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                {/* Chat Section - Fixed at Bottom, Full Width */}
                <div className="border-t flex-shrink-0 flex flex-col h-[500px]">
                    <div className="px-6 py-3 border-b">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Activity ({comments.length})
                        </h3>
                    </div>

                    {/* Chat Messages - Scrollable Area */}
                    <div className="flex-1 overflow-y-auto px-6 py-4 bg-muted/20">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : comments.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                No comments yet. Start the conversation!
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

                    {/* Message Input - Full Width at Bottom */}
                    <div className="px-6 py-4 border-t bg-background">
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
                </div>
            </SheetContent>
        </Sheet>
    );
}
