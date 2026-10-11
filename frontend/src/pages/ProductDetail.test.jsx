// La fiche produit : ce qu'elle dit de l'état du stock et du certificat.
//
// Deux décisions du 2026-09-20 sont verrouillées ici.
//
// 1. Sous la photo, plus rien. Les pastilles « Certificat d'analyse
//    disponible » et « COA · À VENIR » répétaient une information déjà portée
//    par la colonne de droite, là où on décide d'acheter.
// 2. « Précommande » ne peut plus masquer la rupture. Une variante en
//    précommande sans un seul flacon en tablette doit le dire : sinon le
//    client lit « Précommande » et comprend « expédié demain ».
import { render, screen, waitFor } from "@testing-library/react";

import ProductDetail from "./ProductDetail";
import api from "../lib/api";

jest.mock("react-router-dom", () => ({
  useParams: () => ({ slug: "bpc-157" }),
  Link: ({ to, children, ...reste }) => <a href={to} {...reste}>{children}</a>,
}));

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
  resolveAssetUrl: (u) => u,
}));

jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({ t: (k) => k, lang: "fr" }),
}));
jest.mock("../contexts/CartContext", () => ({ useCart: () => ({ add: jest.fn() }) }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("../hooks/useAffiliate", () => ({ __esModule: true, default: () => ({ affiliate: null }) }));
jest.mock("../components/brand", () => ({ Seal: () => null }));
jest.mock("../components/ProductImage", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/LoadingSkeletons", () => ({ ProductDetailSkeleton: () => null }));
// La fiche demande une CONFIRMATION avant une precommande. Sans ce double,
// `useConfirm` exige son fournisseur et le rendu casse avant la premiere
// assertion — la fiche entiere devenait intestable.
jest.mock("../components/ConfirmDialog", () => ({
  useConfirm: () => () => Promise.resolve(true),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

// Une seule variante par cas : avec plusieurs, le sélecteur de dosage répète
// les libellés et la recherche par texte ne désigne plus la pastille.
const fiche = (variante) => ({
  id: "p-1",
  slug: "bpc-157",
  name_fr: "BPC-157",
  name_en: "BPC-157",
  price_cad: 100,
  purity: "≥ 99 %",
  variants: [{
    id: "v-1", name: "10.0mg", sku: "BPC-157-10MG",
    price: 100, sale_price: null, preorder_price: 85,
    badge_coming_soon: false, preorder_note: "", coa_url: "",
    ...variante,
  }],
});

const afficher = async (variante) => {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.includes("/related") ? [] : fiche(variante),
  }));
  render(<ProductDetail />);
  await waitFor(() => expect(screen.getByTestId("product-detail-page")).toBeInTheDocument());
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("en précommande sans stock, la pastille annonce aussi la rupture", async () => {
  await afficher({
    stock: 0, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
  });

  // L'ORDRE DIT LEQUEL COMPTE. « Précommande · Rupture » se lisait comme une
  // contradiction (rapport E2E #20) : on annoncait une precommande, puis on
  // la dementait. L'etat REEL vient d'abord — c'est une rupture —, la
  // precommande suit comme le recours offert.
  expect(screen.getByTestId("stock-state")).toHaveTextContent("Rupture · Précommande");
});

test("UN CERTIFICAT MANQUANT N'EST PAS UNE RUPTURE DE STOCK", async () => {
  /* MIREILLE, 11/10/2026 : « j'ai rajouté du BPC-157 mais pour lequel je n'ai
   * pas encore de COA. Il sort en précommande comme s'il n'était pas en
   * stock [...] il ne faut pas que la commande soit traitée comme une
   * précommande. »
   *
   * Ce test disait l'inverse jusqu'au 11/10/2026 : il vérifiait que ce lot
   * s'annonçait « Précommande ». Il a été corrigé, pas contourné — c'est la
   * règle métier qui a changé, pas le code qui s'est mis à mentir. Le lot est
   * en tablette : il s'annonce en stock, et l'avertissement dit ce qui
   * manque vraiment. */
  await afficher({
    stock: 12, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
  });

  const pastille = screen.getByTestId("stock-state");
  expect(pastille).toHaveTextContent("En stock");
  expect(pastille).not.toHaveTextContent("Précommande");
  expect(pastille).not.toHaveTextContent("Rupture");
  expect(screen.getByTestId("avertissement-coa")).toBeInTheDocument();
});

test("et le bouton ajoute normalement, sans parler de précommande", async () => {
  await afficher({
    stock: 12, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
  });
  const bouton = screen.getByTestId("product-add-to-cart");
  expect(bouton).toBeEnabled();
  expect(bouton).not.toHaveTextContent(/PRÉCOMMANDE/i);
});

test("sans stock, le certificat ne change rien : c'est bien une précommande", async () => {
  // La rupture, elle, reste une vraie raison. Et on n'y ajoute pas
  // l'avertissement : le délai d'arrivée est déjà le sujet.
  await afficher({
    stock: 0, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
  });
  expect(screen.getByTestId("stock-state")).toHaveTextContent("Rupture · Précommande");
  expect(screen.queryByTestId("avertissement-coa")).toBeNull();
});

test("hors précommande, la rupture se dit comme avant", async () => {
  await afficher({
    stock: 0, preorder_enabled: false,
    coa_status: "available", badge_coa_pending: false,
    coa_url: "/uploads/coa/bpc157.pdf",
  });

  expect(screen.getByTestId("stock-state")).toHaveTextContent("Rupture");
});

test("aucune pastille de COA sous la photo, certificat disponible ou non", async () => {
  await afficher({
    stock: 5, preorder_enabled: false,
    coa_status: "available", badge_coa_pending: false,
    coa_url: "/uploads/coa/bpc157.pdf",
  });

  expect(screen.queryByTestId("coa-badge-verified")).not.toBeInTheDocument();
  expect(screen.queryByTestId("coa-badge-pending")).not.toBeInTheDocument();
  // Le certificat reste accessible : c'est le bouton qui le porte, pas une
  // pastille décorative.
  expect(screen.getByTestId("download-coa")).toHaveAttribute("href", "/uploads/coa/bpc157.pdf");
});

test("la note de précommande reste affichable quand l'admin en écrit une", async () => {
  await afficher({
    stock: 0, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
    preorder_note: "Expédié dès le 15 novembre",
  });

  expect(screen.getByTestId("preorder-note")).toHaveTextContent("Expédié dès le 15 novembre");
});
