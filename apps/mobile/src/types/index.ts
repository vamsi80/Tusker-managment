/**
 * Trava Mobile Type Definitions
 */

// ─── Component Props ─────────────────────────────────────────────────────────

import { SharedValue } from "react-native-reanimated";

export interface User {
    id: string;
    email: string;
    name: string;
    displayName?: string;
    image?: string;
    surname?: string;
    phoneNumber?: string;
    jobTitle?: string;
    emailVerified: boolean;
    createdAt?: string;
}

export interface UserProfile {
    success: boolean;
    user: User;
    stats: {
        totalTasks: number;
        completedTasks: number;
        experienceDays: number;
        completionRate: number;
    };
}

export interface Session {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
}

export interface AuthResponse {
    user: User;
    session: Session;
    token?: string;
}

export interface Workspace {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    workspaceRole?: string;
    isProjectManager?: boolean;
}

export interface Project {
    id: string;
    name: string;
    workspaceId: string;
    color?: string;
    description?: string;
    canManageMembers?: boolean;
    projectManagers?: Array<{
        id: string;
        name: string;
        surname?: string;
        image?: string;
        email?: string;
        projectRole?: string;
    }>;
}

export interface WorkspaceMember {
    id: string;
    workspaceId: string;
    userId: string;
    workspaceRole: string;
    user: {
        id: string;
        name: string;
        email: string;
        image?: string;
        surname?: string;
    };
}

export type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "HOLD" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface Task {
    id: string;
    name: string;
    description?: string;
    status: TaskStatus;
    priority: TaskPriority;
    startDate?: string;
    dueDate?: string;
    projectId: string;
    workspaceId: string;
    parentTaskId: string | null;
    isParent: boolean;
    tagId?: string;
    assigneeId?: string;
    assigneeRole?: string;
    createdById?: string | null;
    dependsOnIds?: string[];
    days?: number | null;
    reviewerId?: string;
    assignee?: {
        id: string;
        name: string;
        surname: string;
    };
    reviewer?: {
        id: string;
        name: string;
        surname: string;
    };
    tag?: {
        name: string;
    };
    tags?: Array<{
        id: string;
        name: string;
    }>;
    project?: {
        name: string;
        color?: string;
    };
    subTasks?: Task[];
    parentTask?: {
        id: string;
        name: string;
    };
    commentCount?: number;
    subtaskCount?: number;
    completedSubtaskCount?: number;
    _count?: {
        Activity: number;
        subTasks: number;
    };
    createdAt?: string;
    position?: number;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
    Landing: undefined;
    HelpCenter: undefined;
    SignIn: undefined;
    SignUp: undefined;
    ForgotPassword: { email?: string } | undefined;
    Main: undefined;
    Notifications: undefined;
    AI: undefined;
    ProjectDetail: {
        projectId: string;
        projectName: string;
        projectColor?: string;
        initialTab?: string;
    };
    ProjectSubTasks: {
        parentId: string;
        parentName: string;
        projectId: string;
    };
    TaskDetail: {
        taskId: string;
        taskName: string;
        openMessages?: boolean;
        notificationTitle?: string;
        notificationBody?: string;
        isSubtask?: boolean;
        taskData?: any;
    };
    ManageTags: undefined;
    ChangePassword: undefined;
    MyProfile: undefined;
    TeamList: undefined;
    MySpace: undefined;
    DirectChat: {
        conversationId?: string;
        otherUserId: string;
        otherUserName: string;
        otherUserRole?: string;
    };
    Procurement: undefined;
    CreateIndent: {
        indent?: any;
    };
    IndentDetail: {
        indentId: string;
    };
    Attendance: undefined;
    Leave: undefined;
    AdminLeave: undefined;
    Calendar: undefined;
};

export type MainTabParamList = {
    Home: undefined | { screen: string };
    Projects: undefined | { screen: string };
    Attendance: undefined | { screen: string };
    Profile: undefined | { screen: string };
    Board: undefined;
    MyTasks: undefined;
    Create: undefined;
};

export interface RadialMenuProps {
    visible: boolean;
    type: string;
    onClose: () => void;
    onAction: (id: string) => void;
    /** Show the Procurement action — gated on the workspace's procurement:view capability. */
    procurementEnabled?: boolean;
}

export interface RadialActionItem {
    id: string;
    label: string;
    icon: any;
    color: string;
}

export interface DirectMessage {
    id: string;
    content: string;
    createdAt: string;
    userId: string;
    user: {
        id: string;
        name: string;
        surname?: string;
        image?: string;
    };
}

export interface Conversation {
    id: string;
    workspaceId: string;
    createdAt: string;
    updatedAt: string;
    participants: User[];
    messages: DirectMessage[];
}

export interface LeaveBalance {
    casualLeaveBalance: number;
    sickLeaveBalance: number;
    accruedDaysCount: number;
    casualLeaveAccrualDays: number;
    reportingManager?: string;
}

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
export type LeaveType = "CASUAL" | "SICK";

// Matches LeaveRequestWithMember (packages/core/src/types/leave.ts) — the API
// flattens the WorkspaceMember/user relation onto the row instead of nesting it.
export interface LeaveRequest {
    id: string;
    workspaceMemberId: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: LeaveStatus;
    type: LeaveType;
    createdAt: string;
    surname: string;
    email: string | null;
    reportToId: string | null;
    casualLeaveBalance: number;
    sickLeaveBalance: number;
    processedByName?: string | null;
}

// ─── Calendar / Meetings ────────────────────────────────────────────────────
// Mirrors packages/api-client/src/meetings.ts (MeetingUI, CalendarLayerData) —
// mobile keeps its own copy rather than depending on @tusker/api-client,
// matching how LeaveRequest/Workspace/etc. are duplicated above.

export type MeetingType = "INTERNAL" | "CLIENT" | "PROJECT_REVIEW" | "ONE_ON_ONE" | "GENERAL";
export type MeetingStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type RsvpStatus = "INVITED" | "ACCEPTED" | "DECLINED" | "TENTATIVE";

export interface MeetingAttendee {
    id: string;
    userId: string;
    status: RsvpStatus;
    user?: {
        id: string;
        name: string;
        surname?: string | null;
        email: string;
        image?: string | null;
    };
}

export interface Meeting {
    id: string;
    workspaceId: string;
    title: string;
    description?: string | null;
    startTime: string;
    endTime: string;
    location?: string | null;
    meetingUrl?: string | null;
    type: MeetingType;
    status: MeetingStatus;
    color?: string | null;
    reminderMinutes: number;
    isAllDay: boolean;
    organizerId: string;
    projectId?: string | null;
    createdAt: string;
    updatedAt: string;
    organizer?: {
        id: string;
        name: string;
        surname?: string | null;
        email: string;
        image?: string | null;
    };
    project?: {
        id: string;
        name: string;
        slug: string;
        color: string;
    } | null;
    attendees: MeetingAttendee[];
}

export interface CalendarLayerData {
    meetings: Meeting[];
    taskDeadlines: Array<{
        id: string;
        title: string;
        date: string;
        status: string;
        taskSlug: string;
        projectId: string;
    }>;
    publicHolidays: Array<{
        id: string;
        name: string;
        date: string;
    }>;
    leaves: Array<{
        id: string;
        member: string;
        type: string;
        startDate: string;
        endDate: string;
    }>;
}

export interface CreateMeetingPayload {
    workspaceId: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    location?: string;
    meetingUrl?: string;
    type?: MeetingType;
    status?: MeetingStatus;
    color?: string;
    reminderMinutes?: number;
    isAllDay?: boolean;
    projectId?: string;
    attendeeUserIds?: string[];
}
