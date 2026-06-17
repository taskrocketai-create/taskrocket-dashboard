import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect client dashboard routes /[slug]
  // Allow: root index, login page, API routes, static assets
  const isClientRoute = /^\/[a-z0-9-]+$/.test(pathname) &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next") &&
    pathname !== "/";

  if (!isClientRoute) return NextResponse.next();

  // Extract slug from path
  const slug = pathname.replace("/", "");

  // Check for auth cookie
  const authCookie = req.cookies.get(`tr_auth_${slug}`);

  if (!authCookie?.value) {
    // Not logged in — redirect to login page with slug
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("slug", slug);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.json|sw.js).*)"],
};
