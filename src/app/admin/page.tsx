import { ChartAreaInteractive } from "@/components/sidebar/chart-area-interactive";
import { SectionCards } from "@/components/sidebar/section-cards";
import { getEnrollmentsStats } from "../data/admin/admin-get-enrollments-stats";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getRecentCourses } from "../data/admin/admin-get-recent-courses";
import { EmptyState } from "@/components/general/emptyState";
import { AdminCourseCard, AdminCourseCardSkeleton } from "./courses/_components/adminCoursesCard";
import { Suspense } from "react";


export default async function AdminIndexPage() {

  const enrollmentDate = await getEnrollmentsStats();
  return (
    <>
      <SectionCards />
      <ChartAreaInteractive data={enrollmentDate} />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Recent Courses
          </h2>
          <Link
            href="/admin/courses"
            className={buttonVariants({ variant: "outline" })}
          >
            View All Courses
          </Link>
        </div>
        <Suspense fallback={<RenderRecentCoursesSkeleton />}>
          <RenderRecentCourses />
        </Suspense>
      </div>
    </>
  )
}

async function RenderRecentCourses() {
  const data = await getRecentCourses();

  if (data.length === 0) {
    return (
      <EmptyState
        title="You don't have any courses"
        description="You don't have any courses.create some to see them here."
        buttonText="Create New Courses"
        href="/admin/courses/create"
      />
    );
  }

  return (
    <div className=" grid grid-cols-1 md:grid-cols-2 gap-6">
      {data.map((course) => (
        <AdminCourseCard key={course.id} data={course} />
      ))}
    </div>
  )
}

function RenderRecentCoursesSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, index) => (
        <AdminCourseCardSkeleton key={index} />
      ))}
    </div>
  )
}
