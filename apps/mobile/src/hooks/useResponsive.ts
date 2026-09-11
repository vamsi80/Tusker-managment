import { useWindowDimensions } from 'react-native';

// Breakpoints
export const BREAKPOINTS = {
    tablet: 768,
    desktop: 1024,
    desktopLarge: 1440,
};

// Maximum width for content on large screens to prevent extreme stretching
export const MAX_CONTENT_WIDTH = 1200;
export const FORM_MAX_WIDTH = 500;

// Below these, a phone is "compact" — think a budget/older Android device
// (e.g. a 360x640dp screen) rather than the ~390-430dp x 850-1000dp phones
// most of the UI was visibly tuned against. Hero-sized text/buttons that look
// right on a taller phone can eat a disproportionate share of a compact
// screen's height, reading as "zoomed in" even though nothing overflows.
const COMPACT_WIDTH = 380;
const COMPACT_HEIGHT = 700;

export function useResponsive() {
    const { width, height } = useWindowDimensions();

    const isMobile = width < BREAKPOINTS.tablet;
    const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
    const isDesktop = width >= BREAKPOINTS.desktop;
    const isCompact = isMobile && (width < COMPACT_WIDTH || height < COMPACT_HEIGHT);

    /**
     * A helper function to return a specific value based on the current device breakpoint.
     * @param mobileValue Value for mobile screens (< 768px)
     * @param tabletValue Value for tablet screens (768px - 1023px)
     * @param desktopValue Value for desktop screens (>= 1024px)
     */
    function value<T>(mobileValue: T, tabletValue: T, desktopValue: T): T {
        if (isDesktop) return desktopValue;
        if (isTablet) return tabletValue;
        return mobileValue;
    }

    /**
     * Like `value`, but also splits the mobile bucket into compact vs regular
     * phones. Use for hero-sized elements (big headings, large CTAs, hero
     * illustrations) that need to visibly shrink on a small/short screen
     * rather than just reflow.
     * @param compactValue Value for compact phones (<380dp wide or <700dp tall)
     * @param mobileValue Value for regular phones
     * @param tabletValue Value for tablet screens
     * @param desktopValue Value for desktop screens
     */
    function compactValue<T>(compactValue: T, mobileValue: T, tabletValue: T, desktopValue: T): T {
        if (isDesktop) return desktopValue;
        if (isTablet) return tabletValue;
        if (isCompact) return compactValue;
        return mobileValue;
    }

    return {
        width,
        height,
        isMobile,
        isTablet,
        isDesktop,
        isCompact,
        value,
        compactValue,
        MAX_CONTENT_WIDTH,
        FORM_MAX_WIDTH,
    };
}
