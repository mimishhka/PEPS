import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { useLang } from "../contexts/LanguageContext";
import ProductImage from "./ProductImage";
import { dosage } from "../lib/dosage";
import { TAILLES } from "../lib/derivees";

/**
 * Une carte « pleins feux » : un composé, en grand, qui ouvre une porte.
 *
 * MIREILLE, 11/10/2026 : « j'aime bien la façon dont leurs produits sont
 * présentés en feature, est-ce que tu peux me donner quelque chose de
 * similaire », puis « pleins feux avec un maximum de 4 produits vedettes ».
 *
 * LA CARTE NE VEND PAS, ELLE INVITE. C'est ce qui fait la différence avec la
 * carte du catalogue, et c'est délibéré : pas de bouton d'achat, pas de
 * sélecteur, pas de prix. Le nom du composé en grand, deux lignes qui disent
 * ce qu'on trouvera, la preuve d'analyse, une flèche. Sur un réactif acheté
 * sans pouvoir le tenir, la pureté et le certificat sont l'argument ; le prix
 * vient après, sur la fiche, là où il peut être exact.
 *
 * PAS DE PRIX, ET C'EST UNE CONSÉQUENCE DE SA PROPRE RÈGLE. Le 11/10/2026
 * elle a retiré le « dès » des cartes du catalogue : le prix affiché est
 * celui du dosage choisi, pas un minimum. Une carte sans sélecteur ne peut
 * donc pas afficher un prix honnête — ce serait soit le moins cher déguisé en
 * prix unique, soit une fourchette, c'est-à-dire une troisième façon d'écrire
 * un prix sur le site. Les dosages disponibles tiennent ce rôle : ils disent
 * qu'il y a plusieurs choix, sans mentir sur aucun.
 *
 * UN SEUL LIEN, LA CARTE ENTIÈRE. Audit de l'espace client du 06/10, section
 * 3 : deux liens vers la même page font annoncer chaque élément deux fois par
 * un lecteur d'écran, et laissent deux composants à tenir à jour.
 */
export default function CartePleinsFeux({ product }) {
  const { lang } = useLang();
  const fr = lang === "fr";
  const name = fr ? product.name_fr : product.name_en;
  const variants = product.variants || [];

  /* Les deux lignes se DÉDUISENT du produit. Écrites en dur, elles
     mentiraient dès qu'un lot change — et c'est le genre de phrase qu'on
     oublie de relire. */
  const dosages = variants
    .map((v) => dosage(v.name, lang))
    .filter(Boolean);

  const certificatPret = variants.some(
    (v) => v.coa_status === "available" && v.coa_url,
  ) || !!product.coa_url;

  const lignes = [
    variants.length > 1
      ? (fr ? `${dosages.length} concentrations disponibles.` : `${dosages.length} strengths available.`)
      : (fr ? "Une concentration." : "One strength."),
    certificatPret
      ? (fr ? "Certificat d'analyse du lot consultable." : "Batch certificate of analysis on file.")
      : (fr ? "Certificat d'analyse à venir." : "Certificate of analysis to come."),
  ];

  const purete = String(product.purity || "").trim();

  return (
    <Link
      to={`/product/${product.slug}`}
      data-testid={`pleins-feux-${product.slug}`}
      className="group relative flex items-stretch overflow-hidden border border-ash bg-white hover:border-nova transition-colors min-h-[188px]"
      style={{ borderRadius: "var(--r-l)" }}
    >
      <div className="flex-1 min-w-0 p-6 sm:p-7 flex flex-col">
        {dosages.length > 0 && (
          <div className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-3"
               data-testid={`pleins-feux-dosages-${product.slug}`}>
            {dosages.join(" · ")}
          </div>
        )}

        <h3 className="font-display font-bold text-nordfjord leading-[1.05] tracking-[-0.01em] mb-3 break-words"
            style={{ fontSize: "clamp(26px,3.2vw,34px)" }}>
          {name}
        </h3>

        <p className="text-[13.5px] text-glacier leading-relaxed">
          {lignes[0]}<br />{lignes[1]}
        </p>

        {purete && (
          <div className="font-data text-[11.5px] text-nova-texte mt-auto pt-4"
               data-testid={`pleins-feux-purete-${product.slug}`}>
            {purete} {fr ? "· vérifié par HPLC" : "· HPLC verified"}
          </div>
        )}
      </div>

      {/* L'IMAGE DÉBORDE DU CADRE PAR LE BAS. C'est ce qui donne à la carte
          son air de vitrine plutôt que de vignette : le flacon n'est pas posé
          DANS une boîte, il traverse la carte. Masqué sous 640 px, où la
          largeur ne laisse pas la place aux deux. */}
      <div className="hidden sm:block relative w-[34%] shrink-0 self-end" aria-hidden="true">
        <div className="absolute inset-x-0 bottom-0 h-[150px]">
          <ProductImage
            src={product.image_url}
            slug={product.slug}
            alt=""
            sizes={TAILLES.carte}
            className="w-full h-full"
            imgClassName="w-full h-full object-cover object-bottom"
          />
        </div>
      </div>

      <span
        className="absolute top-5 right-5 w-9 h-9 rounded-full border border-ash grid place-items-center text-nordfjord bg-white group-hover:border-nova group-hover:text-nova-texte transition-colors"
        aria-hidden="true"
      >
        <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
