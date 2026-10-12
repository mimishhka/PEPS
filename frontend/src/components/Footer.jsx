import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import { FnMark, Wordmark } from "./brand";

const FALLBACK_COLS = [
  // Les raccourcis par catégorie ont été retirés : leurs libellés décrivaient
  // un effet physiologique. Le catalogue complet reste accessible.
  { key: "shop", titleKey: "footer.shop", links: [
    { to: "/catalog", labelKey: "nav.catalog" },
    { to: "/about", labelKey: "nav.about" },
    { to: "/lab", labelKey: "nav.lab" },
    // « Lire un COA » vit a cote du laboratoire et non dans la colonne
    // juridique : c'est de la documentation produit, pas une condition.
    { to: "/certificats", labelKey: "footer.certificats" },
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
  const { coaPageEnabled } = useSiteConfig();
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
          // Les menus vivent en base et y ont été semés avec des raccourcis
          // par catégorie (« Guérison et récupération »…). Le semis est
          // idempotent, donc corriger la graine ne corrige PAS les bases
          // existantes : on filtre ici, ce qui vaut quel que soit leur état.
          links: (m.items || [])
            .filter((it) => !String(it.url || "").includes("cat="))
            .map((it) => ({
              to: it.url,
              label: lang === "fr" ? it.label_fr : it.label_en,
              newTab: it.open_new_tab,
            })),
        })).filter((c) => c.links.length) : []);
      })
      .catch(() => { if (!cancelled) setCols([]); });
    return () => { cancelled = true; };
  }, [lang]);

  const baseColumns = (cols && cols.length)
    ? cols
    : FALLBACK_COLS.map((c) => ({
        key: c.key,
        title: t(c.titleKey),
        links: c.links.map((l) => ({ to: l.to, label: t(l.labelKey), newTab: false })),
      }));

  // Le programme d'affiliation est PRIVÉ (sur invitation uniquement) : il ne
  // doit plus apparaître dans le pied de page public. On retire la colonne
  // « program » quelle que soit sa source (fallback ou menu semé en base), et
  // on ne l'ajoute plus d'office comme c'était le cas auparavant.
  //
  // ET /lab TOMBE AVEC SON DRAPEAU. L'en-tête filtrait déjà cette entrée sur
  // `coaPageEnabled` ; le pied de page, lui, l'affichait toujours — la règle
  // existait, à un seul des deux endroits qui en avaient besoin. Quand le
  // drapeau est à `false`, la route renvoie à l'accueil : le lien était visible
  // et ne menait nulle part.
  const columns = baseColumns
    .filter((c) => c.key !== "program")
    .map((c) => ({
      ...c,
      links: c.links.filter((l) => (l.to === "/lab" ? coaPageEnabled : true)),
    }))
    .filter((c) => c.links.length);
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

  return (
    <footer className="mt-28" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="border-t border-ash px-8 lg:px-14 py-14 relative overflow-hidden">
          <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full opacity-[.12]" aria-hidden="true">
            <g stroke="#00B8D4" strokeWidth="1" fill="none">
              <line x1="30" y1="50" x2="140" y2="110" /><line x1="140" y1="110" x2="250" y2="60" /><line x1="250" y1="60" x2="370" y2="130" />
            </g>
            <g fill="#00B8D4">
              <circle cx="30" cy="50" r="4" /><circle cx="140" cy="110" r="5" /><circle cx="250" cy="60" r="4" /><circle cx="370" cy="130" r="4" />
            </g>
          </svg>
          {/* MEME RAISON QUE L'INFOLETTRE : ces deux paragraphes occupaient
              896 px et 768 px dans une bande de 1216, empiles l'un sous
              l'autre et cales a gauche. Mis cote a cote, ils remplissent la
              bande et la declaration garde sa justesse de lecture.
              `items-end` et non `items-start` : les deux blocs n'ont pas la
              meme hauteur, et c'est la DERNIERE ligne de chacun qui doit
              s'aligner pour que le pave paraisse pose, pas tombe. */}
          <div className="relative grid lg:grid-cols-[1.3fr_1fr] gap-8 lg:gap-14 lg:items-end" data-testid="footer-conformite">
            <p className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.01em] leading-[1.2]" data-testid="footer-disclaimer">
              {t("footer.compliance")}
            </p>
            <p className="font-data text-[11px] uppercase tracking-[0.18em] text-glacier leading-relaxed">
              {confirmText}
            </p>
          </div>
          {/* LES TROIS PASTILLES SONT PARTIES, a sa demande du 11/10/2026.
              « Usage recherche uniquement », « Age verifie 19+ » et « Loi 25 /
              PIPEDA » redisaient en petit ce que le titre au-dessus dit en
              gros et ce que la porte d'entree exige deja. Le bandeau de
              l'en-tete le dit une quatrieme fois sur chaque page.
              Une mention repetee quatre fois ne rassure plus : elle devient
              du motif. */}
        </div>
      </div>

      {/* POURQUOI TOUT ETAIT COLLE A GAUCHE.
          MIREILLE, 11/10/2026 : « pourquoi le contenu montre sur la photo est
          du cote gauche du site ».
          La grille declarait QUATRE colonnes quoi qu'il arrive : le bloc de
          marque en occupait deux, et les colonnes de liens le reste. Mais
          `columns` vient de `/menus` et n'en rend pas forcement deux — avec
          une seule, le quart droit de la page restait vide, et toute la page
          paraissait poussee vers la gauche.
          Le nombre de colonnes suit donc desormais ce qu'il y a a mettre
          dedans. */}
      <div className={`max-w-7xl mx-auto px-6 lg:px-8 py-16 grid grid-cols-2 gap-10 ${
        columns.length >= 2 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <div className="col-span-2">
          <div className="flex items-center gap-3">
            <FnMark size={30} frame="#0B2E4F" spark="#00B8D4" />
            <Wordmark size={20} color="#0B2E4F" descripteur="RESEARCH" />
          </div>
          <p className="mt-4 text-sm text-glacier max-w-sm leading-relaxed">{t("footer.tagline")}</p>
          <p className="mt-6 fn-ruo inline-block">FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT</p>
        </div>
        {columns.map((col) => (
          <div key={col.key} data-testid={`footer-col-${col.key}`}>
            <div className="font-data text-[11px] uppercase tracking-[0.24em] mb-5 text-nova-texte">{col.title}</div>
            <ul className="text-sm">
              {col.links.map((l) => (
                <li key={l.to + l.label}>
                  {l.newTab ? (
                    <a href={l.to} target="_blank" rel="noopener noreferrer" className="block py-3 text-glacier hover:text-nordfjord transition-colors">{l.label}</a>
                  ) : (
                    <Link to={l.to} className="block py-3 text-glacier hover:text-nordfjord transition-colors">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bg-ink text-fog">
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
