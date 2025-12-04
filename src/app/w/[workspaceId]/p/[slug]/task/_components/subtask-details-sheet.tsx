"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Tag, User, Send, X } from "lucide-react";
import { SubTaskType } from "@/app/data/task/get-project-tasks";

interface SubTaskDetailsSheetProps {
    subTask: SubTaskType[number] | null;
    isOpen: boolean;
    onClose: () => void;
}

interface Comment {
    id: string;
    user: {
        name: string;
        image: string | null;
    };
    content: string;
    createdAt: Date;
}

export function SubTaskDetailsSheet({ subTask, isOpen, onClose }: SubTaskDetailsSheetProps) {
    const [comment, setComment] = useState("");
    const [comments, setComments] = useState<Comment[]>([
        // Mock data - replace with actual data from your API
        {
            id: "1",
            user: { name: "John Doe", image: null },
            content: "This looks good! Let's proceed with this approach.",
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        },
    ]);

    const handleSendComment = () => {
        if (!comment.trim()) return;

        // TODO: Call API to save comment
        const newComment: Comment = {
            id: Date.now().toString(),
            user: { name: "You", image: null },
            content: comment,
            createdAt: new Date(),
        };

        setComments([...comments, newComment]);
        setComment("");
    };

    if (!subTask) return null;

    const assignee = subTask.assignee?.workspaceMember?.user;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
                <SheetHeader className="px-6 pt-6 pb-4 border-b">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <SheetTitle className="text-2xl font-semibold">
                                {subTask.name}
                            </SheetTitle>
                            <SheetDescription className="mt-1">
                                Subtask Details & Activity
                            </SheetDescription>
                        </div>
                        {/* <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8"
                        >
                            <X className="h-4 w-4" />
                        </Button> */}
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-1">
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

                        <Separator />

                        {/* Comments Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                Activity
                            </h3>

                            {/* Comments List */}
                            <div className="space-y-4">
                                {comments.map((commentItem) => (
                                    <div key={commentItem.id} className="flex gap-3">
                                        <Avatar className="h-8 w-8 mt-1">
                                            <AvatarImage src={commentItem.user.image || ""} />
                                            <AvatarFallback>
                                                {commentItem.user.name[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold">
                                                    {commentItem.user.name}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatRelativeTime(commentItem.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3">
                                                {commentItem.content}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Add Comment */}
                            <div className="space-y-3 pt-2">
                                <Textarea
                                    placeholder="Add a comment..."
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    className="min-h-[100px] resize-none"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                            handleSendComment();
                                        }
                                    }}
                                />
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">
                                        Press ⌘+Enter to send
                                    </span>
                                    <Button
                                        onClick={handleSendComment}
                                        disabled={!comment.trim()}
                                        size="sm"
                                    >
                                        <Send className="h-4 w-4 mr-2" />
                                        Send
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return date.toLocaleDateString('en-GB');
}
