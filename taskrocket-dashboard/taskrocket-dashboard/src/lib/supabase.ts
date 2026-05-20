import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type AithaClient = {
  id: string;
  business_name: string;
  owner_name: string | null;
  owner_email: string;
  owner_mobile: string | null;
  aitha_phone: string;
  business_type: string | null;
  business_hours: string | null;
  status: string;
  created_at: string;
};

export type AithaCall = {
  id: string;
  client_id: string;
  caller_number: string;
  aitha_phone: string;
  call_status: string;
  urgency: string | null;
  ai_response_sent: string | null;
  voicemail_transcript: string | null;
  voicemail_url: string | null;
  created_at: string;
  updated_at: string;
  messages?: AithaMessage[];
};

export type AithaMessage = {
  id: string;
  call_id: string;
  client_id: string;
  direction: "inbound" | "outbound_ai" | "outbound_owner";
  body: string;
  from_number: string | null;
  to_number: string | null;
  created_at: string;
};

// Legacy — kept so existing imports don't break
export type Client = AithaClient & { slug: string; sheet_id: string | null; script_url: string | null; twilio_number: string | null; };
export type Submission = Record<string, unknown>;
