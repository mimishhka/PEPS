import { useLang } from "../contexts/LanguageContext";

const SECTIONS = [
  {
    id: "collection",
    en: { title: "Information Collection and Use" },
    fr: { title: "Collecte et utilisation des renseignements" },
    paras: [
      {
        en: "When you use NORDPEP, we may ask you for certain personally identifiable details needed to identify or contact you, such as your name, email address, phone number and postal address (\"Personal Information\").",
        fr: "Lorsque vous utilisez NORDPEP, nous pouvons vous demander certains renseignements personnels nécessaires pour vous identifier ou vous joindre, tels que votre nom, votre adresse courriel, votre numéro de téléphone et votre adresse postale (« Renseignements personnels »).",
      },
      {
        en: "This information is collected solely to operate the service: processing and shipping your orders, communicating with you, answering your questions and requests, and improving what we offer. NORDPEP never uses or shares your information except as described in this policy, and your data is never sold to third parties.",
        fr: "Ces renseignements sont recueillis uniquement pour faire fonctionner le service : traiter et expédier vos commandes, communiquer avec vous, répondre à vos questions et demandes, et améliorer notre offre. NORDPEP n'utilise ni ne partage jamais vos renseignements autrement que ce qui est décrit dans la présente politique, et vos données ne sont jamais vendues à des tiers.",
      },
      {
        en: "NORDPEP complies with PIPEDA (the Canadian federal privacy legislation) and, for Québec residents, with Law 25.",
        fr: "NORDPEP se conforme à la LPRPDE (loi fédérale canadienne sur la protection des renseignements personnels) et, pour les résidents du Québec, à la Loi 25.",
      },
    ],
  },
  {
    id: "log-data",
    en: { title: "Log Data" },
    fr: { title: "Données de journal" },
    paras: [
      {
        en: "Like most websites, we may record technical information transmitted by your browser when you visit (\"Log Data\"): IP address, browser type and version, pages viewed, date and time of your visit, time spent on each page and similar statistics.",
        fr: "Comme la plupart des sites web, nous pouvons enregistrer des informations techniques transmises par votre navigateur lors de votre visite (« Données de journal ») : adresse IP, type et version du navigateur, pages consultées, date et heure de la visite, temps passé sur chaque page et statistiques semblables.",
      },
      {
        en: "We may also rely on third-party analytics services (such as Google Analytics) that collect and analyze this type of data to help us improve the website. Those providers operate under their own privacy policies governing how they handle such information.",
        fr: "Nous pouvons également recourir à des services d'analyse tiers (comme Google Analytics) qui recueillent et analysent ce type de données afin de nous aider à améliorer le site. Ces fournisseurs sont régis par leurs propres politiques de confidentialité quant au traitement de ces informations.",
      },
    ],
  },
  {
    id: "cookies",
    en: { title: "Cookies" },
    fr: { title: "Témoins (cookies)" },
    paras: [
      {
        en: "Cookies are small data files, sometimes containing an anonymous unique identifier, that a website sends to your browser and stores on your device. We use them to gather information that helps us improve your experience.",
        fr: "Les témoins sont de petits fichiers de données, contenant parfois un identifiant unique anonyme, qu'un site web transmet à votre navigateur et enregistre sur votre appareil. Nous les utilisons pour recueillir des informations qui nous aident à améliorer votre expérience.",
      },
      {
        en: "You can configure your browser to refuse all cookies or to alert you whenever one is sent — your browser's Help section explains how. Note that disabling cookies may prevent certain features of the site from working properly, so we recommend leaving them enabled.",
        fr: "Vous pouvez configurer votre navigateur pour refuser tous les témoins ou pour vous avertir lorsqu'un témoin est envoyé — la section Aide de votre navigateur explique comment procéder. Notez que la désactivation des témoins peut empêcher certaines fonctionnalités du site de fonctionner correctement ; nous recommandons donc de les laisser activés.",
      },
    ],
  },
  {
    id: "dnt",
    en: { title: "Do Not Track Disclosure" },
    fr: { title: "Signal « Ne pas suivre » (Do Not Track)" },
    paras: [
      {
        en: "NORDPEP honours the Do Not Track (\"DNT\") signal, a preference you can enable in your web browser to tell websites you do not wish to be tracked. You can turn DNT on or off in your browser's settings or preferences page.",
        fr: "NORDPEP respecte le signal « Ne pas suivre » (« DNT »), une préférence que vous pouvez activer dans votre navigateur pour indiquer aux sites web que vous ne souhaitez pas être suivi. Vous pouvez activer ou désactiver le DNT dans la page de paramètres ou de préférences de votre navigateur.",
      },
    ],
  },
  {
    id: "providers",
    en: { title: "Service Providers" },
    fr: { title: "Fournisseurs de services" },
    paras: [
      {
        en: "We may engage third-party companies or individuals to support our operations — for example to process payments, deliver parcels or analyze how the website is used. These providers can access your Personal Information only to carry out specific tasks on our behalf and are bound not to disclose it or use it for any other purpose.",
        fr: "Nous pouvons faire appel à des entreprises ou personnes tierces pour soutenir nos opérations — par exemple pour traiter les paiements, livrer les colis ou analyser l'utilisation du site. Ces fournisseurs n'ont accès à vos Renseignements personnels que pour accomplir des tâches précises en notre nom et sont tenus de ne pas les divulguer ni les utiliser à d'autres fins.",
      },
    ],
  },
  {
    id: "communications",
    en: { title: "Communications" },
    fr: { title: "Communications" },
    paras: [
      {
        en: "With your consent, we may use your contact details to send you newsletters, promotions or other content likely to interest you. You may opt out of some or all of these communications at any time by using the unsubscribe link included in every email we send.",
        fr: "Avec votre consentement, nous pouvons utiliser vos coordonnées pour vous envoyer des infolettres, des promotions ou d'autres contenus susceptibles de vous intéresser. Vous pouvez vous désabonner de tout ou partie de ces communications à tout moment en utilisant le lien de désabonnement inclus dans chaque courriel que nous envoyons.",
      },
    ],
  },
  {
    id: "legal",
    en: { title: "Disclosure Required by Law" },
    fr: { title: "Divulgation exigée par la loi" },
    paras: [
      {
        en: "NORDPEP will disclose Personal Information when required by law or by a valid court order, or when we believe in good faith that doing so is necessary to comply with legal obligations, respond to reasonable requests from authorities, or protect the security and integrity of our service.",
        fr: "NORDPEP divulguera des Renseignements personnels lorsque la loi ou une ordonnance judiciaire valide l'exige, ou lorsque nous croyons de bonne foi que cela est nécessaire pour respecter nos obligations légales, répondre aux demandes raisonnables des autorités ou protéger la sécurité et l'intégrité de notre service.",
      },
    ],
  },
  {
    id: "security",
    en: { title: "Security" },
    fr: { title: "Sécurité" },
    paras: [
      {
        en: "Protecting your Personal Information matters to us. We maintain reasonable, commercially acceptable safeguards suited to the nature of the data we hold in order to protect it against unauthorized access, destruction, use, alteration or disclosure.",
        fr: "La protection de vos Renseignements personnels nous tient à cœur. Nous maintenons des mesures de protection raisonnables et commercialement acceptables, adaptées à la nature des données que nous détenons, afin de les protéger contre l'accès, la destruction, l'utilisation, la modification ou la divulgation non autorisés.",
      },
      {
        en: "That said, no method of transmission over the internet or of electronic storage is entirely secure, and we cannot guarantee the absolute security of the information you provide to us.",
        fr: "Cela dit, aucune méthode de transmission sur internet ni de stockage électronique n'est entièrement sûre, et nous ne pouvons garantir la sécurité absolue des renseignements que vous nous fournissez.",
      },
    ],
  },
  {
    id: "transfer",
    en: { title: "International Transfer" },
    fr: { title: "Transfert international" },
    paras: [
      {
        en: "Your information, including Personal Information, may be transferred to and stored on servers located outside your province, territory or country, where data protection laws may differ from those of your jurisdiction.",
        fr: "Vos renseignements, y compris vos Renseignements personnels, peuvent être transférés vers des serveurs situés à l'extérieur de votre province, territoire ou pays, où les lois sur la protection des données peuvent différer de celles de votre juridiction.",
      },
      {
        en: "If you are located outside Canada and choose to provide us with information, be aware that it will be transferred to and processed in Canada. Your acceptance of this policy followed by the submission of your information constitutes your consent to that transfer.",
        fr: "Si vous êtes situé à l'extérieur du Canada et choisissez de nous fournir des renseignements, sachez qu'ils seront transférés et traités au Canada. Votre acceptation de la présente politique suivie de la transmission de vos renseignements constitue votre consentement à ce transfert.",
      },
    ],
  },
  {
    id: "links",
    en: { title: "Links to Other Sites" },
    fr: { title: "Liens vers d'autres sites" },
    paras: [
      {
        en: "Our website may include links to external sites that we do not operate. Clicking a third-party link will take you to that site, and we strongly encourage you to review its privacy policy. We have no control over, and accept no responsibility for, the content, policies or practices of third-party sites or services.",
        fr: "Notre site peut contenir des liens vers des sites externes que nous n'exploitons pas. En cliquant sur un lien tiers, vous serez dirigé vers ce site, et nous vous encourageons fortement à consulter sa politique de confidentialité. Nous n'exerçons aucun contrôle et n'assumons aucune responsabilité quant au contenu, aux politiques ou aux pratiques des sites ou services tiers.",
      },
    ],
  },
  {
    id: "changes",
    en: { title: "Changes to This Privacy Policy" },
    fr: { title: "Modifications de la présente politique" },
    paras: [
      {
        en: "This Privacy Policy takes effect as of June 2026 and remains in force, subject to future revisions which become effective immediately upon being posted on this page. We reserve the right to update this policy at any time, so please review it periodically.",
        fr: "La présente Politique de confidentialité prend effet en juin 2026 et demeure en vigueur, sous réserve de révisions futures qui prendront effet dès leur publication sur cette page. Nous nous réservons le droit de mettre à jour cette politique à tout moment ; veuillez donc la consulter périodiquement.",
      },
      {
        en: "Your continued use of the service after any modification is posted constitutes acknowledgment of, and agreement to, the revised policy. Should we make a material change, we will notify you by email at the address you provided or by displaying a prominent notice on the website.",
        fr: "Votre utilisation continue du service après la publication d'une modification vaut reconnaissance et acceptation de la politique révisée. En cas de changement important, nous vous aviserons par courriel à l'adresse fournie ou au moyen d'un avis bien visible sur le site.",
      },
    ],
  },
];

