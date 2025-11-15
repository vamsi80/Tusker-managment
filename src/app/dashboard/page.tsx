import { EmptyState } from "@/components/general/emptyState";
import { getAllCourses } from "../data/course/get-all-courses";
import { getEnrolledCourses } from "../data/user/get-enrolled-courses";
import { MainCourseCard } from "../(main)/_components/mainCourseCard";
import Link from "next/link";
import { CourseProgressCard } from "./_components/courseProgressCard";

export default async function DashboardPage() {

  const [courses, enrolledCourses] = await Promise.all([
    getAllCourses(),
    getEnrolledCourses(),
  ]);
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">
          Enrolled Courses
        </h1>
        <p className="text-muted-foreground">
          Here You Can See all the courses you have acesses to
        </p>
      </div>
      {enrolledCourses.length === 0 ? (
        <EmptyState
          title="No Enrolled Courses"
          description="You have not enrolled in any courses yet."
          buttonText="Browse Courses"
          href="/courses"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {enrolledCourses.map((course) => (
            <Link  key={course.Course.id} href={`/dashboard/${course.Course.slug}`}>
            <CourseProgressCard data={course} />
            </Link>
          ))}
        </div>
      )}

      <section className="mt-10">
        <div className="flex flex-col gap-2 mb-5">
          <h1 className="text-3xl font-bold">
            Available Courses
          </h1>
          <p className="text-muted-foreground">
            Here You Can See all the courses you can purchase
          </p>
        </div>

        {courses.filter(
          (course) =>
            !enrolledCourses.some(
              ({ Course: enrolled }) => enrolled.id === course.id
            )
        ).length === 0 ? (
          <EmptyState
            title="No Courses Available"
            description="You have alrady enrolled all the available courses."
            buttonText="Browse Courses"
            href="/courses"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {courses.filter(
              (course) =>
                !enrolledCourses.some(
                  ({ Course: enrolled }) => enrolled.id === course.id
                )
            ).map((course) => (
              <MainCourseCard key={course.id} data={course} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
