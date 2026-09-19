import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Check, CreditCard, DollarSign, Mail, Package, Percent,
  Plus, RotateCcw, ShoppingCart, Ticket, TrendingDown, TrendingUp, Truck, Wallet,
} from "lucide-react";
import api from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";
import { useLang } from "../../../contexts/LanguageContext";
import { useAuth } from "../../../contexts/AuthContext";
import { DashboardSkeleton } from "../../../components/LoadingSkeletons";
import { LowStockCard } from "./dashboard/LowStockCard";
import { Entonnoir } from "./dashboard/Entonnoir";
import { Affluence, Anneau, BarresEmpilees, BarresMini } from "./dashboard/Graphes";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";

// ---------------------------------------------------------------------------
// Ce que cette page doit répondre en un coup d'œil :
//   1. Qu'est-ce qui demande mon action maintenant ?
//   2. L'argent rentre-t-il, d'où vient-il, et par rapport à avant ?
//   3. Où se perdent les commandes, quand arrivent-elles, que réapprovisionner ?
//
// Mise en page reprise du bloc « dashboard 9 » d'Efferd — salutation et action
// principale, quatre cartes à minigraphe, grande carte de ventes avec son
// sélecteur de période et sa légende, entonnoir, anneau, carte d'affluence —
// mais chaque chiffre vient de VOS données. Les vues produit, les paniers
// abandonnés et les sources de trafic de la maquette n'existent pas ici : rien
// ne les enregistre, et une marche inventée fausserait tout ce qui suit.
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const { lang } = useLang();
  const { user } = useAuth();
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
      { cle: "refunds-send", ton: "urgent", vers: "refunds", icone: RotateCcw,
        n: r.to_send || 0, valeur: argent(r.to_send_amount),
        titre: L("Remboursements à envoyer", "Refunds to send"),
        quoi: L("le client attend son argent", "the customer is waiting") },
      { cle: "reconcile", ton: "urgent", vers: "reconciliation", icone: CreditCard,
        n: pulse.money?.reconcile?.count || 0,
        titre: L("Paiements à réconcilier", "Payments to reconcile"),
        quoi: L("reçus, non attribués", "received, unmatched") },
      { cle: "late", ton: "urgent", vers: "orders", icone: AlertTriangle,
        n: pulse.ops?.late_payments || 0,
        titre: L("Paiements tardifs", "Late payments"),
        quoi: L("commandes à rouvrir", "orders to reopen") },
      { cle: "ship", ton: "warn", vers: "dispatch", icone: Truck,
        n: pulse.ops?.to_ship || 0,
        titre: L("Commandes à expédier", "Orders to ship"),
        quoi: L("payées, pas encore parties", "paid, not shipped") },
      { cle: "refunds-review", ton: "warn", vers: "refunds", icone: RotateCcw,
        n: r.to_review || 0,
        titre: L("Remboursements à examiner", "Refunds to review"),
        quoi: L("en attente d'une décision", "awaiting a decision") },
      { cle: "stock", ton: "warn", vers: "products", icone: Package,
        n: pulse.ops?.low_stock || 0,
        titre: L("Stock bas ou en rupture", "Low or out of stock"),
        quoi: pulse.ops?.low_stock_top?.[0]
          ? `${pulse.ops.low_stock_top[0].product_name} · ${pulse.ops.low_stock_top[0].variant_name}`
          : L("à réapprovisionner", "to restock") },
      { cle: "tickets", ton: "warn", vers: "tickets", icone: Ticket,
        n: pulse.ops?.tickets_open || 0,
        titre: L("Billets d'affiliés ouverts", "Open affiliate tickets"),
        quoi: L("l'affilié voit « ouvert » et attend", "the affiliate sees “open” and waits") },
      { cle: "payouts", ton: "warn", vers: "payouts", icone: Wallet,
        n: affiliate?.alerts?.payouts_ready || 0,
        valeur: argent(affiliate?.alerts?.payouts_ready_amount),
        titre: L("Versements affiliés prêts", "Affiliate payouts ready"),
        quoi: L("exécution + 2FA", "execute + 2FA") },
      { cle: "emails", ton: "warn", vers: "emails/outbox", icone: Mail,
        n: pulse.ops?.emails_failed || 0,
        titre: L("Courriels non délivrés", "Undelivered emails"),
        quoi: L("après 5 tentatives", "after 5 attempts") },
      { cle: "pending", ton: "info", vers: "orders", icone: DollarSign,
        n: p.count || 0, valeur: argent(p.amount),
        titre: L("En attente de paiement", "Awaiting payment"),
        quoi: p.expiring_soon
          ? L(`${p.expiring_soon} expirent sous 3 h`, `${p.expiring_soon} expiring within 3 h`)
          : `${p.by_method?.interac || 0} Interac · ${p.by_method?.crypto || 0} crypto` },
    ].filter((l) => l.n > 0);
  }, [pulse, affiliate, lang]);          // eslint-disable-line react-hooks/exhaustive-deps

  const serie = analytics?.daily_revenue || [];
  const revenuPeriode = serie.reduce((s, d) => s + d.revenue, 0);
  const commandesPeriode = serie.reduce((s, d) => s + d.orders, 0);
  const fidelePeriode = serie.reduce((s, d) => s + (d.returning_revenue || 0), 0);
  const libellePeriode = period === 365 ? L("12 mois", "12 months")
    : period === 180 ? L("6 mois", "6 months")
    : L(`${period} jours`, `${period} days`);
  const vsPrecedent = L(`vs ${libellePeriode} précédents`, `vs prior ${libellePeriode}`);
  const topMax = Math.max(...(analytics?.top_products || []).map((p) => p.revenue), 1);
  const prenom = (user?.name || user?.email || "").split(/[@\s.]/)[0];
  const rails = pulse?.rails || {};

  if (initialLoading) return <DashboardSkeleton />;

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6" data-testid="admin-dashboard">
      {/* Salutation et action principale, comme sur la maquette : la page
          s'ouvre sur une phrase, pas sur une grille de nombres. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.01em] text-nordfjord">
          {prenom
            ? L(`Bonjour ${prenom} 👋`, `Welcome back, ${prenom} 👋`)
            : L("Tableau de bord", "Dashboard")}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 border border-ash rounded-lg p-1 bg-card"
               role="group" aria-label={L("Période", "Period")}>
            {[[7, L("7 j", "7 D")], [30, L("30 j", "30 D")], [90, L("3 mois", "3 M")],
              [180, L("6 mois", "6 M")], [365, L("1 an", "1 Y")]].map(([p, label]) => (
              <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                  period === p ? "bg-nordfjord text-white" : "text-glacier hover:bg-clinical"}`}
                data-testid={`period-${p}`}>
                {label}
              </button>
            ))}
          </div>
          <Link to="products" data-testid="action-nouveau-produit"
            className="inline-flex items-center gap-1.5 bg-nordfjord text-white text-sm font-medium
                       rounded-lg px-3.5 py-2 hover:opacity-90 transition">
            <Plus size={15} /> {L("Nouveau produit", "New product")}
          </Link>
        </div>
      </div>

      {/* Alerte seuil de taxe (30 000 $ CA sur 12 mois glissants) */}
      {enhanced?.tax_threshold && enhanced.tax_threshold.level !== "ok"
        && dismissedTaxLevel !== enhanced.tax_threshold.level && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          enhanced.tax_threshold.level === "exceeded"
            ? "border-error/40 bg-error/5" : "border-warning/40 bg-warning/5"}`} data-testid="tax-alert">
          <AlertTriangle size={18} className={enhanced.tax_threshold.level === "exceeded"
            ? "text-error mt-0.5 shrink-0" : "text-warning mt-0.5 shrink-0"} />
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
                : L(` Il reste ${enhanced.tax_threshold.remaining.toLocaleString("fr-CA")} $ avant le seuil de 30 000 $.`,
                    ` ${enhanced.tax_threshold.remaining.toLocaleString("en-CA")} $ remaining before the $30,000 threshold.`)}
            </p>
          </div>
          <button onClick={dismissTaxAlert} aria-label={L("Fermer", "Dismiss")} data-testid="tax-alert-dismiss"
            className="ml-auto text-glacier hover:text-nordfjord text-lg leading-none">×</button>
        </div>
      )}

      {/* ================== 1. À FAIRE ================== */}
      <section>
        <Titre compte={actions.length}>{L("À faire maintenant", "To do now")}</Titre>
        {actions.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-actions">
            {actions.map((a) => <CarteAction key={a.cle} {...a} />)}
          </div>
        ) : (
          <Card className="border-ash" data-testid="dashboard-calm">
            <CardContent className="flex items-center gap-3 py-5">
              <span className="w-9 h-9 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
                <Check size={17} strokeWidth={2.2} />
              </span>
              <div>
                <p className="text-sm font-semibold text-nordfjord">
                  {L("Rien ne demande d'action.", "Nothing needs action.")}
                </p>
                <p className="text-xs text-glacier mt-0.5">
                  {L("Commandes expédiées, paiements réconciliés, stock au-dessus des seuils.",
                     "Orders shipped, payments reconciled, stock above thresholds.")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ================== 2. LES CHIFFRES ================== */}
      {enhanced && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4" data-testid="enhanced-metrics">
          <Chiffre testid="kpi-revenue" label={L("Revenu encaissé", "Collected revenue")}
            valeur={argent(enhanced.current.revenue)} delta={enhanced.changes.revenue}
            indice={vsPrecedent} icone={DollarSign} L={L}
            serie={serie.map((d) => d.revenue)} />
          <Chiffre testid="kpi-orders" label={L("Commandes payées", "Paid orders")}
            valeur={`${enhanced.current.orders}`} delta={enhanced.changes.orders}
            indice={vsPrecedent} icone={ShoppingCart} L={L}
            serie={serie.map((d) => d.orders)} />
          <Chiffre testid="kpi-aov" label={L("Panier moyen", "Average order value")}
            valeur={argent(enhanced.current.aov)} delta={enhanced.changes.aov}
            indice={vsPrecedent} icone={TrendingUp} L={L}
            serie={serie.map((d) => (d.orders ? d.revenue / d.orders : 0))} />
          <Chiffre testid="kpi-conversion" label={L("Taux de conversion", "Conversion rate")}
            valeur={enhanced.conversion.conversion_rate != null ? `${enhanced.conversion.conversion_rate} %` : "—"}
            indice={L(`${enhanced.conversion.orders_paid} payées sur ${enhanced.conversion.orders_created} créées`,
                      `${enhanced.conversion.orders_paid} paid of ${enhanced.conversion.orders_created} created`)}
            icone={Percent} L={L} />
        </div>
      )}

      {/* ================== 3. LA GRANDE CARTE DE VENTES ================== */}
      <Card className="border-ash">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-3">
          <div>
            <div className="font-display text-[28px] font-bold tabular-nums text-nordfjord leading-none">
              {argent(revenuPeriode)}
            </div>
            <p className="text-xs text-glacier mt-2">
              {L(`Ventes encaissées · ${libellePeriode} · ${commandesPeriode} commandes`,
                 `Collected sales · ${libellePeriode} · ${commandesPeriode} orders`)}
            </p>
            {/* La légende : deux séries, donc elle est obligatoire. */}
            <ul className="flex items-center gap-4 mt-3">
              <li className="flex items-center gap-1.5 text-[11px] text-glacier">
                <span className="w-2.5 h-2.5 rounded-sm bg-nordfjord" aria-hidden="true" />
                {L("Clients fidèles", "Returning customers")}
                <b className="text-nordfjord tabular-nums">{argent(fidelePeriode)}</b>
              </li>
              <li className="flex items-center gap-1.5 text-[11px] text-glacier">
                <span className="w-2.5 h-2.5 rounded-sm bg-nova/45" aria-hidden="true" />
                {L("Nouveaux clients", "New customers")}
                <b className="text-nordfjord tabular-nums">{argent(revenuPeriode - fidelePeriode)}</b>
              </li>
            </ul>
          </div>
          {enhanced && (
            <div className="text-right shrink-0">
              <Pastille delta={enhanced.changes.revenue} />
              <div className="text-[11px] text-glacier mt-1.5">{vsPrecedent}</div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {serie.length > 0 ? (
            <div data-testid="chart-revenue">
              <BarresEmpilees serie={serie} argent={argent} L={L} />
              {/* Les mêmes données en tableau, pour qui ne lit pas des barres :
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
            </div>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center text-center px-4"
                 data-testid="chart-revenue">
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
        </CardContent>
      </Card>

      {/* ================== 4. ENTONNOIR + CIRCUITS ================== */}
      <div className="grid xl:grid-cols-3 gap-4 items-start">
        <Card className="xl:col-span-2 border-ash">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-bold text-nordfjord">
              {L("Où se perdent les commandes", "Where orders drop off")}
            </CardTitle>
            <p className="text-xs text-glacier mt-1">
              {L(`Créées → payées → expédiées → livrées · ${libellePeriode}`,
                 `Created → paid → shipped → delivered · ${libellePeriode}`)}
            </p>
          </CardHeader>
          <CardContent>
            {enhanced?.funnel?.length ? (
              <Entonnoir marches={enhanced.funnel} L={L} />
            ) : (
              <p className="text-sm text-glacier py-6 text-center" data-testid="funnel-empty">
                {L("Aucune commande sur la période", "No orders in this period")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-ash">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-bold text-nordfjord">
              {L("Circuits de paiement", "Payment rails")}
            </CardTitle>
            <p className="text-xs text-glacier mt-1">{L("Encaissé, depuis l'ouverture", "Collected, all time")}</p>
          </CardHeader>
          <CardContent>
            <Anneau argent={argent} testid="rails-donut" parts={[
              { cle: "interac", nom: "Interac", valeur: rails.interac?.paid_amount || 0,
                classe: "stroke-nordfjord", pastille: "bg-nordfjord" },
              { cle: "crypto", nom: L("Crypto", "Crypto"), valeur: rails.crypto?.paid_amount || 0,
                classe: "stroke-nova", pastille: "bg-nova" },
            ]} />
          </CardContent>
        </Card>
      </div>

      {/* ================== 5. AFFLUENCE + MEILLEURES VENTES ================== */}
      <div className="grid xl:grid-cols-3 gap-4 items-start">
        <Card className="xl:col-span-2 border-ash">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-bold text-nordfjord">
              {L("Quand vos clients commandent", "When your customers order")}
            </CardTitle>
            <p className="text-xs text-glacier mt-1">
              {L(`Heure du Québec · ${libellePeriode}`, `Quebec time · ${libellePeriode}`)}
            </p>
          </CardHeader>
          <CardContent>
            {analytics?.hourly ? (
              <Affluence grille={analytics.hourly} argent={argent} L={L} lang={lang} />
            ) : null}
            {!analytics?.hourly?.flat?.().some?.((v) => v > 0) && (
              <p className="text-sm text-glacier py-6 text-center" data-testid="affluence-vide">
                {L("Aucune commande payée sur la période", "No paid orders in this period")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-ash">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-bold text-nordfjord">
              {L("Meilleures ventes", "Best sellers")}
            </CardTitle>
            <p className="text-xs text-glacier mt-1">{libellePeriode}</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1" data-testid="top-products">
              {(analytics?.top_products || []).slice(0, 6).map((p, idx) => (
                // La cle inclut la variante : deux dosages du meme compose sont
                // deux lignes distinctes, et p.slug seul les ferait entrer en
                // collision (React n'en afficherait qu'une).
                <li key={`${p.slug}-${p.variant_name || "root"}`}
                    className="relative flex items-center gap-3 px-2 py-2 rounded-md overflow-hidden">
                  <span className="absolute inset-y-0 left-0 bg-nova/10 rounded-md" aria-hidden="true"
                        style={{ width: `${Math.max(6, (p.revenue / topMax) * 100)}%` }} />
                  <span className="relative font-data text-[10px] text-glacier w-3">{idx + 1}</span>
                  <div className="relative flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate text-nordfjord">
                      {lang === "fr" ? (p.name_fr || p.name_en) : (p.name_en || p.name_fr)}
                      {p.variant_name && (
                        <span className="text-nova font-semibold"> · {p.variant_name}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-glacier">
                      {p.units_sold} {L("unités", "units")}
                    </div>
                  </div>
                  <div className="relative font-bold tabular-nums text-nordfjord whitespace-nowrap text-sm">
                    {argent(p.revenue)}
                  </div>
                </li>
              ))}
              {!analytics?.top_products?.length && (
                <li className="py-6 text-xs text-glacier text-center">
                  {L("Aucune vente sur la période", "No sales in this period")}
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ================== 6. CE QUI TRAÎNE ================== */}
      <div className="grid xl:grid-cols-3 gap-4 items-start">
        <Card className="xl:col-span-2 border-ash overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="font-display text-base font-bold text-nordfjord">
              {L("Dernières commandes", "Latest orders")}
            </CardTitle>
            <Link to="orders"
              className="text-xs font-medium flex items-center gap-1 text-nova hover:text-nordfjord">
              {L("Voir tout", "View all")} <ArrowRight size={13} />
            </Link>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <table className="w-full text-sm" data-testid="recent-orders-table">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-glacier border-y border-ash">
                  <th className="text-left font-medium px-6 py-2">{L("Commande", "Order")}</th>
                  <th className="text-left font-medium px-6 py-2">{L("Client", "Customer")}</th>
                  <th className="text-left font-medium px-6 py-2">{L("Paiement", "Payment")}</th>
                  <th className="text-left font-medium px-6 py-2">{L("Traitement", "Fulfillment")}</th>
                  <th className="text-right font-medium px-6 py-2">{L("Total", "Total")}</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.recent_orders || []).map((o) => (
                  <tr key={o.id} className="border-b border-ash/50 last:border-0 hover:bg-clinical/60">
                    <td className="px-6 py-3">
                      {/* Lien relatif : `/admin/...` en absolu tombe sur l'alias de
                          compatibilité qui redirige vers la racine du portail en
                          perdant le sous-chemin, donc le clic ne menait nulle part. */}
                      <Link to={`orders/${o.id}`}
                        className="font-data font-bold text-xs text-nova hover:text-nordfjord">
                        {o.order_number}
                      </Link>
                      <div className="text-[10px] text-glacier">
                        {(o.created_at || "").slice(0, 16).replace("T", " ")}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="text-sm text-nordfjord truncate max-w-[14rem]">
                        {o.shipping_address?.full_name || o.email || "—"}
                      </div>
                      <div className="text-[10px] text-glacier truncate max-w-[14rem]">{o.email}</div>
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={o.payment_status} lang={lang} /></td>
                    <td className="px-6 py-3"><StatusBadge status={o.fulfillment_status} lang={lang} /></td>
                    <td className="px-6 py-3 text-right font-bold tabular-nums text-nordfjord">
                      {o.total != null ? argent(o.total) : "—"}
                    </td>
                  </tr>
                ))}
                {!analytics?.recent_orders?.length && (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-xs text-glacier">
                    {L("Aucune commande pour l'instant", "No orders yet")}
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <LowStockCard />
      </div>

      {/* Totaux historiques : consultables, mais ils ne déclenchent aucune
          décision quotidienne. Une ligne de bas de page leur suffit. */}
      {stats && (
        <div className="border-t border-ash pt-4 flex flex-wrap items-center gap-x-8 gap-y-2"
             data-testid="reference-totals">
          <span className="text-[10px] uppercase tracking-[0.2em] text-glacier">
            {L("Depuis l'ouverture", "All time")}
          </span>
          {[
            [L("Revenu", "Revenue"), argent(stats.revenue_cad)],
            [L("Commandes", "Orders"), stats.total_orders],
            [L("Clients", "Customers"), stats.customers],
            [L("Produits actifs", "Active products"), stats.products],
          ].map(([k, v]) => (
            <span key={k} className="text-xs text-glacier">
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
function Titre({ children, compte }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <h2 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-nordfjord">
        {children}
      </h2>
      {compte > 0 && (
        <span className="text-[10px] font-bold bg-nordfjord text-white rounded-full px-2 py-0.5"
              data-testid="actions-count">
          {compte}
        </span>
      )}
      <span className="flex-1 h-px bg-ash" />
    </div>
  );
}

// L'écart, en pastille : la couleur double une flèche et un signe, jamais
// l'inverse — un écart ne doit pas dépendre de la seule teinte.
function Pastille({ delta }) {
  if (delta == null) return null;
  const hausse = delta >= 0;
  const Fleche = hausse ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
      hausse ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>
      <Fleche size={11} /> {hausse ? "+" : ""}{delta} %
    </span>
  );
}

// Carte d'action : un compteur qui appelle une décision, jamais une
// statistique. La pastille colorée encode l'urgence SANS en dépendre — le
// titre et la phrase la disent aussi.
const TONS = {
  urgent: { medaille: "bg-error/10 text-error", lisere: "border-l-error" },
  warn: { medaille: "bg-warning/10 text-warning", lisere: "border-l-warning" },
  info: { medaille: "bg-nova/10 text-nova", lisere: "border-l-nova" },
};

function CarteAction({ ton = "info", titre, quoi, n, valeur, vers, cle, icone: Icone }) {
  const t = TONS[ton];
  return (
    <Link to={vers} data-testid={`action-${cle}`}
      className={`group bg-card border border-ash border-l-[3px] ${t.lisere} rounded-xl px-4 py-3.5
                  flex items-center gap-3.5 hover:border-nova hover:shadow-sm transition-all`}>
      <span className={`w-9 h-9 rounded-lg ${t.medaille} flex items-center justify-center shrink-0`}>
        {Icone && <Icone size={17} strokeWidth={1.8} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-nordfjord truncate">{titre}</div>
        <div className="text-[11px] text-glacier truncate mt-0.5">{quoi}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-xl font-bold tabular-nums text-nordfjord leading-none whitespace-nowrap">
          {valeur || n}
        </div>
        {valeur && <div className="text-[10px] text-glacier mt-1">{n}</div>}
      </div>
    </Link>
  );
}

// Un chiffre de pilotage : étiquette, grande valeur, écart — et la forme de la
// période à droite, quand cette forme existe vraiment.
function Chiffre({ label, valeur, delta, indice, icone: Icone, testid, L, serie }) {
  return (
    <Card className="border-ash" data-testid={testid}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-[11px] text-glacier">
          {Icone && <Icone size={13} strokeWidth={1.8} />}
          {label}
        </div>
        <div className="flex items-end justify-between gap-3 mt-2.5">
          <div className="min-w-0">
            <p className="font-display text-[26px] leading-none font-bold tabular-nums text-nordfjord whitespace-nowrap">
              {valeur}
            </p>
            <div className="flex items-center gap-1.5 mt-2.5 text-[11px] flex-wrap">
              <Pastille delta={delta} />
              <span className="text-glacier">{indice}</span>
            </div>
          </div>
          <BarresMini valeurs={serie} etiquette={`${label} — ${L("tendance", "trend")}`} />
        </div>
      </CardContent>
    </Card>
  );
}
