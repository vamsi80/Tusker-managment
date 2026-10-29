"use client";

import React from "react";
import Link from "next/link";
import { DravaLogo } from "@/components/shared/drava-logo";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import ThemeToggle from "@/components/ui/theme-toggle";
import { UserDropdown } from "./userDropdown";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { getUserDisplayName } from "@tusker/core/lib/user-display-name";

interface iAppProps {
  session?: any; // Optional session from server
}

export function Navbar({ session: serverSession }: iAppProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  // Use client session if available, otherwise use server session
  const currentSession = session || serverSession;

  // Protected click handler for Workspace link
  const handleWorkspaceClick = (e: React.MouseEvent) => {
    e.preventDefault();

    if (isPending) {
      toast("Checking session...");
      return;
    }

    if (!currentSession) {
      toast.error("Please login to access your workspace");
      router.push("/sign-in?next=/workspace");
      return;
    }
    router.push("/w");
  };

  return (
    <header className="sticky top-0 z-50 w-full border bg-background/95 backdrop-blur-[backdrop-filter]:bg-background/60">
      <div className="container flex min-h-16 items-center mx-auto px-4 md:px-6 lg:px-8">
        <Link href="/" className="flex items-center space-x-2 mr-2 sm:mr-4">
          <DravaLogo className="p-1 sm:p-2 text-xl sm:text-[1.6rem]" />
        </Link>

        {/* desktop navigation */}
        <nav className="hidden md:flex md:flex-1 md:items-center md:justify-between">
          <div className="flex items-center space-x-6">
            <Link href="/" className="text-sm font-medium transition-colors hover:text-primary-ink">
              Home
            </Link>

            <Link
              href="/w"
              onClick={handleWorkspaceClick}
              className="text-sm font-medium transition-colors hover:text-primary-ink cursor-pointer"
            >
              Workspace
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle />

            {isPending ? null : session ? (
              <UserDropdown
                email={session.user.email}
                name={getUserDisplayName(session.user as typeof session.user & { surname?: string | null })}
              />
            ) : (
              <>
                <Link href="/sign-in" className={buttonVariants({ variant: "secondary" })}>
                  Login
                </Link>
                <Link href="/sign-in" className={buttonVariants()}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* mobile / small screens: simple layout (optional) */}
        <nav className="flex md:hidden flex-1 items-center justify-end gap-3">
          <ThemeToggle />
          {isPending ? null : session ? (
            <UserDropdown
              email={session.user.email}
              name={getUserDisplayName(session.user as typeof session.user & { surname?: string | null })}
            />
          ) : (
            <>
              <Link href="/sign-in" className={buttonVariants({ variant: "secondary" })}>
                Login
              </Link>
              <Link href="/sign-in" className={buttonVariants()}>
                Get Started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
