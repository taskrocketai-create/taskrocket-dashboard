"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "../../login/login.module.css";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    // Supabase recovery emails land here with a code in the URL.
    // The auth/callback route exchanges it for a session, then redirects here.
    // But if for some reason we land here with hash params (#access_token=...&type=recovery),
    // we need to let the Supabase client detect and set the session from the hash.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });

    // Also check if we already have a session (came via callback route)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don’t match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const slug = user?.user_metadata?.dashboard_slug as string | undefined;
    router.push(slug ? `/${slug}` : "/login");
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <svg className={styles.logoMark} viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="1024" height="1024" rx="210" fill="#111E2E" stroke="#2DD4BF" strokeWidth="42"/>
            <path d="M240 520C240 345 355 226 512 226C669 226 784 345 784 520" stroke="#2DD4BF" strokeWidth="72" strokeLinecap="round"/>
            <rect x="168" y="482" width="126" height="204" rx="63" fill="#2DD4BF"/>
            <rect x="730" y="482" width="126" height="204" rx="63" fill="#2DD4BF"/>
            <path d="M792 675C742 800 630 862 492 862" stroke="#2DD4BF" strokeWidth="54" strokeLinecap="round"/>
            <circle cx="468" cy="862" r="42" fill="#FF7A30"/>
            <path d="M346 672C346 672 448 402 494 310C503 292 529 292 538 310C585 402 688 672 688 672" stroke="#F5EFE1" strokeWidth="68" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M416 564C464 538 570 538 620 564" stroke="#F5EFE1" strokeWidth="50" strokeLinecap="round"/>
          </svg>
          <div>
            <div className={styles.logoText}>Aitha</div>
            <div className={styles.logoSub}>Set New Password</div>
          </div>
        </div>

        {!ready ? (
          <p className={styles.subtitle} style={{ marginTop: "8px" }}>
            Verifying your reset link…
          </p>
        ) : (
          <form onSubmit={handleUpdate} className={styles.form} style={{ marginTop: "8px" }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className={styles.input}
              placeholder="New password (min. 8 characters)"
            />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className={styles.input}
              placeholder="Confirm new password"
            />
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" disabled={loading} className={styles.btn}>
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
