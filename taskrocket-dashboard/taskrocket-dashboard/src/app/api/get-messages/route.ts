import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get("callId");
  if (!callId) return NextResponse.json([]);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("call_id", callId)
    .order("created_at", { ascending: true });

  return NextResponse.json(data || []);
}
