"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./pm-dashboard.module.css";

type Settings = {
  office_hours?: string;
  rent_payment_url?: string;
  application_url?: string;
  leasing_contact?: string;
  manager_cell?: string;
};

type PMClient = {
  id: string;
  name: string;
  slug: string;
  twilio_number: string | null;
  status: string;
  settings: Settings;
};

type PMTenant = {
  id: string;
  name: string | null;
  phone: string;
  unit: string | null;
  sms_opted_in: boolean;
  lease_end: string | null;
  property?: { id: string; name: string };
};

type PMProperty = {
  id: string;
  name: string;
  address: string | null;
  property_type: string | null;
  status: string;
};

type PMVendor = {
  id: string;
  name: string;
  phone: string;
  trade: string;
  priority: number;
  status: string;
};

type PMIncident = {
  id: string;
  category: string | null;
  priority: string;
  triage_type: string | null;
  status: string;
  description: string | null;
  ai_summary: string | null;
  reported_at: string;
  updated_at: string;
  tenant: { id: string; name: string | null; phone: string; unit: string | null } | null;
  property: { id: string; name: string; address: string | null } | null;
  vendor: { id: string; name: string; phone: string; trade: string } | null;
};

type PMConversation = {
  id: string;
  role: string;
  message: string;
  direction: string;
  created_at: string;
};

type View = "incidents" | "tenants" | "properties" | "vendors";
type StatusFilter = "all" | "open" | "escalated" | "resolved";

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  "new":               { label: "New",               color: "#B08B3E", bg: "rgba(176,139,62,0.12)" },
  "self-fix-pending":  { label: "Self-Fix Sent",     color: "#2DD4BF", bg: "rgba(45,212,191,0.12)" },
  "self-fix-resolved": { label: "Self-Fixed",        color: "#22C55E", bg: "rgba(34,197,94,0.12)"  },
  "vendor-dispatched": { label: "Vendor Dispatched", color: "#FF7A30", bg: "rgba(255,122,48,0.12)" },
  "vendor-accepted":   { label: "Vendor Confirmed",  color: "#22C55E", bg: "rgba(34,197,94,0.12)"  },
  "vendor-declined":   { label: "Vendor Declined",   color: "#EF4444", bg: "rgba(239,68,68,0.12)"  },
  "escalated":         { label: "Escalated",         color: "#EF4444", bg: "rgba(239,68,68,0.12)"  },
  "resolved":          { label: "Resolved",          color: "#6B7280", bg: "rgba(107,114,128,0.10)"},
  "closed":            { label: "Closed",            color: "#6B7280", bg: "rgba(107,114,128,0.10)"},
};

const PRIORITY: Record<string, { label: string; color: string }> = {
  "emergency": { label: "Emergency", color: "#EF4444" },
  "high":      { label: "High",      color: "#FF7A30" },
  "medium":    { label: "Medium",    color: "#B08B3E" },
  "low":       { label: "Low",       color: "#6B7280" },
};

const CATEGORY: Record<string, string> = {
  plumbing: "Plumbing", electrical: "Electrical", hvac: "HVAC",
  pest: "Pest", general: "General", structural: "Structural",
  appliance: "Appliance", safety: "Safety", other: "Other",
};

const TRADE_ORDER = ["plumbing", "electrical", "hvac", "general", "pest", "structural", "appliance"];

type Props = {
  client: PMClient;
  incidents: PMIncident[];
  tenants: PMTenant[];
  properties: PMProperty[];
  vendors: PMVendor[];
};

