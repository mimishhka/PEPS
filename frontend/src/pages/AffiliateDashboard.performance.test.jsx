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

const brancher = (fiche, extra = {}) => {
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
        ...extra,
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
const ouvrir = async (onglet, fiche = FICHE_BAREME, extra = {}) => {
  brancher(fiche, extra);
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

// ===========================================================================
// CE QUI A ÉTÉ VU À L'ÉCRAN, SUR LE COMPTE LOLA10
//
// Mireille, 02/10/2026 : « j'ai ouvert le compte d'un affilié sur le
// navigateur, voyage sur tous les endpoint de ce compte et constate par toi
// même ce qui ne fonctionne pas en fonction de ce que l'affilié voit et
// comprend ».
//
// Chaque test ci-dessous porte un défaut relevé sur l'écran réel, pas un cas
// imaginé. Les chiffres sont les siens.
// ===========================================================================

describe("le flux d'activité", () => {
  const VERSEMENT_ACTIVITE = {
    type: "payout", at: "2026-10-01T14:39:00Z",
    label: "2026-10",                                   // l'étiquette du LOT
    periode_couverte: { debut: "2026-09", fin: "2026-09", multi: false },
    status: "paid_manual",
    amount: 500.40,                                     // CAD
    jetons: 352.77, devise: "usdt",
  };

  /* LE JOURNAL VIT DÉSORMAIS DANS PAIEMENTS. Ces tests ouvrent donc cet
     onglet : c'est là que la chronologie de l'argent se lit, à côté du
     tableau des commandes. */

  test("LE MONTANT AFFICHÉ EST CELUI EN DOLLARS CANADIENS", async () => {
    /* Le défaut le plus grave de la visite : la ligne affichait « $352.77 »
     * — la quantité d'USDT — à côté de commandes chiffrées en CAD. Elle avait
     * reçu 500,40 $. Un montant faux, plus bas que la réalité, sur sa propre
     * page. */
    await ouvrir("payments", FICHE_BAREME, { activity: [VERSEMENT_ACTIVITE] });

    expect(await screen.findByTestId("activite-montant-versement"))
      .toHaveTextContent("500.40");
  });

  test("et la quantité de jetons reste lisible, AVEC sa devise", async () => {
    // Un nombre nu, sur un écran où tout est en dollars, se lit comme un
    // second montant canadien.
    await ouvrir("payments", FICHE_BAREME, { activity: [VERSEMENT_ACTIVITE] });
    await screen.findByTestId("activite-montant-versement");

    expect(screen.getByText(/352\.77 USDT/)).toBeInTheDocument();
  });

  test("le statut est traduit, plus jamais « PAID_MANUAL »", async () => {
    await ouvrir("payments", FICHE_BAREME, { activity: [VERSEMENT_ACTIVITE] });

    const badge = await screen.findByTestId("activite-statut-versement");
    expect(badge).toHaveTextContent(/pay/i);
    expect(badge.textContent).not.toMatch(/paid_manual/i);
  });

  test("et l'étiquette dit la période COUVERTE, pas le mois du virement", async () => {
    /* « Payout 2026-10 » pour des commissions de septembre : c'est la plainte
     * d'origine, corrigée dans l'historique et oubliée ici. */
    await ouvrir("payments", FICHE_BAREME, { activity: [VERSEMENT_ACTIVITE] });
    await screen.findByTestId("activite-montant-versement");

    expect(screen.getByText(/septembre 2026/i)).toBeInTheDocument();
  });

  test("sans période couverte, l'étiquette de lot reste — mieux qu'un vide", async () => {
    await ouvrir("payments", FICHE_BAREME, {
      activity: [{ ...VERSEMENT_ACTIVITE, periode_couverte: null }] });
    await screen.findByTestId("activite-montant-versement");

    expect(screen.getByText(/octobre 2026/i)).toBeInTheDocument();
  });
});

describe("les compteurs à zéro à côté de vraies ventes", () => {
  test("zéro clic ET des commandes : on explique au lieu de laisser deviner", async () => {
    /* Vu sur LOLA10 : « Clics 0 », « Taux de conversion — », et juste à côté
     * quatre commandes pour 3 532 $. C'est exact — le code peut être saisi
     * sans passer par le lien — mais trois zéros encadrant de vraies ventes se
     * lisent comme un compteur cassé. */
    await ouvrir("performance", FICHE_BAREME, {
      insights: { current_month: { revenue: 0 }, clicks: 0,
                  conversion_rate: null, validated_orders: 2,
                  avg_order_value: 1766.21 } });

    expect(await screen.findByTestId("insights-sans-clic"))
      .toHaveTextContent(/code/i);
  });

  test("avec des clics, on se tait", async () => {
    await ouvrir("performance");
    await screen.findByTestId("affiliate-performance");

    expect(screen.queryByTestId("insights-sans-clic")).not.toBeInTheDocument();
  });

  test("zéro clic et AUCUNE commande : rien à expliquer non plus", async () => {
    // Un compte neuf n'a pas besoin d'une explication sur une contradiction
    // qui n'existe pas encore.
    await ouvrir("performance", FICHE_BAREME, {
      insights: { current_month: { revenue: 0 }, clicks: 0,
                  conversion_rate: null, validated_orders: 0,
                  avg_order_value: 0 } });
    await screen.findByTestId("affiliate-performance");

    expect(screen.queryByTestId("insights-sans-clic")).not.toBeInTheDocument();
  });
});

describe("le tableau des commandes", () => {
  test("il est dans PAIEMENTS : la preuve à côté de l'argent", async () => {
    /* Il vivait dans Performance, à un onglet de distance du montant qu'il
     * justifie : vérifier un versement demandait de changer d'écran au milieu
     * du calcul. Il s'est déplacé, avec son CSV et sa pagination. */
    await ouvrir("payments");
    await screen.findByTestId("affiliate-payments");

    expect(screen.getByText(/toutes vos commandes/i)).toBeInTheDocument();
    // Et son sous-titre dit ce qu'il contient de plus que la vignette
    // « Commandes validées », restée dans Performance.
    const entete = screen.getByText(/toutes vos commandes/i).closest("div");
    expect(entete).toHaveTextContent(/rembours/i);
    expect(entete).toHaveTextContent(/commission/i);
  });

  test("et Performance n'a plus de tableau de commandes", async () => {
    /* Performance répond à « comment je vends » : clics, conversion, panier,
     * paliers, graphique, sources, clients. La preuve des montants n'y est
     * plus. */
    await ouvrir("performance");
    await screen.findByTestId("affiliate-performance");

    expect(screen.queryByText(/toutes vos commandes/i)).not.toBeInTheDocument();
  });
});

describe("la distance jusqu'au palier suivant", () => {
  test("LE CAS DE MIREILLE : un seul chiffre, pas deux", async () => {
    /* Vu sur LOLA10 : l'aperçu annonçait « 1 468,57 $ → Silver », l'échelle de
     * Performance « 1 941,00 $ of sales to go ». Deux réponses à la même
     * question, à un onglet d'écart.
     *
     * Celle qui compte est la base du cliquet — onze mois + le mois en cours —
     * parce que c'est elle qui fait monter le taux tout de suite. */
    await ouvrir("performance", {
      ...FICHE_BAREME,
      tier: "bronze", commission_rate: 0.12,
      rolling12_revenue: 3060,
      projection_prochaine_periode: 3532.43,
    });

    /* 5 001 − 3 532,43 = 1 468,57. Et surtout : PAS 1 941,00.
       `findAllByText` : l'échelle se rend en deux variantes, étroite et
       large — les deux doivent dire le même chiffre, ce qui est justement
       le sujet de ce test. */
    expect((await screen.findAllByText(/1,468\.57/)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/1,941\.00/)).toHaveLength(0);
  });

  test("un mois en cours plus faible ne fait pas RECULER la distance", async () => {
    /* Le plus haut des deux, comme la jauge de l'aperçu : un affilié qui a
     * déjà franchi le seuil sur la fenêtre close ne doit pas lire une distance
     * plus grande parce que son mois courant démarre lentement. */
    await ouvrir("performance", {
      ...FICHE_BAREME,
      tier: "bronze", commission_rate: 0.12,
      rolling12_revenue: 4000,
      projection_prochaine_periode: 3100,
    });

    // 5 001 − 4 000 = 1 001, et non 5 001 − 3 100 = 1 901.
    expect((await screen.findAllByText(/1,001\.00/)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/1,901\.00/)).toHaveLength(0);
  });
});

describe("l'onglet Conformité", () => {
  test("DIT À QUOI IL S'EST ENGAGÉ, et quand", async () => {
    /* La fiche d'administration porte la version des conditions et sa date
     * depuis le 01/10 : c'est la première pièce qu'on sort quand un affilié
     * conteste une clause. Lui ne l'avait nulle part — une partie au contrat
     * voyait le contrat, l'autre non. Et c'est la seule page qui dit ce qui
     * peut suspendre son compte : elle doit dire sur quel texte. */
    await ouvrir("compliance", {
      ...FICHE_BAREME,
      terms_accepted_at: "2026-09-14T11:00:00+00:00",
      terms_version: "2026-08-25b",
      terms_version_required: "2026-08-25b",
      terms_ok: true,
    });

    const bloc = await screen.findByTestId("conformite-conditions");
    expect(bloc).toHaveTextContent("2026-08-25b");
    expect(bloc).toHaveTextContent(/14 sept/i);
  });

  test("UNE VERSION PERIMEE N'ARRIVE JAMAIS JUSQU'ICI", async () => {
    /* Le test qui a supprimé du code.
     *
     * On avait ajouté, dans ce bloc, un avertissement « une version plus
     * récente vous sera présentée ». Ce test montre qu'il était
     * INATTEIGNABLE : `terms_ok === false` rend l'écran d'acceptation à la
     * place de TOUT le tableau de bord — pas en surcouche, pour que rien ne
     * se referme sans avoir été lu. Personne n'atteint donc l'onglet
     * Conformité avec une version périmée.
     *
     * Il est consigné ici pour que personne ne le réécrive. */
    brancher({
      ...FICHE_BAREME,
      terms_accepted_at: "2026-09-14T11:00:00+00:00",
      terms_version: "2026-08-25b",
      terms_version_required: "2026-10-01a",
      terms_ok: false,
    });
    render(<AffiliateDashboard />);

    // Pas d'onglets du tout : l'écran d'acceptation a pris la page.
    await waitFor(() =>
      expect(screen.queryByTestId("affiliate-tab-compliance")).not.toBeInTheDocument());
  });

  test("et sans acceptation enregistrée, on n'invente pas une date", async () => {
    /* Un dossier ancien peut ne rien porter. Afficher « accepté le — »
     * vaudrait moins que de se taire. */
    await ouvrir("compliance", FICHE_BAREME);
    await screen.findByTestId("affiliate-compliance");

    expect(screen.queryByTestId("conformite-conditions")).not.toBeInTheDocument();
  });
});
