// Publier ou masquer une page, depuis l'administration.
//
// MIREILLE, 21/10/2026 : « cache le endpoint coa lab (rajoute-le du côté admin
// là où je peux publier ou non des pages), cache aussi À propos pour l'instant ».
//
// L'ENDROIT N'EXISTAIT PAS. `/lab` vivait derrière une variable
// d'environnement — un accès au serveur et un redémarrage pour masquer une
// page — et `/about` n'avait aucun interrupteur.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminPages from "./AdminPages";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
  formatApiError: (e) => String(e),
}));
jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const PAGES = [
  { slug: "lab", route: "/lab", name_fr: "Labo — vérification de lot",
    name_en: "Lab", published: false },
  { slug: "about", route: "/about", name_fr: "À propos",
    name_en: "About", published: false },
  { slug: "certificats", route: "/certificats", name_fr: "Certificats d'analyse",
    name_en: "COA", published: true },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: PAGES });
  api.put.mockResolvedValue({ data: {} });
});

test("chaque page montre son nom ET SA ROUTE", async () => {
  // Sans la route, « lab » ne dit pas quelle page on s'apprête à masquer.
  render(<AdminPages />);
  expect(await screen.findByTestId("page-lab")).toHaveTextContent("/lab");
  expect(screen.getByTestId("page-about")).toHaveTextContent("À propos");
});

test("l'état de publication est lisible sans cliquer", async () => {
  render(<AdminPages />);
  expect(await screen.findByTestId("bascule-lab")).toHaveAttribute("data-publiee", "non");
  expect(screen.getByTestId("bascule-certificats")).toHaveAttribute("data-publiee", "oui");
});

test("basculer envoie l'état VISÉ au serveur", async () => {
  render(<AdminPages />);
  fireEvent.click(await screen.findByTestId("bascule-lab"));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith("/admin/pages/lab", { published: true }));
});

test("L'INTERRUPTEUR REVIENT SI LE SERVEUR REFUSE", async () => {
  /* L'état change tout de suite pour que le clic se voie. Mais s'il restait
   * changé après un refus, l'écran montrerait une page publiée qui ne l'est
   * pas — et c'est pire que la lenteur qu'on cherchait à éviter. */
  api.put.mockRejectedValue(new Error("refus"));
  render(<AdminPages />);
  const bouton = await screen.findByTestId("bascule-lab");
  fireEvent.click(bouton);
  await waitFor(() => expect(bouton).toHaveAttribute("data-publiee", "non"));
});

test("le bouton dit son état aux lecteurs d'écran", async () => {
  render(<AdminPages />);
  expect(await screen.findByTestId("bascule-certificats")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("bascule-lab")).toHaveAttribute("aria-pressed", "false");
});
