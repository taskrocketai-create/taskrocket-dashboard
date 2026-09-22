import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieEntry = { name: string; value: string; options?: Record<string, unknown> };

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: CookieEntry[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabaseResponse.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  // Refresh session -- required, do not remove
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // TEMP DEBUG - remove after diagnosing login loop
  console.log("[middleware]", {
    pathname,
    hasUser: !!user,
    userError: userError?.message ?? null,
    cookieNames: request.cookies.getAll().map((c) => c.name),
  });

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
    // TEMP DEBUG - remove after diagnosing login loop
    const cookieNames = request.cookies.getAll().map((c) => c.name).join(",");
    loginUrl.searchParams.set(
      "debug",
      `err=${userError?.message ?? "none"}|cookies=${cookieNames || "NONE"}`
    );
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.json|sw.js).*)"],
};
