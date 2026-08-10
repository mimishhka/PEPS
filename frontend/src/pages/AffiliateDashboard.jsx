// frontend/src/pages/AffiliateDashboard.jsx — Tableau de bord affilié Fironova.
// Bilingue FR/EN, identité NOVA. Derrière l'auth existante (ProtectedRoute).
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ComposedChart, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { QRCodeSVG } from "qrcode.react";
import {
  MousePointerClick, ShoppingBag, Wallet, Download, ShieldAlert,
  MessageCircle, Send, Mail, Activity,
} from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

const TIER_META = {
  standard: { fr: "Standard", en: "Standard", color: "#64748B" },
  bronze: { fr: "Bronze", en: "Bronze", color: "#B45309" },
  silver: { fr: "Argent", en: "Silver", color: "#64748B" },
  gold: { fr: "Or", en: "Gold", color: "#CA8A04" },
  platinum: { fr: "Platine", en: "Platinum", color: "#0891B2" },
  diamond: { fr: "Diamant", en: "Diamond", color: "#00B8D4" },
};

const COMPLIANCE_META = {
  compliant: { fr: "Conforme", en: "Compliant", cls: "bg-success/15 text-success", dot: "✅" },
  review: { fr: "En révision", en: "Under review", cls: "bg-warning/15 text-warning", dot: "⚠️" },
  suspended: { fr: "Suspendu", en: "Suspended", cls: "bg-error/15 text-error", dot: "🔒" },
};

