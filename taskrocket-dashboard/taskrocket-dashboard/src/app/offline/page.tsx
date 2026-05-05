export default function OfflinePage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      background: "#f4f6fb",
      fontFamily: "-apple-system, sans-serif",
    }}>
      <span style={{ fontSize: 48 }}>🚀</span>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1e2d6b" }}>You're offline</h1>
      <p style={{ fontSize: 14, color: "#64748b" }}>Check your connection and try again.</p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 8,
          padding: "10px 24px",
          background: "#f97316",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}
