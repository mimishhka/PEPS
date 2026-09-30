// Deux commandes pour un seul paiement : la page doit le dire.
//
// MIREILLE, 30/09/2026 : retenir la commande complète n'est pas acceptable.
// Une commande mixte est donc scindée au paiement — le disponible part tout
// de suite, la précommande suit.
//
// Sans explication, le client voit apparaître une seconde commande d'un
// montant de zéro dollar et conclut à une erreur de facturation. Ou bien il
// attend un colis unique qui ne viendra jamais.

import { render, screen, waitFor } from "@testing-library/react";

import OrderConfirmation from "./OrderConfirmation";
import api from "../lib/api";

let mockEtat = {};
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "o-1" }),
  useLocation: () => ({ state: mockEtat, search: "" }),
  Link: ({ to, children, ...reste }) => <a href={to} {...reste}>{children}</a>,
}));

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ t: (k) => k, lang: "fr" }) }));
const mockConfirm = jest.fn(async () => true);
jest.mock("../components/ConfirmDialog", () => ({ useConfirm: () => mockConfirm }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const LIGNE_DISPO = { product_id: "p-1", slug: "creatine", qty: 1,
                      name_fr: "Créatine", name_en: "Creatine", line_total: 60 };
const LIGNE_SUITE = { product_id: "p-2", slug: "bpc157", qty: 1,
                      name_fr: "BPC-157", name_en: "BPC-157", line_total: 80,
                      preorder: true, fulfilled_by_order_id: "o-2" };

const MERE = {
  id: "o-1", order_number: "FN-1", created_at: "2026-09-30T10:00:00Z",
  payment_status: "paid", fulfillment_status: "processing", user_id: "u-1",
  items: [LIGNE_DISPO, LIGNE_SUITE],
  subtotal: 140, total: 160, shipping: 20,
  suite_order_id: "o-2", suite_order_number: "FN-1-P",
};

const ENFANT = {
  id: "o-2", order_number: "FN-1-P", created_at: "2026-09-30T10:05:00Z",
  payment_status: "paid", fulfillment_status: "preorder", user_id: "u-1",
  items: [{ ...LIGNE_SUITE, fulfilled_by_order_id: undefined }],
  subtotal: 80, total: 0, shipping: 0,
  payment_info: { type: "preorder_suite", suite_of_order_id: "o-1",
                  suite_of_order_number: "FN-1" },
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  mockConfirm.mockResolvedValue(true);
  mockEtat = {};
});

const afficher = async (commande) => {
  mockEtat = { order: commande };
  render(<OrderConfirmation />);
  await waitFor(() => expect(screen.getByTestId("confirmation-page")).toBeInTheDocument());
};

describe("la commande d'origine", () => {
  test("LE CAS DE MIREILLE : elle annonce le second envoi", async () => {
    await afficher(MERE);

    const bandeau = screen.getByTestId("suite-banner");
    expect(bandeau).toHaveTextContent("FN-1-P");
    expect(bandeau).toHaveTextContent(/tout de suite/i);
    // Les deux craintes à désamorcer : payer encore, et payer le port.
    expect(bandeau).toHaveTextContent(/déjà payé/i);
    expect(bandeau).toHaveTextContent(/sans frais/i);
  });

  test("la ligne partie dans l'autre colis est marquée", async () => {
    // Elle RESTE sur la facture — c'est elle qui justifie le total payé —
    // mais elle ne voyage pas dans ce colis-ci.
    await afficher(MERE);

    expect(screen.getByTestId("recap-suite-bpc157")).toBeInTheDocument();
    expect(screen.queryByTestId("recap-suite-creatine")).not.toBeInTheDocument();
  });

  test("le total facturé reste celui du panier entier", async () => {
    // Recalculer ferait passer sous le seuil de livraison gratuite et
    // ajouterait vingt dollars non consentis, ou exigerait un remboursement.
    await afficher(MERE);

    expect(screen.getByTestId("confirm-subtotal")).toHaveTextContent("140");
  });
});

describe("l'envoi de suite", () => {
  test("il explique pourquoi son total est à zéro", async () => {
    await afficher(ENFANT);

    const bandeau = screen.getByTestId("suite-of-banner");
    expect(bandeau).toHaveTextContent("FN-1");
    expect(bandeau).toHaveTextContent(/déjà payé/i);
  });

  test("il ne réclame AUCUN paiement", async () => {
    /* Le risque le plus concret de toute la scission : copier les
     * instructions Interac de la mère ferait recevoir au client un ordre de
     * paiement pour une commande déjà réglée — et il paierait deux fois.
     *
     * La page s'en protège d'elle-même (`interac` vaut null dès qu'aucun
     * paiement n'est attendu), mais c'est exactement le genre de propriété
     * qu'on veut voir tenir dans le temps.
     */
    await afficher(ENFANT);

    expect(screen.queryByTestId("interac-instructions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("crypto-instructions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("payment-deadline-warning")).not.toBeInTheDocument();
  });

  test("il n'annonce pas de second envoi à son tour", async () => {
    // Sinon le client attendrait un troisième colis.
    await afficher(ENFANT);
    expect(screen.queryByTestId("suite-banner")).not.toBeInTheDocument();
  });
});

describe("une commande ordinaire", () => {
  test("aucun des deux bandeaux n'apparaît", async () => {
    // Le cas de la très grande majorité des commandes : rien ne doit changer
    // pour elles.
    await afficher({ ...MERE, items: [LIGNE_DISPO], suite_order_id: undefined,
                     suite_order_number: undefined });

    expect(screen.queryByTestId("suite-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("suite-of-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recap-suite-creatine")).not.toBeInTheDocument();
  });
});
