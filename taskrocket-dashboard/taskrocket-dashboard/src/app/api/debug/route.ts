import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "MISSING",
    anon_key_length: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length ?? 0,
    node_env: process.env.NODE_ENV,
  });
}
