// Les coupons : savoir lesquels servent VRAIMENT, et retrouver un code.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminCoupons, { etatCoupon, etatCodeAffilie } from "./AdminCoupons";
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

const CODES_AFFILIES = [
  { code: "MARIE10", affiliate_name: "Marie Tremblay", affiliate_email: "marie@example.com",
    affiliate_status: "active", discount_type: "percent", value: 10, active: true, used_count: 7 },
  // Compte suspendu : le paiement refuse ce code, quoi qu'en dise le coupon.
  { code: "LUC10", affiliate_name: "Luc Gagnon", affiliate_email: "luc@example.com",
    affiliate_status: "suspended", discount_type: "percent", value: 10, active: true, used_count: 1 },
  // Affilie en regle, mais la fenetre du code est fermee.
  { code: "ANCIENAFF", affiliate_name: "Ana Silva", affiliate_email: "ana@example.com",
    affiliate_status: "active", discount_type: "percent", value: 10, active: true,
    used_count: 4, expires_at: "2026-09-18" },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(async (url) => {
    if (url === "/admin/coupons") return { data: COUPONS };
    if (url === "/admin/affiliate-codes") return { data: CODES_AFFILIES };
    return { data: [] };
  });
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

// ---------------------------------------------------------------------------
// Codes d'affilies
// ---------------------------------------------------------------------------

it("un code dont l affilie est suspendu n est pas utilisable", () => {
  // Le paiement relit le statut de l'affilie : ce code est refuse au panier.
  // L'afficher « actif », comme le faisait la colonne, etait un mensonge.
  const jour = "2026-09-19";
  expect(etatCodeAffilie(CODES_AFFILIES[0], jour)).toBe("actif");
  expect(etatCodeAffilie(CODES_AFFILIES[1], jour)).toBe("affilie_suspendu");
  expect(etatCodeAffilie(CODES_AFFILIES[2], jour)).toBe("expire");
  expect(etatCodeAffilie({ affiliate_status: "invited", active: true }, jour)).toBe("affilie_invite");
});

it("le tableau des codes d affilies montre l etat reel", async () => {
  render(<AdminCoupons />);
  expect(await screen.findByTestId("affiliate-code-state-LUC10")).toHaveTextContent("Affilié suspendu");
  expect(screen.getByTestId("affiliate-code-state-ANCIENAFF")).toHaveTextContent("Expiré");
  expect(screen.getByTestId("affiliate-code-state-MARIE10")).toHaveTextContent("Utilisable");
});

it("on retrouve le code d un affilie par son nom ou son courriel", async () => {
  render(<AdminCoupons />);
  fireEvent.change(await screen.findByTestId("affiliate-codes-search"), { target: { value: "tremblay" } });
  expect(screen.getByTestId("affiliate-code-row-MARIE10")).toBeInTheDocument();
  expect(screen.queryByTestId("affiliate-code-row-LUC10")).not.toBeInTheDocument();

  fireEvent.change(screen.getByTestId("affiliate-codes-search"), { target: { value: "luc@example.com" } });
  expect(screen.getByTestId("affiliate-code-row-LUC10")).toBeInTheDocument();
  expect(screen.getByTestId("affiliate-codes-count")).toHaveTextContent("1 sur 3");
});

it("le filtre isole les codes bloques par un compte suspendu", async () => {
  render(<AdminCoupons />);
  fireEvent.change(await screen.findByTestId("affiliate-codes-status"),
                   { target: { value: "affilie_suspendu" } });
  expect(screen.getByTestId("affiliate-code-row-LUC10")).toBeInTheDocument();
  expect(screen.queryByTestId("affiliate-code-row-MARIE10")).not.toBeInTheDocument();

  fireEvent.change(screen.getByTestId("affiliate-codes-status"), { target: { value: "a_venir" } });
  expect(screen.getByTestId("affiliate-codes-empty")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("affiliate-codes-empty-reset"));
  expect(screen.getByTestId("affiliate-code-row-MARIE10")).toBeInTheDocument();
});

it("les deux tableaux se filtrent separement", async () => {
  // Une seule paire de filtres pour les deux listes aurait fait disparaitre
  // des lignes de l'autre tableau sans explication.
  render(<AdminCoupons />);
  fireEvent.change(await screen.findByTestId("coupons-search"), { target: { value: "BIENVENUE10" } });
  expect(screen.getByTestId("affiliate-code-row-LUC10")).toBeInTheDocument();
  expect(screen.getByTestId("affiliate-code-row-MARIE10")).toBeInTheDocument();
});

it("un ecran vide distingue les filtres d une absence de coupon", async () => {
  render(<AdminCoupons />);
  fireEvent.change(await screen.findByTestId("coupons-search"), { target: { value: "zzz" } });
  expect(screen.getByTestId("coupons-empty-filtered")).toBeInTheDocument();

  fireEvent.click(screen.getByTestId("coupons-empty-reset"));
  expect(screen.getByTestId("coupon-row-BIENVENUE10")).toBeInTheDocument();
});
