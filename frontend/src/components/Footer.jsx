import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import { FnMark, Wordmark } from "./brand";

const FALLBACK_COLS = [
  { key: "shop", titleKey: "footer.shop", links: [{ to: "/catalog", labelKey: "nav.catalog" }, { to: "/lab", labelKey: "nav.lab" }] },
  { key: "legal", titleKey: "footer.legal", links: [{ to: "/compliance", labelKey: "footer.terms" }, { to: "/privacy", labelKey: "footer.privacy" }, { to: "/compliance#shipping", labelKey: "footer.shipping" }, { to: "/faq", labelKey: "footer.faq" }] },
];

export default function Footer() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { coaPageEnabled } = useSiteConfig();
  const [cols, setCols] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api.get("/menus", { params: { location: "footer" } })
      .then((r) => {
        if (cancelled) return;
        const menus = Array.isArray(r.data) ? r.data : [];
        setCols(menus.map((m) => ({
          key: m.slug,
          title: lang === "fr" ? m.name_fr : m.name_en,
          // Preserve exclusion of physiological categories and the private affiliate program.
          links: (m.items || []).filter((it) => !String(it.url || "").includes("cat=")).map((it) => ({
            to: it.url, label: lang === "fr" ? it.label_fr : it.label_en, newTab: it.open_new_tab,
          })),
        })).filter((c) => c.links.length));
      })
      .catch(() => { if (!cancelled) setCols([]); });
    return () => { cancelled = true; };
  }, [lang]);

  const baseColumns = cols?.length ? cols : FALLBACK_COLS.map((c) => ({
    key: c.key, title: t(c.titleKey), links: c.links.map((l) => ({ to: l.to, label: t(l.labelKey), newTab: false })),
  }));
  const columns = baseColumns.filter((c) => c.key !== "program")
    .map((c) => ({ ...c, links: c.links.filter((l) => l.to !== "/lab" || coaPageEnabled) }))
    .filter((c) => c.links.length);
  const ADMIN_PATH = "/ops-portal-fn7k2q";
  const adminBypass = () => navigate(user?.role === "admin" ? ADMIN_PATH : "/login?next=" + encodeURIComponent(ADMIN_PATH));
  const confirmText = lang === "fr"
    ? "En accédant à ce site, vous confirmez être un chercheur qualifié et assumez l'entière responsabilité de la manipulation, du stockage et de l'élimination de ces composés, conformément à toutes les réglementations provinciales et fédérales applicables."
    : "By accessing this website you confirm you are a qualified researcher and assume full responsibility for the proper handling, storage, and disposal of these compounds in accordance with all applicable provincial and federal regulations.";

  return <footer className="fn-footer" data-testid="footer">
    <div className="fn-footer-links fn-container">
      <div className="fn-footer-brand">
        <Link to="/" className="fn-logo" aria-label="FIRONOVA" data-testid="footer-logo"><FnMark size={32} frame="currentColor" spark="#00B8D4" /><Wordmark size={20} color="currentColor" /></Link>
        <p>{t("footer.tagline")}</p>
        <span className="fn-footer-location">{lang === "fr" ? "CANADA · FRANÇAIS / ENGLISH" : "CANADA · ENGLISH / FRANÇAIS"}</span>
      </div>
      {columns.map((col) => <div className="fn-footer-column" key={col.key} data-testid={"footer-col-" + col.key}>
        <h2>{col.title}</h2><ul>{col.links.map((l) => <li key={l.to + l.label}>{l.newTab || /^https?:/.test(l.to)
          ? <a href={l.to} target={l.newTab ? "_blank" : undefined} rel={l.newTab ? "noopener noreferrer" : undefined}>{l.label}</a>
          : <Link to={l.to}>{l.label}</Link>}</li>)}</ul>
      </div>)}
    </div>
    <div className="fn-footer-research fn-container">
      <div className="fn-footer-research-title"><span>RUO / 19+</span><p data-testid="footer-disclaimer">{t("footer.compliance")}</p></div>
      <p>{confirmText}</p>
    </div>
    <div className="fn-footer-bottom fn-container"><p>© {new Date().getFullYear()} FIRONOVA. {t("footer.rights")}</p><span>Loi 25 / PIPEDA</span><button onClick={adminBypass} aria-label={lang === "fr" ? "Portail des opérations" : "Operations portal"} data-testid="hidden-admin-trigger" className="fn-footer-ops">OPS ↗</button></div>
  </footer>;
}
