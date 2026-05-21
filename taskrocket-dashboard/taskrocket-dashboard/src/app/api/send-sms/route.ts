import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { to, from, body, callId, clientId, resolve } = await req.json();

    // Handle resolve-only requests
    if (resolve && callId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );
      await supabase
        .from("calls")
        .update({ call_status: "resolved" })
        .eq("id", callId);
      return NextResponse.json({ ok: true });
    }

    if (!to || !from || !body) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      }
    );

    if (!twilioRes.ok) {
      const err = await twilioRes.json();
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const twilioData = await twilioRes.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    await supabase.from("messages").insert({
      call_id: callId,
      client_id: clientId,
      direction: "outbound_owner",
      body,
      from_number: from,
      to_number: to,
      twilio_message_sid: twilioData.sid,
    });

    await supabase
      .from("calls")
      .update({ call_status: "owner_replied" })
      .eq("id", callId);

    return NextResponse.json({ success: true, sid: twilioData.sid });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
