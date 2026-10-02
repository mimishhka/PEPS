// Définir son mot de passe la première fois.
//
// MIREILLE, 01/10/2026 : « pour établir la première fois le mot de passe ça
// demande l'ancien mot de passe — chose impossible lorsque la personne n'a pas
// créé son compte avec un mot de passe ».
//
// LE DÉFAUT N'ÉTAIT PAS ICI. Cet écran traitait déjà le cas : il masque le
// champ, change le titre, ajoute une explication, et omet `current_password`
// de la requête. Le serveur aussi faisait la bonne chose — il n'exige rien
// pour un compte passwordless, le cookie de session faisant foi.
//
// C'est `_public_user_payload` qui RETIRAIT le drapeau `passwordless` de la
// fiche envoyée au navigateur, avec `password_hash` et `token_version`. Il
// valait donc toujours faux ici, le champ s'affichait `required`, et le
// formulaire ne pouvait pas être soumis.
//
// Ces tests tiennent le CONTRAT entre les deux moitiés : l'écran se comporte
// correctement selon le drapeau, et le drapeau doit donc lui parvenir. Le test
// backend `test_mot_de_passe_premiere_fois.py` tient l'autre bout.
//
// Le fichier Account.commandes.test.jsx notait « le reste de la page (profil,
// adresses, sécurité) reste à faire ». Voici la sécurité.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Account from "./Account";
import api from "../lib/api";

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ search: "", pathname: "/account" }),
  useSearchParams: () => [new URLSearchParams(""), jest.fn()],
}));

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  formatApiError: (e) => String(e),
}));

/* LE VRAI DICTIONNAIRE, et non un `t` qui rend la clé.
 *
 * Un mock qui rend la clé laisserait passer une traduction MANQUANTE : c'est
 * précisément ce qui s'était produit ici. `t()` rend `node ?? path`, donc une
 * clé absente s'affiche en toutes lettres, et l'écriture
 * `t("account.setPassword") || "Définir un mot de passe"` ne tombe jamais sur
 * son repli. Personne ne l'avait vu parce que cette branche était
 * inatteignable — le serveur ne renvoyait pas le drapeau `passwordless`.
 *
 * En branchant le dictionnaire réel, ces tests vérifient ce que la personne
 * LIT, et tombent si une clé disparaît. */
jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({
    t: (cle) => jest.requireActual("../lib/i18n").t("fr", cle),
    lang: "fr",
  }),
}));

/* Mutable : c'est précisément le drapeau qu'on fait varier. Préfixé `mock`
   parce que Jest hisse les fabriques de `jest.mock` au-dessus des
   déclarations. */
let mockUser = null;
jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("../hooks/useAffiliate", () => ({ __esModule: true, default: () => ({ affiliate: null }) }));
jest.mock("../components/ThemeToggle", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/CustomerSupport", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/NomEnDeux", () => ({ __esModule: true, default: () => null }));
const mockConfirm = jest.fn(async () => true);
jest.mock("../components/ConfirmDialog", () => ({ useConfirm: () => mockConfirm }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const BASE = { id: "u-1", email: "lola@example.com", name: "Lola" };

const ouvrirSecurite = async (user) => {
  mockUser = user;
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: { ok: true } });
  api.post.mockResolvedValue({ data: { ok: true } });
  render(<Account />);
  await userEvent.click(await screen.findByTestId("account-tab-security"));
  return screen.findByTestId("password-form");
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
});

describe("un compte SANS mot de passe", () => {
  test("LE CAS DE MIREILLE : on ne lui demande pas un ancien mot de passe", async () => {
    /* Il n'en a pas. Le champ était `required` : le formulaire ne pouvait pas
     * être soumis, et aucun message n'expliquait pourquoi. */
    await ouvrirSecurite({ ...BASE, passwordless: true });

    expect(screen.queryByTestId("password-current")).not.toBeInTheDocument();
  });

  test("et l'écran dit qu'il DÉFINIT un mot de passe, pas qu'il le change", async () => {
    // « Changer » suppose qu'il en existe un. Le titre et l'explication
    // disent ce qui se passe vraiment.
    const form = await ouvrirSecurite({ ...BASE, passwordless: true });

    expect(form).toHaveTextContent(/définir un mot de passe/i);
    expect(form).toHaveTextContent(/liens de connexion/i);
  });

  test("LES TRADUCTIONS EXISTENT — pas une clé brute à l'écran", async () => {
    /* `t()` rend la clé quand la traduction manque, et les trois chaînes de
     * cet écran étaient écrites `t("...") || "repli"` — un repli qui ne se
     * déclenche jamais. Les clés étaient absentes du dictionnaire : réparer le
     * drapeau aurait fait apparaître « account.setPassword » en toutes
     * lettres. */
    const form = await ouvrirSecurite({ ...BASE, passwordless: true });

    expect(form).not.toHaveTextContent(/account\./);
    expect(screen.getByTestId("password-save")).not.toHaveTextContent(/account\./);
  });

  test("la requête N'EMPORTE PAS de `current_password`", async () => {
    /* Même vide, la clé ferait échouer la vérification côté serveur pour un
     * compte qui aurait entre-temps acquis un mot de passe. On l'omet. */
    await ouvrirSecurite({ ...BASE, passwordless: true });

    await userEvent.type(screen.getByTestId("password-new"), "nouveau-mot-de-passe");
    await userEvent.type(screen.getByTestId("password-confirm"), "nouveau-mot-de-passe");
    await userEvent.click(screen.getByTestId("password-save"));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [url, corps] = api.put.mock.calls[0];
    expect(url).toBe("/account/password");
    expect(corps).toEqual({ new_password: "nouveau-mot-de-passe" });
    expect(corps).not.toHaveProperty("current_password");
  });
});

describe("un compte AVEC mot de passe", () => {
  test("l'ancien reste demandé — la correction ne désarme rien", async () => {
    await ouvrirSecurite({ ...BASE, passwordless: false });

    expect(screen.getByTestId("password-current")).toBeInTheDocument();
    expect(screen.getByTestId("password-form"))
      .not.toHaveTextContent(/liens de connexion|sign-in links/i);
  });

  test("et il part dans la requête", async () => {
    await ouvrirSecurite({ ...BASE, passwordless: false });

    await userEvent.type(screen.getByTestId("password-current"), "ancien");
    await userEvent.type(screen.getByTestId("password-new"), "nouveau-mot-de-passe");
    await userEvent.type(screen.getByTestId("password-confirm"), "nouveau-mot-de-passe");
    await userEvent.click(screen.getByTestId("password-save"));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][1]).toEqual({
      current_password: "ancien",
      new_password: "nouveau-mot-de-passe",
    });
  });
});

describe("le drapeau absent", () => {
  test("une fiche SANS `passwordless` se comporte comme un compte avec mot de passe", async () => {
    /* C'est le comportement sûr : on demande l'ancien plutôt que de laisser
     * quelqu'un écraser un mot de passe sans le connaître. C'est aussi
     * exactement ce qui se produisait pour TOUT LE MONDE avant la correction —
     * le serveur ne renvoyait jamais le champ. */
    await ouvrirSecurite({ ...BASE });

    expect(screen.getByTestId("password-current")).toBeInTheDocument();
  });
});
