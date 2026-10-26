import { createNavigationContainerRef, type LinkingOptions } from "@react-navigation/native";
import * as Linking from "expo-linking";
import type { RootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Deep links: dravaapp://…, the older travaapp://… and tusker://… schemes, and
 * the web's own URLs, so an emailed invitation or a shared task link opens the
 * matching native screen.
 */
export const linking: LinkingOptions<RootStackParamList> = {
    prefixes: [
        Linking.createURL("/", { scheme: "dravaapp" }),
        "dravaapp://",
        "travaapp://",
        "tusker://",
        "https://tusker-managment.vercel.app",
    ],
    config: {
        screens: {
            SignIn: "sign-in",
            SignUp: "sign-up",
            ForgotPassword: "forgot-password",
            AcceptInvitation: "accept-invitation",
            CreateWorkspace: "create-workspace",
            Main: {
                screens: {
                    Home: "w/:workspaceId",
                    Inbox: "w/:workspaceId/myspace/conversations",
                },
            },
            Tasks: "w/:workspaceId/tasks",
            Calendar: "w/:workspaceId/calendar",
            Team: "w/:workspaceId/team",
            Procurement: "w/:workspaceId/procurement",
            Vendors: "w/:workspaceId/vendors",
            Settings: "w/:workspaceId/settings",
            MySpace: "w/:workspaceId/myspace",
            MyBoard: "w/:workspaceId/my-board",
            Reports: "w/:workspaceId/reports",
            Notifications: "w/:workspaceId/notifications",
            Chat: "w/:workspaceId/myspace/conversations/:conversationId",
            IndentDetail: "w/:workspaceId/procurement/indents/:indentId",
            PurchaseOrder: "w/:workspaceId/procurement/pos/:poId",
            VendorDetail: "w/:workspaceId/vendors/:vendorId",
            ProjectSettings: "w/:workspaceId/projectSettings/:projectId",
        },
    },
};
