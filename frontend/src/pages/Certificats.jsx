import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

/**
 * Comment lire un certificat d'analyse.
 *
 * MIREILLE, 11/10/2026 : « je réalise que finalement il n'y a rien dessus.
 * aucune info, rien, c'est juste transactionnel », puis « peut-être aller
 * dans le détail de l'analyse d'une COA ».
 *
 * Mesure du site avant cette page : la FAQ compte dix-huit questions, dont
 * SEIZE portent sur la livraison, le paiement et les retours. L'analyse des
 * lots — l'argument central de la boutique — tenait en une phrase sur la page
 * « À propos ».
 *
 * CE CONTENU EST PLUS CONFORME QUE LE SILENCE, ET C'EST LE POINT.
 * « Usage recherche uniquement » posé sur un catalogue muet se lit comme une
 * formule juridique collée par-dessus un commerce. Les mêmes mots posés sur un
 * site qui explique ce que mesure une HPLC, ce qu'une pureté ne dit pas, et ce
 * qu'un certificat ne couvre pas, deviennent crédibles parce que le reste de
 * la page les confirme.
 *
 * LA LIGNE QUI NE SE FRANCHIT PAS : on décrit la MATIÈRE et la MÉTHODE,
 * jamais l'EFFET. Aucune dose, aucune voie d'administration, aucun sujet
 * vivant, aucun résultat attendu. La dernière section est là pour ça : elle
 * énumère ce qu'un certificat NE dit pas, dont la stérilité et l'aptitude à
 * quelque usage que ce soit.
 */

