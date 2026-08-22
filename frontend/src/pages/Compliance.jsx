import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

const TERMS = [
  {
    id: "acceptance",
    en: { title: "Acceptance of These Terms" },
    fr: { title: "Acceptation des présentes conditions" },
    paras: [
      {
        en: "By browsing, registering on, or purchasing from FIRONOVA, you accept these Terms & Conditions together with our Privacy Policy, which forms an integral part of this agreement. If any part of these terms is unacceptable to you, you must refrain from using or ordering from this website.",
        fr: "En naviguant sur FIRONOVA, en vous y inscrivant ou en y effectuant un achat, vous acceptez les présentes Conditions Générales ainsi que notre Politique de confidentialité, laquelle fait partie intégrante de cette entente. Si une partie quelconque de ces conditions ne vous convient pas, vous devez vous abstenir d'utiliser ce site ou d'y commander.",
      },
      {
        en: "Your use of this website grants no right to copy, redistribute, license, resell, adapt or commercially exploit any product, service, text, image, logo, mark or other material found here. Any reproduction or modification of our content requires our prior written authorization.",
        fr: "L'utilisation de ce site ne vous confère aucun droit de copier, redistribuer, concéder sous licence, revendre, adapter ou exploiter commercialement les produits, services, textes, images, logos, marques ou tout autre élément qui s'y trouve. Toute reproduction ou modification de notre contenu exige notre autorisation écrite préalable.",
      },
    ],
  },
  {
    id: "disclaimer",
    en: { title: "Disclaimer & Terms of Use" },
    fr: { title: "Avertissement et conditions d'utilisation" },
    paras: [
      {
        en: "FIRONOVA provides no warranty or guarantee, express or implied, concerning any product sold or any information published on this website. Before acquiring anything from us, you are responsible for consulting a licensed physician or qualified healthcare professional of your own choosing.",
        fr: "FIRONOVA n'offre aucune garantie, expresse ou implicite, concernant les produits vendus ou les informations publiées sur ce site. Avant toute acquisition, il vous incombe de consulter un médecin autorisé ou un professionnel de la santé qualifié de votre choix.",
      },
      {
        en: "Nothing offered on this website constitutes medical advice, a diagnosis, a treatment or a means of preventing or curing any illness or health condition. Always seek the opinion of a licensed medical professional for any health-related question.",
        fr: "Rien de ce qui est offert sur ce site ne constitue un avis médical, un diagnostic, un traitement ou un moyen de prévenir ou de guérir une maladie ou un problème de santé. Adressez-vous toujours à un professionnel de la santé autorisé pour toute question d'ordre médical.",
      },
      {
        en: "All information presented on FIRONOVA is supplied strictly for in-vitro laboratory research and educational purposes. Products sold here are not approved or authorized by any regulatory authority to diagnose, treat, mitigate, prevent or cure any disease or condition.",
        fr: "Toutes les informations présentées sur FIRONOVA sont fournies strictement à des fins de recherche en laboratoire in vitro et d'éducation. Les produits vendus ici ne sont approuvés ni autorisés par aucune autorité réglementaire pour diagnostiquer, traiter, atténuer, prévenir ou guérir quelque maladie ou condition que ce soit.",
      },
      {
        en: "You acknowledge that every product sold by FIRONOVA is strictly prohibited from any human or animal use: these compounds must never be consumed, ingested, injected or administered in any manner to a person or an animal.",
        fr: "Vous reconnaissez que chaque produit vendu par FIRONOVA est strictement interdit à tout usage humain ou animal : ces composés ne doivent jamais être consommés, ingérés, injectés ou administrés de quelque manière que ce soit à une personne ou à un animal.",
      },
      {
        en: "FIRONOVA may update, correct or withdraw any content, and adjust product pricing, at any time and without notice, and may decline to serve any individual at its sole discretion. We accept no liability for inaccuracies, omissions or errors appearing in product descriptions or other website content.",
        fr: "FIRONOVA peut mettre à jour, corriger ou retirer tout contenu, et ajuster le prix des produits, à tout moment et sans préavis, et peut refuser de servir toute personne à sa seule discrétion. Nous n'assumons aucune responsabilité pour les inexactitudes, omissions ou erreurs figurant dans les descriptions de produits ou tout autre contenu du site.",
      },
      {
        en: "By purchasing or handling any product from FIRONOVA, you fully release, indemnify and hold FIRONOVA harmless from any claim, liability, damage or proceeding arising from the possession, handling or use of any product, whether founded on contract, negligence, strict liability or otherwise.",
        fr: "En achetant ou en manipulant un produit de FIRONOVA, vous libérez entièrement FIRONOVA et le dégagez de toute réclamation, responsabilité, dommage ou procédure découlant de la possession, de la manipulation ou de l'utilisation d'un produit, que le fondement soit contractuel, la négligence, la responsabilité stricte ou autre.",
      },
    ],
  },
  {
    id: "age",
    en: { title: "Age Restriction" },
    fr: { title: "Restriction d'âge" },
    paras: [
      {
        en: "Access to and purchases on FIRONOVA are reserved exclusively for individuals 19 years of age or older. By using this website you confirm that you meet this age requirement.",
        fr: "L'accès à FIRONOVA et les achats qui y sont effectués sont réservés exclusivement aux personnes âgées de 19 ans ou plus. En utilisant ce site, vous confirmez satisfaire à cette exigence d'âge.",
      },
    ],
  },
  {
    id: "product-use",
    en: { title: "Use of Our Products" },
    fr: { title: "Utilisation de nos produits" },
    paras: [
      {
        en: "Every product available on FIRONOVA is designated exclusively for laboratory research and is not for human or animal consumption in any form, by any method, or under any circumstance. If you do not fully understand and accept this restriction, do not order from this website.",
        fr: "Chaque produit offert sur FIRONOVA est destiné exclusivement à la recherche en laboratoire et n'est pas destiné à la consommation humaine ou animale, sous quelque forme, par quelque méthode ou dans quelque circonstance que ce soit. Si vous ne comprenez pas pleinement cette restriction ou ne l'acceptez pas, ne commandez pas sur ce site.",
      },
      {
        en: "Our products must not be blended, altered, reformulated or otherwise prepared for administration to any person or animal. They are not supplements, foods, food ingredients, cosmetics, medical devices, drugs or health products of any kind, whether for private or commercial purposes.",
        fr: "Nos produits ne doivent pas être mélangés, altérés, reformulés ou autrement préparés en vue d'une administration à une personne ou à un animal. Ils ne constituent ni des suppléments, ni des aliments, ni des ingrédients alimentaires, ni des cosmétiques, ni des instruments médicaux, ni des médicaments, ni des produits de santé de quelque nature que ce soit, à des fins privées ou commerciales.",
      },
      {
        en: "The only permitted use of any product acquired from FIRONOVA is laboratory research carried out by appropriately qualified or licensed professionals within a suitable research environment.",
        fr: "Le seul usage permis d'un produit acquis auprès de FIRONOVA est la recherche en laboratoire menée par des professionnels dûment qualifiés ou autorisés, dans un environnement de recherche approprié.",
      },
    ],
  },
  {
    id: "returns",
    en: { title: "Return Policy" },
    fr: { title: "Politique de retour" },
    paras: [
      {
        en: "FIRONOVA does not accept returns. Every sale is final as soon as the order is placed, except in the case of a documented product defect reported within 48 hours of delivery.",
        fr: "FIRONOVA n'accepte aucun retour. Toute vente est finale dès que la commande est passée, sauf en cas de défaut de produit documenté et signalé dans les 48 heures suivant la livraison.",
      },
    ],
  },
  {
    id: "customer-agreement",
    en: { title: "Customer Agreement" },
    fr: { title: "Engagement du client" },
    paras: [
      {
        en: "By accessing, using or ordering from FIRONOVA, you represent and warrant that you have independently reviewed and understood: (a) the intended use of our products, limited strictly to laboratory research; (b) all safety warnings, hazards and handling precautions associated with these compounds; and (c) every regulatory and legal requirement governing the possession, use or handling of these products in your province, territory or jurisdiction.",
        fr: "En accédant à FIRONOVA, en l'utilisant ou en y commandant, vous déclarez et garantissez avoir examiné et compris de façon indépendante : (a) l'usage prévu de nos produits, strictement limité à la recherche en laboratoire ; (b) l'ensemble des avertissements de sécurité, dangers et précautions de manipulation associés à ces composés ; et (c) toutes les exigences réglementaires et légales encadrant la possession, l'utilisation ou la manipulation de ces produits dans votre province, territoire ou juridiction.",
      },
    ],
  },
  {
    id: "professional-use",
    en: { title: "Professional Use Requirement" },
    fr: { title: "Exigence d'usage professionnel" },
    paras: [
      {
        en: "Products are offered solely to laboratory research professionals who are properly trained, qualified and authorized to handle such materials in an adequate research setting.",
        fr: "Les produits sont offerts uniquement aux professionnels de la recherche en laboratoire dûment formés, qualifiés et autorisés à manipuler de telles matières dans un cadre de recherche adéquat.",
      },
      {
        en: "You agree that any product purchased will be evaluated, tested and validated for safety and regulatory conformance before any further application, and that all research will be conducted by experienced, authorized personnel in accordance with applicable statutory requirements.",
        fr: "Vous convenez que tout produit acheté sera évalué, testé et validé quant à sa sécurité et à sa conformité réglementaire avant toute application ultérieure, et que toute recherche sera menée par du personnel expérimenté et autorisé, dans le respect des exigences légales applicables.",
      },
    ],
  },
  {
    id: "regulatory",
    en: { title: "Regulatory Obligations" },
    fr: { title: "Obligations réglementaires" },
    paras: [
      {
        en: "You agree that no product purchased from FIRONOVA will be altered, adulterated, misbranded or introduced into commerce in contravention of the laws applicable in your jurisdiction. Unless expressly stated otherwise, all products are supplied for research use only, and you bear sole responsibility for ensuring that your possession and use of them respects every applicable federal, provincial and local requirement.",
        fr: "Vous convenez qu'aucun produit acheté auprès de FIRONOVA ne sera altéré, falsifié, mal étiqueté ou mis en circulation en contravention des lois applicables dans votre juridiction. Sauf indication expresse contraire, tous les produits sont fournis à des fins de recherche uniquement, et il vous incombe exclusivement de vous assurer que leur possession et leur utilisation respectent toutes les exigences fédérales, provinciales et locales applicables.",
      },
    ],
  },
  {
    id: "purchaser-responsibility",
    en: { title: "Responsibility of the Purchaser" },
    fr: { title: "Responsabilité de l'acheteur" },
    paras: [
      {
        en: "As a purchaser, you take on full responsibility for: identifying and understanding the hazards and risks tied to each product; carrying out all research in compliance with applicable laws and regulations; and ensuring appropriate storage, handling and disposal of every product.",
        fr: "En tant qu'acheteur, vous assumez l'entière responsabilité : d'identifier et de comprendre les dangers et risques liés à chaque produit ; de mener toute recherche dans le respect des lois et règlements applicables ; et d'assurer l'entreposage, la manipulation et l'élimination appropriés de chaque produit.",
      },
    ],
  },
  {
    id: "liability",
    en: { title: "Limitation of Liability" },
    fr: { title: "Limitation de responsabilité" },
    paras: [
      {
        en: "FIRONOVA cannot be held responsible for damages, losses or claims resulting from a purchaser's failure to observe these terms, including misuse, negligence, mishandling, abuse or unforeseen events connected to any product or service sold.",
        fr: "FIRONOVA ne peut être tenue responsable des dommages, pertes ou réclamations résultant du non-respect des présentes conditions par un acheteur, y compris le mésusage, la négligence, la mauvaise manipulation, l'abus ou tout événement imprévu lié à un produit ou service vendu.",
      },
      {
        en: "THESE PRODUCTS ARE NOT FOR HUMAN OR ANIMAL CONSUMPTION UNDER ANY CIRCUMSTANCES, IN ANY FORM, OR UNDER ANY CONDITIONS.",
        fr: "CES PRODUITS NE SONT PAS DESTINÉS À LA CONSOMMATION HUMAINE OU ANIMALE, EN AUCUNE CIRCONSTANCE, SOUS AUCUNE FORME NI AUCUNE CONDITION.",
        strong: true,
      },
    ],
  },
  {
    id: "indemnification",
    en: { title: "Indemnification" },
    fr: { title: "Indemnisation" },
    paras: [
      {
        en: "You agree to indemnify, defend and hold harmless FIRONOVA, its owners, officers, directors, employees and partners against any claim, damage, loss, liability or legal expense (including reasonable attorney fees) arising from your use of the website or from any breach of these Terms & Conditions.",
        fr: "Vous acceptez d'indemniser, de défendre et de dégager de toute responsabilité FIRONOVA, ses propriétaires, dirigeants, administrateurs, employés et partenaires contre toute réclamation, dommage, perte, responsabilité ou frais juridique (y compris les honoraires d'avocat raisonnables) découlant de votre utilisation du site ou de toute violation des présentes Conditions Générales.",
      },
    ],
  },
  {
    id: "availability",
    en: { title: "Website Availability" },
    fr: { title: "Disponibilité du site" },
    paras: [
      {
        en: "Although we strive to keep FIRONOVA accessible at all times, uninterrupted availability is not guaranteed. The website may become unavailable without notice due to maintenance, technical incidents or factors beyond our control, and FIRONOVA accepts no liability for damages caused by such downtime.",
        fr: "Bien que nous nous efforcions de garder FIRONOVA accessible en tout temps, une disponibilité ininterrompue n'est pas garantie. Le site peut devenir indisponible sans préavis en raison de maintenance, d'incidents techniques ou de facteurs hors de notre contrôle, et FIRONOVA n'assume aucune responsabilité pour les dommages causés par une telle interruption.",
      },
      {
        en: "Use of the website is permitted for individual users only. Access by organizations, agents, legal representatives or third parties acting on behalf of others is prohibited.",
        fr: "L'utilisation du site est permise aux utilisateurs individuels uniquement. L'accès par des organisations, mandataires, représentants légaux ou tiers agissant pour le compte d'autrui est interdit.",
      },
    ],
  },
  {
    id: "entire-agreement",
    en: { title: "Entire Agreement" },
    fr: { title: "Intégralité de l'entente" },
    paras: [
      {
        en: "These Terms & Conditions, together with the Privacy Policy and the disclaimers referenced herein, constitute the complete agreement between you and FIRONOVA and replace any prior understanding, written or verbal. No amendment is valid unless issued in writing by FIRONOVA.",
        fr: "Les présentes Conditions Générales, conjointement avec la Politique de confidentialité et les avertissements auxquels elles renvoient, constituent l'entente complète entre vous et FIRONOVA et remplacent toute entente antérieure, écrite ou verbale. Aucune modification n'est valide à moins d'être émise par écrit par FIRONOVA.",
      },
    ],
  },
  {
    id: "severability",
    en: { title: "Severability" },
    fr: { title: "Divisibilité" },
    paras: [
      {
        en: "Should a court of competent jurisdiction declare any provision of these terms unenforceable, that provision will be severed and the remaining provisions will continue in full force and effect.",
        fr: "Si un tribunal compétent déclare une disposition des présentes conditions inapplicable, cette disposition sera retranchée et les dispositions restantes demeureront pleinement en vigueur.",
      },
    ],
  },
  {
    id: "headings",
    en: { title: "Headings" },
    fr: { title: "Titres" },
    paras: [
      {
        en: "Section headings are included for convenience only and have no bearing on the interpretation of these terms.",
        fr: "Les titres de sections sont fournis à titre indicatif seulement et n'ont aucune incidence sur l'interprétation des présentes conditions.",
      },
    ],
  },
  {
    id: "force-majeure",
    en: { title: "Force Majeure" },
    fr: { title: "Force majeure" },
    paras: [
      {
        en: "Neither party will be liable for a failure or delay in performance attributable to events beyond its reasonable control, including natural disasters, acts of war or terrorism, labour disputes, government measures, internet or power outages, carrier delays, supply chain disruptions, lost or stolen mail, or customs holds.",
        fr: "Aucune des parties ne sera responsable d'un manquement ou d'un retard d'exécution attribuable à des événements hors de son contrôle raisonnable, notamment les catastrophes naturelles, actes de guerre ou de terrorisme, conflits de travail, mesures gouvernementales, pannes d'internet ou d'électricité, retards de transporteurs, perturbations de la chaîne d'approvisionnement, courrier perdu ou volé, ou retenues douanières.",
      },
    ],
  },
  {
    id: "acknowledgement",
    en: { title: "Final Acknowledgement" },
    fr: { title: "Reconnaissance finale" },
    paras: [
      {
        en: "By placing an order and confirming your acceptance at checkout, you certify that you have read, understood and agreed to all Terms & Conditions, privacy policies, disclaimers and disclosures published by FIRONOVA.",
        fr: "En passant une commande et en confirmant votre acceptation au moment du paiement, vous certifiez avoir lu, compris et accepté l'ensemble des Conditions Générales, politiques de confidentialité, avertissements et divulgations publiés par FIRONOVA.",
      },
      {
        en: "All products sold are strictly for laboratory, research or analytical purposes only and are not for human or animal consumption.",
        fr: "Tous les produits vendus sont strictement destinés à des fins de laboratoire, de recherche ou d'analyse uniquement et ne sont pas destinés à la consommation humaine ou animale.",
        strong: true,
      },
    ],
  },
];

