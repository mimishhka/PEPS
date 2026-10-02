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

  it("garde tous les compteurs, et met en retrait ceux a zero", async () => {
    // Le repli sur une ligne a ete essaye puis abandonne : on lit « tout est a
    // zero » plus vite sur des chiffres que dans une phrase, et il faut relire
    // pour verifier qu'aucun poste ne manque. C'est le POIDS qui change
    // desormais, pas la presence.
    //
    // Le test comptait « cinq » ; il en compte desormais six, « Sans adresse
    // de paiement » ayant rejoint la bande. C'est la LISTE qui fait foi, pas
    // le nombre : un nombre nu ne dit pas lequel manque quand il tombe.
    render(<AdminAffiliates />);

    const bande = await screen.findByTestId("affiliate-alerts");

    const postes = [/Paiements . envoyer/, /Commissions . approuver/,
                    /Sans adresse de paiement/, /r.vision conformit/,
                    /Invitations expir/, /Sommes . r.cup.rer/];
    for (const titre of postes) {
      expect(screen.getByText(titre)).toBeInTheDocument();
    }
    expect(bande.children).toHaveLength(postes.length);
  });

  it("annonce les affilies qui ne pourront pas etre payes", async () => {
    // Le versement se calcule, la commission reste due, et le run bute sur
    // une adresse vide — en silence, le 1er du mois. Ca se voit le jour ou
    // l'affilie ecrit, des semaines apres.
    api.get.mockImplementation(async (url) => {
      if (url === "/admin/affiliates/overview") {
        return { data: { ...APERCU,
          alerts: { ...APERCU.alerts, no_payout_address: 3 } } };
      }
      if (url === "/admin/affiliates") return { data: [AFFILIE] };
      if (url === "/admin/affiliates/risk") return { data: null };
      return { data: {} };
    });
    render(<AdminAffiliates />);

    await screen.findByText(/Sans adresse de paiement/);
    expect(screen.getByText(/ne seront pas pay/)).toBeInTheDocument();
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
    // La fenetre n'est plus GLISSANTE : depuis bb938b7, le palier repose sur
    // les douze mois CLOS (plancher) et la prevision fait monter. L'ecran le
    // dit, le test suivait encore l'ancienne regle.
    expect(figures).toHaveTextContent("12 mois clos");
    expect(figures).toHaveTextContent("Seuil de versement");
    expect(screen.getByTestId("cycle-versement")).toHaveTextContent("sous le seuil");
  });

  // La date du cycle ne se calcule plus dans le navigateur.
  //
  // Elle valait « le 1er du mois prochain » et le montant annonce etait TOUT
  // l'approuve : l'argent approuve AVANT ce mois-ci est du maintenant, pas le
  // mois prochain, et le total melangeait le mois clos avec le mois en cours.
  // Le serveur tranche la separation a minuit heure du Quebec.
  const ficheAvecCycle = (cycle, approuve = 30) => {
    api.get.mockImplementation(async (url) => {
      if (url === "/admin/affiliates/overview") return { data: APERCU };
      if (url === "/admin/affiliates") return { data: [AFFILIE] };
      if (url === "/admin/affiliates/risk") return { data: null };
      if (url.startsWith("/admin/affiliates/aff-1")) {
        return { data: { affiliate: AFFILIE, referrals: REFERRALS, payouts: [],
          metrics: { cumulative_revenue: 323.96, rolling12_revenue: 323.96,
                     pending_commission: 0, approved_commission: approuve,
                     paid_commission: 28.5, reversed_commission: 0,
                     excluded_commission: 0, quarter_revenue: 323.96,
                     commission_rate: 0.16, payout_min_cad: 25 },
          series: [], payout_cycle: cycle } };
      }
      return { data: {} };
    });
  };

  it("au-dessus du seuil, le mois clos est nomme avec son echeance", async () => {
    ficheAvecCycle({ period: "2026-08", current_period: "2026-09",
                     due_now: 30, due_count: 2, current_cycle: 0,
                     current_count: 0, days_left: 3, overdue: false,
                     due_by: "2026-09-06T04:00:00+00:00", due_days: 5 });
    await ouvrirFiche();

    const ligne = screen.getByTestId("cycle-versement");
    expect(ligne).toHaveTextContent("$30.00 à verser pour");
    expect(ligne).toHaveTextContent("août 2026");
    expect(ligne).toHaveTextContent("3 jour(s)");
  });

  it("dit le retard au lieu d'un compte a rebours", async () => {
    ficheAvecCycle({ period: "2026-08", current_period: "2026-09",
                     due_now: 30, due_count: 2, current_cycle: 0,
                     current_count: 0, days_left: 0, overdue: true,
                     due_by: "2026-09-06T04:00:00+00:00", due_days: 5 });
    await ouvrirFiche();

    expect(screen.getByTestId("cycle-versement")).toHaveTextContent("échéance dépassée");
  });

  it("n'annonce aucune echeance quand tout vient du mois en cours", async () => {
    // Promettre une date pour de l'argent qui n'est pas encore du ferait
    // courir apres un delai qui n'existe pas.
    ficheAvecCycle({ period: "2026-08", current_period: "2026-09",
                     due_now: 0, due_count: 0, current_cycle: 30,
                     current_count: 2, days_left: 3, overdue: false,
                     due_by: "2026-09-06T04:00:00+00:00", due_days: 5 });
    await ouvrirFiche();

    const ligne = screen.getByTestId("cycle-versement");
    expect(ligne).toHaveTextContent("septembre 2026 en cours");
    expect(ligne).not.toHaveTextContent("à verser pour");
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
    // ATTENDRE LA CONDITION, PAS UNE DUREE.
    //
    // Il y avait ici `setTimeout(r, 500)`. Le chargement passe par une
    // Promise.all de trois appels : sous charge, quand Jest fait tourner
    // plusieurs suites en parallele, cinq cents millisecondes ne suffisent
    // pas et la lecture arrive avant le rendu. La suite echouait ainsi un
    // run sur trois, sur une assertion pourtant juste.
    //
    // `findAllByText` reessaie jusqu'a ce que l'element existe. Une pause
    // fixe parie sur la vitesse de la machine ; une attente de condition
    // n'a rien a parier.
    //
    // La fleche et le nombre vivent dans la meme ligne d'ecart : on les lit
    // ensemble, dans l'element qui porte « vs mois precedent ».
    const ecarts = await screen.findAllByText("vs mois précédent");
    expect(ecarts.length).toBeGreaterThanOrEqual(2);
    expect(ecarts[0].parentElement).toHaveTextContent("▲");
    expect(ecarts[1].parentElement).toHaveTextContent("▼");
  });

});


