// frontend/src/pages/admin/sections/TicketRefund.jsx
//
// Ouvrir un dossier de remboursement DEPUIS un billet client.
//
// Le besoin arrive presque toujours par un message : « mon flacon est arrivé
// cassé ». Il fallait alors relever le nom du client, ouvrir l'écran
// Commandes, retrouver la bonne commande, et y ouvrir le dossier — quatre
// gestes pendant lesquels on peut se tromper de commande.
//
// Ce bloc liste les commandes de CE client et ouvre le dossier sur celle
// qu'on choisit. Il appelle le MÊME point d'entrée que la fiche commande
// (/admin/orders/{id}/refund-case) : une seule logique de remboursement,
// atteignable de là où le besoin se présente.
import { useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";

const argent = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function TicketRefund({ ticketId, base, sujet, L, onDone }) {
  const [ouvert, setOuvert] = useState(false);
  const [commandes, setCommandes] = useState(null);
  const [choisie, setChoisie] = useState("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  const charger = async () => {
    setOuvert(true);
    setMotif(sujet || "");
    try {
      const { data } = await api.get(`${base}/${ticketId}/orders`);
      setCommandes(data?.items || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
      setCommandes([]);
    }
  };

  // Le serveur exige 10 caractères de motif (RefundRequestIn.reason). Le sujet
  // d'un billet peut être plus court : sans cette règle ici, le dossier partait
  // et revenait en 422 sans que l'écran sache dire pourquoi.
  const MOTIF_MIN = 10;

  const ouvrirDossier = async () => {
    if (!choisie || motif.trim().length < MOTIF_MIN) return;
    setBusy(true);
    try {
      await api.post(`/admin/orders/${choisie}/refund-case`, { reason: motif.trim() });
      toast.success(L("Dossier ouvert — à décider dans Remboursements",
                      "Case opened — decide it in Refunds"));
      setOuvert(false);
      setChoisie("");
      setCommandes(null);
      if (onDone) onDone();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!ouvert) {
    return (
      <button onClick={charger} data-testid="ticket-refund-open"
        className="px-4 py-2 rounded-lg border border-ash text-glacier hover:border-glacier font-data text-[11px] font-bold uppercase tracking-wider">
        {L("Ouvrir un dossier de remboursement", "Open a refund case")}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-ash bg-white p-3 space-y-2" data-testid="ticket-refund-panel">
      <p className="font-data text-[10px] uppercase tracking-wider text-glacier">
        {L("Commandes de ce client", "This customer's orders")}
      </p>

      {commandes === null && (
        <p className="text-sm text-glacier">{L("Chargement…", "Loading…")}</p>
      )}
      {commandes?.length === 0 && (
        <p className="text-sm text-glacier">{L("Aucune commande.", "No orders.")}</p>
      )}

      {commandes?.length > 0 && (
        <select value={choisie} onChange={(e) => setChoisie(e.target.value)}
          data-testid="ticket-refund-order"
          className="w-full rounded-lg border border-ash px-3 py-2 text-sm bg-white">
          <option value="">{L("Choisir une commande…", "Choose an order…")}</option>
          {/* Une commande qui ne peut pas recevoir de dossier reste VISIBLE
              mais non sélectionnable, avec la raison : la masquer ferait
              croire qu'elle n'existe pas. Le libellé est assemblé ici, hors
              du JSX : une <option> ne peut contenir que du texte. */}
          {commandes.map((c) => {
            const libelle = `${c.order_number} · ${argent(c.total)} · ${(c.created_at || "").slice(0, 10)}`
              + (c.refund_blocked_reason ? ` — ${c.refund_blocked_reason}` : "");
            return (
              <option key={c.id} value={c.id} disabled={!!c.refund_blocked_reason}>{libelle}</option>
            );
          })}
        </select>
      )}

      <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} maxLength={1000}
        data-testid="ticket-refund-reason"
        placeholder={L("Motif du dossier", "Reason for the case")}
        className="w-full rounded-lg border border-ash px-3 py-2 text-sm" />

      <div className="flex gap-2">
        <button onClick={ouvrirDossier} disabled={busy || !choisie || motif.trim().length < MOTIF_MIN}
          data-testid="ticket-refund-submit"
          className="px-4 py-2 rounded-lg bg-nova text-nordfjord font-data text-[11px] font-bold uppercase tracking-wider disabled:opacity-40">
          {busy ? L("Ouverture…", "Opening…") : L("Ouvrir le dossier", "Open the case")}
        </button>
        <button onClick={() => { setOuvert(false); setCommandes(null); setChoisie(""); }}
          className="px-4 py-2 rounded-lg border border-ash text-glacier font-data text-[11px] font-bold uppercase tracking-wider">
          {L("Annuler", "Cancel")}
        </button>
      </div>
      <p className="font-data text-[10px] text-glacier">
        {L("La décision et le versement se font dans l'écran Remboursements. Ouvrir un dossier gèle la commission affiliée.",
           "The decision and the payment happen in the Refunds screen. Opening a case freezes the affiliate commission.")}
      </p>
    </div>
  );
}
