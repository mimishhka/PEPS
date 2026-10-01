// La visite guidée, parcourue en entier — barème ET entente négociée.
//
// MIREILLE, 01/10/2026 : « assure-toi que la visite guidée fonctionne bien
// pour les affiliés, que ce soit ceux qui commencent avec le taux de base que
// ceux qui ont une entente. Aussi assure-toi que ça fonctionne tout aussi
// bien sur mobile ».
//
// La visite traverse SIX onglets et pointe dix zones. Chaque étape dépend
// d'une cible présente dans le DOM : si l'une disparaît — parce que la mise
// en page change, parce qu'un bloc ne s'affiche qu'avec des ventes, parce
// qu'une entente masque le barème — l'étape est sautée en silence.
//
// Sautée en silence, c'est le cas BÉNIN. Le cas grave est la dernière étape :
// si SA cible manque, le composant ne peut ni avancer ni s'afficher, `onClose`
// n'est jamais appelé, la visite n'est jamais marquée comme donnée — et elle
// revient à chaque connexion. Ces tests existent surtout pour celui-là.
//
// Aucun test ne couvrait ce composant.

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
/* LA FICHE VIENT DE CE CROCHET, pas de /affiliate/dashboard — lequel ne rend
 * que les sections (parrainages, versements, performance). C'est `affiliate`
 * qui porte le palier, le taux et le drapeau d'entente, donc tout ce que la
 * visite raconte. */
