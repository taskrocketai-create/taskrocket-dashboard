import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /<slug> routes (not /login, /api, /_next, etc.)
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // Extract slug from path: /graysons-auto → graysons-auto
  const slug = pathname.split("/")[1];
  if (!slug) return NextResponse.next();

  const cookieKey = `tr_auth_${slug}`;
  const cookie = req.cookies.get(cookieKey);

  if (!cookie?.value) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("slug", slug);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
