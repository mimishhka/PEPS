export function sanitizeRedirectTarget(raw, fallback = "/") {
  const candidate = typeof raw === "string" ? raw.trim() : "";
  if (!candidate) return fallback;

  if (
    candidate.startsWith("//") ||
    candidate.startsWith("http://") ||
    candidate.startsWith("https://") ||
    candidate.startsWith("javascript:") ||
    candidate.startsWith("data:")
  ) {
    return fallback;
  }

  if (candidate.startsWith("/")) {
    const safePath = candidate.split(/[?#]/)[0];
    if (!safePath || safePath === "/") return candidate.startsWith("/") ? candidate : fallback;
    return candidate;
  }

  try {
    const parsed = new URL(candidate, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    if (!parsed.pathname.startsWith("/")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
