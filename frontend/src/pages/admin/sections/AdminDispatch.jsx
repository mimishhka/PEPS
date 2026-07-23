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
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setTxBusy(false);
    }
  };

  const counts = data?.counts || { to_label: 0, labeled: 0, packed_history: 0, overdue: 0 };
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
        <Stat label="Empaquetées (jour)" value={counts.packed_history || 0} testid="stat-packed-history" />
        <Stat label="Étiquetées" value={counts.labeled} testid="stat-labeled" />
        <Stat label="En retard" value={counts.overdue} accent={counts.overdue > 0} testid="stat-overdue" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 bg-white border border-ink/10 p-4">
        <label className="font-mono text-xs text-foreground/60">Service</label>
        <select value={serviceCode} onChange={(e) => setServiceCode(e.target.value)} data-testid="dispatch-service"
          className="border border-ink/20 px-3 py-2 font-mono text-sm">
          <option value="DOM.XP">DOM.XP — Xpresspost</option>
          <option value="DOM.EP">DOM.EP — Expedited Parcel</option>
          <option value="DOM.RP">DOM.RP — Regular Parcel</option>
          <option value="DOM.PC">DOM.PC — Priority</option>
        </select>
        <button onClick={generateLabels} disabled={labelBusy || !configured || counts.to_label === 0}
          data-testid="dispatch-generate"
          className="bg-ink text-white font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-ink/80 disabled:opacity-40 flex items-center gap-2">
          <Package size={14} /> {labelBusy ? "Génération…" : `Générer les étiquettes (${counts.to_label})`}
        </button>
        <button onClick={() => openMerged("labels")} disabled={counts.labeled === 0} data-testid="dispatch-print-labels"
          className="border border-ink/20 font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-ink/5 disabled:opacity-40 flex items-center gap-2">
          <Printer size={14} /> Imprimer étiquettes ({counts.labeled})
        </button>
        <button onClick={() => openMerged("slips")} disabled={counts.labeled === 0} data-testid="dispatch-print-slips"
          className="border border-ink/20 font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-ink/5 disabled:opacity-40 flex items-center gap-2">
          <Printer size={14} /> Imprimer bons ({counts.labeled})
        </button>
      </div>

      <Section title="Empaquetées — historique du jour" empty="Aucune commande empaquetée pour ce jour." rows={data?.packed_history} testid="table-packed-history"
        render={(o) => (
          <tr key={o.id} className="border-t border-ink/10" data-testid={`dispatch-packed-${o.order_number}`}>
            <td className="px-4 py-3 font-mono text-xs font-bold">{o.order_number}</td>
            <td className="px-4 py-3 text-sm">{o.city}, {o.province}</td>
            <td className="px-4 py-3 font-mono text-xs">{o.items} art.</td>
            <td className="px-4 py-3 font-mono text-[11px] text-right">
              {o.label_url || o.tracking_number ? "étiquetée" : "à étiqueter"}
            </td>
            <td className="px-4 py-3 text-right">
              {o.label_url ? (
                <a href={labelHref(o.label_url)} target="_blank" rel="noopener noreferrer"
                  data-testid={`dispatch-packed-label-link-${o.order_number}`}
                  className="inline-flex items-center gap-1 font-mono text-xs text-ink underline hover:text-ink/70">
                  Étiquette <ExternalLink size={12} />
                </a>
              ) : <span className="font-mono text-[11px] text-foreground/40">—</span>}
            </td>
          </tr>
        )}
      />

      <Section title="À étiqueter" empty="Aucune commande payée en attente pour ce lot." rows={data?.to_label} testid="table-tolabel"
        render={(o) => (
          <tr key={o.id} className="border-t border-ink/10" data-testid={`dispatch-row-${o.order_number}`}>
            <td className="px-4 py-3 font-mono text-xs font-bold">{o.order_number}</td>
            <td className="px-4 py-3 text-sm">{o.city}, {o.province}</td>
            <td className="px-4 py-3 font-mono text-xs">{o.items} art.</td>
            <td className="px-4 py-3 font-mono text-xs text-right">${(o.total ?? 0).toFixed(2)}</td>
            <td className="px-4 py-3 text-right font-mono text-[11px] text-foreground/50">en attente</td>
          </tr>
        )}
      />

      <Section title="Étiquetées — prêtes à imprimer" empty="Aucune étiquette générée pour ce lot." rows={data?.labeled} testid="table-labeled"
        render={(o) => (
          <tr key={o.id} className="border-t border-ink/10" data-testid={`dispatch-labeled-${o.order_number}`}>
            <td className="px-4 py-3 font-mono text-xs font-bold">{o.order_number}</td>
            <td className="px-4 py-3 text-sm">{o.city}, {o.province}</td>
            <td className="px-4 py-3 font-mono text-xs">{o.tracking_number}</td>
            <td className="px-4 py-3 font-mono text-[11px]">
              {o.cp_transmitted
                ? <span className="text-green-700 flex items-center gap-1"><CheckCircle2 size={12} /> transmis</span>
                : <span className="text-yellow-700">non transmis</span>}
            </td>
            <td className="px-4 py-3 text-right">
              <a href={labelHref(o.label_url)} target="_blank" rel="noopener noreferrer"
                data-testid={`dispatch-label-link-${o.order_number}`}
                className="inline-flex items-center gap-1 font-mono text-xs text-ink underline hover:text-ink/70">
                Étiquette <ExternalLink size={12} />
              </a>
            </td>
          </tr>
        )}
      />
    </div>
  );
}

function Stat({ label, value, accent, testid }) {
  return (
    <div className={`bg-white border p-5 ${accent ? "border-red-300" : "border-ink/10"}`} data-testid={testid}>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">{label}</div>
      <div className={`font-display text-4xl font-extrabold mt-1 ${accent ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, rows, render, empty, testid }) {
  return (
    <div className="mt-8">
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60 mb-3">{title}</h2>
      <div className="bg-white border border-ink/10 overflow-x-auto" data-testid={testid}>
        {rows && rows.length ? (
          <table className="w-full">
            <tbody>{rows.map(render)}</tbody>
          </table>
        ) : (
          <div className="px-6 py-10 text-center font-mono text-xs text-foreground/50">{empty}</div>
        )}
      </div>
    </div>
  );
}
