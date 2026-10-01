// La bulle de la visite guidée tient dans un téléphone.
//
// MIREILLE, 01/10/2026 : « assure-toi que ça fonctionne tout aussi bien sur
// mobile ».
//
// Le placement est calculé à la main, en pixels, à partir de la position de
// la cible : c'est le genre de calcul qui marche sur un écran large et
// déborde sur un écran étroit. Deux façons d'en sortir — à droite quand la
// cible est près du bord, en bas quand elle est basse — et ce sont justement
// les deux cas fréquents sur un téléphone, où tout est près d'un bord.
//
// Ces tests fixent la fenêtre à 375 × 812 et vérifient que la bulle reste
// visible. Ils ne remplacent pas un vrai appareil pour le toucher et le
// défilement : jsdom n'a pas de mise en page, il ne calcule aucune hauteur
// réelle et ne sait pas lire `min()` ni `calc()`. Ce qui est tenu ici, c'est
// l'arithmétique de placement — la partie qui casse en silence.

import { render, screen, cleanup } from "@testing-library/react";

import GuidedTour from "./GuidedTour";

const L = (fr) => fr;
const TELEPHONE = { largeur: 375, hauteur: 812 };

const ETAPES = [
  { cible: "zone-a", ton: "nova", titre: "Première", texte: "Texte un." },
  { cible: "zone-b", ton: "acquis", titre: "Deuxième", texte: "Texte deux." },
];

let rectCourant = { top: 300, left: 20, width: 300, height: 60 };

beforeEach(() => {
  window.innerWidth = TELEPHONE.largeur;
  window.innerHeight = TELEPHONE.hauteur;
  window.Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(window.Element.prototype, "getBoundingClientRect").mockImplementation(() => ({
    ...rectCourant,
    right: rectCourant.left + rectCourant.width,
    bottom: rectCourant.top + rectCourant.height,
    x: rectCourant.left, y: rectCourant.top, toJSON: () => {},
  }));
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

const monter = async (rect, steps = ETAPES) => {
  rectCourant = rect;
  const onClose = jest.fn();
  render(
    <>
      <div data-testid="zone-a">A</div>
      <div data-testid="zone-b">B</div>
      <GuidedTour steps={steps} L={L} onClose={onClose} onTab={jest.fn()} />
    </>
  );
  await screen.findByTestId("guided-tour", {}, { timeout: 4000 });
  return onClose;
};

const bulle = () => screen.getByTestId("guided-tour");
const px = (v) => parseFloat(String(v).replace("px", "")) || 0;

describe("sur un téléphone de 375 px", () => {
  test("une cible collée au bord droit ne pousse pas la bulle hors de l'écran", async () => {
    /* Le calcul ramène la bulle vers la gauche : `Math.min(box.left,
     * innerWidth - 360)`. Sur 375 px la borne vaut 15, et le plancher de
     * 16 px l'empêche de coller au bord. Sans ces deux bornes, une cible à
     * 340 px enverrait une bulle de 343 px très largement hors du cadre. */
    await monter({ top: 300, left: 340, width: 30, height: 30 });

    const gauche = px(bulle().style.left);
    expect(gauche).toBeGreaterThanOrEqual(16);
    expect(gauche).toBeLessThanOrEqual(TELEPHONE.largeur - 16);
  });

  test("une cible en bas d'écran fait passer la bulle AU-DESSUS", async () => {
    // Sinon elle s'ouvrirait sous le pli, invisible, et la visite paraîtrait
    // figée : on ne verrait plus ni texte ni bouton.
    await monter({ top: 700, left: 20, width: 300, height: 60 });

    const haut = px(bulle().style.top);
    expect(haut).toBeLessThan(700);
    expect(haut).toBeGreaterThanOrEqual(16);
  });

  test("une cible en haut d'écran laisse la bulle EN DESSOUS", async () => {
    await monter({ top: 80, left: 20, width: 300, height: 60 });
    expect(px(bulle().style.top)).toBeGreaterThan(80);
  });

  /* PAS DE TEST SUR LA LARGEUR, et ce n'est pas un oubli.
   *
   * La bulle vaut `min(22rem, calc(100vw - 2rem))` : 352 px sur grand écran,
   * 343 sur ce téléphone, ce qui est exactement ce qu'il faut. Mais jsdom ne
   * sait évaluer ni `min()` ni `calc()`, et React retire alors la propriété :
   * elle n'apparaît même pas dans l'attribut `style`. Toute assertion ici
   * porterait sur l'absence de la règle, pas sur son effet.
   *
   * Cela se vérifie dans un vrai navigateur, pas ici. */
});

describe("les quatre coins de l'écran", () => {
  // Le balayage attrape les cas qu'on n'imagine pas : une cible dans un coin
  // combine les deux débordements à la fois.
  const coins = [
    ["en haut à gauche", { top: 0, left: 0, width: 40, height: 40 }],
    ["en haut à droite", { top: 0, left: 335, width: 40, height: 40 }],
    ["en bas à gauche", { top: 772, left: 0, width: 40, height: 40 }],
    ["en bas à droite", { top: 772, left: 335, width: 40, height: 40 }],
    ["au centre", { top: 400, left: 170, width: 40, height: 40 }],
  ];

  test.each(coins)("la bulle reste dans le cadre — cible %s", async (_nom, rect) => {
    await monter(rect);

    const gauche = px(bulle().style.left);
    const haut = px(bulle().style.top);
    expect(gauche).toBeGreaterThanOrEqual(16);
    expect(gauche).toBeLessThanOrEqual(TELEPHONE.largeur - 16);
    expect(haut).toBeGreaterThanOrEqual(16);
    expect(haut).toBeLessThan(TELEPHONE.hauteur);
  });
});

describe("les commandes restent atteignables", () => {
  test("« Quitter » est offert dès la première bulle", async () => {
    // Une visite dont on ne voit pas la sortie est une prison — d'autant
    // plus sur un téléphone, où une croix minuscule est inatteignable.
    await monter({ top: 300, left: 20, width: 300, height: 60 });

    expect(screen.getByTestId("tour-exit")).toBeInTheDocument();
    expect(screen.getByTestId("tour-next")).toBeInTheDocument();
    // « Précédent » n'apparaît qu'à partir de la deuxième : à la première il
    // ne mènerait nulle part et volerait de la largeur, rare sur un téléphone.
    expect(screen.queryByTestId("tour-prev")).not.toBeInTheDocument();
  });
});
