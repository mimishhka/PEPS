// Définir son mot de passe depuis le tableau de bord affilié.
//
// MIREILLE, 01/10/2026 : « pour établir la première fois le mot de passe ça
// demande l'ancien mot de passe — chose impossible lorsque la personne n'a pas
// créé son compte avec un mot de passe ».
//
// Un affilié est créé SANS mot de passe : il active son compte par invitation,
// puis se connecte par lien. C'est donc le parcours où le défaut se rencontre
// le plus sûrement — et il était bloqué exactement comme celui du compte
// client, pour la même raison : `_public_user_payload` retirait le drapeau
// `passwordless` de la fiche envoyée au navigateur.
//
// Cet écran-ci n'a jamais eu tort. Il masque le champ, change l'explication et
// omet `current_password` de la requête. Ce test fige ce comportement et, avec
// le test backend, tient les deux bouts du contrat.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AffiliateDashboard from "./AffiliateDashboard";
import api from "../lib/api";

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
  formatApiError: (e) => String(e),
  resolveAssetUrl: (u) => u,
}));

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ search: "", pathname: "/affiliate" }),
}));

let mockUser = null;
jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr", t: (k) => k }) }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("../hooks/useAffiliate", () => ({
  __esModule: true,
  default: () => ({
    affiliate: { code: "LOLA10", status: "active", terms_ok: true, tour_done: true,
                 tier: "bronze", commission_rate: 0.12, approval_hold_days: 7,
                 payout_min_cad: 50 },
    loading: false, error: null, mutate: jest.fn(),
  }),
}));
jest.mock("../hooks/useChartColors", () => ({ __esModule: true, default: () => ({}) }));
jest.mock("../components/ThemeToggle", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/ClocheAffilie", () => ({ __esModule: true, default: () => null }));
jest.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));
jest.mock("recharts", () => new Proxy({}, {
  get: (c, nom) => (nom === "__esModule" ? true : ({ children }) => <div>{children}</div>),
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (c, nom) => (nom === "__esModule" ? true : () => null),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

beforeAll(() => {
  window.Element.prototype.scrollIntoView = jest.fn();
});

const ouvrirReglages = async (user) => {
  mockUser = user;
  api.get.mockImplementation(async (url) => {
    if (String(url).includes("/affiliate/dashboard")) {
      return { data: {
        referrals: { items: [], total: 0 }, payouts: { items: [], total: 0 },
        insights: { current_month: { revenue: 0 } }, clicks_sources: null,
        activity: [], customers: { customers: [] }, performance: { series: [] },
      } };
    }
    if (String(url).includes("/affiliate/tickets")) return { data: [] };
    return { data: {} };
  });
  api.put.mockResolvedValue({ data: { ok: true } });
  api.post.mockResolvedValue({ data: { ok: true } });
  render(<AffiliateDashboard />);
  await userEvent.click(await screen.findByTestId("affiliate-tab-settings"));
  return screen.findByTestId("affiliate-pw-new");
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockUser = null;
});

jest.setTimeout(30000);

describe("un affilié qui n'a jamais eu de mot de passe", () => {
  test("LE CAS DE MIREILLE : aucun ancien mot de passe n'est demandé", async () => {
    /* Un affilié est créé passwordless : il active par invitation puis se
     * connecte par lien. Lui réclamer un ancien mot de passe lui demande une
     * chose qui n'a jamais existé. */
    await ouvrirReglages({ id: "u-1", email: "lola@example.com", passwordless: true });

    expect(screen.queryByTestId("affiliate-pw-current")).not.toBeInTheDocument();
  });

  test("et l'écran explique pourquoi", async () => {
    await ouvrirReglages({ id: "u-1", email: "lola@example.com", passwordless: true });

    expect(screen.getByTestId("affiliate-settings"))
      .toHaveTextContent(/activé par invitation, sans mot de passe/i);
  });

  test("la requête n'emporte PAS de `current_password`", async () => {
    await ouvrirReglages({ id: "u-1", email: "lola@example.com", passwordless: true });

    await userEvent.type(screen.getByTestId("affiliate-pw-new"), "nouveau-mot-de-passe");
    await userEvent.type(screen.getByTestId("affiliate-pw-confirm"), "nouveau-mot-de-passe");
    await userEvent.click(screen.getByTestId("affiliate-save-password"));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/affiliate/password", { new_password: "nouveau-mot-de-passe" }));
  });
});

describe("un affilié qui en a déjà un", () => {
  test("l'ancien reste demandé et part dans la requête", async () => {
    // La correction ne doit pas désarmer la vérification pour les comptes qui
    // ont bien un mot de passe.
    await ouvrirReglages({ id: "u-1", email: "lola@example.com", passwordless: false });

    expect(screen.getByTestId("affiliate-pw-current")).toBeInTheDocument();

    await userEvent.type(screen.getByTestId("affiliate-pw-current"), "ancien");
    await userEvent.type(screen.getByTestId("affiliate-pw-new"), "nouveau-mot-de-passe");
    await userEvent.type(screen.getByTestId("affiliate-pw-confirm"), "nouveau-mot-de-passe");
    await userEvent.click(screen.getByTestId("affiliate-save-password"));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/affiliate/password",
      { new_password: "nouveau-mot-de-passe", current_password: "ancien" }));
  });
});
