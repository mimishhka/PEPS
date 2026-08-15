// frontend/src/hooks/useAffiliateRef.js
// Capture le parametre ?ref=CODE au premier chargement et pose le cookie
// d'attribution cote backend (httpOnly). Idempotent par session.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import api from "../lib/api";

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
    if (done.current) return;
    const code = new URLSearchParams(location.search).get("ref");
    if (!code) return;
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
