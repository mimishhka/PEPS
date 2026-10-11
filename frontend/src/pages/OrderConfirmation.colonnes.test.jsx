// Deux colonnes seulement quand il y a deux colonnes.
//
// MIREILLE, 11/10/2026, devant une commande remboursée sur son ordinateur :
// « pourquoi le détail est comprimé sur la droite ? »
//
// La grille était fixe — `1.25fr` pour les instructions de paiement, `.75fr`
// pour le récapitulatif. Or les instructions n'existent que si
// `payment_status` vaut « awaiting_etransfer » ou « awaiting_crypto ». Dès
// que la commande est payée, la colonne de gauche était un div VIDE et le
// récapitulatif se retrouvait dans 410 px sur les 1152 de la page.
//
// CE N'ÉTAIT PAS UN DÉFAUT DES COMMANDES REMBOURSÉES. C'était l'état normal
// de la page après paiement : payée, remboursée, annulée, expédiée — toutes
// sauf celles qui attendent encore d'être réglées. Elle est tombée dessus sur
// une commande remboursée, mais chaque cliente ayant payé voyait la même
// chose.
//
// Ce fichier parcourt donc LES ÉTATS DE PAIEMENT, pas le seul cas signalé :
// c'est la méthode qui a sorti les défauts que l'examen écran par écran ne
// trouvait pas.

import { render, screen } from "@testing-library/react";

import OrderConfirmation from "./OrderConfirmation";
import api from "../lib/api";

let mockEtat = {};
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "o-1" }),
  useLocation: () => ({ state: mockEtat, search: "" }),
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

