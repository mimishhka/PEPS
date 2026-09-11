// Un seul ecran de billets pour deux files : affilies et clients.
import { render, screen } from "@testing-library/react";

import AdminTickets from "./AdminTickets";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

it("sert la file des clients, avec le nom de qui ecrit", async () => {
  api.get.mockResolvedValue({ data: [{
    id: "t-1", status: "open", subject: "Délai de livraison",
    customer_name: "Marie Tremblay", customer_email: "marie@example.com",
    updated_at: new Date().toISOString(), messages: [],
  }] });
  render(<AdminTickets
    base="/admin/customer-tickets"
    titre={{ fr: "Billets clients", en: "Customer tickets" }}
    identite={(t) => ({ name: t.customer_name, email: t.customer_email, code: "" })} />);

  expect(await screen.findByText("Délai de livraison")).toBeInTheDocument();
  expect(screen.getByText("Billets clients")).toBeInTheDocument();
  expect(screen.getByText(/Marie Tremblay/)).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/admin/customer-tickets", { params: undefined });
});

it("garde la file des affilies telle quelle sans rien passer", async () => {
  api.get.mockResolvedValue({ data: [] });
  render(<AdminTickets />);
  expect(await screen.findByText("Billets affiliés")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/admin/affiliate-tickets", { params: undefined });
});
