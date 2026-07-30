import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
  if (value.startsWith("/")) return `${ASSET_BASE}${value}`;
  if (!value.startsWith("http")) return `${ASSET_BASE}/${value.replace(/^\/+/, "")}`;
  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith("/uploads/")) {
      return `${ASSET_BASE}${parsed.pathname}`;
    }
    if (parsed.pathname.startsWith("/api/uploads/")) {
      return `${ASSET_BASE}${parsed.pathname.replace(/^\/api/, "")}`;
    }
    return value;
  } catch {
    return value;
  }
}

export default api;