const SHIPPING = [
  {
    id: "carriers",
    en: { title: "Carriers & Free Shipping" },
    fr: { title: "Transporteurs et livraison gratuite" },
    paras: [
      {
        en: "Shipping is free on all orders of $200 or more. For orders under $200, a flat rate of $20 applies, calculated automatically at checkout. Depending on the destination, parcels are sent via Canada Post or UPS, with tracking included. When you select the free or economy option, FIRONOVA chooses the carrier best suited to your location.",
        fr: "La livraison est gratuite pour toute commande de 200 $ et plus. Pour les commandes de moins de 200 $, un tarif fixe de 20 $ s'applique, calculé automatiquement au moment du paiement. Selon la destination, les colis sont envoyés via Postes Canada ou UPS, avec suivi inclus. Lorsque vous choisissez l'option gratuite ou économique, FIRONOVA sélectionne le transporteur le mieux adapté à votre emplacement.",
      },
    ],
  },
  {
    id: "delivery-times",
    en: { title: "Delivery Times" },
    fr: { title: "Délais de livraison" },
    paras: [
      {
        en: "All orders are shipped from Canada. Transit time depends on the distance to your address: Ontario and Québec typically receive their parcel within 1 to 2 business days, Western and Atlantic Canada within 4 to 5 business days, and remote regions may require up to 10 days.",
        fr: "Toutes les commandes sont expédiées depuis le Canada. Le délai de transport dépend de la distance jusqu'à votre adresse : l'Ontario et le Québec reçoivent généralement leur colis en 1 à 2 jours ouvrables, l'Ouest et les provinces de l'Atlantique en 4 à 5 jours ouvrables, et les régions éloignées peuvent nécessiter jusqu'à 10 jours.",
      },
    ],
  },
  {
    id: "unpaid-orders",
    en: { title: "Unpaid Orders" },
    fr: { title: "Commandes impayées" },
    paras: [
      {
        en: "Orders placed with a deferred payment method (Interac e-Transfer or cryptocurrency) must be paid within 30 minutes. If payment has not been received within that window, the order is automatically cancelled and the reserved stock is released. Simply place a new order if you still wish to purchase, subject to availability. Should a payment reach us after cancellation, we will contact you to either reinstate the order or refund the amount.",
        fr: "Les commandes passées avec un mode de paiement différé (virement Interac ou cryptomonnaie) doivent être payées dans un délai de 30 minutes. Si le paiement n'est pas reçu dans ce délai, la commande est automatiquement annulée et le stock réservé est libéré. Il vous suffit de passer une nouvelle commande si vous souhaitez toujours acheter, selon les disponibilités. Si un paiement nous parvient après l'annulation, nous vous contacterons pour rétablir la commande ou vous rembourser.",
      },
    ],
  },
  {
    id: "dispatch",
    en: { title: "Dispatch of Orders" },
    fr: { title: "Expédition des commandes" },
    paras: [
      {
        en: "Orders leave our facility Monday through Friday, excluding statutory holidays, as carriers only accept new shipments on business days. Orders placed and paid before 2:00 p.m. Eastern time are dispatched the same day; orders received after 2:00 p.m. leave the next business day. An order paid after 2:00 p.m. on a Friday will be shipped the following Monday (holidays excluded).",
        fr: "Les commandes quittent nos installations du lundi au vendredi, à l'exception des jours fériés, car les transporteurs n'acceptent de nouveaux envois que les jours ouvrables. Les commandes passées et payées avant 14 h (heure de l'Est) sont expédiées le jour même ; celles reçues après 14 h partent le jour ouvrable suivant. Une commande payée après 14 h un vendredi sera expédiée le lundi suivant (jours fériés exclus).",
      },
    ],
  },
  {
    id: "delays",
    en: { title: "Shipping Delays" },
    fr: { title: "Retards de livraison" },
    paras: [
      {
        en: "A shipping \"day\" corresponds to a 24-hour period and excludes the day the parcel leaves our facility. For example, a parcel dispatched Monday afternoon that arrives Wednesday afternoon has travelled 2 days. Published transit times are estimates for most destinations and are not guaranteed.",
        fr: "Un « jour » de livraison correspond à une période de 24 heures et exclut le jour où le colis quitte nos installations. Par exemple, un colis expédié lundi après-midi qui arrive mercredi après-midi a voyagé 2 jours. Les délais publiés sont des estimations pour la plupart des destinations et ne sont pas garantis.",
      },
      {
        en: "FIRONOVA hands your parcel to the selected carrier in accordance with the dispatch schedule above. Should the carrier experience a delay, we will do our best to help expedite delivery; however, FIRONOVA cannot be held responsible for delays caused by the carrier.",
        fr: "FIRONOVA remet votre colis au transporteur sélectionné conformément à l'horaire d'expédition ci-dessus. En cas de retard du transporteur, nous ferons de notre mieux pour accélérer la livraison ; toutefois, FIRONOVA ne peut être tenue responsable des retards causés par le transporteur.",
      },
    ],
  },
  {
    id: "address-errors",
    en: { title: "Address Errors" },
    fr: { title: "Erreurs d'adresse" },
    paras: [
      {
        en: "We rely on you to provide a complete and accurate delivery address. If a parcel is returned to us because of an error in the address you supplied, it will be reshipped once you have covered the fees charged by the carrier for the return and the new shipment.",
        fr: "Nous comptons sur vous pour fournir une adresse de livraison complète et exacte. Si un colis nous est retourné en raison d'une erreur dans l'adresse que vous avez fournie, il sera réexpédié une fois que vous aurez acquitté les frais facturés par le transporteur pour le retour et le nouvel envoi.",
      },
    ],
  },
  {
    id: "lost-packages",
    en: { title: "Lost Packages" },
    fr: { title: "Colis perdus" },
    paras: [
      {
        en: "In the rare event a parcel is lost in transit (no delivery scan at your address), it will be reshipped at no cost to you once the carrier officially declares it lost. If the parcel was scanned as delivered at your address, a reshipment is only possible after the carrier completes its investigation and concludes the parcel was lost or misdelivered. If the investigation establishes that the parcel was delivered to your address, no reshipment will be issued.",
        fr: "Dans le cas rare où un colis serait perdu en transit (aucun balayage de livraison à votre adresse), il sera réexpédié sans frais dès que le transporteur l'aura officiellement déclaré perdu. Si le colis a été balayé comme livré à votre adresse, une réexpédition n'est possible qu'après que le transporteur a terminé son enquête et conclu que le colis a été perdu ou mal livré. Si l'enquête établit que le colis a bien été livré à votre adresse, aucune réexpédition ne sera effectuée.",
      },
    ],
  },
  {
    id: "returns-note",
    en: { title: "Returns" },
    fr: { title: "Retours" },
    paras: [
      {
        en: "Due to the nature of the products, all sales are final. No returns or refunds, except in the case of a documented product defect reported within 48 hours of delivery.",
        fr: "En raison de la nature des produits, toutes les ventes sont finales. Aucun retour ni remboursement, sauf en cas de défaut de produit documenté et signalé dans les 48 heures suivant la livraison.",
      },
    ],
  },
];

