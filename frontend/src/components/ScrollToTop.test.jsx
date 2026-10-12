// Les ancres du site menaient toutes en haut de leur page.
//
// MIREILLE, 11/10/2026 : « pourquoi le lien qui renvoie à l'entreposage ne me
// conduit qu'à la page des FAQ ».
//
// CE N'ÉTAIT PAS LE LIEN, C'ÉTAIT LA MÉCANIQUE. Le composant portait la ligne
// « laisser le navigateur gérer l'ancre » — une règle écrite, d'apparence
// appliquée, et jamais effective : le navigateur ne traite une ancre qu'au
// chargement d'un document, et ici la navigation est interne.
//
// LE TEST QUI COMPTE EST CELUI DE LA SECTION QUI ARRIVE EN RETARD. Les routes
// sont chargées en différé : au moment où le hash change, la cible n'existe
// pas encore. Un correctif qui ne cherche qu'une fois aurait l'air juste, et
// n'aurait rien réparé.

import { act, render } from "@testing-library/react";

import ScrollToTop from "./ScrollToTop";

const mockPosition = { pathname: "/faq", hash: "" };

jest.mock("react-router-dom", () => ({
  useLocation: () => mockPosition,
}));

const poser = (id) => {
  const el = document.createElement("div");
  el.id = id;
  el.scrollIntoView = jest.fn();
  document.body.appendChild(el);
  return el;
};

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  window.scrollTo = jest.fn();
  mockPosition.pathname = "/faq";
  mockPosition.hash = "";
});

afterEach(() => {
  jest.useRealTimers();
});

describe("sans ancre", () => {
  test("on remonte en haut de la page", () => {
    render(<ScrollToTop />);
    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    );
  });
});

describe("avec une ancre", () => {
  test("la section déjà présente reçoit le défilement", () => {
    const el = poser("storage");
    mockPosition.hash = "#storage";
    render(<ScrollToTop />);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  test("ON NE REMONTE PAS EN HAUT quand une ancre est demandée", () => {
    // Sinon les deux se battent : on saute à la section, puis on repart en
    // haut, et le lien paraît cassé alors qu'il a fonctionné.
    poser("storage");
    mockPosition.hash = "#storage";
    render(<ScrollToTop />);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  test("LA SECTION QUI ARRIVE EN RETARD EST QUAND MÊME ATTEINTE", () => {
    /* C'est le cas réel : les pages sont chargées en différé, donc le DOM de
     * la FAQ n'existe pas à l'instant où l'URL change. Un correctif qui
     * cherche une seule fois ne trouve rien et se tait. */
    mockPosition.hash = "#storage";
    render(<ScrollToTop />);

    let el;
    act(() => {
      jest.advanceTimersByTime(120);
      el = poser("storage");
      jest.advanceTimersByTime(120);
    });

    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  test("une ancre qui n'existe nulle part finit par abandonner", () => {
    // Elle ne doit ni jeter, ni faire sauter la page sous les doigts de
    // quelqu'un qui a commencé à lire. Une seconde, puis on se tait.
    mockPosition.hash = "#inexistante";
    render(<ScrollToTop />);

    expect(() => {
      act(() => { jest.advanceTimersByTime(5000); });
    }).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  test("une ancre vide se comporte comme pas d'ancre", () => {
    mockPosition.hash = "#";
    render(<ScrollToTop />);
    expect(jest.getTimerCount()).toBe(0);
  });
});
