// La liste des commandes du client : deux lignes, un seul paiement.
//
// MIREILLE, 30/09/2026 : retenir la commande complète n'est pas acceptable.
// Une commande mixte est donc scindée au paiement. Le client voit alors DEUX
// commandes dans son compte, dont une à « 0,00 $ » — ce qui, sans rien pour
// l'expliquer, se lit comme une erreur de facturation.
//
// Cette page n'avait aucun test. Celui-ci ne couvre que la liste des
// commandes ; le reste de la page (profil, adresses, sécurité) reste à faire.

import { render, screen, waitFor } from "@testing-library/react";

import Account from "./Account";
import api from "../lib/api";

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ search: "", pathname: "/account" }),
  useSearchParams: () => [new URLSearchParams(""), jest.fn()],
}));

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ t: (k) => k, lang: "fr" }) }));
jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-1", email: "cliente@example.com", name: "Lola" },
                    logout: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("../hooks/useAffiliate", () => ({ __esModule: true, default: () => ({ affiliate: null }) }));
// ThemeToggle et CustomerSupport exigent leurs propres contextes et n'ont
// rien a voir avec la liste des commandes.
jest.mock("../components/ThemeToggle", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/CustomerSupport", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/NomEnDeux", () => ({ __esModule: true, default: () => null }));
const mockConfirm = jest.fn(async () => true);
jest.mock("../components/ConfirmDialog", () => ({ useConfirm: () => mockConfirm }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const MERE = {
  id: "o-1", order_number: "FN-1", created_at: "2026-09-30T10:00:00Z",
  payment_status: "paid", fulfillment_status: "processing",
  items: [{ product_id: "p-1" }, { product_id: "p-2" }],
  total: 160, shipping_info: {},
  suite_order_id: "o-2", suite_order_number: "FN-1-P",
};

const ENFANT = {
  id: "o-2", order_number: "FN-1-P", created_at: "2026-09-30T10:05:00Z",
  payment_status: "paid", fulfillment_status: "preorder",
  items: [{ product_id: "p-2" }],
  total: 0, shipping_info: {},
  suite_of_order_id: "o-1", suite_of_order_number: "FN-1",
};

const ORDINAIRE = {
  id: "o-9", order_number: "FN-9", created_at: "2026-09-01T10:00:00Z",
  payment_status: "paid", fulfillment_status: "delivered",
  items: [{ product_id: "p-1" }], total: 64.99, shipping_info: {},
};

const commandes = (liste) => {
  api.get.mockImplementation((url) => {
    if (String(url).includes("/orders/mine")) return Promise.resolve({ data: liste });
    return Promise.resolve({ data: [] });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

test("UNE COMMANDE, UNE LIGNE — même quand elle part en deux colis", async () => {
  /* Ces deux tests disaient l'inverse jusqu'au 11/10/2026 : ils exigeaient
   * DEUX lignes, chacune avec une pastille et un lien vers l'autre. C'était
   * le mieux qu'on pouvait faire tant qu'on acceptait les deux lignes.
   *
   * Audit de l'espace client du 06/10, priorité 2 : « le client croit avoir
   * passé deux commandes, dont une gratuite. 4 liens pour un seul achat. »
   * La scission au paiement est une mécanique d'EXPÉDITION ; elle n'avait
   * aucune raison de remonter jusqu'à l'écran de la cliente.
   *
   * Corrigés, pas contournés : c'est la règle d'affichage qui a changé. */
  commandes([MERE, ENFANT]);
  render(<Account />);

  await waitFor(() => {
    expect(screen.getByTestId("order-row-FN-1")).toBeInTheDocument();
  });
  // La sous-commande n'a plus de ligne à elle.
  expect(screen.queryByTestId("order-row-FN-1-P")).toBeNull();
  // Et plus de pastilles concurrentes : une seule mention neutre.
  expect(screen.getByTestId("order-envois-FN-1")).toHaveTextContent(/2 envois/i);
  expect(screen.queryByTestId("order-has-suite-FN-1")).toBeNull();
});

test("les deux envois se lisent À L'INTÉRIEUR de la commande", async () => {
  commandes([MERE, ENFANT]);
  render(<Account />);

  const detail = await screen.findByTestId("order-detail-envois-FN-1");
  expect(detail).toHaveTextContent(/Envoi 1/);
  expect(detail).toHaveTextContent(/Envoi 2/);
  expect(detail).toHaveTextContent(/précommande/i);
});

test("QUATRE LIENS POUR UN ACHAT DEVIENNENT UN SEUL", async () => {
  // Un lecteur d'écran annonçait la même commande deux fois, et il fallait
  // maintenir deux composants pour une seule destination.
  commandes([MERE, ENFANT]);
  render(<Account />);

  await waitFor(() => expect(screen.getByTestId("order-row-FN-1")).toBeInTheDocument());
  expect(screen.queryByTestId("order-suite-link-FN-1")).toBeNull();
  expect(screen.queryByTestId("order-suite-link-FN-1-P")).toBeNull();
});

test("l'envoi de suite reste identifié « Précommande » tant qu'il attend", async () => {
  // Son statut d'exécution est la seule chose qui renseigne sur l'attente —
  // et il disparaît de la carte dès qu'un numéro de suivi existe, le libellé
  // et le suivi s'excluant mutuellement à cet endroit.
  commandes([ENFANT]);
  render(<Account />);

  await waitFor(() => {
    expect(screen.getByTestId("order-row-FN-1-P")).toHaveTextContent(/Précommande/i);
  });
});

test("une commande ordinaire ne porte aucune de ces pastilles", async () => {
  // Le cas de la très grande majorité des commandes.
  commandes([ORDINAIRE]);
  render(<Account />);

  await waitFor(() => expect(screen.getByTestId("order-row-FN-9")).toBeInTheDocument());
  expect(screen.queryByTestId("order-suite-of-FN-9")).not.toBeInTheDocument();
  expect(screen.queryByTestId("order-has-suite-FN-9")).not.toBeInTheDocument();
  expect(screen.queryByTestId("order-suite-link-FN-9")).not.toBeInTheDocument();
});

describe("les doublons et le pouce", () => {
  /* Audit de l'espace client du 06/10/2026, sections 1 et 3. Deux défauts
   * que la carte du compte portait seule. */

  test("UNE SEULE DÉCONNEXION, et c'est celle de l'en-tête", async () => {
    /* « Deux déconnexions : SIGN OUT dans l'en-tête du site et SIGN OUT →
     * dans la carte My Account. Même action, deux boutons, deux styles. »
     * Sur ordinateur, les deux étaient visibles EN MÊME TEMPS.
     *
     * Celle de l'en-tête reste : elle est atteignable depuis toutes les
     * pages. Celle-ci faisait 16 px de haut, sous le minimum tactile, et
     * n'ajoutait rien. */
    commandes([]);
    render(<Account />);
    await waitFor(() => expect(screen.getByTestId("account-tabs")).toBeInTheDocument());
    expect(screen.queryByTestId("account-logout")).toBeNull();
  });

  test("LES ONGLETS NE SE REPLIENT PLUS SUR DEUX LIGNES", async () => {
    /* « Onglets sur deux lignes sur iPhone ; le trait de l'onglet actif
     * n'est que sous la première ligne. On croit voir deux menus
     * différents. » jsdom ne calcule aucune mise en page : on vérifie le
     * MÉCANISME — plus de repli, un défilement horizontal à la place. */
    commandes([]);
    render(<Account />);
    const barre = await screen.findByTestId("account-tabs");
    expect(barre.className).not.toMatch(/flex-wrap/);
    expect(barre.className).toMatch(/overflow-x-auto/);
  });

  test("et chaque onglet tient la cible tactile de 44 px", async () => {
    commandes([]);
    render(<Account />);
    const onglet = await screen.findByTestId("account-tab-orders");
    expect(onglet.className).toMatch(/min-h-\[44px\]/);
    // `shrink-0` : sans lui, cinq onglets se compriment au lieu de défiler.
    expect(onglet.className).toMatch(/shrink-0/);
  });
});
