import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

/**
 * useAffiliate — retourne l'objet affilié courant si l'utilisateur connecté
 * est un affilié actif, sinon null. Silencieux sur les 403 (utilisateurs non
 * affiliés) pour éviter la pollution du log.
 */
export default function useAffiliate() {
  const { user } = useAuth();
  const [affiliate, setAffiliate] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) { setAffiliate(null); return; }
    let cancelled = false;
    setLoading(true);
    api.get("/affiliate/me")
      .then((r) => { if (!cancelled) setAffiliate(r.data || null); })
      .catch(() => { if (!cancelled) setAffiliate(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  return { affiliate, loading };
}
