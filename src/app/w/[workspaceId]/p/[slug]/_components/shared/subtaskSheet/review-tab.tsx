"use client";
import { formatIST } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Paperclip, Download, ArrowRight } from "lucide-react";

interface ReviewComment {
    id: string;
    text: string;
    attachment: {
        fileName?: string;
        fileType?: string;
        fileSize?: number;
        url?: string;
        previousStatus?: string;
        targetStatus?: string;
    } | null;
    author: {
        id: string;
        name: string;
        surname: string;
        image: string;
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
        <TabsContent value="review" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-muted/20 min-h-0">
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
                            const author = review.author;
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
                                                {author?.surname || ""}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatIST(review.createdAt, "MMM d, yyyy h:mm a")}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                Review
                                            </Badge>
                                            {review.attachment?.previousStatus && review.attachment?.targetStatus && (
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium bg-muted px-1.5 py-0.5 rounded-sm whitespace-nowrap border">
                                                    {review.attachment.previousStatus.replace("_", " ")}
                                                    <ArrowRight className="h-3 w-3" />
                                                    {review.attachment.targetStatus.replace("_", " ")}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Review Text with Download Icon */}
                                    <div className="flex items-start gap-2 mb-2">
                                        {review.attachment?.fileName && review.attachment?.url ? (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="flex-shrink-0 mt-0.5 h-6 w-6 text-primary hover:text-primary hover:bg-primary/10"
                                                onClick={() => window.open(review.attachment!.url, '_blank')}
                                                title={`Download ${review.attachment.fileName}`}
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                        ) : (
                                            <div
                                                title="no file uploaded"
                                                className="flex-shrink-0 mt-0.5 h-6 w-6 flex items-center justify-center text-muted-foreground/30 cursor-help"
                                            >
                                                <Download className="h-4 w-4" />
                                            </div>
                                        )}
                                        <p className="text-sm leading-relaxed flex-1 break-words">
                                            {review.text}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </TabsContent>
    );
}
