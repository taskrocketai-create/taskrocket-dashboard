"use client";

import { useState } from "react";

export default function OnboardPage() {
  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    owner_email: "",
    owner_mobile: "",
    business_type: "",
    client_type: "aitha",
  });
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState<{ slug?: string; intakeFormUrl?: string; inviteEmailSent?: boolean; error?: string } | null>(null);

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    try {
      const res = await fetch("/api/admin/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(json.error ?? "Something went wrong");
      setResult(json);
      setStatus("done");
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Something went wrong" });
      setStatus("error");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 4,
    border: "1px solid #E3E7EF",
    background: "#fff",
    fontSize: 14,
    fontFamily: "Manrope, sans-serif",
    color: "#0B1830",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12.5, color: "#5B6B85", marginBottom: 6, display: "block", fontWeight: 600 };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 24px 80px", fontFamily: "Manrope, sans-serif", color: "#0B1830" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <img src="/taskrocket-logo.png" alt="TaskRocket" style={{ height: 24 }} />
        <div style={{ width: 1, height: 22, background: "#E3E7EF" }} />
        <h1 style={{ fontSize: 14, fontWeight: 700, color: "#5B6B85", margin: 0 }}>ONBOARD A CLIENT</h1>
      </div>

      {status !== "done" && (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Business name *</label>
            <input style={inputStyle} required value={form.business_name} onChange={(e) => update("business_name", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Owner name</label>
            <input style={inputStyle} value={form.owner_name} onChange={(e) => update("owner_name", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Owner email *</label>
            <input style={inputStyle} type="email" required value={form.owner_email} onChange={(e) => update("owner_email", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Owner mobile</label>
            <input style={inputStyle} value={form.owner_mobile} onChange={(e) => update("owner_mobile", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Business type</label>
            <input style={inputStyle} placeholder="e.g. Auto repair shop" value={form.business_type} onChange={(e) => update("business_type", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Product</label>
            <select style={inputStyle} value={form.client_type} onChange={(e) => update("client_type", e.target.value)}>
              <option value="aitha">Aitha (front desk assistant)</option>
              <option value="aitha-pm">Aitha PM (property management)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={status === "working"}
            style={{
              marginTop: 8, padding: "12px 20px", borderRadius: 4, border: "none",
              background: "#FD6300", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            {status === "working" ? "Creating…" : "Create client & send invite"}
          </button>
        </form>
      )}

      {status === "done" && result && !result.error && (
        <div style={{ background: "#D9F3E7", border: "1px solid #0F9D68", borderRadius: 4, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>✅ {form.business_name} is set up</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#0B1830" }}>
            Dashboard: dashboard.taskrocket.org/{result.slug}<br />
            Invite email: {result.inviteEmailSent ? "sent" : "failed — send a password reset manually from Supabase"}<br />
            Intake form to send them: {result.intakeFormUrl}
          </div>
        </div>
      )}

      {status === "error" && result?.error && (
        <div style={{ background: "#FFE4D2", border: "1px solid #FD6300", borderRadius: 4, padding: 20, color: "#0B1830" }}>
          {result.error}
        </div>
      )}
    </div>
  );
}
