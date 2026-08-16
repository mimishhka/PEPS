// Section Système › File d'attente. Visibilité et contrôle de la file Resend :
// KPI de santé, table paginée, rejeu/abandon unitaire et en masse.
// (AdminEmails.jsx édite les *gabarits* ; cette page pilote les *envois*.)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Mail, RefreshCw, RotateCcw, Eye, Ban, Download, X, AlertTriangle, Unplug,
} from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import { useConfirm } from "../../../components/ConfirmDialog";

const PAGE_SIZE = 50;
const KPI_REFRESH_MS = 15000;
const SEARCH_DEBOUNCE_MS = 400;
const STATUSES = ["pending", "retry", "sending", "sent", "failed", "cancelled"];

const STATUS_TONE = {
  sent: "bg-success/10 text-success border-success/30",
  pending: "bg-clinical text-glacier border-ash",
  retry: "bg-warning/10 text-warning border-warning/30",
  sending: "bg-nova/10 text-nova border-nova/30",
  failed: "bg-error/10 text-error border-error/30",
  cancelled: "bg-clinical text-glacier border-ash",
};

function humanAge(seconds, L) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? L(`${h} h ${m} min`, `${h}h ${m}min`) : L(`${m} min`, `${m}min`);
}

export default function AdminEmailOutbox() {
  const { lang } = useLang();
  const L = useCallback((fr, en) => (lang === "fr" ? fr : en), [lang]);
  const confirm = useConfirm();

  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/emails/outbox-stats");
      setStats(data);
    } catch { /* le bandeau KPI reste sur la dernière valeur connue */ }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (statusFilter.length) params.set("status", statusFilter.join(","));
      if (debouncedSearch) params.set("q", debouncedSearch);
      const { data } = await api.get(`/admin/emails/list?${params}`);
      setRows(data.items || []);
      setTotal(data.total || 0);
      setHasMore(Boolean(data.has_more));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => { loadStats(); loadRows(); }, KPI_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, loadStats, loadRows]);

  const refreshAll = useCallback(() => { loadStats(); loadRows(); }, [loadStats, loadRows]);

  const toggleStatus = (status) => {
    setStatusFilter((cur) =>
      cur.includes(status) ? cur.filter((s) => s !== status) : [...cur, status]);
    setPage(0);
  };

  const rowAction = async (id, action, label) => {
    setBusyId(id);
    try {
      await api.post(`/admin/emails/${id}/${action}`);
      toast.success(label);
      refreshAll();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusyId(null);
    }
  };

  const bulkRequeue = async (scope, question) => {
    if (!(await confirm({ title: question }))) return;
    try {
      const { data } = await api.post("/admin/emails/requeue", { scope, max: 500 });
      toast.success(L(`${data.requeued} courriel(s) remis en file`,
                      `${data.requeued} email(s) requeued`));
      refreshAll();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/admin/emails/${id}`);
      setDetail(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const exportCsv = () => {
    const header = ["created_at", "status", "to", "subject", "attempts", "error_type"];
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) =>
      header.map((h) => escape(Array.isArray(r[h]) ? r[h].join(" ") : r[h])).join(","));
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-outbox-page-${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = stats?.counts || {};
  const staleQueue = (stats?.oldest_active_age_seconds ?? 0) > 1800;
  const floodOfFailures = (counts.failed ?? 0) > 100;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const recipients = (to) => (Array.isArray(to) ? to.join(", ") : to || "—");

  const kpis = useMemo(() => ([
    { key: "sent", label: L("Envoyés", "Sent"), tone: "text-success" },
    { key: "retry", label: L("À rejouer", "Retry"), tone: "text-warning" },
    { key: "failed", label: L("Échecs", "Failed"), tone: "text-error" },
    { key: "sending", label: L("En cours", "Sending"), tone: "text-nova" },
  ]), [L]);

  return (
    <div className="p-8" data-testid="admin-emails-panel">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="font-data text-[11px] uppercase tracking-[0.3em] text-nova">// {L("FILE D'ATTENTE", "OUTBOX")}</div>
          <h1 className="font-display text-4xl font-bold tracking-[-0.01em] mt-2 text-nordfjord">
            {L("Courriels", "Emails")}
          </h1>
        </div>
        <label className="flex items-center gap-2 font-data text-[11px] uppercase tracking-[0.2em] text-glacier cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            data-testid="admin-emails-auto-refresh-toggle"
          />
          {L("Auto-actualisation 15 s", "Auto-refresh 15s")}
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {kpis.map((k) => (
          <div key={k.key} className="bg-white border border-ash p-6 rounded-md"
               data-testid={`admin-emails-kpi-${k.key}`}>
            <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">{k.label}</div>
            <div className={`font-display text-3xl font-bold mt-2 tabular-nums ${k.tone}`}>
              {counts[k.key] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {stats && (
        <p className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-4">
          {L("Plus ancien actif", "Oldest active")}: {humanAge(stats.oldest_active_age_seconds, L)}
          {" · "}
          {L("tentatives moy. sur échecs", "avg attempts on failed")}: {stats.avg_attempts_on_failed ?? "—"}
          {" · "}
          {L("balayage janitor", "janitor sweep")}: {Math.round((stats.janitor_interval_s || 0) / 60)} min
        </p>
      )}

      {staleQueue && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/5 p-4 flex items-center gap-3"
             data-testid="admin-emails-alert-stale">
          <AlertTriangle size={16} className="text-warning" />
          <span className="text-sm text-nordfjord">
            {L("La file traîne depuis plus de 30 minutes — vérifiez la clé Resend ou le worker.",
               "The queue has been backed up for over 30 minutes — check the Resend key or the worker.")}
          </span>
        </div>
      )}
      {floodOfFailures && (
        <div className="mb-4 rounded-md border border-error/40 bg-error/5 p-4 flex items-center gap-3"
             data-testid="admin-emails-alert-failures">
          <Unplug size={16} className="text-error" />
          <span className="text-sm text-nordfjord">
            {L(`${counts.failed} échecs en file — incident fournisseur probable.`,
               `${counts.failed} failures queued — likely a provider incident.`)}
          </span>
        </div>
      )}

      {/* Filtres + actions groupées */}
      <div className="bg-white border border-ash rounded-md p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" data-testid="admin-emails-filter-status">
          {STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => toggleStatus(st)}
              data-testid={`admin-emails-filter-status-${st}`}
              className={`font-data text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 border rounded transition-colors ${
                statusFilter.includes(st)
                  ? "bg-nordfjord text-white border-nordfjord"
                  : `${STATUS_TONE[st]} hover:border-nordfjord`
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={L("Sujet ou destinataire…", "Subject or recipient…")}
          data-testid="admin-emails-filter-search"
          className="flex-1 min-w-[200px] border border-ash rounded px-3 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <button type="button" onClick={refreshAll} disabled={loading}
                  data-testid="admin-emails-refresh"
                  className="p-2 border border-ash rounded hover:bg-clinical disabled:opacity-40">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            data-testid="admin-emails-bulk-retry-failed"
            onClick={() => bulkRequeue("failed", L("Rejouer tous les courriels en échec ?",
                                                   "Retry every failed email?"))}
            className="font-data text-[10px] uppercase tracking-[0.2em] px-3 py-2 border border-ash rounded hover:bg-clinical"
          >
            {L("Rejouer les échecs", "Retry failed")}
          </button>
          <button
            type="button"
            data-testid="admin-emails-bulk-unstick"
            onClick={() => bulkRequeue("stuck", L("Débloquer les envois figés ?",
                                                  "Unstick stalled sends?"))}
            className="font-data text-[10px] uppercase tracking-[0.2em] px-3 py-2 border border-ash rounded hover:bg-clinical"
          >
            {L("Débloquer", "Unstick")}
          </button>
          <button type="button" onClick={exportCsv} data-testid="admin-emails-bulk-export"
                  className="font-data text-[10px] uppercase tracking-[0.2em] px-3 py-2 border border-ash rounded hover:bg-clinical flex items-center gap-1.5">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-ash rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-clinical text-glacier">
            <tr>
              {[L("Date", "Date"), L("Statut", "Status"), L("Destinataire", "To"),
                L("Sujet", "Subject"), L("Tent.", "Att."), ""].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`admin-emails-row-${r.id}`}
                  className="border-t border-ash/40 hover:bg-clinical/60">
                <td className="px-4 py-3 font-data text-[11px] text-glacier whitespace-nowrap">
                  {(r.created_at || "").slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block font-data text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 border rounded ${STATUS_TONE[r.status] || ""}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-data text-[11px] text-glacier">{recipients(r.to)}</td>
                <td className="px-4 py-3 text-nordfjord max-w-xs truncate">{r.subject}</td>
                <td className="px-4 py-3 font-data tabular-nums text-glacier">{r.attempts ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button type="button" title={L("Rejouer", "Retry")}
                            disabled={busyId === r.id}
                            data-testid={`admin-emails-retry-${r.id}`}
                            onClick={() => rowAction(r.id, "retry", L("Remis en file", "Requeued"))}
                            className="p-1.5 border border-ash rounded hover:bg-nordfjord hover:text-white disabled:opacity-40">
                      <RotateCcw size={12} />
                    </button>
                    <button type="button" title={L("Aperçu", "Preview")}
                            data-testid={`admin-emails-view-${r.id}`}
                            onClick={() => openDetail(r.id)}
                            className="p-1.5 border border-ash rounded hover:bg-nordfjord hover:text-white">
                      <Eye size={12} />
                    </button>
                    <button type="button" title={L("Abandonner", "Cancel")}
                            disabled={busyId === r.id || r.status === "cancelled"}
                            data-testid={`admin-emails-cancel-${r.id}`}
                            onClick={async () => {
                              if (!(await confirm({ title: L("Abandonner ce courriel ?", "Cancel this email?") }))) return;
                              rowAction(r.id, "cancel", L("Courriel abandonné", "Email cancelled"));
                            }}
                            className="p-1.5 border border-ash rounded hover:bg-error hover:text-white disabled:opacity-40">
                      <Ban size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={6} className="px-6 py-10 text-center font-data text-xs text-glacier">
                <Mail size={18} className="mx-auto mb-2 opacity-40" />
                {L("Aucun courriel pour ces filtres", "No emails match these filters")}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 font-data text-[11px] uppercase tracking-[0.2em] text-glacier">
        <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                data-testid="admin-emails-pagination-prev"
                className="px-3 py-2 border border-ash rounded disabled:opacity-30 hover:bg-clinical">
          ← {L("Précédent", "Prev")}
        </button>
        <span data-testid="admin-emails-pagination-info">
          {L("Page", "Page")} {page + 1} / {lastPage} · {total} {L("courriels", "emails")}
        </span>
        <button type="button" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}
                data-testid="admin-emails-pagination-next"
                className="px-3 py-2 border border-ash rounded disabled:opacity-30 hover:bg-clinical">
          {L("Suivant", "Next")} →
        </button>
      </div>

      {/* Drawer d'aperçu */}
      {detail && (
        <div className="fixed inset-0 z-50 flex" data-testid="admin-emails-drawer">
          <button type="button" aria-label={L("Fermer", "Close")}
                  className="flex-1 bg-nordfjord/30" onClick={() => setDetail(null)} />
          <aside className="w-full max-w-2xl bg-white border-l border-ash flex flex-col">
            <header className="flex items-start justify-between gap-4 p-6 border-b border-ash">
              <div className="min-w-0">
                <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">
                  {detail.status} · {detail.attempts ?? 0} {L("tentative(s)", "attempt(s)")}
                </div>
                <h2 className="font-display text-xl font-bold text-nordfjord mt-1 truncate">{detail.subject}</h2>
                <div className="font-data text-[11px] text-glacier mt-1 truncate">
                  {recipients(detail.to)}
                  {detail.error_type && <span className="text-error"> · {detail.error_type}</span>}
                </div>
              </div>
              <button type="button" onClick={() => setDetail(null)} data-testid="admin-emails-drawer-close"
                      className="p-1.5 border border-ash rounded hover:bg-clinical shrink-0">
                <X size={14} />
              </button>
            </header>
            <div className="flex-1 overflow-auto bg-clinical p-4">
              {detail.html ? (
                <iframe
                  title={L("Aperçu du courriel", "Email preview")}
                  srcDoc={detail.html}
                  sandbox=""
                  data-testid="admin-emails-drawer-html-iframe"
                  className="w-full h-full min-h-[60vh] bg-white border border-ash"
                />
              ) : (
                <p className="font-data text-xs text-glacier p-4">
                  {L("Le corps est purgé une fois le courriel envoyé.",
                     "The body is purged once the email is sent.")}
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
