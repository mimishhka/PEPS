// frontend/src/pages/admin/sections/AdminAffiliates.jsx
// Dashboard admin de pilotage du programme d'affiliation Fironova.
// Vue d'ensemble + alertes actionnables + tendances + top affiliés + liste enrichie.
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, RefreshCw, Copy, DollarSign, X, Users, TrendingUp, Clock,
  AlertTriangle, MousePointerClick, Award, Wallet, ShieldAlert, Eye,
  Search, Download, BarChart3, Smartphone, Globe, MousePointerClick as CursorClick,
  Upload, FileText, CheckCircle2, XCircle,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";

const money = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n) => Number(n || 0).toLocaleString("en-CA");

const PAGE_SIZE = 10;
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (headers, rows) =>
  [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
const downloadCsv = (filename, headers, rows) => {
  const blob = new Blob(["\uFEFF" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString();
};

function AdminPagination({ page, total, onChange, L }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-ash">
      <p className="text-[11px] text-glacier">{L("Page", "Page")} {page} / {pages}</p>
      <div className="flex gap-1.5">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}
          className="px-3 py-1 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical disabled:opacity-40">
          {L("Précédent", "Prev")}
        </button>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)}
          className="px-3 py-1 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical disabled:opacity-40">
          {L("Suivant", "Next")}
        </button>
      </div>
    </div>
  );
}

const DEVICE_LABELS = (L) => ({
  desktop: L("Ordinateur", "Desktop"),
  mobile: L("Mobile", "Mobile"),
  tablet: L("Tablette", "Tablet"),
  unknown: L("Inconnu", "Unknown"),
});

const TIER_LABEL = {
  standard: { fr: "Standard", en: "Standard" }, bronze: { fr: "Bronze", en: "Bronze" },
  silver: { fr: "Argent", en: "Silver" }, gold: { fr: "Or", en: "Gold" },
  platinum: { fr: "Platine", en: "Platinum" }, diamond: { fr: "Diamant", en: "Diamond" },
};
const TIER_COLOR = {
  standard: "#64748B", bronze: "#B45309", silver: "#64748B",
  gold: "#CA8A04", platinum: "#0891B2", diamond: "#00B8D4",
};

