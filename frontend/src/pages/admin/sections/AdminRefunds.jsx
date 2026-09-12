import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, DollarSign } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import OuvrirDossier from "./OuvrirDossier";

/**
 * Item 5 — Refunds admin dashboard.
 * List + approve/deny + mark processed (D2 manual crypto tx reference).
 */

// Engagement de traitement : deux jours pour statuer sur une demande reçue.
const SLA_JOURS = 2;

/* LES ÉTAPES D'UN REMBOURSEMENT, dans l'ordre où on les franchit.
 *
 * Les deux premières sont du TRAVAIL À FAIRE, les deux dernières de
 * l'archive. La liste déroulante les présentait comme quatre choix
 * équivalents : après une approbation, la demande quittait « à examiner »,
 * la page se vidait, et rien ne disait que l'argent n'était pas parti. */
const ETAPES = [
  { cle: "requested", fr: "À examiner", en: "To review", travail: true },
  { cle: "approved", fr: "À envoyer", en: "To send", travail: true },
  { cle: "processed", fr: "Traités", en: "Processed", travail: false },
  { cle: "denied", fr: "Refusés", en: "Denied", travail: false },
];

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
  // Où renvoyer l'argent. Pré-rempli avec ce que porte le dossier ; modifiable
  // ici parce que pour un paiement crypto, l'adresse arrive souvent APRÈS —
  // dans la conversation avec le client, faute de la connaître au départ.
  const [dests, setDests] = useState({});
  // Compteurs de TOUTES les étapes, renvoyés par le serveur même quand on en
  // filtre une seule. C'est ce qui empêche un écran vide de passer pour
  // « tout est réglé ».
  const [counts, setCounts] = useState({ requested: 0, approved: 0, processed: 0, denied: 0 });

  const enRetard = compterEnRetard(items);
  // Ce qui attend AILLEURS que sur l'étape affichée — la seule chose qui
  // distingue « rien à faire » de « rien à faire ICI ».
  const resteAFaire = ETAPES.filter((e) => e.travail && e.cle !== filter)
    .reduce((somme, e) => somme + (counts[e.cle] ?? 0), 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "all" ? "" : `?status=${filter}`;
      const { data } = await api.get(`/admin/refunds${q}`);
      setItems(data.items || []);
      if (data.counts) setCounts(data.counts);
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
      // APRÈS UNE APPROBATION, L'ARGENT N'EST PAS ENCORE PARTI.
      // La demande quittait la liste et la page devenait vide : on croyait
      // avoir terminé. On suit donc le dossier jusqu'à l'étape qui reste.
      if (action === "approve") {
        toast.success(L("Approuvé — il reste à envoyer l'argent",
                        "Approved — the money still has to be sent"));
        setFilter("approved");
      } else {
        toast.success(L("Décision enregistrée", "Decision saved"));
        await load();
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setBusy(""); }
  };

  const markProcessed = async (id, item) => {
    const isReplace = item?.refund_approved_type === "replace";
    const tx = isReplace ? "REPLACE" : (txRefs[id] || "").trim();
    if (!tx) { toast.error(L("Référence tx requise", "TX reference required")); return; }
    // Un remboursement en argent doit avoir une destination. Sans elle, on
    // enregistrerait un envoi sans pouvoir dire où il est parti.
    const dest = (dests[id] ?? item?.refund_destination ?? "").trim();
    if (!isReplace && !dest) {
      toast.error(L("Indiquez où les fonds ont été renvoyés",
                    "State where the funds were sent back"));
      return;
    }
    setBusy(id);
    try {
      await api.post(`/admin/orders/${id}/refund-processed`, {
        tx_reference: tx,
        admin_note: notes[id] || "",
        refund_method: methods[id] || undefined,
        refund_destination: dest,
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
            {L("Délai annoncé aux clients : 48 h après la livraison. Une demande tardive n'est plus refusée : elle est signalée, et vous décidez. Engagement : statuer en 2 jours. Crypto envoyée manuellement, collez la référence de transaction.",
               "Window announced to customers: 48 h after delivery. A late request is no longer refused: it is flagged, and you decide. Commitment: decide within 2 days. Crypto sent manually, paste the transaction reference.")}
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

      {/* Ouvrir un dossier depuis ICI, pour n'importe quelle commande.
          Jusqu'ici il fallait passer par un billet — donc par un compte — ou
          par la fiche de la commande. Une commande passée en INVITÉ n'avait
          aucun chemin. Même appel que partout ailleurs. */}
      <div className="flex flex-wrap items-start gap-3">
        <OuvrirDossier avecRecherche testid="refund-new" L={L} onDone={load}
          libelle={L("Ouvrir un dossier pour une commande", "Open a case for an order")}
          charger={async (texte) => {
            const { data } = await api.get("/admin/refund-candidates", { params: { query: texte } });
            return data?.items || [];
          }} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" data-testid="refund-stages">
          {ETAPES.map((e) => {
            const actif = filter === e.cle;
            const n = counts[e.cle] ?? 0;
            return (
              <button key={e.cle} onClick={() => setFilter(e.cle)} data-testid={`stage-${e.cle}`}
                className={`px-3 py-1.5 rounded-full border text-sm transition ${
                  actif ? "border-nova bg-nova/10 text-nordfjord font-semibold"
                        : e.travail && n > 0 ? "border-warning text-warning"
                        : "border-ash text-compliance hover:border-glacier"}`}>
                {L(e.fr, e.en)}
                <span className="ml-1.5 font-mono text-xs">{n}</span>
              </button>
            );
          })}
          <span className="text-ash">|</span>
          <button onClick={() => setFilter("all")} data-testid="stage-all"
            className={`px-3 py-1.5 rounded-full border text-sm ${
              filter === "all" ? "border-nova bg-nova/10 text-nordfjord font-semibold"
                               : "border-ash text-compliance hover:border-glacier"}`}>
            {L("Tous", "All")}
          </button>
          <span className="text-xs text-compliance ml-auto">
            {items.length} {L("affichée(s)", "shown")}
          </span>
        </div>

        {/* L'ARGENT QUI N'EST PAS ENCORE PARTI, visible depuis n'importe
            quelle étape. Un remboursement approuvé puis oublié, c'est un
            client qui attend et une commission d'affilié gelée. */}
        {counts.approved > 0 && filter !== "approved" && (
          <button onClick={() => setFilter("approved")} data-testid="refunds-to-send"
            className="w-full text-left rounded-lg border border-warning bg-warning/10 px-4 py-3">
            <span className="block text-sm font-semibold text-warning">
              {L(`${counts.approved} remboursement(s) approuvé(s) : l'argent n'est pas encore parti.`,
                 `${counts.approved} approved refund(s): the money has not been sent yet.`)}
            </span>
            <span className="block text-xs text-compliance mt-0.5">
              {L("Cliquez pour les envoyer.", "Click to send them.")}
            </span>
          </button>
        )}
      </div>

      {loading ? <div className="text-sm">{L("Chargement…", "Loading…")}</div> :
       items.length === 0 ? (
        <div className="rounded-xl bg-clinical/40 p-8 text-center text-compliance text-sm"
             data-testid="refunds-empty">
          <p>
            {filter === "requested" ? L("Rien à examiner.", "Nothing to review.")
             : filter === "approved" ? L("Rien à envoyer.", "Nothing to send.")
             : L("Aucune demande à cette étape.", "No requests at this stage.")}
          </p>
          {/* Vide ne veut pas dire terminé. Sans cette phrase, une étape sans
              rien à montrer laissait croire que le travail était fini. */}
          {resteAFaire > 0 ? (
            <p className="mt-2 font-semibold text-warning" data-testid="refunds-elsewhere">
              {L(`Mais ${resteAFaire} dossier(s) attendent à une autre étape.`,
                 `But ${resteAFaire} case(s) are waiting at another stage.`)}
            </p>
          ) : (
            <p className="mt-2">{L("Aucun dossier en cours.", "No case in progress.")}</p>
          )}
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
                  {/* Ce qu'il faut savoir pour décider, calculé par le serveur à
                      l'ouverture : une annulation se traite en minutes, un
                      signalement tardif demande un jugement — c'est vous qui
                      tranchez, le code ne refuse plus à votre place. */}
                  {(r.refund_before_shipping || r.refund_late) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {r.refund_before_shipping && (
                        <span data-testid={`refund-cancel-${r.id}`}
                          className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-nova/15 text-nova">
                          {L("Annulation avant expédition", "Cancellation before shipping")}
                        </span>
                      )}
                      {r.refund_late && (
                        <span data-testid={`refund-late-${r.id}`}
                          className="text-[10px] font-mono tracking-wide px-2 py-0.5 rounded bg-warning/15 text-warning">
                          {r.refund_late_note || L("Signalé après le délai annoncé", "Reported after the announced window")}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-sm text-nordfjord mt-2 whitespace-pre-line">
                    <b>{L("Raison", "Reason")}: </b>{r.refund_reason}
                  </div>
                  {/* OU renvoyer l'argent. Pour un paiement crypto sans
                      adresse fournie, la case est vide et le dit : il faut la
                      demander au client avant d'envoyer quoi que ce soit. */}
                  <div className="text-xs text-compliance mt-1" data-testid={`refund-dest-${r.id}`}>
                    {L("Renvoyer à", "Send back to")} :{" "}
                    {r.refund_destination
                      ? <b className="font-mono">{r.refund_destination}</b>
                      : <b className="text-amber-700">{L("adresse à demander au client", "address to ask the customer for")}</b>}
                    {r.refund_destination_type === "crypto_address"
                      ? L(" · portefeuille crypto", " · crypto wallet")
                      : L(" · courriel Interac", " · Interac email")}
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
                          <input type="text"
                            placeholder={L("Où les fonds ont été renvoyés", "Where the funds were sent back")}
                            value={dests[r.id] ?? r.refund_destination ?? ""}
                            onChange={(e) => setDests({...dests, [r.id]: e.target.value})}
                            data-testid={`dest-${r.id}`} className="border rounded px-2 py-1 text-xs w-full font-mono"/>
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
