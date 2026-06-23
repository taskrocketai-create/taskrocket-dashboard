import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import DashboardClient from "./DashboardClient";
import PMDashboardClient from "./PMDashboardClient";
import type { AithaClient, AithaCall } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

async function getAithaClient(slug: string): Promise<AithaClient | null> {
  const { data } = await sb().from("clients").select("*").eq("slug", slug).single();
  return data;
}

async function getCalls(clientId: string): Promise<AithaCall[]> {
  const { data } = await sb()
    .from("calls")
    .select("*, messages(*)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data || []).map((call: AithaCall) => ({
    ...call,
    messages: (call.messages || []).sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  }));
}

async function getPMData(slug: string) {
  const supabase = sb();

  // Use RPC functions to bypass schema exposure requirement
  const { data: client } = await supabase.rpc("pm_get_client", { p_slug: slug });
  if (!client) return null;

  const [incRes, tenRes, propRes, venRes] = await Promise.all([
    supabase.rpc("pm_get_incidents",  { p_client_id: client.id }),
    supabase.rpc("pm_get_tenants",    { p_client_id: client.id }),
    supabase.rpc("pm_get_properties", { p_client_id: client.id }),
    supabase.rpc("pm_get_vendors",    { p_client_id: client.id }),
  ]);

  return {
    client,
    incidents:   incRes.data  || [],
    tenants:     tenRes.data   || [],
    properties:  propRes.data  || [],
    vendors:     venRes.data   || [],
  };
}

export default async function ClientDashboardPage({ params }: Props) {
  const { slug } = await params;

  // Try Aitha first
  const aithaClient = await getAithaClient(slug);
  if (aithaClient) {
    const calls = await getCalls(aithaClient.id);
    return <DashboardClient client={aithaClient} initialCalls={calls} />;
  }

  // Try PM via RPC
  const pmData = await getPMData(slug);
  if (pmData) {
    return (
      <PMDashboardClient
        client={pmData.client}
        incidents={pmData.incidents}
        tenants={pmData.tenants}
        properties={pmData.properties}
        vendors={pmData.vendors}
      />
    );
  }

  notFound();
}
