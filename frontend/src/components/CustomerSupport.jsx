// frontend/src/components/CustomerSupport.jsx
//
// Billets d'assistance des CLIENTS — le même composant que pour les affiliés,
// réglé autrement. Un canal d'aide général, rattaché au compte et non à une
// commande : une question sur un produit, une livraison ou le compte n'a pas
// toujours de facture derrière elle.
//
// La demande de remboursement ou d'annulation, elle, reste sur la page de la
// commande, parce qu'elle porte sur une commande précise.
import AffiliateSupport from "./AffiliateSupport";

export default function CustomerSupport({ L, lang }) {
  return (
    <AffiliateSupport
      L={L}
      lang={lang}
      base="/account/tickets"
      withContext={false}
      avecPhoto
      testid="customer-support"
      intro={L(
        "Une question, ou un produit endommagé à nous montrer ? Joignez une photo, c'est ce qui nous permet de trancher vite. Nous répondons sous 1 à 2 jours ouvrables. Pour annuler une commande pas encore expédiée, passez par la page de cette commande.",
        "A question, or a damaged product to show us? Attach a photo — it's what lets us decide quickly. We reply within 1 to 2 business days. To cancel an order that hasn't shipped yet, use that order's page.")}
      exemple={L("Ex. : délai de livraison vers Gaspé", "e.g. shipping time to Gaspé")}
    />
  );
}
