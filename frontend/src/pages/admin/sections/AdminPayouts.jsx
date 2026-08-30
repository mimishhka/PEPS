// frontend/src/pages/admin/sections/AdminPayouts.jsx
// Gestion dédiée des paiements affiliés (payouts) — flux NOWPayments semi-auto.
import { useCallback, useEffect, useMemo, useState } from "react";
import { DollarSign, Zap, ShieldCheck, RefreshCw, CheckCircle2, X, Send, Download, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";
import { useConfirm } from "../../../components/ConfirmDialog";
import { useLang } from "../../../contexts/LanguageContext";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

/* Les NEUF statuts que le serveur produit, pas cinq.
 *
 * Il en manquait quatre, et le repli etait `STATUS.ready` — donc un versement
 * en `review`, `paid_manual`, `dispatching` ou `queued_manual` s'affichait
 * « Pret ». Le cas le plus grave est `review` : ce statut existe justement
 * parce que le montant du versement ne correspond plus a ce qu'il couvre, et
 * l'ecran invitait a l'envoyer. Le refus cote serveur tenait, mais
 * l'administrateur ne comprenait pas pourquoi.
 *
 * `paid_manual` affiche « Paye » comme `paid` : pour qui lit l'ecran, c'est le
 * meme fait. La distinction sert a l'audit, elle est dans la ligne de detail.
 */
const STATUS = {
  ready:        { fr: "Pret", en: "Ready", cls: "bg-warning/15 text-warning border border-warning/30" },
  creating:     { fr: "2FA requis", en: "2FA required", cls: "bg-nova/15 text-nova border border-nova/30" },
  dispatching:  { fr: "Envoi en cours", en: "Dispatching", cls: "bg-nova/15 text-nova border border-nova/30" },
  processing:   { fr: "En traitement", en: "Processing", cls: "bg-glacier/15 text-glacier border border-glacier/30" },
  paid:         { fr: "Paye", en: "Paid", cls: "bg-success/15 text-success border border-success/30" },
  paid_manual:  { fr: "Paye (manuel)", en: "Paid (manual)", cls: "bg-success/15 text-success border border-success/30" },
  failed:       { fr: "Echoue", en: "Failed", cls: "bg-error/10 text-error border border-error/25" },
  queued_manual:{ fr: "A payer a la main", en: "Manual queue", cls: "bg-glacier/15 text-glacier border border-glacier/30" },
  review:       { fr: "A verifier", en: "Needs review", cls: "bg-error/10 text-error border border-error/25" },
};

/* Types de runs de paiement (traçabilité NP-…) : un envoi groupé (batch),
 * un envoi unitaire (single), une régularisation manuelle (manual) ou un lot
 * mis en file d'attente manuelle pour export CSV (queued). */
const RUN_TYPE = {
  batch:  { fr: "Envoi groupé", en: "Batch" },
  single: { fr: "Envoi unitaire", en: "Single" },
  manual: { fr: "Régularisation manuelle", en: "Manual" },
  queued: { fr: "En file manuelle", en: "Manual queue" },
};

// Repli EXPLICITE : un statut inconnu s'affiche tel quel, en neutre, plutot que
// d'emprunter l'apparence d'un autre. Un libelle brut se remarque et se
// signale ; « Pret » sur un versement qui ne l'est pas ne se remarque jamais.
const statutInconnu = (s) => ({
  fr: s || "—", en: s || "—",
  cls: "bg-glacier/10 text-glacier border border-glacier/25",
});

export default function AdminPayouts() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const [payouts, setPayouts] = useState(null);
  const [busy, setBusy] = useState("");
  const [verifyFor, setVerifyFor] = useState(null);
  const [code, setCode] = useState("");
  const [markFor, setMarkFor] = useState(null);
  const [ref, setRef] = useState("");
  // Rapatries depuis l'onglet PAYOUTS d'Affiliates : envoi en lot, export CSV
  // et historique des executions. Deux entrees nommees « Payouts » portaient
  // chacune la moitie des actions, et celle du menu — l'endroit evident —
  // n'avait ni le lot ni l'export. Deux ecrans sur le meme sujet finissent
  // toujours par diverger : « Marquer paye » existait deja en double, avec
  // deux boites de dialogue differentes.
  const [selection, setSelection] = useState(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [runs, setRuns] = useState([]);
  // Historique des runs de paiement (batch / single / manual / queued).
  const [paymentRuns, setPaymentRuns] = useState([]);
  const confirm = useConfirm();
  // Recherche / filtres (Pilier A). `q` est debounce ci-dessous.
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPeriod, setFPeriod] = useState("");
  // Fiche de reconstitution (Pilier B) : payout + lignes de commission.
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(null);

  const load = useCallback(async (filters = {}) => {
    try {
      // Pilier A — recherche serveur : q (code/adresse/référence), status,
      // period. Sans filtres, comportement identique à avant (liste plate).
      const params = {};
      if (filters.q) params.q = filters.q;
      if (filters.status) params.status = filters.status;
      if (filters.period) params.period = filters.period;
      const { data } = await api.get("/admin/affiliates/payouts/all", { params });
      setPayouts(Array.isArray(data) ? data : (data.payouts || []));
    } catch (e) {
      setPayouts([]);
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const r = await api.get("/admin/affiliates/payouts/runs?limit=20");
      setRuns(r.data?.runs || []);
    } catch { /* l'historique est un confort : son echec ne bloque rien */ }
  }, []);

  const loadPaymentRuns = useCallback(async () => {
    try {
      const r = await api.get("/admin/affiliates/payments/runs?limit=20");
      setPaymentRuns(r.data?.runs || []);
    } catch { /* idem : l'historique est un confort */ }
  }, []);

  useEffect(() => { load(); loadRuns(); loadPaymentRuns(); }, [load, loadRuns, loadPaymentRuns]);

  // Debounce de la recherche : on n'appelle le serveur qu'après 350ms
  // d'accalmie, pas à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Rechargement quand un filtre change.
  const filtresActifs = { q: qDebounced, status: fStatus, period: fPeriod };
  const cleFiltre = `${qDebounced}::${fStatus}::${fPeriod}`;
  useEffect(() => {
    if (cleFiltre === "::") return;
    load(filtresActifs);
    setSelection(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleFiltre]);

  // Fiche de reconstitution (Pilier B) : payout + lignes + contrôles.
  const ouvrirDetail = async (p) => {
    setDetailOpen(p.id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const { data } = await api.get(`/admin/affiliates/payouts/${p.id}/detail`);
      setDetail(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const exporterDetail = () => {
    if (!detail) return;
    const rows = detail.lines || [];
    const toCsv = (vals) => `"${vals.map((v) => String(v ?? "").replace(/"/g, '""')).join('","')}"`;
    const header = toCsv(["Commande", "Base CAD", "Commission CAD", "Statut", "Date"]);
    const body = rows.map((r) =>
      toCsv([r.order_number, r.base_amount, r.commission_amount, r.status,
        (r.created_at || "").slice(0, 10)])).join("\r\n");
    const blob = new Blob(["\uFEFF" + header + "\r\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payout-${detail.payout?.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const basculer = (id) => {
    setSelection((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id); else suivant.add(id);
      return suivant;
    });
  };

  const basculerTout = () => {
    const eligibles = (payouts || []).filter((p) => p.status === "ready").map((p) => p.id);
    setSelection((prev) => (prev.size === eligibles.length ? new Set() : new Set(eligibles)));
  };

  const envoyerEnLot = async () => {
    if (!selection.size) return;
    // Recapitulatif AVANT le code 2FA. « Tout selectionner » porte sur tous les
    // versements prets, pas sur les lignes visibles : sans ce total, on valide
    // a l'aveugle un envoi irreversible.
    const choisis = (payouts || []).filter((p) => selection.has(p.id));
    const totalCad = choisis.reduce((somme, p) => somme + Number(p.amount_cad ?? p.amount ?? 0), 0);
    const ok = await confirm({
      title: L(`Envoyer ${choisis.length} versement(s) ?`, `Send ${choisis.length} payout(s)?`),
      description: L(
        `Total : ${money(totalCad)} CAD vers ${choisis.length} affilié(s). L'envoi de cryptomonnaie est irréversible.`,
        `Total: ${money(totalCad)} CAD to ${choisis.length} affiliate(s). Sending cryptocurrency is irreversible.`),
      confirmLabel: L("Continuer", "Continue"),
      cancelLabel: L("Annuler", "Cancel"),
      destructive: true,
    });
    if (!ok) return;

    const otp = window.prompt(L("Code 2FA Google Authenticator (Mass Payouts NOWPayments) :",
                                "2FA code from Google Authenticator (NOWPayments Mass Payouts):"));
    if (!otp) return;
    setBatchBusy(true);
    try {
      const { data } = await api.post("/admin/affiliates/payouts/batch", {
        payout_ids: [...selection], otp,
      });
      if (data.ok) {
        toast.success(L(`${data.sent} paiement(s) envoyé(s)`, `${data.sent} payout(s) sent`));
      } else if (data.queued_manual) {
        toast.warning(L(`${data.queued_manual} mis en file manuelle. Utilisez l'export CSV.`,
                         `${data.queued_manual} queued manually. Use the CSV export.`));
      } else {
        toast.error(data.error || L("Envoi en lot échoué", "Batch failed"));
      }
      setSelection(new Set());
      await load();
      await loadPaymentRuns();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBatchBusy(false);
    }
  };

  const exporterCsv = async () => {
    // Le lien direct ne peut pas porter l'en-tete Authorization : on passe par
    // un blob telecharge.
    try {
      const r = await api.get("/admin/affiliates/payouts/export.csv", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = "fironova-payouts-nowpayments.csv";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const runPayouts = async () => {
    setBusy("run");
    try {
      const { data } = await api.post("/admin/affiliates/payouts/run");
      toast.success(L(`${data.payouts_created} releve(s) genere(s)`, `${data.payouts_created} payout(s) created`));
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const execute = async (p) => {
    setBusy(p.id);
    try {
      const { data } = await api.post(`/admin/affiliates/payouts/${p.id}/execute`);
      toast.success(L("Payout cree — saisissez le code 2FA recu par courriel.", "Payout created — enter the 2FA code from your email."));
      setVerifyFor({ ...p, np_batch_id: data.np_batch_id });
      await load();
      await loadPaymentRuns();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const verify = async () => {
    if (!code.trim() || !verifyFor) return;
    setBusy(verifyFor.id);
    try {
      await api.post(`/admin/affiliates/payouts/${verifyFor.id}/verify`, { verification_code: code.trim() });
      toast.success(L("Payout verifie et en traitement.", "Payout verified and processing."));
      setVerifyFor(null); setCode("");
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const refreshStatus = async (p) => {
    setBusy(p.id);
    try {
      const { data } = await api.get(`/admin/affiliates/payouts/${p.id}/status`);
      toast.success(L(`Statut : ${data.status}`, `Status: ${data.status}`));
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const markPaid = async () => {
    if (!ref.trim() || !markFor) return;
    setBusy(markFor.id);
    try {
      await api.post(`/admin/affiliates/payouts/${markFor.id}/mark-paid`, { reference: ref.trim() });
      toast.success(L("Marque comme paye.", "Marked as paid."));
      setMarkFor(null); setRef("");
      await load();
      await loadPaymentRuns();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const totals = useMemo(() => {
    const list = payouts || [];
    const ready = list.filter((p) => p.status === "ready");
    return {
      ready: ready.length,
      // Somme en CAD, pas en `amount`. Pour un versement crypto, `amount` est
      // deja le montant converti en USD (voir _generate_payouts_for_period) :
      // additionner ce champ melangeait des devises et affichait le resultat
      // avec un simple « $ ». Le CAD est la seule base homogene, et c'est
      // celle qui correspond a vos livres.
      readyCad: ready.reduce((sum, p) => sum + (p.amount_cad ?? p.amount ?? 0), 0),
      pending: list.filter((p) => ["creating", "processing"].includes(p.status)).length,
    };
  }, [payouts]);

  if (payouts === null) {
    return <div className="p-8 text-glacier">{L("Chargement...", "Loading...")}</div>;
  }

  return (
    <div className="space-y-6" data-testid="admin-payouts">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-nordfjord">{L("Paiements affilies", "Affiliate payouts")}</h1>
          <p className="text-glacier text-sm mt-1">{L("Generez, executez et suivez les versements de commissions.", "Generate, execute and track commission payouts.")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selection.size > 0 && (
            <span className="font-data text-[11px] uppercase tracking-wider text-nordfjord
                             bg-nova/15 border border-nova/30 rounded-full px-3 py-1.5">
              {selection.size} {L("sélectionné(s)", "selected")}
            </span>
          )}
          <button onClick={envoyerEnLot} disabled={!selection.size || batchBusy}
            data-testid="batch-send"
            className="btn-pill btn-outline disabled:opacity-40 flex items-center gap-2">
            <Send size={15} /> {batchBusy ? L("Envoi…", "Sending…") : L("Envoyer en lot", "Send batch")}
          </button>
          <button onClick={exporterCsv} data-testid="export-csv"
            className="btn-pill btn-outline flex items-center gap-2">
            <Download size={15} /> {L("Export CSV", "Export CSV")}
          </button>
          <button onClick={runPayouts} disabled={busy === "run"} data-testid="run-payouts"
            className="btn-pill btn-nova disabled:opacity-40 flex items-center gap-2">
            <DollarSign size={16} /> {L("Generer les releves", "Generate payouts")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label={L("Prets a payer", "Ready to pay")} value={`${totals.ready} · ${money(totals.readyCad)} CAD`} />
        <Stat label={L("En cours", "In progress")} value={totals.pending} />
        <Stat label={L("Total releves", "Total payouts")} value={payouts.length} />
      </div>

      {/* Barre de recherche / filtres (Pilier A) — recherche SERVEUR (code
          affilié, adresse de versement, référence) + statut + période. */}
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-ash p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-glacier" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L("Code affilié, adresse ou référence…", "Affiliate code, address or reference…")}
            data-testid="payout-search"
            className="w-full rounded-lg border border-ash pl-9 pr-3 py-2 text-sm outline-none focus:border-nova bg-white" />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} data-testid="payout-filter-status"
          className="rounded-lg border border-ash px-3 py-2 text-sm outline-none focus:border-nova bg-white">
          <option value="">{L("Tous statuts", "All statuses")}</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{L(v.fr, v.en)}</option>
          ))}
        </select>
        <input
          value={fPeriod}
          onChange={(e) => setFPeriod(e.target.value)}
          placeholder="2026-06"
          data-testid="payout-filter-period"
          className="rounded-lg border border-ash px-3 py-2 text-sm outline-none focus:border-nova bg-white w-[110px]" />
        <button onClick={() => { setQ(""); setQDebounced(""); setFStatus(""); setFPeriod(""); load(); }}
          data-testid="payout-clear-filters"
          className="btn-pill btn-outline text-xs px-3 py-2 flex items-center gap-1.5">
          <X size={13} /> {L("Effacer", "Clear")}
        </button>
      </div>

      {payouts.length === 0 ? (
        <div className="rounded-xl border border-ash bg-white p-10 text-center text-glacier">
          {L("Aucun releve de paiement. Cliquez « Generer les releves » pour agreger les commissions approuvees.",
             "No payouts yet. Click \"Generate payouts\" to aggregate approved commissions.")}
        </div>
      ) : (
        <div className="space-y-2">
          {payouts.some((p) => p.status === "ready") && (
            <label className="flex items-center gap-3 px-4 py-2 text-xs text-glacier cursor-pointer">
              <input type="checkbox" className="h-4 w-4 accent-nordfjord"
                checked={selection.size > 0
                  && selection.size === payouts.filter((p) => p.status === "ready").length}
                onChange={basculerTout}
                data-testid="select-all" />
              {L("Tout sélectionner — y compris les lignes hors écran",
                 "Select all — including rows off screen")}
            </label>
          )}
          {payouts.map((p) => {
            const st = STATUS[p.status] || statutInconnu(p.status);
            return (
              <div key={p.id} className="rounded-xl border border-ash bg-white p-4 flex items-center gap-4 flex-wrap" data-testid={`payout-${p.id}`}>
                {/* La case n'existe que sur « ready » : c'est le seul statut que
                    l'envoi en lot accepte. Proposer de cocher un versement que
                    le serveur refusera ensuite serait une fausse piste. */}
                <input type="checkbox" className="h-4 w-4 accent-nordfjord shrink-0"
                  disabled={p.status !== "ready"}
                  checked={selection.has(p.id)}
                  onChange={() => basculer(p.id)}
                  aria-label={L("Sélectionner ce versement", "Select this payout")}
                  data-testid={`select-${p.id}`}
                  style={p.status !== "ready" ? { visibility: "hidden" } : undefined} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-nordfjord">{p.affiliate_code || "—"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold font-data uppercase tracking-[0.08em] ${st.cls}`}>{L(st.fr, st.en)}</span>
                  </div>
                  <div className="font-data text-[11px] text-glacier mt-0.5">
                    {p.period} · {p.referral_count} {L("filleuls", "referrals")} · {String(p.currency || "").toUpperCase()}
                    {p.run_id ? <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-glacier/10 text-nordfjord px-1.5 py-px uppercase tracking-wide">#{p.run_id}</span> : null}
                    {p.np_error ? <span className="text-error"> · {p.np_error}</span> : null}
                  </div>
                </div>
                {/* Les DEUX montants. `amount` est deja converti en USD pour un
                    versement crypto : l'afficher via money() donnait « $180.00 »
                    sans qualification, lu naturellement comme des dollars
                    canadiens. Le montant envoye porte donc sa devise, et la base
                    CAD — celle qui correspond a vos livres — apparait dessous
                    avec le taux applique. */}
                <div className="text-right shrink-0">
                  <div className="font-display font-bold text-nordfjord tabular-nums whitespace-nowrap">
                    {Number(p.amount || 0).toFixed(2)}
                    <span className="text-xs font-data text-glacier uppercase ml-1">
                      {p.currency || "cad"}
                    </span>
                  </div>
                  {p.amount_cad != null && p.amount_usd != null && (
                    <div className="font-data text-[11px] text-glacier tabular-nums whitespace-nowrap">
                      {money(p.amount_cad)} CAD
                      {p.fx_rate_cad_to_usd ? ` × ${Number(p.fx_rate_cad_to_usd).toFixed(4)}` : ""}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => ouvrirDetail(p)} disabled={busy === p.id || detailLoading}
                    data-testid={`detail-${p.id}`}
                    className="btn-pill btn-outline text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-40">
                    <FileText size={13} /> {L("Detail", "Detail")}
                  </button>
                  {p.status === "ready" && (
                    <button onClick={() => execute(p)} disabled={busy === p.id} data-testid={`execute-${p.id}`}
                      className="btn-pill btn-nova text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-40">
                      <Zap size={13} /> {L("Executer", "Execute")}
                    </button>
                  )}
                  {p.status === "creating" && (
                    <button onClick={() => setVerifyFor(p)} data-testid={`verify-open-${p.id}`}
                      className="btn-pill bg-nova text-nordfjord text-xs px-3 py-2 flex items-center gap-1.5">
                      <ShieldCheck size={13} /> {L("Saisir 2FA", "Enter 2FA")}
                    </button>
                  )}
                  {["creating", "processing"].includes(p.status) && (
                    <button onClick={() => refreshStatus(p)} disabled={busy === p.id} data-testid={`refresh-${p.id}`}
                      className="btn-pill btn-outline text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-40">
                      <RefreshCw size={13} /> {L("Actualiser", "Refresh")}
                    </button>
                  )}
                  {(p.status === "ready" || p.status === "failed") && (
                    <button onClick={() => setMarkFor(p)} data-testid={`markpaid-open-${p.id}`}
                      className="btn-pill btn-outline text-xs px-3 py-2 flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> {L("Marquer paye", "Mark paid")}
                    </button>
                  )}
                  {p.status === "paid" && p.reference && (
                    <span className="font-data text-[11px] text-success flex items-center gap-1"><CheckCircle2 size={13} /> {L("Paye", "Paid")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Historique des generations. Il repond a une question precise, posee
          chaque mois : « est-ce que le planificateur a bien tourne ? ». Sans
          lui, une periode ratee ne se decouvre qu'en constatant l'absence de
          versements — c'est-a-dire trop tard. */}
      {runs.length > 0 && (
        <div className="rounded-xl border border-ash bg-white overflow-hidden" data-testid="payout-runs">
          <p className="px-5 py-3 font-data text-[11px] uppercase tracking-[0.2em] text-nova border-b border-ash">
            {L("Générations récentes", "Recent runs")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {runs.map((r) => (
                  <tr key={`${r.period}-${r.started_at}`} className="border-b border-ash/60 last:border-0">
                    <td className="px-5 py-2.5 font-data text-nordfjord whitespace-nowrap">{r.period}</td>
                    <td className="px-3 py-2.5 text-glacier text-xs">
                      {r.auto ? L("automatique", "automatic") : L("manuelle", "manual")}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`font-data text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        r.status === "done" ? "bg-success/15 text-success"
                          : r.status === "failed" ? "bg-error/10 text-error"
                          : "bg-glacier/15 text-glacier"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-glacier text-xs text-right">
                      {r.error ? <span className="text-error">{r.error}</span> : (r.ended_at || r.started_at || "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historique des RUNS DE PAIEMENT — la traçabilité des ENVOIS, distincte
          des générations ci-dessus. Chaque envoi groupé, unitaire ou
          régularisation manuelle reçoit un numéro NP-… ; ce panneau liste ces
          runs avec le nombre de versements et le total payé. */}
      {paymentRuns.length > 0 && (
        <div className="rounded-xl border border-ash bg-white overflow-hidden" data-testid="payment-runs">
          <p className="px-5 py-3 font-data text-[11px] uppercase tracking-[0.2em] text-nova border-b border-ash">
            {L("Runs de paiement", "Payment runs")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {paymentRuns.map((r) => {
                  const rt = RUN_TYPE[r.type] || { fr: r.type || "—", en: r.type || "—" };
                  return (
                    <tr key={r.run_id} className="border-b border-ash/60 last:border-0">
                      <td className="px-5 py-2.5 font-data font-bold text-nordfjord whitespace-nowrap">{r.run_id}</td>
                      <td className="px-3 py-2.5 text-glacier text-xs">{L(rt.fr, rt.en)}</td>
                      <td className="px-3 py-2.5 text-glacier text-xs">{r.count} {L("versements", "payouts")}</td>
                      <td className="px-3 py-2.5 font-data text-nordfjord tabular-nums text-right">{money(r.total_cad)} CAD</td>
                      <td className="px-5 py-2.5 text-glacier text-xs text-right">{r.created_at || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {verifyFor && (
        <Modal onClose={() => { setVerifyFor(null); setCode(""); }} title={L("Verification 2FA", "2FA verification")}>
          <p className="text-sm text-glacier mb-4">
            {L("NOWPayments a envoye un code a l'adresse courriel de votre compte marchand. Saisissez-le pour finaliser le versement.",
               "NOWPayments sent a code to your merchant account email. Enter it to finalize the payout.")}
          </p>
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" data-testid="verify-code"
            className="w-full rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova font-data tracking-[0.3em] text-center text-lg" />
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setVerifyFor(null); setCode(""); }} className="flex-1 btn-pill btn-outline">{L("Annuler", "Cancel")}</button>
            <button onClick={verify} disabled={!code.trim() || busy === verifyFor.id} data-testid="verify-submit"
              className="flex-1 btn-pill btn-nova disabled:opacity-40">{L("Valider", "Verify")}</button>
          </div>
        </Modal>
      )}

      {markFor && (
        <Modal onClose={() => { setMarkFor(null); setRef(""); }} title={L("Marquer comme paye", "Mark as paid")}>
          <p className="text-sm text-glacier mb-4">
            {L("Enregistrez la reference de transaction (hash) pour tracer ce versement effectue manuellement.",
               "Record the transaction reference (hash) to trace this manually-sent payout.")}
          </p>
          <input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} placeholder={L("Hash / reference", "Tx hash / reference")} data-testid="markpaid-ref"
            className="w-full rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova font-data" />
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setMarkFor(null); setRef(""); }} className="flex-1 btn-pill btn-outline">{L("Annuler", "Cancel")}</button>
            <button onClick={markPaid} disabled={!ref.trim() || busy === markFor.id} data-testid="markpaid-submit"
              className="flex-1 btn-pill btn-nova disabled:opacity-40">{L("Confirmer", "Confirm")}</button>
          </div>
        </Modal>
      )}

      {/* Fiche de reconstitution (Pilier B) — la pièce de preuve : un versement
          n'est pas un montant isolé mais la somme de commissions approuvées.
          L'écart éventuel entre la somme des lignes et le montant du payout est
          affiché, pas caché. */}
      {detailOpen && (
        <Modal onClose={() => { setDetailOpen(null); setDetail(null); }}
          title={L("Reconstitution du versement", "Payout breakdown")}>
          {detailLoading ? (
            <div className="py-8 text-center text-glacier">{L("Chargement…", "Loading…")}</div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="font-data text-[11px] uppercase tracking-wider text-glacier">{L("Affilié", "Affiliate")}</p>
                  <p className="font-display font-bold text-nordfjord">{detail.affiliate?.code || detail.payout?.affiliate_code || "—"}</p>
                  <p className="text-xs text-glacier">{detail.affiliate?.email || ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-data text-[11px] uppercase tracking-wider text-glacier">{L("Période", "Period")}</p>
                  <p className="font-bold text-nordfjord">{detail.payout?.period}</p>
                  <p className="text-xs text-glacier">{STATUS[detail.payout?.status] ? L(STATUS[detail.payout?.status].fr, STATUS[detail.payout?.status].en) : detail.payout?.status}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-ash p-3">
                  <p className="font-data text-[10px] uppercase tracking-wider text-glacier">{L("Montant payout", "Payout amount")}</p>
                  <p className="font-display font-bold text-nordfjord tabular-nums">{money(detail.payout_amount_cad)} CAD</p>
                </div>
                <div className="rounded-lg border border-ash p-3">
                  <p className="font-data text-[10px] uppercase tracking-wider text-glacier">{L("Somme des lignes", "Sum of lines")}</p>
                  <p className="font-display font-bold text-nordfjord tabular-nums">{money(detail.lines_sum_cad)} CAD</p>
                </div>
              </div>

              {detail.difference !== 0 && (
                <div className={`rounded-lg border p-3 text-sm ${detail.difference < 0 ? "border-error/30 bg-error/5 text-error" : "border-warning/30 bg-warning/5 text-warning"}`}>
                  {L(`Écart de ${money(Math.abs(detail.difference))} CAD entre les lignes et le montant du versement. Vérifiez la référence (${detail.payout?.reference || "—"}).`,
                     `Difference of ${money(Math.abs(detail.difference))} CAD between lines and payout amount. Check the reference (${detail.payout?.reference || "—"}).`)}
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="font-data text-[11px] uppercase tracking-wider text-nova">
                  {L("Lignes de commission", "Commission lines")} ({detail.lines_count})
                </p>
                <button onClick={exporterDetail} data-testid="detail-export"
                  className="btn-pill btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                  <Download size={13} /> {L("Export", "Export")}
                </button>
              </div>

              {detail.lines.length === 0 ? (
                <p className="text-sm text-glacier py-4 text-center">
                  {L("Aucune ligne rattachée — versement sans commissions détaillées (peut précéder la migration).",
                     "No attached lines — payout without detailed commissions (may predate data migration).")}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-ash">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left font-data text-[10px] uppercase tracking-wider text-glacier border-b border-ash bg-clinical">
                        <th className="px-3 py-2">{L("Commande", "Order")}</th>
                        <th className="px-3 py-2 text-right">{L("Base", "Base")}</th>
                        <th className="px-3 py-2 text-right">{L("Commission", "Commission")}</th>
                        <th className="px-3 py-2">{L("Statut", "Status")}</th>
                        <th className="px-3 py-2">{L("Date", "Date")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((r) => (
                        <tr key={r.id} className="border-b border-ash/50 last:border-0">
                          <td className="px-3 py-2 font-data text-nordfjord">{r.order_number || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(r.base_amount)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(r.commission_amount)}</td>
                          <td className="px-3 py-2">
                            <span className="font-data text-[10px] uppercase px-2 py-0.5 rounded-full bg-ash/40 text-glacier">{r.status}</span>
                          </td>
                          <td className="px-3 py-2 text-glacier text-xs">{(r.created_at || "").slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-glacier py-4 text-center">{L("Impossible de charger le détail.", "Could not load detail.")}</p>
          )}
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-ash bg-white px-4 py-3">
      <div className="font-data text-[10px] uppercase tracking-[0.16em] text-glacier">{label}</div>
      <div className="font-display font-bold text-nordfjord text-xl mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nordfjord/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-nordfjord">{title}</h3>
          <button onClick={onClose} className="text-glacier hover:text-nordfjord"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
