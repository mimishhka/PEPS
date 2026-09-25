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

it("nomme la provenance quand Postes Canada ne cote pas", async () => {
  // Le message ne parle plus d'absence : un cout S'AFFICHE desormais dans
  // tous les cas, et ce qui compte est de savoir d'ou il vient.
  afficher(REPONSE({ available: true, source: "openapi", reason: "rates_empty",
                     quoted: 0, to_quote: 3, internal: 3 }));

  const motif = await waitFor(() => screen.getByTestId("dispatch-rating-reason"), ATTENTE);
  expect(motif).toHaveTextContent(/tarif interne de la boutique/i);
  expect(motif).toHaveTextContent(/3 commande/);
  expect(motif).not.toHaveTextContent(/aucun tarif/i);
});

it("dit combien de commandes le transporteur a cotees quand le total est mixte", async () => {
  afficher(REPONSE({ available: true, source: "openapi", reason: "rates_partial",
                     quoted: 1, to_quote: 4, internal: 3 }));

  const motif = await waitFor(() => screen.getByTestId("dispatch-rating-reason"), ATTENTE);
  expect(motif).toHaveTextContent(/1 commande\(s\) cotée\(s\) par Postes Canada sur 4/);
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

// LE COEUR DE LA DEMANDE : « l'estimé du cout ne s'affiche toujours pas ».
// Un cout doit s'afficher dans TOUS les cas. A defaut de tarif transporteur,
// c'est le tarif interne de la boutique — etiquete comme tel, jamais confondu
// avec un prix Postes Canada.
it("affiche un cout meme quand Postes Canada ne cote rien", async () => {
  afficher(
    REPONSE({ available: true, source: "openapi", reason: "rates_empty",
              quoted: 0, to_quote: 2, internal: 2 },
      { labels_cost: 40 })
  );

  const bandeau = await waitFor(() => screen.getByTestId("dispatch-financials"), ATTENTE);
  expect(bandeau).toHaveTextContent("$40.00");
  // Et le message ne parle plus d'absence : il nomme la provenance.
  const motif = screen.getByTestId("dispatch-rating-reason");
  expect(motif).toHaveTextContent(/tarif interne de la boutique/i);
  expect(motif).not.toHaveTextContent(/aucun tarif/i);
});

it("distingue les commandes cotees des commandes au tarif interne", async () => {
  afficher(
    REPONSE({ available: true, source: "openapi", reason: "rates_partial",
              quoted: 3, to_quote: 5, internal: 2 })
  );

  const motif = await waitFor(() => screen.getByTestId("dispatch-rating-reason"), ATTENTE);
  expect(motif).toHaveTextContent(/3 commande\(s\) cotée\(s\) par Postes Canada sur 5/);
  expect(motif).toHaveTextContent(/2 autre\(s\) affichent le tarif interne/);
});

it("previent quand les tarifs viennent du repli sur l'ancienne API", async () => {
  afficher(
    REPONSE({ available: true, source: "openapi", source_reelle: "legacy-repli",
              reason: null, quoted: 2, to_quote: 2, internal: 0 },
      { labels_cost: 28.44 })
  );

  const repli = await waitFor(() => screen.getByTestId("dispatch-rating-repli"), ATTENTE);
  expect(repli).toHaveTextContent(/ancienne API/i);
  expect(repli).toHaveTextContent(/habilitées à la cotation/i);
});
