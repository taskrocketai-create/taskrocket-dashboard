import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? null;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // If there is an explicit next param (e.g. /auth/update-password for recovery), use it
      if (next) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // Otherwise find the user slug and go to their dashboard
      const { data: { user } } = await supabase.auth.getUser();
      const slug = user?.user_metadata?.dashboard_slug as string | undefined;
      if (slug) return NextResponse.redirect(`${origin}/${slug}`);

      return NextResponse.redirect(`${origin}/login`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
