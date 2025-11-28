"use client"

import Link from "next/link"
import Logo from "@/assets/logo.png"
import Image from "next/image"
import { buttonVariants } from "@/components/ui/button"
import { authClient } from "@/lib/auth-clint"
import ThemeToggle from "@/components/ui/theme-toggle"
import { UserDropdown } from "./userDropdown"

const navigationItems =[
  {
    name: "Home",
    href: "/",
  },
  {
    name: "Workspace",
    href: "/workspace",
  }
]

export const Navbar = () => {

  const { data: session, isPending } = authClient.useSession();

  return (
    <header className="sticky top-0 z-50 w-full border bg-background/95 backdrop-blur-[backdrop-filter]:bg-background/60">
      <div className="container flex min-h-16 items-center mx-auto px-4 md:px-6 lg:px-8">
        <Link href="/" className="flex items-center space-x-2 mr-4">
          <Image
            src={Logo}
            alt="Logo"
            width={150}
            height={50}
            className="p-3"
          />
        </Link>

        {/* desktop navigation*/}
        <nav className="hidden md:flex md:flex-1 md:items-center md:justify-between">
          <div className="flex items-center space-x-6">
            {navigationItems.map((item) => (
              <Link key={item.name} href={item.href} className="text-sm font-medium transition-colors hover:text-primary">
                {item.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle />

            {isPending ? null : session ? (
              <UserDropdown 
                email={session.user.email}
                image={session?.user.image ?? `https://avatar.vercel.sh/rauchg/${session?.user.email}`}
                name={
                  session?.user.name && session?.user.name.length > 0
                    ? session?.user.name
                    : session?.user.email.split("@")[0]
                }
              />
            ) : (
              <>
                <Link href="/sign-in" className={buttonVariants({ variant: "secondary"})}>
                  Login
                </Link>
                <Link href="/sign-in" className={buttonVariants()}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
