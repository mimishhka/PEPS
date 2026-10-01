// La carte du compte affilié : ce qu'elle annonce, et à qui.
//
// MIREILLE, 01/10/2026, en regardant la carte d'une affiliée sous entente :
//
//   « à la place de la période il faudrait mettre la date du jour ou le mois
//     en cours — la période devrait être avec le titre "your sales" »
//   « pour une personne qui a une entente la vue ne doit pas avoir les sales
//     des 11 derniers mois »
//
// La période de référence trônait en tête et répondait à une question que
// personne ne se pose en ouvrant son compte. Et la colonne de prévision —
// « les onze derniers mois + ce mois-ci » — s'affichait même sous entente,
// juste au-dessus d'une phrase disant que le taux ne dépend pas de la
// période. Deux affirmations contraires dans le même bloc.
//
// Ce composant n'avait aucun test.

import { render, screen } from "@testing-library/react";

import CarteAffilie from "./CarteAffilie";

const L = (fr) => fr;
const money = (n) => `${Number(n || 0).toFixed(2)} $`;

jest.mock("./TierMark", () => ({ __esModule: true, default: () => null }));
jest.mock("./ChiffreAnime", () => ({
  __esModule: true, default: ({ valeur }) => <span>{valeur}</span>,
}));

const BAREME = {
  tier: "bronze",
  commission_rate: 0.12,
  tier_agreement: false,
  rolling12_revenue: 11240,
  projection_prochaine_periode: 12800,
  periode_debut: "2025-10-01T04:00:00+00:00",
  periode_fin: "2026-10-01T04:00:00+00:00",
  prochaine_periode_debut: "2026-11-01T04:00:00+00:00",
  taux_valide_jusqu_au: "2026-10-31T04:00:00+00:00",
  maintien_montant: 2000,
  atteinte_montant: 5000,
  next_tier: { tier: "silver", rate: 0.14, floor: 5001 },
  mensuel: [],
};

const ENTENTE = {
  ...BAREME,
  tier: "diamond", commission_rate: 0.2,
  tier_agreement: true,
  // Sous entente, le serveur n'envoie aucun montant à reconduire : le taux ne
  // dépend d'aucun seuil.
  maintien_montant: null, atteinte_montant: null, next_tier: null,
};

const afficher = (data) =>
  render(<CarteAffilie data={data} insights={{ current_month: { revenue: 0 } }}
                       L={L} money={money} tierLabel="Bronze"
                       tierJeton="--fn-palier-bronze" tierLueur="none" />);

describe("l'en-tête", () => {
  test("LE CAS DE MIREILLE : il porte la date du jour, pas la période", () => {
    afficher(BAREME);

    const entete = screen.getByTestId("carte-periode");
    expect(entete).toHaveTextContent(/Aujourd'hui/i);
    // La période de référence n'y est plus : elle répondait à une question
    // que personne ne se pose en ouvrant son compte.
    expect(entete).not.toHaveTextContent(/Période de référence/i);
    expect(screen.getByTestId("carte-aujourdhui").textContent.trim()).not.toBe("");
  });

  test("la date est celle de Montréal, pas celle du navigateur", () => {
    /* Le mois du palier bascule à minuit à Montréal. Afficher la date du
     * navigateur ferait dire à quelqu'un en Europe qu'on est le 2 alors que
     * la fenêtre, elle, est encore au 1er. */
    const attendue = new Date().toLocaleDateString("fr-CA", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      timeZone: "America/Toronto",
    });
    afficher(BAREME);
    expect(screen.getByTestId("carte-aujourdhui")).toHaveTextContent(attendue);
  });
});

describe("la période qualifie les ventes", () => {
  test("elle accompagne le montant plutôt que de trôner en tête", () => {
    afficher(BAREME);

    const sous = screen.getByTestId("carte-periode-ventes");
    expect(sous).toHaveTextContent(/douze mois clos/i);
    // Les deux bornes, là où elles servent : à qualifier un montant.
    expect(sous).toHaveTextContent(/2025/);
    expect(sous).toHaveTextContent(/2026/);
  });
});

describe("un affilié au barème", () => {
  test("voit la prévision du prochain palier", () => {
    afficher(BAREME);

    const colonne = screen.getByTestId("affiliate-paliers-prix");
    expect(colonne).toHaveTextContent(/onze derniers mois/i);
    expect(screen.getByTestId("palier-maintien")).toBeInTheDocument();
  });
});

describe("un affilié sous entente", () => {
  test("LE CAS DE MIREILLE : aucune trace des onze derniers mois", () => {
    /* Son taux ne dépend d'aucune fenêtre. Lui montrer la projection qui fixe
     * le palier des AUTRES, puis écrire dessous que son taux n'en dépend pas,
     * était une contradiction dans le même bloc. */
    afficher(ENTENTE);

    expect(screen.queryByTestId("affiliate-paliers-prix")).not.toBeInTheDocument();
    expect(screen.queryByText(/onze derniers mois/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("palier-maintien")).not.toBeInTheDocument();
  });

  test("il garde ses ventes et son taux", () => {
    // Masquer la prévision ne doit pas lui retirer ce qui le concerne.
    afficher(ENTENTE);

    expect(screen.getByTestId("affiliate-periode-total")).toBeInTheDocument();
    expect(screen.getByTestId("affiliate-tier-badge")).toBeInTheDocument();
    expect(screen.getByTestId("carte-aujourdhui")).toBeInTheDocument();
  });
});

describe("le dernier palier, SANS entente", () => {
  test("on ne lui dit pas que son taux vient d'une entente", () => {
    /* LE DÉFAUT PRÉEXISTANT QUE CE TEST GARDE.
     *
     * `sousEntente` ne signifiait pas « il y a une entente » mais « aucun
     * montant à reconduire » — ce qui arrive aussi au dernier palier. Le
     * texte affirmait pourtant « taux convenu par entente ».
     *
     * Et depuis que la colonne entière disparaît sous entente, ce texte
     * n'était plus lisible QUE par des gens sans entente : il était donc
     * systématiquement faux.
     */
    afficher({ ...BAREME, tier: "diamond", commission_rate: 0.2,
               tier_agreement: false,
               maintien_montant: null, atteinte_montant: null, next_tier: null });

    const colonne = screen.getByTestId("affiliate-paliers-prix");
    expect(colonne).not.toHaveTextContent(/entente/i);
    expect(screen.getByTestId("palier-rien-a-reconduire"))
      .toHaveTextContent(/aucun montant à reconduire/i);
  });
});
