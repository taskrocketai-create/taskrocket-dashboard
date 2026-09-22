import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  business_name: string;
  slug: string;
  status: string;
  stripe_subscription_id: string | null;
  monthly_revenue: string | null;
  created_at: string;
};

type ScenarioMap = {
  client_id: string | null;
  client_label: string;
  make_scenario_id: string;
  make_scenario_name: string;
};

type MakeScenario = {
  id: number;
  name: string;
  isinvalid: boolean;
  isActive: boolean;
};

type BuildRow = {
  label: string;
  scenarioName: string;
  status: "ok" | "warn" | "unknown";
  detail: string;
  makeUrl: string;
  errorInfo: { plain: string; fix: string } | null;
};

type Attention = { title: string; detail: string };

async function getMakeToken(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "make_api_token").single();
  return data?.value ?? null;
}

async function getMakeScenarios(token: string): Promise<MakeScenario[]> {
  const res = await fetch("https://us2.make.com/api/v2/scenarios?teamId=2059306", {
    headers: { Authorization: `Token ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.scenarios ?? [];
}

async function getLastError(scenarioId: string, token: string): Promise<string | null> {
  try {
    const listRes = await fetch(
      `https://us2.make.com/api/v2/scenarios/${scenarioId}/logs?status=3&pg[limit]=1&pg[sortDir]=desc`,
      { headers: { Authorization: `Token ${token}` }, cache: "no-store" }
    );
    if (!listRes.ok) return null;
    const listJson = await listRes.json();
    const execId = listJson?.scenarioLogs?.[0]?.id ?? listJson?.logs?.[0]?.id;
    if (!execId) return null;

    const detailRes = await fetch(`https://us2.make.com/api/v2/scenarios/${scenarioId}/logs/${execId}`, {
      headers: { Authorization: `Token ${token}` },
      cache: "no-store",
    });
    if (!detailRes.ok) return null;
    const detailJson = await detailRes.json();
    const msg =
      detailJson?.scenarioLog?.reason ??
      detailJson?.scenarioLog?.log?.[0]?.reason ??
      detailJson?.log?.reason ??
      null;
    return msg;
  } catch {
    return null;
  }
}

/** Translate a raw Make error into plain English + a suggested fix.
 *  Rule-based on patterns we've actually hit -- swap for a live Claude call
 *  once an Anthropic API key is stored in app_settings, for anything this
 *  doesn't recognize. */
function decodeError(raw: string | null): { plain: string; fix: string } {
  if (!raw) return { plain: "No error detail available from Make.", fix: "Open the scenario and check its History tab directly." };
  const r = raw.toLowerCase();
  if (r.includes("missing value of required parameter") || r.includes("bundlevalidationerror")) {
    return {
      plain: "A step got an empty value where it needed something.",
      fix: "Usually means an upstream step (often an AI/HTTP call) returned nothing. Add an ifempty() fallback on that field.",
    };
  }
  if (r.includes("not valid json") || r.includes("source is not valid json")) {
    return {
      plain: "Something that was supposed to be clean JSON had extra text in it (often markdown code fences from an AI response).",
      fix: "Strip ```json / ``` fences before parsing, e.g. with trim(replace(replace(...))).",
    };
  }
  if (r.includes("connection") && (r.includes("expired") || r.includes("invalid") || r.includes("unauthoriz"))) {
    return {
      plain: "The connection this scenario uses (an API key or login) has expired or was revoked.",
      fix: "Reconnect the app's connection in Make under Connections.",
    };
  }
  if (r.includes("timeout") || r.includes("timed out")) {
    return {
      plain: "A step took too long and Make gave up waiting.",
      fix: "Check if the service it's calling is slow or down; consider raising the module's timeout.",
    };
  }
  if (r.includes("rate limit") || r.includes("429")) {
    return {
      plain: "Hit a rate limit on an API this scenario calls.",
      fix: "Add a short delay before the call, or check if usage is unexpectedly high.",
    };
  }
  return { plain: raw, fix: "No known fix pattern for this one yet — worth a manual look." };
}

export default async function AdminHealthMonitor() {
  const admin = createAdminClient();

  const [{ data: clients }, { data: scenarioMaps }, makeToken] = await Promise.all([
    admin.from("clients").select("id,business_name,slug,status,stripe_subscription_id,monthly_revenue,created_at"),
    admin.from("client_scenarios").select("client_id,client_label,make_scenario_id,make_scenario_name"),
    getMakeToken(),
  ]);

  const clientRows = (clients ?? []) as ClientRow[];
  const maps = (scenarioMaps ?? []) as ScenarioMap[];
  const liveScenarios = makeToken ? await getMakeScenarios(makeToken) : [];
  const byId = new Map(liveScenarios.map((s) => [String(s.id), s]));

  const builds: BuildRow[] = await Promise.all(
    maps.map(async (m) => {
      const live = byId.get(m.make_scenario_id);
      let status: BuildRow["status"] = "unknown";
      let detail = "Not found in Make";
      let errorInfo: { plain: string; fix: string } | null = null;

      if (live) {
        if (live.isinvalid) {
          status = "warn";
          detail = "Invalid — needs fixing";
          if (makeToken) {
            const raw = await getLastError(m.make_scenario_id, makeToken);
            errorInfo = decodeError(raw);
          }
        } else if (!live.isActive) {
          status = "warn";
          detail = "Turned off";
        } else {
          status = "ok";
          detail = "Running";
        }
      }
      return {
        label: m.client_label,
        scenarioName: m.make_scenario_name,
        status,
        detail,
        makeUrl: `https://us2.make.com/2059306/scenarios/${m.make_scenario_id}/edit`,
        errorInfo,
      };
    })
  );

  const attention: Attention[] = [];
  for (const c of clientRows) {
    if (c.status === "active" && !c.stripe_subscription_id) {
      attention.push({
        title: `${c.business_name} — no Stripe subscription linked`,
        detail: "Active client with nothing billing them",
      });
    }
  }
  for (const b of builds) {
    if (b.status === "warn") {
      if (b.errorInfo) {
        attention.push({
          title: `${b.scenarioName} — ${b.errorInfo.plain}`,
          detail: `Fix: ${b.errorInfo.fix}`,
        });
      } else {
        attention.push({ title: `${b.scenarioName} — ${b.detail.toLowerCase()}`, detail: `Serves ${b.label}` });
      }
    }
  }

  const mrr = clientRows.reduce((sum, c) => sum + (parseFloat(c.monthly_revenue ?? "0") || 0), 0);
  const buildsOk = builds.filter((b) => b.status === "ok").length;
  const buildsTotal = builds.length;
  const allOk = attention.length === 0;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        :root{
          --bg:#F3F5F9; --panel:#FFFFFF; --line:#E3E7EF;
          --orange:#FD6300; --green:#0F9D68; --green-dim:#D9F3E7; --orange-dim:#FFE4D2;
          --text:#0B1830; --muted:#5B6B85; --muted-2:#95A1B5;
        }
        *{box-sizing:border-box;}
        body{margin:0;}
        .amwrap{
          font-family:'Manrope',sans-serif; background:radial-gradient(ellipse 1200px 600px at 50% -10%, #EAF0FA 0%, transparent 60%), var(--bg);
          color:var(--text); min-height:100vh; padding:28px 24px 60px;
        }
        .aminner{max-width:1180px;margin:0 auto;}
        header.amh{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px;}
        .brand{display:flex;align-items:center;gap:14px;}
        .brand img{height:28px;display:block;}
        .brand .div{width:1px;height:26px;background:var(--line);}
        .brand h1{font-size:15px;font-weight:700;margin:0;color:var(--muted);letter-spacing:.02em;}
        .hero{display:flex;align-items:center;gap:36px;background:linear-gradient(180deg,#fff 0%,#EEF2F8 100%);border:1px solid var(--line);border-radius:4px;padding:28px 34px;margin-bottom:22px;flex-wrap:wrap;}
        .hero-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;margin-bottom:6px;}
        .hero-title{font-size:24px;font-weight:800;margin:0 0 6px;}
        .hero-sub{color:var(--muted);font-size:13.5px;max-width:440px;}
        .hero-stats{display:flex;gap:30px;margin-left:auto;flex-wrap:wrap;}
        .hstat{text-align:right;}
        .hstat .n{font-family:'IBM Plex Mono',monospace;font-size:24px;font-weight:600;}
        .hstat .l{font-size:11px;color:var(--muted-2);margin-top:2px;}
        .section-label{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted-2);letter-spacing:.08em;margin:30px 0 10px 2px;}
        .strip{background:var(--panel);border:1px solid var(--line);border-radius:4px;overflow:hidden;}
        .lead{display:grid;grid-template-columns:1fr 130px 90px;align-items:center;gap:18px;padding:14px 20px;border-bottom:1px solid var(--line);}
        .lead:last-child{border-bottom:none;}
        .lead-name{font-weight:700;font-size:14px;}
        .lead-sub{font-size:11.5px;color:var(--muted-2);margin-top:2px;}
        .pill{justify-self:end;font-family:'IBM Plex Mono',monospace;font-size:10.5px;padding:4px 9px;border-radius:2px;display:flex;align-items:center;gap:6px;white-space:nowrap;}
        .pill .d{width:6px;height:6px;border-radius:50%;}
        .pill.ok{color:var(--green);background:var(--green-dim);} .pill.ok .d{background:var(--green);}
        .pill.warn{color:var(--orange);background:var(--orange-dim);} .pill.warn .d{background:var(--orange);}
        .pill.unknown{color:var(--muted-2);background:#EEF1F5;} .pill.unknown .d{background:var(--muted-2);}
        .grid2{display:grid;grid-template-columns:1.3fr 1fr;gap:20px;margin-top:30px;}
        @media (max-width:860px){.grid2{grid-template-columns:1fr;}}
        .panel{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:20px 22px;}
        .panel h2{font-size:13px;margin:0 0 16px;font-weight:700;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        th{text-align:left;font-size:10.5px;color:var(--muted-2);font-weight:600;letter-spacing:.04em;padding-bottom:10px;border-bottom:1px solid var(--line);}
        td{padding:11px 0;border-bottom:1px solid var(--line);}
        tr:last-child td{border-bottom:none;}
        .status-tag{font-size:10.5px;padding:2px 7px;border-radius:2px;font-family:'IBM Plex Mono',monospace;}
        .status-tag.active{color:var(--green);background:var(--green-dim);}
        .status-tag.other{color:var(--muted);background:#EEF1F5;}
        .attn{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);}
        .attn:last-child{border-bottom:none;padding-bottom:0;} .attn:first-child{padding-top:0;}
        .attn .d{width:7px;height:7px;border-radius:50%;background:var(--orange);margin-top:5px;flex:none;}
        .attn .t{font-size:13px;line-height:1.4;} .attn .m{font-size:11px;color:var(--muted-2);margin-top:2px;}
        .empty{color:var(--muted-2);font-size:13px;padding:6px 0;}
        .note{margin-top:26px;font-size:11.5px;color:var(--muted-2);line-height:1.6;border-top:1px solid var(--line);padding-top:16px;}
      `}</style>
      <div className="amwrap">
        <div className="aminner">
          <header className="amh">
            <div className="brand">
              <img src="/taskrocket-logo.png" alt="TaskRocket" />
              <div className="div"></div>
              <h1>HEALTH MONITOR</h1>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 18 }}>
              <a href="/admin/onboard" style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'IBM Plex Mono',monospace", textDecoration: "none" }}>
                + Onboard client
              </a>
              <a href="/admin/notifications" style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'IBM Plex Mono',monospace", textDecoration: "none" }}>
                🔔 Alerts
              </a>
            </div>
          </header>

          <div className="hero">
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="hero-eyebrow" style={{ color: allOk ? "var(--green)" : "var(--orange)" }}>
                {allOk ? "● ALL SYSTEMS NOMINAL" : `● ${attention.length} ITEM${attention.length === 1 ? "" : "S"} NEED ATTENTION`}
              </div>
              <h2 className="hero-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="/taskrocket-logo.png" alt="TaskRocket" style={{ height: 26 }} /> is {allOk ? "healthy" : "not healthy"}
              </h2>
              <div className="hero-sub">{clientRows.length} client{clientRows.length === 1 ? "" : "s"} · {buildsTotal} build{buildsTotal === 1 ? "" : "s"} monitored</div>
            </div>
            <div className="hero-stats">
              <div className="hstat"><div className="n">{buildsOk}/{buildsTotal}</div><div className="l">BUILDS OK</div></div>
              <div className="hstat" style={{ color: attention.length ? "var(--orange)" : undefined }}>
                <div className="n">{attention.length}</div><div className="l">NEEDS YOU</div>
              </div>
              <div className="hstat"><div className="n">${mrr.toFixed(0)}</div><div className="l">MRR (tracked)</div></div>
            </div>
          </div>

          <div className="section-label">// LIVE BUILDS</div>
          <div className="strip">
            {builds.length === 0 && <div style={{ padding: 20 }} className="empty">No scenarios mapped yet in client_scenarios.</div>}
            {builds.map((b, i) => (
              <div className="lead" key={i}>
                <div>
                  <a href={b.makeUrl} target="_blank" rel="noopener noreferrer" className="lead-name" style={{ color: "var(--text)", textDecoration: "none" }}>
                    {b.scenarioName} <span style={{ color: "var(--muted-2)", fontWeight: 500, fontSize: 11 }}>↗</span>
                  </a>
                  <div className="lead-sub">{b.label}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>{b.detail}</div>
                <div className={`pill ${b.status}`}><div className="d"></div>{b.status.toUpperCase()}</div>
              </div>
            ))}
          </div>

          <div className="grid2">
            <div className="panel">
              <h2>CLIENTS // {clientRows.length} total</h2>
              <table>
                <thead><tr><th>Client</th><th>Status</th><th style={{ textAlign: "right" }}>MRR (tracked)</th></tr></thead>
                <tbody>
                  {clientRows.map((c) => (
                    <tr key={c.id}>
                      <td><div className="client-name" style={{ fontWeight: 600 }}>{c.business_name}</div></td>
                      <td><span className={`status-tag ${c.status === "active" ? "active" : "other"}`}>{c.status.toUpperCase()}</span></td>
                      <td style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace" }}>
                        ${parseFloat(c.monthly_revenue ?? "0").toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <h2>NEEDS ATTENTION</h2>
              {attention.length === 0 && <div className="empty">Nothing flagged.</div>}
              {attention.map((a, i) => (
                <div className="attn" key={i}>
                  <div className="d"></div>
                  <div><div className="t">{a.title}</div><div className="m">{a.detail}</div></div>
                </div>
              ))}
            </div>
          </div>

          <div className="note">
            Live data: clients and revenue from Supabase, build status from the Make API via <code>client_scenarios</code>.
            Capacity gauges (Make ops, Supabase, Vercel, Claude usage) aren&apos;t wired yet — next up.
            Revenue shown is only what&apos;s recorded in <code>clients.monthly_revenue</code>, which is currently $0 for every client — worth reconciling against Stripe directly.
          </div>
        </div>
      </div>
    </>
  );
}