const SECTIONS = [
  {
    id: "ce-que-c-est",
    titre: { fr: "Ce qu'est un certificat d'analyse", en: "What a certificate of analysis is" },
    corps: {
      fr: [
        "Un certificat d'analyse est le rapport qu'un laboratoire émet après avoir analysé UN lot précis. Il ne décrit pas un produit en général : il décrit la poudre d'un flacon donné, à une date donnée.",
        "C'est la différence entre « nos peptides sont purs » et « ce flacon-ci vient d'un lot analysé le 4 septembre 2026, et voici le rapport ». La première phrase est une promesse. La seconde est vérifiable.",
      ],
      en: [
        "A certificate of analysis is the report a laboratory issues after testing ONE specific batch. It does not describe a product in general : it describes the powder in a given vial, on a given date.",
        "That is the difference between « our peptides are pure » and « this vial comes from a batch tested on 4 September 2026, and here is the report ». The first is a promise. The second can be checked.",
      ],
    },
  },
  {
    id: "numero-de-lot",
    titre: { fr: "Le numéro de lot : ce qui relie le papier au flacon", en: "The lot number : what ties the paper to the vial" },
    corps: {
      fr: [
        "Le numéro de lot est la première chose à vérifier, avant la pureté. Un certificat magnifique qui porte un autre numéro que celui de votre étiquette ne vous apprend rien sur ce que vous avez en main.",
        "Chez FIRONOVA, le lot figure sur l'étiquette du flacon, sur la fiche du produit et sur le certificat. Les trois doivent concorder.",
      ],
      en: [
        "The lot number is the first thing to check, before purity. A beautiful certificate carrying a different number from your label tells you nothing about what you are holding.",
        "At FIRONOVA, the lot appears on the vial label, on the product page and on the certificate. All three must match.",
      ],
    },
  },
  {
    id: "hplc",
    titre: { fr: "HPLC : ce que mesure le pourcentage", en: "HPLC : what the percentage measures" },
    corps: {
      fr: [
        "La chromatographie liquide à haute performance sépare les composants d'un échantillon en les faisant passer à travers une colonne : chacun la traverse à sa propre vitesse et sort à un moment distinct, appelé temps de rétention. Un détecteur enregistre ce qui sort, et trace un chromatogramme — une ligne avec des pics.",
        "Le pic principal est le composé recherché. Les petits pics autour sont les impuretés : fragments de synthèse, séquences incomplètes, résidus. La pureté annoncée est la SURFACE du pic principal rapportée à la surface totale de tous les pics.",
        "« ≥ 99,0 % » signifie donc : parmi tout ce que le détecteur a vu, 99 % de la surface appartient à un seul pic. C'est une mesure de proportion entre les espèces détectées, pas un inventaire absolu du flacon.",
      ],
      en: [
        "High-performance liquid chromatography separates the components of a sample by passing them through a column : each travels at its own speed and exits at a distinct moment, called the retention time. A detector records what comes out and draws a chromatogram — a line with peaks.",
        "The main peak is the compound sought. The small peaks around it are impurities : synthesis fragments, incomplete sequences, residues. The stated purity is the AREA of the main peak relative to the total area of all peaks.",
        "So « ≥ 99.0 % » means : of everything the detector saw, 99 % of the area belongs to a single peak. It is a proportion between detected species, not an absolute inventory of the vial.",
      ],
    },
  },
  {
    id: "spectrometrie",
    titre: { fr: "Spectrométrie de masse : une autre question", en: "Mass spectrometry : a different question" },
    corps: {
      fr: [
        "La HPLC répond à « combien de choses différentes y a-t-il ? ». Elle ne répond pas à « qu'est-ce que c'est ? ». Un pic unique et net peut appartenir à une molécule qui n'est pas celle qu'on attendait.",
        "C'est le rôle de la spectrométrie de masse : elle ionise l'échantillon et mesure le rapport masse sur charge, ce qui donne la masse moléculaire. Si la valeur mesurée correspond à la masse théorique de la séquence — 1419,55 Da pour une séquence de quinze acides aminés, par exemple — l'identité est confirmée.",
        "Pureté et identité sont deux questions distinctes, auxquelles répondent deux instruments distincts. Un certificat qui ne porte que l'une des deux est incomplet.",
      ],
      en: [
        "HPLC answers « how many different things are there ? ». It does not answer « what is it ? ». A single clean peak may belong to a molecule other than the expected one.",
        "That is what mass spectrometry is for : it ionises the sample and measures the mass-to-charge ratio, which gives the molecular mass. If the measured value matches the theoretical mass of the sequence — 1419.55 Da for a fifteen-amino-acid sequence, for instance — identity is confirmed.",
        "Purity and identity are two distinct questions, answered by two distinct instruments. A certificate carrying only one of them is incomplete.",
      ],
    },
  },
  {
    id: "autres-lignes",
    titre: { fr: "Les autres lignes du rapport", en: "The other lines of the report" },
    corps: {
      fr: [
        "L'apparence décrit ce que l'on doit voir : une poudre lyophilisée blanche. Une poudre jaunie ou agglomérée n'est pas conforme à son propre certificat.",
        "La teneur en eau, mesurée par titrage Karl Fischer quand elle figure, indique l'humidité résiduelle après lyophilisation. Elle compte pour la conservation : une poudre humide se dégrade plus vite.",
        "La teneur nette en peptide, lorsqu'elle est rapportée, distingue la masse de peptide réel de la masse totale de la poudre, qui comprend aussi les contre-ions et l'eau résiduelle. Deux flacons de « 5 mg » peuvent ne pas contenir la même quantité de peptide si l'un des deux ne rapporte que la masse brute.",
        "La date d'analyse date le rapport, pas le flacon. Un certificat est une photographie d'un lot à un instant ; les conditions d'entreposage qui suivent ne s'y trouvent pas.",
      ],
      en: [
        "Appearance describes what you should see : a white lyophilised powder. A yellowed or clumped powder does not match its own certificate.",
        "Water content, measured by Karl Fischer titration when reported, indicates residual moisture after lyophilisation. It matters for storage : damp powder degrades faster.",
        "Net peptide content, when reported, distinguishes the mass of actual peptide from the total mass of the powder, which also includes counter-ions and residual water. Two « 5 mg » vials may not hold the same amount of peptide if one of them reports only gross mass.",
        "The analysis date dates the report, not the vial. A certificate is a photograph of a batch at one moment ; the storage conditions that follow are not in it.",
      ],
    },
  },
  {
    id: "ce-qu-il-ne-dit-pas",
    titre: { fr: "Ce qu'un certificat ne dit pas", en: "What a certificate does not say" },
    corps: {
      fr: [
        "Il ne dit rien de la stérilité. Une analyse de pureté chimique ne recherche ni micro-organismes ni endotoxines, sauf si ces essais figurent explicitement au rapport.",
        "Il ne dit rien de l'aptitude à un usage quelconque. Un certificat atteste une composition chimique ; il ne qualifie aucune application, aucune administration et aucun contexte d'emploi.",
        "Il ne dit rien des lots voisins. Chaque lot a le sien.",
        "Nos produits sont des réactifs de laboratoire destinés à la recherche in vitro. Ils ne sont destinés à aucun usage humain ni vétérinaire, et aucun certificat ne pourrait changer cela.",
      ],
      en: [
        "It says nothing about sterility. A chemical purity analysis looks for neither micro-organisms nor endotoxins, unless those tests appear explicitly in the report.",
        "It says nothing about fitness for any use. A certificate attests a chemical composition ; it qualifies no application, no administration and no context of use.",
        "It says nothing about neighbouring batches. Each batch has its own.",
        "Our products are laboratory reagents for in vitro research. They are not intended for any human or veterinary use, and no certificate could change that.",
      ],
    },
  },
];

