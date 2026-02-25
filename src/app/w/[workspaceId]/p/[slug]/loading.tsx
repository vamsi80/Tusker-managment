import { ProjectPageSkeleton } from "@/components/shared/project-page-skeleton";

/**
 * Shown INSTANTLY by Next.js on navigation to /p/[slug] — before any DB query runs.
 * Uses the shared ProjectPageSkeleton so it always matches the real page layout.
 */
export default function ProjectPageLoading() {
    return <ProjectPageSkeleton />;
}
