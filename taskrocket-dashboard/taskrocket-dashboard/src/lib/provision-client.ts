/**
 * provision-client.ts
 * Admin utility -- creates a Supabase Auth user for a new client and sends an invite email.
 *
 * Usage: npx tsx taskrocket-dashboard/src/lib/provision-client.ts
 */

import { createAdminClient } from "./supabase/server";

interface ProvisionOptions {
  email: string;
  name: string;
  slug: string;
  clientType: "aitha" | "aitha-pm";
  sendInvite?: boolean;
}

export async function provisionClient(opts: ProvisionOptions) {
  const { email, name, slug, clientType, sendInvite = true } = opts;
  const admin = createAdminClient();

  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name, dashboard_slug: slug, client_type: clientType },
  });

  if (createError) throw new Error(`Failed to create auth user: ${createError.message}`);
  console.log("Auth user created:", authData.user.id);

  if (sendInvite) {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://dashboard.taskrocket.org/auth/callback",
      data: { name, dashboard_slug: slug, client_type: clientType },
    });
    if (inviteError) {
      console.warn("Invite failed:", inviteError.message, "-- send a password reset from the Supabase dashboard.");
    } else {
      console.log("Invite sent to", email);
    }
  }

  return authData.user;
}

// CLI -- edit values below then run
if (require.main === module) {
  provisionClient({
    email: "owner@example.com",
    name: "Business Owner",
    slug: "their-slug",
    clientType: "aitha",
  })
    .then(u => { console.log("Done:", u.email); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}
