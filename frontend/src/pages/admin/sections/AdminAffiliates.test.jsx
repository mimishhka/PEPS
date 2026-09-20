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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminAffiliates from "./AdminAffiliates";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
  API_BASE: "/api",
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

// Une commission par etat, aux dates de la conciliation de septembre.
const REFERRALS = [
  { id: "r-1", order_number: "FN-260920-D6217DAA", created_at: "2026-09-20T15:36:00",
    base_amount: 38.99, commission_amount: 6.24, status: "approved" },
  { id: "r-2", order_number: "FN-260825-6A35BD", created_at: "2026-08-25T16:10:00",
    base_amount: 49.99, commission_amount: 0, status: "excluded",
    excluded_reason: "fraud" },
  { id: "r-3", order_number: "FN-260901-E8C7", created_at: "2026-09-01T09:00:00",
    base_amount: 20, commission_amount: 3.2, status: "pending", self_order: true },
];

const APERCU = {
  financial: {}, affiliates: {}, attribution: {},
  alerts: { clawback_count: 2, clawback_amount: 340.5 },
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
      return { data: { affiliate: AFFILIE, referrals: REFERRALS, payouts: [],
      metrics: { cumulative_revenue: 323.96, rolling12_revenue: 323.96,
                 pending_commission: 3.2,
                 approved_commission: 6.24, paid_commission: 28.5,
                 reversed_commission: 0, excluded_commission: 0,
                 quarter_revenue: 323.96, commission_rate: 0.16,
                 payout_min_cad: 25 },
      series: [{ mois: "2026-06", ca_valide: 40, commissions: 6.4, payee: 6.4, recuperee: 0 },
               { mois: "2026-07", ca_valide: 90, commissions: 14.4, payee: 0, recuperee: 4 },
               { mois: "2026-08", ca_valide: 258.97, commissions: 22, payee: 28.5, recuperee: 0 },
               { mois: "2026-09", ca_valide: 64.99, commissions: 12.48, payee: 0, recuperee: 0 }] } };
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

  it("affiche les sommes a recuperer venues de l'API", async () => {
    // Cette carte n'existait pas : le champ clawback_pending etait ecrit
    // correctement cote serveur et n'apparaissait sur aucun ecran, donc les
    // creances sur les affilies n'etaient jamais recouvrees.
    render(<AdminAffiliates />);

    await waitFor(() =>
      expect(screen.getByText(/Sommes . r.cup.rer/)).toBeInTheDocument());
    expect(screen.getByText(/2 . \$340\.50/)).toBeInTheDocument();
  });

  it("garde les cinq compteurs, et met en retrait ceux a zero", async () => {
    // Le repli sur une ligne a ete essaye puis abandonne : on lit « tout est a
    // zero » plus vite sur cinq chiffres que dans une phrase, et il faut relire
    // pour verifier qu'aucun poste ne manque. C'est le POIDS qui change
    // desormais, pas la presence.
    render(<AdminAffiliates />);

    const bande = await screen.findByTestId("affiliate-alerts");

    // Les cinq postes sont la, quel que soit leur compteur.
    for (const titre of [/Paiements . envoyer/, /Commissions . approuver/,
                         /r.vision conformit/, /Invitations expir/,
                         /Sommes . r.cup.rer/]) {
      expect(screen.getByText(titre)).toBeInTheDocument();
    }
    expect(bande.children).toHaveLength(5);
  });
  it("propose de fermer un dossier invité, et n'envoie aucun courriel", async () => {
    // Une invitation qui ne sera jamais acceptee restait « invited » pour
    // toujours : elle comptait dans les effectifs et la seule action offerte
    // etait de la renvoyer, c'est-a-dire d'insister.
    const INVITE = { ...AFFILIE, status: "invited", code: null };
    api.get.mockImplementation(async (url) => {
      if (url === "/admin/affiliates/overview") return { data: APERCU };
      if (url === "/admin/affiliates") return { data: [INVITE] };
      if (url === "/admin/affiliates/risk") return { data: null };
      if (url.startsWith("/admin/affiliates/aff-1")) {
        return { data: { affiliate: INVITE, referrals: [], payouts: [] } };
      }
      return { data: {} };
    });
    api.post.mockResolvedValue({ data: { ...INVITE, status: "closed" } });

    render(<AdminAffiliates />);
    await screen.findByText(/4 commandes/);
    await userEvent.click(screen.getByText("Demo Affiliate", { selector: "p" }));

    const bouton = await screen.findByTestId("affiliate-close");
    await userEvent.click(bouton);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/affiliates/aff-1/close",
                                            { reason: "" }));
    // Le point essentiel : rien qui ressemble a un envoi de courriel.
    const appels = api.post.mock.calls.map(([u]) => u).join(" ");
    expect(appels).not.toMatch(/invite|resend|email/i);
  });

  it("ne propose pas la fermeture d'un affilié actif", async () => {
    // Son code est en circulation : il faut le suspendre d'abord, et le
    // serveur refuse de toute facon.
    render(<AdminAffiliates />);
    await screen.findByText(/4 commandes/);
    await userEvent.click(screen.getByText("Demo Affiliate", { selector: "p" }));

    await screen.findByTestId("affiliate-detail-modal");
    expect(screen.queryByTestId("affiliate-close")).not.toBeInTheDocument();
  });
