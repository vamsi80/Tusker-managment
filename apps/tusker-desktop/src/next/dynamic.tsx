/** next/dynamic → React.lazy. `ssr` is meaningless here (no server rendering). */
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type Loader<P> = () => Promise<ComponentType<P> | { default: ComponentType<P> }>;

export default function dynamic<P extends object>(
    loader: Loader<P>,
    options: { ssr?: boolean; loading?: (props: { isLoading?: boolean; error?: Error | null }) => ReactNode } = {},
): ComponentType<P> {
    const Lazy = lazy(async () => {
        const mod = await loader();
        return { default: "default" in mod ? mod.default : mod };
    });
    const fallback = options.loading ? options.loading({ isLoading: true, error: null }) : null;
    return function DynamicComponent(props: P) {
        return (
            <Suspense fallback={fallback}>
                <Lazy {...props} />
            </Suspense>
        );
    };
}
