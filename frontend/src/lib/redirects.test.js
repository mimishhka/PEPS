import {
  sanitizeRedirectTarget,
  ciblePostConnexion,
  hrefConnexion,
  REPLI_CONNEXION,
} from "./redirects";

describe("sanitizeRedirectTarget", () => {
  it("preserves same-origin relative paths", () => {
    expect(sanitizeRedirectTarget("/account?tab=security", "/")).toBe("/account?tab=security");
    expect(sanitizeRedirectTarget("/affiliate/join?token=abc123", "/login")).toBe("/affiliate/join?token=abc123");
  });

  it("rejects external or unsafe redirect targets", () => {
    expect(sanitizeRedirectTarget("https://evil.example", "/")).toBe("/");
    expect(sanitizeRedirectTarget("//evil.example", "/login")).toBe("/login");
    expect(sanitizeRedirectTarget("javascript:alert(1)", "/account")).toBe("/account");
  });

  it("falls back when the input is empty or malformed", () => {
    expect(sanitizeRedirectTarget("", "/account")).toBe("/account");
    expect(sanitizeRedirectTarget("   ", "/login")).toBe("/login");
  });
});

// ===========================================================================
// Où l'on arrive après s'être connecté, et où mène l'icône de compte.
//
// MIREILLE, 29/09/2026 :
//   « un affilié qui se connecte doit être redirigé directement vers son
//     tableau de bord »  → ciblePostConnexion
//   « quand je me déconnecte d'OPS et que je clique sur l'icône du compte
//     client, il ne se passe rien »  → hrefConnexion
//
// Ces deux règles vivaient dispersées : la première dans AuthCallback
// seulement — donc absente de la connexion par mot de passe — et la seconde
// nulle part. Les rassembler ici leur donne enfin des tests.
// ===========================================================================

const ADMIN = "/ops-portal-fn7k2q";

describe("ciblePostConnexion", () => {
  test("LE CAS DE MIREILLE : une affiliée arrive sur son tableau de bord", () => {
    expect(ciblePostConnexion(REPLI_CONNEXION, true)).toBe("/affiliate");
  });

  test("sans destination du tout, une affiliée y arrive aussi", () => {
    // Le cas d'une connexion lancée depuis l'accueil : aucune page n'était
    // demandée, donc le repli s'applique — et c'est précisément là que le
    // tableau de bord doit gagner.
    expect(ciblePostConnexion("", true)).toBe("/affiliate");
    expect(ciblePostConnexion(null, true)).toBe("/affiliate");
  });

  test("un compte client va sur son compte, pas sur le tableau de bord", () => {
    expect(ciblePostConnexion(REPLI_CONNEXION, false)).toBe("/account");
    expect(ciblePostConnexion("", false)).toBe("/account");
  });

  test("une destination PRÉCISE garde la priorité, même pour une affiliée", () => {
    // Sinon un affilié ne pourrait plus finir une commande : il cliquerait
    // « se connecter » depuis la caisse pour atterrir sur ses statistiques,
    // panier abandonné derrière lui.
    expect(ciblePostConnexion("/checkout", true)).toBe("/checkout");
    expect(ciblePostConnexion("/order/abc123", true)).toBe("/order/abc123");
  });

  test("une affiliée peut encore atteindre son compte client", () => {
    // « /account?tab=orders » n'est pas le repli générique : c'est une
    // demande. La distinction importe, sans quoi la page compte deviendrait
    // inatteignable pour un affilié.
    expect(ciblePostConnexion("/account?tab=orders", true)).toBe("/account?tab=orders");
  });

  test("une destination externe ne sort jamais du site", () => {
    expect(ciblePostConnexion("https://ailleurs.example/vol", true)).toBe("/affiliate");
    expect(ciblePostConnexion("//ailleurs.example", false)).toBe("/account");
    expect(ciblePostConnexion("javascript:alert(1)", true)).toBe("/affiliate");
  });

  test("le drapeau n'est pas forcément un booléen", () => {
    // Le serveur peut omettre le champ — c'est justement ce que faisait
    // /auth/login. Un absent vaut « non affilié », sans exception.
    expect(ciblePostConnexion(REPLI_CONNEXION, undefined)).toBe("/account");
    expect(ciblePostConnexion(REPLI_CONNEXION, null)).toBe("/account");
  });
});

describe("hrefConnexion", () => {
  test("LE CAS DE MIREILLE : sorti d'OPS, le lien ne renvoie pas sur OPS", () => {
    expect(hrefConnexion(ADMIN, ADMIN)).toBe("/login?next=%2Faccount");
    expect(hrefConnexion(`${ADMIN}/orders`, ADMIN)).toBe("/login?next=%2Faccount");
  });

  test("depuis la page de connexion, le lien ne pointe pas sur elle-même", () => {
    // C'est le « il ne se passe rien » : la route admin s'évacue vers /login
    // dès que la session tombe, et l'icône y renvoyait. React Router ne
    // changeait qu'une chaîne de requête — rien ne bougeait à l'écran, et
    // aucune erreur ne venait l'expliquer.
    expect(hrefConnexion("/login?next=%2Fops-portal-fn7k2q", ADMIN))
      .toBe("/login?next=%2Faccount");
  });

  test("les autres pages d'authentification non plus", () => {
    for (const p of ["/register", "/auth/callback?token=x", "/forgot-password",
                     "/reset-password?token=y"]) {
      expect(hrefConnexion(p, ADMIN)).toBe("/login?next=%2Faccount");
    }
  });

  test("depuis une page ordinaire, on y revient après connexion", () => {
    // La mémorisation reste utile : se connecter depuis une fiche produit ne
    // doit pas faire perdre la fiche produit.
    expect(hrefConnexion("/product/bpc-157", ADMIN)).toBe("/login?next=%2Fproduct%2Fbpc-157");
    expect(hrefConnexion("/checkout", ADMIN)).toBe("/login?next=%2Fcheckout");
  });

  test("depuis l'accueil, le compte devient la destination", () => {
    // « / » comme destination ne dit rien : on se connecte pour aller quelque
    // part, et l'icône de compte annonce où.
    expect(hrefConnexion("/", ADMIN)).toBe("/login?next=%2Faccount");
    expect(hrefConnexion("", ADMIN)).toBe("/login?next=%2Faccount");
  });

  test("sans chemin d'administration fourni, rien ne casse", () => {
    expect(hrefConnexion("/catalog", undefined)).toBe("/login?next=%2Fcatalog");
  });

  test("le résultat est toujours un lien exploitable", () => {
    for (const p of ["/", ADMIN, "/login", "/catalog", "", null, undefined]) {
      expect(hrefConnexion(p, ADMIN)).toMatch(/^\/login\?next=%2F/);
    }
  });
});
