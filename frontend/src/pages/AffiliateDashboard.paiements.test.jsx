// L'onglet Paiements : son ordre, ce qu'il nomme, et ce qu'il laisse voir.
//
// MIREILLE, 01/10/2026 :
//
//   « la page performance le payout indique le mois d'octobre alors que c'est
//     pour les commissions du mois de septembre »
//   « on ne devrait pas voir comment cela a été payé » — précisé : « je parle
//     de la méthode, manuel ou autre, j'ai vu que c'était indiqué manuel »
//   « Paid avec référence le mois dernier [...] devrait se retrouver en haut
//     de page. Suivi du next payout. Ensuite le all time avec des filtres. »
//   « la période doit représenter la période payée - il faudrait la date du
//     paiement quelque part et aussi il faudrait que l'affiliée puisse
//     constater quels sont les commandes représente ce paiement incluant bien
//     sûr les commandes remboursées ou annulées »
//   « assure-toi que tout fonctionne aussi sur mobile »
//
// Cet onglet n'avait aucun test.

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

let mockFiche = null;
jest.mock("../hooks/useAffiliate", () => ({
  __esModule: true,
  default: () => ({ affiliate: mockFiche, loading: false, error: null, mutate: jest.fn() }),
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

const FICHE = {
  code: "LOLA10", status: "active", terms_ok: true, tour_done: true,
  tier: "bronze", commission_rate: 0.12, tier_agreement: false,
  approval_hold_days: 7, payout_min_cad: 50, coupon_percent: 10,
  cumulative_revenue: 10404.17, rolling12_revenue: 7200, validated_orders: 37,
  pending_commission: 118, approved_commission: 310.5,
  paid_commission: 820, reversed_commission: 0,
  balance_cad: 310.5,
  payout_cycle: { period: "2026-09", current_period: "2026-10",
                  due_now: 310.5, current_cycle: 118, due_by: "2026-10-06T04:00:00Z",
                  days_left: 5, overdue: false },
};

/* L'ETIQUETTE DE RUN DIT OCTOBRE, LES COMMISSIONS SONT D'AOUT ET SEPTEMBRE.
 * C'est exactement le cas que Mireille a vu, et le serveur renvoie desormais
 * les deux : `period` pour retrouver le lot, `periode_couverte` pour le dire. */
const VERSEMENT_PAYE = {
  id: "pay-1", period: "2026-10",
  periode_couverte: { debut: "2026-08", fin: "2026-09", mois: ["2026-08", "2026-09"], multi: true },
  amount_cad: 142.5, amount: 104.1, currency: "usdt",
  fx_rate_cad_to_usd: 0.7308, fx_source: "bank_of_canada",
  status: "paid_manual", reference: "0xabc123def456",
  paid_at: "2026-10-03T14:00:00Z",
};

const DETAIL = {
  payout: VERSEMENT_PAYE,
  lines: [
    { id: "r-1", order_number: "FN-1001", base_amount: 500, commission_amount: 60,
      status: "paid", approved_at: "2026-08-20T12:00:00Z",
      created_at: "2026-08-13T12:00:00Z" },
    { id: "r-2", order_number: "FN-1002", base_amount: 687.5, commission_amount: 82.5,
      status: "reversed", approved_at: "2026-09-05T12:00:00Z",
      created_at: "2026-08-29T12:00:00Z",
      reversed_at: "2026-10-18T09:00:00Z", reversed_after_payout: true,
      clawback_pending: true },
  ],
  lines_count: 2, lines_sum_cad: 142.5, payout_amount_cad: 142.5, difference: 0,
};

const brancher = ({ versements = [VERSEMENT_PAYE], dernier = VERSEMENT_PAYE,
                    detail = DETAIL } = {}) => {
  mockFiche = FICHE;
  api.get.mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes("/affiliate/payouts/")) return { data: detail };
    if (u.includes("/affiliate/dashboard")) {
      return { data: {
        referrals: { items: [], total: 0 },
        payouts: { items: versements, total: versements.length,
                   dernier_paye: dernier },
        insights: { current_month: { revenue: 0 } },
        clicks_sources: null, activity: [],
        customers: { customers: [] },
        performance: { series: [
          { month: "2026-09", revenue: 1100, commission: 110, orders: 11, reversed: 0 },
          { month: "2026-10", revenue: 1200, commission: 120, orders: 12, reversed: 0 },
        ] },
      } };
    }
    if (u.includes("/affiliate/top-products")) return { data: { items: [] } };
    if (u.includes("/affiliate/referrals")) return { data: { items: [] } };
    if (u.includes("/affiliate/payouts")) return { data: versements };
    if (u.includes("/affiliate/tickets")) return { data: [] };
    if (u.includes("/products")) return { data: [] };
    return { data: {} };
  });
  api.post.mockResolvedValue({ data: { ok: true } });
};

