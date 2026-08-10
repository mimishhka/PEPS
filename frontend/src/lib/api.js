import axios from "axios";

function normalizeBackendBase(value) {
  if (!value) return "";
  const candidate = String(value).trim();
  if (!candidate) return "";
  return candidate.replace(/\/+$/, "");
}

function resolveRuntimeOrigin() {
  if (typeof window === "undefined") return "http://127.0.0.1:8001";
  return window.location.origin;
}

export function buildApiBaseUrl() {
  const envValue = normalizeBackendBase(process.env.REACT_APP_BACKEND_URL);
  const isBrowser = typeof window !== "undefined";
  const isLocalHost = isBrowser && ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (isLocalHost) {
    const localOrigin = normalizeBackendBase(`http://${window.location.hostname}:8001`);
    return `${localOrigin}/api`;
  }

  const runtimeOrigin = resolveRuntimeOrigin();
  let base = envValue || runtimeOrigin;

  if (base === runtimeOrigin) {
    return `${base}/api`;
  }

  if (base.endsWith("/api")) {
    return base;
  }

  return `${base}/api`;
}

export const API_BASE = buildApiBaseUrl();
export const ASSET_BASE = API_BASE.replace(/\/api$/, "");

const api = axios.create({
  baseURL: API_BASE,
  // Auth = cookie httpOnly `access_token` uniquement. Aucun token ne transite
  // par un stockage accessible au JS, donc une XSS ne peut pas voler la session.
  withCredentials: true,
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