export default function PMDashboardClient({ client, incidents: init, tenants, properties, vendors }: Props) {
  const [view, setView] = useState<View>("incidents");
  const [incidents] = useState<PMIncident[]>(init);
  const [selected, setSelected] = useState<PMIncident | null>(null);
  const [convos, setConvos] = useState<PMConversation[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [toast, setToast] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected) { setConvos([]); return; }
    setConvLoading(true);
    fetch(`/api/pm/conversations?incidentId=${selected.id}`)
      .then(r => r.json())
      .then(d => { setConvos(d); setConvLoading(false); })
      .catch(() => setConvLoading(false));
  }, [selected?.id]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [convos.length]);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }
  void showToast;

  const filtered = incidents.filter(i => {
    if (filter === "all") return true;
    if (filter === "open") return !["resolved", "closed"].includes(i.status);
    if (filter === "escalated") return i.status === "escalated";
    if (filter === "resolved") return ["resolved", "closed"].includes(i.status);
    return true;
  });

  const metrics = {
    open:      incidents.filter(i => !["resolved", "closed"].includes(i.status)).length,
    escalated: incidents.filter(i => i.status === "escalated").length,
    new:       incidents.filter(i => i.status === "new").length,
    resolved:  incidents.filter(i => ["resolved", "closed"].includes(i.status)).length,
  };

  const vendorsByTrade = TRADE_ORDER.reduce((acc, t) => {
    const v = vendors.filter(x => x.trade === t);
    if (v.length) acc[t] = v;
    return acc;
  }, {} as Record<string, PMVendor[]>);

  const tenantsByProp = properties.reduce((acc, p) => {
    acc[p.id] = tenants.filter(t => t.property?.id === p.id);
    return acc;
  }, {} as Record<string, PMTenant[]>);

  const activeByProp = properties.reduce((acc, p) => {
    acc[p.id] = incidents.filter(i => i.property?.id === p.id && !["resolved","closed"].includes(i.status)).length;
    return acc;
  }, {} as Record<string, number>);

  function accentFor(inc: PMIncident) {
    if (inc.priority === "emergency" || inc.status === "escalated") return "#EF4444";
    if (inc.priority === "high" || inc.status.startsWith("vendor")) return "#FF7A30";
    if (inc.status === "new") return "#B08B3E";
    return "#2DD4BF";
  }

  function renderCard(inc: PMIncident) {
    const s = STATUS[inc.status] || { label: inc.status, color: "#6B7280", bg: "rgba(107,114,128,0.1)" };
    const p = PRIORITY[inc.priority] || PRIORITY["medium"];
    const isSel = selected?.id === inc.id;
    return (
      <div key={inc.id} className={`${styles.card} ${isSel ? styles.cardSel : ""}`}
        onClick={() => setSelected(isSel ? null : inc)}>
        <div className={styles.cardBar} style={{ background: accentFor(inc) }} />
        <div className={styles.cardBody}>
          <div className={styles.cardTop}>
            <span className={styles.cardCat}>{CATEGORY[inc.category || ""] || inc.category || "General"}</span>
            <span className={styles.cardTime}>{timeAgo(inc.reported_at)}</span>
          </div>
          <div className={styles.cardTenant}>
            {inc.tenant?.name || inc.tenant?.phone || "Unknown"}
            {inc.tenant?.unit && <span className={styles.cardUnit}> · Unit {inc.tenant.unit}</span>}
          </div>
          <div className={styles.cardProp}>{inc.property?.name}</div>
          {inc.description && (
            <div className={styles.cardDesc}>{inc.description.slice(0, 110)}{inc.description.length > 110 ? "…" : ""}</div>
          )}
          <div className={styles.cardTags}>
            <span className={styles.sPill} style={{ color: s.color, background: s.bg }}>
              {inc.status === "new" && <span className={styles.dot} style={{ background: s.color }} />}
              {s.label}
            </span>
            {inc.priority !== "medium" && (
              <span className={styles.pPill} style={{ color: p.color }}>{p.label}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderIncidents() {
    return (
      <div className={styles.view}>
        <div className={styles.filters}>
          {(["all","open","escalated","resolved"] as StatusFilter[]).map(f => (
            <button key={f} className={`${styles.fBtn} ${filter===f ? styles.fBtnOn : ""}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
              {f==="open" && metrics.open>0 && <span className={styles.fBadge}>{metrics.open}</span>}
              {f==="escalated" && metrics.escalated>0 && <span className={styles.fBadgeRed}>{metrics.escalated}</span>}
            </button>
          ))}
        </div>
        <div className={styles.list}>
          {filtered.length === 0
            ? <div className={styles.empty}>No incidents in this view</div>
            : filtered.map(renderCard)}
        </div>
      </div>
    );
  }

  function renderTenants() {
    return (
      <div className={styles.view}>
        {properties.map(prop => {
          const pts = tenantsByProp[prop.id] || [];
          if (!pts.length) return null;
          return (
            <div key={prop.id} className={styles.group}>
              <div className={styles.groupTitle}>{prop.name}</div>
              <div className={styles.tTable}>
                <div className={styles.tHead}>
                  <span>Name</span><span>Unit</span><span>Phone</span><span>Lease Ends</span><span>SMS</span>
                </div>
                {pts.map(t => (
                  <div key={t.id} className={styles.tRow}>
                    <span className={styles.tName}>{t.name || "—"}</span>
                    <span>{t.unit || "—"}</span>
                    <span>{t.phone}</span>
                    <span>{t.lease_end ? fmtDate(t.lease_end) : "—"}</span>
                    <span><span className={t.sms_opted_in ? styles.smsY : styles.smsN}>{t.sms_opted_in ? "Opted in" : "No"}</span></span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderProperties() {
    return (
      <div className={styles.view}>
        <div className={styles.propGrid}>
          {properties.map(p => {
            const active = activeByProp[p.id] || 0;
            const tCount = tenantsByProp[p.id]?.length || 0;
            return (
              <div key={p.id} className={styles.propCard}>
                <div className={styles.propName}>{p.name}</div>
                <div className={styles.propAddr}>{p.address}</div>
                <div className={styles.propType}>{p.property_type}</div>
                <div className={styles.propStats}>
                  <div className={styles.propStat}>
                    <div className={styles.propVal}>{tCount}</div>
                    <div className={styles.propLbl}>Tenants</div>
                  </div>
                  <div className={styles.propStat}>
                    <div className={`${styles.propVal} ${active>0 ? styles.propAlert : ""}`}>{active}</div>
                    <div className={styles.propLbl}>Open Incidents</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderVendors() {
    return (
      <div className={styles.view}>
        {Object.entries(vendorsByTrade).map(([trade, vs]) => (
          <div key={trade} className={styles.group}>
            <div className={styles.groupTitle}>{trade.charAt(0).toUpperCase()+trade.slice(1)}</div>
            <div className={styles.vList}>
              {vs.map(v => (
                <div key={v.id} className={styles.vCard}>
                  <div className={styles.vPri}>{v.priority}</div>
                  <div className={styles.vInfo}>
                    <div className={styles.vName}>{v.name}</div>
                    <div className={styles.vPhone}>{v.phone}</div>
                  </div>
                  <span className={`${styles.vStatus} ${v.status==="active" ? styles.vOn : styles.vOff}`}>{v.status}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderPanel() {
    if (!selected) return null;
    const s = STATUS[selected.status] || { label: selected.status, color: "#6B7280", bg: "rgba(107,114,128,0.1)" };
    const p = PRIORITY[selected.priority] || PRIORITY["medium"];
    return (
      <aside className={styles.panel}>
        <div className={styles.panelHdr}>
          <button className={styles.panelX} onClick={() => setSelected(null)}>✕</button>
          <div className={styles.panelTenant}>{selected.tenant?.name || selected.tenant?.phone || "Unknown"}</div>
          <div className={styles.panelMeta}>
            <span style={{ color: s.color }}>{s.label}</span>
            <span className={styles.dot2}>·</span>
            <span>{selected.property?.name}</span>
            {selected.tenant?.unit && <><span className={styles.dot2}>·</span><span>Unit {selected.tenant.unit}</span></>}
          </div>
          {selected.description && <div className={styles.panelDesc}>{selected.description}</div>}
          <div className={styles.panelTags}>
            <span className={styles.sPill} style={{ color: s.color, background: s.bg }}>{s.label}</span>
            <span className={styles.pPill} style={{ color: p.color }}>{p.label} priority</span>
            <span className={styles.catPill}>{CATEGORY[selected.category||""]||"General"}</span>
          </div>
        </div>

        {selected.ai_summary && (
          <div className={styles.aiBox}>
            <div className={styles.aiLbl}>AI Summary</div>
            <div className={styles.aiText}>{selected.ai_summary}</div>
          </div>
        )}

        <div className={styles.thread} ref={threadRef}>
          {convLoading ? (
            <div className={styles.convLoad}>Loading…</div>
          ) : convos.length === 0 ? (
            <div className={styles.empty}>No messages yet</div>
          ) : convos.map((c, i) => {
            const isIn = c.direction === "inbound";
            const isSys = c.role === "system";
            const isVen = c.role === "vendor";
            return (
              <div key={i} className={`${styles.msg} ${isIn ? styles.msgL : styles.msgR}`}>
                <div className={styles.msgRole}>
                  {c.role==="tenant" ? "Tenant" : c.role==="system" ? "Aitha PM" : c.role==="vendor" ? "Vendor" : "Manager"}
                </div>
                <div className={`${styles.bubble} ${isSys ? styles.bSys : isVen ? styles.bVen : isIn ? styles.bIn : styles.bMgr}`}>
                  {c.message}
                </div>
                <div className={styles.msgT}>{fmtTime(c.created_at)}</div>
              </div>
            );
          })}
        </div>

        <div className={styles.panelFtr}>
          <div className={styles.panelRep}>Reported {fmtDate(selected.reported_at)} at {fmtTime(selected.reported_at)}</div>
          {selected.vendor && <div className={styles.panelVen}>{selected.vendor.name} · {selected.vendor.phone}</div>}
        </div>
      </aside>
    );
  }

  const navItems: { id: View; label: string; count: number }[] = [
    { id: "incidents",  label: "Incidents",   count: metrics.open },
    { id: "tenants",    label: "Tenants",     count: tenants.length },
    { id: "properties", label: "Properties",  count: properties.length },
    { id: "vendors",    label: "Vendors",     count: vendors.length },
  ];

  return (
    <div className={`${styles.page} ${selected ? styles.pagePanel : ""}`}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <aside className={styles.sidebar}>
        <div className={styles.sbHdr}>
          <div className={styles.sbLogo}>BP</div>
          <div>
            <div className={styles.sbName}>{client.name}</div>
            <div className={styles.sbSub}>Property Management</div>
          </div>
        </div>
        <div className={styles.live}>
          <span className={styles.dot} style={{ background: "#2DD4BF" }} />
          Live
        </div>
        <nav className={styles.nav}>
          {navItems.map(n => (
            <button key={n.id} className={`${styles.navBtn} ${view===n.id ? styles.navOn : ""}`}
              onClick={() => { setView(n.id); setSelected(null); }}>
              <span>{n.label}</span>
              {n.count > 0 && (
                <span className={`${styles.navBadge} ${n.id==="incidents" && metrics.escalated>0 ? styles.navBadgeRed : ""}`}>{n.count}</span>
              )}
            </button>
          ))}
        </nav>
        <div className={styles.sbFtr}>
          <div className={styles.sbPow}>Powered by Aitha PM</div>
          <div className={styles.sbTag}>A TaskRocket Product</div>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.mainHdr}>
          <div className={styles.mainTitle}>{view.charAt(0).toUpperCase()+view.slice(1)}</div>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <div className={styles.mVal} style={{ color: metrics.open>0 ? "#FF7A30" : undefined }}>{metrics.open}</div>
              <div className={styles.mLbl}>Open</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.mVal} style={{ color: metrics.escalated>0 ? "#EF4444" : undefined }}>{metrics.escalated}</div>
              <div className={styles.mLbl}>Escalated</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.mVal} style={{ color: metrics.new>0 ? "#B08B3E" : undefined }}>{metrics.new}</div>
              <div className={styles.mLbl}>New</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.mVal}>{metrics.resolved}</div>
              <div className={styles.mLbl}>Resolved</div>
            </div>
          </div>
        </div>
        {view === "incidents"  && renderIncidents()}
        {view === "tenants"    && renderTenants()}
        {view === "properties" && renderProperties()}
        {view === "vendors"    && renderVendors()}
      </main>

      {renderPanel()}
    </div>
  );
}
