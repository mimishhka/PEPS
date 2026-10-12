// La page qui explique un certificat d'analyse.
//
// MIREILLE, 11/10/2026 : « je réalise que finalement il n'y a rien dessus.
// aucune info, rien, c'est juste transactionnel », puis « peut-être aller
// dans le détail de l'analyse d'une COA ».
//
// Mesure du site avant cette page : dix-huit questions dans la FAQ, dont
// SEIZE sur la livraison, le paiement et les retours. L'analyse des lots —
// l'argument central de la boutique — tenait en une phrase sur « À propos ».
//
// CE QUE CES TESTS PROTÈGENT, ET C'EST LE POINT DÉLICAT DE TOUTE LA PAGE :
// la ligne entre décrire une MATIÈRE et promettre un EFFET. Une page qui
// explique l'analyse des lots est plus conforme que le silence — « usage
// recherche uniquement » posé sur un catalogue muet se lit comme une formule
// collée par-dessus un commerce. Mais la même page qui glisserait une dose,
// une voie d'administration ou un bénéfice ferait l'inverse : elle
// détruirait les 396 lignes de la page de conformité.
//
// Le filet est donc écrit en NÉGATIF, et c'est voulu : il énumère ce qui ne
// doit jamais apparaître, plutôt que de vérifier que les bons mots sont là.

import { render, screen } from "@testing-library/react";

import Certificats from "./Certificats";

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
}));
jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr" }) }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));

const mockConfig = { coaPageEnabled: true };
jest.mock("../contexts/SiteConfigContext", () => ({ useSiteConfig: () => mockConfig }));

beforeEach(() => { mockConfig.coaPageEnabled = true; });

const texte = () => screen.getByTestId("certificats-page").textContent;

describe("la page explique ce qu'il faut expliquer", () => {
  test("les sept sections sont là", () => {
    render(<Certificats />);
    for (const id of ["ce-que-c-est", "numero-de-lot", "lcmsms", "hplc",
                      "teneur", "spectrometrie", "ce-qu-il-ne-dit-pas"]) {
      expect(screen.getByTestId(`certificats-${id}`)).toBeInTheDocument();
    }
  });

  test("elle distingue PURETÉ et TENEUR NETTE, qui sont deux questions", () => {
    /* La confusion la plus répandue, et celle que le certificat lui-même
     * prend soin de dissiper dans sa note de bas de tableau : une proportion
     * entre espèces détectées ne dit rien de la masse dans la fiole.
     *
     * La version précédente de ce test opposait pureté et IDENTITÉ, en
     * supposant deux instruments séparés. Son laboratoire fait du LC-MS/MS :
     * une seule analyse couplée. Le test a été corrigé parce que la réalité
     * n'était pas celle que j'avais supposée. */
    render(<Certificats />);
    const teneur = screen.getByTestId("certificats-teneur");
    expect(teneur).toHaveTextContent(/proportion/i);
    expect(teneur).toHaveTextContent(/masse/i);
    expect(screen.getByTestId("certificats-hplc")).toHaveTextContent(/contre-ions/i);
  });

  test("elle dit ce que le pourcentage HPLC mesure vraiment", () => {
    render(<Certificats />);
    expect(screen.getByTestId("certificats-hplc")).toHaveTextContent(/surface/i);
  });

  test("elle fait du numéro de lot la première vérification", () => {
    render(<Certificats />);
    expect(screen.getByTestId("certificats-numero-de-lot"))
      .toHaveTextContent(/avant la pureté/i);
  });

  test("elle mène au laboratoire pour vérifier un lot", () => {
    render(<Certificats />);
    expect(screen.getByTestId("certificats-vers-lab")).toHaveAttribute("href", "/lab");
  });

  test("MAIS PAS QUAND /lab N'EST PAS SERVIE", () => {
    /* MIREILLE, 11/10/2026 : « pourquoi je ne vois pas la page qui permet de
     * faire une recherche pour les COA ».
     *
     * Elle est derrière COA_PAGE_ENABLED, absent de son .env, donc à `false` :
     * la route renvoie à l'accueil. Le bouton était bien là, bien visible, et
     * ramenait à la page qu'on venait de quitter — ce qui ne ressemble pas à
     * un lien cassé mais à un clic ignoré. Le pire des deux. */
    mockConfig.coaPageEnabled = false;
    render(<Certificats />);
    expect(screen.queryByTestId("certificats-vers-lab")).toBeNull();
    // Et la page garde sa suite : l'autre lien, lui, ne dépend de rien.
    expect(screen.getByTestId("certificats-vers-faq")).toBeInTheDocument();
  });

  test("LE LIEN D'ENTREPOSAGE VISE LA SECTION, PAS LE HAUT DE LA FAQ", () => {
    /* MIREILLE : « le lien qui renvoie à l'entreposage ne me conduit qu'à la
     * page des FAQ ». Il visait /faq sans ancre, et la FAQ compte dix-huit
     * questions : on arrivait en haut, à charge d'aller chercher.
     *
     * L'ancre seule ne suffisait pas — voir ScrollToTop.test.jsx, où le vrai
     * défaut se trouvait. */
    render(<Certificats />);
    expect(screen.getByTestId("certificats-vers-faq"))
      .toHaveAttribute("href", "/faq#storage");
  });
});

