import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import * as SplashScreen from "expo-splash-screen";
import { useTheme } from "../theme/ThemeProvider";
import { useAuth } from "../providers/AuthProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { navigationRef, linking } from "./linking";
import { TabBar } from "./TabBar";
import type { MainTabParamList, RootStackParamList } from "./types";
import { DravaLockup } from "../components/brand/Drava";

import { SignInScreen } from "../screens/auth/SignInScreen";
import { SignUpScreen } from "../screens/auth/SignUpScreen";
import { VerifyRequestScreen } from "../screens/auth/VerifyRequestScreen";
import { ForgotPasswordScreen } from "../screens/auth/ForgotPasswordScreen";
import { ResetPasswordScreen } from "../screens/auth/ResetPasswordScreen";
import { AcceptInvitationScreen } from "../screens/auth/AcceptInvitationScreen";
import { CreateWorkspaceScreen } from "../screens/auth/CreateWorkspaceScreen";

import { HomeScreen } from "../screens/home/HomeScreen";
import { InboxScreen } from "../screens/inbox/InboxScreen";
import { MoreScreen } from "../screens/more/MoreScreen";
import { ProjectsScreen } from "../screens/projects/ProjectsScreen";
import { CalendarScreen } from "../screens/calendar/CalendarScreen";
import { TeamScreen } from "../screens/team/TeamScreen";
import { TasksScreen } from "../screens/tasks/TasksScreen";
import { TaskDetailScreen } from "../screens/tasks/TaskDetailScreen";
import { ChatScreen } from "../screens/messages/ChatScreen";
import { NewChatScreen } from "../screens/messages/NewChatScreen";
import { ProcurementScreen } from "../screens/procurement/ProcurementScreen";
import { IndentDetailScreen } from "../screens/procurement/IndentDetailScreen";
import { IndentFormScreen } from "../screens/procurement/IndentFormScreen";
import { RfqCreateScreen } from "../screens/procurement/RfqCreateScreen";
import { PurchaseOrderScreen } from "../screens/procurement/PurchaseOrderScreen";
import { PurchaseOrderFormScreen } from "../screens/procurement/PurchaseOrderFormScreen";
import { VendorsScreen } from "../screens/vendors/VendorsScreen";
import { VendorDetailScreen } from "../screens/vendors/VendorDetailScreen";
import { VendorFormScreen } from "../screens/vendors/VendorFormScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { WorkspaceInfoScreen } from "../screens/settings/WorkspaceInfoScreen";
import { ProjectScreen } from "../screens/projects/ProjectScreen";
import { ProjectFormScreen } from "../screens/projects/ProjectFormScreen";
import { ProjectSettingsScreen } from "../screens/projects/ProjectSettingsScreen";
import { ProjectDueScreen } from "../screens/projects/ProjectDueScreen";
import { MyTasksScreen } from "../screens/dashboard/MyTasksScreen";
import { MySpaceScreen } from "../screens/myspace/MySpaceScreen";
import { MyBoardScreen } from "../screens/myspace/MyBoardScreen";
import { ReportsScreen } from "../screens/reports/ReportsScreen";
import { NotificationsScreen } from "../screens/notifications/NotificationsScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { ChangePasswordScreen } from "../screens/profile/ChangePasswordScreen";
import { TravisScreen } from "../screens/travis/TravisScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

/** The app shell: Home, Projects, Create, Inbox, More. */
function MainTabs() {
    return (
        <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, animation: "shift" }}>
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Projects" component={ProjectsScreen} />
            <Tab.Screen name="Create" component={HomeScreen} listeners={{ tabPress: (e) => e.preventDefault() }} />
            <Tab.Screen name="Inbox" component={InboxScreen} />
            <Tab.Screen name="More" component={MoreScreen} />
        </Tab.Navigator>
    );
}

/** Matches the native splash (charcoal + drava lockup) so the hand-off is seamless. */
function Splash() {
    const { colors } = useTheme();
    return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 28, backgroundColor: colors.hero }}>
            <DravaLockup size={30} product={false} />
            <ActivityIndicator color={colors.primary} />
        </View>
    );
}

