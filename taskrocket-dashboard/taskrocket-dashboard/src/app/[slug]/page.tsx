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

  // Look up client by matching owner_email slug or aitha_phone slug
  // Slug format: graysons-auto maps to business_name
  const { data } = await supabase
    .schema("aitha")
    .from("clients")
    .select("*")
    .ilike("business_name", slug.replace(/-/g, " "))
    .single();

  if (data) return data;

  // Fallback: match by id
  const { data: byId } = await supabase
    .schema("aitha")
    .from("clients")
    .select("*")
    .eq("id", slug)
    .single();

  return byId;
}

async function getCalls(clientId: string): Promise<AithaCall[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data } = await supabase
    .schema("aitha")
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
