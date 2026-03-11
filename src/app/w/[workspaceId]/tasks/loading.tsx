import { AppLoader } from "@/components/shared/app-loader";

/** Shown INSTANTLY by Next.js when navigating to /tasks */
export default function TasksLoading() {
    return <AppLoader />;
}
