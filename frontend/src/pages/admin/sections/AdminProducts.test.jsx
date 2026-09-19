// La liste des produits : ce qu'il faut VOIR sans ouvrir une fiche.
import { render, screen, waitFor } from "@testing-library/react";

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

it("une nouvelle variante pese le poids par defaut, modifiable", async () => {
  // 0,3 g : demande du 2026-09-19. Le champ doit accepter les decimales.
  render(<AdminProducts />);
  const ajouter = await screen.findByTestId("new-product-btn");
  ajouter.click();
  const poids = await screen.findByTestId("v-weight-0");
  expect(poids).toHaveValue(0.3);
  expect(poids).toHaveAttribute("step", "0.01");
});
