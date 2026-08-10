import axios from "axios";

const ENV_BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const isBrowser = typeof window !== "undefined";
const isLocalHost = isBrowser && ["localhost", "127.0.0.1"].includes(window.location.hostname);
const LOCAL_BACKEND_URL = isBrowser
  ? `http://${window.location.hostname}:8001`
  : "http://127.0.0.1:8001";
const BACKEND_URL = isLocalHost
  ? LOCAL_BACKEND_URL
  : (ENV_BACKEND_URL || (isBrowser ? window.location.origin : "http://127.0.0.1:8001"));

export const API_BASE = `${BACKEND_URL}/api`;
export const ASSET_BASE = API_BASE.replace(/\/api$/, "");

const api = axios.create({
  baseURL: API_BASE,
  // Auth = cookie httpOnly `access_token` uniquement. Aucun token ne transite
  // par un stockage accessible au JS, donc une XSS ne peut pas voler la session.
  withCredentials: true,
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
