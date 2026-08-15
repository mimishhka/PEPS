import axios from "axios";

function normalizeBackendBase(value) {
  if (!value) return "";
  const candidate = String(value).trim();
  if (!candidate) return "";
  return candidate.replace(/\/+$/, "");
}

export function buildApiBaseUrl(
  configuredBackend = process.env.REACT_APP_BACKEND_URL,
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
  withCredentials: true,
});

let refreshRequest = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const isAuthRoute = String(request?.url || "").includes("/auth/");
    if (error.response?.status !== 401 || !request || request._refreshAttempted || isAuthRoute) {
      return Promise.reject(error);
    }

    request._refreshAttempted = true;
    if (!refreshRequest) {
      refreshRequest = axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
        .finally(() => { refreshRequest = null; });
    }
    await refreshRequest;
    return api(request);
  },
);

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
