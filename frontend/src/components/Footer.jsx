import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { FnMark, Wordmark, NovaSpark } from "./brand";

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

  const ADMIN_PATH = "/ops-portal-fn7k2q";

  const adminBypass = async () => {
    if (user?.role === "admin") {
      navigate(ADMIN_PATH);
      return;
    }
    navigate(`/login?next=${encodeURIComponent(ADMIN_PATH)}`);
  };

  const confirmText =
    lang === "fr"
      ? "En accédant à ce site, vous confirmez être un chercheur qualifié et assumez l'entière responsabilité de la manipulation, du stockage et de l'élimination de ces composés, conformément à toutes les réglementations provinciales et fédérales applicables."
      : "By accessing this website you confirm you are a qualified researcher and assume full responsibility for the proper handling, storage, and disposal of these compounds in accordance with all applicable provincial and federal regulations.";

  const badges =
    lang === "fr"
      ? ["Usage recherche uniquement", "Âge vérifié 19+", "Loi 25 / PIPEDA"]
      : ["For Research Use Only", "19+ Age Verified", "Loi 25 / PIPEDA"];

  return (
    <footer className="mt-28" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="rounded-2xl bg-nordfjord text-clinical px-8 lg:px-14 py-14 relative overflow-hidden shadow-[0_40px_80px_-40px_rgba(11,46,79,.6)]">
          <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full opacity-[.12]" aria-hidden="true">
            <g stroke="#00B8D4" strokeWidth="1" fill="none">
              <line x1="30" y1="50" x2="140" y2="110" /><line x1="140" y1="110" x2="250" y2="60" /><line x1="250" y1="60" x2="370" y2="130" />
            </g>
            <g fill="#00B8D4">
              <circle cx="30" cy="50" r="4" /><circle cx="140" cy="110" r="5" /><circle cx="250" cy="60" r="4" /><circle cx="370" cy="130" r="4" />
            </g>
          </svg>
          <p className="relative font-display text-2xl sm:text-3xl font-bold tracking-[-0.01em] leading-[1.2] max-w-4xl" data-testid="footer-disclaimer">
            {t("footer.compliance")}
          </p>
          <p className="relative mt-6 font-data text-[11px] uppercase tracking-[0.18em] text-[#8FB3C9] max-w-3xl leading-relaxed">
            {confirmText}
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3">
            {badges.map((b) => (
              <span key={b} className="cbadge !border-nova/50 !text-nova"><NovaSpark size={11} /> {b}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 grid grid-cols-2 md:grid-cols-4 gap-10">
        <div className="col-span-2">
          <div className="flex items-center gap-3">
            <FnMark size={30} frame="#0B2E4F" spark="#00B8D4" />
            <Wordmark size={20} color="#0B2E4F" />
          </div>
          <p className="mt-4 text-sm text-glacier max-w-sm leading-relaxed">{t("footer.tagline")}</p>
          <p className="mt-6 fn-ruo inline-block">FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT</p>
        </div>
        {columns.map((col) => (
          <div key={col.key} data-testid={`footer-col-${col.key}`}>
            <div className="font-data text-[11px] uppercase tracking-[0.24em] mb-5 text-nova">{col.title}</div>
            <ul className="space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.to + l.label}>
                  {l.newTab ? (
                    <a href={l.to} target="_blank" rel="noopener noreferrer" className="text-glacier hover:text-nordfjord transition-colors">{l.label}</a>
                  ) : (
                    <Link to={l.to} className="text-glacier hover:text-nordfjord transition-colors">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bg-ink text-[#8FA3B8]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-data text-[11px] uppercase tracking-[0.18em]">
            © {new Date().getFullYear()} FIRONOVA · {t("footer.rights")}
          </p>
          <button
              onClick={adminBypass}
              aria-label="•"
              title=""
              data-testid="hidden-admin-trigger"
              className="inline-block w-2 h-2 rounded-full bg-nova/10 hover:bg-nova transition-colors"
            />
        </div>
      </div>
    </footer>
  );
}
