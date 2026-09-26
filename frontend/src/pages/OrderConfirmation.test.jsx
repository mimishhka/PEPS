// La demande d'annulation ou de remboursement, sur la page de la commande.
//
// Le serveur savait la recevoir depuis longtemps ; aucune page ne la
// proposait. Avant expedition c'est une annulation, apres un signalement.
// fireEvent.change plutôt que userEvent.type pour les textes longs : la
// frappe simulée caractère par caractère dépassait le délai d'attente quand
// les dix suites tournent en parallèle, et faisait échouer un fichier au
// hasard à chaque exécution.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OrderConfirmation from "./OrderConfirmation";
import api from "../lib/api";

let mockEtat = {};
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "o-1" }),
  useLocation: () => ({ state: mockEtat, search: "" }),
  // Un vrai lien, pas seulement son contenu : sans le `to` ni le testid, la
  // destination d'un bouton ne pouvait pas etre verifiee du tout.
  Link: ({ to, children, ...reste }) => <a href={to} {...reste}>{children}</a>,
}));

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({ t: (k) => k, lang: "fr" }),
}));

// Le dialogue de confirmation du projet. Sans cette simulation, la page —
// qui l'appelle dès son ouverture — ne se rendrait plus du tout en test.
const mockConfirm = jest.fn(async () => true);
jest.mock("../components/ConfirmDialog", () => ({ useConfirm: () => mockConfirm }));

jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const COMMANDE = {
  id: "o-1", order_number: "FN-1", created_at: "2026-09-01T10:00:00Z",
  payment_status: "paid", fulfillment_status: "processing", user_id: "u-1",
  items: [{ product_id: "p-1", qty: 1, name_fr: "BPC-157", name_en: "BPC-157", line_total: 64.99 }],
  subtotal: 64.99, total: 64.99, shipping: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  // Réinstallé à CHAQUE test : Create React App règle Jest sur
  // resetMocks: true, qui efface l'implémentation de toute simulation avant
  // chaque test. Sans cette ligne, le dialogue répondait `undefined` — lu
  // comme un refus — et « Retirer ma demande » ne partait jamais.
  mockConfirm.mockResolvedValue(true);
});

it("propose l'annulation d'une commande pas encore expediee", async () => {
  mockEtat = { order: { ...COMMANDE } };
  api.post.mockResolvedValue({ data: { ok: true } });
  api.get.mockImplementation(async (url) => (url.endsWith("/messages")
    ? { data: [] }
    : { data: { ...COMMANDE, refund_status: "requested" } }));

  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-card")).toHaveTextContent(/Annuler cette commande/);
  expect(screen.getByTestId("refund-submit")).toHaveTextContent(/Demander l'annulation/);

  fireEvent.change(screen.getByTestId("refund-reason"),
                   { target: { value: "Je me suis trompé de dosage" } });
  await userEvent.click(screen.getByTestId("refund-submit"));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/orders/o-1/refund-request",
    { reason: "Je me suis trompé de dosage", refund_type: "full", refund_destination: "" },
    expect.anything()));
  expect(await screen.findByTestId("refund-status")).toHaveTextContent(/Demande reçue/);
});

it("ramene le client vers ses commandes, pas vers la vitrine", () => {
  mockEtat = { order: { ...COMMANDE } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("back-home-btn")).toHaveAttribute("href", "/account");
});

it("garde l'accueil pour une commande passee en invite", () => {
  // Sans compte, il n'y a pas de tableau de bord a proposer.
  mockEtat = { order: { ...COMMANDE, user_id: null } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("back-home-btn")).toHaveAttribute("href", "/");
});

it("titre le bloc « Remboursement » des qu'un dossier existe", () => {
  // Le titre annoncait « Annuler cette commande » au-dessus de
  // « Remboursement effectue » : on proposait d'annuler le deja-rembourse.
  mockEtat = { order: { ...COMMANDE, payment_status: "refunded", refund_status: "processed" } };
  render(<OrderConfirmation />);
  const carte = screen.getByTestId("refund-card");
  expect(carte).toHaveTextContent(/Remboursement/);
  expect(carte).not.toHaveTextContent(/Annuler cette commande/);
});

