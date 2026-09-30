// Quelles pages quitter quand une session se ferme.
//
// MIREILLE, 29/09/2026 : « lorsque je me déconnecte alors que je suis sur la
// page des instructions de paiement, celle-ci reste là ».

import { doitQuitterALaDeconnexion } from "./deconnexion";

describe("doitQuitterALaDeconnexion", () => {
  test("LE CAS DE MIREILLE : les instructions de paiement ne restent pas", () => {
    // Cette page porte le nom, le montant, la référence Interac et l'adresse
    // de livraison. Sur un ordinateur partagé, la laisser après le départ,
    // c'est la montrer à la personne suivante.
    expect(doitQuitterALaDeconnexion("/order/6f2a-91bc")).toBe(true);
  });

  test("l'accueil et le catalogue ne bougent pas", () => {
    // Se déconnecter depuis une page publique doit rester sans effet visible :
    // évacuer large serait une gêne, pas une protection.
    for (const p of ["/", "/catalog", "/product/bpc-157", "/faq", "/about",
                     "/affiliate/programme", "/privacy"]) {
      expect(doitQuitterALaDeconnexion(p)).toBe(false);
    }
  });

  test("les pages protégées ne sont pas de son ressort", () => {
    // ProtectedRoute les évacue de lui-même dès que `user` tombe. Les
    // dupliquer ici créerait deux règles pour un seul comportement, donc une
    // occasion de les voir diverger.
    for (const p of ["/account", "/affiliate", "/affiliate/faq"]) {
      expect(doitQuitterALaDeconnexion(p)).toBe(false);
    }
  });

  test("une page qui commence par le meme mot n'est pas visee", () => {
    // « /orders » n'existe pas côté client, mais la règle doit viser le
    // segment, pas le préfixe : sinon toute route future en « /order… »
    // serait évacuée sans qu'on l'ait voulu.
    expect(doitQuitterALaDeconnexion("/orders")).toBe(false);
    expect(doitQuitterALaDeconnexion("/order")).toBe(false);
  });

  test("les entrees degradees valent non", () => {
    // Le composant lit une référence qui peut être vide au premier rendu.
    for (const p of ["", null, undefined, 0, {}]) {
      expect(doitQuitterALaDeconnexion(p)).toBe(false);
    }
  });
});
