import { Check, MapPin, Truck } from "lucide-react";

import { useLang } from "../contexts/LanguageContext";
import { momentLisible } from "../lib/periode";
import {
  adresseEnLignes, etapesCommande, lienSuiviPostesCanada, numeroDeSuivi,
  statutTransporteur,
} from "../lib/suivi";

/**
 * « Où en est ma commande ? » — la question n°1, et celle que la page ne
 * savait pas répondre.
 *
 * Audit de l'espace client du 06/10/2026, section 5 : « Aucun indicateur
 * d'étape. Correction : frise en 4 étapes (Payée → En préparation →
 * Expédiée → Livrée) avec la date de chaque étape, et le lien de suivi
 * Postes Canada dès qu'il existe. » Et : « La page commande n'affiche pas
 * l'adresse de livraison. »
 *
 * Ce bloc occupe la colonne de gauche de la page de commande, celle que
 * l'audit signale comme vide sur grand écran (sections 2 et 6). Elle ne l'est
 * plus parce qu'on y a mis ce qui manquait, et non parce qu'on l'a
 * escamotée : c'est l'information que la cliente vient chercher qui remplit
 * la place, pas du remplissage.
 */
export default function SuiviCommande({ order }) {
  const { lang } = useLang();
  const fr = lang === "fr";
  const etapes = etapesCommande(order, lang);
  const pin = numeroDeSuivi(order);
  const lien = lienSuiviPostesCanada(pin, lang);
  const transporteur = statutTransporteur(order);
  const lignes = adresseEnLignes(order.shipping_address);

  return (
    <div className="border border-ash bg-white overflow-hidden" data-testid="suivi-commande"
      style={{ borderRadius: "var(--r-l)" }}>
      <div className="px-6 py-4 flex items-center gap-2.5 border-b border-ash">
        <Truck size={15} className="text-nova-texte" aria-hidden="true" />
        <span className="etiquette text-nordfjord">
          {fr ? "Suivi de la commande" : "Order tracking"}
        </span>
      </div>

      <div className="px-6 sm:px-8 py-7">
        {/* LA FRISE EST UNE LISTE ORDONNÉE, pas une rangée de pastilles.
            Un lecteur d'écran annonce alors « 2 sur 4 », ce qu'aucune
            disposition purement visuelle ne lui donne. */}
        <ol className="space-y-0" data-testid="suivi-etapes">
          {etapes.map((etape, i) => {
            const franchie = etape.etat !== "avenir";
            const courante = etape.etat === "courante";
            return (
              <li key={etape.cle} className="flex gap-3.5" data-testid={`etape-${etape.cle}`}
                data-etat={etape.etat}>
                {/* La colonne de gauche : la pastille et le trait qui la
                    relie à la suivante. Le trait s'arrête à la dernière. */}
                <div className="flex flex-col items-center shrink-0">
                  <span
                    className={`grid place-items-center w-6 h-6 rounded-full border transition-colors ${
                      franchie
                        ? "bg-nova border-nova text-nordfjord"
                        : "bg-transparent border-ash text-ash"
                    }`}
                    aria-hidden="true"
                  >
                    {franchie ? <Check size={13} strokeWidth={3} /> : <span className="w-1.5 h-1.5 rounded-full bg-ash" />}
                  </span>
                  {i < etapes.length - 1 && (
                    <span className={`w-px flex-1 min-h-[22px] ${franchie ? "bg-nova" : "bg-ash"}`} aria-hidden="true" />
                  )}
                </div>

                <div className="min-w-0 pb-5 last:pb-0">
                  <div className={`text-sm ${courante ? "font-semibold text-nordfjord" : franchie ? "text-nordfjord" : "text-glacier"}`}>
                    {etape.libelle}
                  </div>
                  {/* La date seulement si on l'a. Une étape franchie sans
                      horodatage — une vieille commande — reste franchie :
                      l'absence de date ne doit pas laisser croire que rien
                      n'est parti. */}
                  {etape.date && (
                    <div className="font-data text-[12px] text-glacier mt-0.5" data-testid={`etape-date-${etape.cle}`}>
                      {momentLisible(etape.date, lang)}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* CE QUE POSTES CANADA DIT, par-dessus les quatre étapes du site.
            La frise ci-dessus ne connaît que trois valeurs et ne bouge que
            lorsqu'on la fait bouger. « En cours de livraison », « au bureau de
            poste », « tentative de livraison » viennent du transporteur — et
            le serveur les recevait déjà toutes les quinze minutes avant de les
            jeter. Rien ne s'affiche quand il n'y a pas de statut : une ligne
            « Statut : — » occupe de la place pour dire qu'on ne sait pas. */}
        {transporteur && (
          <div className="mt-5 pt-5 border-t border-ash" data-testid="suivi-transporteur">
            <div className="etiquette text-glacier mb-1.5">
              {fr ? "Chez le transporteur" : "With the carrier"}
            </div>
            <div className="text-sm font-semibold text-nordfjord" data-testid="suivi-transporteur-statut">
              {transporteur.texte}
              {transporteur.lieu && (
                <span className="font-normal text-glacier"> — {transporteur.lieu}</span>
              )}
            </div>
            {/* L'HORODATAGE EST CE QUI ÉVITE LA QUESTION « est-ce à jour ? ».
                Sans lui, un statut figé depuis trois jours est indiscernable
                d'un statut de la minute. */}
            {transporteur.verifieA && (
              <div className="font-data text-[12px] text-glacier mt-1" data-testid="suivi-transporteur-verifie">
                {fr ? "Vérifié " : "Checked "}{momentLisible(transporteur.verifieA, lang)}
              </div>
            )}
          </div>
        )}

        {pin && (
          <div className="mt-5 pt-5 border-t border-ash" data-testid="suivi-numero">
            <div className="etiquette text-glacier mb-1.5">
              {fr ? "Numéro de suivi" : "Tracking number"}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-data text-sm font-semibold text-nordfjord tabular-nums break-all">{pin}</span>
              <a href={lien} target="_blank" rel="noopener noreferrer"
                className="font-data text-[12px] text-nova-texte underline min-h-[44px] inline-flex items-center"
                data-testid="suivi-lien-postes-canada">
                {fr ? "Suivre chez Postes Canada" : "Track with Canada Post"}
              </a>
            </div>
          </div>
        )}

        {lignes.length > 0 && (
          <div className="mt-5 pt-5 border-t border-ash" data-testid="suivi-adresse">
            <div className="etiquette text-glacier mb-1.5 flex items-center gap-2">
              <MapPin size={13} aria-hidden="true" />
              {fr ? "Livré à" : "Delivered to"}
            </div>
            <address className="not-italic text-sm text-nordfjord leading-relaxed">
              {lignes.map((ligne) => <div key={ligne}>{ligne}</div>)}
            </address>
          </div>
        )}
      </div>
    </div>
  );
}