export default function Privacy() {
  const { lang } = useLang();
  const isFr = lang === "fr";
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-16" data-testid="privacy-page">
      <header className="border-b border-ink pb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// NORDPEP</div>
        <h1 className="font-display text-5xl sm:text-6xl font-extrabold uppercase tracking-tight mt-2">
          {isFr ? "Politique de confidentialité" : "Privacy Policy"}
        </h1>
        <p className="mt-4 text-sm text-foreground/60">
          {isFr
            ? "Cette page décrit nos pratiques concernant la collecte, l'utilisation et la divulgation des Renseignements personnels lorsque vous utilisez NORDPEP. En utilisant le service, vous consentez à la collecte et à l'utilisation de vos renseignements conformément à la présente politique."
            : "This page describes our practices regarding the collection, use and disclosure of Personal Information when you use NORDPEP. By using the service, you consent to the collection and use of your information in accordance with this policy."}
        </p>
      </header>

      <section className="space-y-12" data-testid="privacy-sections">
        {SECTIONS.map((s, i) => (
          <div key={s.id} id={s.id} data-testid={`privacy-section-${s.id}`}>
            <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-tight">
              <span className="font-mono text-sm text-foreground/40 mr-3">{String(i + 1).padStart(2, "0")}</span>
              {isFr ? s.fr.title : s.en.title}
            </h2>
            <div className="mt-4 space-y-4 text-foreground/80 leading-relaxed">
              {s.paras.map((p, j) => (
                <p key={j}>{isFr ? p.fr : p.en}</p>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