export default function Compliance() {
  useDocumentHead({ title: "Compliance", description: "Fironova compliance and regulatory positioning. For Research Use Only. Not for human consumption.", path: "/compliance" });
  const { lang } = useLang();
  const isFr = lang === "fr";
  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16" data-testid="compliance-page">
        <header className="border-b border-ash pb-6">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">FIRONOVA</p>
          <h1 className="font-display text-[42px] sm:text-[52px] font-bold text-nordfjord tracking-[-0.01em]">
            {isFr ? "Conditions Générales" : "Terms & Conditions"}
          </h1>
          <p className="mt-4 text-sm text-glacier">
            {isFr
              ? "Dernière mise à jour : juin 2026 · Ces conditions s'appliquent à toute utilisation du site et à tout achat effectué sur FIRONOVA."
              : "Last updated: June 2026 · These terms apply to all use of the website and every purchase made on FIRONOVA."}
          </p>
        </header>

        <section id="terms" data-testid="section-terms" className="space-y-12">
          {TERMS.map((s, i) => (
            <div key={s.id} id={s.id} data-testid={`terms-section-${s.id}`}>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-nordfjord">
                <span className="font-data text-sm text-nova mr-3">{String(i + 1).padStart(2, "0")}</span>
                {isFr ? s.fr.title : s.en.title}
              </h2>
              <div className="mt-4 space-y-4 text-glacier leading-relaxed">
                {s.paras.map((p, j) => (
                  <p key={j} className={p.strong ? "font-bold text-nordfjord" : undefined}>
                    {isFr ? p.fr : p.en}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section id="shipping" data-testid="section-shipping" className="border-t border-ash pt-12 space-y-10">
          <h2 className="font-display text-3xl font-bold text-nordfjord">
            {isFr ? "Politique d'expédition" : "Shipping Policy"}
          </h2>
          {SHIPPING.map((s) => (
            <div key={s.id} id={`shipping-${s.id}`} data-testid={`shipping-section-${s.id}`}>
              <h3 className="font-display text-xl font-bold text-nordfjord">
                {isFr ? s.fr.title : s.en.title}
              </h3>
              <div className="mt-3 space-y-3 text-glacier leading-relaxed">
                {s.paras.map((p, j) => (
                  <p key={j}>{isFr ? p.fr : p.en}</p>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
