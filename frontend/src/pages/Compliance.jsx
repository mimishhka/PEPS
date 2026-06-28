import { useLang } from "../contexts/LanguageContext";

export default function Compliance() {
  const { lang } = useLang();
  const isFr = lang === "fr";
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-16" data-testid="compliance-page">
      <header className="border-b border-ink pb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// COMPLIANCE · LEGAL</div>
        <h1 className="font-display text-5xl sm:text-6xl font-extrabold uppercase tracking-tight mt-2">
          {isFr ? "Conformité & Légal" : "Compliance & Legal"}
        </h1>
      </header>

      <section id="terms" data-testid="section-terms">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight">
          {isFr ? "Conditions Générales d'utilisation" : "Terms & Conditions"}
        </h2>
        <div className="mt-6 space-y-4 text-foreground/80 leading-relaxed">
          <p>{isFr
            ? "En accédant à NORDPEP, vous reconnaissez avoir 19 ans ou plus et être un chercheur, scientifique ou professionnel qualifié. Tous les produits vendus par NORDPEP sont strictement destinés à la recherche en laboratoire in vitro."
            : "By accessing NORDPEP, you acknowledge you are 19 years of age or older and are a qualified researcher, scientist or professional. All products sold by NORDPEP are strictly for in-vitro laboratory research."}
          </p>
          <p>{isFr
            ? "Aucun produit n'est destiné à un usage médical, alimentaire, cosmétique, vétérinaire, ni à une consommation humaine ou animale, ni à un usage thérapeutique, ni à un diagnostic, traitement, guérison ou prévention de toute maladie."
            : "No product is intended for medicinal, food, cosmetic or veterinary use, or for human or animal consumption, nor for any therapeutic use, diagnosis, treatment, cure or prevention of any disease."}
          </p>
          <p>{isFr
            ? "Le client assume l'entière responsabilité de la manipulation, du stockage, de l'utilisation et de l'élimination appropriés des produits conformément aux règlements provinciaux et fédéraux applicables."
            : "The customer assumes full responsibility for the proper handling, storage, use and disposal of products in accordance with all applicable provincial and federal regulations."}
          </p>
        </div>
      </section>

      <section id="privacy" data-testid="section-privacy">
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

      <section id="shipping" data-testid="section-shipping">
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

      <section id="faq" data-testid="section-faq">
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
