// Le premier test de comportement du frontend, et il garde une PANNE REELLE.
//
// `refresh` dependait de `user` alors qu'il ecrit dedans. Chaque reponse creait
// un objet neuf, l'identite de `user` changeait, useCallback recreait `refresh`,
// et le useEffect qui en depend se redeclenchait. Mesure faite dans le
// navigateur sur l'environnement de previsualisation : SIX requetes par seconde
// vers /api/auth/me, par onglet, sans fin.
//
// Rien ne l'avait vu. Le lint passait, le build passait, les tests backend
// passaient : le code est valide, c'est son COMPORTEMENT qui s'emballe. Il a
// fallu ouvrir une page et compter les requetes. Ce test compte a notre place.
import { render, screen, waitFor } from "@testing-library/react";

import { AuthProvider, useAuth } from "./AuthContext";
import api from "../lib/api";

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
}));

function Sonde() {
  const { user, checking } = useAuth();
  if (checking) return <p>chargement</p>;
  return <p>{user ? user.email : "invite"}</p>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Repond comme le ferait le reseau : un OBJET NEUF a chaque appel.
 *
 * Ce detail est tout le sujet. Avec un objet reutilise, React compare les
 * references, ne voit aucun changement d'etat et arrete la boucle de lui-meme
 * apres deux tours — le test passerait meme sur le code fautif. Une reponse
 * HTTP, elle, est desérialisée a neuf a chaque fois, et rien n'arrete la
 * boucle.
 *
 * Le plafond n'est pas une precaution : sans lui, une regression ferait TOURNER
 * le test a l'infini au lieu de le faire echouer.
 */
function reponseNeuveAChaqueAppel(corps, plafond = 10) {
  let appels = 0;
  api.get.mockImplementation(async () => {
    appels += 1;
    if (appels > plafond) {
      throw new Error(`Boucle detectee : ${appels} appels a /auth/me`);
    }
    return { data: { ...corps } };
  });
}

describe("AuthProvider", () => {
  it("n'appelle /auth/me qu'une seule fois pour une session ouverte", async () => {
    reponseNeuveAChaqueAppel({ id: "u1", email: "mireille@example.com" });

    render(<AuthProvider><Sonde /></AuthProvider>);
    await screen.findByText("mireille@example.com");

    // Laisse tourner plusieurs tours de boucle d'evenements : si `refresh`
    // etait recree a chaque reponse, les appels s'empileraient ici.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/auth/me");
  });

  it("n'appelle /auth/me qu'une seule fois pour un visiteur non connecte", async () => {
    // Le chemin qui bouclait le plus : sans session, `user` reste null, mais
    // setUser(null) suffisait a redeclencher le cycle si la dependance revenait.
    reponseNeuveAChaqueAppel({});

    render(<AuthProvider><Sonde /></AuthProvider>);
    await screen.findByText("invite");

    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("ne deconnecte pas sur une panne reseau passagere", async () => {
    // Garde la seconde intention du composant : une erreur de transport ne
    // doit pas vider une session deja en memoire.
    api.get.mockRejectedValue(new Error("Network Error"));

    render(<AuthProvider><Sonde /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("invite")).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
