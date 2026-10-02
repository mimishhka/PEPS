// Le vocabulaire des statuts de versement, tenu par des tests.
//
// Il vivait en TROIS exemplaires. Le troisième — la FICHE — n'en avait pas du
// tout et affichait le jeton anglais brut (`ready`, `failed`, `review`) dans
// une interface française, avec une seule couleur orange pour tout ce qui
// n'était pas payé : un versement ÉCHOUÉ s'y lisait comme un versement en
// traitement.
//
// Le premier test est celui qui compte : il fixe la liste des statuts que le
// serveur écrit vraiment. Un statut ajouté côté serveur sans être inscrit ici
// tombe dans le repli, et c'est ce test qui le dira.

import {
  ETATS_VERSEMENT,
  LIBELLE_VERSEMENT,
  LIBELLE_VERSEMENT_OPS,
  commissionsRenduesAuCycle,
  etatVersement,
  libelleVersement,
  libelleVersementOps,
  statutVersementConnu,
} from "./statutVersement";

// Relevés dans le code du serveur, pas supposés : chaque `$set` de `status`
// sur `affiliate_payouts`.
//
//   creating        server.py (2FA en attente)
//   ready           server.py (prêt à envoyer)
//   queued_manual   server.py (file manuelle)
//   dispatching     server.py (envoi en cours)
//   processing      server.py / webhook
//   paid            services/nowpayments.py (webhook)
//   paid_manual     server.py (régularisation)
//   failed          services/nowpayments.py + server.py (×2)
//   review          services/affiliate.py + server.py
const ECRITS_PAR_LE_SERVEUR = [
  "creating", "ready", "queued_manual", "dispatching", "processing",
  "paid", "paid_manual", "failed", "review",
];

describe("les statuts que le serveur écrit", () => {
  test("CHACUN est connu des deux dictionnaires", () => {
    /* Le test qui tient tout le reste. Un statut inconnu ne casse rien — il
     * tombe dans le repli — et c'est exactement pour ça qu'il faut un test :
     * personne ne le verrait. */
    const inconnusAffilie = ECRITS_PAR_LE_SERVEUR.filter(
      (s) => !statutVersementConnu(s));
    const inconnusOps = ECRITS_PAR_LE_SERVEUR.filter(
      (s) => !LIBELLE_VERSEMENT_OPS[s]);

    expect(inconnusAffilie).toEqual([]);
    expect(inconnusOps).toEqual([]);
  });

  test("et chacun reçoit un libellé, dans les deux langues", () => {
    ECRITS_PAR_LE_SERVEUR.forEach((s) => {
      ["fr", "en"].forEach((lang) => {
        expect(libelleVersement(s, lang).texte).toBeTruthy();
        const ops = libelleVersementOps(s, lang);
        expect(ops.texte).toBeTruthy();
        expect(ops.inconnu).toBe(false);
        // Jamais le jeton brut : c'était le défaut de la fiche.
        expect(ops.texte).not.toBe(s);
      });
    });
  });
});

describe("l'état canonique", () => {
  test("un état INCONNU vaut « en cours », jamais « prêt »", () => {
    /* Affirmer un état précis à partir de rien est précisément ce qui avait
     * fait annoncer « Prêt » pour un versement en vérification. */
    expect(etatVersement("quelque_chose_de_nouveau")).toBe("en_cours");
    expect(etatVersement(undefined)).toBe("en_cours");
    expect(etatVersement("")).toBe("en_cours");
  });

  test("payé est payé, quelle que soit la manière", () => {
    expect(etatVersement("paid")).toBe("paye");
    expect(etatVersement("paid_manual")).toBe("paye");
  });

  test("les cinq états de transit se disent « en cours »", () => {
    ["creating", "ready", "queued_manual", "dispatching", "processing"]
      .forEach((s) => expect(etatVersement(s)).toBe("en_cours"));
  });

  test("à vérifier et échoué sont « en vérification » pour l'affilié", () => {
    /* Groupés volontairement : l'échec LIBÈRE ses commissions, elles
     * repartent au cycle suivant. Inquiéter l'affilié sur un incident qui se
     * règle sans lui coûterait plus que ça n'informe. */
    expect(etatVersement("review")).toBe("retenu");
    expect(etatVersement("failed")).toBe("retenu");
  });

  test("chaque état canonique a son libellé", () => {
    new Set(Object.values(ETATS_VERSEMENT)).forEach((e) => {
      expect(LIBELLE_VERSEMENT[e]).toBeTruthy();
    });
  });
});

describe("les deux publics ne lisent pas la même chose", () => {
  test("l'affilié regroupe ce que l'opératrice doit distinguer", () => {
    /* Ce n'est pas une incohérence, c'est la raison d'être des deux jeux :
     * l'affilié veut savoir où est son argent, l'opératrice veut savoir quel
     * geste faire. « 2FA requis » et « à payer à la main » ne se traitent pas
     * pareil ; « en cours » suffit à l'affilié. */
    expect(libelleVersement("creating", "fr").texte)
      .toBe(libelleVersement("queued_manual", "fr").texte);
    expect(libelleVersementOps("creating", "fr").texte)
      .not.toBe(libelleVersementOps("queued_manual", "fr").texte);
  });

  test("un échec est ROUGE pour l'opératrice, pas orange", () => {
    // La fiche le peignait en orange, comme un versement en traitement.
    expect(libelleVersementOps("failed", "fr").cls).toMatch(/error/);
    expect(libelleVersementOps("processing", "fr").cls).not.toMatch(/error/);
  });

  test("un statut inconnu se SIGNALE à l'opératrice au lieu de se déguiser", () => {
    /* Le défaut d'origine : le jeton brut s'affichait en orange, à côté des
     * vrais libellés, et passait pour un état normal. */
    const r = libelleVersementOps("un_truc_neuf", "fr");
    expect(r.inconnu).toBe(true);
    expect(r.texte).toBe("un_truc_neuf");
    expect(r.cls).not.toMatch(/warning|success/);
  });

  test("et un statut vide ne rend pas une case muette", () => {
    expect(libelleVersementOps("", "fr").texte).toBe("—");
    expect(libelleVersementOps(undefined, "fr").texte).toBe("—");
  });

  test("les libellés changent avec la langue", () => {
    expect(libelleVersement("paid", "fr").texte).toBe("Payé");
    expect(libelleVersement("paid", "en").texte).toBe("Paid");
    expect(libelleVersementOps("failed", "fr").texte).toBe("Échoué");
    expect(libelleVersementOps("failed", "en").texte).toBe("Failed");
  });
});

describe("un échec a rendu ses commissions", () => {
  test("seul « failed » les rend", () => {
    /* `handle_np_payout_webhook` remet `payout_id` à None sur les lignes
     * approuvées, et les deux échecs du niveau requête le font désormais
     * aussi. Aucun autre statut ne le fait. */
    expect(commissionsRenduesAuCycle("failed")).toBe(true);
    ["review", "ready", "paid", "processing", "creating", "dispatching",
     "queued_manual", "paid_manual", undefined]
      .forEach((s) => expect(commissionsRenduesAuCycle(s)).toBe(false));
  });
});
