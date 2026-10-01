// Le bilan d'un affilié : ce qu'il a vendu, ce qu'il a gagné.
//
// MIREILLE, 01/10/2026 : « si un affilié veut voir son all-time sales on a
// aucune vue pour ça. Pareil pour la commission. »
//
// Les ventes cumulées existaient — dans l'onglet Performance, sous « Revenu
// validé cumulé » — et elle ne les a pas trouvées. La commission cumulée,
// elle, n'était affichée nulle part : `paid_commission` ne servait que de
// booléen dans la liste de démarrage.

import { render, screen } from "@testing-library/react";

import DepuisLeDebut from "./DepuisLeDebut";

const L = (fr) => fr;
const money = (n) => `${Number(n || 0).toFixed(2)} $`;

// L'animation du chiffre n'a rien a voir avec ce qui est teste ici, et sa
// montee progressive ferait lire une valeur intermediaire.
jest.mock("./ChiffreAnime", () => ({
  __esModule: true,
  default: ({ valeur, format, testId, className }) => (
    <span data-testid={testId} className={className}>{format(valeur)}</span>
  ),
}));

const ACTIF = {
  paid_commission: 820,
  approved_commission: 310.5,
  pending_commission: 118,
  reversed_commission: 0,
  cumulative_revenue: 10404.17,
  validated_orders: 37,
};

const afficher = (data) => render(<DepuisLeDebut data={data} L={L} money={money} lang="fr" />);

describe("la question qu'on se pose en ouvrant la page", () => {
  test("LE CAS DE MIREILLE : la commission gagnée, en tête", () => {
    afficher(ACTIF);
    // 820 + 310,50 + 118 — le total NET : les reprises sont deja hors de ces
    // trois montants, les soustraire une seconde fois les compterait en double.
    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("1248.50");
  });

  test("les ventes cumulées sont là aussi, en preuve", () => {
    afficher(ACTIF);
    const pied = screen.getByTestId("depuis-ventes");
    expect(pied).toHaveTextContent("10404.17");
    expect(pied).toHaveTextContent(/ventes validées/i);
  });

  test("le nombre de commandes situe le volume", () => {
    afficher(ACTIF);
    expect(screen.getByTestId("depuis-commandes")).toHaveTextContent("37");
  });

  test("ce qu'une commande rapporte vraiment", () => {
    /* « 20 % de commission » est abstrait. « 33,74 $ par commande » se compare
     * a l'effort d'une vente — c'est ce qui aide a decider d'en faire une de
     * plus. Les deux chiffres existaient deja, separement. */
    afficher(ACTIF);
    expect(screen.getByTestId("depuis-ventes")).toHaveTextContent("33.74");
  });
});

describe("les trois états de la commission", () => {
  test("chacun a son montant et son libellé", () => {
    /* Ils ne valent pas la meme chose : « versee » est dans le portefeuille,
     * « a verser » arrive le 1er, « en attente » peut encore disparaitre si
     * une commande est remboursee. Les confondre en un seul total cacherait
     * precisement ce qui distingue l'argent acquis de l'argent espere. */
    afficher(ACTIF);

    expect(screen.getByTestId("depuis-legende-versee")).toHaveTextContent("820.00");
    expect(screen.getByTestId("depuis-legende-versee")).toHaveTextContent(/versée/i);
    expect(screen.getByTestId("depuis-legende-a-verser")).toHaveTextContent("310.50");
    expect(screen.getByTestId("depuis-legende-en-attente")).toHaveTextContent("118.00");
  });

  test("la barre montre la proportion, pas seulement les montants", () => {
    afficher(ACTIF);

    const versee = screen.getByTestId("depuis-segment-versee");
    const attente = screen.getByTestId("depuis-segment-en-attente");
    // 820 / 1248,50 = 65,7 % ; 118 / 1248,50 = 9,5 %.
    expect(versee.style.width).toMatch(/^65\./);
    expect(attente.style.width).toMatch(/^9\./);
  });

  test("un état à zéro ne laisse pas de segment fantôme", () => {
    // Un segment de largeur nulle resterait dans la legende et ferait lire
    // « 0,00 $ en attente », ce qui n'apprend rien.
    afficher({ ...ACTIF, pending_commission: 0 });

    expect(screen.queryByTestId("depuis-segment-en-attente")).not.toBeInTheDocument();
    expect(screen.queryByTestId("depuis-legende-en-attente")).not.toBeInTheDocument();
    expect(screen.getByTestId("depuis-segment-versee")).toBeInTheDocument();
  });

  test("la barre est décrite pour les lecteurs d'écran", () => {
    // Une rangee de couleurs ne dit rien a qui ne la voit pas.
    afficher(ACTIF);
    const barre = screen.getByTestId("depuis-barre");
    expect(barre).toHaveAttribute("role", "img");
    expect(barre.getAttribute("aria-label")).toMatch(/versée/i);
    expect(barre.getAttribute("aria-label")).toMatch(/en attente/i);
  });
});

