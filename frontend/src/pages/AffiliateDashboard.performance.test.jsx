// L'onglet Performance : ce qu'il nomme, et à qui il parle.
//
// MIREILLE, 01/10/2026, deux constats de suite :
//
//   « Performance pour un affilié qui a une entente ne fonctionne pas. Il y a
//     des choses qui ne correspondent pas à leur situation. »
//   « C'est revenus ou des ventes ? » — en lisant « Cumulative validated
//     revenue ».
//
// LE MOT. `cumulative_revenue` portait cinq noms dans l'interface affilié :
// « Revenu validé cumulé », « REVENU VALIDÉ », « CA validé », « chiffre
// d'affaires validé », et « ventes validées » dans le bloc Depuis le début.
// Un même nombre, cinq appellations, dont une dangereuse : le revenu de
// l'affilié, c'est sa COMMISSION. Lire « Revenu validé cumulé : 10 404 $ » à
// côté d'une commission de 1 248 $ laisse ouverte la question de savoir lequel
// des deux est son argent — et « revenue » en anglais est pire encore.
//
// L'ENTENTE. Deux affirmations étaient fausses pour un taux négocié : le
// sous-titre « fixe votre palier » sur la carte des douze mois, et la bulle de
// la visite guidée qui pointe ces mêmes cartes en promettant une progression
// de palier. Son taux ne progresse pas : il est fixé par contrat.
//
// Aucun test ne couvrait cet onglet.

import { render, screen } from "@testing-library/react";
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

jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-1", email: "lola@example.com", name: "Lola" } }),
}));
jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr", t: (k) => k }) }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));

/* La fiche vient de ce crochet — `/affiliate/me`, qui termine par
 * `out.update(metrics)` et porte donc les ventes ET les commissions. */