const mockConfirm = jest.fn(async () => true);
jest.mock("../components/ConfirmDialog", () => ({ useConfirm: () => mockConfirm }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const COMMANDE = {
  id: "o-1", order_number: "FN-1", created_at: "2026-09-01T10:00:00Z",
  payment_status: "paid", fulfillment_status: "processing", user_id: "u-1",
  items: [{ product_id: "p-1", qty: 4, name_fr: "BPC-157", name_en: "BPC-157", line_total: 259.96 }],
  subtotal: 259.96, total: 233.96, shipping: 0, discount: 26,
};

const INSTRUCTIONS_INTERAC = {
  type: "interac",
  instructions: {
    send_to: "paiement@fironova.ca", amount_cad: 233.96, reference: "FN-1",
    security_question: "Quel produit ?", security_answer_hint: "fironova",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  mockConfirm.mockResolvedValue(true);
});

/* La grille est le PARENT direct du récapitulatif. On la lit depuis lui
 * plutôt que par une classe : une classe se renomme, un lien de parenté
 * non. */
const grille = () => screen.getByTestId("confirmation-recap").parentElement;
const recap = () => screen.getByTestId("confirmation-recap");

const rendre = (commande) => {
  mockEtat = { order: { ...COMMANDE, ...commande } };
  return render(<OrderConfirmation />);
};

describe("sans instructions de paiement, le récapitulatif a toute la largeur", () => {
  /* Les états où la colonne de gauche n'a rien à montrer : plus rien à
   * payer, et pas de suivi non plus — une commande remboursée, annulée ou
   * échouée n'est pas en route, la frise mentirait.
   *
   * « paid » EST SORTI DE CETTE LISTE le 11/10/2026, et c'est un progrès et
   * non un recul : depuis l'audit de l'espace client, une commande payée
   * affiche son suivi à gauche. La colonne n'est plus vide parce qu'on y a
   * mis ce qui manquait — voir le groupe suivant. */
  const ETATS_SANS_PAIEMENT = ["refunded", "cancelled", "failed"];

  test.each(ETATS_SANS_PAIEMENT)("« %s » : pas de grille à deux colonnes", (statut) => {
    rendre({ payment_status: statut });
    expect(grille().className).not.toMatch(/grid-cols-/);
  });

  test.each(ETATS_SANS_PAIEMENT)("« %s » : pas de colonne vide à côté", (statut) => {
    rendre({ payment_status: statut });
    // Le récapitulatif est seul dans son parent : s'il a un frère, c'est le
    // div vide qui prenait 690 px.
    expect(grille().children).toHaveLength(1);
    expect(grille().children[0]).toBe(recap());
  });

  test.each(ETATS_SANS_PAIEMENT)("« %s » : rien ne reste collé sans voisin", (statut) => {
    rendre({ payment_status: statut });
    // Un bloc collant qui n'accompagne la lecture de rien reste figé en haut
    // sans raison visible.
    expect(recap().className).not.toMatch(/sticky/);
  });

  test("LE CAS EXACT DE MIREILLE : une commande remboursée", () => {
    rendre({ payment_status: "refunded", refund_status: "processed" });
    expect(grille().className).not.toMatch(/grid-cols-/);
    expect(screen.queryByTestId("interac-instructions")).toBeNull();
    expect(screen.queryByTestId("crypto-instructions")).toBeNull();
    // Et le détail est bien là, pas perdu en route.
    expect(recap()).toHaveTextContent(/BPC-157/);
  });
});

describe("une commande payée montre son suivi à gauche", () => {
  /* Audit de l'espace client du 06/10/2026, sections 2, 5 et 6 : la colonne
   * de gauche était vide sur la page la plus consultée après achat, et le
   * suivi — étapes, adresse, numéro — n'était nulle part. Les deux constats
   * n'en font qu'un. */
  test("la grille à deux colonnes revient", () => {
    rendre({ payment_status: "paid" });
    expect(grille().className).toMatch(/grid-cols-\[1\.25fr_\.75fr\]/);
    expect(grille().children).toHaveLength(2);
  });

  test("et la colonne de gauche porte bien le suivi", () => {
    rendre({ payment_status: "paid" });
    expect(screen.getByTestId("suivi-commande")).toBeInTheDocument();
    expect(grille().children[0]).toContainElement(screen.getByTestId("suivi-commande"));
  });

  test("UNE COMMANDE REMBOURSÉE N'AFFICHE PAS DE FRISE", () => {
    // Elle n'est pas en route : des étapes « Expédiée → Livrée » y seraient
    // un mensonge, et c'est le cas exact que Mireille avait sous les yeux.
    rendre({ payment_status: "refunded", refund_status: "processed" });
    expect(screen.queryByTestId("suivi-commande")).toBeNull();
  });

  test("ni une commande qui attend encore son paiement", () => {
    rendre({ payment_status: "awaiting_etransfer", payment_info: INSTRUCTIONS_INTERAC });
    expect(screen.queryByTestId("suivi-commande")).toBeNull();
  });
});

describe("avec instructions de paiement, les deux colonnes reviennent", () => {
  test("un virement Interac en attente garde la grille", () => {
    rendre({ payment_status: "awaiting_etransfer", payment_info: INSTRUCTIONS_INTERAC });
    expect(grille().className).toMatch(/grid-cols-\[1\.25fr_\.75fr\]/);
  });

  test("et les instructions occupent bien la colonne de gauche", () => {
    rendre({ payment_status: "awaiting_etransfer", payment_info: INSTRUCTIONS_INTERAC });
    expect(grille().children).toHaveLength(2);
    expect(screen.getByTestId("interac-instructions")).toBeInTheDocument();
  });

  test("le récapitulatif redevient collant pour accompagner la lecture", () => {
    rendre({ payment_status: "awaiting_etransfer", payment_info: INSTRUCTIONS_INTERAC });
    expect(recap().className).toMatch(/sticky/);
  });

  test("UNE ATTENTE SANS INSTRUCTIONS NE FABRIQUE PAS DE COLONNE VIDE", () => {
    // Le piège symétrique : `awaiting_etransfer` seul ne suffit pas, il faut
    // que `payment_info` porte vraiment des instructions. Sans ce garde-fou,
    // une commande dont le serveur n'a pas encore écrit le bloc de paiement
    // retomberait exactement dans le défaut qu'on corrige.
    rendre({ payment_status: "awaiting_etransfer", payment_info: null });
    expect(grille().className).not.toMatch(/grid-cols-/);
    expect(grille().children).toHaveLength(1);
  });
});
