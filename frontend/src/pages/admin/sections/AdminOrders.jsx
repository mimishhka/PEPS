import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, Search, X, FileText, CheckCircle2, Save, Truck, MessageSquarePlus, Mail, Undo2, Trash2, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";
import { useConfirm } from "../../../components/ConfirmDialog";
import { useAuth } from "../../../contexts/AuthContext";
import { useLang } from "../../../contexts/LanguageContext";
import { Th } from "../ui";
import CorrigerAdresse from "./CorrigerAdresse";

const FULFILLMENT_OPTS = ["pending", "preorder", "processing", "shipped", "delivered", "cancelled", "failed", "refunded"];
const PAYMENT_OPTS = ["awaiting_etransfer", "awaiting_crypto", "paid", "refunded", "cancelled", "failed"];
const PAGE_SIZE = 50;
// Mêmes clés que _ORDER_STATUS_GROUPS côté serveur. « Refunded » a son
// onglet : les commandes remboursées restaient dans « Active » pour toujours
// (4 des 13 le 2026-09-19), et une vente remboursée n'est pas une annulation.
const TABS = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "refunded", label: "Refunded" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

// Seuls ces paiements peuvent encore être confirmés. _mark_order_paid ignore
// les statuts terminaux (payé, annulé, échoué, remboursé) : le bouton y
// affichait « Payment confirmed » sans que rien ne change.
const EN_ATTENTE = ["awaiting_etransfer", "awaiting_crypto"];

// Une commande close n'a plus de facture, de suivi ni de courriel à renvoyer.
const CLOSES = ["cancelled", "failed"];

// L'état d'un dossier de remboursement, dans les mots de l'écran Remboursements.
const ETAT_DOSSIER = {
  requested: { fr: "à examiner", en: "to review" },
  approved: { fr: "approuvé : l'argent reste à envoyer", en: "approved : the money still has to be sent" },
  processed: { fr: "remboursé", en: "refunded" },
  denied: { fr: "refusé", en: "denied" },
};

// Le moyen de paiement, lisible. La liste l'affichait ; la fiche, jamais.
const METHODES = {
  interac: "Interac",
  etransfer: "Interac",
  nowpayments: "Crypto · NOWPayments",
};

const dateLongue = (iso, lang) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { day: "numeric", month: "long", year: "numeric" });
};

/* Regroupe les reports de lot CONSÉCUTIFS en une seule ligne.
 *
 * Le lot d'expédition ajoute une note chaque jour où l'étiquette n'est pas
 * imprimée. Une commande bloquée trois semaines en accumulait une vingtaine,
 * et les vraies notes disparaissaient dessous. Rien n'est supprimé : les
 * notes restent en base, seul l'affichage les regroupe. Une note humaine
 * entre deux reports coupe le groupe, pour garder l'ordre des événements. */
const REPORT = /^Reportée au lot (\S+) : étiquette non imprimée\.$/;
function regrouperReports(notes) {
  const sortie = [];
  for (const n of notes) {
    const m = n.author === "system" ? REPORT.exec(n.text || "") : null;
    const dernier = sortie[sortie.length - 1];
    if (m && dernier?.report) {
      dernier.report = { ...dernier.report, jusqua: m[1], n: dernier.report.n + 1 };
      continue;
    }
    sortie.push(m ? { ...n, report: { depuis: m[1], jusqua: m[1], n: 1 } } : n);
  }
  return sortie;
}

// Paramètres d'URL d'une vue : partagés par la liste ET les exports.
const enQuery = (params) => {
  const q = new URLSearchParams(
    Object.entries(params).map(([cle, valeur]) => [cle, String(valeur)])).toString();
  return q ? `?${q}` : "";
};

