// Les boutons de variables de l'éditeur de courriels.
//
// Le bouton ajoutait une paire d'accolades AUTOUR de la variable — mais
// celles du catalogue en portent déjà : `["{{order_number}}", …]`. Cliquer
// produisait donc `{{{order_number}}}`. Le moteur, qui remplace
// `{{order_number}}` (backend/services/mail.py), trouvait bien son jeton à
// l'intérieur et laissait les accolades orphelines : le client recevait
// « {FN-260930-ABCD1234} » au lieu de son numéro de commande.
//
// Le même défaut affichait aussi `{{{order_number}}}` SUR le bouton, ce qui
// rendait la chose difficile à soupçonner : l'écran était cohérent avec
// lui-même, et faux des deux côtés.
//
// Cet écran n'avait aucun test.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminEmails from "./AdminEmails";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../../../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr" }) }));
const mockConfirm = jest.fn(async () => true);
jest.mock("../../../components/ConfirmDialog", () => ({ useConfirm: () => mockConfirm }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

// La forme que rend vraiment /admin/email-templates : les variables portent
// déjà leurs doubles accolades, comme dans EMAIL_TEMPLATE_CATALOG.
const GABARIT = {
  key: "order_confirmation_interac",
  label: "Commande reçue — Interac / Order received — Interac",
  variables: ["{{order_number}}", "{{customer_name}}", "{{total}}"],
  subject_fr: "Sujet", subject_en: "Subject",
  heading_fr: "Titre", heading_en: "Heading",
  body_fr: "", body_en: "",
  cta_url: "", cta_label_fr: "", cta_label_en: "",
};

const charger = (gabarit = GABARIT) => {
  api.get.mockImplementation(async (url) => {
    if (String(url).includes("/admin/email-templates")) {
      return { data: { templates: [gabarit] } };
    }
    return { data: {} };
  });
};

const corps = () => screen.getByTestId("email-body-fr");

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
  charger();
});

test("LE CAS : le bouton insère exactement deux accolades", async () => {
  render(<AdminEmails />);
  await waitFor(() => expect(screen.getByTestId("email-var-order_number")).toBeInTheDocument());

  await userEvent.click(screen.getByTestId("email-var-order_number"));

  // Et non « {{{order_number}}} », que le moteur rendait en
  // « {FN-260930-ABCD1234} » dans le courriel du client.
  expect(corps()).toHaveValue("{{order_number}}");
});

test("le bouton AFFICHE le jeton qu'il insère", async () => {
  // L'écran était cohérent avec lui-même et faux des deux côtés : c'est ce qui
  // rendait le défaut difficile à soupçonner en regardant l'interface.
  render(<AdminEmails />);
  await waitFor(() => expect(screen.getByTestId("email-var-total")).toBeInTheDocument());

  expect(screen.getByTestId("email-var-total")).toHaveTextContent("{{total}}");
  expect(screen.getByTestId("email-var-total").textContent).not.toContain("{{{");
});

test("une variable sans accolades est normalisée", async () => {
  /* Un gabarit créé depuis OPS porte les variables que quelqu'un a tapées à
   * la main. On ne suppose donc aucune forme d'entrée : on retire toutes les
   * accolades et on remet exactement deux paires — le seul jeton que le
   * moteur reconnaisse. */
  charger({ ...GABARIT, variables: ["order_number", "{customer_name}", "{{ total }}"] });
  render(<AdminEmails />);
  await waitFor(() => expect(screen.getByTestId("email-var-order_number")).toBeInTheDocument());

  await userEvent.click(screen.getByTestId("email-var-order_number"));
  expect(corps()).toHaveValue("{{order_number}}");

  await userEvent.click(screen.getByTestId("email-var-customer_name"));
  expect(corps()).toHaveValue("{{order_number}} {{customer_name}}");

  // Les espaces internes disparaissent : « {{ total }} » n'aurait jamais été
  // remplacé par le moteur, qui cherche la chaîne exacte.
  await userEvent.click(screen.getByTestId("email-var-total"));
  expect(corps()).toHaveValue("{{order_number}} {{customer_name}} {{total}}");
});

test("la variable ne se colle pas au mot précédent", async () => {
  charger({ ...GABARIT, body_fr: "Bonjour" });
  render(<AdminEmails />);
  await waitFor(() => expect(screen.getByTestId("email-var-customer_name")).toBeInTheDocument());

  await userEvent.click(screen.getByTestId("email-var-customer_name"));

  expect(corps()).toHaveValue("Bonjour {{customer_name}}");
});

