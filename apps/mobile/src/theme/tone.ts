import { palette, statusPalette, type ColorScheme } from "./tokens";

/**
 * Semantic tones for status badges (indents, quotes, POs, attendance, leaves…)
 * resolved against the active theme. The constants in lib/constants keep their
 * plain `Record<string, string>` shape, so every call site works unchanged; the
 * colour each key returns now follows the drava palette and the current scheme.
 */
export type Tone = "info" | "success" | "warning" | "danger" | "neutral" | "owner" | "leave" | "accent";

const TONES: Record<ColorScheme, Record<Tone, string>> = {
    dark: {
        info: "#9AC8FC",
        success: "#92FF5F",
        warning: "#E29860",
        danger: "#FF7D6E",
        neutral: "#C3C3CB",
        owner: "#66FFF4",
        leave: "#BBEDFF",
        accent: "#92FF5F",
    },
    light: {
        info: "#255E9E",
        success: "#2C7A0E",
        warning: "#A65A20",
        danger: "#C2412F",
        neutral: "#62666B",
        owner: "#0A7A72",
        leave: "#3B6E8F",
        accent: "#2C7A0E",
    },
};

let activeScheme: ColorScheme = "dark";

/** Called by ThemeProvider on every render so tone lookups follow the theme. */
export function setActiveScheme(scheme: ColorScheme) {
    activeScheme = scheme;
}

export function getActiveScheme() {
    return activeScheme;
}

export function tone(t: Tone, scheme: ColorScheme = activeScheme) {
    return TONES[scheme][t];
}

/** A Record whose values are tone names, read back as theme-resolved colours. */
export function toneMap<K extends string>(map: Record<K, Tone>): Record<K, string> {
    return new Proxy(map as unknown as Record<K, string>, {
        get(target, key) {
            const t = (target as any)[key];
            return typeof t === "string" && t in TONES.dark ? TONES[activeScheme][t as Tone] : t;
        },
    });
}

/** Task status colours (statusPalette) for the active theme. */
export function statusTone(status: string) {
    return (statusPalette[activeScheme] as Record<string, string>)[status];
}

/**
 * Maps the old Tailwind-style hexes still used for accents in a few screens to
 * the nearest drava tone, so they read well on both themes. Anything not in the
 * table (project or meeting colours people picked) is returned unchanged.
 */
const LEGACY: Record<string, Tone> = {
    "#2563eb": "info", "#3b82f6": "info", "#4f46e5": "info", "#6366f1": "info", "#4147d5": "info", "#1d4ed8": "info", "#0284c7": "info",
    "#047857": "success", "#00bd32": "success", "#22c55e": "success", "#16a34a": "success", "#059669": "success", "#10b981": "success", "#047857ff": "success",
    "#b45309": "warning", "#f59e0b": "warning", "#ea580c": "warning", "#d97706": "warning", "#f97316": "warning", "#fb923c": "warning",
    "#7e22ce": "owner", "#6d28d9": "owner", "#7c3aed": "owner", "#0891b2": "owner", "#0d9488": "owner", "#0f766e": "owner", "#06b6d4": "owner", "#0ea5e9": "owner", "#14b8a6": "owner",
    "#8b5cf6": "leave", "#a855f7": "leave", "#c084fc": "leave",
    "#b91c1c": "danger", "#ef4444": "danger", "#dc2626": "danger", "#e5383b": "danger", "#e11d48": "danger", "#f43f5e": "danger", "#e01e2e": "danger",
    "#94a3b8": "neutral", "#64748b": "neutral", "#475569": "neutral", "#334155": "neutral", "#9ca3af": "neutral", "#6b7280": "neutral",
};

export function adapt(hex: string | undefined | null, scheme: ColorScheme = activeScheme): string {
    if (!hex) return TONES[scheme].neutral;
    const t = LEGACY[hex.toLowerCase()];
    return t ? TONES[scheme][t] : hex;
}

/** Readable text on a solid fill of `hex`: dark ink on light fills, white on dark ones. */
export function onColor(hex: string) {
    const h = hex.replace("#", "");
    if (h.length !== 6) return "#FFFFFF";
    const [r, g, b] = [0, 2, 4].map((i) => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.36 ? palette.dark.primaryForeground : "#FFFFFF";
}
