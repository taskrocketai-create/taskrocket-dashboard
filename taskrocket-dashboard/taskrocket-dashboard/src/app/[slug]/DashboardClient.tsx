"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AithaClient, AithaCall, AithaMessage } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import styles from "./dashboard.module.css";

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

function extractDetails(call: AithaCall): { vehicle: string; problem: string } {
  const msgs = call.messages || [];
  const transcript = call.voicemail_transcript || "";
  const fullText = [transcript, ...msgs.map(m => m.body || "")].join(" ").toLowerCase();

  const yearMatch = fullText.match(/\b(19|20)\d{2}\b/);
  const makeMatch = fullText.match(/\b(ford|chevy|chevrolet|toyota|honda|dodge|jeep|nissan|hyundai|kia|subaru|bmw|mercedes|audi|volkswagen|vw|gmc|ram|mazda|volvo|lexus|acura|infiniti|buick|cadillac|lincoln|chrysler|mitsubishi|wrangler|tacoma|silverado|f-150|f150|mustang|camry|civic|accord|altima|malibu|equinox|explorer|escape|pilot|cr-v|rav4|highlander)\b/i);

  let vehicle = "";
  if (yearMatch && makeMatch) vehicle = `${yearMatch[0]} ${makeMatch[0]}`;
  else if (makeMatch) vehicle = makeMatch[0];
  else if (yearMatch) vehicle = `${yearMatch[0]} vehicle`;

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
    [/overhe|temp|running hot/i, "Overheating"],
  ];

  let problem = "";
  for (const [rx, label] of problemMap) {
    if (rx.test(fullText)) { problem = label; break; }
  }

  return {
    vehicle: vehicle ? vehicle.charAt(0).toUpperCase() + vehicle.slice(1) : "",
    problem,
  };
}

// All non-closed statuses go to "Ready for Callback"
// Closed goes to "Closed"
function isActive(status: string): boolean {
  return status !== "closed";
}

type Props = { client: AithaClient; initialCalls: AithaCall[] };