let mockFiche = null;
jest.mock("../hooks/useAffiliate", () => ({
  __esModule: true,
  default: () => ({ affiliate: mockFiche, loading: false, error: null, mutate: jest.fn() }),
}));
jest.mock("../hooks/useChartColors", () => ({ __esModule: true, default: () => ({}) }));
jest.mock("../components/ThemeToggle", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/ClocheAffilie", () => ({ __esModule: true, default: () => null }));
jest.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));
// Recharts mesure son conteneur : sans dimensions en jsdom il ne rend rien.
// Les enfants sont rendus pour que le nom des courbes reste observable.
jest.mock("recharts", () => new Proxy({}, {
  get: (c, nom) => (nom === "__esModule" ? true : ({ children, name }) => (
    <div>{name}{children}</div>
  )),
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (c, nom) => (nom === "__esModule" ? true : () => null),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

beforeAll(() => {
  window.Element.prototype.scrollIntoView = jest.fn();
});

/* `tour_done: true` : la visite s'ouvre toute seule au bout de 600 ms et son
 * voile intercepte les clics. Ce fichier teste le contenu, pas la visite. */
const FICHE_BAREME = {
  code: "LOLA10", status: "active", terms_ok: true, tour_done: true,
  tier: "bronze", commission_rate: 0.12, tier_agreement: false,
  approval_hold_days: 7, payout_min_cad: 50,
  cumulative_revenue: 10404.17, rolling12_revenue: 7200,
  // `tiers` et `coupon_percent` VIENNENT DU SERVEUR (_affiliate_public les
  // expose pour que l'echelle ne soit jamais ecrite en dur cote interface).
  // Sans eux, TierLadder sort sur `if (!tiers.length) return null` — et le
  // test « l'echelle reste masquee sous entente » passait a VIDE, puisque
  // l'echelle ne s'affichait pour personne. C'est le test inverse, au
  // bareme, qui l'a revele.
  coupon_percent: 10,
  tiers: [
    { name: "bronze", rate: 0.10, floor: 0, ceil: 5000 },
    { name: "argent", rate: 0.14, floor: 5001, ceil: 15000 },
    { name: "or", rate: 0.17, floor: 15001, ceil: 40000 },
    { name: "diamond", rate: 0.20, floor: 40001, ceil: null },
  ],
  validated_orders: 37,
  pending_commission: 118, approved_commission: 310.5,
  paid_commission: 820, reversed_commission: 0,
  balance_cad: 310.5,
};

const FICHE_ENTENTE = {
  ...FICHE_BAREME,
  tier: "diamond", commission_rate: 0.2,
  tier_agreement: true, manual_tier: "diamond",
};

const CLIENT = {
  id: "c-1", email: "a•••@example.com", has_account: true,
  bound_at: "2026-05-02T12:00:00Z", source: "code",
  orders_count: 4, revenue_validated: 820, commission_total: 98.4,
};

const brancher = (fiche) => {
  mockFiche = fiche;
  api.get.mockImplementation(async (url) => {
    if (String(url).includes("/affiliate/dashboard")) {
      return { data: {
        referrals: { items: [], total: 0 },
        payouts: { items: [], total: 0 },
        insights: { current_month: { revenue: 0 }, clicks: 310,
                    conversion_rate: 0.041, validated_orders: 37,
                    avg_order_value: 281.2 },
        clicks_sources: null, activity: [],
        customers: { customers: [CLIENT] },
        performance: { series: [{ month: "2026-09", revenue: 900, commission: 108, reversed: 0 }] },
      } };
    }
    if (String(url).includes("/affiliate/top-products")) return { data: { items: [] } };
    if (String(url).includes("/affiliate/referrals")) return { data: { items: [] } };
    if (String(url).includes("/affiliate/payouts")) return { data: { items: [] } };
    if (String(url).includes("/affiliate/tickets")) return { data: [] };
    if (String(url).includes("/products")) return { data: [] };
    return { data: {} };
  });
  api.post.mockResolvedValue({ data: { ok: true } });
};

/** Rend le tableau de bord et ouvre un onglet. */
const ouvrir = async (onglet, fiche = FICHE_BAREME) => {
  brancher(fiche);
  render(<AffiliateDashboard />);
  await userEvent.click(await screen.findByTestId(`affiliate-tab-${onglet}`));
  return screen.findByTestId(`affiliate-${onglet === "payments" ? "payments" : onglet}`);
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  brancher(FICHE_BAREME);
});

jest.setTimeout(30000);

// ===========================================================================
// LE MOT : DES VENTES, PAS UN REVENU
// ===========================================================================

describe("ce que les cartes nomment", () => {
  test("LE CAS DE MIREILLE : la carte cumulée dit « ventes », jamais « revenu »", async () => {
    /* Le revenu de l'affilié, c'est sa commission. Ce nombre-ci est le
     * chiffre d'affaires qu'il a APPORTÉ : sous-total produits, remise
     * déduite, hors port et taxes. « Revenu » est le mot de l'entreprise, et
     * il avait fui dans l'écran du partenaire. */
    await ouvrir("performance");

    const cartes = screen.getByTestId("affiliate-kpis");
    expect(cartes).toHaveTextContent(/ventes validées cumulées/i);
    expect(cartes).not.toHaveTextContent(/revenu/i);
    expect(cartes).toHaveTextContent("10,404.17");
  });

  test("le graphe non plus", async () => {
    await ouvrir("performance");

    expect(screen.getByText(/VENTES VALIDÉES : 12 DERNIERS MOIS/i)).toBeInTheDocument();
    expect(screen.queryByText(/REVENU VALIDÉ : 12 DERNIERS MOIS/i)).not.toBeInTheDocument();
    // La courbe s'appelait « CA validé » : du jargon, et un troisième mot
    // pour le même nombre.
    expect(screen.queryByText("CA validé")).not.toBeInTheDocument();
  });

  test("ni le tableau des clients apportés", async () => {
    await ouvrir("performance");

    const tableau = screen.getByTestId("attached-customers-table");
    expect(tableau).toHaveTextContent("Ventes");
    expect(tableau).not.toHaveTextContent(/CA validé/i);
  });

  test("LE MÊME CHAMP PORTE LE MÊME NOM DANS LES DEUX ONGLETS", async () => {
    /* `cumulative_revenue` s'affiche dans Performance ET dans le bloc Depuis
     * le début, onglet Paiements. Deux noms pour un nombre, c'est ce qui fait
     * qu'on cesse de croire les chiffres. */
    await ouvrir("payments");

    const pied = screen.getByTestId("depuis-ventes");
    expect(pied).toHaveTextContent(/ventes validées/i);
    expect(pied).toHaveTextContent("10,404.17");
    expect(pied).not.toHaveTextContent(/revenu/i);
  });
});

// ===========================================================================
// UN AFFILIÉ SOUS ENTENTE
// ===========================================================================

describe("un affilié sous entente, dans Performance", () => {
  test("LE CAS DE MIREILLE : la carte des douze mois ne promet aucun palier", async () => {
    /* « fixe votre palier » est faux quand le taux vient d'une entente. Le
     * chiffre reste utile — c'est l'activité de l'année — mais on ne lui
     * prête pas un effet qu'il n'a pas. */
    await ouvrir("performance", FICHE_ENTENTE);

    const cartes = screen.getByTestId("affiliate-kpis");
    expect(cartes).not.toHaveTextContent(/fixe votre palier/i);
    expect(cartes).toHaveTextContent(/douze mois clos/i);
    // Le chiffre lui-même ne disparaît pas : le masquer lui retirerait une
    // mesure qui le concerne.
    expect(cartes).toHaveTextContent("7,200.00");
  });

  test("au barème, elle l'annonce — c'est vrai dans ce cas", async () => {
    await ouvrir("performance", FICHE_BAREME);

    expect(screen.getByTestId("affiliate-kpis")).toHaveTextContent(/fixe votre palier/i);
  });

  test("l'échelle des paliers reste masquée", async () => {
    /* Déjà le cas, et sans filet jusqu'ici. Montrer une échelle qu'on ne
     * gravit pas serait une fausse promesse — et révélerait au passage qu'un
     * autre régime existe. */
    await ouvrir("performance", FICHE_ENTENTE);
    expect(screen.queryByTestId("tier-ladder")).not.toBeInTheDocument();
  });

  test("au barème, l'échelle est là", async () => {
    await ouvrir("performance", FICHE_BAREME);
    expect(screen.getByTestId("tier-ladder")).toBeInTheDocument();
  });

  test("le reste de l'onglet lui est servi normalement", async () => {
    // Masquer ce qui ne le concerne pas ne doit pas l'amputer du reste.
    await ouvrir("performance", FICHE_ENTENTE);

    expect(screen.getByTestId("affiliate-kpis")).toBeInTheDocument();
    expect(screen.getByTestId("attached-customers-table")).toBeInTheDocument();
    expect(screen.getByText(/VENTES VALIDÉES : 12 DERNIERS MOIS/i)).toBeInTheDocument();
  });
});