const ouvrir = async (options) => {
  brancher(options);
  render(<AffiliateDashboard />);
  await userEvent.click(await screen.findByTestId("affiliate-tab-payments"));
  return screen.findByTestId("affiliate-payments");
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

jest.setTimeout(30000);

/** Position d'un testid dans le document, pour comparer un ordre. */
const rang = (testId) => {
  const tous = Array.from(document.querySelectorAll("[data-testid]"));
  return tous.indexOf(screen.getByTestId(testId));
};

// ===========================================================================
// L'ORDRE QU'ELLE A DICTE
// ===========================================================================

describe("l'ordre des blocs", () => {
  test("LE CAS DE MIREILLE : payé, puis prochain, puis le cumul, puis l'historique", async () => {
    /* « Paid avec référence le mois dernier devrait se retrouver en haut de
     * page. Suivi du next payout. Ensuite le all time avec des filtres. »
     *
     * C'est l'ordre des questions qu'on se pose : « j'ai été payé ? », « et
     * la prochaine fois ? », « combien en tout ? ». Le cumul était en tête et
     * le fait accompli n'existait qu'en bas, dans une ligne de tableau. */
    await ouvrir();

    expect(rang("dernier-versement")).toBeLessThan(rang("cycle-versement"));
    expect(rang("cycle-versement")).toBeLessThan(rang("depuis-le-debut"));
    expect(rang("depuis-le-debut")).toBeLessThan(rang("historique-cartes"));
  });

  test("les trois cartes qui doublaient le cumul sont parties", async () => {
    /* Elles affichaient `pending_commission`, `approved_commission` et
     * `paid_commission` : exactement les trois montants du bloc Depuis le
     * début, sans leur proportion ni leur sens. Deux lectures des mêmes
     * chiffres sur un même écran, c'est ce qui fait qu'on finit par n'en
     * croire aucune. */
    await ouvrir();

    /* « Approuvé » était le libellé de la carte du milieu, et ce mot
     * n'apparaît nulle part ailleurs sur cet onglet : le cycle dit
     * « Validé », le bloc du cumul dit « à verser ». Son absence est donc le
     * signe propre que les trois cartes sont parties.
     *
     * CE QUE JE N'ASSERTE PAS : l'unicité du montant 310,50 $. Il apparaît
     * légitimement trois fois — le cycle, le prochain versement et la légende
     * du cumul — parce que ces trois blocs disent trois choses différentes du
     * même argent. C'était ma première rédaction, et elle était fausse. */
    expect(screen.getByTestId("affiliate-payments")).not.toHaveTextContent(/Approuvé/);
  });
});

// ===========================================================================
// LE DERNIER VERSEMENT
// ===========================================================================

describe("le dernier versement payé", () => {
  test("il porte le montant, la DATE DU PAIEMENT et la référence", async () => {
    // `paid_at` arrivait du serveur depuis toujours et aucun écran ne le
    // lisait — c'est pourtant la date qu'on cherche pour comparer avec son
    // portefeuille.
    await ouvrir();

    const bloc = screen.getByTestId("dernier-versement");
    expect(screen.getByTestId("dernier-montant")).toHaveTextContent("142.50");
    expect(screen.getByTestId("dernier-date")).toHaveTextContent("2026");
    expect(bloc).toHaveTextContent("0xabc123def456");
    expect(screen.getByTestId("dernier-recu")).toHaveTextContent("104.10 USDT");
  });

  test("LA PÉRIODE EST CELLE COUVERTE, pas l'étiquette de run", async () => {
    /* Le défaut qu'elle a vu : l'étiquette dit « 2026-10 » parce que c'est le
     * mois du run, alors que les commissions sont d'août et de septembre. */
    await ouvrir();

    const periode = screen.getByTestId("dernier-periode");
    expect(periode).toHaveTextContent(/septembre/i);
    expect(periode).not.toHaveTextContent(/octobre/i);
    expect(periode).not.toHaveTextContent("2026-10");
  });

  test("il vient du serveur, et non de la page affichée", async () => {
    /* Le déduire de la page 1 serait faux dès que dix relevés non payés
     * s'empilent. Ici la page ne contient QUE des relevés non payés, et le
     * bloc affiche quand même le bon versement. */
    await ouvrir({
      versements: [{ ...VERSEMENT_PAYE, id: "pay-9", status: "ready",
                     paid_at: null, reference: null }],
      dernier: VERSEMENT_PAYE,
    });

    expect(screen.getByTestId("dernier-montant")).toHaveTextContent("142.50");
  });

  test("avant le premier versement, le bloc n'existe pas", async () => {
    /* Une mauvaise nouvelle en tête de page, alors que l'écran a mieux à dire
     * juste en dessous : le cycle qui vient. */
    await ouvrir({ versements: [], dernier: null });

    expect(screen.queryByTestId("dernier-versement")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// L'HISTORIQUE
// ===========================================================================

describe("l'historique", () => {
  test("la colonne de période affiche la période COUVERTE", async () => {
    await ouvrir();

    const cellule = screen.getByTestId("historique-periode-pay-1");
    expect(cellule).toHaveTextContent(/août/i);
    expect(cellule).toHaveTextContent(/septembre/i);
    // Jamais la chaîne brute.
    expect(cellule).not.toHaveTextContent("2026-10");
  });

  test("et la DATE DU PAIEMENT a sa colonne", async () => {
    await ouvrir();
    expect(screen.getByTestId("historique-paye-pay-1")).toHaveTextContent("2026");
  });

  test("LE STATUT NE DIT JAMAIS « MANUEL »", async () => {
    /* « je parle de la méthode, manuel ou autre, j'ai vu que c'était indiqué
     * manuel ». Comment le virement a été exécuté est de la plomberie ; pour
     * l'affilié, `paid` et `paid_manual` sont le même fait. */
    await ouvrir();

    for (const pastille of screen.getAllByTestId("payout-status")) {
      expect(pastille).not.toHaveTextContent(/manuel/i);
      expect(pastille).not.toHaveTextContent(/manual/i);
    }
    expect(screen.getAllByTestId("payout-status")[0]).toHaveTextContent("Payé");
  });

  test("ni « en file », ni « traitement », ni « envoi en cours »", async () => {
    await ouvrir({
      versements: [{ ...VERSEMENT_PAYE, id: "pay-2", status: "queued_manual" }],
      dernier: null,
    });

    const pastille = screen.getAllByTestId("payout-status")[0];
    expect(pastille).not.toHaveTextContent(/manuel/i);
    expect(pastille).toHaveTextContent(/en cours/i);
  });

  test("UN VERSEMENT EN VÉRIFICATION NE S'AFFICHE PLUS « PRÊT »", async () => {
    /* LE DÉFAUT LE PLUS GRAVE DES DEUX. `review` et `creating` sont écrits en
     * base mais ne figuraient pas dans la table : ils tombaient sur
     * `map.ready`. Un versement retenu par un humain annonçait donc « Prêt ».
     * Ce n'était pas de la plomberie qui fuyait — c'était un blocage caché. */
    await ouvrir({
      versements: [{ ...VERSEMENT_PAYE, id: "pay-3", status: "review" }],
      dernier: null,
    });

    const pastille = screen.getAllByTestId("payout-status")[0];
    expect(pastille).not.toHaveTextContent(/prêt/i);
    expect(pastille).toHaveTextContent(/vérification/i);
  });

  test("un statut INCONNU ne s'invente pas un état précis", async () => {
    await ouvrir({
      versements: [{ ...VERSEMENT_PAYE, id: "pay-4", status: "un_etat_futur" }],
      dernier: null,
    });

    const pastille = screen.getAllByTestId("payout-status")[0];
    expect(pastille).not.toHaveTextContent(/prêt/i);
    expect(pastille).toHaveTextContent(/en cours/i);
  });
});

// ===========================================================================
// LE DETAIL : QUELLES COMMANDES
// ===========================================================================

describe("le détail d'un versement", () => {
  test("LE CAS DE MIREILLE : la commande remboursée est là, avec sa date", async () => {
    /* « incluant bien sûr les commandes remboursées ou annulées ». C'est la
     * raison la plus fréquente d'un écart entre ce qu'on avait calculé et ce
     * qu'on a reçu — et elle n'était visible nulle part. */
    await ouvrir();
    await userEvent.click(screen.getByTestId("detail-bouton-table-pay-1"));

    await screen.findByTestId("detail-lignes");
    expect(screen.getByTestId("detail-ligne-FN-1001")).toBeInTheDocument();

    const reprise = screen.getByTestId("detail-reprise-FN-1002");
    expect(reprise).toHaveTextContent(/remboursée/i);
    expect(reprise).toHaveTextContent(/18/);          // le 18 octobre
    // Et le fait que l'argent était DÉJÀ parti, qui est une autre histoire
    // qu'une commission jamais versée.
    expect(reprise).toHaveTextContent(/déjà été versé/i);
  });

  test("le texte n'accuse pas : la commission suit la vente", async () => {
    // Même décision que le bloc Depuis le début. Personne n'a rien retiré à
    // l'affilié : le client a été remboursé, donc la vente n'a pas eu lieu.
    await ouvrir();
    await userEvent.click(screen.getByTestId("detail-bouton-table-pay-1"));
    await screen.findByTestId("detail-lignes");

    const reprise = screen.getByTestId("detail-reprise-FN-1002");
    expect(reprise).not.toHaveTextContent(/repris/i);
    expect(reprise).toHaveTextContent(/ne compte plus/i);
  });

  test("le total de contrôle est affiché", async () => {
    // Un versement ne s'explique pas par un montant isolé mais par la somme
    // des commissions qu'il couvre.
    await ouvrir();
    await userEvent.click(screen.getByTestId("detail-bouton-table-pay-1"));

    const total = await screen.findByTestId("detail-total");
    expect(total).toHaveTextContent("2 commandes");
    expect(total).toHaveTextContent("142.50");
    // L'écart vaut zéro, donc rien à signaler.
    expect(screen.queryByTestId("detail-ecart")).not.toBeInTheDocument();
  });

  test("un écart avec le montant versé est MONTRÉ, pas tu", async () => {
    await ouvrir({ detail: { ...DETAIL, lines_sum_cad: 130, difference: 12.5 } });
    await userEvent.click(screen.getByTestId("detail-bouton-table-pay-1"));

    expect(await screen.findByTestId("detail-ecart")).toHaveTextContent("12.50");
  });

  test("Échap ferme la fenêtre", async () => {
    await ouvrir();
    await userEvent.click(screen.getByTestId("detail-bouton-table-pay-1"));
    await screen.findByTestId("detail-versement");

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByTestId("detail-versement")).not.toBeInTheDocument());
  });

  test("le bouton de fermeture aussi", async () => {
    await ouvrir();
    await userEvent.click(screen.getByTestId("detail-bouton-table-pay-1"));
    await userEvent.click(await screen.findByTestId("detail-fermer"));

    await waitFor(() =>
      expect(screen.queryByTestId("detail-versement")).not.toBeInTheDocument());
  });

  test("elle n'est PAS montée avant qu'on l'ouvre", async () => {
    // Elle charge son contenu à l'ouverture : la garder en vie invisible
    // ferait une requête par versement affiché.
    await ouvrir();

    expect(screen.queryByTestId("detail-versement")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith(
      expect.stringContaining("/affiliate/payouts/pay-1"));
  });

  test("un versement sans lignes le DIT, au lieu d'une liste vide", async () => {
    /* Versement ancien dont les commissions ne sont plus rattachées. Une
     * liste vide se lirait comme « ce versement ne couvrait rien ». */
    await ouvrir({ detail: { ...DETAIL, lines: [], lines_count: 0 } });
    await userEvent.click(screen.getByTestId("detail-bouton-table-pay-1"));

    expect(await screen.findByTestId("detail-vide")).toBeInTheDocument();
  });

  test("une erreur de chargement laisse de quoi réessayer", async () => {
    brancher();
    api.get.mockImplementation(async (url) => {
      if (String(url).includes("/affiliate/payouts/")) {
        throw Object.assign(new Error("boom"), { response: { data: { detail: "boom" } } });
      }
      if (String(url).includes("/affiliate/dashboard")) {
        return { data: {
          referrals: { items: [], total: 0 },
          payouts: { items: [VERSEMENT_PAYE], total: 1, dernier_paye: VERSEMENT_PAYE },
          insights: { current_month: { revenue: 0 } },
          clicks_sources: null, activity: [], customers: { customers: [] },
          performance: { series: [] },
        } };
      }
      if (String(url).includes("/affiliate/tickets")) return { data: [] };
      return { data: {} };
    });
    render(<AffiliateDashboard />);
    await userEvent.click(await screen.findByTestId("affiliate-tab-payments"));
    await userEvent.click(screen.getByTestId("detail-bouton-table-pay-1"));

    expect(await screen.findByTestId("detail-erreur")).toBeInTheDocument();
  });
});

// ===========================================================================
// MOBILE
// ===========================================================================

describe("sur téléphone", () => {
  test("l'historique a un rendu en CARTES, et la table ne sert qu'au-delà de `sm`", async () => {
    /* CE QUE CE TEST VAUT, ET CE QU'IL NE VAUT PAS. jsdom n'applique aucune
     * requête média : les deux rendus sont dans le document, et on ne peut
     * donc vérifier que l'INTENTION — quelle classe porte quel bloc. Le rendu
     * réel sur un téléphone demande un vrai navigateur.
     *
     * Ce qui est tout de même tenu ici : qu'il EXISTE deux rendus, que le bon
     * porte `sm:hidden` et l'autre `hidden sm:block`, et qu'une inversion de
     * ces deux classes — qui laisserait les téléphones sur la table à sept
     * colonnes — fasse tomber la suite. */
    await ouvrir();

    const cartes = screen.getByTestId("historique-cartes");
    expect(cartes.className).toContain("sm:hidden");

    const table = cartes.parentElement.querySelector(".hidden.sm\\:block");
    expect(table).toBeTruthy();
    expect(table.querySelector("table")).toBeTruthy();
  });

  test("chaque carte porte la période couverte, le statut et un bouton de détail", async () => {
    await ouvrir();

    const cartes = screen.getByTestId("historique-cartes");
    expect(cartes).toHaveTextContent(/septembre/i);
    expect(cartes).toHaveTextContent("142.50");
    expect(screen.getByTestId("detail-bouton-pay-1")).toBeInTheDocument();
  });

  test("le bouton des cartes ouvre la même fenêtre", async () => {
    await ouvrir();
    await userEvent.click(screen.getByTestId("detail-bouton-pay-1"));

    expect(await screen.findByTestId("detail-lignes")).toBeInTheDocument();
  });

  test("les cibles tactiles font 44 px et ne double-tapent pas en zoom", async () => {
    /* `h-11` vaut 44 px — la cible minimale au doigt. `touch-action:
     * manipulation` supprime le délai de 300 ms que le navigateur garde pour
     * voir venir un double-tap. */
    await ouvrir();

    const bouton = screen.getByTestId("detail-bouton-pay-1");
    expect(bouton.className).toContain("h-11");
    expect(bouton.style.touchAction).toBe("manipulation");
  });

  test("la référence peut se couper et se sélectionne d'un appui", async () => {
    // Un hash de soixante-six caractères déborde d'un écran de 375 px, et
    // `select-all` évite d'avoir à le sélectionner au doigt caractère par
    // caractère pour le copier.
    await ouvrir();

    const code = screen.getByTestId("historique-cartes").querySelector("code");
    expect(code.className).toContain("break-all");
    expect(code.className).toContain("select-all");
  });
});
