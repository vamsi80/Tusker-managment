"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Tag, User, ArrowUp, Loader2, MessageSquare, FileCheck, Paperclip, Download } from "lucide-react";
import { FlatTaskType } from "@/data/task";
import { SubTaskType } from "@/data/task/get-project-tasks";
import { cn } from "@/lib/utils";
import { createTaskCommentAction, fetchCommentsAction, fetchReviewCommentsAction } from "@/actions/comment";
import { toast } from "sonner";

interface SubTaskDetailsSheetProps {
    subTask: FlatTaskType | SubTaskType[number];
    isOpen: boolean;
    onClose: () => void;
    disableUrlSync?: boolean;
    // Optional initial data from server component
    initialComments?: any[];
    initialReviewComments?: any[];
    currentUserId?: string | null;
}

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

interface ReviewComment {
    id: string;
    text: string;
    attachment: {
        fileName: string;
        fileType: string;
        fileSize: number;
        url: string;
    } | null;
    author: {
        id: string;
        user: {
            name: string;
            surname: string;
            image: string;
        };
    };
    createdAt: Date;
}

export function SubTaskDetailsSheet({
    subTask,
    isOpen,
    onClose,
    disableUrlSync = false,
    initialComments = [],
    initialReviewComments = [],
    currentUserId: initialCurrentUserId = null,
}: SubTaskDetailsSheetProps) {
    const [activeTab, setActiveTab] = useState<"messages" | "review">("messages");
    const [message, setMessage] = useState("");
    const [comments, setComments] = useState<Comment[]>(initialComments as Comment[]);
    const [reviewComments, setReviewComments] = useState<ReviewComment[]>(initialReviewComments as ReviewComment[]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingReview, setIsLoadingReview] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(initialCurrentUserId);

    const pathname = usePathname();
    const searchParams = useSearchParams();

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const loadedSubTaskIdRef = useRef<string>("");
    const reviewCommentsLoadedRef = useRef<boolean>(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [comments]);

    useEffect(() => {
        if (disableUrlSync) return;

        if (isOpen && subTask) {
            const params = new URLSearchParams(searchParams.toString());
            const subtaskIdentifier = subTask.taskSlug || subTask.id;
            params.set('subtask', subtaskIdentifier);
            const newUrl = `${pathname}?${params.toString()}`;

            window.history.pushState(null, '', newUrl);
        } else if (!isOpen) {
            const params = new URLSearchParams(searchParams.toString());
            if (params.has('subtask')) {
                params.delete('subtask');
                const newUrl = params.toString()
                    ? `${pathname}?${params.toString()}`
                    : pathname;

                window.history.pushState(null, '', newUrl);
            }
        }
    }, [isOpen, subTask, pathname, searchParams, disableUrlSync]);

    const loadComments = useCallback(async () => {
        if (!subTask) return;

        setIsLoading(true);
        try {
            const result = await fetchCommentsAction(subTask.id);
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
    }, [subTask]);

    const loadReviewComments = useCallback(async () => {
        if (!subTask) return;

        setIsLoadingReview(true);
        try {
            const result = await fetchReviewCommentsAction(subTask.id);
            if (result.success && result.reviewComments) {
                setReviewComments(result.reviewComments as ReviewComment[]);
            } else {
                toast.error(result.error || "Failed to load review comments");
            }
        } catch (error) {
            console.error("Error loading review comments:", error);
            toast.error("Failed to load review comments");
        } finally {
            setIsLoadingReview(false);
        }
    }, [subTask]);

    // Fetch comments only once when subtask changes or sheet opens
    // Review comments are loaded lazily when user switches to that tab
    useEffect(() => {
        if (subTask && isOpen && loadedSubTaskIdRef.current !== subTask.id) {
            loadedSubTaskIdRef.current = subTask.id;
            // Only load comments on open (not review comments)
            loadComments();
        }

        // Reset when sheet closes
        if (!isOpen) {
            loadedSubTaskIdRef.current = "";
        }
    }, [subTask?.id, isOpen, loadComments]);

    // Load review comments only when user switches to review tab
    // Use ref to prevent infinite loop
    useEffect(() => {
        if (activeTab === "review" && subTask && !reviewCommentsLoadedRef.current && !isLoadingReview) {
            // Check if we have initial data
            if (initialReviewComments.length > 0) {
                reviewCommentsLoadedRef.current = true;
            } else {
                // Load from server
                reviewCommentsLoadedRef.current = true;
                loadReviewComments();
            }
        }

        // Reset when subtask changes
        if (subTask?.id !== loadedSubTaskIdRef.current) {
            reviewCommentsLoadedRef.current = false;
        }
    }, [activeTab, subTask?.id, isLoadingReview, initialReviewComments.length]);

    const handleSendMessage = async () => {
        if (!message.trim() || !subTask) return;

        setIsSending(true);
        try {
            const result = await createTaskCommentAction(subTask.id, message.trim());

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

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                Details
                            </h3>

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

                {/* Tabbed Section - Fixed at Bottom */}
                <div className="border-t flex-shrink-0 flex flex-col h-[500px]">
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "messages" | "review")} className="flex flex-col h-full">
                        <div className="px-6 pt-3 border-b">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="messages" className="flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    Messages ({comments.length})
                                </TabsTrigger>
                                <TabsTrigger value="review" className="flex items-center gap-2">
                                    <FileCheck className="h-4 w-4" />
                                    Review ({reviewComments.length})
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Messages Tab */}
                        <TabsContent value="messages" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden">
                            {/* Chat Messages - Scrollable Area */}
                            <div className="flex-1 overflow-y-auto px-6 py-4 bg-muted/20">
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
                        </TabsContent>

                        {/* Review Tab */}
                        <TabsContent value="review" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden">
                            <div className="flex-1 overflow-y-auto px-6 py-4 bg-muted/20">
                                {isLoadingReview ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : reviewComments.length === 0 ? (
                                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                        No review comments yet.
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {reviewComments.map((review) => {
                                            const author = review.author.user;
                                            return (
                                                <div
                                                    key={review.id}
                                                    className="bg-background border rounded-lg p-4 shadow-sm"
                                                >
                                                    {/* Author Info */}
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarImage src={author.image || ""} />
                                                            <AvatarFallback className="text-xs">
                                                                {author.name[0]}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex-1">
                                                            <p className="text-sm font-semibold">
                                                                {author.name} {author.surname || ""}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {new Date(review.createdAt).toLocaleString('en-US', {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    year: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </p>
                                                        </div>
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                            Review
                                                        </Badge>
                                                    </div>

                                                    {/* Review Text */}
                                                    <p className="text-sm leading-relaxed mb-3">
                                                        {review.text}
                                                    </p>

                                                    {/* Attachment */}
                                                    {review.attachment && (
                                                        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md border">
                                                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">
                                                                    {review.attachment.fileName}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {formatFileSize(review.attachment.fileSize)}
                                                                </p>
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="flex-shrink-0"
                                                                onClick={() => {
                                                                    // TODO: Implement download
                                                                    window.open(review.attachment!.url, '_blank');
                                                                }}
                                                            >
                                                                <Download className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </SheetContent>
        </Sheet>
    );
}
