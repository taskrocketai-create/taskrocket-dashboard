import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: "var(--text-muted)",
      }}
    >
      <span style={{ fontSize: 48 }}>🚀</span>
      <h1 style={{ fontSize: 24, color: "var(--text)" }}>Client not found</h1>
      <p style={{ fontSize: 14 }}>
        That dashboard doesn&apos;t exist yet.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          padding: "10px 20px",
          background: "var(--accent-glow)",
          color: "var(--accent-light)",
          borderRadius: 8,
          border: "1px solid var(--accent)",
          fontSize: 14,
        }}
      >
        ← Back to clients
      </Link>
    </div>
  );
}