export default function DashboardClient({ client, initialCalls }: Props) {
  const [calls, setCalls]       = useState<AithaCall[]>(initialCalls);
  const [selected, setSelected] = useState<AithaCall | null>(null);
  const [reply, setReply]       = useState("");
  const [sending, setSending]   = useState(false);
  const [pushOn, setPushOn]     = useState(false);
  const [toast, setToast]       = useState<string | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);

  const toastRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [selected?.messages?.length]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPushOn(Notification.permission === "granted");
  }, []);

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const ch = supabase.channel("aitha-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `client_id=eq.${client.id}` }, (payload) => {
        const call = payload.new as AithaCall;
        setCalls(prev => [{ ...call, messages: [] }, ...prev]);
        playPing();
        if (call.urgency === "immediate") {
          showToast(`🔴 Urgent call from ${call.caller_number}`);
          pushNotify("🔴 Urgent missed call", `From ${call.caller_number}`);
        } else {
          showToast(`📞 New call from ${call.caller_number}`);
          pushNotify("📞 New missed call", `From ${call.caller_number} — Aitha texted them back`);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `client_id=eq.${client.id}` }, (payload) => {
        const u = payload.new as AithaCall;
        setCalls(prev => prev.map(c => c.id === u.id ? { ...c, ...u } : c));
        setSelected(prev => prev?.id === u.id ? { ...prev, ...u } : prev);
        if (u.call_status === "resolved") {
          playPing();
          showToast(`✅ Ready for callback — ${u.caller_number}`);
          pushNotify("Ready for callback", `${u.caller_number} is ready to schedule`);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${client.id}` }, (payload) => {
        const msg = payload.new as AithaMessage;
        const addMsg = (list: AithaMessage[]) => list.some(m => m.id === msg.id) ? list : [...list, msg];
        setCalls(prev => prev.map(c => c.id !== msg.call_id ? c : { ...c, messages: addMsg(c.messages || []) }));
        setSelected(prev => !prev || prev.id !== msg.call_id ? prev : { ...prev, messages: addMsg(prev.messages || []) });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [client.id]);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 4000);
  }

  function pushNotify(title: string, body: string) {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png" });
    }
  }

  async function enablePush() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      showToast("Notifications not supported in this browser");
      return;
    }
    if (Notification.permission === "granted") {
      showToast("🔔 Notifications already enabled");
      setPushOn(true);
      return;
    }
    if (Notification.permission === "denied") {
      showToast("Notifications blocked — click the lock icon in your browser address bar to allow");
      return;
    }
    const r = await Notification.requestPermission();
    if (r === "granted") {
      setPushOn(true);
      showToast("🔔 Notifications enabled");
    } else {
      showToast("Notifications not enabled");
    }
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
        body: JSON.stringify({ to: selected.caller_number, from: client.aitha_phone, body: reply.trim(), callId: selected.id, clientId: client.id }),
      });
      if (!res.ok) throw new Error();
      const newMsg: AithaMessage = {
        id: Date.now().toString(), call_id: selected.id, client_id: client.id,
        direction: "outbound_owner", body: reply.trim(),
        from_number: client.aitha_phone, to_number: selected.caller_number,
        created_at: new Date().toISOString(),
      };
      const upd = (c: AithaCall) => ({ ...c, call_status: "owner_replied", messages: [...(c.messages || []), newMsg] });
      setCalls(prev => prev.map(c => c.id !== selected.id ? c : upd(c)));
      setSelected(prev => prev ? upd(prev) : prev);
      setReply("");
      showToast("✓ Text sent");
    } catch { showToast("Failed to send — try again"); }
    setSending(false);
  }, [reply, selected, sending, client]);

  async function markComplete(callId: string) {
    await fetch(
      `https://snzdwixepyatasvjjurk.supabase.co/functions/v1/aitha-log?action=update_call_status&call_id=${callId}&call_status=closed`,
      { method: "GET", headers: { "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuemR3aXhlcHlhdGFzdmpqdXJrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQyNDU1NCwiZXhwIjoyMDkzMDAwNTU0fQ.0TNx7LvfX2_WSwTpHIV0ThnEWVo8JrDvDkkQDI79Ru0" } }
    );
    setCalls(prev => prev.map(c => c.id !== callId ? c : { ...c, call_status: "closed" }));
    setSelected(null);
    showToast("✓ Call complete — archived");
  }

  async function deleteCall(callId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      await fetch("/api/delete-call", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });
      setCalls(prev => prev.filter(c => c.id !== callId));
      if (selected?.id === callId) setSelected(null);
      showToast("✓ Deleted");
    } catch { showToast("Failed to delete"); }
  }

  /* ─── COMPUTED ─────────────────────────────────────────── */
  const today = new Date().toDateString();
  const active = calls.filter(c => isActive(c.call_status));
  const closed = calls.filter(c => !isActive(c.call_status));
  const readyCount = calls.filter(c => c.call_status === "resolved").length;

  const metrics = {
    missed:  calls.filter(c => new Date(c.created_at).toDateString() === today).length,
    active:  active.length,
    ready:   readyCount,
    closed:  closed.filter(c => new Date(c.created_at).toDateString() === today).length,
    saved:   calls.filter(c => ["resolved", "closed"].includes(c.call_status)).length,
  };

  /* ─── CARD ─────────────────────────────────────────────── */
  function renderCard(call: AithaCall) {
    const { vehicle, problem } = extractDetails(call);
    const msgs = call.messages || [];
    const lastMsg = msgs[msgs.length - 1];
    const isClosed = !isActive(call.call_status);
    const isReady = call.call_status === "resolved";
    const isUrgent = call.urgency === "immediate";

    let preview = "";
    if (vehicle || problem) preview = [vehicle, problem].filter(Boolean).join(" · ");
    else if (lastMsg?.body) preview = trunc(lastMsg.body, 80);
    else if (call.voicemail_transcript) preview = trunc(call.voicemail_transcript, 80);
    else if (call.ai_response_sent) preview = trunc(call.ai_response_sent, 80);

    const accentColor = isClosed ? "#6B7280" : isReady ? "#22C55E" : isUrgent ? "#EF4444" : "#60A5FA";
    const tagLabel = isClosed ? "Complete" : isReady ? "Ready to Call" : isUrgent ? "Urgent" : "In Progress";
    const tagClass = isClosed ? styles.tagDone : isReady ? styles.tagReady : isUrgent ? styles.tagUrgent : styles.tagWait;

    return (
      <div key={call.id} className={styles.card} onClick={() => openCall(call)}>
        <div className={styles.cardAccent} style={{ background: accentColor }} />
        <div className={styles.cardLeft}>
          <div className={styles.cardTop}>
            <span className={styles.callerNum}>{call.caller_number}</span>
            <span className={styles.timeAgo}>{timeAgo(call.created_at)}</span>
          </div>
          {preview && <div className={styles.cardSummary}>{preview}</div>}
          <div className={styles.cardTags}>
            <span className={`${styles.tag} ${tagClass}`}>{tagLabel}</span>
            {call.voicemail_transcript && <span className={`${styles.tag} ${styles.tagVm}`}>🎙 VM</span>}
            {isUrgent && <span className={`${styles.tag} ${styles.tagUrgent}`}>🔴 Urgent</span>}
          </div>
        </div>
        <div className={styles.cardRight}>
          <button className={styles.deleteBtn} onClick={e => deleteCall(call.id, e)} aria-label="Delete">✕</button>
        </div>
      </div>
    );
  }

  /* ─── DRAWER ───────────────────────────────────────────── */
  function renderDrawer() {
    if (!selected) return null;
    const { vehicle, problem } = extractDetails(selected);
    const msgs = selected.messages || [];
    const hasOutboundAI = msgs.some(m => m.direction === "outbound_ai");
    const isClosed = !isActive(selected.call_status);
    const isReady = selected.call_status === "resolved";
    const tagLabel = isClosed ? "Complete" : isReady ? "Ready to Call" : "In Progress";
    const tagClass = isClosed ? styles.tagDone : isReady ? styles.tagReady : styles.tagWait;

    return (
      <div className={styles.overlay} onClick={() => setSelected(null)}>
        <div className={styles.drawer} onClick={e => e.stopPropagation()}>
          <div className={styles.drawerHandle} />

          <div className={styles.drawerHeader}>
            <div className={styles.drawerNum}>{selected.caller_number}</div>
            <div className={styles.drawerMeta}>
              <span className={`${styles.tag} ${tagClass}`}>{tagLabel}</span>
              <span style={{ color: "#4B5A6E" }}>·</span>
              <span>{formatTime(selected.created_at)}</span>
            </div>
            <div className={styles.drawerActions}>
              {!isClosed && (
                <button className={styles.btnComplete} onClick={() => markComplete(selected.id)}>
                  ✓ Complete
                </button>
              )}
              <button className={styles.btnDel} onClick={() => deleteCall(selected.id)}>🗑 Delete</button>
              <button className={styles.btnClose} onClick={() => setSelected(null)}>✕</button>
            </div>
          </div>

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

          {selected.voicemail_transcript && (
            <div className={styles.vmSection}>
              <div className={styles.vmHeader}>
                <span className={styles.vmLabel}>🎙 Voicemail</span>
                {selected.voicemail_url && (
                  <a href={selected.voicemail_url} target="_blank" rel="noopener noreferrer" className={styles.vmPlayBtn}>
                    ▶ Listen
                  </a>
                )}
              </div>
              <div className={styles.vmTranscript}>{selected.voicemail_transcript}</div>
            </div>
          )}

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
                  <div className={styles.msgSender}>{isAI ? "Auto-reply" : isIn ? "Customer" : "You"}</div>
                  <div className={`${styles.bubble} ${isIn ? styles.bubbleIn : isAI ? styles.bubbleAI : styles.bubbleOwner}`}>
                    {m.body}
                  </div>
                  <div className={styles.msgTime}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              );
            })}
            {msgs.length === 0 && !selected.ai_response_sent && (
              <div className={styles.empty}>No messages yet</div>
            )}
          </div>

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
              <button className={styles.sendBtn} onClick={sendSMS} disabled={!reply.trim() || sending}>
                {sending ? "Sending…" : "Send Text →"}
              </button>
            </div>
          ) : (
            <div className={styles.resolvedBar}>✓ Call complete — archived</div>
          )}
        </div>
      </div>
    );
  }

  /* ─── RENDER ───────────────────────────────────────────── */
  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-label="Aitha">
            {/* Headband */}
            <path d="M7.5 19V18C7.5 12.2 12.2 7.5 18 7.5C23.8 7.5 28.5 12.2 28.5 18V19" stroke="#2DD4BF" strokeWidth="2.6" strokeLinecap="round"/>
            {/* Ear cups */}
            <rect x="5.5" y="17.5" width="5" height="8.5" rx="2.4" fill="#2DD4BF"/>
            <rect x="25.5" y="17.5" width="5" height="8.5" rx="2.4" fill="#2DD4BF"/>
            {/* Boom mic */}
            <path d="M28 26C28 29.5 25.5 31 21.5 31" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="21.5" cy="31" r="2.2" fill="#FF7A30"/>
            {/* The A — light so it reads on the dark navy header */}
            <path d="M13.4 25.5L18 11.5L22.6 25.5" stroke="#F4F7FB" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15.2 21.4Q18 19.6 20.8 21.4" stroke="#F4F7FB" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          <span className={styles.businessName}>{client.business_name}</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.liveBadge}><div className={styles.liveDot} /> Live</div>
          <button
            className={styles.notifBtn}
            style={{ color: pushOn ? "#2DD4BF" : "#4B5A6E", cursor: pushOn ? "default" : "pointer" }}
            onClick={pushOn ? () => showToast("🔔 Notifications are on") : enablePush}
            title={pushOn ? "Notifications are enabled" : "Click to enable notifications"}
          >
            {pushOn ? "🔔" : "🔕"}
          </button>
        </div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricVal}>{metrics.missed}</div>
          <div className={styles.metricLbl}>Missed Today</div>
        </div>
        <div className={styles.metric}>
          <div className={`${styles.metricVal} ${metrics.ready > 0 ? styles.metricValGreen : ""}`}>{metrics.ready}</div>
          <div className={styles.metricLbl}>Call Back Now</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricVal}>{metrics.closed}</div>
          <div className={styles.metricLbl}>Closed Today</div>
        </div>
        <div className={styles.metric}>
          <div className={`${styles.metricVal} ${metrics.saved > 0 ? styles.metricValTeal : ""}`}>{metrics.saved}</div>
          <div className={styles.metricLbl}>Leads Saved</div>
        </div>
      </div>

      {/* Ready for Callback */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionDot} style={{ background: "#22C55E" }} />
            Ready for Callback
          </div>
          <span className={`${styles.sectionCount} ${active.length > 0 ? styles.sectionCountAlert : ""}`}>
            {active.length}
          </span>
        </div>
        <div>
          {active.length === 0
            ? <div className={styles.empty}>No calls waiting — you&apos;re all caught up</div>
            : active.map(renderCard)
          }
        </div>
      </div>

      {/* Closed / Archive */}
      <div className={styles.section}>
        <div className={styles.sectionHeader} onClick={() => setClosedOpen(p => !p)} style={{ cursor: "pointer" }}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionDot} style={{ background: "#6B7280" }} />
            Closed
          </div>
          <div className={styles.sectionRight}>
            <span className={styles.sectionCount}>{closed.length}</span>
            <span className={`${styles.chevron} ${closedOpen ? styles.chevronOpen : ""}`}>▼</span>
          </div>
        </div>
        {closedOpen && (
          <div>
            {closed.length === 0
              ? <div className={styles.empty}>No closed calls yet</div>
              : closed.map(renderCard)
            }
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerText}>{client.aitha_phone}</span>
        <span className={styles.footerText}>Powered by TaskRocket</span>
      </div>

      {renderDrawer()}
    </div>
  );
}
