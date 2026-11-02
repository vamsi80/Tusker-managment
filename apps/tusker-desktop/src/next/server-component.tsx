/**
 * Runs one of the website's server pages or layouts in the desktop window.
 * Next calls them as async functions with { params, searchParams }; here the
 * same call happens client-side and React 19's use() waits for the result. Their
 * server-only data calls are swapped for API-backed versions (src/overrides), so
 * the page file itself runs unchanged. router.refresh() re-runs it.
 */
import { cloneElement, Component, createElement, Fragment, isValidElement, Suspense, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet, useLocation, useParams } from "react-router";
import { Loader2 } from "lucide-react";
import { REFRESH_EVENT } from "./navigation";

type ServerProps = { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>>; children?: ReactNode };
// Each page declares its own props (some require children); they all receive ServerProps.
// (Some only redirect and return nothing.)
type ServerComponent = (props: any) => unknown;
type Loader = () => Promise<{ default: ServerComponent }>;

export function PageSpinner() {
    return (
        <div className="grid min-h-40 flex-1 place-items-center">
            <Loader2 className="size-6 animate-spin text-primary-ink" />
        </div>
    );
}

/** Keeps a thrown redirect()/notFound() or a failed load from blanking the whole window. */
class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
    state = { error: null as Error | null };
    static getDerivedStateFromError(error: Error) {
        return { error };
    }
    componentDidUpdate(prev: { resetKey: string }) {
        if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
    }
    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        if (error.message.startsWith("NEXT_REDIRECT")) return null; // navigation already happened
        return (
            <div className="grid min-h-40 flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">
                {error.message.startsWith("NEXT_NOT_FOUND") ? "This page doesn't exist or you don't have access to it." : `Couldn't load this page: ${error.message}`}
            </div>
        );
    }
}

function Resolved({ promise }: { promise: Promise<unknown> }) {
    return <>{use(promise) as ReactNode}</>;
}

const isAsyncComponent = (type: unknown): type is (props: unknown) => Promise<unknown> =>
    typeof type === "function" && type.constructor?.name === "AsyncFunction";

/**
 * Server pages often render further async server components inside their JSX
 * (`<Suspense><SettingsContent /></Suspense>`). Next awaits those on the server;
 * rendered in the browser, React would get a new promise on every render and
 * never settle (the page loads forever). So, like Next, await every async
 * component in the tree before rendering, at any depth: children, fragments,
 * Suspense, and element-valued props. Other components (client components,
 * which may use hooks) are left for React to render.
 */
export async function resolveTree(node: unknown): Promise<unknown> {
    if (Array.isArray(node)) return Promise.all(node.map(resolveTree));
    if (!isValidElement(node)) return node;

    if (isAsyncComponent(node.type)) {
        const out = await resolveTree(await node.type(node.props));
        // Keep the element's key (it may sit in a keyed list) on whatever it rendered.
        if (node.key == null) return out;
        return isValidElement(out) ? cloneElement(out, { key: node.key }) : createElement(Fragment, { key: node.key }, out as ReactNode);
    }

    const props = node.props as Record<string, unknown>;
    const changed: Record<string, unknown> = {};
    await Promise.all(
        Object.entries(props).map(async ([name, value]) => {
            const holdsElements = isValidElement(value) || (Array.isArray(value) && value.some((v) => isValidElement(v) || Array.isArray(v)));
            if (!holdsElements) return;
            const resolved = await resolveTree(value);
            if (resolved !== value) changed[name] = resolved;
        }),
    );
    if (Object.keys(changed).length === 0) return node;
    const { children, ...rest } = changed;
    if (!("children" in changed)) return cloneElement(node, rest);
    // Several JSX children arrive as an array; pass them back as separate arguments,
    // as JSX does, so React doesn't treat them as a keyed list.
    return Array.isArray(children) ? cloneElement(node, rest, ...(children as ReactNode[])) : cloneElement(node, rest, children as ReactNode);
}

/** A route element for a server page (`layout` passes <Outlet/> as its children). */
export function serverPage(load: Loader, { layout = false }: { layout?: boolean } = {}) {
    return function ServerPage() {
        const params = useParams() as Record<string, string>;
        const { search } = useLocation();
        const [tick, setTick] = useState(0);
        useEffect(() => {
            const refresh = () => setTick((t) => t + 1);
            window.addEventListener(REFRESH_EVENT, refresh);
            return () => window.removeEventListener(REFRESH_EVENT, refresh);
        }, []);

        const key = `${JSON.stringify(params)}${search}#${tick}`;
        const promise = useMemo(
            () =>
                load()
                    .then(({ default: Page }) =>
                        Page({
                            params: Promise.resolve(params),
                            searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(search))),
                            ...(layout ? { children: <Outlet /> } : {}),
                        }),
                    )
                    .then(resolveTree),
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [key],
        );

        return (
            <PageBoundary resetKey={key}>
                <Suspense fallback={<PageSpinner />}>
                    <Resolved promise={promise} />
                </Suspense>
            </PageBoundary>
        );
    };
}

type ClientComponent = (props: any) => ReactNode;

/**
 * A route element for one of the website's client pages or layouts ("use client"),
 * loaded on demand. `layout` passes <Outlet/> as its children.
 */
export function clientPage(load: () => Promise<{ default: ClientComponent }>, { layout = false }: { layout?: boolean } = {}) {
    let module: Promise<{ default: ClientComponent }> | null = null;

    function Loaded() {
        module ??= load();
        const { default: Page } = use(module);
        const params = useParams() as Record<string, string>;
        const key = JSON.stringify(params);
        // Next 15+ also hands client pages their params as a promise; keep one per params so use(params) settles.
        const paramsPromise = useMemo(() => Promise.resolve(params), [key]); // eslint-disable-line react-hooks/exhaustive-deps
        return <Page params={paramsPromise}>{layout ? <Outlet /> : null}</Page>;
    }

    return function ClientPage() {
        const { pathname } = useLocation();
        return (
            <PageBoundary resetKey={layout ? "layout" : pathname}>
                <Suspense fallback={<PageSpinner />}>
                    <Loaded />
                </Suspense>
            </PageBoundary>
        );
    };
}