describe("AdminAffiliates — le cycle de versement", () => {
  // « Paiements à envoyer : 3 · 412,50 $ — exécution + 2FA » décrivait le
  // GESTE. En fin de mois, ce qui commande c'est le DÉLAI : Mireille a cinq
  // jours pour débourser le mois clos, et l'écran ne le disait nulle part.
  const avecCycle = (cycle) => {
    const origine = api.get.getMockImplementation();
    api.get.mockImplementation(async (url) => {
      if (url === "/admin/affiliates/overview") {
        return { data: { ...APERCU,
          alerts: { ...APERCU.alerts, payouts_ready: 3, payouts_ready_amount: 500.75 },
          payout_cycle: cycle } };
      }
      return origine(url);
    });
  };

  it("annonce le montant dû et les jours restants", async () => {
    avecCycle({ period: "2026-08", current_period: "2026-09", due_now: 412.5,
                due_count: 7, current_cycle: 88.25, current_count: 2,
                days_left: 2, overdue: false, due_days: 5 });
    render(<AdminAffiliates />);

    await waitFor(() => expect(screen.getByText(/412\.50 dû · 2 j/)).toBeInTheDocument());
  });

  it("dit le retard quand l'échéance est passée", async () => {
    avecCycle({ period: "2026-08", current_period: "2026-09", due_now: 412.5,
                due_count: 7, current_cycle: 88.25, current_count: 2,
                days_left: 0, overdue: true, due_days: 5 });
    render(<AdminAffiliates />);

    await waitFor(() => expect(screen.getByText(/412\.50 en retard/)).toBeInTheDocument());
  });

  it("retombe sur le geste quand rien n'est dû pour le mois clos", async () => {
    // Tout l'approuvé vient du mois en cours : il n'y a pas d'échéance à
    // annoncer, et inventer une date ferait courir après un délai qui
    // n'existe pas.
    avecCycle({ period: "2026-08", current_period: "2026-09", due_now: 0,
                due_count: 0, current_cycle: 500.75, current_count: 3,
                days_left: 2, overdue: false, due_days: 5 });
    render(<AdminAffiliates />);

    await waitFor(() => expect(screen.getByText(/exécution \+ 2FA/)).toBeInTheDocument());
  });

  it("ne casse pas quand le serveur ne renvoie pas le cycle", async () => {
    avecCycle(undefined);
    render(<AdminAffiliates />);

    await waitFor(() => expect(screen.getByText(/exécution \+ 2FA/)).toBeInTheDocument());
  });
});

