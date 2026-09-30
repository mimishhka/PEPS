// La page des instructions de paiement quitte l'écran à la déconnexion.
//
// MIREILLE, 29/09/2026 : « lorsque je me déconnecte alors que je suis sur la
// page des instructions de paiement, celle-ci reste là — cela n'a pas lieu
// d'être ».
//
// La LISTE des pages a ses propres tests dans lib/deconnexion. Ceux-ci
// vérifient le CÂBLAGE : que l'évènement est bien écouté, que la navigation
// part, qu'elle REMPLACE l'entrée d'historique, et qu'elle ne part pas
// ailleurs. C'est ce branchement qui manquait.

import { render, act } from "@testing-library/react";

import EvacuationALaDeconnexion from "./EvacuationALaDeconnexion";

const mockNavigate = jest.fn();
let mockChemin = { pathname: "/" };

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockChemin,
}));

const seDeconnecter = () => {
  // L'évènement réel, celui que purgeClientSession émet dans AuthContext.
  act(() => {
    window.dispatchEvent(new Event("fironova:session-cleared"));
  });
};

beforeEach(() => {
  mockNavigate.mockClear();
  mockChemin = { pathname: "/" };
});

test("LE CAS DE MIREILLE : on quitte les instructions de paiement", () => {
  mockChemin = { pathname: "/order/6f2a-91bc" };
  render(<EvacuationALaDeconnexion />);

  seDeconnecter();

  // `replace` : sans lui, le bouton « précédent » ramènerait sur la page qu'on
  // vient de quitter, et la protection ne tiendrait qu'un clic.
  expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
});

test("une page publique ordinaire n'est pas dérangée", () => {
  // Se déconnecter depuis le catalogue doit rester sans effet visible :
  // évacuer large serait une gêne, pas une protection.
  mockChemin = { pathname: "/catalog" };
  render(<EvacuationALaDeconnexion />);

  seDeconnecter();

  expect(mockNavigate).not.toHaveBeenCalled();
});

test("sans déconnexion, rien ne bouge", () => {
  // Le composant est monté en permanence, sur toutes les pages : il ne doit
  // agir QUE sur l'évènement.
  mockChemin = { pathname: "/order/6f2a-91bc" };
  render(<EvacuationALaDeconnexion />);

  expect(mockNavigate).not.toHaveBeenCalled();
});

test("le composant suit la navigation", () => {
  /* La page courante est lue par une référence, pour ne pas détacher et
   * rattacher l'écouteur à chaque navigation. Le risque de cette optimisation
   * est précis : une référence jamais mise à jour figerait la première page
   * visitée, et l'évacuation se déclencherait — ou pas — selon où la personne
   * est ARRIVÉE, pas selon où elle se trouve. */
  mockChemin = { pathname: "/catalog" };
  const { rerender } = render(<EvacuationALaDeconnexion />);

  mockChemin = { pathname: "/order/6f2a-91bc" };
  rerender(<EvacuationALaDeconnexion />);

  seDeconnecter();

  expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
});

test("l'ecouteur est retire au demontage", () => {
  // Sinon chaque montage en empilerait un de plus, et une seule déconnexion
  // déclencherait autant de navigations.
  mockChemin = { pathname: "/order/6f2a-91bc" };
  const { unmount } = render(<EvacuationALaDeconnexion />);
  unmount();

  seDeconnecter();

  expect(mockNavigate).not.toHaveBeenCalled();
});

test("le composant n'affiche rien", () => {
  // Il est monté au-dessus de toute la mise en page : le moindre nœud rendu
  // s'y verrait.
  mockChemin = { pathname: "/" };
  const { container } = render(<EvacuationALaDeconnexion />);
  expect(container).toBeEmptyDOMElement();
});
