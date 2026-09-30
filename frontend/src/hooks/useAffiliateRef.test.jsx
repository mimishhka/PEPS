// L'arrivée par un lien de parrainage : ce qui est retenu, ce qui est oublié.
//
// Depuis que la caisse affiche le code dans le champ de rabais AVANT de le
// valider (demande de Mireille, 29/09/2026 : « il doit apparaître dans le
// champ coupon »), ce qui est retenu ici devient visible. Un code mort ne
// doit donc pas y rester : « Appliquer » ne répondrait que « code invalide »,
// sur un code que la personne n'a pas tapé.

import { render, waitFor } from "@testing-library/react";

import useAffiliateRef from "./useAffiliateRef";
import { codeAffiliePourPaiement } from "../lib/codeParrainage";
import api from "../lib/api";

let mockChemin = { pathname: "/", search: "?ref=LOLA10", hash: "" };

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

jest.mock("react-router-dom", () => ({
  useLocation: () => mockChemin,
}));

function Sonde() {
  useAffiliateRef();
  return null;
}

const refus = (status) => {
  const e = new Error(`HTTP ${status}`);
  e.response = { status };
  return Promise.reject(e);
};

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockChemin = { pathname: "/", search: "?ref=LOLA10", hash: "" };
});

test("le code du lien est retenu, en majuscules", async () => {
  api.get.mockResolvedValue({ data: { ok: true } });
  mockChemin = { pathname: "/product/bpc-157", search: "?ref=lola10", hash: "" };

  render(<Sonde />);

  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(codeAffiliePourPaiement()).toBe("LOLA10");
});

test("le clic est journalisé avec la page d'arrivée", async () => {
  // Le lien produit, le code QR et le lien d'accueil suivent le même chemin :
  // la capture ne fait aucun cas particulier de la page d'accueil.
  api.get.mockResolvedValue({ data: { ok: true } });
  mockChemin = { pathname: "/product/bpc-157", search: "?ref=LOLA10", hash: "" };

  render(<Sonde />);

  await waitFor(() => expect(api.get).toHaveBeenCalled());
  const [url, options] = api.get.mock.calls[0];
  expect(url).toBe("/affiliate/ref/LOLA10");
  expect(options.params.page).toBe("/product/bpc-157");
});

test("un code INCONNU s'oublie : le backend rend 404", async () => {
  // Code inexistant, faute de frappe dans un lien partagé, ou affilié qui
  // n'est plus actif. Sans cet oubli, la caisse afficherait ce code mort.
  api.get.mockImplementation(() => refus(404));

  render(<Sonde />);

  await waitFor(() => expect(codeAffiliePourPaiement()).toBe(""));
});

test("une PANNE de réseau n'oublie rien", async () => {
  /* La distinction qui compte. Un backend endormi, un tunnel coupé, un
   * bloqueur trop zélé : le code est peut-être parfaitement valide et c'est la
   * requête qui a échoué. L'oublier là ferait perdre son rabais à la personne
   * et sa commission à l'affilié — pour une panne passagère. */
  api.get.mockImplementation(() => Promise.reject(new Error("Network Error")));

  render(<Sonde />);

  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(codeAffiliePourPaiement()).toBe("LOLA10");
});

test("une erreur serveur non plus", async () => {
  // 500 : le serveur a un problème, pas le code.
  api.get.mockImplementation(() => refus(500));

  render(<Sonde />);

  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(codeAffiliePourPaiement()).toBe("LOLA10");
});

test("sans ?ref= dans l'URL, rien n'est touché", async () => {
  // Le hook est monté sur TOUTES les pages : il ne doit agir que sur un lien.
  window.sessionStorage.setItem("fn_ref_code", "DEJALA");
  api.get.mockResolvedValue({ data: { ok: true } });
  mockChemin = { pathname: "/catalog", search: "", hash: "" };

  render(<Sonde />);

  expect(api.get).not.toHaveBeenCalled();
  expect(codeAffiliePourPaiement()).toBe("DEJALA");
});

test("l'ancienne copie en localStorage est effacée", async () => {
  // Une version déployée brièvement gardait le code 365 jours dans
  // localStorage : un client venu une fois par un lien obtenait le rabais à
  // chaque commande de l'année suivante. L'entrée est inerte, mais c'est une
  // donnée qu'on n'a plus aucune raison de détenir.
  window.localStorage.setItem("fn_ref_code", "VIEUXCODE");
  api.get.mockResolvedValue({ data: { ok: true } });

  render(<Sonde />);

  expect(window.localStorage.getItem("fn_ref_code")).toBeNull();
});
