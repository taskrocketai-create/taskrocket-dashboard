import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import DashboardClient from "./DashboardClient";
import { AithaClient, AithaCall } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

async function getClientBySlug(slug: string): Promise<AithaClient | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

async function getCalls(clientId: string): Promise<AithaCall[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data } = await supabase
    .from("calls")
    .select("*, messages(*)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data || [];
}

export default async function ClientDashboardPage({ params }: Props) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();
  const calls = await getCalls(client.id);
  return <DashboardClient client={client} initialCalls={calls} />;
}
