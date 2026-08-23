import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign, AlertTriangle, TrendingUp, TrendingDown, ArrowUpRight, Repeat, Percent,
} from "lucide-react";
import api from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";
import { useLang } from "../../../contexts/LanguageContext";
import { DashboardSkeleton } from "../../../components/LoadingSkeletons";
import { LowStockCard } from "./dashboard/LowStockCard";
import { Th } from "../ui";

export default function AdminDashboard() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

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

  // La serie ET les tuiles suivent desormais la periode. Le graphique etait
  // cable en dur sur 30 jours : cliquer 7j ou 90j changeait les chiffres mais
  // jamais les barres.
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


  const dailyMax = analytics?.daily_revenue?.length
    ? Math.max(...analytics.daily_revenue.map(d => d.revenue), 1)
    : 1;

  if (initialLoading) return <DashboardSkeleton />;

  return (
    <div className="p-8" data-testid="admin-dashboard">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="font-data text-[11px] uppercase tracking-[0.3em] text-nova">// {L("APERÇU", "OVERVIEW")}</div>
          <h1 className="font-display text-4xl font-bold tracking-[-0.01em] mt-2 text-nordfjord">{L("Tableau de bord", "Dashboard")}</h1>
        </div>
        <div className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">
          {L("Temps réel · CAD", "Real-time · CAD")}
        </div>
      </div>

      {/* Deux bandes d'action AVANT les statistiques : ce qui demande une
          decision passe devant ce qui decrit le passe. Les tuiles historiques
          ne declenchent aucune action, elles descendent en bas de page. */}
      {pulse && (
        <>
          <SectionLabel>{L("ARGENT EN SUSPENS", "MONEY OUTSTANDING")}</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            <ActionCard
              tone={pulse.money.pending_payment.expiring_soon ? "urgent" : "warn"}
              label={L("En attente de paiement", "Awaiting payment")}
              value={`${pulse.money.pending_payment.amount.toFixed(2)} $`}
              testid="pulse-pending"
              hint={
                <>
                  {pulse.money.pending_payment.count} {L("commandes", "orders")}
                  {" · "}
                  {pulse.money.pending_payment.by_method.interac} Interac,{" "}
                  {pulse.money.pending_payment.by_method.crypto} crypto
                  {pulse.money.pending_payment.expiring_soon > 0 && (
                    <strong className="text-error">
                      {" — "}{pulse.money.pending_payment.expiring_soon}{" "}
                      {L("expirent bientôt", "expiring soon")}
                    </strong>
                  )}
                </>
              }
            />
            <ActionCard
              tone={pulse.money.reconcile.count ? "urgent" : "calm"}
              label={L("À réconcilier", "To reconcile")}
              value={pulse.money.reconcile.count}
              testid="pulse-reconcile"
              to="reconciliation"
              hint={pulse.money.reconcile.count
                ? <>{Object.entries(pulse.money.reconcile.by_provider)
                      .map(([k, v]) => `${v} ${k}`).join(" · ")}
                   {" — "}<strong className="text-error">{L("reçu, non attribué", "received, unmatched")}</strong></>
                : L("aucun écart à vérifier", "nothing to check")}
            />
            <ActionCard
              tone="warn"
              label={L("Versements affiliés prêts", "Affiliate payouts ready")}
              value={affiliate ? `${(affiliate.alerts?.payouts_ready_amount ?? 0).toFixed(2)} $` : "—"}
              testid="pulse-payouts"
              to="payouts"
              hint={affiliate
                ? `${affiliate.alerts?.payouts_ready ?? 0} ${L("affiliés · exécution + 2FA", "affiliates · execute + 2FA")}`
                : L("chargement…", "loading…")}
            />
          </div>

          <SectionLabel>{L("OPÉRATIONS DU JOUR", "TODAY'S OPERATIONS")}</SectionLabel>
          {/* Cinq cartes et non quatre : les billets d'affiliés y figurent
              parce qu'un billet non relevé est pire qu'un courriel oublié —
              l'affilié le voit « ouvert » et attend. La grille passe donc en
              cinq colonnes sur grand écran. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-8">
            <ActionCard tone={pulse.ops.to_ship ? "warn" : "calm"}
              label={L("À expédier", "To ship")} value={pulse.ops.to_ship}
              testid="pulse-ship" to="dispatch"
              hint={pulse.ops.to_ship ? L("commandes payées", "paid orders") : L("rien en attente", "nothing pending")} />
            <ActionCard tone={pulse.ops.low_stock ? "urgent" : "calm"}
              label={L("Rupture / stock bas", "Out of / low stock")} value={pulse.ops.low_stock}
              testid="pulse-stock" to="products"
              hint={pulse.ops.low_stock_top?.[0]
                ? `${pulse.ops.low_stock_top[0].product_name} · ${pulse.ops.low_stock_top[0].variant_name}`
                : L("toutes au-dessus du seuil", "all above threshold")} />
            <ActionCard tone={pulse.ops.emails_failed ? "warn" : "calm"}
              label={L("Courriels non délivrés", "Undelivered emails")} value={pulse.ops.emails_failed}
              testid="pulse-emails" to="emails/outbox"
              hint={pulse.ops.emails_failed
                ? L("après 5 tentatives", "after 5 attempts")
                : L("tout est parti", "all delivered")} />
            <ActionCard tone={pulse.ops.late_payments ? "urgent" : "calm"}
              label={L("Paiements tardifs", "Late payments")} value={pulse.ops.late_payments}
              testid="pulse-late" to="orders"
              hint={pulse.ops.late_payments
                ? L("commandes à rouvrir", "orders to reopen")
                : L("rien à rouvrir", "nothing to reopen")} />
            <ActionCard tone={pulse.ops.tickets_open ? "warn" : "calm"}
              label={L("Billets affiliés", "Affiliate tickets")} value={pulse.ops.tickets_open ?? 0}
              testid="pulse-tickets" to="tickets"
              hint={pulse.ops.tickets_open
                ? L("attendent une réponse", "awaiting a reply")
                : L("aucun en attente", "none pending")} />
          </div>
        </>
      )}

      {/* Alerte seuil de taxe (30k CAD sur 12 mois glissants) */}
      {enhanced?.tax_threshold && enhanced.tax_threshold.level !== "ok" && (
        <div className={`mb-6 rounded-xl border p-4 flex items-start gap-3 ${
          enhanced.tax_threshold.level === "exceeded"
            ? "border-error/40 bg-error/5" : "border-warning/40 bg-warning/5"}`} data-testid="tax-alert">
          <AlertTriangle size={18} className={enhanced.tax_threshold.level === "exceeded" ? "text-error mt-0.5" : "text-warning mt-0.5"} />
          <div>
            <p className="font-medium text-sm text-nordfjord">
              {enhanced.tax_threshold.level === "exceeded"
                ? L("Seuil de taxe dépassé", "Tax threshold exceeded")
                : L("Vous approchez du seuil de taxe", "Approaching tax threshold")}
            </p>
            <p className="text-sm text-glacier mt-0.5">
              {L("CA sur 12 mois glissants : ", "Rolling 12-month revenue: ")}
              <strong>{enhanced.tax_threshold.rolling_12mo_revenue.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")} $</strong> / {enhanced.tax_threshold.threshold.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")} $.
              {enhanced.tax_threshold.level === "exceeded"
                ? L(" Vous devez vous inscrire à la TPS/TVQ et percevoir les taxes. Consultez votre comptable.",
                    " You must register for GST/QST and collect taxes. Consult your accountant.")
                : L(` Il reste ${enhanced.tax_threshold.remaining.toLocaleString("fr-CA")} $ avant le seuil de 30 000 $. Préparez l'inscription TPS/TVQ.`,
                    ` ${enhanced.tax_threshold.remaining.toLocaleString("en-CA")} $ remaining before the $30,000 threshold. Prepare your GST/QST registration.`)}
            </p>
          </div>
        </div>
      )}

      {/* Sélecteur de période — pilote maintenant les tuiles ET le graphique.
          Au-delà de 3 mois le backend agrège (semaine, puis mois) : 365 barres
          de deux pixels montrent une texture, pas une tendance. */}
      <SectionLabel>{L("PERFORMANCE", "PERFORMANCE")}</SectionLabel>
      <div className="flex items-center gap-2 mb-6 flex-wrap" role="group" aria-label={L("Période", "Period")}>
        {[[7, L("7 jours", "7 days")], [30, L("30 jours", "30 days")], [90, L("3 mois", "3 months")],
          [180, L("6 mois", "6 months")], [365, L("1 an", "1 year")]].map(([p, label]) => (
          <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
              period === p ? "bg-nordfjord text-white" : "border border-ash text-glacier hover:bg-clinical"}`}
            data-testid={`period-${p}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Métriques de pilotage (période sélectionnée, avec comparaison) */}
      {enhanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="enhanced-metrics">
          <DeltaCard label={L(`Revenu ${period}j`, `Revenue ${period}d`)} value={`${enhanced.current.revenue.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")} $`}
            delta={enhanced.changes.revenue} icon={DollarSign} lang={lang} />
          <DeltaCard label={L("Panier moyen", "Avg. order value")} value={`${enhanced.current.aov.toFixed(2)} $`}
            delta={enhanced.changes.aov} icon={TrendingUp} lang={lang} />
          <MetricCard label={L("Taux de conversion", "Conversion rate")}
            value={enhanced.conversion.conversion_rate != null ? `${enhanced.conversion.conversion_rate}%` : "—"}
            sub={L(`${enhanced.conversion.orders_paid}/${enhanced.conversion.orders_created} · ${enhanced.conversion.orders_abandoned} abandon.`,
                   `${enhanced.conversion.orders_paid}/${enhanced.conversion.orders_created} · ${enhanced.conversion.orders_abandoned} abandoned`)}
            icon={Percent} />
          <MetricCard label={L("Clients", "Customers")}
            value={`${enhanced.customers.new} + ${enhanced.customers.returning}`}
            sub={L(`nouveaux + fidèles (${enhanced.customers.total_active} actifs)`,
                   `new + returning (${enhanced.customers.total_active} active)`)}
            icon={Repeat} />
        </div>
      )}

      {/* Totaux historiques : consultables, mais ils ne declenchent aucune
          decision quotidienne. Ils occupaient quatre tuiles pleine taille au
          meme poids visuel que les indicateurs de pilotage — l'oeil ne savait
          plus ou se poser. Une ligne suffit. */}
      {stats && (
        <div className="bg-white border border-ash rounded-md px-5 py-3 mb-8 flex flex-wrap gap-x-8 gap-y-1.5"
             data-testid="reference-totals">
          <span className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier self-center">
            {L("DEPUIS L'OUVERTURE", "ALL TIME")}
          </span>
          {[
            [L("Revenu", "Revenue"), `${stats.revenue_cad.toFixed(2)} $`],
            [L("Commandes", "Orders"), stats.total_orders],
            [L("Clients", "Customers"), stats.customers],
            [L("Produits actifs", "Active products"), stats.products],
          ].map(([k, v]) => (
            <span key={k} className="text-[13px] text-glacier">
              {k} <b className="text-nordfjord font-semibold tabular-nums">{v}</b>
            </span>
          ))}
        </div>
      )}

      {/* Le graphique prend toute la largeur, les trois panneaux forment une
          rangée en dessous. En deux colonnes, la droite (stock + circuits +
          top produits empilés) descendait bien plus bas que le graphique :
          soit ce dernier s'étirait avec du vide à l'intérieur, soit — avec
          items-start — le vide passait dans la grille. Le problème n'était pas
          la hauteur mais le déséquilibre des colonnes. */}
      {/* Appariement par HAUTEUR REELLE plutot que par importance : le
          graphique (~320px) et le top produits (~350px) se ressemblent, le
          stock faible (~125px) et les circuits (~210px) aussi. Les mettre en
          face de leur semblable supprime le vide sans rien etirer. */}
      <div className="grid lg:grid-cols-3 gap-4 mb-4 items-start">
        <div className="lg:col-span-2 bg-white border border-ash p-6 rounded-md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">
                {/* Le pas de temps est annoncé : sans lui, on ne sait pas si
                    une barre vaut un jour, une semaine ou un mois. */}
                // {period === 365 ? L("12 DERNIERS MOIS", "LAST 12 MONTHS")
                   : period === 180 ? L("6 DERNIERS MOIS", "LAST 6 MONTHS")
                   : L(`${period} DERNIERS JOURS`, `LAST ${period} DAYS`)}
                {analytics?.granularity && (
                  <span className="text-nova">
                    {" · "}
                    {analytics.granularity === "month" ? L("MENSUEL", "MONTHLY")
                      : analytics.granularity === "week" ? L("HEBDOMADAIRE", "WEEKLY")
                      : L("QUOTIDIEN", "DAILY")}
                  </span>
                )}
              </div>
              <h2 className="font-display text-xl font-bold tracking-tight mt-1 text-nordfjord">{L("Revenu", "Revenue")}</h2>
            </div>
            <TrendingUp size={18} strokeWidth={1.5} className="text-nova" />
          </div>
          {/* h-full sur l'enveloppe de chaque barre : sans hauteur DEFINIE sur
              le parent, le height:X% de la barre se resout contre « auto » —
              c'est-a-dire contre son propre contenu — et le navigateur calcule
              zero. Les barres mesuraient 0 pixel quelles que soient les ventes,
              d'ou un graphique vide en permanence. */}
          <div className="h-56 flex items-end gap-1 border-b border-ash" data-testid="chart-revenue">
            {(analytics?.daily_revenue || []).map((d) => (
              <div key={d.date} className="flex-1 h-full flex flex-col justify-end items-center group">
                <div
                  className="w-full bg-nordfjord group-hover:bg-nova transition-colors relative rounded-t-sm"
                  style={{ height: `${Math.max(3, (d.revenue / dailyMax) * 100)}%` }}
                  title={`${d.date} · ${d.revenue.toFixed(2)} $ · ${d.orders} ${L("commande(s)", "order(s)")}`}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 font-data text-[10px] bg-nordfjord text-white px-2 py-1 whitespace-nowrap pointer-events-none transition-opacity rounded z-10">
                    {d.revenue.toFixed(0)} $ · {d.orders}
                  </div>
                </div>
              </div>
            ))}
            {!analytics?.daily_revenue?.length && (
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
                    {L("Aucune commande payée sur la période",
                       "No paid orders in this period")}
                  </p>
                )}
              </div>
            )}
          </div>
          {/* Reperes de lecture : sans eux, des barres sans echelle ni dates
              ne disent rien — on voit une forme, pas une information. */}
          {analytics?.daily_revenue?.length > 0 && (
            <div className="flex items-center justify-between mt-2 font-data text-[10px] text-glacier tabular-nums">
              <span>{analytics.daily_revenue[0].date}</span>
              <span className="text-nordfjord">
                {L("max", "peak")} {dailyMax.toFixed(0)} $
                <span className="text-glacier">
                  {" · "}
                  {analytics.daily_revenue.reduce((s, d) => s + d.orders, 0)} {L("commandes", "orders")}
                </span>
              </span>
              <span>{analytics.daily_revenue[analytics.daily_revenue.length - 1].date}</span>
            </div>
          )}
        </div>

        <div className="bg-white border border-ash p-6 rounded-md">
          <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">// {L("MEILLEURES VENTES", "BEST SELLERS")}</div>
          <h2 className="font-display text-xl font-bold tracking-tight mt-1 mb-4 text-nordfjord">{L("Top produits", "Top Products")}</h2>
          <ul className="divide-y divide-ash/60" data-testid="top-products">
            {(analytics?.top_products || []).slice(0, 6).map((p, idx) => (
              // La cle inclut la variante : deux dosages du meme compose sont
              // deux lignes distinctes, et p.slug seul les ferait entrer en
              // collision (React n'en afficherait qu'une).
              <li key={`${p.slug}-${p.variant_name || "root"}`} className="py-2.5 flex items-center gap-3">
                <span className="font-data text-[10px] text-glacier w-5">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate text-nordfjord">
                    {lang === "fr" ? (p.name_fr || p.name_en) : (p.name_en || p.name_fr)}
                    {p.variant_name && (
                      <span className="font-data text-[11px] text-nova font-semibold"> · {p.variant_name}</span>
                    )}
                  </div>
                  <div className="font-data text-[10px] text-glacier">{p.units_sold} {L("unités", "units")}</div>
                </div>
                <div className="font-bold tabular-nums text-nordfjord whitespace-nowrap">{p.revenue.toFixed(2)} $</div>
              </li>
            ))}
            {!analytics?.top_products?.length && (
              <li className="py-4 font-data text-xs text-glacier text-center">{L("Aucune vente pour l'instant", "No sales yet")}</li>
            )}
          </ul>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-8 items-start">
        <LowStockCard />

        {/* Circuits de paiement : une colonne par ÉTAT, pas seulement
            l'encaissé. Un circuit peut beaucoup encaisser tout en accumulant
            des paiements bloqués — c'est ce qu'un simple partage cachait. */}
        {pulse?.rails && (
          <div className="bg-white border border-ash p-6 rounded-md" data-testid="payment-rails">
            <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">// {L("CIRCUITS DE PAIEMENT", "PAYMENT RAILS")}</div>
            <h2 className="font-display text-xl font-bold tracking-tight mt-1 mb-4 text-nordfjord">{L("Où en est l'argent", "Where the money is")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="font-data text-[9px] uppercase tracking-[0.14em] text-glacier border-b border-ash">
                    <th className="text-left py-2 font-medium"> </th>
                    <th className="text-right py-2 font-medium">{L("Encaissé", "Collected")}</th>
                    <th className="text-right py-2 font-medium">{L("En attente", "Pending")}</th>
                    <th className="text-right py-2 font-medium">{L("À récon.", "To recon.")}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {[["interac", "Interac", "#0B2E4F"], ["crypto", L("Crypto", "Crypto"), "#7C5CD6"]].map(([key, label, color]) => {
                    const r = pulse.rails[key] || {};
                    return (
                      <tr key={key} className="border-b border-ash/60" data-testid={`rail-${key}`}>
                        <th scope="row" className="text-left py-2.5 font-semibold text-nordfjord whitespace-nowrap">
                          <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: color }} />
                          {label}
                        </th>
                        <td className="text-right py-2.5 font-data font-bold text-nordfjord">
                          {(r.paid_amount ?? 0).toFixed(0)} $
                          <span className="block font-normal text-[10px] text-glacier">
                            {r.paid_count ?? 0} {L("cmd", "ord")}
                          </span>
                        </td>
                        <td className="text-right py-2.5 font-data font-bold text-warning">
                          {(r.pending_amount ?? 0).toFixed(0)} $
                          <span className="block font-normal text-[10px] text-glacier">
                            {r.pending_count ?? 0} {L("cmd", "ord")}
                          </span>
                        </td>
                        <td className={`text-right py-2.5 font-data font-bold ${r.reconcile_count ? "text-error" : "text-glacier"}`}>
                          {r.reconcile_count ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Recent orders */}
      <div className="bg-white border border-ash rounded-md">
        <div className="flex items-center justify-between p-6 border-b border-ash">
          <div>
            <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">// {L("RÉCENT", "RECENT")}</div>
            <h2 className="font-display text-xl font-bold tracking-tight mt-1 text-nordfjord">{L("Dernières commandes", "Latest Orders")}</h2>
          </div>
          <Link to="orders" className="font-data text-xs uppercase tracking-[0.2em] flex items-center gap-1 text-nova hover:text-nordfjord">
            {L("Voir tout", "View all")} <ArrowUpRight size={14} />
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
            {(analytics?.recent_orders || []).slice(0, 8).map((o) => (
              <tr key={o.id} className="border-t border-ash/40 hover:bg-clinical/60">
                <td className="px-6 py-3">
                  {/* Lien relatif : `/admin/...` en absolu tombe sur l'alias de
                      compatibilité qui redirige vers la racine du portail en
                      perdant le sous-chemin, donc le clic ne menait nulle part. */}
                  <Link to={`orders/${o.id}`} className="font-data font-bold text-xs text-nova hover:text-nordfjord">{o.order_number}</Link>
                  <div className="font-data text-[10px] text-glacier">{(o.created_at || "").slice(0, 16).replace("T", " ")}</div>
                </td>
                <td className="px-6 py-3">
                  <div className="text-sm text-nordfjord">{o.shipping_address?.full_name || o.email || "—"}</div>
                  <div className="font-data text-[10px] text-glacier">{o.email}</div>
                </td>
                <td className="px-6 py-3"><StatusBadge status={o.payment_status} lang={lang} /></td>
                <td className="px-6 py-3"><StatusBadge status={o.fulfillment_status} lang={lang} /></td>
                <td className="px-6 py-3 text-right font-bold tabular-nums text-nordfjord">{o.total?.toFixed(2)} $</td>
              </tr>
            ))}
            {!analytics?.recent_orders?.length && (
              <tr><td colSpan={5} className="px-6 py-8 text-center font-data text-xs text-glacier">{L("Aucune commande pour l'instant", "No orders yet")}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// Intitulé de section : structure la page en zones lisibles plutôt qu'en
// une suite de tuiles de poids égal, où l'œil ne sait pas où se poser.
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier whitespace-nowrap">
        {children}
      </span>
      <span className="flex-1 h-px bg-ash" />
    </div>
  );
}

// Carte d'action : un compteur qui appelle une décision, pas une statistique.
// Le liseré coloré à gauche encode l'urgence sans dépendre de la seule
// couleur du chiffre — lisible aussi pour qui distingue mal les teintes.
const ACTION_TONES = {
  urgent: "border-l-error",
  warn: "border-l-warning",
  calm: "border-l-success",
};

function ActionCard({ tone = "calm", label, value, hint, to, testid }) {
  const body = (
    <>
      <div className="font-data text-[10px] uppercase tracking-[0.16em] text-glacier">{label}</div>
      <div className="font-display text-[26px] font-bold tabular-nums text-nordfjord mt-1 leading-none whitespace-nowrap">
        {value}
      </div>
      <div className="text-[12px] text-glacier mt-0.5 leading-snug">{hint}</div>
    </>
  );
  const cls = `bg-white border border-ash border-l-[3px] ${ACTION_TONES[tone]} p-4 rounded-md block`;
  return to ? (
    <Link to={to} data-testid={testid} className={`${cls} hover:border-nova transition-colors`}>
      {body}
    </Link>
  ) : (
    <div data-testid={testid} className={cls}>{body}</div>
  );
}

function DeltaCard({ label, value, delta, icon: Icon, lang }) {
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const up = delta != null && delta >= 0;
  const DeltaIcon = up ? TrendingUp : TrendingDown;
  return (
    <div className="bg-white border border-ash p-6 rounded-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">{label}</div>
          {/* whitespace-nowrap : « 1 310,73 $ » se coupait, laissant le « $ »
              seul sur une deuxième ligne. Et 26px plutôt que text-3xl (30px) :
              quatre cartes sur une rangée n'ont pas la largeur pour ça. */}
          <div className="font-display text-[26px] leading-none font-bold mt-2 tabular-nums text-nordfjord whitespace-nowrap">{value}</div>
          {delta != null ? (
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${up ? "text-success" : "text-error"}`}>
              <DeltaIcon size={13} /> {up ? "+" : ""}{delta}% <span className="text-glacier font-normal">{L("vs préc.", "vs prev.")}</span>
            </div>
          ) : (
            <div className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mt-1">{L("— vs préc.", "— vs prev.")}</div>
          )}
        </div>
        {Icon && <div className="w-9 h-9 shrink-0 ml-3 flex items-center justify-center text-white bg-nordfjord rounded-md"><Icon size={18} strokeWidth={1.6} /></div>}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon }) {
  return (
    <div className="bg-white border border-ash p-6 rounded-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">{label}</div>
          {/* whitespace-nowrap : « 1 310,73 $ » se coupait, laissant le « $ »
              seul sur une deuxième ligne. Et 26px plutôt que text-3xl (30px) :
              quatre cartes sur une rangée n'ont pas la largeur pour ça. */}
          <div className="font-display text-[26px] leading-none font-bold mt-2 tabular-nums text-nordfjord whitespace-nowrap">{value}</div>
          <div className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mt-1">{sub}</div>
        </div>
        {Icon && <div className="w-9 h-9 shrink-0 ml-3 flex items-center justify-center text-white bg-nordfjord rounded-md"><Icon size={18} strokeWidth={1.6} /></div>}
      </div>
    </div>
  );
}
