// Le mot de la marque, et le descripteur sous lui.
//
// MIREILLE, 11/10/2026 : « il faut ajouter RESEARCH », « un peu comme le site
// de Align », « en dessous de FIRONOVA mais vraiment plus petite ».
//
// CE QUE CES TESTS PROTÈGENT EN PREMIER : les huit autres appels. `Wordmark`
// est partagé par l'en-tête, le pied de page, la connexion, l'inscription,
// l'adhésion affiliée et trois pages d'authentification. Un descripteur qui
// apparaîtrait par défaut les changerait tous d'un coup, dont deux sur fond
// marine où la place est comptée. Il ne se rend que si on le demande.

import { render } from "@testing-library/react";

import { Wordmark } from "./brand";

const mot = (scene) => scene.container.querySelector("span.font-bold");
const descripteur = (scene) =>
  [...scene.container.querySelectorAll("span")].find((e) => e.textContent === "RESEARCH");

describe("sans descripteur, rien ne change", () => {
  test("le mot seul se rend comme avant", () => {
    const scene = render(<Wordmark size={19} color="#0B2E4F" />);
    expect(mot(scene)).toHaveTextContent("FIRONOVA");
    expect(descripteur(scene)).toBeUndefined();
  });

  test("et il garde son interlettrage de marque", () => {
    const scene = render(<Wordmark size={19} />);
    expect(mot(scene).style.letterSpacing).toBe("0.14em");
    expect(mot(scene).style.fontSize).toBe("19px");
  });
});

describe("avec descripteur", () => {
  test("les deux mots sont là", () => {
    const scene = render(<Wordmark size={46} descripteur="RESEARCH" />);
    expect(mot(scene)).toHaveTextContent("FIRONOVA");
    expect(descripteur(scene)).toBeDefined();
  });

  test("IL FAIT UN SIXIÈME DU MOT — le rapport qu'elle a choisi", () => {
    const scene = render(<Wordmark size={48} descripteur="RESEARCH" />);
    expect(descripteur(scene).style.fontSize).toBe("8px");
  });

  test("la proportion tient à toutes les tailles", () => {
    for (const [taille, attendu] of [[60, "10px"], [90, "15px"], [120, "20px"]]) {
      const scene = render(<Wordmark size={taille} descripteur="RESEARCH" />);
      expect(descripteur(scene).style.fontSize).toBe(attendu);
    }
  });

  test("LE PLANCHER DE 6 PX, SANS QUOI L'EN-TÊTE N'AURAIT QU'UN TRAIT", () => {
    // Dans l'en-tête le mot fait 19 px : un sixième donnerait 3,2 px, soit un
    // trait gris et pas un mot. Le plancher le rend plus court que le mot au
    // lieu de l'égaler — mise en page de logo correcte, et lisible.
    const scene = render(<Wordmark size={19} descripteur="RESEARCH" />);
    expect(descripteur(scene).style.fontSize).toBe("6px");
  });

  test("L'INTERLETTRAGE RESTE SOUS 0,35 em — sinon le mot se désassemble", () => {
    /* Premier jet : 0,84 em, pour que « RESEARCH » égale la largeur de
     * « FIRONOVA ». MIREILLE, devant le résultat : « TOO MUCH SPACING ».
     * Le raisonnement était faux à la racine — au plancher de 6 px le
     * descripteur n'atteint pas la largeur du mot de toute façon, donc
     * l'espacement écartait les lettres sans rien gagner, et
     * « R E S E A R C H » cessait de se lire comme un mot.
     *
     * Le test porte sur une BORNE et non sur la valeur exacte : c'est le
     * désassemblage qu'on interdit, pas un chiffre précis. */
    const scene = render(<Wordmark size={46} descripteur="RESEARCH" />);
    const espacement = parseFloat(descripteur(scene).style.letterSpacing);
    expect(espacement).toBeLessThanOrEqual(0.35);
    expect(espacement).toBeGreaterThan(0.1);
    // Le retrait annule l'espace ajouté après la dernière lettre, qui
    // décalerait le mot d'un demi-espace vers la gauche.
    expect(descripteur(scene).style.textIndent).toBe(descripteur(scene).style.letterSpacing);
  });

  test("LE DESCRIPTEUR NE PESE PAS DANS LA HAUTEUR DU BLOC", () => {
    /* MIREILLE, 11/10/2026 : « FIRONOVA need to be aligned with the logo, is
     * it slightly above ». Il l'était.
     *
     * Les deux surfaces qui portent le logo alignent la marque et le mot
     * avec `items-center`. Dès que le mot est devenu un bloc de DEUX lignes,
     * c'est ce bloc entier qui s'est centré sur l'hexagone : « FIRONOVA » est
     * monté de la moitié de ce que le descripteur occupe, et la marque ne
     * regardait plus le mot mais l'espace entre les deux lignes.
     *
     * jsdom ne calcule aucune mise en page : on vérifie le MÉCANISME qui
     * garantit l'alignement — le descripteur est hors flux, donc le bloc fait
     * exactement la hauteur du mot, partout, sans que l'appelant le sache. */
    const scene = render(<Wordmark size={19} descripteur="RESEARCH" />);
    expect(descripteur(scene).style.position).toBe("absolute");
    expect(descripteur(scene).style.top).toBe("100%");
    expect(mot(scene).parentElement.style.position).toBe("relative");
  });

  test("il hérite de la couleur du mot", () => {
    const scene = render(<Wordmark size={46} color="#F7FAFC" descripteur="RESEARCH" />);
    expect(descripteur(scene).style.color).toBe("rgb(247, 250, 252)");
  });

  test("il ne se coupe jamais en deux lignes", () => {
    const scene = render(<Wordmark size={46} descripteur="RESEARCH" />);
    expect(descripteur(scene).style.whiteSpace).toBe("nowrap");
  });

  test("n'importe quel mot, pas seulement RESEARCH", () => {
    const scene = render(<Wordmark size={46} descripteur="LABORATOIRE" />);
    expect(scene.container.textContent).toContain("LABORATOIRE");
  });
});

describe("là où il est posé", () => {
  test("l'en-tête et le pied de page le demandent, les autres non", () => {
    /* Lu dans les sources plutôt que par le rendu : monter l'en-tête entier
     * demande six contextes, et ce qui se vérifie ici n'est pas un rendu mais
     * une DÉCISION — quelles surfaces portent le descripteur. */
    const fs = require("fs");
    const path = require("path");
    const lire = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

    expect(lire("components/Header.jsx")).toMatch(/descripteur="RESEARCH"/);
    expect(lire("components/Footer.jsx")).toMatch(/descripteur="RESEARCH"/);

    // Les pages d'authentification gardent le mot seul : sur fond marine, en
    // 16 ou 17 px, le descripteur n'apporterait rien de lisible.
    for (const f of ["pages/Login.jsx", "pages/Register.jsx", "pages/ForgotPassword.jsx"]) {
      expect(lire(f)).not.toMatch(/descripteur=/);
    }
  });
});
