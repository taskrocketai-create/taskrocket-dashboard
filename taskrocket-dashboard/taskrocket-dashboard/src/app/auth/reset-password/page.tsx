"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "../../login/login.module.css";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      // Point to the callback route which will exchange the code then redirect to update-password
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    if (resetError) {
      setError("Something went wrong. Check the email address and try again.");
    } else {
      setSent(true);
    }
    setLoading(false);
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
            <div className={styles.logoSub}>Password Reset</div>
          </div>
        </div>

        {sent ? (
          <>
            <p className={styles.subtitle} style={{ marginTop: "8px" }}>
              Check your inbox — we sent a reset link to <strong style={{ color: "#F5EFE1" }}>{email}</strong>.
            </p>
            <p className={styles.help} style={{ marginTop: "24px" }}>
              <a href="/login">← Back to sign in</a>
            </p>
          </>
        ) : (
          <form onSubmit={handleReset} className={styles.form} style={{ marginTop: "8px" }}>
            <p className={styles.subtitle} style={{ marginBottom: "16px" }}>
              Enter your email and we’ll send a link to set a new password.
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className={styles.input}
              placeholder="Email address"
            />
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" disabled={loading} className={styles.btn}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <p className={styles.help}><a href="/login">← Back to sign in</a></p>
          </form>
        )}
      </div>
    </div>
  );
}
