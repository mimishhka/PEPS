import { useEffect, useState, useCallback } from "react";
import { Printer, Send, RefreshCw, Package, AlertTriangle, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";

function labelHref(url) {
  if (!url) return "#";
  if (/^https?:\/\//.test(url)) return url;
  const root = API_BASE.replace(/\/api$/, "");
  return `${root}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function AdminDispatch() {
  const todayIso = new Date().toLocaleDateString("en-CA");
  const [date, setDate] = useState(todayIso);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [serviceCode, setServiceCode] = useState("DOM.XP");
  const [manifest, setManifest] = useState(null);
  const [manifestReady, setManifestReady] = useState(false);
  const [txBusy, setTxBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/dispatch/today", { params: { date } })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message))
      .finally(() => setLoading(false));
    api.get("/admin/shipping/pending-manifest")
      .then((r) => setManifest(r.data))
      .catch(() => {});
    api.get(`/admin/dispatch/${date}/manifest-status`)
      .then((r) => setManifestReady(!!r.data?.transmitted))
      .catch(() => setManifestReady(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const generateLabels = async () => {
    setLabelBusy(true);
    try {
      const { data: res } = await api.post(`/admin/dispatch/${date}/labels`, { service_code: serviceCode });
      const c = res.counts || {};
      toast.success(`Étiquettes : ${c.created} créées · ${c.skipped} déjà faites · ${c.failed} échec(s)`);
      if (res.failed?.length) {
        res.failed.forEach((f) => toast.error(`${f.order_number} : ${f.error}`));
      }
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLabelBusy(false);
    }
  };

  const openMerged = async (kind) => {
    if ((counts.labeled || 0) === 0) { toast.error("Aucune étiquette générée pour ce lot."); return; }
    const root = API_BASE.replace(/\/api$/, "");
    const path = kind === "labels" ? "labels.pdf" : "packing-slips.pdf";
    window.open(`${root}/api/admin/dispatch/${date}/${path}`, "_blank", "noopener");
    // Imprimer les étiquettes marque le lot comme imprimé : il ne sera plus
    // reporté au lendemain par le report automatique de minuit.
    if (kind === "labels") {
      try {
        await api.post(`/admin/dispatch/${date}/mark-printed`);
        load();
      } catch { /* non bloquant */ }
    }
  };

  const transmit = async () => {
    if (!window.confirm("Transmettre le manifeste à Postes Canada ? À faire une fois par jour, après impression.")) return;
    setTxBusy(true);
    try {
      const { data: res } = await api.post("/admin/shipping/transmit");
      toast.success(`Manifeste transmis · ${res.orders_marked} commande(s) · ${res.transmitted_groups?.length || 0} lot(s)`);
      setManifestReady(true);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setTxBusy(false);
    }
  };

  const counts = data?.counts || { to_label: 0, labeled: 0, overdue: 0 };
  const configured = data?.configured;

  return (
    <div data-testid="admin-dispatch">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight flex items-center gap-2">
            <Package size={26} /> Dispatch
          </h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">
            Lot d'expédition — cutoff 13 h (HE). Payé avant 13 h un jour ouvrable = expédié le jour même.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="dispatch-date"
            className="border border-ink/20 px-3 py-2 font-mono text-sm"
          />
          <button onClick={load} data-testid="dispatch-refresh" className="border border-ink/20 p-2 hover:bg-ink/5" title="Rafraîchir">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {!configured && (
        <div className="mt-6 flex items-center gap-2 bg-yellow-50 border border-yellow-300 text-yellow-900 px-4 py-3 font-mono text-xs" data-testid="dispatch-not-configured">
          <AlertTriangle size={15} /> Postes Canada n'est pas configuré (clés API manquantes). La génération d'étiquettes est désactivée.
        </div>
      )}

      {manifest && manifest.pending_count > 0 && (
        <div className="mt-6 flex items-center justify-between bg-red-50 border border-red-300 text-red-900 px-4 py-3" data-testid="dispatch-manifest-banner">
          <div className="font-mono text-xs flex items-center gap-2">
            <AlertTriangle size={15} />
            {manifest.pending_count} étiquette(s) non transmise(s) — surcharge de 2 $/article tant que le manifeste n'est pas envoyé.
          </div>
          <button onClick={transmit} disabled={txBusy} data-testid="dispatch-transmit"
            className="bg-red-600 text-white font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
            <Send size={14} /> {txBusy ? "…" : "Transmettre le manifeste"}
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-4">
        <Stat label="À étiqueter" value={counts.to_label}
