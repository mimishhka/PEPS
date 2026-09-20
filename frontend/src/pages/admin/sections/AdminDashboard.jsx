import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";
import { useLang } from "../../../contexts/LanguageContext";
import { DashboardSkeleton } from "../../../components/LoadingSkeletons";
import { LowStockCard } from "./dashboard/LowStockCard";
import { Entonnoir } from "./dashboard/Entonnoir";
import { Affluence, Aire, Proportion } from "./dashboard/Graphes";

// ---------------------------------------------------------------------------
// Parti pris, après trois versions rejetées — et il tient en trois règles.
//
// 1. UN SEUL CHIFFRE règne (Plausible, Mercury). Le revenu de la période
//    occupe le haut de page ; tout le reste est secondaire, ou replié.
// 2. Presque MONOCHROME (Vercel). La couleur signifie — rouge : ça urge,
//    ambre : ça attend — elle ne décore jamais. Pas de pastilles partout, pas
//    de médaillons d'icônes, pas d'emoji.
// 3. La hiérarchie passe par la TAILLE et l'ESPACE, pas par des boîtes. Des
//    filets d'un pixel remplacent les cartes flottantes.
//
// Ce qui est replié l'est délibérément : meilleures ventes, entonnoir,
// affluence et circuits ne se consultent pas chaque matin. Les sortir du
// premier écran est le seul moyen de rendre lisible ce qui, lui, se décide
// tous les jours.
// ---------------------------------------------------------------------------

