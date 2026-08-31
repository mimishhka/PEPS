import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, DollarSign } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";

/**
 * Item 5 — Refunds admin dashboard.
 * List + approve/deny + mark processed (D2 manual crypto tx reference).
 */

// Engagement de traitement : deux jours pour statuer sur une demande reçue.
const SLA_JOURS = 2;

/* Compte les demandes NON TRAITÉES qui dépassent l'engagement.
 *
 * Hors du composant : une fonction recréée à chaque rendu ne sert à rien ici,
 * et la garder pure la rend vérifiable.
 *
 * Seules « requested » et « approved » comptent — une demande refusée ou déjà
 * versée n'attend plus rien de personne, et la faire figurer au décompte
 * transformerait l'indicateur en bruit permanent. */
function compterEnRetard(items, maintenant = Date.now()) {
  const limite = SLA_JOURS * 24 * 3600 * 1000;
  return (items || []).filter((r) => {
    if (!["requested", "approved"].includes(r.refund_status)) return false;
    const t = Date.parse(r.refund_requested_at || "");
    return Number.isFinite(t) && maintenant - t > limite;
  }).length;
}

export default function AdminRefunds() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("requested");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState({});
  const [amounts, setAmounts] = useState({});
  const [txRefs, setTxRefs] = useState({});
  const [types, setTypes] = useState({});
  const [methods, setMethods] = useState({});

  const enRetard = compterEnRetard(items);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "all" ? "" : `?status=${filter}`;
      const { data } = await api.get(`/admin/refunds${q}`);
      setItems(data.items || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, action) => {
    setBusy(id);
    try {
      const body = { action, admin_note: notes[id] || "" };
      if (action === "approve") {
        if (amounts[id]) body.approved_amount = parseFloat(amounts[id]);
        if (types[id]) body.approved_type = types[id];
      }
      await api.post(`/admin/orders/${id}/refund-decision`, body);
      toast.success(L("Décision enregistrée", "Decision saved"));
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setBusy(""); }
  };

  const markProcessed = async (id, item) => {
    const isReplace = item?.refund_approved_type === "replace";
    const tx = isReplace ? "REPLACE" : (txRefs[id] || "").trim();
    if (!tx) { toast.error(L("Référence tx requise", "TX reference required")); return; }
    setBusy(id);
    try {
      await api.post(`/admin/orders/${id}/refund-processed`, {
        tx_reference: tx,
        admin_note: notes[id] || "",
        refund_method: methods[id] || undefined,
      });
      toast.success(isReplace
        ? L("Remplacement enregistré", "Replacement recorded")
        : L("Remboursement enregistré comme envoyé", "Refund marked as sent"));
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setBusy(""); }
  };

  return (
    <div className="p-6 space-y-6" data-testid="admin-refunds">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-nordfjord flex items-center gap-2">
            <DollarSign size={22} />{L("Remboursements", "Refunds")}
          </h1>
          <p className="text-sm text-compliance mt-1">
            {L("Réclamation dans les 48 h suivant la livraison. Engagement : traiter en 2 jours. Crypto envoyée manuellement, admin colle le tx hash.",
               "Claims within 48 h of delivery. Commitment: handled within 2 days. Crypto sent manually, admin pastes the tx hash.")}
          </p>
          {/* Chaque demande gèle la commission de l'affilié jusqu'à la
              décision. Une demande oubliée immobilise donc l'argent de
              quelqu'un d'autre — d'où ce décompte, absent jusqu'ici : l'écran
              n'affichait qu'une date, sur laquelle il fallait calculer
              mentalement. L'écran des billets porte déjà le même bandeau. */}
          {enRetard > 0 && (
            <p className="text-sm text-warning font-semibold mt-1" data-testid="refunds-late">
              {L(`${enRetard} demande(s) au-delà de ${SLA_JOURS} jours — la commission affiliée reste gelée.`,
                 `${enRetard} request(s) past ${SLA_JOURS} days — the affiliate commission stays frozen.`)}
            </p>
          )}
        </div>
        <button onClick={load} className="btn-pill btn-ghost inline-flex items-center gap-2" data-testid="reload">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {L("Rafraîchir", "Refresh")}
        </button>
      </header>

      <div className="flex items-center gap-3">
        <label className="text-xs font-mono uppercase tracking-widest text-compliance">{L("Statut", "Status")}</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="status-filter"
          className="border rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="requested">{L("À examiner", "Pending")}</option>
          <option value="approved">{L("Approuvés (à envoyer)", "Approved (to send)")}</option>
          <option value="processed">{L("Traités", "Processed")}</option>
          <option value="denied">{L("Refusés", "Denied")}</option>
          <option value="all">{L("Tous", "All")}</option>
        </select>
        <span className="text-xs text-compliance">{items.length} {L("entrée(s)", "entrie(s)")}</span>
      </div>

      {loading ? <div className="text-sm">{L("Chargement…", "Loading…")}</div> :
       items.length === 0 ? (
        <div className="rounded-xl bg-clinical/40 p-8 text-center text-compliance text-sm">
          {L("Aucune demande.", "No requests.")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl border border-nova/20 bg-white p-4" data-testid={`refund-${r.id}`}>
              <div className="flex justify-between items-start flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-compliance">
                    {r.refund_requested_at && new Date(r.refund_requested_at).toLocaleString(lang==="fr"?"fr-CA":"en-CA")}
                  </div>
                  <div className="font-semibold text-nordfjord mt-1">
                    #{r.order_number} — {r.email} — {r.total?.toFixed(2)} CAD
                  </div>
                  <div className="text-xs text-compliance mt-1">
                    {L("Type demandé", "Requested type")} : <b>{r.refund_type_requested}</b>
                    {r.refund_amount_requested && ` — ${r.refund_amount_requested} CAD`}
                  </div>
                  <div className="text-sm text-nordfjord mt-2 whitespace-pre-line">
                    <b>{L("Raison", "Reason")}: </b>{r.refund_reason}
                  </div>
                  {r.refund_admin_note && (
                    <div className="text-xs text-compliance mt-1"><b>Note admin :</b> {r.refund_admin_note}</div>
                  )}
                  {r.refund_tx_reference && (
                    <div className="text-xs text-emerald-800 mt-1 font-mono">TX : {r.refund_tx_reference}</div>
                  )}
                </div>
                <div className="min-w-[280px] flex flex-col gap-2 items-end">
                  <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded ${
                    r.refund_status === "processed" ? "bg-emerald-100 text-emerald-800" :
                    r.refund_status === "approved" ? "bg-blue-100 text-blue-800" :
                    r.refund_status === "denied" ? "bg-gray-200 text-gray-800" :
                    "bg-amber-100 text-amber-800"}`}>{r.refund_status}</span>

                  {r.refund_status === "requested" && (
                    <>
                      <input type="number" step="0.01" placeholder={`Montant (max ${r.total})`}
                        value={amounts[r.id] || ""} onChange={(e) => setAmounts({...amounts, [r.id]: e.target.value})}
                        data-testid={`amount-${r.id}`} className="border rounded px-2 py-1 text-xs w-full"/>
                      <select value={types[r.id] || "full"} onChange={(e) => setTypes({...types, [r.id]: e.target.value})}
                        data-testid={`type-${r.id}`} className="border rounded px-2 py-1 text-xs w-full">
                        <option value="full">{L("Complet", "Full")}</option>
                        <option value="partial">{L("Partiel", "Partial")}</option>
                        <option value="store_credit">{L("Crédit boutique", "Store credit")}</option>
                        <option value="replace">{L("Remplacer le produit", "Replace product")}</option>
                      </select>
                      <input type="text" placeholder={L("Note admin", "Admin note")}
                        value={notes[r.id] || ""} onChange={(e) => setNotes({...notes, [r.id]: e.target.value})}
                        data-testid={`note-${r.id}`} className="border rounded px-2 py-1 text-xs w-full"/>
                      <div className="flex gap-2">
                        <button onClick={() => decide(r.id, "deny")} disabled={busy===r.id}
                          data-testid={`deny-${r.id}`} className="btn-pill btn-ghost text-xs px-3 py-1">
                          {L("Refuser", "Deny")}</button>
                        <button onClick={() => decide(r.id, "approve")} disabled={busy===r.id}
                          data-testid={`approve-${r.id}`} className="btn-pill btn-nova text-xs px-3 py-1">
                          {L("Approuver", "Approve")}</button>
                      </div>
                    </>
                  )}

                  {r.refund_status === "approved" && (
                    <>
                      <div className="text-xs text-blue-800">
                        <b>{L("Approuvé", "Approved")} : {r.refund_approved_type === "replace"
                          ? L("remplacement", "replacement")
                          : `${r.refund_approved_amount} CAD (${r.refund_approved_type})`}</b>
                      </div>
                      {r.refund_approved_type !== "replace" && (
                        <>
                          <input type="text" placeholder={L("TX hash / référence", "TX hash / reference")}
                            value={txRefs[r.id] || ""} onChange={(e) => setTxRefs({...txRefs, [r.id]: e.target.value})}
                            data-testid={`tx-${r.id}`} className="border rounded px-2 py-1 text-xs w-full font-mono"/>
                          <select value={methods[r.id] || "crypto"} onChange={(e) => setMethods({...methods, [r.id]: e.target.value})}
                            data-testid={`method-${r.id}`} className="border rounded px-2 py-1 text-xs w-full">
                            <option value="crypto">{L("Crypto", "Crypto")}</option>
                            <option value="interac">{L("Interac", "Interac")}</option>
                          </select>
                        </>
                      )}
                      <button onClick={() => markProcessed(r.id, r)} disabled={busy===r.id}
                        data-testid={`processed-${r.id}`} className="btn-pill btn-nova text-xs px-3 py-1">
                        {r.refund_approved_type === "replace" ? L("Marquer expédié", "Mark shipped") : L("Marquer envoyé", "Mark sent")}</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
