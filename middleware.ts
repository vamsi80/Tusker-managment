import { NextRequest, NextResponse } from "next/server";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. PUBLIC ROUTES: Skip check entirely for landing and auth pages
  const publicRoutes = ["/", "/sign-in", "/sign-up", "/verify-email"];
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // 2. PROTECTED ROUTES (Workspace, etc.)
  if (pathname.startsWith("/w/")) {
    // Read session token directly from cookie (no HTTP round-trip)
    // Better Auth default: better-auth.session_token
    const sessionToken =
      request.cookies.get("better-auth.session_token")?.value ||
      request.cookies.get("__Secure-better-auth.session_token")?.value ||
      request.cookies.get("__session")?.value; // Fallback for some environments

    if (!sessionToken) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }

    // 🚀 FAST PATH: We have a token, so we let it through.
    // The actual session validation (integrity, expiry, email-verification) 
    // is handled by the Server Component's requireUser() call, which is 
    // cached per-request for zero overhead once on the page.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // Exclude static assets and other non-protected prefixes
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/webhooks|$).*)"
  ]
};
