"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = params.get("slug") ?? "";
  const next = params.get("next") ?? `/${slug}`;

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      });
      if (res.ok) {
        router.push(next);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Incorrect password");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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

        <h1 className={styles.title}>Sign in to your dashboard</h1>
        <p className={styles.subtitle}>
          Enter your password to access{" "}
          <span className={styles.slugLabel}>/{slug}</span>
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btn} type="submit" disabled={loading || !password}>
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "14px", height: "14px", border: "2px solid rgba(13,21,32,0.3)", borderTop: "2px solid #0D1520", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                Please wait…
              </span>
            ) : "Sign in →"}
          </button>
        </form>

        <p className={styles.help}>
          Need access? Contact{" "}
          <a href="mailto:info@taskrocket.org">info@taskrocket.org</a>
        </p>
      </div>
    </div>
  );
}
