// Une précommande ne s'ajoute pas en silence depuis le catalogue.
//
// MIREILLE, 30/09/2026 : « je constate que lors de l'ajout d'un produit en
// précommande il n'y a pas de notification pour le client ».
//
// La fiche produit ouvrait bien une confirmation. Cette carte, non : elle
// appelait `add()` directement, sous un bouton qui disait « Ajouter à la
// commande » exactement comme pour un article en stock. Le client repartait
// avec une précommande au panier sans l'avoir su — et rien ne le lui disait
// ensuite, ni le panier, ni la caisse, ni le courriel.

import { render, screen, waitFor } from "@testing-library/react";
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
  id: "p-1",
  slug: "bpc-157",
  name_fr: "BPC-157",
  name_en: "BPC-157",
  price_cad: 60,
  variants: variantes,
});

const EN_STOCK = { id: "v1", name: "5 mg", price: 60, stock: 12 };
const PRECOMMANDE = {
  id: "v2", name: "10 mg", price: 80, stock: 0,
  preorder_enabled: true, preorder_price: 70,
  preorder_delay_message: "3 à 4 semaines",
};

const bouton = () => screen.getByTestId("add-to-cart-bpc-157");

beforeEach(() => {
  jest.clearAllMocks();
  // CRA met Jest en resetMocks : les implémentations sont effacées entre les
  // cas et doivent être réinstallées ici.
  useCart.mockReturnValue({ add: mockAdd });
  useConfirm.mockReturnValue(mockConfirm);
  mockConfirm.mockResolvedValue(true);
});