export default function Certificats() {
  useDocumentHead({
    title: "Certificats d'analyse",
    path: "/certificats",
    description:
      "Comment lire un certificat d'analyse : numéro de lot, pureté HPLC, confirmation d'identité par spectrométrie de masse, teneur en eau, et ce qu'un certificat ne couvre pas.",
  });
  const { lang } = useLang();
  const fr = lang === "fr";

  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-16" data-testid="certificats-page">
        <header className="border-b border-ash pb-6">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova-texte mb-3">
            {fr ? "ANALYSE DES LOTS" : "BATCH ANALYSIS"}
          </p>
          <h1 className="font-display text-[30px] sm:text-[36px] font-semibold text-nordfjord tracking-[-0.01em]">
            {fr ? "Lire un certificat d'analyse" : "Reading a certificate of analysis"}
          </h1>
          <p className="mt-4 text-sm text-glacier leading-relaxed max-w-[62ch]">
            {fr
              ? "Chaque lot est analysé par un laboratoire indépendant avant expédition. Cette page explique ce que contient le rapport, ce que chaque mesure établit, et ce qu'elle n'établit pas."
              : "Every batch is analysed by an independent laboratory before shipping. This page explains what the report contains, what each measurement establishes, and what it does not."}
          </p>
        </header>

        <div className="mt-14 space-y-14">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} data-testid={`certificats-${s.id}`}>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-nordfjord tracking-[-0.01em] mb-4">
                {fr ? s.titre.fr : s.titre.en}
              </h2>
              <div className="space-y-4">
                {(fr ? s.corps.fr : s.corps.en).map((p) => (
                  <p key={p.slice(0, 40)} className="text-[15px] text-glacier leading-relaxed max-w-[68ch]">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* La page se termine sur un geste, pas sur un point final : le
            lecteur qui vient de comprendre ce qu'est un lot veut vérifier le
            sien. C'est la raison d'être du laboratoire. */}
        <div className="mt-16 border-t border-ash pt-10 flex flex-wrap items-center gap-4"
             data-testid="certificats-suite">
          <Link to="/lab" className="btn-pill btn-nova" data-testid="certificats-vers-lab">
            {fr ? "Vérifier un lot" : "Check a lot"}
          </Link>
          <Link to="/faq" className="text-[13px] text-nova-texte underline" data-testid="certificats-vers-faq">
            {fr ? "Conservation et manipulation" : "Storage and handling"}
          </Link>
        </div>
      </div>
    </div>
  );
}
