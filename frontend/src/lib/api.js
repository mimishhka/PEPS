import axios from "axios";

function normalizeBackendBase(value) {
  if (!value) return "";
  const candidate = String(value).trim();
  if (!candidate) return "";
  return candidate.replace(/\/+$/, "");
}

export function buildApiBaseUrl(
  configuredBackend = import.meta.env.REACT_APP_BACKEND_URL || import.meta.env.VITE_BACKEND_URL,
  location = typeof window === "undefined" ? null : window.location,
) {
  const envValue = normalizeBackendBase(configuredBackend);

  if (!location) {
    const base = envValue || "http://127.0.0.1:8001";
    return base.endsWith("/api") ? base : `${base}/api`;
  }

  const isLocalHost = ["localhost", "127.0.0.1"].includes(location.hostname);
  const base = envValue || (isLocalHost ? `http://${location.hostname}:8001` : location.origin);

  return base.endsWith("/api") ? base : `${base}/api`;
}

export const API_BASE = buildApiBaseUrl();
export const ASSET_BASE = API_BASE.replace(/\/api$/, "");

const api = axios.create({
  baseURL: API_BASE,
  // Auth = JWT Bearer via `Authorization` header (injecté par l'interceptor
  // ci-dessous depuis localStorage.fironova_token). `withCredentials` est
  // volontairement FAUX : ceci évite le blocage CORS des navigateurs stricts
  // (Safari, Firefox strict tracking, Chrome + extensions) qui rejettent
  // toute réponse combinant `credentials: true` avec `Access-Control-Allow-Origin: *`.
  // Le cookie httpOnly reste posé côté backend en fallback mais n'est plus lu ici.
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const headers = config.headers ?? {};
  const token = typeof window !== "undefined" ? window.localStorage.getItem("fironova_token") : null;

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  config.headers = headers;
  return config;
});

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function resolveAssetUrl(value) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  // Sur Emergent, seules les URL /api/... atteignent le backend. On garde donc
  // TOUJOURS le préfixe /api sur les chemins uploads.
  if (value.startsWith("/api/uploads/")) return `${ASSET_BASE}${value}`;
  if (value.startsWith("/uploads/")) return `${ASSET_BASE}/api${value}`;
  if (value.startsWith("/")) return `${ASSET_BASE}${value}`;
  return `${ASSET_BASE}/${value.replace(/^\/+/, "")}`;
}

export default api;
