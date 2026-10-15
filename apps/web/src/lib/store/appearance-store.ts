import { create } from "zustand";

/**
 * Personal appearance preferences. Per browser (localStorage), not per
 * workspace: they only change how the app looks for the person who set them.
 */
const FLOWING_LIGHT_KEY = "tusker:flowing-light";

interface AppearanceState {
    flowingLight: boolean;
    setFlowingLight: (on: boolean) => void;
    /** Reads the saved choice; called after mount so server and client render the same first frame. */
    load: () => void;
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
    flowingLight: true,
    setFlowingLight: (on) => {
        try {
            localStorage.setItem(FLOWING_LIGHT_KEY, on ? "on" : "off");
        } catch {}
        set({ flowingLight: on });
    },
    load: () => {
        try {
            set({ flowingLight: localStorage.getItem(FLOWING_LIGHT_KEY) !== "off" });
        } catch {}
    },
}));
