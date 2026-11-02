/**
 * Runs one of the website's server pages or layouts in the desktop window.
 * Next calls them as async functions with { params, searchParams }; here the
 * same call happens client-side and React 19's use() waits for the result. Their
 * server-only data calls are swapped for API-backed versions (src/overrides), so
 * the page file itself runs unchanged. router.refresh() re-runs it.
 */
import { Component, Suspense, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet, useLocation, useParams } from "react-router";
import { Loader2 } from "lucide-react";
import { REFRESH_EVENT } from "./navigation";

type ServerProps = { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>>; children?: ReactNode };
// Each page declares its own props (some require children); they all receive ServerProps.
type ServerComponent = (props: any) => ReactNode | Promise<ReactNode>;
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

function Resolved({ promise }: { promise: Promise<ReactNode> }) {
    return <>{use(promise)}</>;
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
                load().then(({ default: Page }) =>
                    Page({
                        params: Promise.resolve(params),
                        searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(search))),
                        ...(layout ? { children: <Outlet /> } : {}),
                    }),
                ),
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
