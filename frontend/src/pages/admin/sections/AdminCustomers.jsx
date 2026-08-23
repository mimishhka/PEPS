// frontend/src/pages/admin/sections/AdminCustomers.jsx
// Clients & rétention : segments, dépenses cumulées, historique, réengagement.
import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Users, Search, X, Mail, TrendingUp, ShoppingBag, Clock } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import { Th } from "../ui";

const SEGMENTS = {
  loyal:    { fr: "Fidèles",   en: "Loyal",    color: "bg-nova/15 text-nova border-nova/30" },
  active:   { fr: "Actifs",    en: "Active",   color: "bg-success/15 text-success border-success/30" },
  cooling:  { fr: "Refroidissent", en: "Cooling", color: "bg-amber-100 text-amber-700 border-amber-300" },
  at_risk:  { fr: "À risque",  en: "At risk",  color: "bg-orange-100 text-orange-700 border-orange-300" },
  dormant:  { fr: "Inactifs",  en: "Dormant",  color: "bg-red-100 text-red-700 border-red-300" },
  prospect: { fr: "Sans achat", en: "No purchase", color: "bg-slate-100 text-slate-500 border-slate-300" },
};
const PAGE_SIZE = 50;

export default function AdminCustomers() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [rows, setRows] = useState([]);
  const [segCounts, setSegCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("all");
  const [sort, setSort] = useState("spent");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/customers");
      setRows(data.customers || []);
      setSegCounts(data.segment_counts || {});
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    setDetailLoading(true); setDetail({ loading: true });
    try {
      const { data } = await api.get(`/admin/customers/${id}`);
      setDetail(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let r = rows;
    if (seg !== "all") r = r.filter((c) => c.segment === seg);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter((c) => (c.name || "").toLowerCase().includes(s) || (c.email || "").toLowerCase().includes(s));
    }
    const sorted = [...r];
    if (sort === "spent") sorted.sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0));
    else if (sort === "orders") sorted.sort((a, b) => (b.orders_count || 0) - (a.orders_count || 0));
    else if (sort === "recent") sorted.sort((a, b) => (b.last_order_at || "").localeCompare(a.last_order_at || ""));
    else sorted.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return sorted;
  }, [rows, seg, q, sort]);

  const money = (n) => `$${Number(n || 0).toFixed(2)}`;
  const dateShort = (iso) => (iso ? iso.slice(0, 10) : "—");
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [q, seg, sort]);

  return (
    <div data-testid="admin-customers">
      <div className="mb-6">
        <div className="font-data text-[11px] uppercase tracking-[0.24em] text-glacier">{L("VENTES", "SALES")}</div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Users size={26} /> {L("Clients", "Customers")}
        </h1>
        <p className="text-sm text-glacier mt-1">
          {rows.length} {L("clients inscrits", "registered customers")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <SegChip active={seg === "all"} onClick={() => setSeg("all")} label={L("Tous", "All")} count={rows.length} />
        {Object.entries(SEGMENTS).map(([key, meta]) =>
          segCounts[key] ? (
            <SegChip key={key} active={seg === key} onClick={() => setSeg(key)}
              label={L(meta.fr, meta.en)} count={segCounts[key] || 0} color={meta.color} />
          ) : null
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-glacier/70" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Nom ou courriel…", "Name or email…")}
            className="w-full rounded-lg border border-ash pl-9 pr-3 py-2 text-sm outline-none focus:border-nova" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-ash px-3 py-2 text-sm outline-none focus:border-nova bg-white">
          <option value="spent">{L("Dépenses ↓", "Spending ↓")}</option>
          <option value="orders">{L("Commandes ↓", "Orders ↓")}</option>
          <option value="recent">{L("Commande récente", "Recent order")}</option>
          <option value="joined">{L("Inscription", "Joined")}</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-glacier py-16 text-center">{L("Chargement…", "Loading…")}</p>
      ) : (
        <div className="bg-white border border-ash rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[L("Client", "Customer"), L("Segment", "Segment"), L("Commandes", "Orders"),
                  L("Dépensé", "Spent"), L("Dernière", "Last"), ""].map((h, i) => (
                  <Th key={i}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const meta = SEGMENTS[c.segment] || SEGMENTS.prospect;
                return (
                  <tr key={c.id} className="border-t border-ash/50 hover:bg-clinical/50 cursor-pointer"
                    onClick={() => openDetail(c.id)} data-testid={`customer-${c.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-nordfjord">{c.name || "—"}</div>
                      <div className="font-data text-[11px] text-glacier">{c.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border ${meta.color}`}>
                        {L(meta.fr, meta.en)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-data">{c.orders_count || 0}</td>
                    <td className="px-4 py-3 font-data font-semibold">{money(c.total_spent)}</td>
                    <td className="px-4 py-3 font-data text-[11px] text-glacier">{dateShort(c.last_order_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}
                        className="inline-flex text-glacier/70 hover:text-nova" title={L("Écrire", "Email")}>
                        <Mail size={15} />
                      </a>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-glacier">
                  {L("Aucun client", "No customers")}
                </td></tr>
              )}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-ash px-4 py-3">
              <span className="font-data text-xs text-glacier">
                {L("Page", "Page")} {page} / {pageCount}
              </span>
              <div className="flex gap-2">
                <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}
                  className="rounded-md border border-ash px-3 py-1.5 text-xs disabled:opacity-40">
                  {L("Précédent", "Previous")}
                </button>
                <button type="button" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}
                  className="rounded-md border border-ash px-3 py-1.5 text-xs disabled:opacity-40">
                  {L("Suivant", "Next")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetail(null)}>
          <div className="absolute inset-0 bg-nordfjord/30" />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-nordfjord text-white px-5 py-4 flex items-center justify-between">
              <span className="font-display font-bold">{L("Fiche client", "Customer")}</span>
              <button onClick={() => setDetail(null)} className="text-white/70 hover:text-white"><X size={20} /></button>
            </div>
            {detail.loading || detailLoading ? (
              <p className="p-8 text-center text-sm text-glacier">{L("Chargement…", "Loading…")}</p>
            ) : detail.customer ? (
              <div className="p-5 space-y-5">
                <div>
                  <div className="font-display text-xl font-extrabold text-nordfjord">{detail.customer.name || "—"}</div>
                  <div className="font-data text-xs text-glacier">{detail.customer.email}</div>
                  <div className="font-data text-[11px] text-glacier/70 mt-1">
                    {L("Inscrit le", "Joined")} {dateShort(detail.customer.created_at)}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat icon={TrendingUp} label={L("Dépensé", "Spent")} value={money(detail.summary.total_spent)} />
                  <Stat icon={ShoppingBag} label={L("Commandes", "Orders")} value={detail.summary.paid_orders} />
                  <Stat icon={Clock} label={L("Panier moy.", "AOV")} value={money(detail.summary.aov)} />
                </div>
                <a href={`mailto:${detail.customer.email}`}
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-nova text-nordfjord font-semibold py-2.5 text-sm hover:brightness-95 transition">
                  <Mail size={15} /> {L("Contacter ce client", "Contact customer")}
                </a>
                <div>
                  <div className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-2">
                    {L("Historique", "Order history")}
                  </div>
                  <div className="space-y-2">
                    {(detail.orders || []).map((o) => (
                      <div key={o.id} className="rounded-lg border border-ash px-3 py-2 flex items-center justify-between">
                        <div>
                          <div className="font-data text-xs font-semibold text-nordfjord">{o.order_number}</div>
                          <div className="font-data text-[10px] text-glacier">{dateShort(o.created_at)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-data font-semibold text-sm">{money(o.total)}</div>
                          <div className={`font-data text-[10px] uppercase ${o.payment_status === "paid" ? "text-success" : "text-warning"}`}>
                            {o.payment_status}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!(detail.orders || []).length && (
                      <p className="text-xs text-glacier/70 py-4 text-center">{L("Aucune commande", "No orders")}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function SegChip({ active, onClick, label, count, color }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
        active ? "bg-nordfjord text-white border-nordfjord" : (color || "bg-white text-glacier border-ash") + " hover:border-nova"}`}>
      {label} <span className="opacity-60">· {count}</span>
    </button>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-clinical border border-ash p-2.5 text-center">
      <Icon size={14} className="mx-auto text-nova mb-1" />
      <div className="font-data font-bold text-sm text-nordfjord">{value}</div>
      <div className="font-data text-[10px] uppercase tracking-wider text-glacier">{label}</div>
    </div>
  );
}
