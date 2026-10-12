import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { GHK, RET } from "../lib/certificat";

/**
 * Comment lire un certificat d'analyse — sur ses vrais certificats.
 *
 * MIREILLE, 11/10/2026 : « ok je vois l'info mais il n'y a aucun [texte] en
 * point ou quoi que ce soit. et ça prend des exemples aussi. pour que ce soit
 * bien découpé et expliqué » — puis elle a envoyé deux certificats réels.
 *
 * TROIS CHOSES DE LA PREMIÈRE VERSION ÉTAIENT INEXACTES POUR SON LABORATOIRE,
 * et seuls les documents les ont révélées :
 *
 *   1. J'avais présenté la HPLC et la spectrométrie de masse comme deux
 *      analyses séparées répondant à deux questions. Vrai en général, faux
 *      ici : SideChain Analytics fait du LC-MS/MS, une seule analyse couplée
 *      où la séparation et l'identification se suivent en ligne.
 *   2. J'avais parlé de teneur en eau mesurée par titrage Karl Fischer. Ses
 *      certificats n'en rapportent pas ; leur note de bas de tableau dit au
 *      contraire que la pureté ne borne PAS l'eau résiduelle.
 *   3. J'avais inventé une masse d'exemple. Le réel est plus instructif que
 *      tout ce que j'aurais pu composer — voir la note sur les deux lots.
 *
 * LA LIGNE QUI NE SE FRANCHIT PAS reste la même : matière et méthode, jamais
 * l'effet. Le laboratoire la tient lui-même dans son avertissement, et la
 * dernière section ne fait que le reprendre.
 */

/* DEUX CERTIFICATS RÉELS, ET C'EST LE SECOND QUI REND LA PAGE CLAIRE.
 *
 * Le lot FN-OLW8W de GHK-Cu puis le lot FN-ELBCJ de Retatrutide, tous deux
 * analysés le 27 août 2026.
 *
 * Le second n'est pas une redite : il porte un ION À CINQ CHARGES là où le
 * premier n'en a qu'une. Une molécule de 340,4 g/mol se lit à 341,20 Da — sa
 * masse plus un proton, c'est intuitif. Une molécule de 4731,3 se lit à
 * 947,90, ce qui n'a aucun sens tant qu'on ignore qu'elle a capté cinq
 * protons. Expliquer ce phénomène avec UN exemple demande un paragraphe ;
 * avec deux, un tableau suffit.
 *
 * Et la formule du GHK-Cu porte son contre-ion à l'écrit — C14H22CuN6O4 ·
 * C2H4O2 — ce qui illustre la teneur nette sans qu'on ait rien à inventer.
 *
 * Un exemple inventé se reconnaît, et il abîme la crédibilité de tout ce qui
 * l'entoure.
 */
