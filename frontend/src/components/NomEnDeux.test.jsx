// Prénom et nom en deux champs, un seul champ stocké.
//
// Demandé le 2026-09-20 : « pour la création d'adresse dans le compte,
// l'affilié ou le client, il n'y a qu'un champ, il devrait y en avoir deux ».
// Le stockage, lui, reste `full_name` : c'est ce que lit l'étiquette de
// Postes Canada et la recherche de commandes.
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import NomEnDeux, { composerNom, separerNom } from "./NomEnDeux";

function Formulaire({ depart = "" }) {
  const [valeur, setValeur] = useState(depart);
  return (
    <div>
      <NomEnDeux valeur={valeur} onChange={setValeur} lang="fr" prefix="adr" />
      <span data-testid="stocke">{valeur}</span>
      <button data-testid="autre-adresse" onClick={() => setValeur("Ana Silva")}>autre</button>
    </div>
  );
}

it("decoupe un nom existant en deux champs", () => {
  render(<Formulaire depart="Marie Tremblay" />);
  expect(screen.getByTestId("adr-first-name")).toHaveValue("Marie");
  expect(screen.getByTestId("adr-last-name")).toHaveValue("Tremblay");
});

it("le nom de famille prend le reste, pas le prenom", () => {
  // Les noms composes sont bien plus frequents que les prenoms composes, et
  // la recomposition reste fidele dans les deux cas.
  expect(separerNom("Marie Claire Tremblay")).toEqual({ prenom: "Marie", nom: "Claire Tremblay" });
  expect(separerNom("  Jean-Luc   Roy  ")).toEqual({ prenom: "Jean-Luc", nom: "Roy" });
  expect(separerNom("Cher")).toEqual({ prenom: "Cher", nom: "" });
  expect(separerNom("")).toEqual({ prenom: "", nom: "" });
  expect(composerNom(" Marie ", " Tremblay ")).toBe("Marie Tremblay");
});

it("stocke un seul champ, tel que l etiquette l attend", () => {
  render(<Formulaire />);
  fireEvent.change(screen.getByTestId("adr-first-name"), { target: { value: "Camille" } });
  fireEvent.change(screen.getByTestId("adr-last-name"), { target: { value: "Blais" } });
  expect(screen.getByTestId("stocke")).toHaveTextContent("Camille Blais");
});

it("un espace tape dans le prenom ne saute pas dans l autre champ", () => {
  // Le piege : a chaque frappe, la valeur stockee revient dans le composant.
  // Sans memoire de ce qu'il vient d'ecrire, il redecouperait et la lettre
  // suivante partirait dans le champ du nom.
  render(<Formulaire />);
  const prenom = screen.getByTestId("adr-first-name");
  fireEvent.change(prenom, { target: { value: "Marie " } });
  fireEvent.change(prenom, { target: { value: "Marie C" } });
  expect(prenom).toHaveValue("Marie C");
  expect(screen.getByTestId("adr-last-name")).toHaveValue("");
});

it("choisir une autre adresse remplit bien les deux champs", () => {
  render(<Formulaire depart="Marie Tremblay" />);
  fireEvent.click(screen.getByTestId("autre-adresse"));
  expect(screen.getByTestId("adr-first-name")).toHaveValue("Ana");
  expect(screen.getByTestId("adr-last-name")).toHaveValue("Silva");
});

it("les deux champs portent l autocompletion attendue", () => {
  // C'est elle qui evite les « Tremblay Marie » inverses.
  render(<Formulaire />);
  expect(screen.getByTestId("adr-first-name")).toHaveAttribute("autocomplete", "given-name");
  expect(screen.getByTestId("adr-last-name")).toHaveAttribute("autocomplete", "family-name");
});
