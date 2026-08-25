// frontend/src/pages/AffiliateFaq.jsx — NOUVEAU fichier.
//
// Questions fréquentes du programme, RÉSERVÉES aux affiliés. Contrairement aux
// conditions (/affiliate/terms), qui doivent rester publiques pour être
// opposables, cette page répond à des questions d'exploitation — seuils,
// délais, mécanique d'attribution — qui n'ont d'intérêt que pour un partenaire
// et n'ont pas à être indexées.
//
// Les réponses sont volontairement longues. Une réponse d'une ligne sur
// l'attribution laissait croire qu'un code expirait au bout de 30 jours ; c'est
// exactement le genre de raccourci qui fait écrire à un affilié qu'il a été
// floué. Chaque réponse répond aussi à la question suivante, celle que la
// personne allait poser.
import { Link, useNavigate } from "react-router-dom";
import useDocumentHead from "../hooks/useDocumentHead";
import { useLang } from "../contexts/LanguageContext";
import useAffiliate from "../hooks/useAffiliate";
import { DashboardSkeleton } from "../components/LoadingSkeletons";
import api from "../lib/api";

const QA = [
  {
    id: "expiration",
    fr: {
      q: "Mon code ou mon lien expirent-ils ?",
      a: [
        "Ni l'un ni l'autre : votre code vaut tant que votre compte est actif, et votre lien de même.",
        "Mais la commission se gagne commande par commande : il faut que votre lien ait été cliqué, ou votre code saisi, POUR CETTE COMMANDE-LÀ. Le clic dépose un témoin valable 365 jours, pendant lesquels le même navigateur vous attribue les commandes sans rien à saisir.",
        "Concrètement : un client arrivé par votre lien il y a deux ans, qui revient aujourd'hui directement sur le site et commande sans code, ne vous rapporte rien. Il figure toujours dans vos « clients apportés », mais cette liste est un historique — elle n'ouvre droit à aucune commission.",
      ],
    },
    en: {
      q: "Do my code or my link expire?",
      a: [
        "Neither: your code is valid as long as your account is active, and so is your link.",
        "But a commission is earned order by order: your link must have been clicked, or your code entered, FOR THAT PARTICULAR ORDER. The click sets a cookie valid for 365 days, during which the same browser credits orders to you with nothing to type.",
        "In practice: a customer who arrived through your link two years ago, returning today straight to the site and ordering without a code, earns you nothing. They still appear in your "customers you brought in", but that list is a record — it grants no commission.",
      ],
    },
  },
  {
    id: "concurrence",
    fr: {
      q: "Un autre affilié peut-il me prendre mon client ?",
      a: [
        "Chaque commande se gagne séparément : personne ne « possède » un client.",
        "Si votre client passe une fois par le lien ou le code d'un autre affilié, cette commande-là lui revient — il a déclenché cette vente, et il serait injuste qu'il travaille pour rien.",
        "Il n'y a pas de rattachement durable : une commande passée sans lien ni code ne rapporte à personne. C'est la contrepartie de la règle — vous ne perdez jamais un client acquis, parce qu'aucun client n'est acquis d'avance.",
      ],
    },
    en: {
      q: "Can another affiliate take my customer?",
      a: [
        "Each order is earned separately: nobody "owns" a customer.",
        "If your customer goes once through another affiliate's link or code, that order goes to them — they triggered that sale, and it would be unfair for them to work for nothing.",
        "There is no permanent attachment: an order placed with no link and no code earns nobody anything. That is the other side of the rule — you never lose a customer you had won, because no customer is won in advance.",
      ],
    },
  },
  {
    id: "base",
    fr: {
      q: "Sur quel montant ma commission est-elle calculée ?",
      a: [
        "Sur le sous-total des produits après le rabais accordé à votre contact. La livraison et les taxes n'entrent jamais dans le calcul.",
        "Exemple au palier Standard, à 10 % : une commande de 150 $ de produits, moins le rabais de 10 % de votre contact, donne une base de 135 $ — soit 13,50 $ de commission.",
        "C'est cette base, et non le total payé par le client, qui apparaît partout dans votre tableau de bord. À noter : une commande passée sans votre code ni votre lien n'ouvre droit à aucune commission — il n'y a donc pas de base à calculer.",
      ],
    },
    en: {
      q: "What amount is my commission calculated on?",
      a: [
        "On the product subtotal after the discount granted to your contact. Shipping and taxes never enter the calculation.",
        "Example at the Standard tier, 10%: a $150 product order, less your contact's 10% discount, gives a base of $135 — so $13.50 in commission.",
        "It is this base, not the total paid by the customer, that appears throughout your dashboard. Note: an order placed without your code or link earns no commission at all — so there is no base to calculate.",
      ],
    },
  },
  {
    id: "palier",
    fr: {
      q: "Comment mon palier est-il déterminé ?",
      a: [
        "Par votre chiffre d'affaires validé des douze derniers mois glissants — une fenêtre qui avance avec vous, pas un total remis à zéro en janvier.",
        "Les paliers : Standard 10 % jusqu'à 2 000 $, Bronze 12 % à partir de 2 001 $, Silver 14 % à partir de 5 001 $, Gold 16 % à partir de 10 001 $, Platinum 18 % à partir de 20 001 $, Diamond 20 % à partir de 35 001 $.",
        "Le palier monte dès le seuil franchi, et le nouveau taux s'applique aux commandes suivantes. Les commissions déjà acquises ne sont pas recalculées.",
        // Réservé aux comptes SOUS ENTENTE. Une entente est confidentielle :
        // son existence même ne se divulgue pas, et un affilié au barème ne
        // doit pas apprendre ici qu'un autre bénéficie d'un traitement
        // particulier. La clé `entente` filtre ce paragraphe à l'affichage.
        { entente: true, texte: "Votre taux résultant d'une entente, il ne suit pas cette règle : il ne varie pas avec votre volume de ventes et ne baisse jamais automatiquement." },
      ],
    },
    en: {
      q: "How is my tier determined?",
      a: [
        "By your validated revenue over the last twelve rolling months — a window that moves with you, not a total reset every January.",
        "The tiers: Standard 10% up to $2,000, Bronze 12% from $2,001, Silver 14% from $5,001, Gold 16% from $10,001, Platinum 18% from $20,001, Diamond 20% from $35,001.",
        "The tier rises as soon as the threshold is crossed, and the new rate applies to subsequent orders. Commissions already earned are not recalculated.",
        { entente: true, texte: "Your rate resulting from an agreement, it does not follow this rule: it does not vary with your sales volume and never decreases automatically." },
      ],
    },
  },
  {
    id: "statuts",
    fr: {
      q: "Que veulent dire « en attente » et « validé » ?",
      a: [
        "En attente : la commande est payée, mais les sept jours suivant la commande ne sont pas écoulés — ou une réclamation est en cours d'examen. La commission existe, elle n'est pas encore acquise.",
        "Validé : le délai est passé, la commission vous est acquise et compte pour votre palier. C'est ce montant qui part au prochain versement.",
        "Ce délai correspond à la période durant laquelle une commande peut encore être annulée ou remboursée. Une commande remboursée après validation est reprise sur le solde suivant.",
      ],
    },
    en: {
      q: "What do \"pending\" and \"validated\" mean?",
      a: [
        "Pending: the order is paid, but the seven days following the order have not elapsed — or a claim is under review. The commission exists, it is not yet earned.",
        "Validated: the period has passed, the commission is yours and counts toward your tier. This is the amount that goes out at the next payout.",
        "That period matches the window during which an order can still be cancelled or refunded. An order refunded after validation is reversed against the next balance.",
      ],
    },
  },
  {
    id: "versement",
    fr: {
      q: "Quand et comment suis-je payé ?",
      a: [
        "Une fois par mois, pour les commissions validées, sous réserve d'un solde atteignant 25 $ CAD.",
        "En dessous de ce seuil, rien n'est perdu : votre solde reste à votre crédit et s'ajoute au mois suivant jusqu'à l'atteindre.",
        "Le versement part en USDT ou USDC, selon votre choix, converti depuis le dollar canadien au taux officiel de la Banque du Canada le jour du paiement. Les frais de réseau sont déduits du montant versé.",
        "Votre commission est due en dollars canadiens, et c'est ce montant que vous recevez. Si le jeton s'écarte du dollar américain — c'est arrivé à l'USDC en 2023, tombé à 0,87 $ — la quantité envoyée est augmentée d'autant. Vous ne perdez rien à un décrochage. En cas d'écart trop important pour être fiable, le versement est reporté et votre solde conservé.",
      ],
    },
    en: {
      q: "When and how am I paid?",
      a: [
        "Once a month, for validated commissions, subject to a balance reaching CAD $25.",
        "Below that threshold nothing is lost: your balance stays to your credit and carries over month to month until it is reached.",
        "The payout goes out in USDT or USDC, at your choice, converted from Canadian dollars at the official Bank of Canada rate on the day of payment. Network fees are deducted from the amount paid.",
        "Your commission is owed in Canadian dollars, and that is the amount you receive. If the token drifts from the US dollar — as USDC did in 2023, falling to $0.87 — the quantity sent is increased accordingly. You lose nothing to a depeg. Where the gap is too large to be trusted, the payout is deferred and your balance kept.",
      ],
    },
  },
  {
    id: "portefeuille",
    fr: {
      q: "Quelle adresse de portefeuille dois-je fournir ?",
      a: [
        "Une adresse Ethereum, qui commence par 0x, ou une adresse Tron, qui commence par T. Le réseau est déduit de l'adresse : vous n'avez rien à choisir.",
        "Les frais de réseau sont nettement plus faibles sur Tron — un point qui compte si vos versements sont proches du seuil minimum.",
        "Vérifiez que votre portefeuille accepte bien le réseau correspondant. Une adresse valide sur un autre réseau entraîne une perte définitive des fonds : une transaction en chaîne de blocs ne peut pas être annulée.",
      ],
    },
    en: {
      q: "Which wallet address should I provide?",
      a: [
        "An Ethereum address, starting with 0x, or a Tron address, starting with T. The network is derived from the address: you have nothing to choose.",
        "Network fees are markedly lower on Tron — which matters if your payouts sit close to the minimum threshold.",
        "Check that your wallet accepts the corresponding network. A valid address on another network results in permanent loss of funds: a blockchain transaction cannot be reversed.",
      ],
    },
  },
  {
    id: "autoparrainage",
    fr: {
      q: "Puis-je commander avec mon propre code ?",
      a: [
        "Vous pouvez commander et bénéficier du rabais, mais ces commandes ne génèrent pas de commission. Le programme récompense les ventes que vous apportez, pas vos propres achats.",
        "La détection est automatique et compare l'adresse courriel, le compte et l'adresse de livraison.",
        "Une commande écartée pour cette raison apparaît dans votre historique avec la mention correspondante — elle n'est pas cachée.",
      ],
    },
    en: {
      q: "Can I order using my own code?",
      a: [
        "You may order and get the discount, but those orders generate no commission. The program rewards the sales you bring, not your own purchases.",
        "Detection is automatic and compares email address, account and shipping address.",
        "An order excluded for this reason appears in your history with the corresponding note — it is not hidden.",
      ],
    },
  },
  {
    id: "communication",
    fr: {
      q: "Que puis-je dire, et que dois-je éviter ?",
      a: [
        "Les produits sont destinés exclusivement à la recherche en laboratoire. Vos communications ne doivent jamais suggérer un usage humain ou vétérinaire.",
        "À éviter absolument : toute allégation de santé, thérapeutique, de perte de poids ou de performance ; toute posologie ou protocole d'administration ; toute formulation laissant entendre qu'un produit se consomme.",
        "Cette règle n'est pas une formalité : une allégation formulée par un affilié peut être imputée à FIRONOVA. C'est le seul manquement qui peut entraîner une suspension sans préavis.",
      ],
    },
    en: {
      q: "What may I say, and what should I avoid?",
      a: [
        "Products are intended exclusively for laboratory research. Your communications must never suggest human or veterinary use.",
        "Strictly avoid: any health, therapeutic, weight-loss or performance claim; any dosage or administration protocol; any wording implying a product is consumed.",
        "This rule is not a formality: a claim made by an affiliate can be attributed to FIRONOVA. It is the only breach that can lead to suspension without notice.",
      ],
    },
  },
];

