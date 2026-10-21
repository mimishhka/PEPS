import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";

/**
 * Publier ou masquer une page de contenu.
 *
 * MIREILLE, 21/10/2026 : « cache le endpoint coa lab, rajoute-le du côté admin
 * là où je peux publier ou non des pages, cache aussi À propos pour l'instant ».
 *
 * L'ENDROIT N'EXISTAIT PAS. Les catégories et les menus ont un drapeau
 * `published` depuis longtemps ; les pages, non. `/lab` vivait derrière une
 * variable d'environnement — il fallait éditer un fichier sur le serveur et
 * redémarrer pour masquer une page — et `/about` n'avait aucun interrupteur.
 *
 * Une variable d'environnement est le mauvais outil pour une décision
 * éditoriale : elle vit hors de l'application, personne ne sait qu'elle
 * existe, et elle demande un accès au serveur pour une décision qui appartient
 * à la personne qui tient la boutique.
 *
 * La liste est COURTE ET FERMÉE, côté serveur. On ne met pas à portée d'un
 * clic le catalogue, le panier, la caisse, le compte ou les pages légales :
 * masquer la conformité serait un problème, pas une fonctionnalité.
 */
export default function AdminPages() {
  const { lang } = useLang();
  const fr = lang === "fr";
  const [pages, setPages] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState("");

  const charger = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/pages");
      setPages(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const basculer = async (page) => {
    const vise = !page.published;
    setEnCours(page.slug);
    /* L'ÉTAT CHANGE TOUT DE SUITE, ET REVIENT SI LE SERVEUR REFUSE.
       Attendre l'aller-retour pour bouger l'interrupteur donne l'impression
       que le clic n'a pas pris, et on clique deux fois. */
    setPages((liste) => liste.map((p) =>
      p.slug === page.slug ? { ...p, published: vise } : p));
    try {
      await api.put(`/admin/pages/${page.slug}`, { published: vise });
      toast.success(vise
        ? (fr ? "Page publiée." : "Page published.")
        : (fr ? "Page masquée." : "Page hidden."));
    } catch (e) {
      setPages((liste) => liste.map((p) =>
        p.slug === page.slug ? { ...p, published: !vise } : p));
      toast.error(formatApiError(e));
    } finally {
      setEnCours("");
    }
  };

  if (chargement) {
    return <div className="text-sm text-ink/60" data-testid="pages-chargement">
      {fr ? "Chargement…" : "Loading…"}
    </div>;
  }

  return (
    <div data-testid="admin-pages">
      <h1 className="font-display text-2xl text-nordfjord mb-1">
        {fr ? "Pages" : "Pages"}
      </h1>
      <p className="text-sm text-ink/60 mb-6 max-w-[68ch]">
        {fr
          ? "Une page masquée disparaît de la navigation, et son adresse renvoie à l'accueil. Les pages légales et la boutique ne figurent pas ici : elles ne se masquent pas."
          : "A hidden page disappears from navigation, and its address redirects home. Legal pages and the store are not listed here: they cannot be hidden."}
      </p>

      <div className="border border-ash" style={{ borderRadius: "var(--r-l)" }}>
        {pages.map((page, i) => (
          <div key={page.slug}
            data-testid={`page-${page.slug}`}
            className={`flex items-center justify-between gap-4 px-5 py-4 ${i > 0 ? "border-t border-ash" : ""}`}>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-nordfjord">
                {fr ? page.name_fr : page.name_en}
              </div>
              <div className="font-data text-[12px] text-glacier">{page.route}</div>
            </div>

            <button type="button"
              onClick={() => basculer(page)}
              disabled={enCours === page.slug}
              data-testid={`bascule-${page.slug}`}
              data-publiee={page.published ? "oui" : "non"}
              aria-pressed={page.published}
              className={`shrink-0 inline-flex items-center gap-2 border px-4 py-2 text-[13px] transition-colors disabled:opacity-50 ${
                page.published
                  ? "border-nova bg-nova/5 text-nordfjord"
                  : "border-ash text-ink/60 hover:border-nova"}`}
              style={{ borderRadius: "var(--r-m)" }}>
              {page.published ? <Eye size={14} aria-hidden="true" />
                              : <EyeOff size={14} aria-hidden="true" />}
              {page.published ? (fr ? "Publiée" : "Published")
                              : (fr ? "Masquée" : "Hidden")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
