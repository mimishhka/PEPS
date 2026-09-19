// Les coupons : savoir lesquels servent VRAIMENT, et retrouver un code.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminCoupons, { etatCoupon } from "./AdminCoupons";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  formatApiError: (e) => String(e),
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

const COUPONS = [
  { id: "c-1", code: "BIENVENUE10", discount_type: "percent", value: 10, active: true,
    used_count: 3, usage_limit: 100 },
  // Allume, mais la fenetre est fermee depuis hier.
  { id: "c-2", code: "ETE2026", discount_type: "percent", value: 15, active: true,
    used_count: 2, usage_limit: null, expires_at: "2026-09-18" },
  // Allume, mais la limite d'utilisation est atteinte.
  { id: "c-3", code: "PREMIERS50", discount_type: "fixed", value: 50, active: true,
    used_count: 50, usage_limit: 50 },
  { id: "c-4", code: "ANCIEN", discount_type: "percent", value: 5, active: false,
    used_count: 0, usage_limit: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(async (url) => (
    url === "/admin/coupons" ? { data: COUPONS } : { data: [] }));
});

// ---------------------------------------------------------------------------
// L'etat reel
// ---------------------------------------------------------------------------

it("un code allume mais expire ou epuise n est pas utilisable", () => {
  const jour = "2026-09-19";
  expect(etatCoupon(COUPONS[0], jour)).toBe("actif");
  expect(etatCoupon(COUPONS[1], jour)).toBe("expire");
  expect(etatCoupon(COUPONS[2], jour)).toBe("epuise");
  expect(etatCoupon(COUPONS[3], jour)).toBe("inactif");
  // Une fenetre pas encore ouverte : le code existe, mais rien ne marche
  // encore cote client.
  expect(etatCoupon({ active: true, start_at: "2026-10-01" }, jour)).toBe("a_venir");
  // Le dernier jour compte ENCORE : « expire le 19 » ne veut pas dire
  // « ferme le 19 ».
  expect(etatCoupon({ active: true, expires_at: "2026-09-19" }, jour)).toBe("actif");
});

it("le tableau montre la raison, pas seulement ON ou OFF", async () => {
  render(<AdminCoupons />);
  expect(await screen.findByTestId("coupon-state-ETE2026")).toHaveTextContent("Expiré");
  expect(screen.getByTestId("coupon-state-PREMIERS50")).toHaveTextContent("Épuisé");
  expect(screen.getByTestId("coupon-state-BIENVENUE10")).toHaveTextContent("Utilisable");
  expect(screen.getByTestId("coupon-state-ANCIEN")).toHaveTextContent("Désactivé");
});

it("le compteur ne fait plus passer tous les codes pour actifs", async () => {
  // Il annoncait « 4 code(s) actif(s) » alors qu'un seul l'etait.
  render(<AdminCoupons />);
  // Le compteur est affiche AVANT l'arrivee des donnees : c'est son contenu
  // qu'il faut attendre, pas son apparition.
  await waitFor(() => expect(screen.getByTestId("coupons-count"))
    .toHaveTextContent("4 code(s) · 1 utilisable(s)"));
});

// ---------------------------------------------------------------------------
// Filtres
// ---------------------------------------------------------------------------

it("la recherche retrouve un code", async () => {
  render(<AdminCoupons />);
  fireEvent.change(await screen.findByTestId("coupons-search"), { target: { value: "ete" } });
  expect(screen.getByTestId("coupon-row-ETE2026")).toBeInTheDocument();
  expect(screen.queryByTestId("coupon-row-BIENVENUE10")).not.toBeInTheDocument();
});

it("le filtre d etat s accorde avec le badge affiche", async () => {
  render(<AdminCoupons />);
  const etat = await screen.findByTestId("coupons-status");

  fireEvent.change(etat, { target: { value: "actif" } });
  expect(screen.getByTestId("coupon-row-BIENVENUE10")).toBeInTheDocument();
  expect(screen.queryByTestId("coupon-row-ETE2026")).not.toBeInTheDocument();

  fireEvent.change(etat, { target: { value: "expire" } });
  expect(screen.getByTestId("coupon-row-ETE2026")).toBeInTheDocument();
  expect(screen.queryByTestId("coupon-row-BIENVENUE10")).not.toBeInTheDocument();
});

it("un ecran vide distingue les filtres d une absence de coupon", async () => {
  render(<AdminCoupons />);
  fireEvent.change(await screen.findByTestId("coupons-search"), { target: { value: "zzz" } });
  expect(screen.getByTestId("coupons-empty-filtered")).toBeInTheDocument();

  fireEvent.click(screen.getByTestId("coupons-empty-reset"));
  expect(screen.getByTestId("coupon-row-BIENVENUE10")).toBeInTheDocument();
});