it("dit qu'une commande remboursee est remboursee, jamais en attente de paiement", () => {
  // Cas reel signale : FN-260901-3A394C25 affichait « PAIEMENT EN ATTENTE »
  // apres remboursement. Le serveur ecrit payment_status = "refunded" au
  // reglement, et la page ne connaissait que « paid » ou non : elle reclamait
  // un paiement a quelqu'un qu'on venait de rembourser.
  mockEtat = { order: { ...COMMANDE, payment_status: "refunded", refund_status: "processed" } };
  render(<OrderConfirmation />);
  const page = screen.getByTestId("confirmation-page");
  expect(page).toHaveTextContent(/Commande remboursée/);
  expect(page).not.toHaveTextContent(/PAIEMENT EN ATTENTE/);
  expect(page).not.toHaveTextContent(/compléter le paiement/);
  // Et l'etat du dossier reste lisible : la carte disparaissait justement
  // quand le remboursement aboutissait.
  expect(screen.getByTestId("refund-status")).toHaveTextContent(/Remboursement effectué/);
});

it("dit qu'une commande annulee est annulee", () => {
  mockEtat = { order: { ...COMMANDE, payment_status: "cancelled" } };
  render(<OrderConfirmation />);
  const page = screen.getByTestId("confirmation-page");
  expect(page).toHaveTextContent(/Commande annulée/);
  expect(page).not.toHaveTextContent(/compléter le paiement/);
});

