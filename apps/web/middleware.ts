import { NextRequest, NextResponse } from "next/server";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicRoutes = ["/", "/sign-in", "/sign-up", "/verify-email", "/forgot-password", "/reset-password"];
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/w/")) {
    const sessionToken =
      request.cookies.get("better-auth.session_token")?.value ||
      request.cookies.get("__Secure-better-auth.session_token")?.value ||
      request.cookies.get("__session")?.value;

    if (!sessionToken) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // api/v1 is the mounted Hono app: it does its own auth and never needs the
    // /w/* cookie gate below, so skipping it here saves a middleware invocation
    // on every web and mobile API call.
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/v1|api/webhooks|$).*)"
  ]
};
