// frontend/src/hooks/useAffiliateRef.js
// Capture le parametre ?ref=CODE au premier chargement, pose le cookie
// d'attribution cote backend (httpOnly) ET conserve le code pour le paiement,
// LE TEMPS DE LA VISITE seulement. Idempotent par session.
//
// Appele depuis GatedApp, avant toute route et sans condition : la capture
// vaut donc pour N'IMPORTE QUEL chemin. Un lien produit
// (/product/xxx?ref=CODE), le code QR ou le lien d'accueil suivent le meme
// chemin : il n'y a pas de traitement particulier a la page d'accueil, et il
// ne doit pas y en avoir.
//
// Le rangement du code lui-meme vit dans lib/codeParrainage : ce module-la ne
// depend ni du routeur ni du reseau, ce qui permet a AuthContext de l'oublier
// a la deconnexion sans se lier au routage.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import api from "../lib/api";
import { memoriserCode } from "../lib/codeParrainage";

const SESSION_KEY = "fn_ref_captured";

// Types d'appareil pour l'analyse des sources (stocké côté backend).
const detectDevice = () => {
  try {
    const ua = navigator.userAgent || "";
    if (/ipad|tablet/i.test(ua)) return "tablet";
    if (/mobi/i.test(ua)) return "mobile";
  } catch {
    /* noop */
  }
  return "desktop";
};

export default function useAffiliateRef() {
  const location = useLocation();
  const done = useRef(false);

  useEffect(() => {
    // Nettoyage de la version precedente, deployee brievement, qui gardait le
    // code 365 jours dans localStorage. Sans cette ligne, l'entree resterait
    // indefiniment dans le navigateur des clients concernes : inerte, mais
    // c'est une donnee qu'on n'a plus aucune raison de detenir.
    try { window.localStorage.removeItem("fn_ref_code"); } catch { /* noop */ }

    if (done.current) return;
    const code = new URLSearchParams(location.search).get("ref");
    if (!code) return;
    // AVANT le dedoublonnage ci-dessous : celui-ci empeche le second appel
    // RESEAU, pas la conservation du code. Sans cet ordre, revenir sur le lien
    // apres avoir vide le stockage laisserait le champ de code vide.
    memoriserCode(code);
    // evite les appels repetes dans la meme session
    try {
      if (sessionStorage.getItem(SESSION_KEY) === code) {
        done.current = true;
        return;
      }
    } catch {
      /* sessionStorage indisponible : on continue */
    }
    done.current = true;
    api
      .get(`/affiliate/ref/${encodeURIComponent(code)}`, {
        params: {
          page: location.pathname || "/",
          referrer: (() => { try { return document.referrer || ""; } catch { return ""; } })(),
          device: detectDevice(),
        },
      })
      .then(() => {
        try {
          sessionStorage.setItem(SESSION_KEY, code);
        } catch {
          /* noop */
        }
      })
      .catch(() => {
        /* silencieux : l'attribution ne doit jamais bloquer l'UX */
      });
  }, [location.pathname, location.search]);
}
