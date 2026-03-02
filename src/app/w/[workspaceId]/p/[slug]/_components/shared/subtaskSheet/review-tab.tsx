"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Paperclip, Download } from "lucide-react";

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

interface ReviewTabProps {
    reviewComments: ReviewComment[];
    isLoadingReview: boolean;
}

/**
 * Review Tab Component
 * 
 * Displays review comments with:
 * - Author information
 * - Review text
 * - Attachments (if any)
 * - Download functionality
 */
export function ReviewTab({ reviewComments, isLoadingReview }: ReviewTabProps) {
    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <TabsContent value="review" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden">
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-muted/20">
                {isLoadingReview && reviewComments.length === 0 ? (
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
                                            <AvatarImage src={author?.image || ""} />
                                            <AvatarFallback className="text-xs">
                                                {author?.name?.[0] || "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold">
                                                {author?.name || "Unknown User"} {author?.surname || ""}
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
    );
}
