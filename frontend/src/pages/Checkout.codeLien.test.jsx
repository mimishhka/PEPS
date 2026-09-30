// Le code porté par un lien de parrainage doit être VISIBLE à la caisse.
//
// MIREILLE, 29/09/2026 : « est-ce qu'un clic sur un lien de parrainage
// applique automatiquement le coupon ? oui, mais il doit apparaître dans le
// champ coupon, ce qui ne semble pas être le cas en ce moment ».
//
// Le code n'apparaissait qu'en cas de SUCCÈS de la validation, et l'échec est
// silencieux — à juste titre : personne n'a tapé ce code, afficher « Code
// invalide » n'aurait aucun sens. Mais la conjonction des deux laissait le
// champ vide : ni rabais, ni trace, ni recours. Le client ne pouvait pas
// deviner qu'un code existait.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Checkout from "./Checkout";
import api from "../lib/api";

const CODE = "LOLA10";

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
  resolveAssetUrl: (u) => u,
}));

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
  useNavigate: () => jest.fn(),
}));

jest.mock("../contexts/CartContext", () => ({
  useCart: () => ({
    items: [{ product_id: "p-1", variant_id: "v-1", qty: 1, name_fr: "BPC-157",
              name_en: "BPC-157", price: 64.99, price_cad: 64.99, slug: "bpc-157-5mg" }],
    subtotal: 64.99, clear: jest.fn(),
  }),
}));
jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr", t: (k) => k }) }));
jest.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
jest.mock("../contexts/SiteConfigContext", () => ({ useSiteConfig: () => ({ config: {} }) }));
// C'est tout l'objet du fichier : le lien A été cliqué, le code est là.
jest.mock("../lib/codeParrainage", () => ({ codeAffiliePourPaiement: () => "LOLA10" }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const ATTENTE = { timeout: 3000 };

/* `api.post` sert deux routes : la validation d'adresse et celle du coupon.
 * On aiguille sur l'URL, sinon la réponse de l'une passe pour celle de
 * l'autre et le test mesure autre chose que ce qu'il annonce. */
function aiguiller({ coupon }) {
  api.post.mockImplementation((url) => {
    if (String(url).startsWith("/coupons/validate")) return coupon(url);
    return Promise.resolve({
      data: { valid: true, suggestions: [], provider: "google_maps" },
    });
  });
}

const appelsCoupon = () =>
  api.post.mock.calls.filter(([url]) => String(url).startsWith("/coupons/validate"));

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.get.mockResolvedValue({ data: {} });
});

jest.setTimeout(15000);

it("LE CAS DE MIREILLE : le code reste visible même quand la validation échoue", async () => {
  // Refus plausible : sous-total minimum non atteint, code réservé à une
  // première commande, ou affilié suspendu depuis le clic.
  aiguiller({
    coupon: () => Promise.reject({ response: { data: { detail: "Invalid coupon code" } } }),
  });

  render(<Checkout />);

  // Avant le correctif, ce champ restait vide : le client payait plein tarif
  // sans jamais savoir qu'un code accompagnait son lien.
  await waitFor(() => {
    expect(screen.getByTestId("coupon-input")).toHaveValue(CODE);
  }, ATTENTE);

  // Et le bouton reste là : il peut tenter lui-même et lire, cette fois, la
  // vraie raison du refus.
  expect(screen.getByTestId("coupon-apply")).toBeEnabled();
});

it("quand la validation passe, le code s'affiche en pastille et le rabais s'applique", async () => {
  aiguiller({
    coupon: () => Promise.resolve({
      data: { code: CODE, discount_type: "percent", value: 10 },
    }),
  });

  render(<Checkout />);

  await waitFor(() => {
    expect(screen.getByTestId("coupon-remove")).toBeInTheDocument();
  }, ATTENTE);
  expect(screen.getByText(CODE)).toBeInTheDocument();
  // 10 % de 64,99 $ — le rabais est bien porté au résumé.
  expect(screen.getByTestId("summary-discount")).toBeInTheDocument();
});

it("le préremplissage ne bloque pas la seconde tentative", async () => {
  /* LA RÉGRESSION QUE CE TEST GARDE.
   *
   * Le serveur exige une identité pour certains coupons — usage par client,
   * première commande. La caisse fait donc DEUX tentatives : une à champ
   * vide, une seconde quand le courriel arrive.
   *
   * Remplir le champ au premier passage fait buter la relance sur le
   * garde-fou « le champ contient une saisie », qui existe pour ne jamais
   * écraser ce que le client a tapé. Il faut distinguer notre propre
   * préremplissage d'une vraie saisie — sans quoi le rabais est perdu
   * précisément pour les coupons qui en avaient le plus besoin.
   */
  let tentatives = 0;
  aiguiller({
    coupon: (url) => {
      tentatives += 1;
      if (!String(url).includes("email=")) {
        return Promise.reject({ response: { data: { detail: "Email required" } } });
      }
      return Promise.resolve({
        data: { code: CODE, discount_type: "percent", value: 10 },
      });
    },
  });

  render(<Checkout />);

  await waitFor(() => {
    expect(screen.getByTestId("coupon-input")).toHaveValue(CODE);
  }, ATTENTE);
  expect(tentatives).toBe(1);

  await userEvent.type(screen.getByTestId("checkout-email"), "lola@example.com");

  await waitFor(() => {
    expect(screen.getByTestId("coupon-remove")).toBeInTheDocument();
  }, ATTENTE);
  expect(appelsCoupon().length).toBeGreaterThan(1);
});

it("une saisie du client n'est jamais ecrasee par le code du lien", async () => {
  // La validation echoue : le champ reste donc a l'ecran, ce qui est la
  // situation ou la question se pose. Quand elle reussit, la pastille
  // remplace le champ et il n'y a plus rien a ecraser.
  aiguiller({
    coupon: () => Promise.reject({ response: { data: { detail: "Invalid coupon code" } } }),
  });

  render(<Checkout />);
  await waitFor(() => {
    expect(screen.getByTestId("coupon-input")).toHaveValue(CODE);
  }, ATTENTE);

  // Le client efface et tape le sien : c'est sa decision, elle tient.
  await userEvent.clear(screen.getByTestId("coupon-input"));
  await userEvent.type(screen.getByTestId("coupon-input"), "MONCODE");

  expect(screen.getByTestId("coupon-input")).toHaveValue("MONCODE");
  // Aucune relance automatique ne vient le remplacer par celui du lien.
  await new Promise((r) => setTimeout(r, 300));
  expect(screen.getByTestId("coupon-input")).toHaveValue("MONCODE");
});
