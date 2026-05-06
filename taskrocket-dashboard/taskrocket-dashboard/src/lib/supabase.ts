import { createClient } from "@supabase/supabase-js";

let supabaseClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
}

export type Client = {
  id: string;
  created_at: string;
  slug: string;
  business_name: string;
  sheet_id: string | null;
  script_url: string | null;
  twilio_number: string | null;
};

export type Submission = {
  id: string;
  created_at: string;
  caller_name?: string;
  caller_number: string;
  call_time?: string;
  best_time?: string;
  status?: string;
  notes?: string;
  [key: string]: unknown;
};
