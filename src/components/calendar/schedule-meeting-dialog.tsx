"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useMeetingStore } from "@/lib/store/meeting-store";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  MapPin,
  Users,
  Briefcase,
  X,
  Check,
  Sparkles,
} from "lucide-react";

const MEETING_TYPES = [
  { value: "INTERNAL", label: "Internal Team Sync", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  { value: "CLIENT", label: "Client Meeting", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  { value: "PROJECT_REVIEW", label: "Project Review", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  { value: "ONE_ON_ONE", label: "1-on-1 Meeting", color: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  { value: "GENERAL", label: "All Hands / General", color: "bg-sky-500/10 text-sky-500 border-sky-500/20" },
] as const;

const COLOR_OPTIONS = [
  { value: "indigo", label: "Indigo", bg: "bg-indigo-500" },
  { value: "emerald", label: "Emerald", bg: "bg-emerald-500" },
  { value: "amber", label: "Amber", bg: "bg-amber-500" },
  { value: "rose", label: "Rose", bg: "bg-rose-500" },
  { value: "sky", label: "Sky", bg: "bg-sky-500" },
  { value: "violet", label: "Violet", bg: "bg-violet-500" },
];

export function ScheduleMeetingDialog({ workspaceId }: { workspaceId: string }) {
  const {
    isScheduleOpen,
    closeScheduleModal,
    scheduleDefaultDate,
    scheduleDefaultTime,
    addMeetingOptimistic,
  } = useMeetingStore();

  const { data: layoutData } = useWorkspaceLayout();
  const projects = layoutData?.projects || [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [meetingType, setMeetingType] = useState<any>("INTERNAL");
  const [color, setColor] = useState("indigo");
  const [projectId, setProjectId] = useState<string>("none");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Members list
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState("");

  useEffect(() => {
    if (!isScheduleOpen || !workspaceId) return;

    // Fetch members for attendees picker
    apiClient.workspaces
      .getMembers(workspaceId, 1, 200)
      .then((res) => setWorkspaceMembers(res?.workspaceMembers ?? []))
      .catch(() => setWorkspaceMembers([]));

    // Set initial date & time
    const initialDate = scheduleDefaultDate || new Date();
    const yyyy = initialDate.getFullYear();
    const mm = String(initialDate.getMonth() + 1).padStart(2, "0");
    const dd = String(initialDate.getDate()).padStart(2, "0");
    setDate(`${yyyy}-${mm}-${dd}`);

    if (scheduleDefaultTime) {
      setStartTime(scheduleDefaultTime);
      const [h, m] = scheduleDefaultTime.split(":").map(Number);
      const endH = String((h + 1) % 24).padStart(2, "0");
      setEndTime(`${endH}:${String(m).padStart(2, "0")}`);
    } else {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      now.setHours(now.getHours() + 1);
      const startH = String(now.getHours()).padStart(2, "0");
      setStartTime(`${startH}:00`);
      const endH = String((now.getHours() + 1) % 24).padStart(2, "0");
      setEndTime(`${endH}:00`);
    }

    // Reset form
    setTitle("");
    setDescription("");
    setLocation("");
    setMeetingUrl("");
    setMeetingType("INTERNAL");
    setColor("indigo");
    setProjectId("none");
    setSelectedAttendeeIds([]);
    setReminderMinutes(15);
  }, [isScheduleOpen, workspaceId, scheduleDefaultDate, scheduleDefaultTime]);

  const handleDurationClick = (durationMinutes: number) => {
    if (!startTime) return;
    const [h, m] = startTime.split(":").map(Number);
    const totalMinutes = h * 60 + m + durationMinutes;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    setEndTime(`${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);
  };

  const toggleAttendee = (userId: string) => {
    setSelectedAttendeeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please provide a meeting title");
      return;
    }

    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(`${date}T${endTime}:00`);

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      toast.error("Invalid date or time");
      return;
    }

    if (endDateTime <= startDateTime) {
      toast.error("End time must be after start time");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        workspaceId,
        title: title.trim(),
        description: description.trim() || undefined,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        location: location.trim() || undefined,
        meetingUrl: meetingUrl.trim() || undefined,
        type: meetingType,
        color,
        projectId: projectId === "none" ? undefined : projectId,
        reminderMinutes,
        attendeeUserIds: selectedAttendeeIds,
      };

      const meeting = await apiClient.meetings.createMeeting(payload);

      addMeetingOptimistic(meeting);
      toast.success("Meeting scheduled successfully!", {
        description: `${meeting.title} on ${startDateTime.toLocaleDateString()}`,
      });

      closeScheduleModal();
    } catch (error: any) {
      console.error("[SCHEDULE_MEETING_ERROR]", error);
      toast.error(error.message || "Failed to schedule meeting");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMembers = workspaceMembers.filter((m) => {
    const name = `${m.surname || ""} ${m.name || ""} ${m.email || ""}`.toLowerCase();
    return name.includes(memberSearch.toLowerCase());
  });

  return (
    <Dialog open={isScheduleOpen} onOpenChange={(open) => !open && closeScheduleModal()}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto p-6 rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <CalendarIcon className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Schedule Meeting</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Set up agenda, invite members, and configure reminders.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="meeting-title" className="text-xs font-semibold">
              Meeting Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="meeting-title"
              placeholder="e.g., Weekly Sprint Planning & Review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 rounded-xl"
              required
            />
          </div>

          {/* Type & Color */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Meeting Type</Label>
              <Select value={meetingType} onValueChange={setMeetingType}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {MEETING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Color Tag</Label>
              <div className="flex items-center gap-2 pt-1">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`size-7 rounded-full ${c.bg} transition-all flex items-center justify-center ${
                      color === c.value
                        ? "ring-2 ring-ring ring-offset-2 scale-110"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    title={c.label}
                  >
                    {color === c.value && <Check className="size-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Date and Time Row */}
          <div className="p-4 rounded-xl bg-muted/40 border space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Date
                </Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9 rounded-lg bg-background"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Start Time
                </Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-9 rounded-lg bg-background"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  End Time
                </Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-9 rounded-lg bg-background"
                  required
                />
              </div>
            </div>

            {/* Quick Duration Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="size-3" /> Duration:
              </span>
              {[15, 30, 45, 60, 90].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => handleDurationClick(mins)}
                  className="text-xs px-2.5 py-0.5 rounded-md bg-background border hover:border-primary/50 text-foreground transition-colors"
                >
                  {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Location / Meeting URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Video className="size-3.5 text-primary" /> Video Call Link
              </Label>
              <Input
                placeholder="e.g. meet.google.com/abc-xyz"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <MapPin className="size-3.5 text-primary" /> Physical Location
              </Label>
              <Input
                placeholder="e.g. Conference Room B or HQ"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          {/* Project & Reminder */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Briefcase className="size-3.5 text-primary" /> Associated Project
              </Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Select project (optional)" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="none">None / General Workspace</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reminder Intimation</Label>
              <Select
                value={String(reminderMinutes)}
                onValueChange={(val) => setReminderMinutes(Number(val))}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="5">5 minutes before</SelectItem>
                  <SelectItem value="10">10 minutes before</SelectItem>
                  <SelectItem value="15">15 minutes before</SelectItem>
                  <SelectItem value="30">30 minutes before</SelectItem>
                  <SelectItem value="60">1 hour before</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description / Agenda */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Agenda / Description</Label>
            <Textarea
              placeholder="Outline discussion points, action items, or agenda..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl min-h-[70px] resize-none"
            />
          </div>

          {/* Attendees Picker */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5 text-primary" /> Invite Team Members
              </span>
              <span className="text-[11px] text-muted-foreground">
                {selectedAttendeeIds.length} selected
              </span>
            </Label>

            {/* Selected Pills */}
            {selectedAttendeeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/30 border">
                {selectedAttendeeIds.map((uid) => {
                  const member = workspaceMembers.find((m) => m.userId === uid);
                  const name = member?.surname || member?.name || "Member";
                  return (
                    <Badge
                      key={uid}
                      variant="secondary"
                      className="gap-1 pl-2 pr-1.5 py-0.5 rounded-lg text-xs"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => toggleAttendee(uid)}
                        className="hover:text-destructive transition-colors ml-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Search and Picker Grid */}
            <div className="border rounded-xl p-2 space-y-2 max-h-[140px] overflow-y-auto">
              <Input
                placeholder="Search members to invite..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="h-8 text-xs rounded-lg mb-1"
              />
              <div className="space-y-1">
                {filteredMembers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No members found
                  </p>
                ) : (
                  filteredMembers.map((m) => {
                    const userId = m.userId;
                    if (!userId) return null;
                    const isSelected = selectedAttendeeIds.includes(userId);
                    const displayName = m.surname || m.name || "Member";

                    return (
                      <div
                        key={m.id}
                        onClick={() => toggleAttendee(userId)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                          isSelected
                            ? "bg-primary/10 text-primary font-medium"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="size-6">
                            <AvatarImage src={m.image || ""} />
                            <AvatarFallback className="text-[10px]">
                              {displayName[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate">{displayName}</p>
                            {m.designation && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {m.designation}
                              </p>
                            )}
                          </div>
                        </div>
                        {isSelected && <Check className="size-4 text-primary shrink-0" />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeScheduleModal}
              disabled={isSubmitting}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl gap-1.5 shadow-sm font-semibold"
            >
              <Sparkles className="size-4" />
              {isSubmitting ? "Scheduling..." : "Schedule Meeting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
