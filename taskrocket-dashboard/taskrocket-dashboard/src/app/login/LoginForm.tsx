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
          <span>🚀</span>
          <span className={styles.brand}>TaskRocket</span>
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

          <button
            className={styles.btn}
            type="submit"
            disabled={loading || !password}
          >
            {loading ? "Please wait…" : "Sign in →"}
          </button>
        </form>

        <p className={styles.help}>
          Need access? Contact{" "}
          <a href="mailto:hello@taskrocket.org">hello@taskrocket.org</a>
        </p>
      </div>
    </div>
  );
}
