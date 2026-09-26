// Le module de paiement crypto s'ajuste à l'écran, dans les deux dimensions.
//
// Mireille, en trois temps :
//   1. « nowpayment page has no content » sur mobile ;
//   2. « tout doit se faire sur mon site sans jamais quitter » ;
//   3. « on ne peut pas réduire la taille du widget ».
//
// Le module NOWPayments est dessiné pour une taille FIXE de 410 × 696 px. On
// ne redimensionne donc pas le cadre — on réduit l'ENSEMBLE. Et l'échelle doit
// suivre les DEUX contraintes : la largeur du conteneur ET la hauteur visible.
// Régler la largeur seule laissait 696 px de haut sur un écran qui n'en offre
// que 500, et il fallait encore défiler sur l'écran même où l'on paie.
import { render, screen, act } from "@testing-library/react";

import ModuleCrypto from "./ModuleCrypto";

// jsdom ne fournit pas ResizeObserver ; le composant retombe alors sur
// l'écouteur `resize`, qui suffit ici. On le remplace quand même pour que le
// chemin nominal soit celui qui est testé.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

// clientWidth et getBoundingClientRect valent 0 dans jsdom : on les pose
// explicitement, sinon le composant mesurerait un conteneur inexistant.
const poser = ({ largeur, hautDuModule, hauteurFenetre }) => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() { return largeur; },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { top: hautDuModule, left: 0, right: 0, bottom: 0, width: largeur, height: 0 };
  };
  window.innerHeight = hauteurFenetre;
};

const echelleAffichee = () => {
  const module = screen.getByTestId("nowpayments-widget");
  const m = /scale\(([\d.]+)\)/.exec(module.style.transform);
  return m ? Number(m[1]) : null;
};

it("garde la taille native quand la place ne manque pas", async () => {
  // Grand ecran : 410 px de large disponibles, et 900 px sous le module.
  poser({ largeur: 410, hautDuModule: 100, hauteurFenetre: 1000 });
  await act(async () => { render(<ModuleCrypto invoiceId="1" />); });

  expect(echelleAffichee()).toBe(1);
});

it("ne grossit jamais au-dela de sa taille native", async () => {
  // Conteneur large de 900 px : le module pourrait doubler. Il ne doit pas —
  // l'agrandir flouterait son texte sans rien apporter.
  poser({ largeur: 900, hautDuModule: 50, hauteurFenetre: 2000 });
  await act(async () => { render(<ModuleCrypto invoiceId="1" />); });

  expect(echelleAffichee()).toBe(1);
});

it("se reduit quand la largeur manque, sur telephone", async () => {
  // Un telephone de 320 px : 320 / 410 = 0,78.
  poser({ largeur: 320, hautDuModule: 100, hauteurFenetre: 2000 });
  await act(async () => { render(<ModuleCrypto invoiceId="1" />); });

  expect(echelleAffichee()).toBeCloseTo(320 / 410, 2);
});

it("se reduit quand la HAUTEUR manque, meme si la largeur suffit", async () => {
  // LE DEFAUT SIGNALE : largeur suffisante, mais seulement 400 px visibles
  // sous le module. Sans cette contrainte, il restait a 696 px de haut et il
  // fallait defiler.
  poser({ largeur: 410, hautDuModule: 200, hauteurFenetre: 600 });
  await act(async () => { render(<ModuleCrypto invoiceId="1" />); });

  // 600 - 200 - 24 de marge = 376 disponibles ; 376 / 696 = 0,54, borne a 0,62.
  const e = echelleAffichee();
  expect(e).toBeLessThan(1);
  expect(e).toBe(0.62);
});

it("ne descend pas sous le seuil de lisibilite", async () => {
  // Un ecran tres court ne doit pas reduire le formulaire jusqu'a l'illisible :
  // mieux vaut un peu de defilement qu'un montant qu'on dechiffre.
  poser({ largeur: 410, hautDuModule: 300, hauteurFenetre: 400 });
  await act(async () => { render(<ModuleCrypto invoiceId="1" />); });

  expect(echelleAffichee()).toBe(0.62);
});

it("ajuste la hauteur du conteneur a l'echelle", async () => {
  // Sinon le conteneur garderait 696 px et laisserait un grand vide sous un
  // module reduit — ce qui ramenerait le defilement qu'on vient de supprimer.
  poser({ largeur: 328, hautDuModule: 100, hauteurFenetre: 2000 });
  await act(async () => { render(<ModuleCrypto invoiceId="1" />); });

  const enveloppe = screen.getByTestId("crypto-widget-wrapper");
  const attendue = Math.round(696 * (328 / 410));
  expect(enveloppe.style.height).toBe(`${attendue}px`);
  expect(enveloppe.style.overflow).toBe("hidden");
});

it("garde les dimensions natives du cadre", async () => {
  // C'est le coeur de la correction : ecraser le cadre coupait le contenu,
  // parce que le module se compose pour 410 px quoi qu'il arrive.
  poser({ largeur: 320, hautDuModule: 100, hauteurFenetre: 2000 });
  await act(async () => { render(<ModuleCrypto invoiceId="1" />); });

  const module = screen.getByTestId("nowpayments-widget");
  expect(module).toHaveAttribute("width", "410");
  expect(module).toHaveAttribute("height", "696");
  expect(module.style.transformOrigin).toBe("top left");
});
