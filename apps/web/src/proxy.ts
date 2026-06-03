import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 proxy (was middleware.ts in older versions).
 *
 * Strategy: protect /w/* routes by checking for the presence of a session
 * cookie — no backend round-trip required. Actual session *validation* happens
 * inside each route / server component via auth.api.getSession().
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — always allow
  const publicRoutes = [
    "/",
    "/sign-in",
    "/sign-up",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/accept-invitation",
  ];
  if (publicRoutes.some((r) => pathname === r || pathname.startsWith(r + "?"))) {
    return NextResponse.next();
  }

  // Protected workspace routes
  if (pathname.startsWith("/w")) {
    const sessionCookie =
      request.cookies.get("better-auth.session_token")?.value ||
      request.cookies.get("__Secure-better-auth.session_token")?.value;

    if (!sessionCookie) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     *  - _next/static
     *  - _next/image
     *  - favicon.ico
     *  - public API routes
     */
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
