import { formatRelativeTime } from "@/lib/utils";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, ArrowRight, Link as LinkIcon } from "lucide-react";

interface Activity {
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
        surname: string;
    };
    createdAt: Date;
}

interface ActivityTabProps {
    activities: Activity[];
    isLoadingActivity: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
}

export function ActivityTab({ activities, isLoadingActivity, hasMore, onLoadMore }: ActivityTabProps) {
    const { ref, inView } = useInView({
        threshold: 0,
    });

    useEffect(() => {
        console.log("DEBUG [ActivityTab] Mounted");
        return () => console.log("DEBUG [ActivityTab] Unmounted");
    }, []);

    useEffect(() => {
        if (inView && hasMore && !isLoadingActivity) {
            console.log("DEBUG [ActivityTab] Loading more activities...");
            onLoadMore();
        }
    }, [inView, hasMore, isLoadingActivity, onLoadMore]);

    return (
        <TabsContent value="review" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-muted/20 min-h-0">
                {activities.length === 0 && !isLoadingActivity ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        No activity yet.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {activities.map((activity) => {
                            const author = activity.author;
                            return (
                                <div
                                    key={activity.id}
                                    className="bg-background border rounded-lg p-4 shadow-sm"
                                >
                                    {/* Author Info */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <Avatar className="size-8">
                                            <AvatarFallback className="text-xs">
                                                {author?.surname?.[0] || "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold">
                                                {author?.surname || ""}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {formatRelativeTime(activity.createdAt)}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                Activity
                                            </Badge>
                                            {activity.attachment && typeof activity.attachment === "object" && (activity.attachment as any).previousStatus && (activity.attachment as any).targetStatus && (
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium bg-muted px-1.5 py-0.5 rounded-sm whitespace-nowrap border animate-in fade-in duration-300">
                                                    {(activity.attachment as any).previousStatus.replace("_", " ")}
                                                    <ArrowRight className="size-3" />
                                                    {(activity.attachment as any).targetStatus.replace("_", " ")}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Activity Text and Attachment Link */}
                                    <div className="flex flex-col items-start gap-2.5 w-full">
                                        {(() => {
                                            const lines = activity.text?.split("\n") || [];
                                            const hasTransitionPrefix = lines[0]?.includes(" -> ");
                                            
                                            // Fallback to text header only if we don't have structured statuses
                                            const hasStructuredStatus = activity.attachment && 
                                                typeof activity.attachment === "object" && 
                                                (activity.attachment as any).previousStatus && 
                                                (activity.attachment as any).targetStatus;
                                                
                                            const showTransitionHeader = hasTransitionPrefix && !hasStructuredStatus;
                                            const commentText = hasTransitionPrefix ? lines.slice(1).join("\n").trim() : (activity.text || "").trim();

                                            return (
                                                <>
                                                     {showTransitionHeader && (
                                                         <p className="text-xs font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-md border border-dashed">
                                                             {lines[0]}
                                                         </p>
                                                     )}
                                                     {commentText && (
                                                         <p className="text-sm text-foreground bg-muted/20 border border-border/30 px-3.5 py-2.5 rounded-lg leading-relaxed break-words w-full shadow-inner font-medium">
                                                             {commentText}
                                                         </p>
                                                     )}
                                                </>
                                            );
                                        })()}

                                        {(() => {
                                            const attachment = activity.attachment;
                                            let attachmentUrl = "";
                                            if (attachment) {
                                                if (typeof attachment === "string") {
                                                    attachmentUrl = attachment;
                                                } else if (typeof attachment === "object") {
                                                    attachmentUrl = (attachment as any).url || (attachment as any).data || "";
                                                }
                                            }
                                            if (!attachmentUrl) return null;

                                            return (
                                                <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 px-3 py-2 rounded-md max-w-full overflow-hidden transition-all duration-200 shadow-sm w-max mt-1">
                                                    <LinkIcon className="size-4 flex-shrink-0 text-primary" />
                                                    <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:underline font-semibold tracking-wide">
                                                        {attachmentUrl}
                                                    </a>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Infinite Scroll Trigger */}
                        <div ref={ref} className="h-10 flex items-center justify-center">
                            {isLoadingActivity && (
                                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </TabsContent>
    );
}
