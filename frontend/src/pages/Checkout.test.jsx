// La vérification d'adresse pendant la saisie.
//
// L'endpoint /checkout/validate-address existait depuis le début, sa note
// disait « appelé par le frontend AVANT la soumission finale », et personne
// ne l'appelait. La vérification n'avait donc lieu qu'à l'envoi, en 422 :
// le client remplissait tout, attestait son âge, acceptait les conditions,
// choisissait son paiement, cliquait « Placer la commande », et découvrait
// alors que son adresse ne passait pas.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Checkout from "./Checkout";
import api from "../lib/api";

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
              name_en: "BPC-157", price: 64.99, slug: "bpc-157-5mg" }],
    subtotal: 64.99, clear: jest.fn(),
  }),
}));
jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr", t: (k) => k }) }));
jest.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
jest.mock("../contexts/SiteConfigContext", () => ({ useSiteConfig: () => ({ config: {} }) }));
jest.mock("../lib/codeParrainage", () => ({ codeAffiliePourPaiement: () => null }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const remplirAdresse = async () => {
  await userEvent.type(screen.getByTestId("shipping-line1"), "123 rue Saint-Denis");
  await userEvent.type(screen.getByTestId("shipping-city"), "Montreal");
  await userEvent.type(screen.getByTestId("shipping-postal"), "H2X1Y4");
};

// Minuteurs REELS. `userEvent` v14 se bloque avec les minuteurs simules de
// CRA : chaque frappe attend un avancement qui ne vient jamais, et le test
// expire a 5 s sans rien dire de plus. La pause avant verification est de
// 700 ms, donc les attentes portent un delai explicite.
const ATTENTE = { timeout: 3000 };

beforeEach(() => {
  jest.clearAllMocks();
  // Le checkout CONSERVE son brouillon pour qu'on puisse se connecter en
  // cours de route sans tout reperdre. En test, ce brouillon fuit d'un cas au
  // suivant : la province choisie ici revenait la, et les adresses tapees
  // s'empilaient dans le meme champ. C'est la fonctionnalite qui est bonne,
  // c'est le test qui doit repartir a zero.
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.get.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { valid: true, suggestions: [], provider: "google_maps" } });
});

jest.setTimeout(15000);

it("le code postal remplit la province tout seul", async () => {
  render(<Checkout />);
  await userEvent.type(screen.getByTestId("shipping-postal"), "H2X1Y4");

  // H, G, J : le Québec. La première lettre DÉSIGNE la province.
  expect(screen.getByTestId("shipping-province")).toHaveValue("QC");
  expect(screen.getByTestId("shipping-postal")).toHaveValue("H2X 1Y4");
});

it("n écrase pas une province déjà choisie", async () => {
  render(<Checkout />);
  await userEvent.selectOptions(screen.getByTestId("shipping-province"), "ON");
  await userEvent.type(screen.getByTestId("shipping-postal"), "H2X1Y4");

  // Écraser une saisie volontaire serait pire que de ne rien faire — mais le
  // désaccord, lui, se dit.
  expect(screen.getByTestId("shipping-province")).toHaveValue("ON");
  expect(screen.getByTestId("shipping-province-desaccord")).toHaveTextContent("QC");
});

it("signale un code postal mal formé pendant la frappe", async () => {
  render(<Checkout />);
  await userEvent.type(screen.getByTestId("shipping-postal"), "H2X1");

  expect(screen.getByTestId("shipping-postal-erreur")).toBeInTheDocument();
});

it("vérifie l adresse sans attendre le bouton de commande", async () => {
  render(<Checkout />);
  await remplirAdresse();

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith("/checkout/validate-address",
      expect.objectContaining({ postal_code: "H2X 1Y4", province: "QC" }));
  }, ATTENTE);
  await waitFor(() => expect(screen.getByTestId("adresse-verifiee")).toBeInTheDocument(), ATTENTE);
});

