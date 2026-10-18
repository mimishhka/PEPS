// La console d'administration voit TOUS les produits, masqués compris.
//
// MIREILLE, 18/10/2026 : « quand je retire un produit du catalogue dans
// l'admin, le produit disparaît de ma liste, donc si je veux le remettre c'est
// impossible de le retrouver ».
//
// LE DÉFAUT ÉTAIT UN CUL-DE-SAC, et c'est la pire forme. Cet écran lisait
// `GET /products`, l'endpoint PUBLIC, qui filtre sur `{active: true}`.
// Décocher « Active » ne masquait donc pas le produit : ça le faisait sortir
// de l'écran qui sert à le modifier, sans aucun moyen d'y revenir. Le document
// restait en base, intact et inatteignable — et rien ne signalait la perte.
//
// L'INTENTION ÉTAIT POURTANT ÉCRITE DANS LA VUE. `etatProduit` sait rendre
// « masqué », la liste a un filtre d'état qui permet de ne garder que ceux-là,
// et le formulaire a sa bascule « Active ». Trois morceaux d'interface
// construits pour un cas que la requête rendait impossible à atteindre.
//
// Le filet garde les deux moitiés : que l'écran lise bien la route
// d'administration, et que l'état « masqué » existe toujours pour l'afficher.

/* Les mêmes feintes que les autres tests de cette console : importer
 * `AdminProducts` tire toute sa chaîne de dépendances, et `etatProduit` est
 * une fonction pure qui n'en a besoin d'aucune. */
jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  API_BASE: "",
  formatApiError: (e) => String(e),
  resolveAssetUrl: (u) => u,
}));
jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
}));
jest.mock("../../../components/ConfirmDialog", () => ({
  useConfirm: () => jest.fn().mockResolvedValue(true),
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import { etatProduit } from "./AdminProducts";

const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "AdminProducts.jsx"),
  "utf8",
);

const sansCommentaires = (t) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*/g, " ");

describe("la liste de l'administration", () => {
  test("ELLE LIT LA ROUTE D'ADMINISTRATION, PAS LE CATALOGUE PUBLIC", () => {
    const code = sansCommentaires(SOURCE);
    expect(code).toContain('api.get("/admin/products")');
    expect(code).not.toContain('api.get("/products")');
  });

  test("et aucun autre écran d'administration ne lit un endpoint public", () => {
    /* Le cas trouvé était seul, et c'est une information : la règle « la
     * console lit ses propres routes » tenait partout ailleurs. Ce test la
     * garde pour l'écran suivant, qu'on écrira sans y penser. */
    const racine = path.join(__dirname, "..");
    const fautifs = [];

    const parcourir = (dossier) => {
      for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
        const complet = path.join(dossier, e.name);
        if (e.isDirectory()) { parcourir(complet); continue; }
        if (!e.name.endsWith(".jsx") || e.name.includes(".test.")) continue;
        const code = sansCommentaires(fs.readFileSync(complet, "utf8"));
        for (const m of code.matchAll(/api\.[a-z]+\(\s*"(\/[^"]*)"/g)) {
          const route = m[1];
          if (!route.startsWith("/admin") && !route.startsWith("/auth")) {
            fautifs.push(`${e.name} :: ${route}`);
          }
        }
      }
    };
    parcourir(racine);
    expect(fautifs).toEqual([]);
  });
});

describe("l'état qui rend le produit retrouvable", () => {
  const variantes = (...stocks) => stocks.map((s) => ({ stock: s }));

  test("un produit retiré du catalogue est « masqué », pas absent", () => {
    expect(etatProduit({ active: false, variants: variantes(5, 3) })).toBe("masque");
  });

  test("et « masqué » l'emporte sur la rupture", () => {
    /* Sinon un produit retiré ET vide s'afficherait « rupture », et elle le
     * chercherait parmi les ruptures au lieu des masqués. */
    expect(etatProduit({ active: false, variants: variantes(0, 0) })).toBe("masque");
  });

  test("les trois autres états restent distincts", () => {
    expect(etatProduit({ active: true, variants: variantes(0, 0) })).toBe("rupture");
    expect(etatProduit({ active: true, variants: variantes(5, 0) })).toBe("partiel");
    expect(etatProduit({ active: true, variants: variantes(5, 3) })).toBe("actif");
  });
});
