import { ProjectLayoutSkeleton } from "./_components/project-layout-skeleton";

/**
 * Loading UI for the Project Layout
 * 
 * This shows immediately when navigating to any project page
 * before the layout loads. This ensures instant navigation feel.
 */
export default function ProjectLoading() {
    return <ProjectLayoutSkeleton />;
}