export default function AffiliateFaq() {
  useDocumentHead({ title: "Affiliate FAQ", path: "/affiliate/faq", noindex: true });
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const navigate = useNavigate();
  const { affiliate, loading, error } = useAffiliate(lang);

  if (loading) return <DashboardSkeleton />;

  // 403 = compte valide mais pas affilié. On ne redirige pas silencieusement :
  // quelqu'un arrivé ici par un lien partagé doit comprendre pourquoi il n'y a
  // rien à voir, plutôt que de se retrouver sur l'accueil sans explication.
  if (error?.response?.status === 403 || !affiliate) {
    return (
      <div className="bg-clinical min-h-screen grid place-items-center px-6">
        <div className="max-w-md text-center space-y-3">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
            {L("RÉSERVÉ", "RESTRICTED")}
          </p>
          <h1 className="font-display text-2xl font-bold text-nordfjord">
            {L("Cette page est réservée aux affiliés", "This page is for affiliates only")}
          </h1>
          <p className="text-sm text-glacier">
            {L("Le programme d'affiliation de FIRONOVA se fait sur invitation.",
               "The FIRONOVA affiliate program is by invitation.")}
          </p>
          <Link to="/" className="inline-block mt-2 text-nova underline text-sm">
            {L("Retour à l'accueil", "Back home")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10" data-testid="affiliate-faq-page">
        <header className="border-b border-ash pb-6">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
            {L("PROGRAMME D'AFFILIATION", "AFFILIATE PROGRAM")}
          </p>
          <h1 className="font-display text-[36px] sm:text-[44px] font-bold text-nordfjord tracking-[-0.01em] leading-tight">
            {L("Questions fréquentes", "Frequently asked questions")}
          </h1>
          <p className="mt-4 text-sm text-glacier">
            {L("Les règles complètes figurent dans les ", "The full rules are in the ")}
            <Link to="/affiliate/terms" className="text-nova underline">
              {L("conditions du programme", "program terms")}
            </Link>.
          </p>
        </header>

        <div className="space-y-8">
          {QA.map((item) => {
            const t = lang === "fr" ? item.fr : item.en;
            return (
              <div key={item.id} id={item.id} data-testid={`faq-${item.id}`}>
                <h2 className="font-display text-lg font-bold text-nordfjord leading-snug">
                  {t.q}
                </h2>
                <div className="mt-2 space-y-3 text-sm text-glacier leading-relaxed">
                  {/* Un paragraphe peut être une chaîne — visible par tous —
                      ou un objet { entente: true }, réservé aux comptes sous
                      entente. Une entente est confidentielle : son existence
                      même ne se divulgue pas, et un affilié au barème ne doit
                      pas apprendre ici qu'un autre bénéficie d'un traitement
                      particulier. */}
                  {t.a
                    .filter((p) => typeof p === "string" || (p.entente && affiliate?.tier_agreement))
                    .map((p, i) => <p key={i}>{typeof p === "string" ? p : p.texte}</p>)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-ash pt-6 flex flex-wrap items-center justify-between gap-4">
          <Link to="/affiliate" className="text-nova underline text-sm">
            {L("← Retour au tableau de bord", "← Back to dashboard")}
          </Link>
          {/* Relance de la visite. La dernière bulle l'annonce ; sans ce
              bouton, la promesse serait fausse. Le marqueur vit dans la fiche
              affilié et non dans le navigateur : on demande au serveur de le
              lever, puis on renvoie au tableau de bord, qui redémarre de
              lui-même. Effacer un repère local n'aurait plus aucun effet. */}
          <button
            onClick={async () => {
              try {
                await api.post("/affiliate/tour/reset");
              } catch { /* la visite reste simplement telle quelle */ }
              navigate("/affiliate");
            }}
            data-testid="faq-restart-tour"
            className="font-data text-[11px] font-bold uppercase tracking-wider text-glacier hover:text-nordfjord border border-ash hover:border-glacier rounded-full px-4 py-2 transition">
            {L("Revoir la visite guidée", "Replay the guided tour")}
          </button>
        </div>
      </div>
    </div>
  );
}
