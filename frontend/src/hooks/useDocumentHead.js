import { useEffect } from "react";

const SITE = "Fironova";
const ORIGIN = "https://fironova.ca";

function setMetaByName(name, content) {
  if (content == null) return () => {};
  let el = document.head.querySelector(`meta[name="${name}"]`);
  const created = !el;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute("content");
  el.setAttribute("content", content);
  return () => {
    if (created) el.remove();
    else if (prev != null) el.setAttribute("content", prev);
  };
}

function setCanonical(path) {
  let el = document.head.querySelector('link[rel="canonical"]');
  const created = !el;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  const prev = el.getAttribute("href");
  el.setAttribute("href", ORIGIN + (path || "/"));
  return () => {
    if (created) el.remove();
    else if (prev != null) el.setAttribute("href", prev);
  };
}

/**
 * Sets per-route document head. Call once near the top of a page component.
 * @param {object} opts
 * @param {string} opts.title    Page title (SITE name is appended automatically).
 * @param {string} [opts.description]
 * @param {string} [opts.path]   Canonical path, e.g. "/catalog". Defaults to current location.
 * @param {boolean} [opts.noindex] When true, emits <meta name="robots" content="noindex, nofollow">.
 */
export default function useDocumentHead({ title, description, path, noindex } = {}) {
  useEffect(() => {
    const cleanups = [];
    const fullTitle = title ? `${title} — ${SITE}` : SITE;
    const prevTitle = document.title;
    document.title = fullTitle;
    cleanups.push(() => {
      document.title = prevTitle;
    });

    if (description) cleanups.push(setMetaByName("description", description));
    cleanups.push(
      setCanonical(path || window.location.pathname)
    );
    cleanups.push(
      setMetaByName("robots", noindex ? "noindex, nofollow" : "index, follow")
    );

    return () => cleanups.forEach((fn) => fn && fn());
  }, [title, description, path, noindex]);
}
