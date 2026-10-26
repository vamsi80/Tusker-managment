/**
 * drava core design tokens, from the DRAVA Brand Book 2026.
 *
 * One accent (Lime #92FF5F) used with intent, calm charcoal surfaces, hairline
 * borders instead of heavy shadows. Dark is the lead theme; light mirrors it on
 * Frost/white surfaces. Key names are kept from the old Tusker palette so every
 * screen keeps working; the drava-only keys are listed at the end of each theme.
 *
 * Contrast rule: `primary` is a FILL colour (buttons, active pills, progress).
 * For lime used as text or an icon on a surface, use `primaryInk` — it is lime
 * in dark mode and a deep leaf green in light mode, where lime text would fail.
 */
export const brand = {
    lime: "#92FF5F",
    charcoal: "#393B3D",
    mist: "#C3C3CB",
    frost: "#D8E2E5",
    aqua: "#66FFF4",
    ice: "#BBEDFF",
    sky: "#9AC8FC",
    apricot: "#E29860",
    coral: "#FF7D6E",
    ink: "#0E1A07",
} as const;

export const palette = {
    light: {
        background: "#EEF2F3",
        foreground: "#17181A",
        card: "#FFFFFF",
        cardTranslucent: "rgba(255,255,255,0.92)",
        popover: "#FFFFFF",
        primary: brand.lime,
        primaryForeground: brand.ink,
        secondary: "#E4EAEC",
        secondaryForeground: "#17181A",
        muted: "#E4EAEC",
        mutedForeground: "#62666B",
        accent: "#E2FAD6",
        accentForeground: "#17181A",
        destructive: "#C2412F",
        destructiveForeground: "#FFFFFF",
        border: "#D8E2E5",
        input: "#C9D3D6",
        ring: "#2C7A0E",
        success: "#2C7A0E",
        warning: "#A65A20",
        info: "#255E9E",
        leave: "#3B6E8F",
        halfDay: "#8F5A33",
        broadcast: "#C2412F",
        surfaceSolid: "#FFFFFF",
        bgBase: "#EEF2F3",
        bgGlow: "rgba(146,255,95,0.18)",
        overlay: "rgba(23,24,26,0.42)",
        shadow: "#17181A",
        // drava additions
        primaryInk: "#2C7A0E",
        raised: "#E4EAEC",
        track: "#E4EAEC",
        trackActive: "#FFFFFF",
        hero: brand.charcoal,
        heroForeground: "#F1F4F5",
        heroMuted: "#D8E2E5",
        tabBar: "#FFFFFF",
        createBg: brand.charcoal,
        createFg: brand.lime,
        badgeBg: brand.charcoal,
        badgeFg: "#FFFFFF",
        iconTile: "#E4EAEC",
        iconTileFg: "#393B3D",
    },
    dark: {
        background: "#131416",
        foreground: "#F1F4F5",
        card: "#1D1E21",
        cardTranslucent: "rgba(29,30,33,0.94)",
        popover: "#1D1E21",
        primary: brand.lime,
        primaryForeground: brand.ink,
        secondary: "#26282B",
        secondaryForeground: "#F1F4F5",
        muted: "#26282B",
        mutedForeground: "#8C8F95",
        accent: "#26331F",
        accentForeground: "#F1F4F5",
        destructive: brand.coral,
        destructiveForeground: "#1A0B08",
        border: "#2A2C2F",
        input: "#33363A",
        ring: brand.lime,
        success: brand.lime,
        warning: brand.apricot,
        info: brand.sky,
        leave: brand.ice,
        halfDay: "#E5BA99",
        broadcast: brand.coral,
        surfaceSolid: "#1D1E21",
        bgBase: "#131416",
        bgGlow: "rgba(146,255,95,0.10)",
        overlay: "rgba(0,0,0,0.62)",
        shadow: "#000000",
        // drava additions
        primaryInk: brand.lime,
        raised: "#26282B",
        track: "#1D1E21",
        trackActive: brand.charcoal,
        hero: brand.charcoal,
        heroForeground: "#F1F4F5",
        heroMuted: "#D8E2E5",
        tabBar: "#1D1E21",
        createBg: brand.lime,
        createFg: brand.ink,
        badgeBg: brand.lime,
        badgeFg: brand.ink,
        iconTile: "#26282B",
        iconTileFg: "#C3C3CB",
    },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)["light"]]: string };

/**
 * Task status colours per theme. Brand secondaries in dark; deeper inks of the
 * same hues in light so labels stay readable on white.
 */
export const statusPalette = {
    dark: { TO_DO: "#C3C3CB", IN_PROGRESS: "#9AC8FC", REVIEW: "#66FFF4", HOLD: "#E29860", COMPLETED: "#92FF5F", CANCELLED: "#FF7D6E" },
    light: { TO_DO: "#62666B", IN_PROGRESS: "#255E9E", REVIEW: "#0A7A72", HOLD: "#A65A20", COMPLETED: "#2C7A0E", CANCELLED: "#C2412F" },
} as const;

/** Card 20, control 14, chip 8, sheet 28. `smile` is the logo's quarter-circle corner. */
export const radius = { xs: 8, sm: 12, md: 14, lg: 20, xl: 24, sheet: 28, smile: 44, full: 999 } as const;

/** 4-pt grid. 20 px screen gutter, 16 px card padding, 24 px between sections. */
export const space = (n: number) => n * 4;

/**
 * Headings and numbers: Archivo Expanded (stand-in for the brand's Aktiv
 * Grotesk Extended — swap the files in assets/fonts to change it everywhere).
 * Everything you read: Inter.
 */
export const fonts = {
    body: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
    heading: "ArchivoExpanded-SemiBold",
    headingSemibold: "ArchivoExpanded-Medium",
    headingExtra: "ArchivoExpanded-Bold",
    display: "ArchivoExpanded-Regular",
    mono: "Inter_500Medium",
} as const;

export const fontSize = {
    xxs: 10,
    xs: 12,
    sm: 14,
    base: 15,
    lg: 16,
    xl: 18,
    "2xl": 22,
    "3xl": 28,
} as const;

/** Depth comes from surface steps and hairlines; shadows stay faint. */
export const shadows = (scheme: ColorScheme) => {
    const color = palette[scheme].shadow;
    const dark = scheme === "dark";
    return {
        sm: { shadowColor: color, shadowOpacity: dark ? 0 : 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: dark ? 0 : 1 },
        md: { shadowColor: color, shadowOpacity: dark ? 0.35 : 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
        lg: { shadowColor: color, shadowOpacity: dark ? 0.5 : 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
    };
};
