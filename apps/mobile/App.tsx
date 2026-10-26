import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";
import { AuthProvider } from "./src/providers/AuthProvider";
import { WorkspaceProvider } from "./src/providers/WorkspaceProvider";
import { PushNotifications } from "./src/providers/PushNotifications";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { queryClient, queryPersister } from "./src/lib/query";
import { Toaster } from "./src/lib/toast";
import { DialogHost } from "./src/components/ui/Dialog";

SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedApp() {
    const { scheme } = useTheme();
    return (
        <>
            <StatusBar style={scheme === "dark" ? "light" : "dark"} />
            <AuthProvider>
                <WorkspaceProvider>
                    <PushNotifications />
                    <RootNavigator />
                    <DialogHost />
                    <Toaster />
                </WorkspaceProvider>
            </AuthProvider>
        </>
    );
}

export default function App() {
    const [fontsLoaded] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
        // drava headings: Archivo Expanded (stand-in for Aktiv Grotesk Extended). Keys match theme/tokens `fonts`.
        "ArchivoExpanded-Regular": require("./assets/fonts/ArchivoExpanded-Regular.ttf"),
        "ArchivoExpanded-Medium": require("./assets/fonts/ArchivoExpanded-Medium.ttf"),
        "ArchivoExpanded-SemiBold": require("./assets/fonts/ArchivoExpanded-SemiBold.ttf"),
        "ArchivoExpanded-Bold": require("./assets/fonts/ArchivoExpanded-Bold.ttf"),
    });

    if (!fontsLoaded) return null;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000 }}>
                    <ThemeProvider>
                        <ThemedApp />
                    </ThemeProvider>
                </PersistQueryClientProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
