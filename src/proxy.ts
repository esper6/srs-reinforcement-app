import { NextRequest, NextResponse } from "next/server";

const protectedPaths = ["/dashboard", "/subject", "/learn", "/review"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (protectedPaths.some((p) => pathname.startsWith(p))) {
    // Check for NextAuth session cookie
    const sessionToken =
      req.cookies.get("next-auth.session-token")?.value ||
      req.cookies.get("__Secure-next-auth.session-token")?.value;

    if (!sessionToken) {
      const signInUrl = new URL("/", req.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/subject/:path*", "/learn/:path*", "/review/:path*"],
};
