import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";

const GROUPS = [
  {
    id: "shipping",
    en: "Shipping",
    fr: "Expédition",
    items: [
      {
        id: "free-shipping",
        q: { en: "Do you offer free shipping?", fr: "Offrez-vous la livraison gratuite ?" },
        a: {
          en: "Yes — shipping is free on all orders of $200 or more within Canada. Below that amount, a flat rate of $20 applies, calculated automatically at checkout.",
          fr: "Oui — la livraison est gratuite pour toute commande de 200 $ et plus au Canada. En dessous de ce montant, un tarif fixe de 20 $ s'applique, calculé automatiquement au moment du paiement.",
        },
      },
      {
        id: "outside-canada",
        q: { en: "Do you ship outside Canada?", fr: "Livrez-vous à l'extérieur du Canada ?" },
        a: {
          en: "No. FIRONOVA ships exclusively to Canadian addresses, unless otherwise stated.",
          fr: "Non. FIRONOVA livre exclusivement à des adresses canadiennes, sauf indication contraire.",
        },
      },
      {
        id: "when-ship",
        q: { en: "When will my order ship?", fr: "Quand ma commande sera-t-elle expédiée ?" },
        a: {
          en: "Orders paid Monday to Friday before 2:00 p.m. Eastern time are shipped the same day. Orders paid after 2:00 p.m., on weekends or on holidays leave the next business day. An order paid after 2:00 p.m. on a Friday ships the following Monday (holidays excluded).",
          fr: "Les commandes payées du lundi au vendredi avant 14 h (heure de l'Est) sont expédiées le jour même. Celles payées après 14 h, la fin de semaine ou un jour férié partent le jour ouvrable suivant. Une commande payée après 14 h un vendredi est expédiée le lundi suivant (jours fériés exclus).",
        },
      },
      {
        id: "delivery-times",
        q: { en: "How long does delivery take?", fr: "Quels sont les délais de livraison ?" },
        a: {
          en: "Parcels are sent via Canada Post or UPS with tracking. Ontario and Québec typically receive their order within 1 to 2 business days, Western and Atlantic Canada within 4 to 5 business days, and remote regions may require up to 10 days. Transit times are estimates and are not guaranteed.",
          fr: "Les colis sont envoyés via Postes Canada ou UPS avec suivi. L'Ontario et le Québec reçoivent généralement leur commande en 1 à 2 jours ouvrables, l'Ouest et les provinces de l'Atlantique en 4 à 5 jours ouvrables, et les régions éloignées peuvent nécessiter jusqu'à 10 jours. Les délais sont des estimations et ne sont pas garantis.",
        },
      },
      {
        id: "tracking",
        q: { en: "Will I receive tracking information?", fr: "Vais-je recevoir un numéro de suivi ?" },
        a: {
          en: "Absolutely. As soon as your order ships, you receive an email containing the tracking details so you can follow your parcel at every step.",
          fr: "Absolument. Dès que votre commande est expédiée, vous recevez un courriel contenant les informations de suivi pour suivre votre colis à chaque étape.",
        },
      },
      {
        id: "discreet",
        q: { en: "Is the packaging discreet?", fr: "L'emballage est-il discret ?" },
        a: {
          en: "Yes. We take privacy seriously: every order ships in plain, unbranded packaging with no indication of the contents on the outer label.",
          fr: "Oui. Nous prenons la confidentialité au sérieux : chaque commande est expédiée dans un emballage neutre, sans marque ni indication du contenu sur l'étiquette extérieure.",
        },
      },
      {
        id: "lost",
        q: { en: "My order hasn't arrived. What should I do?", fr: "Ma commande n'est pas arrivée. Que faire ?" },
        a: {
          en: "First check the tracking number from your shipping confirmation email. If tracking has stalled, or the parcel shows \"delivered\" but you haven't received it, contact us and we will open a ticket with the carrier. A parcel lost in transit is reshipped at no cost once the carrier declares it lost, in accordance with our shipping policy.",
          fr: "Vérifiez d'abord le numéro de suivi de votre courriel de confirmation d'expédition. Si le suivi est bloqué, ou si le colis est indiqué « livré » mais que vous ne l'avez pas reçu, contactez-nous et nous ouvrirons un dossier auprès du transporteur. Un colis perdu en transit est réexpédié sans frais dès que le transporteur le déclare perdu, conformément à notre politique d'expédition.",
        },
      },
      {
        id: "rates-change",
        q: { en: "Can shipping rates or options change?", fr: "Les tarifs ou options de livraison peuvent-ils changer ?" },
        a: {
          en: "Yes. Shipping rates, delivery options and promotional offers (including free shipping) may change at any time without prior notice.",
          fr: "Oui. Les tarifs de livraison, les options et les offres promotionnelles (y compris la livraison gratuite) peuvent changer à tout moment sans préavis.",
        },
      },
    ],
  },
  {
    id: "storage",
    en: "Storage & Handling",
    fr: "Entreposage & manipulation",
    items: [
      {
        id: "storage-how",
        q: { en: "How should peptides be stored?", fr: "Comment entreposer les peptides ?" },
        a: {
          en: "Lyophilized (powder form): keep in a cool, dry place away from direct sunlight; for long-term storage (months or years), keep frozen at -20°C. Reconstituted (mixed): once diluted with a solvent such as bacteriostatic water, the solution must be refrigerated (2°C to 8°C) and used within the timeframe dictated by your research protocol, typically 4 to 6 weeks.",
          fr: "Lyophilisé (forme en poudre) : conserver dans un endroit frais et sec, à l'abri de la lumière directe ; pour un entreposage à long terme (mois ou années), conserver au congélateur à -20 °C. Reconstitué (mélangé) : une fois dilué avec un solvant comme l'eau bactériostatique, la solution doit être réfrigérée (2 °C à 8 °C) et utilisée dans le délai prescrit par votre protocole de recherche, généralement 4 à 6 semaines.",
        },
      },
      {
        id: "shelf-life",
        q: { en: "What is the shelf life of your products?", fr: "Quelle est la durée de conservation de vos produits ?" },
        a: {
          en: "In their lyophilized (powder) state, our peptides remain stable for up to 24 months when stored properly in a freezer.",
          fr: "À l'état lyophilisé (poudre), nos peptides demeurent stables jusqu'à 24 mois lorsqu'ils sont correctement entreposés au congélateur.",
        },
      },
      {
        id: "coa",
        q: { en: "Are certificates of analysis (COA) available?", fr: "Des certificats d'analyse (COA) sont-ils disponibles ?" },
        a: {
          en: "Yes. Products displaying the \"COA Available\" badge come with an independent certificate of analysis. See our Lab & COA page for details on purity testing.",
          fr: "Oui. Les produits affichant le badge « COA disponible » sont accompagnés d'un certificat d'analyse indépendant. Consultez notre page Lab & COA pour les détails sur les tests de pureté.",
        },
      },
    ],
  },
  {
    id: "payment",
    en: "Payment",
    fr: "Paiement",
    items: [
      {
        id: "methods",
        q: { en: "What payment methods do you accept?", fr: "Quels modes de paiement acceptez-vous ?" },
        a: {
          en: "We accept Interac e-Transfer and cryptocurrency via NOWPayments (BTC, ETH, USDT, LTC, SOL and 100+ others). Detailed instructions are provided at checkout.",
          fr: "Nous acceptons les virements Interac ainsi que les cryptomonnaies via NOWPayments (BTC, ETH, USDT, LTC, SOL et plus de 100 autres). Les instructions detaillees sont fournies au moment du paiement.",
        },
      },
      {
        id: "interac",
        q: { en: "How does Interac e-Transfer payment work?", fr: "Comment fonctionne le paiement par virement Interac ?" },
        a: {
          en: "After placing your order, you receive detailed instructions to send an Interac e-Transfer. We confirm receipt within 24 hours and ship immediately according to our dispatch schedule.",
          fr: "Après avoir passé votre commande, vous recevez des instructions détaillées pour envoyer un virement Interac. Nous confirmons la réception sous 24 h et expédions immédiatement selon notre horaire d'expédition.",
        },
      },
      {
        id: "crypto",
        q: { en: "Do you accept crypto?", fr: "Acceptez-vous les cryptomonnaies ?" },
        a: {
          en: "Yes — via NOWPayments. BTC, ETH, USDT, LTC, SOL and 100+ other cryptocurrencies are supported, with instant on-chain confirmations.",
          fr: "Oui — via NOWPayments. BTC, ETH, USDT, LTC, SOL et plus de 100 autres cryptomonnaies sont supportées, avec confirmations instantanées sur la chaîne.",
        },
      },
      {
        id: "unpaid",
        q: { en: "What happens if I don't send my payment?", fr: "Que se passe-t-il si je n'envoie pas mon paiement ?" },
        a: {
          en: "Your order holds the stock for 30 minutes. If payment has not been received in that time, the order is cancelled and the vials return to the shop for someone else. Our stock is limited, so we cannot hold it longer. You can place a new order at any time, subject to availability.",
          fr: "Votre commande réserve le stock pendant 30 minutes. Passé ce délai sans paiement reçu, la commande est annulée et les flacons repartent à la vente. Notre stock est limité : nous ne pouvons pas l'immobiliser plus longtemps. Vous pouvez repasser une commande à tout moment, selon les disponibilités.",
        },
      },
    ],
  },
  {
    id: "orders",
    en: "Orders, Returns & Refunds",
    fr: "Commandes, retours & remboursements",
    items: [
      {
        id: "cancel",
        q: { en: "Can I cancel my order?", fr: "Puis-je annuler ma commande ?" },
        a: {
          en: "Yes — as long as your order has not shipped yet, contact us and we will cancel it and process your refund once confirmed.",
          fr: "Oui — tant que votre commande n'a pas encore été expédiée, contactez-nous et nous l'annulerons puis traiterons votre remboursement une fois la confirmation faite.",
        },
      },
      {
        id: "returns",
        q: { en: "Can I return a product once received?", fr: "Puis-je retourner un produit une fois reçu ?" },
        a: {
          en: "Due to the sensitive nature of research peptides and the risk of degradation once they leave our controlled environment, all sales are final: no returns or exchanges. However, if there is an error with your order or a product arrives damaged, contact us within 48 hours of delivery and we will make it right.",
          fr: "En raison de la nature sensible des peptides de recherche et du risque de dégradation dès qu'ils quittent notre environnement contrôlé, toutes les ventes sont finales : aucun retour ni échange. Toutefois, en cas d'erreur dans votre commande ou de produit endommagé, contactez-nous dans les 48 heures suivant la livraison et nous corrigerons la situation.",
        },
      },
      {
        id: "refund-time",
        q: { en: "How long does a refund take?", fr: "Combien de temps prend un remboursement ?" },
        a: {
          en: "If your order has not shipped and a refund is approved, it typically appears in your account within 2 to 3 business days after processing.",
          fr: "Si votre commande n'a pas été expédiée et qu'un remboursement est approuvé, il apparaît généralement dans votre compte dans les 2 à 3 jours ouvrables suivant le traitement.",
        },
      },
      {
        id: "address-error",
        q: { en: "I made a mistake in my shipping address. What now?", fr: "J'ai fait une erreur dans mon adresse de livraison. Que faire ?" },
        a: {
          en: "Contact us as soon as possible. If the parcel is returned to us because of an address error, it will be reshipped once the carrier's return and reshipping fees have been covered, as set out in our shipping policy.",
          fr: "Contactez-nous le plus rapidement possible. Si le colis nous est retourné en raison d'une erreur d'adresse, il sera réexpédié une fois les frais de retour et de réexpédition du transporteur acquittés, tel que prévu dans notre politique d'expédition.",
        },
      },
      {
        id: "bulk",
        q: { en: "What about bulk or special orders?", fr: "Et pour les commandes en gros ou spéciales ?" },
        a: {
          en: "For bulk or special orders, contact us directly — our team will be glad to help with any specific request.",
          fr: "Pour les commandes en gros ou spéciales, contactez-nous directement — notre équipe se fera un plaisir de répondre à toute demande particulière.",
        },
      },
    ],
  },
  {
    id: "usage",
    en: "Products & Permitted Use",
    fr: "Produits & usage permis",
    items: [
      {
        id: "human-use",
        q: { en: "Are your products for personal or human use?", fr: "Vos produits sont-ils destinés à un usage personnel ou humain ?" },
        a: {
          en: "No. Every product sold on FIRONOVA is intended strictly for in-vitro laboratory research or educational purposes only. Any personal use, or human or animal consumption, is strictly prohibited. See our Terms & Conditions for full details.",
          fr: "Non. Chaque produit vendu sur FIRONOVA est destiné strictement à la recherche en laboratoire in vitro ou à des fins éducatives uniquement. Tout usage personnel, ou toute consommation humaine ou animale, est strictement interdit. Consultez nos Conditions Générales pour tous les détails.",
        },
        termsLink: true,
      },
      {
        id: "age",
        q: { en: "Is there an age requirement to order?", fr: "Y a-t-il une exigence d'âge pour commander ?" },
        a: {
          en: "Yes. Access to the website and purchases are reserved exclusively for individuals 19 years of age or older.",
          fr: "Oui. L'accès au site et les achats sont réservés exclusivement aux personnes âgées de 19 ans ou plus.",
        },
      },
      {
        id: "who-can-buy",
        q: { en: "Who can purchase from FIRONOVA?", fr: "Qui peut acheter chez FIRONOVA ?" },
        a: {
          en: "Our products are offered solely to qualified laboratory research professionals who are trained and authorized to handle such materials in an appropriate research setting, as set out in our Terms & Conditions.",
          fr: "Nos produits sont offerts uniquement aux professionnels qualifiés de la recherche en laboratoire, formés et autorisés à manipuler de telles matières dans un cadre de recherche approprié, tel que prévu dans nos Conditions Générales.",
        },
        termsLink: true,
      },
    ],
  },
];