describe("AdminAffiliates — le dernier avis envoyé", () => {
  // Meme ouverture que la conciliation : le classement, puis la fiche.
  const ouvrirFiche = async () => {
    render(<AdminAffiliates />);
    const ligne = (await screen.findByText(/4 commandes/)).closest("button");
    await userEvent.click(ligne);
    await screen.findByTestId("affiliate-figures");
  };

  // La colonne des cycles dit COMBIEN d'affiliés ont été prévenus ; elle ne
  // dit pas lesquels. Quand quelqu'un écrit « je n'ai rien reçu », c'est la
  // fiche qu'on ouvre.
  const ficheAvecAvis = (avis) => {
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
          series: [], last_notice: avis } };
      }
      return { data: {} };
    });
  };

  it("dit le type, la période et l'état de l'avis", async () => {
    ficheAvecAvis({ kind: "annonce", period: "2026-08", email_status: "queued",
                    email_queued_at: "2026-09-01T09:12:00+00:00", attempts: 0 });
    await ouvrirFiche();

    const ligne = screen.getByTestId("dernier-avis");
    expect(ligne).toHaveTextContent("annonce du versement");
    expect(ligne).toHaveTextContent("2026-08");
    expect(ligne).toHaveTextContent("remis à la file d'envoi");
  });

  it("signale en rouge un dépôt qui a échoué", async () => {
    ficheAvecAvis({ kind: "confirmation", period: "2026-08", email_status: "failed",
                    created_at: "2026-09-04T16:00:00+00:00", attempts: 2 });
    await ouvrirFiche();

    const ligne = screen.getByTestId("dernier-avis");
    expect(ligne).toHaveTextContent("échec du dépôt");
    expect(ligne.querySelector(".text-error")).not.toBeNull();
    expect(ligne).toHaveTextContent("2 reprise(s)");
  });

  it("ne parle pas de reprise quand il n'y en a pas eu", async () => {
    // « tentative 1 » sur un envoi du premier coup ne dit rien.
    ficheAvecAvis({ kind: "annonce", period: "2026-08", email_status: "queued",
                    email_queued_at: "2026-09-01T09:12:00+00:00", attempts: 0 });
    await ouvrirFiche();

    expect(screen.getByTestId("dernier-avis")).not.toHaveTextContent("reprise");
  });

  it("dit clairement l'affilié sans adresse au dossier", async () => {
    ficheAvecAvis({ kind: "annonce", period: "2026-08",
                    email_status: "skipped_no_email",
                    created_at: "2026-09-01T09:12:00+00:00" });
    await ouvrirFiche();

    expect(screen.getByTestId("dernier-avis"))
      .toHaveTextContent("aucune adresse au dossier");
  });

  it("n'affiche aucune ligne quand aucun avis n'est jamais parti", async () => {
    ficheAvecAvis(null);
    await ouvrirFiche();

    expect(screen.queryByTestId("dernier-avis")).not.toBeInTheDocument();
  });
});

