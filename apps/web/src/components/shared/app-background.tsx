"use client";

import { useEffect } from "react";
import { useAppearanceStore } from "@/lib/store/appearance-store";

/**
 * The workspace backdrop from the Trava design: a warm wash, soft drifting
 * glows and curved light ribbons. Drawn in code (CSS gradients + inline SVG),
 * not shipped as an image. Colours come from the --bg-* tokens in globals.css,
 * so light and dark only differ there.
 *
 * Curves are traced from the design's 2000×1164 reference; `slice` keeps them
 * anchored to the corners at any viewport size.
 */

type Ribbon = {
    line: string;
    /** The area the curve bounds, tinted slightly differently from the wash. The glow falls only into it. */
    panel: string;
    fill: string;
    /** Brightness along the ribbon: from point → to point, with opacity at start, middle, end. */
    fade: [x1: number, y1: number, x2: number, y2: number, start: number, mid: number, end: number];
    /** How far the curve falls away from a straight tail, so the comet's tail can follow it (measured from the path). */
    bend: number;
};

const RIBBONS: Ribbon[] = [
    // Top-left diagonal
    {
        line: "M 330 -10 C 150 90 30 250 -10 470",
        panel: "M -10 -10 L 330 -10 C 150 90 30 250 -10 470 Z",
        fill: "var(--bg-shade)",
        fade: [330, -10, -10, 470, 1, 0.8, 0.45],
        bend: -9.5,
    },
    // Top-right arc: fades out as it runs left, like the reference.
    {
        line: "M 1540 -10 C 1440 122 1290 200 1110 205 C 1020 207 940 203 860 196",
        panel: "M 860 -10 L 1540 -10 C 1440 122 1290 200 1110 205 C 1020 207 940 203 860 196 Z",
        fill: "var(--bg-shade)",
        fade: [1540, 0, 860, 200, 1, 0.85, 0],
        bend: 10,
    },
    // Right sweep, the brightest.
    {
        line: "M 2010 440 C 1760 600 1600 860 1545 1175",
        panel: "M 2010 440 C 1760 600 1600 860 1545 1175 L 2010 1175 Z",
        fill: "var(--bg-warm-panel)",
        fade: [2010, 440, 1545, 1175, 0.9, 1, 0.55],
        bend: -5.8,
    },
    // Lower-right inner curve: a soft edge rather than a bright line.
    {
        line: "M 1690 760 C 1560 930 1400 1062 1240 1175",
        panel: "M 1690 760 C 1560 930 1400 1062 1240 1175 L 1545 1175 C 1570 1010 1620 870 1690 760 Z",
        fill: "var(--bg-shade)",
        fade: [1690, 760, 1240, 1175, 0.15, 0.4, 0.25],
        bend: 3.2,
    },
    // Bottom dome
    {
        line: "M 40 1175 C 260 1062 450 990 640 986 C 822 982 1000 1050 1186 1175",
        panel: "M 40 1175 C 260 1062 450 990 640 986 C 822 982 1000 1050 1186 1175 Z",
        fill: "var(--bg-shade)",
        fade: [40, 1100, 1186, 1100, 0.75, 1, 0.45],
        bend: 6.5,
    },
];

// Thin light streak running into the top-right flare.
const STREAK = "M 1600 190 C 1780 175 1910 120 2010 40";

// Soft glows as plain CSS gradients so the drift animates on the compositor.
const GLOWS = [
    { className: "-top-[20vh] -right-[12vw] size-[38vw]", strength: 1 }, // top-right
    { className: "top-[25vh] -right-[18vw] size-[42vw]", strength: 0.8 }, // right edge
    { className: "-bottom-[25vh] -left-[15vw] size-[42vw]", strength: 0.7 }, // bottom-left
    { className: "-top-[18vh] -left-[12vw] size-[26vw]", strength: 0.45 }, // top-left
];

// The flowing light: one point that travels each ribbon in turn, so only one is ever lit.
export const COMET_SECONDS_PER_RIBBON = 6;
// Six stops: the five ribbons here plus the sidebar's ribbon behind the project
// chips (nav-projects.tsx), which takes the slot right after the top-left ribbon
// so the light seems to run on into it. The bg-comet keyframes assume six.
export const COMET_CYCLE_SECONDS = COMET_SECONDS_PER_RIBBON * 6;
export const SIDEBAR_COMET_DELAY = COMET_SECONDS_PER_RIBBON;
// The comet's tail length, in the same units as the ribbon coordinates.
const COMET_TAIL = 110;

/** A tail tapering from the head to a point, bent by the ribbon's curvature (+x is the direction of travel). */
function tailPath(bend: number) {
    const L = COMET_TAIL;
    return `M ${-L} ${bend} Q ${-L / 2} -0.9 0 -1.8 L 0 1.8 Q ${-L / 2} 0.9 ${-L} ${bend} Z`;
}

