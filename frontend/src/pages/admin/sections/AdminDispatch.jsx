import { useEffect, useState, useCallback } from "react";
import { Printer, Send, RefreshCw, Package, AlertTriangle, ExternalLink, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";
import { useConfirm } from "../../../components/ConfirmDialog";
import { Th } from "../ui";

const PAGE_SIZE = 50;

function labelHref(url) {
  if (!url) return "#";
  if (/^https?:\/\//.test(url)) return url;
  const root = API_BASE.replace(/\/api$/, "");
  return `${root}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function AdminDispatch() {
  const confirm = useConfirm();
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
  const [boxOverrides, setBoxOverrides] = useState({});
  const [priceBusy, setPriceBusy] = useState({});

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
    if (!await confirm({ title: "Transmettre le manifeste à Postes Canada ?", description: "À faire une fois par jour, après impression.", destructive: true })) return;
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
    if (!await confirm({ title: `Annuler l'étiquette de ${o.order_number} ?`, description: "La commande retourne « à étiqueter ».", destructive: true })) return;
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

  const changeBox = async (orderId, boxId) => {
    setBoxOverrides((prev) => ({ ...prev, [orderId]: boxId || null }));
    try {
      await api.patch(`/admin/orders/${orderId}/shipping-box`, { box_id: boxId || null });
      await refreshLinePrice(orderId);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const refreshLinePrice = async (orderId) => {
    setPriceBusy((prev) => ({ ...prev, [orderId]: true }));
    try {
      const { data: row } = await api.post(`/admin/orders/${orderId}/dispatch/refresh-estimate`, {}, {
        params: { service_code: serviceCode },
      });
      setData((prev) => {
        if (!prev?.to_label) return prev;
        return {
          ...prev,
          to_label: prev.to_label.map((r) => (r.id === orderId ? { ...r, ...row } : r)),
        };
      });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setPriceBusy((prev) => ({ ...prev, [orderId]: false }));
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

  const [retryBusy, setRetryBusy] = useState(false);

  const retryManifest = async () => {
    setRetryBusy(true);
    try {
      const { data: res } = await api.post(`/admin/dispatch/${date}/retry-manifest`);
      if (res.pdf_source === "cp") {
        toast.success("Manifeste Postes Canada officiel récupéré !");
      } else {
        toast.success("Manifeste généré (récapitulatif interne — PDF CP non disponible en devportal).");
      }
      load();
      // Ouvrir le PDF (CP officiel ou fallback interne)
      const root = API_BASE.replace(/\/api$/, "");
      window.open(`${root}/api/admin/dispatch/${date}/manifest.pdf`, "_blank", "noopener");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setRetryBusy(false);
    }
  };

  const manifestUrl = manifestStatus?.transmitted
    ? `${API_BASE.replace(/\/api$/, "")}/api/admin/dispatch/${date}/manifest.pdf`
    : "";

  const counts = data?.counts || { to_label: 0, labeled: 0, overdue: 0 };
  const totals = data?.totals;
  const configured = data?.configured;
  const isCpDevportal = Boolean(cpConfig?.base_url?.includes("devportal-portaildesdeveloppeurs"));

  return (
    <div data-testid="admin-dispatch">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight flex items-center gap-2">
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
          {isCpDevportal && (
            <div className="mt-2 text-amber-700">
              Devportal CP actif: les prix et identifiants retournés peuvent rester non représentatifs et ne correspondent pas a un vrai rating live contractuel.
            </div>
          )}
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

      {manifestStatus?.transmitted && manifestUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-3 bg-white border border-ink/10 px-4 py-3 font-mono text-[11px] text-foreground/70" data-testid="dispatch-manifest-link">
          <span>Manifeste transmis pour ce lot.</span>
          <a href={manifestUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
            Télécharger le PDF du manifeste
          </a>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="À étiqueter" value={counts.to_label} testid="stat-tolabel" />
        <Stat label="Étiquetées" value={counts.labeled} testid="stat-labeled" />
        <Stat label="En retard" value={counts.overdue} accent={counts.overdue > 0} testid="stat-overdue" />
      </div>

      {totals && (
        (Number(totals.labels_cost || 0) > 0) ||
        (Number(totals.customer_shipping_charged || 0) > 0) ||
        (Number(totals?.manifest?.total_due || 0) > 0)
      ) && (
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-4" data-testid="dispatch-financials">
          <Money label="Coût estimé étiquettes" value={totals.labels_cost} />
          <Money label="Facturé aux clients" value={totals.customer_shipping_charged} />
          <Money label="Manifeste (total dû)" value={totals.manifest?.total_due} muted />
          <Money label="Écart" value={totals.margin} accent={totals.margin != null && totals.margin > 0} />
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
          onClick={retryManifest}
          disabled={retryBusy || !manifestStatus?.transmitted}
          data-testid="dispatch-fetch-manifest"
          className="border border-ink/20 font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-ink/5 disabled:opacity-40 flex items-center gap-2"
          title="Récupérer le manifeste officiel auprès de Postes Canada"
        >
          <Download size={14} /> {retryBusy ? "Récupération…" : "Manifeste CP"}
        </button>
        <button
          onClick={openManifest}
          disabled={!manifestStatus?.transmitted}
          data-testid="dispatch-view-manifest"
          className="border border-ink/20 font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-ink/5 disabled:opacity-40 flex items-center gap-2"
          title={manifestStatus?.transmitted ? "Voir et imprimer le manifeste" : "Aucun manifeste transmis pour cette date"}
        >
          <Printer size={14} /> Imprimer manifeste
        </button>
      </div>

      <Section title="À étiqueter" empty="Aucune commande payée en attente pour ce lot." rows={data?.to_label} testid="table-tolabel"
        headers={["Commande", "Destination", "Articles", "Emballage", "Coût estimé", "Statut"]}
        render={(o) => {
          const currentBoxId = (o.id in boxOverrides) ? boxOverrides[o.id] : o.box_id;
          return (
            <tr key={o.id} className="border-t border-ink/10" data-testid={`dispatch-row-${o.order_number}`}>
              <td className="px-4 py-3 font-mono text-xs font-bold">{o.order_number}</td>
              <td className="px-4 py-3 text-sm">{o.city}, {o.province}</td>
              <td className="px-4 py-3 font-mono text-xs">{o.items} art.</td>
              <td className="px-4 py-2">
                <select
                  value={currentBoxId || ""}
                  onChange={(e) => changeBox(o.id, e.target.value || null)}
                  className="border border-ink/20 px-2 py-1 font-mono text-[11px] bg-white w-full max-w-[180px]"
                  title="Changer l'emballage pour cette commande"
                >
                  <option value="">— auto —</option>
                  {(data?.available_boxes || []).map((b) => (
                    <option key={b.id} value={b.id}>{b.name} (max {b.max_units})</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-right">
                <div className="inline-flex items-center gap-2">
                  <span>{o.line_label_cost != null ? `$${Number(o.line_label_cost).toFixed(2)}` : "—"}</span>
                  <button
                    onClick={() => refreshLinePrice(o.id)}
                    disabled={priceBusy[o.id] || !configured}
                    data-testid={`dispatch-refresh-line-${o.order_number}`}
                    title="Rafraîchir le prix CP de cette ligne"
                    className="border border-ink/20 p-1 hover:bg-ink/5 disabled:opacity-40"
                  >
                    <RefreshCw size={11} className={priceBusy[o.id] ? "animate-spin" : ""} />
                  </button>
                </div>
                {o.line_label_cost_source === "estimated_cp" ? <span className="block text-[10px] text-foreground/40">estimé CP {o.estimated_eta_days ? `· ${o.estimated_eta_days} j` : ""}</span> : null}
                {o.line_label_cost_source === "estimated_cp_alt" ? <span className="block text-[10px] text-foreground/40">estimé CP</span> : null}
                {(o.packaged_weight_kg || o.box_name) ? (
                  <span className="block text-[10px] text-foreground/40">
                    {o.packaged_weight_kg ? `${o.packaged_weight_kg} kg` : ""}{o.packaged_weight_kg && o.box_name ? " · " : ""}{o.box_name || ""}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right font-mono text-[11px] text-foreground/50">en attente</td>
            </tr>
          );
        }}
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
      <div className={`font-display text-2xl font-bold mt-1 ${accent ? "text-red-600" : muted ? "text-foreground/50" : ""}`}>
        {v == null ? "—" : `$${v.toFixed(2)}`}
      </div>
    </div>
  );
}

function Stat({ label, value, accent, testid }) {
  return (
    <div className={`bg-white border p-5 ${accent ? "border-red-300" : "border-ink/10"}`} data-testid={testid}>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">{label}</div>
      <div className={`font-display text-4xl font-bold mt-1 ${accent ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, rows, render, empty, testid, headers }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil((rows?.length || 0) / PAGE_SIZE));
  const pageRows = rows?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) || [];

  useEffect(() => {
    setPage(1);
  }, [rows]);

  return (
    <div className="mt-8">
      <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60 mb-3">{title}</h2>
      <div className="bg-white border border-ink/10 overflow-x-auto" data-testid={testid}>
        {rows && rows.length ? (
          <table className="w-full">
            {headers && (
              <thead>
                <tr className="border-b border-ink/10 bg-ink/[0.02]">
                  {headers.map((h) => (
                    <Th key={h}>{h}</Th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>{pageRows.map(render)}</tbody>
          </table>
        ) : (
          <div className="px-6 py-10 text-center font-mono text-xs text-foreground/50">{empty}</div>
        )}
      </div>
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-end gap-3 font-mono text-xs">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="border border-ink/15 px-3 py-2 disabled:opacity-40"
            aria-label="Page précédente"
          >
            ←
          </button>
          <span>{page} / {pageCount}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page === pageCount}
            className="border border-ink/15 px-3 py-2 disabled:opacity-40"
            aria-label="Page suivante"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
