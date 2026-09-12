// frontend/src/pages/admin/sections/OuvrirDossier.jsx
//
// Ouvrir un dossier de remboursement, depuis les deux endroits où le besoin
// naît : un billet client (« mon flacon est arrivé cassé »), et l'écran
// Remboursements (où l'on vient justement pour ça).
//
// Un seul composant, une seule requête d'ouverture — POST
// /admin/orders/{id}/refund-case, le même appel que la fiche commande. Ce qui
// change entre les deux usages, c'est uniquement D'OÙ viennent les commandes
// proposées : la liste figée du client qui a écrit, ou une recherche libre.
// D'où `charger`, injecté par l'appelant.
//
// La recherche libre existe pour une raison précise : une commande passée en
// INVITÉ n'a pas de compte, donc pas de billet. Sans elle, ces clients-là
// n'avaient aucun chemin vers un remboursement depuis cet écran.
import { useState } from "react";
import { toast } from "sonner";
import { formatApiError } from "../../../lib/api";
import api from "../../../lib/api";

const argent = (n) => `$${Number(n || 0).toFixed(2)}`;

// Le serveur exige 10 caractères de motif (RefundRequestIn.reason). Sans cette
// règle ici, le dossier partait et revenait en 422 sans que l'écran sache
// dire pourquoi.
const MOTIF_MIN = 10;

export default function OuvrirDossier({
  charger,                    // async (texte) => [commandes]
  avecRecherche = false,
  sujet = "",
  L,
  onDone,
  libelle,
  testid = "ticket-refund",
}) {
  const [ouvert, setOuvert] = useState(false);
  const [commandes, setCommandes] = useState(null);
  const [texte, setTexte] = useState("");
  const [choisie, setChoisie] = useState("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  const remplir = async (recherche = "") => {
    try {
      setCommandes(await charger(recherche));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
      setCommandes([]);
    }
  };

  const demarrer = async () => {
    setOuvert(true);
    setMotif(sujet || "");
    // En mode recherche il n'y a rien à afficher tant que rien n'est cherché.
    if (avecRecherche) setCommandes([]);
    else await remplir();
  };

  const fermer = () => {
    setOuvert(false);
    setCommandes(null);
    setChoisie("");
    setTexte("");
  };

  const ouvrirDossier = async () => {
    if (!choisie || motif.trim().length < MOTIF_MIN) return;
    setBusy(true);
    try {
      await api.post(`/admin/orders/${choisie}/refund-case`, { reason: motif.trim() });
      toast.success(L("Dossier ouvert — à décider dans Remboursements",
                      "Case opened — decide it in Refunds"));
      fermer();
      if (onDone) onDone();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!ouvert) {
    return (
      <button onClick={demarrer} data-testid={`${testid}-open`}
        className="px-4 py-2 rounded-lg border border-ash text-glacier hover:border-glacier font-data text-[11px] font-bold uppercase tracking-wider">
        {libelle || L("Ouvrir un dossier de remboursement", "Open a refund case")}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-ash bg-white p-3 space-y-2" data-testid={`${testid}-panel`}>
      {avecRecherche && (
        <div className="flex gap-2">
          <input value={texte} onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") remplir(texte); }}
            data-testid={`${testid}-search`}
            placeholder={L("Numéro de commande, courriel ou nom",
                           "Order number, email or name")}
            className="flex-1 rounded-lg border border-ash px-3 py-2 text-sm" />
          <button onClick={() => remplir(texte)} data-testid={`${testid}-search-go`}
            className="px-4 py-2 rounded-lg border border-ash text-glacier font-data text-[11px] font-bold uppercase tracking-wider">
            {L("Chercher", "Search")}
          </button>
        </div>
      )}

      <p className="font-data text-[10px] uppercase tracking-wider text-glacier">
        {avecRecherche
          ? L("Fonctionne aussi pour une commande passée sans compte",
              "Works for orders placed without an account too")
          : L("Commandes de ce client", "This customer's orders")}
      </p>

      {commandes === null && (
        <p className="text-sm text-glacier">{L("Chargement…", "Loading…")}</p>
      )}
      {commandes?.length === 0 && (
        <p className="text-sm text-glacier">
          {avecRecherche
            ? L("Cherchez une commande ci-dessus.", "Search for an order above.")
            : L("Aucune commande.", "No orders.")}
        </p>
      )}

      {commandes?.length > 0 && (
        <select value={choisie} onChange={(e) => setChoisie(e.target.value)}
          data-testid={`${testid}-order`}
          className="w-full rounded-lg border border-ash px-3 py-2 text-sm bg-white">
          <option value="">{L("Choisir une commande…", "Choose an order…")}</option>
          {/* Une commande qui ne peut pas recevoir de dossier reste VISIBLE
              mais non sélectionnable, avec la raison : la masquer ferait
              croire qu'elle n'existe pas. Le libellé est assemblé hors du
              JSX — une <option> ne peut contenir que du texte. */}
          {commandes.map((c) => {
            const parts = [c.order_number, argent(c.total), (c.created_at || "").slice(0, 10)];
            if (avecRecherche && c.email) parts.push(c.email);
            const libelleLigne = parts.join(" · ")
              + (c.refund_blocked_reason ? ` — ${c.refund_blocked_reason}` : "");
            return (
              <option key={c.id} value={c.id} disabled={!!c.refund_blocked_reason}>{libelleLigne}</option>
            );
          })}
        </select>
      )}

      <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} maxLength={1000}
        data-testid={`${testid}-reason`}
        placeholder={L("Motif du dossier (10 caractères au moins)",
                       "Reason for the case (at least 10 characters)")}
        className="w-full rounded-lg border border-ash px-3 py-2 text-sm" />

      <div className="flex gap-2">
        <button onClick={ouvrirDossier} disabled={busy || !choisie || motif.trim().length < MOTIF_MIN}
          data-testid={`${testid}-submit`}
          className="px-4 py-2 rounded-lg bg-nova text-nordfjord font-data text-[11px] font-bold uppercase tracking-wider disabled:opacity-40">
          {busy ? L("Ouverture…", "Opening…") : L("Ouvrir le dossier", "Open the case")}
        </button>
        <button onClick={fermer}
          className="px-4 py-2 rounded-lg border border-ash text-glacier font-data text-[11px] font-bold uppercase tracking-wider">
          {L("Annuler", "Cancel")}
        </button>
      </div>
      <p className="font-data text-[10px] text-glacier">
        {L("Le dossier s'ouvre « à examiner ». La décision puis le versement se font ensuite, ici même. Ouvrir un dossier gèle la commission affiliée.",
           "The case opens as « to review ». The decision and then the payment happen next, right here. Opening a case freezes the affiliate commission.")}
      </p>
    </div>
  );
}
