// OPS : deux commandes pour un seul paiement, et le lien entre elles.
//
// MIREILLE, 30/09/2026 : retenir la commande complète n'est pas acceptable.
// Une commande mixte est donc scindée au paiement. Dans OPS, cela produit
// deux lignes : l'une avec l'argent, l'autre à 0 $ — et sans rien pour les
// relier, la seconde ressemble à un doublon ou à une erreur.
//
// Le besoin opérationnel est précis : savoir où est l'argent, savoir quel
// colis contient quoi, et passer d'une commande à l'autre sans chercher un
// numéro à la main.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminOrders from "./AdminOrders";
import api from "../../../lib/api";

let mockParams = {};
jest.mock("react-router-dom", () => ({
  useParams: () => mockParams,
  useNavigate: () => jest.fn(),
}));

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  API_BASE: "/api",
  formatApiError: (e) => String(e),
}));

jest.mock("../AdminLayout", () => ({ StatusBadge: () => null }));
jest.mock("../../../components/ConfirmDialog", () => ({ useConfirm: () => jest.fn() }));
jest.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin" } }) }));
jest.mock("../../../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr" }) }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));

const COMPTEURS = { active: 2, completed: 0, refunded: 0, cancelled: 0, all: 2 };

const LIGNE_DISPO = { product_id: "p-1", name_en: "Creatine", slug: "creatine",
                      qty: 1, price_cad: 60, line_total: 60 };
const LIGNE_SUITE = { product_id: "p-2", name_en: "BPC-157", slug: "bpc157",
                      qty: 1, price_cad: 80, line_total: 80,
                      preorder: true, fulfilled_by_order_id: "o-2" };

const MERE = {
  id: "o-1", order_number: "FN-1", email: "marie@example.com", user_id: "u-1",
  payment_status: "paid", fulfillment_status: "processing", payment_method: "interac",
  created_at: "2026-09-30T10:00:00Z", subtotal: 140, shipping: 20, total: 160, tax: 0,
  items: [LIGNE_DISPO, LIGNE_SUITE],
  shipping_address: { full_name: "Marie Tremblay" }, shipping_info: {}, notes: [],
  suite_order_id: "o-2", suite_order_number: "FN-1-P",
};

const ENFANT = {
  ...MERE,
  id: "o-2", order_number: "FN-1-P",
  fulfillment_status: "preorder",
  subtotal: 80, shipping: 0, total: 0,
  items: [{ ...LIGNE_SUITE, fulfilled_by_order_id: undefined }],
  suite_order_id: undefined, suite_order_number: undefined,
  suite_of_order_id: "o-1", suite_of_order_number: "FN-1",
};

const ORDINAIRE = { ...MERE, id: "o-9", order_number: "FN-9", items: [LIGNE_DISPO],
                    subtotal: 60, total: 80,
                    suite_order_id: undefined, suite_order_number: undefined };

const lister = (lignes) => {
  api.get.mockImplementation(async (url) => {
    if (url === "/admin/orders/counts") return { data: COMPTEURS };
    if (url === "/admin/orders/page") return { data: { items: lignes, total: lignes.length } };
    if (url === "/admin/shipping/pending-manifest") return { data: { configured: false } };
    const trouvee = lignes.find((o) => url === `/admin/orders/${o.id}`);
    if (trouvee) return { data: trouvee };
    return { data: {} };
  });
};

const ouvrir = async (commande, autres = []) => {
  lister([commande, ...autres]);
  mockParams = { id: commande.id };
  render(<AdminOrders />);
  await screen.findByTestId("order-detail-drawer");
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  lister([]);
});

describe("la liste", () => {
  test("LE CAS DE MIREILLE : les deux cotes de la scission sont visibles", async () => {
    lister([MERE, ENFANT]);
    render(<AdminOrders />);

    await waitFor(() => {
      expect(screen.getByTestId("suite-badge-FN-1")).toHaveTextContent("FN-1-P");
    });
    expect(screen.getByTestId("suite-of-badge-FN-1-P")).toHaveTextContent("FN-1");
  });

  test("la pastille MENE a la commande soeur", async () => {
    /* Le point qui compte a l'usage. La liste est paginee par cinquante :
     * deux commandes liees peuvent se trouver de part et d'autre d'une
     * coupure, et `setSelected(ligne)` ne marche que pour une ligne deja
     * chargee. On va donc la chercher par son identifiant.
     *
     * L'ancienne pastille « Remplacement » annoncait un lien sans y mener :
     * il fallait recopier le numero dans la recherche. */
    lister([MERE, ENFANT]);
    render(<AdminOrders />);
    await waitFor(() => expect(screen.getByTestId("suite-badge-FN-1")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("suite-badge-FN-1"));

    const tiroir = await screen.findByTestId("order-detail-drawer");
    expect(tiroir).toBeInTheDocument();
    expect(screen.getByTestId("order-detail-number")).toHaveTextContent("FN-1-P");
  });

  test("une commande ordinaire ne porte aucune pastille de liaison", async () => {
    lister([ORDINAIRE]);
    render(<AdminOrders />);

    await waitFor(() => expect(screen.getByTestId("open-order-FN-9")).toBeInTheDocument());
    expect(screen.queryByTestId("suite-badge-FN-9")).not.toBeInTheDocument();
    expect(screen.queryByTestId("suite-of-badge-FN-9")).not.toBeInTheDocument();
  });
});

describe("le tiroir de la commande d'origine", () => {
  test("il annonce que la precommande part ailleurs", async () => {
    await ouvrir(MERE, [ENFANT]);
    expect(screen.getByTestId("order-detail-has-suite")).toHaveTextContent("FN-1-P");
  });

  test("la ligne deplacee est marquee, et reste sur la facture", async () => {
    /* La ligne RESTE : c'est elle qui justifie le total paye, et la retirer
     * ferait un document faux. Mais elle ne monte pas dans CE colis — le
     * bordereau de prelevement l'ignore deja. Sans ce marqueur, on la
     * chercherait sur la tablette. */
    await ouvrir(MERE, [ENFANT]);

    expect(screen.getByTestId("item-sur-suite-bpc157")).toHaveTextContent("FN-1-P");
    // Les deux lignes sont toujours la : total de 160 $ pour 140 $ de
    // marchandise plus 20 $ de port.
    expect(screen.getByTestId("order-total")).toHaveTextContent("160");
    expect(screen.queryByTestId("item-sur-suite-creatine")).not.toBeInTheDocument();
  });
});

describe("le tiroir de l'envoi de suite", () => {
  test("il dit OU EST L'ARGENT", async () => {
    /* Le besoin operationnel le plus concret : un total de 0 $ sans
     * explication se lit comme une erreur, ou fait chercher un paiement qui
     * n'existe pas. Le virement, le coupon et la commission sont sur la
     * commande d'origine, et c'est la que se font les remboursements. */
    await ouvrir(ENFANT, [MERE]);

    const ligne = screen.getByTestId("order-detail-suite-of");
    expect(ligne).toHaveTextContent("FN-1");
    expect(ligne).toHaveTextContent(/paiement sur la commande d'origine/i);
  });

  test("il n'annonce pas de suite a son tour", async () => {
    await ouvrir(ENFANT, [MERE]);
    expect(screen.queryByTestId("order-detail-has-suite")).not.toBeInTheDocument();
  });
});
