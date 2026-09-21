// La cloche : un compteur d'alerte qui ment est pire que pas de compteur.
import { fireEvent, render, screen } from "@testing-library/react";

import ClocheNotifications from "./ClocheNotifications";

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const L = (fr) => fr;
const argent = (n) => `${Number(n || 0).toFixed(2)} $`;

const POULS = {
  money: { reconcile: { count: 1 }, pending_payment: {} },
  ops: { to_ship: 4, low_stock: 2, late_payments: 0, emails_failed: 0, tickets_open: 1,
         refunds: { to_review: 1, to_send: 2, to_send_amount: 145.75 } },
};

const afficher = (extra = {}) => render(
  <ClocheNotifications pouls={POULS} signaux={{ pending_manifest: 0 }}
    basePath="/ops" L={L} argent={argent} {...extra} />
);

it("additionne ce qui reste a traiter, et le dit sans ouvrir", () => {
  // 2 remboursements à envoyer + 1 à examiner + 1 réconciliation
  // + 4 expéditions + 2 stocks + 1 billet = 11.
  afficher();
  expect(screen.getByTestId("notifications-dot")).toHaveTextContent("11");
  expect(screen.getByTestId("notifications-toggle"))
    .toHaveAttribute("aria-label", "Notifications : 11 en attente");
});

it("se tait quand il n y a rien — et le dit si on ouvre", () => {
  // Une cloche qui sonne pour rien finit ignorée, et ce jour-là elle ne
  // prévient plus de ce qui compte.
  render(<ClocheNotifications pouls={{ money: {}, ops: { refunds: {} } }} signaux={{}}
           basePath="/ops" L={L} argent={argent} />);
  expect(screen.queryByTestId("notifications-dot")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("notifications-toggle"));
  expect(screen.getByTestId("notifications-vide")).toHaveTextContent("Rien à traiter");
});

it("chaque ligne mene a l ecran qui permet d agir", () => {
  afficher();
  fireEvent.click(screen.getByTestId("notifications-toggle"));
  expect(screen.getByTestId("notification-refunds-send")).toHaveAttribute("href", "/ops/refunds");
  expect(screen.getByTestId("notification-ship")).toHaveAttribute("href", "/ops/dispatch");
  expect(screen.getByTestId("notification-stock")).toHaveAttribute("href", "/ops/products");
  // L'urgent porte son montant : c'est ce qui décide de l'ordre de la journée.
  expect(screen.getByTestId("notification-refunds-send")).toHaveTextContent("145.75 $");
});

it("relit les compteurs quand on part traiter une ligne", () => {
  // Sans cela, la pastille garde son ancien nombre jusqu'au prochain relevé,
  // et on croit avoir travaillé pour rien.
  const relire = jest.fn();
  afficher({ surAction: relire });
  fireEvent.click(screen.getByTestId("notifications-toggle"));
  expect(relire).toHaveBeenCalledTimes(1);           // ouvrir vérifie déjà

  fireEvent.click(screen.getByTestId("notification-ship"));
  expect(relire).toHaveBeenCalledTimes(2);
  // Le panneau se referme : on s'en va, il n'a plus de raison de rester.
  expect(screen.queryByTestId("notifications-panel")).not.toBeInTheDocument();
});

it("le ton suit la ligne la plus grave", () => {
  // Rouge s'il y a de l'urgent, ambre sinon : la couleur double le nombre,
  // elle ne le remplace pas.
  afficher();
  expect(screen.getByTestId("notifications-dot").className).toMatch(/bg-red-600/);

  render(<ClocheNotifications
    pouls={{ money: {}, ops: { to_ship: 3, refunds: {} } }} signaux={{}}
    basePath="/ops" L={L} argent={argent} />);
  const pastilles = screen.getAllByTestId("notifications-dot");
  expect(pastilles[pastilles.length - 1].className).toMatch(/bg-amber-500/);
});


// Le versement du mois clos. Le pouls savait dire « paiements prets » sans
// jamais dire AVANT QUAND : un debourse en retard ne sonnait nulle part,
// alors que c'est le seul engagement de cet ecran qui porte une date et un
// tiers qui attend.
const avecVersement = (v) => afficher({
  pouls: { ...POULS, ops: { ...POULS.ops, affiliate_payout: v } },
});

it("sonne rouge quand le versement du mois clos est en retard", () => {
  avecVersement({ count: 7, amount: 412.5, days_left: 0, overdue: true });

  const ligne = screen.getByTestId("notifications-toggle");
  fireEvent.click(ligne);
  const item = screen.getByTestId("notification-affiliate-payout");
  expect(item).toHaveTextContent("7 commission(s) d'affilié à verser");
  expect(item).toHaveTextContent("échéance dépassée");
  expect(item).toHaveTextContent("412.50");
  // Rouge, pas ambre : la pastille du haut suit le ton le plus grave.
  expect(screen.getByTestId("notifications-dot").className).toMatch(/bg-red-600/);
});

it("reste ambre tant qu'il reste des jours", () => {
  avecVersement({ count: 7, amount: 412.5, days_left: 3, overdue: false });

  fireEvent.click(screen.getByTestId("notifications-toggle"));
  expect(screen.getByTestId("notification-affiliate-payout")).toHaveTextContent("3 jour(s)");
});

it("ne compte rien quand il n y a aucune commission a verser", () => {
  // Un compteur qui s'allume a zero apprend a etre ignore.
  avecVersement({ count: 0, amount: 0, days_left: 0, overdue: true });

  expect(screen.getByTestId("notifications-dot")).toHaveTextContent("11");
  fireEvent.click(screen.getByTestId("notifications-toggle"));
  expect(screen.queryByTestId("notification-affiliate-payout")).not.toBeInTheDocument();
});

it("mene a l ecran ou le versement s execute", () => {
  avecVersement({ count: 2, amount: 50, days_left: 1, overdue: false });

  fireEvent.click(screen.getByTestId("notifications-toggle"));
  expect(screen.getByTestId("notification-affiliate-payout"))
    .toHaveAttribute("href", "/ops/payouts");
});

it("sonne pour un avis d'affilié resté en échec", () => {
  // Au-delà de 48 h ou du plafond de reprises, plus rien ne le rattrape :
  // l'affilié n'a rien reçu et personne ne le sait.
  afficher({ pouls: { ...POULS, ops: { ...POULS.ops, affiliate_notices_stuck: 2 } } });

  fireEvent.click(screen.getByTestId("notifications-toggle"));
  const item = screen.getByTestId("notification-notices");
  expect(item).toHaveTextContent("2 avis d'affilié resté(s) en échec");
  expect(item).toHaveTextContent("au-delà de toute reprise");
  expect(item).toHaveAttribute("href", "/ops/payouts");
});

it("ne sonne pas quand aucun avis n'est bloqué", () => {
  afficher({ pouls: { ...POULS, ops: { ...POULS.ops, affiliate_notices_stuck: 0 } } });

  fireEvent.click(screen.getByTestId("notifications-toggle"));
  expect(screen.queryByTestId("notification-notices")).not.toBeInTheDocument();
});