function Puces({ items }) {
  return (
    <ul className="space-y-3 mt-5">
      {items.map((t) => (
        <li key={t.slice(0, 44)} className="flex gap-3.5 text-[15px] text-glacier leading-relaxed">
          <span className="text-nova-texte shrink-0 select-none" aria-hidden="true">—</span>
          <span className="max-w-[64ch]">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Encadre({ titre, lignes, testId }) {
  return (
    <div className="mt-5 border border-ash bg-white overflow-hidden" data-testid={testId}
         style={{ borderRadius: "var(--r-m)" }}>
      <div className="px-5 py-3 border-b border-ash etiquette text-compliance">
        {titre}
      </div>
      <dl className="px-5 py-3">
        {lignes.map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-2 border-b border-ash last:border-0">
            <dt className="etiquette text-glacier">{k}</dt>
            <dd className="font-data text-[13px] text-nordfjord text-right break-all">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* Le chromatogramme : un pic haut, deux petits, et l'aire qui fait le
   pourcentage. Ce dessin explique « surface du pic » mieux que trois
   phrases — et le lecteur retrouve les mêmes axes sur son propre
   certificat. */
function Chromatogramme({ lang }) {
  const fr = lang === "fr";
  return (
    <figure className="mt-5 border border-ash bg-white px-5 py-5" data-testid="certificats-chromatogramme"
            style={{ borderRadius: "var(--r-m)" }}>
      <svg viewBox="0 0 520 172" className="w-full h-auto" role="img"
           aria-label={fr
             ? "Chromatogramme : un pic principal élevé près de 1,2 minute et deux petits pics d'impuretés."
             : "Chromatogram : one tall main peak near 1.2 minutes and two small impurity peaks."}>
        <line x1="46" y1="140" x2="500" y2="140" stroke="currentColor" strokeWidth="0.5" className="text-ash" />
        <line x1="46" y1="18" x2="46" y2="140" stroke="currentColor" strokeWidth="0.5" className="text-ash" />
        <path d="M46 140 L92 139 L102 30 L112 138 L190 137 L202 119 L212 137 L330 136 L346 127 L358 136 L500 135"
              fill="none" stroke="currentColor" strokeWidth="1.5" className="text-nova-texte" />
        <path d="M92 139 L102 30 L112 138 Z" fill="currentColor" className="text-nova" opacity="0.2" />
        <text x="102" y="22" textAnchor="middle" className="fill-current text-nordfjord" style={{ font: "500 10px var(--data)" }}>
          {GHK.compose}
        </text>
        <text x="42" y="24" textAnchor="end" className="fill-current text-glacier" style={{ font: "10px var(--data)" }}>1000</text>
        <text x="42" y="143" textAnchor="end" className="fill-current text-glacier" style={{ font: "10px var(--data)" }}>0</text>
        <text x="46" y="159" className="fill-current text-glacier" style={{ font: "10px var(--data)" }}>0</text>
        <text x="102" y="159" textAnchor="middle" className="fill-current text-nova-texte" style={{ font: "10px var(--data)" }}>
          {fr ? GHK.rt.fr : GHK.rt.en}
        </text>
        <text x="500" y="159" textAnchor="end" className="fill-current text-glacier" style={{ font: "10px var(--data)" }}>10 min</text>
      </svg>
      <figcaption className="font-data text-[11px] text-glacier mt-3 leading-relaxed max-w-[64ch]">
        {fr
          ? "Le pic rempli est le composé recherché. Les deux petits sont des impuretés apparentées. La pureté est le rapport entre l'aire du grand pic et l'aire de tous les pics réunis."
          : "The filled peak is the compound sought. The two small ones are related impurities. Purity is the ratio of the large peak's area to the area of all peaks combined."}
      </figcaption>
    </figure>
  );
}

function Section({ id, testId, titre, children }) {
  return (
    <section id={id} data-testid={testId}>
      <h2 className="titre-section text-nordfjord">{titre}</h2>
      {children}
    </section>
  );
}

export default function Certificats() {
  useDocumentHead({
    title: "Certificats d'analyse",
    path: "/certificats",
    description:
      "Lire un certificat d'analyse LC-MS/MS : numéro de lot, pureté chromatographique, teneur nette en peptide, ion précurseur, et ce qu'un certificat ne couvre pas.",
  });
  const { lang } = useLang();
  const { coaPageEnabled } = useSiteConfig();
  const fr = lang === "fr";
  const L = (o) => (fr ? o.fr : o.en);

  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-16" data-testid="certificats-page">
        <header className="border-b border-ash pb-6">
          <p className="sur-titre mb-3">
            {fr ? "ANALYSE DES LOTS" : "BATCH ANALYSIS"}
          </p>
          <h1 className="titre-page text-nordfjord">
            {fr ? "Lire un certificat d'analyse" : "Reading a certificate of analysis"}
          </h1>
          <p className="mt-4 text-sm text-glacier leading-relaxed max-w-[64ch]">
            {fr
              ? `Chaque lot est analysé par un laboratoire indépendant avant expédition. Tous les chiffres de cette page viennent de deux certificats réels : le lot ${GHK.lot} de ${GHK.compose} et le lot ${RET.lot} de ${RET.compose}, analysés le ${GHK.analyse.fr}.`
              : `Every batch is analysed by an independent laboratory before shipping. Every figure on this page comes from two real certificates : lot ${GHK.lot} of ${GHK.compose} and lot ${RET.lot} of ${RET.compose}, analysed on ${GHK.analyse.en}.`}
          </p>
        </header>

        <div className="mt-14 space-y-16">

          <Section id="ce-que-c-est" testId="certificats-ce-que-c-est"
                   titre={fr ? "Un lot, une date, un document" : "One batch, one date, one document"}>
            <p className="mt-4 text-[15px] text-glacier leading-relaxed max-w-[64ch]">
              {fr
                ? "Un certificat décrit UN lot précis, à une date précise. Il ne décrit pas un produit en général. C'est la différence entre « nos peptides sont purs » et « ce flacon vient d'un lot analysé le 27 août 2026, et voici le rapport » : la première phrase est une promesse, la seconde se vérifie."
                : "A certificate describes ONE specific batch, on one specific date. It does not describe a product in general. That is the difference between « our peptides are pure » and « this vial comes from a batch analysed on 27 August 2026, and here is the report » : the first is a promise, the second can be checked."}
            </p>
            <Encadre
              testId="certificats-identification"
              titre={fr ? "En-tête du certificat · section 01" : "Certificate header · section 01"}
              lignes={[
                [fr ? "Composé" : "Compound", GHK.compose],
                [fr ? "Numéro de lot" : "Lot number", GHK.lot],
                [fr ? "Apparence" : "Appearance", fr ? "Poudre lyophilisée" : "Lyophilized powder"],
                [fr ? "Reçu" : "Received", L(GHK.recu)],
                [fr ? "Analysé" : "Analysed", L(GHK.analyse)],
                ["CAS", GHK.cas],
                [fr ? "Formule" : "Formula", GHK.formule],
                [fr ? "Masse moléculaire" : "Molecular weight", L(GHK.masse)],
              ]}
            />
          </Section>

          <Section id="identifiants" testId="certificats-numero-de-lot"
                   titre={fr ? "Les trois numéros, et lequel vérifier d'abord" : "The three numbers, and which to check first"}>
            <Puces items={fr ? [
              `Le NUMÉRO DE LOT (${GHK.lot}) est le seul qui relie le papier au flacon. C'est la première chose à vérifier, avant la pureté : un certificat impeccable portant un autre numéro que votre étiquette ne dit rien de ce que vous avez en main.`,
              `Le NUMÉRO DE RAPPORT (${GHK.rapport}) identifie le document chez le laboratoire. Il sert à le retrouver, pas à identifier la matière.`,
              `L'IDENTIFIANT D'ÉCHANTILLON (${GHK.labo}) désigne la fiole que le laboratoire a reçue : un prélèvement de notre lot, pas le lot entier.`,
              "La VÉRIFICATION EN LIGNE est le seul contrôle qui ne dépend pas du document lui-même. Nos certificats portent un code et une adresse de vérification chez le laboratoire. Un PDF se modifie ; une vérification à la source, non.",
            ] : [
              `The LOT NUMBER (${GHK.lot}) is the only one tying the paper to the vial. Check it first, before purity : a flawless certificate carrying a different number from your label says nothing about what you are holding.`,
              `The REPORT NUMBER (${GHK.rapport}) identifies the document at the laboratory. It helps retrieve it, not identify the material.`,
              `The SAMPLE ID (${GHK.labo}) designates the vial the laboratory received : a sample of our batch, not the batch itself.`,
              "ONLINE VERIFICATION is the only check that does not rely on the document itself. Our certificates carry a code and a verification address at the laboratory. A PDF can be edited ; a check at the source cannot.",
            ]} />
          </Section>

          <Section id="lcmsms" testId="certificats-lcmsms"
                   titre={fr ? "LC-MS/MS : une seule analyse, deux réponses" : "LC-MS/MS : one analysis, two answers"}>
            <p className="mt-4 text-[15px] text-glacier leading-relaxed max-w-[64ch]">
              {fr
                ? "On lit souvent que la pureté se mesure par chromatographie et l'identité par spectrométrie de masse, comme deux analyses séparées. Nos certificats font les deux en une : la chromatographie liquide sépare, et le spectromètre en tandem identifie ce qui sort, en continu."
                : "It is often said that purity is measured by chromatography and identity by mass spectrometry, as two separate analyses. Our certificates do both at once : liquid chromatography separates, and the tandem mass spectrometer identifies what comes out, continuously."}
            </p>
            <Puces items={fr ? [
              "La COLONNE sépare les composants de l'échantillon : chacun la traverse à sa vitesse et sort à un moment distinct, son temps de rétention.",
              `Le DÉTECTEUR trace la réponse en fonction du temps : c'est le chromatogramme. Le GHK-Cu sort à ${GHK.rt.fr}.`,
              "Le SPECTROMÈTRE EN TANDEM casse ensuite chaque molécule et mesure ses fragments. Une molécule donnée se brise toujours de la même façon : c'est sa signature.",
              "DEUX FRAGMENTS sont suivis, et ce n'est pas un détail. Le premier quantifie, le second confirme. Si le second manque, ou si leur rapport s'écarte, le pic n'est pas la molécule attendue — même s'il sort au bon moment.",
            ] : [
              "The COLUMN separates the sample's components : each travels at its own speed and exits at a distinct moment, its retention time.",
              `The DETECTOR plots response against time : that is the chromatogram. GHK-Cu exits at ${GHK.rt.en}.`,
              "The TANDEM MASS SPECTROMETER then breaks each molecule apart and measures its fragments. A given molecule always breaks the same way : that is its signature.",
              "TWO FRAGMENTS are tracked, and that is not a detail. The first quantifies, the second confirms. If the second is missing, or their ratio drifts, the peak is not the expected molecule — even if it exits at the right time.",
            ]} />
            <Chromatogramme lang={lang} />
          </Section>

          <Section id="purete" testId="certificats-hplc"
                   titre={fr ? `Pureté chromatographique : ce que ${GHK.purete.res.fr} veut dire` : `Chromatographic purity : what ${GHK.purete.res.en} means`}>
            <Encadre
              testId="certificats-purete-resultat"
              titre={fr ? "Au certificat · section 02" : "On the certificate · section 02"}
              lignes={[
                [fr ? "Spécification" : "Specification", GHK.purete.spec],
                [fr ? "Résultat" : "Result", L(GHK.purete.res)],
                [fr ? "Méthode" : "Method", "LC-MS/MS · Ph. Eur. 2.2.46"],
              ]}
            />
            <Puces items={fr ? [
              "Le pourcentage est une SURFACE, pas un comptage. Le logiciel intègre l'aire sous chaque pic du chromatogramme, puis rapporte l'aire du pic principal à l'aire totale.",
              `Autrement dit : parmi tout ce que le détecteur a vu, ${GHK.purete.res.fr} de la surface appartient à un seul pic. C'est une proportion entre espèces détectées.`,
              "Ce n'est donc PAS un inventaire du flacon. La note de bas de tableau de notre laboratoire le dit explicitement : la pureté chromatographique borne les impuretés apparentées au peptide, et non les excipients, les contre-ions ou l'eau résiduelle.",
              "C'est pourquoi une pureté élevée et une masse de peptide différente de l'étiquette peuvent coexister — c'est l'objet de la section suivante.",
            ] : [
              "The percentage is an AREA, not a count. The software integrates the area under each peak of the chromatogram, then divides the main peak's area by the total.",
              `In other words : of everything the detector saw, ${GHK.purete.res.en} of the area belongs to a single peak. It is a proportion between detected species.`,
              "So it is NOT an inventory of the vial. Our laboratory's table footnote says so explicitly : chromatographic purity bounds peptide-related impurities, not excipients, counter-ions or residual water.",
              "That is why a high purity and a peptide mass differing from the label can coexist — the subject of the next section.",
            ]} />
          </Section>

          <Section id="teneur" testId="certificats-teneur"
                   titre={fr ? "Teneur nette : la mesure la plus mal comprise" : "Net content : the most misunderstood measurement"}>
            <p className="mt-4 text-[15px] text-glacier leading-relaxed max-w-[64ch]">
              {fr
                ? "La pureté dit quelle PROPORTION de ce qui a été détecté est le bon composé. La teneur nette dit quelle MASSE de peptide se trouve réellement dans la fiole. Deux questions différentes — et c'est la seconde qui dit ce qu'on a acheté."
                : "Purity says what PROPORTION of what was detected is the right compound. Net content says what MASS of peptide is actually in the vial. Two different questions — and the second says what you bought."}
            </p>
            <Encadre
              testId="certificats-teneur-resultat"
              titre={fr ? "Au certificat · section 02" : "On the certificate · section 02"}
              lignes={[
                [fr ? "Teneur annoncée" : "Labelled content", L(GHK.teneur.spec)],
                [fr ? "Teneur mesurée" : "Measured content", L(GHK.teneur.res)],
                [fr ? "Exactitude d'étiquetage" : "Label accuracy",
                 `${L(GHK.exactitude.res)} · ${fr ? "spéc." : "spec."} ${GHK.exactitude.spec}`],
              ]}
            />
            <Puces items={fr ? [
              "Une poudre lyophilisée n'est pas faite que de peptide. S'y ajoutent les contre-ions issus de la synthèse et l'eau résiduelle.",
              `Ce n'est pas une abstraction : la formule du GHK-Cu au certificat s'écrit ${GHK.formule}. La seconde partie est l'acétate — le contre-ion est écrit noir sur blanc dans la formule.`,
              `Le flacon de cet exemple annonce ${GHK.teneur.spec.fr} et en contient ${GHK.teneur.res.fr}, soit ${GHK.exactitude.res.fr} de ce qui est écrit.`,
              "L'écart peut aller dans l'autre sens : un flacon annoncé à 100 mg peut n'en contenir que 85 si l'on ne pèse que la poudre brute. Deux produits « 100 mg » ne sont donc pas forcément comparables.",
              "C'est pourquoi les deux mesures figurent au certificat. Une pureté seule laisse la question de la quantité entièrement ouverte.",
            ] : [
              "A lyophilised powder is not peptide alone. It also holds counter-ions from synthesis and residual water.",
              `This is not an abstraction : the GHK-Cu formula on the certificate reads ${GHK.formule}. The second part is the acetate — the counter-ion is written into the formula itself.`,
              `This example vial is labelled ${GHK.teneur.spec.en} and holds ${GHK.teneur.res.en}, or ${GHK.exactitude.res.en} of what is written.`,
              "The gap can go the other way : a vial labelled 100 mg may hold only 85 if only gross powder is weighed. Two « 100 mg » products are therefore not necessarily comparable.",
              "That is why both measurements appear on the certificate. Purity alone leaves the quantity question entirely open.",
            ]} />
          </Section>

          <Section id="precurseur" testId="certificats-spectrometrie"
                   titre={fr ? "Pourquoi la masse lue n'est pas la masse de la molécule" : "Why the mass read is not the molecule's mass"}>
            <p className="mt-4 text-[15px] text-glacier leading-relaxed max-w-[64ch]">
              {fr
                ? "C'est le chiffre qui déroute le plus à la première lecture. L'en-tête annonce une masse, le détail d'analyse en annonce une autre. Nos deux certificats, côte à côte, expliquent pourquoi."
                : "This is the figure that most confuses a first reading. The header states one mass, the analysis detail states another. Our two certificates, side by side, explain why."}
            </p>
            <Encadre
              testId="certificats-comparaison-ions"
              titre={fr ? "Deux lots, deux états de charge" : "Two batches, two charge states"}
              lignes={[
                [`${GHK.compose} · ${fr ? "masse" : "mass"}`, L(GHK.masse)],
                [`${GHK.compose} · ${fr ? "ion lu" : "ion read"}`, `${GHK.ion} = ${L(GHK.mz)}`],
                [`${RET.compose} · ${fr ? "masse" : "mass"}`, L(RET.masse)],
                [`${RET.compose} · ${fr ? "ion lu" : "ion read"}`, `${RET.ion} = ${L(RET.mz)}`],
              ]}
            />
            <Puces items={fr ? [
              "Un spectromètre ne pèse pas des molécules : il mesure un rapport masse sur charge. La valeur lue est donc la masse divisée par le nombre de charges.",
              `Le GHK-Cu capte un seul proton : 340,4 plus 1 donne ${GHK.mz.fr}. Le décalage est d'une unité, et tout paraît simple.`,
              `Le Retatrutide, bien plus gros, en capte cinq : 4731,3 divisé par 5 donne environ 946, plus la masse des cinq protons — soit ${RET.mz.fr}. Sans connaître l'état de charge, ce chiffre semble ne correspondre à rien.`,
              "Les crochets le disent d'ailleurs : [M+H]+ signifie « la molécule plus un proton », [M+5H]5+ « la molécule plus cinq protons, portant cinq charges ».",
              "Une grosse molécule DOIT capter plusieurs charges pour être analysée : à une seule, sa masse sortirait de la plage de l'instrument. La concordance entre masse théorique et masse observée est ce qui confirme l'identité.",
            ] : [
              "A mass spectrometer does not weigh molecules : it measures a mass-to-charge ratio. The value read is the mass divided by the number of charges.",
              `GHK-Cu picks up a single proton : 340.4 plus 1 gives ${GHK.mz.en}. The shift is one unit, and everything looks simple.`,
              `Retatrutide, far larger, picks up five : 4731.3 divided by 5 gives about 946, plus the mass of the five protons — ${RET.mz.en}. Without knowing the charge state, that figure seems to match nothing.`,
              "The brackets say it : [M+H]+ means « the molecule plus one proton », [M+5H]5+ « the molecule plus five protons, carrying five charges ».",
              "A large molecule MUST pick up several charges to be analysed : with one, its mass would fall outside the instrument's range. Agreement between theoretical and observed mass is what confirms identity.",
            ]} />
          </Section>

          <Section id="ne-dit-pas" testId="certificats-ce-qu-il-ne-dit-pas"
                   titre={fr ? "Ce qu'un certificat ne dit pas" : "What a certificate does not say"}>
            <p className="mt-4 text-[15px] text-glacier leading-relaxed max-w-[64ch]">
              {fr
                ? "Cette section ne vient pas de nous : elle reprend l'avertissement que notre laboratoire imprime lui-même au verso de chaque certificat."
                : "This section is not ours : it restates the disclaimer our laboratory prints on the back of every certificate."}
            </p>
            <Puces items={fr ? [
              "Les résultats ne portent que sur l'échantillon reçu et les essais effectués. Ils ne s'étendent à aucune autre unité, aucun autre lot.",
              "Un certificat d'analyse n'est pas un certificat de qualité, de sécurité, d'efficacité ni de conformité réglementaire.",
              "Il ne couvre ni la stérilité ni les endotoxines : une analyse de composition chimique ne cherche pas de micro-organismes.",
              "Il n'autorise aucune administration humaine ou vétérinaire, aucun usage clinique ou diagnostique, et aucune allégation d'étiquetage.",
              "Le laboratoire ne fabrique, ne source ni ne vend la matière : il atteste ce qu'il a mesuré, rien d'autre.",
              "Un rapport ne se reproduit qu'en entier. Un extrait de certificat n'est pas un certificat.",
            ] : [
              "Results relate only to the sample received and the tests performed. They extend to no other unit and no other batch.",
              "A certificate of analysis is not a certificate of quality, safety, efficacy or regulatory compliance.",
              "It covers neither sterility nor endotoxins : a chemical composition analysis does not look for micro-organisms.",
              "It authorises no human or veterinary administration, no clinical or diagnostic use, and no label claims.",
              "The laboratory does not manufacture, source or sell the material : it attests what it measured, nothing more.",
              "A report may be reproduced only in full. An extract of a certificate is not a certificate.",
            ]} />
            <p className="mt-6 text-[15px] text-glacier leading-relaxed max-w-[64ch]">
              {fr
                ? "Nos produits sont des réactifs de laboratoire destinés à la recherche in vitro. Ils ne sont destinés à aucun usage humain ni vétérinaire, et aucun certificat ne pourrait changer cela."
                : "Our products are laboratory reagents for in vitro research. They are not intended for any human or veterinary use, and no certificate could change that."}
            </p>
          </Section>
        </div>

        {/* DEUX LIENS, DEUX DÉFAUTS QU'ELLE A VUS AVANT MOI.
            « Pourquoi je ne vois pas la page qui permet de faire une recherche
            pour les COA » : /lab n'est servie que si COA_PAGE_ENABLED vaut
            `true` côté serveur, sinon la route renvoie à l'accueil. Le bouton
            était donc bien là, et il ne menait nulle part. Il ne s'affiche
            plus que lorsque la page existe.
            « Le lien qui renvoie à l'entreposage ne me conduit qu'à la page
            des FAQ » : il visait /faq sans ancre. Il vise désormais la section
            `storage`, et ScrollToTop sait enfin y descendre. */}
        <div className="mt-16 border-t border-ash pt-10 flex flex-wrap items-center gap-4"
             data-testid="certificats-suite">
          {coaPageEnabled && (
            <Link to="/lab" className="btn-pill btn-nova" data-testid="certificats-vers-lab">
              {fr ? "Vérifier un lot" : "Check a lot"}
            </Link>
          )}
          <Link to="/faq#storage" className="text-[13px] text-nova-texte underline" data-testid="certificats-vers-faq">
            {fr ? "Conservation et manipulation" : "Storage and handling"}
          </Link>
        </div>
      </div>
    </div>
  );
}
