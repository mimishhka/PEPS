// Le bloc de suivi, tel que la cliente le voit.
//
// `lib/suivi` a ses propres tests ; celui-ci vérifie que l'écran montre ce
// que la règle calcule — et surtout LE NUMÉRO DE SUIVI, qui n'a jamais pu
// s'afficher parce que la page le cherchait dans le mauvais champ.

import { render, screen } from "@testing-library/react";

import SuiviCommande from "./SuiviCommande";

jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr", t: (k) => k }),
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const COMMANDE = {
  payment_status: "paid",
  fulfillment_status: "shipped",
  paid_at: "2026-10-01T20:44:00Z",
  shipping_info: { tracking_number: "1234567890123456", shipped_at: "2026-10-03T12:00:00Z" },
  shipping_address: {
    full_name: "Lola Tremblay", address1: "123 rue Principale",
    city: "Québec", province: "QC", postal_code: "G1A 1A1", country: "CA",
  },
};

const etape = (cle) => screen.getByTestId(`etape-${cle}`);

describe("la frise", () => {
  test("les quatre étapes sont là, dans l'ordre", () => {
    render(<SuiviCommande order={COMMANDE} />);
    const cles = [...screen.getByTestId("suivi-etapes").children]
      .map((li) => li.getAttribute("data-testid"));
    expect(cles).toEqual(["etape-payee", "etape-preparation", "etape-expediee", "etape-livree"]);
  });

  test("chacune annonce son état dans le document", () => {
    render(<SuiviCommande order={COMMANDE} />);
    expect(etape("payee")).toHaveAttribute("data-etat", "faite");
    expect(etape("expediee")).toHaveAttribute("data-etat", "courante");
    expect(etape("livree")).toHaveAttribute("data-etat", "avenir");
  });

  test("les dates connues s'affichent, les autres ne laissent pas de trou", () => {
    render(<SuiviCommande order={COMMANDE} />);
    expect(screen.getByTestId("etape-date-payee")).toBeInTheDocument();
    expect(screen.getByTestId("etape-date-expediee")).toBeInTheDocument();
    expect(screen.queryByTestId("etape-date-livree")).toBeNull();
  });

  test("c'est une liste ordonnée, pas une rangée de pastilles", () => {
    // Un lecteur d'écran annonce alors « 3 sur 4 ».
    render(<SuiviCommande order={COMMANDE} />);
    expect(screen.getByTestId("suivi-etapes").tagName).toBe("OL");
  });
});

describe("le numéro de suivi", () => {
  test("LE DÉFAUT D'ORIGINE : il s'affiche enfin", () => {
    // La page le cherchait dans `shipping_info.tracking` ; le serveur écrit
    // `tracking_number`. Le bloc existait et ne venait jamais.
    render(<SuiviCommande order={COMMANDE} />);
    expect(screen.getByTestId("suivi-numero")).toHaveTextContent("1234567890123456");
  });

  test("avec le lien vers Postes Canada", () => {
    render(<SuiviCommande order={COMMANDE} />);
    const lien = screen.getByTestId("suivi-lien-postes-canada");
    expect(lien).toHaveAttribute("href", expect.stringContaining("searchFor=1234567890123456"));
    expect(lien).toHaveAttribute("target", "_blank");
    expect(lien).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  test("rien ne s'affiche quand il n'y a pas de numéro", () => {
    render(<SuiviCommande order={{ ...COMMANDE, shipping_info: {} }} />);
    expect(screen.queryByTestId("suivi-numero")).toBeNull();
  });
});

describe("l'adresse de livraison", () => {
  test("elle est là, et c'est une balise `address`", () => {
    render(<SuiviCommande order={COMMANDE} />);
    const bloc = screen.getByTestId("suivi-adresse");
    expect(bloc).toHaveTextContent("Lola Tremblay");
    expect(bloc).toHaveTextContent("123 rue Principale");
    expect(bloc).toHaveTextContent("Québec, QC");
    expect(bloc.querySelector("address")).not.toBeNull();
  });

  test("une commande sans adresse n'affiche pas de bloc vide", () => {
    render(<SuiviCommande order={{ ...COMMANDE, shipping_address: null }} />);
    expect(screen.queryByTestId("suivi-adresse")).toBeNull();
  });
});
