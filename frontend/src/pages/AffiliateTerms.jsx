// frontend/src/pages/AffiliateTerms.jsx — NOUVEAU fichier.
//
// Conditions du programme d'affiliation. Page PUBLIQUE, et volontairement :
// quelqu'un doit pouvoir lire ce qu'il s'apprête à accepter avant d'y être
// invité, et le texte doit rester consultable pour établir ce qui a été
// accepté. L'écran d'acceptation (AffiliateTermsGate) pointe ici.
//
// Le numéro de version affiché est celui de AFFILIATE_TERMS_VERSION côté
// serveur. Les deux doivent bouger ensemble : c'est ce champ qui déclenche la
// redemande d'acceptation, et un texte révisé sans changement de version
// laisserait les affiliés engagés par un texte qu'ils n'ont jamais vu.
import useDocumentHead from "../hooks/useDocumentHead";
import { useLang } from "../contexts/LanguageContext";

// 2026-08-22b : le RATTACHEMENT DURABLE du client est supprimé. Une commande
// n'ouvre droit à commission que si le lien ou le code a été utilisé pour elle.
//
// C'est le changement le plus substantiel apporté à ce texte : il retire une
// source de revenu que les affiliés déjà inscrits avaient acceptée. Leur
// laisser ce texte sans redemander leur accord les engagerait par des
// conditions qu'ils n'ont jamais lues — d'où le suffixe, qui force la
// réacceptation au prochain accès.
//
// 2026-08-22 : l'article sur les versements gagne l'ajustement au prix réel du
// jeton.
export const AFFILIATE_TERMS_VERSION = "2026-08-22b";