export default function Faq() {
  useDocumentHead({ title: "FAQ", path: "/faq" });
  const { lang } = useLang();
  const isFr = lang === "fr";
  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16" data-testid="faq-page">
        <header className="border-b border-ash pb-6">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">FIRONOVA</p>
          <h1 className="font-display text-[42px] sm:text-[52px] font-bold text-nordfjord tracking-[-0.01em]">FAQ</h1>
          <p className="mt-4 text-sm text-glacier">
            {isFr
              ? "Les réponses ci-dessous reflètent nos Conditions Générales, notre Politique d'expédition et notre Politique de confidentialité. En cas de divergence, ces documents prévalent."
              : "The answers below reflect our Terms & Conditions, Shipping Policy and Privacy Policy. In the event of a discrepancy, those documents prevail."}
          </p>
        </header>

        {GROUPS.map((g) => (
          <section key={g.id} id={g.id} data-testid={`faq-group-${g.id}`}>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-nordfjord">
              {isFr ? g.fr : g.en}
            </h2>
            <Accordion type="single" collapsible className="mt-4">
              {g.items.map((item) => (
                <AccordionItem key={item.id} value={item.id} data-testid={`faq-item-${item.id}`} className="border-ash">
                  <AccordionTrigger className="text-left font-bold text-nordfjord" data-testid={`faq-trigger-${item.id}`}>
                    {isFr ? item.q.fr : item.q.en}
                  </AccordionTrigger>
                  <AccordionContent className="text-glacier leading-relaxed">
                    {isFr ? item.a.fr : item.a.en}
                    {item.termsLink && (
                      <>
                        {" "}
                        <Link to="/compliance" className="text-nova underline font-medium" data-testid={`faq-terms-link-${item.id}`}>
                          {isFr ? "Voir les Conditions Générales →" : "See the Terms & Conditions →"}
                        </Link>
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}

        <section className="border-t border-ash pt-10" data-testid="faq-contact">
          <h2 className="font-display text-2xl font-bold text-nordfjord">
            {isFr ? "Une autre question ?" : "Still have a question?"}
          </h2>
          <p className="mt-3 text-glacier leading-relaxed">
            {isFr
              ? "Écrivez-nous et nous ferons de notre mieux pour répondre dans les 24 heures (délai maximal de 2 jours ouvrables)."
              : "Email us and we will do our best to reply within 24 hours (maximum 2 business days)."}
          </p>
          <a
            href="mailto:info@fironova.com"
            className="inline-block mt-4 btn-pill btn-nova"
            data-testid="faq-contact-email"
          >
            info@fironova.com
          </a>
        </section>
      </div>
    </div>
  );
}
