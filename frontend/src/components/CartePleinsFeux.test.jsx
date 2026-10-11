// La carte « pleins feux » : ce qu'elle promet, et ce qu'elle ne promet pas.
//
// MIREILLE, 11/10/2026 : « j'aime bien la façon dont leurs produits sont
// présentés en feature », puis « pleins feux avec un maximum de 4 produits
// vedettes ».
//
// CE QUE CES TESTS PROTÈGENT EN PREMIER : les deux lignes d'invitation sont
// DÉDUITES du produit, jamais écrites en dur. Écrites en dur, elles
// mentiraient dès qu'un lot change ou qu'un dosage s'ajoute — et c'est
// exactement le genre de phrase qu'on oublie de relire. Une carte qui annonce
// « certificat consultable » sur un lot qui n'en a pas est pire qu'une carte
// muette : elle use la confiance qu'elle est censée construire.

import { render, screen } from "@testing-library/react";

import CartePleinsFeux from "./CartePleinsFeux";

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));
jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr" }) }));
jest.mock("./ProductImage", () => ({ __esModule: true, default: () => null }));

const produit = (champs = {}) => ({
  id: "p-1", slug: "bpc-157", name_fr: "BPC-157", name_en: "BPC-157",
  purity: "≥ 99,0 %",
  variants: [
    { id: "v1", name: "5.0mg", price: 64.99, stock: 12, coa_status: "none", coa_url: "" },
    { id: "v2", name: "10.0mg", price: 100, stock: 8, coa_status: "none", coa_url: "" },
  ],
  ...champs,
});

const carte = () => screen.getByTestId("pleins-feux-bpc-157");

describe("la carte ouvre une porte, elle ne vend pas", () => {
  test("elle mène à la fiche, par un SEUL lien", () => {
    // Audit de l'espace client du 06/10, section 3 : deux liens vers la même
    // page font annoncer chaque élément deux fois par un lecteur d'écran.
    const { container } = render(<CartePleinsFeux product={produit()} />);
    expect(carte()).toHaveAttribute("href", "/product/bpc-157");
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });

  test("PAS DE PRIX, et c'est une conséquence de sa propre règle", () => {
    /* Le 11/10/2026 elle a retiré le « dès » des cartes du catalogue : le
     * prix affiché est celui du dosage choisi, pas un minimum. Une carte sans
     * sélecteur ne peut donc pas afficher un prix honnête — ce serait soit le
     * moins cher déguisé en prix unique, soit une fourchette, c'est-à-dire
     * une troisième façon d'écrire un prix sur le site. */
    render(<CartePleinsFeux product={produit()} />);
    expect(carte().textContent).not.toMatch(/\$|64,99|100,00/);
  });

  test("ni bouton d'achat, ni sélecteur", () => {
    const { container } = render(<CartePleinsFeux product={produit()} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  test("les dosages tiennent lieu d'étiquette", () => {
    // Ils disent qu'il y a plusieurs choix, sans mentir sur aucun prix.
    render(<CartePleinsFeux product={produit()} />);
    expect(screen.getByTestId("pleins-feux-dosages-bpc-157")).toHaveTextContent("5 mg · 10 mg");
  });
});

describe("les deux lignes sont déduites, jamais écrites en dur", () => {
  test("le nombre de concentrations suit les variantes", () => {
    render(<CartePleinsFeux product={produit()} />);
    expect(carte()).toHaveTextContent("2 concentrations disponibles.");
  });

  test("une seule variante ne dit pas « 1 concentrations »", () => {
    render(<CartePleinsFeux product={produit({
      variants: [{ id: "v1", name: "5.0mg", price: 64.99, stock: 12 }],
    })} />);
    expect(carte()).toHaveTextContent("Une concentration.");
  });

  test("LE CERTIFICAT N'EST ANNONCÉ QUE S'IL EXISTE VRAIMENT", () => {
    /* Une carte qui promet un certificat consultable sur un lot qui n'en a
     * pas use la confiance qu'elle est censée construire. Il faut les DEUX :
     * le statut « available » ET un fichier. */
    render(<CartePleinsFeux product={produit()} />);
    expect(carte()).toHaveTextContent("Certificat d'analyse à venir.");
    expect(carte()).not.toHaveTextContent("consultable");
  });

  test("un statut « available » sans fichier ne suffit pas", () => {
    render(<CartePleinsFeux product={produit({
      variants: [{ id: "v1", name: "5.0mg", coa_status: "available", coa_url: "" }],
    })} />);
    expect(carte()).toHaveTextContent("à venir");
  });

  test("un certificat réel sur une seule variante suffit", () => {
    render(<CartePleinsFeux product={produit({
      variants: [
        { id: "v1", name: "5.0mg", coa_status: "available", coa_url: "/api/uploads/coa/x.pdf" },
        { id: "v2", name: "10.0mg", coa_status: "pending", coa_url: "" },
      ],
    })} />);
    expect(carte()).toHaveTextContent("consultable");
  });
});

describe("la preuve d'analyse", () => {
  test("la pureté s'affiche avec sa méthode", () => {
    // C'est l'argument sur un réactif qu'on achète sans pouvoir le tenir.
    render(<CartePleinsFeux product={produit()} />);
    expect(screen.getByTestId("pleins-feux-purete-bpc-157"))
      .toHaveTextContent("≥ 99,0 % · vérifié par HPLC");
  });

  test("sans pureté renseignée, aucune ligne vide", () => {
    render(<CartePleinsFeux product={produit({ purity: "" })} />);
    expect(screen.queryByTestId("pleins-feux-purete-bpc-157")).toBeNull();
  });
});

describe("les bords ne font pas tomber", () => {
  test("un produit sans variantes", () => {
    render(<CartePleinsFeux product={produit({ variants: [] })} />);
    expect(carte()).toHaveTextContent("BPC-157");
    expect(screen.queryByTestId("pleins-feux-dosages-bpc-157")).toBeNull();
  });
});
