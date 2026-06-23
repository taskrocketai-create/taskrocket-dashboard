"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !data.user) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    const slug = data.user.user_metadata?.dashboard_slug as string | undefined;
    if (!slug) {
      setError("No dashboard found for this account. Contact support@taskrocket.org.");
      setLoading(false);
      return;
    }

    const destination = redirectTo && redirectTo.startsWith(`/${slug}`) ? redirectTo : `/${slug}`;
    router.push(destination);
    router.refresh();
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
            <div className={styles.logoSub}>The Modern Front Desk</div>
          </div>
        </div>

        <h1 className={styles.title}>Client Login</h1>
        <p className={styles.subtitle}>Sign in to your dashboard</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={styles.input}
            placeholder="Email address"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className={styles.input}
            placeholder="Password"
          />
          {error && <div className={styles.error}>{error}</div>}
          <button type="submit" disabled={loading} className={styles.btn}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className={styles.help}>
          <a href="/auth/reset-password">Forgot password?</a>
        </p>
      </div>
    </div>
  );
}
