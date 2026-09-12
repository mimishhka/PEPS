// Billets clients : un canal general, rattache au compte — pas a une commande.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CustomerSupport from "./CustomerSupport";
import api from "../lib/api";

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({ data: {} });
});

it("ouvre un billet sur le compte, sans page ni commande jointe", async () => {
  render(<CustomerSupport L={(fr) => fr} lang="fr" />);
  expect(await screen.findByTestId("customer-support")).toBeInTheDocument();

  // fireEvent.change : taper caractère par caractère dépasse le délai
  // d'attente quand la suite complète tourne en parallèle.
  fireEvent.change(screen.getByTestId("ticket-subject"),
                   { target: { value: "Délai de livraison" } });
  fireEvent.change(screen.getByTestId("ticket-body"),
                   { target: { value: "Combien de temps pour Gaspé ?" } });
  await userEvent.click(screen.getByTestId("ticket-submit"));

  // Multipart et non JSON : le billet accepte desormais une photo, ce qui
  // etait la seule chose que le fil de la commande savait faire et pas lui.
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const [url, corps] = api.post.mock.calls[0];
  expect(url).toBe("/account/tickets");
  expect(corps).toBeInstanceOf(FormData);
  expect(corps.get("subject")).toBe("Délai de livraison");
  expect(corps.get("body")).toBe("Combien de temps pour Gaspé ?");
  expect(api.get).toHaveBeenCalledWith("/account/tickets");
});

it("propose de joindre une photo, ce que les affilies n'ont pas", async () => {
  render(<CustomerSupport L={(fr) => fr} lang="fr" />);
  expect(await screen.findByTestId("ticket-photo")).toBeInTheDocument();
});
