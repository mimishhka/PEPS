// Le bilan d'un affilié : ce qu'il a vendu, ce qu'il a gagné.
//
// MIREILLE, 01/10/2026 : « si un affilié veut voir son all-time sales on a
// aucune vue pour ça. Pareil pour la commission. »
//
// Les ventes cumulées existaient — dans l'onglet Performance, sous « Revenu
// validé cumulé », renommé « Ventes validées cumulées » depuis — et elle ne les
// a pas trouvées. La commission cumulée,
// elle, n'était affichée nulle part : `paid_commission` ne servait que de
// booléen dans la liste de démarrage.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

const afficher = (data, series) =>
  render(<DepuisLeDebut data={data} series={series} L={L} money={money} lang="fr" />);

/* Douze mois, du plus ancien au plus recent — c'est l'ordre que rend
 * `_douze_derniers_mois`, MOIS COURANT INCLUS. Le dernier element est donc le
 * mois en cours, et « mois dernier » est l'avant-dernier. Les commissions sont
 * distinctes pour que chaque fenetre ait une somme reconnaissable. */
const SERIE = [
  { month: "2025-11", revenue: 100, commission: 10, orders: 1, reversed: 0 },
  { month: "2025-12", revenue: 200, commission: 20, orders: 2, reversed: 0 },
  { month: "2026-01", revenue: 300, commission: 30, orders: 3, reversed: 0 },
  { month: "2026-02", revenue: 400, commission: 40, orders: 4, reversed: 0 },
  { month: "2026-03", revenue: 500, commission: 50, orders: 5, reversed: 0 },
  { month: "2026-04", revenue: 600, commission: 60, orders: 6, reversed: 0 },
  { month: "2026-05", revenue: 700, commission: 70, orders: 7, reversed: 0 },
  { month: "2026-06", revenue: 800, commission: 80, orders: 8, reversed: 0 },
  { month: "2026-07", revenue: 900, commission: 90, orders: 9, reversed: 0 },
  { month: "2026-08", revenue: 1000, commission: 100, orders: 10, reversed: 0 },
  { month: "2026-09", revenue: 1100, commission: 110, orders: 11, reversed: 0 },
  { month: "2026-10", revenue: 1200, commission: 120, orders: 12, reversed: 0 },
];

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

  test("et ce chiffre se nomme COMMISSION, pas panier moyen", () => {
    /* Vu sur le compte LOLA10 le 02/10/2026 : cette ligne affichait « 181,35 $
     * par commande en moyenne » juste apres un montant de VENTES, pendant que
     * l'onglet Performance chiffrait le panier moyen a 1 766,21 $. Deux
     * « moyennes par commande » a deux onglets d'ecart, dont une etait une
     * commission. Le mot manquant valait la contradiction. */
    afficher(ACTIF);
    expect(screen.getByTestId("depuis-ventes"))
      .toHaveTextContent(/de commission par commande/i);
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

// ===========================================================================
// LES FILTRES
//
// MIREILLE, 01/10/2026 : « ensuite le all time avec des filtres : 3 derniers
// mois, six derniers mois, derniere annee, mois dernier. Donc avec un
// graphique peut-etre aussi. »
// ===========================================================================

describe("les filtres de periode", () => {
  test("sans serie mensuelle, aucun filtre n'est propose", () => {
    // Proposer « 3 mois » a quelqu'un dont on n'a pas l'historique mensuel
    // afficherait zero sous chaque fenetre.
    afficher(ACTIF);
    expect(screen.queryByTestId("depuis-filtres")).not.toBeInTheDocument();
  });

  test("« depuis le debut » est la vue par defaut", () => {
    afficher(ACTIF, SERIE);
    // Les scalaires, pas la serie : 820 + 310,50 + 118.
    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("1248.50");
    expect(screen.getByTestId("depuis-filtre-tout")).toHaveAttribute("aria-pressed", "true");
  });

  test("LE CAS DE MIREILLE : « mois dernier » exclut le mois courant", async () => {
    /* La serie inclut le mois courant (`_douze_derniers_mois`). « Mois
     * dernier » nomme un mois CLOS : c'est le seul filtre qui retire le mois
     * en cours, et c'est ce qui le distingue d'une fenetre glissante. */
    afficher(ACTIF, SERIE);
    await userEvent.click(screen.getByTestId("depuis-filtre-m1"));

    // Septembre, et non octobre.
    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("110.00");
    expect(screen.getByTestId("depuis-ventes")).toHaveTextContent("1100.00");
    expect(screen.getByTestId("depuis-commandes")).toHaveTextContent("11");
  });

  test("« 3 mois » additionne les trois derniers, mois courant COMPRIS", async () => {
    afficher(ACTIF, SERIE);
    await userEvent.click(screen.getByTestId("depuis-filtre-m3"));

    // 100 + 110 + 120 = aout, septembre, octobre.
    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("330.00");
  });

  test("« 6 mois » et « 12 mois » aussi", async () => {
    afficher(ACTIF, SERIE);

    await userEvent.click(screen.getByTestId("depuis-filtre-m6"));
    // 70 + 80 + 90 + 100 + 110 + 120
    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("570.00");

    await userEvent.click(screen.getByTestId("depuis-filtre-m12"));
    // La somme de la serie entiere : 10 + 20 + ... + 120 = 780.
    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("780.00");
  });

  test("CHAQUE FENETRE ECRIT LES MOIS QU'ELLE ADDITIONNE", async () => {
    /* « 3 derniers mois » est ambigu : avec ou sans le mois courant, qui
     * n'est pas fini ? Plutot que de choisir une convention et d'esperer
     * qu'elle se devine, le bloc ecrit les mois reellement comptes. */
    afficher(ACTIF, SERIE);
    await userEvent.click(screen.getByTestId("depuis-filtre-m3"));

    const fenetre = screen.getByTestId("depuis-fenetre");
    expect(fenetre).toHaveTextContent(/2026/);
    // Une plage, pas un mois isole.
    expect(fenetre.textContent).toMatch(/\s(à|to)\s/);
  });

  test("sous une fenetre, la repartition a trois etats DISPARAIT", async () => {
    /* « Versee / a verser / en attente » est un etat PRESENT de l'argent, pas
     * une quantite datable : une commission versee en mars n'etait pas
     * « versee » en mars. Les afficher sous un filtre de trois mois donnerait
     * trois nombres qui ne s'additionnent pas au total affiche. */
    afficher(ACTIF, SERIE);
    expect(screen.getByTestId("depuis-barre")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("depuis-filtre-m3"));

    expect(screen.queryByTestId("depuis-barre")).not.toBeInTheDocument();
    expect(screen.queryByTestId("depuis-legende-versee")).not.toBeInTheDocument();
  });

  test("et la mention des remboursements aussi", async () => {
    // `reversed_commission` est un cumul depuis le debut : l'afficher sous
    // une fenetre de trois mois attribuerait a ces trois mois des reprises
    // qui n'en viennent pas.
    afficher({ ...ACTIF, reversed_commission: 45 }, SERIE);
    expect(screen.getByTestId("depuis-reprise")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("depuis-filtre-m6"));
    expect(screen.queryByTestId("depuis-reprise")).not.toBeInTheDocument();
  });

  test("une serie plus courte que la fenetre n'invente pas de zeros", async () => {
    /* Un affilie de deux mois voit deux mois sous « 6 mois », et non quatre
     * mois a zero : un zero invente se lit comme un mois rate. */
    const courte = SERIE.slice(-2);
    afficher(ACTIF, courte);

    await userEvent.click(screen.getByTestId("depuis-filtre-m6"));
    // 110 + 120 seulement.
    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("230.00");
    // Et a deux mois il n'y a pas de frise : voir plus bas.
    expect(screen.queryByTestId("depuis-graphe")).not.toBeInTheDocument();
  });

  test("la moyenne par commande suit la fenetre", async () => {
    afficher(ACTIF, SERIE);
    await userEvent.click(screen.getByTestId("depuis-filtre-m1"));
    // 110 / 11 = 10,00 par commande.
    expect(screen.getByTestId("depuis-ventes")).toHaveTextContent("10.00");
  });
});

// ===========================================================================
// LE GRAPHIQUE
// ===========================================================================

describe("le graphique mensuel", () => {
  test("IL REND VRAIMENT — c'est pourquoi il n'est pas en Recharts", () => {
    /* Recharts mesure son conteneur : en jsdom il ne rend rien, donc rien ne
     * serait verifiable. Douze barres en flex se testent, ne coutent aucun
     * kilo-octet, et s'adaptent sans point de rupture. */
    afficher(ACTIF, SERIE);

    expect(screen.getByTestId("depuis-graphe")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^depuis-barre-20/)).toHaveLength(12);
  });

  test("la hauteur est proportionnelle, et un mois a zero reste visible", () => {
    const avecZero = [
      { month: "2026-08", revenue: 600, commission: 60, orders: 6 },
      { month: "2026-09", revenue: 0, commission: 0, orders: 0 },
      { month: "2026-10", revenue: 1200, commission: 120, orders: 12 },
    ];
    afficher(ACTIF, avecZero);

    // Le sommet occupe toute la hauteur.
    expect(screen.getByTestId("depuis-barre-2026-10").style.height).toBe("100%");
    // Un mois a zero garde un plancher : il doit se lire comme un mois, pas
    // disparaitre de la frise.
    expect(screen.getByTestId("depuis-barre-2026-09").style.height).toBe("2%");
  });

  test("LE FILTRE SE VOIT SUR LE GRAPHIQUE : les mois exclus s'estompent", async () => {
    // Ils s'estompent au lieu de disparaitre, pour qu'on voie ce qu'on exclut.
    afficher(ACTIF, SERIE);
    await userEvent.click(screen.getByTestId("depuis-filtre-m3"));

    expect(screen.getByTestId("depuis-barre-2026-10")).toHaveAttribute("data-dedans", "oui");
    expect(screen.getByTestId("depuis-barre-2026-08")).toHaveAttribute("data-dedans", "oui");
    expect(screen.getByTestId("depuis-barre-2026-07")).toHaveAttribute("data-dedans", "non");
    expect(screen.getByTestId("depuis-barre-2025-11")).toHaveAttribute("data-dedans", "non");
    // Les douze barres restent presentes.
    expect(screen.getAllByTestId(/^depuis-barre-20/)).toHaveLength(12);
  });

  test("sans commission nulle part, pas de graphique vide", () => {
    // Douze barres au plancher ne diraient rien.
    afficher(ACTIF, SERIE.map((m) => ({ ...m, commission: 0 })));
    expect(screen.queryByTestId("depuis-graphe")).not.toBeInTheDocument();
  });

  test("il est decrit pour les lecteurs d'ecran", () => {
    afficher(ACTIF, SERIE);
    const frise = screen.getByTestId("depuis-graphe").querySelector('[role="img"]');
    expect(frise.getAttribute("aria-label")).toMatch(/12/);
  });
});

// ===========================================================================
// CE QUI ETAIT SURDIMENSIONNE
//
// MIREILLE, 01/10/2026, capture a l'appui : « c'est surdimensionne, ca n'a
// aucun sens ». Elle regardait un compte a 500,40 $ entierement verses, avec
// deux mois d'historique. Deux blocs occupaient la moitie de l'ecran sans rien
// apprendre : une barre pleine sur toute la largeur, et une frise de deux
// barres geantes.
// ===========================================================================

describe("la barre de repartition", () => {
  test("LE CAS DE MIREILLE : un seul etat, donc pas de barre", () => {
    /* Tout est verse : un seul segment, donc une barre a 100 %. Une barre de
     * proportion qui n'a rien a comparer n'est plus une proportion, c'est un
     * aplat decoratif — et la legende juste en dessous dit deja le montant et
     * son etat. */
    afficher({ paid_commission: 500.40, approved_commission: 0,
               pending_commission: 0, reversed_commission: 0,
               cumulative_revenue: 4170, validated_orders: 12 });

    expect(screen.queryByTestId("depuis-barre")).not.toBeInTheDocument();
    // Le montant et son etat restent dits, par la legende.
    expect(screen.getByTestId("depuis-legende-versee")).toHaveTextContent("500.40");
    expect(screen.getByTestId("depuis-gagne")).toHaveTextContent("500.40");
  });

  test("des qu'il y a deux etats, elle revient", () => {
    // La proportion redevient une information : c'est tout ce qui justifie la
    // place qu'elle prend.
    afficher({ ...ACTIF, pending_commission: 0 });

    expect(screen.getByTestId("depuis-barre")).toBeInTheDocument();
    expect(screen.getByTestId("depuis-segment-versee")).toBeInTheDocument();
    expect(screen.getByTestId("depuis-segment-a-verser")).toBeInTheDocument();
  });
});

describe("la taille de la frise", () => {
  test("LE CAS DE MIREILLE : deux mois ne font pas un graphique", () => {
    /* Deux barres ne dessinent aucune tendance : elles repetent en couleur ce
     * que le montant dit deja en chiffres, et en `flex-1` chacune prenait la
     * moitie de l'ecran. */
    afficher(ACTIF, SERIE.slice(-2));
    expect(screen.queryByTestId("depuis-graphe")).not.toBeInTheDocument();
  });

  test("a trois mois, elle apparait", () => {
    afficher(ACTIF, SERIE.slice(-3));
    expect(screen.getByTestId("depuis-graphe")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^depuis-barre-20/)).toHaveLength(3);
  });

  test("LA LARGEUR SUIT LE NOMBRE DE MOIS, elle ne s'etire pas pour remplir", () => {
    /* C'est la correction de fond : bornee a ~46 px par mois et plafonnee a
     * la largeur disponible, la frise GRANDIT avec l'historique au lieu de
     * s'etaler. Un nouvel affilie voit une petite frise, pas un mur. */
    const { unmount } = afficher(ACTIF, SERIE.slice(-3));
    expect(screen.getByTestId("depuis-graphe").style.maxWidth).toBe("138px");
    unmount();

    afficher(ACTIF, SERIE);
    expect(screen.getByTestId("depuis-graphe").style.maxWidth).toBe("552px");
  });

  test("une seule legende, et elle nomme la periode couverte", () => {
    // Deux libelles aux extremites supposaient que la frise occupe toute la
    // largeur : depuis qu'elle est bornee, le second flottait dans le vide.
    afficher(ACTIF, SERIE);

    const legende = screen.getByTestId("depuis-graphe-periode");
    expect(legende).toHaveTextContent("2025");
    expect(legende).toHaveTextContent("2026");
  });
});
