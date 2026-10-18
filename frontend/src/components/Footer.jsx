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
    /* LE PIED DE PAGE PASSE AU SOMBRE, et c'est la que l'ancre va.
          MIREILLE, 15/10/2026, d'apres sa maquette.
          Mesure qui justifie le changement : du bas du hero au bas de la
          page, 1542 px tenaient sur un SEUL fond clair -- cinq zones, 71 % de
          la page, pour seul accent la barre de copyright de 88 px. Je
          defendais une bande sombre au MILIEU ; elle a refuse deux fois, et
          sa maquette montre mieux : l'ancre va a la BASE. La page garde son
          unique grand aplat au hero, la barre de lot reste claire, et le pied
          ferme la page au lieu de s'y diluer.
          (Commentaire JS et non `{…}` : on est dans l'expression du `return`,
          pas parmi des enfants JSX. Troisieme fois cette semaine.) */
    <footer className="mt-20 bg-nordfjord text-clinical" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="pt-14 pb-12 relative overflow-hidden">
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
          {/* LA MEME PHRASE ETAIT CRIEE EN BAS ET MURMUREE EN HAUT.
              Releve sur une seule page d'accueil : « FOR LABORATORY RESEARCH
              USE ONLY · NOT FOR HUMAN OR VETERINARY CONSUMPTION · 19+ ONLY »
              apparaissait a 10 px dans le bandeau d'en-tete, puis MOT POUR MOT
              a 24 px gras ici, puis une troisieme fois en pastille dans le
              bloc de marque, et une quatrieme dans le titre de l'onglet.
              C'est son propre constat du 11/10, applique a moitie : j'avais
              retire trois pastilles ce jour-la et laisse la plus grosse
              duplication, celle de la phrase entiere.
              Elle reste -- c'est une mention legale, elle a sa place au pied
              d'une page -- mais elle cesse de crier. Deux occurrences, toutes
              deux calmes, chacune son travail : le bandeau previent a
              l'arrivee, le pied rappelle au depart. */}
          {/* LA MENTION TIENT SUR UNE LIGNE, et c'est pour ca qu'elle occupe
              toute la largeur au lieu d'une colonne.
              MIREILLE, 18/10/2026 : « ca devrait tenir sur une seule ligne, ca
              en prend deux ». Elle avait raison et le calcul le dit : 85
              caracteres a 15 px en demi-gras demandent environ 690 px ; la
              colonne de 1,3 fr lui en donnait 688. Deux pixels de trop, et la
              phrase se brisait en plein milieu de « VETERINARY CONSUMPTION ».
              Une mention legale coupee en deux se lit deux fois moins bien
              qu'une mention legale d'un trait. */}
          <div className="relative" data-testid="footer-conformite">
            {/* `lg:whitespace-nowrap` et non `whitespace-nowrap` : sur un
                telephone la phrase ne tient dans aucune largeur, et la forcer
                sur une ligne la ferait defiler lateralement. Une mention
                legale qu'il faut faire glisser pour lire est pire qu'une
                mention legale sur deux lignes. */}
            <p className="font-display text-[15px] font-semibold tracking-[-0.005em] leading-relaxed text-clinical lg:whitespace-nowrap" data-testid="footer-disclaimer">
              {t("footer.compliance")}
            </p>
            <p className="etiquette text-mist leading-relaxed mt-5 max-w-[104ch]">
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
      <div className={`max-w-7xl mx-auto px-6 lg:px-8 pt-12 pb-12 grid grid-cols-2 gap-10 border-t border-white/10 ${
        columns.length >= 2 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <div className="col-span-2">
          <div className="flex items-center gap-3">
            <FnMark size={30} frame="var(--clinical)" spark="var(--nova)" />
            {/* `var(--nordfjord)` et non `#0B2E4F` : le jeton s'inverse avec
                le theme, la valeur ecrite en dur non. En mode sombre, le
                marine se posait sur un fond presque noir. */}
            <Wordmark size={20} color="var(--clinical)" descripteur="RESEARCH" />
          </div>
          <p className="mt-4 text-sm text-mist max-w-sm leading-relaxed">{t("footer.tagline")}</p>
          {/* LA TROISIEME OCCURRENCE EST PARTIE. Cette pastille disait
              « FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT » a trente
              centimetres de la bande de conformite qui le dit deja, et a deux
              ecrans du bandeau d'en-tete qui le dit aussi. */}
        </div>
        {columns.map((col) => (
          <div key={col.key} data-testid={`footer-col-${col.key}`}>
            <div className="etiquette mb-5 text-nova">{col.title}</div>
            {/* DEUX COLONNES DES QUATRE LIENS, a sa demande du 18/10/2026 :
                « les détails légaux devraient être sur deux colonnes pour
                gagner de la place ». Quatre liens empilés font 128 px de
                haut ; en deux colonnes, 64.
                `columns-2` et non une grille : une liste de liens n'a pas de
                rangées, elle a un flux. Le navigateur coupe ou il faut, et
                `break-inside-avoid` empeche qu'un lien se retrouve a cheval
                entre les deux colonnes.
                Sous trois liens, la coupe ne gagne rien et laisse une colonne
                bancale : on ne coupe qu'a partir de quatre. */}
            <ul className={`text-sm ${col.links.length >= 4 ? "sm:columns-2 sm:gap-x-6" : ""}`}>
              {col.links.map((l) => (
                <li key={l.to + l.label} className="break-inside-avoid">
                  {l.newTab ? (
                    <a href={l.to} target="_blank" rel="noopener noreferrer" className="lien-pied text-mist hover:text-nova transition-colors">{l.label}</a>
                  ) : (
                    <Link to={l.to} className="lien-pied text-mist hover:text-nova transition-colors">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* La barre du bas garde l'ink : deux valeurs sombres l'une sur l'autre
          posent le pied, la plus sombre en dernier. Un filet les separe --
          `border-t` plutot qu'un saut de couleur abrupt. */}
      <div className="bg-ink text-fog border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="etiquette">
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
