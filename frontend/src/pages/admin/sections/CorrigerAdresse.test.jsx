// Corriger une adresse que Postes Canada refuse.
//
// Mireille : « je n'ai aucun moyen de la modifier pour faire l'envoi du colis ».
// Elle avait raison : l'admin affichait l'adresse sans jamais permettre de la
// corriger, et une commande payée dont l'adresse était refusée restait bloquée
// pour toujours. Le seul recours était de rembourser.
//
// Ces tests gardent les aides qui évitent de corriger vers une autre adresse
// invalide — ce qui serait un progrès nul.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CorrigerAdresse from "./CorrigerAdresse";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { patch: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// La commande telle qu'elle arrive : province « Quebec », que Postes Canada
// refuse, et code postal sans espace.
const COMMANDE = (extra = {}) => ({
  id: "o-1",
  order_number: "FN-1001",
  shipping_address: {
    full_name: "Marie Tremblay",
    address1: "1250 rue Ste-Catherine",
    address2: "",
    city: "Montreal",
    province: "Quebec",
    postal_code: "H3G1P1",
    country: "CA",
    phone: "",
  },
  shipping_info: {},
  ...extra,
});

const afficher = (extra = {}, props = {}) =>
  render(<CorrigerAdresse order={COMMANDE(extra)} {...props} />);

it("ne repropose pas la province que le transporteur refuse", async () => {
  // Reproposer « Quebec » invite à la renvoyer telle quelle. Le champ part vide.
  afficher();
  expect(screen.getByTestId("ca-province")).toHaveValue("");
  // Le reste de l'adresse, lui, est conservé : on corrige, on ne resaisit pas.
  expect(screen.getByTestId("ca-city")).toHaveValue("Montreal");
  expect(screen.getByTestId("ca-address1")).toHaveValue("1250 rue Ste-Catherine");
});

it("formate le code postal et en deduit la province", async () => {
  afficher();
  const cp = screen.getByTestId("ca-postal");
  await userEvent.clear(cp);
  await userEvent.type(cp, "h3g1p1");

  expect(cp).toHaveValue("H3G 1P1");
  expect(screen.getByTestId("ca-province")).toHaveValue("QC");
});

it("signale un code postal mal forme pendant la frappe", async () => {
  afficher();
  const cp = screen.getByTestId("ca-postal");
  await userEvent.clear(cp);
  await userEvent.type(cp, "999999");

  expect(await screen.findByTestId("ca-postal-erreur")).toBeInTheDocument();
});

it("signale un desaccord entre le code postal et la province", async () => {
  afficher();
  const cp = screen.getByTestId("ca-postal");
  await userEvent.clear(cp);
  await userEvent.type(cp, "h3g1p1");
  // H = Québec ; on force l'Ontario par-dessus.
  await userEvent.selectOptions(screen.getByTestId("ca-province"), "ON");

  expect(await screen.findByTestId("ca-desaccord")).toBeInTheDocument();
});

it("refuse d'enregistrer sans motif", async () => {
  afficher();
  await userEvent.clear(screen.getByTestId("ca-postal"));
  await userEvent.type(screen.getByTestId("ca-postal"), "h3g1p1");

  expect(screen.getByTestId("ca-enregistrer")).toBeDisabled();
});

it("enregistre l'adresse corrigee avec son motif", async () => {
  api.patch.mockResolvedValue({ data: { ok: true, changed: ["province"] } });
  const onDone = jest.fn();
  afficher({}, { onDone });

  await userEvent.clear(screen.getByTestId("ca-postal"));
  await userEvent.type(screen.getByTestId("ca-postal"), "h3g1p1");
  await userEvent.type(screen.getByTestId("ca-motif"), "Postes Canada refuse la province");
  await userEvent.click(screen.getByTestId("ca-enregistrer"));

  await waitFor(() => expect(api.patch).toHaveBeenCalled());
  const [url, corps] = api.patch.mock.calls[0];
  expect(url).toBe("/admin/orders/o-1/shipping-address");
  expect(corps.address.province).toBe("QC");
  expect(corps.address.postal_code).toBe("H3G 1P1");
  expect(corps.motif).toBe("Postes Canada refuse la province");
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});
