import type { NavigatorScreenParams } from "@react-navigation/native";

/**
 * Route map. The app shell is a bottom tab bar (Home, Projects, Inbox, More)
 * with a centre Create button; every other web page is a stack screen pushed
 * above the tabs so it gets a native back gesture.
 */
export type MainTabParamList = {
    Home: undefined;
    Projects: undefined;
    /** The create button's slot; never shown as a screen. */
    Create: undefined;
    Inbox: { tab?: "notifications" | "messages" } | undefined;
    More: undefined;
};

export type RootStackParamList = {
    // Auth (apps/web/src/app/(auth))
    SignIn: undefined;
    SignUp: undefined;
    VerifyRequest: { email: string; surname?: string; phoneNumber?: string };
    ForgotPassword: { email?: string } | undefined;
    ResetPassword: { email: string };
    AcceptInvitation: { token?: string; email?: string } | undefined;
    CreateWorkspace: undefined;

    // Workspace
    Main: NavigatorScreenParams<MainTabParamList> | undefined;
    Tasks: { view?: "list" | "kanban" | "gantt"; assigneeId?: string; assigneeName?: string; status?: string[] } | undefined;
    Calendar: undefined;
    Team: { tab?: "members" | "attendance" | "leaves" | "points" | "settings" } | undefined;
    Procurement: { tab?: "dashboard" | "indents" | "rfqs" | "materials" | "pos" } | undefined;
    Vendors: undefined;
    Settings: { tab?: "general" | "departments" | "permissions" | "activity" } | undefined;
    MySpace: { tab?: "info" | "todo" } | undefined;
    MyBoard: undefined;
    Reports: undefined;
    Notifications: undefined;
    WorkspaceInfo: undefined;
    Profile: undefined;
    ChangePassword: undefined;
    Travis: { projectId?: string; taskId?: string } | undefined;

    // Projects (/p/[slug], createProject, editProject, projectSettings)
    Project: { projectId: string; name?: string; view?: "dashboard" | "list" | "kanban" | "gantt" | "materials" | "procurement" | "activity" };
    ProjectForm: { projectId?: string } | undefined;
    ProjectSettings: { projectId: string };
    ProjectDue: { projectId: string; range?: "this" | "next" };
    MyTasks: { range?: "delayed" | "today" | "week" } | undefined;
    TaskDetail: { taskId: string; title?: string };

    // Messages (/myspace/conversations/[conversationId])
    Chat: { conversationId: string; name?: string; userId?: string };
    NewChat: undefined;

    // Procurement
    IndentDetail: { indentId: string };
    IndentForm: { projectId?: string; taskId?: string; raisedInProject?: boolean } | undefined;
    RfqCreate: { lineItemId?: string } | undefined;
    PurchaseOrder: { poId: string };
    PurchaseOrderForm: { indentId?: string } | undefined;

    // Vendors
    VendorDetail: { vendorId: string };
    VendorForm: { vendorId?: string } | undefined;
};

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace ReactNavigation {
        interface RootParamList extends RootStackParamList {}
    }
}
