// Billets clients : un canal general, rattache au compte — pas a une commande.
import { render, screen, waitFor } from "@testing-library/react";
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

  await userEvent.type(screen.getByTestId("ticket-subject"), "Délai de livraison");
  await userEvent.type(screen.getByTestId("ticket-body"), "Combien de temps pour Gaspé ?");
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
