import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import type { MeetingUI, CalendarLayerData } from "@/lib/api-client/meetings";

export type CalendarViewMode = "month" | "week" | "agenda";

interface MeetingStoreState {
  meetings: MeetingUI[];
  taskDeadlines: CalendarLayerData["taskDeadlines"];
  publicHolidays: CalendarLayerData["publicHolidays"];
  leaves: CalendarLayerData["leaves"];
  isLoading: boolean;
  workspaceId: string | null;

  // View state
  activeView: CalendarViewMode;
  selectedDate: Date;
  activeLayers: {
    meetings: boolean;
    tasks: boolean;
    holidays: boolean;
    leaves: boolean;
  };
  filterType: string;
  searchQuery: string;

  // Modals state
  isScheduleOpen: boolean;
  scheduleDefaultDate: Date | null;
  scheduleDefaultTime: string | null;
  selectedMeeting: MeetingUI | null;
  isDetailsOpen: boolean;

  // Actions
  setActiveView: (view: CalendarViewMode) => void;
  setSelectedDate: (date: Date) => void;
  toggleLayer: (layer: keyof MeetingStoreState["activeLayers"]) => void;
  setFilterType: (type: string) => void;
  setSearchQuery: (query: string) => void;
  openScheduleModal: (defaults?: { date?: Date; time?: string }) => void;
  closeScheduleModal: () => void;
  openDetailsModal: (meeting: MeetingUI) => void;
  closeDetailsModal: () => void;

  // Data Actions
  fetchCalendarData: (workspaceId: string, range?: { start?: string; end?: string }) => Promise<void>;
  addMeetingOptimistic: (meeting: MeetingUI) => void;
  updateMeetingOptimistic: (meeting: MeetingUI) => void;
  removeMeetingOptimistic: (meetingId: string) => void;
  updateRsvpOptimistic: (meetingId: string, userId: string, status: "INVITED" | "ACCEPTED" | "DECLINED" | "TENTATIVE") => void;
  handleRealtimeSync: (payload: any) => void;
}

export const useMeetingStore = create<MeetingStoreState>((set, get) => ({
  meetings: [],
  taskDeadlines: [],
  publicHolidays: [],
  leaves: [],
  isLoading: false,
  workspaceId: null,

  activeView: "month",
  selectedDate: new Date(),
  activeLayers: {
    meetings: true,
    tasks: true,
    holidays: true,
    leaves: true,
  },
  filterType: "ALL",
  searchQuery: "",

  isScheduleOpen: false,
  scheduleDefaultDate: null,
  scheduleDefaultTime: null,
  selectedMeeting: null,
  isDetailsOpen: false,

  setActiveView: (view) => set({ activeView: view }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  toggleLayer: (layer) =>
    set((state) => ({
      activeLayers: {
        ...state.activeLayers,
        [layer]: !state.activeLayers[layer],
      },
    })),
  setFilterType: (filterType) => set({ filterType }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  openScheduleModal: (defaults) =>
    set({
      isScheduleOpen: true,
      scheduleDefaultDate: defaults?.date || get().selectedDate,
      scheduleDefaultTime: defaults?.time || null,
    }),
  closeScheduleModal: () =>
    set({
      isScheduleOpen: false,
      scheduleDefaultDate: null,
      scheduleDefaultTime: null,
    }),

  openDetailsModal: (meeting) =>
    set({
      selectedMeeting: meeting,
      isDetailsOpen: true,
    }),
  closeDetailsModal: () =>
    set({
      selectedMeeting: null,
      isDetailsOpen: false,
    }),

  fetchCalendarData: async (workspaceId: string, range) => {
    if (!workspaceId) return;
    set({ isLoading: true, workspaceId });

    try {
      const data = await apiClient.meetings.getMeetings({
        workspaceId,
        startDate: range?.start,
        endDate: range?.end,
        includeLayers: true,
      });

      set({
        meetings: data.meetings || [],
        taskDeadlines: data.taskDeadlines || [],
        publicHolidays: data.publicHolidays || [],
        leaves: data.leaves || [],
        isLoading: false,
      });
    } catch (error) {
      console.error("[MEETING_STORE] Failed to fetch calendar data:", error);
      set({ isLoading: false });
    }
  },

  addMeetingOptimistic: (meeting) => {
    set((state) => ({
      meetings: [meeting, ...state.meetings.filter((m) => m.id !== meeting.id)],
    }));
  },

  updateMeetingOptimistic: (updated) => {
    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
      selectedMeeting: state.selectedMeeting?.id === updated.id ? { ...state.selectedMeeting, ...updated } : state.selectedMeeting,
    }));
  },

  removeMeetingOptimistic: (meetingId) => {
    set((state) => ({
      meetings: state.meetings.filter((m) => m.id !== meetingId),
      selectedMeeting: state.selectedMeeting?.id === meetingId ? null : state.selectedMeeting,
      isDetailsOpen: state.selectedMeeting?.id === meetingId ? false : state.isDetailsOpen,
    }));
  },

  updateRsvpOptimistic: (meetingId, userId, status) => {
    set((state) => {
      const updateAttendees = (meeting: MeetingUI) => {
        if (meeting.id !== meetingId) return meeting;
        const exists = meeting.attendees.some((a) => a.userId === userId);
        const newAttendees = exists
          ? meeting.attendees.map((a) => (a.userId === userId ? { ...a, status } : a))
          : [...meeting.attendees, { id: `temp-${Date.now()}`, userId, status }];
        return { ...meeting, attendees: newAttendees };
      };

      return {
        meetings: state.meetings.map(updateAttendees),
        selectedMeeting: state.selectedMeeting ? updateAttendees(state.selectedMeeting) : null,
      };
    });
  },

  handleRealtimeSync: (data) => {
    const action = (data.action || data.type || "").toUpperCase();
    const payload = data.record || data.newData || data.payload;

    if (!payload) return;

    if (action.includes("CREATE") || action === "MEETING_SCHEDULED") {
      get().addMeetingOptimistic(payload);
    } else if (action.includes("DELETE")) {
      const id = payload.id || data.meetingId;
      if (id) get().removeMeetingOptimistic(id);
    } else if (action.includes("UPDATE") || action === "RSVP_UPDATE") {
      get().updateMeetingOptimistic(payload);
    }
  },
}));
