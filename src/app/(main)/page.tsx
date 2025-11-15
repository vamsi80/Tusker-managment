"use client";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {

  return (
    <>
      <section className="relative py-20">
        <div className="flex flex-col items-center justify-center text-center space-x-6">
          <Badge variant={"outline"}>Welcome to Tusker Managment</Badge>
          <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight test-foreground sm:text-5xl">
           Your personal workspace
          </h1>
          <p className="max-w-[700px] mt-6 text-lg text-foreground/70">
            Organize your projects, tasks, and goals in one place. Stay focused and achieve more with your personal command center.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-6">
            <Link
              className={buttonVariants({ size: "lg" })}
              href="/sign-up"
            >
              View Workspace
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
