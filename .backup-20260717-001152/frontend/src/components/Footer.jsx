import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";

// Colonnes de repli — reproduisent exactement les liens historiques. Utilisées
// si /menus échoue ou ne renvoie aucun menu footer publié.
const FALLBACK_COLS = [
  { key: "shop", titleKey: "footer.shop", links: [
    { to: "/catalog", labelKey: "nav.catalog" },
    { to: "/catalog?cat=healing", labelKey: "categories.healing" },
    { to: "/catalog?cat=weight-loss", labelKey: "categories.weight-loss" },
    { to: "/catalog?cat=cognitive", labelKey: "categories.cognitive" },
  ]},
  { key: "legal", titleKey: "footer.legal", links: [
    { to: "/compliance", labelKey: "footer.terms" },
    { to: "/privacy", labelKey: "footer.privacy" },
    { to: "/compliance#shipping", labelKey: "footer.shipping" },
    { to: "/faq", labelKey: "footer.faq" },
  ]},
];

export default function Footer() {
  const { t, lang } = useLang();
  const [cols, setCols] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/menus", { params: { location: "footer" } })
      .then((r) => {
        if (cancelled) return;
        const menus = Array.isArray(r.data) ? r.data : [];
        setCols(menus.length ? menus.map((m) => ({
          key: m.slug,
          title: lang === "fr" ? m.name_fr : m.name_en,
          links: (m.items || []).map((it) => ({
            to: it.url,
            label: lang === "fr" ? it.label_fr : it.label_en,
            newTab: it.open_new_tab,
          })),
        })) : []);
      })
      .catch(() => { if (!cancelled) setCols([]); });
    return () => { cancelled = true; };
  }, [lang]);

  const columns = (cols && cols.length)
    ? cols
    : FALLBACK_COLS.map((c) => ({
        key: c.key,
        title: t(c.titleKey),
        links: c.links.map((l) => ({ to: l.to, label: t(l.labelKey), newTab: false })),
      }));
  const { user } = useAuth();
  const navigate = useNavigate();

  // NOTE: keep in sync with ADMIN_PATH in App.js
  const ADMIN_PATH = "/ops-portal-fn7k2q";

  const adminBypass = async () => {
    // If already admin, just go.
    if (user?.role === "admin") {
      navigate(ADMIN_PATH);
      return;
    }
    // Hidden admin entry — requires normal authentication.
    navigate(`/login?next=${encodeURIComponent(ADMIN_PATH)}`);
  };

  return (
    <footer className="mt-32" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="rounded-lg bg-garnet text-paper px-8 lg:px-14 py-14 shadow-luxe">
          <p className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.01em] leading-[1.15]" data-testid="footer-disclaimer">
            FOR LABORATORY RESEARCH USE ONLY · NOT FOR HUMAN OR VETERINARY CONSUMPTION · 19+ ONLY
          </p>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-paper/60 max-w-3xl">
            By accessing this website you confirm you are a qualified researcher and assume full responsibility for the proper handling, storage, and disposal of these compounds in accordance with all applicable provincial and federal regulations.
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2">
          <div className="font-display font-bold text-xl text-ink">FIRONOVA<span className="text-signal">.</span></div>
          <p className="mt-4 text-sm text-inkmuted max-w-sm">{t("footer.tagline")}</p>
          <p className="mt-6 fn-ruo inline-block">FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT</p>
        </div>
        {columns.map((col) => (
          <div key={col.key} data-testid={`footer-col-${col.key}`}>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] mb-4 text-copper">{col.title}</div>
            <ul className="space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.to + l.label}>
                  {l.newTab ? (
                    <a href={l.to} target="_blank" rel="noopener noreferrer" className="link-underline">{l.label}</a>
                  ) : (
                    <Link to={l.to} className="link-underline">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-faint">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-inkmuted">
            © {new Date().getFullYear()} FIRONOVA · {t("footer.rights")}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60 flex items-center gap-2">
            CAD · Canada ·
            <button
              onClick={adminBypass}
              aria-label="•"
              title=""
              data-testid="hidden-admin-trigger"
              className="inline-block w-2 h-2 rounded-full bg-inkmuted/40 hover:bg-signal transition-colors"
            />
            BIO-RX-CA-2026
          </p>
        </div>
      </div>
    </footer>
  );
}
