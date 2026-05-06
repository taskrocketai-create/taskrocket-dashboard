import { getSupabaseClient, Client } from "@/lib/supabase";
import { notFound } from "next/navigation";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

async function getClient(slug: string): Promise<Client | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

async function getSubmissions(sheetId: string) {
  try {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    const range = "Sheet1!A2:J1000";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return [];
    const json = await res.json();
    const rows = json.values ?? [];
    return rows
      .filter((row: string[]) => row.some((cell) => cell?.trim()))
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
  } catch {
    return [];
  }
}

export default async function ClientDashboardPage({ params }: Props) {
  const { slug } = await params;
  const client = await getClient(slug);
  if (!client) notFound();
  const submissions = client.sheet_id
    ? await getSubmissions(client.sheet_id)
    : [];
  return <DashboardClient client={client} initialSubmissions={submissions} />;
}
