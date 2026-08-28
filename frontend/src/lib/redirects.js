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
 * Durée de vie alignée sur celle du lien magique — quinze minutes. Au-delà, la
 * destination est périmée : mieux vaut le repli que d'expédier quelqu'un vers
 * une page demandée la veille.
 */
const CLE_REDIRECTION = "fn_post_login_redirect";
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
