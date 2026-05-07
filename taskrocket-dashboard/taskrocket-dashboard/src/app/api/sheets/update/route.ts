import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { sheetId, rowIndex, status } = await req.json();

  if (!sheetId || !rowIndex || !status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const range = `Sheet1!B${rowIndex}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}&valueInputOption=RAW`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [[status]] }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