export default function AdminAffiliates() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [ov, setOv] = useState(null);
  const [rows, setRows] = useState([]);
  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("overview");
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fTier, setFTier] = useState("");
  const [affPage, setAffPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [clicks, setClicks] = useState(null);
  const [clicksLoading, setClicksLoading] = useState(false);
  const [payouts, setPayouts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, list, rk] = await Promise.all([
        api.get("/admin/affiliates/overview"),
        api.get("/admin/affiliates"),
        api.get("/admin/affiliates/risk"),
      ]);
      setOv(o.data);
      setRows(list.data || []);
      setRisk(rk.data || null);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/affiliates/payouts/all");
      setPayouts(data || []);
      setPayPage(1);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  }, []);

  const loadClicks = useCallback(async () => {
    setClicksLoading(true);
    try {
      const { data } = await api.get("/admin/affiliates/clicks");
      setClicks(data || null);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setClicksLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === "payouts") loadPayouts(); }, [tab, loadPayouts]);
  useEffect(() => { if (tab === "clicks") loadClicks(); }, [tab, loadClicks]);

  const runPayouts = async () => {
    try {
      const { data } = await api.post("/admin/affiliates/payouts/run");
      toast.success(L(`${data.payouts_created} relevé(s) généré(s)`, `${data.payouts_created} payout(s) created`));
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const fin = ov?.financial || {};
  const aff = ov?.affiliates || {};
  const al = ov?.alerts || {};
  const attr = ov?.attribution || {};

  const ql = (q || "").trim().toLowerCase();
  const filteredRows = rows.filter((a) => {
    if (fStatus && a.status !== fStatus) return false;
    if (fTier && a.tier !== fTier) return false;
    if (ql) {
      const hay = `${a.name || ""} ${a.email || ""} ${a.code || ""}`.toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });
  const affPageRows = filteredRows.slice((affPage - 1) * PAGE_SIZE, affPage * PAGE_SIZE);
  const payPageRows = payouts.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);
  const tierOptions = [...new Set(rows.map((r) => r.tier).filter(Boolean))];

  const exportAffiliates = () =>
    downloadCsv(
      "affiliates.csv",
      ["Name", "Email", "Code", "Discount", "Status", "Compliance", "Tier", "Rate",
       "Validated", "Pending", "Clicks"],
      filteredRows.map((a) => [
        a.name, a.email, a.code, a.coupon_percent != null ? `${a.coupon_percent}%` : "",
        a.status, a.compliance_status, a.tier || "",
        a.commission_rate != null ? `${Math.round(a.commission_rate * 100)}%` : "",
        a.cumulative_revenue != null ? money(a.cumulative_revenue) : "",
        a.pending_commission != null ? money(a.pending_commission) : "",
        a.clicks || 0,
      ])
    );

  const exportPayoutsAll = () =>
    downloadCsv(
      "payouts.csv",
      ["Period", "Affiliate", "Amount", "Currency", "Status", "Refs", "TxRef"],
      payouts.map((p) => [
        p.period, p.affiliate_code, p.amount, p.currency, p.status,
        p.referral_count || 0, p.reference || "",
      ])
    );

  return (
    <div data-testid="admin-affiliates">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="font-data text-[11px] uppercase tracking-[0.24em] text-glacier">{L("PROGRAMME", "PROGRAM")}</p>
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-nordfjord">{L("Affiliés", "Affiliates")}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={runPayouts} data-testid="affiliate-run-payouts"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-ash text-sm font-medium text-nordfjord hover:bg-clinical transition">
            <DollarSign size={16} /> {L("Générer les paiements", "Run payouts")}
          </button>
          <button onClick={() => setShowBulk(true)} data-testid="affiliate-bulk-open"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-ash text-sm font-medium text-nordfjord hover:bg-clinical transition">
            <Upload size={16} /> {L("Import CSV", "Import CSV")}
          </button>
          <button onClick={() => setShowInvite(true)} data-testid="affiliate-invite-open"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nordfjord text-white text-sm font-medium hover:opacity-90 transition">
            <Plus size={16} /> {L("Inviter", "Invite")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[["overview", L("Aperçu", "Overview")], ["clicks", L("Attribution", "Attribution")], ["payouts", L("Paiements", "Payouts")]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            data-testid={`affiliate-tab-${k}`}
            className={`px-4 py-2 rounded-full font-data text-xs font-semibold uppercase tracking-wider transition ${
              tab === k ? "bg-nordfjord text-white" : "bg-white text-glacier border border-ash hover:border-nova"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-glacier py-16 text-center">{L("Chargement…", "Loading…")}</p>
      ) : (
        <>
          {tab === "overview" && (<>
          {/* PANNEAU À AUDITER (signaux de risque — décision manuelle) */}
          {risk?.flagged_count > 0 && (
            <RiskPanel risk={risk} L={L} lang={lang} onOpen={setDetail} />
          )}

          {/* ALERTES ACTIONNABLES */}
          {(al.payouts_ready > 0 || al.compliance_review > 0 || al.invites_expired > 0 || al.commissions_maturing > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="affiliate-alerts">
              {al.payouts_ready > 0 && (
                <AlertCard icon={Wallet} tone="cyan"
                  title={L("Paiements à envoyer", "Payouts to send")}
                  value={`${al.payouts_ready} · ${money(al.payouts_ready_amount)}`}
                  action={L("Voir plus bas", "See below")} />
              )}
              {al.commissions_maturing > 0 && (
                <AlertCard icon={Clock} tone="amber"
                  title={L("Commissions à approuver", "Commissions maturing")}
                  value={int(al.commissions_maturing)}
                  action={L("Prêtes sous peu", "Maturing soon")} />
              )}
              {al.compliance_review > 0 && (
                <AlertCard icon={ShieldAlert} tone="red"
                  title={L("En révision conformité", "In compliance review")}
                  value={int(al.compliance_review)} />
              )}
              {al.invites_expired > 0 && (
                <AlertCard icon={AlertTriangle} tone="slate"
                  title={L("Invitations expirées", "Expired invites")}
                  value={int(al.invites_expired)}
                  action={L("À renvoyer", "Resend")} />
              )}
            </div>
          )}

          {/* KPI PRINCIPAUX */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Kpi icon={TrendingUp} accent="#0d9d57" label={L("CA généré (validé)", "Generated revenue")} value={money(fin.validated_revenue)} sub={`${int(fin.validated_orders)} ${L("commandes", "orders")}`} />
            <Kpi icon={Wallet} accent="#00B8D4" label={L("Commissions dues", "Commissions due")} value={money(fin.commission_due)} sub={L("approuvé, à payer", "approved, to pay")} />
            <Kpi icon={DollarSign} accent="#7c3aed" label={L("Versé à vie", "Paid lifetime")} value={money(fin.commission_paid)} sub={`${money(fin.commission_pending)} ${L("en attente", "pending")}`} />
            <Kpi icon={Users} accent="#f59e0b" label={L("Affiliés actifs", "Active affiliates")} value={int(aff.active)} sub={`${int(aff.invited)} ${L("invités", "invited")} · ${int(aff.suspended)} susp.`} />
          </div>

          {/* KPI SECONDAIRES */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <MiniStat label={L("Panier moyen validé", "Avg validated order")} value={money(fin.avg_order_value)} />
            <MiniStat label={L("Clics d'affiliation", "Affiliate clicks")} value={int(attr.total_clicks)} icon={MousePointerClick} />
            <MiniStat label={L("Taux de conversion", "Conversion rate")} value={attr.conversion_rate != null ? `${(attr.conversion_rate * 100).toFixed(1)}%` : "—"} />
            <MiniStat label={L("Commissions annulées", "Reversed commissions")} value={money(fin.commission_reversed)} />
          </div>

          {/* GRAPHE + TOP AFFILIÉS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2 bg-white border border-ash rounded-xl p-5">
              <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier mb-4">
                {L("CA & COMMISSIONS — 12 MOIS", "REVENUE & COMMISSIONS — 12 MONTHS")}
              </p>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={ov?.monthly_series || []} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748B" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748B" }} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="revenue" name={L("CA validé", "Revenue")} stroke="#0B2E4F" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="commission" name={L("Commissions", "Commissions")} stroke="#00B8D4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-ash rounded-xl p-5">
              <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier mb-4 flex items-center gap-2">
                <Award size={14} /> {L("TOP AFFILIÉS", "TOP AFFILIATES")}
              </p>
              {ov?.top_affiliates?.length ? (
                <div className="space-y-3">
                  {ov.top_affiliates.map((t, i) => (
                    <button key={t.id} onClick={() => setDetail(t.id)}
                      className="w-full flex items-center gap-3 text-left hover:bg-clinical rounded-lg p-2 -m-2 transition">
                      <span className="w-6 h-6 rounded-full bg-nordfjord text-white text-xs font-bold grid place-items-center shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-nordfjord truncate">{t.name}</p>
                        <p className="text-[11px] text-glacier">{int(t.orders)} {L("commandes", "orders")}</p>
                      </div>
                      <span className="text-sm font-bold text-nordfjord tabular-nums">{money(t.revenue)}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-glacier">{L("Aucune donnée.", "No data.")}</p>}

              {/* Répartition par palier */}
              {ov?.tier_distribution && Object.keys(ov.tier_distribution).length > 0 && (
                <div className="mt-5 pt-5 border-t border-ash">
                  <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier mb-3">{L("PAR PALIER", "BY TIER")}</p>
                  <div className="space-y-1.5">
                    {Object.entries(ov.tier_distribution).sort().map(([tier, n]) => (
                      <div key={tier} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_COLOR[tier] || "#64748B" }} />
                        <span className="text-xs text-nordfjord flex-1">{TIER_LABEL[tier]?.[lang] || tier}</span>
                        <span className="text-xs font-semibold text-glacier tabular-nums">{int(n)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* LISTE ENRICHIE */}
          <div className="bg-white border border-ash rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-ash flex items-center justify-between">
              <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">
                {L("TOUS LES AFFILIÉS", "ALL AFFILIATES")} ({int(filteredRows.length)})
              </p>
              <div className="flex gap-2">
                <button onClick={exportAffiliates}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                  <Download size={13} /> CSV
                </button>
                <button onClick={load} className="text-glacier hover:text-nordfjord transition"><RefreshCw size={14} /></button>
              </div>
            </div>
            {/* Recherche + filtres */}
            <div className="px-5 py-3 border-b border-ash bg-clinical/40 flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-glacier" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setAffPage(1); }}
                  placeholder={L("Rechercher nom, courriel, code…", "Search name, email, code…")}
                  data-testid="affiliate-search"
                  className="w-full rounded-lg border border-ash bg-white pl-9 pr-3 py-2 text-xs text-nordfjord outline-none focus:border-nova" />
              </div>
              <select value={fStatus} onChange={(e) => { setFStatus(e.target.value); setAffPage(1); }}
                data-testid="affiliate-filter-status"
                className="rounded-lg border border-ash bg-white px-3 py-2 text-xs text-nordfjord outline-none focus:border-nova">
                <option value="">{L("Statut : tous", "Status: all")}</option>
                <option value="active">{L("Actifs", "Active")}</option>
                <option value="invited">{L("Invités", "Invited")}</option>
                <option value="suspended">{L("Suspendus", "Suspended")}</option>
              </select>
              <select value={fTier} onChange={(e) => { setFTier(e.target.value); setAffPage(1); }}
                data-testid="affiliate-filter-tier"
                className="rounded-lg border border-ash bg-white px-3 py-2 text-xs text-nordfjord outline-none focus:border-nova">
                <option value="">{L("Palier : tous", "Tier: all")}</option>
                {tierOptions.map((t) => (
                  <option key={t} value={t}>{TIER_LABEL[t]?.[lang] || t}</option>
                ))}
              </select>
              {(q || fStatus || fTier) && (
                <button onClick={() => { setQ(""); setFStatus(""); setFTier(""); setAffPage(1); }}
                  className="px-3 py-2 rounded-lg border border-ash text-xs text-glacier hover:bg-white transition">
                  <X size={13} className="inline mr-1 -mt-0.5" />{L("Réinitialiser", "Reset")}
                </button>
              )}
            </div>
            {filteredRows.length === 0 ? (
              <p className="text-sm text-glacier py-12 text-center">
                {rows.length === 0
                  ? L("Aucun affilié. Invitez votre premier partenaire.", "No affiliates yet.")
                  : L("Aucun résultat pour ces filtres.", "No results for these filters.")}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-glacier border-b border-ash bg-clinical">
                        <th className="px-4 py-3">{L("Affilié", "Affiliate")}</th>
                        <th className="px-4 py-3">{L("Code", "Code")}</th>
                        <th className="px-4 py-3">{L("Statut", "Status")}</th>
                        <th className="px-4 py-3">{L("Conf.", "Comp.")}</th>
                        <th className="px-4 py-3">{L("Palier", "Tier")}</th>
                        <th className="px-4 py-3 text-right">{L("Clics", "Clicks")}</th>
                        <th className="px-4 py-3 text-right">{L("CA validé", "Validated")}</th>
                        <th className="px-4 py-3 text-right">{L("En attente", "Pending")}</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {affPageRows.map((a) => (
                        <tr key={a.id} className="border-b border-ash/60 hover:bg-clinical/60">
                          <td className="px-4 py-3">
                            <p className="font-medium text-nordfjord">{a.name}</p>
                            <p className="text-xs text-glacier">{a.email}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-nordfjord">{a.code || "—"}</td>
                          <td className="px-4 py-3"><StatusPill status={a.status} L={L} /></td>
                          <td className="px-4 py-3"><CompDot status={a.compliance_status} /></td>
                          <td className="px-4 py-3">
                            {a.tier ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: TIER_COLOR[a.tier] }} />
                                <span className="text-nordfjord">{TIER_LABEL[a.tier]?.[lang] || a.tier}</span>
                                <span className="text-glacier text-xs">{a.commission_rate ? `${Math.round(a.commission_rate * 100)}%` : ""}</span>
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-glacier tabular-nums">
                            {a.clicks ? (
                              <span title={a.last_click_at ? `${L("Dernier clic", "Last click")}: ${fmtDate(a.last_click_at)}` : ""}>
                                {int(a.clicks)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-nordfjord tabular-nums">{a.cumulative_revenue != null ? money(a.cumulative_revenue) : "—"}</td>
                          <td className="px-4 py-3 text-right text-nordfjord tabular-nums">{a.pending_commission != null ? money(a.pending_commission) : "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-1 justify-end">
                              {a.status !== "active" && <ResendButton affiliateId={a.id} L={L} />}
                              <button onClick={() => setDetail(a.id)}
                                className="px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                                {L("Détails", "Details")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <AdminPagination page={affPage} total={filteredRows.length} onChange={setAffPage} L={L} />
              </>
            )}
          </div>
          </>)}

        {/* Attribution tab */}
        {!loading && tab === "clicks" && (
          <div className="space-y-4" data-testid="affiliate-clicks">
            {clicksLoading ? (
              <p className="text-sm text-glacier py-16 text-center">{L("Chargement…", "Loading…")}</p>
            ) : !clicks ? (
              <p className="text-sm text-glacier py-16 text-center">{L("Aucune donnée d'attribution.", "No attribution data.")}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Kpi icon={CursorClick} accent="#00B8D4"
                    label={L("Clics (30 j)", "Clicks (30d)")} value={int(clicks.total_clicks)}
                    sub={`${int(clicks.active_affiliates)} ${L("affiliés actifs", "active affiliates")}`} />
                  <Kpi icon={Smartphone} accent="#2E9E6B"
                    label={L("Taux de conversion", "Conversion rate")}
                    value={attr.conversion_rate != null ? `${(attr.conversion_rate * 100).toFixed(1)}%` : "—"}
                    sub={L("commandes / clics", "orders / clicks")} />
                  <Kpi icon={Globe} accent="#E8A33D"
                    label={L("Meilleure page", "Top page")}
                    value={clicks.top_pages?.[0]?.source === "direct" ? L("Accès direct", "Direct") : clicks.top_pages?.[0]?.source || "—"}
                    sub={clicks.top_pages?.[0] ? int(clicks.top_pages[0].clicks) : ""} />
                  <Kpi icon={Users} accent="#00B8D4"
                    label={L("Conversions (30 j)", "Conversions (30d)")}
                    value={int(clicks.conversions_30d)}
                    sub={clicks.total_clicks && clicks.conversions_30d
                      ? `${((clicks.conversions_30d / clicks.total_clicks) * 100).toFixed(1)}% ${L("taux", "rate")}`
                      : "—"} />
                </div>

                <div className="bg-white border border-ash rounded-xl p-5">
                  <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier mb-4">
                    {L("CLICS — 30 DERNIERS JOURS", "CLICKS — LAST 30 DAYS")}
                  </p>
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer>
                      <LineChart data={clicks.trend || []} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B" }}
                          tickFormatter={(d) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10, fill: "#64748B" }} allowDecimals={false} />
                        <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString()} />
                        <Line type="monotone" dataKey="clicks" name={L("Clics", "Clicks")}
                          stroke="#00B8D4" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <AdminSourcesCard icon={Globe} title={L("PAGES D'ATTERRISSAGE", "LANDING PAGES")} L={L}
                    rows={clicks.top_pages} />
                  <AdminSourcesCard icon={MousePointerClick} title={L("RÉFÉRENTS", "REFERRERS")} L={L}
                    rows={clicks.top_referrers} />
                  <AdminDevicesCard devices={clicks.devices} L={L} />
                </div>

                <div className="bg-white border border-ash rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-ash">
                    <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">
                      {L("TOP AFFILIÉS PAR VOLUME DE CLICS", "TOP AFFILIATES BY CLICK VOLUME")}
                    </p>
                  </div>
                  {clicks.top_affiliates?.length ? (
                    <table className="w-full text-sm">
                      <tbody>
                        {clicks.top_affiliates.map((t, i) => (
                          <tr key={t.id} className="border-b border-ash/60 hover:bg-clinical/60">
                            <td className="px-5 py-3 w-10">
                              <span className="w-6 h-6 rounded-full bg-nordfjord text-white text-xs font-bold grid place-items-center">{i + 1}</span>
                            </td>
                            <td className="px-5 py-3">
                              <p className="font-medium text-nordfjord">{t.name}</p>
                              <p className="text-[11px] text-glacier font-mono">{t.code || "—"}</p>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => setDetail(t.id)}
                                className="text-xs text-nova hover:underline">{L("Détails", "Details")}</button>
                            </td>
                            <td className="px-5 py-3 text-right text-nordfjord tabular-nums">{int(t.clicks)} {L("clics", "clicks")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-sm text-glacier py-10 text-center">{L("Aucun clic.", "No clicks.")}</p>}
                </div>
              </>
            )}
          </div>
        )}

        {/* Payouts tab */}
        {!loading && tab === "payouts" && (
          <div className="space-y-4" data-testid="affiliate-payouts">
            <div className="bg-white border border-ash rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-ash flex items-center justify-between">
                <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">
                  {L("HISTORIQUE DES PAIEMENTS", "PAYMENT HISTORY")}
                </p>
                <button onClick={exportPayoutsAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                  <Download size={13} /> CSV
                </button>
              </div>
              {payouts.length === 0 ? (
                <p className="text-sm text-glacier py-12 text-center">{L("Aucun paiement.", "No payouts.")}</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-glacier border-b border-ash bg-clinical">
                          <th className="px-4 py-3">{L("Période", "Period")}</th>
                          <th className="px-4 py-3">{L("Affilié", "Affiliate")}</th>
                          <th className="px-4 py-3 text-right">{L("Montant", "Amount")}</th>
                          <th className="px-4 py-3">{L("Devise", "Currency")}</th>
                          <th className="px-4 py-3">{L("Statut", "Status")}</th>
                          <th className="px-4 py-3">{L("Réf.", "Ref.")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payPageRows.map((p) => (
                          <tr key={p.id} className="border-b border-ash/60 hover:bg-clinical/60">
                            <td className="px-4 py-3 font-data text-nordfjord">{p.period}</td>
                            <td className="px-4 py-3 font-mono text-xs text-nordfjord">{p.affiliate_code || "—"}</td>
                            <td className="px-4 py-3 text-right font-semibold text-nordfjord tabular-nums">{money(p.amount)}</td>
                            <td className="px-4 py-3 uppercase text-glacier text-xs">{p.currency}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${p.status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[11px] text-glacier break-all max-w-[180px]">{p.reference || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <AdminPagination page={payPage} total={payouts.length} onChange={setPayPage} L={L} />
                </>
              )}
            </div>
          </div>
        )}

      </>
      )}

      {showInvite && <InviteModal L={L} onClose={() => setShowInvite(false)} onDone={load} />}
      {showBulk && <BulkInviteModal L={L} onClose={() => setShowBulk(false)} onDone={load} />}
      {detail && <DetailModal affiliateId={detail} L={L} lang={lang} onClose={() => setDetail(null)} onChange={load} />}
    </div>
  );
}

/* ---------- Petits composants ---------- */

function RiskPanel({ risk, L, lang, onOpen }) {
  const items = risk.affiliates || [];
  return (
    <div className="mb-6 rounded-xl border border-error/30 bg-error/5 overflow-hidden" data-testid="affiliate-risk-panel">
      <div className="px-5 py-3 border-b border-error/20 flex items-center gap-2">
        <ShieldAlert size={16} className="text-error" />
        <p className="font-data text-[11px] uppercase tracking-[0.2em] text-nordfjord">
          {L("À auditer — signaux de risque", "To audit — risk signals")}
        </p>
        <span className="ml-auto text-xs font-semibold text-error tabular-nums">{risk.flagged_count}</span>
      </div>
      <div className="divide-y divide-error/10">
        {items.map((a) => (
          <div key={a.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.risk_level === "high" ? "bg-error" : "bg-warning"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-nordfjord truncate">
                {a.name}
                {a.insufficient_data && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-glacier">
                    {L("(données limitées)", "(limited data)")}
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {a.signals.map((s, i) => (
                  <span key={i}
                    className={`text-[11px] px-2 py-0.5 rounded-full ${s.level === "high" ? "bg-error/15 text-error" : "bg-warning/15 text-warning"}`}>
                    {lang === "fr" ? s.label_fr : s.label_en}
                    {s.type === "reversal_rate" ? ` ${Math.round(s.value * 100)}%` : ""}
                    {s.type === "self_orders" ? ` ×${s.value}` : ""}
                    {s.type === "volume_spike" ? ` ×${s.value}` : ""}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-glacier">
              <span>{L("validées", "validated")}: {a.validated_orders}</span>
              <span>{L("annulées", "reversed")}: {a.reversed_orders}</span>
              <span>{L("self", "self")}: {a.self_orders_blocked}</span>
            </div>
            <button onClick={() => onOpen(a.id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-error/30 text-xs text-nordfjord hover:bg-white transition">
              <Eye size={13} /> {L("Examiner", "Review")}
            </button>
          </div>
        ))}
      </div>
      <p className="px-5 py-2.5 text-[11px] text-glacier bg-white/40 border-t border-error/10">
        {L("Ces signaux aident à repérer qui examiner — ils ne suspendent personne automatiquement. La décision reste manuelle.",
          "These signals help you spot who to review — nobody is suspended automatically. The decision stays manual.")}
      </p>
    </div>
  );
}

function Kpi({ icon: Icon, accent, label, value, sub }) {
  return (
    <div className="bg-white border border-ash rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="font-data text-[10px] uppercase tracking-[0.18em] text-glacier">{label}</p>
        <span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: `${accent}1a` }}>
          <Icon size={16} style={{ color: accent }} />
        </span>
      </div>
      <p className="font-display text-2xl font-bold text-nordfjord tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-glacier mt-1">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }) {
  return (
    <div className="bg-white border border-ash rounded-xl px-4 py-3 flex items-center gap-3">
      {Icon && <Icon size={16} className="text-glacier shrink-0" />}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-glacier truncate">{label}</p>
        <p className="text-lg font-bold text-nordfjord tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function AdminSourcesCard({ icon: Icon, title, rows, L }) {
  const max = rows?.[0]?.clicks || 1;
  return (
    <div className="bg-white border border-ash rounded-xl p-5">
      <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier mb-4 flex items-center gap-2">
        <Icon size={14} /> {title}
      </p>
      {!rows || rows.length === 0 ? (
        <p className="text-sm text-glacier">{L("Aucune donnée.", "No data.")}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.source} className="flex items-center gap-2">
              <span className="text-xs text-nordfjord w-[130px] truncate" title={r.source}>
                {r.source === "direct" ? L("Accès direct", "Direct") : r.source}
              </span>
              <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
                <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (r.clicks / max) * 100)}%` }} />
              </div>
              <span className="text-xs text-glacier tabular-nums w-8 text-right">{int(r.clicks)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminDevicesCard({ devices, L }) {
  const labels = DEVICE_LABELS(L);
  const entries = Object.entries(devices || {}).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <div className="bg-white border border-ash rounded-xl p-5">
      <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier mb-4 flex items-center gap-2">
        <Smartphone size={14} /> {L("APPAREILS", "DEVICES")}
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-glacier">{L("Aucune donnée.", "No data.")}</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([k, n]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-xs text-nordfjord w-[130px] truncate">{labels[k] || k}</span>
              <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
                <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (n / total) * 100)}%` }} />
              </div>
              <span className="text-xs text-glacier tabular-nums w-8 text-right">{Math.round((n / total) * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({ icon: Icon, tone, title, value, action }) {
  const tones = {
    cyan: "border-nova/40 bg-nova/5",
    amber: "border-warning/40 bg-warning/5",
    red: "border-error/40 bg-error/5",
    slate: "border-ash bg-clinical",
  };
  const iconColor = { cyan: "#00B8D4", amber: "#E8A33D", red: "#D64545", slate: "#64748B" }[tone];
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={15} style={{ color: iconColor }} />
        <p className="text-[11px] uppercase tracking-wider text-glacier">{title}</p>
      </div>
      <p className="text-xl font-bold text-nordfjord tabular-nums">{value}</p>
      {action && <p className="text-[11px] text-glacier mt-0.5">{action}</p>}
    </div>
  );
}

function StatusPill({ status, L }) {
  const map = {
    invited: { fr: "Invité", en: "Invited", cls: "bg-warning/15 text-warning" },
    active: { fr: "Actif", en: "Active", cls: "bg-success/15 text-success" },
    suspended: { fr: "Suspendu", en: "Suspended", cls: "bg-error/15 text-error" },
  };
  const m = map[status] || map.invited;
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${m.cls}`}>{L(m.fr, m.en)}</span>;
}

function CompDot({ status }) {
  const emoji = { compliant: "✅", review: "⚠️", suspended: "🔒" };
  return <span title={status}>{emoji[status] || "✅"}</span>;
}

function ResendButton({ affiliateId, L }) {
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/affiliates/${affiliateId}/resend-invite`);
      toast.success(L(`Invitation renvoyée à ${data.sent_to}`, `Resent to ${data.sent_to}`));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={resend} disabled={busy}
      className="px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical transition disabled:opacity-50 inline-flex items-center gap-1">
      <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> {L("Renvoyer", "Resend")}
    </button>
  );
}

/* ---------- Modales ---------- */

function InviteModal({ L, onClose, onDone }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [lang, setLangSel] = useState("fr");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  const submit = async () => {
    if (!email.trim() || !name.trim()) { toast.error(L("Nom et courriel requis", "Name and email required")); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/admin/affiliates/invite", {
        email: email.trim(), name: name.trim(), commission_note: note.trim(), lang,
      });
      setInviteLink(data.invite_link || "");
      toast.success(L("Invitation envoyée", "Invitation sent"));
      onDone();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteLink); toast.success(L("Lien copié", "Link copied")); }
    catch { toast.error(L("Copie impossible", "Copy failed")); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-ash w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg font-bold text-nordfjord">{L("Inviter un affilié", "Invite an affiliate")}</h3>
          <button onClick={onClose}><X size={18} className="text-glacier" /></button>
        </div>
        <div className="space-y-4">
          <Field label={L("Nom", "Name")}>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="invite-name"
              className="w-full rounded-lg border border-ash px-3 py-2 text-sm bg-white text-nordfjord outline-none focus:border-nova" />
          </Field>
          <Field label={L("Courriel", "Email")}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="invite-email"
              className="w-full rounded-lg border border-ash px-3 py-2 text-sm bg-white text-nordfjord outline-none focus:border-nova" />
          </Field>
          <Field label={L("Note interne (optionnel)", "Internal note (optional)")}>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-ash px-3 py-2 text-sm bg-white text-nordfjord outline-none focus:border-nova" />
          </Field>
          <Field label={L("Langue de l'email", "Email language")}>
            <select value={lang} onChange={(e) => setLangSel(e.target.value)}
              className="w-full rounded-lg border border-ash px-3 py-2 text-sm bg-white text-nordfjord outline-none focus:border-nova">
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
        {inviteLink && (
          <div className="mt-4 rounded-lg border border-ash bg-clinical p-3">
            <p className="text-[11px] uppercase tracking-wider text-glacier mb-1">{L("Lien d'invitation", "Invite link")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-nordfjord break-all">{inviteLink}</code>
              <button onClick={copy} className="p-1.5 rounded-md hover:bg-white"><Copy size={14} className="text-glacier" /></button>
            </div>
          </div>
        )}
        <button onClick={submit} disabled={busy} data-testid="invite-submit"
          className="w-full mt-6 px-4 py-2.5 rounded-lg bg-nordfjord text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition">
          {busy ? L("Envoi…", "Sending…") : L("Envoyer l'invitation", "Send invitation")}
        </button>
      </div>
    </div>
  );
}

/* ---------- Bulk CSV Invite ---------- */

// Parse un CSV très simple : détecte les colonnes email/name par en-tête (insensible à la casse
// et aux variantes FR/EN). Ignore les guillemets et gère les virgules ou points-virgules.
function parseCsv(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!raw) return { rows: [], error: "Empty file" };
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { rows: [], error: "Empty file" };
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const splitLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === sep && !inQ) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const header = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/^"|"$/g, ""));
  const emailIdx = header.findIndex((h) => ["email", "courriel", "e-mail", "mail"].includes(h));
  const nameIdx = header.findIndex((h) => ["name", "nom", "fullname", "full_name", "full name"].includes(h));
  let rows = [];
  if (emailIdx === -1) {
    // Pas d'en-tête reconnu : on suppose que la 1re colonne est l'email, la 2e le nom.
    rows = lines.map((line) => {
      const cells = splitLine(line);
      return { email: cells[0] || "", name: cells[1] || "" };
    });
  } else {
    rows = lines.slice(1).map((line) => {
      const cells = splitLine(line);
      return { email: cells[emailIdx] || "", name: nameIdx >= 0 ? cells[nameIdx] || "" : "" };
    });
  }
  rows = rows
    .map((r) => ({ email: (r.email || "").trim(), name: (r.name || "").trim() }))
    .filter((r) => r.email.length);
  return { rows };
}

function BulkInviteModal({ L, onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [lang, setLangSel] = useState("fr");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseError("");
    try {
      const text = await file.text();
      const { rows: parsed, error } = parseCsv(text);
      if (error) { setParseError(error); setRows([]); return; }
      if (!parsed.length) { setParseError(L("Aucune ligne valide trouvée.", "No valid rows found.")); setRows([]); return; }
      setRows(parsed);
    } catch (e) {
      setParseError(e.message || "Parse error");
      setRows([]);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  const submit = async () => {
    if (!rows.length) { toast.error(L("Aucune ligne à envoyer", "No rows to send")); return; }
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post("/admin/affiliates/bulk-invite", {
        rows, lang, commission_note: note.trim(),
      });
      setResult(data);
      toast.success(L(`${data.sent} invitation(s) envoyée(s)`, `${data.sent} invitation(s) sent`));
      onDone && onDone();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadResults = () => {
    if (!result) return;
    const headers = ["email", "name", "code", "invite_link", "email_status"];
    const csv = [headers.join(",")].concat(
      (result.results || []).map((r) => headers.map((h) => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))
    ).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `affiliate-bulk-invite-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { setRows([]); setResult(null); setFileName(""); setParseError(""); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-ash w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
           data-testid="affiliate-bulk-modal"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display text-lg font-bold text-nordfjord">
              {L("Import CSV d'affiliés", "Bulk CSV invite")}
            </h3>
            <p className="text-[11px] text-glacier mt-0.5">
              {L("Un code unique est généré automatiquement pour chaque affilié.",
                 "A unique code is auto-generated for each affiliate.")}
            </p>
          </div>
          <button onClick={onClose} data-testid="affiliate-bulk-close"><X size={18} className="text-glacier" /></button>
        </div>

        {!result && (
          <>
            {/* Dropzone */}
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`block rounded-xl border-2 border-dashed p-6 cursor-pointer transition text-center ${
                dragOver ? "border-nova bg-nova/5" : "border-ash bg-clinical hover:border-nova/40"
              }`}
              data-testid="affiliate-bulk-dropzone"
            >
              <input type="file" accept=".csv,text/csv"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="hidden" data-testid="affiliate-bulk-file-input" />
              <Upload size={28} className="mx-auto text-glacier mb-2" />
              <p className="text-sm font-medium text-nordfjord">
                {fileName || L("Glissez un fichier CSV ou cliquez pour choisir",
                              "Drop a CSV file or click to browse")}
              </p>
              <p className="text-[11px] text-glacier mt-1">
                {L("Colonnes: email, name (en-tête optionnel) · max 500 lignes",
                   "Columns: email, name (header optional) · max 500 rows")}
              </p>
            </label>

            {parseError && (
              <p className="mt-3 text-xs text-error flex items-center gap-1">
                <AlertTriangle size={12} /> {parseError}
              </p>
            )}

            {/* Preview */}
            {rows.length > 0 && (
              <div className="mt-4 border border-ash rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-clinical border-b border-ash flex items-center justify-between">
                  <p className="text-xs font-data uppercase tracking-wider text-glacier">
                    {L("Aperçu", "Preview")} · {rows.length} {L("ligne(s)", "row(s)")}
                  </p>
                  <button onClick={reset} className="text-[11px] text-error hover:underline">
                    {L("Réinitialiser", "Reset")}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white sticky top-0">
                      <tr className="border-b border-ash">
                        <th className="px-3 py-1.5 text-left text-glacier font-data uppercase tracking-wider">Email</th>
                        <th className="px-3 py-1.5 text-left text-glacier font-data uppercase tracking-wider">{L("Nom", "Name")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 100).map((r, i) => (
                        <tr key={i} className="border-b border-ash/40">
                          <td className="px-3 py-1.5 text-nordfjord truncate">{r.email}</td>
                          <td className="px-3 py-1.5 text-glacier truncate">{r.name || "—"}</td>
                        </tr>
                      ))}
                      {rows.length > 100 && (
                        <tr><td colSpan={2} className="px-3 py-1.5 text-center text-glacier">…{rows.length - 100} {L("de plus", "more")}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label={L("Langue de l'email", "Email language")}>
                <select value={lang} onChange={(e) => setLangSel(e.target.value)}
                  className="w-full rounded-lg border border-ash px-3 py-2 text-sm bg-white text-nordfjord outline-none focus:border-nova"
                  data-testid="affiliate-bulk-lang">
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label={L("Note interne (optionnel)", "Internal note (optional)")}>
                <input value={note} onChange={(e) => setNote(e.target.value)}
                  data-testid="affiliate-bulk-note"
                  className="w-full rounded-lg border border-ash px-3 py-2 text-sm bg-white text-nordfjord outline-none focus:border-nova" />
              </Field>
            </div>

            <button onClick={submit} disabled={busy || !rows.length} data-testid="affiliate-bulk-submit"
              className="w-full mt-6 px-4 py-2.5 rounded-lg bg-nordfjord text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition inline-flex items-center justify-center gap-2">
              {busy ? <><RefreshCw size={14} className="animate-spin" /> {L("Envoi en cours…", "Sending…")}</>
                    : <>{L(`Envoyer ${rows.length} invitation(s)`, `Send ${rows.length} invite(s)`)}</>}
            </button>
          </>
        )}

        {result && (
          <div data-testid="affiliate-bulk-result">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 size={14} className="text-success" />
                  <p className="text-[11px] uppercase tracking-wider text-glacier">{L("Envoyés", "Sent")}</p></div>
                <p className="text-2xl font-bold text-nordfjord tabular-nums">{result.sent}</p>
              </div>
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                <div className="flex items-center gap-1.5 mb-1"><AlertTriangle size={14} className="text-warning" />
                  <p className="text-[11px] uppercase tracking-wider text-glacier">{L("Ignorés", "Skipped")}</p></div>
                <p className="text-2xl font-bold text-nordfjord tabular-nums">{result.skipped?.length || 0}</p>
              </div>
              <div className="rounded-lg border border-error/30 bg-error/5 p-3">
                <div className="flex items-center gap-1.5 mb-1"><XCircle size={14} className="text-error" />
                  <p className="text-[11px] uppercase tracking-wider text-glacier">{L("Échecs", "Failed")}</p></div>
                <p className="text-2xl font-bold text-nordfjord tabular-nums">{result.failed?.length || 0}</p>
              </div>
            </div>

            {(result.results?.length || 0) > 0 && (
              <div className="border border-ash rounded-lg overflow-hidden mb-3">
                <div className="px-4 py-2 bg-clinical border-b border-ash flex items-center justify-between">
                  <p className="text-xs font-data uppercase tracking-wider text-glacier">
                    {L("Codes générés", "Generated codes")}
                  </p>
                  <button onClick={downloadResults} data-testid="affiliate-bulk-download"
                    className="text-[11px] text-nordfjord hover:underline inline-flex items-center gap-1">
                    <Download size={11} /> {L("Télécharger CSV", "Download CSV")}
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white sticky top-0">
                      <tr className="border-b border-ash">
                        <th className="px-3 py-1.5 text-left text-glacier font-data uppercase tracking-wider">Email</th>
                        <th className="px-3 py-1.5 text-left text-glacier font-data uppercase tracking-wider">Code</th>
                        <th className="px-3 py-1.5 text-left text-glacier font-data uppercase tracking-wider">{L("Statut", "Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results.map((r, i) => (
                        <tr key={i} className="border-b border-ash/40">
                          <td className="px-3 py-1.5 text-nordfjord truncate">{r.email}</td>
                          <td className="px-3 py-1.5 font-data text-nova">{r.code}</td>
                          <td className={`px-3 py-1.5 ${r.email_status === "sent" ? "text-success" : "text-warning"}`}>
                            {r.email_status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(result.skipped?.length || 0) > 0 && (
              <details className="border border-ash rounded-lg mb-3">
                <summary className="px-4 py-2 bg-clinical text-xs font-data uppercase tracking-wider text-glacier cursor-pointer">
                  {L("Détails ignorés", "Skipped details")} ({result.skipped.length})
                </summary>
                <ul className="px-4 py-2 space-y-1">
                  {result.skipped.map((s, i) => (
                    <li key={i} className="text-xs text-glacier">
                      <span className="text-nordfjord">{s.email}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {(result.failed?.length || 0) > 0 && (
              <details className="border border-error/30 rounded-lg mb-3">
                <summary className="px-4 py-2 bg-error/5 text-xs font-data uppercase tracking-wider text-error cursor-pointer">
                  {L("Détails échecs", "Failed details")} ({result.failed.length})
                </summary>
                <ul className="px-4 py-2 space-y-1">
                  {result.failed.map((f, i) => (
                    <li key={i} className="text-xs text-glacier">
                      <span className="text-nordfjord">{f.email}</span> — {f.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={reset} data-testid="affiliate-bulk-again"
                className="flex-1 px-4 py-2.5 rounded-lg border border-ash text-sm font-medium text-nordfjord hover:bg-clinical transition inline-flex items-center justify-center gap-2">
                <FileText size={14} /> {L("Nouvel import", "New import")}
              </button>
              <button onClick={onClose} data-testid="affiliate-bulk-done"
                className="flex-1 px-4 py-2.5 rounded-lg bg-nordfjord text-white text-sm font-medium hover:opacity-90 transition">
                {L("Fermer", "Close")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailModal({ affiliateId, L, lang, onClose, onChange }) {
  const [data, setData] = useState(null);
  const [markingId, setMarkingId] = useState(null);
  const [ref, setRef] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [resending, setResending] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/affiliates/${affiliateId}`);
      setData(data);
      const a = data.affiliate || {};
      setForm({
        name: a.name || "",
        payout_address: a.payout_address || "",
        payout_currency: a.payout_currency || "",
        coupon_percent: a.coupon_percent ?? "",
        manual_tier: a.manual_tier || "",
        commission_note: a.commission_note || "",
        admin_notes: a.admin_notes || "",
      });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  }, [affiliateId]);

  useEffect(() => { load(); }, [load]);

  const setPatch = async (patch) => {
    try {
      await api.put(`/admin/affiliates/${affiliateId}`, patch);
      toast.success(L("Mis à jour", "Updated")); load(); onChange();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const saveForm = async () => {
    const patch = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v === "" || v == null) return;
      if (k === "coupon_percent") { patch[k] = Number(v); return; }
      patch[k] = v;
    });
    await setPatch(patch);
    setEditing(false);
  };

  const resendInvite = async () => {
    setResending(true);
    try {
      await api.post(`/admin/affiliates/${affiliateId}/resend-invite`);
      toast.success(L("Invitation renvoyée", "Invite resent"));
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setResending(false); }
  };

  const copyCode = async () => {
    if (!data?.affiliate?.code) return;
    try {
      await navigator.clipboard.writeText(data.affiliate.code);
      toast.success(L("Code copié", "Code copied"));
    } catch { toast.error(L("Copie impossible", "Copy failed")); }
  };

  const markPaid = async (payoutId) => {
    if (!ref.trim()) { toast.error(L("Référence de transaction requise", "Transaction reference required")); return; }
    try {
      await api.post(`/admin/affiliates/payouts/${payoutId}/mark-paid`, { reference: ref.trim() });
      toast.success(L("Paiement confirmé", "Payment confirmed"));
      setMarkingId(null); setRef(""); load(); onChange();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const a = data?.affiliate;
  const m = data?.metrics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-ash w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} data-testid="affiliate-detail-modal">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display text-lg font-bold text-nordfjord">{a?.name || "—"}</h3>
            {a?.email && <p className="text-xs text-glacier">{a.email}</p>}
          </div>
          <button onClick={onClose}><X size={18} className="text-glacier" /></button>
        </div>
        {!data ? (
          <p className="text-sm text-glacier">{L("Chargement…", "Loading…")}</p>
        ) : (
          <div className="space-y-6">
            {/* Identity + code */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label={L("Courriel", "Email")} value={a.email} />
              <div>
                <p className="text-[11px] uppercase tracking-wider text-glacier">{L("Code", "Code")}</p>
                <div className="flex items-center gap-2">
                  <p className="text-nordfjord font-mono text-xs">{a.code || "—"}</p>
                  {a.code && (
                    <button onClick={copyCode} data-testid="affiliate-copy-code"
                      className="p-1 rounded hover:bg-clinical" title={L("Copier", "Copy")}>
                      <Copy size={12} className="text-nova" />
                    </button>
                  )}
                </div>
              </div>
              <Info label={L("Statut", "Status")} value={a.status} />
              <Info label={L("Conformité", "Compliance")} value={a.compliance_status} />
              <Info label={L("Créé le", "Created")} value={fmtDate(a.created_at)} />
              <Info label={L("Activé le", "Activated")} value={fmtDate(a.activated_at)} />
              {m && <>
                <Info label={L("CA validé", "Validated rev.")} value={money(m.cumulative_revenue)} />
                <Info label={L("CA trimestre", "Quarter rev.")} value={money(m.quarter_revenue)} />
                <Info label={L("Palier", "Tier")} value={`${TIER_LABEL[m.tier]?.[lang] || m.tier} · ${Math.round(m.commission_rate * 100)}%`} />
                <Info label={L("En attente", "Pending")} value={money(m.pending_commission)} />
              </>}
              <Info label={L("Invitations envoyées", "Invites sent")} value={a.invite_sent_count || 0} />
              {a.coupon_percent != null && <Info label={L("% promo public", "Public promo %")} value={`${a.coupon_percent}%`} />}
            </div>

            {/* Status actions */}
            <div className="flex flex-wrap gap-2">
              {a.status === "invited" && (
                <ActBtn onClick={resendInvite} data-testid="affiliate-resend-invite">
                  {resending ? L("Envoi…", "Sending…") : L("Renvoyer l'invitation", "Resend invite")}
                </ActBtn>
              )}
              {a.status === "active" && <ActBtn onClick={() => setPatch({ status: "suspended" })}>{L("Suspendre", "Suspend")}</ActBtn>}
              {a.status === "suspended" && <ActBtn onClick={() => setPatch({ status: "active" })}>{L("Réactiver", "Reactivate")}</ActBtn>}
              {a.compliance_status !== "review" && <ActBtn onClick={() => setPatch({ compliance_status: "review" })}>{L("Marquer en révision", "Flag review")}</ActBtn>}
              {a.compliance_status !== "compliant" && <ActBtn onClick={() => setPatch({ compliance_status: "compliant" })}>{L("Marquer conforme", "Mark compliant")}</ActBtn>}
              <ActBtn onClick={() => setEditing((v) => !v)} data-testid="affiliate-edit-toggle">
                {editing ? L("Annuler l'édition", "Cancel edit") : L("Éditer les paramètres", "Edit settings")}
              </ActBtn>
            </div>

            {/* Editable fields */}
            {editing && (
              <div className="rounded-xl border border-nova/40 bg-nova/5 p-4 space-y-3" data-testid="affiliate-edit-form">
                <p className="font-data text-[11px] uppercase tracking-[0.2em] text-nova">
                  {L("PARAMÈTRES ÉDITABLES", "EDITABLE SETTINGS")}
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <EditField label={L("Nom d'affichage", "Display name")}
                    value={form.name} onChange={(v) => setForm({ ...form, name: v })}
                    test="edit-name" />
                  <EditField label={L("% promo public (coupon)", "Public promo % (coupon)")}
                    type="number" min={0} max={100} step={1}
                    value={form.coupon_percent} onChange={(v) => setForm({ ...form, coupon_percent: v })}
                    test="edit-coupon-percent" />
                  <EditField label={L("Adresse de paiement", "Payout address")}
                    value={form.payout_address} onChange={(v) => setForm({ ...form, payout_address: v })}
                    test="edit-payout-address"
                    placeholder={L("Interac email, adresse crypto ou IBAN", "Interac email, crypto address, or IBAN")} />
                  <EditField label={L("Devise / méthode", "Currency / method")}
                    value={form.payout_currency} onChange={(v) => setForm({ ...form, payout_currency: v })}
                    test="edit-payout-currency"
                    placeholder="CAD / USDC / BTC" />
                  <EditField label={L("Palier manuel (override)", "Manual tier override")}
                    value={form.manual_tier} onChange={(v) => setForm({ ...form, manual_tier: v })}
                    test="edit-manual-tier"
                    placeholder={L("laisser vide pour auto", "leave blank for auto")}
                    select={["", "standard", "bronze", "silver", "gold", "platinum", "diamond"]} />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-glacier">
                    {L("Note commission (visible sur relevé)", "Commission note (shown on statements)")}
                  </label>
                  <textarea value={form.commission_note} onChange={(e) => setForm({ ...form, commission_note: e.target.value })}
                    data-testid="edit-commission-note"
                    className="w-full mt-1 rounded-md border border-ash px-2 py-1.5 text-xs bg-white text-nordfjord outline-none"
                    rows={2} />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-glacier">
                    {L("Notes internes (privées, non visibles par l'affilié)", "Internal notes (private, not shown to affiliate)")}
                  </label>
                  <textarea value={form.admin_notes} onChange={(e) => setForm({ ...form, admin_notes: e.target.value })}
                    data-testid="edit-admin-notes"
                    className="w-full mt-1 rounded-md border border-ash px-2 py-1.5 text-xs bg-white text-nordfjord outline-none"
                    rows={3} />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setEditing(false)}
                    className="px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical">
                    {L("Annuler", "Cancel")}
                  </button>
                  <button onClick={saveForm} data-testid="affiliate-edit-save"
                    className="px-4 py-1.5 rounded-md bg-nordfjord text-white text-xs font-medium hover:opacity-90">
                    {L("Enregistrer", "Save")}
                  </button>
                </div>
              </div>
            )}

            {/* Payout settings display (when not editing) */}
            {!editing && (a.payout_address || a.payout_currency) && (
              <div className="rounded-xl border border-ash bg-clinical p-4" data-testid="affiliate-payout-info">
                <p className="text-[11px] uppercase tracking-wider text-glacier mb-2">
                  {L("Paramètres de paiement affilié", "Affiliate payout settings")}
                </p>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <Info label={L("Adresse / destinataire", "Address / recipient")} value={a.payout_address || "—"} mono />
                  <Info label={L("Devise / méthode", "Currency / method")} value={a.payout_currency || "—"} />
                </div>
                {a.commission_note && (
                  <p className="text-xs text-glacier mt-3 italic">"{a.commission_note}"</p>
                )}
              </div>
            )}
            {!editing && a.admin_notes && (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
                <p className="text-[11px] uppercase tracking-wider text-warning mb-1">
                  {L("Notes internes admin", "Internal admin notes")}
                </p>
                <p className="text-xs text-nordfjord whitespace-pre-wrap">{a.admin_notes}</p>
              </div>
            )}

            <div>
              <p className="text-xs uppercase tracking-wider text-glacier mb-2">{L("Relevés de paiement", "Payouts")}</p>
              {data.payouts?.length ? (
                <div className="space-y-2">
                  {data.payouts.map((p) => (
                    <div key={p.id} className="rounded-lg border border-ash p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-nordfjord">{p.period} · {money(p.amount)} <span className="uppercase text-xs text-glacier">{p.currency}</span></span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{p.status}</span>
                      </div>
                      {p.status === "ready" && (
                        markingId === p.id ? (
                          <div className="flex gap-2 mt-2">
                            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={L("Réf. tx / hash", "Tx ref / hash")}
                              className="flex-1 rounded-md border border-ash px-2 py-1 text-xs bg-white text-nordfjord outline-none" />
                            <button onClick={() => markPaid(p.id)} className="px-3 py-1 rounded-md bg-nordfjord text-white text-xs">{L("Confirmer", "Confirm")}</button>
                          </div>
                        ) : (
                          <button onClick={() => { setMarkingId(p.id); setRef(""); }}
                            className="mt-2 px-3 py-1 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical">{L("Marquer payé", "Mark paid")}</button>
                        )
                      )}
                      {p.reference && <p className="text-[11px] text-glacier mt-1 break-all">{L("Réf", "Ref")}: {p.reference}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-glacier">{L("Aucun relevé.", "No payouts.")}</p>}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-glacier mb-2">{L("Commandes attribuées", "Attributed orders")}</p>
              {data.referrals?.length ? (
                <div className="overflow-x-auto rounded-lg border border-ash">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-glacier border-b border-ash">
                        <th className="px-3 py-2">{L("Commande", "Order")}</th>
                        <th className="px-3 py-2">{L("Base", "Base")}</th>
                        <th className="px-3 py-2">{L("Commission", "Commission")}</th>
                        <th className="px-3 py-2">{L("Statut", "Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.referrals.map((r) => (
                        <tr key={r.id} className="border-b border-ash/60">
                          <td className="px-3 py-2 text-nordfjord">{r.order_number || "—"}</td>
                          <td className="px-3 py-2">{money(r.base_amount)}</td>
                          <td className="px-3 py-2">{money(r.commission_amount)}</td>
                          <td className="px-3 py-2">{r.status}{r.excluded_reason ? ` (${r.excluded_reason})` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-glacier">{L("Aucune commande.", "No orders.")}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text", test, placeholder, select, min, max, step }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-glacier mb-1 block">{label}</span>
      {select ? (
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}
          data-testid={test}
          className="w-full rounded-md border border-ash px-2 py-1.5 text-xs bg-white text-nordfjord outline-none">
          {select.map((opt) => <option key={opt} value={opt}>{opt || "—"}</option>)}
        </select>
      ) : (
        <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)}
          data-testid={test} placeholder={placeholder}
          min={min} max={max} step={step}
          className="w-full rounded-md border border-ash px-2 py-1.5 text-xs bg-white text-nordfjord outline-none" />
      )}
    </label>
  );
}

function ActBtn({ onClick, children, ...rest }) {
  return <button onClick={onClick} {...rest} className="px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical">{children}</button>;
}
function Field({ label, children }) {
  return <label className="block"><span className="text-xs text-glacier mb-1 block">{label}</span>{children}</label>;
}
function Info({ label, value, mono }) {
  return <div><p className="text-[11px] uppercase tracking-wider text-glacier">{label}</p><p className={`text-nordfjord ${mono ? "font-mono text-xs" : ""}`}>{value}</p></div>;
}