describe("un article en précommande", () => {
  test("LE CAS DE MIREILLE : l'ajout demande confirmation", async () => {
    render(<ProductCard product={produit([PRECOMMANDE])} />);

    await userEvent.click(bouton());

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    const opts = mockConfirm.mock.calls[0][0];
    expect(opts.title).toMatch(/Précommander/i);
    // Le délai annoncé sur la variante doit y figurer : c'est l'information
    // qui décide le client.
    expect(opts.description).toContain("3 à 4 semaines");
  });

  test("la confirmation annonce que le disponible partira séparément", async () => {
    // C'est la promesse de la scission. Sans elle, le client verrait deux
    // commandes apparaître pour un seul paiement et croirait à une erreur.
    render(<ProductCard product={produit([PRECOMMANDE])} />);

    await userEvent.click(bouton());

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    const { description } = mockConfirm.mock.calls[0][0];
    expect(description).toMatch(/tout de suite/i);
    expect(description).toMatch(/sans frais/i);
  });

  test("refuser la confirmation n'ajoute rien", async () => {
    mockConfirm.mockResolvedValue(false);
    render(<ProductCard product={produit([PRECOMMANDE])} />);

    await userEvent.click(bouton());

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test("accepter ajoute la variante en précommande", async () => {
    render(<ProductCard product={produit([PRECOMMANDE])} />);

    await userEvent.click(bouton());

    await waitFor(() => expect(mockAdd).toHaveBeenCalled());
    const [, qte, variante] = mockAdd.mock.calls[0];
    expect(qte).toBe(1);
    expect(variante.id).toBe("v2");
  });

  test("le bouton dit ce qu'il fait", async () => {
    // « Ajouter à la commande » sur une précommande laissait croire à une
    // expédition immédiate.
    render(<ProductCard product={produit([PRECOMMANDE])} />);
    expect(bouton()).toHaveTextContent(/Précommander/i);
  });
});

describe("un article en stock", () => {
  test("s'ajoute sans confirmation", async () => {
    // Le contraire serait une gêne : la confirmation n'a de sens que là où
    // l'attente est réelle.
    render(<ProductCard product={produit([EN_STOCK])} />);

    await userEvent.click(bouton());

    await waitFor(() => expect(mockAdd).toHaveBeenCalled());
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(bouton()).toHaveTextContent(/Ajouter/i);
  });
});

describe("une fiche à plusieurs variantes", () => {
  test("c'est la variante AJOUTÉE qui décide, pas la fiche", async () => {
    /* Le piège que ce test garde.
     *
     * Le bouton ajoute la variante la MOINS CHÈRE. Ici c'est la précommande
     * à 70 $, alors que la 5 mg à 80 $ est en stock. Tester « cette fiche
     * contient-elle une précommande » aurait suffi ici par accident — mais la
     * carte annonce « En stock » dans ce cas, et tester l'inverse ferait
     * demander confirmation pour un ajout qui n'en est pas une. Seule la
     * variante réellement ajoutée est la bonne question.
     */
    const cherEnStock = { ...EN_STOCK, price: 80 };
    render(<ProductCard product={produit([cherEnStock, PRECOMMANDE])} />);

    await userEvent.click(bouton());

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    const [, , variante] = mockAdd.mock.calls[0];
    expect(variante.id).toBe("v2");
  });

  test("quand la moins chère est en stock, aucune confirmation", async () => {
    render(<ProductCard product={produit([EN_STOCK, PRECOMMANDE])} />);

    await userEvent.click(bouton());

    await waitFor(() => expect(mockAdd).toHaveBeenCalled());
    expect(mockConfirm).not.toHaveBeenCalled();
    const [, , variante] = mockAdd.mock.calls[0];
    expect(variante.id).toBe("v1");
  });
});

describe("rupture sans précommande", () => {
  test("le bouton reste fermé", () => {
    // E2E CA-007 : il restait actif quand tout était à zéro sans précommande.
    render(<ProductCard product={produit([{ id: "v3", name: "5 mg", price: 60, stock: 0 }])} />);
    expect(bouton()).toBeDisabled();
    expect(bouton()).toHaveTextContent(/Rupture/i);
  });
});

// ===========================================================================
// UN SEUL STATUT PAR CARTE — audit du 06/10/2026, point 2
//
// « BPC-157 affiche à la fois le badge PRE-ORDER et • IN STOCK. Contradiction
// directe : le client ne sait pas s'il recevra le produit maintenant. »
//
// Les deux étaient vrais séparément. Le badge regardait `anyPreorder` — une
// variante QUELCONQUE —, le statut regardait `cheapest` — la variante que le
// bouton ajoute vraiment. Sur BPC-157 : le 10 mg attend son COA, le 5 mg est
// en stock. Résultat : les deux s'affichaient, sur l'élément le plus regardé
// de la carte.
//
// Le code portait déjà la bonne intuition pour la fenêtre de confirmation
// (`ajoutEstUnePrecommande`), avec un commentaire décrivant ce piège exact.
// Elle n'avait simplement jamais été appliquée à l'affichage.
// ===========================================================================

describe("un seul statut par carte", () => {
  const badge = () => screen.queryByTestId("preorder-badge-bpc-157");
  const statut = () => screen.queryByTestId("card-stock-bpc-157");

  test("LE CAS DE L'AUDIT : la moins chère est en stock, une autre est en précommande", () => {
    /* Le bouton ajoute le 5 mg, qui est en stock. La carte doit donc dire
     * « En stock » — et PAS « Précommande » en même temps. */
    render(<ProductCard product={produit([EN_STOCK, PRECOMMANDE])} />);

    expect(statut()).toHaveTextContent(/en stock/i);
    expect(badge()).not.toBeInTheDocument();
  });

  test("la moins chère EST la précommande : le badge sort, le statut se tait", () => {
    /* « Tirzepatide : PRE-ORDER écrit 3 fois (badge, statut sur 2 lignes,
     * bouton) ». Le badge et le bouton suffisent. */
    render(<ProductCard product={produit([PRECOMMANDE])} />);

    expect(badge()).toBeInTheDocument();
    expect(statut()).not.toBeInTheDocument();
    expect(bouton()).toHaveTextContent(/précommander/i);
  });

  test("« précommande » n'est jamais écrit deux fois", () => {
    render(<ProductCard product={produit([PRECOMMANDE])} />);

    const occurrences = (document.body.textContent.match(/précommand/gi) || []).length;
    expect(occurrences).toBeLessThanOrEqual(2);  // badge + bouton
  });

  test("LE STOCK NE SE CHIFFRE PLUS, ET « BAS » NE SE DIT PLUS", () => {
    /* MIREILLE, 11/10/2026 : « never mention low stock and the amount in
     * stock ».
     *
     * Ce test exigeait l'inverse jusqu'au 11/10/2026 : « Stock bas · 3 ».
     * Il a été corrigé, pas contourné — c'est une décision de commerçante.
     * Ces deux mentions disaient ce qu'une boutique n'a pas à dire :
     * combien il lui reste, et qu'elle est à court. */
    render(<ProductCard product={produit([{ ...EN_STOCK, stock: 3 }])} />);

    expect(statut()).toHaveTextContent(/en stock/i);
    expect(statut()).not.toHaveTextContent("3");
    expect(statut()).not.toHaveTextContent(/stock bas|low stock/i);
    expect(badge()).not.toBeInTheDocument();
  });

  test("AUCUN CHIFFRE DE STOCK NE FUIT, QUEL QUE SOIT LE COMPTE", () => {
    // Le filet large : c'est l'invariant qu'elle a demandé, pas un cas.
    for (const stock of [1, 2, 3, 7, 9, 10, 11, 48, 250]) {
      const { unmount } = render(<ProductCard product={produit([{ ...EN_STOCK, stock }])} />);
      expect(statut()).toHaveTextContent(/en stock/i);
      expect(statut().textContent).not.toMatch(/\d/);
      unmount();
    }
  });

  test("une rupture sans précommande le dit, sans badge", () => {
    render(<ProductCard product={produit([{ ...EN_STOCK, stock: 0 }])} />);

    expect(statut()).toHaveTextContent(/rupture/i);
    expect(badge()).not.toBeInTheDocument();
  });

  test("UN COA EN ATTENTE SUR UN LOT EN STOCK N'EST PLUS UNE PRÉCOMMANDE", () => {
    /* MIREILLE, 11/10/2026 : « il sort en précommande comme s'il n'était pas
     * en stock [...] il ne faut pas que la commande soit traitée comme une
     * précommande. »
     *
     * Ce test affirmait le contraire jusqu'au 11/10/2026. Il a été corrigé,
     * pas contourné : la règle métier a changé. Un certificat manquant n'est
     * pas une rupture de stock — le lot part tout de suite, et c'est
     * l'avertissement qui porte l'information, pas une fausse pastille. */
    render(<ProductCard product={produit([
      { ...EN_STOCK, preorder_enabled: true, badge_coa_pending: true },
    ])} />);

    expect(badge()).not.toBeInTheDocument();
    expect(statut()).toHaveTextContent(/en stock|stock bas/i);
    // Et PAS de mention de certificat sur la carte : « mention of coa not
    // necessary on the card » (11/10/2026). Elle reste sur la fiche, là où
    // la décision se prend vraiment.
    expect(screen.queryByTestId("card-coa-bpc-157")).toBeNull();
  });

  test("sans stock, le certificat ne change rien : la précommande reste", () => {
    render(<ProductCard product={produit([
      { ...EN_STOCK, stock: 0, preorder_enabled: true, badge_coa_pending: true },
    ])} />);

    expect(badge()).toBeInTheDocument();
    // Pas d'avertissement par-dessus : le délai d'arrivée est déjà le sujet.
    expect(screen.queryByTestId("card-coa-bpc-157")).toBeNull();
  });
});
