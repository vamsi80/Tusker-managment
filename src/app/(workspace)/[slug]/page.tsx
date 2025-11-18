import { SectionCards } from "../_components/sidebar/section-cards";


export default function WorkSpacePage() {
  return (
    <>
      <SectionCards />
      <h1>Welcome to workspace</h1>
      {/* <ChartAreaInteractive data={enrollmentDate} />
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
              </div> */}
    </>
  )
}