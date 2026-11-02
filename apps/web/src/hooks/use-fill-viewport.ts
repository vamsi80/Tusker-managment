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
 * - minWidth: below this content width the size is cleared (stacked layouts).
 *   Measured on <main>, not the window: the sidebar eats ~18rem, so a window
 *   check locked the height while the page's @container/main layout had stacked.
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

        const main = box.closest("main");
        const fit = () => {
            // An open Radix select / menu / dialog scroll-locks the page with
            // body[data-scroll-locked] { overflow: hidden }. Measured then, no
            // scroller is found and the box comes out PROBE px tall: the table
            // spills off screen with nothing left to scroll. Skip; the lock
            // lifting refits (lockObserver below).
            if (document.body.hasAttribute("data-scroll-locked")) return;
            if ((main?.clientWidth ?? window.innerWidth) < minWidth) {
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
            // Floored: a fractional height can overflow the page by a sub-pixel,
            // flashing a scrollbar that resizes everything and refits again.
            box.style[property] = `${Math.floor(Math.max(240, visible - top - below))}px`;
            inner.forEach((el, i) => (el.scrollTop = positions[i]));
        };

        // At most once a frame: fit forces layout, and a refit that resizes an
        // observed element must not re-enter within the same frame.
        let frame = 0;
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(fit);
        };

        fit();
        // Content above or below changing size resizes body's children (body
        // itself is fixed at 100% when it is the scroller).
        const observer = new ResizeObserver(schedule);
        // main too: collapsing the sidebar resizes it without a window resize.
        [document.body, ...Array.from(document.body.children), ...(main ? [main] : [])].forEach((el) => observer.observe(el));
        // Fit again once a select / menu / dialog closes and unlocks scrolling.
        const lockObserver = new MutationObserver(schedule);
        lockObserver.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
        window.addEventListener("resize", schedule);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            lockObserver.disconnect();
            window.removeEventListener("resize", schedule);
            box.style[property] = "";
        };
    }, [ref, enabled, property, minWidth]);
}
