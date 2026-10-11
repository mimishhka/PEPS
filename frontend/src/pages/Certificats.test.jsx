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

const texte = () => screen.getByTestId("certificats-page").textContent;

describe("la page explique ce qu'il faut expliquer", () => {
  test("les six sections sont là", () => {
    render(<Certificats />);
    for (const id of ["ce-que-c-est", "numero-de-lot", "hplc", "spectrometrie",
                      "autres-lignes", "ce-qu-il-ne-dit-pas"]) {
      expect(screen.getByTestId(`certificats-${id}`)).toBeInTheDocument();
    }
  });

  test("elle distingue PURETÉ et IDENTITÉ, qui sont deux questions", () => {
    // C'est la confusion la plus répandue : un pic unique et net peut
    // appartenir à une molécule qui n'est pas celle qu'on attendait.
    render(<Certificats />);
    const spectro = screen.getByTestId("certificats-spectrometrie");
    expect(spectro).toHaveTextContent(/identité/i);
    expect(spectro).toHaveTextContent(/deux instruments distincts/i);
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
    render(<Certificats />);
    const t = texte();
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
    expect(section).toHaveTextContent(/aucune application/i);
  });

  test("et elle rappelle le cadre, sur la page elle-même", () => {
    render(<Certificats />);
    expect(texte()).toMatch(/in vitro/i);
    expect(texte()).toMatch(/aucun usage humain ni vétérinaire/i);
  });
});
