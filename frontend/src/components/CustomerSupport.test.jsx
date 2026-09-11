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

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/account/tickets",
    { subject: "Délai de livraison", body: "Combien de temps pour Gaspé ?" }));
  expect(api.get).toHaveBeenCalledWith("/account/tickets");
});
