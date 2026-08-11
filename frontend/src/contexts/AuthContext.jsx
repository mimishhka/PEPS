import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import api, { formatApiError } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const emitSessionRestored = useCallback((email) => {
    try {
      window.dispatchEvent(new CustomEvent("fironova:session-restored", {
        detail: { email: (email || "").toLowerCase().trim() || null },
      }));
    } catch {
      // Ignore event dispatch failures.
    }
  }, []);

  const purgeClientSession = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("fironova:before-session-clear", {
        detail: { email: (user?.email || "").toLowerCase().trim() || null },
      }));
      window.localStorage.removeItem("fironova_token");
      window.localStorage.removeItem("fironova_cart_v1");
      // Re-lock admin gate on explicit or implicit disconnect.
      window.sessionStorage.removeItem("fironova_admin_gate_ok");
      window.dispatchEvent(new Event("fironova:session-cleared"));
    } catch {
      // Ignore storage errors in restricted browser contexts.
    }
  }, [user?.email]);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      if (data?.email) {
        setUser(data);
        emitSessionRestored(data.email);
      } else if (!user) {
        // Guest session at startup: keep explicit null.
        setUser(null);
      }
      // If data is unexpectedly empty while a user is already in memory,
      // keep current session state to avoid involuntary sign-out.
    } catch {
      // Never auto-logout on transient API/CORS/network issues.
      // Keep current in-memory session unless we're already a guest.
      if (!user) setUser(null);
    } finally {
      setChecking(false);
    }
  }, [emitSessionRestored, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      // Store token as a fallback for browsers that block the HttpOnly cookie
      // (Emergent preview iframe, strict third-party-cookie policies). Cookie
      // remains the primary mechanism; this token is a safety net picked up
      // by the axios request interceptor in lib/api.js.
      if (data.access_token) {
        try { window.localStorage.setItem("fironova_token", data.access_token); } catch { /* storage disabled */ }
      }
      setUser({ id: data.id, email: data.email, name: data.name, role: data.role, created_at: data.created_at });
      emitSessionRestored(data.email);
      return { ok: true };
    } catch (e) {
      // Message d'erreur explicite qui distingue:
      //  - une vraie réponse HTTP (mauvais mdp, 429…): affiche le detail serveur
      //  - une absence de réponse (CORS/réseau/cache navigateur): l'utilisateur
      //    doit vider le cache ou vérifier sa connexion, message clair.
      if (e.response?.data?.detail) {
        return { ok: false, error: formatApiError(e.response.data.detail) };
      }
      if (e.response) {
        return { ok: false, error: `Erreur serveur (HTTP ${e.response.status}). Réessayez.` };
      }
      return {
        ok: false,
        error: "Impossible de contacter le serveur. Rafraîchissez la page (Ctrl+Shift+R / Cmd+Shift+R) puis réessayez. Si le problème persiste, désactivez temporairement les bloqueurs de pub.",
      };
    }
  }, [emitSessionRestored]);

  const register = useCallback(async (name, email, password) => {
    try {
      const { data } = await api.post("/auth/register", { name, email, password, website: "" });
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  }, []);

  // Magic link — envoie l'email (create=true pour l'inscription passwordless).
  const requestMagic = useCallback(async ({ email, name, create, lang }) => {
    try {
      await api.post("/auth/magic/request", { email, name, create: !!create, lang: lang || "fr", website: "" });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  }, []);

  // Magic link — échange le token du lien contre une session (cookie posé côté backend).
  const verifyMagic = useCallback(async (token) => {
    try {
      const { data } = await api.post("/auth/magic/verify", { token });
      if (data.access_token) {
        try { window.localStorage.setItem("fironova_token", data.access_token); } catch { /* storage disabled */ }
      }
      setUser({ id: data.id, email: data.email, name: data.name, role: data.role, created_at: data.created_at });
      emitSessionRestored(data.email);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  }, [emitSessionRestored]);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    purgeClientSession();
    setUser(null);
  }, [purgeClientSession]);

  const value = useMemo(
    () => ({ user, checking, login, register, requestMagic, verifyMagic, logout, refresh }),
    [user, checking, login, register, requestMagic, verifyMagic, logout, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
