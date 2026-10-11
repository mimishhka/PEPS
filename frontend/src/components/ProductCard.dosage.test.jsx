// Le dosage se choisit sur la carte, et le prix suit.
//
// MIREILLE, 11/10/2026 : « add this buttons without prices on the catalog on
// the product tile ; on product tile remove for research only, lyophilized,
// and from », puis « change the price according to the selection of dosage ».
//
// La carte annonçait le prix de la variante la MOINS CHÈRE, suivi de « dès ».
// Pour acheter le 10 mg il fallait ouvrir la fiche. Et trois lignes ne
// servaient à rien : la mention d'usage recherche, répétée douze fois sur une
// grille de douze produits alors que le bandeau de l'en-tête la porte déjà ;
// le dosage et « Lyophilisé », redits sous chaque carte ; et « dès », qui
// n'a plus d'objet dès que le prix est celui d'un dosage précis.
//
// CE QUE CES TESTS PROTÈGENT VRAIMENT : que le prix affiché, la pastille de
// statut, l'avertissement de certificat ET ce que le bouton ajoute parlent
// TOUS de la même variante. C'est la contradiction que l'audit du 06/10
// signalait en premier — « BPC-157 affiche à la fois PRE-ORDER et IN
// STOCK » — et un sélecteur est exactement ce qui la fait revenir si une
// seule de ces quatre choses oublie de suivre la sélection.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ProductCard from "./ProductCard";
import { useCart } from "../contexts/CartContext";
import { useConfirm } from "./ConfirmDialog";

const mockAdd = jest.fn();
const mockConfirm = jest.fn();

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));
jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr" }) }));
jest.mock("../contexts/CartContext", () => ({ useCart: jest.fn() }));
jest.mock("./ConfirmDialog", () => ({ useConfirm: jest.fn() }));
jest.mock("./ProductImage", () => ({ __esModule: true, default: () => null }));
jest.mock("../lib/prix", () => ({ prix: (n) => `${n} $` }));

const produit = (variantes) => ({
  id: "p-1", slug: "bpc-157", name_fr: "BPC-157", name_en: "BPC-157",
  price_cad: 60, dosage_mg: 5, variants: variantes,
});

const CINQ = { id: "v1", name: "5 mg", price: 64.99, stock: 12 };
const DIX = { id: "v2", name: "10 mg", price: 100, stock: 8 };

const pastille = (nom) => screen.getByTestId(`card-dosage-bpc-157-${nom}`);
const prixAffiche = () => screen.getByTestId("card-price-bpc-157");

beforeEach(() => {
  jest.clearAllMocks();
  useCart.mockReturnValue({ add: mockAdd });
  useConfirm.mockReturnValue(mockConfirm);
  mockConfirm.mockResolvedValue(true);
});

describe("les pastilles de dosage", () => {
  test("il y en a une par variante", () => {
    render(<ProductCard product={produit([CINQ, DIX])} />);
    expect(screen.getByTestId("card-dosages-bpc-157").children).toHaveLength(2);
    expect(pastille("5 mg")).toBeInTheDocument();
    expect(pastille("10 mg")).toBeInTheDocument();
  });

  test("ELLES NE PORTENT PAS LE PRIX", () => {
    // Celles de la fiche produit l'affichent ; ici le prix est juste en
    // dessous et change avec la sélection. L'écrire deux fois ferait douter
    // de l'un des deux.
    render(<ProductCard product={produit([CINQ, DIX])} />);
    expect(pastille("5 mg").textContent).toBe("5 mg");
    expect(pastille("10 mg").textContent).toBe("10 mg");
  });

  test("elles font 36 px de haut, et c'est un écart assumé", () => {
    /* MIREILLE, 11/10/2026 : « the block for the dosage is too big ».
     *
     * 36 px est SOUS le minimum de 44 px que l'audit du 06/10 demande pour
     * une cible tactile. C'est un arbitrage, pas un oubli : trois fois la
     * hauteur du texte, et très au-dessus des 29 px que ce même audit
     * signalait. Le test fige le chiffre pour que l'écart reste visible et
     * se rediscute si un tap rate. */
    render(<ProductCard product={produit([CINQ, DIX])} />);
    expect(pastille("5 mg").className).toMatch(/min-h-\[36px\]/);
  });

  test("un produit à une seule variante garde sa pastille", () => {
    // Elle porte alors le dosage que « 5 mg · Lyophilisé » disait avant.
    render(<ProductCard product={produit([CINQ])} />);
    expect(pastille("5 mg")).toBeInTheDocument();
  });
});

