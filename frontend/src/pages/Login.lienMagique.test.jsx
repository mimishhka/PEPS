// L'écran qui suit une demande de lien magique.
//
// MIREILLE, 01/10/2026, après quatre tentatives sans rien recevoir : « ok
// c'est mon erreur... si une adresse n'existe pas il faudrait proposer la
// création d'un compte ».
//
// Son adresse de test portait un `+lili` : Gmail la livre dans la même boîte,
// mais pour le système c'est une chaîne différente, donc aucun compte. Le
// serveur se tait alors volontairement — révéler quelles adresses sont
// inscrites permettrait de les énumérer.
//
// Ce choix est bon. L'écran, lui, affirmait « Un lien de connexion a été
// envoyé à … » : une contre-vérité, précisément dans le cas où la personne a
// le plus besoin d'être guidée. Et il n'offrait que « renvoyer » : on pouvait
// redemander indéfiniment un courriel qui ne viendrait jamais.
//
// LA CRÉATION DE COMPTE NE PEUT PAS ÊTRE CONDITIONNELLE : ne la proposer que
// pour les adresses inconnues reviendrait à révéler lesquelles le sont. Les
// deux sorties sont donc toujours offertes, et le texte est conditionnel.
//
// Cette page n'avait aucun test.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Login from "./Login";

const mockRequestMagic = jest.fn();

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ search: "", state: null, pathname: "/login" }),
}));

jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ login: jest.fn(), requestMagic: mockRequestMagic }),
}));
jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr", t: () => "" }),   // t vide : on lit les replis FR
}));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("../components/brand", () => ({
  MolecularMesh: () => null, Wordmark: () => null, FnMark: () => null,
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (c, nom) => (nom === "__esModule" ? true : () => null),
}));

const ADRESSE_SANS_COMPTE = "mireillel041+lili@gmail.com";

const demanderUnLien = async (adresse = ADRESSE_SANS_COMPTE) => {
  render(<Login />);
  // Le mode « lien magique » est celui par défaut de cette page.
  const champ = await screen.findByTestId("login-magic-email");
  await userEvent.type(champ, adresse);
  await userEvent.click(screen.getByTestId("login-magic-submit"));
  await screen.findByTestId("magic-sent");
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  // La réponse du serveur est UNIFORME : elle ne dit jamais si le compte
  // existe. C'est ce qui rend l'écran responsable de la suite.
  mockRequestMagic.mockResolvedValue({ ok: true });
});

test("LE CAS DE MIREILLE : on propose de créer un compte", async () => {
  await demanderUnLien();

  const lien = screen.getByTestId("magic-create-account");
  expect(lien).toBeInTheDocument();
  expect(lien).toHaveAttribute("href", "/register");
});

test("l'écran ne PRÉTEND plus qu'un courriel est parti", async () => {
  /* « Un lien de connexion a été envoyé à … » était faux quand aucun compte
   * ne correspondait — et c'est exactement là que la personne lit le plus
   * attentivement. La formulation conditionnelle est vraie dans les deux cas
   * et reste identique, donc elle ne révèle rien. */
  await demanderUnLien();

  const carte = screen.getByTestId("magic-sent");
  expect(carte).toHaveTextContent(/si un compte existe/i);
  expect(carte).toHaveTextContent(ADRESSE_SANS_COMPTE);
  expect(carte).not.toHaveTextContent(/a été envoyé à/i);
});

test("les deux causes réelles sont nommées", async () => {
  // Les indésirables, et l'absence de compte. Sans elles, il ne reste qu'à
  // redemander — ce que Mireille a fait quatre fois.
  await demanderUnLien();

  const aide = screen.getByTestId("magic-no-account");
  expect(aide).toHaveTextContent(/indésirables/i);
  expect(aide).toHaveTextContent(/pas encore de compte/i);
});

test("on peut toujours renvoyer ou changer d'adresse", async () => {
  // La sortie d'avant ne disparaît pas : une faute de frappe reste la cause
  // la plus fréquente.
  await demanderUnLien();

  await userEvent.click(screen.getByText(/renvoyer ou changer/i));
  await waitFor(() => {
    expect(screen.queryByTestId("magic-sent")).not.toBeInTheDocument();
  });
  expect(screen.getByTestId("login-magic-email")).toBeInTheDocument();
});

test("la proposition ne dépend PAS de l'existence du compte", async () => {
  /* LA PROPRIÉTÉ DE SÉCURITÉ, et la raison pour laquelle la création est
   * offerte à tout le monde.
   *
   * Ne la montrer que pour les adresses inconnues reviendrait à répondre
   * « cette adresse n'a pas de compte » — exactement ce que le serveur
   * refuse de dire, et ce qui permettrait d'énumérer la clientèle.
   *
   * L'écran doit donc être le même, quelle que soit la réponse. */
  mockRequestMagic.mockResolvedValue({ ok: true, existing: true });
  await demanderUnLien("compte-qui-existe@example.com");

  expect(screen.getByTestId("magic-create-account")).toBeInTheDocument();
  expect(screen.getByTestId("magic-sent")).toHaveTextContent(/si un compte existe/i);
});
