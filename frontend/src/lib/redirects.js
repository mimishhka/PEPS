/* Destination demandée avant la connexion, mémorisée entre deux navigations.
 *
 * Le retour par lien magique n'est PAS une navigation du SPA : la personne
 * quitte le site, ouvre son courriel et revient par une URL neuve. L'état
 * `location.state.from` que pose ProtectedRoute meurt à ce moment-là, et
 * AuthCallback n'avait plus que « /account » en dur. Un affilié qui demandait
 * /affiliate se connectait donc pour atterrir sur son compte client.
 *
 * On passe par localStorage et non sessionStorage : le lien du courriel
 * s'ouvre souvent dans un ONGLET neuf, où sessionStorage est vide.
 *
 * Durée de vie alignée sur celle du lien magique : quinze minutes. Au-delà, la
 * destination est périmée : mieux vaut le repli que d'expédier quelqu'un vers
 * une page demandée la veille.
 */
const CLE_REDIRECTION = "fn_post_login_redirect";
// Le repli generique : « je me connecte », sans page precise en tete.
export const REPLI_CONNEXION = "/account";
const DUREE_REDIRECTION_MS = 15 * 60 * 1000;

export function rememberRedirectTarget(path) {
  const cible = sanitizeRedirectTarget(path, "");
  if (!cible) return;
  try {
    window.localStorage.setItem(
      CLE_REDIRECTION,
      JSON.stringify({ path: cible, at: Date.now() })
    );
  } catch {
    // Stockage refusé (navigation privée, quota) : on perd la destination et
    // le repli s'applique. Jamais une raison d'empêcher la connexion.
  }
}

export function consumeRedirectTarget() {
  try {
    const brut = window.localStorage.getItem(CLE_REDIRECTION);
    if (!brut) return "";
    // Retiré AVANT usage : une destination consommée ne doit pas resservir à
    // la connexion suivante, qui viserait peut-être tout autre chose.
    window.localStorage.removeItem(CLE_REDIRECTION);
    const { path, at } = JSON.parse(brut);
    if (!path || !at || Date.now() - at > DUREE_REDIRECTION_MS) return "";
    return sanitizeRedirectTarget(path, "");
  } catch {
    return "";
  }
}

export function sanitizeRedirectTarget(raw, fallback = "/") {
  const candidate = typeof raw === "string" ? raw.trim() : "";
  if (!candidate) return fallback;

  if (
    candidate.startsWith("//") ||
    candidate.startsWith("http://") ||
    candidate.startsWith("https://") ||
    candidate.startsWith("data:")
  ) {
    return fallback;
  }

  if (candidate.startsWith("/")) {
    const safePath = candidate.split(/[?#]/)[0];
    if (!safePath || safePath === "/") return candidate.startsWith("/") ? candidate : fallback;
    return candidate;
  }

  try {
    const parsed = new URL(candidate, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    if (!parsed.pathname.startsWith("/")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/* Destination apres une connexion reussie.
 *
 * MIREILLE, 29/09/2026 : « un affilie qui se connecte doit etre redirige
 * directement vers son tableau de bord ».
 *
 * La regle etait ecrite dans AuthCallback SEULEMENT. Le retour par lien
 * magique menait donc au tableau de bord, et la connexion par mot de passe
 * jamais : deux chemins pour une seule intention, un seul des deux corrige.
 * Elle vit maintenant ici, et les deux pages l'appellent.
 *
 * Une destination PRECISE garde la priorite : qui demandait /checkout ou une
 * page protegee y retourne. Le tableau de bord ne remplace que le repli
 * generique — sans quoi un affilie ne pourrait plus jamais atteindre son
 * compte client par une connexion.
 */
export function ciblePostConnexion(cible, estAffilie) {
  const demande = sanitizeRedirectTarget(cible, REPLI_CONNEXION);
  if (!estAffilie) return demande;
  return demande === REPLI_CONNEXION ? "/affiliate" : demande;
}

/* Ou mene l'icone de compte quand personne n'est connecte.
 *
 * MIREILLE : « quand je me deconnecte d'OPS et que je clique sur l'icone du
 * compte client, il ne se passe rien ».
 *
 * L'icone portait `/login?next=<page courante>`. Sortir d'OPS laisse sur la
 * page de connexion — la route admin est protegee, elle s'evacue d'elle-meme
 * des que la session tombe. Le lien pointait donc vers la page ou l'on se
 * trouvait DEJA : React Router ne changeait qu'une chaine de requete, rien ne
 * bougeait a l'ecran, et aucune erreur ne venait l'expliquer.
 *
 * Deux regles :
 *  : une page d'authentification ne se memorise pas comme destination. On n'y
 *    revient pas apres s'etre connecte ;
 *  : le chemin d'OPS non plus. C'est l'icone du compte CLIENT : elle ne doit
 *    jamais ramener a l'administration, meme a qui vient d'en sortir.
 */
export function hrefConnexion(cheminCourant, cheminAdmin) {
  const courant = typeof cheminCourant === "string" ? cheminCourant : "";
  const inutile =
    !courant ||
    courant === "/" ||
    ["/login", "/register", "/auth/callback", "/forgot-password",
     "/reset-password"].some((p) => courant.startsWith(p)) ||
    (cheminAdmin && courant.startsWith(cheminAdmin));
  const cible = inutile ? REPLI_CONNEXION : courant;
  return `/login?next=${encodeURIComponent(cible)}`;
}
