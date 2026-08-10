export function sanitizeRedirectTarget(raw, fallback = "/") {
  const candidate = typeof raw === "string" ? raw.trim() : "";
  if (!candidate) return fallback;
  if (
    candidate.startsWith("//") ||
    candidate.startsWith("http://") ||
    candidate.startsWith("https://") ||
    candidate.startsWith("javascript:")
  ) {
    return fallback;
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