it("garde l'attente de paiement pour une commande fraiche", () => {
  // Le cas normal ne doit pas regresser.
  mockEtat = { order: { ...COMMANDE, payment_status: "awaiting_etransfer" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("confirmation-page")).toHaveTextContent(/compléter le paiement/);
});

it("apres expedition, renvoie vers la conversation au lieu d'un second formulaire", () => {
  // Deux entrees qui faisaient la meme chose : un formulaire de texte et une
  // conversation. Seule la conversation accepte les photos — c'est elle qui
  // reste, et le formulaire disparait.
  mockEtat = { order: { ...COMMANDE, fulfillment_status: "delivered" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-card"))
    .toHaveTextContent(/Produit endommagé ou erreur de commande/);
  expect(screen.queryByTestId("refund-submit")).not.toBeInTheDocument();
  expect(screen.queryByTestId("refund-reason")).not.toBeInTheDocument();
  // Le fil de messages de la commande a ete retire : le signalement avec photo
  // passe desormais par un billet, seul canal restant.
  expect(screen.getByTestId("refund-open-help")).toHaveAttribute("href", "/account?tab=support");
  expect(screen.queryByTestId("problem-toggle")).not.toBeInTheDocument();
});

it("demande ou renvoyer les fonds quand la commande a ete payee en crypto", async () => {
  // NOWPayments nous dit qu'un depot est arrive, jamais de quel portefeuille.
  mockEtat = { order: { ...COMMANDE, payment_method: "nowpayments" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-destination")).toBeInTheDocument();

  fireEvent.change(screen.getByTestId("refund-reason"),
                   { target: { value: "Je me suis trompé de dosage" } });
  await userEvent.click(screen.getByTestId("refund-submit"));
  expect(screen.getByTestId("refund-error")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it("annonce le remboursement Interac a l'adresse de la commande", () => {
  mockEtat = { order: { ...COMMANDE, payment_method: "interac", email: "marie@example.com" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-destination-interac"))
    .toHaveTextContent("marie@example.com");
});

it("refuse une demande vide sans appeler le serveur", async () => {
  mockEtat = { order: { ...COMMANDE } };
  render(<OrderConfirmation />);
  fireEvent.change(screen.getByTestId("refund-reason"), { target: { value: "non" } });
  await userEvent.click(screen.getByTestId("refund-submit"));
  expect(screen.getByTestId("refund-error")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it("montre ou en est un dossier deja ouvert, sans reproposer le formulaire", () => {
  mockEtat = { order: { ...COMMANDE, refund_status: "approved" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-status")).toHaveTextContent(/approuvée/);
  expect(screen.queryByTestId("refund-reason")).not.toBeInTheDocument();
});


// ---------------------------------------------------------------------------
// Retirer une demande posée par erreur
// ---------------------------------------------------------------------------

it("le client retire sa demande posee par erreur", async () => {
  mockEtat = { order: { ...COMMANDE, refund_status: "requested", refund_source: "client" } };
  api.post.mockResolvedValue({ data: { ok: true } });
  // Après le retrait, la commande relue n'a plus de demande.
  api.get.mockImplementation(async () => ({ data: { ...COMMANDE } }));
  render(<OrderConfirmation />);

  await userEvent.click(screen.getByTestId("refund-withdraw"));

  expect(mockConfirm).toHaveBeenCalled();
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/orders/o-1/refund-request/cancel", {}, expect.anything()));
  // La demande retirée, le formulaire d'annulation revient.
  expect(await screen.findByTestId("refund-reason")).toBeInTheDocument();
});

it("rien n'est retire si le client renonce dans la confirmation", async () => {
  mockConfirm.mockResolvedValueOnce(false);
  mockEtat = { order: { ...COMMANDE, refund_status: "requested", refund_source: "client" } };
  render(<OrderConfirmation />);

  await userEvent.click(screen.getByTestId("refund-withdraw"));
  expect(api.post).not.toHaveBeenCalled();
});

it("un dossier ouvert par l'equipe ne se retire pas d'un clic", async () => {
  // Ouvert depuis un billet d'aide : c'est l'équipe qui l'a posé.
  mockEtat = { order: { ...COMMANDE, refund_status: "requested", refund_source: "admin" } };
  render(<OrderConfirmation />);
  expect(screen.queryByTestId("refund-withdraw")).not.toBeInTheDocument();
  expect(screen.getByTestId("refund-withdraw-help")).toHaveTextContent("écrivez-nous");
});

it("une demande deja approuvee ne se retire plus", async () => {
  // De l'argent est en jeu : c'est à l'équipe de trancher.
  mockEtat = { order: { ...COMMANDE, refund_status: "approved", refund_source: "client" } };
  render(<OrderConfirmation />);
  expect(screen.queryByTestId("refund-withdraw")).not.toBeInTheDocument();
});

it("le refus du serveur s'affiche au lieu de disparaitre", async () => {
  // Cas limite : l'équipe décide à la même seconde. Le serveur refuse (409)
  // et la page le dit, au lieu de laisser croire que rien ne s'est passé.
  mockEtat = { order: { ...COMMANDE, refund_status: "requested", refund_source: "client" } };
  api.post.mockRejectedValue({ response: { status: 409,
    data: { detail: "Cette demande vient d'être traitée — écrivez-nous depuis l'aide." } } });
  render(<OrderConfirmation />);

  await userEvent.click(screen.getByTestId("refund-withdraw"));
  expect(await screen.findByTestId("refund-error")).toHaveTextContent("vient d'être traitée");
});

// LE PAIEMENT EN CRYPTO SUR TELEPHONE.
//
// Mireille, deux fois. D'abord : « nowpayment page has no content » sur
// mobile. Puis, apres ma premiere correction : « tout doit se faire sur mon
// site sans jamais quitter vers un autre site, comme pour la version web ».
//
// LE DEFAUT D'ORIGINE. Le module NOWPayments est dessine pour une largeur
// FIXE de 410 px. Declare avec maxWidth: 100%, il etait ECRASE
// horizontalement sur un telephone de 320 px pendant que sa hauteur restait
// entiere : son contenu continuait de se dessiner pour 410 px, debordait, et
// scrolling="no" le rendait inatteignable. La page paraissait vide.
//
// MA PREMIERE CORRECTION ETAIT MAUVAISE. Elle masquait le module sous 640 px
// et promouvait un lien vers nowpayments.io : le symptome disparaissait en
// abandonnant l'objectif. On ne quitte pas la boutique pour payer.
//
// LA BONNE CORRECTION ne retrecit pas le cadre, elle reduit l'ENSEMBLE. Le
// module garde ses 410 px natifs — a l'interieur, il croit disposer de toute
// la place — et une transformation CSS le met a l'echelle du conteneur.
describe("le paiement en cryptomonnaie", () => {
  const AVEC_CRYPTO = {
    ...COMMANDE,
    payment_status: "awaiting_crypto",
    payment_method: "nowpayments",
    payment_info: {
      type: "nowpayments",
      provider_response: {
        invoice_id: "512345678",
        invoice_url: "https://nowpayments.io/payment/?iid=512345678",
      },
    },
  };

  const afficher = () => {
    mockEtat = { order: { ...AVEC_CRYPTO } };
    api.get.mockImplementation(async (url) => (url.endsWith("/messages")
      ? { data: [] }
      : { data: { ...AVEC_CRYPTO } }));
    return render(<OrderConfirmation />);
  };

  it("garde le paiement sur la boutique, sur tout ecran", async () => {
    // Le module est present SANS condition de taille : plus de `hidden
    // sm:block`, qui privait le telephone du paiement sur place.
    afficher();
    const module = await screen.findByTestId("nowpayments-widget");
    expect(module).toHaveAttribute(
      "src", expect.stringContaining("nowpayments.io/embeds/payment-widget"));
    expect(module.className).not.toMatch(/hidden/);
  });

  it("garde la largeur native du module, pour qu'il se dessine normalement", async () => {
    // C'est le coeur de la correction : ecraser le cadre coupait le contenu.
    afficher();
    const module = await screen.findByTestId("nowpayments-widget");
    expect(module).toHaveAttribute("width", "410");
    expect(module).toHaveAttribute("height", "696");
  });

  it("met l'ensemble a l'echelle au lieu de le decouper", async () => {
    afficher();
    const module = await screen.findByTestId("nowpayments-widget");
    // La transformation existe, et son origine est le coin superieur gauche :
    // sans cela le module serait reduit depuis son centre et deborderait.
    expect(module.style.transform).toMatch(/scale\(/);
    expect(module.style.transformOrigin).toBe("top left");
    // Et plus aucun decoupage : on ne coupe jamais un formulaire de paiement.
    expect(module).not.toHaveAttribute("scrolling", "no");
  });

  it("ne propose plus de quitter la boutique comme chemin principal", async () => {
    afficher();
    const lien = await screen.findByTestId("crypto-invoice-link");
    // Il reste, en filet de securite si le module est bloque — mais discret,
    // et il ne ressemble plus a un bouton de paiement.
    expect(lien.className).not.toMatch(/btn-nova/);
    expect(lien.textContent).toMatch(/ne s'affiche pas/i);
  });
});

// LE VISUEL DES DEUX MOYENS DE PAIEMENT.
//
// Mireille : « peut-on revoir le visuel du paiement crypto et aussi Interac ».
// Les deux blocs portaient des defauts que le craft-floor nomme explicitement.
describe("le visuel des instructions de paiement", () => {
  const INTERAC = {
    ...COMMANDE,
    payment_status: "awaiting_etransfer",
    payment_info: {
      type: "interac",
      instructions: {
        send_to: "paiements@fironova.com",
        amount_cad: 64.99,
        reference: "FN-1001-XK7",
        security_question: "Nom de la boutique ?",
        security_answer_hint: "fironova",
      },
    },
  };

  const afficherInterac = () => {
    mockEtat = { order: { ...INTERAC } };
    api.get.mockImplementation(async (url) => (url.endsWith("/messages")
      ? { data: [] }
      : { data: { ...INTERAC } }));
    return render(<OrderConfirmation />);
  };

  it("dit pourquoi le numero de reference ne doit pas etre mal recopie", async () => {
    // Les cinq champs avaient le meme poids : rien ne disait lequel relie le
    // virement a la commande. Une reference mal recopiee, c'est un paiement
    // que personne ne rattache a son achat.
    afficherInterac();
    const bloc = await screen.findByTestId("interac-instructions");
    expect(bloc).toHaveTextContent(/relie votre virement à cette commande/i);
  });

  it("n'emploie plus de glyphes en guise d'icones", async () => {
    // « ⚡ » et « ₿ » imitaient des icones sans appartenir a aucun systeme.
    afficherInterac();
    const bloc = await screen.findByTestId("interac-instructions");
    expect(bloc.textContent).not.toMatch(/⚡|₿/);
  });

  it("montre le montant crypto comme un chiffre, pas noye dans une phrase", async () => {
    const AVEC_CRYPTO = {
      ...COMMANDE,
      payment_status: "awaiting_crypto",
      payment_info: {
        type: "nowpayments",
        provider_response: { invoice_id: "512345678", invoice_url: "https://nowpayments.io/x" },
      },
    };
    mockEtat = { order: { ...AVEC_CRYPTO } };
    api.get.mockImplementation(async (url) => (url.endsWith("/messages")
      ? { data: [] }
      : { data: { ...AVEC_CRYPTO } }));
    render(<OrderConfirmation />);

    const montant = await screen.findByTestId("crypto-amount");
    expect(montant).toHaveTextContent("64.99");
    // En chasse fixe : un chiffre qui saute d'un pixel en changeant de valeur
    // est un defaut que personne ne nomme mais que tout le monde sent.
    expect(montant.className).toMatch(/tabular-nums/);
  });
});

// LA PAGE NE DOIT PAS OBLIGER A DEFILER POUR SAVOIR QUOI FAIRE.
//
// Mireille : « le client doit scroller bas pour avoir toute l'information ».
// Trois blocs se succedaient avant les instructions de paiement, et trois
// phrases y disaient la meme chose : le titre annoncait le delai, un
// paragraphe le repetait en entier, un compte a rebours le redisait. Ensemble
// ils occupaient la hauteur d'un ecran de telephone AVANT l'essentiel.
describe("la compacite de l'entete", () => {
  const EN_ATTENTE = {
    ...COMMANDE,
    payment_status: "awaiting_etransfer",
    payment_ttl_hours: 0.5,
    created_at: new Date().toISOString(),
    payment_info: {
      type: "interac",
      instructions: {
        send_to: "paiements@fironova.com",
        amount_cad: 64.99,
        reference: "FN-1001-XK7",
        security_question: "Nom ?",
        security_answer_hint: "fironova",
      },
    },
  };

  const afficher = () => {
    mockEtat = { order: { ...EN_ATTENTE } };
    api.get.mockImplementation(async (url) => (url.endsWith("/messages")
      ? { data: [] }
      : { data: { ...EN_ATTENTE } }));
    return render(<OrderConfirmation />);
  };

  it("ne dit le delai qu'une seule fois", async () => {
    afficher();
    const bandeau = await screen.findByTestId("payment-deadline-warning");
    // Une seule mention du temps restant, plus le rappel de la consequence.
    expect(bandeau).toHaveTextContent(/la commande est annulée automatiquement/i);
    // Le paragraphe qui repetait le delai en entier a disparu.
    expect(bandeau).not.toHaveTextContent(/sera automatiquement annulée si le paiement/i);
  });

  it("n'emploie plus de glyphes dans les bandeaux d'etat", async () => {
    // « ! », « ⏳ » et « ⚠ » imitaient des icones sans en etre.
    afficher();
    const bandeau = await screen.findByTestId("payment-deadline-warning");
    expect(bandeau.textContent).not.toMatch(/⏳|⚠/);
  });

  it("garde le numero de commande visible sans lui donner tout un bloc", async () => {
    afficher();
    // L'information reste — c'est la hauteur qui change, pas le contenu.
    expect(await screen.findByTestId("order-number")).toHaveTextContent("FN-1");
  });
});
