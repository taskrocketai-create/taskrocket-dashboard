"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AithaClient, AithaCall, AithaMessage } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import styles from "./dashboard.module.css";

/* ─── HELPERS ─────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return isToday ? `Today ${t}` : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${t}`;
}

function trunc(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function playPing() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

/* ─── EXTRACT VEHICLE / PROBLEM FROM CONVERSATION ──────────── */
function extractDetails(call: AithaCall): { vehicle: string; problem: string } {
  const msgs = call.messages || [];
  const transcript = call.voicemail_transcript || "";
  const fullText = [transcript, ...msgs.map(m => m.body || "")].join(" ").toLowerCase();

  // Simple heuristic — look for year + make patterns
  const yearMatch = fullText.match(/\b(19|20)\d{2}\b/);
  const makeMatch = fullText.match(/\b(ford|chevy|chevrolet|toyota|honda|dodge|jeep|nissan|hyundai|kia|subaru|bmw|mercedes|audi|volkswagen|vw|gmc|ram|mazda|volvo|lexus|acura|infiniti|buick|cadillac|lincoln|chrysler|mitsubishi|wrangler|tacoma|silverado|f-150|f150|mustang|camry|civic|accord|altima|malibu|equinox|explorer|escape|pilot|cr-v|rav4|highlander)\b/i);

  let vehicle = "";
  if (yearMatch && makeMatch) vehicle = `${yearMatch[0]} ${makeMatch[0]}`;
  else if (makeMatch) vehicle = makeMatch[0];
  else if (yearMatch) vehicle = `${yearMatch[0]} vehicle`;

  // Problem keywords
  const problemMap: [RegExp, string][] = [
    [/oil change|lube/i, "Oil change"],
    [/brake|braking|stopping/i, "Brakes"],
    [/tire|flat|rotation/i, "Tires"],
    [/check engine|engine light/i, "Check engine light"],
    [/transmission/i, "Transmission"],
    [/a\/c|ac |air condition/i, "A/C"],
    [/heat|heater|heating/i, "Heater"],
    [/battery|charging|electrical/i, "Battery / electrical"],
    [/exhaust|muffler/i, "Exhaust"],
    [/alignment|steering/i, "Alignment / steering"],
    [/inspection|state inspection/i, "Inspection"],
    [/noise|sound|rattle|squeak|clunk|grind/i, "Noise / sound"],
    [/leak|leaking/i, "Leak"],
    [/shak|vibrat/i, "Shaking / vibration"],
    [/start|wont start|not start/i, "Won't start"],
    [/overhe|temp|hot/i, "Overheating"],
  ];

  let problem = "";
  for (const [rx, label] of problemMap) {
    if (rx.test(fullText)) { problem = label; break; }
  }

  return { vehicle: vehicle ? vehicle.charAt(0).toUpperCase() + vehicle.slice(1) : "", problem };
}

/* ─── STATUS CONFIG ──────────────────────────────────────── */
type StatusConfig = { label: string; tagClass: string; section: "new" | "active" | "ready" | "closed" };

const STATUS_MAP: Record<string, StatusConfig> = {
  missed:           { label: "New Lead",        tagClass: styles.tagNew,   section: "new"    },
  ai_texted:        { label: "AI Replied",       tagClass: styles.tagWait,  section: "active" },
  customer_replied: { label: "Replied",          tagClass: styles.tagNew,   section: "active" },
  owner_replied:    { label: "You Replied",      tagClass: styles.tagWait,  section: "active" },
  resolved:         { label: "Ready to Call",    tagClass: styles.tagReady, section: "ready"  },
  closed:           { label: "Closed",           tagClass: styles.tagDone,  section: "closed" },
};

function getStatus(s: string): StatusConfig {
  return STATUS_MAP[s] || STATUS_MAP["missed"];
}

/* ─── TYPES ──────────────────────────────────────────────── */
type Props = { client: AithaClient; initialCalls: AithaCall[] };

