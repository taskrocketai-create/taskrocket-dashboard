import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { slug, password } = await req.json();

  if (!slug || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const hash = createHash("sha256").update(password).digest("hex");

  // Try Aitha clients first
  const { data: aithaClient } = await supabase
    .from("clients")
    .select("password_hash")
    .eq("slug", slug)
    .single();

  if (aithaClient?.password_hash) {
    if (hash !== aithaClient.password_hash) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }
    return setAuthCookie(slug, hash);
  }

  // Try PM clients
  const { data: pmClient } = await supabase
    .schema("pm")
    .from("clients")
    .select("password_hash")
    .eq("slug", slug)
    .single();

  if (pmClient?.password_hash) {
    if (hash !== pmClient.password_hash) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }
    return setAuthCookie(slug, hash);
  }

  return NextResponse.json({ error: "Client not found" }, { status: 404 });
}

function setAuthCookie(slug: string, hash: string) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(`tr_auth_${slug}`, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