it("ne dit rien quand le service est coupé", async () => {
  // Sans clé, le serveur répond « disabled » et laisse tout passer. Afficher
  // « adresse vérifiée » serait un mensonge.
  api.post.mockResolvedValue({ data: { valid: true, suggestions: [], provider: "disabled" } });
  render(<Checkout />);
  await remplirAdresse();

  await waitFor(() => expect(api.post).toHaveBeenCalled(), ATTENTE);
  expect(screen.queryByTestId("adresse-verifiee")).not.toBeInTheDocument();
});

it("ne dit rien quand la vérification échoue", async () => {
  // Un échec de vérification n'est pas une adresse invalide.
  api.post.mockRejectedValue(new Error("reseau"));
  render(<Checkout />);
  await remplirAdresse();

  await waitFor(() => expect(api.post).toHaveBeenCalled(), ATTENTE);
  expect(screen.queryByTestId("adresse-a-corriger")).not.toBeInTheDocument();
  expect(screen.queryByTestId("adresse-verifiee")).not.toBeInTheDocument();
});

it("n interroge pas le service sur une adresse incomplète", async () => {
  // Le plafond est de 30 vérifications par minute : inutile de le dépenser
  // pour une adresse dont on sait déjà qu'elle est incomplète.
  render(<Checkout />);
  await userEvent.type(screen.getByTestId("shipping-line1"), "123 rue Saint-Denis");

  await new Promise((r) => setTimeout(r, 200));
  expect(api.post).not.toHaveBeenCalledWith("/checkout/validate-address", expect.anything());
});

// LA BOUCLE. La « suggestion » renvoyée est l'adresse NORMALISÉE de ce qu'on
// vient d'envoyer : elle corrige l'orthographe, jamais l'existence. Un client
// à qui il manque le numéro d'appartement se voyait proposer sa propre
// adresse, l'acceptait, et se la voyait reproposer.
const SUGGESTION_IDENTIQUE = {
  formattedAddress: "123 rue Saint-Denis, Montreal, QC H2X 1Y4",
  postalAddress: { addressLines: ["123 rue Saint-Denis"], locality: "Montreal",
                   administrativeArea: "QC", postalCode: "H2X 1Y4", regionCode: "CA" },
};

it("demande l appartement au lieu de reproposer la meme adresse", async () => {
  api.post.mockResolvedValue({ data: { valid: false, provider: "google_maps",
    reason: "manque_appartement", suggestions: [SUGGESTION_IDENTIQUE] } });
  render(<Checkout />);
  await remplirAdresse();

  const bloc = await screen.findByTestId("adresse-a-corriger", {}, ATTENTE);
  expect(bloc).toHaveTextContent("numéro d'appartement");
  // Le bouton disparait : cliquer n'aurait rien change.
  expect(screen.queryByTestId("adresse-appliquer")).not.toBeInTheDocument();
});

it("dit que le numero civique n est pas confirme", async () => {
  api.post.mockResolvedValue({ data: { valid: false, provider: "google_maps",
    reason: "non_confirme", suggestions: [SUGGESTION_IDENTIQUE] } });
  render(<Checkout />);
  await remplirAdresse();

  const bloc = await screen.findByTestId("adresse-a-corriger", {}, ATTENTE);
  expect(bloc).toHaveTextContent("numéro civique");
  expect(screen.queryByTestId("adresse-appliquer")).not.toBeInTheDocument();
});

it("ne propose pas une correction identique a ce qui est saisi", async () => {
  // Meme motif « orthographe » : si la suggestion ne change rien, le bouton
  // ne sert a rien.
  api.post.mockResolvedValue({ data: { valid: false, provider: "google_maps",
    reason: "orthographe", suggestions: [SUGGESTION_IDENTIQUE] } });
  render(<Checkout />);
  await remplirAdresse();

  await screen.findByTestId("adresse-a-corriger", {}, ATTENTE);
  expect(screen.queryByTestId("adresse-appliquer")).not.toBeInTheDocument();
  expect(screen.getByTestId("adresse-sans-correction")).toBeInTheDocument();
});

