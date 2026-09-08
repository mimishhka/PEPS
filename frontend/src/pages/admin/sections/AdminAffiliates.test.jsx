// Garde deux defauts trouves dans le navigateur, et invisibles autrement.
//
// Le classement TOP AFFILIES rend chaque ligne ainsi :
//
//   <button key={t.id} onClick={() => setDetail(t.id)}>
//
// Or /admin/affiliates/overview ne renvoyait PAS `id`. Deux consequences, l'une
// cosmetique et l'autre pas :
//
//   - key={undefined} vaut une cle absente pour React, d'ou l'avertissement
//     « Each child in a list should have a unique key prop » ;
//   - setDetail(undefined) laisse `detail` faux, donc `{detail && <Modal/>}` ne
//     rend rien : la ligne se surlignait au survol, acceptait le clic, et ne
//     faisait RIEN.
//
// Ni le lint ni le build ni les tests backend ne voyaient l'un ou l'autre. Il a
// fallu ouvrir la page et cliquer.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminAffiliates from "./AdminAffiliates";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
}));

// La distribution CommonJS de lucide-react n'est pas analysable par le Jest
// livre avec Create React App. Ce sont des icones : un composant vide dit
// exactement la meme chose a un test.
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

jest.mock("../../../components/ConfirmDialog", () => ({
  useConfirm: () => async () => true,
}));

jest.mock("../../../hooks/useChartColors", () => ({
  __esModule: true,
  default: () => ({ grille: "#E2E8F0", axe: "#64748B" }),
}));

// Recharts mesure son conteneur, ce que jsdom ne sait pas faire : il rend un
// graphique de taille -1 et inonde la sortie d'avertissements. Le classement
// teste ici n'est pas un graphique.
jest.mock("recharts", () => {
  const Vide = ({ children }) => <div>{children}</div>;
  return {
    LineChart: Vide, Line: Vide, XAxis: Vide, YAxis: Vide, Tooltip: Vide,
    ResponsiveContainer: Vide, CartesianGrid: Vide, Legend: Vide,
  };
});

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const AFFILIE = {
  id: "aff-1", name: "Demo Affiliate", email: "demo@example.com",
  code: "DEMO00", status: "active", tier: "diamond", commission_rate: 20,
  clicks: 3, cumulative_revenue: 0, pending_commission: 0,
};

const APERCU = {
  financial: {}, affiliates: {}, alerts: {}, attribution: {},
  monthly_series: [],
  tier_distribution: { diamond: 1 },
  top_affiliates: [{
    // Les DEUX champs qui manquaient. Le test ne vaut que s'ils sont ici :
    // c'est le contrat entre l'ecran et l'endpoint.
    id: "aff-1", code: "DEMO00", name: "Demo Affiliate",
    revenue: 1250.5, commission: 187.25, orders: 4,
  }],
};

function reponsesParDefaut() {
  api.get.mockImplementation(async (url) => {
    if (url === "/admin/affiliates/overview") return { data: APERCU };
    if (url === "/admin/affiliates") return { data: [AFFILIE] };
    if (url === "/admin/affiliates/risk") return { data: null };
    if (url.startsWith("/admin/affiliates/aff-1")) {
      return { data: { affiliate: AFFILIE, referrals: [], payouts: [] } };
    }
    return { data: {} };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  reponsesParDefaut();
});

describe("AdminAffiliates — classement des top affiliés", () => {
  it("affiche le nombre de commandes venu de l'API", async () => {
    render(<AdminAffiliates />);

    // « 4 commandes », et non le « 0 commandes » qu'affichait l'ecran quand le
    // champ n'existait pas cote serveur.
    await waitFor(() => expect(screen.getByText(/4 commandes/)).toBeInTheDocument());
  });

  it("ouvre la fiche quand on clique sur une ligne du classement", async () => {
    render(<AdminAffiliates />);
    await screen.findByText(/4 commandes/);

    const ligne = screen.getByText(/4 commandes/).closest("button");
    expect(ligne).not.toBeNull();
    await userEvent.click(ligne);

    // La fenetre de detail ne s'ouvre que si l'identifiant est parvenu jusqu'au
    // gestionnaire de clic. Avec `id` absent, rien ne se passait.
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/admin/affiliates/aff-1"));
    });
  });

  it("ne produit aucun avertissement React de clé manquante", async () => {
    // React signale les cles absentes par console.error. Une cle `undefined`
    // compte comme absente — c'est exactement ce qui arrivait ici.
    const erreurs = [];
    const origine = console.error;
    console.error = (...args) => { erreurs.push(args.join(" ")); origine(...args); };
    try {
      render(<AdminAffiliates />);
      await screen.findByText(/4 commandes/);
    } finally {
      console.error = origine;
    }

    expect(erreurs.filter((m) => m.includes("unique \"key\" prop"))).toEqual([]);
  });
});