export default function AdminOrders() {
  const confirm = useConfirm();
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState("");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterFulfill, setFilterFulfill] = useState("all");
  const [filterLate, setFilterLate] = useState("all");
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("active");
  const [counts, setCounts] = useState({});
  const [manifest, setManifest] = useState(null);   // {configured, pending_count, groups}
  const [txBusy, setTxBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { id: routeOrderId } = useParams();
  const navigate = useNavigate();
  const deferredQuery = useDeferredValue(query);

  // Étiquettes créées mais non transmises = 2 $/article de surcharge et perte
  // du rabais d'automatisation. On le met sous les yeux, en haut de l'écran.
  const loadManifest = () => {
    api.get("/admin/shipping/pending-manifest")
      .then((r) => setManifest(r.data))
      .catch(() => setManifest(null));
  };
  useEffect(() => { loadManifest(); }, []);

  const transmitManifest = async () => {
    if (!await confirm({ title: "Transmit today's manifest to Canada Post?", description: "This closes the shipments for billing.", destructive: true })) return;
    setTxBusy(true);
    try {
      const { data } = await api.post("/admin/shipping/transmit");
      toast.success(`Manifest transmitted : ${data.orders_marked} shipment(s) closed.`);
      if (data.manifests?.length) {
        toast.info(`${data.manifests.length} manifest document(s) available from Canada Post.`);
      }
      loadManifest();
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setTxBusy(false);
    }
  };

  // Sortie de secours quand les étiquettes ne partiront jamais (essais, erreur
  // de manipulation) : les annuler chez Postes Canada plutôt que les transmettre.
  const voidUntransmitted = async () => {
    if (!await confirm({
      title: `Void ${manifest?.pending_count ?? 0} untransmitted label(s)?`,
      description: "Cancels the shipments with Canada Post and returns the orders to processing. "
        + "Use this for labels created by mistake : not for parcels you are actually sending.",
      destructive: true,
    })) return;
    setTxBusy(true);
    try {
      const { data } = await api.post("/admin/shipping/void-untransmitted");
      toast.success(`${data.voided} label(s) voided.`);
      if (data.failed?.length) {
        toast.error(`Canada Post refused to void: ${data.failed.join(", ")}`);
      }
      if (data.no_shipment_id?.length) {
        toast.warning(`No Canada Post shipment id, void manually: ${data.no_shipment_id.join(", ")}`);
      }
      loadManifest();
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setTxBusy(false);
    }
  };

  // Les filtres de la vue, une seule fois : la liste ET les exports les
  // lisent. Les exports ne recevaient que l'onglet : une recherche ou un
  // filtre à l'écran étaient ignorés dans le fichier téléchargé.
  const filtresVue = useMemo(() => ({
    ...(tab === "all" ? {} : { status_group: tab }),
    ...(deferredQuery ? { query: deferredQuery } : {}),
    ...(filterPayment === "all" ? {} : { payment_status: filterPayment }),
    ...(filterFulfill === "all" ? {} : { fulfillment_status: filterFulfill }),
    ...(filterLate === "late_only" ? { late_only: true } : {}),
  }), [deferredQuery, filterFulfill, filterLate, filterPayment, tab]);

  // Un .catch() sur chaque appel : sans lui, une réponse en erreur devient
  // une unhandled rejection, que l'overlay CRA affiche en « [object Object] »
  // et que le build de prod avale en silence.
  const loadList = useCallback(() => {
    api.get("/admin/orders/page", { params: { page, limit: PAGE_SIZE, ...filtresVue } })
      .then((r) => {
        setOrders(r.data.items || []);
        setTotal(r.data.total || 0);
      }).catch((e) => {
        setOrders([]);
        setTotal(0);
        toast.error(formatApiError(e.response?.data?.detail) || e.message);
      });
  }, [filtresVue, page]);

  // Les compteurs d'onglets ne dépendent d'AUCUN filtre. Ils étaient pourtant
  // redemandés à chaque frappe dans la recherche : cinq requêtes de comptage
  // par caractère tapé. Chargés à l'ouverture, puis après chaque action.
  const loadCounts = useCallback(() => {
    api.get("/admin/orders/counts")
      .then((r) => setCounts(r.data))
      .catch(() => setCounts({}));
  }, []);

  // Tout rafraîchir : ce qu'appellent les actions qui changent une commande.
  const load = useCallback(() => { loadList(); loadCounts(); }, [loadList, loadCounts]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = orders;

  useEffect(() => {
    setPage(1);
  }, [tab, query, filterPayment, filterFulfill, filterLate]);

  // Lien profond /orders/:id (tableau de bord, courriels). La route existait
  // déjà dans AdminLayout mais rien ne lisait le paramètre : on atterrissait
  // sur la liste sans que la commande s'ouvre.
  useEffect(() => {
    if (!routeOrderId || selected?.id === routeOrderId) return undefined;
    let alive = true;
    // La commande seule, par son id. Le lien chargeait la liste entière -
    // plafonnée à 500 : pour la chercher côté navigateur : au-delà de 500
    // commandes, un lien vers une commande ancienne aurait répondu « Order
    // not found » alors qu'elle existe. L'endpoint dédié existait déjà.
    api.get(`/admin/orders/${routeOrderId}`)
      .then((r) => {
        if (alive && r.data) setSelected(r.data);
      })
      .catch((e) => {
        if (alive) toast.error(formatApiError(e.response?.data?.detail) || e.message);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOrderId]);

  // Refermer doit aussi retirer l'id de l'URL, sinon l'effet ci-dessus rouvre
  // la commande au moindre re-rendu.
  const closeDetail = () => {
    setSelected(null);
    if (routeOrderId) navigate("..", { relative: "path" });
  };

  return (
    <div className="p-8" data-testid="admin-orders">
      {manifest?.configured && manifest.pending_count > 0 && (
        <div
          className="mb-6 border-2 border-red-600 bg-red-50 px-5 py-4 flex flex-wrap items-center justify-between gap-4"
          data-testid="manifest-warning"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-red-700 font-bold">
                {manifest.pending_count} label(s) created but not transmitted
              </div>
              <div className="text-sm text-red-800 mt-1">
                Transmit the manifest before end of day. Canada Post bills untransmitted shipments
                with a <strong>$2 surcharge per item</strong> and removes the automation discount.
                {" "}The manifest does not exist until you transmit : transmitting is what creates it.
              </div>
              {manifest.orphan_count > 0 && (
                <div className="text-sm text-red-800 mt-2" data-testid="manifest-orphans">
                  <strong>{manifest.orphan_count} of these cannot be transmitted</strong> : they have
                  a label but no Canada Post group, so "Transmit manifest" will not clear them. Void
                  and recreate those labels: {manifest.orphans?.join(", ")}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={voidUntransmitted}
              disabled={txBusy}
              data-testid="void-untransmitted-btn"
              title="Cancel these labels with Canada Post instead of shipping them"
              className="border border-red-600 text-red-700 font-mono text-xs uppercase tracking-[0.2em] px-4 py-2.5 flex items-center gap-2 disabled:opacity-50"
            >
              <Undo2 size={14} /> Void all
            </button>
            <button
              onClick={transmitManifest}
              disabled={txBusy || !manifest.transmittable_count}
              data-testid="transmit-manifest-btn"
              className="bg-red-600 text-white font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 flex items-center gap-2 disabled:opacity-50"
            >
              <Send size={14} /> {txBusy ? "Transmitting…" : "Transmit manifest"}
            </button>
          </div>
        </div>
      )}
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// ORDERS</div>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight mt-2">Orders</h1>
          <p className="font-mono text-xs text-foreground/60 mt-1" data-testid="orders-shown">{total} shown</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${API_BASE}/admin/orders.csv${enQuery(filtresVue)}`}
            target="_blank" rel="noopener noreferrer"
            data-testid="export-orders-csv"
            className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80"
          >
            <Download size={14} /> CSV
          </a>
          <a
            href={`${API_BASE}/admin/orders.xlsx${enQuery(filtresVue)}`}
            target="_blank" rel="noopener noreferrer"
            data-testid="export-orders-xlsx"
            className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-ink hover:text-white"
          >
            <Download size={14} /> Excel
          </a>
        </div>
      </div>

      {/* Status group tabs */}
      <div className="flex gap-0 mb-4 border border-ink/15 bg-white w-fit" data-testid="orders-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-testid={`orders-tab-${t.key}`}
            className={`font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 flex items-center gap-2 ${tab === t.key ? "bg-ink text-white" : "hover:bg-secondary"}`}
          >
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 ${tab === t.key ? "bg-white/20" : "bg-secondary"}`} data-testid={`orders-count-${t.key}`}>
              {counts[t.key] ?? "…"}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-ink/10 p-4 mb-4 flex flex-wrap items-center gap-3" data-testid="orders-filters">
        <div className="flex items-center gap-2 border border-ink/15 px-3 py-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-foreground/50" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order #, email, name…"
            data-testid="orders-search"
            className="bg-transparent text-sm outline-none w-full"
          />
        </div>
        <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className="border border-ink/15 px-3 py-2 text-sm bg-white" data-testid="filter-payment">
          <option value="all">All payments</option>
          {PAYMENT_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterFulfill} onChange={(e) => setFilterFulfill(e.target.value)} className="border border-ink/15 px-3 py-2 text-sm bg-white" data-testid="filter-fulfill">
          <option value="all">All fulfillments</option>
          {FULFILLMENT_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterLate} onChange={(e) => setFilterLate(e.target.value)} className="border border-ink/15 px-3 py-2 text-sm bg-white" data-testid="filter-late-payment">
          <option value="all">Late or on time</option>
          <option value="late_only">Late payments only</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Method</Th>
              <Th>Payment</Th>
              <Th>Fulfillment</Th>
              {/* « Total » en clair, et non L("Total","Total") : ce fichier
                  n'a aucun helper L, et les deux traductions etaient de toute
                  facon identiques. Residu de l'unification des en-tetes. */}
              <Th align="right">Total</Th>
              <Th align="right"></Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((o) => (
              <tr key={o.id} className="border-t border-ink/5 hover:bg-secondary/40" data-testid={`order-row-${o.order_number}`}>
                <td className="px-6 py-3">
                  <div className="font-mono font-bold text-xs">{o.order_number}</div>
                  {o.late_payment_flagged && (
                    <span
                      className="inline-flex mt-1 items-center rounded-full border border-red-300 bg-red-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-red-700"
                      data-testid={`late-payment-badge-${o.order_number}`}
                    >
                      Late payment
                    </span>
                  )}
                  {o.replaces_order_id && (
                    <span
                      className="inline-flex mt-1 items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-700"
                      data-testid={`replacement-badge-${o.order_number}`}
                    >
                      Remplacement
                    </span>
                  )}
                  <div className="font-mono text-[10px] text-foreground/50">{(o.created_at || "").slice(0, 10)}</div>
                  {o.dispatch_batch && (
                    <div className="font-mono text-[10px] text-glacier" data-testid={`dispatch-batch-${o.order_number}`}>
                      LOT {o.dispatch_batch}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3">
                  <div className="text-sm">{o.shipping_address?.full_name || "-"}</div>
                  <div className="font-mono text-[10px] text-foreground/50">{o.email || "guest"}</div>
                </td>
                <td className="px-6 py-3 font-mono text-xs uppercase">{o.payment_method}</td>
                <td className="px-6 py-3"><StatusBadge status={o.payment_status} /></td>
                <td className="px-6 py-3"><StatusBadge status={o.fulfillment_status} /></td>
                <td className="px-6 py-3 text-right font-bold tabular-nums">${o.total?.toFixed(2)}</td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => setSelected(o)}
                    data-testid={`open-order-${o.order_number}`}
                    className="font-mono text-xs uppercase tracking-[0.2em] border border-ink px-3 py-1.5 hover:bg-ink hover:text-white"
                  >
                    Open →
                  </button>
                </td>
              </tr>
            ))}
            {!pageRows.length && (
              <tr><td colSpan={7} className="px-6 py-12 text-center font-mono text-xs text-foreground/50">No orders match the filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3 font-mono text-xs">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="border border-ink/15 px-3 py-2 disabled:opacity-40"
            aria-label="Previous orders page"
          >
            ←
          </button>
          <span>{page} / {pageCount}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page === pageCount}
            className="border border-ink/15 px-3 py-2 disabled:opacity-40"
            aria-label="Next orders page"
          >
            →
          </button>
        </div>
      )}

      {selected && <OrderDetail order={selected} onClose={closeDetail} onUpdate={() => {
        load();
        api.get(`/admin/orders/${selected.id}`)
          .then((r) => setSelected(r.data))
          .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message));
      }} />}
    </div>
  );
}

function OrderDetail({ order, onClose, onUpdate }) {
  // La correction d adresse : fermee par defaut. Elle n a de sens que
  // lorsque le transporteur refuse, et un formulaire toujours ouvert sur
  // une adresse valide invite a la modifier sans raison.
  const [corrigeAdresse, setCorrigeAdresse] = useState(false);
  const { user } = useAuth();
  // La fiche suit la langue de l'interface, comme les écrans Remboursements et
  // Billets. Elle mélangeait l'anglais (Customer, Items, Order Notes) et le
  // français (Lot d'expédition, Remboursement) sur un même écran.
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  // Sans cette ligne, `confirm(...)` ne designait pas le dialogue stylé du
  // projet mais le window.confirm DU NAVIGATEUR : un global, donc aucune
  // erreur. Or ce composant lui passe un OBJET { title, description }, la ou
  // le natif attend une chaine : la boite affichait « [object Object] ».
  //
  // Trois actions destructrices etaient concernees : mise a la corbeille,
  // annulation d'etiquette, et une troisieme : c'est-a-dire precisement
  // celles ou la personne doit comprendre ce qu'elle valide.
  const confirm = useConfirm();
  const [reopenBusy, setReopenBusy] = useState(false);
  const canUseReopenAction =
    user?.role === "admin"
    || (user?.role === "staff" && user?.permissions?.orders_reopen === "manage");
  const canReopenLatePaid =
    canUseReopenAction
    && order?.payment_status === "cancelled"
    && order?.cancelled_reason === "auto_unpaid_timeout"
    && !!order?.late_payment_flagged;

  // Réouverture générale : toute commande annulée peut être réouverte par un admin
  // (couvre les cancel manuels et les auto-cancels sans paiement tardif détecté).
  const canReopenGeneric =
    canUseReopenAction
    && order?.payment_status === "cancelled"
    && !canReopenLatePaid;

  const reopenLatePaidOrder = async () => {
    setReopenBusy(true);
    try {
      await api.post(`/admin/orders/${order.id}/reopen`, {
        mark_paid: true,
        note: "Late payment received after auto-cancel",
      });
      toast.success(L("Commande rouverte et marquée payée", "Order reopened and marked as paid"));
      onUpdate();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setReopenBusy(false);
    }
  };

  const reopenOrder = async () => {
    const note = window.prompt(
      L("Motif de réouverture (optionnel : conservé dans l'historique) :",
        "Reason for reopening (optional : kept in the history):"), "") || "";
    if (!await confirm({
      title: L("Rouvrir cette commande annulée ?", "Reopen this cancelled order?"),
      description: L(
        "Le stock sera à nouveau décrémenté (refusé si un article n'est plus disponible). La commande repasse en attente de paiement.",
        "Stock will be decremented again (refused if an item is no longer available). The order goes back to awaiting payment."),
    })) return;
    setReopenBusy(true);
    try {
      await api.post(`/admin/orders/${order.id}/reopen`, { mark_paid: false, note });
      toast.success(L("Commande rouverte", "Order reopened"));
      onUpdate();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setReopenBusy(false);
    }
  };

  const deleteOrder = async () => {
    if (!await confirm({
      title: L(`Mettre la commande ${order.order_number} à la corbeille ?`,
               `Move order ${order.order_number} to trash?`),
      description: L("Elle reste récupérable dans la corbeille : rien n'est perdu.",
                     "It stays recoverable there : nothing is lost."),
      destructive: true,
    })) return;
    try {
      await api.delete(`/admin/orders/${order.id}`);
      toast.success(L("Commande mise à la corbeille", "Order moved to trash"));
      onUpdate();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };
  const [tracking, setTracking] = useState(order.shipping_info?.tracking_number || "");
  const [carrier, setCarrier] = useState(order.shipping_info?.carrier || "Canada Post");
  const [deliverySyncBusy, setDeliverySyncBusy] = useState(false);
  const [shipInfo, setShipInfo] = useState(order.shipping_info || {});
  const manifestUrl = shipInfo.cp_transmitted && order.dispatch_batch
    ? `${API_BASE.replace(/\/api$/, "")}/api/admin/dispatch/${order.dispatch_batch}/manifest.pdf`
    : "";

  useEffect(() => { setShipInfo(order.shipping_info || {}); }, [order.shipping_info]);

  const [noteText, setNoteText] = useState("");
  const [noteVisible, setNoteVisible] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirmPayment = async () => {
    try {
      await api.post(`/admin/orders/${order.id}/confirm-payment`);
      toast.success(L("Paiement confirmé : commande en préparation", "Payment confirmed : moved to Processing"));
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const updateStatus = async (field, value) => {
    try {
      await api.put(`/admin/orders/${order.id}/status?${field}=${value}`);
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  // Le serveur ne fait plus reculer un statut : sur une commande déjà livrée,
  // enregistrer le suivi le corrige sans la repasser en « expédiée ». Le
  // message et le libellé du bouton disent donc ce qui se passe VRAIMENT.
  const dejaPartie = ["shipped", "delivered"].includes(order.fulfillment_status);
  const saveShipping = async () => {
    try {
      const { data } = await api.put(`/admin/orders/${order.id}/shipping`, { carrier, tracking_number: tracking });
      toast.success(data?.fulfillment_status === "shipped" && order.fulfillment_status !== "shipped"
        ? L("Suivi enregistré : commande marquée expédiée", "Tracking saved : order marked as shipped")
        : L("Suivi enregistré", "Tracking saved"));
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const syncDeliveredFromTracking = async () => {
    setDeliverySyncBusy(true);
    try {
      const { data } = await api.post(`/admin/orders/${order.id}/sync-delivery`);
      if (!data?.tracked) {
        toast.error(L("Repérage Postes Canada indisponible pour le moment.", "Canada Post tracking unavailable right now."));
        return;
      }
      if (data?.updated) {
        toast.success(L("Livraison confirmée : statut passé à livré.", "Delivery confirmed : status set to delivered."));
      } else if (data?.delivered) {
        toast.success(L("Commande déjà marquée livrée.", "Order already marked delivered."));
      } else {
        toast(L("Colis pas encore livré selon le repérage.", "Parcel not delivered yet according to tracking."));
      }
      onUpdate();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setDeliverySyncBusy(false);
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      await api.post(`/admin/orders/${order.id}/notes`, { text: noteText, visible_to_customer: noteVisible });
      if (noteVisible) toast.success(L("Note ajoutée : courriel envoyé au client", "Note added : email sent to customer"));
      setNoteText(""); setNoteVisible(false); onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const resendEmail = async () => {
    try {
      const { data } = await api.post(`/admin/orders/${order.id}/resend-email`);
      toast.success(L(`Courriel de commande renvoyé à ${data.sent_to}`, `Order email re-sent to ${data.sent_to}`));
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const addr = order.shipping_address || {};
  const aUneAdresse = !!(addr.address1 || addr.city || addr.postal_code);
  const articles = order.items || [];
  const nomArticle = (it) => (lang === "fr" ? (it.name_fr || it.name_en) : it.name_en) || "-";

  // Le lot d'expédition n'a de sens que pour une commande qui ATTEND de
  // partir. Il restait affiché sur les commandes expédiées, livrées,
  // annulées ou remboursées, où il ne désigne plus rien d'actionnable.
  const enPreparation = order.payment_status === "paid"
    && !["shipped", "delivered", "cancelled", "failed", "refunded"].includes(order.fulfillment_status);

  // Les actions ne s'affichent que si l'une d'elles s'applique : une rangée
  // vide sous les statuts n'aurait rien à dire.
  const peutFacturer = !CLOSES.includes(order.payment_status);
  const peutRenvoyer = !!order.email && [...EN_ATTENTE, "paid"].includes(order.payment_status);
  const peutConfirmer = EN_ATTENTE.includes(order.payment_status);
  const aDesActions = canReopenLatePaid || canReopenGeneric || peutConfirmer || peutFacturer || peutRenvoyer;

  const placee = dateLongue(order.created_at, lang);
  const payee = dateLongue(order.paid_at, lang);
  const titre = "font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50";
  const carte = "bg-white border border-ink/10 p-4";
  const bouton = "border border-ink text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-ink hover:text-white";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div className="bg-[#fafafa] w-full max-w-3xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="order-detail-drawer">
        {/* En-tête : QUI et QUAND, d'un coup d'œil. La date et le moyen de
            paiement n'apparaissaient nulle part dans la fiche. La corbeille a
            quitté l'en-tête : collée à la croix de fermeture, un clic de
            travers suffisait. Elle est en bas, dans sa propre zone. */}
        <div className="bg-ink text-white px-6 py-4 sticky top-0 z-10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/60">{L("// COMMANDE", "// ORDER")}</div>
            <div className="font-display text-xl font-bold tracking-tight" data-testid="order-detail-number">{order.order_number}</div>
            <div className="font-mono text-[11px] text-white/70 mt-0.5" data-testid="order-detail-summary">
              {placee ? L(`Passée le ${placee}`, `Placed ${placee}`) : L("Date inconnue", "Unknown date")}
              {order.payment_method && ` · ${METHODES[order.payment_method] || order.payment_method}`}
            </div>
            {order.dispatch_batch && enPreparation && (
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-glacier mt-0.5" data-testid="order-detail-dispatch-batch">
                {L("Lot d'expédition", "Dispatch batch")} · {order.dispatch_batch}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label={L("Fermer", "Close")} data-testid="close-order-detail"
            className="text-white/80 hover:text-white shrink-0"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Statuts d'abord, sur leur propre ligne ; les actions ensuite. Ils
              étaient mêlés dans une seule rangée, badges et boutons confondus. */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap" data-testid="order-detail-statuses">
              <StatusBadge status={order.payment_status} lang={lang} />
              <StatusBadge status={order.fulfillment_status} lang={lang} />
              {order.late_payment_flagged && (
                <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-red-700">
                  {L("Paiement tardif", "Late payment")}
                </span>
              )}
              {!order.user_id && (
                <span data-testid="order-guest"
                  className="inline-flex items-center rounded-full border border-ink/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground/60">
                  {L("Invité : sans compte", "Guest : no account")}
                </span>
              )}
            </div>

            {aDesActions && (
              <div className="flex items-center gap-2 flex-wrap" data-testid="order-detail-actions">
                {canReopenLatePaid && (
                  <button onClick={reopenLatePaidOrder} disabled={reopenBusy} data-testid="reopen-late-paid-btn"
                    className="bg-amber-600 text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-amber-700 disabled:opacity-50"
                    title={L("Rouvrir la commande annulée automatiquement après un paiement tardif",
                             "Reopen the order auto-cancelled after a late payment")}>
                    <Undo2 size={14} /> {reopenBusy ? L("Réouverture…", "Reopening…") : L("Rouvrir et marquer payée", "Reopen + mark paid")}
                  </button>
                )}
                {canReopenGeneric && (
                  <button onClick={reopenOrder} disabled={reopenBusy} data-testid="reopen-order-btn"
                    className="bg-nordfjord text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
                    title={L("Rouvrir cette commande annulée (repasse en attente de paiement)",
                             "Reopen this cancelled order (back to awaiting payment)")}>
                    <Undo2 size={14} /> {reopenBusy ? L("Réouverture…", "Reopening…") : L("Rouvrir", "Reopen")}
                  </button>
                )}
                {/* Seulement si le paiement est encore ATTENDU. Sur une commande
                    annulée, échouée ou remboursée, le serveur ne faisait rien -
                    mais l'écran annonçait « Payment confirmed ». */}
                {peutConfirmer && (
                  <button onClick={confirmPayment} data-testid="confirm-payment-btn"
                    className="bg-emerald-600 text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-emerald-700">
                    <CheckCircle2 size={14} /> {L("Confirmer le paiement", "Confirm payment")}
                  </button>
                )}
                {/* Pas de facture pour une vente qui n'a pas eu lieu. Une commande
                    remboursée garde la sienne : la vente a existé. */}
                {peutFacturer && (
                  <a href={`${API_BASE}/orders/${order.id}/invoice.pdf`} target="_blank" rel="noopener noreferrer"
                    data-testid="download-invoice-pdf" className={bouton}>
                    <FileText size={14} /> {L("Facture PDF", "Invoice PDF")}
                  </a>
                )}
                {/* Ce courriel reprend la commande et, sans paiement, les
                    instructions pour payer : pas pour une commande close. */}
                {peutRenvoyer && (
                  <button onClick={resendEmail} data-testid="resend-email-btn" className={bouton}>
                    <Mail size={14} /> {L("Renvoyer le courriel", "Resend email")}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Client · Livraison · Paiement */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className={carte}>
              <div className={titre}>{L("Client", "Customer")}</div>
              <div className="font-bold mt-1">{addr.full_name || "-"}</div>
              <div className="text-sm text-foreground/70 break-all">{order.email || "-"}</div>
              {addr.phone && <div className="text-sm text-foreground/70">{addr.phone}</div>}
            </div>
            <div className={carte}>
              <div className={titre}>{L("Livraison", "Ship to")}</div>
              {aUneAdresse ? (
                <>
                  <div className="text-sm mt-1">{addr.address1}{addr.address2 ? `, ${addr.address2}` : ""}</div>
                  <div className="text-sm">{[addr.city, addr.province].filter(Boolean).join(", ")} {addr.postal_code}</div>
                  <div className="text-sm">{addr.country}</div>
                </>
              ) : (
                <div className="text-sm mt-1 text-foreground/50" data-testid="order-no-address">{L("Aucune adresse", "No address")}</div>
              )}
              {/* SANS CE BOUTON, UNE ADRESSE REFUSEE PAR POSTES CANADA BLOQUAIT
                  LA COMMANDE POUR TOUJOURS : l ecran l affichait sans jamais
                  permettre de la corriger, et le seul recours etait de
                  rembourser. Il disparait des qu une etiquette existe : le
                  serveur refuserait de toute facon, et proposer une action
                  impossible est pire que ne pas la proposer. */}
              {!order.shipping_info?.label_url && (
                <button type="button" onClick={() => setCorrigeAdresse((v) => !v)}
                  data-testid="order-corriger-adresse"
                  className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-nova-texte hover:underline">
                  {corrigeAdresse ? L("Fermer", "Close") : L("Corriger l'adresse", "Fix address")}
                </button>
              )}
              {order.shipping_address_corrected_at && (
                <div className="mt-2 font-mono text-[10px] text-foreground/40" data-testid="order-adresse-corrigee">
                  {L("Adresse corrigee", "Address corrected")} · {String(order.shipping_address_corrected_at).slice(0, 10)}
                </div>
              )}
            </div>
            <div className={carte} data-testid="order-detail-payment">
              <div className={titre}>{L("Paiement", "Payment")}</div>
              <div className="text-sm mt-1">{METHODES[order.payment_method] || order.payment_method || "-"}</div>
              <div className="text-sm text-foreground/70">
                {payee ? L(`Payée le ${payee}`, `Paid ${payee}`) : L("Pas encore payée", "Not paid yet")}
              </div>
            </div>
          </div>

          {/* Le formulaire de correction, pleine largeur sous les cartes : une
              adresse se relit en entier, pas dans une colonne etroite. */}
          {corrigeAdresse && (
            <div className="mb-6">
              <CorrigerAdresse
                order={order}
                onCancel={() => setCorrigeAdresse(false)}
                onDone={() => { setCorrigeAdresse(false); onUpdate?.(); }}
              />
            </div>
          )}

          {/* Articles */}
          <div className="bg-white border border-ink/10">
            <div className={`px-4 py-3 border-b border-ink/10 ${titre}`}>{L("Articles", "Items")}</div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {/* `order.items` peut manquer : FN-AUTO-B3AD4F n'a pas ce champ.
                    L'appel direct à .map() faisait tomber TOUT l'écran
                    d'administration : « Something went wrong ». */}
                {articles.map((it) => (
                  <tr key={it.product_id} className="border-t border-ink/5">
                    <td className="px-4 py-3">
                      <div className="font-bold">{nomArticle(it)}</div>
                      <div className="font-mono text-[10px] text-foreground/50">
                        {it.variant_name || it.slug} · {it.qty}× @ ${it.price_cad?.toFixed(2)}
                      </div>
                      {it.preorder && <span className="inline-block mt-1 text-[10px] font-mono uppercase tracking-[0.15em] bg-orange-500 text-white px-2 py-0.5">{L("Précommande", "Pre-order")}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">${it.line_total?.toFixed(2)}</td>
                  </tr>
                ))}
                {!articles.length && (
                  <tr><td colSpan={2} className="px-4 py-3 text-sm text-amber-700" data-testid="order-no-items">
                    {L("Aucun article sur cette commande : enregistrement incomplet.",
                       "No items on this order : incomplete record.")}
                  </td></tr>
                )}
              </tbody>
              <tfoot className="bg-secondary/50">
                <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">{L("Sous-total", "Subtotal")}</td><td className="px-4 py-1 text-right text-sm tabular-nums">${order.subtotal?.toFixed(2)}</td></tr>
                {order.discount > 0 && (
                  <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">{L("Rabais", "Discount")} {order.coupon?.code && `(${order.coupon.code})`}</td><td className="px-4 py-1 text-right text-sm tabular-nums text-emerald-700">-${order.discount?.toFixed(2)}</td></tr>
                )}
                <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">{L("Livraison", "Shipping")}</td><td className="px-4 py-1 text-right text-sm tabular-nums">${order.shipping?.toFixed(2)}</td></tr>
                {/* Sans cette ligne, une commande taxée affichait des montants
                    dont la somme ne donnait pas le total. */}
                {order.tax > 0 && (
                  <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">{L("Taxes", "Tax")}</td><td className="px-4 py-1 text-right text-sm tabular-nums">${order.tax.toFixed(2)}</td></tr>
                )}
                <tr><td className="px-4 py-2 text-right font-bold uppercase">{L("Total CAD", "Total CAD")}</td><td className="px-4 py-2 text-right font-display font-bold text-lg tabular-nums" data-testid="order-total">${order.total?.toFixed(2)}</td></tr>
              </tfoot>
            </table>
            </div>
          </div>

          {/* Expédition : le formulaire seulement pour une commande PAYÉE : le
              serveur refuse tout suivi sur une commande impayée (409). Une
              commande close déjà expédiée garde ses informations, en lecture
              seule. */}
          {(order.payment_status === "paid" || !!(shipInfo.tracking_number || shipInfo.label_url)) && (
          <div className={carte} data-testid="order-shipping">
            <div className={`${titre} mb-3 flex items-center gap-2`}><Truck size={12} /> {L("Expédition et suivi", "Shipping & tracking")}</div>
            {order.payment_status !== "paid" ? (
              <div className="text-sm text-foreground/70" data-testid="order-shipping-readonly">
                {shipInfo.carrier || "-"} · {shipInfo.tracking_number || L("pas de numéro de suivi", "no tracking number")}
              </div>
            ) : (<>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">{L("Transporteur", "Carrier")}</label>
                <input value={carrier} onChange={(e) => setCarrier(e.target.value)} data-testid="shipping-carrier" className="w-full border border-ink/20 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">{L("Numéro de suivi", "Tracking number")}</label>
                <input value={tracking} onChange={(e) => setTracking(e.target.value)} data-testid="shipping-tracking" className="w-full border border-ink/20 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <button onClick={saveShipping} data-testid="save-shipping-btn" className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-foreground/80">
                <Save size={14} /> {dejaPartie ? L("Enregistrer le suivi", "Save tracking") : L("Enregistrer et marquer expédiée", "Save & mark shipped")}
              </button>
              {tracking && order.fulfillment_status !== "delivered" && (
                <button onClick={syncDeliveredFromTracking} disabled={deliverySyncBusy} data-testid="sync-delivery-btn"
                  className="border border-ink/30 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-ink hover:text-white disabled:opacity-50"
                  title={L("Vérifier le repérage Postes Canada et passer la commande en livrée",
                           "Check Canada Post tracking and mark the order delivered")}>
                  <Truck size={14} /> {deliverySyncBusy ? L("Vérification…", "Checking…") : L("Vérifier la livraison", "Check delivery")}
                </button>
              )}
            </div>
            </>)}
            {order.shipping_info?.shipped_at && (
              <div className="font-mono text-[10px] text-foreground/50 mt-2">
                {L("Expédiée le", "Shipped")} {dateLongue(order.shipping_info.shipped_at, lang) || order.shipping_info.shipped_at}
              </div>
            )}
            {/* L'heure donnée par Postes Canada quand elle existe : telle
                quelle, fuseau compris. */}
            {order.shipping_info?.delivered_at && (
              <div className="font-mono text-[10px] text-foreground/50 mt-1" data-testid="order-delivered-at">
                {L("Livrée le", "Delivered")} {order.shipping_info.delivered_at_label
                  || dateLongue(order.shipping_info.delivered_at, lang) || order.shipping_info.delivered_at}
              </div>
            )}

            {/* Postes Canada : l'étiquette se génère depuis l'écran Dispatch.
                Ici, lecture seule : télécharger l'étiquette / le manifeste. */}
            {shipInfo?.label_url && (
              <div className="mt-4 pt-4 border-t border-ink/10 flex flex-wrap items-center gap-3">
                <a href={`${API_BASE.replace(/\/api$/, "")}${shipInfo.label_url}`} target="_blank" rel="noopener noreferrer"
                  data-testid="download-label-btn"
                  className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 inline-flex items-center gap-2">
                  <Download size={14} /> {L("Étiquette PDF", "Label PDF")}
                </a>
                <span className={`font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${
                  shipInfo.cp_transmitted ? "border-green-600 text-green-700" : "border-red-600 text-red-700"}`}>
                  {shipInfo.cp_transmitted ? L("Manifeste transmis", "Manifest transmitted") : L("Non transmis", "Not transmitted")}
                </span>
                {manifestUrl && (
                  <a href={manifestUrl} target="_blank" rel="noopener noreferrer" data-testid="download-manifest-btn" className={bouton}>
                    <Download size={14} /> {L("Manifeste PDF", "Manifest PDF")}
                  </a>
                )}
              </div>
            )}
          </div>
          )}

          {/* Ces deux actions n'existent que pour un paiement en attente.
              Ailleurs, le bloc s'affichait vide : un titre sans bouton. */}
          {EN_ATTENTE.includes(order.payment_status) && (
            <div className={carte} data-testid="order-status-actions">
              <div className={`${titre} mb-3`}>{L("Paiement en attente", "Awaiting payment")}</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => updateStatus("payment_status", "cancelled")} data-testid="cancel-order-btn"
                  className="border border-ink/30 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 hover:border-red-500 hover:text-red-500">
                  {L("Annuler la commande", "Cancel order")}
                </button>
                <button onClick={() => updateStatus("payment_status", "failed")} data-testid="mark-failed-btn"
                  className="border border-ink/30 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 hover:border-amber-500 hover:text-amber-500">
                  {L("Marquer échoué", "Mark failed")}
                </button>
              </div>
            </div>
          )}

          {/* Remboursement : LECTURE SEULE. La fiche ouvrait aussi des
              dossiers : un doublon de l'écran Remboursements, qui sait
              désormais ouvrir un dossier pour n'importe quelle commande,
              invités compris. Un seul endroit pour créer ; ici on lit. */}
          {order.refund_status && (
            <div className={carte} data-testid="order-refund">
              <div className={`${titre} mb-2`}>{L("Remboursement", "Refund")}</div>
              <div className="text-sm text-foreground/80" data-testid="refund-case-state">
                {L("Dossier", "Case")} : {ETAT_DOSSIER[order.refund_status]
                  ? L(ETAT_DOSSIER[order.refund_status].fr, ETAT_DOSSIER[order.refund_status].en)
                  : order.refund_status}
                {order.refund_reason ? ` : ${order.refund_reason}` : ""}
                {order.refunded_amount > 0 ? L(` · Remboursé : $${order.refunded_amount.toFixed(2)}`,
                                               ` · Refunded: $${order.refunded_amount.toFixed(2)}`) : ""}
              </div>
              {/* Dans le dossier aussi : c'est de cette date que part le
                  délai de 48 h annoncé au client. */}
              {order.shipping_info?.delivered_at && (
                <div className="text-sm text-foreground/70 mt-1" data-testid="refund-delivered-at">
                  {L("Livrée le", "Delivered")} {order.shipping_info.delivered_at_label
                    || dateLongue(order.shipping_info.delivered_at, lang) || order.shipping_info.delivered_at}
                </div>
              )}
              <div className="font-mono text-[10px] text-foreground/50 mt-1">
                {L("La décision et le versement se font dans l'écran Remboursements.",
                   "The decision and the payment happen in the Refunds screen.")}
              </div>
            </div>
          )}

          {/* Notes : la liste suit le défilement de la fiche. Elle avait sa
              propre barre de défilement, dans une fiche qui défile déjà. */}
          <div className={carte}>
            <div className={`${titre} mb-3 flex items-center gap-2`}><MessageSquarePlus size={12} /> {L("Notes", "Notes")}</div>
            <div className="space-y-2 mb-3">
              {regrouperReports(order.notes || []).map((n, i) => (
                <div key={i} className={`text-sm border-l-2 pl-3 py-1 ${n.visible_to_customer ? "border-emerald-500" : "border-ink/30"}`} data-testid={`note-${i}`}>
                  <div className="text-foreground/85">
                    {n.report && n.report.n > 1
                      ? L(`Reportée ${n.report.n} fois : du lot ${n.report.depuis} au lot ${n.report.jusqua} (étiquette non imprimée).`,
                          `Rolled over ${n.report.n} times : from batch ${n.report.depuis} to ${n.report.jusqua} (label not printed).`)
                      : n.text}
                  </div>
                  <div className="font-mono text-[10px] text-foreground/50 mt-1">
                    {n.admin_email || n.author} · {((n.ts || n.created_at) || "").slice(0, 16).replace("T", " ")}
                    {n.visible_to_customer && <span className="ml-2 text-emerald-600 font-bold">{L("VISIBLE CLIENT", "CUSTOMER")}</span>}
                  </div>
                </div>
              ))}
              {!order.notes?.length && <div className="font-mono text-[10px] text-foreground/50">{L("Aucune note.", "No notes yet.")}</div>}
            </div>
            <div className="flex gap-2">
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={L("Ajouter une note…", "Add a note…")} data-testid="note-input" className="flex-1 border border-ink/20 px-3 py-2 text-sm" />
              <button onClick={addNote} data-testid="add-note-btn" className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4">{L("Ajouter", "Add")}</button>
            </div>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={noteVisible} onChange={(e) => setNoteVisible(e.target.checked)} data-testid="note-visible-checkbox" />
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">
                {L("Visible par le client (envoie un courriel)", "Visible to customer (sends email)")}
              </span>
            </label>
          </div>

          {/* Zone sensible, séparée du reste et loin de la croix de fermeture. */}
          <div className="pt-2 border-t border-ink/10 flex justify-end">
            <button onClick={deleteOrder} data-testid="delete-order-btn"
              className="text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 text-foreground/50 hover:text-red-600">
              <Trash2 size={14} /> {L("Mettre à la corbeille", "Move to trash")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
