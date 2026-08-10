import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import api, { formatApiError } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

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
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  }, []);

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
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    localStorage.removeItem("fironova_token");
    setUser(null);
  }, []);

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
