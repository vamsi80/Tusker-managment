import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palette, shadows, type ColorScheme, type Colors } from "./tokens";
import { setActiveScheme } from "./tone";

/** Same three choices as the web's next-themes toggle (Appearance settings). */
export type ThemePreference = "system" | "light" | "dark";

type ThemeContextValue = {
    scheme: ColorScheme;
    colors: Colors;
    shadow: ReturnType<typeof shadows>;
    preference: ThemePreference;
    setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "tusker.theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
    const system = useColorScheme();
    const [preference, setPreferenceState] = useState<ThemePreference>("system");

    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY)
            .then((value) => {
                if (value === "light" || value === "dark" || value === "system") setPreferenceState(value);
            })
            .catch(() => {});
    }, []);

    const setPreference = useCallback((next: ThemePreference) => {
        setPreferenceState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    }, []);

    const scheme: ColorScheme = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
    // Status/tone lookups in lib/constants read the scheme outside React; keep them in step.
    setActiveScheme(scheme);

    const value = useMemo(
        () => ({ scheme, colors: palette[scheme], shadow: shadows(scheme), preference, setPreference }),
        [scheme, preference, setPreference],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
    return ctx;
}
