import { useCallback, useEffect, useRef, useState } from "react";

// LE MODULE DE PAIEMENT CRYPTO, À L'ÉCHELLE DE L'ÉCRAN.
//
// Mireille, en trois temps :
//   1. « nowpayment page has no content » sur mobile ;
//   2. « tout doit se faire sur mon site sans jamais quitter » ;
//   3. « on ne peut pas réduire la taille du widget ».
//
// LE MODULE NOWPayments est dessiné pour une taille FIXE de 410 × 696 px. Ce
// n'est pas une suggestion : son contenu se compose pour ces dimensions.
//
// Le déclarer avec `maxWidth: 100%` l'écrasait horizontalement pendant que sa
// hauteur restait entière — le contenu continuait de se dessiner pour 410 px,
// débordait, et `scrolling="no"` le rendait inatteignable. La page paraissait
// vide.
//
// LA SOLUTION N'EST PAS DE REDIMENSIONNER LE CADRE, C'EST DE RÉDUIRE
// L'ENSEMBLE. L'iframe garde ses 410 × 696 : à l'intérieur, le module croit
// disposer de toute la place et se dessine normalement. Une transformation CSS
// met le tout à l'échelle. Rien n'est écrasé, rien n'est coupé.
//
// ET L'ÉCHELLE SUIT LES DEUX DIMENSIONS. Régler la largeur seule laissait
// 696 px de hauteur sur un écran qui n'en offre que 500 : il fallait encore
// défiler, sur l'écran même où l'on paie. L'échelle retenue est la plus petite
// des deux contraintes — largeur du conteneur, hauteur visible — bornée pour
// que le texte du formulaire reste lisible.
const LARGEUR = 410;
const HAUTEUR = 696;

// Sous ce seuil, le texte d'un formulaire de paiement devient pénible à lire :
// mieux vaut un peu de défilement qu'un montant qu'on déchiffre.
const ECHELLE_MIN = 0.62;
// L'espace à laisser sous le module : de quoi voir qu'il y a une suite.
const MARGE_BASSE = 24;

export default function ModuleCrypto({ invoiceId, titre = "NOWPayments" }) {
  const enveloppe = useRef(null);
  const [echelle, setEchelle] = useState(1);

  const mesurer = useCallback(() => {
    const el = enveloppe.current;
    if (!el) return;

    const largeurDispo = el.clientWidth;
    const parLargeur = largeurDispo > 0 ? largeurDispo / LARGEUR : 1;

    // La hauteur réellement visible sous le haut du module. `getBoundingClientRect`
    // donne sa position dans la fenêtre : ce qui reste en dessous est ce dont
    // on dispose sans défiler.
    const haut = el.getBoundingClientRect().top;
    const hauteurFenetre = typeof window !== "undefined" ? window.innerHeight : 0;
    const hauteurDispo = hauteurFenetre - haut - MARGE_BASSE;
    const parHauteur = hauteurDispo > 0 ? hauteurDispo / HAUTEUR : 1;

    // On ne grossit JAMAIS le module au-delà de sa taille native : l'agrandir
    // flouterait son texte sans rien apporter.
    const voulue = Math.min(parLargeur, parHauteur, 1);
    setEchelle(Math.max(ECHELLE_MIN, voulue));
  }, []);

  useEffect(() => {
    const el = enveloppe.current;
    if (!el) return undefined;
    mesurer();

    // ResizeObserver suit la largeur du conteneur ; `resize` suit la fenêtre,
    // donc la rotation du téléphone et l'ouverture du clavier. Les deux sont
    // nécessaires : l'un ne voit pas ce que l'autre voit.
    window.addEventListener("resize", mesurer);
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", mesurer);
    }
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => {
      window.removeEventListener("resize", mesurer);
      observateur.disconnect();
    };
  }, [mesurer]);

  return (
    <div
      ref={enveloppe}
      className="w-full max-w-[410px] mx-auto"
      // La hauteur suit l'échelle : sans cela, le conteneur garderait les
      // 696 px d'origine et laisserait un grand vide sous un module réduit.
      style={{ height: Math.round(HAUTEUR * echelle), overflow: "hidden" }}
      data-testid="crypto-widget-wrapper"
    >
      <iframe
        title={titre}
        src={`https://nowpayments.io/embeds/payment-widget?iid=${invoiceId}`}
        width={LARGEUR}
        height={HAUTEUR}
        frameBorder="0"
        style={{
          transform: `scale(${echelle})`,
          transformOrigin: "top left",
          border: 0,
          display: "block",
        }}
        data-testid="nowpayments-widget"
      />
    </div>
  );
}
