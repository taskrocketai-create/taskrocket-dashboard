"use client";

import { useState, useCallback, useEffect } from "react";
import { Client, Submission } from "@/lib/supabase";
import styles from "./dashboard.module.css";

type Props = {
  client: Client;
  initialSubmissions: Submission[];
};

const STATUS_COLORS: Record<string, string> = {
  new: "yellow",
  contacted: "blue",
  done: "green",
  "no answer": "red",
};

function formatPhone(num: string) {
  const clean = num.replace(/\D/g, "");
  if (clean.length === 11 && clean[0] === "1") return `(${clean.slice(1,4)}) ${clean.slice(4,7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0,3)}) ${clean.slice(3,6)}-${clean.slice(6)}`;
  return num;
}

function formatDate(str: string) {
  if (!str) return "";
  const num = Number(str);
  const d = !isNaN(num) && num > 1000000000 ? new Date(num * 1000) : new Date(str);
  return isNaN(d.getTime()) ? str : d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function DashboardClient({ client, initialSubmissions }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("new");
  const [search, setSearch] = useState("");
  const [marking, setMarking] = useState<string | null>(null);
  const [modalRow, setModalRow] = useState<Submission | null>(null);

  const refresh = useCallback(async () => {
    if (!client.sheet_id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sheets?sheetId=${client.sheet_id}`);
      const data = await res.json();
      setSubmissions(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [client.sheet_id]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  const markDone = useCallback(async (row: Submission) => {
    setMarking(String(row.id));
    try {
      await new Promise(r => setTimeout(r, 400));
      setSubmissions(prev => prev.filter(s => s.id !== row.id));
    } finally {
      setMarking(null);
    }
  }, []);

  const counts = {
    all: submissions.length,
    new: submissions.filter(s => !s.status || s.status.toLowerCase() === "new").length,
    done: submissions.filter(s => s.status?.toLowerCase() === "done").length,
  };

  const filtered = submissions.filter(s => {
    const status = (s.status ?? "new").toLowerCase();
    const matchesFilter = filter === "all" || status === filter;
    const term = search.toLowerCase();
    const matchesSearch = !term ||
      String(s.caller_name ?? "").toLowerCase().includes(term) ||
      String(s.caller_number ?? "").toLowerCase().includes(term) ||
      String(s.problem ?? "").toLowerCase().includes(term) ||
      String(s.vehicle ?? "").toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className={styles.page}>
      <div className={styles.widget}>

        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.logo}>Task<span className={styles.logoAccent}>Rocket</span></span>
            <span className={styles.divider}>|</span>
            <span className={styles.clientName}>{client.business_name}</span>
          </div>
          <div className={styles.filters}>
            {[
              { key: "all", label: `All · ${counts.all}` },
              { key: "new", label: `New · ${counts.new}` },
              { key: "done", label: `Done · ${counts.done}` },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`${styles.filterBtn} ${filter === key ? styles.filterActive : ""}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.searchBar}>
          <input
            className={styles.search}
            placeholder="Search name, vehicle, problem…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className={`${styles.refreshBtn} ${loading ? styles.spinning : ""}`}
            onClick={refresh}
            disabled={loading}
            title="Refresh"
          >
            ↻
          </button>
        </div>

        <div className={styles.cards}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <p>No {filter === "all" ? "" : filter + " "}leads.</p>
              <p className={styles.emptyHint}>Missed calls will appear here automatically.</p>
            </div>
          ) : (
            filtered.map((row, i) => {
              const status = (row.status ?? "new").toLowerCase();
              const colorKey = STATUS_COLORS[status] ?? "yellow";
              const isNew = status === "new";
              const isMarking = marking === String(row.id);
              return (
                <div
                  key={row.id ?? i}
                  className={`${styles.leadCard} ${isNew ? styles.leadCardNew : ""}`}
                >
                  <div>
                    <div className={styles.leadName}>{row.caller_name || "Unknown Caller"}</div>
                    <div className={styles.leadPhone}>
                      {row.caller_number ? formatPhone(String(row.caller_number)) : "—"}
                      {row.call_time ? ` · ${formatDate(String(row.call_time))}` : ""}
                    </div>
                  </div>

                  <div>
                    <div className={styles.leadFieldLabel}>Vehicle</div>
                    <div className={styles.leadFieldValue}>{String(row.vehicle || "—")}</div>
                  </div>

                  <div>
                    <div className={styles.leadFieldLabel}>Problem</div>
                    <div className={styles.leadProblemValue}>{String(row.problem || "—")}</div>
                  </div>

                  <div className={styles.leadActions}>
                    <span className={`${styles.pill} ${styles[`pill_${colorKey}`]}`}>{status}</span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {!!row.conversation && (
                        <button className={styles.viewBtn} onClick={() => setModalRow(row)}>
                          Convo
                        </button>
                      )}
                      {isNew && (
                        <button
                          className={styles.doneBtn}
                          onClick={() => markDone(row)}
                          disabled={isMarking}
                        >
                          {isMarking ? "…" : "✓ Done"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerText}>
            Twilio · {client.twilio_number ? formatPhone(client.twilio_number) : "—"}
          </span>
          <span className={styles.footerText}>dashboard.taskrocket.org</span>
        </div>
      </div>

      {modalRow && (
        <div className={styles.modalOverlay} onClick={() => setModalRow(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>{modalRow.caller_name || "Unknown Caller"}</div>
                <div className={styles.modalSub}>
                  {modalRow.caller_number ? formatPhone(String(modalRow.caller_number)) : ""}
                  {modalRow.call_time ? ` · ${formatDate(String(modalRow.call_time))}` : ""}
                </div>
              </div>
              <button className={styles.modalClose} onClick={() => setModalRow(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <pre className={styles.conversation}>{String(modalRow.conversation ?? "")}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