/* ─── COMPONENT ──────────────────────────────────────────── */
export default function DashboardClient({ client, initialCalls }: Props) {
  const [calls, setCalls]           = useState<AithaCall[]>(initialCalls);
  const [selected, setSelected]     = useState<AithaCall | null>(null);
  const [reply, setReply]           = useState("");
  const [sending, setSending]       = useState(false);
  const [pushOn, setPushOn]         = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    new: true, active: true, ready: true, closed: false,
  });
  const toastRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const threadRef = useRef<HTMLDivElement>(null);

  // Scroll thread to bottom on new messages
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [selected?.messages?.length]);

  // Push permission check
  useEffect(() => {
    if ("Notification" in window) {
      setPushOn(Notification.permission === "granted");
      if (Notification.permission === "default") setTimeout(() => setShowBanner(true), 4000);
    }
  }, []);

  // Realtime
  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase
      .channel("aitha-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `client_id=eq.${client.id}` }, (payload) => {
        const call = payload.new as AithaCall;
        setCalls(prev => [{ ...call, messages: [] }, ...prev]);
        if (call.urgency === "immediate") {
          playPing();
          showToast(`🔴 Urgent call from ${call.caller_number}`);
          notify("🔴 Urgent missed call", `From ${call.caller_number} — needs immediate attention`);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `client_id=eq.${client.id}` }, (payload) => {
        const updated = payload.new as AithaCall;
        setCalls(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
        setSelected(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
        if (updated.call_status === "resolved") {
          playPing();
          showToast(`✅ Ready for callback — ${updated.caller_number}`);
          notify("Ready for callback", `${updated.caller_number} is ready to schedule`);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${client.id}` }, (payload) => {
        const msg = payload.new as AithaMessage;
        setCalls(prev => prev.map(c => {
          if (c.id !== msg.call_id) return c;
          const existing = c.messages || [];
          if (existing.some(m => m.id === msg.id)) return c;
          return { ...c, messages: [...existing, msg] };
        }));
        setSelected(prev => {
          if (!prev || prev.id !== msg.call_id) return prev;
          const existing = prev.messages || [];
          if (existing.some(m => m.id === msg.id)) return prev;
          return { ...prev, messages: [...existing, msg] };
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [client.id]);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 4000);
  }

  function notify(title: string, body: string) {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png" });
    }
  }

  async function enablePush() {
    if (!("Notification" in window)) return;
    const r = await Notification.requestPermission();
    setPushOn(r === "granted");
    setShowBanner(false);
    if (r === "granted") showToast("🔔 Notifications enabled");
  }

  async function openCall(call: AithaCall) {
    setReply("");
    try {
      const res = await fetch(`/api/get-messages?callId=${call.id}`);
      const msgs = await res.json();
      setSelected({ ...call, messages: msgs });
    } catch {
      setSelected(call);
    }
  }

  const sendSMS = useCallback(async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.caller_number,
          from: client.aitha_phone,
          body: reply.trim(),
          callId: selected.id,
          clientId: client.id,
        }),
      });
      if (!res.ok) throw new Error();
      const newMsg: AithaMessage = {
        id: Date.now().toString(),
        call_id: selected.id,
        client_id: client.id,
        direction: "outbound_owner",
        body: reply.trim(),
        from_number: client.aitha_phone,
        to_number: selected.caller_number,
        created_at: new Date().toISOString(),
      };
      setCalls(prev => prev.map(c => c.id !== selected.id ? c : { ...c, call_status: "owner_replied", messages: [...(c.messages || []), newMsg] }));
      setSelected(prev => prev ? { ...prev, call_status: "owner_replied", messages: [...(prev.messages || []), newMsg] } : prev);
      setReply("");
      showToast("✓ Text sent");
    } catch {
      showToast("Failed to send — try again");
    }
    setSending(false);
  }, [reply, selected, sending, client]);

  async function markComplete(callId: string) {
    await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolve: true, callId }),
    });
    setCalls(prev => prev.map(c => c.id !== callId ? c : { ...c, call_status: "closed" }));
    setSelected(prev => prev?.id === callId ? { ...prev, call_status: "closed" } : prev);
    showToast("✓ Marked complete");
  }

  async function deleteCall(callId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      await fetch("/api/delete-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });
      setCalls(prev => prev.filter(c => c.id !== callId));
      if (selected?.id === callId) setSelected(null);
      showToast("✓ Deleted");
    } catch {
      showToast("Failed to delete");
    }
  }

  function toggleSection(key: string) {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  /* ─── COMPUTED ─────────────────────────────────────────── */
  const today = new Date().toDateString();

  const sections = {
    new:    calls.filter(c => getStatus(c.call_status).section === "new"),
    active: calls.filter(c => getStatus(c.call_status).section === "active"),
    ready:  calls.filter(c => getStatus(c.call_status).section === "ready"),
    closed: calls.filter(c => getStatus(c.call_status).section === "closed"),
  };

  const metrics = {
    missed:  calls.filter(c => new Date(c.created_at).toDateString() === today).length,
    active:  sections.active.length,
    ready:   sections.ready.length,
    closed:  calls.filter(c => c.call_status === "closed" && new Date(c.created_at).toDateString() === today).length,
  };

  /* ─── RENDER CARD ──────────────────────────────────────── */
  function renderCard(call: AithaCall) {
    const st = getStatus(call.call_status);
    const { vehicle, problem } = extractDetails(call);
    const msgs = call.messages || [];
    const lastMsg = msgs[msgs.length - 1];
    const isNew = call.call_status === "customer_replied";
    const isUrgent = call.urgency === "immediate";

    // Build preview text
    let preview = "";
    if (vehicle || problem) {
      preview = [vehicle, problem].filter(Boolean).join(" · ");
    } else if (lastMsg?.body) {
      preview = trunc(lastMsg.body, 80);
    } else if (call.voicemail_transcript) {
      preview = trunc(call.voicemail_transcript, 80);
    } else if (call.ai_response_sent) {
      preview = trunc(call.ai_response_sent, 80);
    }

    return (
      <div
        key={call.id}
        className={`${styles.card} ${isNew ? styles.cardNew : ""} ${isUrgent ? styles.cardUrgent : ""}`}
        onClick={() => openCall(call)}
      >
        <div className={styles.cardLeft}>
          <div className={styles.cardTop}>
            <span className={styles.callerNum}>{call.caller_number}</span>
            <span className={styles.timeAgo}>{timeAgo(call.created_at)}</span>
          </div>
          {preview && <div className={styles.cardSummary}>{preview}</div>}
          <div className={styles.cardTags}>
            <span className={`${styles.tag} ${st.tagClass}`}>{st.label}</span>
            {call.voicemail_transcript && <span className={`${styles.tag} ${styles.tagVm}`}>🎙 Voicemail</span>}
            {isUrgent && <span className={`${styles.tag}`} style={{ background: "rgba(239,68,68,0.15)", color: "var(--red)" }}>🔴 Urgent</span>}
          </div>
        </div>
        <div className={styles.cardRight}>
          <button className={styles.deleteBtn} onClick={(e) => deleteCall(call.id, e)} aria-label="Delete">✕</button>
        </div>
      </div>
    );
  }

  /* ─── RENDER SECTION ───────────────────────────────────── */
  function renderSection(
    key: "new" | "active" | "ready" | "closed",
    title: string,
    dotColor: string,
    items: AithaCall[],
    alertCount?: boolean
  ) {
    const isOpen = openSections[key];
    return (
      <div className={styles.section} key={key}>
        <div className={styles.sectionHeader} onClick={() => toggleSection(key)}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionDot} style={{ background: dotColor }} />
            {title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className={`${styles.sectionCount} ${alertCount && items.length > 0 ? styles.sectionCountAlert : ""}`}>
              {items.length}
            </span>
            <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>▼</span>
          </div>
        </div>
        {isOpen && (
          <div className={styles.cardList}>
            {items.length === 0
              ? <div className={styles.empty}>None right now</div>
              : items.map(renderCard)
            }
          </div>
        )}
      </div>
    );
  }

  /* ─── DRAWER ───────────────────────────────────────────── */
  function renderDrawer() {
    if (!selected) return null;
    const st = getStatus(selected.call_status);
    const { vehicle, problem } = extractDetails(selected);
    const msgs = selected.messages || [];
    const hasOutboundAI = msgs.some(m => m.direction === "outbound_ai");
    const isClosed = selected.call_status === "closed";

    return (
      <div className={styles.overlay} onClick={() => setSelected(null)}>
        <div className={styles.drawer} onClick={e => e.stopPropagation()}>
          <div className={styles.drawerHandle} />

          {/* Header */}
          <div className={styles.drawerHeader}>
            <div className={styles.drawerNum}>{selected.caller_number}</div>
            <div className={styles.drawerMeta}>
              <span className={`${styles.tag} ${st.tagClass}`}>{st.label}</span>
              <span className={styles.metaSep}>·</span>
              <span>{formatTime(selected.created_at)}</span>
            </div>
            <div className={styles.drawerActions}>
              {/* Call button */}
              <a
                href={`tel:${selected.caller_number}`}
                className={styles.btnCall}
                onClick={e => e.stopPropagation()}
              >
                📞 <span>Call Back</span>
              </a>
              {/* Mark complete */}
              {!isClosed && (
                <button className={styles.btnResolve} onClick={() => markComplete(selected.id)}>
                  ✓ Mark Complete
                </button>
              )}
              {/* Delete */}
              <button className={styles.btnDelete} onClick={() => deleteCall(selected.id)}>
                🗑
              </button>
              {/* Close */}
              <button className={styles.btnClose} onClick={() => setSelected(null)}>✕</button>
            </div>
          </div>

          {/* Vehicle / Problem pills */}
          {(vehicle || problem) && (
            <div className={styles.detailPills}>
              {vehicle && (
                <div className={styles.detailPill}>
                  <div className={styles.detailPillLabel}>Vehicle</div>
                  <div className={styles.detailPillValue}>{vehicle}</div>
                </div>
              )}
              {problem && (
                <div className={styles.detailPill}>
                  <div className={styles.detailPillLabel}>Problem</div>
                  <div className={styles.detailPillValue}>{problem}</div>
                </div>
              )}
            </div>
          )}

          {/* Voicemail */}
          {selected.voicemail_transcript && (
            <div className={styles.vmSection}>
              <div className={styles.vmHeader}>
                <span className={styles.vmLabel}>🎙 Voicemail</span>
                {selected.voicemail_url && (
                  <a
                    href={selected.voicemail_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.vmPlayBtn}
                    onClick={e => e.stopPropagation()}
                  >
                    ▶ Listen
                  </a>
                )}
              </div>
              <div className={styles.vmTranscript}>{selected.voicemail_transcript}</div>
            </div>
          )}

          {/* Thread */}
          <div className={styles.thread} ref={threadRef}>
            {selected.ai_response_sent && !hasOutboundAI && (
              <div className={`${styles.msgGroup} ${styles.msgGroupRight}`}>
                <div className={styles.msgSender}>Auto-reply</div>
                <div className={`${styles.bubble} ${styles.bubbleAI}`}>{selected.ai_response_sent}</div>
              </div>
            )}
            {msgs.map((m, i) => {
              const isIn = m.direction === "inbound";
              const isAI = m.direction === "outbound_ai";
              return (
                <div key={i} className={`${styles.msgGroup} ${isIn ? styles.msgGroupLeft : styles.msgGroupRight}`}>
                  <div className={styles.msgSender}>
                    {isAI ? "Auto-reply" : isIn ? "Customer" : "You"}
                  </div>
                  <div className={`${styles.bubble} ${isIn ? styles.bubbleIn : isAI ? styles.bubbleAI : styles.bubbleOwner}`}>
                    {m.body}
                  </div>
                  <div className={styles.msgTime}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              );
            })}
            {msgs.length === 0 && !selected.ai_response_sent && (
              <div className={styles.empty}>No messages yet</div>
            )}
          </div>

          {/* Reply / Closed bar */}
          {!isClosed ? (
            <div className={styles.replyBar}>
              <textarea
                className={styles.replyInput}
                placeholder="Type a message… (Enter to send)"
                value={reply}
                rows={2}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSMS(); } }}
              />
              <button
                className={styles.sendBtn}
                onClick={sendSMS}
                disabled={!reply.trim() || sending}
              >
                {sending ? "Sending…" : "Send Text →"}
              </button>
            </div>
          ) : (
            <div className={styles.resolvedBar}>✓ Complete — ready for callback</div>
          )}
        </div>
      </div>
    );
  }

  /* ─── MAIN RENDER ──────────────────────────────────────── */
  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.brandMark}>A</div>
          <span className={styles.businessName}>{client.business_name}</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.liveBadge}>
            <div className={styles.liveDot} />
            Live
          </div>
          <button
            className={styles.notifBtn}
            style={{ color: pushOn ? "var(--teal)" : "var(--text3)" }}
            onClick={() => !pushOn && enablePush()}
            title={pushOn ? "Notifications on" : "Enable notifications"}
          >
            {pushOn ? "🔔" : "🔕"}
          </button>
        </div>
      </div>

      {/* Push banner */}
      {showBanner && !pushOn && (
        <div className={styles.pushBanner}>
          <span>Get notified when a customer is ready for a callback</span>
          <div className={styles.pushBannerBtns}>
            <button className={styles.pushAllow} onClick={enablePush}>Allow</button>
            <button className={styles.pushSkip} onClick={() => setShowBanner(false)}>Later</button>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricVal} style={{ color: "var(--text)" }}>{metrics.missed}</div>
          <div className={styles.metricLbl}>Missed Today</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricVal} style={{ color: metrics.active > 0 ? "var(--orange)" : "var(--text)" }}>{metrics.active}</div>
          <div className={styles.metricLbl}>In Progress</div>
        </div>
        <div
          className={`${styles.metric} ${metrics.ready > 0 ? styles.clickable : ""}`}
          onClick={() => metrics.ready > 0 && toggleSection("ready")}
        >
          <div className={styles.metricVal} style={{ color: metrics.ready > 0 ? "var(--green)" : "var(--text)" }}>{metrics.ready}</div>
          <div className={styles.metricLbl}>Call Back Now</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricVal} style={{ color: "var(--text)" }}>{metrics.closed}</div>
          <div className={styles.metricLbl}>Closed Today</div>
        </div>
      </div>

      {/* Sections */}
      <div className={styles.content}>
        {renderSection("ready",  "Ready for Callback", "var(--green)",  sections.ready,  true)}
        {renderSection("active", "In Progress",        "var(--orange)", sections.active, false)}
        {renderSection("new",    "New Leads",          "var(--teal)",   sections.new,    false)}
        {renderSection("closed", "Closed",             "var(--text3)",  sections.closed, false)}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.footerText}>{client.aitha_phone}</span>
        <span className={styles.footerText}>Powered by TaskRocket</span>
      </div>

      {/* Drawer */}
      {renderDrawer()}
    </div>
  );
}