const PERIODES = [7, 30, 90, 180, 365];

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
  // Densité du tableau, mémorisée. Recommandation constante de la littérature
  // sur les tableaux denses : offrir le choix, et s'en souvenir.
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem("fironova_densite") === "compacte"; } catch { return false; }
  });
  const basculerDensite = () => {
    setCompact((avant) => {
      const apres = !avant;
      try { localStorage.setItem("fironova_densite", apres ? "compacte" : "confortable"); }
      catch { /* navigation privée : la densité ne sera pas retenue */ }
      return apres;
    });
  };
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
  // Une seule liste, triée par urgence : l'ordre de la page est l'ordre dans
  // lequel on traite sa journée. Un compteur à zéro n'entre pas.
  const actions = useMemo(() => {
    if (!pulse) return [];
    const r = pulse.ops?.refunds || {};
    const p = pulse.money?.pending_payment || {};
    return [
      { cle: "refunds-send", urgent: true, vers: "refunds", n: r.to_send || 0,
        titre: L("remboursements à envoyer", "refunds to send"),
        note: r.to_send ? `${argent(r.to_send_amount)} · ${L("le client attend", "the customer waits")}` : "" },
      { cle: "reconcile", urgent: true, vers: "reconciliation", n: pulse.money?.reconcile?.count || 0,
        titre: L("paiements à réconcilier", "payments to reconcile"),
        note: L("reçus, non attribués", "received, unmatched") },
      { cle: "late", urgent: true, vers: "orders", n: pulse.ops?.late_payments || 0,
        titre: L("paiements tardifs", "late payments"),
        note: L("commandes à rouvrir", "orders to reopen") },
      { cle: "ship", urgent: false, vers: "dispatch", n: pulse.ops?.to_ship || 0,
        titre: L("commandes à expédier", "orders to ship"),
        note: L("payées, pas encore parties", "paid, not shipped") },
      { cle: "refunds-review", urgent: false, vers: "refunds", n: r.to_review || 0,
        titre: L("remboursements à examiner", "refunds to review"),
        note: L("en attente d'une décision", "awaiting a decision") },
      { cle: "stock", urgent: false, vers: "products", n: pulse.ops?.low_stock || 0,
        titre: L("variantes en rupture ou basses", "variants out of or low on stock"),
        note: pulse.ops?.low_stock_top?.[0]
          ? `${pulse.ops.low_stock_top[0].product_name} · ${pulse.ops.low_stock_top[0].variant_name}`
          : L("à réapprovisionner", "to restock") },
      { cle: "tickets", urgent: false, vers: "tickets", n: pulse.ops?.tickets_open || 0,
        titre: L("billets d'affiliés ouverts", "open affiliate tickets"),
        note: L("l'affilié voit « ouvert » et attend", "the affiliate sees “open” and waits") },
      { cle: "payouts", urgent: false, vers: "payouts", n: affiliate?.alerts?.payouts_ready || 0,
        titre: L("versements affiliés prêts", "affiliate payouts ready"),
        note: `${argent(affiliate?.alerts?.payouts_ready_amount)} · ${L("exécution + 2FA", "execute + 2FA")}` },
      { cle: "emails", urgent: false, vers: "emails/outbox", n: pulse.ops?.emails_failed || 0,
        titre: L("courriels non délivrés", "undelivered emails"),
        note: L("après 5 tentatives", "after 5 attempts") },
      { cle: "pending", urgent: false, vers: "orders", n: p.count || 0,
        titre: L("commandes en attente de paiement", "orders awaiting payment"),
        note: p.expiring_soon
          ? `${argent(p.amount)} · ${L(`${p.expiring_soon} expirent sous 3 h`, `${p.expiring_soon} expiring within 3 h`)}`
          : `${argent(p.amount)} · ${p.by_method?.interac || 0} Interac · ${p.by_method?.crypto || 0} crypto` },
    ].filter((l) => l.n > 0);
  }, [pulse, affiliate, lang]);          // eslint-disable-line react-hooks/exhaustive-deps

  const serie = analytics?.daily_revenue || [];
  const revenuPeriode = serie.reduce((s, d) => s + d.revenue, 0);
  const commandesPeriode = serie.reduce((s, d) => s + d.orders, 0);
  const fidelePeriode = serie.reduce((s, d) => s + (d.returning_revenue || 0), 0);
  const libellePeriode = period === 365 ? L("12 derniers mois", "last 12 months")
    : period === 180 ? L("6 derniers mois", "last 6 months")
    : L(`${period} derniers jours`, `last ${period} days`);
  const delta = enhanced?.changes?.revenue;
  const rails = pulse?.rails || {};
  const cellule = compact ? "px-4 py-1.5" : "px-4 py-3";

  if (initialLoading) return <DashboardSkeleton />;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1240px] mx-auto" data-testid="admin-dashboard">

      {/* ================== LE CHIFFRE ================== */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[13px] text-glacier">
            {L("Revenu encaissé", "Collected revenue")} · {libellePeriode}
          </p>
          <p className="font-display text-[clamp(2.75rem,7vw,4.5rem)] font-semibold tracking-[-0.045em]
                        leading-[0.95] mt-2 tabular-nums" data-testid="kpi-revenue">
            {argent(revenuPeriode)}
          </p>
          <p className="font-data text-[12px] mt-3 text-glacier" data-testid="kpi-revenue-delta">
            {delta != null && (
              <span className={delta >= 0 ? "text-success" : "text-error"}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} %{" "}
              </span>
            )}
            {L(`vs les ${period} jours précédents`, `vs prior ${period} days`)}
            {" · "}{commandesPeriode} {L("commandes", "orders")}
          </p>
        </div>

        <div className="flex border border-ash" role="group" aria-label={L("Période", "Period")}>
          {PERIODES.map((p) => (
            <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p}
              data-testid={`period-${p}`}
              className={`font-data text-[11px] px-3 py-2 border-r border-ash last:border-r-0 transition-colors ${
                period === p ? "bg-nordfjord text-white" : "text-glacier hover:bg-clinical"}`}>
              {p === 365 ? L("1 an", "1 y") : p === 180 ? L("6 mois", "6 mo")
                : p === 90 ? L("3 mois", "3 mo") : L(`${p} j`, `${p} d`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8" data-testid="chart-revenue">
        {serie.length > 0 ? (
          <>
            <Aire serie={serie} argent={argent} L={L} />
            {/* Les mêmes données en tableau, pour qui ne lit pas une courbe :
                lecteur d'écran, impression, daltonisme. */}
            <table className="sr-only" data-testid="chart-revenue-table">
              <caption>{L("Revenu encaissé par période", "Collected revenue per period")}</caption>
              <tbody>
                {serie.map((d) => (
                  <tr key={d.date}><th scope="row">{d.date}</th>
                    <td>{argent(d.revenue)}</td><td>{d.orders}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="h-40 flex flex-col items-center justify-center text-center border-y border-ash/40">
            {analyticsError ? (
              <>
                <p className="text-sm text-error" data-testid="chart-revenue-error">
                  {L("Impossible de charger les revenus.", "Could not load revenue data.")}
                </p>
                <p className="text-xs text-glacier mt-1">
                  {L("Les autres chiffres de cette page peuvent être incomplets.",
                     "Other figures on this page may be incomplete.")}
                </p>
              </>
            ) : (
              <p className="text-sm text-glacier" data-testid="chart-revenue-empty">
                {L("Aucune commande payée sur la période", "No paid orders in this period")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Trois chiffres secondaires, séparés par des filets — pas par des
          cartes : ce sont des compléments, ils ne doivent pas peser autant
          que le chiffre du haut. */}
      {enhanced && (
        <div className="grid grid-cols-3 border-t border-ash/60 mt-8" data-testid="enhanced-metrics">
          {[
            { id: "kpi-aov", l: L("Panier moyen", "Average order value"),
              v: argent(enhanced.current.aov), d: enhanced.changes.aov,
              s: L("par commande payée", "per paid order") },
            { id: "kpi-conversion", l: L("Conversion", "Conversion"),
              v: enhanced.conversion.conversion_rate != null ? `${enhanced.conversion.conversion_rate} %` : "—",
              s: L(`${enhanced.conversion.orders_paid} payées / ${enhanced.conversion.orders_created} créées`,
                   `${enhanced.conversion.orders_paid} paid / ${enhanced.conversion.orders_created} created`) },
            { id: "kpi-customers", l: L("Clients", "Customers"),
              v: `${enhanced.customers.new + enhanced.customers.returning}`,
              s: L(`${enhanced.customers.new} nouveaux · ${enhanced.customers.returning} fidèles`,
                   `${enhanced.customers.new} new · ${enhanced.customers.returning} returning`) },
          ].map((c) => (
            <div key={c.id} data-testid={c.id}
                 className="py-5 pr-6 border-r border-ash/60 last:border-r-0 last:pr-0">
              <p className="text-[12px] text-glacier">{c.l}</p>
              <p className="font-display text-[26px] font-semibold tracking-[-0.03em] mt-1.5 tabular-nums">
                {c.v}
              </p>
              <p className="font-data text-[11px] text-glacier mt-1.5">
                {c.d != null && (
                  <span className={c.d >= 0 ? "text-success" : "text-error"}>
                    {c.d >= 0 ? "+" : ""}{c.d} % ·{" "}
                  </span>
                )}
                {c.s}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Alerte seuil de taxe (30 000 $ CA sur 12 mois glissants) */}
      {enhanced?.tax_threshold && enhanced.tax_threshold.level !== "ok"
        && dismissedTaxLevel !== enhanced.tax_threshold.level && (
        <div className={`mt-8 border-l-2 pl-4 py-3 ${
          enhanced.tax_threshold.level === "exceeded" ? "border-error" : "border-warning"}`}
             data-testid="tax-alert">
          <div className="flex items-start gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {enhanced.tax_threshold.level === "exceeded"
                  ? L("Seuil de taxe dépassé", "Tax threshold exceeded")
                  : L("Vous approchez du seuil de taxe", "Approaching tax threshold")}
              </p>
              <p className="text-[13px] text-glacier mt-1">
                {L("CA sur 12 mois glissants : ", "Rolling 12-month revenue: ")}
                <span className="font-data tabular-nums text-nordfjord">
                  {enhanced.tax_threshold.rolling_12mo_revenue.toLocaleString(locale)} $
                </span>
                {" / "}{enhanced.tax_threshold.threshold.toLocaleString(locale)} $.
                {enhanced.tax_threshold.level === "exceeded"
                  ? L(" Inscription TPS/TVQ requise. Consultez votre comptable.",
                      " GST/QST registration required. Consult your accountant.")
                  : L(` Il reste ${enhanced.tax_threshold.remaining.toLocaleString("fr-CA")} $.`,
                      ` ${enhanced.tax_threshold.remaining.toLocaleString("en-CA")} $ remaining.`)}
              </p>
            </div>
            <button onClick={dismissTaxAlert} aria-label={L("Fermer", "Dismiss")}
              data-testid="tax-alert-dismiss"
              className="ml-auto text-glacier hover:text-nordfjord text-lg leading-none shrink-0">×</button>
          </div>
        </div>
      )}

      {/* ================== À TRAITER ================== */}
      <section className="mt-10">
        <Intitule compte={actions.length}>{L("À traiter", "To handle")}</Intitule>
        {actions.length ? (
          <div className="border-t border-ash/60" data-testid="dashboard-actions">
            {actions.map((a) => (
              <Link key={a.cle} to={a.vers} data-testid={`action-${a.cle}`}
                className="group flex items-center gap-4 py-3.5 border-b border-ash/40
                           hover:bg-clinical/60 transition-colors">
                <span className={`w-[3px] h-7 shrink-0 ${a.urgent ? "bg-error" : "bg-warning"}`}
                      aria-hidden="true" />
                <span className="font-display text-[19px] font-semibold tabular-nums min-w-[2.5rem]">
                  {a.n}
                </span>
                <span className="text-[15px] min-w-0 truncate">{a.titre}</span>
                <span className="ml-auto font-data text-[11px] text-glacier truncate max-w-[45%] text-right">
                  {a.note}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="border-t border-ash/60 py-5 text-[14px] text-glacier" data-testid="dashboard-calm">
            {L("Rien à traiter. Commandes expédiées, paiements réconciliés, stock au-dessus des seuils.",
               "Nothing to handle. Orders shipped, payments reconciled, stock above thresholds.")}
          </p>
        )}
      </section>

      {/* ================== DERNIÈRES COMMANDES ================== */}
      <section className="mt-10">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">
            {L("Dernières commandes", "Latest orders")}
          </h2>
          <span className="flex-1 h-px bg-ash/60" />
          <button onClick={basculerDensite} data-testid="densite"
            className="font-data text-[10px] uppercase tracking-[0.12em] text-glacier
                       hover:text-nordfjord border border-ash px-2 py-1">
            {compact ? L("Densité : compacte", "Density: compact")
                     : L("Densité : confortable", "Density: comfortable")}
          </button>
          <Link to="orders" className="font-data text-[10px] uppercase tracking-[0.12em] text-nova
                                       hover:text-nordfjord">
            {L("Voir tout", "View all")} →
          </Link>
        </div>

        {/* Le tableau défile DANS sa boîte. Sans cela, sur un écran étroit,
            ses six colonnes poussaient la page entière vers la droite : tout
            le tableau de bord se décalait, et une barre horizontale
            apparaissait sous la fenêtre. */}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-[13px]" data-testid="recent-orders-table">
          <thead>
            <tr className="font-data text-[10px] uppercase tracking-[0.12em] text-glacier">
              <th className="text-left font-normal px-4 py-2 border-y border-ash/60">{L("Commande", "Order")}</th>
              <th className="text-left font-normal px-4 py-2 border-y border-ash/60">{L("Client", "Customer")}</th>
              <th className="text-left font-normal px-4 py-2 border-y border-ash/60">{L("Paiement", "Payment")}</th>
              <th className="text-left font-normal px-4 py-2 border-y border-ash/60">{L("Traitement", "Fulfillment")}</th>
              <th className="text-right font-normal px-4 py-2 border-y border-ash/60">{L("Total", "Total")}</th>
              <th className="border-y border-ash/60 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {(analytics?.recent_orders || []).map((o) => (
              <tr key={o.id} className="group border-b border-ash/30 hover:bg-clinical/60">
                <td className={cellule}>
                  {/* Lien relatif : `/admin/...` en absolu tombe sur l'alias de
                      compatibilité qui redirige vers la racine du portail en
                      perdant le sous-chemin, donc le clic ne menait nulle part. */}
                  <Link to={`orders/${o.id}`} className="font-data text-[12px] hover:text-nova">
                    {o.order_number}
                  </Link>
                  {!compact && (
                    <div className="font-data text-[10px] text-glacier/70 mt-0.5">
                      {(o.created_at || "").slice(0, 16).replace("T", " ")}
                    </div>
                  )}
                </td>
                <td className={cellule}>
                  <div className="truncate max-w-[16rem]">
                    {o.shipping_address?.full_name || o.email || "—"}
                  </div>
                  {!compact && (
                    <div className="font-data text-[10px] text-glacier/70 truncate max-w-[16rem]">
                      {o.email}
                    </div>
                  )}
                </td>
                <td className={cellule}><StatusBadge status={o.payment_status} lang={lang} /></td>
                <td className={cellule}><StatusBadge status={o.fulfillment_status} lang={lang} /></td>
                <td className={`${cellule} text-right font-data tabular-nums`}>
                  {o.total != null ? argent(o.total) : "—"}
                </td>
                <td className={`${cellule} text-right`}>
                  {/* L'action n'apparaît qu'au survol : une table dense ne doit
                      pas porter un bouton sur chaque ligne en permanence. */}
                  <Link to={`orders/${o.id}`}
                    className="font-data text-[10px] uppercase tracking-[0.1em] text-glacier
                               opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                    {L("ouvrir", "open")}
                  </Link>
                </td>
              </tr>
            ))}
            {!analytics?.recent_orders?.length && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-glacier">
                {L("Aucune commande pour l'instant", "No orders yet")}
              </td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>

      {/* ================== LE RESTE, REPLIÉ ================== */}
      <section className="mt-10">
        <Intitule>{L("Analyse", "Analysis")}</Intitule>

        <Repli titre={L("Meilleures ventes", "Best sellers")} sous={libellePeriode} testid="repli-ventes">
          <ul data-testid="top-products">
            {(analytics?.top_products || []).slice(0, 6).map((p, idx) => (
              // La cle inclut la variante : deux dosages du meme compose sont
              // deux lignes distinctes, et p.slug seul les ferait entrer en
              // collision (React n'en afficherait qu'une).
              <li key={`${p.slug}-${p.variant_name || "root"}`}
                  className="flex items-baseline gap-3 py-2.5 border-b border-ash/40 last:border-0">
                <span className="font-data text-[10px] text-glacier/60 w-4">{idx + 1}</span>
                <span className="text-[14px] truncate">
                  {lang === "fr" ? (p.name_fr || p.name_en) : (p.name_en || p.name_fr)}
                  {p.variant_name && <span className="font-data text-[11px] text-glacier"> · {p.variant_name}</span>}
                </span>
                <span className="font-data text-[11px] text-glacier/70 whitespace-nowrap">
                  {p.units_sold} {L("u", "u")}
                </span>
                <span className="ml-auto font-data tabular-nums">{argent(p.revenue)}</span>
              </li>
            ))}
            {!analytics?.top_products?.length && (
              <li className="py-4 text-[13px] text-glacier">
                {L("Aucune vente sur la période", "No sales in this period")}
              </li>
            )}
          </ul>
        </Repli>

        <Repli titre={L("Où se perdent les commandes", "Where orders drop off")}
               sous={L("Créées → payées → expédiées → livrées", "Created → paid → shipped → delivered")}
               testid="repli-entonnoir">
          {enhanced?.funnel?.length ? <Entonnoir marches={enhanced.funnel} L={L} /> : (
            <p className="py-3 text-[13px] text-glacier" data-testid="funnel-empty">
              {L("Aucune commande sur la période", "No orders in this period")}
            </p>
          )}
        </Repli>

        <Repli titre={L("Quand vos clients commandent", "When your customers order")}
               sous={L("Heure du Québec", "Quebec time")} testid="repli-affluence">
          {analytics?.hourly
            ? <Affluence grille={analytics.hourly} argent={argent} L={L} lang={lang} />
            : null}
          {!analytics?.hourly?.flat?.().some?.((v) => v > 0) && (
            <p className="py-3 text-[13px] text-glacier" data-testid="affluence-vide">
              {L("Aucune commande payée sur la période", "No paid orders in this period")}
            </p>
          )}
        </Repli>

        <Repli titre={L("D'où vient l'argent", "Where the money comes from")}
               sous={L("Circuits et fidélité", "Rails and loyalty")} testid="repli-circuits">
          <Proportion argent={argent} testid="rails-donut" lignes={[
            { cle: "interac", nom: "Interac", valeur: rails.interac?.paid_amount || 0 },
            { cle: "crypto", nom: L("Crypto", "Crypto"), valeur: rails.crypto?.paid_amount || 0 },
          ]} />
          <div className="mt-5">
            <Proportion argent={argent} testid="fidelite" lignes={[
              { cle: "fideles", nom: L("Clients fidèles", "Returning customers"), valeur: fidelePeriode },
              { cle: "nouveaux", nom: L("Nouveaux clients", "New customers"),
                valeur: Math.max(0, revenuPeriode - fidelePeriode) },
            ]} />
          </div>
        </Repli>

        <Repli titre={L("Stock à surveiller", "Stock to watch")}
               sous={L("Sous le seuil ou à zéro", "Below threshold or at zero")} testid="repli-stock">
          <LowStockCard nu />
        </Repli>
      </section>

      {/* Totaux historiques : consultables, jamais décisifs. */}
      {stats && (
        <div className="mt-10 pt-4 border-t border-ash/60 flex flex-wrap gap-x-8 gap-y-2
                        font-data text-[11px] text-glacier" data-testid="reference-totals">
          <span className="uppercase tracking-[0.16em] text-glacier/70">
            {L("Depuis l'ouverture", "All time")}
          </span>
          {[
            [L("Revenu", "Revenue"), argent(stats.revenue_cad)],
            [L("Commandes", "Orders"), stats.total_orders],
            [L("Clients", "Customers"), stats.customers],
            [L("Produits actifs", "Active products"), stats.products],
          ].map(([k, v]) => (
            <span key={k}>{k} <span className="text-nordfjord tabular-nums">{v}</span></span>
          ))}
        </div>
      )}
    </div>
  );
}

// Intitulé de section : un filet et des capitales espacées, la grammaire du
// reste du site. Pas de carte, pas d'icône.
function Intitule({ children, compte }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">{children}</h2>
      {compte > 0 && (
        <span className="font-data text-[11px] text-nordfjord tabular-nums" data-testid="actions-count">
          {compte}
        </span>
      )}
      <span className="flex-1 h-px bg-ash/60" />
    </div>
  );
}

// Un bloc replié. Ce qui ne se décide pas chaque matin ne doit pas occuper le
// premier écran — mais doit rester à un clic.
function Repli({ titre, sous, testid, children }) {
  return (
    <details className="border-b border-ash/60 group" data-testid={testid}>
      <summary className="flex items-baseline gap-3 py-3.5 cursor-pointer list-none
                          marker:content-none hover:text-nova">
        <span className="font-data text-[11px] text-glacier/70 group-open:rotate-90 transition-transform
                         inline-block">›</span>
        <span className="text-[15px]">{titre}</span>
        <span className="font-data text-[11px] text-glacier/70">{sous}</span>
      </summary>
      <div className="pb-6 pl-5">{children}</div>
    </details>
  );
}
