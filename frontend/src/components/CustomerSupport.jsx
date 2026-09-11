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
      testid="customer-support"
      intro={L(
        "Une question sur un produit, une livraison ou votre compte ? Nous répondons sous 1 à 2 jours ouvrables. Pour annuler une commande ou signaler un produit endommagé, passez plutôt par la page de la commande concernée.",
        "A question about a product, a delivery or your account? We reply within 1 to 2 business days. To cancel an order or report a damaged product, use the page of that order instead.")}
      exemple={L("Ex. : délai de livraison vers Gaspé", "e.g. shipping time to Gaspé")}
    />
  );
}
