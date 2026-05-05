"use client";

import { useState, useCallback } from "react";
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
  if (clean.length === 11 && clean[0] === "1") {
    return `(${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return num;
}

function formatDate(str: string) {
  if (!str) return "—";
  const d = new Date(str);
  return isNaN(d.getTime())
    ? str
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function DashboardClient({ client, initialSubmissions }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
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

  const filtered = submissions.filter((s) => {
    const matchesFilter = filter === "all" || (s.status ?? "new").toLowerCase() === filter;
    const term = search.toLowerCase();
    const matchesSearch =
      !term ||
      String(s.caller_name ?? "").toLowerCase().includes(term) ||
      String(s.caller_number ?? "").toLowerCase().includes(term) ||
      String(s.problem ?? "").toLowerCase().includes(term) ||
      String(s.vehicle ?? "").toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  });

  const counts = {
    all: submissions.length,
    new: submissions.filter((s) => !s.status || s.status.toLowerCase() === "new").length,
    done: submissions.filter((s) => s.status?.toLowerCase() === "done").length,
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.logo}>
            <span>🚀</span>
            <span>Task<span className={styles.logoAccent}>Rocket</span></span>
          </div>
          <div className={styles.clientInfo}>
            <div className={styles.clientAvatar}>{client.business_name.charAt(0)}</div>
            <div>
              <div className={styles.clientName}>{client.business_name}</div>
              <div className={styles.clientSlug}>/{client.slug}</div>
            </div>
          </div>
        </div>

        <nav className={styles.nav}>
          {[
            { key: "all", label: "All Leads", count: counts.all },
            { key: "new", label: "New", count: counts.new },
            { key: "done", label: "Done", count: counts.done },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              className={`${styles.navItem} ${filter === key ? styles.navActive : ""}`}
              onClick={() => setFilter(key)}
            >
              <span>{label}</span>
              <span className={styles.badge}>{count}</span>
            </button>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.infoLabel}>Twilio Number</div>
          <div className={styles.infoValue}>
            {client.twilio_number ? formatPhone(client.twilio_number) : "—"}
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <h1 className={styles.pageTitle}>
              {filter === "all" ? "All Leads" : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </h1>
            <span className={styles.count}>{filtered.length} records</span>
          </div>
          <div className={styles.topbarRight}>
            <input
              className={styles.search}
              placeholder="Search name, vehicle, problem…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <p>No leads yet.</p>
            <p className={styles.emptyHint}>Missed calls will appear here automatically.</p>
          </div>
        ) : (
          <div className={styles.cardsWrap}>
            {filtered.map((row, i) => {
              const status = (row.status ?? "new").toLowerCase();
              const colorKey = STATUS_COLORS[status] ?? "yellow";
              const isDone = status === "done";
              return (
                <div
                  key={row.id ?? i}
                  className={`${styles.leadCard} ${isDone ? styles.leadCardDone : ""}`}
                >
                  <div className={styles.leadMain}>
                    <div className={styles.leadName}>
                      {row.caller_name || "Unknown Caller"}
                    </div>
                    <div className={styles.leadPhone}>
                      {row.caller_number ? formatPhone(String(row.caller_number)) : "—"}
                      {row.call_time ? ` · ${formatDate(String(row.call_time))}` : ""}
                    </div>
                  </div>

                  <div className={styles.leadVehicle}>
                    <div className={styles.leadVehicleLabel}>Vehicle</div>
                    <div className={styles.leadVehicleValue}>{String(row.vehicle || "—")}</div>
                  </div>

                  <div className={styles.leadProblem}>
                    <div className={styles.leadProblemLabel}>Problem</div>
                    <div className={styles.leadProblemValue}>{String(row.problem || "—")}</div>
                  </div>

                  <div className={styles.leadActions}>
                    <span className={`${styles.pill} ${styles[`pill_${colorKey}`]}`}>
                      {status}
                    </span>
                    {!!row.conversation && (
                      <button
                        className={styles.viewBtn}
                        onClick={() => setModalRow(row)}
                      >
                        View Convo
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {modalRow && (
        <div className={styles.modalOverlay} onClick={() => setModalRow(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>
                  {modalRow.caller_name || "Unknown Caller"}
                </h2>
                <p className={styles.modalSub}>
                  {modalRow.caller_number ? formatPhone(String(modalRow.caller_number)) : ""}
                  {modalRow.call_time ? ` · ${formatDate(String(modalRow.call_time))}` : ""}
                </p>
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