describe("les reprises", () => {
  test("elles sont annoncées, pas tues", () => {
    /* `reversed_commission` etait calcule, renvoye, et jamais montre. Un ecart
     * qu'on decouvre en comptant ses versements, c'est la certitude de s'etre
     * fait avoir. */
    afficher({ ...ACTIF, reversed_commission: 45 });

    const avis = screen.getByTestId("depuis-reprise");
    expect(avis).toHaveTextContent("45.00");
    expect(avis).toHaveTextContent(/remboursées/i);
    // Et on dit que ce montant n'est PAS dans le total, sinon on soupconne
    // une double soustraction.
    expect(avis).toHaveTextContent(/pas inclus/i);
  });

  test("le texte n'ACCUSE pas : la commission suit la vente", () => {
    /* MIREILLE : « ca sonne mal, comme si nous les avions repris ». Elle a
     * raison, et c'est faux en plus d'etre maladroit : personne n'a rien
     * retire a l'affilie. Le client a ete rembourse, donc la vente n'a pas eu
     * lieu, donc il n'y a pas de commission dessus.
     *
     * Le mot « repris » est donc banni de cette phrase, et la regle y est
     * enoncee a la place. */
    afficher({ ...ACTIF, reversed_commission: 45 });

    const avis = screen.getByTestId("depuis-reprise");
    expect(avis).not.toHaveTextContent(/repris/i);
    expect(avis).not.toHaveTextContent(/retir/i);
    expect(avis).toHaveTextContent(/la commission suit la vente/i);
  });

  test("sans reprise, aucune mention", () => {
    // Annoncer « 0,00 $ repris » inquieterait pour rien.
    afficher(ACTIF);
    expect(screen.queryByTestId("depuis-reprise")).not.toBeInTheDocument();
  });

  test("elles ne sont pas soustraites une seconde fois", () => {
    // Le statut « reversed » sort deja ces montants des trois autres.
    afficher({ ...ACTIF, reversed_commission: 45 });
    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("1248.50");
  });
});

describe("un affilié qui débute", () => {
  test("on ne lui montre pas une barre vide", () => {
    /* Zero partout : une barre grise et trois « 0,00 $ » diraient « tu n'as
     * rien fait ». Une phrase tournee vers la suite dit la meme verite sans
     * la lui jeter au visage. */
    afficher({ paid_commission: 0, approved_commission: 0, pending_commission: 0,
               reversed_commission: 0, cumulative_revenue: 0, validated_orders: 0 });

    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("0.00");
    expect(screen.queryByTestId("depuis-barre")).not.toBeInTheDocument();
    expect(screen.getByText(/première commission apparaîtra ici/i)).toBeInTheDocument();
  });

  test("sans commande, pas de moyenne par commande", () => {
    // Une division par zero afficherait « NaN $ » ou « 0,00 $ par commande »,
    // ce qui est faux : il n'y a pas de moyenne, pas une moyenne nulle.
    afficher({ ...ACTIF, validated_orders: 0, cumulative_revenue: 0 });
    expect(screen.getByTestId("depuis-ventes")).not.toHaveTextContent(/par commande/i);
    expect(screen.queryByTestId("depuis-commandes")).not.toBeInTheDocument();
  });
});

describe("des données incomplètes", () => {
  test("rien ne lève, et aucun montant négatif ne s'affiche", () => {
    // Le tableau de bord se rend avant que la fiche soit chargee, et une
    // valeur aberrante ne doit pas produire une barre a l'envers.
    for (const data of [undefined, {}, { paid_commission: -50 }]) {
      const { unmount } = afficher(data);
      expect(screen.getByTestId("depuis-le-debut")).toBeInTheDocument();
      expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("0.00");
      unmount();
    }
  });
});