// Exporté pour que la fenêtre d'acceptation affiche EXACTEMENT ce texte, sans
// le recopier. Deux exemplaires du même contrat divergeraient à la première
// révision, et c'est la version lue au moment du clic qui engage — pas celle
// d'une page que personne n'a ouverte.
export const SECTIONS = [
  {
    id: "objet",
    fr: { title: "Objet" },
    en: { title: "Purpose" },
    paras: [
      {
        fr: "Les présentes conditions régissent la participation au programme d'affiliation de FIRONOVA. Elles forment un contrat entre FIRONOVA et la personne physique ou morale admise au programme, désignée ci-après « l'Affilié ».",
        en: "These terms govern participation in the FIRONOVA affiliate program. They form a contract between FIRONOVA and the individual or entity admitted to the program, referred to below as \"the Affiliate\".",
      },
      {
        fr: "Le programme permet à l'Affilié de percevoir une commission sur les ventes qu'il apporte, selon les modalités décrites ci-dessous. Il ne crée aucune relation d'emploi, de mandat, de société ni de franchise. L'Affilié agit en toute indépendance et assume ses propres obligations fiscales.",
        en: "The program allows the Affiliate to earn a commission on sales they bring, under the terms described below. It creates no employment, agency, partnership or franchise relationship. The Affiliate acts independently and is responsible for their own tax obligations.",
      },
    ],
  },
  {
    id: "admission",
    fr: { title: "Admission au programme" },
    en: { title: "Admission to the program" },
    paras: [
      {
        fr: "La participation se fait sur invitation. FIRONOVA n'est pas tenue de motiver un refus d'admission.",
        en: "Participation is by invitation. FIRONOVA is not required to give reasons for refusing admission.",
      },
      {
        fr: "L'Affilié doit avoir 19 ans ou plus et confirmer cet âge lors de son premier accès. Il doit fournir des renseignements exacts et les tenir à jour, notamment son adresse de versement.",
        en: "The Affiliate must be 19 or older and confirm this age on first access. They must provide accurate information and keep it up to date, in particular their payout address.",
      },
      {
        fr: "L'acceptation des présentes conditions est requise avant tout accès au tableau de bord. FIRONOVA enregistre la date, la version du texte acceptée et l'adresse IP utilisée, à titre de preuve de cet engagement.",
        en: "Acceptance of these terms is required before any access to the dashboard. FIRONOVA records the date, the version of the text accepted and the IP address used, as evidence of that commitment.",
      },
    ],
  },
  {
    id: "obligations",
    fr: { title: "Obligations de l'Affilié" },
    en: { title: "Affiliate obligations" },
    paras: [
      {
        strong: true,
        fr: "Les produits offerts par FIRONOVA sont destinés exclusivement à la recherche en laboratoire. Ils ne sont pas destinés à la consommation humaine ou animale, ni à un usage diagnostique ou thérapeutique.",
        en: "Products offered by FIRONOVA are intended exclusively for laboratory research. They are not intended for human or animal consumption, nor for any diagnostic or therapeutic use.",
      },
      {
        fr: "L'Affilié s'engage, dans toute communication écrite, orale ou visuelle : à ne jamais présenter, suggérer ni laisser entendre qu'un produit convient à un usage humain ou vétérinaire ; à ne formuler aucune allégation de santé, thérapeutique, de perte de poids, de performance ou d'amélioration physique ; à ne fournir aucune posologie, protocole d'administration, ni conseil d'utilisation sur une personne ou un animal.",
        en: "In any written, spoken or visual communication, the Affiliate undertakes: never to present, suggest or imply that a product is suitable for human or veterinary use; to make no health, therapeutic, weight-loss, performance or physical-enhancement claim; to provide no dosage, administration protocol or advice on use in a person or animal.",
      },
      {
        fr: "L'Affilié reproduit la mention « réservé à la recherche » lorsqu'il présente un produit, ne se présente pas comme employé, porte-parole ou représentant officiel de FIRONOVA, et divulgue sa relation d'affiliation lorsque la loi ou la plateforme utilisée l'exige.",
        en: "The Affiliate includes the \"for research use only\" notice when presenting a product, does not hold themselves out as an employee, spokesperson or official representative of FIRONOVA, and discloses their affiliate relationship where the law or the platform used requires it.",
      },
    ],
  },
  {
    id: "interdit",
    fr: { title: "Pratiques interdites" },
    en: { title: "Prohibited practices" },
    paras: [
      {
        fr: "Sont notamment interdits : l'envoi de courriels non sollicités, en violation de la Loi canadienne anti-pourriel ; l'achat de mots-clés publicitaires reprenant « FIRONOVA » ou ses variantes, ainsi que la publicité redirigeant vers le site autrement que par le lien d'affiliation ; l'enregistrement de noms de domaine, comptes de réseaux sociaux ou pages reprenant la marque de manière à créer une confusion sur leur origine.",
        en: "The following are prohibited: sending unsolicited email, in breach of Canada's Anti-Spam Legislation; bidding on advertising keywords containing \"FIRONOVA\" or its variants, and advertising that redirects to the site other than through the affiliate link; registering domain names, social media accounts or pages using the brand in a way that creates confusion as to their origin.",
      },
      {
        strong: true,
        fr: "La promotion se fait en communication privée. Le lien et le code de l'Affilié sont destinés à ses échanges directs — messages, courriels, conversations. Ils ne doivent pas être publiés sur un forum, un réseau social ouvert, une vidéo publique, un site de codes de rabais ou tout autre support accessible à un public indéterminé.",
        en: "Promotion is by private communication. The Affiliate's link and code are intended for direct exchanges — messages, email, conversations. They must not be published on a forum, an open social network, a public video, a discount-code site or any other medium accessible to an undetermined audience.",
      },
      {
        fr: "Cette règle tient à la nature des produits : une affirmation faite devant un public indéterminé engage FIRONOVA bien au-delà de la même phrase adressée à une personne. Elle pourra évoluer. Un Affilié qui souhaite promouvoir publiquement peut en faire la demande ; une autorisation écrite préalable est alors requise et peut porter sur un contenu déterminé.",
        en: "This rule follows from the nature of the products: a statement made to an undetermined audience commits FIRONOVA far beyond the same sentence addressed to one person. It may evolve. An Affiliate wishing to promote publicly may request it; prior written authorisation is then required and may cover specified content.",
      },
      {
        fr: "Sont enfin interdites : la revente, la mise aux enchères ou la redistribution commerciale des produits ; toute déclaration fausse ou trompeuse sur les produits, les prix, les délais ou la disponibilité.",
        en: "Finally prohibited: reselling, auctioning or commercially redistributing the products; any false or misleading statement about products, prices, timelines or availability.",
      },
    ],
  },
  {
    id: "attribution",
    fr: { title: "Attribution des ventes" },
    en: { title: "Sale attribution" },
    paras: [
      {
        fr: "Une commande est attribuée à l'Affilié lorsque son lien de parrainage ou son code de réduction est utilisé pour cette commande précise. Le lien dépose un témoin de connexion valable 365 jours : toute commande passée pendant cette période depuis le même navigateur est attribuée, sans saisie de code. À défaut, le code doit être saisi au paiement. En l'absence de l'un ou de l'autre sur la commande, aucune commission n'est due, même si le client avait déjà été amené par l'Affilié.",
        en: "An order is attributed to the Affiliate when their referral link or discount code is used for that specific order. The link sets a cookie valid for 365 days: any order placed from the same browser during that period is attributed, with no code to enter. Otherwise the code must be entered at checkout. Where neither appears on the order, no commission is due, even if the customer had previously been introduced by the Affiliate.",
      },
      {
        fr: "Le rattachement durable du client, qui attribuait autrefois toute commande ultérieure sans lien ni code, a été supprimé. La commission récompense un acte d'apport, et cet acte doit être visible sur la commande.",
        en: "The permanent customer link, which once attributed every later order with no link or code, has been removed. A commission rewards an act of introduction, and that act must be visible on the order.",
      },
      {
        fr: "Si un client rattaché passe une commande par le lien ou le code d'un autre affilié, cette commande revient à ce dernier, mais le rattachement demeure inchangé pour les commandes suivantes.",
        en: "If a linked customer places an order through another affiliate's link or code, that order goes to the latter, but the link remains unchanged for subsequent orders.",
      },
      {
        fr: "Le rattachement est reconnu par l'adresse courriel et, lorsque le client dispose d'un compte, par ce compte. Une commande passée avec une adresse différente et sans compte ne peut pas être reliée. Un témoin de connexion peut par ailleurs être effacé par le visiteur ou perdu lors d'un changement d'appareil.",
        en: "The link is recognised by email address and, where the customer has an account, by that account. An order placed with a different address and without an account cannot be connected. A cookie may also be deleted by the visitor or lost when changing device.",
      },
    ],
  },
  {
    id: "commissions",
    fr: { title: "Commissions et paliers" },
    en: { title: "Commissions and tiers" },
    paras: [
      {
        strong: true,
        fr: "La commission est calculée sur le sous-total des produits, après déduction du rabais accordé au client. Les frais de livraison et les taxes sont exclus du calcul.",
        en: "Commission is calculated on the product subtotal, after deducting the discount granted to the customer. Shipping and taxes are excluded from the calculation.",
      },
      {
        fr: "Le taux dépend du palier, déterminé par le chiffre d'affaires validé de l'Affilié sur les douze derniers mois glissants : Standard 10 % (0 $ à 2 000 $), Bronze 12 % (2 001 $ à 5 000 $), Silver 14 % (5 001 $ à 10 000 $), Gold 16 % (10 001 $ à 20 000 $), Platinum 18 % (20 001 $ à 35 000 $), Diamond 20 % (35 001 $ et plus).",
        en: "The rate depends on the tier, determined by the Affiliate's validated revenue over the last twelve rolling months: Standard 10% ($0–$2,000), Bronze 12% ($2,001–$5,000), Silver 14% ($5,001–$10,000), Gold 16% ($10,001–$20,000), Platinum 18% ($20,001–$35,000), Diamond 20% ($35,001 and above).",
      },
      {
        fr: "Le palier progresse dès le seuil franchi. Le nouveau taux s'applique aux commandes suivantes ; les commissions déjà acquises ne sont pas recalculées.",
        en: "The tier rises as soon as the threshold is crossed. The new rate applies to subsequent orders; commissions already earned are not recalculated.",
      },
      {
        fr: "Une commission est d'abord en attente, puis devient validée sept jours après que la commande a été passée. Ce délai est le même pour tous les modes de paiement. Si une demande de remboursement est déposée, la commission demeure en attente jusqu'à la décision, quelle qu'en soit la durée, et est ensuite ajustée en conséquence. Seules les commissions validées comptent pour le palier et pour le versement.",
        en: "A commission is first pending, then becomes validated seven days after the order is placed. This period is the same for every payment method. If a refund request is filed, the commission stays pending until the decision, however long that takes, and is then adjusted accordingly. Only validated commissions count toward the tier and toward payout.",
      },
      {
        fr: "Une commande remboursée, annulée ou faisant l'objet d'une rétrofacturation après validation donne lieu à la reprise de la commission correspondante sur le solde suivant.",
        en: "An order refunded, cancelled or charged back after validation results in the corresponding commission being reversed against the next balance.",
      },
    ],
  },
  {
    id: "versements",
    fr: { title: "Versements" },
    en: { title: "Payouts" },
    paras: [
      {
        fr: "Les commissions validées sont versées une fois par mois, sous réserve d'un solde atteignant le seuil minimum de 25 $ CAD. En dessous de ce seuil, le solde est reporté au mois suivant ; il n'est jamais perdu.",
        en: "Validated commissions are paid once a month, subject to a balance reaching the minimum threshold of CAD $25. Below that threshold the balance carries over to the following month; it is never forfeited.",
      },
      {
        fr: "Les versements sont effectués en USDT ou USDC, selon le choix de l'Affilié, sur le réseau Ethereum (ERC-20) ou Tron (TRC-20) déterminé par l'adresse fournie. La conversion depuis le dollar canadien s'effectue au taux officiel de la Banque du Canada le jour de l'exécution du versement. Les frais de réseau sont à la charge de l'Affilié et déduits du montant versé.",
        en: "Payouts are made in USDT or USDC, at the Affiliate's choice, on the Ethereum (ERC-20) or Tron (TRC-20) network determined by the address provided. Conversion from Canadian dollars uses the official Bank of Canada rate on the day the payout is executed. Network fees are borne by the Affiliate and deducted from the amount paid.",
      },
      {
        strong: true,
        fr: "La commission est due en dollars canadiens. C'est ce montant qui est livré, et non un nombre de jetons fixé d'avance.",
        en: "The commission is owed in Canadian dollars. That amount is what is delivered, not a token quantity fixed in advance.",
      },
      {
        fr: "USDT et USDC visent la parité avec le dollar américain sans la garantir. Lorsque le jeton s'en écarte, la quantité versée est ajustée en conséquence, de sorte que la valeur reçue corresponde à la somme due. Le prix retenu est celui relevé au moment de l'exécution, et il est conservé avec le relevé de versement.",
        en: "USDT and USDC aim for parity with the US dollar without guaranteeing it. Where the token drifts from it, the quantity paid is adjusted accordingly, so that the value received matches the amount owed. The price used is the one recorded at execution, and it is retained with the payout record.",
      },
      {
        fr: "Lorsque l'écart constaté est trop important pour être tenu pour fiable, le versement est reporté au cycle suivant plutôt qu'exécuté sur une base incertaine. L'Affilié en est avisé et son solde demeure intégralement à son crédit.",
        en: "Where the observed gap is too large to be treated as reliable, the payout is deferred to the next cycle rather than executed on an uncertain basis. The Affiliate is notified and their balance remains entirely to their credit.",
      },
      {
        strong: true,
        fr: "L'Affilié est seul responsable de l'exactitude de son adresse de versement. Une adresse erronée, incompatible avec le réseau choisi, ou correspondant à un portefeuille dont il n'a pas le contrôle, entraîne une perte définitive des fonds. Une transaction en chaîne de blocs est irréversible et ne peut être annulée par FIRONOVA.",
        en: "The Affiliate is solely responsible for the accuracy of their payout address. An incorrect address, one incompatible with the chosen network, or one belonging to a wallet they do not control, results in permanent loss of funds. A blockchain transaction is irreversible and cannot be reversed by FIRONOVA.",
      },
      {
        fr: "L'Affilié est responsable de la déclaration et du paiement de tout impôt ou taxe applicable aux sommes reçues.",
        en: "The Affiliate is responsible for declaring and paying any tax applicable to amounts received.",
      },
      {
        strong: true,
        fr: "Un solde acquis n'est jamais perdu, quelle que soit la durée d'inactivité.",
        en: "An earned balance is never forfeited, however long the period of inactivity.",
      },
      {
        fr: "Après vingt-quatre mois consécutifs sans commission nouvelle, FIRONOVA peut clore la participation et verser le solde restant, même inférieur au seuil minimum. L'Affilié en est avisé au préalable à l'adresse figurant à son dossier et dispose de trente jours pour mettre à jour son adresse de versement.",
        en: "After twenty-four consecutive months without a new commission, FIRONOVA may close the participation and pay out the remaining balance, even below the minimum threshold. The Affiliate is notified beforehand at the address on file and has thirty days to update their payout address.",
      },
    ],
  },
  {
    id: "fraude",
    fr: { title: "Fraude et auto-parrainage" },
    en: { title: "Fraud and self-referral" },
    paras: [
      {
        fr: "Les commandes passées par l'Affilié lui-même ne génèrent aucune commission. Sont considérées comme telles les commandes partageant avec l'Affilié l'adresse courriel, le compte client, l'adresse de livraison ou l'empreinte technique de connexion. Ces commandes apparaissent dans l'historique de l'Affilié avec la mention correspondante ; elles ne sont pas dissimulées.",
        en: "Orders placed by the Affiliate themselves generate no commission. This includes orders sharing with the Affiliate an email address, customer account, shipping address or technical connection fingerprint. Such orders appear in the Affiliate's history with the corresponding note; they are not hidden.",
      },
      {
        fr: "FIRONOVA se réserve le droit d'annuler toute commission obtenue par des moyens frauduleux ou contraires aux présentes conditions, y compris rétroactivement, et de suspendre le compte concerné.",
        en: "FIRONOVA reserves the right to cancel any commission obtained by fraudulent means or in breach of these terms, including retroactively, and to suspend the account concerned.",
      },
    ],
  },
  {
    id: "donnees",
    fr: { title: "Données personnelles" },
    en: { title: "Personal data" },
    paras: [
      {
        fr: "Le traitement des renseignements personnels est décrit dans la politique de confidentialité, qui fait partie intégrante des présentes conditions.",
        en: "The processing of personal information is described in the privacy policy, which forms an integral part of these terms.",
      },
      {
        fr: "Aux fins de la prévention de la fraude, FIRONOVA compare des empreintes cryptographiques irréversibles d'adresses IP, sans conserver celles-ci sous forme lisible. Fait exception l'adresse enregistrée lors de l'acceptation des présentes conditions, conservée en clair à titre de preuve de l'engagement.",
        en: "For fraud prevention purposes, FIRONOVA compares irreversible cryptographic fingerprints of IP addresses, without retaining them in readable form. An exception applies to the address recorded when accepting these terms, kept in clear as evidence of the commitment.",
      },
      {
        fr: "L'Affilié qui traite des renseignements personnels dans le cadre de sa promotion en est le responsable et doit se conformer à la législation applicable.",
        en: "An Affiliate who processes personal information as part of their promotion is responsible for it and must comply with applicable legislation.",
      },
    ],
  },
  {
    id: "marque",
    fr: { title: "Marque et contenus" },
    en: { title: "Brand and content" },
    paras: [
      {
        fr: "FIRONOVA concède à l'Affilié un droit non exclusif, non cessible et révocable d'utiliser son nom, son logo et les visuels qu'elle met à disposition, aux seules fins de la promotion prévue par les présentes. Ce droit prend fin automatiquement à la cessation de la participation ; l'Affilié retire alors sans délai tout usage de la marque.",
        en: "FIRONOVA grants the Affiliate a non-exclusive, non-transferable and revocable right to use its name, logo and the visuals it provides, solely for the promotion contemplated here. This right ends automatically when participation ceases; the Affiliate then promptly removes all use of the brand.",
      },
      {
        fr: "L'Affilié demeure propriétaire des contenus qu'il crée et garantit qu'ils ne portent atteinte à aucun droit de tiers.",
        en: "The Affiliate remains the owner of the content they create and warrants that it infringes no third-party rights.",
      },
    ],
  },
  {
    id: "modification",
    fr: { title: "Modification des conditions" },
    en: { title: "Changes to these terms" },
    paras: [
      {
        fr: "FIRONOVA peut modifier les présentes conditions. Chaque version porte une date qui l'identifie.",
        en: "FIRONOVA may amend these terms. Each version carries a date identifying it.",
      },
      {
        fr: "Lors d'une modification, l'acceptation de la nouvelle version est demandée au premier accès suivant, et l'accès au tableau de bord y est subordonné. Les commissions acquises avant la modification restent régies par la version en vigueur au moment de la vente.",
        en: "On amendment, acceptance of the new version is requested on the next access, and dashboard access is conditional on it. Commissions earned before the amendment remain governed by the version in force at the time of the sale.",
      },
    ],
  },
  {
    id: "resiliation",
    fr: { title: "Suspension et résiliation" },
    en: { title: "Suspension and termination" },
    paras: [
      {
        fr: "L'Affilié peut mettre fin à sa participation à tout moment, par écrit. Les commissions validées à cette date lui restent dues et sont versées selon les modalités habituelles, sous réserve du seuil minimum.",
        en: "The Affiliate may end their participation at any time, in writing. Commissions validated at that date remain owed and are paid under the usual terms, subject to the minimum threshold.",
      },
      {
        fr: "FIRONOVA peut suspendre ou résilier une participation sans préavis en cas de manquement aux articles portant sur les obligations de l'Affilié, les pratiques interdites ou la fraude, et avec un préavis de 30 jours sans motif à fournir.",
        en: "FIRONOVA may suspend or terminate participation without notice in the event of breach of the articles on Affiliate obligations, prohibited practices or fraud, and on 30 days' notice without cause.",
      },
      {
        fr: "En cas de résiliation pour manquement, FIRONOVA peut retenir les commissions issues des ventes effectivement affectées par ce manquement. Les commissions sans lien avec celui-ci demeurent dues et sont versées selon les modalités habituelles.",
        en: "Where terminated for breach, FIRONOVA may withhold commissions arising from the sales actually affected by that breach. Commissions unrelated to it remain owed and are paid under the usual terms.",
      },
      {
        fr: "FIRONOVA indique à l'Affilié les ventes concernées et le motif de la retenue. L'Affilié peut y répondre par écrit dans les trente jours.",
        en: "FIRONOVA identifies to the Affiliate the sales concerned and the reason for the withholding. The Affiliate may respond in writing within thirty days.",
      },
    ],
  },
  {
    id: "responsabilite",
    fr: { title: "Responsabilité et indemnisation" },
    en: { title: "Liability and indemnification" },
    paras: [
      {
        fr: "Le programme est fourni « tel quel ». FIRONOVA ne garantit ni un volume de ventes, ni la disponibilité continue du site, du tableau de bord ou du suivi d'attribution.",
        en: "The program is provided \"as is\". FIRONOVA does not guarantee any sales volume, nor the continuous availability of the site, the dashboard or attribution tracking.",
      },
      {
        fr: "La responsabilité de FIRONOVA envers l'Affilié, tous chefs de réclamation confondus, est limitée au montant des commissions qui lui ont été versées au cours des douze mois précédant l'événement à l'origine de la réclamation.",
        en: "FIRONOVA's liability to the Affiliate, across all heads of claim, is limited to the commissions paid to them in the twelve months preceding the event giving rise to the claim.",
      },
      {
        fr: "L'Affilié indemnise FIRONOVA de toute réclamation résultant de ses propres communications, notamment de toute allégation contraire aux obligations énoncées ci-dessus, ainsi que de tout manquement de sa part aux présentes conditions ou à la loi.",
        en: "The Affiliate indemnifies FIRONOVA against any claim arising from their own communications, in particular any statement contrary to the obligations set out above, and from any breach on their part of these terms or of the law.",
      },
      {
        strong: true,
        fr: "Les limitations qui précèdent ne s'appliquent pas en cas de faute intentionnelle ou de faute lourde, ni au préjudice corporel ou moral. Elles ne réduisent aucun droit que la loi accorde impérativement.",
        en: "The foregoing limitations do not apply in cases of intentional or gross fault, nor to bodily or moral injury. They do not reduce any right the law grants imperatively.",
      },
    ],
  },
  {
    id: "droit",
    fr: { title: "Droit applicable et différends" },
    en: { title: "Governing law and disputes" },
    paras: [
      {
        fr: "Les présentes conditions sont régies par le droit applicable dans la province de Québec et les lois fédérales du Canada qui y sont applicables.",
        en: "These terms are governed by the law applicable in the province of Québec and the federal laws of Canada applicable there.",
      },
      {
        fr: "Tout différend est soumis à la compétence des tribunaux compétents de la province de Québec.",
        en: "Any dispute is subject to the jurisdiction of the competent courts of the province of Québec.",
      },
      {
        fr: "Avant toute procédure, les parties conviennent d'exposer leur différend par écrit et de disposer de trente jours pour tenter de le résoudre. Cette étape ne prive aucune partie d'un recours conservatoire urgent.",
        en: "Before any proceedings, the parties agree to set out their dispute in writing and allow thirty days to attempt to resolve it. This step deprives neither party of an urgent protective remedy.",
      },
    ],
  },
  {
    id: "divers",
    fr: { title: "Dispositions diverses" },
    en: { title: "Miscellaneous" },
    paras: [
      {
        fr: "Intégralité — Les présentes conditions, avec la politique de confidentialité, constituent l'entente complète entre les parties relativement au programme et remplacent toute entente antérieure, sous réserve de toute convention écrite distincte conclue entre elles. Divisibilité — La nullité d'une disposition n'affecte pas la validité des autres. Renonciation — Le fait de ne pas se prévaloir d'une disposition ne vaut pas renonciation à s'en prévaloir ultérieurement. Cession — L'Affilié ne peut céder sa participation sans l'accord écrit préalable de FIRONOVA.",
        en: "Entire agreement — These terms, together with the privacy policy, constitute the entire agreement between the parties in respect of the program and supersede any prior agreement, subject to any separate written agreement entered into between them. Severability — The invalidity of one provision does not affect the validity of the others. Waiver — Failure to rely on a provision is not a waiver of the right to rely on it later. Assignment — The Affiliate may not assign their participation without FIRONOVA's prior written consent.",
      },
      {
        fr: "Langue — Les parties ont exigé que les présentes soient rédigées en français.",
        en: "Language — The parties have required that these terms be drawn up in French.",
      },
    ],
  },
];

export default function AffiliateTerms() {
  useDocumentHead({
    title: "Affiliate Program Terms",
    description: "Terms of the FIRONOVA affiliate program.",
    path: "/affiliate/terms",
  });
  const { lang } = useLang();
  const isFr = lang === "fr";

  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16" data-testid="affiliate-terms-page">
        <header className="border-b border-ash pb-6">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
            FIRONOVA
          </p>
          <h1 className="font-display text-[42px] sm:text-[52px] font-bold text-nordfjord tracking-[-0.01em]">
            {isFr ? "Conditions du programme d'affiliation" : "Affiliate Program Terms"}
          </h1>
          <p className="mt-4 text-sm text-glacier">
            {isFr
              ? `Version ${AFFILIATE_TERMS_VERSION} · Ces conditions régissent la participation au programme d'affiliation de FIRONOVA.`
              : `Version ${AFFILIATE_TERMS_VERSION} · These terms govern participation in the FIRONOVA affiliate program.`}
          </p>
        </header>

        <section className="space-y-12">
          {SECTIONS.map((s, i) => (
            <div key={s.id} id={s.id} data-testid={`affiliate-terms-${s.id}`}>
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
      </div>
    </div>
  );
}
