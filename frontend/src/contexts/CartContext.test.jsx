// Le panier mis de côté à la déconnexion.
//
// Signalé le 2026-09-20 : « j'ai un produit qui reste collé dans le panier
// peu importe ce que je fais », sur deux navigateurs différents.
//
// La cause : ce panier de secours ne s'effaçait jamais. `refresh()` rejoue
// « session rétablie » à CHAQUE chargement de page ; l'article retiré
// revenait donc au rechargement suivant, indéfiniment.
import { act, render, screen } from "@testing-library/react";

import { CartProvider, useCart } from "./CartContext";

jest.mock("sonner", () => ({ toast: { custom: jest.fn(), dismiss: jest.fn() } }));
jest.mock("../components/ProductImage", () => ({
  __esModule: true, default: () => null,
}));

const CLE_PANIER = "fironova_cart_v1";
const CLE_SAUVEGARDE = "fironova_cart_saved_by_user_v1";
const COURRIEL = "cliente@example.com";

const ARTICLE = {
  product_id: "p-1", variant_id: "v-1", variant_name: "5mg", slug: "bpc-157",
  name_en: "BPC-157", name_fr: "BPC-157", price_cad: 64.99, qty: 1,
};

function Temoin() {
  const { items, count, remove, clear } = useCart();
  return (
    <div>
      <span data-testid="compte">{count}</span>
      <span data-testid="lignes">{items.map((i) => i.slug).join(",")}</span>
      <button data-testid="retirer" onClick={() => remove("p-1", "v-1")}>retirer</button>
      <button data-testid="vider" onClick={clear}>vider</button>
    </div>
  );
}

const afficher = () => render(<CartProvider><Temoin /></CartProvider>);
const sauvegarde = () => JSON.parse(localStorage.getItem(CLE_SAUVEGARDE) || "{}");

const sessionRetablie = () => act(() => {
  window.dispatchEvent(new CustomEvent("fironova:session-restored",
    { detail: { email: COURRIEL } }));
});
const avantDeconnexion = () => act(() => {
  window.dispatchEvent(new CustomEvent("fironova:before-session-clear",
    { detail: { email: COURRIEL } }));
});

beforeEach(() => { localStorage.clear(); });

it("reprend le panier laissé à la déconnexion", () => {
  // C'est le service rendu, et il doit continuer de fonctionner.
  localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify({ [COURRIEL]: [ARTICLE] }));
  afficher();
  expect(screen.getByTestId("compte")).toHaveTextContent("0");

  sessionRetablie();
  expect(screen.getByTestId("compte")).toHaveTextContent("1");
  expect(screen.getByTestId("lignes")).toHaveTextContent("bpc-157");
});

it("un article retiré ne revient pas au rechargement suivant", () => {
  // LE défaut signalé. La reprise est unique : elle consomme la sauvegarde.
  localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify({ [COURRIEL]: [ARTICLE] }));
  afficher();
  sessionRetablie();
  expect(screen.getByTestId("compte")).toHaveTextContent("1");

  act(() => { screen.getByTestId("retirer").click(); });
  expect(screen.getByTestId("compte")).toHaveTextContent("0");

  sessionRetablie();                       // rechargement de page
  expect(screen.getByTestId("compte")).toHaveTextContent("0");
  expect(sauvegarde()[COURRIEL]).toBeUndefined();
});

it("se déconnecter avec un panier vide efface la sauvegarde", () => {
  // Deuxième chemin qui gardait l'article en vie : on sortait avant d'écrire
  // quand le panier était vide, et l'ancienne sauvegarde survivait.
  localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify({ [COURRIEL]: [ARTICLE] }));
  afficher();

  avantDeconnexion();
  expect(sauvegarde()[COURRIEL]).toBeUndefined();

  sessionRetablie();
  expect(screen.getByTestId("compte")).toHaveTextContent("0");
});

it("un panier en cours n'est jamais écrasé par l'ancien", () => {
  localStorage.setItem(CLE_PANIER, JSON.stringify([{ ...ARTICLE, slug: "en-cours", qty: 2 }]));
  localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify({ [COURRIEL]: [ARTICLE] }));
  afficher();

  sessionRetablie();
  expect(screen.getByTestId("lignes")).toHaveTextContent("en-cours");
  expect(screen.getByTestId("compte")).toHaveTextContent("2");
  // La sauvegarde périmée part quand même : sinon elle réapparaîtrait le jour
  // où le panier redevient vide.
  expect(sauvegarde()[COURRIEL]).toBeUndefined();
});

it("après un paiement, l article ne revient pas non plus", () => {
  // « Même si je passe au checkout il revient » : le paiement appelle
  // clear(), le panier repartait vide, et le rechargement suivant le
  // remplissait de nouveau avec l ancien contenu.
  localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify({ [COURRIEL]: [ARTICLE] }));
  afficher();
  sessionRetablie();
  expect(screen.getByTestId("compte")).toHaveTextContent("1");

  act(() => { screen.getByTestId("vider").click(); });      // ce que fait le checkout
  sessionRetablie();
  expect(screen.getByTestId("compte")).toHaveTextContent("0");
  expect(sauvegarde()[COURRIEL]).toBeUndefined();
});

it("vider le panier n efface que SA sauvegarde", () => {
  // Deux comptes se sont connectes sur ce navigateur : vider le panier de
  // l un ne doit pas jeter le panier mis de cote par l autre.
  localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify({
    [COURRIEL]: [ARTICLE], "autre@example.com": [ARTICLE] }));
  afficher();
  sessionRetablie();
  act(() => { screen.getByTestId("vider").click(); });

  expect(sauvegarde()[COURRIEL]).toBeUndefined();
  expect(sauvegarde()["autre@example.com"]).toHaveLength(1);
});

it("la déconnexion met de côté un panier réellement rempli", () => {
  localStorage.setItem(CLE_PANIER, JSON.stringify([ARTICLE]));
  afficher();
  expect(screen.getByTestId("compte")).toHaveTextContent("1");

  avantDeconnexion();
  expect(sauvegarde()[COURRIEL]).toHaveLength(1);
});
