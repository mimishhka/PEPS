import { useState } from "react";
import { AlertTriangle, MapPin, X } from "lucide-react";
import { toast } from "sonner";

import api, { formatApiError } from "../../../lib/api";
import { PROVINCES_CA, formaterCodePostal, provinceDepuisCodePostal,
         codePostalComplet, provinceCoherente } from "../../../lib/adresse";

// CORRIGER UNE ADRESSE QUE LE TRANSPORTEUR REFUSE.
//
// Mireille : « qu'arrive-t-il si une adresse n'est pas formatée pour Postes
// Canada ? Je n'ai aucun moyen de la modifier pour faire l'envoi du colis. »
//
// Elle avait raison. L'admin AFFICHAIT l'adresse d'une commande sans jamais
// permettre de la modifier : une commande payée dont l'adresse était refusée
// — province illisible, code postal mal formé — était bloquée définitivement,
// et le seul recours était de rembourser. Une vente perdue à chaque fois.
//
// Ce formulaire porte les mêmes aides que le passage en caisse : le code
// postal se formate à la frappe, la province se déduit de sa première lettre,
// et une incohérence entre les deux se dit AVANT d'envoyer. Corriger une
// adresse vers une autre adresse invalide serait un progrès nul.
export default function CorrigerAdresse({ order, onDone, onCancel }) {
  const depart = order?.shipping_address || {};
  const [a, setA] = useState({
    full_name: depart.full_name || "",
    address1: depart.address1 || "",
    address2: depart.address2 || "",
    city: depart.city || "",
    // Une province que Postes Canada refuse ne doit PAS être reproposée telle
    // quelle : le champ part vide plutôt que de suggérer la valeur fautive.
    province: PROVINCES_CA.some((p) => p.code === depart.province) ? depart.province : "",
    postal_code: depart.postal_code || "",
    country: "CA",
    phone: depart.phone || "",
  });
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setA((s) => ({ ...s, [k]: v }));

  const majCodePostal = (saisie) => {
    const formate = formaterCodePostal("CA", saisie);
    setA((s) => {
      const suite = { ...s, postal_code: formate };
      if (!s.province) {
        const deduite = provinceDepuisCodePostal(formate);
        if (deduite) suite.province = deduite;
      }
      return suite;
    });
  };

  const cpMalForme = a.postal_code.length >= 6 && !codePostalComplet("CA", a.postal_code);
  const desaccord = !provinceCoherente("CA", a.postal_code, a.province);
  const complet = a.full_name.trim() && a.address1.trim() && a.city.trim()
    && a.province && codePostalComplet("CA", a.postal_code) && motif.trim().length >= 3;

  const enregistrer = async () => {
    setBusy(true);
    try {
      const r = await api.patch(`/admin/orders/${order.id}/shipping-address`,
        { address: a, motif: motif.trim() });
      if (r.data?.unchanged) {
        toast.success("Aucun changement à enregistrer.");
      } else {
        toast.success("Adresse corrigée.");
      }
      onDone?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const champ = "w-full border border-ink/20 px-3 py-2 text-sm outline-none focus:border-nova";
  const etiquette = "block font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/60 mb-1";

  return (
    <div className="bg-white border border-ink/10 p-5" data-testid="corriger-adresse">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
            <MapPin size={13} /> Corriger l&apos;adresse de livraison
          </div>
          <p className="mt-1.5 text-xs text-foreground/60 max-w-xl leading-relaxed">
            À utiliser quand Postes Canada refuse l&apos;adresse. L&apos;ancienne est
            conservée dans l&apos;historique de la commande, et la correction est tracée
            avec son motif.
          </p>
        </div>
        <button type="button" onClick={onCancel} data-testid="corriger-adresse-fermer"
          className="text-foreground/50 hover:text-foreground shrink-0" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={etiquette} htmlFor="ca-nom">Nom complet</label>
          <input id="ca-nom" className={champ} value={a.full_name} data-testid="ca-full-name"
            onChange={(e) => set("full_name", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={etiquette} htmlFor="ca-adresse1">Adresse</label>
          <input id="ca-adresse1" className={champ} value={a.address1} data-testid="ca-address1"
            onChange={(e) => set("address1", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={etiquette} htmlFor="ca-adresse2">Appartement, bureau (facultatif)</label>
          <input id="ca-adresse2" className={champ} value={a.address2} data-testid="ca-address2"
            onChange={(e) => set("address2", e.target.value)} />
        </div>
        <div>
          <label className={etiquette} htmlFor="ca-ville">Ville</label>
          <input id="ca-ville" className={champ} value={a.city} data-testid="ca-city"
            onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <label className={etiquette} htmlFor="ca-province">Province</label>
          <select id="ca-province" className={champ} value={a.province} data-testid="ca-province"
            onChange={(e) => set("province", e.target.value)}>
            <option value="">— choisir —</option>
            {PROVINCES_CA.map((p) => (
              <option key={p.code} value={p.code}>{p.code} — {p.fr}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiquette} htmlFor="ca-cp">Code postal</label>
          <input id="ca-cp" className={champ} value={a.postal_code} data-testid="ca-postal"
            onChange={(e) => majCodePostal(e.target.value)} placeholder="H3G 1P1" />
          {cpMalForme && (
            <p className="mt-1 text-[11px] text-error" data-testid="ca-postal-erreur">
              Format attendu : H3G 1P1.
            </p>
          )}
        </div>
        <div>
          <label className={etiquette} htmlFor="ca-tel">Téléphone (facultatif)</label>
          <input id="ca-tel" className={champ} value={a.phone} data-testid="ca-phone"
            onChange={(e) => set("phone", e.target.value)} />
        </div>
      </div>

      {desaccord && (
        <div className="mt-4 flex items-start gap-2 bg-yellow-50 border border-yellow-300 text-yellow-900 px-3 py-2 text-[11px] leading-relaxed"
          data-testid="ca-desaccord">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Le code postal et la province ne concordent pas. Postes Canada refusera
          l&apos;étiquette — vérifiez lequel des deux est à corriger.
        </div>
      )}

      <div className="mt-5">
        <label className={etiquette} htmlFor="ca-motif">
          Motif de la correction (obligatoire)
        </label>
        <input id="ca-motif" className={champ} value={motif} data-testid="ca-motif"
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex. : Postes Canada refuse la province ; confirmée par téléphone" />
        <p className="mt-1 text-[11px] text-foreground/50">
          Cette commande est payée : le motif reste dans la trace, pour qu&apos;on
          puisse relire la décision plus tard.
        </p>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={enregistrer} disabled={busy || !complet}
          data-testid="ca-enregistrer"
          className="bg-nordfjord text-white font-mono text-xs uppercase tracking-[0.18em] px-5 py-2.5 transition-colors hover:bg-glacier disabled:opacity-40 disabled:pointer-events-none">
          {busy ? "Enregistrement…" : "Enregistrer la correction"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/60 hover:text-foreground px-2">
          Annuler
        </button>
      </div>
    </div>
  );
}