// APRES L'ENVOI, LE PANNEAU DOIT DIRE QUE C'EST PARTI.
//
// Mireille : « la fenetre reste ouverte une fois l'invitation envoyee, on
// dirait qu'elle n'est pas partie ». Elle avait raison : le formulaire restait
// rempli, le bouton disait encore « Envoyer l'invitation », et seule une
// petite boite apparaissait en bas. Rien ne distinguait un envoi reussi d'un
// envoi jamais tente — et un second clic partait pour de bon.
describe("l'invitation d'un affilie", () => {
  const remplirEtEnvoyer = async () => {
    await userEvent.click(await screen.findByTestId("affiliate-invite-open"));
    fireEvent.change(await screen.findByTestId("invite-first-name"), { target: { value: "Marie" } });
    fireEvent.change(screen.getByTestId("invite-last-name"), { target: { value: "Tremblay" } });
    fireEvent.change(screen.getByTestId("invite-email"), { target: { value: "marie@exemple.com" } });
    await userEvent.click(screen.getByTestId("invite-submit"));
  };

  it("bascule en confirmation et retire le formulaire", async () => {
    api.post.mockResolvedValue({
      data: { invite_link: "https://fironova.com/affiliate/join?token=abc" },
    });
    render(<AdminAffiliates />);
    await remplirEtEnvoyer();

    await waitFor(() => expect(screen.getByTestId("invite-confirmation")).toBeInTheDocument());
    // Le formulaire a disparu : impossible d'envoyer une seconde fois sans
    // rouvrir, et impossible de croire que rien ne s'est passe.
    expect(screen.queryByTestId("invite-submit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("invite-email")).not.toBeInTheDocument();
  });

  it("nomme la personne qui vient de recevoir le courriel", async () => {
    api.post.mockResolvedValue({ data: { invite_link: "https://fironova.com/affiliate/join?token=abc" } });
    render(<AdminAffiliates />);
    await remplirEtEnvoyer();

    const confirmation = await screen.findByTestId("invite-confirmation");
    expect(confirmation).toHaveTextContent("marie@exemple.com");
  });

  it("permet d'ouvrir le lien pour verifier qu'il mene quelque part", async () => {
    // Mireille : « quand l'affilie a utilise le lien, ca l'a envoye sur une
    // page indisponible ». Le lien est construit cote serveur a partir de
    // PUBLIC_BASE_URL : si ce reglage pointe ailleurs, le courriel part avec
    // une adresse morte et rien ne le signale. L'ouvrir soi-meme est le seul
    // moyen de le voir avant que l'affilie le decouvre.
    api.post.mockResolvedValue({
      data: { invite_link: "https://fironova.com/affiliate/join?token=abc" },
    });
    render(<AdminAffiliates />);
    await remplirEtEnvoyer();

    const essai = await screen.findByTestId("invite-link-test");
    expect(essai).toHaveAttribute("href", "https://fironova.com/affiliate/join?token=abc");
    expect(essai).toHaveAttribute("target", "_blank");
  });

  it("garde le formulaire quand l'envoi echoue", async () => {
    // Un echec ne doit pas faire croire a un succes : le formulaire reste,
    // avec ce qui a ete saisi.
    api.post.mockRejectedValue({ response: { data: { detail: "SMTP indisponible" } } });
    render(<AdminAffiliates />);
    await remplirEtEnvoyer();

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(screen.queryByTestId("invite-confirmation")).not.toBeInTheDocument();
    expect(screen.getByTestId("invite-submit")).toBeInTheDocument();
  });
});

// ===========================================================================
// LA FICHE COMME PIECE D'AUDIT
//
// MIREILLE, 02/10/2026 : « je veux que tu optimises la fiche de l'affilié [...]
// il faut penser à toutes les questions que pourrait me poser un affilié s'il
// demande un audit de son compte, de ses paiements, du détail complet de chaque
// paiement, d'absolument tout ».
//
// Toutes les données étaient DÉJÀ dans la réponse du serveur — la fiche renvoie
// le document entier de l'affilié et de chaque commission. Rien ne manquait en
// base : c'est l'écran qui n'en montrait qu'une partie, et qui laissait donc
// sans réponse des questions auxquelles les données répondaient.
// ===========================================================================

describe("AdminAffiliates — répondre à un audit", () => {
  const ouvrirFiche = async () => {
    render(<AdminAffiliates />);
    const ligne = (await screen.findByText(/4 commandes/)).closest("button");
    await userEvent.click(ligne);
    await screen.findByTestId("affiliate-figures");
  };

  /* Les commissions d'un audit : une payée et rattachée à un versement, une
     remboursée APRÈS que l'argent soit parti. */
  const COMMISSIONS_AUDIT = [
    { id: "a-1", order_number: "FN-1001", created_at: "2026-08-29T10:00:00",
      approved_at: "2026-09-05T10:00:00", base_amount: 500, commission_amount: 60,
      status: "paid", payout_id: "pay-1" },
    { id: "a-2", order_number: "FN-1002", created_at: "2026-09-10T10:00:00",
      approved_at: "2026-09-17T10:00:00", base_amount: 687.5, commission_amount: 82.5,
      status: "reversed", payout_id: "pay-1",
      reversed_at: "2026-10-28T09:00:00", reversed_after_payout: true,
      clawback_pending: true, clawback_amount: 82.5 },
  ];

  const VERSEMENTS = [
    { id: "pay-1", period: "2026-10", amount_cad: 142.5, currency: "usdt",
      status: "paid_manual", reference: "0xabc", paid_at: "2026-10-03T14:00:00",
      periode_couverte: { debut: "2026-09", fin: "2026-09", multi: false } },
  ];

  const fiche = (extra = {}) => {
    api.get.mockImplementation(async (url) => {
      if (url === "/admin/affiliates/overview") return { data: APERCU };
      if (url === "/admin/affiliates") return { data: [AFFILIE] };
      if (url === "/admin/affiliates/risk") return { data: null };
      if (url.includes("/payouts/pay-1/detail")) {
        return { data: {
          payout: VERSEMENTS[0], lines: COMMISSIONS_AUDIT,
          lines_count: 2, lines_sum_cad: 142.5,
          payout_amount_cad: 142.5, difference: 0,
        } };
      }
      if (url.startsWith("/admin/affiliates/aff-1")) {
        return { data: {
          affiliate: { ...AFFILIE, terms_version: "2026-08-25b",
                       terms_accepted_at: "2026-09-14T11:00:00", ...extra.affiliate },
          terms_version_required: extra.requise ?? "2026-08-25b",
          referrals: COMMISSIONS_AUDIT, payouts: VERSEMENTS,
          metrics: { cumulative_revenue: 1187.5, rolling12_revenue: 1187.5,
                     pending_commission: 0, approved_commission: 0,
                     paid_commission: 142.5, reversed_commission: 82.5,
                     excluded_commission: 0, quarter_revenue: 0,
                     commission_rate: 0.12, payout_min_cad: 50 },
          series: [], last_notice: null } };
      }
      return { data: {} };
    });
  };

  it("dit QUELLES conditions il a acceptées, et quand", async () => {
    /* Zéro occurrence de `terms_version` dans tout l'écran avant : la première
     * pièce qu'on sort quand un affilié conteste une clause n'était nulle
     * part, alors qu'elle arrivait déjà du serveur. */
    fiche();
    await ouvrirFiche();

    const dossier = screen.getByTestId("affiliate-detail-modal");
    expect(dossier).toHaveTextContent("2026-08-25b");
    expect(dossier).toHaveTextContent(/conditions accept/i);
  });

  it("ANNONCE qu'une révision attend sa signature", async () => {
    // Comparer deux numéros de version de tête, au moment où quelqu'un
    // conteste une clause, c'est exactement ce qu'on rate.
    fiche({ requise: "2026-10-01a" });
    await ouvrirFiche();

    const avis = await screen.findByTestId("conditions-en-attente");
    expect(avis).toHaveTextContent("2026-08-25b");
    expect(avis).toHaveTextContent("2026-10-01a");
  });

  it("ne crie pas quand la version signée est la bonne", async () => {
    fiche();
    await ouvrirFiche();

    expect(screen.queryByTestId("conditions-en-attente")).not.toBeInTheDocument();
  });

  it("montre la date d'APPROBATION, et pas seulement celle de la commande", async () => {
    /* « Vous dites septembre, mais ma commande est du 29 août » : c'est
     * l'approbation qui rend la commission payable et qui décide de son mois.
     * La table ne montrait que `created_at`. */
    fiche();
    await ouvrirFiche();

    const ligne = screen.getByTestId("commission-FN-1001");
    expect(ligne).toHaveTextContent("2026-08-29");
    expect(ligne).toHaveTextContent("2026-09-05");
  });

  it("DIT TOUT d'une commande remboursée : quand, et si l'argent était parti", async () => {
    /* La pastille disait « récupérée » et s'arrêtait là. Pour un audit, la
     * question est : quand, et restait-il quelque chose à récupérer. */
    fiche();
    await ouvrirFiche();

    const reprise = screen.getByTestId("commission-reprise-FN-1002");
    expect(reprise).toHaveTextContent(/rembours/i);
    expect(reprise).toHaveTextContent(/28/);
    expect(reprise).toHaveTextContent(/après versement/i);
    expect(reprise).toHaveTextContent("82.50");
  });

  it("relie chaque commission AU VERSEMENT qui l'a payée", async () => {
    /* `payout_id` existait dans les données et n'était affiché nulle part :
     * « quand ai-je été payé pour cette commande » obligeait à comparer des
     * dates de tête entre deux tableaux. */
    fiche();
    await ouvrirFiche();

    expect(screen.getByTestId("commission-versement-FN-1001")).toBeInTheDocument();
  });

  it("OUVRE LE DÉTAIL COMPLET d'un versement sans quitter la fiche", async () => {
    // « Le détail complet de chaque paiement ». Il existait, mais seulement
    // depuis l'écran Paiements : on perd le fil d'un audit en changeant d'écran.
    fiche();
    await ouvrirFiche();

    await userEvent.click(screen.getByTestId("commission-versement-FN-1001"));

    const panneau = await screen.findByTestId("fiche-versement");
    expect(panneau).toHaveTextContent("142.50");
    expect(panneau).toHaveTextContent("0xabc");
    expect(screen.getByTestId("versement-ligne-FN-1001")).toBeInTheDocument();
    expect(screen.getByTestId("versement-ligne-FN-1002"))
      .toHaveTextContent(/rembours/i);
  });

  it("laisse filtrer sur ce qu'on cherche vraiment", async () => {
    /* « Montrez-moi toutes mes commandes remboursées » est la demande la plus
     * fréquente d'un affilié qui conteste, et il fallait la lire à l'œil dans
     * une table de cinq cents lignes. */
    fiche();
    await ouvrirFiche();

    await userEvent.click(screen.getByTestId("filtre-reprises"));

    expect(screen.getByTestId("commission-FN-1002")).toBeInTheDocument();
    expect(screen.queryByTestId("commission-FN-1001")).not.toBeInTheDocument();
  });

  it("les compteurs du filtre viennent des lignes affichées", async () => {
    // Deux nombres qui ne concordent pas sur un écran d'audit valent moins
    // que pas de nombre du tout.
    fiche();
    await ouvrirFiche();

    expect(screen.getByTestId("filtre-tous")).toHaveTextContent("2");
    expect(screen.getByTestId("filtre-reprises")).toHaveTextContent("1");
  });
});
