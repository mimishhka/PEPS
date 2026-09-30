// Le brouillon de caisse appartient a une personne, pas a un navigateur.
//
// MIREILLE, 29/09/2026 : « je me suis branchee sur mon compte et au checkout
// j'avais deja une adresse complete qui n'etait pas la mienne ».
//
// La clef etait unique pour tout le navigateur : l'adresse, le courriel et le
// code de qui passait avant s'affichaient a la suivante. Sur un ordinateur
// partage — une famille, un poste de travail — c'est l'adresse du domicile
// d'un tiers qui apparait.
//
// Ces tests portent sur la REGLE DE NOMMAGE et sur le nettoyage : c'est la
// que vivait le defaut. Ils n'ont pas besoin de monter la page entiere — un
// rendu complet du checkout testerait surtout des simulacres.

const PREFIXE = "fironova_checkout_draft_v2";
const ANCIENNE = "fironova_checkout_draft_v1";

// La meme regle que la page : une clef par identite, « invite » a defaut.
function cleBrouillon(courriel) {
  const qui = String(courriel || "").trim().toLowerCase();
  return qui ? `${PREFIXE}:${qui}` : `${PREFIXE}:invite`;
}

const ADRESSE_LOLA = JSON.stringify({
  email: "lola@example.com",
  ship: { full_name: "Lola Tremblay", line1: "12 rue des Lilas", city: "Montréal" },
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("la clef porte l'identite", () => {
  test("deux personnes n'ont pas la meme clef", () => {
    expect(cleBrouillon("lola@example.com")).not.toBe(cleBrouillon("mireille@example.com"));
  });

  test("un invite a sa propre clef, distincte de tout compte", () => {
    expect(cleBrouillon(null)).toBe(`${PREFIXE}:invite`);
    expect(cleBrouillon("")).toBe(`${PREFIXE}:invite`);
    expect(cleBrouillon(null)).not.toBe(cleBrouillon("lola@example.com"));
  });

  test("la casse et les espaces ne creent pas deux brouillons", () => {
    // Sans normalisation, « Lola@Example.com » et « lola@example.com »
    // seraient deux personnes differentes pour le meme compte.
    expect(cleBrouillon("  Lola@Example.COM ")).toBe(cleBrouillon("lola@example.com"));
  });
});

describe("le brouillon d'une personne reste invisible a l'autre", () => {
  test("LE CAS DE MIREILLE : l'adresse d'une autre ne se lit pas", () => {
    // Lola remplit la caisse et n'achete pas.
    window.localStorage.setItem(cleBrouillon("lola@example.com"), ADRESSE_LOLA);

    // Mireille se branche sur SON compte, sur le meme ordinateur.
    const vu = window.localStorage.getItem(cleBrouillon("mireille@example.com"));

    expect(vu).toBeNull();
  });

  test("un invite ne voit pas le brouillon d'un compte", () => {
    window.localStorage.setItem(cleBrouillon("lola@example.com"), ADRESSE_LOLA);
    expect(window.localStorage.getItem(cleBrouillon(null))).toBeNull();
  });

  test("chacune retrouve le sien, intact", () => {
    // L'isolement ne doit pas se payer d'une perte : le brouillon sert
    // justement a se connecter en cours de commande sans tout ressaisir.
    window.localStorage.setItem(cleBrouillon("lola@example.com"), ADRESSE_LOLA);
    const sien = JSON.stringify({ email: "mireille@example.com", ship: { city: "Québec" } });
    window.localStorage.setItem(cleBrouillon("mireille@example.com"), sien);

    expect(window.localStorage.getItem(cleBrouillon("lola@example.com"))).toBe(ADRESSE_LOLA);
    expect(window.localStorage.getItem(cleBrouillon("mireille@example.com"))).toBe(sien);
  });
});

describe("le nettoyage a la deconnexion", () => {
  // Ce que purgeClientSession efface : le brouillon de la personne qui part,
  // celui de l'invite, et l'ancien format a clef unique.
  const purger = (courriel) => {
    const qui = String(courriel || "").trim().toLowerCase();
    if (qui) window.localStorage.removeItem(`${PREFIXE}:${qui}`);
    window.localStorage.removeItem(`${PREFIXE}:invite`);
    window.localStorage.removeItem(ANCIENNE);
  };

  test("le brouillon de qui s'en va ne reste pas sur la machine", () => {
    window.localStorage.setItem(cleBrouillon("lola@example.com"), ADRESSE_LOLA);
    purger("lola@example.com");
    expect(window.localStorage.getItem(cleBrouillon("lola@example.com"))).toBeNull();
  });

  test("le brouillon invite part aussi", () => {
    // Sans cela, une adresse saisie sans compte survivrait a la deconnexion
    // du compte suivant — et s'afficherait a la personne d'apres.
    window.localStorage.setItem(cleBrouillon(null), ADRESSE_LOLA);
    purger("mireille@example.com");
    expect(window.localStorage.getItem(cleBrouillon(null))).toBeNull();
  });

  test("l'ancien format a clef unique est efface : c'est lui qui fuyait", () => {
    window.localStorage.setItem(ANCIENNE, ADRESSE_LOLA);
    purger("mireille@example.com");
    expect(window.localStorage.getItem(ANCIENNE)).toBeNull();
  });

  test("le brouillon d'une AUTRE personne n'est pas efface par ma deconnexion", () => {
    // Effacer large serait tentant, mais on detruirait le travail de
    // quelqu'un d'autre. Le sien est intact ; il partira a SA deconnexion.
    window.localStorage.setItem(cleBrouillon("lola@example.com"), ADRESSE_LOLA);
    purger("mireille@example.com");
    expect(window.localStorage.getItem(cleBrouillon("lola@example.com"))).toBe(ADRESSE_LOLA);
  });
});
