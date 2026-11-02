/** next/link → react-router's Link, keeping the website's paths. External links open in the browser. */
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import { Link as RouterLink } from "react-router";

type Href = string | { pathname?: string; query?: Record<string, string | number | undefined>; hash?: string };

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: Href;
    replace?: boolean;
    scroll?: boolean;
    prefetch?: boolean | null;
    shallow?: boolean;
    legacyBehavior?: boolean;
    passHref?: boolean;
    children?: ReactNode;
};

function toString(href: Href): string {
    if (typeof href === "string") return href;
    const qs = new URLSearchParams(
        Object.entries(href.query ?? {}).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
    ).toString();
    return `${href.pathname ?? ""}${qs ? `?${qs}` : ""}${href.hash ? `#${href.hash}` : ""}`;
}

const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
    { href, replace, scroll: _scroll, prefetch: _prefetch, shallow: _shallow, legacyBehavior: _legacy, passHref: _passHref, children, onClick, ...rest },
    ref,
) {
    const to = toString(href);
    if (/^(https?:|mailto:|tel:)/.test(to)) {
        return (
            <a
                ref={ref}
                href={to}
                {...rest}
                onClick={(e) => {
                    onClick?.(e);
                    if (!e.defaultPrevented && /^https?:/.test(to)) {
                        e.preventDefault();
                        window.tusker.open(to);
                    }
                }}
            >
                {children}
            </a>
        );
    }
    return (
        <RouterLink ref={ref} to={to} replace={replace} onClick={onClick} {...rest}>
            {children}
        </RouterLink>
    );
});

export default Link;
