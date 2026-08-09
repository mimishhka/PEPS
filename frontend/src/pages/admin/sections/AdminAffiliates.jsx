// frontend/src/pages/admin/sections/AdminAffiliates.jsx
// Dashboard admin de pilotage du programme d'affiliation Fironova.
// Vue d'ensemble + alertes actionnables + tendances + top affiliés + liste enrichie.
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, RefreshCw, Copy, DollarSign, X, Users, TrendingUp, Clock,
  AlertTriangle, MousePointerClick, Award, Wallet, ShieldAlert, Eye,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";

const money = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n) => Number(n || 0).toLocaleString("en-CA");

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
  const [detail, setDetail] = useState(null);

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

  useEffect(() => { load(); }, [load]);

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
          <button onClick={() => setShowInvite(true)} data-testid="affiliate-invite-open"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nordfjord text-white text-sm font-medium hover:opacity-90 transition">
            <Plus size={16} /> {L("Inviter", "Invite")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-glacier py-16 text-center">{L("Chargement…", "Loading…")}</p>
      ) : (
        <>
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
              <p className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">{L("TOUS LES AFFILIÉS", "ALL AFFILIATES")}</p>
              <button onClick={load} className="text-glacier hover:text-nordfjord transition"><RefreshCw size={14} /></button>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-glacier py-12 text-center">{L("Aucun affilié. Invitez votre premier partenaire.", "No affiliates yet.")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-glacier border-b border-ash bg-clinical">
                      <th className="px-4 py-3">{L("Affilié", "Affiliate")}</th>
                      <th className="px-4 py-3">{L("Code", "Code")}</th>
                      <th className="px-4 py-3">{L("Statut", "Status")}</th>
                      <th className="px-4 py-3">{L("Conf.", "Comp.")}</th>
                      <th className="px-4 py-3">{L("Palier", "Tier")}</th>
                      <th className="px-4 py-3 text-right">{L("CA validé", "Validated")}</th>
                      <th className="px-4 py-3 text-right">{L("En attente", "Pending")}</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
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
            )}
          </div>
        </>
      )}

      {showInvite && <InviteModal L={L} onClose={() => setShowInvite(false)} onDone={load} />}
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

function DetailModal({ affiliateId, L, lang, onClose, onChange }) {
  const [data, setData] = useState(null);
  const [markingId, setMarkingId] = useState(null);
  const [ref, setRef] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/affiliates/${affiliateId}`);
      setData(data);
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
      <div className="bg-white rounded-2xl border border-ash w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg font-bold text-nordfjord">{a?.name || "—"}</h3>
          <button onClick={onClose}><X size={18} className="text-glacier" /></button>
        </div>
        {!data ? (
          <p className="text-sm text-glacier">{L("Chargement…", "Loading…")}</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label={L("Courriel", "Email")} value={a.email} />
              <Info label={L("Code", "Code")} value={a.code || "—"} mono />
              <Info label={L("Statut", "Status")} value={a.status} />
              <Info label={L("Conformité", "Compliance")} value={a.compliance_status} />
              {m && <>
                <Info label={L("CA validé", "Validated rev.")} value={money(m.cumulative_revenue)} />
                <Info label={L("CA trimestre", "Quarter rev.")} value={money(m.quarter_revenue)} />
                <Info label={L("Palier", "Tier")} value={`${TIER_LABEL[m.tier]?.[lang] || m.tier} · ${Math.round(m.commission_rate * 100)}%`} />
                <Info label={L("En attente", "Pending")} value={money(m.pending_commission)} />
              </>}
              <Info label={L("Invitations envoyées", "Invites sent")} value={a.invite_sent_count || 0} />
            </div>

            <div className="flex flex-wrap gap-2">
              {a.status === "active" && <ActBtn onClick={() => setPatch({ status: "suspended" })}>{L("Suspendre", "Suspend")}</ActBtn>}
              {a.status === "suspended" && <ActBtn onClick={() => setPatch({ status: "active" })}>{L("Réactiver", "Reactivate")}</ActBtn>}
              {a.compliance_status !== "review" && <ActBtn onClick={() => setPatch({ compliance_status: "review" })}>{L("Marquer en révision", "Flag review")}</ActBtn>}
              {a.compliance_status !== "compliant" && <ActBtn onClick={() => setPatch({ compliance_status: "compliant" })}>{L("Marquer conforme", "Mark compliant")}</ActBtn>}
            </div>

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

function ActBtn({ onClick, children }) {
  return <button onClick={onClick} className="px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical">{children}</button>;
}
function Field({ label, children }) {
  return <label className="block"><span className="text-xs text-glacier mb-1 block">{label}</span>{children}</label>;
}
function Info({ label, value, mono }) {
  return <div><p className="text-[11px] uppercase tracking-wider text-glacier">{label}</p><p className={`text-nordfjord ${mono ? "font-mono text-xs" : ""}`}>{value}</p></div>;
}
