"use client";

import { useState, useEffect } from "react";

// Converts a base64url VAPID public key into the Uint8Array format
// required by PushManager.subscribe().
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function AdminNotificationsPage() {
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [alreadyOn, setAlreadyOn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setAlreadyOn(Notification.permission === "granted");
  }, []);

  async function enableAdminAlerts() {
    setStatus("working");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Push notifications aren't supported in this browser.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted.");
      }

      const registration = await navigator.serviceWorker.ready;

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY env var.");
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "admin", subscription }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save subscription.");
      }

      setStatus("done");
      setAlreadyOn(true);
      setMessage("Admin alerts enabled on this device.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Admin Alerts</h1>
      <p style={{ color: "#4B5A6E", marginBottom: 24 }}>
        Enable push notifications on this device for Build Watcher alerts and other
        admin-level events across all clients.
      </p>

      {alreadyOn ? (
        <div style={{ color: "#2DD4BF" }}>🔔 Admin alerts are enabled on this device.</div>
      ) : (
        <button
          onClick={enableAdminAlerts}
          disabled={status === "working"}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: "#2DD4BF",
            color: "#0B1220",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {status === "working" ? "Enabling…" : "Enable Admin Alerts"}
        </button>
      )}

      {message && (
        <p style={{ marginTop: 16, color: status === "error" ? "#EF4444" : "#4B5A6E" }}>
          {message}
        </p>
      )}
    </div>
  );
}
