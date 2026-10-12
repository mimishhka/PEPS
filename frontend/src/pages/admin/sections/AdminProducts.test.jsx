// La liste des produits : ce qu'il faut VOIR sans ouvrir une fiche.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminProducts from "./AdminProducts";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  API_BASE: "",
  formatApiError: (e) => String(e),
  resolveAssetUrl: (u) => u || "",
}));

jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
}));

jest.mock("../../../components/ConfirmDialog", () => ({
  useConfirm: () => jest.fn(async () => true),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

// Les donnees reelles du site le 2026-09-19 : la 10 mg est a zero, la 5 mg non.
const BPC = {
  id: "p-1", slug: "bpc-157-5mg", name_en: "BPC-157", name_fr: "BPC-157",
  category: "healing", active: true, image_url: "",
  variants: [
    { id: "v-1", name: "5.0mg", price: 64.99, stock: 58, weight_grams: 0.3 },
    { id: "v-2", name: "10.0mg", price: 100, stock: 0, weight_grams: 0.3 },
  ],
};

const COMPLET = {
  id: "p-2", slug: "tb-500", name_en: "TB-500", name_fr: "TB-500",
  category: "healing", active: true, image_url: "",
  variants: [{ id: "v-3", name: "5.0mg", price: 80, stock: 12, weight_grams: 0.3 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(async (url) => (
    url === "/products" ? { data: [BPC, COMPLET] } : { data: [] }));
});

it("montre la variante a zero, que le total masquait", async () => {
  // « 2 · 58 units » laissait croire que tout se vendait.
  render(<AdminProducts />);
  expect(await screen.findByTestId("variant-stock-bpc-157-5mg-1")).toHaveTextContent("10.0mg · 0");
  expect(screen.getByTestId("variant-stock-bpc-157-5mg-0")).toHaveTextContent("5.0mg · 58");
});

it("signale une rupture partielle plutot qu un produit actif", async () => {
  render(<AdminProducts />);
  expect(await screen.findByTestId("partial-out-bpc-157-5mg")).toHaveTextContent("Rupture partielle");
  // Le nom des formats manquants est a portee de souris.
  expect(screen.getByTestId("partial-out-bpc-157-5mg")).toHaveAttribute("title", "10.0mg");
});

it("un produit entierement en stock reste simplement actif", async () => {
  render(<AdminProducts />);
  await waitFor(() => expect(screen.getByTestId("variants-tb-500")).toBeInTheDocument());
  expect(screen.queryByTestId("partial-out-tb-500")).not.toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Filtres
// ---------------------------------------------------------------------------

it("la recherche trouve un produit par son nom, son format ou son SKU", async () => {
  render(<AdminProducts />);
  const champ = await screen.findByTestId("products-search");

  fireEvent.change(champ, { target: { value: "tb-500" } });
  expect(screen.queryByTestId("product-row-bpc-157-5mg")).not.toBeInTheDocument();
  expect(screen.getByTestId("product-row-tb-500")).toBeInTheDocument();

  // Un format ne figure nulle part ailleurs dans la ligne : sans lui dans la
  // recherche, impossible de retrouver « la 10 mg ».
  fireEvent.change(champ, { target: { value: "10.0mg" } });
  expect(screen.getByTestId("product-row-bpc-157-5mg")).toBeInTheDocument();
  expect(screen.queryByTestId("product-row-tb-500")).not.toBeInTheDocument();
});

it("le filtre d etat s accorde avec le badge affiche", async () => {
  // Le piege : deux definitions de « actif », l'une pour le badge, l'autre
  // pour le filtre. BPC-157 porte « Rupture partielle » : il ne doit PAS
  // apparaitre dans « Actif », et doit apparaitre dans « Rupture partielle ».
  render(<AdminProducts />);
  const etat = await screen.findByTestId("products-status");

  fireEvent.change(etat, { target: { value: "actif" } });
  expect(screen.queryByTestId("product-row-bpc-157-5mg")).not.toBeInTheDocument();
  expect(screen.getByTestId("product-row-tb-500")).toBeInTheDocument();

  fireEvent.change(etat, { target: { value: "partiel" } });
  expect(screen.getByTestId("partial-out-bpc-157-5mg")).toBeInTheDocument();
  expect(screen.queryByTestId("product-row-tb-500")).not.toBeInTheDocument();
});

it("un ecran vide dit que ce sont les filtres, et les efface", async () => {
  render(<AdminProducts />);
  fireEvent.change(await screen.findByTestId("products-search"), { target: { value: "zzz" } });

  expect(screen.getByTestId("products-empty")).toBeInTheDocument();
  expect(screen.getByTestId("products-count")).toHaveTextContent("0 sur 2");

  fireEvent.click(screen.getByTestId("products-empty-reset"));
  expect(screen.getByTestId("product-row-bpc-157-5mg")).toBeInTheDocument();
});

it("le filtre de categorie se combine avec la recherche", async () => {
  render(<AdminProducts />);
  fireEvent.change(await screen.findByTestId("products-category"), { target: { value: "weight-loss" } });
  expect(screen.getByTestId("products-empty")).toBeInTheDocument();

  fireEvent.change(screen.getByTestId("products-category"), { target: { value: "healing" } });
  expect(screen.getByTestId("products-count")).toHaveTextContent("2 compounds");
});

it("une nouvelle variante pese le poids par defaut, modifiable", async () => {
  // 0,3 g : demande du 2026-09-19. Le champ doit accepter les decimales.
  render(<AdminProducts />);
  const ajouter = await screen.findByTestId("new-product-btn");
  ajouter.click();
  const poids = await screen.findByTestId("v-weight-0");
  expect(poids).toHaveValue(0.3);
  expect(poids).toHaveAttribute("step", "0.01");
});

describe("le profil moléculaire est saisissable, et borné", () => {
  /* MIREILLE, 11/10/2026 : « je ne vois pas les changements ». Elle avait
   * raison, et la cause était de mon côté : j'avais publié cinq champs sur la
   * fiche produit en les croyant « endormis en base ». Ils n'étaient pas
   * endormis — ILS N'ONT JAMAIS ÉTÉ SAISISSABLES. L'éditeur exposait la
   * pureté et la séquence, pas l'apparence, la solubilité, la conservation,
   * la formule ni la longueur. Le profil affichait donc cinq lignes vides, et
   * il ne pouvait rien afficher d'autre.
   *
   * Ces tests lisent la source : monter l'éditeur demande son tiroir, ses
   * contextes et un produit chargé, et ce qui se vérifie ici n'est pas un
   * rendu mais une LISTE — quels champs existent, et lesquels ne doivent
   * jamais exister. */
  const fs = require("fs");
  const path = require("path");
  const SOURCE = fs.readFileSync(path.join(__dirname, "AdminProducts.jsx"), "utf8");

  test("les sept champs de matière ont leur saisie", () => {
    for (const champ of ["molecular_formula", "molecular_weight", "sequence_length",
                         "cas_number", "appearance", "solubility", "storage"]) {
      expect(SOURCE).toContain(`product.${champ}`);
    }
  });

  test("MECHANISM ET RESEARCH_AREAS N'EN ONT PAS, et c'est délibéré", () => {
    /* « Potentialise la libération d'hormone de croissance », « réparation
     * tissulaire » : ce sont des revendications d'effet. La fiche publique
     * refuse de les afficher et un test l'exige déjà. Leur donner un champ de
     * saisie inviterait à les remplir pour rien — ou pire, à les publier un
     * jour par réflexe, en se disant que puisqu'ils sont saisis ils doivent
     * bien servir à quelque chose. */
    expect(SOURCE).not.toMatch(/product\.mechanism/);
    expect(SOURCE).not.toMatch(/product\.research_areas/);
  });

  test("un produit neuf part avec ces champs définis", () => {
    // Sans valeur initiale, React bascule le champ de non contrôlé à
    // contrôlé à la première frappe et avertit en console.
    const neuf = SOURCE.slice(SOURCE.indexOf("price_cad: 0"), SOURCE.indexOf("price_cad: 0") + 400);
    for (const champ of ["appearance", "solubility", "storage", "cas_number"]) {
      expect(neuf).toContain(champ);
    }
  });
});
