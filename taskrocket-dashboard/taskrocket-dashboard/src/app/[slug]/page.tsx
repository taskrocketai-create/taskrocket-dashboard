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

async function getPMClient(slug: string) {
  const { data } = await sb().schema("pm").from("clients").select("*").eq("slug", slug).single();
  return data;
}

async function getPMData(clientId: string) {
  const client = sb();
  const pm = client.schema("pm");
  const [incRes, tenRes, propRes, venRes] = await Promise.all([
    pm.from("incidents")
      .select("*, tenant:tenants(id,name,phone,unit), property:properties(id,name,address), vendor:vendors(id,name,phone,trade)")
      .eq("client_id", clientId)
      .order("reported_at", { ascending: false })
      .limit(100),
    pm.from("tenants")
      .select("*, property:properties(id,name)")
      .eq("client_id", clientId)
      .order("name"),
    pm.from("properties")
      .select("*")
      .eq("client_id", clientId)
      .order("name"),
    pm.from("vendors")
      .select("*")
      .eq("client_id", clientId)
      .order("trade")
      .order("priority"),
  ]);
  return {
    incidents: incRes.data || [],
    tenants:   tenRes.data  || [],
    properties: propRes.data || [],
    vendors:   venRes.data  || [],
  };
}

export default async function ClientDashboardPage({ params }: Props) {
  const { slug } = await params;

  // Aitha clients first
  const aithaClient = await getAithaClient(slug);
  if (aithaClient) {
    const calls = await getCalls(aithaClient.id);
    return <DashboardClient client={aithaClient} initialCalls={calls} />;
  }

  // PM clients
  const pmClient = await getPMClient(slug);
  if (pmClient) {
    const { incidents, tenants, properties, vendors } = await getPMData(pmClient.id);
    return (
      <PMDashboardClient
        client={pmClient}
        incidents={incidents}
        tenants={tenants}
        properties={properties}
        vendors={vendors}
      />
    );
  }

  notFound();
}