test("aucune espace en trop quand le texte en finit déjà par une", async () => {
  charger({ ...GABARIT, body_fr: "Bonjour " });
  render(<AdminEmails />);
  await waitFor(() => expect(screen.getByTestId("email-var-customer_name")).toBeInTheDocument());

  await userEvent.click(screen.getByTestId("email-var-customer_name"));

  expect(corps()).toHaveValue("Bonjour {{customer_name}}");
});

test("une variable vide n'insère rien", async () => {
  // Défensif : un gabarit personnalisé peut porter une entrée vide, et
  // inserer « {{}} » donnerait un jeton que rien ne remplace jamais.
  charger({ ...GABARIT, variables: ["{{order_number}}", "  ", "{}"] });
  render(<AdminEmails />);
  await waitFor(() => expect(screen.getByTestId("email-var-order_number")).toBeInTheDocument());

  await userEvent.click(screen.getByTestId("email-var-order_number"));

  expect(corps()).toHaveValue("{{order_number}}");
  expect(corps().value).not.toContain("{{}}");
});

// ===========================================================================
// LES GABARITS DEJA PERSONNALISES
//
// Tant que le bouton ajoutait une accolade de trop, tout texte composé avec
// lui a été ENREGISTRÉ ainsi. Corriger le bouton ne répare pas le passé : ces
// gabarits continueraient d'envoyer « {FN-260930-ABCD1234} » à chaque
// commande, et personne ne peut deviner lesquels sont touchés sans ouvrir les
// treize gabarits un par un.
// ===========================================================================

const ABIME = {
  ...GABARIT,
  subject_fr: "Commande {{{order_number}}} reçue",
  heading_fr: "Bonjour {{{customer_name}}}",
  body_fr: "Votre commande {{{order_number}}} de {{{total}}} est confirmée.",
};

test("l'ecran signale un gabarit abime", async () => {
  charger(ABIME);
  render(<AdminEmails />);

  const avis = await screen.findByTestId("email-jetons-abimes");
  // Il dit ce que le client reçoit : c'est ce qui rend le problème concret.
  expect(avis).toHaveTextContent(/accolades/i);
});

test("il nomme TOUS les champs touches, pas seulement le premier", async () => {
  /* LA RÉGRESSION QUE CE TEST GARDE.
   *
   * `.test()` sur une expression régulière globale avance `lastIndex`.
   * Réutiliser le même objet dans un `filter` faisait démarrer chaque champ
   * là où le précédent s'était arrêté : le premier champ abîmé était détecté,
   * les suivants sautés. Un avertissement partiel est plus trompeur qu'aucun
   * — on corrige le sujet, on croit avoir fini, et le corps continue
   * d'envoyer du texte cassé.
   */
  charger(ABIME);
  render(<AdminEmails />);

  const avis = await screen.findByTestId("email-jetons-abimes");
  expect(avis).toHaveTextContent("subject_fr");
  expect(avis).toHaveTextContent("heading_fr");
  expect(avis).toHaveTextContent("body_fr");
});

test("aucun avis sur un gabarit sain", async () => {
  charger({ ...GABARIT, body_fr: "Votre commande {{order_number}} est confirmée." });
  render(<AdminEmails />);

  await waitFor(() => expect(screen.getByTestId("email-body-fr")).toBeInTheDocument());
  expect(screen.queryByTestId("email-jetons-abimes")).not.toBeInTheDocument();
});

test("« Corriger ici » remet deux accolades partout", async () => {
  charger(ABIME);
  render(<AdminEmails />);
  await screen.findByTestId("email-reparer-jetons");

  await userEvent.click(screen.getByTestId("email-reparer-jetons"));

  expect(corps()).toHaveValue("Votre commande {{order_number}} de {{total}} est confirmée.");
  // Deux jetons dans le même champ : sans le drapeau global sur le remplacement,
  // seul le premier aurait été réparé.
  expect(corps().value).not.toContain("{{{");
});

test("la correction ne touche que le formulaire, jamais la base", async () => {
  /* Ce sont ses textes. Rien n'est enregistré avant qu'elle clique
   * « Enregistrer » — le bouton ne fait que préparer la correction sous ses
   * yeux, et elle peut l'abandonner en changeant de gabarit. */
  charger(ABIME);
  render(<AdminEmails />);
  await screen.findByTestId("email-reparer-jetons");

  await userEvent.click(screen.getByTestId("email-reparer-jetons"));

  expect(api.put).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
});

test("l'avis disparait une fois la correction faite", async () => {
  charger(ABIME);
  render(<AdminEmails />);
  await screen.findByTestId("email-reparer-jetons");

  await userEvent.click(screen.getByTestId("email-reparer-jetons"));

  await waitFor(() => {
    expect(screen.queryByTestId("email-jetons-abimes")).not.toBeInTheDocument();
  });
});
