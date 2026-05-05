import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const scriptUrl = req.nextUrl.searchParams.get("scriptUrl");
  if (!scriptUrl) {
    return NextResponse.json({ error: "Missing scriptUrl" }, { status: 400 });
  }

  try {
    const res = await fetch(`${scriptUrl}?action=getAll`, {
      next: { revalidate: 30 },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
