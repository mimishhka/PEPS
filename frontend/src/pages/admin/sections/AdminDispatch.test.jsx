// Le coût estimé de Dispatch ne peut plus échouer en silence.
//
// La cotation Postes Canada renvoie une liste vide sur TOUTE erreur —
// identifiants refusés, numéro de client non habilité, code postal mal formé.
// Le total tombait alors à 0, et le bandeau financier ne s'affichait même pas :
// un écran muet, où l'absence de chiffre était indistinguable d'un montant nul.
// Mireille a signalé « le coût estimé ne semble pas fonctionner » — elle ne
// pouvait pas savoir laquelle des quatre causes s'appliquait.
//
// Le serveur nomme désormais la cause, et l'écran l'affiche.
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

const REPONSE = (rating, totals = {}, counts = {}) => ({
  date: "2026-09-24",
  configured: true,
  rating,
  totals: { labels_cost: 0, customer_shipping_charged: 0, margin: null, manifest: null, ...totals },
  counts: { to_label: 2, labeled: 0, overdue: 0, ...counts },
  to_label: [],
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

it("dit qu'aucune source de cotation n'est disponible", async () => {
  afficher(REPONSE({ available: false, source: null, reason: "no_rating_source", quoted: 0, to_quote: 2 }));

  const motif = await waitFor(() => screen.getByTestId("dispatch-rating-reason"), ATTENTE);
  expect(motif).toHaveTextContent(/aucune source de cotation/i);
  // La distinction qui manquait : le verrou de la cotation n'est pas celui
  // des etiquettes. L'ecran pouvait afficher « Config: ok » et rien estimer.
  expect(motif).toHaveTextContent(/distinct de celui des étiquettes/i);
});

it("dit que Postes Canada n'a renvoyé aucun tarif, et combien de commandes attendent", async () => {
  afficher(REPONSE({ available: true, source: "openapi", reason: "rates_empty", quoted: 0, to_quote: 3 }));

  const motif = await waitFor(() => screen.getByTestId("dispatch-rating-reason"), ATTENTE);
  expect(motif).toHaveTextContent(/aucun tarif/i);
  expect(motif).toHaveTextContent(/3 commande/);
  expect(motif).toHaveTextContent(/openapi/);
});

it("dit combien de commandes sont estimées quand le total est partiel", async () => {
  afficher(REPONSE({ available: true, source: "openapi", reason: "rates_partial", quoted: 1, to_quote: 4 }));

  const motif = await waitFor(() => screen.getByTestId("dispatch-rating-reason"), ATTENTE);
  expect(motif).toHaveTextContent(/1 commande\(s\) estimée\(s\) sur 4/);
});

it("ne dit rien quand la cotation fonctionne", async () => {
  afficher(
    REPONSE({ available: true, source: "openapi", reason: null, quoted: 2, to_quote: 2 },
      { labels_cost: 27.42 })
  );

  await waitFor(() => expect(screen.getByTestId("dispatch-financials")).toBeInTheDocument(), ATTENTE);
  expect(screen.queryByTestId("dispatch-rating-reason")).not.toBeInTheDocument();
});

it("affiche le bandeau financier même à zéro, au lieu de le cacher", async () => {
  // C'est le coeur du defaut : a zero, le bandeau disparaissait entierement.
  // Une ligne a etiqueter suffit desormais a le montrer — un zero visible est
  // une information, un bandeau absent n'en est pas une.
  afficher(REPONSE({ available: false, source: null, reason: "no_rating_source", quoted: 0, to_quote: 2 }));

  await waitFor(() => expect(screen.getByTestId("dispatch-financials")).toBeInTheDocument(), ATTENTE);
});
