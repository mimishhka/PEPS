// Le coût estimé de Dispatch : ce qui s'affiche, et ce qui ne s'affiche pas.
//
// L'écran a traversé trois états en deux jours, et ces tests gardent le
// troisième — celui que Mireille a demandé.
//
// 1. Au départ, le bandeau financier ne paraissait QUE si un montant dépassait
//    zéro. Une cotation en échec donnait zéro, le bandeau disparaissait, et
//    l'absence de chiffre était indistinguable d'un montant nul.
// 2. On a ajouté un bandeau d'explication, puis un tarif interne de
//    substitution. Les deux disaient vrai, et les deux étaient de trop : un
//    chiffre qui n'est pas celui du transporteur n'aide pas à décider d'un
//    envoi, et une explication renvoyant au journal du serveur demande à
//    Mireille de faire le diagnostic elle-même.
// 3. État actuel : le bandeau paraît dès qu'il y a une ligne, même à zéro. Une
//    ligne sans coût montre « - » — ce qui dit « je ne sais pas » sans
//    prétendre autre chose. Aucune explication à l'écran ; le diagnostic vit
//    dans le journal du serveur.
import { render, screen, waitFor } from "@testing-library/react";

import AdminDispatch from "./AdminDispatch";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  API_BASE: "http://test/api",
  formatApiError: (e) => String(e),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("../../../components/ConfirmDialog", () => ({ useConfirm: () => jest.fn() }));
jest.mock("../ui", () => ({ Th: ({ children }) => <th>{children}</th> }));

const LIGNE = (extra = {}) => ({
  id: "o-1", order_number: "FN-1001", email: "x@y.z", items: 2,
  city: "Montréal", province: "QC", tracking_number: "", label_url: "",
  line_label_cost: null, line_label_cost_source: null,
  box_id: null, box_name: null, en_retard: false, dispatch_batch: "2026-09-24",
  ...extra,
});

const REPONSE = ({ rating = {}, totals = {}, counts = {}, to_label = [] } = {}) => ({
  date: "2026-09-24",
  configured: true,
  rating: { available: true, source: "openapi", reason: null, quoted: 0, to_quote: 0, ...rating },
  totals: { labels_cost: 0, customer_shipping_charged: 0, margin: null, manifest: null, ...totals },
  counts: { to_label: to_label.length, labeled: 0, overdue: 0, ...counts },
  to_label,
  labeled: [],
  available_boxes: [],
});

const afficher = (reponse) => {
  api.get.mockImplementation((url) => {
    if (String(url).includes("/admin/dispatch/today")) return Promise.resolve({ data: reponse });
    if (String(url).includes("config-status")) return Promise.resolve({ data: { configured: true } });
    return Promise.resolve({ data: {} });
  });
  return render(<AdminDispatch />);
};

const ATTENTE = { timeout: 4000 };

it("affiche le bandeau financier même à zéro, au lieu de le cacher", async () => {
  // Le défaut d'origine : à zéro, le bandeau disparaissait entièrement.
  afficher(REPONSE({ to_label: [LIGNE()], totals: { labels_cost: 0 } }));

  await waitFor(() => expect(screen.getByTestId("dispatch-financials")).toBeInTheDocument(), ATTENTE);
});

it("affiche le coût réel quand Postes Canada cote", async () => {
  afficher(REPONSE({
    to_label: [LIGNE({ line_label_cost: 14.22, line_label_cost_source: "estimated_cp", estimated_eta_days: 2 })],
    totals: { labels_cost: 14.22 },
    rating: { quoted: 1, to_quote: 1 },
  }));

  const bandeau = await waitFor(() => screen.getByTestId("dispatch-financials"), ATTENTE);
  expect(bandeau).toHaveTextContent("$14.22");
  expect(screen.getByTestId("dispatch-row-FN-1001")).toHaveTextContent("estimé CP");
});

it("n'invente aucun montant quand Postes Canada ne cote pas", async () => {
  // Le tarif interne de la boutique a vécu ici, puis a été retiré : un chiffre
  // qui n'est pas celui du transporteur invite à le confondre avec lui.
  afficher(REPONSE({
    to_label: [LIGNE({ line_label_cost: null })],
    rating: { reason: "rates_empty", quoted: 0, to_quote: 1 },
  }));

  await waitFor(() => expect(screen.getByTestId("dispatch-row-FN-1001")).toBeInTheDocument(), ATTENTE);
  const ligne = screen.getByTestId("dispatch-row-FN-1001");
  expect(ligne).not.toHaveTextContent("tarif interne");
  expect(ligne).not.toHaveTextContent("$20.00");
});

it("n'affiche aucun bandeau d'explication, même quand la cotation échoue", async () => {
  // Le diagnostic appartient au journal du serveur, pas à l'écran de travail.
  afficher(REPONSE({
    to_label: [LIGNE()],
    rating: { available: false, source: null, reason: "no_rating_source", quoted: 0, to_quote: 1 },
  }));

  await waitFor(() => expect(screen.getByTestId("dispatch-financials")).toBeInTheDocument(), ATTENTE);
  expect(screen.queryByTestId("dispatch-rating-reason")).not.toBeInTheDocument();
  expect(screen.queryByTestId("dispatch-rating-repli")).not.toBeInTheDocument();
});

it("signale une commande d'un lot antérieur comme en retard", async () => {
  // Elle disparaissait entièrement de l'écran avant le 2026-09-24 ; apparaître
  // sans explication serait tout aussi déroutant.
  afficher(REPONSE({
    to_label: [LIGNE({ en_retard: true, dispatch_batch: "2026-09-22" })],
  }));

  const marque = await waitFor(() => screen.getByTestId("dispatch-late-FN-1001"), ATTENTE);
  expect(marque).toHaveTextContent("en retard");
  expect(marque).toHaveTextContent("2026-09-22");
});
