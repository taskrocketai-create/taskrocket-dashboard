import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { slug, password } = await req.json();

  if (!slug || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("password_hash")
    .eq("slug", slug)
    .single();

  if (!client?.password_hash) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const hash = createHash("sha256").update(password).digest("hex");

  if (hash !== client.password_hash) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  // Set a secure, httpOnly cookie scoped to this client
  res.cookies.set(`tr_auth_${slug}`, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return res;
}
