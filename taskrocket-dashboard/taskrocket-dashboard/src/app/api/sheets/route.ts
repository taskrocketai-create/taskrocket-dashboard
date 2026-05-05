import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const sheetId = req.nextUrl.searchParams.get("sheetId");
  if (!sheetId) return NextResponse.json({ error: "Missing sheetId" }, { status: 400 });

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const range = "Sheet1!A2:J1000";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) return NextResponse.json([], { status: 200 });

  const json = await res.json();
  const rows = json.values ?? [];

  const data = rows
    .filter((row: string[]) => row.some((cell: string) => cell?.trim()))
    .map((row: string[], i: number) => ({
      id: String(i + 2),
      call_time: row[0] ?? "",
      status: row[1] ?? "new",
      caller_number: row[2] ?? "",
      caller_name: row[3] ?? "",
      contact_preference: row[4] ?? "",
      best_time: row[5] ?? "",
      vehicle: row[6] ?? "",
      problem: row[7] ?? "",
      price_range: row[8] ?? "",
      conversation: row[9] ?? "",
    }));

  return NextResponse.json(data);
}
