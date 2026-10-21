import * as React from "react";

const PROBE = 100_000; // px; taller than any screen

/**
 * The element the page actually scrolls in. Not always the window: globals.css
 * gives html and body height:100% with overflow-x:hidden, which makes <body>
 * the scroller. Call while the box is probed tall, so a real scroller overflows.
 */
function scrollParent(box: HTMLElement): HTMLElement {
    for (let el = box.parentElement; el; el = el.parentElement) {
        const { overflowY } = getComputedStyle(el);
        if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) return el;
    }
    return document.documentElement;
}

/**
 * Sizes `ref`'s element so it ends where the screen does, leaving room for what
 * comes after it on the page (pagination, padding). Whatever scrolls inside it
 * then scrolls on its own and the page doesn't. Measured rather than a
 * calc(100vh - Npx) guess, because what sits above differs per page.
 *
 * - property "maxHeight" caps it (a short table stays short), "height" fills.
 * - minWidth: below this screen width the size is cleared (stacked mobile layouts).
 */
export function useFillViewport(
    ref: React.RefObject<HTMLElement | null>,
    { enabled = true, property = "maxHeight", minWidth = 0 }: {
        enabled?: boolean;
        property?: "maxHeight" | "height";
        minWidth?: number;
    } = {}
) {
    React.useLayoutEffect(() => {
        const box = ref.current;
        if (!enabled || !box) return;

        const fit = () => {
            if (window.innerWidth < minWidth) {
                box.style[property] = "";
                return;
            }
            // The box may itself be the scroller (task table), or hold one (DataTable).
            const inner = [box, ...Array.from(box.querySelectorAll<HTMLElement>("*"))].filter((el) => el.scrollTop > 0);
            const positions = inner.map((el) => el.scrollTop);

            // Probe with the box taller than any screen: nothing then stretches to
            // fill the page, so everything below the box is real content. Restored
            // in the same frame, so it never paints.
            box.style.maxHeight = "none";
            box.style.height = `${PROBE}px`;
            const scroller = scrollParent(box);
            const isRoot = scroller === document.documentElement;
            // Box top within the scroller's content, whatever is scrolled right now.
            const top = isRoot
                ? box.getBoundingClientRect().top + window.scrollY
                : box.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
            const below = scroller.scrollHeight - top - PROBE;
            const visible = isRoot ? window.innerHeight : scroller.clientHeight;
            box.style.height = "";
            box.style.maxHeight = "";

            // ponytail: 240px floor so short screens still show a few rows; the page scrolls then.
            box.style[property] = `${Math.max(240, visible - top - below)}px`;
            inner.forEach((el, i) => (el.scrollTop = positions[i]));
        };

        fit();
        // Content above or below changing size resizes body's children (body
        // itself is fixed at 100% when it is the scroller).
        const observer = new ResizeObserver(fit);
        [document.body, ...Array.from(document.body.children)].forEach((el) => observer.observe(el));
        window.addEventListener("resize", fit);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", fit);
            box.style[property] = "";
        };
    }, [ref, enabled, property, minWidth]);
}