describe("AdminAffiliates — conciliation des commissions", () => {
  const ouvrirFiche = async () => {
    render(<AdminAffiliates />);
    const ligne = (await screen.findByText(/4 commandes/)).closest("button");
    await userEvent.click(ligne);
    // La fenetre de detail se distingue par ses chiffres de CA.
    await screen.findByTestId("affiliate-figures");
  };

  it("exporte les commissions avec un lien CSV", async () => {
    await ouvrirFiche();
    const lien = screen.getByTestId("referrals-export");
    // Sans mois choisi : tout l'historique.
    expect(lien).toHaveAttribute(
      "href", "/api/admin/affiliates/aff-1/referrals/export.csv");
  });

  it("le choix d un mois filtre l export", async () => {
    await ouvrirFiche();
    await userEvent.type(screen.getByTestId("referrals-month"), "2026-09");
    expect(screen.getByTestId("referrals-export")).toHaveAttribute(
      "href", "/api/admin/affiliates/aff-1/referrals/export.csv?month=2026-09");
  });

  it("les statuts se lisent en clair, pas en chaines brutes", async () => {
    await ouvrirFiche();
    // « pending » brut obligeait l'admin a traduire lui-meme ; « excluded »
    // ne disait pas que l'argent a ete retire. « En attente » figure aussi
    // comme colonne de la liste principale : on verifie donc SUR LA LIGNE de
    // la commande, pas dans la page entiere.
    expect(screen.getByText("Approuvée")).toBeInTheDocument();
    const ligneExclue = screen.getByText("FN-260825-6A35BD").closest("tr");
    expect(ligneExclue).toHaveTextContent("Exclue");
    const ligne = screen.getByText("FN-260901-E8C7").closest("tr");
    expect(ligne).toHaveTextContent("En attente");
  });

  it("chaque commission porte sa date", async () => {
    await ouvrirFiche();
    expect(screen.getByText("2026-09-20")).toBeInTheDocument();
    expect(screen.getByText("2026-08-25")).toBeInTheDocument();
  });

  it("la serie commence par le mois le plus recent et se deplie", async () => {
    // Trois mois visibles, le dernier en premier : c'est lui qu'on vient
    // consulter. Les autres restent a un clic.
    await ouvrirFiche();
    const lignes = [...screen.getByTestId("affiliate-series").querySelectorAll("tbody tr")]
      .map((tr) => tr.getAttribute("data-testid"));
    expect(lignes.slice(0, 3)).toEqual([
      "series-2026-09", "series-2026-08", "series-2026-07"]);
    expect(screen.queryByTestId("series-2026-06")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("series-etendre"));
    expect(screen.getByTestId("series-2026-06")).toBeInTheDocument();
  });

  it("un clic sur une colonne inverse le tri", async () => {
    await ouvrirFiche();
    // Par defaut : mois decroissant. Tri par CA valide : aout (258.97) passe
    // devant septembre.
    fireEvent.click(screen.getByTestId("series-tri-ca_valide"));
    const lignes = [...screen.getByTestId("affiliate-series").querySelectorAll("tbody tr")]
      .map((tr) => tr.getAttribute("data-testid"));
    expect(lignes[0]).toBe("series-2026-08");
    // Reclic : sens inverse (croissant), le PLUS PETIT CA passe devant.
    fireEvent.click(screen.getByTestId("series-tri-ca_valide"));
    const lignes2 = [...screen.getByTestId("affiliate-series").querySelectorAll("tbody tr")]
      .map((tr) => tr.getAttribute("data-testid"));
    expect(lignes2[0]).toBe("series-2026-06");
  });

  it("les annulations par remboursement apparaissent dans leur mois", async () => {
    // Une commission recuperee en juillet doit se VOIR en juillet — sinon le
    // mois affiche simplement moins, comme si rien ne s'etait passe.
    await ouvrirFiche();
    expect(screen.getByTestId("series-2026-07")).toHaveTextContent("$4.00");
  });

  it("le contexte nomme ses periodes, son seuil, et dit la verite du cycle", async () => {
    // Un montant sans sa fenetre est une enigme : tout, 12 mois glissants, le
    // seuil. Et 6,24 $ approuves SONT sous le seuil de 25 $ : le cycle du
    // 1er ne paiera pas — la fiche doit le dire au lieu de promettre un
    // debourse qui n'arrivera pas.
    await ouvrirFiche();
    const figures = screen.getByTestId("affiliate-figures");
    expect(figures).toHaveTextContent("CA validé (tout)");
    expect(figures).toHaveTextContent("12 mois glissants");
    expect(figures).toHaveTextContent("Seuil de versement");
    expect(screen.getByTestId("cycle-versement")).toHaveTextContent("sous le seuil");
  });

  it("au-dessus du seuil, le cycle est annonce avec sa date", async () => {
    // 30 $ approuves : cette fois, le debourse part VRAIMENT le 1er du mois
    // suivant, et la fiche l'annonce.
    api.get.mockImplementation(async (url) => {
      if (url === "/admin/affiliates/overview") return { data: APERCU };
      if (url === "/admin/affiliates") return { data: [AFFILIE] };
      if (url === "/admin/affiliates/risk") return { data: null };
      if (url.startsWith("/admin/affiliates/aff-1")) {
        return { data: { affiliate: AFFILIE, referrals: REFERRALS, payouts: [],
          metrics: { cumulative_revenue: 323.96, rolling12_revenue: 323.96,
                     pending_commission: 0, approved_commission: 30,
                     paid_commission: 28.5, reversed_commission: 0,
                     excluded_commission: 0, quarter_revenue: 323.96,
                     commission_rate: 0.16, payout_min_cad: 25 },
          series: [] } };
      }
      return { data: {} };
    });
    await ouvrirFiche();
    expect(screen.getByTestId("cycle-versement")).toHaveTextContent("à débourser");
    expect(screen.getByTestId("cycle-versement")).toHaveTextContent("Cycle du");
  });

  it("la vue mensuelle permet le retour en arriere", async () => {
    // Trois sommes par mois : ce que le mois a valide, ce qu'il doit, et ce
    // qu'il a VRAIMENT verse ce mois-la.
    await ouvrirFiche();
    const aout = screen.getByTestId("series-2026-08");
    expect(aout).toHaveTextContent("$22.00");
    expect(aout).toHaveTextContent("$28.50");          // versees ce mois
    expect(screen.getByTestId("series-2026-09")).toHaveTextContent("$0.00");
  });

  it("le contexte ne juxtapose plus deux sommes identiques", async () => {
    // CA valide et CA du trimestre valaient la meme somme (toutes les ventes
    // tombent dans le trimestre courant) : deux montants egaux cote a cote se
    // lisaient comme une erreur. Le trimestre descend dans l etat civil.
    await ouvrirFiche();
    const figures = screen.getByTestId("affiliate-figures");
    expect(figures).not.toHaveTextContent("Quarter");
    // Et il reste consultable plus bas.
    expect(screen.getByText("CA du trimestre")).toBeInTheDocument();
  });

  it("le pipeline montre l argent etape par etape, sans rien oublier", async () => {
    // En attente, a verser, payee, recuperee, exclue : cinq sommes, cinq
    // couleurs. L'ancien bloc ne montrait ni le paye ni le retire.
    await ouvrirFiche();
    const figures = screen.getByTestId("affiliate-figures");
    expect(figures).toHaveTextContent("En attente");
    expect(figures).toHaveTextContent("À verser");
    expect(figures).toHaveTextContent("Payée");
    expect(figures).toHaveTextContent("Récupérée");
    expect(figures).toHaveTextContent("Exclue");
    expect(figures).toHaveTextContent("$6.24");
    expect(figures).toHaveTextContent("$28.50");
    // Le contexte suit sur une ligne : le CA et le taux.
    expect(figures).toHaveTextContent("CA validé");
    expect(figures).toHaveTextContent("16 %");
  });
});

  it("les KPI portent leur ecart contre le mois precedent", async () => {
    // Un KPI sans direction ni reference ne dit pas si le chiffre est bon :
    // valeur, ecart, comparaison — les trois en meme temps.
    api.get.mockImplementation(async (url) => {
      if (url === "/admin/affiliates/overview") return { data: { ...APERCU,
        monthly_series: [{ month: "2026-08", revenue: 1000, commission: 100 },
                         { month: "2026-09", revenue: 1400, commission: 90 }] } };
      if (url === "/admin/affiliates") return { data: [AFFILIE] };
      if (url === "/admin/affiliates/risk") return { data: null };
      return { data: {} };
    });
    render(<AdminAffiliates />);

    // +40 % sur le CA, −10 % sur les commissions — la fleche et le nombre
    // vivent dans le meme element, le texte exact peut varier d'un espace.
    // Le chargement passe par une Promise.all : laisser le temps aux etats
    // de se poser avant de lire les KPI.
    await new Promise((r) => setTimeout(r, 500));
    // La fleche et le nombre vivent dans la meme ligne d'ecart : on les lit
    // ensemble, dans l'element qui porte « vs mois precedent ».
    const ecarts = screen.getAllByText("vs mois précédent");
    expect(ecarts.length).toBeGreaterThanOrEqual(2);
    expect(ecarts[0].parentElement).toHaveTextContent("▲");
    expect(ecarts[1].parentElement).toHaveTextContent("▼");
  });

});
