// Trois defauts vus a l'ecran sur la page des versements.
//
//   1. Les horodatages sortaient BRUTS :
//        2026-08-14T21:20:48.474350+00:00
//      Deux generations du meme mois a une minute d'intervalle ne se
//      distinguaient qu'a la seconde pres, au milieu de la chaine.
//
//   2. « Prets a payer » affichait « 0 · $0.00 CAD » — un compte et un montant
//      melanges dans une valeur, et deux zeros en gras pour dire « rien ».
//
//   3. L'action principale etait « Generer les releves » EN PERMANENCE, y
//      compris quand des releves attendaient d'etre envoyes. L'ecran poussait
//      a regenerer plutot qu'a payer.
import { render, screen, waitFor } from "@testing-library/react";

import AdminPayouts from "./AdminPayouts";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

jest.mock("../../../components/ConfirmDialog", () => ({
  useConfirm: () => async () => true,
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const RUN = {
  run_id: "NP-000001", type: "batch", count: 2, total_cad: 57.0,
  created_at: "2026-08-14T21:20:48.474350+00:00",
};

function reponses({ payouts = [], runs = [], paymentRuns = [RUN] } = {}) {
  // Les URL exactes du composant : « payouts/all » pour la liste,
  // « payouts/runs » pour les generations, « payments/runs » pour les envois.
  api.get.mockImplementation(async (url) => {
    if (url.startsWith("/admin/affiliates/payouts/all")) return { data: payouts };
    // Les deux historiques repondent { runs: [...] }, pas un tableau nu.
    if (url.startsWith("/admin/affiliates/payouts/runs")) return { data: { runs } };
    if (url.startsWith("/admin/affiliates/payments/runs")) return { data: { runs: paymentRuns } };
    return { data: [] };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  reponses();
});

describe("AdminPayouts", () => {
  it("n'affiche jamais un horodatage brut", async () => {
    render(<AdminPayouts />);
    await screen.findByTestId("admin-payouts");

    await waitFor(() =>
      expect(screen.queryByText(/NP-000001/)).toBeInTheDocument());
    // La chaine ISO ne doit apparaitre nulle part.
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("s'efface quand il n'y a rien a verser, au lieu d'annoncer deux zeros", async () => {
    render(<AdminPayouts />);
    await screen.findByTestId("admin-payouts");

    expect(screen.getByText(/rien . verser/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/0 · \$0\.00/);
  });

  it("met en avant l'etape en cours : generer d'abord, envoyer ensuite", async () => {
    // Rien de pret : l'action principale est de GENERER.
    const { unmount } = render(<AdminPayouts />);
    await screen.findByTestId("admin-payouts");
    expect(screen.getByTestId("run-payouts").className).toMatch(/btn-nova/);
    expect(screen.getByTestId("batch-send").className).not.toMatch(/btn-nova/);
    unmount();

    // Un releve pret : l'action principale devient ENVOYER.
    reponses({ payouts: [{
      id: "p-1", status: "ready", affiliate_code: "FITNES70",
      period: "2026-08", amount_cad: 28.5, amount: 20.52, currency: "usdt",
      referrals_count: 4,
    }] });
    render(<AdminPayouts />);
    await screen.findByTestId("admin-payouts");
    await waitFor(() =>
      expect(screen.getByTestId("batch-send").className).toMatch(/btn-nova/));
    expect(screen.getByTestId("run-payouts").className).not.toMatch(/btn-nova/);
  });
});
