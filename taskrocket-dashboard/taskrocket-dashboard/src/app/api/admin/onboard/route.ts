import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const INTAKE_FORM_URL = "https://forms.fillout.com/t/REPLACE_ME"; // TODO: swap in the real Fillout intake form link

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function pushAdmin(title: string, body: string) {
  try {
    await fetch("https://dashboard.taskrocket.org/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "admin", title, body }),
    });
  } catch {
    // best-effort -- never block onboarding on a push failure
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    business_name,
    owner_name,
    owner_email,
    owner_mobile,
    business_type,
    client_type, // "aitha" | "aitha-pm"
  } = body as Record<string, string>;

  if (!business_name || !owner_email || !client_type) {
    return NextResponse.json({ error: "business_name, owner_email, and client_type are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const slug = slugify(business_name);

  // 1. Create the client record
  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      business_name,
      owner_name: owner_name || null,
      owner_email,
      owner_mobile: owner_mobile || null,
      business_type: business_type || null,
      slug,
      status: "trial",
      trial_start_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (clientError) {
    return NextResponse.json({ error: `Failed to create client: ${clientError.message}` }, { status: 500 });
  }

  // 2. Create the Supabase Auth login, tied to this client's dashboard
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: owner_email,
    email_confirm: true,
    user_metadata: { name: owner_name || business_name, dashboard_slug: slug, client_type },
  });

  if (authError) {
    return NextResponse.json(
      { error: `Client record created, but auth account failed: ${authError.message}`, client },
      { status: 207 }
    );
  }

  // 3. Send the invite / welcome email with the intake form link
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(owner_email, {
    redirectTo: "https://dashboard.taskrocket.org/auth/callback",
    data: { name: owner_name || business_name, dashboard_slug: slug, client_type },
  });

  // 4. Notify Alan
  await pushAdmin(
    "🎉 New client onboarded",
    `${business_name} (${owner_email}) is set up. ${inviteError ? "Invite email failed — send a password reset manually." : "Invite email sent."}`
  );

  return NextResponse.json({
    ok: true,
    client,
    userId: authData.user.id,
    slug,
    inviteEmailSent: !inviteError,
    inviteError: inviteError?.message ?? null,
    intakeFormUrl: INTAKE_FORM_URL,
  });
}