describe("le prix suit la sélection", () => {
  test("au départ, la moins chère", () => {
    render(<ProductCard product={produit([CINQ, DIX])} />);
    expect(prixAffiche()).toHaveTextContent("64.99");
  });

  test("LE CAS DEMANDÉ : choisir 10 mg change le prix", async () => {
    render(<ProductCard product={produit([CINQ, DIX])} />);
    await userEvent.click(pastille("10 mg"));
    expect(prixAffiche()).toHaveTextContent("100");
    expect(prixAffiche()).not.toHaveTextContent("64.99");
  });

  test("et on peut revenir", async () => {
    render(<ProductCard product={produit([CINQ, DIX])} />);
    await userEvent.click(pastille("10 mg"));
    await userEvent.click(pastille("5 mg"));
    expect(prixAffiche()).toHaveTextContent("64.99");
  });

  test("la pastille active se voit", async () => {
    render(<ProductCard product={produit([CINQ, DIX])} />);
    expect(pastille("5 mg")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(pastille("10 mg"));
    expect(pastille("10 mg")).toHaveAttribute("aria-pressed", "true");
    expect(pastille("5 mg")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("LE BOUTON AJOUTE LE DOSAGE CHOISI", () => {
  test("et non la variante la moins chère", async () => {
    // Le défaut qu'un sélecteur fait apparaître si le bouton ne le suit pas :
    // la cliente choisit 10 mg, paie 100 $, et reçoit du 5 mg.
    render(<ProductCard product={produit([CINQ, DIX])} />);
    await userEvent.click(pastille("10 mg"));
    await userEvent.click(screen.getByTestId("add-to-cart-bpc-157"));
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][2]).toMatchObject({ id: "v2", name: "10 mg" });
  });
});

describe("le statut suit aussi la sélection", () => {
  const EPUISE = { id: "v2", name: "10 mg", price: 100, stock: 0 };
  const PRECO = {
    id: "v2", name: "10 mg", price: 100, stock: 0,
    preorder_enabled: true, preorder_price: 90,
  };
  const SANS_COA = { id: "v2", name: "10 mg", price: 100, stock: 8, coa_status: "pending" };

  test("le stock affiché est celui du dosage choisi", async () => {
    // Le 5 mg est en tablette, le 10 mg est épuisé mais précommandable :
    // la pastille de statut doit basculer avec la sélection.
    render(<ProductCard product={produit([CINQ, PRECO])} />);
    expect(screen.getByTestId("card-stock-bpc-157")).toHaveTextContent(/En stock/);
    await userEvent.click(pastille("10 mg"));
    expect(screen.queryByTestId("card-stock-bpc-157")).toBeNull();
    expect(screen.getByTestId("preorder-badge-bpc-157")).toBeInTheDocument();
  });

  test("et il ne chiffre jamais rien", async () => {
    render(<ProductCard product={produit([CINQ, { ...DIX, stock: 2 }])} />);
    await userEvent.click(pastille("10 mg"));
    expect(screen.getByTestId("card-stock-bpc-157").textContent).not.toMatch(/\d/);
  });

  test("LE BADGE ET LE STATUT NE SE CONTREDISENT JAMAIS", () => {
    // Audit du 06/10, point 2. Un seul des deux s'affiche, selon la
    // variante choisie — et jamais les deux ensemble.
    render(<ProductCard product={produit([CINQ, PRECO])} />);
    expect(screen.queryByTestId("preorder-badge-bpc-157")).toBeNull();
    expect(screen.getByTestId("card-stock-bpc-157")).toBeInTheDocument();
  });

  test("et le badge apparaît quand on choisit la précommande", async () => {
    render(<ProductCard product={produit([CINQ, PRECO])} />);
    await userEvent.click(pastille("10 mg"));
    expect(screen.getByTestId("preorder-badge-bpc-157")).toBeInTheDocument();
    expect(screen.queryByTestId("card-stock-bpc-157")).toBeNull();
  });

  test("AUCUNE MENTION DE CERTIFICAT SUR LA CARTE", async () => {
    /* MIREILLE, 11/10/2026 : « mention of coa not necessary on the card ».
     * Elle y était depuis le matin même. Elle reste sur la fiche produit,
     * juste au-dessus du bouton, là où la décision se prend vraiment — une
     * grille de catalogue n'est pas le bon endroit pour une nuance. */
    render(<ProductCard product={produit([CINQ, SANS_COA])} />);
    expect(screen.queryByTestId("card-coa-bpc-157")).toBeNull();
    await userEvent.click(pastille("10 mg"));
    expect(screen.queryByTestId("card-coa-bpc-157")).toBeNull();
  });

  test("un dosage épuisé sans précommande n'est pas sélectionnable", () => {
    render(<ProductCard product={produit([CINQ, EPUISE])} />);
    expect(pastille("10 mg")).toBeDisabled();
    expect(pastille("5 mg")).toBeEnabled();
  });

  test("LE DÉFAUT PAR DÉFAUT TOMBE SUR UN DOSAGE DISPONIBLE", async () => {
    // La moins chère est épuisée : ouvrir le catalogue sur une pastille
    // grisée avec « Rupture » dessous serait un mauvais premier regard,
    // alors qu'un autre dosage est en tablette.
    render(<ProductCard product={produit([{ ...CINQ, stock: 0 }, DIX])} />);
    expect(pastille("10 mg")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("add-to-cart-bpc-157")).toBeEnabled();
  });
});

describe("les trois lignes retirées", () => {
  test("plus de mention d'usage recherche sur la carte", () => {
    // Le bandeau de l'en-tête la porte sur chaque page, et la fiche la
    // répète. Douze fois sur une grille de douze, c'était du bruit.
    const { container } = render(<ProductCard product={produit([CINQ, DIX])} />);
    expect(container.textContent).not.toMatch(/USAGE RECHERCHE|RESEARCH USE/i);
  });

  test("plus de ligne « 5 mg · Lyophilisé »", () => {
    const { container } = render(<ProductCard product={produit([CINQ, DIX])} />);
    expect(container.textContent).not.toMatch(/Lyophilis|Lyophiliz/i);
  });

  test("PLUS DE « DÈS » : le prix n'est plus un minimum", () => {
    const { container } = render(<ProductCard product={produit([CINQ, DIX])} />);
    expect(container.textContent).not.toMatch(/\bdès\b|\bfrom\b/i);
  });
});
