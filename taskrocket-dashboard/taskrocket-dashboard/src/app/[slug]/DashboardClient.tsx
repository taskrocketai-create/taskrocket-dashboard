"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AithaClient, AithaCall, AithaMessage } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import styles from "./dashboard.module.css";

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  missed:           { label: "Missed",      color: "#FF7A30", bg: "rgba(255,122,48,0.12)" },
  ai_texted:        { label: "AI Texted",   color: "#2DD4BF", bg: "rgba(45,212,191,0.12)" },
  customer_replied: { label: "Replied",     color: "#60A5FA", bg: "rgba(96,165,250,0.12)" },
  owner_replied:    { label: "You Replied", color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  resolved:         { label: "Resolved",    color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
};

const URGENCY: Record<string, { label: string; color: string }> = {
  immediate: { label: "🔴 Urgent",   color: "#EF4444" },
  same_day:  { label: "🟠 Same Day", color: "#F97316" },
  schedule:  { label: "🟡 Routine",  color: "#EAB308" },
  info_only: { label: "⚪ Info",     color: "#6B7280" },
};

const trunc = (s: string | null | undefined, n: number) =>
  !s ? "—" : s.length > n ? s.slice(0, n) + "…" : s;

function playPing() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

type Props = {
  client: AithaClient;
  initialCalls: AithaCall[];
};

export default function DashboardClient({ client, initialCalls }: Props) {
  const [calls, setCalls]           = useState<AithaCall[]>(initialCalls);
  const [selected, setSelected]     = useState<AithaCall | null>(null);
  const [reply, setReply]           = useState("");
  const [tab, setTab]               = useState("all");
  const [sending, setSending]       = useState(false);
  const [pushOn, setPushOn]         = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const threadRef                   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ("Notification" in window) {
      setPushOn(Notification.permission === "granted");
      if (Notification.permission === "default") setTimeout(() => setShowBanner(true), 3000);
    }
  }, []);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [selected?.messages?.length]);

  // Supabase Realtime
  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel("aitha-messages")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "aitha",
        table: "messages",
        filter: `client_id=eq.${client.id}`,
      }, (payload) => {
        const msg = payload.new as AithaMessage;
        if (msg.direction !== "inbound") return;
        setCalls(prev => prev.map(c => {
          if (c.id !== msg.call_id) return c;
          return { ...c, call_status: "customer_replied", messages: [...(c.messages || []), msg] };
        }));
        setSelected(prev => {
          if (!prev || prev.id !== msg.call_id) return prev;
          return { ...prev, call_status: "customer_replied", messages: [...(prev.messages || []), msg] };
        });
        playPing();
        showToast(`💬 New reply from ${msg.from_number || "customer"}`);
        if (Notification.permission === "granted") {
          new Notification("New message — Aitha", {
            body: `${msg.from_number}: ${trunc(msg.body, 80)}`,
            icon: "/icon-192.png",
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [client.id]);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 4000);
  }

  async function enablePush() {
    if (!("Notification" in window)) return;
    const r = await Notification.requestPermission();
    setPushOn(r === "granted");
    setShowBanner(false);
    if (r === "granted") showToast("🔔 Notifications enabled");
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
      if (!res.ok) throw new Error("Failed to send");
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
      setCalls(prev => prev.map(c =>
        c.id !== selected.id ? c : { ...c, call_status: "owner_replied", messages: [...(c.messages || []), newMsg] }
      ));
      setSelected(prev => prev ? { ...prev, call_status: "owner_replied", messages: [...(prev.messages || []), newMsg] } : prev);
      setReply("");
      showToast("✓ Text sent");
    } catch {
      showToast("Failed to send — try again");
    }
    setSending(false);
  }, [reply, selected, sending, client]);

  async function resolve() {
    if (!selected) return;
    await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolve: true, callId: selected.id }),
    });
    setCalls(prev => prev.map(c => c.id !== selected.id ? c : { ...c, call_status: "resolved" }));
    setSelected(null);
    showToast("✓ Resolved");
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const isToday = d.toDateString() === new Date().toDateString();
    const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return isToday ? `Today, ${t}` : `Yesterday, ${t}`;
  }

  const filtered     = tab === "all" ? calls : calls.filter(c => c.call_status === tab);
  const unread       = calls.filter(c => c.call_status === "customer_replied").length;
  const urgent       = calls.filter(c => c.urgency === "immediate" && c.call_status !== "resolved").length;
  const todayCount   = calls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length;
  const resolvedCount = calls.filter(c => c.call_status === "resolved").length;

  return (
    <div className={styles.page}>
      <div className={styles.widget}>

        {/* TOAST */}
        {toast && <div className={styles.toast}>{toast}</div>}

        {/* PUSH BANNER */}
        {showBanner && !pushOn && (
          <div className={styles.pushBanner}>
            <span>🔔 Get notified when customers reply</span>
            <div className={styles.pushBannerBtns}>
              <button className={styles.pushAllow} onClick={enablePush}>Allow</button>
              <button className={styles.pushSkip} onClick={() => setShowBanner(false)}>Later</button>
            </div>
          </div>
        )}

        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <path d="M7 21V18C7 11.9 11.9 7 18 7C24.1 7 29 11.9 29 18V21" stroke="#2DD4BF" strokeWidth="2.2" strokeLinecap="round"/>
              <rect x="6" y="20" width="6" height="9" rx="2.5" fill="#2DD4BF"/>
              <rect x="24" y="20" width="6" height="9" rx="2.5" fill="#2DD4BF"/>
              <circle cx="27" cy="30" r="2.4" fill="#FF7A30"/>
            </svg>
            <div>
              <div className={styles.brand}>Aitha<span className={styles.brandDot}>.</span></div>
              <div className={styles.clientName}>{client.business_name}</div>
            </div>
          </div>
          <div className={styles.headerRight}>
            {urgent > 0 && <div className={styles.urgPill}>🔴 {urgent} urgent</div>}
            {unread > 0 && <div className={styles.newPill}>{unread} new</div>}
            <button
              className={styles.notifBtn}
              style={{ color: pushOn ? "#2DD4BF" : "#6B7A99" }}
              onClick={() => !pushOn && enablePush()}
              aria-label="Toggle notifications"
            >
              {pushOn ? "🔔" : "🔕"}
            </button>
            <div className={styles.liveDot} />
          </div>
        </div>

        {/* STATS */}
        <div className={styles.stats}>
          {[
            { lbl: "Today",   val: todayCount,    hi: false },
            { lbl: "Reply",   val: unread,        hi: unread > 0,  click: () => setTab("customer_replied") },
            { lbl: "Done",    val: resolvedCount, hi: false,       click: undefined },
            { lbl: "Urgent",  val: urgent,        hi: urgent > 0,  click: undefined },
          ].map(st => (
            <div key={st.lbl} className={styles.stat} onClick={st.click} style={{ cursor: st.click ? "pointer" : "default" }}>
              <div className={styles.statVal} style={{ color: st.hi ? "#FF7A30" : "#F0F4FF" }}>{st.val}</div>
              <div className={styles.statLbl}>{st.lbl}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div className={styles.tabs}>
          {[
            { key: "all",              lbl: "All" },
            { key: "customer_replied", lbl: "Needs Reply", badge: unread },
            { key: "ai_texted",        lbl: "AI Texted" },
            { key: "missed",           lbl: "Missed" },
            { key: "resolved",         lbl: "Done" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`${styles.tab} ${tab === t.key ? styles.tabOn : ""}`}>
              {t.lbl}
              {t.badge && t.badge > 0 ? <span className={styles.tabBadge}>{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* CALLS LIST */}
        <div className={styles.list}>
          {filtered.length === 0 && (
            <div className={styles.empty}>
              <p>No calls here</p>
              <p className={styles.emptyHint}>Missed calls will appear automatically</p>
            </div>
          )}
          {filtered.map(call => {
            const st  = STATUS[call.call_status] || STATUS.missed;
            const ug  = URGENCY[call.urgency || "info_only"] || URGENCY.info_only;
            const msgs = call.messages || [];
            const last = msgs[msgs.length - 1];
            const preview = trunc(last?.body || call.ai_response_sent, 48);
            const isNew = call.call_status === "customer_replied";
            return (
              <div key={call.id} onClick={() => { setSelected(call); setReply(""); }}
                className={`${styles.row} ${isNew ? styles.rowNew : ""}`}>
                {isNew && <div className={styles.unreadDot} />}
                <div style={{ minWidth: 0 }}>
                  <div className={styles.callerNum}>{call.caller_number}</div>
                  <div className={styles.callTime}>{formatTime(call.created_at)}</div>
                </div>
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <div className={styles.preview}>{preview}</div>
                  <div className={styles.callTags}>
                    {call.voicemail_transcript && <span className={styles.vmTag}>🎙 VM</span>}
                    <span style={{ fontSize: "10px", color: ug.color }}>{ug.label}</span>
                  </div>
                </div>
                <div className={styles.statusPill} style={{ color: st.color, background: st.bg }}>
                  {st.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* FOOTER */}
        <div className={styles.footer}>
          <span className={styles.footerText}>Aitha · {client.aitha_phone}</span>
          <span className={styles.footerText}>powered by TaskRocket</span>
        </div>

      </div>

      {/* MODAL */}
      {selected && (() => {
        const st  = STATUS[selected.call_status] || STATUS.missed;
        const ug  = URGENCY[selected.urgency || "info_only"] || URGENCY.info_only;
        const msgs = selected.messages || [];
        return (
          <div className={styles.modalOverlay} onClick={() => setSelected(null)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>

              <div className={styles.dragHandle} />

              <div className={styles.modalHeader}>
                <div>
                  <div className={styles.modalNum}>{selected.caller_number}</div>
                  <div className={styles.modalMeta}>
                    <span style={{ color: ug.color }}>{ug.label}</span>
                    <span className={styles.metaSep}>·</span>
                    <span style={{ color: st.color }}>{st.label}</span>
                    <span className={styles.metaSep}>·</span>
                    <span>{formatTime(selected.created_at)}</span>
                  </div>
                </div>
                <div className={styles.modalActions}>
                  {selected.call_status !== "resolved" && (
                    <button className={styles.resolveBtn} onClick={resolve}>✓ Resolve</button>
                  )}
                  <button className={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
                </div>
              </div>

              {/* Voicemail */}
              {selected.voicemail_transcript && (
                <div className={styles.vmBox}>
                  <div className={styles.vmLabel}>🎙 Voicemail transcript</div>
                  <div className={styles.vmText}>{selected.voicemail_transcript}</div>
                </div>
              )}

              {/* Thread */}
              <div className={styles.thread} ref={threadRef}>
                {selected.ai_response_sent && msgs.length === 0 && (
                  <div className={`${styles.msgWrap} ${styles.msgRight}`}>
                    <div className={`${styles.bubble} ${styles.bubbleAI}`}>{selected.ai_response_sent}</div>
                    <div className={`${styles.msgTime}`} style={{ textAlign: "right" }}>Aitha</div>
                  </div>
                )}
                {msgs.map((m, i) => {
                  const isIn    = m.direction === "inbound";
                  const isAI    = m.direction === "outbound_ai";
                  const isOwner = m.direction === "outbound_owner";
                  return (
                    <div key={i} className={`${styles.msgWrap} ${isIn ? styles.msgLeft : styles.msgRight}`}>
                      <div className={`${styles.bubble} ${isIn ? styles.bubbleIn : isAI ? styles.bubbleAI : styles.bubbleOwner}`}>
                        {m.body}
                      </div>
                      <div className={styles.msgTime} style={{ textAlign: isIn ? "left" : "right" }}>
                        {isAI ? "Aitha" : isOwner ? "You" : "Customer"}
                        {" · "}
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply bar */}
              {selected.call_status !== "resolved" ? (
                <div className={styles.replyBar}>
                  <textarea
                    className={styles.replyInput}
                    placeholder="Type a reply… (Enter to send)"
                    value={reply}
                    rows={2}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSMS(); } }}
                  />
                  <button
                    className={styles.sendBtn}
                    style={{ opacity: reply.trim() && !sending ? 1 : 0.4 }}
                    onClick={sendSMS}
                    disabled={!reply.trim() || sending}
                  >
                    {sending ? "Sending…" : "Send Text →"}
                  </button>
                </div>
              ) : (
                <div className={styles.resolvedBar}>✓ This conversation is resolved</div>
              )}

            </div>
          </div>
        );
      })()}
    </div>
  );
}