const money = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const PAGE_SIZE = 10;
const fmtDate = (iso, lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" });
};
const fmtDateTime = (iso, lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const REFERRAL_STATUS_META = {
  pending: { fr: "En attente", en: "Pending", cls: "bg-ash/50 text-glacier" },
  approved: { fr: "Approuvé", en: "Approved", cls: "bg-nova/15 text-nordfjord" },
  paid: { fr: "Payé", en: "Paid", cls: "bg-success/15 text-success" },
  reversed: { fr: "Annulé", en: "Reversed", cls: "bg-error/15 text-error" },
};

function Pagination({ page, total, pageSize, onChange, L }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-ash">
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

export default function AffiliateDashboard() {
  useDocumentHead({ title: "Affiliate Dashboard", path: "/affiliate", noindex: true });
  const { user } = useAuth();
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [loading, setLoading] = useState(true);
  const [notAffiliate, setNotAffiliate] = useState(false);
  const [data, setData] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [series, setSeries] = useState([]);
  const [insights, setInsights] = useState(null);
  const [, setClicksStats] = useState(null);
  const [sources, setSources] = useState(null);
  const [activity, setActivity] = useState([]);
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [refPage, setRefPage] = useState(1);
  const [payPage, setPayPage] = useState(1);

  // Payout settings form
  const [payAddr, setPayAddr] = useState("");
  const [payCur, setPayCur] = useState("btc");
  const [savingPay, setSavingPay] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.get("/affiliate/me", { params: { lang } });
      setData(me.data);
      setPayAddr(me.data.payout_address || "");
      setPayCur(me.data.payout_currency || "btc");
      // Résilient : un endpoint qui échoue ne casse pas tout le tableau de bord.
      setRefPage(1); setPayPage(1);
      const [r, p, perf, ins, ck, src, act] = await Promise.allSettled([
        api.get("/affiliate/referrals"),
        api.get("/affiliate/payouts"),
        api.get("/affiliate/performance"),
        api.get("/affiliate/insights"),
        api.get("/affiliate/clicks"),
        api.get("/affiliate/clicks/sources"),
        api.get("/affiliate/activity"),
      ]);
      setReferrals(r.status === "fulfilled" ? (r.value.data || []) : []);
      setPayouts(p.status === "fulfilled" ? (p.value.data || []) : []);
      setInsights(ins.status === "fulfilled" ? (ins.value.data || null) : null);
      setClicksStats(ck.status === "fulfilled" ? (ck.value.data || null) : null);
      setSources(src.status === "fulfilled" ? (src.value.data || null) : null);
      setActivity(act.status === "fulfilled" ? (act.value.data || []) : []);
      const perfData = perf.status === "fulfilled" ? perf.value.data : null;
      setSeries((perfData?.series || []).map((s) => ({
        month: s.month,
        revenue: s.revenue,
        commission: s.commission,
      })));
      setNotAffiliate(false);
    } catch (e) {
      if (e.response?.status === 403) setNotAffiliate(true);
      else toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);

  const refCode = data?.code || "";
  const refLink = refCode
    ? `${window.location.origin}/?ref=${refCode}`
    : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(L("Copie impossible", "Copy failed"));
    }
  };

  const share = (kind) => {
    const url = encodeURIComponent(refLink);
    const text = encodeURIComponent(
      L(`Découvrez la gamme Fironova avec mon code promo ${refCode || ""}`, `Check out Fironova with my promo code ${refCode || ""}`)
    );
    const targets = {
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      email: `mailto:?subject=${encodeURIComponent(L("Recommandation Fironova", "Fironova recommendation"))}&body=${text}%20${url}`,
    };
    try { window.open(targets[kind], "_blank", "noopener,noreferrer"); }
    catch { toast.error(L("Ouverture impossible", "Unable to open")); }
  };

  const exportReferrals = () =>
    downloadCsv(
      `fironova-referrals-${refCode}.csv`,
      ["Order", "Base", "Commission", "Status", "Date"],
      referrals.map((r) => [
        r.order_number, r.base_amount, r.commission_amount, r.status,
        fmtDate(r.created_at, lang),
      ])
    );

  const exportPayouts = () =>
    downloadCsv(
      `fironova-payouts-${refCode}.csv`,
      ["Period", "Amount", "Currency", "Status", "Reference"],
      payouts.map((p) => [p.period, p.amount, p.currency, p.status, p.reference])
    );

  const refPageRows = referrals.slice((refPage - 1) * PAGE_SIZE, refPage * PAGE_SIZE);
  const payPageRows = payouts.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);

  const savePayout = async () => {
    if (!payAddr.trim()) {
      toast.error(L("Adresse requise", "Address required"));
      return;
    }
    setSavingPay(true);
    try {
      await api.put("/affiliate/payout-settings", {
        payout_address: payAddr.trim(),
        payout_currency: payCur.trim().toLowerCase(),
      });
      toast.success(L("Préférences enregistrées", "Settings saved"));
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSavingPay(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-clinical min-h-screen flex items-center justify-center">
        <p className="font-data text-xs uppercase tracking-[0.24em] text-glacier animate-pulse">
          {L("Chargement…", "Loading…")}
        </p>
      </div>
    );
  }

  if (notAffiliate) {
    return (
      <div className="bg-clinical min-h-screen">
        <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="affiliate-not-member">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
            {L("PROGRAMME PRIVÉ", "PRIVATE PROGRAM")}
          </p>
          <h1 className="font-display text-[32px] font-bold text-nordfjord mb-4">
            {L("Accès sur invitation", "Invitation only")}
          </h1>
          <p className="text-glacier leading-relaxed">
            {L(
              "Le programme d'affiliation Fironova est privé et fonctionne uniquement sur invitation. Si vous avez reçu une invitation, activez-la depuis le lien de votre courriel.",
              "The Fironova affiliate program is private and invitation-only. If you received an invitation, activate it from the link in your email."
            )}
          </p>
        </div>
      </div>
    );
  }

  const tierColor = TIER_META[data?.tier]?.color || "#64748B";
  const tierLabel = TIER_META[data?.tier]?.[lang] || data?.tier;
  const comp = COMPLIANCE_META[data?.compliance_status] || COMPLIANCE_META.compliant;
  const progress = data?.progress_to_next != null ? Math.round(data.progress_to_next * 100) : null;

  const TABS = [
    ["overview", L("Vue globale", "Overview")],
    ["performance", L("Performance", "Performance")],
    ["payments", L("Paiements", "Payments")],
    ["compliance", L("Conformité", "Compliance")],
    ["settings", L("Paramètres", "Settings")],
  ];

  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-16" data-testid="affiliate-dashboard">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ash pb-6 mb-8">
          <div>
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-2">
              {L("PROGRAMME D'AFFILIATION", "AFFILIATE PROGRAM")}
            </p>
            <h1 className="font-display text-[40px] font-bold text-nordfjord leading-none">
              {L("Bonjour", "Welcome")}, {user?.name}
            </h1>
            <p className="font-data text-xs text-glacier mt-2">
              {L("Prochaine réévaluation", "Next review")} : {data?.next_review ? new Date(data.next_review).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "long", day: "numeric" }) : "—"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-full font-data text-[11px] font-semibold uppercase tracking-wider"
                  style={{ background: `${tierColor}1a`, color: tierColor }}>
              {tierLabel} · {Math.round((data?.commission_rate || 0) * 100)}%
            </span>
            <span className={`px-3 py-1.5 rounded-full font-data text-[11px] font-semibold ${comp.cls}`}>
              {comp.dot} {comp[lang]}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              data-testid={`affiliate-tab-${k}`}
              className={`px-4 py-2 rounded-full font-data text-xs font-semibold uppercase tracking-wider transition ${
                tab === k ? "bg-nordfjord text-white" : "bg-white text-glacier border border-ash hover:border-nova"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div className="space-y-8" data-testid="affiliate-overview">
            {/* Bandeau gains du mois en cours */}
            <div className="rounded-2xl bg-nordfjord p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                  {L("GAINS DU MOIS EN COURS", "THIS MONTH'S EARNINGS")}
                </p>
                <p className="font-display text-4xl font-bold text-white tabular-nums">
                  {money(insights?.current_month?.commission)}
                </p>
                <p className="font-data text-xs text-white/60 mt-1">
                  {money(insights?.current_month?.revenue)} {L("de ventes validées", "in validated sales")}
                </p>
              </div>
              {insights?.best_month && (
                <div className="text-right">
                  <p className="font-data text-[11px] uppercase tracking-wider text-white/50 mb-1">
                    {L("Meilleur mois", "Best month")}
                  </p>
                  <p className="font-display text-xl font-bold text-white">{money(insights.best_month.commission)}</p>
                  <p className="font-data text-xs text-white/60">{insights.best_month.month}</p>
                </div>
              )}
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label={L("Revenu validé cumulé", "Cumulative validated revenue")} value={money(data?.cumulative_revenue)} />
              <KpiCard label={L("Revenu du trimestre", "Quarter revenue")} value={money(data?.quarter_revenue)} />
              <KpiCard label={L("Commissions en attente", "Pending commissions")} value={money(data?.pending_commission)} />
              <KpiCard label={L("Commissions payées", "Paid commissions")} value={money(data?.paid_commission)} accent />
            </div>

            {/* Insights secondaires : clics / conversion / commandes / panier */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MiniInsight label={L("Clics sur votre lien", "Clicks on your link")} value={insights?.clicks != null ? insights.clicks.toLocaleString("en-CA") : "—"} />
              <MiniInsight label={L("Taux de conversion", "Conversion rate")} value={insights?.conversion_rate != null ? `${(insights.conversion_rate * 100).toFixed(1)}%` : "—"} />
              <MiniInsight label={L("Commandes validées", "Validated orders")} value={insights?.validated_orders != null ? insights.validated_orders.toLocaleString("en-CA") : "—"} />
              <MiniInsight label={L("Panier moyen", "Avg order")} value={money(insights?.avg_order_value)} />
            </div>

            {/* Tier progression */}
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {L("PROGRESSION DE PALIER", "TIER PROGRESSION")}
              </p>
              {data?.next_tier ? (
                <>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="font-display text-2xl font-bold text-nordfjord">{tierLabel}</span>
                    <span className="font-data text-xs text-glacier">
                      {L("Encore", "Still")} {money(data.remaining_to_next)} {L("pour", "to reach")} {TIER_META[data.next_tier.tier]?.[lang] || data.next_tier.tier} ({Math.round(data.next_tier.rate * 100)}%)
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-ash overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                         style={{ width: `${progress || 0}%`, background: "#00B8D4" }} />
                  </div>
                  <p className="font-data text-[11px] text-glacier mt-2">{progress || 0}%</p>
                </>
              ) : (
                <p className="font-display text-2xl font-bold text-nordfjord">
                  🏆 {L("Palier maximal atteint", "Top tier reached")} — {tierLabel}
                </p>
              )}
            </div>

            {/* Garde-fou trimestriel : sécuriser son palier */}
            {data?.quarter_target > 0 && (
              <div className={`bg-white rounded-2xl border p-6 ${data.quarter_warning ? "border-warning/50 bg-warning/5" : "border-ash"}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                      {L("SÉCURISEZ VOTRE PALIER", "PROTECT YOUR TIER")}
                    </p>
                    <p className="font-display text-2xl font-bold text-nordfjord tabular-nums">
                      {money(data.quarter_revenue)}
                      <span className="text-sm font-medium text-glacier"> / {money(data.quarter_target)}</span>
                    </p>
                  </div>
                  {data.quarter_warning && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/15 text-warning text-[11px] font-semibold">
                      <ShieldAlert size={14} />
                      {L("Sous le plancher", "Below floor")}
                    </span>
                  )}
                </div>
                <div className="h-3 rounded-full bg-ash overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                       style={{ width: `${Math.min(100, Math.round((data.quarter_progress || 0) * 100))}%`,
                                background: data.quarter_warning ? "#E8A33D" : "#00B8D4" }} />
                </div>
                <p className="font-data text-[11px] text-glacier mt-2">
                  {data.quarter_warning ? (
                    <>{L(
                      "Votre CA du trimestre est sous le plancher de votre palier. À la prochaine réévaluation (",
                      "Your quarterly revenue is below your tier floor. At the next review (")}
                      {fmtDate(data.next_review, lang)}
                      {L("), vous pourriez descendre d'un palier.", "), you could drop one tier.")}
                    </>
                  ) : (
                    <>{L(
                      "Maintenez au moins ce montant de ventes validées d'ici la prochaine réévaluation (",
                      "Keep at least this amount of validated sales before the next review (")}
                      {fmtDate(data.next_review, lang)}
                      {L(") pour conserver votre palier.", ") to keep your tier.")}
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Activité récente */}
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {L("ACTIVITÉ RÉCENTE", "RECENT ACTIVITY")}
              </p>
              {activity.length === 0 ? (
                <p className="text-glacier text-sm py-6 text-center">
                  {L("Aucune activité pour l'instant.", "No activity yet.")}
                </p>
              ) : (
                <div className="space-y-1">
                  {activity.slice(0, 8).map((e, i) => (
                    <ActivityRow key={i} e={e} L={L} lang={lang} money={money} fmtDateTime={fmtDateTime} />
                  ))}
                </div>
              )}
            </div>

            {/* Referral link */}
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {L("VOTRE LIEN DE PARRAINAGE", "YOUR REFERRAL LINK")}
              </p>
              <div className="flex flex-col sm:flex-row gap-5">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <code className="flex-1 min-w-[240px] font-data text-sm text-nordfjord bg-clinical rounded-lg px-4 py-3 border border-ash break-all">
                      {refLink}
                    </code>
                    <button onClick={copyLink} data-testid="affiliate-copy-link"
                            className="px-5 py-3 rounded-full bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider hover:opacity-90 transition">
                      {copied ? L("Copié ✓", "Copied ✓") : L("Copier", "Copy")}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button onClick={() => share("whatsapp")} title={L("WhatsApp", "WhatsApp")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                      <MessageCircle size={14} className="text-success" /> WhatsApp
                    </button>
                    <button onClick={() => share("telegram")} title={L("Telegram", "Telegram")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                      <Send size={14} className="text-nova" /> Telegram
                    </button>
                    <button onClick={() => share("email")} title={L("Email", "Email")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                      <Mail size={14} className="text-nordfjord" /> Email
                    </button>
                  </div>
                </div>
                {refLink && (
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="bg-white border border-ash rounded-xl p-3">
                      <QRCodeSVG value={refLink} size={120} level="M" fgColor="#0B2E4F" />
                    </div>
                    <p className="font-data text-[10px] uppercase tracking-wider text-glacier">
                      {L("Scanner pour partager", "Scan to share")}
                    </p>
                  </div>
                )}
              </div>
              <p className="font-data text-[11px] text-glacier mt-3 leading-relaxed">
                {L(
                  "Communication privée uniquement — ne partagez jamais ce lien via des publications, vidéos ou forums publics.",
                  "Private communication only — never share this link through public posts, videos, or forums."
                )}
              </p>
            </div>
          </div>
        )}

        {/* PERFORMANCE */}
        {tab === "performance" && (
          <div className="space-y-6" data-testid="affiliate-performance">
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">
                {L("REVENU VALIDÉ — 12 DERNIERS MOIS", "VALIDATED REVENUE — LAST 12 MONTHS")}
              </p>
              {series.length === 0 ? (
                <p className="text-glacier text-sm py-12 text-center">
                  {L("Aucune donnée pour l'instant.", "No data yet.")}
                </p>
              ) : (
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748B" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="revenue" name={L("CA validé", "Revenue")} stroke="#0B2E4F" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="commission" name={L("Commissions", "Commissions")} stroke="#00B8D4" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                {L("SOURCES DE VOS CLICS", "WHERE YOUR CLICKS COME FROM")}
              </p>
              <p className="font-data text-[11px] text-glacier mb-4">
                {L("Derniers 30 jours — pages d'atterrissage, référents et appareils.",
                   "Last 30 days — landing pages, referrers and devices.")}
              </p>
              {!sources || sources.total_clicks === 0 ? (
                <p className="text-glacier text-sm py-8 text-center">
                  {L("Aucun clic enregistré pour l'instant.", "No clicks recorded yet.")}
                </p>
              ) : (
                <SourcesGrid sources={sources} L={L} lang={lang} />
              )}
            </div>

            <div className="bg-white rounded-2xl border border-ash overflow-hidden">
              <div className="px-6 py-4 border-b border-ash flex items-center justify-between">
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
                  {L("COMMANDES VALIDÉES", "VALIDATED ORDERS")}
                </p>
                <button onClick={exportReferrals}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                  <Download size={13} /> CSV
                </button>
              </div>
              <ReferralTable rows={refPageRows} lang={lang} L={L} money={money} />
              <Pagination page={refPage} total={referrals.length} pageSize={PAGE_SIZE}
                onChange={setRefPage} L={L} />
            </div>
          </div>
        )}

        {/* PAYMENTS */}
        {tab === "payments" && (
          <div className="space-y-6" data-testid="affiliate-payments">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard label={L("En attente", "Pending")} value={money(data?.pending_commission)} />
              <KpiCard label={L("Approuvé", "Approved")} value={money(data?.approved_commission)} />
              <KpiCard label={L("Payé", "Paid")} value={money(data?.paid_commission)} accent />
            </div>
            <div className="bg-white rounded-2xl border border-ash overflow-hidden">
              <div className="px-6 py-4 border-b border-ash flex items-center justify-between">
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
                  {L("HISTORIQUE DES PAIEMENTS", "PAYMENT HISTORY")}
                </p>
                <button onClick={exportPayouts}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                  <Download size={13} /> CSV
                </button>
              </div>
              {payouts.length === 0 ? (
                <p className="text-glacier text-sm py-12 text-center">
                  {L("Aucun paiement pour l'instant.", "No payments yet.")}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left font-data text-[11px] uppercase tracking-wider text-glacier border-b border-ash">
                          <th className="px-6 py-3">{L("Période", "Period")}</th>
                          <th className="px-6 py-3">{L("Montant", "Amount")}</th>
                          <th className="px-6 py-3">{L("Devise", "Currency")}</th>
                          <th className="px-6 py-3">{L("Statut", "Status")}</th>
                          <th className="px-6 py-3">{L("Référence", "Reference")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payPageRows.map((p) => (
                          <tr key={p.id} className="border-b border-ash/60">
                            <td className="px-6 py-3 font-data text-nordfjord">{p.period}</td>
                            <td className="px-6 py-3 font-semibold text-nordfjord">{money(p.amount)}</td>
                            <td className="px-6 py-3 uppercase text-glacier">{p.currency}</td>
                            <td className="px-6 py-3">
                              <PayoutStatus status={p.status} L={L} />
                            </td>
                            <td className="px-6 py-3 font-data text-[11px] text-glacier break-all max-w-[200px]">
                              {p.reference || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={payPage} total={payouts.length} pageSize={PAGE_SIZE}
                    onChange={setPayPage} L={L} />
                </>
              )}
            </div>
          </div>
        )}

        {/* COMPLIANCE */}
        {tab === "compliance" && (
          <div className="space-y-6" data-testid="affiliate-compliance">
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {L("STATUT DE CONFORMITÉ", "COMPLIANCE STATUS")}
              </p>
              <span className={`inline-flex px-3 py-1.5 rounded-full font-data text-xs font-semibold ${comp.cls}`}>
                {comp.dot} {comp[lang]}
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">
                {L("DIRECTIVES DE CONFORMITÉ", "COMPLIANCE GUIDELINES")}
              </p>
              <ul className="space-y-3 text-sm text-nordfjord">
                <ComplianceItem
                  title={L("Communication privée uniquement", "Private communication only")}
                  body={L("Partagez l'information en privé, jamais via des publications, vidéos ou forums publics.",
                    "Share information privately, never through public posts, videos, or forums.")} />
                <ComplianceItem
                  title={L("Aucune allégation d'usage humain", "No human-use claims")}
                  body={L("Ne mentionnez jamais de dosage, injection, cycles ou effets physiologiques.",
                    "Never mention dosage, injection, cycles, or physiological effects.")} />
                <ComplianceItem
                  title={L("Respect de la finalité scientifique", "Respect scientific purpose")}
                  body={L("Les produits Fironova sont destinés à la recherche uniquement (RUO).",
                    "Fironova products are for research use only (RUO).")} />
                <ComplianceItem
                  title={L("Conduite professionnelle", "Professional conduct")}
                  body={L("Maintenez des standards éthiques dans toutes vos interactions.",
                    "Uphold ethical standards in all interactions.")} />
              </ul>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div className="space-y-6 max-w-xl" data-testid="affiliate-settings">
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">
                {L("PARAMÈTRES DE PAIEMENT (CRYPTO)", "PAYOUT SETTINGS (CRYPTO)")}
              </p>
              <label className="block mb-4">
                <span className="font-data text-xs text-glacier">{L("Adresse de réception", "Receiving address")}</span>
                <input value={payAddr} onChange={(e) => setPayAddr(e.target.value)}
                  data-testid="affiliate-payout-address"
                  className="mt-1 w-full rounded-lg border border-ash px-4 py-3 font-data text-sm text-nordfjord focus:border-nova outline-none"
                  placeholder="bc1q…" />
              </label>
              <label className="block mb-6">
                <span className="font-data text-xs text-glacier">{L("Devise", "Currency")}</span>
                <select value={payCur} onChange={(e) => setPayCur(e.target.value)}
                  data-testid="affiliate-payout-currency"
                  className="mt-1 w-full rounded-lg border border-ash px-4 py-3 font-data text-sm text-nordfjord focus:border-nova outline-none">
                  <option value="btc">BTC</option>
                  <option value="eth">ETH</option>
                  <option value="usdttrc20">USDT (TRC20)</option>
                  <option value="usdterc20">USDT (ERC20)</option>
                  <option value="ltc">LTC</option>
                </select>
              </label>
              <button onClick={savePayout} disabled={savingPay}
                data-testid="affiliate-save-payout"
                className="px-6 py-3 rounded-full bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider hover:opacity-90 transition disabled:opacity-50">
                {savingPay ? L("Enregistrement…", "Saving…") : L("Enregistrer", "Save")}
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-2">
                {L("COMPTE", "ACCOUNT")}
              </p>
              <p className="text-sm text-nordfjord">{user?.name}</p>
              <p className="font-data text-xs text-glacier">{user?.email}</p>
              <p className="font-data text-xs text-glacier mt-2">
                {L("Code de parrainage", "Referral code")} : <span className="text-nordfjord font-semibold">{refCode}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "bg-nordfjord border-nordfjord" : "bg-white border-ash"}`}>
      <p className={`font-data text-[10px] font-semibold uppercase tracking-[0.2em] mb-2 ${accent ? "text-nova" : "text-glacier"}`}>
        {label}
      </p>
      <p className={`font-display text-2xl font-bold ${accent ? "text-white" : "text-nordfjord"}`}>{value}</p>
    </div>
  );
}

function MiniInsight({ label, value }) {
  return (
    <div className="rounded-xl border border-ash bg-white px-4 py-3">
      <p className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-glacier mb-1">{label}</p>
      <p className="font-display text-xl font-bold text-nordfjord tabular-nums">{value}</p>
    </div>
  );
}

function SourceBars({ rows, fmt, L }) {
  if (!rows || rows.length === 0) {
    return <p className="text-glacier text-[11px]">{L("Aucune donnée.", "No data.")}</p>;
  }
  const n = rows[0]?.clicks || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.source} className="flex items-center gap-2">
          <span className="text-[11px] text-nordfjord w-[120px] truncate" title={r.source}>{fmt(r.source)}</span>
          <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
            <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (r.clicks / n) * 100)}%` }} />
          </div>
          <span className="text-[11px] text-glacier tabular-nums w-8 text-right">{r.clicks}</span>
        </div>
      ))}
    </div>
  );
}

function SourcesGrid({ sources, L, lang }) {
  const devLabels = {
    desktop: L("Ordinateur", "Desktop"),
    mobile: L("Mobile", "Mobile"),
    tablet: L("Tablette", "Tablet"),
    unknown: L("Inconnu", "Unknown"),
  };
  const devices = Object.entries(sources.devices || {}).sort((a, b) => b[1] - a[1]);
  const devTotal = devices.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-2">
          {L("PAGES D'ATTERRISSAGE", "LANDING PAGES")}
        </p>
        <SourceBars rows={sources.top_pages} L={L}
          fmt={(s) => (s === "direct" ? L("Accès direct", "Direct") : s)} />
      </div>
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-2">
          {L("RÉFÉRENTS", "REFERRERS")}
        </p>
        <SourceBars rows={sources.top_referrers} L={L}
          fmt={(s) => (s === "direct" ? L("Accès direct", "Direct") : s)} />
      </div>
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-2">
          {L("APPAREILS", "DEVICES")}
        </p>
        <div className="space-y-1.5">
          {devices.length === 0 && (
            <p className="text-glacier text-[11px]">{L("Aucune donnée.", "No data.")}</p>
          )}
          {devices.map(([k, n]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[11px] text-nordfjord w-[120px] truncate">{devLabels[k] || k}</span>
              <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
                <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (n / devTotal) * 100)}%` }} />
              </div>
              <span className="text-[11px] text-glacier tabular-nums w-8 text-right">{Math.round((n / devTotal) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ e, L, lang, money, fmtDateTime }) {
  if (e.type === "click") {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-ash/40 last:border-0">
        <span className="w-8 h-8 rounded-lg bg-nova/10 text-nova grid place-items-center shrink-0">
          <MousePointerClick size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-nordfjord">
            {L("Clic sur votre lien", "Click on your link")}
            {e.label ? <span className="text-glacier"> · {e.label}</span> : null}
          </p>
        </div>
        <span className="text-[11px] text-glacier shrink-0">{fmtDateTime(e.at, lang)}</span>
      </div>
    );
  }
  if (e.type === "referral") {
    const m = REFERRAL_STATUS_META[e.status] || REFERRAL_STATUS_META.pending;
    return (
      <div className="flex items-center gap-3 py-2 border-b border-ash/40 last:border-0">
        <span className="w-8 h-8 rounded-lg bg-success/10 text-success grid place-items-center shrink-0">
          <ShoppingBag size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-nordfjord">
            {L("Commande", "Order")} <span className="font-semibold">{e.label || "—"}</span>
            {e.base != null ? <span className="text-glacier"> · {money(e.base)}</span> : null}
          </p>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.cls}`}>
            {lang === "fr" ? m.fr : m.en}
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-nordfjord tabular-nums">{money(e.amount)}</p>
          <p className="text-[11px] text-glacier">{fmtDateTime(e.at, lang)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2 border-b border-ash/40 last:border-0">
      <span className="w-8 h-8 rounded-lg bg-warning/10 text-warning grid place-items-center shrink-0">
        <Wallet size={15} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-nordfjord">
          {L("Paiement", "Payout")} <span className="font-semibold">{e.label || "—"}</span>
        </p>
        <p className="text-[11px] text-glacier uppercase">{e.status}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-nordfjord tabular-nums">{money(e.amount)}</p>
        <p className="text-[11px] text-glacier">{fmtDateTime(e.at, lang)}</p>
      </div>
    </div>
  );
}

function ReferralTable({ rows, lang, L, money }) {
  if (!rows.length) {
    return <p className="text-glacier text-sm py-12 text-center">{L("Aucune commande validée.", "No validated orders.")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left font-data text-[11px] uppercase tracking-wider text-glacier border-b border-ash">
            <th className="px-6 py-3">{L("Commande", "Order")}</th>
            <th className="px-6 py-3">{L("Base", "Base")}</th>
            <th className="px-6 py-3">{L("Commission", "Commission")}</th>
            <th className="px-6 py-3">{L("Statut", "Status")}</th>
            <th className="px-6 py-3">{L("Date", "Date")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-ash/60">
              <td className="px-6 py-3 font-data text-nordfjord">{r.order_number || "—"}</td>
              <td className="px-6 py-3 text-glacier">{money(r.base_amount)}</td>
              <td className="px-6 py-3 font-semibold text-nordfjord">{money(r.commission_amount)}</td>
              <td className="px-6 py-3"><ReferralStatus status={r.status} lang={lang} /></td>
              <td className="px-6 py-3 font-data text-[11px] text-glacier">
                {r.created_at ? new Date(r.created_at).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferralStatus({ status, lang }) {
  const map = {
    pending: { fr: "En attente", en: "Pending", cls: "bg-ash/50 text-glacier" },
    approved: { fr: "Approuvé", en: "Approved", cls: "bg-nova/15 text-nordfjord" },
    paid: { fr: "Payé", en: "Paid", cls: "bg-success/15 text-success" },
    reversed: { fr: "Annulé", en: "Reversed", cls: "bg-error/15 text-error" },
  };
  const m = map[status] || map.pending;
  return <span className={`px-2.5 py-1 rounded-full font-data text-[10px] font-semibold ${m.cls}`}>{lang === "fr" ? m.fr : m.en}</span>;
}

function PayoutStatus({ status, L }) {
  const map = {
    ready: { fr: "Prêt", en: "Ready", cls: "bg-warning/15 text-warning" },
    paid: { fr: "Payé", en: "Paid", cls: "bg-success/15 text-success" },
  };
  const m = map[status] || map.ready;
  return <span className={`px-2.5 py-1 rounded-full font-data text-[10px] font-semibold ${m.cls}`}>{L(m.fr, m.en)}</span>;
}

function ComplianceItem({ title, body }) {
  return (
    <li className="flex gap-3">
      <span className="text-nova mt-0.5">▸</span>
      <div>
        <p className="font-semibold text-nordfjord">{title}</p>
        <p className="text-glacier text-[13px] leading-relaxed">{body}</p>
      </div>
    </li>
  );
}
