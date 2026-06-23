import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required, do not remove
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Always allow public routes
  const publicRoutes = ["/login", "/auth/callback", "/auth/reset-password", "/auth/update-password"];
  if (publicRoutes.some(r => pathname.startsWith(r))) return supabaseResponse;

  // Pass through internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname === "/") {
    return supabaseResponse;
  }

  // Protect all /[slug] dashboard routes
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.json|sw.js).*)"],
};
