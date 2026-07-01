import { useLang } from "../contexts/LanguageContext";

const TERMS = [
  {
    id: "acceptance",
    en: { title: "Acceptance of These Terms" },
    fr: { title: "Acceptation des présentes conditions" },
    paras: [
      {
        en: "By browsing, registering on, or purchasing from NORDPEP, you accept these Terms & Conditions together with our Privacy Policy, which forms an integral part of this agreement. If any part of these terms is unacceptable to you, you must refrain from using or ordering from this website.",
        fr: "En naviguant sur NORDPEP, en vous y inscrivant ou en y effectuant un achat, vous acceptez les présentes Conditions Générales ainsi que notre Politique de confidentialité, laquelle fait partie intégrante de cette entente. Si une partie quelconque de ces conditions ne vous convient pas, vous devez vous abstenir d'utiliser ce site ou d'y commander.",
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
        en: "NORDPEP provides no warranty or guarantee, express or implied, concerning any product sold or any information published on this website. Before acquiring anything from us, you are responsible for consulting a licensed physician or qualified healthcare professional of your own choosing.",
        fr: "NORDPEP n'offre aucune garantie, expresse ou implicite, concernant les produits vendus ou les informations publiées sur ce site. Avant toute acquisition, il vous incombe de consulter un médecin autorisé ou un professionnel de la santé qualifié de votre choix.",
      },
      {
        en: "Nothing offered on this website constitutes medical advice, a diagnosis, a treatment or a means of preventing or curing any illness or health condition. Always seek the opinion of a licensed medical professional for any health-related question.",
        fr: "Rien de ce qui est offert sur ce site ne constitue un avis médical, un diagnostic, un traitement ou un moyen de prévenir ou de guérir une maladie ou un problème de santé. Adressez-vous toujours à un professionnel de la santé autorisé pour toute question d'ordre médical.",
      },
      {
        en: "All information presented on NORDPEP is supplied strictly for in-vitro laboratory research and educational purposes. Products sold here are not approved or authorized by any regulatory authority to diagnose, treat, mitigate, prevent or cure any disease or condition.",
        fr: "Toutes les informations présentées sur NORDPEP sont fournies strictement à des fins de recherche en laboratoire in vitro et d'éducation. Les produits vendus ici ne sont approuvés ni autorisés par aucune autorité réglementaire pour diagnostiquer, traiter, atténuer, prévenir ou guérir quelque maladie ou condition que ce soit.",
      },
      {
        en: "You acknowledge that every product sold by NORDPEP is strictly prohibited from any human or animal use: these compounds must never be consumed, ingested, injected or administered in any manner to a person or an animal.",
        fr: "Vous reconnaissez que chaque produit vendu par NORDPEP est strictement interdit à tout usage humain ou animal : ces composés ne doivent jamais être consommés, ingérés, injectés ou administrés de quelque manière que ce soit à une personne ou à un animal.",
      },
      {
        en: "NORDPEP may update, correct or withdraw any content, and adjust product pricing, at any time and without notice, and may decline to serve any individual at its sole discretion. We accept no liability for inaccuracies, omissions or errors appearing in product descriptions or other website content.",
        fr: "NORDPEP peut mettre à jour, corriger ou retirer tout contenu, et ajuster le prix des produits, à tout moment et sans préavis, et peut refuser de servir toute personne à sa seule discrétion. Nous n'assumons aucune responsabilité pour les inexactitudes, omissions ou erreurs figurant dans les descriptions de produits ou tout autre contenu du site.",
      },
      {
        en: "By purchasing or handling any product from NORDPEP, you fully release, indemnify and hold NORDPEP harmless from any claim, liability, damage or proceeding arising from the possession, handling or use of any product, whether founded on contract, negligence, strict liability or otherwise.",
        fr: "En achetant ou en manipulant un produit de NORDPEP, vous libérez entièrement NORDPEP et le dégagez de toute réclamation, responsabilité, dommage ou procédure découlant de la possession, de la manipulation ou de l'utilisation d'un produit, que le fondement soit contractuel, la négligence, la responsabilité stricte ou autre.",
      },
    ],
  },
  {
    id: "age",
    en: { title: "Age Restriction" },
    fr: { title: "Restriction d'âge" },
    paras: [
      {
        en: "Access to and purchases on NORDPEP are reserved exclusively for individuals 19 years of age or older. By using this website you confirm that you meet this age requirement.",
        fr: "L'accès à NORDPEP et les achats qui y sont effectués sont réservés exclusivement aux personnes âgées de 19 ans ou plus. En utilisant ce site, vous confirmez satisfaire à cette exigence d'âge.",
      },
    ],
  },
  {
    id: "product-use",
    en: { title: "Use of Our Products" },
    fr: { title: "Utilisation de nos produits" },
    paras: [
      {
        en: "Every product available on NORDPEP is designated exclusively for laboratory research and is not for human or animal consumption in any form, by any method, or under any circumstance. If you do not fully understand and accept this restriction, do not order from this website.",
        fr: "Chaque produit offert sur NORDPEP est destiné exclusivement à la recherche en laboratoire et n'est pas destiné à la consommation humaine ou animale, sous quelque forme, par quelque méthode ou dans quelque circonstance que ce soit. Si vous ne comprenez pas pleinement cette restriction ou ne l'acceptez pas, ne commandez pas sur ce site.",
      },
      {
        en: "Our products must not be blended, altered, reformulated or otherwise prepared for administration to any person or animal. They are not supplements, foods, food ingredients, cosmetics, medical devices, drugs or health products of any kind, whether for private or commercial purposes.",
        fr: "Nos produits ne doivent pas être mélangés, altérés, reformulés ou autrement préparés en vue d'une administration à une personne ou à un animal. Ils ne constituent ni des suppléments, ni des aliments, ni des ingrédients alimentaires, ni des cosmétiques, ni des instruments médicaux, ni des médicaments, ni des produits de santé de quelque nature que ce soit, à des fins privées ou commerciales.",
      },
      {
        en: "The only permitted use of any product acquired from NORDPEP is laboratory research carried out by appropriately qualified or licensed professionals within a suitable research environment.",
        fr: "Le seul usage permis d'un produit acquis auprès de NORDPEP est la recherche en laboratoire menée par des professionnels dûment qualifiés ou autorisés, dans un environnement de recherche approprié.",
      },
    ],
  },
  {
    id: "returns",
    en: { title: "Return Policy" },
    fr: { title: "Politique de retour" },
    paras: [
      {
        en: "NORDPEP does not accept returns. Every sale is final as soon as the order is placed, except in the case of a documented product defect reported within 48 hours of delivery.",
        fr: "NORDPEP n'accepte aucun retour. Toute vente est finale dès que la commande est passée, sauf en cas de défaut de produit documenté et signalé dans les 48 heures suivant la livraison.",
      },
    ],
  },
  {
    id: "customer-agreement",
    en: { title: "Customer Agreement" },
    fr: { title: "Engagement du client" },
    paras: [
      {
        en: "By accessing, using or ordering from NORDPEP, you represent and warrant that you have independently reviewed and understood: (a) the intended use of our products, limited strictly to laboratory research; (b) all safety warnings, hazards and handling precautions associated with these compounds; and (c) every regulatory and legal requirement governing the possession, use or handling of these products in your province, territory or jurisdiction.",
        fr: "En accédant à NORDPEP, en l'utilisant ou en y commandant, vous déclarez et garantissez avoir examiné et compris de façon indépendante : (a) l'usage prévu de nos produits, strictement limité à la recherche en laboratoire ; (b) l'ensemble des avertissements de sécurité, dangers et précautions de manipulation associés à ces composés ; et (c) toutes les exigences réglementaires et légales encadrant la possession, l'utilisation ou la manipulation de ces produits dans votre province, territoire ou juridiction.",
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
        en: "You agree that no product purchased from NORDPEP will be altered, adulterated, misbranded or introduced into commerce in contravention of the laws applicable in your jurisdiction. Unless expressly stated otherwise, all products are supplied for research use only, and you bear sole responsibility for ensuring that your possession and use of them respects every applicable federal, provincial and local requirement.",
        fr: "Vous convenez qu'aucun produit acheté auprès de NORDPEP ne sera altéré, falsifié, mal étiqueté ou mis en circulation en contravention des lois applicables dans votre juridiction. Sauf indication expresse contraire, tous les produits sont fournis à des fins de recherche uniquement, et il vous incombe exclusivement de vous assurer que leur possession et leur utilisation respectent toutes les exigences fédérales, provinciales et locales applicables.",
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
        en: "NORDPEP cannot be held responsible for damages, losses or claims resulting from a purchaser's failure to observe these terms, including misuse, negligence, mishandling, abuse or unforeseen events connected to any product or service sold.",
        fr: "NORDPEP ne peut être tenue responsable des dommages, pertes ou réclamations résultant du non-respect des présentes conditions par un acheteur, y compris le mésusage, la négligence, la mauvaise manipulation, l'abus ou tout événement imprévu lié à un produit ou service vendu.",
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
        en: "You agree to indemnify, defend and hold harmless NORDPEP, its owners, officers, directors, employees and partners against any claim, damage, loss, liability or legal expense (including reasonable attorney fees) arising from your use of the website or from any breach of these Terms & Conditions.",
        fr: "Vous acceptez d'indemniser, de défendre et de dégager de toute responsabilité NORDPEP, ses propriétaires, dirigeants, administrateurs, employés et partenaires contre toute réclamation, dommage, perte, responsabilité ou frais juridique (y compris les honoraires d'avocat raisonnables) découlant de votre utilisation du site ou de toute violation des présentes Conditions Générales.",
      },
    ],
  },
  {
    id: "availability",
    en: { title: "Website Availability" },
    fr: { title: "Disponibilité du site" },
    paras: [
      {
        en: "Although we strive to keep NORDPEP accessible at all times, uninterrupted availability is not guaranteed. The website may become unavailable without notice due to maintenance, technical incidents or factors beyond our control, and NORDPEP accepts no liability for damages caused by such downtime.",
        fr: "Bien que nous nous efforcions de garder NORDPEP accessible en tout temps, une disponibilité ininterrompue n'est pas garantie. Le site peut devenir indisponible sans préavis en raison de maintenance, d'incidents techniques ou de facteurs hors de notre contrôle, et NORDPEP n'assume aucune responsabilité pour les dommages causés par une telle interruption.",
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
        en: "These Terms & Conditions, together with the Privacy Policy and the disclaimers referenced herein, constitute the complete agreement between you and NORDPEP and replace any prior understanding, written or verbal. No amendment is valid unless issued in writing by NORDPEP.",
        fr: "Les présentes Conditions Générales, conjointement avec la Politique de confidentialité et les avertissements auxquels elles renvoient, constituent l'entente complète entre vous et NORDPEP et remplacent toute entente antérieure, écrite ou verbale. Aucune modification n'est valide à moins d'être émise par écrit par NORDPEP.",
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
        en: "By placing an order and confirming your acceptance at checkout, you certify that you have read, understood and agreed to all Terms & Conditions, privacy policies, disclaimers and disclosures published by NORDPEP.",
        fr: "En passant une commande et en confirmant votre acceptation au moment du paiement, vous certifiez avoir lu, compris et accepté l'ensemble des Conditions Générales, politiques de confidentialité, avertissements et divulgations publiés par NORDPEP.",
      },
      {
        en: "All products sold are strictly for laboratory, research or analytical purposes only and are not for human or animal consumption.",
        fr: "Tous les produits vendus sont strictement destinés à des fins de laboratoire, de recherche ou d'analyse uniquement et ne sont pas destinés à la consommation humaine ou animale.",
        strong: true,
      },
    ],
  },
];

