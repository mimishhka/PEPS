import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowUpRight, Check, DollarSign, Percent, Repeat, TrendingDown, TrendingUp,
} from "lucide-react";
import api from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";
import { useLang } from "../../../contexts/LanguageContext";
import { DashboardSkeleton } from "../../../components/LoadingSkeletons";
import { LowStockCard } from "./dashboard/LowStockCard";
import { Th } from "../ui";

// ---------------------------------------------------------------------------
// Ce que cette page doit répondre, et RIEN d'autre :
//   1. Qu'est-ce qui demande mon action maintenant ?
//   2. L'argent rentre-t-il, et par rapport à avant ?
//   3. Qu'est-ce qui traîne : stock, commandes récentes ?
//
// Elle affichait une vingtaine de nombres de poids visuel égal, dont huit
// cartes d'action qui restaient affichées à zéro : le regard ne savait plus
// où se poser, et un vrai signal se noyait parmi les zéros. Les compteurs
// ne s'affichent désormais que lorsqu'ils demandent QUELQUE CHOSE ; quand
// tout est réglé, la page le dit en une ligne.
//
// Ont été retirés : les cinq colonnes « circuits de paiement » (le détail
// vit dans l'écran Réconciliation, et rien ne s'y décidait), et les quatre
// grandes tuiles de totaux historiques, réduites à une ligne de bas de page :
// elles ne déclenchent aucune décision quotidienne.
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const argent = (n) => `${Number(n || 0).toLocaleString(locale, {
    minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [enhanced, setEnhanced] = useState(null);
  const [period, setPeriod] = useState(30);
  const [initialLoading, setInitialLoading] = useState(true);
  // allSettled avalait les echecs : un 500 sur /admin/analytics produisait le
  // meme ecran vide que « aucune vente ». Une boite vide ne doit jamais etre
  // ambigue entre « pas de donnees » et « c'est casse ».
  const [analyticsError, setAnalyticsError] = useState(false);
  const [pulse, setPulse] = useState(null);
  const [affiliate, setAffiliate] = useState(null);
  // Alerte seuil de taxe : fermable, et ré-affichée seulement si le NIVEAU
  // change (ex. « approche » → « dépassé »), pas à chaque visite.
  const [dismissedTaxLevel, setDismissedTaxLevel] = useState(() => {
    try { return localStorage.getItem("fironova_tax_alert_dismissed") || ""; } catch { return ""; }
  });
  const dismissTaxAlert = () => {
    const lvl = enhanced?.tax_threshold?.level || "";
    try { localStorage.setItem("fironova_tax_alert_dismissed", lvl); } catch { /* ignore */ }
    setDismissedTaxLevel(lvl);
  };

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.get("/admin/stats").then((r) => { if (active) setStats(r.data); }),
      api.get("/admin/dashboard/pulse").then((r) => { if (active) setPulse(r.data); }),
      // Les chiffres d'affiliation sont deja calcules par cet endpoint :
      // payouts_ready, commission_due, compliance_review… rien a construire.
      api.get("/admin/affiliates/overview").then((r) => { if (active) setAffiliate(r.data); }),
    ]).finally(() => { if (active) setInitialLoading(false); });
    return () => { active = false; };
  }, []);

  // La serie ET les tuiles suivent la periode choisie.
  useEffect(() => {
    let active = true;
    api.get(`/admin/analytics?period=${period}`)
      .then((r) => { if (active) { setAnalytics(r.data); setAnalyticsError(false); } })
      .catch(() => { if (active) setAnalyticsError(true); });
    api.get(`/admin/analytics/enhanced?period=${period}`)
      .then((r) => { if (active) setEnhanced(r.data); })
      .catch(() => {});
    return () => { active = false; };
  }, [period]);

  // --- Ce qui demande une action, et seulement cela ------------------------
  // Une seule liste, triée par urgence : l'ordre du tableau de bord est
  // l'ordre dans lequel on traite sa journée. Un compteur à zéro n'entre pas.
  const actions = useMemo(() => {
    if (!pulse) return [];
    const r = pulse.ops?.refunds || {};
    const lignes = [
      { cle: "refunds-send", ton: "urgent", vers: "refunds",
        n: r.to_send || 0, valeur: argent(r.to_send_amount),
        titre: L("Remboursements à envoyer", "Refunds to send"),
        quoi: L("le client attend son argent", "the customer is waiting") },
      { cle: "reconcile", ton: "urgent", vers: "reconciliation",
        n: pulse.money?.reconcile?.count || 0,
        titre: L("Paiements à réconcilier", "Payments to reconcile"),
        quoi: L("reçus, non attribués", "received, unmatched") },
      { cle: "late", ton: "urgent", vers: "orders",
        n: pulse.ops?.late_payments || 0,
        titre: L("Paiements tardifs", "Late payments"),
        quoi: L("commandes à rouvrir", "orders to reopen") },
      { cle: "ship", ton: "warn", vers: "dispatch",
        n: pulse.ops?.to_ship || 0,
        titre: L("Commandes à expédier", "Orders to ship"),
        quoi: L("payées, pas encore parties", "paid, not shipped") },
      { cle: "refunds-review", ton: "warn", vers: "refunds",
        n: r.to_review || 0,
        titre: L("Remboursements à examiner", "Refunds to review"),
        quoi: L("en attente d'une décision", "awaiting a decision") },
      { cle: "stock", ton: "warn", vers: "products",
        n: pulse.ops?.low_stock || 0,
        titre: L("Variantes en rupture ou basses", "Out of or low stock"),
        quoi: pulse.ops?.low_stock_top?.[0]
          ? `${pulse.ops.low_stock_top[0].product_name} · ${pulse.ops.low_stock_top[0].variant_name}`
          : L("à réapprovisionner", "to restock") },
      { cle: "tickets", ton: "warn", vers: "tickets",
        n: pulse.ops?.tickets_open || 0,
        titre: L("Billets d'affiliés ouverts", "Open affiliate tickets"),
        quoi: L("l'affilié voit « ouvert » et attend", "the affiliate sees “open” and waits") },
      { cle: "payouts", ton: "warn", vers: "payouts",
        n: affiliate?.alerts?.payouts_ready || 0,
        valeur: argent(affiliate?.alerts?.payouts_ready_amount),
        titre: L("Versements affiliés prêts", "Affiliate payouts ready"),
        quoi: L("exécution + 2FA", "execute + 2FA") },
      { cle: "emails", ton: "warn", vers: "emails/outbox",
        n: pulse.ops?.emails_failed || 0,
        titre: L("Courriels non délivrés", "Undelivered emails"),
        quoi: L("après 5 tentatives", "after 5 attempts") },
      { cle: "pending", ton: "info", vers: "orders",
        n: pulse.money?.pending_payment?.count || 0,
        valeur: argent(pulse.money?.pending_payment?.amount),
        titre: L("En attente de paiement", "Awaiting payment"),
        quoi: pulse.money?.pending_payment?.expiring_soon
          ? L(`${pulse.money.pending_payment.expiring_soon} expirent sous 3 h`,
               `${pulse.money.pending_payment.expiring_soon} expiring within 3 h`)
          : `${pulse.money?.pending_payment?.by_method?.interac || 0} Interac · ${pulse.money?.pending_payment?.by_method?.crypto || 0} crypto` },
    ];
    return lignes.filter((l) => l.n > 0);
  }, [pulse, affiliate, lang]);          // eslint-disable-line react-hooks/exhaustive-deps

  const serie = analytics?.daily_revenue || [];
  const maxSerie = serie.length ? Math.max(...serie.map((d) => d.revenue), 1) : 1;
  const totalCommandes = serie.reduce((s, d) => s + d.orders, 0);
  const libellePeriode = period === 365 ? L("12 mois", "12 months")
    : period === 180 ? L("6 mois", "6 months")
    : L(`${period} jours`, `${period} days`);

  if (initialLoading) return <DashboardSkeleton />;

  return (
    <div className="p-8 max-w-[1500px]" data-testid="admin-dashboard">
      {/* En-tête : le titre, et la période qui pilote TOUT le bas de page. */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="font-data text-[11px] uppercase tracking-[0.3em] text-nova">
            // {L("APERÇU", "OVERVIEW")}
          </div>
          <h1 className="font-display text-4xl font-bold tracking-[-0.01em] mt-2 text-nordfjord">
            {L("Tableau de bord", "Dashboard")}
          </h1>
        </div>
        <div className="flex items-center gap-1 border border-ash rounded-lg p-1 bg-white"
             role="group" aria-label={L("Période", "Period")}>
          {[[7, L("7 j", "7 d")], [30, L("30 j", "30 d")], [90, L("3 mois", "3 mo")],
            [180, L("6 mois", "6 mo")], [365, L("1 an", "1 y")]].map(([p, label]) => (
            <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                period === p ? "bg-nordfjord text-white" : "text-glacier hover:bg-clinical"}`}
              data-testid={`period-${p}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Alerte seuil de taxe (30 000 $ CA sur 12 mois glissants) */}
      {enhanced?.tax_threshold && enhanced.tax_threshold.level !== "ok"
        && dismissedTaxLevel !== enhanced.tax_threshold.level && (
        <div className={`mb-6 rounded-xl border p-4 flex items-start gap-3 ${
          enhanced.tax_threshold.level === "exceeded"
            ? "border-error/40 bg-error/5" : "border-warning/40 bg-warning/5"}`} data-testid="tax-alert">
          <AlertTriangle size={18} className={enhanced.tax_threshold.level === "exceeded"
            ? "text-error mt-0.5" : "text-warning mt-0.5"} />
          <div className="min-w-0">
            <p className="font-medium text-sm text-nordfjord">
              {enhanced.tax_threshold.level === "exceeded"
                ? L("Seuil de taxe dépassé", "Tax threshold exceeded")
                : L("Vous approchez du seuil de taxe", "Approaching tax threshold")}
            </p>
            <p className="text-sm text-glacier mt-0.5">
              {L("CA sur 12 mois glissants : ", "Rolling 12-month revenue: ")}
              <strong>{enhanced.tax_threshold.rolling_12mo_revenue.toLocaleString(locale)} $</strong>
              {" / "}{enhanced.tax_threshold.threshold.toLocaleString(locale)} $.
              {enhanced.tax_threshold.level === "exceeded"
                ? L(" Vous devez vous inscrire à la TPS/TVQ et percevoir les taxes. Consultez votre comptable.",
                    " You must register for GST/QST and collect taxes. Consult your accountant.")
                : L(` Il reste ${enhanced.tax_threshold.remaining.toLocaleString("fr-CA")} $ avant le seuil de 30 000 $. Préparez l'inscription TPS/TVQ.`,
                    ` ${enhanced.tax_threshold.remaining.toLocaleString("en-CA")} $ remaining before the $30,000 threshold. Prepare your GST/QST registration.`)}
            </p>
          </div>
          <button onClick={dismissTaxAlert} aria-label={L("Fermer", "Dismiss")} data-testid="tax-alert-dismiss"
            className="ml-auto text-glacier hover:text-nordfjord text-lg leading-none">×</button>
        </div>
      )}

      {/* ---------------------------------------------------------------
          1. À FAIRE — la seule zone qui appelle une décision.
          --------------------------------------------------------------- */}
      <SectionLabel compte={actions.length}>{L("À FAIRE MAINTENANT", "TO DO NOW")}</SectionLabel>
      {actions.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8" data-testid="dashboard-actions">
          {actions.map((a) => <CarteAction key={a.cle} {...a} />)}
        </div>
      ) : (
        <div className="mb-8 flex items-center gap-3 bg-white border border-ash rounded-lg px-5 py-4"
             data-testid="dashboard-calm">
          <span className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center">
            <Check size={16} strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-medium text-nordfjord">
              {L("Rien ne demande d'action.", "Nothing needs action.")}
            </p>
            <p className="font-data text-[11px] text-glacier mt-0.5">
              {L("Commandes expédiées, paiements réconciliés, stock au-dessus des seuils.",
                 "Orders shipped, payments reconciled, stock above thresholds.")}
            </p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------
          2. L'ARGENT SUR LA PÉRIODE
          --------------------------------------------------------------- */}
      <SectionLabel>{L(`REVENU · ${libellePeriode}`, `REVENUE · ${libellePeriode}`)}</SectionLabel>
      {enhanced && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4" data-testid="enhanced-metrics">
          <Chiffre testid="kpi-revenue" label={L("Revenu", "Revenue")}
            valeur={argent(enhanced.current.revenue)} delta={enhanced.changes.revenue}
            icone={DollarSign} L={L} />
          <Chiffre testid="kpi-aov" label={L("Panier moyen", "Avg. order value")}
            valeur={argent(enhanced.current.aov)} delta={enhanced.changes.aov}
            icone={TrendingUp} L={L} />
          <Chiffre testid="kpi-conversion" label={L("Taux de conversion", "Conversion rate")}
            valeur={enhanced.conversion.conversion_rate != null ? `${enhanced.conversion.conversion_rate} %` : "—"}
            sous={L(`${enhanced.conversion.orders_paid} payées sur ${enhanced.conversion.orders_created} créées`,
                    `${enhanced.conversion.orders_paid} paid of ${enhanced.conversion.orders_created} created`)}
            icone={Percent} L={L} />
          <Chiffre testid="kpi-customers" label={L("Clients", "Customers")}
            valeur={`${enhanced.customers.new + enhanced.customers.returning}`}
            sous={L(`${enhanced.customers.new} nouveaux · ${enhanced.customers.returning} fidèles`,
                    `${enhanced.customers.new} new · ${enhanced.customers.returning} returning`)}
            icone={Repeat} L={L} />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mb-4 items-start">
        {/* Le graphique : une seule série, donc aucune légende — le titre la
            nomme. Barres fines, extrémités arrondies posées sur la ligne de
            base, écart de 2 px, et un repère de lecture sous l'axe : sans
            échelle ni dates, des barres ne disent rien. */}
        <div className="lg:col-span-2 bg-white border border-ash p-6 rounded-xl">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="font-display text-lg font-bold tracking-tight text-nordfjord">
                {L("Revenu encaissé", "Collected revenue")}
              </h2>
              <p className="font-data text-[11px] text-glacier mt-0.5">
                {libellePeriode}
                {analytics?.granularity && (
                  <span>{" · "}{analytics.granularity === "month" ? L("par mois", "monthly")
                    : analytics.granularity === "week" ? L("par semaine", "weekly")
                    : L("par jour", "daily")}</span>
                )}
              </p>
            </div>
            {serie.length > 0 && (
              <div className="text-right">
                <div className="font-display text-2xl font-bold tabular-nums text-nordfjord leading-none">
                  {argent(serie.reduce((s, d) => s + d.revenue, 0))}
                </div>
                <div className="font-data text-[11px] text-glacier mt-1">
                  {totalCommandes} {L("commande(s)", "order(s)")}
                </div>
              </div>
            )}
          </div>

          <div className="h-52 flex items-end gap-[2px] border-b border-ash" data-testid="chart-revenue">
            {serie.map((d) => (
              <div key={d.date} className="flex-1 h-full flex flex-col justify-end items-center group">
                <div
                  className="w-full bg-nordfjord/85 group-hover:bg-nova transition-colors relative rounded-t-[4px]"
                  style={{ height: `${Math.max(2, (d.revenue / maxSerie) * 100)}%` }}
                  title={`${d.date} · ${argent(d.revenue)} · ${d.orders} ${L("commande(s)", "order(s)")}`}
                >
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 font-data text-[10px] bg-nordfjord text-white px-2 py-1 whitespace-nowrap pointer-events-none transition-opacity rounded z-10">
                    {d.date} · {argent(d.revenue)} · {d.orders}
                  </div>
                </div>
              </div>
            ))}
            {!serie.length && (
              <div className="flex-1 text-center self-center px-4">
                {analyticsError ? (
                  <>
                    <p className="font-data text-xs text-error" data-testid="chart-revenue-error">
                      {L("Impossible de charger les revenus.", "Could not load revenue data.")}
                    </p>
                    <p className="font-data text-[10px] text-glacier mt-1">
                      {L("Les autres chiffres de cette page peuvent être incomplets.",
                         "Other figures on this page may be incomplete.")}
                    </p>
                  </>
                ) : (
                  <p className="font-data text-xs text-glacier" data-testid="chart-revenue-empty">
                    {L("Aucune commande payée sur la période", "No paid orders in this period")}
                  </p>
                )}
              </div>
            )}
          </div>
          {serie.length > 0 && (
            <div className="flex items-center justify-between mt-2 font-data text-[10px] text-glacier tabular-nums">
              <span>{serie[0].date}</span>
              <span className="text-nordfjord">{L("sommet", "peak")} {argent(maxSerie)}</span>
              <span>{serie[serie.length - 1].date}</span>
            </div>
          )}
          {/* Les mêmes données en tableau, pour qui n'exploite pas des barres
              (lecteur d'écran, forte impression, daltonisme). */}
          {serie.length > 0 && (
            <table className="sr-only" data-testid="chart-revenue-table">
              <caption>{L("Revenu encaissé par période", "Collected revenue per period")}</caption>
              <tbody>
                {serie.map((d) => (
                  <tr key={d.date}><th scope="row">{d.date}</th>
                    <td>{argent(d.revenue)}</td><td>{d.orders}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top produits — sur la période, comme le graphique. */}
        <div className="bg-white border border-ash p-6 rounded-xl">
          <h2 className="font-display text-lg font-bold tracking-tight text-nordfjord">
            {L("Meilleures ventes", "Best sellers")}
          </h2>
          <p className="font-data text-[11px] text-glacier mt-0.5 mb-4">{libellePeriode}</p>
          <ul className="divide-y divide-ash/60" data-testid="top-products">
            {(analytics?.top_products || []).slice(0, 6).map((p, idx) => (
              // La cle inclut la variante : deux dosages du meme compose sont
              // deux lignes distinctes, et p.slug seul les ferait entrer en
              // collision (React n'en afficherait qu'une).
              <li key={`${p.slug}-${p.variant_name || "root"}`} className="py-2.5 flex items-center gap-3">
                <span className="font-data text-[10px] text-glacier w-4">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate text-nordfjord">
                    {lang === "fr" ? (p.name_fr || p.name_en) : (p.name_en || p.name_fr)}
                    {p.variant_name && (
                      <span className="font-data text-[11px] text-nova font-semibold"> · {p.variant_name}</span>
                    )}
                  </div>
                  <div className="font-data text-[10px] text-glacier">
                    {p.units_sold} {L("unités", "units")}
                  </div>
                </div>
                <div className="font-bold tabular-nums text-nordfjord whitespace-nowrap text-sm">
                  {argent(p.revenue)}
                </div>
              </li>
            ))}
            {!analytics?.top_products?.length && (
              <li className="py-4 font-data text-xs text-glacier text-center">
                {L("Aucune vente sur la période", "No sales in this period")}
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* ---------------------------------------------------------------
          3. CE QUI TRAÎNE : commandes récentes et stock
          --------------------------------------------------------------- */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6 items-start">
        <div className="lg:col-span-2 bg-white border border-ash rounded-xl">
          <div className="flex items-center justify-between px-6 py-5 border-b border-ash">
            <h2 className="font-display text-lg font-bold tracking-tight text-nordfjord">
              {L("Dernières commandes", "Latest orders")}
            </h2>
            <Link to="orders" className="font-data text-[11px] uppercase tracking-[0.2em] flex items-center gap-1 text-nova hover:text-nordfjord">
              {L("Voir tout", "View all")} <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="recent-orders-table">
              <thead>
                <tr>
                  <Th>{L("Commande", "Order")}</Th>
                  <Th>{L("Client", "Customer")}</Th>
                  <Th>{L("Paiement", "Payment")}</Th>
                  <Th>{L("Traitement", "Fulfillment")}</Th>
                  <Th align="right">{L("Total", "Total")}</Th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.recent_orders || []).map((o) => (
                  <tr key={o.id} className="border-t border-ash/40 hover:bg-clinical/60">
                    <td className="px-6 py-3">
                      {/* Lien relatif : `/admin/...` en absolu tombe sur l'alias de
                          compatibilité qui redirige vers la racine du portail en
                          perdant le sous-chemin, donc le clic ne menait nulle part. */}
                      <Link to={`orders/${o.id}`} className="font-data font-bold text-xs text-nova hover:text-nordfjord">
                        {o.order_number}
                      </Link>
                      <div className="font-data text-[10px] text-glacier">
                        {(o.created_at || "").slice(0, 16).replace("T", " ")}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="text-sm text-nordfjord">{o.shipping_address?.full_name || o.email || "—"}</div>
                      <div className="font-data text-[10px] text-glacier">{o.email}</div>
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={o.payment_status} lang={lang} /></td>
                    <td className="px-6 py-3"><StatusBadge status={o.fulfillment_status} lang={lang} /></td>
                    <td className="px-6 py-3 text-right font-bold tabular-nums text-nordfjord">
                      {o.total != null ? argent(o.total) : "—"}
                    </td>
                  </tr>
                ))}
                {!analytics?.recent_orders?.length && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center font-data text-xs text-glacier">
                    {L("Aucune commande pour l'instant", "No orders yet")}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <LowStockCard />
      </div>

      {/* Totaux historiques : consultables, mais ils ne déclenchent aucune
          décision quotidienne. Une ligne de bas de page leur suffit. */}
      {stats && (
        <div className="border-t border-ash pt-4 flex flex-wrap gap-x-8 gap-y-1.5"
             data-testid="reference-totals">
          <span className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier self-center">
            {L("DEPUIS L'OUVERTURE", "ALL TIME")}
          </span>
          {[
            [L("Revenu", "Revenue"), argent(stats.revenue_cad)],
            [L("Commandes", "Orders"), stats.total_orders],
            [L("Clients", "Customers"), stats.customers],
            [L("Produits actifs", "Active products"), stats.products],
          ].map(([k, v]) => (
            <span key={k} className="text-[12px] text-glacier">
              {k} <b className="text-nordfjord font-semibold tabular-nums">{v}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Intitulé de section : structure la page en zones lisibles plutôt qu'en une
// suite de tuiles de poids égal, où l'œil ne sait pas où se poser.
function SectionLabel({ children, compte }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier whitespace-nowrap">
        {children}
      </span>
      {compte > 0 && (
        <span className="font-data text-[10px] font-bold bg-nordfjord text-white rounded px-1.5 py-0.5"
              data-testid="actions-count">
          {compte}
        </span>
      )}
      <span className="flex-1 h-px bg-ash" />
    </div>
  );
}

// Carte d'action : un compteur qui appelle une décision, jamais une
// statistique. Le liseré coloré encode l'urgence SANS dépendre de la seule
// couleur — le titre et la phrase la disent aussi.
const TONS = {
  urgent: "border-l-error",
  warn: "border-l-warning",
  info: "border-l-nova",
};

function CarteAction({ ton = "info", titre, quoi, n, valeur, vers, cle }) {
  return (
    <Link to={vers} data-testid={`action-${cle}`}
      className={`bg-white border border-ash border-l-[3px] ${TONS[ton]} rounded-lg px-4 py-3.5 flex items-center gap-4 hover:border-nova transition-colors`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-nordfjord truncate">{titre}</div>
        <div className="font-data text-[11px] text-glacier truncate mt-0.5">{quoi}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-xl font-bold tabular-nums text-nordfjord leading-none whitespace-nowrap">
          {valeur || n}
        </div>
        {valeur && <div className="font-data text-[10px] text-glacier mt-1">{n}</div>}
      </div>
    </Link>
  );
}

// Un chiffre de pilotage : la valeur d'abord, l'écart ensuite, l'icône en
// dernier. Le texte ne porte jamais la couleur d'une série.
function Chiffre({ label, valeur, delta, sous, icone: Icone, testid, L }) {
  const hausse = delta != null && delta >= 0;
  const Fleche = hausse ? TrendingUp : TrendingDown;
  return (
    <div className="bg-white border border-ash p-5 rounded-xl" data-testid={testid}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier">{label}</div>
          <div className="font-display text-[26px] leading-none font-bold mt-2 tabular-nums text-nordfjord whitespace-nowrap">
            {valeur}
          </div>
          {delta != null ? (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${hausse ? "text-success" : "text-error"}`}>
              <Fleche size={13} /> {hausse ? "+" : ""}{delta} %
              <span className="text-glacier font-normal">{L("vs période précédente", "vs previous period")}</span>
            </div>
          ) : (
            <div className="font-data text-[10px] text-glacier mt-2">{sous}</div>
          )}
        </div>
        {Icone && (
          <div className="w-8 h-8 shrink-0 flex items-center justify-center text-nordfjord bg-clinical rounded-lg">
            <Icone size={16} strokeWidth={1.7} />
          </div>
        )}
      </div>
    </div>
  );
}
