// Billets affiliés : la photo aussi, sans perdre la page d'origine.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AffiliateSupport from "./AffiliateSupport";
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

it("propose une photo aux affilies aussi", async () => {
  render(<AffiliateSupport L={(fr) => fr} lang="fr" />);
  expect(await screen.findByTestId("ticket-photo")).toBeInTheDocument();
});

it("envoie la photo ET la page d'origine, en multipart", async () => {
  // La page d'où écrit l'affilié est jointe automatiquement : elle ne doit pas
  // se perdre dans le passage du JSON au multipart.
  render(<AffiliateSupport L={(fr) => fr} lang="fr" />);
  const photo = new File(["x"], "capture.png", { type: "image/png" });

  fireEvent.change(await screen.findByTestId("ticket-subject"),
                   { target: { value: "Commission manquante" } });
  fireEvent.change(screen.getByTestId("ticket-body"),
                   { target: { value: "Ma commission du 12 août n'apparaît pas." } });
  fireEvent.change(screen.getByTestId("ticket-photo"), { target: { files: [photo] } });
  await userEvent.click(screen.getByTestId("ticket-submit"));

  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const [url, corps] = api.post.mock.calls[0];
  expect(url).toBe("/affiliate/tickets");
  expect(corps).toBeInstanceOf(FormData);
  expect(corps.get("subject")).toBe("Commission manquante");
  expect(corps.get("context_path")).toBe(window.location.pathname);
  expect(corps.get("file")).toBe(photo);
});

it("repond avec une photo dans le fil", async () => {
  api.get.mockResolvedValue({ data: [{
    id: "t-1", subject: "Commission manquante", status: "pending",
    created_at: "2026-09-01T10:00:00Z",
    messages: [{ id: "m-1", from: "admin", body: "Pouvez-vous envoyer une capture ?",
                 at: "2026-09-01T11:00:00Z" }],
  }] });
  render(<AffiliateSupport L={(fr) => fr} lang="fr" />);
  const capture = new File(["x"], "capture.png", { type: "image/png" });

  await userEvent.click(await screen.findByText("Commission manquante"));
  fireEvent.change(screen.getByTestId("ticket-reply-input"), { target: { value: "La voici." } });
  fireEvent.change(screen.getByTestId("ticket-reply-photo"), { target: { files: [capture] } });
  await userEvent.click(screen.getByTestId("ticket-reply-send"));

  await waitFor(() => expect(api.post).toHaveBeenCalled());
  const [url, corps] = api.post.mock.calls[0];
  expect(url).toBe("/affiliate/tickets/t-1/reply");
  expect(corps.get("body")).toBe("La voici.");
  expect(corps.get("file")).toBe(capture);
});
