// frontend/src/hooks/useAffiliateRef.js
// Capture le parametre ?ref=CODE au premier chargement et pose le cookie
// d'attribution cote backend (httpOnly). Idempotent par session.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import api from "../lib/api";

const SESSION_KEY = "fn_ref_captured";

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
      .get(`/affiliate/ref/${encodeURIComponent(code)}`)
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
  }, [location.search]);
}
