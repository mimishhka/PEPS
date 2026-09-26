import { useEffect, useRef, useState } from "react";

// LE MODULE DE PAIEMENT CRYPTO, À L'ÉCHELLE DE L'ÉCRAN.
//
// Mireille : « tout doit se faire sur mon site sans jamais quitter vers un
// autre site, comme pour la version web ».
//
// LE PROBLÈME. Le module NOWPayments est dessiné pour une largeur FIXE de
// 410 px. Sur un téléphone de 320 px, le déclarer avec `maxWidth: 100%`
// écrasait le cadre horizontalement pendant que sa hauteur restait entière :
// le contenu, lui, continuait de se dessiner pour 410 px et débordait — avec
// `scrolling="no"`, il devenait inatteignable. La page paraissait vide.
//
// LA SOLUTION N'EST PAS DE RÉTRÉCIR LE CADRE, C'EST DE RÉDUIRE L'ENSEMBLE.
// L'iframe garde ses 410 px : à l'intérieur, le module croit disposer de toute
// la place qu'il lui faut et se dessine normalement. C'est une transformation
// CSS qui le met à l'échelle du conteneur. Rien n'est écrasé, rien n'est
// coupé — c'est le même module, vu plus petit.
//
// Une première correction avait remplacé le module par un lien vers
// nowpayments.io. Cela réglait le symptôme en abandonnant l'objectif : on ne
// quitte pas la boutique pour payer.
const LARGEUR = 410;
const HAUTEUR = 696;

export default function ModuleCrypto({ invoiceId, titre = "NOWPayments" }) {
  const enveloppe = useRef(null);
  const [echelle, setEchelle] = useState(1);

  useEffect(() => {
    const el = enveloppe.current;
    if (!el) return undefined;

    const mesurer = () => {
      const dispo = el.clientWidth;
      // On ne grossit JAMAIS le module : au-delà de 410 px il garde sa taille
      // native. L'agrandir flouterait son texte sans rien apporter.
      setEchelle(dispo > 0 && dispo < LARGEUR ? dispo / LARGEUR : 1);
    };
    mesurer();

    // ResizeObserver suit aussi la rotation du téléphone et l'ouverture du
    // clavier, que `window.resize` rate sur certains navigateurs mobiles.
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", mesurer);
      return () => window.removeEventListener("resize", mesurer);
    }
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  return (
    <div
      ref={enveloppe}
      className="w-full max-w-[410px]"
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
