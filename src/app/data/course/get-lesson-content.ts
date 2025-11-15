import "server-only"
import { requireUser } from "../user/require-user"
import { notFound } from "next/navigation";
import prisma from "@/lib/db";


export const getLessonContent = async (lessonId: string) => {
  const user = await requireUser();

  const lesson = await prisma.lesson.findUnique({
    where: {
      id: lessonId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailKey: true,
      videoKey: true,
      position: true,
      lessonProgress:{
        where: {
          userId: user.id
        },
        select: {
          completed: true,
          lessonId: true,
        },
      },
      Chapter: {
        select: {
          courseId: true,
          Course: {
            select: {
              slug: true,
            }
          }
        }
      }
    }
  })

  if(!lesson || !lesson.Chapter){
    return notFound();
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      userId_courseId: {
        userId: user.id,
        courseId: lesson.Chapter.courseId
      },
    },
    select: {
      status: true,
    }
  });

  if(!enrollment || enrollment.status !== "Active"){
    return notFound();
  }
  return lesson;
}

export type LessonContentType = Awaited<ReturnType<typeof getLessonContent>>
