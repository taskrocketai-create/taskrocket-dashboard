import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { callId } = await req.json();
  if (!callId) return NextResponse.json({ error: "Missing callId" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  await supabase.from("messages").delete().eq("call_id", callId);
  await supabase.from("calls").delete().eq("id", callId);

  return NextResponse.json({ ok: true });
}
