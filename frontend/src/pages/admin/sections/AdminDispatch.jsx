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
  const [manifestStatus, setManifestStatus] = useState(null);
  const [cpConfig, setCpConfig] = useState(null);
  const [txBusy, setTxBusy] = useState(false);
  const [voidBusy, setVoidBusy] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/dispatch/today", { params: { date, service_code: serviceCode } })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message))
      .finally(() => setLoading(false));
    api.get("/admin/shipping/pending-manifest")
      .then((r) => setManifest(r.data))
      .catch(() => {});
    api.get(`/admin/dispatch/${date}/manifest-status`)
      .then((r) => setManifestStatus(r.data))
      .catch(() => setManifestStatus({ transmitted: false, manifests: 0 }));
    api.get("/admin/shipping/config-status")
      .then((r) => setCpConfig(r.data))
      .catch(() => setCpConfig(null));
  }, [date, serviceCode]);

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

  const voidLabel = async (o) => {
    if (o.cp_transmitted) {
      toast.error("Étiquette déjà transmise — utilisez le remboursement.");
      return;
    }
    if (!window.confirm(`Annuler l'étiquette de ${o.order_number} ? La commande retourne « à étiqueter ».`)) return;
    setVoidBusy(o.id);
    try {
      await api.post(`/admin/orders/${o.id}/void-label`);
      toast.success(`Étiquette annulée — ${o.order_number}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setVoidBusy(null);
    }
  };

  const openManifest = () => {
    if (!manifestStatus?.transmitted) {
      toast.error("Aucun manifeste transmis pour cette date.");
      return;
    }
    const root = API_BASE.replace(/\/api$/, "");
    window.open(`${root}/api/admin/dispatch/${date}/manifest.pdf`, "_blank", "noopener");
  };

  const counts = data?.counts || { to_label: 0, labeled: 0, overdue: 0 };
  const totals = data?.totals;
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

      {cpConfig && (
        <div className="mt-3 bg-white border border-ink/10 px-4 py-3 font-mono text-[11px] text-foreground/70" data-testid="dispatch-cp-config">
          <div>
            Mode: <span className="font-bold">{cpConfig.using_openapi ? "openapi" : "legacy"}</span> ·
            Env: <span className="font-bold">{cpConfig.environment || "n/a"}</span> ·
            Config: <span className={cpConfig.configured ? "text-green-700 font-bold" : "text-red-700 font-bold"}>{cpConfig.configured ? "ok" : "incomplète"}</span>
          </div>
          {!cpConfig.configured && cpConfig.missing_required?.length > 0 && (
            <div className="mt-1 text-red-700">Manquants: {cpConfig.missing_required.join(", ")}</div>
          )}
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
        <Stat label="À étiqueter" value={counts.to_label} testid="stat-tolabel" />
        <Stat label="Étiquetées" value={counts.labeled} testid="stat-labeled" />
        <Stat label="En retard" value={counts.overdue} accent={counts.overdue > 0} testid="stat-overdue" />
      </div>

      {totals && (totals.labels_cost > 0 || totals.shipping_charged > 0 || totals.customer_shipping_charged > 0) && (
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-4" data-testid="dispatch-financials">
          <Money label="Coût étiquettes" value={totals.labels_cost} />
          <Money label="Facturé par Postes Canada" value={totals.shipping_charged} />
          <Money label="Facturé au client" value={totals.customer_shipping_charged} />
          <Money label="Écart" value={totals.margin} accent={totals.margin < 0} />
          <Money label="Manifeste (total dû)" value={totals.manifest?.total_due} muted />
        </div>
      )}

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
        <button
          onClick={openManifest}
          disabled={!manifestStatus?.transmitted}
          data-testid="dispatch-view-manifest"
          className="border border-ink/20 font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-ink/5 disabled:opacity-40 flex items-center gap-2"
          title={manifestStatus?.transmitted ? "Voir et imprimer le manifeste" : "Aucun manifeste transmis pour cette date"}
        >
          <Printer size={14} /> Manifeste ({manifestStatus?.manifests || 0})
        </button>
      </div>

      <Section title="À étiqueter" empty="Aucune commande payée en attente pour ce lot." rows={data?.to_label} testid="table-tolabel"
        render={(o) => (
          <tr key={o.id} className="border-t border-ink/10" data-testid={`dispatch-row-${o.order_number}`}>
            <td className="px-4 py-3 font-mono text-xs font-bold">{o.order_number}</td>
            <td className="px-4 py-3 text-sm">{o.city}, {o.province}</td>
            <td className="px-4 py-3 font-mono text-xs">{o.items} art.</td>
            <td className="px-4 py-3 font-mono text-xs text-right">
              {o.line_label_cost != null ? `$${Number(o.line_label_cost).toFixed(2)}` : "—"}
              {o.line_label_cost_source === "estimated_cp" ? <span className="block text-[10px] text-foreground/40">estimé CP {o.estimated_eta_days ? `· ${o.estimated_eta_days} j` : ""}</span> : null}
              {o.line_label_cost_source === "estimated_cp_alt" ? <span className="block text-[10px] text-foreground/40">estimé CP</span> : null}
            </td>
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
            <td className="px-4 py-3 font-mono text-xs text-right">
              {o.line_label_cost != null ? `$${Number(o.line_label_cost).toFixed(2)}` : "—"}
              {o.line_label_cost_source === "actual_cp" ? <span className="block text-[10px] text-foreground/40">réel CP</span> : null}
              {o.rated_weight_kg ? <span className="block text-[10px] text-foreground/40">{o.rated_weight_kg} kg</span> : null}
            </td>
            <td className="px-4 py-3 font-mono text-[11px]">
              {o.cp_transmitted
                ? <span className="text-green-700 flex items-center gap-1"><CheckCircle2 size={12} /> transmis</span>
                : <span className="text-yellow-700">non transmis</span>}
            </td>
            <td className="px-4 py-3 text-right">
              <div className="inline-flex items-center gap-3">
                <a href={labelHref(o.label_url)} target="_blank" rel="noopener noreferrer"
                  data-testid={`dispatch-label-link-${o.order_number}`}
                  className="inline-flex items-center gap-1 font-mono text-xs text-ink underline hover:text-ink/70">
                  Étiquette <ExternalLink size={12} />
                </a>
                <button onClick={() => voidLabel(o)} disabled={voidBusy === o.id || o.cp_transmitted}
                  data-testid={`dispatch-void-${o.order_number}`}
                  title={o.cp_transmitted ? "Déjà transmise: annulation impossible" : "Annuler cette étiquette (gratuit tant qu'elle n'est pas transmise)"}
                  className="font-mono text-xs text-red-600 underline hover:opacity-70 disabled:opacity-40">
                  {voidBusy === o.id ? "…" : (o.cp_transmitted ? "Annuler (bloqué)" : "Annuler")}
                </button>
              </div>
            </td>
          </tr>
        )}
      />
    </div>
  );
}

function Money({ label, value, accent, muted }) {
  const v = value == null ? null : Number(value);
  return (
    <div className={`bg-white border p-4 ${accent ? "border-red-300" : "border-ink/10"}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">{label}</div>
      <div className={`font-display text-2xl font-extrabold mt-1 ${accent ? "text-red-600" : muted ? "text-foreground/50" : ""}`}>
        {v == null ? "—" : `$${v.toFixed(2)}`}
      </div>
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