let mockFiche = null;
jest.mock("../hooks/useAffiliate", () => ({
  __esModule: true,
  default: () => ({ affiliate: mockFiche, loading: false, error: null, mutate: jest.fn() }),
}));
jest.mock("../hooks/useChartColors", () => ({ __esModule: true, default: () => ({}) }));
jest.mock("../components/ThemeToggle", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/ClocheAffilie", () => ({ __esModule: true, default: () => null }));
jest.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));
// Recharts mesure son conteneur : sans dimensions en jsdom, il ne rend rien
// et noie la sortie d'avertissements.
jest.mock("recharts", () => new Proxy({}, {
  get: (c, nom) => (nom === "__esModule" ? true : ({ children }) => <div>{children}</div>),
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (c, nom) => (nom === "__esModule" ? true : () => null),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

/* jsdom n'implémente ni scrollIntoView ni une mise en page réelle.
 * `getBoundingClientRect` y rend des zéros, ce qui suffit : la visite n'a
 * besoin que d'un rectangle NON NUL pour afficher sa bulle. Ce que ces tests
 * vérifient, c'est l'enchaînement des étapes et la présence des cibles, pas
 * le placement au pixel — qui demande un vrai navigateur. */
beforeAll(() => {
  window.Element.prototype.scrollIntoView = jest.fn();
});

const FICHE_BAREME = {
  code: "LOLA10", status: "active", terms_ok: true, tour_done: false,
  tier: "bronze", commission_rate: 0.12, tier_agreement: false,
  approval_hold_days: 7, payout_min_cad: 50,
  balance_cad: 120, pending_commission: 40, approved_commission: 80,
  paid_commission: 0, mois_courant_commandes: 3,
  rolling12: 5000, cumulative: 9000,
};

const FICHE_ENTENTE = {
  ...FICHE_BAREME,
  tier: "or", commission_rate: 0.18,
  // Une entente négociée : le taux ne suit pas le barème et ne bouge pas avec
  // le volume. C'est le cas que Mireille veut voir couvert.
  tier_agreement: true, manual_tier: "or",
};

const brancher = (fiche) => {
  mockFiche = fiche;
  api.get.mockImplementation(async (url) => {
    // Les SECTIONS, et non la fiche : le tableau de bord lit l'une par cet
    // appel et l'autre par useAffiliate.
    if (String(url).includes("/affiliate/dashboard")) {
      return { data: {
        referrals: { items: [], total: 0 },
        payouts: { items: [], total: 0 },
        insights: { current_month: { revenue: 0 } },
        clicks_sources: null, activity: [],
        customers: { customers: [] },
        performance: { series: [] },
      } };
    }
    if (String(url).includes("/affiliate/top-products")) return { data: { items: [] } };
    if (String(url).includes("/affiliate/referrals")) return { data: { items: [] } };
    if (String(url).includes("/affiliate/payouts")) return { data: { items: [] } };
    // Un TABLEAU : AffiliateSupport fait `setTickets(data || [])` puis
    // `tickets.map(...)`. Un objet le faisait lever au rendu, et tout
    // l'onglet disparaissait.
    if (String(url).includes("/affiliate/tickets")) return { data: [] };
    if (String(url).includes("/products")) return { data: [] };
    return { data: {} };
  });
  api.post.mockResolvedValue({ data: { ok: true } });
};

const ATTENTE = { timeout: 8000 };

// La page attend 600 ms avant d'ouvrir la visite, le temps que la mise en page
// se stabilise.
const ouvrirLaVisite = async () => {
  render(<AffiliateDashboard />);
  await screen.findByTestId("guided-tour", {}, ATTENTE);
};

const titreCourant = () =>
  screen.getByTestId("guided-tour").querySelector("p.font-display").textContent;

/** Avance jusqu'à la fin, en relevant chaque titre vu. */
const parcourirJusquAuBout = async () => {
  const vus = [];
  for (let garde = 0; garde < 30; garde += 1) {
    const bulle = screen.queryByTestId("guided-tour");
    if (!bulle) break;
    const titre = titreCourant();
    if (titre !== vus[vus.length - 1]) vus.push(titre);
    const suivant = screen.getByTestId("tour-next");
    const dernier = suivant.textContent.trim().toLowerCase() === "terminer";
    await userEvent.click(suivant);
    if (dernier) break;
    /* La bulle DISPARAIT entre deux etapes : le composant vide son rectangle
     * le temps que la cible du pas suivant apparaisse, ce qui peut demander un
     * changement d'onglet. On attend donc son retour, et un titre different —
     * sans quoi on cliquerait deux fois sur la meme etape. */
    const precedent = titre;
    await waitFor(() => {
      const b = screen.queryByTestId("guided-tour");
      expect(b).toBeTruthy();
      expect(titreCourant()).not.toBe(precedent);
    }, ATTENTE).catch(() => {});
  }
  return vus;
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  brancher(FICHE_BAREME);
});

jest.setTimeout(60000);

// ===========================================================================
// LES DEUX PROFILS
// ===========================================================================

describe("un affilié au barème", () => {
  test("la visite s'ouvre toute seule à la première venue", async () => {
    await ouvrirLaVisite();
    expect(screen.getByTestId("guided-tour")).toBeInTheDocument();
    // Première bulle : le lien et le code, la seule chose qu'un nouvel
    // affilié a déjà.
    expect(titreCourant()).toMatch(/lien et votre code/i);
  });

  test("elle explique le PALIER, qui monte avec les ventes", async () => {
    await ouvrirLaVisite();
    // Deuxieme bulle : le palier vit sur la carte, meme onglet que la
    // premiere, donc aucune attente de changement d'onglet.
    await userEvent.click(screen.getByTestId("tour-next"));
    await waitFor(() => expect(titreCourant()).toMatch(/palier/i), ATTENTE);
    expect(screen.getByTestId("guided-tour")).toHaveTextContent(/douze mois glissants/i);
  });
});

describe("un affilié avec une entente", () => {
  beforeEach(() => brancher(FICHE_ENTENTE));

  test("la visite s'ouvre aussi", async () => {
    await ouvrirLaVisite();
    expect(screen.getByTestId("guided-tour")).toBeInTheDocument();
  });

  test("elle parle de TAUX CONVENU, et ne promet aucune progression", async () => {
    /* Le cas que Mireille veut voir couvert. Servir à quelqu'un dont le taux
     * est négocié le discours du barème — « il monte dès le seuil franchi » —
     * lui promettrait une progression qui n'aura jamais lieu, et contredirait
     * l'entente qu'elle a signée avec lui. */
    await ouvrirLaVisite();
    await userEvent.click(screen.getByTestId("tour-next"));
    await waitFor(() => expect(titreCourant()).toMatch(/taux convenu/i), ATTENTE);

    const bulle = screen.getByTestId("guided-tour");
    expect(bulle).toHaveTextContent(/ne suit pas le barème/i);
    expect(bulle).toHaveTextContent(/ne baisse jamais/i);
    expect(bulle).not.toHaveTextContent(/douze mois glissants/i);
  });

  test("la pastille de palier existe quand même : l'étape n'est pas sautée", async () => {
    // Si le badge disparaissait pour une entente, l'explication écrite
    // spécialement pour elle ne s'afficherait jamais.
    await ouvrirLaVisite();
    expect(screen.getByTestId("affiliate-tier-badge")).toBeInTheDocument();
  });
});

// ===========================================================================
// LE PARCOURS COMPLET
// ===========================================================================

describe("la visite va jusqu'au bout", () => {
  test.each([
    ["barème", FICHE_BAREME],
    ["entente", FICHE_ENTENTE],
  ])("et se termine proprement — %s", async (_nom, fiche) => {
    /* LE DÉFAUT QUE CE TEST GARDE.
     *
     * Une étape dont la cible manque est sautée. Mais pour la DERNIÈRE, le
     * saut est impossible : le composant reste sur place sans rectangle à
     * montrer, ne rend rien, et `onClose` n'est jamais appelé. La visite
     * n'est alors jamais marquée comme donnée — et elle revient à chaque
     * connexion, sans que personne puisse dire pourquoi.
     *
     * Le marqueur local posé à la fermeture est la preuve que la sortie a
     * bien eu lieu.
     */
    brancher(fiche);
    await ouvrirLaVisite();
    await parcourirJusquAuBout();

    await waitFor(() => {
      expect(screen.queryByTestId("guided-tour")).not.toBeInTheDocument();
    }, ATTENTE);
    expect(window.localStorage.getItem("fn_tour_done:u-1")).toBe("1");
  });

  test("toutes les cibles des étapes existent dans la page", async () => {
    /* Filet direct sur la cause des étapes muettes : une cible absente fait
     * perdre une bulle écrite, sans aucun signal. Ce test les vérifie une à
     * une plutôt que de le découvrir en production.
     *
     * Les onglets sont visités dans l'ordre de la visite. */
    const parOnglet = {
      overview: ["affiliate-link-panel", "affiliate-tier-badge", "affiliate-tab-faq"],
      // Les deux cibles que la refonte mobile avait deplacees : c'est
      // precisement ce que ce test garde.
      performance: ["affiliate-kpis", "affiliate-performance"],
      payments: ["payout-estimate", "affiliate-payments"],
      compliance: ["affiliate-compliance"],
      settings: ["affiliate-payout-address"],
      support: ["affiliate-support"],
    };

    render(<AffiliateDashboard />);
    await screen.findByTestId("affiliate-link-panel", {}, ATTENTE);
    // On ferme la visite pour pouvoir naviguer librement.
    await screen.findByTestId("guided-tour", {}, ATTENTE);
    await userEvent.click(screen.getByTestId("tour-exit"));

    const manquantes = [];
    for (const [onglet, cibles] of Object.entries(parOnglet)) {
      await userEvent.click(screen.getByTestId(`affiliate-tab-${onglet}`));
      for (const cible of cibles) {
        try {
          await screen.findByTestId(cible, {}, { timeout: 4000 });
        } catch {
          manquantes.push(`${onglet} → ${cible}`);
        }
      }
    }
    expect(manquantes).toEqual([]);
  });
});

// ===========================================================================
// LA SORTIE
// ===========================================================================

describe("on peut toujours en sortir", () => {
  test("« Quitter » est offert dès la première bulle", async () => {
    // Une visite dont on ne voit pas la sortie est une prison.
    await ouvrirLaVisite();
    expect(screen.getByTestId("tour-exit")).toBeInTheDocument();
  });

  test("quitter marque la visite comme donnée", async () => {
    // Quelqu'un qui sort à la deuxième bulle a décidé qu'il n'en voulait
    // pas ; la lui resservir serait le punir de son choix.
    await ouvrirLaVisite();
    await userEvent.click(screen.getByTestId("tour-exit"));

    await waitFor(() => {
      expect(screen.queryByTestId("guided-tour")).not.toBeInTheDocument();
    }, ATTENTE);
    expect(window.localStorage.getItem("fn_tour_done:u-1")).toBe("1");
  });

  test("elle ne rejoue pas pour qui l'a déjà vue", async () => {
    window.localStorage.setItem("fn_tour_done:u-1", "1");
    render(<AffiliateDashboard />);
    await screen.findByTestId("affiliate-link-panel", {}, ATTENTE);

    await new Promise((r) => setTimeout(r, 900));
    expect(screen.queryByTestId("guided-tour")).not.toBeInTheDocument();
  });

  test("ni pour qui n'a pas encore accepté les conditions", async () => {
    // La visite n'a aucun sens avant l'acceptation : elle recouvrirait le
    // texte qu'on demande de lire.
    brancher({ ...FICHE_BAREME, terms_ok: false });
    render(<AffiliateDashboard />);

    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.queryByTestId("guided-tour")).not.toBeInTheDocument();
  });
});