export function RootNavigator() {
    const { colors, scheme } = useTheme();
    const auth = useAuth();
    const { workspaces, isLoading } = useWorkspace();

    const ready = auth.status !== "loading" && !(auth.status === "signedIn" && isLoading && workspaces.length === 0);
    useEffect(() => {
        if (ready) SplashScreen.hideAsync().catch(() => {});
    }, [ready]);

    const base = scheme === "dark" ? DarkTheme : DefaultTheme;
    const navTheme: Theme = {
        ...base,
        colors: { ...base.colors, primary: colors.primary, background: colors.background, card: colors.background, text: colors.foreground, border: colors.border, notification: colors.destructive },
    };

    if (!ready) return <Splash />;

    const signedIn = auth.status === "signedIn";
    const needsWorkspace = signedIn && workspaces.length === 0;

    return (
        <NavigationContainer ref={navigationRef} theme={navTheme} linking={linking}>
            <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.background } }}>
                {!signedIn ? (
                    <Stack.Group screenOptions={{ animation: "fade" }}>
                        <Stack.Screen name="SignIn" component={SignInScreen} />
                        <Stack.Screen name="SignUp" component={SignUpScreen} />
                        <Stack.Screen name="VerifyRequest" component={VerifyRequestScreen} />
                        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
                        <Stack.Screen name="AcceptInvitation" component={AcceptInvitationScreen} />
                    </Stack.Group>
                ) : needsWorkspace ? (
                    <Stack.Screen name="CreateWorkspace" component={CreateWorkspaceScreen} />
                ) : (
                    <>
                        <Stack.Screen name="Main" component={MainTabs} />
                        <Stack.Screen name="Tasks" component={TasksScreen} />
                        <Stack.Screen name="Calendar" component={CalendarScreen} />
                        <Stack.Screen name="Team" component={TeamScreen} />
                        <Stack.Screen name="Procurement" component={ProcurementScreen} />
                        <Stack.Screen name="Vendors" component={VendorsScreen} />
                        <Stack.Screen name="Settings" component={SettingsScreen} />
                        <Stack.Screen name="MySpace" component={MySpaceScreen} />
                        <Stack.Screen name="MyBoard" component={MyBoardScreen} />
                        <Stack.Screen name="Reports" component={ReportsScreen} />
                        <Stack.Screen name="Notifications" component={NotificationsScreen} />
                        <Stack.Screen name="WorkspaceInfo" component={WorkspaceInfoScreen} />
                        <Stack.Screen name="Profile" component={ProfileScreen} />
                        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
                        <Stack.Screen name="Travis" component={TravisScreen} options={{ animation: "slide_from_bottom" }} />
                        <Stack.Screen name="CreateWorkspace" component={CreateWorkspaceScreen} />
                        <Stack.Screen name="Project" component={ProjectScreen} />
                        <Stack.Screen name="ProjectForm" component={ProjectFormScreen} options={{ animation: "slide_from_bottom" }} />
                        <Stack.Screen name="ProjectSettings" component={ProjectSettingsScreen} />
                        <Stack.Screen name="ProjectDue" component={ProjectDueScreen} />
                        <Stack.Screen name="MyTasks" component={MyTasksScreen} />
                        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
                        <Stack.Screen name="Chat" component={ChatScreen} />
                        <Stack.Screen name="NewChat" component={NewChatScreen} options={{ animation: "slide_from_bottom" }} />
                        <Stack.Screen name="IndentDetail" component={IndentDetailScreen} />
                        <Stack.Screen name="IndentForm" component={IndentFormScreen} options={{ animation: "slide_from_bottom" }} />
                        <Stack.Screen name="RfqCreate" component={RfqCreateScreen} />
                        <Stack.Screen name="PurchaseOrder" component={PurchaseOrderScreen} />
                        <Stack.Screen name="PurchaseOrderForm" component={PurchaseOrderFormScreen} options={{ animation: "slide_from_bottom" }} />
                        <Stack.Screen name="VendorDetail" component={VendorDetailScreen} />
                        <Stack.Screen name="VendorForm" component={VendorFormScreen} options={{ animation: "slide_from_bottom" }} />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