export default function Compliance() {
  const { lang } = useLang();
  const isFr = lang === "fr";
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-16" data-testid="compliance-page">
      <header className="border-b border-ink pb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// NORDPEP</div>
        <h1 className="font-display text-5xl sm:text-6xl font-extrabold uppercase tracking-tight mt-2">
          {isFr ? "Conditions Générales" : "Terms & Conditions"}
        </h1>
        <p className="mt-4 text-sm text-foreground/60">
          {isFr
            ? "Dernière mise à jour : juin 2026 · Ces conditions s'appliquent à toute utilisation du site et à tout achat effectué sur NORDPEP."
            : "Last updated: June 2026 · These terms apply to all use of the website and every purchase made on NORDPEP."}
        </p>
      </header>

      <section id="terms" data-testid="section-terms" className="space-y-12">
        {TERMS.map((s, i) => (
          <div key={s.id} id={s.id} data-testid={`terms-section-${s.id}`}>
            <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-tight">
              <span className="font-mono text-sm text-foreground/40 mr-3">{String(i + 1).padStart(2, "0")}</span>
              {isFr ? s.fr.title : s.en.title}
            </h2>
            <div className="mt-4 space-y-4 text-foreground/80 leading-relaxed">
              {s.paras.map((p, j) => (
                <p key={j} className={p.strong ? "font-bold text-foreground" : undefined}>
                  {isFr ? p.fr : p.en}
                </p>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section id="privacy" data-testid="section-privacy" className="border-t border-ink pt-12">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight">
          {isFr ? "Politique de confidentialité" : "Privacy Policy"}
        </h2>
        <div className="mt-6 space-y-4 text-foreground/80 leading-relaxed">
          <p>{isFr
            ? "Nous recueillons uniquement les renseignements nécessaires à l'exécution des commandes : nom, adresse de livraison, courriel et téléphone. Vos données ne sont jamais vendues à des tiers."
            : "We collect only the information necessary to fulfill orders: name, shipping address, email and phone. Your data is never sold to third parties."}
          </p>
          <p>{isFr
            ? "NORDPEP est conforme à la LPRPDE (loi canadienne sur la protection des renseignements personnels) et, pour les résidents du Québec, à la Loi 25."
            : "NORDPEP complies with PIPEDA (Canadian privacy law) and, for Québec residents, with Law 25."}
          </p>
        </div>
      </section>

      <section id="shipping" data-testid="section-shipping" className="border-t border-ink pt-12">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight">
          {isFr ? "Livraison & Retours" : "Shipping & Returns"}
        </h2>
        <div className="mt-6 space-y-4 text-foreground/80 leading-relaxed">
          <p>{isFr
            ? "Toutes les commandes sont expédiées depuis le Canada via Postes Canada Xpresspost (suivi inclus). Les commandes intérieures sont expédiées sous 24-48 heures suivant la confirmation du paiement."
            : "All orders ship from Canada via Canada Post Xpresspost (tracking included). Domestic orders ship within 24-48 hours of payment confirmation."}
          </p>
          <p>{isFr
            ? "En raison de la nature des produits, toutes les ventes sont finales. Aucun retour ni remboursement, sauf en cas de défaut documenté du produit dans les 48 heures suivant la livraison."
            : "Due to the nature of the products, all sales are final. No returns or refunds, except in the case of documented product defects within 48 hours of delivery."}
          </p>
        </div>
      </section>

      <section id="faq" data-testid="section-faq" className="border-t border-ink pt-12">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight">FAQ</h2>
        <div className="mt-6 space-y-6 text-foreground/80">
          <div>
            <h3 className="font-bold">{isFr ? "Comment fonctionne le paiement Interac ?" : "How does Interac payment work?"}</h3>
            <p className="mt-2 text-sm">{isFr
              ? "Après avoir passé votre commande, vous recevez des instructions détaillées pour envoyer un virement Interac. Nous confirmons la réception sous 24 h et expédions immédiatement."
              : "After placing your order, you receive detailed Interac e-Transfer instructions. We confirm receipt within 24h and ship immediately."}
            </p>
          </div>
          <div>
            <h3 className="font-bold">{isFr ? "Acceptez-vous les cryptos ?" : "Do you accept crypto?"}</h3>
            <p className="mt-2 text-sm">{isFr
              ? "Oui — via NOWPayments. BTC, ETH, USDT, LTC, SOL et plus de 100 autres cryptos sont supportés. Confirmations instantanées sur la chaîne."
              : "Yes — via NOWPayments. BTC, ETH, USDT, LTC, SOL and 100+ other cryptos. Instant on-chain confirmations."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
