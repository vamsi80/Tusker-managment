"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { apiClient } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  Users,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Briefcase,
} from "lucide-react";

export function MeetingDetailsDialog({ workspaceId }: { workspaceId: string }) {
  const {
    selectedMeeting,
    isDetailsOpen,
    closeDetailsModal,
    removeMeetingOptimistic,
    updateRsvpOptimistic,
    updateMeetingOptimistic,
  } = useMeetingStore();

  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!selectedMeeting) return null;

  const isOrganizer = selectedMeeting.organizerId === currentUserId;
  const currentAttendee = selectedMeeting.attendees?.find((a) => a.userId === currentUserId);

  const start = new Date(selectedMeeting.startTime);
  const end = new Date(selectedMeeting.endTime);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

  const copyDetails = async () => {
    const text = [
      `📅 Meeting: ${selectedMeeting.title}`,
      `⏰ When: ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      selectedMeeting.meetingUrl ? `🔗 Link: ${selectedMeeting.meetingUrl}` : "",
      selectedMeeting.location ? `📍 Location: ${selectedMeeting.location}` : "",
      selectedMeeting.description ? `📝 Agenda: ${selectedMeeting.description}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Meeting details copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRsvp = async (status: "ACCEPTED" | "DECLINED" | "TENTATIVE") => {
    if (!currentUserId) return;
    updateRsvpOptimistic(selectedMeeting.id, currentUserId, status);
    try {
      await apiClient.meetings.rsvpMeeting(selectedMeeting.id, status);
      toast.success(`RSVP updated: ${status.toLowerCase()}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update RSVP");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to cancel and delete this meeting?")) return;
    setIsDeleting(true);
    try {
      removeMeetingOptimistic(selectedMeeting.id);
      await apiClient.meetings.deleteMeeting(selectedMeeting.id, workspaceId);
      toast.success("Meeting deleted");
      closeDetailsModal();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete meeting");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED") => {
    try {
      const updated = await apiClient.meetings.updateMeeting(selectedMeeting.id, workspaceId, { status });
      updateMeetingOptimistic(updated);
      toast.success(`Meeting status changed to ${status.toLowerCase().replace("_", " ")}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

  return (
    <Dialog open={isDetailsOpen} onOpenChange={(open) => !open && closeDetailsModal()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto p-6 rounded-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs font-semibold capitalize">
                  {selectedMeeting.type.replace(/_/g, " ").toLowerCase()}
                </Badge>
                <Badge
                  variant={
                    selectedMeeting.status === "COMPLETED"
                      ? "secondary"
                      : selectedMeeting.status === "IN_PROGRESS"
                      ? "default"
                      : selectedMeeting.status === "CANCELLED"
                      ? "destructive"
                      : "outline"
                  }
                  className="text-xs capitalize"
                >
                  {selectedMeeting.status.replace(/_/g, " ").toLowerCase()}
                </Badge>
                {selectedMeeting.project && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1 border-primary/20">
                    <Briefcase className="size-3 text-primary" />
                    {selectedMeeting.project.name}
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-2xl font-bold pt-1">{selectedMeeting.title}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="sr-only">Meeting details and attendee management</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Time and Duration Card */}
          <div className="p-4 rounded-xl bg-muted/40 border space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="size-4 text-primary" />
              <span>
                {start.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pl-6">
              <div className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                <span>
                  {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                  {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <span className="font-medium bg-background px-2 py-0.5 rounded border">
                {durationMinutes >= 60 ? `${(durationMinutes / 60).toFixed(1)}h` : `${durationMinutes}m`}
              </span>
            </div>
          </div>

          {/* Quick Action: Join Call Button */}
          {selectedMeeting.meetingUrl && (
            <div className="flex items-center gap-2">
              <Button
                asChild
                className="flex-1 rounded-xl h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2 shadow-sm"
              >
                <a href={selectedMeeting.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <Video className="size-4" />
                  Join Video Call
                  <ExternalLink className="size-3.5 ml-auto opacity-70" />
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={copyDetails}
                className="rounded-xl h-11 px-3 border"
                title="Copy details"
              >
                {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              </Button>
            </div>
          )}

          {/* Location */}
          {selectedMeeting.location && (
            <div className="flex items-center gap-2.5 text-sm p-3 rounded-xl bg-card border">
              <MapPin className="size-4 text-primary shrink-0" />
              <span className="text-muted-foreground">Location:</span>
              <span className="font-medium text-foreground">{selectedMeeting.location}</span>
            </div>
          )}

          {/* Description / Agenda */}
          {selectedMeeting.description && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Agenda / Notes
              </h4>
              <p className="text-sm p-3.5 rounded-xl bg-muted/20 border whitespace-pre-line text-foreground/90">
                {selectedMeeting.description}
              </p>
            </div>
          )}

          {/* RSVP Selector for current user */}
          {currentAttendee && (
            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-primary">Your Attendance:</span>
              <div className="flex items-center gap-1">
                {(["ACCEPTED", "TENTATIVE", "DECLINED"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleRsvp(status)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                      currentAttendee.status === status
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-background hover:bg-muted text-muted-foreground border"
                    }`}
                  >
                    {status === "ACCEPTED" ? "Going" : status === "TENTATIVE" ? "Maybe" : "Decline"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Attendees List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" /> Participants ({selectedMeeting.attendees?.length || 0})
              </span>
              <span>RSVP</span>
            </div>
            <div className="divide-y border rounded-xl overflow-hidden max-h-[160px] overflow-y-auto">
              {selectedMeeting.attendees?.map((att) => {
                const displayName = att.user?.surname || att.user?.name || "Participant";
                const isHost = att.userId === selectedMeeting.organizerId;

                return (
                  <div key={att.id} className="flex items-center justify-between p-2.5 text-xs bg-card">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="size-7">
                        <AvatarImage src={att.user?.image || ""} />
                        <AvatarFallback className="text-[10px]">
                          {displayName[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate flex items-center gap-1.5">
                          {displayName}
                          {isHost && (
                            <Badge variant="secondary" className="text-[9px] py-0 px-1 font-normal">
                              Host
                            </Badge>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">{att.user?.email}</p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        att.status === "ACCEPTED"
                          ? "default"
                          : att.status === "DECLINED"
                          ? "destructive"
                          : "outline"
                      }
                      className="text-[10px] capitalize shrink-0"
                    >
                      {att.status.toLowerCase()}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t">
          {isOrganizer ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-xl gap-1.5 text-xs"
              >
                <Trash2 className="size-3.5" />
                {isDeleting ? "Deleting..." : "Delete Meeting"}
              </Button>
              {selectedMeeting.status !== "COMPLETED" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange("COMPLETED")}
                  className="rounded-xl text-xs"
                >
                  Mark Completed
                </Button>
              )}
            </div>
          ) : (
            <div />
          )}

          <Button variant="outline" onClick={closeDetailsModal} className="rounded-xl text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
