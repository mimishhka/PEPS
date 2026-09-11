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
import userEvent from "@testing-library/user-event";

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

function reponses({ payouts = [], runs = [], paymentRuns = [RUN], listeBlanche = [] } = {}) {
  // Les URL exactes du composant : « payouts/all » pour la liste,
  // « payouts/runs » pour les generations, « payments/runs » pour les envois.
  api.get.mockImplementation(async (url) => {
    if (url.startsWith("/admin/affiliates/payouts/all")) return { data: payouts };
    // Les deux historiques repondent { runs: [...] }, pas un tableau nu.
    if (url.startsWith("/admin/affiliates/payouts/runs")) return { data: { runs } };
    if (url.startsWith("/admin/affiliates/payments/runs")) return { data: { runs: paymentRuns } };
    if (url.startsWith("/admin/affiliates/whitelist/pending"))
      return { data: { items: listeBlanche, count: listeBlanche.length } };
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
  it("n'annonce pas « automatique » une generation lancee a la main", async () => {
    // `auto` porte parfois une CHAINE — « manual_c003a85f » — qui est vraie en
    // JavaScript. Vos deux generations de 2026-07, toutes deux manuelles,
    // s'affichaient l'une « automatique » et l'autre « manuelle ».
    reponses({ runs: [
      { period: "2026-07", auto: "manual_c003a85f", is_auto: false,
        status: "done", started_at: "2026-08-14T21:20:48.474350+00:00" },
      { period: "2026-07", auto: false, is_auto: false,
        status: "done", started_at: "2026-08-14T21:19:43.670560+00:00" },
    ] });
    render(<AdminPayouts />);
    await screen.findByTestId("admin-payouts");

    await waitFor(() =>
      expect(screen.getAllByText("manuelle")).toHaveLength(2));
    expect(screen.queryByText("automatique")).not.toBeInTheDocument();
  });

  it("dit pourquoi un versement ne partira jamais tout seul", async () => {
    // Un releve est cree meme sans adresse de versement : il s'affiche
    // « pret », l'envoi echoue, et la seule issue est de le marquer paye a la
    // main — sans que l'ecran ait jamais dit pourquoi.
    reponses({ payouts: [{
      id: "p-1", status: "ready", affiliate_code: "FITNES70", period: "2026-08",
      amount_cad: 28.5, amount: 20.52, currency: "usdt", referral_count: 4,
      payout_address: "",
    }] });
    render(<AdminPayouts />);
    await screen.findByTestId("admin-payouts");

    await waitFor(() =>
      expect(screen.getByTestId("payout-no-address-p-1")).toBeInTheDocument());
  });
  describe("mode simple", () => {
    const PRET = {
      id: "p-1", status: "ready", affiliate_code: "FITNES70", period: "2026-08",
      amount_cad: 28.5, amount: 20.52, currency: "usdt", referral_count: 4,
      payout_address: "0xabc",
    };

    it("masque tout ce qui depend de NOWPayments tant qu'il n'a jamais servi", async () => {
      reponses({ payouts: [PRET], paymentRuns: [] });
      render(<AdminPayouts />);
      await screen.findByTestId("admin-payouts");

      expect(await screen.findByTestId("payouts-mode-simple")).toBeInTheDocument();
      // Envoi en lot, execution et selection : sans objet ici.
      expect(screen.queryByTestId("batch-send")).not.toBeInTheDocument();
      expect(screen.queryByTestId("execute-p-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("select-all")).not.toBeInTheDocument();
      // Ce qui sert reste, et « Marquer paye » devient l'action principale.
      expect(screen.getByTestId("run-payouts")).toBeInTheDocument();
      expect(screen.getByTestId("markpaid-open-p-1").className).toMatch(/btn-nova/);
    });

    it("ne propose pas de filtrer sur un statut qui ne peut pas survenir", async () => {
      reponses({ payouts: [PRET], paymentRuns: [] });
      render(<AdminPayouts />);
      await screen.findByTestId("admin-payouts");

      const filtre = screen.getByTestId("payout-filter-status");
      const valeurs = [...filtre.querySelectorAll("option")].map((o) => o.value);
      expect(valeurs).not.toContain("creating");
      expect(valeurs).not.toContain("dispatching");
      expect(valeurs).toContain("ready");
      expect(valeurs).toContain("paid_manual");
    });

    it("revient de lui-meme des qu'un versement a emprunte le chemin automatique", async () => {
      // La detection porte sur les FAITS, pas sur un reglage.
      reponses({ payouts: [{ ...PRET, id: "p-2", status: "processing" }] });
      render(<AdminPayouts />);
      await screen.findByTestId("admin-payouts");

      await waitFor(() =>
        expect(screen.getByTestId("batch-send")).toBeInTheDocument());
      expect(screen.queryByTestId("payouts-mode-simple")).not.toBeInTheDocument();
    });

    it("laisse une sortie pour amorcer le premier versement automatique", async () => {
      reponses({ payouts: [PRET], paymentRuns: [] });
      render(<AdminPayouts />);
      await screen.findByTestId("admin-payouts");

      await userEvent.click(await screen.findByTestId("payouts-mode-full"));
      expect(await screen.findByTestId("execute-p-1")).toBeInTheDocument();
      expect(screen.getByTestId("batch-send")).toBeInTheDocument();
    });
  });
  it("ouvre le contenu d'un lot quand on clique dessus", async () => {
    // La ligne annoncait « 2 versements » sans aucun moyen de savoir LESQUELS.
    // Le numero de lot est ecrit sur chaque versement ; il fallait pouvoir le
    // chercher — c'est ce qui rend un lot verifiable.
    reponses({ payouts: [{
      id: "p-1", status: "paid", affiliate_code: "FITNES70", period: "2026-08",
      amount_cad: 28.5, amount: 20.52, currency: "usdt", referral_count: 4,
      payout_address: "0xabc", run_id: "NP-000001",
    }] });
    render(<AdminPayouts />);
    await screen.findByTestId("admin-payouts");

    await userEvent.click(await screen.findByTestId("run-open-NP-000001"));

    // La liste se filtre sur ce lot, et l'ecran le DIT — sinon on croirait que
    // les autres versements ont disparu.
    expect(await screen.findByTestId("payouts-filtre-lot")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/admin/affiliates/payouts/all",
                                           { params: { q: "NP-000001" } }));
  });

  it("nomme les deux historiques par ce qu'ils contiennent", async () => {
    // « Generations recentes » et « Runs de paiement » : quatre mots pour deux
    // idees — ce qu'on calcule, et ce qu'on envoie.
    reponses({ runs: [{ period: "2026-07", is_auto: false, status: "done",
                        started_at: "2026-08-14T21:19:43.670560+00:00" }] });
    render(<AdminPayouts />);
    await screen.findByTestId("admin-payouts");

    expect(await screen.findByText(/Historique des calculs/)).toBeInTheDocument();
    expect(screen.getByText(/Historique des envois/)).toBeInTheDocument();
  });
  describe("liste blanche NOWPayments", () => {
    const ENTREE = {
      affiliate_id: "aff-1", code: "FITNES70", ticker: "usdttrc20",
      address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      label: "Affiliate FITNES70 - Kyro1 Stlouis1",
    };

    it("annonce les adresses a ajouter, en disant a qui elles appartiennent", async () => {
      reponses({ listeBlanche: [ENTREE] });
      render(<AdminPayouts />);
      const bandeau = await screen.findByTestId("whitelist-pending");
      expect(bandeau).toHaveTextContent(/1 adresse\(s\) à ajouter/);
      expect(bandeau).toHaveTextContent("Affiliate FITNES70 - Kyro1 Stlouis1");
    });

    it("ne dit rien quand tout est deja en liste blanche", async () => {
      reponses({ listeBlanche: [] });
      render(<AdminPayouts />);
      await screen.findByTestId("admin-payouts");
      expect(screen.queryByTestId("whitelist-pending")).not.toBeInTheDocument();
    });

    it("confirme exactement les adresses affichees", async () => {
      reponses({ listeBlanche: [ENTREE] });
      api.post.mockResolvedValue({ data: { confirmed: 1, skipped: [] } });
      render(<AdminPayouts />);
      await userEvent.click(await screen.findByTestId("whitelist-confirm"));
      await waitFor(() => expect(api.post).toHaveBeenCalledWith(
        "/admin/affiliates/whitelist/confirm",
        { entrees: [{ affiliate_id: "aff-1", ticker: "usdttrc20",
                      address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }] }));
    });

    it("signale sur la ligne un versement vers une adresse non confirmee", async () => {
      reponses({
        listeBlanche: [ENTREE],
        payouts: [{ id: "p-1", status: "ready", affiliate_code: "FITNES70",
                    period: "2026-08", amount_cad: 28.5, amount: 20.52,
                    currency: "usdt", referral_count: 4,
                    payout_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }],
      });
      render(<AdminPayouts />);
      expect(await screen.findByTestId("payout-not-whitelisted-p-1")).toBeInTheDocument();
    });
  });
});
