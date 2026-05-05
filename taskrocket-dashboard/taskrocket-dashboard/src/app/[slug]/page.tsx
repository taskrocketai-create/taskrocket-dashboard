import { supabase, Client } from "@/lib/supabase";
import { notFound } from "next/navigation";
import DashboardClient from "./DashboardClient";

export const revalidate = 30;

type Props = {
  params: Promise<{ slug: string }>;
};

async function getClient(slug: string): Promise<Client | null> {
  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

async function getSubmissions(scriptUrl: string) {
  try {
    const res = await fetch(`${scriptUrl}?action=getAll`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : json.data ?? [];
  } catch {
    return [];
  }
}

export default async function ClientDashboardPage({ params }: Props) {
  const { slug } = await params;
  const client = await getClient(slug);
  if (!client) notFound();

  const submissions = client.script_url
    ? await getSubmissions(client.script_url)
    : [];

  return <DashboardClient client={client} initialSubmissions={submissions} />;
}