it("propose la correction quand elle change vraiment l adresse", async () => {
  api.post.mockResolvedValue({ data: { valid: false, provider: "google_maps",
    reason: "orthographe", suggestions: [{
      formattedAddress: "123 Rue Saint-Denis, Montréal, QC H2X 1Y4",
      postalAddress: { addressLines: ["123 Rue Saint-Denis"], locality: "Montréal",
                       administrativeArea: "QC", postalCode: "H2X 1Y4", regionCode: "CA" },
    }] } });
  render(<Checkout />);
  await remplirAdresse();

  await screen.findByTestId("adresse-a-corriger", {}, ATTENTE);
  await userEvent.click(screen.getByTestId("adresse-appliquer"));

  expect(screen.getByTestId("shipping-city")).toHaveValue("Montréal");
});

// DEUX CASES A COCHER, TROIS ATTESTATIONS ENREGISTREES.
//
// Mireille : « il me semble qu'il y a trop de trucs a cocher ». Elle a raison
// sur l'ecran — trois cases pour valider une commande, c'est lourd. Mais
// chacune est conservee sur la commande avec l'heure et l'adresse IP : c'est
// sa preuve en cas de litige, pas une formalite.
//
// On a donc fusionne LE CLIC, pas LE REGISTRE. Les deux declarations qui
// portent sur la cliente — son age et l'usage qu'elle fera des produits —
// partagent une case dont le libelle enonce les DEUX faits. Le serveur
// continue de recevoir confirm_age et confirm_research_use separement.
//
// L'acceptation des conditions reste a part : au Quebec, la Loi sur la
// protection du consommateur demande une acceptation EXPRESSE du contrat.
describe("les attestations du checkout", () => {
  it("n'affiche plus que deux cases", async () => {
    render(<Checkout />);
    await screen.findByTestId("checkout-page");

    expect(screen.getByTestId("checkout-confirm-age")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-accept-policy")).toBeInTheDocument();
    // La troisieme case n'existe plus : son attestation vit dans la premiere.
    expect(screen.queryByTestId("checkout-accept-ruo")).not.toBeInTheDocument();
  });

  it("enonce les DEUX faits dans le libelle de la case fusionnee", async () => {
    // Fusionner sans enoncer les deux faits perdrait l'attestation : la
    // cliente doit declarer explicitement ce qu'on enregistre en son nom.
    render(<Checkout />);
    await screen.findByTestId("checkout-page");

    const etiquette = screen.getByTestId("checkout-confirm-age").closest("label");
    expect(etiquette).toHaveTextContent(/ans ou plus/i);
    expect(etiquette).toHaveTextContent(/usage de recherche uniquement \(RUO\)/i);
  });

  it("un seul clic pose les deux attestations", async () => {
    render(<Checkout />);
    await screen.findByTestId("checkout-page");

    const fusionnee = screen.getByTestId("checkout-confirm-age");
    expect(fusionnee).not.toBeChecked();
    await userEvent.click(fusionnee);
    expect(fusionnee).toBeChecked();

    // Et un second clic les retire toutes les deux : l'etat reste coherent
    // dans les deux sens, sinon une commande partirait avec une attestation
    // posee et l'autre non.
    await userEvent.click(fusionnee);
    expect(fusionnee).not.toBeChecked();
  });

  it("nomme les deux cases manquantes sous le bouton, sans en inventer une troisieme", async () => {
    render(<Checkout />);
    await screen.findByTestId("checkout-page");

    const manque = await screen.findByTestId("checkout-manque");
    expect(manque).toHaveTextContent(/Confirmez votre âge et l'usage recherche/i);
    // L'ancien message demandait de cocher une case qui n'existe plus.
    expect(manque).not.toHaveTextContent(/Acceptez l'usage recherche\./i);
  });
});
