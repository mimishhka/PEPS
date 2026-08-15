import useSWR from "swr";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

/**
 * useAffiliate — retourne l'objet affilié courant si l'utilisateur connecté
 * est un affilié actif, sinon null. Silencieux sur les 403 (utilisateurs non
 * affiliés) pour éviter la pollution du log.
 */
export default function useAffiliate(lang) {
  const { user } = useAuth();
  const userKey = user?.id || user?.email;
  const { data, error, isLoading, mutate } = useSWR(
    userKey ? ["/affiliate/me", userKey, lang || ""] : null,
    ([url]) => api.get(url, { params: lang ? { lang } : undefined }).then((response) => response.data),
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );

  return {
    affiliate: data || null,
    loading: Boolean(userKey) && isLoading,
    error,
    mutate,
  };
}