export function AppBackground() {
    const flowingLight = useAppearanceStore((s) => s.flowingLight);
    const load = useAppearanceStore((s) => s.load);
    useEffect(load, [load]);

    return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            {/* The design layers the decoration at 60% over the base colour. */}
            <div className="absolute inset-0 opacity-60">
            <div
                className="absolute inset-0"
                style={{ background: "radial-gradient(ellipse 70% 65% at 60% 45%, var(--bg-center), var(--bg-base) 100%)" }}
            />

            {GLOWS.map((g, i) => (
                <div
                    key={i}
                    className={`bg-drift absolute rounded-full ${g.className}`}
                    style={{
                        opacity: g.strength,
                        background: "radial-gradient(circle, var(--bg-glow), transparent 68%)",
                        animationDelay: `${i * -9}s`,
                    }}
                />
            ))}

            <svg className="absolute inset-0 size-full" viewBox="0 0 2000 1164" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <filter id="bg-ribbon-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="9" />
                    </filter>
                    {/* The glow is one-sided in the design: clip it to the panel the line bounds. */}
                    {RIBBONS.map((r, i) => (
                        <clipPath key={i} id={`bg-side-${i}`}>
                            <path d={r.panel} />
                        </clipPath>
                    ))}
                    <radialGradient id="bg-flare">
                        <stop offset="0" style={{ stopColor: "var(--bg-flare)" }} />
                        <stop offset="1" style={{ stopColor: "var(--bg-flare)", stopOpacity: 0 }} />
                    </radialGradient>
                    {RIBBONS.map(({ fade: [x1, y1, x2, y2, a, b, c] }, i) => (
                        <mask key={i} id={`bg-fade-${i}`} maskUnits="userSpaceOnUse" x="-50" y="-50" width="2100" height="1270">
                            <linearGradient id={`bg-fade-g-${i}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
                                <stop offset="0" stopColor="#fff" stopOpacity={a} />
                                <stop offset="0.5" stopColor="#fff" stopOpacity={b} />
                                <stop offset="1" stopColor="#fff" stopOpacity={c} />
                            </linearGradient>
                            <rect x="-50" y="-50" width="2100" height="1270" fill={`url(#bg-fade-g-${i})`} />
                        </mask>
                    ))}
                </defs>

                {RIBBONS.map((r, i) => (
                    <g key={i} mask={`url(#bg-fade-${i})`}>
                        <path d={r.panel} style={{ fill: r.fill }} />
                        <g clipPath={`url(#bg-side-${i})`}>
                            <path
                                d={r.line}
                                fill="none"
                                filter="url(#bg-ribbon-glow)"
                                style={{ stroke: "var(--bg-line-glow)", strokeWidth: 22 }}
                            />
                        </g>
                        <path d={r.line} fill="none" style={{ stroke: "var(--bg-line)", strokeWidth: 1.2 }} />
                    </g>
                ))}

                <path
                    d={STREAK}
                    fill="none"
                    filter="url(#bg-ribbon-glow)"
                    style={{ stroke: "var(--bg-line-glow)", strokeWidth: 8, opacity: 0.5 }}
                />
                <path d={STREAK} fill="none" style={{ stroke: "var(--bg-line)", strokeWidth: 1, opacity: 0.5 }} />
                <circle cx="1995" cy="45" r="130" fill="url(#bg-flare)" />
            </svg>
            </div>

            {/* The flowing light sits outside the 60% layer so it stays bright. One small
                comet per ribbon rides its curve with CSS offset-path (see .bg-comet);
                only one is lit at a time. Gradients give a smooth tail and bloom. */}
            {flowingLight && (
                <svg className="absolute inset-0 size-full" viewBox="0 0 2000 1164" preserveAspectRatio="xMidYMid slice">
                    <defs>
                        <linearGradient id="bg-comet-tail" x1={-COMET_TAIL} x2="0" y1="0" y2="0" gradientUnits="userSpaceOnUse">
                            <stop offset="0" style={{ stopColor: "var(--bg-comet)", stopOpacity: 0 }} />
                            <stop offset="0.7" style={{ stopColor: "var(--bg-comet)", stopOpacity: 0.35 }} />
                            <stop offset="1" style={{ stopColor: "var(--bg-comet)", stopOpacity: 0.95 }} />
                        </linearGradient>
                        <radialGradient id="bg-comet-head">
                            <stop offset="0" style={{ stopColor: "var(--bg-comet)", stopOpacity: 0.85 }} />
                            <stop offset="0.15" style={{ stopColor: "var(--bg-comet)", stopOpacity: 0.4 }} />
                            <stop offset="0.45" style={{ stopColor: "var(--bg-comet)", stopOpacity: 0.12 }} />
                            <stop offset="1" style={{ stopColor: "var(--bg-comet)", stopOpacity: 0 }} />
                        </radialGradient>
                    </defs>
                    {RIBBONS.map((r, i) => (
                        <g
                            key={i}
                            className="bg-comet"
                            style={{
                                offsetPath: `path("${r.line}")`,
                                animationDuration: `${COMET_CYCLE_SECONDS}s`,
                                // Slot 1 belongs to the sidebar ribbon.
                                animationDelay: `${(i === 0 ? 0 : i + 1) * COMET_SECONDS_PER_RIBBON}s`,
                            }}
                        >
                            <path d={tailPath(r.bend)} fill="url(#bg-comet-tail)" />
                            <circle r="30" fill="url(#bg-comet-head)" />
                            <circle r="2.6" style={{ fill: "var(--bg-comet)" }} />
                        </g>
                    ))}
                </svg>
            )}
        </div>
    );
}