describe("LA LIGNE QUI NE SE FRANCHIT PAS", () => {
  test("aucune dose, aucune voie d'administration, aucun sujet vivant", () => {
    /* Le filet en négatif. Une page qui glisserait une posologie ou un
     * bénéfice détruirait les 396 lignes de la page de conformité — et c'est
     * exactement ce qu'une source d'« information sur les peptides » trouvée
     * en ligne y mettrait, parce que c'est ce que ces sources contiennent. */
    const interdits = [
      /\bdose[sr]?\b/i, /posologie/i, /\bmg\s*\/\s*kg\b/i,
      /injection/i, /injecter/i, /sous-cutan/i, /intramuscul/i,
      /\bpatient/i, /\butilisateur/i, /\bcycle\b/i, /\bprotocole de\b/i,
      /bienfait/i, /bénéfice/i, /efficacit/i, /traitement/i, /thérapeut/i,
      /perte de poids/i, /masse musculaire/i, /cicatrisation/i,
    ];
    /* LE FILTRE NE LIT PAS LA SECTION QUI DÉMENT, et c'est une correction.
     *
     * Il interdisait « efficacité » partout. Or la page porte désormais
     * l'avertissement du laboratoire : « n'est pas un certificat de qualité,
     * de sécurité, d'EFFICACITÉ ni de conformité réglementaire ». Le mot y
     * apparaît dans une NÉGATION, c'est-à-dire exactement l'inverse de ce
     * qu'on veut interdire.
     *
     * Un interdit de mot ne distingue pas une promesse d'un démenti. La
     * section des démentis est donc retirée du champ du filtre, et vérifiée
     * séparément — par ce qu'elle DOIT contenir. */
    render(<Certificats />);
    const page = screen.getByTestId("certificats-page").textContent;
    const demenis = screen.getByTestId("certificats-ce-qu-il-ne-dit-pas").textContent;
    const t = page.replace(demenis, "");
    for (const motif of interdits) {
      expect(t).not.toMatch(motif);
    }
  });

  test("elle dit explicitement ce qu'un certificat NE couvre pas", () => {
    // La section la plus importante pour la conformité : stérilité,
    // endotoxines, et aptitude à un usage quelconque.
    render(<Certificats />);
    const section = screen.getByTestId("certificats-ce-qu-il-ne-dit-pas");
    expect(section).toHaveTextContent(/stérilité/i);
    expect(section).toHaveTextContent(/endotoxine/i);
    // Les démentis du laboratoire, mot pour mot dans leur substance.
    expect(section).toHaveTextContent(/n'est pas un certificat de qualité/i);
    expect(section).toHaveTextContent(/d'efficacité/i);
    expect(section).toHaveTextContent(/aucune administration humaine ou vétérinaire/i);
  });

  test("et elle rappelle le cadre, sur la page elle-même", () => {
    render(<Certificats />);
    expect(texte()).toMatch(/in vitro/i);
    expect(texte()).toMatch(/aucun usage humain ni vétérinaire/i);
  });
});

describe("les exemples viennent de VRAIS certificats", () => {
  /* MIREILLE, 11/10/2026 : « ça prend des exemples ». Elle a ensuite envoyé
   * deux certificats — GHK-Cu lot FN-OLW8W et Retatrutide lot FN-ELBCJ,
   * analysés le 27 août 2026 par SideChain Analytics.
   *
   * CE QUE LES DOCUMENTS ONT CORRIGÉ DANS MA PREMIÈRE VERSION :
   *
   *   1. J'avais décrit la HPLC et la spectrométrie comme DEUX analyses
   *      séparées. Son laboratoire fait du LC-MS/MS : une seule analyse
   *      couplée. Vrai en général, faux pour ses certificats.
   *   2. J'avais parlé de teneur en eau par titrage Karl Fischer. Ses
   *      certificats n'en rapportent pas, et leur note de bas de tableau dit
   *      au contraire que la pureté ne borne PAS l'eau résiduelle.
   *   3. J'avais inventé une masse d'exemple. Le réel était plus instructif :
   *      une molécule de 340,4 se lit à 341,20, une de 4731,3 se lit à
   *      947,90, et c'est la comparaison des deux qui explique les états de
   *      charge.
   *
   * Ces tests figent les chiffres RÉELS. Un exemple inventé se reconnaît, et
   * il abîme la crédibilité de tout ce qui l'entoure. */

  test("les deux lots sont nommés, pas des lots plausibles", () => {
    render(<Certificats />);
    expect(texte()).toContain("FN-OLW8W");
    expect(texte()).toContain("FN-ELBCJ");
  });

  test("LA MÉTHODE EST LC-MS/MS, pas deux analyses séparées", () => {
    render(<Certificats />);
    expect(screen.getByTestId("certificats-lcmsms")).toHaveTextContent(/LC-MS\/MS/);
    expect(texte()).toMatch(/une seule analyse|une analyse couplée|en une/i);
  });

  test("les chiffres de pureté et de teneur sont ceux du certificat", () => {
    render(<Certificats />);
    const purete = screen.getByTestId("certificats-purete-resultat");
    expect(purete).toHaveTextContent("99,7 %");
    expect(purete).toHaveTextContent("≥ 98 %");
    expect(purete).toHaveTextContent("Ph. Eur. 2.2.46");

    const teneur = screen.getByTestId("certificats-teneur-resultat");
    expect(teneur).toHaveTextContent("100,00 mg");
    expect(teneur).toHaveTextContent("105,32 mg");
    expect(teneur).toHaveTextContent("105,3 %");
  });

  test("LA COMPARAISON DES DEUX ÉTATS DE CHARGE est ce qui explique l'ion", () => {
    // Une molécule de 340,4 lue à 341,20 : intuitif. Une de 4731,3 lue à
    // 947,90 : incompréhensible seule. Les deux ensemble se passent de
    // paragraphe.
    const bloc = (render(<Certificats />), screen.getByTestId("certificats-comparaison-ions"));
    expect(bloc).toHaveTextContent("[M+H]+");
    expect(bloc).toHaveTextContent("[M+5H]5+");
    expect(bloc).toHaveTextContent("341,20 Da");
    expect(bloc).toHaveTextContent("947,90 Da");
  });

  test("le contre-ion est montré DANS la formule, pas décrit", () => {
    // C14H22CuN6O4 · C2H4O2 : la seconde partie est l'acétate. C'est
    // l'illustration de la teneur nette, et elle n'a rien d'inventé.
    render(<Certificats />);
    expect(screen.getByTestId("certificats-teneur")).toHaveTextContent("C2H4O2");
  });

  test("PLUS DE KARL FISCHER : ses certificats n'en rapportent pas", () => {
    render(<Certificats />);
    expect(texte()).not.toMatch(/karl fischer/i);
  });

  test("le chromatogramme porte le vrai temps de rétention", () => {
    render(<Certificats />);
    expect(screen.getByTestId("certificats-chromatogramme")).toHaveTextContent("1,199 min");
  });
});
